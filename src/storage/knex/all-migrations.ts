import { Knex } from 'knex'
import { up as oneUp, down as oneDown } from './migrations/2024-05-18-001-initial.js'

/**
 * An array of all migrations, in order.
 */
const allMigrations: {
    up: (knex: Knex) => Promise<void>
    down: (knex: Knex) => Promise<void>
}[] = [
        { up: oneUp, down: oneDown }
    ]

export default allMigrations