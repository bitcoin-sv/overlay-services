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
      findOutputsForTransaction: jest.fn(async () => []),
      markUTXOAsSpent: jest.fn(),
      updateConsumedBy: jest.fn(),
      updateOutputBeef: jest.fn(),
      deleteOutput: jest.fn()
    }
  })
  describe('handleNewMerkleProof tests', () => {
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
    it('0 simple proof', async () => {
      const beef = beef27c8f_1
      const txid = txid27c8f
      const tx = Transaction.fromHexBEEF(beef)

      const output27c8f_0: Output = {
        txid: txid,
        outputIndex: 0,
        outputScript: tx.outputs[0].lockingScript.toBinary(),
        topic: 'hello',
        satoshis: tx.outputs[0].satoshis as number,
        beef: tx.toBEEF(),
        spent: false,
        outputsConsumed: [],
        consumedBy: []
      }

      mockLookupService.lookup = jest.fn(async () => [{
        txid: txid,
        outputIndex: 0,
        history: 1
      }])
      let newBEEF: number[] = []
      mockStorageEngine.findOutput = jest.fn(async () => output27c8f_0)
      mockStorageEngine.findOutputsForTransaction = jest.fn(async () => [output27c8f_0])
      mockStorageEngine.updateOutputBeef = jest.fn(async (txid: string, outputIndex: number, topic: string, beef: number[]) => {
        newBEEF = beef
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

      const merklePath = Transaction.fromHexBEEF(beef27c8f_0).merklePath
      if (!merklePath) throw('improper test setup')
      await engine.handleNewMerkleProof(txid, merklePath)
      expect(newBEEF.length > 0 && newBEEF.length < beef.length / 2).toBe(true)
    })
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

// beef27c8f_1 is 1 level deep, i.e. proofs on inputs
const beef27c8f_1 = '0100beef01feafcf0c000802020044ef36fc6c79af360b13f2164c6e772e6e5e2083a54d72894f34710fe6a68cf80302792c8c563b17721744d8f101d79e873aae62816d0fd47dd9d90ada219c1b252d010000059e83aae2cfc6a35477566439dd9d58969cc41a134864c671c9b844f2a409a60101004991c129bba819832d6dd315c3a2065bd31b1a60aff8192be335f83731641e690101002f87724a7387df82417902266d2a4fb2fee857451e963a352ce8acbb279aa9eb010100a9e9eb55d20cef840bacbdb26ad8d6e7680ef7653364830b1e770fa140ece6bb010100f0ecd03fff2df21b0034d331cade50152781be9052dcec54eb95c963ef1cdcbf0101006fdb2c01a266e761a32f53b3ad0fabbca31ae234d31d85d9af9bbd624b321c9b0101008108cad77aabf7b0ee371f42afd773cada534244535f7108c7590df2b9d5f8a2020100000006e9847b33c5d666ccee1dccd52235489d8d58bf432be1b8c0cc7c13af80f10703030000006b483045022100fe8a18e043d693246a56c9b32ff553bea89a0bbe389bc55e8244044dcd865de3022065245c30fbbcc6820e4761048ed28c587bf41ece1933dfb85b8fa8c3433d93504121022f2ac22e73a55aa4ff21e905f66959200642ae74716544f834a48af5aa53fb27ffffffff7e8823d7e3e5565fdb9e53c015ad5b63bc6dd6ee1a9be7f7a8e105c903783d45050000006b483045022100e6332a6459350ff2486a39b6d79cdc0b65b6d52cf898fc457e45880c0db01b2a02206e34126bc81e6f03c6de90278788d6b2be3a3f5d7bd85e6442bbea90b8a5e2394121029780a1a98be5ff17a3228feb830e3bc32395ebecc5cf6de08f7a5685faf66c07ffffffff7e8823d7e3e5565fdb9e53c015ad5b63bc6dd6ee1a9be7f7a8e105c903783d45040000006b483045022100dfba71c6c33d2366b2202ea136271fd2f3a26c0a7295f6dd6018fbe12fc48708022052387ca532247bbfffef4b076fd2fbbdebe85b3cf53c73004897cd07be5d1ad6412103f735eb69c9f0b3c90dd2798b709e12a5b3d176a4690bd2a31ec616af9ecd47b5ffffffff7e8823d7e3e5565fdb9e53c015ad5b63bc6dd6ee1a9be7f7a8e105c903783d45020000006b483045022100f941b74c5da1e7f0ce4d1c08745e4d6b8ef56656199505caeff4b74f54890cec02201eaa0d01112497c89ebe4818687c5f3305629a83abd3b0bf5135feee68f57ca0412103fb0ec51f9e6e45b213cb1deff921e3322624cfb6d4a4ba5dc699867cf163b736ffffffff7e8823d7e3e5565fdb9e53c015ad5b63bc6dd6ee1a9be7f7a8e105c903783d45030000006a47304402205a3a2848350fdc19cae73243bea16dfc1e8fbbd5cecde4b5c88a57790505cebb022043db51d04998d52ec394d0e945a76e9922dd63caffb882242bec2ced2a35c7f1412102bae3e2f47dceaed7db2a212e059a00674a0087e3395b92d9f12cdbefdbc84efaffffffffad49b6f41125ffadab03cb2dcc24caf2c897c2cd4aed6e0a3b5c003f2dde757a030000006b483045022100aa7aaec7fc6c5a2f4d5318b7fcbbca0f223c5c198f8fc0e1c8d59aee7155af1202207a4960fb58aa86eba12852f84fa3cdb4c427c7374fe737b3d5bcd9e2a6d76e3b412102b55cfd872e85b3dd424dcceafe01ed5a87dfb599d354ab7fc50d9ec48af77f6effffffff1a400d0300000000001976a914f182138abcb69c7c2339040605aa0a442cfec44288acc8000000000000001976a914e9d2276f468223a6d650672ab9d4c1271fb157e288acacb00000000000001976a914c0ea0208a097df8146933ae15f3ce545d5451e7388ac7a140000000000001976a9142d9ae3291f9393639fe2c38c9a7a948d136a10b488acea070000000000001976a91435d1c396b7ccb467118a41c2d77ebf79fb5fb7eb88ac17050000000000001976a9140dac1e2ddc975ee6d9f393e2ccd4876edb386cdd88ac51060000000000001976a91422878cb2f57a1ebe513815562003128f6e99eda188ac67040000000000001976a91439a752923ba1ef8b126ba7886646d58f54521c6588ac1e040000000000001976a914a939565af52d3fa974a040f42c35365d76b98f6a88acec030000000000001976a914c90823a53e29cafd35a225cc14e3a44eda143a5788ac05040000000000001976a914af6f8d6aaec3bf123efc17c8977bfad1ec1c859388acec030000000000001976a914d4c5e66a062e634be1c6f0eb1f2af0acebecb47988acf1030000000000001976a914a94a3e84bd740095ab39bed110cd3b3922c8595088ace8030000000000001976a914aa2e3c3bf6f3ee79f5af3b94eab2be60a394ce4c88aceb030000000000001976a91459394fa083ff3726571c79624dba3b38f14d924c88ace8030000000000001976a914726eb3ae6211711aa1624f3d767035b0b44abdc488ace8030000000000001976a9145f4680a099a6dc6891af3094aaab96aa66a6259888ace8030000000000001976a914f1a4fbd99e3923b0934abdb8839c337eb2fd50b888ace8030000000000001976a9147ed0ad307f5fe9993f984e7525c0012e3569594588ace8030000000000001976a91407f386bcdc4892cc2d0be3226b721ceaf04750b288ace8030000000000001976a914b51edaaa3c92d0af94109d952c7ddf13aa345f9988ace8030000000000001976a914018f4e02bd74f17a75f5b3965db4633ab514c57588ace8030000000000001976a914cc8d1f7ba5406b81efbc23da0fcccb4d3fe5b40a88ace8030000000000001976a914db1d4b7bd3e62f535dc3f2c8d0a989b000fa736d88ace8030000000000001976a914b8ea69358da7bea9506b15db6fc6597b3849b0a188ace8030000000000001976a914ecd769fdd67e04786e871c50c1a10504861bd79488ac0000000001000100000001792c8c563b17721744d8f101d79e873aae62816d0fd47dd9d90ada219c1b252d070000006b48304502210090368b5925795abb0415a3cd6265d7abae7d3541fb7f2fdb1fdffdd916b3fce3022068136da44df8ee367807c7c59c950ea8d428adfe142268cd6371cf4c1b4c3208412102858ea1804708d1e16e77b49ba1559b3742797f5f43efd3922fa3d21557521d7cffffffff03f401000000000000fde10121026afd108ddbc05e093207ebdf06557a3d66e15b96accbf1766c2e7d6efa3d1981ac22313852713463583334356b6a7461734467764b41455a435135564c5a72516f76786d2081d846bcae65ce281829b6d81eff3862a68b8eaf4e99ad97c0c4ad2e149631c020f936ace2d2b4034710dec819e343f69ddbb1a16d721b88413b697c2475f75f504c4e8470062e6966cb7ec80864e5e1217ecf2b3f113bb5307e1ec1d338678e54b426a11a267e990f7dcd85072c7b3870fabb54812d7f8a7aaa672ce01e4f8a2c6a1d532849877329bd23be0b3383fcb437ffd1ff05aad824343bfe5bae52d5775ed99ba9d5a72038dd50f81153e674a8b1c5d659aac361e660cc5657b291eda149de2505efb0bbac0a353331393633353238334c797f3040f01934bb25733d4700a0309194a7defd8ceea7a8a59ad279c6237e2917264a115773777c5746546288b15ec1cf6788b801dd3952fec804cadbba2ff4e05464735e2db83c3509b59119efc843716c34becd2884f011f2e7f61f382237891875115b6ea5bac1c3e9ca6c575b44547d589c38c1b5a8cadb463044022016e1fdb226b465f3151aaa1e033b122dd58f3b495d2846d532f784ec8f6fc9ae022031dc12155c02e7f588c9f6d975a79c9c26cf341c1c88578cd6a87a3c01f6a73d6d6d6d6dc8000000000000001976a914010b7bfa8ff585b6d95f8a18a998cbd87508bd4188aca9010000000000001976a914254c6f1ce67d27ae4dafb03d2ba08318df2883c588ac0000000000'
// beef27c8f_0 is 0 levels deep, i.e. tx has merklePath
const beef27c8f_0 = '0100beef01fef4f10c000902fd020100ab2d9b3bbfc2ecf5c834f7719bf10dcabef31cfa3b78fa714bd3a2b3958fc6b5fd0301029515629d935d81e704ca97b8dc02a698c39d78f06bbb3d8d46bcaa5178f3c827018000fc94b1da08b5d0850afcc4948a9e129a2c2c0bb629090ca84fef5d326ceadbc2014100fa78356192a22189dd3c2a03bfb2e043667a55a85386a8d0f0853bbaa54ba748012100e37888006acc37cbfc6a459117c3e957b00e8ff3a90d93bc9aaa3fc9d972453701110052564e444cbe4b1f24015d91f5cfd7eff63e5f403613a7b48e77efa32761f950010900acef65445ef232f1fcb527bab67fccc90ae9d0c610a4f752d84c5e10a3415d74010500e1fadd176551150808ae96ff2b4dff487c432788d23db25fd3fb5e8b3e16b96f0103003e530f146a992ed9378807fa43bc1e6033de0711d728ee3a0ea1507b5ffff2940100006c8eca8a9d680ab2ae4dc1f0e247f282de3f32b99175e6f9ddb4f8e76ae0bf1b010100000001792c8c563b17721744d8f101d79e873aae62816d0fd47dd9d90ada219c1b252d070000006b48304502210090368b5925795abb0415a3cd6265d7abae7d3541fb7f2fdb1fdffdd916b3fce3022068136da44df8ee367807c7c59c950ea8d428adfe142268cd6371cf4c1b4c3208412102858ea1804708d1e16e77b49ba1559b3742797f5f43efd3922fa3d21557521d7cffffffff03f401000000000000fde10121026afd108ddbc05e093207ebdf06557a3d66e15b96accbf1766c2e7d6efa3d1981ac22313852713463583334356b6a7461734467764b41455a435135564c5a72516f76786d2081d846bcae65ce281829b6d81eff3862a68b8eaf4e99ad97c0c4ad2e149631c020f936ace2d2b4034710dec819e343f69ddbb1a16d721b88413b697c2475f75f504c4e8470062e6966cb7ec80864e5e1217ecf2b3f113bb5307e1ec1d338678e54b426a11a267e990f7dcd85072c7b3870fabb54812d7f8a7aaa672ce01e4f8a2c6a1d532849877329bd23be0b3383fcb437ffd1ff05aad824343bfe5bae52d5775ed99ba9d5a72038dd50f81153e674a8b1c5d659aac361e660cc5657b291eda149de2505efb0bbac0a353331393633353238334c797f3040f01934bb25733d4700a0309194a7defd8ceea7a8a59ad279c6237e2917264a115773777c5746546288b15ec1cf6788b801dd3952fec804cadbba2ff4e05464735e2db83c3509b59119efc843716c34becd2884f011f2e7f61f382237891875115b6ea5bac1c3e9ca6c575b44547d589c38c1b5a8cadb463044022016e1fdb226b465f3151aaa1e033b122dd58f3b495d2846d532f784ec8f6fc9ae022031dc12155c02e7f588c9f6d975a79c9c26cf341c1c88578cd6a87a3c01f6a73d6d6d6d6dc8000000000000001976a914010b7bfa8ff585b6d95f8a18a998cbd87508bd4188aca9010000000000001976a914254c6f1ce67d27ae4dafb03d2ba08318df2883c588ac000000000100'
// full txid
const txid27c8f = '27c8f37851aabc468d3dbb6bf0789dc398a602dcb897ca04e7815d939d621595'