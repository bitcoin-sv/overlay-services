import { AdmittanceInstructions } from "./AdmittanceInstructions.js"

/**
 * Submitted Transaction Execution AcKnowledgment
 *
 * @description
 * Comprises the topics where a transaction was submitted, and for each one, the output indecies for the UTXOs newly admitted into the topics, and the coins retained.
 * An object whose keys are topic names and whose values are topical admittance instructions denoting the state of the submitted transaction with respect to the associated topic.
 */
export type STEAK = Record<string, AdmittanceInstructions>