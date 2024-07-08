import { TopicManager } from './TopicManager.js'
import { LookupService } from './LookupService.js'
import { Storage } from './storage/Storage.js'
import type { AdmittanceInstructions } from './AdmittanceInstructions.js'
import type { Output } from './Output.js'
import { TaggedBEEF } from './TaggedBEEF.js'
import { STEAK } from './STEAK.js'
import { LookupQuestion } from './LookupQuestion.js'
import { LookupAnswer } from './LookupAnswer.js'
import { LookupFormula } from './LookupFormula.js'
import { Transaction, ChainTracker, MerklePath, Broadcaster } from '@bsv/sdk'
import { Advertiser } from './Advertiser.js'
import { SHIPAdvertisement } from './SHIPAdvertisement.js'
import { GASP, GASPInitialReply, GASPInitialRequest, GASPInitialResponse, GASPNode, GASPNodeResponse, GASPRemote, GASPStorage } from '@bsv/gasp'
import { SyncConfiguration } from './SyncConfiguration.js'

/**
 * Am engine for running BSV Overlay Services (topic managers and lookup services).
 */
export class Engine {
  /**
   * Creates a new Overlay Services Engine
   * @param {[key: string]: TopicManager} managers - manages topic admittance
   * @param {[key: string]: LookupService} lookupServices - manages UTXO lookups
   * @param {Storage} storage - for interacting with internally-managed persistent data
   * @param {ChainTracker} chainTracker - Verifies SPV data associated with transactions
   * @param {string} [hostingURL] - The URL this engine is hosted at. Required if going to support peer-discovery with an advertiser.
   * @param {Broadcaster} [Broadcaster] - broadcaster used for broadcasting the incoming transaction
   * @param {Advertiser} [Advertiser] - handles SHIP and SLAP advertisements for peer-discovery
   * @param {string} shipTrackers - SHIP domains we know to bootstrap the system
   * @param {string} slapTrackers - SLAP domains we know to bootstrap the system
   * @param {Record<string, string[] | 'SHIP'>} syncConfiguration — Configuration object describing historical synchronization of topics.
   */
  constructor(
    public managers: { [key: string]: TopicManager },
    public lookupServices: { [key: string]: LookupService },
    public storage: Storage,
    public chainTracker: ChainTracker,
    public hostingURL?: string,
    public shipTrackers?: string[],
    public slapTrackers?: string[],
    public broadcaster?: Broadcaster,
    public advertiser?: Advertiser,
    public syncConfiguration?: SyncConfiguration
  ) {
  }

