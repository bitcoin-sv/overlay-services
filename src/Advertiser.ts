import { Script } from '@bsv/sdk'
import { SHIPAdvertisement } from './SHIPAdvertisement.js'
import { SLAPAdvertisement } from './SLAPAdvertisement.js'
import { TaggedBEEF } from './TaggedBEEF.js'

/**
 * Interface for managing SHIP and SLAP advertisements.
 * Provides methods for creating, finding, and revoking advertisements.
 */
export interface Advertiser {
  /**
   * Creates a new SHIP advertisement for a given topic.
   * @param topic - The topic name for the SHIP advertisement.
   * @returns A promise that resolves to the created SHIP advertisement as TaggedBEEF.
   */
  createSHIPAdvertisement: (topic: string) => Promise<TaggedBEEF>

  /**
 * Creates a new SLAP advertisement for a given service.
 * @param service - The service name for the SLAP advertisement.
 * @returns A promise that resolves to the created SLAP advertisement as TaggedBEEF.
 */
  createSLAPAdvertisement: (service: string) => Promise<TaggedBEEF>

  /**
   * Finds all SHIP advertisements for a given topic.
   * @param topic - The topic name to search for.
   * @returns A promise that resolves to an array of SHIP advertisements.
   */
  findAllSHIPAdvertisements: (topic: string) => Promise<SHIPAdvertisement[]>

  /**
   * Finds all SLAP advertisements for a given service.
   * @param service - The service name to search for.
   * @returns A promise that resolves to an array of SLAP advertisements.
   */
  findAllSLAPAdvertisements: (service: string) => Promise<SLAPAdvertisement[]>

  /**
   * Revokes an existing advertisement, either SHIP or SLAP.
   * @param advertisement - The advertisement to revoke, either SHIP or SLAP.
   * @returns A promise that resolves to the revocation transaction as TaggedBEEF.
   */
  revokeAdvertisement: (advertisement: SHIPAdvertisement | SLAPAdvertisement) => Promise<TaggedBEEF>

  /**
   * Parses an output script to extract an advertisement.
   * @param outputScript - The script of the output to be parsed.
   * @returns The parsed advertisement as a SHIPAdvertisement or SLAPAdvertisement, or null if the advertisement is invalid or cannot be parsed.
   */
  parseAdvertisement: (outputScript: Script) => SHIPAdvertisement | SLAPAdvertisement | null
}
