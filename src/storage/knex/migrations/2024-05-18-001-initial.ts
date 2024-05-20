import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('outputs', table => {
    table.increments()
    table.string('txid', 64)
    table.integer('outputIndex', 10)
    table.binary('outputScript')
    table.string('topic')
    table.integer('satoshis', 15)
    table.binary('beef')
    // Represents the outputs that were provided as inputs
    // to the transaction that created this output.
    // This indicates the correct history of this output.
    table.text('outputsConsumed', 'longtext').defaultTo('[]')
    // Tracks any outputs the current output is used as an input in it's creation
    table.text('consumedBy', 'longtext').defaultTo('[]')
    table.boolean('spent').defaultTo(false)
  })
  await knex.schema.createTable('applied_transactions', table => {
    table.increments()
    table.string('txid', 64)
    table.string('topic')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('applied_transactions')
  await knex.schema.dropTable('outputs')
}