  /**
   * Submits a transaction for processing by Overlay Services.
   * @param {TaggedBEEF} taggedBEEF - The transaction to process
   * @param {function(STEAK): void} [onSTEAKReady] - Optional callback function invoked when the STEAK is ready.
   * 
   * The optional callback function should be used to get STEAK when ready, and avoid waiting for broadcast and transaction propagation to complete.
   * 
   * @returns {Promise<STEAK>} The submitted transaction execution acknowledgement
   */
  async submit(taggedBEEF: TaggedBEEF, onSteakReady?: (steak: STEAK) => void): Promise<STEAK> {
    for (const t of taggedBEEF.topics) {
      if (this.managers[t] === undefined || this.managers[t] === null) {
        throw new Error(`This server does not support this topic: ${t}`)
      }
    }
    // Validate the transaction SPV information
    const tx = Transaction.fromBEEF(taggedBEEF.beef)
    const txid = tx.id('hex')
    const txValid = await tx.verify(this.chainTracker)
    if (!txValid) throw new Error('Unable to verify SPV information.')

    // Find UTXOs belonging to a particular topic
    const steak: STEAK = {}
    for (const topic of taggedBEEF.topics) {
      // Ensure transaction is not already applied to the topic
      const dupeCheck = await this.storage.doesAppliedTransactionExist({
        txid,
        topic
      })
      if (dupeCheck) {
        // The transaction was already processed.
        // Currently, NO OUTPUTS ARE ADMITTED FOR DUPLICATE TRANSACTIONS.
        // An alternative decision, one that was decided against, would be to act as if the operation was successful: looking up and returning the list of admitted outputs from when the transaction was originally processed.
        // This was decided against, because we don't want to encourage unnecessary flooding of duplicative transactions to overlay services.
        steak[topic] = {
          outputsToAdmit: [],
          coinsToRetain: []
        }
        continue
      }

      // Check if any input of this transaction is a previous UTXO, adding previous UTXOs to the list
      const previousCoins: number[] = []
      for (const [i, input] of tx.inputs.entries()) {
        const previousTXID = input.sourceTXID || input.sourceTransaction?.id('hex') as string
        // Check if a previous UTXO exists in the storage medium
        const output = await this.storage.findOutput(
          previousTXID,
          input.sourceOutputIndex,
          topic
        )
        if (output !== undefined && output !== null) {
          previousCoins.push(i)

          // This output is now spent.
          await this.storage.markUTXOAsSpent(
            output.txid,
            output.outputIndex,
            topic
          )

          // Notify the lookup services about the spending of this output
          for (const l of Object.values(this.lookupServices)) {
            try {
              if (l.outputSpent !== undefined && l.outputSpent !== null) {
                await l.outputSpent(
                  output.txid,
                  output.outputIndex,
                  topic
                )
              }
            } catch (_) { }
          }
        }
      }

      // Use the manager to determine which outputs are admissable
      let admissableOutputs: AdmittanceInstructions
      try {
        admissableOutputs = await this.managers[topic].identifyAdmissibleOutputs(taggedBEEF.beef, previousCoins)
      } catch (_) {
        // If the topic manager throws an error, other topics may still succeed, so we continue to the next one.
        // No outputs were admitted to this topic in this case. Note, however, that the transaction is still valid according to Bitcoin, so it may have spent some previous overlay members. This is unavoidable and good.
        steak[topic] = {
          outputsToAdmit: [],
          coinsToRetain: []
        }
        continue
      }

      // Keep track of which outputs to admit, mark as stale, or retain
      const outputsToAdmit: number[] = admissableOutputs.outputsToAdmit
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
        if (!admissableOutputs.coinsToRetain.includes(inputIndex)) {
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
      for (const coin of staleCoins) {
        const output = await this.storage.findOutput(coin.txid, coin.outputIndex, topic)
        if (output !== undefined && output !== null) {
          await this.deleteUTXODeep(output)
        }
      }

      // Handle admittance and notification of incoming UTXOs
      const newUTXOs: Array<{ txid: string, outputIndex: number }> = []
      for (const outputIndex of outputsToAdmit) {
        // Store the output
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
        newUTXOs.push({
          txid,
          outputIndex
        })

        // Notify all the lookup services about the new UTXO
        for (const l of Object.values(this.lookupServices)) {
          try {
            if (l.outputAdded !== undefined && l.outputAdded !== null) {
              await l.outputAdded(txid, outputIndex, tx.outputs[outputIndex].lockingScript, topic)
            }
          } catch (_) { }
        }
      }

      // Update each output consumed to know who consumed it
      for (const output of outputsConsumed) {
        const outputToUpdate = await this.storage.findOutput(output.txid, output.outputIndex, topic)
        if (outputToUpdate !== undefined && outputToUpdate !== null) {
          const newConsumedBy = [...new Set([...newUTXOs, ...outputToUpdate.consumedBy])]
          // Note: only update if newConsumedBy !== new Set(JSON.parse(outputToUpdate.consumedBy)) ?
          await this.storage.updateConsumedBy(output.txid, output.outputIndex, topic, newConsumedBy)
        }
      }

      // Insert the applied transaction to prevent duplicate processing
      await this.storage.insertAppliedTransaction({
        txid,
        topic
      })

      // Keep track of what outputs were admitted for what topic
      steak[topic] = admissableOutputs
    }

    // Call the callback function if it is provided
    if (onSteakReady !== undefined) {
      onSteakReady(steak)
    }

    // Broadcast the transaction
    if (Object.keys(steak).length > 0 && this.broadcaster !== undefined) {
      await this.broadcaster.broadcast(tx)
    }

    // If we don't have an advertiser, just return the steak
    if (this.advertiser === undefined) {
      return steak
    }

    // Propagate transaction to other nodes according to synchronization agreements
    // 1. Find nodes that host the topics associated with admissable outputs
    // We want to figure out which topics we actually care about (because their associated outputs were admitted)
    // AND if the topic was not admitted we want to remove it from the list of topics we care about.
    const relevantTopics = taggedBEEF.topics.filter(topic =>
      steak[topic] !== undefined && steak[topic].outputsToAdmit.length !== 0
    )

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
            const shipAdvertisements: SHIPAdvertisement[] = []
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
              shipAdvertisements.forEach((advertisement: SHIPAdvertisement) => {
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
    if (lookupService === undefined || lookupService === null) throw new Error(`Lookup service not found for provider: ${lookupQuestion.service}`)

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
        false
      )
      if (UTXO === undefined || UTXO === null) continue

      // Get the history for this utxo and construct a BRC-8 Envelope
      const output = await this.getUTXOHistory(UTXO, history, 0)
      if (output !== undefined && output !== null) {
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
    if (this.advertiser === undefined) {
      return
    }
    const advertiser = this.advertiser

    // Step 1: Retrieve Current Configuration
    const configuredTopics = Object.keys(this.managers)
    const configuredServices = Object.keys(this.lookupServices)

    // Step 2: Fetch Existing Advertisements
    const currentSHIPAdvertisements = await advertiser.findAllSHIPAdvertisements()
    const currentSLAPAdvertisements = await advertiser.findAllSLAPAdvertisements()

    // Step 3: Compare and Determine Actions
    const requiredSHIPAdvertisements = new Set(configuredTopics)
    const requiredSLAPAdvertisements = new Set(configuredServices)

    const existingSHIPTopics = new Set(currentSHIPAdvertisements.map(ad => ad.topic))
    const existingSLAPServices = new Set(currentSLAPAdvertisements.map(ad => ad.service))

    const shipToCreate = Array.from(requiredSHIPAdvertisements).filter(topic => !existingSHIPTopics.has(topic))
    const shipToRevoke = currentSHIPAdvertisements.filter(ad => !requiredSHIPAdvertisements.has(ad.topic))

    const slapToCreate = Array.from(requiredSLAPAdvertisements).filter(service => !existingSLAPServices.has(service))
    const slapToRevoke = currentSLAPAdvertisements.filter(ad => !requiredSLAPAdvertisements.has(ad.service))

    // Step 4: Update Advertisements
    for (const topic of shipToCreate) {
      try {
        const taggedBEEF = await advertiser.createSHIPAdvertisement(topic)
        await this.submit(taggedBEEF)
      } catch (error) {
        console.error('Failed to create SHIP advertisement:', error)
      }
    }

    for (const service of slapToCreate) {
      try {
        const taggedBEEF = await advertiser.createSLAPAdvertisement(service)
        await this.submit(taggedBEEF)
      } catch (error) {
        console.error('Failed to create SLAP advertisement:', error)
      }
    }

    for (const ad of shipToRevoke) {
      try {
        const taggedBEEF = await advertiser.revokeAdvertisement(ad)
        await this.submit(taggedBEEF)
      } catch (error) {
        console.error('Failed to revoke SHIP advertisement:', error)
      }
    }

    for (const ad of slapToRevoke) {
      try {
        const taggedBEEF = await advertiser.revokeAdvertisement(ad)
        await this.submit(taggedBEEF)
      } catch (error) {
        console.error('Failed to revoke SLAP advertisement:', error)
      }
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
      let syncEndpoints: string[] | string = this.syncConfiguration[topic]

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
          const gasp = new GASP(new OverlayGASPStorage(topic, this), new OverlayGASPRemote(endpoint), 0, `[GASP Sync of ${topic} with ${endpoint}] `, true)
          await gasp.sync()
        }))
      }
    }
  }

  /**
   * Given a GASP request, create an initial response.
   *
   * This method processes an initial synchronization request by finding the relevant UTXOs for the given topic
   * since the provided (TODO: timestamp or block height, we need to decide on sync timing semantics) in the request. It constructs a response that includes a list of these UTXOs
   * and the timestamp from the initial request.
   *
   * @param initialRequest - The GASP initial request containing the version and the timestamp since the last sync.
   * @param topic - The topic for which UTXOs are being requested.
   * @returns A promise that resolves to a GASPInitialResponse containing the list of UTXOs and the provided timestamp.
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
   * @param txid - The transaction ID for the current output.
   * @param outputIndex - The index of the output in the transaction.
   * @returns A promise that resolves to a GASPNode containing the raw transaction and other optional data.
   * @throws An error if no output is found for the given transaction ID and output index.
   */
  async provideForeignGASPNode(graphID: string, txid: string, outputIndex: number): Promise<GASPNode> {
    const output = await this.storage.findOutput(txid, outputIndex)

    if (output === undefined || output === null) {
      throw new Error('No matching output found!')
    }

    const tx = Transaction.fromBEEF(output.beef)
    const rawTx = tx.toHex()

    const node: GASPNode = {
      rawTx,
      graphID,
      outputIndex
    }
    if (tx.merklePath !== undefined) {
      node.proof = tx.merklePath.toHex()
    }

    return node
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
          const output = await this.storage.findOutput(outputIdentifier.txid, outputIdentifier.outputIndex)

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
      console.error(`Error retrieving UTXO history: ${e}`)
      // return []
      throw new Error(`Error retrieving UTXO history: ${e}`)
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
      throw new Error(`Failed to delete all stale outputs: ${error as string}`)
    }
  }

  /**
   * Given a new transaction proof (txid, proof),
   * 
   * update tx.merklePath if appropriate,
   * 
   * and if not, recurse through all input sourceTransactions.
   * 
   * @param tx transaction which may benefit from new proof.
   * @param txid BE hex string double hash of transaction proven by proof.
   * @param proof for txid
   */
  private updateInputProofs(tx: Transaction, txid: string, proof: MerklePath) {
    if (tx.merklePath)
      // transaction already has a proof
      return

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

    const tx = Transaction.fromBEEF(output.beef)

    if (tx.merklePath)
      // Already have a proof for this output's transaction.
      return

    // recursively update all sourceTransactions proven by (txid,proof)
    this.updateInputProofs(tx, txid, proof)

    // Update the output's BEEF in the storage DB
    await this.storage.updateOutputBeef(output.txid, output.outputIndex, output.topic, tx.toBEEF())

    // Recursively update the consumedBy outputs
    for (const consumingOutput of output.consumedBy) {
      const consumedOutputs = await this.storage.findOutputsForTransaction(consumingOutput.txid)
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
   */
  async handleNewMerkleProof(txid: string, proof: MerklePath): Promise<void> {
    const outputs = await this.storage.findOutputsForTransaction(txid)

    if (outputs == undefined || outputs.length === 0) {
      throw new Error('Could not find matching transaction outputs for proof ingest!')
    }

    for (const output of outputs) {
      await this.updateMerkleProof(output, txid, proof)
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
}

//////////
// OTHER FILES
//////////

/*
There is currently a bug with the test runner that prevents importing and using files that export variables other than type definitions within implementation files that are not directly imported themselves.
Thus, all non-type exports have been moved to Engine.
*/

// TODO: fix bug with imports that break tests. -----[GASP/OverlayGASPRemote.ts]-----

export class OverlayGASPRemote implements GASPRemote {
  constructor(public endpointURL: string) { }

  /**
   * Given an outgoing initial request, sends the request to the foreign instance and obtains their initial response.
   * @param request
   * @returns
   */
  async getInitialResponse(request: GASPInitialRequest): Promise<GASPInitialResponse> {
    // Send out an HTTP request to the URL (current host for topic)
    // Include the topic in the request
    // Parse out response and return correct format
    const url = `${this.endpointURL}/requestSyncResponse`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    })

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`)
    }

    const result: GASPInitialResponse = await response.json()

    // Validate and return the response in the correct format
    if (!Array.isArray(result.UTXOList) || typeof result.since !== 'number') {
      throw new Error('Invalid response format')
    }

    return {
      UTXOList: result.UTXOList.map((utxo: any) => ({
        txid: utxo.txid,
        outputIndex: utxo.outputIndex
      })),
      since: result.since
    }
  }

  /**
   * Given an outgoing txid, outputIndex and optional metadata, request the associated GASP node from the foreign instance.
   * @param graphID
   * @param txid
   * @param outputIndex
   * @param metadata
   * @returns
   */
  async requestNode(graphID: string, txid: string, outputIndex: number, metadata: boolean): Promise<GASPNode> {
    // Send an HTTP request with the provided info and get back a gaspNode
    const url = `${this.endpointURL}/requestForeignGASPNode` // Assuming the endpoint is /node, adjust as needed
    const body = {
      graphID,
      txid,
      outputIndex,
      metadata
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`)
    }

    const result = await response.json()

    // Validate and return the response in the correct format
    if (typeof result.graphID !== 'string' || typeof result.rawTx !== 'string' || typeof result.outputIndex !== 'number') {
      throw new Error('Invalid response format')
    }

    const gaspNode: GASPNode = {
      graphID: result.graphID,
      rawTx: result.rawTx,
      outputIndex: result.outputIndex,
      proof: result.proof,
      txMetadata: result.txMetadata,
      outputMetadata: result.outputMetadata,
      inputs: result.inputs
    }

    return gaspNode
  }

  // ---- Now optional methods ----

  // When are only syncing to them
  async getInitialReply(response: GASPInitialResponse): Promise<GASPInitialReply> {
    throw new Error('Function not supported!')
  }

  // Only used when supporting bidirectional sync.
  // Overlay services does not support this.
  async submitNode(node: GASPNode): Promise<void | GASPNodeResponse> {
    throw new Error('Node submission not supported!')
  }
}

