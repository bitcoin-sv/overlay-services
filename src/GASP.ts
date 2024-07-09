import { Transaction } from '@bsv/sdk'

/**
 * Represents the initial request made under the Graph Aware Sync Protocol.
 */
export type GASPInitialRequest = {
  /** GASP version. Currently 1. */
  version: number
  /** An optional timestamp (UNIX-1970-seconds) of the last time these two parties synced */
  since: number
}

/**
 * Represents the initial response made under the Graph Aware Sync Protocol.
 */
export type GASPInitialResponse = {
  /** A list of outputs witnessed by the recipient since the initial request's timestamp. If not provided, a complete list of outputs since the beginning of time is returned. Unconfirmed (non-timestamped) UTXOs are always returned. */
  UTXOList: Array<{ txid: string, outputIndex: number }>,
  /** A timestamp from when the responder wants to receive UTXOs in the other direction, back from the requester. */
  since: number
}

/** Represents the subsequent message sent in reply to the initial response. */
export type GASPInitialReply = {
  /** A list of outputs (excluding outputs received from the Initial Response), and ONLY after the timestamp from the initial response. We don't need to send back things from the initial response, since those were already seen by the counterparty. */
  UTXOList: Array<{ txid: string, outputIndex: number }>,
}

/**
 * Represents an output, its encompassing transaction, and the associated metadata, together with references to inputs and their metadata.
 */
export type GASPNode = {
  /** The graph ID comprises the currently spendable outpoint that is the subject to the graph to which this node belongs. */
  graphID: string
  /** The Bitcoin transaction in rawTX format. */
  rawTx: string
  /** The index of the output in the transaction. */
  outputIndex: number
  /** A BUMP proof for the transaction, if it is in a block. */
  proof?: string
  /** Metadata associated with the transaction, if it was requested. */
  txMetadata?: string
  /** Metadata associated with the output, if it was requested. */
  outputMetadata?: string
  /** A mapping of transaction inputs, given as an outpoint, to metadata hashes, if metadata was requested. */
  inputs?: Record<string, { hash: string }>
}

/**
 * Denotes which input transactions are requested, and whether metadata needs to be sent.
 */
export type GASPNodeResponse = {
  requestedInputs: Record<string, { metadata: boolean }>
}

/**
 * Facilitates the finding of UTXOs, determination of needed inputs, temporary graph management, and eventual graph finalization.
 */
export interface GASPStorage {
  /**
   * Returns an array of transaction outpoints that are currently known to be unspent (given an optional timestamp).
   * Non-confirmed (non-timestamped) outputs should always be returned, regardless of the timestamp.
   * @returns A promise for an array of objects, each containing txid and outputIndex properties.
   */
  findKnownUTXOs: (since: number) => Promise<Array<{ txid: string, outputIndex: number }>>
  /**
   * For a given txid and output index, returns the associated transaction, a merkle proof if the transaction is in a block, and metadata if if requested. If no metadata is requested, metadata hashes on inputs are not returned.
   * @param txid The transaction ID for the node to hydrate.
   * @param outputIndex The output index for the node to hydrate.
   * @param metadata Whether transaction and output metadata should be returned.
   * @returns The hydrated GASP node, with or without metadata.
   */
  hydrateGASPNode: (graphID: string, txid: string, outputIndex: number, metadata: boolean) => Promise<GASPNode>
  /**
   * For a given node, returns the inputs needed to complete the graph, including whether updated metadata is requested for those inputs.
   * @param tx The node for which needed inputs should be found.
   * @returns A promise for a mapping of requested input transactions and whether metadata should be provided for each.
  */
  findNeededInputs: (tx: GASPNode) => Promise<GASPNodeResponse | void>
  /**
   * Appends a new node to a temporary graph.
   * @param tx The node to append to this graph.
   * @param spentBy Unless this is the same node identified by the graph ID, denotes the TXID and input index for the node which spent this one, in 36-byte format.
   * @throws If the node cannot be appended to the graph, either because the graph ID is for a graph the recipient does not want or because the graph has grown to be too large before being finalized.
  */
  appendToGraph: (tx: GASPNode, spentBy?: string) => Promise<void>
  /**
   * Checks whether the given graph, in its current state, makes reference only to transactions that are proven in the blockchain, or already known by the recipient to be valid.
   * @param graphID The TXID and output index (in 36-byte format) for the UTXO at the tip of this graph.
   * @throws If the graph is not well-anchored.
   */
  validateGraphAnchor: (graphID: string) => Promise<void>
  /**
   * Deletes all data associated with a temporary graph that has failed to sync, if the graph exists.
   * @param graphID The TXID and output index (in 36-byte format) for the UTXO at the tip of this graph.
   */
  discardGraph: (graphID: string) => Promise<void>
  /**
   * Finalizes a graph, solidifying the new UTXO and its ancestors so that it will appear in the list of known UTXOs.
   * @param graphID The TXID and output index (in 36-byte format) for the UTXO at the tip of this graph.
   */
  finalizeGraph: (graphID: string) => Promise<void>
}

