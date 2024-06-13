export interface SHIPAdvertisement {
  protocol: 'SHIP'
  identityKey: string
  domainName: string
  topicName: string
  beef?: number[]
  outputIndex?: number
}
