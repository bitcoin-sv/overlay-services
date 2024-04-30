import { AdmittanceInstructions } from './AdmittanceInstructions.js'

/**
 * Defines a Topic Manager interface that can be implemented for specific use-cases
 */
export default interface TopicManager {
    /**
     * Returns instructions that denote which outputs from the provided transaction to admit into the topic, and which previous coins should be retained.
     * Accepts the transaction in BEEF format and an array of those input indicies which spend previously-admitted outputs from the same topic.
     * The transaction's BEEF structure will always contain the transactions associated with previous coins for reference (if any), regardless of whether the current transaction was directly proven.
     */
    identifyAdmissibleOutputs(beef: number[], previousCoins: number[]): Promise<AdmittanceInstructions>

    /**
    * Returns a Markdown-formatted documentation string for the topic manager.
    */
    getDocumentation(): Promise<string>

    /**
     * Returns a metadata object that can be used to identify the topic manager.
     */
    getMetaData(): Promise<{ name: string, shortDescription: string, iconURL?: string, version?: string, informationURL?: string }>
}
