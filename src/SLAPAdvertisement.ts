export interface SLAPAdvertisement {
  protocol: 'SLAP'
  identityKey: string
  domain: string
  service: string
  beef?: number[]
  outputIndex?: number
}
