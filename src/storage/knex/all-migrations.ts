import { Knex } from 'knex'
import { up as initialSchemaUp, down as initialSchemaDown } from './migrations/2024-05-18-001-initial.js'
import { up as addBlockHeightColumnUp, down as addBlockHeightColumnDown } from './migrations/2024-07-10-001-block-height.js'
import { up as addTransactionsTableUp, down as addTransactionsTableDown } from './migrations/2024-07-17-001-transactions.js'
import { up as addedIndexesUp, down as addedIndexesDown } from './migrations/2024-07-18-001-indexes.js'
import { up as addSpentForwardIndexUp, down as addSpentForwardIndexDown } from './migrations/2024-10-16-001-spent-forward-index.js'

/**
 * An array of all migrations, in order.
 */
type Migration = {
  up: (knex: Knex) => Promise<void>
  down: (knex: Knex) => Promise<void>
}

const allMigrations: Migration[] = [
  { up: initialSchemaUp, down: initialSchemaDown },
  { up: addBlockHeightColumnUp, down: addBlockHeightColumnDown },
  { up: addTransactionsTableUp, down: addTransactionsTableDown },
  { up: addedIndexesUp, down: addedIndexesDown },
  { up: addSpentForwardIndexUp, down: addSpentForwardIndexDown }
]
export default allMigrations
