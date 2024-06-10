/**
 * The question asked to the Overlay Services Engine when a consumer of state wishes to look up information.
 */
export type LookupQuestion = {
  /**
   * The identifier for a Lookup Service which the person asking the question wishes to use.
   */
  service: string

  /**
   * The query which will be forwarded to the Lookup Service.
   * Its type depends on that prescribed by the Lookup Service employed.
   */
  query: unknown
}
