export interface Conversation {
  id: string
  customer_id: string
  customer_name: string
  customer_email: string | null
  assigned_to: string | null
  assigned_to_name: string | null
  status: 'open' | 'resolved' | 'pending'
  channel: string
  subject: string | null
  last_message_at: number | null
  created_at: number
}

export interface Message {
  id: string
  conversation_id: string
  sender_type: 'customer' | 'agent' | 'system'
  sender_id: string | null
  content: string
  content_type: string
  created_at: number
  delivered_at: number | null
  read_at: number | null
}

export interface Customer {
  id: string
  name: string
  email: string | null
  phone: string | null
  avatar_url: string | null
  created_at: number
}

export interface Integration {
  id: string
  type: string
  name: string
  enabled: number
  created_at: number
}
