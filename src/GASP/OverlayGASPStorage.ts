import { GASPNode, GASPNodeResponse, GASPStorage } from '@bsv/gasp'
import { MerklePath, Transaction } from '@bsv/sdk'
import { Engine } from '../Engine.js'

/**
 * Represents a node in the temporary graph.
 */
export interface GraphNode {
  txid: string
  graphID: string
  rawTx: string
  outputIndex: number
  spentBy?: string
  proof?: string
  txMetadata?: string
  outputMetadata?: string
  inputs?: Record<string, { hash: string }> | undefined
  children: GraphNode[]
  parent?: GraphNode
}

export class OverlayGASPStorage implements GASPStorage {
  readonly temporaryGraphNodeRefs: Record<string, GraphNode> = {}

  constructor (public topic: string, public engine: Engine, public maxNodesInGraph?: number) { }

  /**
   *
   * @param since
   * @returns
   */
  async findKnownUTXOs (since: number): Promise<Array<{ txid: string, outputIndex: number }>> {
    const UTXOs = await this.engine.storage.findUTXOsForTopic(this.topic, since)
    return UTXOs.map(output => ({
      txid: output.txid,
      outputIndex: output.outputIndex
    }))
  }

  /**
   * For a given txid and output index, returns the associated transaction, a merkle proof if the transaction is in a block, and metadata if if requested. If no metadata is requested, metadata hashes on inputs are not returned.
   * @param graphID
   * @param txid
   * @param outputIndex
   * @param metadata
   * @returns
   */
  async hydrateGASPNode (graphID: string, txid: string, outputIndex: number, metadata: boolean): Promise<GASPNode> {
    const output = await this.engine.storage.findOutput(txid, outputIndex, undefined, undefined, true)

    if (output?.beef === undefined) {
      throw new Error('No matching output found!')
    }

    const tx = Transaction.fromBEEF(output.beef)
    const rawTx = tx.toHex()

    const node: GASPNode = {
      rawTx,
      graphID,
      outputIndex
    }
    if (tx.merklePath !== undefined) {
      node.proof = tx.merklePath.toHex()
    }

    return node
  }

  /**
  * For a given node, returns the inputs needed to complete the graph, including whether updated metadata is requested for those inputs.
  * @param tx The node for which needed inputs should be found.
  * @returns A promise for a mapping of requested input transactions and whether metadata should be provided for each.
  */
  async findNeededInputs (tx: GASPNode): Promise<GASPNodeResponse | undefined> {
    // If there is no Merkle proof, we always need the inputs
    const response: GASPNodeResponse = {
      requestedInputs: {}
    }
    const parsedTx = Transaction.fromHex(tx.rawTx)
    if (tx.proof === undefined) {
      for (const input of parsedTx.inputs) {
        response.requestedInputs[`${input.sourceTXID}.${input.sourceOutputIndex}`] = {
          metadata: false
        }
      }

      return await this.stripAlreadyKnownInputs(response)
    }

    // Attempt to check if the current transaction is admissible
    parsedTx.merklePath = MerklePath.fromHex(tx.proof)
    const admittanceResult = await this.engine.managers[this.topic].identifyAdmissibleOutputs(parsedTx.toBEEF(), [])

    if (admittanceResult.outputsToAdmit.includes(tx.outputIndex)) {
      // The transaction is admissible, no further inputs are needed
    } else {
      // The transaction is not admissible, get inputs needed for further verification
      // TopicManagers should implement a function to identify which inputs are needed.
      if (this.engine.managers[this.topic] !== undefined && typeof this.engine.managers[this.topic].identifyNeededInputs === 'function') {
        try {
          const neededInputs = await this.engine.managers[this.topic].identifyNeededInputs?.(parsedTx.toBEEF()) ?? []
          for (const input of neededInputs) {
            response.requestedInputs[`${input.txid}.${input.outputIndex}`] = {
              metadata: false
            }
          }
          return await this.stripAlreadyKnownInputs(response)
        } catch (e) {
          console.error(`An error occurred when identifying needed inputs for transaction: ${parsedTx.id('hex')}.${tx.outputIndex}!`)
          // Cut off the graph in case of an error here.
        }
      }
      // By default, if the topic manager isn't able to stipulate needed inputs, only the inputs necessary for SPV are requested.
    }
    // Everything else falls through to returning undefined/void, which will terminate the synchronization at this point.
  }

