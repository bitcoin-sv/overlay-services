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
  AdmittanceInstructions,
  SHIPBroadcaster,
  HTTPSOverlayBroadcastFacilitator,
  LookupResolver,
  LookupResolverConfig,
  OverlayBroadcastFacilitator
} from '@bsv/sdk'
import { AdvertisementData, Advertiser } from './Advertiser.js'
import { GASP, GASPInitialRequest, GASPInitialResponse, GASPNode } from '@bsv/gasp'
import { SyncConfiguration } from './SyncConfiguration.js'
import { OverlayGASPRemote } from './GASP/OverlayGASPRemote.js'
import { OverlayGASPStorage } from './GASP/OverlayGASPStorage.js'

/**
 * An engine for running BSV Overlay Services (topic managers and lookup services).
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
   * @param {string[]} shipTrackers - SHIP domains we know to bootstrap the system
   * @param {string[]} slapTrackers - SLAP domains we know to bootstrap the system
   * @param {SyncConfiguration} syncConfiguration — Configuration object describing historical synchronization of topics.
   * @param {boolean} logTime - Enables / disables the timing logs for various operations in the Overlay submit route.
   * @param {string} logPrefix - Supports overriding the log prefix with a custom string.
   * @param {boolean} throwOnBroadcastFailure - Enables / disables throwing an error when a transaction broadcast failure is detected.
   * @param {OverlayBroadcastFacilitator} overlayBroadcastFacilitator - Facilitator for propagation to other Overlay Services.
   * @param {typeof console} logger - The place where log entries are written.
   */
  constructor (
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
    public throwOnBroadcastFailure = false,
    public overlayBroadcastFacilitator: OverlayBroadcastFacilitator = new HTTPSOverlayBroadcastFacilitator(),
    public logger: typeof console = console
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
          ...(Array.isArray(this.syncConfiguration[managerName]) ? this.syncConfiguration[managerName] : []),
          ...this.shipTrackers
        ])
        this.syncConfiguration[managerName] = Array.from(combinedSet)
      } else if (managerName === 'tm_slap' && this.slapTrackers !== undefined && this.syncConfiguration[managerName] !== false) {
        // Combine tm_slap trackers with preexisting entries if any
        const combinedSet = new Set([
          ...(Array.isArray(this.syncConfiguration[managerName]) ? this.syncConfiguration[managerName] : []),
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
  private startTime (label: string): void {
    if (this.logTime) {
      this.logger.time(`${this.logPrefix} ${label}`)
    }
  }

  private endTime (label: string): void {
    if (this.logTime) {
      this.logger.timeEnd(`${this.logPrefix} ${label}`)
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
  async submit (taggedBEEF: TaggedBEEF, onSteakReady?: (steak: STEAK) => void, mode: 'historical-tx' | 'current-tx' = 'current-tx'): Promise<STEAK> {
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
    const dupeTopics = new Set<string>()

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
        dupeTopics.add(topic)
        steak[topic] = { outputsToAdmit: [], coinsToRetain: [] }
        return
      }

      // Identify previous coins admitted to this specific topic
      const previousCoins: number[] = []
      const outputPromises = tx.inputs.map(async (input, i) => {
        const previousTXID = input.sourceTXID !== undefined ? input.sourceTXID : input.sourceTransaction?.id('hex')
        if (previousTXID !== undefined) {
          // Check if the previous output was admitted to this specific topic
          const output = await this.storage.findOutput(previousTXID, input.sourceOutputIndex, topic)
          if (output !== undefined && output !== null) {
            previousCoins.push(i)
            return output
          }
        }
        return null
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
                this.logger.error('Error in lookup service for outputSpent:', error)
              }
            }))
          } catch (error) {
            this.logger.error('Error marking UTXO as spent:', error)
          }
        }
      })

      let admissibleOutputs: AdmittanceInstructions = { outputsToAdmit: [], coinsToRetain: [] }
      // Determine which outputs are admissible for this topic
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

    // Call the callback function if it is provided (moved here to ensure topic processing is complete)
    if (onSteakReady !== undefined) {
      onSteakReady(steak)
    }

    // Update storage and notify lookup services
    for (const topic of taggedBEEF.topics) {
      if (dupeTopics.has(topic)) {
        continue
      }
      // Keep track of which outputs to admit, mark as stale, or retain
      const admissibleOutputs = steak[topic]
      const outputsToAdmit: number[] = admissibleOutputs.outputsToAdmit
      const outputsConsumed: Array<{
        txid: string
        outputIndex: number
      }> = []

      const outputsToMarkStale: Array<{
        txid: string
        previousOutputIndex: number
        inputIndex: number
      }> = []

      // Recompute previousCoins for this topic to use in the update logic
      const previousCoins: number[] = []
      await Promise.all(tx.inputs.map(async (input, i) => {
        const previousTXID = input.sourceTXID !== undefined ? input.sourceTXID : input.sourceTransaction?.id('hex')
        if (previousTXID !== undefined) {
          const output = await this.storage.findOutput(previousTXID, input.sourceOutputIndex, topic)
          if (output !== undefined && output !== null) {
            previousCoins.push(i)
          }
        }
      }))

      // For each of the previous UTXOs for this topic, if the UTXO was not included in the list of UTXOs identified for retention, then it will be marked as stale.
      for (const inputIndex of previousCoins) {
        const previousTXID = tx.inputs[inputIndex].sourceTXID || tx.inputs[inputIndex].sourceTransaction?.id('hex')
        const previousOutputIndex = tx.inputs[inputIndex].sourceOutputIndex
        if (!admissibleOutputs.coinsToRetain.includes(inputIndex)) {
          outputsToMarkStale.push({
            txid: previousTXID,
            previousOutputIndex,
            inputIndex
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
      await Promise.all(outputsToMarkStale.map(async coin => {
        const output = await this.storage.findOutput(coin.txid, coin.previousOutputIndex, topic)
        if (output !== undefined && output !== null) {
          await this.deleteUTXODeep(output)
        }
      }))
      this.endTime(`lookForStaleOutputs_${txid.substring(0, 10)}`)

      // Update the STEAK to indicate which coins were removed
      steak[topic].coinsRemoved = outputsToMarkStale.map(x => x.inputIndex)

      // Handle admittance and notification of incoming UTXOs
      const newUTXOs: Array<{ txid: string, outputIndex: number }> = []
      await Promise.all(outputsToAdmit.map(async outputIndex => {
        this.startTime(`insertNewOutput_${txid.substring(0, 10)}`)
        await this.storage.insertOutput({
          txid,
          outputIndex,
          outputScript: tx.outputs[outputIndex].lockingScript.toBinary(),
          satoshis: tx.outputs[outputIndex].satoshis,
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
    const relevantTopics = taggedBEEF.topics.filter(topic =>
      steak[topic] !== undefined && !dupeTopics.has(topic) && (steak[topic].outputsToAdmit.length !== 0 || steak[topic].coinsRemoved?.length !== 0)
    )

    if (relevantTopics.length === 0) {
      this.endTime(`transactionPropagation_${txid.substring(0, 10)}`)
      return steak
    }

    // Create a SHIPBroadcaster instance
    let customBroadcasterConfig
    if (Array.isArray(this.slapTrackers)) {
      // Custom SLAP trackers warrant a custom broadcaster config
      const resolverConfig: LookupResolverConfig = {
        slapTrackers: this.slapTrackers
      }
      customBroadcasterConfig = {
        resolver: new LookupResolver(resolverConfig)
      }
    }
    const shipBroadcaster = new SHIPBroadcaster(relevantTopics, customBroadcasterConfig)

    try {
      await shipBroadcaster.broadcast(tx)
    } catch (error) {
      this.logger.error('Error during propagation to other nodes:', error)
    }
    this.endTime(`transactionPropagation_${txid.substring(0, 10)}`)

    // Immediately return from the function without waiting for the promises to resolve.
    return steak
  }

  /**
   * Submit a lookup question to the Overlay Services Engine, and receive back a Lookup Answer
   * @param LookupQuestion — The question to ask the Overlay Services Engine
   * @returns The answer to the question
   */
  async lookup (lookupQuestion: LookupQuestion): Promise<LookupAnswer> {
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
  async syncAdvertisements (): Promise<void> {
    if (
      this.advertiser === undefined ||
      typeof this.hostingURL !== 'string' ||
      this.hostingURL.length < 1 ||
      !this.isValidUrl(this.hostingURL)
    ) {
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
      this.logger.error('Failed to create SHIP advertisement:', error)
    }

    // Revoke all advertisements to revoke
    try {
      if (shipsToRevoke.length > 0 || slapsToRevoke.length > 0) {
        const taggedBEEF = await advertiser.revokeAdvertisements([...shipsToRevoke, ...slapsToRevoke])
        await this.submit(taggedBEEF)
      }
    } catch (error) {
      this.logger.error('Failed to revoke SHIP/SLAP advertisements:', error)
    }
  }

  /**
   * This method goes through each topic that we support syncing and attempts to sync with each endpoint
   * associated with that topic. If the sync configuration is 'SHIP', it will sync to all peers that support
   * the topic.
   *
   * @throws Error if the overlay service engine is not configured for topical synchronization.
   */
  async startGASPSync (): Promise<void> {
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
        const resolverConfig: LookupResolverConfig = this.slapTrackers
          ? { slapTrackers: this.slapTrackers }
          : {}

        const resolver = new LookupResolver(resolverConfig)
        const lookupAnswer: LookupAnswer = await resolver.query({
          service: 'ls_ship',
          query: {
            topics: [topic]
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
              this.logger.error('Failed to parse advertisement output:', error)
            }
          })

          syncEndpoints = Array.from(endpointSet)
        }
      }

      // Now syncEndpoints is guaranteed to be an array of strings without duplicates
      if (Array.isArray(syncEndpoints)) {
        // Remove our own hosting URL so we don't sync with ourselves
        syncEndpoints = syncEndpoints.filter((endpoint) => endpoint !== this.hostingURL)

        this.logger.info(`[GASP SYNC] Will attempt to sync with ${syncEndpoints.length} peer${syncEndpoints.length === 1 ? '' : 's'}`)
        // Sync with each endpoint individually to avoid parallel locks and let failures be isolated
        for (const endpoint of syncEndpoints) {
          this.logger.info(`[GASP SYNC] Starting sync for topic "${topic}" with peer "${endpoint}"`)

          try {
            const gasp = new GASP(
              new OverlayGASPStorage(topic, this),
              new OverlayGASPRemote(endpoint, topic),
              0,
              `[GASP Sync of ${topic} with ${endpoint}]`,
              true,
              true
            )
            await gasp.sync()

            this.logger.info(`[GASP SYNC] Sync successful for topic "${topic}" with peer "${endpoint}"`)
          } catch (err) {
            this.logger.error(
              `[GASP SYNC] Sync failed for topic "${topic}" with peer "${endpoint}"`,
              err
            )
            // Continue on to the next endpoint without throwing
          }
        }
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
  async provideForeignSyncResponse (initialRequest: GASPInitialRequest, topic: string): Promise<GASPInitialResponse> {
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
  async provideForeignGASPNode (graphID: string, txid: string, outputIndex: number): Promise<GASPNode> {
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
  async getUTXOHistory (
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
      this.logger.error(`Error retrieving UTXO history: ${e} `)
      // return []
      throw new Error(`Error retrieving UTXO history: ${e} `)
    }
  }

  /**
   * Delete a UTXO and all stale consumed inputs.
   * @param output - The UTXO to be deleted.
   * @returns {Promise<void>} - A promise that resolves when the deletion process is complete.
   */
  private async deleteUTXODeep (output: Output): Promise<void> {
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
  private updateInputProofs (tx: Transaction, txid: string, proof: MerklePath): void {
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
        const stx = input.sourceTransaction
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
  private async updateMerkleProof (output: Output, txid: string, proof: MerklePath): Promise<void> {
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
  async handleNewMerkleProof (txid: string, proof: MerklePath, blockHeight?: number): Promise<void> {
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
   * @returns {Promise<Record<string, { name: string; shortDescription: string; iconURL?: string; version?: string; informationURL?: string; }>>} - Supported topic managers and their metadata
   */
  async listTopicManagers (): Promise<Record<string, {
    name: string
    shortDescription: string
    iconURL?: string
    version?: string
    informationURL?: string
  }>> {
    const result: Record<string, {
      name: string
      shortDescription: string
      iconURL?: string
      version?: string
      informationURL?: string
    }> = {}
    for (const t in this.managers) {
      try {
        result[t] = await this.managers[t].getMetaData()
      } catch (e) {
        this.logger.warn(`Unable to get metadata for topic manager: ${t}`)
        result[t] = {
          name: t,
          shortDescription: 'No topical tagline.'
        }
      }
    }
    return result
  }

  /**
   * Find a list of supported lookup services
   * @public
   * @returns {Promise<Record<string, { name: string; shortDescription: string; iconURL?: string; version?: string; informationURL?: string; }>>} - Supported lookup services and their metadata
   */
  async listLookupServiceProviders (): Promise<Record<string, {
    name: string
    shortDescription: string
    iconURL?: string
    version?: string
    informationURL?: string
  }>> {
    const result: Record<string, {
      name: string
      shortDescription: string
      iconURL?: string
      version?: string
      informationURL?: string
    }> = {}
    for (const ls in this.lookupServices) {
      try {
        result[ls] = await this.lookupServices[ls].getMetaData()
      } catch (e) {
        this.logger.warn(`Unable to get metadata for lookup service: ${ls}`)
        result[ls] = {
          name: ls,
          shortDescription: 'No lookup service tagline.'
        }
      }
    }
    return result
  }

  /**
   * Run a query to get the documentation for a particular topic manager
   * @public
   * @returns {Promise<string>} - the documentation for the topic manager
   */
  async getDocumentationForTopicManager (manager: any): Promise<string> {
    const documentation = await this.managers[manager]?.getDocumentation?.()
    return documentation !== undefined ? documentation : 'No documentation found!'
  }

  /**
   * Run a query to get the documentation for a particular lookup service
   * @public
   * @returns {Promise<string>} -  the documentation for the lookup service
   */
  async getDocumentationForLookupServiceProvider (provider: any): Promise<string> {
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
  private isValidUrl (url: string): boolean {
    try {
      const parsedUrl = new URL(url)

      // Disallow http:
      if (parsedUrl.protocol === 'http:') {
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
        /^192\.168\.\d{1,3}\.\d{1,3}$/, // 192.168.x.x private IPs
        /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/, // 172.16.x.x to 172.31.x.x private IPs
        /^0\.0\.0\.0$/ // Non-routable address
      ]

      // Check for IPv4 matches
      if (nonRoutableIpv4Patterns.some((pattern) => pattern.test(ipAddress))) {
        return false
      }

      // Check for non-routable IPv6 addresses explicitly
      if (ipAddress === '[::1]') {
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
