import Storage from '../Storage.js'
import { Knex } from 'knex'
import type { Output } from '../../Output.js'

export default class KnexStorage implements Storage {
    knex: Knex

    constructor(knex: Knex) {
        this.knex = knex
    }

    async findOutput(txid: string, outputIndex: number, topic?: string, spent?: boolean): Promise<Output | null> {
        const search: {
            txid: string,
            outputIndex: number,
            topic?: string,
            spent?: boolean
        } = {
            txid,
            outputIndex
        }
        if (topic !== undefined) search.topic = topic
        if (spent !== undefined) search.spent = spent
        const [output] = await this.knex('outputs').where(search).select(
            'txid', 'outputIndex', 'outputScript', 'topic', 'satoshis', 'beef', 'outputsConsumed', 'spent', 'consumedBy'
        )
        if (!output) {
            return null
        }
        return {
            ...output,
            outputScript: [...output.outputScript],
            beef: [...output.beef],
            spent: Boolean(output.spent),
            outputsConsumed: JSON.parse(output.outputsConsumed),
            consumedBy: JSON.parse(output.consumedBy)
        }
    }

    async deleteOutput(txid: string, outputIndex: number, topic: string): Promise<void> {
        await this.knex('outputs').where({
            txid, outputIndex, topic
        }).del()
    }

    async insertOutput(output: Output) {
        await this.knex('outputs').insert({
            txid: output.txid,
            outputIndex: Number(output.outputIndex),
            outputScript: Buffer.from(output.outputScript),
            topic: output.topic,
            satoshis: Number(output.satoshis),
            beef: [...output.beef],
            outputsConsumed: JSON.stringify(output.outputsConsumed),
            consumedBy: JSON.stringify(output.consumedBy),
            spent: output.spent
        })
    }

    async markUTXOAsSpent(txid: string, outputIndex: number, topic?: string): Promise<void> {
        await this.knex('outputs').where({
            txid,
            outputIndex,
            topic
        }).update('spent', true)
    }

    async updateConsumedBy(txid: string, outputIndex: number, topic: string, consumedBy: { txid: string, outputIndex: number }[]) {
        await this.knex('outputs').where({
            txid,
            outputIndex,
            topic
        }).update('consumedBy', consumedBy)
    }

    async insertAppliedTransaction(tx: { txid: string, topic: string }) {
        await this.knex('applied_transactions').insert({
            txid: tx.txid,
            topic: tx.topic
        })
    }

    async doesAppliedTransactionExist(tx: { txid: string, topic: string }): Promise<boolean> {
        const appliedTransactions = await this.knex('applied_transactions').where({
            txid: tx.txid,
            topic: tx.topic
        }).select('txid', 'topic')
        return appliedTransactions.length > 0
    }
}