  /**
   * Ensures that no inputs are requested from foreign nodes before sending any GASP response
   * Also terminates graphs if the response would be empty.
   */
  private async stripAlreadyKnownInputs (response: GASPNodeResponse | undefined): Promise<GASPNodeResponse | undefined> {
    if (typeof response === 'undefined') {
      return response
    }
    for (const inputNodeId of Object.keys(response.requestedInputs)) {
      const [txid, outputIndex] = inputNodeId.split('.')
      const found = await this.engine.storage.findOutput(txid, Number(outputIndex), this.topic)
      if (found !== null && found !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete response.requestedInputs[inputNodeId]
      }
    }
    if (Object.keys(response.requestedInputs).length === 0) {
      return undefined
    }
    return response
  }

  /**
  * Appends a new node to a temporary graph.
  * @param tx The node to append to this graph.
  * @param spentBy Unless this is the same node identified by the graph ID, denotes the TXID and input index for the node which spent this one, in 36-byte format.
  * @throws If the node cannot be appended to the graph, either because the graph ID is for a graph the recipient does not want or because the graph has grown to be too large before being finalized.
  */
  async appendToGraph (tx: GASPNode, spentBy?: string | undefined): Promise<void> {
    if (this.maxNodesInGraph !== undefined && Object.keys(this.temporaryGraphNodeRefs).length >= this.maxNodesInGraph) {
      throw new Error('The max number of nodes in transaction graph has been reached!')
    }

    const parsedTx = Transaction.fromHex(tx.rawTx)
    const txid = parsedTx.id('hex')
    if (tx.proof !== undefined) {
      parsedTx.merklePath = MerklePath.fromHex(tx.proof)
    }

    // Given the passed in node, append to the temp graph
    // Use the spentBy param which should be a txid.inputIndex for the node which spent this one in 36-byte format
    const newGraphNode: GraphNode = {
      txid,
      graphID: tx.graphID,
      rawTx: tx.rawTx,
      outputIndex: tx.outputIndex,
      proof: tx.proof,
      txMetadata: tx.txMetadata,
      outputMetadata: tx.outputMetadata,
      inputs: tx.inputs,
      children: []
    }

    // If spentBy is undefined, then we know it's the root node.
    if (spentBy === undefined) {
      this.temporaryGraphNodeRefs[tx.graphID] = newGraphNode
    } else {
      // Find the parent node based on spentBy
      const parentNode = this.temporaryGraphNodeRefs[spentBy]

      if (parentNode !== undefined) {
        // Set parent-child relationship
        parentNode.children.push(newGraphNode)
        newGraphNode.parent = parentNode
        this.temporaryGraphNodeRefs[`${newGraphNode.txid}.${newGraphNode.outputIndex}`] = newGraphNode
      } else {
        throw new Error(`Parent node with GraphID ${spentBy} not found`)
      }
    }
  }

  /**
    * Checks whether the given graph, in its current state, makes reference only to transactions that are proven in the blockchain, or already known by the recipient to be valid.
    * Additionally, in a breadth-first manner (ensuring that all inputs for any given node are processed before nodes that spend them), it ensures that the root node remains valid according to the rules of the overlay's topic manager,
    * while considering any coins which the Manager had previously indicated were either valid or invalid.
    * @param graphID The TXID and output index (in 36-byte format) for the UTXO at the tip of this graph.
    * @throws If the graph is not well-anchored, according to the rules of Bitcoin or the rules of the Overlay Topic Manager.
    */
  async validateGraphAnchor (graphID: string): Promise<void> {
    const rootNode = this.temporaryGraphNodeRefs[graphID]
    if (rootNode === undefined) {
      throw new Error(`Graph node with ID ${graphID} not found`)
    }

    // Check that the root node is Bitcoin-valid.
    const beef = this.getBEEFForNode(rootNode)
    const spvTx = Transaction.fromBEEF(beef)
    const isBitcoinValid = await spvTx.verify(this.engine.chainTracker)
    if (!isBitcoinValid) {
      throw new Error('The graph is not well-anchored according to the rules of Bitcoin.')
    }

    // Then, ensure the node is Overlay-valid.
    const beefs = this.computeOrderedBEEFsForGraph(graphID)

    // coins: a Set of all historical coins to retain (no need to remove them), used to emulate topical admittance of previous inputs over time.
    const coins = new Set<string>()

    // Submit all historical BEEFs in order through the topic manager, tracking what would be retained until we submit the root node last.
    // If, at the end, the root node is admitted, we have a valid overlay-specific graph.
    for (const beef of beefs) {
      // For any input to this transaction, see if it's a valid coin that's admitted. If so, it's a previous coin.
      const previousCoins: number[] = []
      const tx = Transaction.fromBEEF(beef)
      for (const inputIndex in tx.inputs) {
        const input = tx.inputs[inputIndex]
        const sourceTXID = input.sourceTXID || input.sourceTransaction?.id('hex')
        const coin = `${sourceTXID}.${input.sourceOutputIndex}`
        if (coins.has(coin)) {
          previousCoins.push(Number(inputIndex))
        }
      }
      const admittanceInstructions = await this.engine.managers[this.topic].identifyAdmissibleOutputs(beef, previousCoins)
      // Every admitted output is now a coin.
      for (const outputIndex of admittanceInstructions.outputsToAdmit) {
        coins.add(`${tx.id('hex')}.${outputIndex}`)
      }
    }
    // After sending through all the graph's BEEFs...
    // If the root node is now a coin, we have acceptance by the overlay.
    // Otherwise, throw.
    if (!coins.has(graphID)) {
      throw new Error('This graph did not result in topical admittance of the root node. Rejecting.')
    }
  }

