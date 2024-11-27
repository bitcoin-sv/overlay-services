import { Script, TaggedBEEF } from '@bsv/sdk'
import { Advertisement } from './Advertisement.js'

export interface AdvertisementData {
  protocol: 'SHIP' | 'SLAP'
  topicOrServiceName: string
}

/**
 * Interface for managing SHIP and SLAP advertisements.
 * Provides methods for creating, finding, and revoking advertisements.
 */
export interface Advertiser {

  /**
   * Creates a new SHIP/SLAP advertisement for a given topic.
   * @param adsData - The data indicating the type of advertisement.
   * @returns A promise that resolves to the created advertisement as TaggedBEEF.
   */
  createAdvertisements: (adsData: AdvertisementData[]) => Promise<TaggedBEEF>

  /**
   * Finds all SHIP/SLAP advertisements.
   * @returns A promise that resolves to an array of SHIP/SLAP advertisements.
   */
  findAllAdvertisements: (protocol: 'SHIP' | 'SLAP') => Promise<Advertisement[]>

  /**
   * Revokes an existing advertisement, either SHIP or SLAP.
   * @param advertisements - The advertisements to revoke, either SHIP or SLAP.
   * @returns A promise that resolves to the revocation transaction as TaggedBEEF.
   */
  revokeAdvertisements: (advertisements: Advertisement[]) => Promise<TaggedBEEF>

  /**
   * Parses an output script to extract an advertisement.
   * @param outputScript - The script of the output to be parsed.
   * @returns The parsed advertisement
   */
  parseAdvertisement: (outputScript: Script) => Advertisement
}