/**
 * The communications mechanism between a local GASP instance and a foreign GASP instance.
 */
export interface GASPRemote {
  /** Given an outgoing initial request, send the request to the foreign instance and obtain their initial response. */
  getInitialResponse: (request: GASPInitialRequest) => Promise<GASPInitialResponse>
  /** Given an outgoing initial response, obtain the reply from the foreign instance. */
  getInitialReply?: (response: GASPInitialResponse) => Promise<GASPInitialReply>
  /** Given an outgoing txid, outputIndex and optional metadata, request the associated GASP node from the foreign instance. */
  requestNode: (graphID: string, txid: string, outputIndex: number, metadata: boolean) => Promise<GASPNode>
  /** Given an outgoing node, send the node to the foreign instance and determine which additional inputs (if any) they request in response. */
  submitNode?: (node: GASPNode) => Promise<GASPNodeResponse | void>
}

export class GASPVersionMismatchError extends Error {
  code: 'ERR_GASP_VERSION_MISMATCH'
  currentVersion: number
  foreignVersion: number

  constructor(message: string, currentVersion: number, foreignVersion: number) {
    super(message)
    this.code = 'ERR_GASP_VERSION_MISMATCH'
    this.currentVersion = currentVersion
    this.foreignVersion = foreignVersion
  }
}

/**
 * Main class implementing the Graph Aware Sync Protocol.
 */
export class GASP implements GASPRemote {
  version: number
  storage: GASPStorage
  remote: GASPRemote
  lastInteraction: number
  logPrefix: string
  log: boolean

  /**
   * 
   * @param storage The GASP Storage interface to use
   * @param remote The GASP Remote interface to use
   * @param lastInteraction The timestamp when we last interacted with this remote party
   */
  constructor(storage: GASPStorage, remote: GASPRemote, lastInteraction = 0, logPrefix = '[GASP] ', log = false) {
    this.storage = storage
    this.remote = remote
    this.lastInteraction = lastInteraction
    this.version = 1
    this.logPrefix = logPrefix
    this.log = log
    this.validateTimestamp(this.lastInteraction)
    this.logData(`GASP initialized with version: ${this.version}, lastInteraction: ${this.lastInteraction}`)
  }

  private logData(...data: any): void {
    if (this.log) {
      console.log(this.logPrefix, ...data)
    }
  }

  private validateTimestamp(timestamp: number): void {
    if (typeof timestamp !== 'number' || isNaN(timestamp) || timestamp < 0 || !Number.isInteger(timestamp)) {
      throw new Error('Invalid timestamp format')
    }
  }

  /**
   * Computes a 36-byte structure from a transaction ID and output index.
   * @param txid The transaction ID.
   * @param index The output index.
   * @returns A string representing the 36-byte structure.
   */
  private compute36ByteStructure(txid: string, index: number): string {
    const result = `${txid}.${index.toString()}`
    this.logData(`Computed 36-byte structure: ${result} from txid: ${txid}, index: ${index}`)
    return result
  }

  /**
   * Deconstructs a 36-byte structure into a transaction ID and output index.
   * @param outpoint The 36-byte structure.
   * @returns An object containing the transaction ID and output index.
   */
  private deconstruct36ByteStructure(outpoint: string): { txid: string, outputIndex: number } {
    const [txid, index] = outpoint.split('.')
    const result = {
      txid,
      outputIndex: parseInt(index, 10)
    }
    this.logData(`Deconstructed 36-byte structure: ${outpoint} into txid: ${txid}, outputIndex: ${result.outputIndex}`)
    return result
  }

  /**
   * Computes the transaction ID for a given transaction.
   * @param tx The transaction string.
     * @returns The computed transaction ID.
     */
  private computeTXID(tx: string): string {
    const txid = Transaction.fromHex(tx).id('hex')
    this.logData(`Computed TXID: ${txid} from transaction: ${tx}`)
    return txid
  }