  /**
   * Deletes all data associated with a temporary graph that has failed to sync, if the graph exists.
   * @param graphID The TXID and output index (in 36-byte format) for the UTXO at the tip of this graph.
   */
  async discardGraph (graphID: string): Promise<void> {
    for (const [nodeId, graphRef] of Object.entries(this.temporaryGraphNodeRefs)) {
      if (graphRef.graphID === graphID) {
        // Delete child node
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this.temporaryGraphNodeRefs[nodeId]
      }
    }
  }

  /**
   * Finalizes a graph, solidifying the new UTXO and its ancestors so that it will appear in the list of known UTXOs.
   * @param graphID The TXID and output index (in 36-byte format) for the UTXO at the root of this graph.
   */
  async finalizeGraph (graphID: string): Promise<void> {
    const beefs = this.computeOrderedBEEFsForGraph(graphID)

    // Submit all historical BEEFs in order, finalizing the graph for the current UTXO
    for (const beef of beefs) {
      await this.engine.submit({
        beef,
        topics: [this.topic]
      }, () => { }, 'historical-tx')
    }
  }

  /**
   * Computes an ordered set of BEEFs for the graph with the given graph IDs
   * @param {string} graphID — The ID of the graph for which BEEFs are required
   * @returns Ordered BEEFs for the graph
   */
  private computeOrderedBEEFsForGraph (graphID: string): number[][] {
    const beefs: number[][] = []
    const hydrator = (node: GraphNode): void => {
      const currentBEEF = this.getBEEFForNode(node)
      if (!beefs.includes(currentBEEF)) {
        beefs.unshift(currentBEEF)
      }

      for (const child of node.children) {
        // Continue backwards to the earliest nodes, adding them onto the beginning
        hydrator(child)
      }
    }

    // Start the hydrator with the root node
    const foundRoot = this.temporaryGraphNodeRefs[graphID]
    if (!foundRoot) {
      throw new Error('Unable to find root node in graph for finalization!')
    }
    hydrator(foundRoot)
    return beefs
  }

  /**
   * Computes a full BEEF for a given graph node, based on the temporary graph store.
   * @param node Graph node for which BEEF is needed.
   * @returns BEEF array, including all proofs on inputs.
   */
  private getBEEFForNode (node: GraphNode): number[] {
    // Given a node, hydrate its merkle proof or all inputs, returning a reference to the hydrated node's Transaction object
    const hydrator = (node: GraphNode): Transaction => {
      const tx = Transaction.fromHex(node.rawTx)
      if (node.proof) {
        tx.merklePath = MerklePath.fromHex(node.proof)
        return tx // Transaction with proof, end of the line.
      }
      // For each input, look it up and recurse.
      for (const inputIndex in tx.inputs) {
        const input = tx.inputs[inputIndex]
        const foundNode = this.temporaryGraphNodeRefs[`${input.sourceTXID}.${input.sourceOutputIndex}`]
        if (!foundNode) {
          throw new Error('Required input node for unproven parent not found in temporary graph store. Ensure, for every parent of any given already-proven node (kept for Overlay-specific historical reasons), that a proof is also provided on those inputs. While implicitly they are valid by virtue of their descendents being proven in the blockchain, BEEF serialization will still fail when winding forward the topical UTXO set histories during sync.')
        }
        tx.inputs[inputIndex].sourceTransaction = hydrator(foundNode)
      }
      return tx
    }

    const finalTX = hydrator(node)
    return finalTX.toBEEF()
  }
}
