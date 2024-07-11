import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Add new column for blockHeight associated with outputs
  await knex.schema.table('outputs', table => {
    table.integer('blockHeight').unsigned().nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  // Remove the blockHeight column (rollback operation)
  await knex.schema.table('outputs', table => {
    table.dropColumn('blockHeight')
  })
}
