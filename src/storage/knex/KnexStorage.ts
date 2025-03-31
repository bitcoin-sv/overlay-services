import { Storage } from '../Storage.js'
import { Knex } from 'knex'
import type { Output } from '../../Output.js'

export class KnexStorage implements Storage {
  knex: Knex

  constructor(knex: Knex) {
    this.knex = knex
  }

  async findOutput(txid: string, outputIndex: number, topic?: string, spent?: boolean, includeBEEF: boolean = false): Promise<Output | null> {
    const search: {
      'outputs.txid': string
      'outputs.outputIndex': number
      'outputs.topic'?: string
      'outputs.spent'?: boolean
    } = {
      'outputs.txid': txid,
      'outputs.outputIndex': outputIndex
    }
    if (topic !== undefined) search['outputs.topic'] = topic
    if (spent !== undefined) search['outputs.spent'] = spent

    // Base query to get the output
    const query = this.knex('outputs').where(search)

    // Select necessary fields from outputs and conditionally include beef from transactions
    const selectFields = [
      'outputs.txid',
      'outputs.outputIndex',
      'outputs.outputScript',
      'outputs.topic',
      'outputs.satoshis',
      'outputs.outputsConsumed',
      'outputs.spent',
      'outputs.consumedBy'
    ]

    if (includeBEEF) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      query.leftJoin('transactions', 'outputs.txid', 'transactions.txid')
      selectFields.push('transactions.beef')
    }

    const output = await query.select(selectFields).first()

    if (output === undefined || output === null) {
      return null
    }

    return {
      ...output,
      outputScript: [...output.outputScript],
      beef: includeBEEF ? (output.beef !== undefined ? [...output.beef] : undefined) : undefined,
      spent: Boolean(output.spent),
      outputsConsumed: JSON.parse(output.outputsConsumed),
      consumedBy: JSON.parse(output.consumedBy)
    }
  }

  async findOutputsForTransaction(txid: string, includeBEEF: boolean = false): Promise<Output[]> {
    // Base query to get outputs
    const query = this.knex('outputs').where({ 'outputs.txid': txid })

    // Select necessary fields from outputs and conditionally include beef from transactions
    const selectFields = [
      'outputs.txid',
      'outputs.outputIndex',
      'outputs.outputScript',
      'outputs.topic',
      'outputs.satoshis',
      'outputs.outputsConsumed',
      'outputs.spent',
      'outputs.consumedBy'
    ]

    if (includeBEEF) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      query.leftJoin('transactions', 'outputs.txid', 'transactions.txid')
      selectFields.push('transactions.beef')
    }

    const outputs = await query.select(selectFields)

    if (outputs === undefined || outputs.length === 0) {
      return []
    }

    return outputs.map(output => ({
      ...output,
      outputScript: [...output.outputScript],
      beef: includeBEEF ? (output.beef !== undefined ? [...output.beef] : undefined) : undefined,
      spent: Boolean(output.spent),
      outputsConsumed: JSON.parse(output.outputsConsumed),
      consumedBy: JSON.parse(output.consumedBy)
    }))
  }

  async findUTXOsForTopic(topic: string, since?: number, includeBEEF: boolean = false): Promise<Output[]> {
    // Base query to get outputs
    const query = this.knex('outputs').where({ 'outputs.topic': topic, 'outputs.spent': false })

    // If provided, additionally filters UTXOs by block height
    if (since !== undefined && since > 0) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      query.andWhere('outputs.blockHeight', '>=', since)
    }

    // Select necessary fields from outputs and conditionally include beef from transactions
    const selectFields = [
      'outputs.txid',
      'outputs.outputIndex',
      'outputs.outputScript',
      'outputs.topic',
      'outputs.satoshis',
      'outputs.outputsConsumed',
      'outputs.spent',
      'outputs.consumedBy'
    ]

    if (includeBEEF) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      query.leftJoin('transactions', 'outputs.txid', 'transactions.txid')
      selectFields.push('transactions.beef')
    }

    const outputs = await query.select(selectFields)

    if (outputs === undefined || outputs.length === 0) {
      return []
    }

    return outputs.map(output => ({
      ...output,
      outputScript: [...output.outputScript],
      beef: includeBEEF ? (output.beef !== undefined ? [...output.beef] : undefined) : undefined,
      spent: Boolean(output.spent),
      outputsConsumed: JSON.parse(output.outputsConsumed),
      consumedBy: JSON.parse(output.consumedBy)
    }))
  }

  async deleteOutput(txid: string, outputIndex: number, topic: string): Promise<void> {
    await this.knex.transaction(async trx => {
      // Delete the specific output
      await trx('outputs').where({ txid, outputIndex }).del()

      // Check how many outputs reference the same transaction
      const remainingOutputs = await trx('outputs').where({ txid }).count('* as count').first()

      if (remainingOutputs !== undefined && Number(remainingOutputs.count) === 0) {
        // If no more outputs reference the transaction, delete the beef
        await trx('transactions').where({ txid }).del()
      }
    })
  }

  async insertOutput(output: Output): Promise<void> {
    const insertPromises = [this.knex('outputs').insert({
      txid: output.txid,
      outputIndex: Number(output.outputIndex),
      outputScript: Buffer.from(output.outputScript),
      topic: output.topic,
      satoshis: Number(output.satoshis),
      outputsConsumed: JSON.stringify(output.outputsConsumed),
      consumedBy: JSON.stringify(output.consumedBy),
      spent: output.spent
    })]

    if (output.beef !== undefined) {
      const insertTransactionPromise = this.knex('transactions').insert({
        txid: output.txid,
        beef: Buffer.from(output.beef)
      }).onConflict('txid').ignore()
      insertPromises.push(insertTransactionPromise)
    }

    await this.knex.transaction(async trx => {
      await Promise.all(insertPromises.map(promise => promise.transacting(trx)))
    })
  }

  async markUTXOAsSpent(txid: string, outputIndex: number, topic?: string): Promise<void> {
    await this.knex('outputs').where({
      txid,
      outputIndex,
      topic
    }).update('spent', true)
  }

  async updateConsumedBy(txid: string, outputIndex: number, topic: string, consumedBy: Array<{ txid: string, outputIndex: number }>): Promise<void> {
    await this.knex('outputs').where({
      txid,
      outputIndex,
      topic
    }).update('consumedBy', JSON.stringify(consumedBy))
  }

  async updateTransactionBEEF(txid: string, beef: number[]): Promise<void> {
    await this.knex('transactions').where({
      txid
    }).update('beef', Buffer.from(beef))
  }

  async updateOutputBlockHeight(txid: string, outputIndex: number, topic: string, blockHeight: number): Promise<void> {
    await this.knex('outputs').where({
      txid,
      outputIndex,
      topic
    }).update('blockHeight', blockHeight)
  }

  async insertAppliedTransaction(tx: { txid: string, topic: string }): Promise<void> {
    await this.knex('applied_transactions').insert({
      txid: tx.txid,
      topic: tx.topic
    })
  }

  async doesAppliedTransactionExist(tx: { txid: string, topic: string }): Promise<boolean> {
    const result = await this.knex('applied_transactions')
      .where({ txid: tx.txid, topic: tx.topic })
      .select(this.knex.raw('1'))
      .first()

    return !!result
  }
}
