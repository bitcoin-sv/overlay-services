/**
 * Submitted Transaction Execution AcKnowledgment
 *
 * @description
 * Comprises the topics where a transaction was submitted, and for each one, the output indecies for the UTXOs newly admitted into the topics.
 */
export default interface TaggedBEEF {
  topics: Record<string, number[]>
}
