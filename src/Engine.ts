import { TopicManager } from './TopicManager.js'
import { LookupService } from './LookupService.js'
import { Storage } from './storage/Storage.js'
import type { Output } from './Output.js'
import { LookupFormula } from './LookupFormula.js'
import {
  Transaction,
  ChainTracker,
  MerklePath,
  Broadcaster,
  isBroadcastFailure,
  TaggedBEEF, STEAK,
  LookupQuestion,
  LookupAnswer,
  AdmittanceInstructions
} from '@bsv/sdk'
import { AdvertisementData, Advertiser } from './Advertiser.js'
import { GASP, GASPInitialRequest, GASPInitialResponse, GASPNode } from '@bsv/gasp'
import { SyncConfiguration } from './SyncConfiguration.js'
import { Advertisement } from './Advertisement.js'
import { OverlayGASPRemote } from './GASP/OverlayGASPRemote.js'
import { OverlayGASPStorage } from './GASP/OverlayGASPStorage.js'
import { URL } from "url"

/**
 * Am engine for running BSV Overlay Services (topic managers and lookup services).
 */
export class Engine {
  /**
   * Creates a new Overlay Services Engine
   * @param {[key: string]: TopicManager} managers - manages topic admittance
   * @param {[key: string]: LookupService} lookupServices - manages UTXO lookups
   * @param {Storage} storage - for interacting with internally-managed persistent data
   * @param {ChainTracker | 'scripts only'} chainTracker - Verifies SPV data associated with transactions
   * @param {string} [hostingURL] - The URL this engine is hosted at. Required if going to support peer-discovery with an advertiser.
   * @param {Broadcaster} [Broadcaster] - broadcaster used for broadcasting the incoming transaction
   * @param {Advertiser} [Advertiser] - handles SHIP and SLAP advertisements for peer-discovery
   * @param {string} shipTrackers - SHIP domains we know to bootstrap the system
   * @param {string} slapTrackers - SLAP domains we know to bootstrap the system
   * @param {SyncConfiguration} syncConfiguration — Configuration object describing historical synchronization of topics.
   * @param {boolean} logTime - Enables / disables the timing logs for various operations in the Overlay submit route.
   * @param {string} logPrefix - Supports overriding the log prefix with a custom string.
   * @param {boolean} throwOnBroadcastFailure - Enables / disables throwing an error when a transaction broadcast failure is detected.
   */
  constructor(
    public managers: { [key: string]: TopicManager },
    public lookupServices: { [key: string]: LookupService },
    public storage: Storage,
    public chainTracker: ChainTracker | 'scripts only',
    public hostingURL?: string,
    public shipTrackers?: string[],
    public slapTrackers?: string[],
    public broadcaster?: Broadcaster,
    public advertiser?: Advertiser,
    public syncConfiguration?: SyncConfiguration,
    public logTime = false,
    public logPrefix = '[OVERLAY_ENGINE] ',
    public throwOnBroadcastFailure = false
  ) {
    // To encourage synchronization of overlay services, the SHIP sync strategy is used by default for all overlay topics, except for 'tm_ship' and 'tm_slap'.
    // For these two topics, any existing trackers are combined with the provided shipTrackers and slapTrackers omitting any duplicates.
    if (syncConfiguration === undefined) {
      this.syncConfiguration = {}
    } else {
      this.syncConfiguration = syncConfiguration
    }

    for (const managerName of Object.keys(managers)) {
      if (managerName === 'tm_ship' && this.shipTrackers !== undefined && this.syncConfiguration[managerName] !== false) {
        // Combine tm_ship trackers with preexisting entries if any
        const combinedSet = new Set([
          ...(Array.isArray(this.syncConfiguration[managerName]) ? this.syncConfiguration[managerName] as string[] : []),
          ...this.shipTrackers
        ])
        this.syncConfiguration[managerName] = Array.from(combinedSet)
      } else if (managerName === 'tm_slap' && this.slapTrackers !== undefined && this.syncConfiguration[managerName] !== false) {
        // Combine tm_slap trackers with preexisting entries if any
        const combinedSet = new Set([
          ...(Array.isArray(this.syncConfiguration[managerName]) ? this.syncConfiguration[managerName] as string[] : []),
          ...this.slapTrackers
        ])
        this.syncConfiguration[managerName] = Array.from(combinedSet)
      } else {
        // Set undefined managers to 'SHIP' by default
        if (this.syncConfiguration[managerName] === undefined) {
          this.syncConfiguration[managerName] = 'SHIP'
        }
      }
    }
  }

  // Helper functions for logging timings
  private startTime(label: string): void {
    if (this.logTime) {
      console.time(`${this.logPrefix} ${label}`)
    }
  }

  private endTime(label: string): void {
    if (this.logTime) {
      console.timeEnd(`${this.logPrefix} ${label}`)
    }
  }