// TODO: fix bug with imports that break tests. -----[GASP/OverlayGASPStorage.ts]-----

/**
 * Represents a node in the temporary graph.
 */
export interface GraphNode {
  txid: string
  time: number
  graphID: string
  rawTx: string
  outputIndex: number
  spentBy?: string
  proof?: string
  txMetadata?: string
  outputMetadata?: string
  inputs?: Record<string, { hash: string }> | undefined
  children: GraphNode[]
  parent?: GraphNode
}

export class OverlayGASPStorage implements GASPStorage {
  readonly temporaryGraphNodeRefs: Record<string, GraphNode> = {}

  constructor(public topic: string, public engine: Engine, public maxNodesInGraph?: number) { }

  /**
   *
   * @param since
   * @returns
   */
  async findKnownUTXOs(since: number): Promise<Array<{ txid: string, outputIndex: number }>> {
    const UTXOs = await this.engine.storage.findUTXOsForTopic(this.topic, since)
    return UTXOs.map(output => ({
      txid: output.txid,
      outputIndex: output.outputIndex
    }))
  }

  // TODO: Consider optionality on interface
  async hydrateGASPNode(graphID: string, txid: string, outputIndex: number, metadata: boolean): Promise<GASPNode> {
    throw new Error('GASP node hydration Not supported!')
  }

