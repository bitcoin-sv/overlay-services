import type { Output } from '../Output.js'

/**
 * Represents a transaction that has been applied to a topic.
 */
export interface AppliedTransaction {
  /** TXID of the applied transaction */
  txid: string
  /** Output index of the applied transaction */
  topic: string
}

/**
 * Defines the Storage Engine interface used internally by the Overlay Services Engine.
 */
export interface Storage {
  /**
   * Adds a new output to storage
   * @param utxo — The output to add
   */
  insertOutput: (utxo: Output) => Promise<void>

  /**
   * Finds an output from storage
   * @param txid — TXID of hte output to find
   * @param outputIndex — Output index for the output to find
   * @param topic — The topic in which the output is stored
   * @param spent — Whether the output must be spent to be returned
   */
  findOutput: (txid: string, outputIndex: number, topic?: string, spent?: boolean, includeBEEF?: boolean) => Promise<Output | null>

  /**
   * Finds outputs with a matching transaction ID from storage
   * @param txid — TXID of the outputs to find
   */
  findOutputsForTransaction: (txid: string, includeBEEF?: boolean) => Promise<Output[]>

  /**
   * Finds current UTXOs that have been admitted into a given topic
   * @param topic - The topic for which we want to find Unspent Transaction Outputs (UTXOs).
   * @param since - Optional parameter indicating the minimum date (timestamp? block height?) to retrieve matching UTXOs from. TODO: We need to decide about which time format to use for synchronization.
   * @returns A promise that resolves to an array of matching UTXOs.
   */
  findUTXOsForTopic: (topic: string, since?: number, includeBEEF?: boolean) => Promise<Output[]>

  /**
   * Deletes an output from storage
   * @param txid — The TXID of the output to delete
   * @param outputIndex — The index of the output to delete
   * @param topic — The topic where the output should be deleted
   */
  deleteOutput: (txid: string, outputIndex: number, topic: string) => Promise<void>

  /**
  * Updates a UTXO as spent
  * @param txid — TXID of the output to update
  * @param outputIndex — Index of the output to update
  * @param topic — Topic in which the output should be updated
  */
  markUTXOAsSpent: (txid: string, outputIndex: number, topic: string) => Promise<void>

  /**
  * Updates which outputs are consumed by this output
  * @param txid — TXID of the output to update
  * @param outputIndex — Index of the output to update
  * @param topic — Topic in which the output should be updated
  * @param consumedBy — The new set of outputs consumed by this output
  */
  updateConsumedBy: (txid: string, outputIndex: number, topic: string, consumedBy: Array<{
    txid: string
    outputIndex: number
  }>) => Promise<void>

  /**
   * Updates the beef data for a transaction
   * @param txid — TXID of the transaction to update
   * @param beef - BEEF data to update
   */
  updateTransactionBEEF: (txid: string, beef: number[]) => Promise<void>


  /**
   * Updates the block height on an output
   * @param txid — TXID of the output to update
   * @param outputIndex — Index of the output to update
   * @param topic— Topic in which the output should be updated
   * @param blockHeight - height of the block the transaction associated with this output was included in
   */
  updateOutputBlockHeight?: (txid: string, outputIndex: number, topic: string, blockHeight: number) => Promise<void>

  /**
   * Inserts record of the applied transaction
   * @param tx — The transaction to insert
   */
  insertAppliedTransaction: (tx: AppliedTransaction) => Promise<void>

  /**
   * Checks if a duplicate transaction exists
   * @param tx — Transaction to check
   * @returns Whether the transaction is already applied
   */
  doesAppliedTransactionExist: (tx: AppliedTransaction) => Promise<boolean>
}
