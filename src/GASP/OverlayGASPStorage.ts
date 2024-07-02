import { GASPNode, GASPNodeResponse, GASPStorage } from '@bsv/gasp'
import { MerklePath, Transaction } from '@bsv/sdk'
import { Engine } from 'mod.js'

/**
 * Represents a node in the temporary graph.
 */
interface GraphNode {
  txid: string
  time: number
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
  private readonly temporaryGraphNodeRefs: Record<string, GraphNode> = {}

  constructor(public topic: string, public engine: Engine, public maxNodesInGraph?: number) { }

  /**
   * 
   * @param since 
   * @returns 
   */
  async findKnownUTXOs(since: number): Promise<Array<{ txid: string, outputIndex: number }>> {
    const UTXOs = await this.engine.storage.findUTXOsForTopic(this.topic, since)
    return UTXOs.map(output => ({
      txid: output.txid,
      outputIndex: output.outputIndex
    }))
  }

  // TODO: Consider optionality on interface
  async hydrateGASPNode(graphID: string, txid: string, outputIndex: number, metadata: boolean): Promise<GASPNode> {
    throw new Error('GASP node hydration Not supported!')
  }

  /**
  * For a given node, returns the inputs needed to complete the graph, including whether updated metadata is requested for those inputs.
  * @param tx The node for which needed inputs should be found.
  * @returns A promise for a mapping of requested input transactions and whether metadata should be provided for each.
  */
  async findNeededInputs(tx: GASPNode): Promise<GASPNodeResponse | undefined> {
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

      return response
    }

    // Attempt to check if the current transaction is admissible
    parsedTx.merklePath = MerklePath.fromHex(tx.proof)
    const admittanceResult = await this.engine.managers[this.topic].identifyAdmissibleOutputs(parsedTx.toBEEF(), [])