  /**
  * For a given node, returns the inputs needed to complete the graph, including whether updated metadata is requested for those inputs.
  * @param tx The node for which needed inputs should be found.
  * @returns A promise for a mapping of requested input transactions and whether metadata should be provided for each.
  */
  async findNeededInputs(tx: GASPNode): Promise<GASPNodeResponse | undefined> {
    // If there is no Merkle proof, we always need the inputs
    const response: GASPNodeResponse = {
      requestedInputs: {}
    }
    const parsedTx = Transaction.fromHex(tx.rawTx)
    if (tx.proof === undefined) {
      for (const input of parsedTx.inputs) {
        response.requestedInputs[`${input.sourceTXID}.${input.sourceOutputIndex}`] = {
          metadata: false
        }
      }

      return response
    }

    // Attempt to check if the current transaction is admissible
    parsedTx.merklePath = MerklePath.fromHex(tx.proof)
    const admittanceResult = await this.engine.managers[this.topic].identifyAdmissibleOutputs(parsedTx.toBEEF(), [])

    if (admittanceResult.outputsToAdmit.includes(tx.outputIndex)) {
      // The transaction is admissible, no further inputs are needed
    } else {
      // The transaction is not admissible, get inputs needed for further verification
      // TopicManagers should implement a function to identify which inputs are needed.
      if (this.engine.managers[this.topic] !== undefined && typeof this.engine.managers[this.topic].identifyNeededInputs === 'function') {
        for (const input of parsedTx.inputs) {
          response.requestedInputs[`${input.sourceTXID}.${input.sourceOutputIndex}`] = {
            metadata: false
          }
        }
        return response
      } else {
        try {
          const neededInputs = await this.engine.managers[this.topic].identifyNeededInputs?.(parsedTx.toBEEF()) ?? []
          for (const input of neededInputs) {
            response.requestedInputs[`${input.txid}.${input.outputIndex}`] = {
              metadata: false
            }
          }
          return response
        } catch (e) {
          console.error(`An error occurred when identifying needed inputs for transaction: ${parsedTx.id('hex')}.${tx.outputIndex}!`)
        }
      }
    }
  }

