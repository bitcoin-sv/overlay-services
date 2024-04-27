/* eslint-env jest */
const { Confederacy } = require('../src/Confederacy')

const mockTopicManager = {
  identifyAdmissibleOutputs: jest.fn(() => ([0]))
}
const mockLookupService = {
  outputAdded: jest.fn(),
  outputSpent: jest.fn(),
  lookup: jest.fn()
}
const mockVerifier = {
  verifyEnvelope: jest.fn(() => true)
}
const mockParser = {
  parse: jest.fn(() => ({
    inputs: [],
    outputs: [{
      script: Buffer.from('016a', 'hex'),
      satoshis: 1000
    }],
    id: 'MOCK_TX_ID'
  }))
}
const mockStorageEngine = {
  findAppliedTransaction: jest.fn(() => null),
  insertAppliedTransaction: jest.fn(),
  addUTXO: jest.fn()
}

describe('Confederacy', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })
  describe('submit', () => {
    it('Throws an error if the user submits to a topic that is not supported', async () => {
      const confederacy = new Confederacy(
        {
          Hello: mockTopicManager
        },
        {},
        mockStorageEngine,
        mockVerifier,
        mockParser
      )
      await expect(confederacy.submit({
        rawTx: 'MOCK_RAW_TX',
        topics: ['hello']
      })).rejects.toHaveProperty('message', 'This server does not support this topic: hello')
    })
    it.todo('Throws an error if no topics are provided')
    it('Verifies the envelope for the provided transaction', async () => {
      const confederacy = new Confederacy(
        {
          Hello: mockTopicManager
        },
        {},
        mockStorageEngine,
        mockVerifier,
        mockParser
      )
      await confederacy.submit({
        rawTx: 'MOCK_RAW_TX',
        topics: ['Hello']
      })
      expect(mockVerifier.verifyEnvelope).toHaveBeenCalledWith({
        rawTx: 'MOCK_RAW_TX'
      })
    })
    it('Throws an error if an invalid envelope is provided', async () => {
      const confederacy = new Confederacy(
        {
          Hello: mockTopicManager
        },
        {},
        mockStorageEngine,
        mockVerifier,
        mockParser
      )
      mockVerifier.verifyEnvelope.mockReturnValueOnce(false)
      await expect(confederacy.submit({
        rawTx: 'MOCK_RAW_TX',
        topics: ['Hello']
      })).rejects.toHaveProperty('message', 'Invalid SPV Envelope for the given transaction')
    })
    it('Parses the provided incoming transaction', async () => {
      const confederacy = new Confederacy(
        {
          Hello: mockTopicManager
        },
        {},
        mockStorageEngine,
        mockVerifier,
        mockParser
      )
      await confederacy.submit({
        rawTx: 'MOCK_RAW_TX',
        topics: ['Hello']
      })
      expect(mockParser.parse).toHaveBeenCalledWith('MOCK_RAW_TX')
    })
    describe('For each topic being processed', () => {
      it('Checks for duplicate transactions', async () => {
        const confederacy = new Confederacy(
          {
            Hello: mockTopicManager
          },
          {},
          mockStorageEngine,
          mockVerifier,
          mockParser
        )
        await confederacy.submit({
          rawTx: 'MOCK_RAW_TX',
          topics: ['Hello']
        })
        expect(mockParser.parse).toHaveBeenCalledWith('MOCK_RAW_TX')
      })
      it('Does not process the output if the transaction was already applied to the topic', async () => {

      })
      describe('For each input of the transaction', () => {
        it('Acquires the appropriate previous topical UTXOs from the storage engine', async () => {

        })
        it('Includes the appropriate previous topical UTXOs when they are returned from the storage engine', async () => {

        })
      })
      it('Identifies admissible outputs with the appropriate topic manager', async () => {

      })
      it.todo('Throws an error if the return value from the topic manager is invalid')
      describe('When previous UTXOs were retained by the topic manager', () => {
        it('Marks the UTXO as spent', async () => {

        })
        it.todo('Notifies all lookup services about the output being spent (not deleted, see the comment about this in deleteUTXODeep)')
      })
      describe('When previous UTXOs were not retained by the topic manager', () => {
        it('Marks the UTXO as stale, deleting all stale UTXOs by calling deleteUTXODeep', async () => {

        })
        it.todo('Notifies all lookup services about the output being spent (the notification about the actual deletion will come from deleteUTXODeep)')
      })
      it('Adds admissible UTXOs to the storage engine', async () => {

      })
      it('Notifies lookup services about incoming admissible UTXOs', async () => {

      })
      describe('For each consumed UTXO', () => {
        it('Finds the UTXO by ID', async () => {

        })
        it('Updates the UTXO to reflect that it is now additionally consumed by the newly-created UTXOs', async () => {

        })
      })
      it('Inserts a new applied transaction to avoid de-duplication', async () => {

      })
    })
    it('Returns a correct set of admitted topics and outputs', async () => {

    })
  })
  describe('lookup', () => {
    it.todo('Throws an error if no provider was given')
    it.todo('Throws an error if no query was given')
    it.todo('Throws an error if no lookup service has this provider name')
    it.todo('Calls the lookup function from the lookup service')
    describe('For each returned result', () => {
      it.todo('Finds the identified UTXO by its ID')
      it.todo('Calls getUTXOHistory with the correct UTXO and history parameters')
    })
    it.todo('Returns the correct set of hydrated results')
  })
  describe('getUTXOHistory', () => {
    it.todo('Returns the given output is there is no history selector')
    it.todo('Invokes the history selector function with the correct data')
    it.todo('Returns undefined if history should not be traversed')
    it.todo('Returns undefined if the history selector is a number, and greater than the current depth')
    it.todo('Returns the current output even if history should be traversed, if the current output is part of a transaction that does not consume any previous topical UTXOs')
    it.todo('Traversing history, calls findUTXOById with the ID of any UTXO consumed by this UTXO')
    it.todo('Returns the correct envelope based on the history traversal process')
    it.todo('Returns the correct envelope based on the history traversal process for a more complex multi-layer multi-output graph')
  })
  describe('deleteUTXODeep', () => {
    it('Finds UTXO by ID if no output was provided', async () => {

    })
    it('Finds UTXO by TXID and outputIndex if no ID was provided', async () => {

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
