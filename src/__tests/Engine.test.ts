// Note: References Engine from dist due to issues with compiled code references in Engine.ts
import { Engine } from '../../dist/cjs/src/Engine.js'
import { LookupService } from '../LookupService'
import { TopicManager } from '../TopicManager'
import { Storage } from '../storage/Storage'
import { Transaction, Utils, TaggedBEEF, AdmittanceInstructions, STEAK } from '@bsv/sdk'
import { Output } from '../Output'
import { SyncConfiguration } from '../SyncConfiguration'
import { Advertiser } from '../Advertiser.js'

const mockChainTracker = {
  isValidRootForHeight: jest.fn(async () => true),
  currentHeight: jest.fn(async () => 800000)
}

const BRC62Hex = '0100beef01fe636d0c0007021400fe507c0c7aa754cef1f7889d5fd395cf1f785dd7de98eed895dbedfe4e5bc70d1502ac4e164f5bc16746bb0868404292ac8318bbac3800e4aad13a014da427adce3e010b00bc4ff395efd11719b277694cface5aa50d085a0bb81f613f70313acd28cf4557010400574b2d9142b8d28b61d88e3b2c3f44d858411356b49a28a4643b6d1a6a092a5201030051a05fc84d531b5d250c23f4f886f6812f9fe3f402d61607f977b4ecd2701c19010000fd781529d58fc2523cf396a7f25440b409857e7e221766c57214b1d38c7b481f01010062f542f45ea3660f86c013ced80534cb5fd4c19d66c56e7e8c5d4bf2d40acc5e010100b121e91836fd7cd5102b654e9f72f3cf6fdbfd0b161c53a9c54b12c841126331020100000001cd4e4cac3c7b56920d1e7655e7e260d31f29d9a388d04910f1bbd72304a79029010000006b483045022100e75279a205a547c445719420aa3138bf14743e3f42618e5f86a19bde14bb95f7022064777d34776b05d816daf1699493fcdf2ef5a5ab1ad710d9c97bfb5b8f7cef3641210263e2dee22b1ddc5e11f6fab8bcd2378bdd19580d640501ea956ec0e786f93e76ffffffff013e660000000000001976a9146bfd5c7fbe21529d45803dbcf0c87dd3c71efbc288ac0000000001000100000001ac4e164f5bc16746bb0868404292ac8318bbac3800e4aad13a014da427adce3e000000006a47304402203a61a2e931612b4bda08d541cfb980885173b8dcf64a3471238ae7abcd368d6402204cbf24f04b9aa2256d8901f0ed97866603d2be8324c2bfb7a37bf8fc90edd5b441210263e2dee22b1ddc5e11f6fab8bcd2378bdd19580d640501ea956ec0e786f93e76ffffffff013c660000000000001976a9146bfd5c7fbe21529d45803dbcf0c87dd3c71efbc288ac0000000000'
const exampleTX = Transaction.fromHexBEEF(BRC62Hex)

const exampleBeef = exampleTX.toBEEF()
const exampleTXID = exampleTX.id('hex')
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

const invalidHostingUrls = [
  "http://example.com",               // Invalid: http
  "https://localhost:3000",           // Invalid: localhost
  "https://192.168.1.1",              // Invalid: internal private IP
  "https://127.0.0.1",                // Invalid: loopback IP
  "https://0.0.0.0",                  // Invalid: non-routable IP
  "http://172.16.0.1",                // Invalid: private IP
  "[::1]"
]


const validHostingUrls = [
  "https://example.com",              // Valid: public URL
  "https://8.8.8.8",                  // Valid: public routable IP
  "https://255.255.255.255",          // Valid: public routable IP
]

