import { Engine } from '../Engine'
import { LookupService } from '../LookupService'
import { TopicManager } from '../TopicManager'
import { AdmittanceInstructions } from '../AdmittanceInstructions'
import { Storage } from '../storage/Storage'
import { Transaction } from '@bsv/sdk'
import { Output } from '../Output'

const mockChainTracker = {
  isValidRootForHeight: jest.fn(async () => true)
}

const BRC62Hex = '0100beef01fe636d0c0007021400fe507c0c7aa754cef1f7889d5fd395cf1f785dd7de98eed895dbedfe4e5bc70d1502ac4e164f5bc16746bb0868404292ac8318bbac3800e4aad13a014da427adce3e010b00bc4ff395efd11719b277694cface5aa50d085a0bb81f613f70313acd28cf4557010400574b2d9142b8d28b61d88e3b2c3f44d858411356b49a28a4643b6d1a6a092a5201030051a05fc84d531b5d250c23f4f886f6812f9fe3f402d61607f977b4ecd2701c19010000fd781529d58fc2523cf396a7f25440b409857e7e221766c57214b1d38c7b481f01010062f542f45ea3660f86c013ced80534cb5fd4c19d66c56e7e8c5d4bf2d40acc5e010100b121e91836fd7cd5102b654e9f72f3cf6fdbfd0b161c53a9c54b12c841126331020100000001cd4e4cac3c7b56920d1e7655e7e260d31f29d9a388d04910f1bbd72304a79029010000006b483045022100e75279a205a547c445719420aa3138bf14743e3f42618e5f86a19bde14bb95f7022064777d34776b05d816daf1699493fcdf2ef5a5ab1ad710d9c97bfb5b8f7cef3641210263e2dee22b1ddc5e11f6fab8bcd2378bdd19580d640501ea956ec0e786f93e76ffffffff013e660000000000001976a9146bfd5c7fbe21529d45803dbcf0c87dd3c71efbc288ac0000000001000100000001ac4e164f5bc16746bb0868404292ac8318bbac3800e4aad13a014da427adce3e000000006a47304402203a61a2e931612b4bda08d541cfb980885173b8dcf64a3471238ae7abcd368d6402204cbf24f04b9aa2256d8901f0ed97866603d2be8324c2bfb7a37bf8fc90edd5b441210263e2dee22b1ddc5e11f6fab8bcd2378bdd19580d640501ea956ec0e786f93e76ffffffff013c660000000000001976a9146bfd5c7fbe21529d45803dbcf0c87dd3c71efbc288ac0000000000'
const exampleTX = Transaction.fromHexBEEF(BRC62Hex)

const exampleBeef = exampleTX.toBEEF()
const exampleTXID = exampleTX.id('hex') as string
const examplePreviousTXID = '3ecead27a44d013ad1aae40038acbb1883ac9242406808bb4667c15b4f164eac'
let mockTopicManager: TopicManager, mockLookupService: LookupService, mockStorageEngine: Storage
const mockOutput: Output = {
  txid: exampleTXID,
  outputIndex: 0,
  outputScript: exampleTX.outputs[0].lockingScript.toBinary(),
  topic: 'hello',
  satoshis: exampleTX.outputs[0].satoshis as number,
  beef: exampleBeef,
  spent: false,
  outputsConsumed: [],
  consumedBy: []
}

