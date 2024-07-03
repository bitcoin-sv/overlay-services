import { GraphNode, OverlayGASPStorage } from '../GASP/OverlayGASPStorage'
import { Transaction, MerklePath } from '@bsv/sdk'
import { GASPNode } from '@bsv/gasp'

jest.mock('../Engine', () => ({
  Engine: jest.fn()
}))

describe('OverlayGASPStorage', () => {
  let overlayStorage: OverlayGASPStorage
  let mockEngine: any

  beforeEach(() => {
    mockEngine = { storage: { findUTXOsForTopic: jest.fn() }, managers: {} }
    overlayStorage = new OverlayGASPStorage('test-topic', mockEngine)
  })

  describe('appendToGraph', () => {
    it('should append a new node to an empty graph', async () => {
      const mockTx = {
        rawTx: '001122',
        outputIndex: 0,
        graphID: 'txid123.0'
      }

      // Use actual Transaction implementation
      const parsedTx = Transaction.fromHex(mockTx.rawTx)

      await overlayStorage.appendToGraph(mockTx)

      expect(Object.keys(overlayStorage.temporaryGraphNodeRefs).length).toBe(1)
      expect(overlayStorage.temporaryGraphNodeRefs['txid123.0'].txid).toBe(parsedTx.id('hex'))
    })

    it('throws error when max nodes are exceeded', async () => {
      overlayStorage.maxNodesInGraph = 1
      overlayStorage.temporaryGraphNodeRefs['txid123.0'] = { txid: 'txid123', children: [] } as GraphNode

      const mockTx = {
        rawTx: '334455',
        outputIndex: 1,
        graphID: 'txid234.1'
      }

      await expect(overlayStorage.appendToGraph(mockTx)).rejects.toThrow('The max number of nodes in transaction graph has been reached!')
    })
  })

  describe('findKnownUTXOs', () => {
    it('should return known UTXOs since a given timestamp', async () => {
      const mockUTXOs = [{ txid: 'txid1', outputIndex: 0 }, { txid: 'txid2', outputIndex: 1 }]
      mockEngine.storage.findUTXOsForTopic.mockResolvedValue(mockUTXOs)

      const result = await overlayStorage.findKnownUTXOs(1234567890)

      expect(result).toEqual(mockUTXOs)
      expect(mockEngine.storage.findUTXOsForTopic).toHaveBeenCalledWith('test-topic', 1234567890)
    })

    it('should handle errors correctly', async () => {
      mockEngine.storage.findUTXOsForTopic.mockRejectedValue(new Error('Database error'))

      await expect(overlayStorage.findKnownUTXOs(1234567890)).rejects.toThrow('Database error')
    })
  })

  describe('hydrateGASPNode', () => {
    it('should throw an error', async () => {
      await expect(overlayStorage.hydrateGASPNode('graphID', 'txid', 0, false)).rejects.toThrow('GASP node hydration Not supported!')
    })
  })

  describe('findNeededInputs', () => {
    // TODO: Write more complicated test cases
    it('should return inputs needed for further verification when no proof is present', async () => {
      const mockTx: GASPNode = {
        rawTx: '001122',
        proof: undefined,
        graphID: 'txid123.0',
        outputIndex: 0
      }

      const parsedTx = {
        inputs: [{ sourceTXID: 'inputTxid1', sourceOutputIndex: 0 }],
        toBEEF: jest.fn(),
        id: jest.fn().mockReturnValue('txid123')
      }
      Transaction.fromHex = jest.fn().mockReturnValue(parsedTx)

      const result = await overlayStorage.findNeededInputs(mockTx)

      expect(result).toEqual({
        requestedInputs: { 'inputTxid1.0': { metadata: false } }
      })
    })

    it('should return inputs needed for further verification when proof is present', async () => {
      const mockTx: GASPNode = {
        rawTx: '001122',
        proof: 'someproof',
        graphID: 'txid123.0',
        outputIndex: 0
      }

      const parsedTx = {
        inputs: [{ sourceTXID: 'neededTxid', sourceOutputIndex: 1 }],
        toBEEF: jest.fn(),
        id: jest.fn().mockReturnValue('txid123'),
        merklePath: {}
      }
      Transaction.fromHex = jest.fn().mockReturnValue(parsedTx)
      MerklePath.fromHex = jest.fn().mockReturnValue(parsedTx.merklePath)

      mockEngine.managers['test-topic'] = {
        identifyAdmissibleOutputs: jest.fn().mockResolvedValue({
          outputsToAdmit: []
        }),
        identifyNeededInputs: jest.fn().mockResolvedValue([{ txid: 'neededTxid', outputIndex: 1 }])
      }

      const result = await overlayStorage.findNeededInputs(mockTx)

      expect(result).toEqual({
        requestedInputs: { 'neededTxid.1': { metadata: false } }
      })
    })
  })

  describe('discardGraph', () => {
    it('should discard the graph and its nodes', async () => {
      overlayStorage.temporaryGraphNodeRefs['txid123.0'] = {
        txid: 'txid123',
        time: Date.now(),
        graphID: 'txid123.0',
        rawTx: 'rawTxData',
        outputIndex: 0,
        children: [],
        parent: undefined
      } as GraphNode

      overlayStorage.temporaryGraphNodeRefs['txid124.0'] = {
        txid: 'txid124',
        time: Date.now(),
        graphID: 'txid123.0',
        rawTx: 'rawTxData',
        outputIndex: 1,
        children: [],
        parent: {
          txid: 'txid123',
          time: Date.now(),
          graphID: 'txid123.0',
          rawTx: 'rawTxData',
          outputIndex: 0,
          children: []
        } as GraphNode
      } as GraphNode

      await overlayStorage.discardGraph('txid123.0')

      expect(overlayStorage.temporaryGraphNodeRefs['txid123.0']).toBeUndefined()
      expect(overlayStorage.temporaryGraphNodeRefs['txid124.0']).toBeUndefined()
    })
  })

  it('should handle non-existent graphID', async () => {
    await overlayStorage.discardGraph('nonexistent.0')

    expect(Object.keys(overlayStorage.temporaryGraphNodeRefs).length).toBe(0)
  })
})
