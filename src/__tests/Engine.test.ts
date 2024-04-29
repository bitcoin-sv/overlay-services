import Engine from '../Engine.js'
import LookupService from '../LookupService.js'
import TopicManager from '../TopicManager.js'
import Storage from '../storage/Storage.js'
import { ChainTracker } from '@bsv/sdk'

const mockChainTracker: ChainTracker = {
  isValidRootForHeight: jest.fn(() => true)
}
const exampleBeef = []
const exampleTXID = ''
let mockTopicManager: TopicManager, mockLookupService: LookupService, mockStorageEngine: Storage

describe('BSV Overlay Services Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    mockTopicManager = {
      identifyAdmissibleOutputs: jest.fn(() => ([0])),
      getDocumentation: async () => 'Topical Documentation',
      getMetaData: async () => ({ name: 'Mock Manager', shortDescription: 'Mock Short Manager Description' })
    }

    mockLookupService = {
      outputAdded: jest.fn(),
      outputSpent: jest.fn(),
      lookup: jest.fn(),
      outputDeleted: jest.fn(),
      getDocumentation: async () => 'Service Documentation',
      getMetaData: async () => ({ name: 'Mock Service', shortDescription: 'Mock Short Service Description' })
    }

    mockStorageEngine = {
      doesAppliedTransactionExist: jest.fn(() => false),
      insertAppliedTransaction: jest.fn(),
      insertOutput: jest.fn(),
      findOutput: jest.fn(() => null),
      markUTXOAsSpent: jest.fn(),
      updateConsumedBy: jest.fn(),
      deleteOutput: jest.fn()
    }
  })
  describe('submit', () => {
    it('Throws an error if the user submits to a topic that is not supported', async () => {
      const engine = new Engine(
        {
          Hello: mockTopicManager
        },
        {},
        mockStorageEngine,
        mockChainTracker
      )
      await expect(engine.submit({
        beef: exampleBeef,
        topics: ['hello']
      })).rejects.toHaveProperty('message', 'This server does not support this topic: hello')
    })
    it('Verifies the BEEF for the provided transaction', async () => {
      const engine = new Engine(
        {
          Hello: mockTopicManager
        },
        {},
        mockStorageEngine,
        mockChainTracker
      )
      await engine.submit({
        beef: exampleBeef,
        topics: ['Hello']
      })
      expect(mockChainTracker.isValidRootForHeight).toHaveBeenCalledWith({
        beef: exampleBeef
      })
    })
    it('Throws an error if an invalid envelope is provided', async () => {
      const engine = new Engine(
        {
          Hello: mockTopicManager
        },
        {},
        mockStorageEngine,
        mockChainTracker
      )
      mockChainTracker.isValidRootForHeight.mockReturnValueOnce(false)
      await expect(engine.submit({
        beef: exampleBeef,
        topics: ['Hello']
      })).rejects.toHaveProperty('message', 'Invalid SPV Envelope for the given transaction')
    })
    describe('For each topic being processed', () => {
      it('Checks for duplicate transactions', async () => {
        const engine = new Engine(
          {
            Hello: mockTopicManager
          },
          {},
          mockStorageEngine,
          mockChainTracker
        )
        await engine.submit({
          beef: exampleBeef,
          topics: ['Hello']
        })
        expect(mockStorageEngine.doesAppliedTransactionExist).toHaveBeenCalledWith({ txid: exampleTXID, topic: 'Hello' })
      })
      it('Does not process the output if the transaction was already applied to the topic', async () => {
        mockStorageEngine.doesAppliedTransactionExist = jest.fn(() => true)
        const engine = new Engine(
          {
            Hello: mockTopicManager
          },
          {},
          mockStorageEngine,
          mockChainTracker
        )
        await engine.submit({
          beef: exampleBeef,
          topics: ['Hello']
        })
        expect(mockStorageEngine.doesAppliedTransactionExist).toReturnWith([1])
        expect(mockStorageEngine.findOutput).not.toHaveBeenCalled()
        expect(mockStorageEngine.markUTXOAsSpent).not.toHaveBeenCalled()
        expect(mockStorageEngine.insertOutput).not.toHaveBeenCalled()
      })
      describe('For each input of the transaction', () => {
        it('Acquires the appropriate previous topical UTXOs from the storage engine', async () => {
          // Mock findUTXO to return a UTXO
          mockStorageEngine.findOutput = jest.fn(() => [{
            txid: 'mockPrevTXID',
            vout: 0
          }])
          mockParser.parse = jest.fn(() => ({
            inputs: [{
              prevTxId: 'someMockPrevTXID'
            }],
            outputs: [{
              script: Buffer.from('016a', 'hex'),
              satoshis: 1000
            }],
            id: 'MOCK_TX_ID'
          }))
          const engine = new Engine(
            {
              Hello: mockTopicManager
            },
            {},
            mockStorageEngine,
            mockChainTracker
          )
          // Mock the deletion because testing it here is not relevant
          engine.deleteUTXODeep = jest.fn()

          // Submit the utxo
          await engine.submit({
            beef: exampleBeef,
            topics: ['Hello']
          })
          expect(mockStorageEngine.findOutput).toHaveBeenCalled()
        })
        it('Includes the appropriate previous topical UTXOs when they are returned from the storage engine', async () => {
          // Mock findUTXO to return a UTXO
          mockStorageEngine.findOutput = jest.fn(() => [{
            txid: 'mockPrevTXID',
            vout: 0
          }])
          mockParser.parse = jest.fn(() => ({
            inputs: [{
              prevTxId: 'someMockPrevTXID'
            }],
            outputs: [{
              script: Buffer.from('016a', 'hex'),
              satoshis: 1000
            }],
            id: 'MOCK_TX_ID'
          }))
          const engine = new Engine(
            {
              Hello: mockTopicManager
            },
            {},
            mockStorageEngine,
            mockChainTracker
          )
          // Mock the deletion because testing it here is not relevant
          engine.deleteUTXODeep = jest.fn()

          // Submit the utxo
          await engine.submit({
            beef: exampleBeef,
            topics: ['Hello']
          })
          expect(mockStorageEngine.findOutput).toHaveBeenCalled()
          expect(mockStorageEngine.markUTXOAsSpent).toHaveBeenCalledWith('mockPrevTXID', 0, 'Hello')
        })
      })
      it('Identifies admissible outputs with the appropriate topic manager', async () => {
        // Mock findUTXO to return a UTXO
        mockStorageEngine.findOutput = jest.fn(() => [{
          txid: 'mockPrevTXID',
          vout: 0
        }])
        mockParser.parse = jest.fn(() => ({
          inputs: [{
            prevTxId: 'someMockPrevTXID'
          }],
          outputs: [{
            script: Buffer.from('016a', 'hex'),
            satoshis: 1000
          }],
          id: 'MOCK_TX_ID'
        }))
        const engine = new Engine(
          {
            Hello: mockTopicManager
          },
          {},
          mockStorageEngine,
          mockChainTracker
        )
        // Mock the deletion because testing it here is not relevant
        engine.deleteUTXODeep = jest.fn()

        // Submit the utxo
        await engine.submit({
          beef: exampleBeef,
          topics: ['Hello']
        })
        expect(engine.managers.Hello.identifyAdmissibleOutputs).toHaveBeenCalledWith({
          previousUTXOs: [{
            txid: 'mockPrevTXID',
            vout: 0
          }],
          parsedTransaction: {
            inputs: [{
              prevTxId: 'someMockPrevTXID'
            }],
            outputs: [{
              script: Buffer.from('016a', 'hex'),
              satoshis: 1000
            }],
            id: 'MOCK_TX_ID'
          }
        })
      })
      it.todo('Throws an error if the return value from the topic manager is invalid')
      describe('When previous UTXOs were retained by the topic manager', () => {
        // it('Marks the UTXO as spent', async () => {
        // // tested previously
        // })
        it('Notifies all lookup services about the output being spent (not deleted, see the comment about this in deleteUTXODeep)', async () => {
          // Mock findUTXO to return a UTXO
          mockStorageEngine.findOutput = jest.fn(() => [{
            txid: 'mockPrevTXID',
            vout: 0
          }])
          mockParser.parse = jest.fn(() => ({
            inputs: [{
              prevTxId: 'someMockPrevTXID'
            }],
            outputs: [{
              script: Buffer.from('016a', 'hex'),
              satoshis: 1000
            }],
            id: 'MOCK_TX_ID'
          }))
          const engine = new Engine(
            {
              Hello: mockTopicManager
            },
            {
              Hello: mockLookupService
            },
            mockStorageEngine,
            mockChainTracker
          )
          // Mock the deletion because testing it here is not relevant
          engine.deleteUTXODeep = jest.fn()

          // Submit the utxo
          await engine.submit({
            beef: exampleBeef,
            topics: ['Hello']
          })
          expect(engine.lookupServices.Hello.outputSpent).toHaveBeenCalledWith({
            txid: 'mockPrevTXID',
            vout: 0,
            topic: 'Hello'
          })
        })
      })
      describe('When previous UTXOs were not retained by the topic manager', () => {
        it('Marks the UTXO as stale, deleting all stale UTXOs by calling deleteUTXODeep', async () => {
          // Mock findUTXO to return a UTXO
          mockStorageEngine.findOutput = jest.fn(() => [{
            id: 33,
            txid: 'mockPrevTXID',
            vout: 0,
            topic: 'Hello',
            utxosConsumed: '[]',
            consumedBy: '[]'
          }])
          mockParser.parse = jest.fn(() => ({
            inputs: [{
              prevTxId: 'someMockPrevTXID'
            }],
            outputs: [{
              script: Buffer.from('016a', 'hex'),
              satoshis: 1000
            }],
            id: 'MOCK_TX_ID'
          }))
          const engine = new Engine(
            {
              Hello: mockTopicManager
            },
            {
              Hello: mockLookupService
            },
            mockStorageEngine,
            mockChainTracker
          )

          // Submit the utxo
          await engine.submit({
            beef: exampleBeef,
            topics: ['Hello']
          })
          // Test that previous UTXOs are deleted
          expect(mockStorageEngine.deleteUTXOById).toHaveBeenCalled()
          expect(mockLookupService.outputDeleted).toHaveBeenCalled()
        })
        it('Notifies all lookup services about the output being spent (the notification about the actual deletion will come from deleteUTXODeep)', async () => {
          // Mock findUTXO to return a UTXO
          mockStorageEngine.findOutput = jest.fn(() => [{
            id: 33,
            txid: 'mockPrevTXID',
            vout: 0,
            topic: 'Hello',
            utxosConsumed: '[]',
            consumedBy: '[]'
          }])
          mockParser.parse = jest.fn(() => ({
            inputs: [{
              prevTxId: 'someMockPrevTXID'
            }],
            outputs: [{
              script: Buffer.from('016a', 'hex'),
              satoshis: 1000
            }],
            id: 'MOCK_TX_ID'
          }))
          const engine = new Engine(
            {
              Hello: mockTopicManager
            },
            {
              Hello: mockLookupService
            },
            mockStorageEngine,
            mockChainTracker
          )

          // Submit the utxo
          await engine.submit({
            beef: exampleBeef,
            topics: ['Hello']
          })
          // Was the lookup service notified of the output deletion?
          expect(mockLookupService.outputDeleted).toHaveBeenCalled()
        })
      })
      it('Adds admissible UTXOs to the storage engine', async () => {
        // Mock findUTXO to return a UTXO
        mockStorageEngine.findOutput = jest.fn(() => [{
          id: 33,
          txid: 'mockPrevTXID',
          vout: 0,
          topic: 'Hello',
          utxosConsumed: '[]',
          consumedBy: '[]'
        }])
        mockParser.parse = jest.fn(() => ({
          inputs: [{
            prevTxId: 'someMockPrevTXID'
          }],
          outputs: [{
            script: Buffer.from('016a', 'hex'),
            satoshis: 1000
          }],
          id: 'MOCK_TX_ID'
        }))
        const engine = new Engine(
          {
            Hello: mockTopicManager
          },
          {
            Hello: mockLookupService
          },
          mockStorageEngine,
          mockChainTracker
        )

        // Submit the utxo
        await engine.submit({
          beef: exampleBeef,
          topics: ['Hello']
        })
        // Test the new UTXO was added
        expect(mockStorageEngine.insertOutput).toHaveBeenCalledWith({
          consumedBy: '[]',
          history: undefined,
          id: undefined,
          inputs: undefined,
          mapiResponses: undefined,
          outputScript: Buffer.from('016a', 'hex'),
          proof: undefined,
          rawTx: 'MOCK_RAW_TX',
          satoshis: 1000,
          spent: false,
          topic: 'Hello',
          txid: 'MOCK_TX_ID',
          utxosConsumed: '[]',
          vout: 0
        })
      })
      it('Notifies lookup services about incoming admissible UTXOs', async () => {
        // Mock findUTXO to return a UTXO
        mockStorageEngine.findOutput = jest.fn(() => [{
          id: 33,
          txid: 'mockPrevTXID',
          vout: 0,
          topic: 'Hello',
          utxosConsumed: '[]',
          consumedBy: '[]'
        }])
        mockParser.parse = jest.fn(() => ({
          inputs: [{
            prevTxId: 'someMockPrevTXID'
          }],
          outputs: [{
            script: Buffer.from('016a', 'hex'),
            satoshis: 1000
          }],
          id: 'MOCK_TX_ID'
        }))
        const engine = new Engine(
          {
            Hello: mockTopicManager
          },
          {
            Hello: mockLookupService
          },
          mockStorageEngine,
          mockChainTracker
        )

        // Submit the utxo
        await engine.submit({
          beef: exampleBeef,
          topics: ['Hello']
        })
        // Test the lookup service was notified of the new UTXO
        expect(mockLookupService.outputAdded).toHaveBeenCalledWith({
          outputScript: Buffer.from('016a', 'hex'),
          topic: 'Hello',
          txid: 'MOCK_TX_ID',
          vout: 0
        })
      })
      describe('For each consumed UTXO', () => {
        it('Finds the UTXO by ID', async () => {
          // Mock findUTXO to return a UTXO
          mockStorageEngine.findOutput = jest.fn(() => [{
            id: 33,
            txid: 'mockPrevTXID',
            vout: 0,
            topic: 'Hello',
            utxosConsumed: '[]',
            consumedBy: '[]'
          }])
          mockStorageEngine.findOutputById = jest.fn(() => [{
            id: 33,
            txid: 'mockPrevTXID',
            vout: 0,
            topic: 'Hello',
            utxosConsumed: '[]',
            consumedBy: '[]'
          }])
          mockParser.parse = jest.fn(() => ({
            inputs: [{
              prevTxId: 'someMockPrevTXID'
            }],
            outputs: [{
              script: Buffer.from('016a', 'hex'),
              satoshis: 1000
            }],
            id: 'MOCK_TX_ID'
          }))
          mockTopicManager.identifyAdmissibleOutputs = jest.fn(() => {
            return {
              outputsToAdmit: [0],
              outputsToRetain: [33]
            }
          })
          const engine = new Engine(
            {
              Hello: mockTopicManager
            },
            {
              Hello: mockLookupService
            },
            mockStorageEngine,
            mockChainTracker
          )

          // Submit the utxo
          await engine.submit({
            beef: exampleBeef,
            topics: ['Hello']
          })

          // Test a storage engine lookup happens for the utxo consumed
          expect(mockStorageEngine.findOutputById).toHaveBeenCalledWith(33)
        })
        it('Updates the UTXO to reflect that it is now additionally consumed by the newly-created UTXOs', async () => {
          // Mock findUTXO to return a UTXO
          mockStorageEngine.insertOutput = jest.fn(() => 34)
          mockStorageEngine.findOutput = jest.fn(() => [{
            id: 33,
            txid: 'mockPrevTXID',
            vout: 0,
            topic: 'Hello',
            utxosConsumed: '[]',
            consumedBy: '[]'
          }])
          mockStorageEngine.findOutputById = jest.fn(() => [{
            id: 33,
            txid: 'mockPrevTXID',
            vout: 0,
            topic: 'Hello',
            utxosConsumed: '[]',
            consumedBy: '[]'
          }])
          mockParser.parse = jest.fn(() => ({
            inputs: [{
              prevTxId: 'someMockPrevTXID'
            }],
            outputs: [{
              script: Buffer.from('016a', 'hex'),
              satoshis: 1000
            }],
            id: 'MOCK_TX_ID'
          }))
          mockTopicManager.identifyAdmissibleOutputs = jest.fn(() => {
            return {
              outputsToAdmit: [0],
              outputsToRetain: [33]
            }
          })
          const engine = new Engine(
            {
              Hello: mockTopicManager
            },
            {
              Hello: mockLookupService
            },
            mockStorageEngine,
            mockChainTracker
          )

          // Submit the utxo
          await engine.submit({
            beef: exampleBeef,
            topics: ['Hello']
          })

          // Test the consumedBy data is updated
          expect(mockStorageEngine.updateConsumedBy).toHaveBeenCalledWith(33, '[34]')
        })
      })
      it('Inserts a new applied transaction to avoid de-duplication', async () => {
        // Mock findUTXO to return a UTXO
        mockStorageEngine.insertOutput = jest.fn(() => 34)
        mockStorageEngine.findOutput = jest.fn(() => [{
          id: 33,
          txid: 'mockPrevTXID',
          vout: 0,
          topic: 'Hello',
          utxosConsumed: '[]',
          consumedBy: '[]'
        }])
        mockStorageEngine.findOutputById = jest.fn(() => [{
          id: 33,
          txid: 'mockPrevTXID',
          vout: 0,
          topic: 'Hello',
          utxosConsumed: '[]',
          consumedBy: '[]'
        }])
        mockParser.parse = jest.fn(() => ({
          inputs: [{
            prevTxId: 'someMockPrevTXID'
          }],
          outputs: [{
            script: Buffer.from('016a', 'hex'),
            satoshis: 1000
          }],
          id: 'MOCK_TX_ID'
        }))
        mockTopicManager.identifyAdmissibleOutputs = jest.fn(() => {
          return {
            outputsToAdmit: [0],
            outputsToRetain: [33]
          }
        })
        const engine = new Engine(
          {
            Hello: mockTopicManager
          },
          {
            Hello: mockLookupService
          },
          mockStorageEngine,
          mockChainTracker
        )

        // Submit the utxo
        await engine.submit({
          beef: exampleBeef,
          topics: ['Hello']
        })

        // Test the tx is inserted
        expect(mockStorageEngine.insertAppliedTransaction).toHaveBeenCalledWith(
          'MOCK_TX_ID', 'Hello'
        )
      })
    })
    it('Returns a correct set of admitted topics and outputs', async () => {
      // Mock findUTXO to return a UTXO
      mockStorageEngine.insertOutput = jest.fn(() => 34)
      mockStorageEngine.findOutput = jest.fn(() => [{
        id: 33,
        txid: 'mockPrevTXID',
        vout: 0,
        topic: 'Hello',
        utxosConsumed: '[]',
        consumedBy: '[]'
      }])
      mockStorageEngine.findOutputById = jest.fn(() => [{
        id: 33,
        txid: 'mockPrevTXID',
        vout: 0,
        topic: 'Hello',
        utxosConsumed: '[]',
        consumedBy: '[]'
      }])
      mockParser.parse = jest.fn(() => ({
        inputs: [{
          prevTxId: 'someMockPrevTXID'
        }],
        outputs: [{
          script: Buffer.from('016a', 'hex'),
          satoshis: 1000
        }],
        id: 'MOCK_TX_ID'
      }))
      mockTopicManager.identifyAdmissibleOutputs = jest.fn(() => {
        return {
          outputsToAdmit: [0],
          outputsToRetain: [33]
        }
      })
      const engine = new Engine(
        {
          Hello: mockTopicManager
        },
        {
          Hello: mockLookupService
        },
        mockStorageEngine,
        mockChainTracker
      )

      // Submit the utxo
      const results = await engine.submit({
        beef: exampleBeef,
        topics: ['Hello']
      })

      // Test the correct outputs are admitted
      expect(results).toEqual({
        status: 'success',
        topics: {
          Hello: [0]
        }
      })
    })
  })

  describe('lookup', () => {
    it('Throws an error if no provider was given', async () => {
      const engine = new Engine(
        {
          Hello: mockTopicManager
        },
        {
          Hello: mockLookupService
        },
        mockStorageEngine,
        mockChainTracker
      )

      // Perform a lookup request
      await engine.lookup({
        query: {}
      })
      expect(mockLookupService.lookup).toThrowError()
    })
    it('Throws an error if no query was given', async () => {
      const engine = new Engine(
        {
          Hello: mockTopicManager
        },
        {
          Hello: mockLookupService
        },
        mockStorageEngine,
        mockChainTracker
      )

      // Perform a lookup request
      await expect(engine.lookup({
        provider: 'abcdefg'
      })).rejects.toThrow()
    })
    it('Throws an error if no lookup service has this provider name', async () => {
      const engine = new Engine(
        {
          Hello: mockTopicManager
        },
        {
          Hello: mockLookupService
        },
        mockStorageEngine,
        mockChainTracker
      )

      // Perform a lookup request
      await expect(engine.lookup({
        provider: 'HelloWorld',
        query: { name: 'Bob' }
      })).rejects.toThrow()
    })
    it('Calls the lookup function from the lookup service', async () => {
      // TODO: Make the default storage engine return something...?
      mockLookupService.lookup = jest.fn(() => [{}])
      mockStorageEngine.findOutput = jest.fn(() => [{
        id: 33,
        txid: 'mockPrevTXID',
        vout: 0,
        topic: 'Hello',
        utxosConsumed: '[]',
        consumedBy: '[]',
        outputScript: Buffer.from('016a', 'hex')
      }])
      const engine = new Engine(
        {
          Hello: mockTopicManager
        },
        {
          Hello: mockLookupService
        },
        mockStorageEngine,
        mockChainTracker
      )

      // Perform a lookup request
      await engine.lookup({
        provider: 'Hello',
        query: { name: 'Bob' }
      })
      expect(mockLookupService.lookup).toHaveBeenCalledWith({
        query: { name: 'Bob' }
      })
    })
    describe('For each returned result', () => {
      it('Finds the identified UTXO by its txid and vout', async () => {
        // TODO: Make the default storage engine return something...?
        mockLookupService.lookup = jest.fn(() => [{
          txid: 'mockTXID',
          vout: 0,
          history: undefined
        }])
        mockStorageEngine.findOutput = jest.fn(() => [{
          id: 33,
          txid: 'mockPrevTXID',
          vout: 0,
          topic: 'Hello',
          utxosConsumed: '[]',
          consumedBy: '[]',
          outputScript: Buffer.from('016a', 'hex')
        }])
        const engine = new Engine(
          {
            Hello: mockTopicManager
          },
          {
            Hello: mockLookupService
          },
          mockStorageEngine,
          mockChainTracker
        )

        // Perform a lookup request
        await engine.lookup({
          provider: 'Hello',
          query: { name: 'Bob' }
        })
        expect(mockStorageEngine.findOutput).toHaveBeenCalledWith(
          'mockTXID',
          0,
          undefined,
          false
        )
      })
      it('Calls getUTXOHistory with the correct UTXO and history parameters', async () => {
        // TODO: Make the default storage engine return something...?
        mockLookupService.lookup = jest.fn(() => [{
          txid: 'mockTXID',
          vout: 0,
          history: undefined
        }])
        mockStorageEngine.findOutput = jest.fn(() => [{
          id: 33,
          txid: 'mockPrevTXID',
          vout: 0,
          topic: 'Hello',
          utxosConsumed: '[]',
          consumedBy: '[]',
          outputScript: Buffer.from('016a', 'hex')
        }])
        const engine = new Engine(
          {
            Hello: mockTopicManager
          },
          {
            Hello: mockLookupService
          },
          mockStorageEngine,
          mockChainTracker
        )
        engine.getUTXOHistory = jest.fn(() => {
          return {
            txid: 'mockTXZID',
            inputs: {}
          }
        })

        // Perform a lookup request
        await engine.lookup({
          provider: 'Hello',
          query: { name: 'Bob' }
        })
        expect(engine.getUTXOHistory).toHaveBeenCalledWith(
          {
            consumedBy: '[]',
            id: 33,
            outputScript: Buffer.from('016a', 'hex'),
            topic: 'Hello',
            txid: 'mockPrevTXID',
            utxosConsumed: '[]',
            vout: 0
          },
          undefined,
          0
        )
      })
    })
    it('Returns the correct set of hydrated results', async () => {
      // TODO: Make the default storage engine return something...?
      mockLookupService.lookup = jest.fn(() => [{
        txid: 'mockTXID',
        vout: 0,
        history: undefined
      }])
      mockStorageEngine.findOutput = jest.fn(() => [{
        id: 33,
        txid: 'mockPrevTXID',
        vout: 0,
        topic: 'Hello',
        utxosConsumed: '[]',
        consumedBy: '[]',
        outputScript: Buffer.from('016a', 'hex')
      }])
      const engine = new Engine(
        {
          Hello: mockTopicManager
        },
        {
          Hello: mockLookupService
        },
        mockStorageEngine,
        mockChainTracker
      )
      engine.getUTXOHistory = jest.fn(() => {
        return {
          txid: 'mockTXID',
          inputs: {}
        }
      })

      // Perform a lookup request
      const results = await engine.lookup({
        provider: 'Hello',
        query: { name: 'Bob' }
      })
      expect(results).toEqual([{ inputs: {}, txid: 'mockTXID' }])
    })
  })
  describe('getUTXOHistory', () => {
    it('Returns the given output is there is no history selector', async () => {
      // Already tested above
      return true
    })
    it('Invokes the history selector function with the correct data', async () => {
      // TODO: Make the default storage engine return something...?
      const mockedHistorySelector = jest.fn((output, currentDepth) => {
        if (currentDepth !== 2) {
          return true
        }
        return false
      })
      mockLookupService.lookup = jest.fn(() => [{
        txid: 'mockTXID',
        vout: 0,
        history: mockedHistorySelector
      }])
      mockStorageEngine.findOutput = jest.fn(() => [{
        txid: 'mockPrevTXID',
        vout: 0,
        topic: 'Hello',
        utxosConsumed: '[]',
        outputScript: Buffer.from('016a', 'hex')
      }])
      const engine = new Engine(
        {
          Hello: mockTopicManager
        },
        {
          Hello: mockLookupService
        },
        mockStorageEngine,
        mockChainTracker
      )

      // Perform a lookup request
      await engine.lookup({
        provider: 'Hello',
        query: { name: 'Bob' }
      })
      expect(mockedHistorySelector).toHaveBeenCalledWith(
        {
          outputScript: Buffer.from('016a', 'hex'),
          topic: 'Hello',
          txid: 'mockPrevTXID',
          utxosConsumed: '[]',
          vout: 0
        },
        0
      )
      expect(mockedHistorySelector).toReturnWith(true)
    })
    it('Returns undefined if history should not be traversed', async () => {
      // TODO: Make the default storage engine return something...?
      const mockedHistorySelector = jest.fn((output, currentDepth) => {
        return false
      })
      mockLookupService.lookup = jest.fn(() => [{
        txid: 'mockTXID',
        vout: 0,
        history: mockedHistorySelector
      }])
      mockStorageEngine.findOutput = jest.fn(() => [{
        txid: 'mockPrevTXID',
        vout: 0,
        topic: 'Hello',
        utxosConsumed: '[]',
        outputScript: Buffer.from('016a', 'hex')
      }])
      const engine = new Engine(
        {
          Hello: mockTopicManager
        },
        {
          Hello: mockLookupService
        },
        mockStorageEngine,
        mockChainTracker
      )

      // Perform a lookup request
      const results = await engine.lookup({
        provider: 'Hello',
        query: { name: 'Bob' }
      })
      expect(mockedHistorySelector).toHaveBeenCalledWith(
        {
          outputScript: Buffer.from('016a', 'hex'),
          topic: 'Hello',
          txid: 'mockPrevTXID',
          utxosConsumed: '[]',
          vout: 0
        },
        0
      )
      expect(results).toEqual([])
    })
    it('Returns undefined if the history selector is a number, and less than the current depth', async () => {
      mockLookupService.lookup = jest.fn(() => [{
        txid: 'mockTXID',
        vout: 0,
        history: -1
      }])
      mockStorageEngine.findOutput = jest.fn(() => [{
        txid: 'mockPrevTXID',
        vout: 0,
        topic: 'Hello',
        utxosConsumed: '[]',
        outputScript: Buffer.from('016a', 'hex')
      }])
      const engine = new Engine(
        {
          Hello: mockTopicManager
        },
        {
          Hello: mockLookupService
        },
        mockStorageEngine,
        mockChainTracker
      )

      // Perform a lookup request
      const results = await engine.lookup({
        provider: 'Hello',
        query: { name: 'Bob' }
      })
      expect(results).toEqual([])
    })
    it('Returns the current output even if history should be traversed, if the current output is part of a transaction that does not consume any previous topical UTXOs', async () => {
      mockLookupService.lookup = jest.fn(() => [{
        txid: 'mockTXID',
        vout: 0,
        history: 1
      }])
      mockStorageEngine.findOutput = jest.fn(() => [{
        txid: 'mockPrevTXID',
        vout: 0,
        topic: 'Hello',
        utxosConsumed: '[]',
        outputScript: Buffer.from('016a', 'hex')
      }])
      const engine = new Engine(
        {
          Hello: mockTopicManager
        },
        {
          Hello: mockLookupService
        },
        mockStorageEngine,
        mockChainTracker
      )

      // Perform a lookup request
      const results = await engine.lookup({
        provider: 'Hello',
        query: { name: 'Bob' }
      })
      // TODO: Validate this is the correct test
      expect(results).toEqual([{
        inputs: undefined,
        mapiResponses: undefined,
        outputScript: '016a',
        proof: undefined,
        rawTx: undefined,
        satoshis: undefined,
        txid: 'mockPrevTXID',
        vout: 0
      }])
    })
    it('Traversing history, calls findUTXOById with the ID of any UTXO consumed by this UTXO', async () => {
      mockLookupService.lookup = jest.fn(() => [{
        txid: 'mockTXID',
        vout: 0,
        history: 1
      }])
      mockStorageEngine.findOutput = jest.fn(() => [{
        txid: 'mockPrevTXID',
        vout: 0,
        topic: 'Hello',
        utxosConsumed: '[33]',
        outputScript: Buffer.from('016a', 'hex')
      }])
      mockStorageEngine.findOutputById = jest.fn(() => [{
        txid: 'mockPrevTXID',
        vout: 0,
        topic: 'Hello',
        utxosConsumed: '[]',
        outputScript: Buffer.from('016a', 'hex')
      }])
      const engine = new Engine(
        {
          Hello: mockTopicManager
        },
        {
          Hello: mockLookupService
        },
        mockStorageEngine,
        mockChainTracker
      )

      // Perform a lookup request
      await engine.lookup({
        provider: 'Hello',
        query: { name: 'Bob' }
      })

      expect(mockStorageEngine.findOutputById).toHaveBeenCalledWith(33)
    })
    it('Returns the correct envelope based on the history traversal process', async () => {
      // TODO: Come up with some test data for a simple case, but different than the above code.
    })
    it('Returns the correct envelope based on the history traversal process for a more complex multi-layer multi-output graph', async () => {
      // TODO: Come up with some test data to test the history traversal process better
    })
  })
  describe('deleteUTXODeep', () => {
    it('Finds UTXO by ID if no output was provided', async () => {

    })
    it('Finds UTXO by TXID and VOUT if no ID was provided', async () => {

    })
    it('Throws an error if no output can be found', async () => {

    })
    describe('When no more UTXOs are consumed by this UTXO', () => {
      it('Deletes the UTXO by ID from the storage engine', async () => {

      })
      it('Notifies all lookup services about the deletion of the UTXO', async () => {

      })
    })
    it('For each UTXO that this UTXO consumes, finds the consumed UTXO by its ID and removes reference to this one', async () => {

    })
  })
})
