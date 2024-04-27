import TopicManager from "./TopicManager.js"
import LookupService from "./LookupService.js"
import Storage from './storage/Storage.js'
import { ChainTracker } from "@bsv/sdk"
import { TaggedBEEF } from "./TaggedBEEF.js"
import { STEAK } from './STEAK.js'
import { LookupQuestion } from "./LookupQuestion.js"
import { LookupAnswer } from "./LookupAnswer.js"
import { Transaction } from '@bsv/sdk'

/**
 * Am engine for running BSV Overlay Services (topic managers and lookup services).
 */
export default class Engine {
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
     * Submits a transaction with one or more outputs belonging to a particular topic
     * @public
     * @param {object} params - all params given in an object to support legacy systems
     * @param {string} params.rawTx - The transaction in raw form
     * @param {EnvelopeInputMapApi} params.inputs - a structure containing the inputs for the transaction this output is apart of
     * @param {MapiResponseApi[]} params.mapiResponses - from miners for the associated transaction
     * @param {TscMerkleProofApi} params.proof - SPV envelope for the associated transaction
     * @param {string[]} params.topics - of topics for the given UTXOs
     */
    async submit(taggedBEEF: TaggedBEEF): Promise<STEAK> {
        for (const t of taggedBEEF.topics) {
            if (!this.managers[t]) throw new Error(`This server does not support this topic: ${t}`)
        }
        // Validate the transaction SPV information
        const tx = Transaction.fromBEEF(taggedBEEF.beef)
        const txValid = await tx.verify(this.chainTracker)
        if (!txValid) throw new Error('Unable to verify SPV information.')

        // Find UTXOs belonging to a particular topic
        const steak: STEAK = {}
        for (const topic of taggedBEEF.topics) {
            // Ensure transaction is not already applied to the topic
            const dupeCheck = await this.storage.findAppliedTransaction(
                tx.id('hex') as string,
                topic
            )
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
                const prevTx = Buffer.from(tx.inputs[i].sourceTXID).tostring('hex')
                // Check if a previous UTXO exists in the storage medium
                const [output] = await this.storage.findUTXO(
                    prevTx,
                    input.sourceOutputIndex,
                    topic
                )
                if (output) {
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
                            await l.outputSpent({
                                txid: output.txid,
                                outputIndex: output.outputIndex,
                                topic
                            })
                        } catch (_) { }
                    }
                }
            }

            // Use the manager to determine which outputs are admissable
            let admissableOutputs: AdmissableOutput
            try {
                admissableOutputs = await this.managers[topic].identifyAdmissibleOutputs({
                    previousUTXOs: previousCoins,
                    parsedTransaction
                })
            } catch (_) {
                // If the topic manager throws an error, other topics may still succeed, so we continue to the next one.
                // No outputs were admitted to this topic in this case. Note, however, that the transaction is still valid according to Bitcoin, so it may have spent some previous overlay members. This is unavoidable and good.
                admittedOutputs[topic] = []
                continue
            }

            // TODO: Consider removing log unless necessary for temp debugging!
            console.log(`Admissable outputs: ${JSON.stringify(admissableOutputs)}`)

            // Keep track of which outputs to admit, mark as stale, or retain
            let outputsToAdmit: number[]
            let staleOutputs: Output[] = []
            let utxosConsumed = '[]'

            // Handle legacy topic managers which return an array
            if (Array.isArray(admissableOutputs)) {
                outputsToAdmit = admissableOutputs
                // For legacy topic managers, which don't denote which of the inputs should be kept for historical data retention, NO INPUTS ARE RETAINED.
                // Alternatively, we could have chosen to retain all inputs, but this would bloat the size of the database. We want to encourage responsible overlay network designs that only retain the necessary information for maximal efficiency.
                staleOutputs = previousCoins
            } else {
                outputsToAdmit = admissableOutputs.outputsToAdmit
                // Find which outputs should not be retained and mark them as stale
                // For each of the previous UTXOs, if the the UTXO was not included in the list of UTXOs identified for retention, then it will be marked as stale.
                for (const output of previousCoins) {
                    if (!admissableOutputs.outputsToRetain.includes(output.id!)) {
                        staleOutputs.push(output)
                    }
                }
                // Track UTXOs consumed for each output admitted
                utxosConsumed = JSON.stringify(admissableOutputs.outputsToRetain)
                // TODO: Make sure DB read/writes are only done when necessary to optimize performance!
            }

            // Remove stale outputs recursively
            for (const output of staleOutputs) {
                await this.deleteUTXODeep(output)
            }

            // Handle admittance and notification of incoming UTXOs
            const newUTXOIds: number[] = []
            for (const outputIndex of outputsToAdmit) {
                // Store the UTXO in the storage engine
                const newUTXOId = await this.storage.addUTXO(
                    new Output(
                        parsedTransaction.id,
                        outputIndex,
                        parsedTransaction.outputs[outputIndex].script,
                        parsedTransaction.outputs[outputIndex].satoshis,
                        rawTx,
                        false,
                        topic,
                        proof,
                        mapiResponses,
                        inputs,
                        utxosConsumed,
                        undefined,
                        undefined,
                        '[]'
                    )
                )
                if (newUTXOId) {
                    newUTXOIds.push(newUTXOId)
                }

                // Notify all the lookup services about the new UTXO
                for (const l of Object.values(this.lookupServices)) {
                    try {
                        await l.outputAdded({
                            txid: parsedTransaction.id,
                            outputIndex,
                            outputScript: parsedTransaction.outputs[outputIndex].script,
                            topic
                        })
                    } catch (_) { }
                }
            }

            // Update each output consumed to know who consumed it
            const outputIds: number[] = JSON.parse(utxosConsumed) as number[]
            for (const id of outputIds) {
                const [outputToUpdate] = await this.storage.findUTXOById(id) // !!! Couldn't we get the ID from the already-available previousUTXOs instead of querying the database again?
                let consumedBy: number[] = newUTXOIds
                if (outputToUpdate.consumedBy) {
                    // Parse out the existing data, then concat the new outputs with no duplicates
                    consumedBy = [...new Set([...consumedBy, ...JSON.parse(outputToUpdate.consumedBy) as number[]])]
                }
                // Update with the new consumedBy data
                // Note: only update if consumedBy !== new Set(JSON.parse(outputToUpdate.consumedBy)) ?
                await this.storage.updateConsumedBy(id, JSON.stringify(consumedBy))
            }

            // Insert the applied transaction to prevent duplicate processing
            // TODO: The procesing of a Bitcoin transaction through this system should be done with a single, atomic database transaction, so as to avoid issues with race conditions and locking.
            await this.storage.insertAppliedTransaction(
                parsedTransaction.id,
                topic
            )

            // Keep track of what outputs were admitted for what topic
            admittedOutputs[topic] = outputsToAdmit
        }

        return {
            status: 'success',
            topics: admittedOutputs
        }
        // TODO subscribe to get notified by proof notifiers when proof is found for TX if not already present, so the tree can be chopped down
        // TODO propagate transaction to other nodes according to synchronization agreements, possibly including an incoming or outgoing BRC-41 payment
    }

    /**
     * Run a query to look for a particular token
     * @public
     * @param {object} params - all params given in an object to support legacy systems
     * @param {string} params.provider - specific provider to use
     * @param {object} params.query - search query formatted according to the provider used
     * @returns {Promise<object>} - the results of the lookup
     */
    async lookup(lookupQuestion: LookupQuestion): Promise<LookupAnswer> {

        // Access the named params
        const { provider, query } = params

        // Validate params
        if (!provider) throw new ERR_MISSING_PARAMETER('provider', 'valid')
        if (!query) throw new ERR_MISSING_PARAMETER('query', 'valid')

        // Validate a lookup service for the provider is found
        const lookupService = this.lookupServices[provider]
        if (!lookupService) throw new ERR_CONF_LOOKUP_SERVICE_NOT_SUPPORTED(`Lookup service not found for provider: ${provider}`)

        const lookupResult = await lookupService.lookup({ query })
        if (!Array.isArray(lookupResult)) {
            return lookupResult
        }
        const hydratedResults: Array<Output> = []

        for (const { txid, outputIndex, history } of lookupResult) {
            // Make sure this is an unspent output (UTXO)
            const [UTXO]: Output[] = await this.storage.findUTXO(
                txid,
                outputIndex,
                undefined,
                false
            )
            if (!UTXO) continue

            // Get the history for this utxo and construct a BRC-8 Envelope
            const envelope = await this.getUTXOHistory(UTXO, history, 0)
            if (envelope) {
                hydratedResults.push(envelope)
            }
        }
        return hydratedResults
    }

    /**
     * Traverse and return the history of a UTXO
     * @param historySelector 
     * @param currentDepth 
     * @param output 
     * @param txid 
     * @param outputIndex 
     * @param id 
     * @returns {Promise<EnvelopeEvidenceApi>}
     */
    private async getUTXOHistory(
        output: Output,
        historySelector?: ((output, currentDepth) => Promise<boolean>) | number, currentDepth = 0,
    ): Promise<Output | undefined> {

        // If we have an output but no history selector, jsut return the output.
        if (typeof historySelector === 'undefined') {
            const envelope: Output = {
                txid: output.txid,
                outputIndex: output.outputIndex,
                outputScript: output.outputScript.tostring('hex'),
                satoshis: output.satoshis,
                rawTx: output.rawTx,
                inputs: output.inputs,
                mapiResponses: output.mapiResponses,
                proof: output.proof
            }
            return envelope
        }

        // Determine if history traversal should continue for the current node
        let shouldTraverseHistory
        if (typeof historySelector !== 'number') {
            shouldTraverseHistory = await historySelector(output, currentDepth)
        } else {
            shouldTraverseHistory = currentDepth <= historySelector
        }

        if (shouldTraverseHistory === false) {
            return undefined
        } else if (output && output.utxosConsumed === undefined || output.utxosConsumed === '[]') {
            const envelope: Output = {
                txid: output.txid,
                outputIndex: output.outputIndex,
                outputScript: output.outputScript.tostring('hex'),
                satoshis: output.satoshis,
                rawTx: output.rawTx,
                inputs: output.inputs,
                mapiResponses: output.mapiResponses,
                proof: output.proof
            }
            return envelope
        }

        try {
            // Query the storage engine for UTXOs consumed by this UTXO
            // Only retrieve unique values in case outputs are doubly referenced
            const utxosConsumed: number[] = [...new Set(JSON.parse(output.utxosConsumed!))] as number[]

            // Find the child outputs for each utxo consumed by the current output
            const childHistories = await (await Promise.all(
                utxosConsumed.map(async (id) => {
                    const [output]: Output[] = await this.storage.findUTXOById(id)

                    // Make sure an output was found
                    if (!output) {
                        return undefined
                    }

                    // Find previousUTXO history
                    return this.getUTXOHistory(output, historySelector, currentDepth + 1)
                })
            )).filter(x => x !== undefined)

            // Construct a BRC-8 inputs structure for the envelope to return
            let outputInputs: EnvelopeInputMapApi = output.inputs ? output.inputs : {}

            try {
                if (output.inputs && typeof outputInputs === 'string') {
                    outputInputs = JSON.parse(output.inputs as unknown as string)
                }
            } catch (error) {
                console.error(error)
            }

            const childInputs: EnvelopeInputMapApi = outputInputs
            for (const input of childHistories) {
                if (!input) continue
                childInputs[input.txid] = input
            }

            // Construct a BRC-8 envelope containing all the inputs to the current output 
            const envelope: Output = {
                txid: output.txid,
                outputIndex: output.outputIndex,
                outputScript: output.outputScript.tostring('hex'),
                satoshis: output.satoshis,
                rawTx: output.rawTx,
                inputs: Object.keys(childInputs).length === 0 ? undefined : childInputs,
                mapiResponses: output.mapiResponses,
                proof: output.proof
            }
            return envelope
        } catch (e) {
            // Handle any errors that occurred
            // Note: Test this!
            console.error(`Error retrieving UTXO history: ${e}`)
            // return []
            throw new Error(`Error retrieving UTXO history: ${e}`)
        }
    }

    /**
      * Delete a UTXO and all stale consumed inputs
      * @param output 
      * @param id 
      * @param txid 
      * @param outputIndex 
      * @returns {Promise<void>}
      */
    private async deleteUTXODeep(output: Output, id?: number, txid?: string, outputIndex?: number): Promise<void> {
        try {
            let foundOutput: Output | undefined = output
            if (!foundOutput) {
                if (txid && outputIndex !== undefined) [foundOutput] = await this.storage.findUTXO(txid, outputIndex)
                else if (id) [foundOutput] = await this.storage.findUTXOById(id)
                else { throw new ERR_CONF_UTXO_NOT_FOUND() }
            }

            // Parse out the stringified consumed data
            const utxosConsumed: number[] = [...new Set(JSON.parse(foundOutput.utxosConsumed!))] as number[]
            const consumedBy: number[] = [...new Set(JSON.parse(foundOutput.consumedBy!))] as number[]

            // Delete the current output IFF there are no references to it
            if (consumedBy.length === 0) {
                await this.storage.deleteUTXOById(foundOutput.id!)

                // Notify the lookup services of the UTXO being deleted
                for (const l of Object.values(this.lookupServices)) {
                    try {
                        await l.outputDeleted?.({
                            txid: foundOutput.txid,
                            outputIndex: foundOutput.outputIndex,
                            topic: foundOutput.topic!
                        })
                    } catch (_) { }
                }
            }

            // If there are no more consumed utxos, return
            if (utxosConsumed.length === 0) {
                return
            }

            // Delete any stale outputs that were consumed as inputs
            utxosConsumed.map(async (id) => {
                const [staleOutput]: Output[] = await this.storage.findUTXOById(id)

                // Make sure an output was found
                if (!staleOutput) {
                    return undefined
                }

                // Parse out the existing data, then concat the new outputs with no duplicates
                let consumedBy: number[] = JSON.parse(staleOutput.consumedBy!) as number[]
                if (consumedBy.length !== 0) {
                    consumedBy = consumedBy.filter(x => x !== foundOutput!.id)
                    // Update with the new consumedBy data
                    const consumedBystring = JSON.stringify(consumedBy)
                    await this.storage.updateConsumedBy(id, consumedBystring)
                    // Updated the current state to mach update
                    staleOutput.consumedBy = consumedBystring
                }

                // Find previousUTXO history
                return await this.deleteUTXODeep(staleOutput)
            })

        } catch (error) {
            throw new ERR_BAD_REQUEST(`Failed to delete all stale outputs: ${error}`)
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
    async getDocumentationForTopicManger(manager: any): Promise<string> {
        return this.managers[manager].getDocumentation?.() || 'No documentation found!'
    }

    /**
     * Run a query to get the documentation for a particular lookup service
     * @public
     * @returns {Promise<string>} -  the documentation for the lookup service
     */
    async getDocumentationForLookupServiceProvider(provider: any): Promise<string> {
        return this.lookupServices[provider].getDocumentation?.() || 'No documentation found!'
    }
}
