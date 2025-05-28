// migrations/005_enlarge_blobs.ts
import type { Knex } from 'knex'

export async function up (knex: Knex): Promise<void> {
  const client = (knex.client.config.client || '').toLowerCase()

  /* ---------- outputs.outputScript ---------- */
  if (client.startsWith('mysql')) {
    // MySQL / MariaDB – enlarge to LONGBLOB (4 GB)
    await knex.schema.alterTable('outputs', table => {
      table.specificType('outputScript', 'LONGBLOB').alter()
    })
  } else if (client === 'sqlite3') {
    // SQLite – plain BLOB is already plenty, but run alter so Knex’s
    // internal schema snapshot stays in sync.
    await knex.schema.alterTable('outputs', table => {
      table.binary('outputScript').alter()
    })
  }

  /* ---------- transactions.beef ---------- */
  // This column was already created as LONGBLOB in migration 3,
  // but we enlarge defensively in case someone ran only the early
  // migrations on a new database.
  if (client.startsWith('mysql')) {
    await knex.schema.alterTable('transactions', table => {
      table.specificType('beef', 'LONGBLOB').alter()
    })
  } else if (client === 'sqlite3') {
    await knex.schema.alterTable('transactions', table => {
      table.binary('beef').alter()
    })
  }
}

export async function down (knex: Knex): Promise<void> {
  const client = (knex.client.config.client || '').toLowerCase()

  /* ---------- outputs.outputScript ---------- */
  if (client.startsWith('mysql')) {
    // Revert to VARBINARY(255) – matches Knex’s default .binary()
    await knex.schema.alterTable('outputs', table => {
      table.binary('outputScript').alter()
    })
  } else if (client === 'sqlite3') {
    // No-op (SQLite stores the whole blob either way)
    await knex.schema.alterTable('outputs', table => {
      table.binary('outputScript').alter()
    })
  }

  /* ---------- transactions.beef ---------- */
  if (client.startsWith('mysql')) {
    await knex.schema.alterTable('transactions', table => {
      table.binary('beef').alter()
    })
  } else if (client === 'sqlite3') {
    await knex.schema.alterTable('transactions', table => {
      table.binary('beef').alter()
    })
  }
}
