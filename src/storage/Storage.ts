
/**
 * Defines the Storage Engine interface used internally by the Overlay Services Engine.
 */
export default interface ConfederacyStorageEngine {
    /**
     * Adds a new UTXO to the storage medium
     * @param utxo
     */
    addUTXO(
        utxo: Output,
    ): Promise<number>

    /**
     * Gets a UTXO from the storage medium
     * @param txid 
     * @param outputIndex 
     * @param topic 
     */
    findUTXO(txid: string, outputIndex: number, topic?: string, spent?: boolean): Promise<Output[]>

    /**
     * Gets a UTXO from the storage medium
     * @param {number} id - reference the unique data in the database
     */
    findUTXOById(id: number): Promise<Output[]>

    /**
     * Deletes a UTXO from the storage medium
     * @param txid 
     * @param outputIndex 
     * @param topic 
     */
    deleteUTXO(txid: string, outputIndex: number, topic: string): Promise<void>

    /**
 * Deletes a UTXO from the storage medium by id
 * @param id
 */
    deleteUTXOById(id: number): Promise<void>

    /**
    * Updates a UTXO as spent
    * @param txid 
    * @param outputIndex 
    * @param topic 
    */
    markUTXOAsSpent(txid: string, outputIndex: number, topic: string): Promise<void>

    /**
    * Updates the consumedBy field
    * @param id
    * @param consumedBy
    */
    updateConsumedBy(id: number, consumedBy: string): Promise<void>

    /**
     * Inserts record of the applied transaction
     * @param txid 
     * @param topic 
     */
    insertAppliedTransaction(txid: string, topic: string): Promise<void>

    /**
     * Checks if a duplicate transaction exists
     * @param txid 
     * @param topic 
     */
    findAppliedTransaction(txid: string, topic: string): Promise<object>
}