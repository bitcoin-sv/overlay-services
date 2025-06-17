/**
 * The formula that will be used by the Overlay Services Engine to compute the Lookup Answer. Can be returned by Lookup Services in response to a Lookup Question.
 */
export type LookupFormula = Array<{
  /**
   * TXID of the transaction where an output responsive to the Lookup Question resides.
   */
  txid: string

  /**
   * Index of the transaction output responsive to the Lookup Question.
   */
  outputIndex: number

  /**
   * Decides what history to incorporate into the Lookup Answer.
   *
   * Optionally directs the Overlay Services Engine as to the historical context (preceding outputs) to include as part of the Lookup Answer.
   * - If a number, denotes how many previous spends (in terms of chain depth) the Engine should include with the Answer.
   * - If a decider function, accepts a BEEF-formatted transaction, an output index and the current depth (relative to the top-level responsive UTXO) as parameters.
   *   The function returns a promise for a boolean indicating whether the output should be incorporated into the Lookup Answer.
   *   If so, the function will be called again for transactions that preceded the one provided, ultimately allowing the complete shape of the responsive spend history to be described.
   * If not provided, no historical information will be included with the Lookup Answer, except that which may incidentally be required to fully anchor the Lookup Answer to the blockchain.
   */
  history?: ((beef: number[], outputIndex: number, currentDepth: number) => Promise<boolean>) | number

  /**
   * Context for the UTXO, derived from the off-chain values.
   */
  context?: number[]
}>
