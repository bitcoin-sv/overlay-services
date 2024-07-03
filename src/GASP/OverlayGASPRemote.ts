import { GASPInitialRequest, GASPInitialResponse, GASPNode, GASPRemote } from '@bsv/gasp'

export class OverlayGASPRemote implements GASPRemote {
  constructor(public endpointURL: string) { }

  /**
   * Given an outgoing initial request, sends the request to the foreign instance and obtains their initial response.
   * @param request
   * @returns
   */
  async getInitialResponse(request: GASPInitialRequest): Promise<GASPInitialResponse> {
    // Send out an HTTP request to the URL (current host for topic)
    // Include the topic in the request
    // Parse out response and return correct format
    const url = `${this.endpointURL}/requestSyncResponse` // TODO: Verify endpoint name
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    })

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`)
    }

    const result: GASPInitialResponse = await response.json()

    // Validate and return the response in the correct format
    if (!Array.isArray(result.UTXOList) || typeof result.since !== 'number') {
      throw new Error('Invalid response format')
    }

    return {
      UTXOList: result.UTXOList.map((utxo: any) => ({
        txid: utxo.txid,
        outputIndex: utxo.outputIndex
      })),
      since: result.since
    }
  }

  /**
   * Given an outgoing txid, outputIndex and optional metadata, request the associated GASP node from the foreign instance.
   * @param graphID
   * @param txid
   * @param outputIndex
   * @param metadata
   * @returns
   */
  async requestNode(graphID: string, txid: string, outputIndex: number, metadata: boolean): Promise<GASPNode> {
    // Send an HTTP request with the provided info and get back a gaspNode
    const url = `${this.endpointURL}/requestForeignGASPNode` // Assuming the endpoint is /node, adjust as needed
    const body = {
      graphID,
      txid,
      outputIndex,
      metadata
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`)
    }

    const result = await response.json()

    // Validate and return the response in the correct format
    if (typeof result.graphID !== 'string' || typeof result.rawTx !== 'string' || typeof result.outputIndex !== 'number') {
      throw new Error('Invalid response format')
    }

    const gaspNode: GASPNode = {
      graphID: result.graphID,
      rawTx: result.rawTx,
      outputIndex: result.outputIndex,
      proof: result.proof,
      txMetadata: result.txMetadata,
      outputMetadata: result.outputMetadata,
      inputs: result.inputs
    }

    return gaspNode
  }

  // ---- Now optional methods ----

  // When are only syncing to them
  // async getInitialReply(response: GASPInitialResponse): Promise<GASPInitialReply> {
  //   return { UTXOList: [] }
  // }

  // Only used when supporting bidirectional sync.
  // Overlay services does not support this.
  // async submitNode(node: GASPNode): Promise<void | GASPNodeResponse> { }
}
