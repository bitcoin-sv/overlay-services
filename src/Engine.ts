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
import { Transaction, ChainTracker } from '@bsv/sdk'

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
   * @param {ProofNotifier[]} [proofNotifiers] - proof notifier services coming soon!
   */
  constructor(
    public managers: { [key: string]: TopicManager },
    public lookupServices: { [key: string]: LookupService },
    public storage: Storage,
    public chainTracker: ChainTracker
    // public proofNotifiers: ProofNotifier[]
  ) { }

  /**
   * Submits a transaction for processing by Overlay Services.
   * @param taggedBEEF — The transaction to process
   * @returns The submitted transaction execution acknowledgement
   */
  async submit(taggedBEEF: TaggedBEEF): Promise<STEAK> {
    for (const t of taggedBEEF.topics) {
      if (this.managers[t] !== undefined && this.managers[t] !== null) {
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

    return steak
    // TODO subscribe to get notified by proof notifiers when proof is found for TX if not already present, so the tree can be chopped down
    // TODO propagate transaction to other nodes according to synchronization agreements
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
