/**
 * Tagged BEEF
 *
 * @description
 * Tagged BEEF ([Background Evaluation Extended Format](https://brc.dev/62)) structure. Comprises a transaction, its SPV information, and the overlay topics where its inclusion is requested.
 */
export type TaggedBEEF = {
  beef: number[]
  topics: string[]
}