describe('BSV Overlay Services Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    mockTopicManager = {
      identifyAdmissibleOutputs: jest.fn(async (): Promise<AdmittanceInstructions> => ({
        outputsToAdmit: [0],
        coinsToRetain: []
      })),
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
      doesAppliedTransactionExist: jest.fn(async () => false),
      insertAppliedTransaction: jest.fn(),
      insertOutput: jest.fn(),
      findOutput: jest.fn(async () => null),
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
      expect(mockChainTracker.isValidRootForHeight).toHaveBeenCalledWith('bb6f640cc4ee56bf38eb5a1969ac0c16caa2d3d202b22bf3735d10eec0ca6e00', 814435)
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
      mockChainTracker.isValidRootForHeight.mockReturnValueOnce(Promise.resolve(false))
      await expect(engine.submit({
        beef: exampleBeef,
        topics: ['Hello']
      })).rejects.toHaveProperty('message', 'Verification failed because the input at index 0 of transaction 3ecead27a44d013ad1aae40038acbb1883ac9242406808bb4667c15b4f164eac is missing an associated source transaction. This source transaction is required for transaction verification because there is no merkle proof for the transaction spending a UTXO it contains.')
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
        mockStorageEngine.doesAppliedTransactionExist = jest.fn(async () => true)
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
        expect(mockStorageEngine.doesAppliedTransactionExist).toReturnWith(Promise.resolve(true))
        expect(mockStorageEngine.findOutput).not.toHaveBeenCalled()
        expect(mockStorageEngine.markUTXOAsSpent).not.toHaveBeenCalled()
        expect(mockStorageEngine.insertOutput).not.toHaveBeenCalled()
      })
      describe('For each input of the transaction', () => {
        it('Acquires the appropriate previous topical UTXOs from the storage engine', async () => {
          // Mock findUTXO to return a UTXO
          mockStorageEngine.findOutput = jest.fn(async () => mockOutput)
          const engine = new Engine(
            {
              Hello: mockTopicManager
            },
            {},
            mockStorageEngine,
            mockChainTracker
          )

          // Submit the utxo
          await engine.submit({
            beef: exampleBeef,
            topics: ['Hello']
          })
          expect(mockStorageEngine.findOutput).toHaveBeenCalled()
        })
        it('Includes the appropriate previous topical UTXOs when they are returned from the storage engine', async () => {
          // Mock findUTXO to return a UTXO
          mockStorageEngine.findOutput = jest.fn(async () => mockOutput)
          const engine = new Engine(
            {
              Hello: mockTopicManager
            },
            {},
            mockStorageEngine,
            mockChainTracker
          )

          // Submit the utxo
          await engine.submit({
            beef: exampleBeef,
            topics: ['Hello']
          })
          expect(mockStorageEngine.findOutput).toHaveBeenCalled()
          expect(mockStorageEngine.markUTXOAsSpent).toHaveBeenCalledWith(exampleTXID, 0, 'Hello')
        })
      })
      it('Identifies admissible outputs with the appropriate topic manager', async () => {
        // Mock findUTXO to return a UTXO
        mockStorageEngine.findOutput = jest.fn(async () => mockOutput)
        const engine = new Engine(
          {
            Hello: mockTopicManager
          },
          {},
          mockStorageEngine,
          mockChainTracker
        )

        // Submit the utxo
        await engine.submit({
          beef: exampleBeef,
          topics: ['Hello']
        })
        expect(engine.managers.Hello.identifyAdmissibleOutputs).toHaveBeenCalledWith(exampleBeef, [0])
      })
      describe('When previous UTXOs were retained by the topic manager', () => {
        it('Notifies all lookup services about the output being spent (not deleted, see the comment about this in deleteUTXODeep)', async () => {
          // Mock findUTXO to return a UTXO
          mockStorageEngine.findOutput = jest.fn(async () => mockOutput)
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
          expect(engine.lookupServices.Hello.outputSpent).toHaveBeenCalledWith(exampleTXID, 0, 'Hello')
        })
      })
      describe('When previous UTXOs were not retained by the topic manager', () => {
        it('Marks the UTXO as stale, deleting all stale UTXOs by calling deleteUTXODeep', async () => {
          // Mock findUTXO to return a UTXO
          mockStorageEngine.findOutput = jest.fn(async () => mockOutput)
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
          expect(mockStorageEngine.deleteOutput).toHaveBeenCalledWith(exampleTXID, 0, 'hello')
          expect(mockLookupService.outputDeleted).toHaveBeenCalledWith(exampleTXID, 0, 'hello')
        })
        it('Notifies all lookup services about the output being spent (the notification about the actual deletion will come from deleteUTXODeep)', async () => {
          // Mock findUTXO to return a UTXO
          mockStorageEngine.findOutput = jest.fn(async () => mockOutput)
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
          expect(mockLookupService.outputDeleted).toHaveBeenCalledWith(exampleTXID, 0, 'hello')
        })
      })
      it('Adds admissible UTXOs to the storage engine', async () => {
        // Mock findUTXO to return a UTXO
        mockStorageEngine.findOutput = jest.fn(async () => mockOutput)
        const engine = new Engine(
          {
            hello: mockTopicManager
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
          topics: ['hello']
        })
        // Test the new UTXO was added
        expect(mockStorageEngine.insertOutput).toHaveBeenCalledWith(mockOutput)
      })
      it('Notifies lookup services about incoming admissible UTXOs', async () => {
        // Mock findUTXO to return a UTXO
        mockStorageEngine.findOutput = jest.fn(async () => mockOutput)
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
        expect(mockLookupService.outputAdded).toHaveBeenCalledWith(
          exampleTXID,
          0,
          exampleTX.outputs[0].lockingScript,
          'Hello'
        )
      })
      describe('For each consumed UTXO', () => {
        it('Finds the UTXO', async () => {
          // Mock findUTXO to return a UTXO
          mockStorageEngine.findOutput = jest.fn(async () => mockOutput)
          mockTopicManager.identifyAdmissibleOutputs = jest.fn(async () => {
            return {
              outputsToAdmit: [0],
              coinsToRetain: [0]
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
          expect(mockStorageEngine.findOutput).toHaveBeenCalledWith(examplePreviousTXID, 0, 'Hello')
        })
        it('Updates the UTXO to reflect that it is now additionally consumed by the newly-created UTXOs', async () => {
          // Mock findUTXO to return a UTXO
          mockStorageEngine.findOutput = jest.fn(async () => mockOutput)
          mockTopicManager.identifyAdmissibleOutputs = jest.fn(async () => {
            return {
              outputsToAdmit: [0],
              coinsToRetain: [0]
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
          expect(mockStorageEngine.updateConsumedBy).toHaveBeenCalledWith(examplePreviousTXID, 0, 'Hello', [{
            txid: exampleTXID,
            outputIndex: 0
          }])
        })
      })
      it('Inserts a new applied transaction to avoid de-duplication', async () => {
        // Mock findUTXO to return a UTXO
        mockStorageEngine.findOutput = jest.fn(async () => mockOutput)
        mockTopicManager.identifyAdmissibleOutputs = jest.fn(async () => {
          return {
            outputsToAdmit: [0],
            coinsToRetain: [0]
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
        expect(mockStorageEngine.insertAppliedTransaction).toHaveBeenCalledWith({
          txid: exampleTXID,
          topic: 'Hello'
        })
      })
      it('Returns a correct set of admitted topics and outputs', async () => {
        // Mock findUTXO to return a UTXO
        mockStorageEngine.insertOutput = jest.fn()
        mockStorageEngine.findOutput = jest.fn(async () => mockOutput)
        mockTopicManager.identifyAdmissibleOutputs = jest.fn(async () => {
          return {
            outputsToAdmit: [0],
            coinsToRetain: [0]
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
          Hello: {
            outputsToAdmit: [0],
            coinsToRetain: [0]
          }
        })
      })
    })

    describe('lookup', () => {
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
          service: 'HelloWorld',
          query: { name: 'Bob' }
        })).rejects.toThrow()
      })
      it('Calls the lookup function from the lookup service', async () => {
        // TODO: Make the default storage engine return something...?
        mockLookupService.lookup = jest.fn(async () => [{ txid: exampleTXID, outputIndex: 0 }])
        mockStorageEngine.findOutput = jest.fn(async () => mockOutput)
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
          service: 'Hello',
          query: { name: 'Bob' }
        })
        expect(mockLookupService.lookup).toHaveBeenCalledWith({
          service: 'Hello',
          query: { name: 'Bob' }
        })
      })
      describe('For each returned result', () => {
        it('Finds the identified UTXO by its txid and vout', async () => {
          // TODO: Make the default storage engine return something...?
          mockLookupService.lookup = jest.fn(async () => [{
            txid: 'mockTXID',
            outputIndex: 0,
            history: undefined
          }])
          mockStorageEngine.findOutput = jest.fn(async () => mockOutput)
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
            service: 'Hello',
            query: { name: 'Bob' }
          })
          expect(mockStorageEngine.findOutput).toHaveBeenCalledWith(
            "mockTXID", 0, undefined, false
          )
        })
        it('Calls getUTXOHistory with the correct UTXO and history parameters', async () => {
          mockLookupService.lookup = jest.fn(async () => [{
            txid: 'mockTXID',
            outputIndex: 0,
            history: undefined
          }])
          mockStorageEngine.findOutput = jest.fn(async () => mockOutput)
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
          engine.getUTXOHistory = jest.fn(async () => {
            return mockOutput
          })

          // Perform a lookup request
          await engine.lookup({
            service: 'Hello',
            query: { name: 'Bob' }
          })
          expect(engine.getUTXOHistory).toHaveBeenCalledWith(
            mockOutput,
            undefined,
            0
          )
        })
      })
      it('Returns the correct set of hydrated results', async () => {
        mockLookupService.lookup = jest.fn(async () => [{
          txid: 'mockTXID',
          outputIndex: 0,
          history: undefined
        }])
        mockStorageEngine.findOutput = jest.fn(async () => mockOutput)
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
        engine.getUTXOHistory = jest.fn(async () => {
          return mockOutput
        })

        // Perform a lookup request
        const results = await engine.lookup({
          service: 'Hello',
          query: { name: 'Bob' }
        })
        expect(results).toEqual({
          outputs: [{
            beef: mockOutput.beef,
            outputIndex: mockOutput.outputIndex
          }], type: 'output-list'
        })
      })
    })
    describe('getUTXOHistory', () => {
      it('Returns the given output if there is no history selector', async () => {
        // Already tested above
        return true
      })
      it('Invokes the history selector function with the correct data', async () => {
        const mockedHistorySelector = jest.fn(async (beef, outputIndex, currentDepth) => {
          if (currentDepth !== 2) {
            return true
          }
          return false
        })
        mockLookupService.lookup = jest.fn(async () => [{
          txid: 'mockTXID',
          outputIndex: 0,
          history: mockedHistorySelector
        }])
        mockStorageEngine.findOutput = jest.fn(async () => mockOutput)
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
          service: 'Hello',
          query: { name: 'Bob' }
        })
        expect(mockedHistorySelector).toHaveBeenCalledWith(
          mockOutput.beef,
          mockOutput.outputIndex,
          0
        )
        expect(mockedHistorySelector).toReturnWith(Promise.resolve(true))
      })
      it('Returns undefined if history should not be traversed', async () => {
        const mockedHistorySelector = jest.fn(async (beef, outputIndex, currentDepth) => {
          return false
        })
        mockLookupService.lookup = jest.fn(async () => [{
          txid: 'mockTXID',
          outputIndex: 0,
          history: mockedHistorySelector
        }])
        mockStorageEngine.findOutput = jest.fn(async () => mockOutput)
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
          service: 'Hello',
          query: { name: 'Bob' }
        })
        expect(mockedHistorySelector).toHaveBeenCalledWith(
          mockOutput.beef,
          mockOutput.outputIndex,
          0
        )
        expect(results).toEqual({
          outputs: [],
          type: "output-list"
        })
      })
      it('Returns undefined if the history selector is a number, and less than the current depth', async () => {
        mockLookupService.lookup = jest.fn(async () => [{
          txid: 'mockTXID',
          outputIndex: 0,
          history: -1
        }])
        mockStorageEngine.findOutput = jest.fn(async () => mockOutput)
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
          service: 'Hello',
          query: { name: 'Bob' }
        })
        expect(results).toEqual({
          outputs: [],
          type: "output-list"
        })
      })
      it('Returns the current output even if history should be traversed, if the current output is part of a transaction that does not consume any previous topical UTXOs', async () => {
        mockLookupService.lookup = jest.fn(async () => [{
          txid: 'mockTXID',
          outputIndex: 0,
          history: 1
        }])
        mockStorageEngine.findOutput = jest.fn(async () => mockOutput)
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
          service: 'Hello',
          query: { name: 'Bob' }
        })

        expect(results).toEqual({
          outputs: [{
            beef: mockOutput.beef,
            outputIndex: mockOutput.outputIndex
          }], type: 'output-list'
        })
      })
      // it('Traversing history, calls findOutput with any output consumed by this UTXO', async () => {
      //   mockLookupService.lookup = jest.fn(async () => [{
      //     txid: 'mockTXID',
      //     outputIndex: 0,
      //     history: 1
      //   }])
      //   mockStorageEngine.findOutput = jest.fn(async () => ({
      //     ...mockOutput,
      //     outputsConsumed: [{
      //       txid: examplePreviousTXID,
      //       outputIndex: 0
      //     }]
      //   }))
      //   const engine = new Engine(
      //     {
      //       Hello: mockTopicManager
      //     },
      //     {
      //       Hello: mockLookupService
      //     },
      //     mockStorageEngine,
      //     mockChainTracker
      //   )

      //   // Perform a lookup request
      //   await engine.lookup({
      //     service: 'Hello',
      //     query: { name: 'Bob' }
      //   })

      //   expect(mockStorageEngine.findOutput).toHaveBeenCalledWith()
      // })
      // it('Returns the correct envelope based on the history traversal process', async () => {
      //   // TODO: Come up with some test data for a simple case, but different than the above code.
      // })
      // it('Returns the correct envelope based on the history traversal process for a more complex multi-layer multi-output graph', async () => {
      //   // TODO: Come up with some test data to test the history traversal process better
      // })
    })
    // describe('deleteUTXODeep', () => {
    //   it('Finds UTXO by ID if no output was provided', async () => {

    //   })
    //   it('Finds UTXO by TXID and VOUT if no ID was provided', async () => {

    //   })
    //   it('Throws an error if no output can be found', async () => {

    //   })
    //   describe('When no more UTXOs are consumed by this UTXO', () => {
    //     it('Deletes the UTXO by ID from the storage engine', async () => {

    //     })
    //     it('Notifies all lookup services about the deletion of the UTXO', async () => {

    //     })
    //   })
    //   it('For each UTXO that this UTXO consumes, finds the consumed UTXO by its ID and removes reference to this one', async () => {

    //   })
  })
})
