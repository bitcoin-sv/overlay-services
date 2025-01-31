import { LookupFormula } from './LookupFormula.js'
import { LookupQuestion, LookupAnswer, Script } from '@bsv/sdk'
import { TransactionContext } from './TransactionContext.js'

/**
 * Defines a Lookup Service interface to be implemented for specific use-cases
 */
export interface LookupService {

  /**
   * Process the event when a new UTXO is let into a topic
   * @param txid - The transaction ID (TXID) of the transaction where the new UTXO resides.
   * @param outputIndex - The index of the transaction output (UTXO) within the transaction.
   * @param outputScript - The script associated with the transaction output.
   * @param topic - The topic to which the new UTXO is being added.
   * @returns A promise that resolves when the processing of the new UTXO is complete.
   */
  outputAdded?: (txid: string, outputIndex: number, outputScript: Script, topic: string) => Promise<void>
  outputAddedExtended?: (ctx: TransactionContext, outputIndex: number, topic: string) => Promise<void>

  /**
   * Processes the spend event for a UTXO.
   *
   * @param txid - The transaction ID of the spent UTXO.
   * @param outputIndex - The index of the transaction output that was spent.
   * @param topic - The topic from which the UTXO was spent.
   *
   * @returns A promise that resolves when processing is complete.
   */
  outputSpent?: (txid: string, outputIndex: number, topic: string) => Promise<void>
  outputSpentExtended?: (ctx: TransactionContext, inputIndex: number, topic: string) => Promise<void>

  /**
   * Processes the deletion event for a UTXO.
   *
   * @param txid - The transaction ID of the deleted UTXO.
   * @param outputIndex - The index of the transaction output that was deleted.
   * @param topic - The topic from which the UTXO was deleted.
   *
   * @returns A promise that resolves when processing is complete.
   */
  outputDeleted?: (txid: string, outputIndex: number, topic: string) => Promise<void>

  /**
   * Queries the lookup service for information
   * @param question — The question to be answered by the lookup service
   * @returns — The Lookup Answer or Lookup Formula used to answer the question
   */
  lookup: (question: LookupQuestion) => Promise<LookupAnswer | LookupFormula>

  /**
   * Returns a Markdown-formatted documentation string for the lookup service.
   *
   * @returns A promise that resolves to a documentation string.
   */
  getDocumentation: () => Promise<string>

  /**
   * Returns a metadata object that can be used to identify the lookup service.
   *
   * @returns A promise that resolves to a metadata object containing the name, short description,
   *          and optional properties such as icon URL, version, and information URL.
   */
  getMetaData: () => Promise<{
    name: string
    shortDescription: string
    iconURL?: string
    version?: string
    informationURL?: string
  }>
}