const mockAdvertiser: Advertiser = {
  createAdvertisements: jest.fn(async (): Promise<TaggedBEEF> => ({ beef: [0, 1, 2], topics: [] })),
  revokeAdvertisements: jest.fn(async (): Promise<TaggedBEEF> => ({ beef: [0, 1, 2], topics: [] })),
  findAllAdvertisements: jest.fn(async () => []),
  parseAdvertisement: jest.fn()
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
      updateTransactionBEEF: jest.fn(),
      deleteOutput: jest.fn(),
      findUTXOsForTopic: jest.fn()
    }
  })

  it('engine.syncAdvertisements should return void when invalid hostingURL is provided', async () => {
    for (const url of invalidHostingUrls) {
      const engine = new Engine(
        { tm_helloworld: mockTopicManager },
        { ls_helloworld: mockLookupService },
        mockStorageEngine,
        mockChainTracker,
        url, // Invalid hostingURL
        ['tracker1'], // shipTrackers
        ['tracker2'], // slapTrackers
        undefined,
        mockAdvertiser,
        undefined
      )

      engine.submit = jest.fn(async (taggedBEEF: TaggedBEEF, onSteakReady: any, mode?: string) => ({ 'tm_helloworld': { outputsToAdmit: [], coinsToRetain: [], coinsRemoved: [] } } as STEAK))

      // Call the method that would normally trigger syncAdvertisements
      const result = await engine.syncAdvertisements()

      expect(result).toBeUndefined()

      // Verify that Advertiser methods are NOT called
      expect(mockAdvertiser.createAdvertisements).not.toHaveBeenCalled()
      expect(mockAdvertiser.findAllAdvertisements).not.toHaveBeenCalledWith('SHIP') // Assuming 'SHIP' is expected
    }
  })

  it('should allow engine.syncAdvertisements to proceed with valid hostingURLs', async () => {
    const mockAdvertiser: Advertiser = {
      createAdvertisements: jest.fn().mockResolvedValue({ tag: 'MOCK_TAG', data: Buffer.from('mock data') }),
      findAllAdvertisements: jest.fn().mockResolvedValue([]),
      revokeAdvertisements: jest.fn().mockResolvedValue({ tag: 'MOCK_REVOKE_TAG', data: Buffer.from('revocation data') }),
      parseAdvertisement: jest.fn().mockReturnValue({
        protocol: 'SHIP',
        topicOrServiceName: 'mock-topic',
        timestamp: Date.now(),
      }),
    }

    for (const url of validHostingUrls) {
      const engine = new Engine(
        { tm_helloworld: mockTopicManager },
        { ls_helloworld: mockLookupService },
        mockStorageEngine,
        mockChainTracker,
        url, // Valid hostingURL
        ['tracker1'], // shipTrackers
        ['tracker2'], // slapTrackers
        undefined,
        mockAdvertiser, // Pass the mock Advertiser
        undefined
      )

      // Call the method that would normally trigger syncAdvertisements
      engine.submit = jest.fn(async (taggedBEEF: TaggedBEEF, onSteakReady: any, mode?: string) => ({ 'tm_helloworld': { outputsToAdmit: [], coinsToRetain: [], coinsRemoved: [] } } as STEAK))
      const result = await engine.syncAdvertisements()
      expect(engine.submit).toHaveBeenCalled()

      // Verify that Advertiser methods are called
      expect(mockAdvertiser.createAdvertisements).toHaveBeenCalled()
      expect(mockAdvertiser.findAllAdvertisements).toHaveBeenCalledWith('SHIP') // Assuming 'SHIP' is expected
    }
  })

  it('Uses SHIP sync configuration by default if no syncConfiguration was provided', () => {
    const engine = new Engine(
      { tm_helloworld: mockTopicManager },
      { ls_helloworld: mockLookupService },
      mockStorageEngine,
      mockChainTracker,
      undefined, // hostingURL
      ['tracker1'], // shipTrackers
      ['tracker2'], // slapTrackers
      undefined,
      undefined,
      undefined
    )

    expect(engine.syncConfiguration).toEqual({ tm_helloworld: 'SHIP' })
  })

  it('Does not set sync method to "SHIP" for topic managers set to false in the syncConfiguration', () => {
    const syncConfiguration: SyncConfiguration = { tm_helloworld: false }
    const engine = new Engine(
      { tm_helloworld: mockTopicManager },
      { ls_helloworld: mockLookupService },
      mockStorageEngine,
      mockChainTracker,
      undefined, // hostingURL
      ['tracker1'], // shipTrackers
      ['tracker2'], // slapTrackers
      undefined,
      undefined,
      syncConfiguration
    )

    expect(engine.syncConfiguration).toEqual({ tm_helloworld: false })
  })

  it('Combines existing trackers with provided shipTrackers and slapTrackers, ensuring no duplicates', () => {
    const syncConfiguration: SyncConfiguration = { tm_ship: ['existingTracker1'], tm_slap: ['existingTracker2'] }
    const engine = new Engine(
      { tm_ship: mockTopicManager, tm_slap: mockTopicManager },
      { ls_ship: mockLookupService, ls_slap: mockLookupService },
      mockStorageEngine,
      mockChainTracker,
      undefined, // hostingURL
      ['tracker1', 'existingTracker1'], // shipTrackers
      ['tracker2', 'existingTracker2'], // slapTrackers
      undefined,
      undefined,
      syncConfiguration
    )

    expect(engine.syncConfiguration).toEqual({
      tm_ship: ['existingTracker1', 'tracker1'],
      tm_slap: ['existingTracker2', 'tracker2']
    })
  })

  it('Sets undefined topic managers in syncConfiguration to sync method of "SHIP" by default', () => {
    const syncConfiguration: SyncConfiguration = { tm_helloworld: 'SHIP' }
    const engine = new Engine(
      { tm_helloworld: mockTopicManager, tm_ship: mockTopicManager, tm_slap: mockTopicManager },
      { ls_helloworld: mockLookupService, ls_ship: mockLookupService, ls_slap: mockLookupService },
      mockStorageEngine,
      mockChainTracker,
      undefined, // hostingURL
      ['tracker1'], // shipTrackers
      ['tracker2'], // slapTrackers
      undefined,
      undefined,
      syncConfiguration
    )

    expect(engine.syncConfiguration).toEqual({
      tm_helloworld: 'SHIP',
      tm_ship: ['tracker1'],
      tm_slap: ['tracker2']
    })
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
        txid,
        outputIndex: 0,
        outputScript: tx.outputs[0].lockingScript.toBinary(),
        topic: 'hello',
        satoshis: tx.outputs[0].satoshis,
        beef: tx.toBEEF(),
        spent: false,
        outputsConsumed: [],
        consumedBy: []
      }

      mockLookupService.lookup = jest.fn(async () => [{
        txid,
        outputIndex: 0,
        history: 1
      }])
      let newBEEF: number[] = []
      mockStorageEngine.findOutput = jest.fn(async () => output27c8f_0)
      mockStorageEngine.findOutputsForTransaction = jest.fn(async () => [output27c8f_0])
      mockStorageEngine.updateTransactionBEEF = jest.fn(async (txid: string, beef: number[]) => {
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
      if (!merklePath) throw ('improper test setup')
      await engine.handleNewMerkleProof(txid, merklePath)
      expect(newBEEF.length > 0 && newBEEF.length < beef.length / 2).toBe(true)
    })

    it('1 recurse proof', async () => {
      const outputs: Output[] = []
      const findOutput = (txid: string, outputIndex: number, includeBEEF?: boolean): Output => {
        const i = outputs.findIndex(o => o.txid === txid && o.outputIndex === outputIndex)
        if (i < 0) throw new Error(`missing output ${txid} ${outputIndex}`)
        return outputs[i]
      }

      const addConsumingOutput = (tx: Transaction, outputIndex: number, consumes?: Output): Output => {
        const o: Output = {
          txid: tx.id('hex'),
          outputIndex,
          outputScript: tx.outputs[outputIndex].lockingScript.toBinary(),
          topic: 'hello',
          satoshis: tx.outputs[outputIndex].satoshis as number,
          beef: tx.toBEEF(),
          spent: false,
          outputsConsumed: [],
          consumedBy: []
        }
        if (consumes) {
          const c = findOutput(consumes.txid, consumes.outputIndex)
          c.consumedBy.push(o)
          o.outputsConsumed.push(c)
        }
        outputs.push(o)
        return o
      }

      mockLookupService.lookup = jest.fn(async () => [{ txid: txid17d182, outputIndex: 0, history: 1 }])
      const newBEEF: Record<string, string> = {}
      mockStorageEngine.findOutput = jest.fn(async (txid: string, outputIndex: number, topic?: string, spent?: boolean, includeBEEF?: boolean) => {
        return findOutput(txid, outputIndex, true)
      })
      mockStorageEngine.findOutputsForTransaction = jest.fn(async (txid: string, includeBEEF?: boolean) => {
        const os = outputs.filter(o => o.txid === txid)
        return os
      })
      mockStorageEngine.updateTransactionBEEF = jest.fn(async (txid: string, beef: number[]) => {
        newBEEF[txid] = Utils.toHex(beef)
      })
      const engine = new Engine({ Hello: mockTopicManager }, { Hello: mockLookupService }, mockStorageEngine, mockChainTracker)

      /*
        txid 17d1829ba8424b97369ee8b528ee8b65d9d4b9c08d037d224a7be7c025f78f78 output 0 1196 sats
          txid 9426201003b01e5bb66e9240a1cc337174238e816a25a06ba532fa67af4457d7 output 0 1197 sats
            txid 509f5ef79c18504fdfe21e67608f56bacb8d8a200634e46f60a9dc8430dcd6e9 output 0 1198 sats
              txid 877734db8eb917d0e2174a4bdddc085b34f67cedd6b94628c4feb1b979a2b2c5 output 0 1199 sats
                txid 37abad7168d47d4e107d0f9f96813a4feef6ea346482fce554c3fade85d45409 output 0 1200 sats
                  txid d786db393ec7f1315bee2cbd3aa47634394f57c861feed8c075563308f14c237 output 0 1568 sats
                  txid a7d4cac391f5b3d8dedaacb3cd8b5afac54df2d8e043ae0452abcfe190686494 output 17 1132 sats
      */

      const tx17d182 = Transaction.fromHexBEEF(beef17d182_4)
      const tx942620 = tx17d182.inputs[0].sourceTransaction
      const tx509f5e = tx942620.inputs[0].sourceTransaction
      const tx877734 = tx509f5e.inputs[0].sourceTransaction
      const tx37abad = tx877734.inputs[0].sourceTransaction

      const output37abad_0 = addConsumingOutput(tx37abad, 0)
      const output877734_0 = addConsumingOutput(tx877734, 0, output37abad_0)
      const output509f5e_0 = addConsumingOutput(tx509f5e, 0, output877734_0)
      const output942620_0 = addConsumingOutput(tx942620, 0, output509f5e_0)
      const output17d182_0 = addConsumingOutput(tx17d182, 0, output942620_0)

      const mp37abad = Transaction.fromHexBEEF(beef37abad_0).merklePath
      await engine.handleNewMerkleProof(txid37abad, mp37abad)
      expect(Object.keys(newBEEF).length).toBe(0)

      const mp877734 = Transaction.fromHexBEEF(beef877734_0).merklePath
      await engine.handleNewMerkleProof(txid877734, mp877734)
      expect(newBEEF[`${txid877734}`]).toBe(beef877734_0)
      expect(newBEEF[`${txid509f5e}`].length).toBeGreaterThan(beef509f5e_0.length)
      expect(newBEEF[`${txid942620}`].length).toBeGreaterThan(beef942620_0.length)
      expect(newBEEF[`${txid17d182}`].length).toBeGreaterThan(beef17d182_0.length)
      expect(Object.keys(newBEEF).length).toBe(4)

      const mp509f5e = Transaction.fromHexBEEF(beef509f5e_0).merklePath
      await engine.handleNewMerkleProof(txid509f5e, mp509f5e)
      expect(newBEEF[`${txid877734}`]).toBe(beef877734_0)
      expect(newBEEF[`${txid509f5e}`]).toBe(beef509f5e_0)
      expect(newBEEF[`${txid942620}`].length).toBeGreaterThan(beef942620_0.length)
      expect(newBEEF[`${txid17d182}`].length).toBeGreaterThan(beef17d182_0.length)
      expect(Object.keys(newBEEF).length).toBe(4)

      const mp942620 = Transaction.fromHexBEEF(beef942620_0).merklePath
      await engine.handleNewMerkleProof(txid942620, mp942620)
      expect(newBEEF[`${txid877734}`]).toBe(beef877734_0)
      expect(newBEEF[`${txid509f5e}`]).toBe(beef509f5e_0)
      expect(newBEEF[`${txid942620}`]).toBe(beef942620_0)
      expect(newBEEF[`${txid17d182}`].length).toBeGreaterThan(beef17d182_0.length)
      expect(Object.keys(newBEEF).length).toBe(4)

      const mp17d182 = Transaction.fromHexBEEF(beef17d182_0).merklePath
      await engine.handleNewMerkleProof(txid17d182, mp17d182)
      expect(newBEEF[`${txid877734}`]).toBe(beef877734_0)
      expect(newBEEF[`${txid509f5e}`]).toBe(beef509f5e_0)
      expect(newBEEF[`${txid942620}`]).toBe(beef942620_0)
      expect(newBEEF[`${txid17d182}`]).toBe(beef17d182_0)
      expect(Object.keys(newBEEF).length).toBe(4)
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
            coinsToRetain: [0],
            coinsRemoved: []
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
            'mockTXID', 0, undefined, undefined, true
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
          }],
          type: 'output-list'
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
          type: 'output-list'
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
          type: 'output-list'
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
          }],
          type: 'output-list'
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

