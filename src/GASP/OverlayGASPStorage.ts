import { GASPNode, GASPNodeResponse, GASPStorage } from '@bsv/gasp'
import { MerklePath, Transaction } from '@bsv/sdk'
import { Engine } from 'mod.js'

interface Graph {
  graphID: string
  time: number
  txid: string
  outputIndex: number
  rawTx: string
  inputs: Record<string, Graph>
  proof: string
  spentBy: string
}

export class OverlayGASPStorage implements GASPStorage {
  private readonly temporaryGraphNodeRefs: Record<string, Graph>

  constructor(public topic: string, public engine: Engine) { this.temporaryGraphNodeRefs = {} }

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
      if (typeof this.engine.managers[this.topic].identifyNeededInputs !== 'function' && this.engine.managers[this.topic].identifyNeededInputs !== undefined) {
        for (const input of parsedTx.inputs) {
          response.requestedInputs[`${input.sourceTXID}.${input.sourceOutputIndex}`] = {
            metadata: false
          }
        }
        return response
      }
      try {
        const neededInputs = await this.engine.managers[this.topic].identifyNeededInputs(parsedTx.toBEEF())!
        for (const input of neededInputs) {
          response.requestedInputs[`${input.txid as string}.${input.outputIndex as number}`] = {
            metadata: false
          }
        }
        return response
      } catch (e) { }
    }
  }

  /**
  * Appends a new node to a temporary graph.
  * @param tx The node to append to this graph.
  * @param spentBy Unless this is the same node identified by the graph ID, denotes the TXID and input index for the node which spent this one, in 36-byte format.
  * @throws If the node cannot be appended to the graph, either because the graph ID is for a graph the recipient does not want or because the graph has grown to be too large before being finalized.
  */
  async appendToGraph(tx: GASPNode, spentBy?: string | undefined): Promise<void> {
    // Throw if:
    // 1. TODO: graphID is for a graph the recipient does not want (stipulated where?)
    // 2. TODO: The graph has grown to be too large before being finalized (based on some defined limit?)

    // Given the passed in node, append to the temp graph
    // Use the spentBy param which should be a txid.inputIndex for the node which spent this one in 36-byte format

    // If spentBy is undefined, then we know it's the root node.
    // Set the root node on the temporary graph

    // Else, then we should traverse the graph and figure where it belongs based on the parent
    // O(1) lookup if we use HashMap
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

    const validationFunc = async (graph: Graph, validateCurrentNode = false): Promise<boolean> => {
      if (Object.values(graph.inputs).length === 0 || validateCurrentNode) {
        // At the deepest point
        const parsedTx = Transaction.fromHex(graph.rawTx)
        // TODO: Consider case where no proof?
        parsedTx.merklePath = MerklePath.fromHex(graph.proof)
        // TODO: Take into account the parent nodes?
        const admittanceResult = await this.engine.managers[this.topic].identifyAdmissibleOutputs(parsedTx.toBEEF(), [])
        if (admittanceResult.outputsToAdmit.includes(graph.outputIndex) === true) {
          return await validationFunc(this.temporaryGraphNodeRefs[graph.spentBy], true)
        }
        return false
      } else {
        let finalResult = false
        for (const input in graph.inputs) {
          // If any of the inputs are valid, this graph is valid
          const result = await validationFunc(this.temporaryGraphNodeRefs[input])
          if (!finalResult) {
            finalResult = result
          }
        }
        return finalResult
      }
    }
    await validationFunc(this.temporaryGraphNodeRefs[graphID])
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