  /**
   * Synchronizes the transaction data between the local and remote participants.
   * TODO: Support stipulating upload, download, or bidirectional which should be default.
   */
  async sync(): Promise<void> {
    this.logData(`Starting sync process. Last interaction timestamp: ${this.lastInteraction}`)
    debugger
    const initialRequest = await this.buildInitialRequest(this.lastInteraction)
    const initialResponse = await this.remote.getInitialResponse(initialRequest)
    if (initialResponse.UTXOList.length > 0) {
      const foreignUTXOs = await this.storage.findKnownUTXOs(0)
      await Promise.all(initialResponse.UTXOList
        .filter(x => !foreignUTXOs.some(y => x.txid === y.txid && x.outputIndex === y.outputIndex))
        .map(async UTXO => {
          try {
            this.logData(`Requesting node for UTXO: ${JSON.stringify(UTXO)}`)
            const resolvedNode = await this.remote.requestNode(
              this.compute36ByteStructure(UTXO.txid, UTXO.outputIndex),
              UTXO.txid,
              UTXO.outputIndex,
              true
            )
            this.logData(`Received unspent graph node from remote: ${JSON.stringify(resolvedNode)}`)
            await this.processIncomingNode(resolvedNode)
            await this.completeGraph(resolvedNode.graphID)
          } catch (e) {
            this.logData(`Error with incoming UTXO ${UTXO.txid}.${UTXO.outputIndex}: ${(e as Error).message}`)
          }
        })
      )
    }

    // const initialReply = await this.getInitialReply(initialResponse)
    // this.logData(`Received initial reply: ${JSON.stringify(initialReply)}`)

    // if (initialReply.UTXOList.length > 0) {
    //   await Promise.all(initialReply.UTXOList.map(async UTXO => {
    //     try {
    //       this.logData(`Hydrating GASP node for UTXO: ${JSON.stringify(UTXO)}`)
    //       const outgoingNode = await this.storage.hydrateGASPNode(
    //         this.compute36ByteStructure(UTXO.txid, UTXO.outputIndex),
    //         UTXO.txid,
    //         UTXO.outputIndex,
    //         true
    //       )
    //       this.logData(`Sending unspent graph node for remote: ${JSON.stringify(outgoingNode)}`)
    //       await this.processOutgoingNode(outgoingNode)
    //     } catch (e) {
    //       this.logData(`Error with outgoing UTXO ${UTXO.txid}.${UTXO.outputIndex}: ${(e as Error).message}`)
    //     }
    //   }))
    // }
    this.logData('Sync completed!')
  }

  /**
  * Builds the initial request for the sync process.
  * @returns A promise for the initial request object.
  */
  async buildInitialRequest(since: number): Promise<GASPInitialRequest> {
    const request = {
      version: this.version,
      since
    }
    this.logData(`Built initial request: ${JSON.stringify(request)}`)
    return request
  }

  /**
   * Builds the initial response based on the received request.
   * @param request The initial request object.
   * @returns A promise for an initial response
   */
  async getInitialResponse(request: GASPInitialRequest): Promise<GASPInitialResponse> {
    this.logData(`Received initial request: ${JSON.stringify(request)}`)
    if (request.version !== this.version) {
      const error = new GASPVersionMismatchError(
        `GASP version mismatch. Current version: ${this.version}, foreign version: ${request.version}`,
        this.version,
        request.version
      )
      console.error(`GASP version mismatch error: ${error.message}`)
      throw error
    }
    this.validateTimestamp(request.since)
    const response = {
      since: this.lastInteraction,
      UTXOList: await this.storage.findKnownUTXOs(request.since)
    }
    this.logData(`Built initial response: ${JSON.stringify(response)}`)
    return response
  }

  /**
   * Builds the initial reply based on the received response.
   * @param response The initial response object.
   * @returns A promise for an initial reply
   */
  async getInitialReply(response: GASPInitialResponse): Promise<GASPInitialReply> {
    this.logData(`Received initial response: ${JSON.stringify(response)}`)
    const knownUTXOs = await this.storage.findKnownUTXOs(response.since)
    const filteredUTXOs = knownUTXOs.filter(x => !response.UTXOList.some(y => y.txid === x.txid && y.outputIndex === x.outputIndex))
    const reply = {
      UTXOList: filteredUTXOs
    }
    this.logData(`Built initial reply: ${JSON.stringify(reply)}`)
    return reply
  }

  /**
   * Provides a requested node to a foreign instance who requested it.
   */
  async requestNode(graphID: string, txid: string, outputIndex: number, metadata: boolean): Promise<GASPNode> {
    this.logData(`Remote is requesting node with graphID: ${graphID}, txid: ${txid}, outputIndex: ${outputIndex}, metadata: ${metadata}`)
    const node = await this.storage.hydrateGASPNode(graphID, txid, outputIndex, metadata)
    this.logData(`Returning node: ${JSON.stringify(node)}`)
    return node
  }

