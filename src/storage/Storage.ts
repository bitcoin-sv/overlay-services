import type { Output } from '../Output.js'

/**
 * Representa a transaction that has been applied to a topic.
 */
type AppliedTransaction = {
    /** TXID of the applied transaction */
    txid: string
    /** Output index of the applied transaction */
    topic: string
}

/**
 * Defines the Storage Engine interface used internally by the Overlay Services Engine.
 */
export default interface Storage {
    /**
     * Adds a new output to storage
     * @param utxo — The output to add
     */
    insertOutput(utxo: Output): Promise<void>

    /**
     * Finds an output from storage
     * @param txid — TXID of hte output to find
     * @param outputIndex — Output index for the output to find
     * @param topic — The topic in which the output is stored
     * @param spent — Whether the output must be spent to be returned
     */
    findOutput(txid: string, outputIndex: number, topic?: string, spent?: boolean): Promise<Output | null>

    /**
     * Deletes an output from storage
     * @param txid — The TXID of the output to delete
     * @param outputIndex — The index of the output to delete
     * @param topic — The topic where the output should be deleted
     */
    deleteOutput(txid: string, outputIndex: number, topic: string): Promise<void>

    /**
    * Updates a UTXO as spent
    * @param txid — TXID of the output to update
    * @param outputIndex — Index of the output to update
    * @param topic — Topic in which the output should be updated
    */
    markUTXOAsSpent(txid: string, outputIndex: number, topic: string): Promise<void>

    /**
    * Updates which outputs are consumed by this output
    * @param txid — TXID of the output to update
    * @param outputIndex — Index of the output to update
    * @param topic — Topic in which the output should be updated
    * @param consumedBy — The new set of outputs consumed by this output
    */
    updateConsumedBy(txid: string, outputIndex: number, topic: string, consumedBy: {
        txid: string
        outputIndex: number
    }[]): Promise<void>

    /**
     * Inserts record of the applied transaction
     * @param tx — The transaction to insert
     */
    insertAppliedTransaction(tx: AppliedTransaction): Promise<void>

    /**
     * Checks if a duplicate transaction exists
     * @param tx — Transaction to check
     * @returns Whether the transaction is already applied
     */
    doesAppliedTransactionExist(tx: AppliedTransaction): Promise<boolean>
}