  /**
  * Appends a new node to a temporary graph.
  * @param tx The node to append to this graph.
  * @param spentBy Unless this is the same node identified by the graph ID, denotes the TXID and input index for the node which spent this one, in 36-byte format.
  * @throws If the node cannot be appended to the graph, either because the graph ID is for a graph the recipient does not want or because the graph has grown to be too large before being finalized.
  */
  async appendToGraph(tx: GASPNode, spentBy?: string | undefined): Promise<void> {
    if (this.maxNodesInGraph !== undefined && Object.keys(this.temporaryGraphNodeRefs).length >= this.maxNodesInGraph) {
      throw new Error('The max number of nodes in transaction graph has been reached!')
    }

    const parsedTx = Transaction.fromHex(tx.rawTx)
    const txid = parsedTx.id('hex')
    if (tx.proof !== undefined) {
      parsedTx.merklePath = MerklePath.fromHex(tx.proof)
    }

    // Throw if:
    // 1. TODO: graphID is for a graph the recipient does not want (stipulated where?)
    // 2. TODO: The graph has grown to be too large before being finalized (based on some defined limit?)

    // Given the passed in node, append to the temp graph
    // Use the spentBy param which should be a txid.inputIndex for the node which spent this one in 36-byte format
    const newGraphNode: GraphNode = {
      txid,
      time: 0, // TODO: Determine required format for Time (either block height or timestamp, undefined / Infinity for unconfirmed transactions
      graphID: tx.graphID,
      rawTx: tx.rawTx,
      outputIndex: tx.outputIndex,
      proof: tx.proof,
      txMetadata: tx.txMetadata,
      outputMetadata: tx.outputMetadata,
      inputs: tx.inputs,
      children: []
    }

    // If spentBy is undefined, then we know it's the root node.
    if (spentBy === undefined) {
      this.temporaryGraphNodeRefs[tx.graphID] = newGraphNode
    } else {
      // Find the parent node based on spentBy
      const parentNode = this.temporaryGraphNodeRefs[spentBy]

      if (parentNode !== undefined) {
        // Set parent-child relationship
        parentNode.children.push(newGraphNode)
        newGraphNode.parent = parentNode
        this.temporaryGraphNodeRefs[`${newGraphNode.txid}.${newGraphNode.outputIndex}`] = newGraphNode
      } else {
        throw new Error(`Parent node with GraphID ${spentBy} not found`)
      }
    }
  }