  /**
   * Provides a set of inputs we care about after processing a new incoming node.
   * Also finalizes or discards a graph if no additional data is requested from the foreign instance.
   */
  async submitNode(node: GASPNode): Promise<GASPNodeResponse | void> {
    this.logData(`Remote party is submitting node: ${JSON.stringify(node)}`)
    await this.storage.appendToGraph(node)
    const requestedInputs = await this.storage.findNeededInputs(node)
    this.logData(`Requested inputs: ${JSON.stringify(requestedInputs)}`)
    if (!requestedInputs) {
      await this.completeGraph(node.graphID)
    }
    return requestedInputs
  }

  /**
   * Handles the completion of a newly-synced graph
   * @param {string} graphID The ID of the newly-synced graph
   */
  async completeGraph(graphID: string): Promise<void> {
    this.logData(`Completing newly-synced graph: ${graphID}`)
    try {
      await this.storage.validateGraphAnchor(graphID)
      this.logData(`Graph validated for node: ${graphID}`)
      await this.storage.finalizeGraph(graphID)
      this.logData(`Graph finalized for node: ${graphID}`)
    } catch (e) {
      this.logData(`Error validating graph: ${(e as Error).message}. Discarding graph for node: ${graphID}`)
      await this.storage.discardGraph(graphID)
    }
  }

  /**
   * Processes an incoming node from the remote participant.
   * @param node The incoming GASP node.
   * @param spentBy The 36-byte structure of the node that spent this one, if applicable.
   */
  private async processIncomingNode(node: GASPNode, spentBy?: string, seenNodes = new Set()): Promise<void> {
    const nodeId = `${this.computeTXID(node.rawTx)}.${node.outputIndex}`
    this.logData(`Processing incoming node: ${JSON.stringify(node)}, spentBy: ${spentBy}`)
    if (seenNodes.has(nodeId)) {
      this.logData(`Node ${nodeId} already processed, skipping.`)
      return // Prevent infinite recursion
    }
    seenNodes.add(nodeId)
    await this.storage.appendToGraph(node, spentBy)
    const neededInputs = await this.storage.findNeededInputs(node)
    this.logData(`Needed inputs for node ${nodeId}: ${JSON.stringify(neededInputs)}`)
    if (neededInputs) {
      await Promise.all(Object.entries(neededInputs.requestedInputs).map(async ([outpoint, { metadata }]) => {
        const { txid, outputIndex } = this.deconstruct36ByteStructure(outpoint)
        this.logData(`Requesting new node for txid: ${txid}, outputIndex: ${outputIndex}, metadata: ${metadata}`)
        const newNode = await this.remote.requestNode(node.graphID, txid, outputIndex, metadata)
        this.logData(`Received new node: ${JSON.stringify(newNode)}`)
        await this.processIncomingNode(newNode, this.compute36ByteStructure(this.computeTXID(node.rawTx), node.outputIndex), seenNodes)
      }))
    }
  }

  /**
   * Processes an outgoing node to the remote participant.
   * @param node The outgoing GASP node.
   */
  private async processOutgoingNode(node: GASPNode, seenNodes = new Set()): Promise<void> {
    const nodeId = `${this.computeTXID(node.rawTx)}.${node.outputIndex}`
    this.logData(`Processing outgoing node: ${JSON.stringify(node)}`)
    if (seenNodes.has(nodeId)) {
      this.logData(`Node ${nodeId} already processed, skipping.`)
      return // Prevent infinite recursion
    }
    seenNodes.add(nodeId)
    if (this.remote.submitNode === undefined) {
      throw new Error('Remote does not support GASP node submission!')
    }
    const response = await this.remote.submitNode(node)
    this.logData(`Received response for submitted node: ${JSON.stringify(response)}`)
    if (response) {
      await Promise.all(Object.entries(response.requestedInputs).map(async ([outpoint, { metadata }]) => {
        const { txid, outputIndex } = this.deconstruct36ByteStructure(outpoint)
        try {
          this.logData(`Hydrating node for txid: ${txid}, outputIndex: ${outputIndex}, metadata: ${metadata}`)
          const hydratedNode = await this.storage.hydrateGASPNode(node.graphID, txid, outputIndex, metadata)
          this.logData(`Hydrated node: ${JSON.stringify(hydratedNode)}`)
          await this.processOutgoingNode(hydratedNode, seenNodes)
        } catch (e) {
          this.logData(`Error hydrating node: ${(e as Error).message}`)
          // If we can't send the outgoing node, we just stop. The remote won't validate the anchor, and their temporary graph will be discarded.
          return
        }
      }))
    }
  }
}