  /**
   * Submits a transaction for processing by Overlay Services.
   * @param {TaggedBEEF} taggedBEEF - The transaction to process
   * @param {function(STEAK): void} [onSTEAKReady] - Optional callback function invoked when the STEAK is ready.
   * @param {string} mode — Indicates the submission behavior, whether historical or current. Historical transactions are not broadcast or propagated.
   * 
   * The optional callback function should be used to get STEAK when ready, and avoid waiting for broadcast and transaction propagation to complete.
   * 
   * @returns {Promise<STEAK>} The submitted transaction execution acknowledgement
   */
  async submit(taggedBEEF: TaggedBEEF, onSteakReady?: (steak: STEAK) => void, mode: 'historical-tx' | 'current-tx' = 'current-tx'): Promise<STEAK> {
    for (const t of taggedBEEF.topics) {
      if (this.managers[t] === undefined || this.managers[t] === null) {
        throw new Error(`This server does not support this topic: ${t}`)
      }
    }

    // Validate the transaction SPV information
    const tx = Transaction.fromBEEF(taggedBEEF.beef)
    const txid = tx.id('hex')

    this.startTime(`submit_${txid}`)
    this.startTime(`chainTracker_${txid.substring(0, 10)}`)
    const txValid = await tx.verify(this.chainTracker)
    if (!txValid) throw new Error('Unable to verify SPV information.')
    this.endTime(`chainTracker_${txid.substring(0, 10)}`)

    const steak: STEAK = {}
    let admissibleOutputs: AdmittanceInstructions = { outputsToAdmit: [], coinsToRetain: [] }
    const previousCoins: number[] = []

    // Parallelize the topic processing
    const topicPromises = taggedBEEF.topics.map(async topic => {
      if (this.managers[topic] === undefined || this.managers[topic] === null) {
        throw new Error(`This server does not support this topic: ${topic}`)
      }

      // Check for duplicate transactions
      this.startTime(`dupCheck_${txid.substring(0, 10)}`)
      const dupeCheck = await this.storage.doesAppliedTransactionExist({ txid, topic })
      this.endTime(`dupCheck_${txid.substring(0, 10)}`)

      if (dupeCheck) {
        steak[topic] = { outputsToAdmit: [], coinsToRetain: [] }
        return
      }

      // Check if any input of this transaction is a previous UTXO
      const outputPromises = tx.inputs.map(async (input, i) => {
        const previousTXID = input.sourceTXID !== undefined ? input.sourceTXID : input.sourceTransaction?.id('hex')
        if (previousTXID !== undefined) {
          const output = this.storage.findOutput(previousTXID, input.sourceOutputIndex, topic)
          if (output !== undefined && output !== null) {
            previousCoins.push(i)
            return await Promise.resolve(output)
          }
        }
        return await Promise.resolve(null)
      })

      this.startTime(`previousOutputQuery_${txid.substring(0, 10)}`)
      const outputs = await Promise.all(outputPromises)
      this.endTime(`previousOutputQuery_${txid.substring(0, 10)}`)

      const markSpentPromises = outputs.map(async (output) => {
        if (output !== undefined && output !== null) {
          try {
            await this.storage.markUTXOAsSpent(output.txid, output.outputIndex, topic)
            await Promise.all(Object.values(this.lookupServices).map(async l => {
              try {
                await l.outputSpent?.(output.txid, output.outputIndex, topic)
              } catch (error) {
                console.error('Error in lookup service for outputSpent:', error)
              }
            }))
          } catch (error) {
            console.error('Error marking UTXO as spent:', error)
          }
        }
      })

      // Determine which outputs are admissible
      const admissibleOutputsPromise = (async () => {
        try {
          this.startTime(`identifyAdmissibleOutputs_${txid.substring(0, 10)}`)
          admissibleOutputs = await this.managers[topic].identifyAdmissibleOutputs(taggedBEEF.beef, previousCoins)
          this.endTime(`identifyAdmissibleOutputs_${txid.substring(0, 10)}`)
        } catch (_) {
          steak[topic] = { outputsToAdmit: [], coinsToRetain: [] }
        }
      })()

      // Wait for both tasks to complete
      await Promise.all([markSpentPromises, admissibleOutputsPromise])
      // Keep track of what outputs were admitted for what topic
      steak[topic] = admissibleOutputs
    })

    await Promise.all(topicPromises)

    // Broadcast the transaction if not historical and broadcaster is configured
    this.startTime(`broadcast_${txid.substring(0, 10)}`)
    if (mode !== 'historical-tx' && this.broadcaster !== undefined) {
      const response = await this.broadcaster.broadcast(tx)
      if (isBroadcastFailure(response) && this.throwOnBroadcastFailure) {
        const e = new Error(`Failed to broadcast transaction! Error: ${response.description}`);
        (e as any).more = response.more
        throw e
      }
    }
    this.endTime(`broadcast_${txid.substring(0, 10)}`)

    // Call the callback function if it is provided
    if (onSteakReady !== undefined) {
      this.endTime(`submit_${txid}`)
      onSteakReady(steak)
    }

    for (const topic of taggedBEEF.topics) {
      // Keep track of which outputs to admit, mark as stale, or retain
      const outputsToAdmit: number[] = admissibleOutputs.outputsToAdmit
      const staleCoins: Array<{
        txid: string
        outputIndex: number
      }> = []
      const outputsConsumed: Array<{
        txid: string
        outputIndex: number
      }> = []

      // Find which outputs should not be retained and mark them as stale
      // For each of the previous UTXOs, if the the UTXO was not included in the list of UTXOs identified for retention, then it will be marked as stale.
      for (const inputIndex of previousCoins) {
        const previousTXID = tx.inputs[inputIndex].sourceTXID || tx.inputs[inputIndex].sourceTransaction?.id('hex') as string
        const previousOutputIndex = tx.inputs[inputIndex].sourceOutputIndex
        if (!admissibleOutputs.coinsToRetain.includes(inputIndex)) {
          staleCoins.push({
            txid: previousTXID,
            outputIndex: previousOutputIndex
          })
        } else {
          outputsConsumed.push({
            txid: previousTXID,
            outputIndex: previousOutputIndex
          })
        }
      }

      // Remove stale outputs recursively
      this.startTime(`lookForStaleOutputs_${txid.substring(0, 10)}`)
      await Promise.all(staleCoins.map(async coin => {
        const output = await this.storage.findOutput(coin.txid, coin.outputIndex, topic)
        if (output !== undefined && output !== null) {
          await this.deleteUTXODeep(output)
        }
      }))
      this.endTime(`lookForStaleOutputs_${txid.substring(0, 10)}`)

      // Handle admittance and notification of incoming UTXOs
      const newUTXOs: Array<{ txid: string, outputIndex: number }> = []
      await Promise.all(outputsToAdmit.map(async outputIndex => {
        this.startTime(`insertNewOutput_${txid.substring(0, 10)}`)
        await this.storage.insertOutput({
          txid,
          outputIndex,
          outputScript: tx.outputs[outputIndex].lockingScript.toBinary(),
          satoshis: tx.outputs[outputIndex].satoshis as number,
          topic,
          spent: false,
          beef: taggedBEEF.beef,
          consumedBy: [],
          outputsConsumed
        })
        this.endTime(`insertNewOutput_${txid.substring(0, 10)}`)
        newUTXOs.push({ txid, outputIndex })

        this.startTime(`notifyLookupService${txid.substring(0, 10)}`)
        await Promise.all(Object.values(this.lookupServices).map(async l => await l.outputAdded?.(txid, outputIndex, tx.outputs[outputIndex].lockingScript, topic)))
        this.endTime(`notifyLookupService${txid.substring(0, 10)}`)
      }))

      this.startTime(`outputConsumed_${txid.substring(0, 10)}`)
      // Update each output consumed to know who consumed it and insert applied transaction in parallel
      await Promise.all([
        ...outputsConsumed.map(async output => {
          const outputToUpdate = await this.storage.findOutput(output.txid, output.outputIndex, topic)
          if (outputToUpdate !== undefined && outputToUpdate !== null) {
            const newConsumedBy = [...new Set([...newUTXOs, ...outputToUpdate.consumedBy])]
            await this.storage.updateConsumedBy(output.txid, output.outputIndex, topic, newConsumedBy)
          }
        }),
        this.storage.insertAppliedTransaction({
          txid,
          topic
        })
      ])
      this.endTime(`outputConsumed_${txid.substring(0, 10)}`)
    }

    // If we don't have an advertiser or we are dealing with historical transactions, just return the steak
    if (this.advertiser === undefined || mode === 'historical-tx') {
      return steak
    }

    this.startTime(`transactionPropagation_${txid.substring(0, 10)}`)
    // Propagate transaction to other nodes according to synchronization agreements
    // 1. Find nodes that host the topics associated with admissable outputs
    // We want to figure out which topics we actually care about (because their associated outputs were admitted)
    // AND if the topic was not admitted we want to remove it from the list of topics we care about.
    const relevantTopics = taggedBEEF.topics.filter(topic =>
      steak[topic] !== undefined && steak[topic].outputsToAdmit.length !== 0
    )

    // TODO: Cache ship/slap lookup with expiry (every 5min)
    if (relevantTopics.length > 0) {
      // Find all SHIP advertisements for the topics we care about
      const domainToTopicsMap = new Map<string, Set<string>>()
      for (const topic of relevantTopics) {
        try {
          // Handle custom lookup service answers
          const lookupAnswer = await this.lookup({
            service: 'ls_ship',
            query: {
              topic
            }
          })

          // Lookup will currently always return type output-list
          if (lookupAnswer.type === 'output-list') {
            const shipAdvertisements: Advertisement[] = []
            lookupAnswer.outputs.forEach(output => {
              try {
                // Parse out the advertisements using the provided parser
                const tx = Transaction.fromBEEF(output.beef)
                const advertisement = this.advertiser?.parseAdvertisement(tx.outputs[output.outputIndex].lockingScript)
                if (advertisement !== undefined && advertisement !== null && advertisement.protocol === 'SHIP') {
                  shipAdvertisements.push(advertisement)
                }
              } catch (error) {
                console.error('Failed to parse advertisement output:', error)
              }
            })
            if (shipAdvertisements.length > 0) {
              shipAdvertisements.forEach((advertisement: Advertisement) => {
                if (!domainToTopicsMap.has(advertisement.domain)) {
                  domainToTopicsMap.set(advertisement.domain, new Set<string>())
                }
                domainToTopicsMap.get(advertisement.domain)?.add(topic)
              })
            }
          }
        } catch (error) {
          console.error(`Error looking up topic ${String(topic)}:`, error)
        }
      }

      const broadcastPromises: Array<Promise<Response>> = []

      // Make sure we gossip to the shipTrackers we know about.
      if (this.shipTrackers !== undefined && this.shipTrackers.length !== 0 && relevantTopics.includes('tm_ship')) {
        this.shipTrackers.forEach(tracker => {
          if (domainToTopicsMap.get(tracker) !== undefined) {
            domainToTopicsMap.get(tracker)?.add('tm_ship')
          } else {
            domainToTopicsMap.set(tracker, new Set(['tm_ship']))
          }
        })
      }

      // Make sure we gossip to the slapTrackers we know about.
      if (this.slapTrackers !== undefined && this.slapTrackers.length !== 0 && relevantTopics.includes('tm_slap')) {
        this.slapTrackers.forEach(tracker => {
          if (domainToTopicsMap.get(tracker) !== undefined) {
            domainToTopicsMap.get(tracker)?.add('tm_slap')
          } else {
            domainToTopicsMap.set(tracker, new Set<string>(['tm_slap']))
          }
        })
      }

      // Note: We are depending on window.fetch, this may not be ideal for the long term.
      for (const [domain, topics] of domainToTopicsMap.entries()) {
        if (domain !== this.hostingURL) {
          const promise = fetch(`${String(domain)}/submit`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'X-Topics': JSON.stringify(Array.from(topics))
            },
            body: new Uint8Array(taggedBEEF.beef)
          })
          broadcastPromises.push(promise)
        }
      }