  /**
    * Checks whether the given graph, in its current state, makes reference only to transactions that are proven in the blockchain, or already known by the recipient to be valid.
    * @param graphID The TXID and output index (in 36-byte format) for the UTXO at the tip of this graph.
    * @throws If the graph is not well-anchored.
    */
  async validateGraphAnchor(graphID: string): Promise<void> {
    // 1. Confirm that we are well anchored (according to the rules of SPV)
    // 2. Is there some sequence of nodes that will result in the admittance of the root node into the topic
    // 3. If some route that when executed in order to the root node leads to a valid admittance, we are good to go.
    // a) For each node in the chain we need to check topical admittance. For every chain.
    // Take into account previousCoins once you've validated child outputs
    // TODO: Test call stack implications with many recursive function calls for large graphs.

    const validationMap = new Map<string, boolean>()

    const validationFunc = async (graphNode: GraphNode): Promise<boolean> => {
      if (validationMap.has(graphNode.graphID)) {
        return validationMap.get(graphNode.graphID) || false
      }

      let parsedTx
      try {
        parsedTx = Transaction.fromHex(graphNode.rawTx)
        if (graphNode.proof !== undefined) {
          parsedTx.merklePath = MerklePath.fromHex(graphNode.proof)
        }
      } catch (error) {
        console.error('Error parsing transaction or proof:', error)
        return false
      }

      const validatedChildren: GraphNode[] = []
      for (const child of graphNode.children) {
        if (!validationMap.has(child.graphID)) {
          const isValidChild = await validationFunc(child)
          if (isValidChild) {
            validatedChildren.push(child)
          }
        } else if (validationMap.get(child.graphID)) {
          validatedChildren.push(child)
        }
      }

      let admittanceResult
      try {
        admittanceResult = await this.engine.managers[this.topic].identifyAdmissibleOutputs(parsedTx.toBEEF(), validatedChildren.map(child => child.outputIndex))
      } catch (error) {
        console.error('Error in admittance check:', error)
        return false
      }

      const isValid = admittanceResult.outputsToAdmit.includes(graphNode.outputIndex)
      validationMap.set(graphNode.graphID, isValid)

      if (isValid === false) {
        return false
      }

      // Reached the root successfully
      if (graphNode.parent === undefined) {
        return true
      }

      return await validationFunc(graphNode.parent)
    }

    const tipNode = this.temporaryGraphNodeRefs[graphID]
    if (tipNode === undefined) {
      throw new Error(`Graph node with ID ${graphID} not found`)
    }

    const isValid = await validationFunc(tipNode)
    if (!isValid) {
      throw new Error('The graph is not well-anchored')
    }
  }

  /**
   * Deletes all data associated with a temporary graph that has failed to sync, if the graph exists.
   * @param graphID The TXID and output index (in 36-byte format) for the UTXO at the tip of this graph.
   */
  async discardGraph(graphID: string): Promise<void> {
    for (const [nodeId, graphRef] of Object.entries(this.temporaryGraphNodeRefs)) {
      if (graphRef.graphID === graphID) {
        // Delete child node
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this.temporaryGraphNodeRefs[nodeId]
      }
    }
  }

  /**
   * Finalizes a graph, solidifying the new UTXO and its ancestors so that it will appear in the list of known UTXOs.
   * @param graphID The TXID and output index (in 36-byte format) for the UTXO at the tip of this graph.
   */
  async finalizeGraph(graphID: string): Promise<void> {
    // TODO: use similar function as validationFunc to construct the finalized graph with necessary components
  }
}