/*
  txid 17d1829ba8424b97369ee8b528ee8b65d9d4b9c08d037d224a7be7c025f78f78 output 0 1196 sats
    txid 9426201003b01e5bb66e9240a1cc337174238e816a25a06ba532fa67af4457d7 output 0 1197 sats
      txid 509f5ef79c18504fdfe21e67608f56bacb8d8a200634e46f60a9dc8430dcd6e9 output 0 1198 sats
        txid 877734db8eb917d0e2174a4bdddc085b34f67cedd6b94628c4feb1b979a2b2c5 output 0 1199 sats
          txid 37abad7168d47d4e107d0f9f96813a4feef6ea346482fce554c3fade85d45409 output 0 1200 sats
            txid d786db393ec7f1315bee2cbd3aa47634394f57c861feed8c075563308f14c237 output 0 1568 sats
            txid a7d4cac391f5b3d8dedaacb3cd8b5afac54df2d8e043ae0452abcfe190686494 output 17 1132 sats
*/
const txid17d182 = '17d1829ba8424b97369ee8b528ee8b65d9d4b9c08d037d224a7be7c025f78f78'
const beef17d182_0 = '0100beef01feaff60c000c02fd660302788ff725c0e77b4a227d038dc0b9d4d9658bee28b5e89e36974b42a89b82d117fd670300fe2b9c31ae10a15803f91f63df0cf6a5b6771db9dd831e5bc37a36460a1ffa0701fdb201009bf0e3a5854c4b4c8d62c0ade2754ae1bbc0f16a3e49251ed964486b8dc387f101d80003ae2ec810744139e9989e4f36d8f5ebb160981481e68647890d11e3dda971fa016d0081efcddc14858ead1f427f235d2b21c8de43e33bfeb155ed79f666dd4dd490c2013700a6a847f6e264cfa64c0b6aad6b74912c63c6fc89728be813d104abd2724b98a5011a0062c7d393b9518b05d2d0891ae8c2cd840c93e051d2944bb8e651c976301c4e50010c008d8ee79c1a042cf43f4dcd880aeb4ff7f54552cd3a4c9a40c72cc16ed6847cee01070050194d11d12eddf5e56926b28778f0f64ad54e79eb4df4ce7834ddfc57bf882d010200bd66a0cdbb0af933166931b1050dd108e02d76cff19afd614e681fcbdf1be0740100008b36364159630b47b4c27f6e1e056e820b0aa350ab5dde2520fc1753129b628c010100cab620ac48bb55de40c8c5ddb62bbc44c907fbf5d882326d427f4cd4b34334800101001163b76c2c6824c07a53af2ea86da1b1d946340d9377d3b9b84560e074aea3a6010100000001d75744af67fa32a56ba0256a818e23747133cca140926eb65b1eb00310202694000000006a473044022027137acdeb7583e966a9e8825c9f5edb909b2fd46d40e6ee83846d164529630e0220644e82a46d813fac2836650ce832cdba7eb46b6c134982b36e84f5f08a921dbb412102b963cd9b5a1419c041a4c4ac46f5205a2b8cb691cd5633e5d498ddcf3d37460b0000000001ac040000000000001976a914ae0545a670c6f739f9a8963aee37be95df0d9b2a88ac000000000100'
const beef17d182_4 = '0100beef01fedcee0c000d02f8020954d485defac354e5fc826434eaf6ee4f3a81969f0f7d104e7dd46871adab37f900fa225908f222f8f7f291731a10e93cdf410189ca01adc688edf5577552aa8ff2017d006cfea8ad6ace7ecce9bbbe729eb9dca25f9be064b150d290588c3364867ee112013f00bfbacc8bfdda7f734c160fcfee972dd9182aede73290367aab62b5ce242e5655011e007a0eb94f2bcf98489247a01551a843d9cf1e091522c32f50ce347ba5057b439d010e00beb857ba543d2bd199e68c63a480c73b83660eca27d2ce105355741f27017876010600d5fb1ea8440e41b4ffde093dd53d6ed741c4fe4fe66ff43f6a4eb9af3c6ddebb010200169db3be130a9e8aff1dbff39abee477d3a224cb3e118c39794bb7ba427b707501000083cd0ce2d2734835c45331cd06f38556cf4e07634d599f59692ad9980175a7f201010022f4a629e99ca5838f56f87b050bdefa9b9f621c08745cb27b941d9c6750d99a01010032b90a4148ff984b0efee309a578cb87d278142c014f1a7fd5351b3e3cd4c7da01010082dc3ea570250357fca88652ee1628928136c29eb4910b7e5627e0ffef1d958a010100f5194f41c28960f0dba669f4715229f59f59afb5d55f50a2a7556111b8da67130101009cd7f9a65014cc6fd5c0b71391d0b70eb983ea3b03a2fbd7a13150775855953405010000000237c2148f306355078cedfe61c8574f393476a43abd2cee5b31f1c73e39db86d7000000006a47304402207ee089c64fa810ad88e03f7bad4ae57c9b7de215d222a5bf52f9259d171b717a0220643d3cb4423b5b7ffcb7b2b59eb81dede0a25319aaa0228d27e59d5e238c35a2412102641b5a033ce332a9fc0f81dee7948c099b194758d8352bd5572988ac760ae2faffffffff94646890e1cfab5204ae43e0d8f24dc5fa5a8bcdb3acdaded8b3f591c3cad4a7110000006a47304402205b92eaba4a6c029385e9cf291631b98d0c7aa6851755fb44279e2b1ebd12759702206e96f3bac252f2c5cf5edf7f8828d6358baaa9fe34aa163faeb9b31aac830e47412102577e2a3877a253d9e7587c3d77a4038b4af5e51113393c2713c6d50c9da5de6effffffff03b0040000000000001976a914ae0545a670c6f739f9a8963aee37be95df0d9b2a88acc8000000000000001976a914292e61672fc24a9a70cfa6f73a9af5655652629d88ac13050000000000001976a914ad2ab55d09559074e41e2a2c1c89742e13bee03088ac00000000010001000000010954d485defac354e5fc826434eaf6ee4f3a81969f0f7d104e7dd46871adab37000000006b4830450221009c67deb38aa6b5ed8bfa140e9464e1b1ee2908a296bb70e3d164725254491c6a02207b595dcced1136c276edfc1e5e5901279cf6f0a6432e4c1a908468262e7d9543412102b963cd9b5a1419c041a4c4ac46f5205a2b8cb691cd5633e5d498ddcf3d37460b0000000001af040000000000001976a914ae0545a670c6f739f9a8963aee37be95df0d9b2a88ac00000000000100000001c5b2a279b9b1fec42846b9d6ed7cf6345b08dcdd4b4a17e2d017b98edb347787000000006b483045022100c0992a684be99a07bc87e03bf88701acefc033c1aa57cf4a3b15253e64c8962a022031d5b3af1684a1a1a201eb16fc1fbca8522ae16b9c0d340e8bec48eeea1fe458412102b963cd9b5a1419c041a4c4ac46f5205a2b8cb691cd5633e5d498ddcf3d37460b0000000001ae040000000000001976a914ae0545a670c6f739f9a8963aee37be95df0d9b2a88ac00000000000100000001e9d6dc3084dca9606fe43406208a8dcbba568f60671ee2df4f50189cf75e9f50000000006b483045022100c9c8baa777fe09c1310788614d4eba88b6027d39eada18a5a79c6a33e55919c302205222961b1f63dddd425cd418571797cb3a68aa59ac37331c0fc61fc9de66c34d412102b963cd9b5a1419c041a4c4ac46f5205a2b8cb691cd5633e5d498ddcf3d37460b0000000001ad040000000000001976a914ae0545a670c6f739f9a8963aee37be95df0d9b2a88ac00000000000100000001d75744af67fa32a56ba0256a818e23747133cca140926eb65b1eb00310202694000000006a473044022027137acdeb7583e966a9e8825c9f5edb909b2fd46d40e6ee83846d164529630e0220644e82a46d813fac2836650ce832cdba7eb46b6c134982b36e84f5f08a921dbb412102b963cd9b5a1419c041a4c4ac46f5205a2b8cb691cd5633e5d498ddcf3d37460b0000000001ac040000000000001976a914ae0545a670c6f739f9a8963aee37be95df0d9b2a88ac0000000000'
const txid942620 = '9426201003b01e5bb66e9240a1cc337174238e816a25a06ba532fa67af4457d7'
const beef942620_0 = '0100beef01fe07ef0c0008022802d75744af67fa32a56ba0256a818e23747133cca140926eb65b1eb00310202694290089598873694014f9706b6074a1b349fcf59df875e58a0cf3a8900c6e5830f33601150036fffb4b882171c594a27d37c5d7827cc706811c3e0acd152e0f3ee1c7ac98f9010b002b3b5c611cbea3bbdf9e99646cb23e80b62fc2dc2e619656157296878d46d8b30104002877b6b97c95fd55c0584d0ccf683c9ad6c60be146dd73605b93ef042da648a0010300d1d01ac14f19d974f8131b9cdb38ae2abcf5403d5c3f0d2772a1c995c136356b01000017ece09932fa7c6d464c633df200003c2328beb26290c7b9b1333eb84c90c544010100cd4147f92f226bc39354a78209db1f521ffd8720e3fcc9c942ee1dd535513d0f0101005daeb3f84528a58700c58c8479f29cd627b07c198602b6c08033340262c0c607010100000001e9d6dc3084dca9606fe43406208a8dcbba568f60671ee2df4f50189cf75e9f50000000006b483045022100c9c8baa777fe09c1310788614d4eba88b6027d39eada18a5a79c6a33e55919c302205222961b1f63dddd425cd418571797cb3a68aa59ac37331c0fc61fc9de66c34d412102b963cd9b5a1419c041a4c4ac46f5205a2b8cb691cd5633e5d498ddcf3d37460b0000000001ad040000000000001976a914ae0545a670c6f739f9a8963aee37be95df0d9b2a88ac000000000100'
const txid509f5e = '509f5ef79c18504fdfe21e67608f56bacb8d8a200634e46f60a9dc8430dcd6e9'
const beef509f5e_0 = '0100beef01fe05ef0c0009029800fb09f12f5632f7af6409432fc914d1e68fc499270fa29f3b3c43fb00ebeb8ed09902e9d6dc3084dca9606fe43406208a8dcbba568f60671ee2df4f50189cf75e9f50014d00ccb4f6ea2fabdfaf86b0e3837cc702ddde19cb5112e680f00832330b03be1d290127000480365544cd4dca6262cc25567f241d650339773f3f9ef1b9a25b9a034945c30112004ab6bdfecf74af1da1e0574671d06aef63dcde80133d1a6c46beda2ad08abc15010800ce75abf88ee3de3e2f89be0462e1cb0b9470b67947b9880e941bb6565a44bc86010500940d69edc69fc8694485452b961b8df8a2e0c1ff7bdbfeee1e6855542a7e7cd10103002217abcbd7e5431fffc0f52624ee3cf659e39734ae5335d5d196193f7f6e39ab01000082d3a59ca910a1c6fc1f06ab2a5ea80ffee7a39d9a987c85701cfaaf604219f80101008bed85ed818e9d69147000e8687b2efed77e5ee0073e5a2640033715747bd0c2010100000001c5b2a279b9b1fec42846b9d6ed7cf6345b08dcdd4b4a17e2d017b98edb347787000000006b483045022100c0992a684be99a07bc87e03bf88701acefc033c1aa57cf4a3b15253e64c8962a022031d5b3af1684a1a1a201eb16fc1fbca8522ae16b9c0d340e8bec48eeea1fe458412102b963cd9b5a1419c041a4c4ac46f5205a2b8cb691cd5633e5d498ddcf3d37460b0000000001ae040000000000001976a914ae0545a670c6f739f9a8963aee37be95df0d9b2a88ac000000000100'
const txid877734 = '877734db8eb917d0e2174a4bdddc085b34f67cedd6b94628c4feb1b979a2b2c5'
const beef877734_0 = '0100beef01fedfee0c000e02fd202900eeebd665d8893249c90dabbd50266fb7e0f125dd8ee087a3c8089debf09499d4fd212902c5b2a279b9b1fec42846b9d6ed7cf6345b08dcdd4b4a17e2d017b98edb34778701fd911400b32e903076f6869d4e0a9fa2d00f5c8bad598d3ede5b4bafef88debdb1d3de6901fd490a000a79573c8eb909d30c4e9653f90ea2869e44220d551da81cc96913b2fcd734aa01fd2505003d6db6b39d889be1535a478da0c3428e8107872ac55f0fcfdd2225b6a402d1dc01fd9302008ae31e7e4d4e766814ea11b337b5b51f5d807737f802c44c8d0d75a583a61bde01fd480100e962a171fcc0e79bf55b1433d79564f8d3b2622ecbcb84c9ede792d353e0afb901a5007d0a8d8a3a2f0eb209e82f5e80ef6c4835b7d07c85d6ac8c613cc8754a47bd79015300b070576d92310f1e08a12581ecea4d1d4de48beb15ff7e42eddc1b957fa2909d012800544a58cac6b4dd78cebd84178dc1572693552fec5777a055dad0068bd67aec6101150025674a887fff026640fe9851cbffb37bd8e02780c4f6c0476ed3cee4e4884c2f010b0023aa2b01e8a59c3b79976918d95ae6a044ace2264e3690f9846f452499c0cbad01040078033c2619a3b115bfc71d09addf13e288660be1841cf6769ffb9924aca246970103004d2d6ae3e2c02703b773c49af789b7372b5b71bf92b49e2dc4b921880df984540100003b86537a85e5047596a482ac2dba30d1798b26d200c08a2fb19d8d75b2c2a1b50101000000010954d485defac354e5fc826434eaf6ee4f3a81969f0f7d104e7dd46871adab37000000006b4830450221009c67deb38aa6b5ed8bfa140e9464e1b1ee2908a296bb70e3d164725254491c6a02207b595dcced1136c276edfc1e5e5901279cf6f0a6432e4c1a908468262e7d9543412102b963cd9b5a1419c041a4c4ac46f5205a2b8cb691cd5633e5d498ddcf3d37460b0000000001af040000000000001976a914ae0545a670c6f739f9a8963aee37be95df0d9b2a88ac000000000100'
const txid37abad = '37abad7168d47d4e107d0f9f96813a4feef6ea346482fce554c3fade85d45409'
const beef37abad_0 = '0100beef01fedcee0c000d02f8020954d485defac354e5fc826434eaf6ee4f3a81969f0f7d104e7dd46871adab37f900fa225908f222f8f7f291731a10e93cdf410189ca01adc688edf5577552aa8ff2017d006cfea8ad6ace7ecce9bbbe729eb9dca25f9be064b150d290588c3364867ee112013f00bfbacc8bfdda7f734c160fcfee972dd9182aede73290367aab62b5ce242e5655011e007a0eb94f2bcf98489247a01551a843d9cf1e091522c32f50ce347ba5057b439d010e00beb857ba543d2bd199e68c63a480c73b83660eca27d2ce105355741f27017876010600d5fb1ea8440e41b4ffde093dd53d6ed741c4fe4fe66ff43f6a4eb9af3c6ddebb010200169db3be130a9e8aff1dbff39abee477d3a224cb3e118c39794bb7ba427b707501000083cd0ce2d2734835c45331cd06f38556cf4e07634d599f59692ad9980175a7f201010022f4a629e99ca5838f56f87b050bdefa9b9f621c08745cb27b941d9c6750d99a01010032b90a4148ff984b0efee309a578cb87d278142c014f1a7fd5351b3e3cd4c7da01010082dc3ea570250357fca88652ee1628928136c29eb4910b7e5627e0ffef1d958a010100f5194f41c28960f0dba669f4715229f59f59afb5d55f50a2a7556111b8da67130101009cd7f9a65014cc6fd5c0b71391d0b70eb983ea3b03a2fbd7a13150775855953401010000000237c2148f306355078cedfe61c8574f393476a43abd2cee5b31f1c73e39db86d7000000006a47304402207ee089c64fa810ad88e03f7bad4ae57c9b7de215d222a5bf52f9259d171b717a0220643d3cb4423b5b7ffcb7b2b59eb81dede0a25319aaa0228d27e59d5e238c35a2412102641b5a033ce332a9fc0f81dee7948c099b194758d8352bd5572988ac760ae2faffffffff94646890e1cfab5204ae43e0d8f24dc5fa5a8bcdb3acdaded8b3f591c3cad4a7110000006a47304402205b92eaba4a6c029385e9cf291631b98d0c7aa6851755fb44279e2b1ebd12759702206e96f3bac252f2c5cf5edf7f8828d6358baaa9fe34aa163faeb9b31aac830e47412102577e2a3877a253d9e7587c3d77a4038b4af5e51113393c2713c6d50c9da5de6effffffff03b0040000000000001976a914ae0545a670c6f739f9a8963aee37be95df0d9b2a88acc8000000000000001976a914292e61672fc24a9a70cfa6f73a9af5655652629d88ac13050000000000001976a914ad2ab55d09559074e41e2a2c1c89742e13bee03088ac000000000100'
