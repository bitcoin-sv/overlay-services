import type { Knex } from 'knex'
export async function up(knex: Knex): Promise<void> {
  // Add index for outputs table
  await knex.schema.table('outputs', function (table) {
    table.index(['spent'], 'idx_outputs_spent')
  })
}

export async function down(knex: Knex): Promise<void> {
  // Drop index for outputs table
  await knex.schema.table('outputs', function (table) {
    table.dropIndex(['spent'], 'idx_outputs_spent')
  })
}
