import { LookupQuestion } from './LookupQuestion.js'
import { LookupFormula } from './LookupFormula.js'
import { LookupAnswer } from './LookupAnswer.js'
import { Script } from '@bsv/sdk'

/**
 * Defines a Lookup Service interface to be implemented for specific use-cases
 */
export default interface LookupService {

    /**
     * Process the event when a new UTXO is let into a topic
     * @param txid 
     * @param outputIndex 
     * @param outputScript 
     * @param topic 
     */
    outputAdded?(txid: string, outputIndex: number, outputScript: Script, topic: string): Promise<void>

    /**
     * Process the spend event for a UTXO
     * @param txid 
     * @param outputIndex 
     * @param topic 
     */
    outputSpent?(txid: string, outputIndex: number, topic: string): Promise<void>

    /**
   * Process the deletion event for a UTXO
   * @param txid 
   * @param outputIndex 
   * @param topic 
   */
    outputDeleted?(txid: string, outputIndex: number, topic: string): Promise<void>

    /**
     * Queries the lookup service for information
     * @param question — The question to be answered by the lookup service
     * @returns — The Lookup Answer or Lookup Formula used to answer the question
     */
    lookup(question: LookupQuestion): Promise<LookupAnswer | LookupFormula>

    /**
     * Returns a Markdown-formatted documentation string for the lookup service.
     */
    getDocumentation(): Promise<string>

    /**
     * Returns a metadata object that can be used to identify the lookup service.
     */
    getMetaData(): Promise<{ name: string, shortDescription: string, iconURL?: string, version?: string, informationURL?: string }>
}
