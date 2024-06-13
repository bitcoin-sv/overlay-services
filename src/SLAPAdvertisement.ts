export interface SLAPAdvertisement {
  protocol: 'SLAP'
  identityKey: string
  domainName: string
  serviceName: string
  beef?: number[]
  outputIndex?: number
}
