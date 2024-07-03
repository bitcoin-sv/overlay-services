import { OverlayGASPRemote } from '../GASP/OverlayGASPRemote'
import { GASPInitialRequest, GASPInitialResponse, GASPNode } from '@bsv/gasp'

global.fetch = jest.fn(async () => {
  await Promise.resolve({
    ok: true,
    status: 200,
    json: async () => await Promise.resolve({})
  })
}
) as jest.Mock

describe('OverlayGASPRemote', () => {
  let overlayRemote: OverlayGASPRemote

  beforeEach(() => {
    overlayRemote = new OverlayGASPRemote('http://example.com');
    (fetch as jest.Mock).mockClear()
  })

  describe('getInitialResponse', () => {
    it('should send a request and return a valid response', async () => {
      const mockRequest: GASPInitialRequest = { version: 1, since: 0 }
      const mockResponse: GASPInitialResponse = {
        UTXOList: [{ txid: 'txid1', outputIndex: 0 }],
        since: 1234567890
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(mockResponse)
      })

      const response = await overlayRemote.getInitialResponse(mockRequest)

      expect(fetch).toHaveBeenCalledWith('http://example.com/requestSyncResponse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockRequest)
      })
      expect(response).toEqual(mockResponse)
    })

    it('should throw an error if the response status is not OK', async () => {
      const mockRequest: GASPInitialRequest = { version: 1, since: 0 };

      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500
      })

      await expect(overlayRemote.getInitialResponse(mockRequest)).rejects.toThrow('HTTP error! Status: 500')
    })

    it('should throw an error if the response format is invalid', async () => {
      const mockRequest: GASPInitialRequest = { version: 1, since: 0 }
      const invalidResponse = { invalid: 'data' };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(invalidResponse)
      })

      await expect(overlayRemote.getInitialResponse(mockRequest)).rejects.toThrow('Invalid response format')
    })
  })

  describe('requestNode', () => {
    it('should send a request and return a valid GASPNode', async () => {
      const graphID = 'graphID1'
      const txid = 'txid1'
      const outputIndex = 0
      const metadata = true
      const mockResponse: GASPNode = {
        graphID,
        rawTx: 'rawTxData',
        outputIndex,
        proof: 'proofData',
        txMetadata: 'txMetadata',
        outputMetadata: 'outputMetadata',
        inputs: {}
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(mockResponse)
      })

      const response = await overlayRemote.requestNode(graphID, txid, outputIndex, metadata)

      expect(fetch).toHaveBeenCalledWith('http://example.com/requestForeignGASPNode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graphID, txid, outputIndex, metadata })
      })
      expect(response).toEqual(mockResponse)
    })

    it('should throw an error if the response status is not OK', async () => {
      const graphID = 'graphID1'
      const txid = 'txid1'
      const outputIndex = 0
      const metadata = true;

      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500
      })

      await expect(overlayRemote.requestNode(graphID, txid, outputIndex, metadata)).rejects.toThrow('HTTP error! Status: 500')
    })

    it('should throw an error if the response format is invalid', async () => {
      const graphID = 'graphID1'
      const txid = 'txid1'
      const outputIndex = 0
      const metadata = true
      const invalidResponse = { invalid: 'data' };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(invalidResponse)
      })

      await expect(overlayRemote.requestNode(graphID, txid, outputIndex, metadata)).rejects.toThrow('Invalid response format')
    })
  })
})
