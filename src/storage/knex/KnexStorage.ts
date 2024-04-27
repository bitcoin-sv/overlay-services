export default class KnexStorageEngine implements Storage {
    constructor({ knex, tablePrefix = 'ump_lookup_' }) {
        this.knex = knex
        this.tablePrefix = tablePrefix
        this.migrations = makeMigrations({ tablePrefix })
    }

    async findUTXO(txid, outputIndex, topic, spent) {
        const search = {
            txid,
            outputIndex
        }
        if (topic !== undefined) search.topic = topic
        if (spent !== undefined) search.spent = spent
        const outputs = await this.knex('outputs').where(search).select('id', 'txid', 'outputIndex', 'outputScript', 'topic', 'satoshis', 'rawTx', 'proof', 'inputs', 'mapiResponses', 'utxosConsumed', 'spent', 'consumedBy')
        return outputs
    }

    async findUTXOById(id) {
        const outputs = await this.knex('outputs').where({ id }).select('id', 'txid', 'outputIndex', 'outputScript', 'topic', 'satoshis', 'rawTx', 'proof', 'inputs', 'mapiResponses', 'utxosConsumed', 'spent', 'consumedBy')
        return outputs
    }

    async deleteUTXO(txid, outputIndex, topic) {
        const deleted = await this.knex('outputs').where({
            txid, outputIndex, topic
        }).del()
        // TODO: Check deletion status..
        if (deleted) {
            return 'success'
        }
        return 'failed to delete'
    }

    async deleteUTXOById(id) {
        const deleted = await this.knex('outputs').where({
            id
        }).del()
        // TODO: Check deletion status..
        if (deleted) {
            return 'success'
        }
        return 'failed to delete'
    }

    async addUTXO({ txid, outputIndex, outputScript, topic, satoshis, rawTx, proof, mapiResponses, inputs, utxosConsumed, consumedBy }) {
        const [id] = await this.knex('outputs').insert({
            txid,
            outputIndex: Number(outputIndex),
            outputScript: Buffer.from(outputScript.toHex(), 'hex'),
            topic,
            satoshis: Number(satoshis),
            rawTx,
            proof: JSON.stringify(proof),
            mapiResponses: JSON.stringify(mapiResponses),
            inputs: JSON.stringify(inputs),
            utxosConsumed,
            consumedBy
        })
        return id
    }

    async markUTXOAsSpent(txid, outputIndex, topic) {
        await this.knex('outputs').where({
            txid,
            outputIndex,
            topic
        }).update('spent', true)
    }

    async updateConsumedBy(id, consumedBy) {
        // TODO: Add error handling
        await this.knex('outputs').where({
            id
        }).update('consumedBy', consumedBy)
    }

    async insertAppliedTransaction(txid, topic) {
        await this.knex('applied_transactions').insert({
            txid,
            topic
        })
    }

    async findAppliedTransaction(txid, topic) {
        const appliedTransactions = await this.knex('applied_transactions').where({
            txid,
            topic
        }).select('txid', 'topic')
        return appliedTransactions[0]
    }
}