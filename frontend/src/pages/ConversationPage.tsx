import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useWs } from '../lib/ws'
import type { Message, Conversation, Customer } from '../lib/types'
import { MessageThread } from '../components/MessageThread'
import { MessageInput } from '../components/MessageInput'
import { TypingIndicator } from '../components/TypingIndicator'
import { CustomerPanel } from '../components/CustomerPanel'

export function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const [messages, setMessages] = useState<Message[]>([])
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [isTyping, setIsTyping] = useState(false)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { lastMessage, send } = useWs(conversationId ?? null)

  useEffect(() => {
    if (!conversationId) return
    Promise.all([
      api.get<{ messages: Message[] }>(`/api/v1/messages/${conversationId}`),
      api.get<{ conversation: Conversation }>(`/api/v1/conversations/${conversationId}`),
    ]).then(([msgRes, convRes]) => {
      setMessages(msgRes.messages)
      setConversation(convRes.conversation)
      return api.get<{ customer: Customer }>(`/api/v1/customers/${convRes.conversation.customer_id}`)
    }).then((r) => setCustomer(r.customer)).catch(console.error)
  }, [conversationId])

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (!lastMessage) return
    if (lastMessage.type === 'message.created') {
      setMessages((prev) => {
        const msg = lastMessage.message as Message
        if (prev.find((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
    }
    if (lastMessage.type === 'typing') {
      setIsTyping(true)
      if (typingTimer.current) clearTimeout(typingTimer.current)
      typingTimer.current = setTimeout(() => setIsTyping(false), 2500)
    }
  }, [lastMessage])

  const handleSend = useCallback(async (text: string) => {
    if (!conversationId) return
    await api.post(`/api/v1/messages/${conversationId}`, { content: text })
    // Message arrives back via WebSocket broadcast
  }, [conversationId])

  const handleTyping = useCallback(() => {
    send({ type: 'typing' })
  }, [send])

  const handleResolve = useCallback(async () => {
    if (!conversationId) return
    const r = await api.patch<{ conversation: Conversation }>(`/api/v1/conversations/${conversationId}`, { status: 'resolved' })
    setConversation(r.conversation)
  }, [conversationId])

  if (!conversationId) return (
    <div className="flex h-full items-center justify-center text-gray-400 text-sm">
      Select a conversation
    </div>
  )

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex h-14 items-center border-b border-gray-200 dark:border-gray-800 px-4 gap-3">
          <div>
            <p className="font-medium text-sm">{customer?.name ?? '…'}</p>
            <p className="text-xs text-gray-500">{conversation?.channel} · {conversation?.status}</p>
          </div>
        </div>
        <MessageThread messages={messages} />
        {isTyping && <TypingIndicator />}
        <MessageInput onSend={handleSend} onTyping={handleTyping} disabled={conversation?.status === 'resolved'} />
      </div>
      <CustomerPanel customer={customer} conversation={conversation} onResolve={handleResolve} />
    </div>
  )
}
