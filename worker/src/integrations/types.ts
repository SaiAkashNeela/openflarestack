export interface IncomingMessage {
  externalId: string
  externalCustomerId: string
  customerName: string
  customerEmail?: string
  customerPhone?: string
  subject?: string
  text: string
  channel: string
}

export interface OutboundJob {
  type: 'outbound'
  conversationId: string
  messageId: string
  organizationId: string
}

export interface InboundJob {
  type: 'inbound'
  integrationId: string
  organizationId: string
  incoming: IncomingMessage
}