      try {
        await Promise.all(broadcastPromises)
      } catch (error) {
        console.error('Error during broadcasting:', error)
      }
    }
    this.endTime(`transactionPropgation_${txid.substring(0, 10)}`)

    // Immediately return from the function without waiting for the promises to resolve.
    return steak
  }

  /**
   * Submit a lookup question to the Overlay Services Engine, and receive bakc a Lookup Answer
   * @param LookupQuestion — The question to ask the Overlay Services Engine
   * @returns The answer to the question
   */
  async lookup(lookupQuestion: LookupQuestion): Promise<LookupAnswer> {
    // Validate a lookup service for the provider is found
    const lookupService = this.lookupServices[lookupQuestion.service]
    if (lookupService === undefined || lookupService === null) throw new Error(`Lookup service not found for provider: ${lookupQuestion.service} `)

    let lookupResult = await lookupService.lookup(lookupQuestion)
    // Handle custom lookup service answers
    if ((lookupResult as LookupAnswer).type === 'freeform' || (lookupResult as LookupAnswer).type === 'output-list') {
      return lookupResult as LookupAnswer
    }
    lookupResult = lookupResult as LookupFormula

    const hydratedOutputs: Array<{ beef: number[], outputIndex: number }> = []

    for (const { txid, outputIndex, history } of lookupResult) {
      // Make sure this is an unspent output (UTXO)
      const UTXO = await this.storage.findOutput(
        txid,
        outputIndex,
        undefined,
        undefined,
        true
      )
      if (UTXO === undefined || UTXO === null) continue

      // Get the history for this utxo and construct a BRC-8 Envelope
      const output = await this.getUTXOHistory(UTXO, history, 0)
      if (output?.beef !== undefined) {
        hydratedOutputs.push({
          beef: output.beef,
          outputIndex: output.outputIndex
        })
      }
    }
    return {
      type: 'output-list',
      outputs: hydratedOutputs
    }
  }

  /**
   * Ensures alignment between the current SHIP/SLAP advertisements and the 
   * configured Topic Managers and Lookup Services in the engine.
   *
   * This method performs the following actions:
   * 1. Retrieves the current configuration of topics and services.
   * 2. Fetches the existing SHIP advertisements for each configured topic.
   * 3. Fetches the existing SLAP advertisements for each configured service.
   * 4. Compares the current configuration with the fetched advertisements to determine which advertisements
   *    need to be created or revoked.
   * 5. Creates new SHIP/SLAP advertisements if they do not exist for the configured topics/services.
   * 6. Revokes existing SHIP/SLAP advertisements if they are no longer required based on the current configuration.
   *
   * The function uses the `Advertiser` methods to create or revoke advertisements and ensures the updates are
   * submitted to the SHIP/SLAP overlay networks using the engine's `submit()` method.
   *
   * @throws Will throw an error if there are issues during the advertisement synchronization process.
   * @returns {Promise<void>} A promise that resolves when the synchronization process is complete.
   */
  async syncAdvertisements(): Promise<void> {
    if (this.advertiser === undefined || !this.hostingURL || !this.isValidUrl(this.hostingURL)) {
      return
    }
    const advertiser = this.advertiser

    // Step 1: Retrieve Current Configuration
    const configuredTopics = Object.keys(this.managers)
    const configuredServices = Object.keys(this.lookupServices)

    // Step 2: Fetch Existing Advertisements
    const currentSHIPAdvertisements = await advertiser.findAllAdvertisements('SHIP')
    const currentSLAPAdvertisements = await advertiser.findAllAdvertisements('SLAP')

    // Step 3: Compare and Determine Actions
    const requiredSHIPAdvertisements = new Set(configuredTopics)
    const requiredSLAPAdvertisements = new Set(configuredServices)

    const shipsToCreate = Array.from(requiredSHIPAdvertisements).filter(topicOrService => !currentSHIPAdvertisements.some(x => x.topicOrService === topicOrService && x.domain === this.hostingURL))
    const slapsToCreate = Array.from(requiredSLAPAdvertisements).filter(topicOrService => !currentSLAPAdvertisements.some(x => x.topicOrService === topicOrService && x.domain === this.hostingURL))
    const shipsToRevoke = currentSHIPAdvertisements.filter(ad => !requiredSHIPAdvertisements.has(ad.topicOrService))
    const slapsToRevoke = currentSLAPAdvertisements.filter(ad => !requiredSLAPAdvertisements.has(ad.topicOrService))

    // Create needed SHIP/SLAP advertisements
    try {
      if (shipsToCreate.length > 0 || slapsToCreate.length > 0) {
        const advertisementData: AdvertisementData[] = [
          ...shipsToCreate.map(topic => ({
            protocol: 'SHIP' as 'SHIP',
            topicOrServiceName: topic
          })),
          ...slapsToCreate.map(service => ({
            protocol: 'SLAP' as 'SLAP',
            topicOrServiceName: service
          }))
        ]
        const taggedBEEF = await advertiser.createAdvertisements(advertisementData)
        await this.submit(taggedBEEF)
      }
    } catch (error) {
      console.error('Failed to create SHIP advertisement:', error)
    }

    // Revoke all advertisements to revoke
    try {
      if (shipsToRevoke.length > 0 || slapsToRevoke.length > 0) {
        const taggedBEEF = await advertiser.revokeAdvertisements([...shipsToRevoke, ...slapsToRevoke])
        await this.submit(taggedBEEF)
      }
    } catch (error) {
      console.error('Failed to revoke SHIP/SLAP advertisements:', error)
    }
  }

  /**
   * This method goes through each topic that we support syncing and attempts to sync with each endpoint
   * associated with that topic. If the sync configuration is 'SHIP', it will sync to all peers that support
   * the topic.
   *
   * @throws Error if the overlay service engine is not configured for topical synchronization.
   */
  async startGASPSync(): Promise<void> {
    if (this.syncConfiguration === undefined) {
      throw new Error('Overlay Service Engine not configured for topical synchronization!')
    }

    for (const topic of Object.keys(this.syncConfiguration)) {
      // Make sure syncEndpoints is an array or SHIP
      let syncEndpoints: string[] | string | false = this.syncConfiguration[topic]

      // Check if this topic has been configured NOT to sync
      if (syncEndpoints === false) {
        continue
      }

      if (syncEndpoints === 'SHIP') {
        // Perform lookup and find ship advertisements to set syncEndpoints for topic
        const lookupAnswer = await this.lookup({
          service: 'ls_ship',
          query: {
            topic
          }
        })

        // Lookup will currently always return type output-list
        if (lookupAnswer.type === 'output-list') {
          const endpointSet = new Set<string>()

          lookupAnswer.outputs.forEach(output => {
            try {
              // Parse out the advertisements using the provided parser
              const tx = Transaction.fromBEEF(output.beef)
              const advertisement = this.advertiser?.parseAdvertisement(tx.outputs[output.outputIndex].lockingScript)
              if (advertisement !== undefined && advertisement !== null && advertisement.protocol === 'SHIP') {
                endpointSet.add(advertisement.domain)
              }
            } catch (error) {
              console.error('Failed to parse advertisement output:', error)
            }
          })

          syncEndpoints = Array.from(endpointSet)
        }
      }

      // Now syncEndpoints is guaranteed to be an array of strings without duplicates
      // Note: Consider MySQL DB locking implications when running synchronization in parallel
      if (Array.isArray(syncEndpoints)) {
        await Promise.all(syncEndpoints.map(async endpoint => {
          // Sync to each host that is associated with this topic
          const gasp = new GASP(new OverlayGASPStorage(topic, this), new OverlayGASPRemote(endpoint, topic), 0, `[GASP Sync of ${topic} with ${endpoint}]`, true)
          await gasp.sync()
        }))
      }
    }
  }

  /**
   * Given a GASP request, create an initial response.
   *
   * This method processes an initial synchronization request by finding the relevant UTXOs for the given topic
   * since the provided block height in the request. It constructs a response that includes a list of these UTXOs
   * and the min block height from the initial request.
   *
   * @param initialRequest - The GASP initial request containing the version and the block height since the last sync.
   * @param topic - The topic for which UTXOs are being requested.
   * @returns A promise that resolves to a GASPInitialResponse containing the list of UTXOs and the provided min block height.
   */
  async provideForeignSyncResponse(initialRequest: GASPInitialRequest, topic: string): Promise<GASPInitialResponse> {
    const UTXOs = await this.storage.findUTXOsForTopic(topic, initialRequest.since)

    return {
      UTXOList: UTXOs.map(output => {
        return {
          txid: output.txid,
          outputIndex: output.outputIndex
        }
      }),
      since: initialRequest.since
    }
  }

  /**
   * Provides a GASPNode for the given graphID, transaction ID, and output index.
   *
   * @param graphID - The identifier for the graph to which this node belongs (in the format txid.outputIndex).
   * @param txid - The transaction ID for the requested output from somewhere within the graph's history.
   * @param outputIndex - The index of the output in the transaction.
   * @returns A promise that resolves to a GASPNode containing the raw transaction and other optional data.
   * @throws An error if no output is found for the given transaction ID and output index.
   */
  async provideForeignGASPNode(graphID: string, txid: string, outputIndex: number): Promise<GASPNode> {
    const hydrator = async (output: Output | null): Promise<GASPNode> => {
      if (output?.beef === undefined) {
        throw new Error('No matching output found!')
      }

      const rootTx = Transaction.fromBEEF(output.beef)
      let correctTx: Transaction | undefined

      const searchInput = (tx: Transaction): void => {
        if (tx.id('hex') === txid) {
          correctTx = tx
        } else {
          // For each input, look it up and recurse.
          for (const input of tx.inputs) {
            // We should always have a source transaction
            if (input.sourceTransaction !== undefined) {
              searchInput(input.sourceTransaction)
            } else {
              throw new Error('Incomplete SPV data!')
            }
          }
        }
      }

      searchInput(rootTx)

      if (correctTx !== undefined) {
        const rawTx = correctTx.toHex()
        const node: GASPNode = {
          rawTx,
          graphID,
          outputIndex
        }
        if (correctTx.merklePath !== undefined) {
          node.proof = correctTx.merklePath.toHex()
        }

        return node
      } else {
        // Recursively try to find a matching output
        let foundNode: GASPNode | undefined
        for (const currentOutput of output.outputsConsumed) {
          try {
            const outputFound = await this.storage.findOutput(currentOutput.txid, currentOutput.outputIndex)
            foundNode = await hydrator(outputFound)
            break
          } catch (error) {
            continue
          }
        }
        if (foundNode !== undefined) {
          return foundNode
        }
      }
      throw new Error('Unable to find output associated with your request!')
    }

    const [rootTxid, rootOutputIndex] = graphID.split('.')
    const output = await this.storage.findOutput(rootTxid, Number(rootOutputIndex))
    return await hydrator(output)
  }

  /**
   * Traverse and return the history of a UTXO.
   *
   * This method traverses the history of a given Unspent Transaction Output (UTXO) and returns
   * its historical data based on the provided history selector and current depth.
   *
   * @param output - The UTXO to traverse the history for.
   * @param historySelector - Optionally directs the history traversal:
   *  - If a number, denotes how many previous spends (in terms of chain depth) to include.
   *  - If a function, accepts a BEEF-formatted transaction, an output index, and the current depth as parameters,
   *    returning a promise that resolves to a boolean indicating whether to include the output in the history.
   * @param {number} [currentDepth=0] - The current depth of the traversal relative to the top-level UTXO.
   *
   * @returns {Promise<Output | undefined>} - A promise that resolves to the output history if found, or undefined if not.
   */
  async getUTXOHistory(
    output: Output,
    historySelector?: ((beef: number[], outputIndex: number, currentDepth: number) => Promise<boolean>) | number,
    currentDepth = 0
  ): Promise<Output | undefined> {
    // If we have an output but no history selector, jsut return the output.
    if (typeof historySelector === 'undefined') {
      return output
    }

    if (output.beef === undefined) {
      throw new Error('Output must have associated transaction BEEF!')
    }

    // Determine if history traversal should continue for the current node
    let shouldTraverseHistory
    if (typeof historySelector !== 'number') {
      shouldTraverseHistory = await historySelector(output.beef, output.outputIndex, currentDepth)
    } else {
      shouldTraverseHistory = currentDepth <= historySelector
    }

    if (shouldTraverseHistory === false) {
      return undefined
    } else if (output !== null && output !== undefined && output.outputsConsumed.length === 0) {
      return output
    }

    try {
      // Query the storage engine for UTXOs consumed by this UTXO
      // Only retrieve unique values in case outputs are doubly referenced
      const outputsConsumed: Array<{ txid: string, outputIndex: number }> = output.outputsConsumed

      // Find the child outputs for each utxo consumed by the current output
      const childHistories = (await Promise.all(
        outputsConsumed.map(async (outputIdentifier) => {
          const output = await this.storage.findOutput(outputIdentifier.txid, outputIdentifier.outputIndex, undefined, undefined, true)

          // Make sure an output was found
          if (output === undefined || output === null) {
            return undefined
          }

          // Find previousUTXO history
          return await this.getUTXOHistory(output, historySelector, currentDepth + 1)
        })
      )).filter(x => x !== undefined)

      const tx = Transaction.fromBEEF(output.beef)
      for (const input of childHistories) {
        if (input === undefined || input === null) continue
        const inputIndex = tx.inputs.findIndex((input) => {
          const sourceTXID = input.sourceTXID !== undefined && input.sourceTXID !== ''
            ? input.sourceTXID
            : input.sourceTransaction?.id('hex')
          return sourceTXID === output.txid && input.sourceOutputIndex === output.outputIndex
        })
        if (input.beef === undefined) {
          throw new Error('Input must have associated transaction BEEF!')
        }
        tx.inputs[inputIndex].sourceTransaction = Transaction.fromBEEF(input.beef)
      }
      const beef = tx.toBEEF()
      return {
        ...output,
        beef
      }
    } catch (e) {
      // Handle any errors that occurred
      // Note: Test this!
      console.error(`Error retrieving UTXO history: ${e} `)
      // return []
      throw new Error(`Error retrieving UTXO history: ${e} `)
    }
  }

  /**
   * Delete a UTXO and all stale consumed inputs.
   * @param output - The UTXO to be deleted.
   * @returns {Promise<void>} - A promise that resolves when the deletion process is complete.
   */
  private async deleteUTXODeep(output: Output): Promise<void> {
    try {
      // Delete the current output IFF there are no references to it
      if (output.consumedBy.length === 0) {
        await this.storage.deleteOutput(output.txid, output.outputIndex, output.topic)

        // Notify the lookup services of the UTXO being deleted
        for (const l of Object.values(this.lookupServices)) {
          try {
            await l.outputDeleted?.(
              output.txid,
              output.outputIndex,
              output.topic
            )
          } catch (_) { }
        }
      }

      // If there are no more consumed utxos, return
      if (output.outputsConsumed.length === 0) {
        return
      }

      // Delete any stale outputs that were consumed as inputs
      output.outputsConsumed.map(async (outputIdentifier) => {
        const staleOutput = await this.storage.findOutput(outputIdentifier.txid, outputIdentifier.outputIndex, output.topic)

        // Make sure an output was found
        if (staleOutput === null || staleOutput === undefined) {
          return undefined
        }

        // Parse out the existing data, then concat the new outputs with no duplicates
        if (staleOutput.consumedBy.length !== 0) {
          staleOutput.consumedBy = staleOutput.consumedBy.filter(x => x.txid !== output.txid && x.outputIndex !== output.outputIndex)
          // Update with the new consumedBy data
          await this.storage.updateConsumedBy(outputIdentifier.txid, outputIdentifier.outputIndex, output.topic, staleOutput.consumedBy)
        }

        // Find previousUTXO history
        return await this.deleteUTXODeep(staleOutput)
      })
    } catch (error) {
      throw new Error(`Failed to delete all stale outputs: ${error as string} `)
    }
  }

  /**
   * Given a new transaction proof (txid, proof),
   * update tx.merklePath if appropriate,
   * and if not, recurse through all input sourceTransactions.
   *
   * @param tx transaction which may benefit from new proof.
   * @param txid BE hex string double hash of transaction proven by proof.
   * @param proof for txid
   */
  private updateInputProofs(tx: Transaction, txid: string, proof: MerklePath): void {
    if (tx.merklePath !== undefined) {
      // Update the merkle path to handle potential reorgs
      tx.merklePath = proof
      return
    }
    if (tx.id('hex') === txid) {
      tx.merklePath = proof
    } else {
      for (const input of tx.inputs) {
        // All inputs must have sourceTransactions
        const stx = input.sourceTransaction!
        this.updateInputProofs(stx, txid, proof)
      }
    }
  }

  /**
   * Recursively updates beefs (merkle proofs) of this output and its consumedBy lineage.
   *
   * @param output - An output derived from txid which may benefit from new proof.
   * @param txid - The txid for which proof is a valid merkle path.
   * @param proof - The merklePath proving txid is a mined transaction hash
   */
  private async updateMerkleProof(output: Output, txid: string, proof: MerklePath): Promise<void> {
    if (output.beef === undefined) {
      throw new Error('Output must have associated transaction BEEF!')
    }

    const tx = Transaction.fromBEEF(output.beef)
    if (tx.merklePath !== undefined) {
      // Update the merkle path to handle potential reorgs
      tx.merklePath = proof
      return
    }

    // recursively update all sourceTransactions proven by (txid,proof)
    this.updateInputProofs(tx, txid, proof)

    // Update the output's BEEF in the storage DB
    await this.storage.updateTransactionBEEF(output.txid, tx.toBEEF())

    // Recursively update the consumedBy outputs
    for (const consumingOutput of output.consumedBy) {
      const consumedOutputs = await this.storage.findOutputsForTransaction(consumingOutput.txid, true)
      for (const consumedOutput of consumedOutputs) {
        await this.updateMerkleProof(consumedOutput, txid, proof)
      }
    }
  }

  /**
   * Recursively prune UTXOs when an incoming Merkle Proof is received.
   *
   * @param txid - Transaction ID of the associated outputs to prune.
   * @param proof - Merkle proof containing the Merkle path and other relevant data to verify the transaction.
   * @param blockHeight - The block height associated with the incoming merkle proof.
   */
  async handleNewMerkleProof(txid: string, proof: MerklePath, blockHeight?: number): Promise<void> {
    const outputs = await this.storage.findOutputsForTransaction(txid, true)

    if (outputs === undefined || outputs.length === 0) {
      throw new Error('Could not find matching transaction outputs for proof ingest!')
    }

    for (const output of outputs) {
      await this.updateMerkleProof(output, txid, proof)

      // Add the associated blockHeight
      if (blockHeight !== undefined) {
        output.blockHeight = blockHeight
        await this.storage.updateOutputBlockHeight?.(output.txid, output.outputIndex, output.topic, blockHeight)
      }
    }
  }

  /**
   * Find a list of supported topic managers
   * @public
   * @returns {Promise<string[]>} - array of supported topic managers
   */
  async listTopicManagers(): Promise<string[]> {
    return Object.keys(this.managers)
  }

  /**
   * Find a list of supported lookup services
   * @public
   * @returns {Promise<string[]>} - array of supported lookup services
   */
  async listLookupServiceProviders(): Promise<string[]> {
    return Object.keys(this.lookupServices)
  }

  /**
   * Run a query to get the documentation for a particular topic manager
   * @public
   * @returns {Promise<string>} - the documentation for the topic manager
   */
  async getDocumentationForTopicManager(manager: any): Promise<string> {
    const documentation = await this.managers[manager]?.getDocumentation?.()
    return documentation !== undefined ? documentation : 'No documentation found!'
  }

  /**
   * Run a query to get the documentation for a particular lookup service
   * @public
   * @returns {Promise<string>} -  the documentation for the lookup service
   */
  async getDocumentationForLookupServiceProvider(provider: any): Promise<string> {
    const documentation = await this.lookupServices[provider]?.getDocumentation?.()
    return documentation !== undefined ? documentation : 'No documentation found!'
  }

  /**
   * Validates a URL to ensure it does not match disallowed patterns:
   * - Contains "http:" protocol
   * - Contains "localhost" (with or without a port)
   * - Internal or non-routable IP addresses (e.g., 192.168.x.x, 10.x.x.x, 172.16.x.x to 172.31.x.x)
   * - Non-routable IPs like 127.x.x.x, 0.0.0.0, or IPv6 loopback (::1)
   *
   * @param url - The URL string to validate
   * @returns {boolean} - Returns `false` if the URL violates any of the conditions `true` otherwise
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url)

      // Disallow http:
      if (parsedUrl.protocol === "http:") {
        return false
      }

      // Disallow localhost with or without a port
      if (/^localhost(:\d+)?$/i.test(parsedUrl.hostname)) {
        return false
      }

      // Disallow internal and non-routable IP addresses
      const ipAddress = parsedUrl.hostname

      // Regex for non-routable IPv4 IPs
      const nonRoutableIpv4Patterns = [
        /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // Loopback IPs
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 10.x.x.x private IPs
        /^192\.168\.\d{1,3}\.\d{1,3}$/,    // 192.168.x.x private IPs
        /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/, // 172.16.x.x to 172.31.x.x private IPs
        /^0\.0\.0\.0$/                      // Non-routable address
      ]

      // Check for IPv4 matches
      if (nonRoutableIpv4Patterns.some((pattern) => pattern.test(ipAddress))) {
        return false
      }

      // Check for non-routable IPv6 addresses explicitly
      if (ipAddress === "[::1]") {
        return false
      }

      // If none of the disallowed conditions matched, the URL is valid
      return true
    } catch (error) {
      // If the input is not a valid URL, return false
      return false
    }
  }
}

//////////
// OTHER FILES
//////////

/*
There is currently a bug with the test runner that prevents importing and using files that export variables other than type definitions within implementation files that are not directly imported themselves.
Thus, all non-type exports have been moved to Engine.
*/

// TODO: fix bug with imports that break tests. -----[GASP/OverlayGASPRemote.ts]-----



// TODO: fix bug with imports that break tests. -----[GASP/OverlayGASPStorage.ts]-----
