/**
 * Represents an output to be tracked by the Overlay Services Engine
 */
export type Output = {
  /** TXID of the output */
  txid: string
  /** index of the output */
  outputIndex: number
  /** script of the output */
  outputScript: number[]
  /** number of satoshis in the output */
  satoshis: number
  /** topic to which the output belongs */
  topic: string
  /** Whether the output is spent */
  spent: boolean
  /** Outputs consumed by the transaction associated with the output */
  outputsConsumed: Array<{
    txid: string
    outputIndex: number
  }>
  /** Outputs consuming this output */
  consumedBy: Array<{
    txid: string
    outputIndex: number
  }>
  /** The transaction data for the output */
  beef?: number[]
  blockHeight?: number
}
