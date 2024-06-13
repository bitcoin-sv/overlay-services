export interface SHIPAdvertisement {
  protocol: 'SHIP'
  identityKey: string
  domain: string
  topic: string
  beef?: number[]
  outputIndex?: number
}