    if (admittanceResult.outputsToAdmit.includes(tx.outputIndex) === true) {
      // The transaction is admissible, no further inputs are needed
    } else {
      // The transaction is not admissible, get inputs needed for further verification
      // TopicManagers should implement a function to identify which inputs are needed.
      if (this.engine.managers[this.topic] !== undefined && typeof this.engine.managers[this.topic].identifyNeededInputs === 'function') {
        for (const input of parsedTx.inputs) {
          response.requestedInputs[`${input.sourceTXID}.${input.sourceOutputIndex}`] = {
            metadata: false
          }
        }
        return response
      } else {
        try {
          const neededInputs = await this.engine.managers[this.topic].identifyNeededInputs?.(parsedTx.toBEEF()) ?? []
          for (const input of neededInputs) {
            response.requestedInputs[`${input.txid as string}.${input.outputIndex as number}`] = {
              metadata: false
            }
          }
          return response
        } catch (e) {
          console.error(`An error occurred when identifying needed inputs for transaction: ${parsedTx.id('hex')}.${tx.outputIndex}!`)
        }
      }
    }
  }

  /**
  * Appends a new node to a temporary graph.
  * @param tx The node to append to this graph.
  * @param spentBy Unless this is the same node identified by the graph ID, denotes the TXID and input index for the node which spent this one, in 36-byte format.
  * @throws If the node cannot be appended to the graph, either because the graph ID is for a graph the recipient does not want or because the graph has grown to be too large before being finalized.
  */
  async appendToGraph(tx: GASPNode, spentBy?: string | undefined): Promise<void> {
    if (this.maxNodesInGraph !== undefined && Object.keys(this.temporaryGraphNodeRefs).length > this.maxNodesInGraph) {
      throw new Error('The max number of nodes in transaction graph has been reached!')
    }

    const parsedTx = Transaction.fromHex(tx.rawTx)
    const txid = parsedTx.id('hex')
    if (tx.proof !== undefined) {
      parsedTx.merklePath = MerklePath.fromHex(tx.proof)
    }

    // Throw if:
    // 1. TODO: graphID is for a graph the recipient does not want (stipulated where?)
    // 2. TODO: The graph has grown to be too large before being finalized (based on some defined limit?)

    // Given the passed in node, append to the temp graph
    // Use the spentBy param which should be a txid.inputIndex for the node which spent this one in 36-byte format
    const newGraphNode: GraphNode = {
      txid,
      time: Date.now(), // TODO: Determine required format for Time
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
        this.temporaryGraphNodeRefs[tx.graphID] = newGraphNode
      } else {
        throw new Error(`Parent node with GraphID ${spentBy} not found`)
      }
    }
  }

  /**
    * Checks whether the given graph, in its current state, makes reference only to transactions that are proven in the blockchain, or already known by the recipient to be valid.
    * @param graphID The TXID and output index (in 36-byte format) for the UTXO at the tip of this graph.
    * @throws If the graph is not well-anchored.
    */
  async validateGraphAnchor(graphID: string): Promise<void> {
    // 1. Confirm that we are well anchored (according to the rules of SPV)
    // 2. Is there some sequence of nodes that will result in the admittance of the root node into the topic
    // 3. If some route that when executed in order to the root node leads to a valid admittance, we are good to go.
    // a) For each node in the chain we need to check topical admittance. For every chain.
    // Take into account previousCoins once you've validated child outputs

    const validationMap = new Map<string, boolean>()

    const validationFunc = async (graphNode: GraphNode): Promise<boolean> => {
      if (validationMap.has(graphNode.graphID)) {
        return validationMap.get(graphNode.graphID) || false
      }

      let parsedTx
      try {
        parsedTx = Transaction.fromHex(graphNode.rawTx)
        if (graphNode.proof !== undefined) {
          parsedTx.merklePath = MerklePath.fromHex(graphNode.proof)
        }
      } catch (error) {
        console.error('Error parsing transaction or proof:', error)
        return false
      }

      const validatedChildren: GraphNode[] = []
      for (const child of graphNode.children) {
        const childNode = this.temporaryGraphNodeRefs[child.graphID]
        if (childNode !== undefined) {
          if (!validationMap.has(childNode.graphID)) {
            const isValidChild = await validationFunc(childNode)
            if (isValidChild) {
              validatedChildren.push(childNode)
            }
          } else if (validationMap.get(childNode.graphID)) {
            validatedChildren.push(childNode)
          }
        }
      }

      let admittanceResult
      try {
        admittanceResult = await this.engine.managers[this.topic].identifyAdmissibleOutputs(parsedTx.toBEEF(), validatedChildren.map(child => child.outputIndex))
      } catch (error) {
        console.error('Error in admittance check:', error)
        return false
      }

      const isValid = admittanceResult.outputsToAdmit.includes(graphNode.outputIndex)
      validationMap.set(graphNode.graphID, isValid)

      if (isValid === false) {
        return false
      }

      // Reached the root successfully
      if (graphNode.parent === undefined) {
        return true
      }

      const parentNode = this.temporaryGraphNodeRefs[graphNode.parent.graphID]
      if (parentNode === undefined) {
        console.error('Parent node not found for:', graphNode.graphID)
        return false
      }
      return await validationFunc(parentNode)
    }

    const tipNode = this.temporaryGraphNodeRefs[graphID]
    if (tipNode === undefined) {
      throw new Error(`Graph node with ID ${graphID} not found`)
    }

    const isValid = await validationFunc(tipNode)
    if (!isValid) {
      throw new Error('The graph is not well-anchored')
    }
  }

  /**
   * Deletes all data associated with a temporary graph that has failed to sync, if the graph exists.
   * @param graphID The TXID and output index (in 36-byte format) for the UTXO at the tip of this graph.
   */
  async discardGraph(graphID: string): Promise<void> {
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
   * @param graphID The TXID and output index (in 36-byte format) for the UTXO at the tip of this graph.
   */
  async finalizeGraph(graphID: string): Promise<void> {
    // TODO: use similar function as validationFunc to construct the finalized graph with necessary components
  }
}
