export interface Advertisement {
  protocol: 'SHIP' | 'SLAP'
  identityKey: string
  domain: string
  topicOrService: string
  beef?: number[]
  outputIndex?: number
}
