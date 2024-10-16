/**
 * How the Overlay Services Engine responds to a Lookup Question.
 * It may comprise either an output list or a freeform response from the Lookup Service.
 */
export type LookupAnswer = {
  type: 'output-list'
  outputs: Array<{
    beef: number[]
    outputIndex: number
    spent?: null | string
  }>
} | {
  type: 'freeform'
  result: unknown
}
