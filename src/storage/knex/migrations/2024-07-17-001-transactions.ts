import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Create the new transactions table
  await knex.schema.createTable('transactions', table => {
    table.increments()
    table.specificType('beef', 'longblob')
    table.string('txid', 64).unique()
  })

  // Move data from outputs table to the new transactions table and ensure deduplication
  await knex.raw(`
    INSERT IGNORE INTO transactions (txid, beef)
    SELECT txid, beef
    FROM outputs
    WHERE beef IS NOT NULL
  `)

  // Drop the beef column from the outputs table
  await knex.schema.table('outputs', table => {
    table.dropColumn('beef')
  })
}

export async function down(knex: Knex): Promise<void> {
  // Add the beef column back to the outputs table
  await knex.schema.table('outputs', table => {
    table.binary('beef')
  })

  // Move data back from the transactions table to the outputs table using a JOIN
  await knex.raw(`
    UPDATE outputs
    JOIN transactions ON outputs.txid = transactions.txid
    SET outputs.beef = transactions.beef
  `)

  // Drop the transactions table
  await knex.schema.dropTable('transactions')
}
