/**
 * Configuration for synchronizing supported topic managers.
 *
 * This configuration determines which topics should support synchronization and specifies the mode of synchronization.
 *
 * There are two synchronization modes:
 * 1. Sync to predefined hardcoded peers for the specified topic, including associated hosting URLs.
 * 2. Use SHIP (Service Host Interconnect Protocol) to sync with all known peers that support the specified topic.
 *
 * Each entry in the configuration object maps a topic to either an array of overlay service peers (hardcoded URLs) or the string 'SHIP' (for dynamic syncing using SHIP).
 *
 * @example
 * // Example usage of SyncConfiguration
 * const config: SyncConfiguration = {
 *   "topicManager1": ["http://peer1.com", "http://peer2.com"],
 *   "topicManager2": "SHIP"
 * }
 */
export type SyncConfiguration = Record<string, string[] | 'SHIP' | false>
