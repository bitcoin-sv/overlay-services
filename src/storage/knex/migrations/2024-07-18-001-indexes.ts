import type { Knex } from 'knex'
export async function up(knex: Knex): Promise<void> {
  // Add index for applied_transactions table
  await knex.schema.table('applied_transactions', function (table) {
    table.index(['txid', 'topic'], 'idx_applied_transactions_txid_topic')
  })
  // Add index for transactions table
  await knex.schema.table('transactions', function (table) {
    table.index('txid', 'idx_transactions_txid')
  })
  // Add index for outputs table
  await knex.schema.table('outputs', function (table) {
    table.index(['txid', 'outputIndex', 'topic'], 'idx_outputs_txid_outputIndex_topic')
  })
}

export async function down(knex: Knex): Promise<void> {
  // Drop index for applied_transactions table
  await knex.schema.table('applied_transactions', function (table) {
    table.dropIndex(['txid', 'topic'], 'idx_applied_transactions_txid_topic')
  })
  // Drop index for transactions table
  await knex.schema.table('transactions', function (table) {
    table.dropIndex('txid', 'idx_transactions_txid')
  })
  // Drop index for outputs table
  await knex.schema.table('outputs', function (table) {
    table.dropIndex(['txid', 'outputIndex', 'topic'], 'idx_outputs_txid_outputIndex_topic')
  })
}
