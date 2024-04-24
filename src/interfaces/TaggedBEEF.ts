/**
 * Tagged BEEF
 *
 * @description
 * Tagged BEEF ([Background-Evaluated Extended Format](https://brc.dev/74)) structure. Comprises a transaction, its SPV information, and the overlay topics where its inclusion is requested.
 */
export default interface TaggedBEEF {
  beef: number[]
  tags: string[]
}
