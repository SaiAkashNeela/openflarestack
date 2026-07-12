import { useEffect, useRef } from 'react'
import type { Message } from '../lib/types'
import { Avatar } from './Avatar'

interface Props {
  messages: Message[]
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function MessageThread({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((msg) => {
        const isAgent = msg.sender_type === 'agent'
        const isSystem = msg.sender_type === 'system'
        if (isSystem) return (
          <div key={msg.id} className="flex justify-center">
            <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">{msg.content}</span>
          </div>
        )
        return (
          <div key={msg.id} className={`flex gap-3 ${isAgent ? 'flex-row-reverse' : ''}`}>
            <Avatar name={isAgent ? 'Agent' : 'Customer'} size="sm" />
            <div className={`max-w-sm lg:max-w-md ${isAgent ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
              <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${isAgent ? 'bg-brand-500 text-white rounded-tr-sm' : 'bg-gray-100 dark:bg-gray-800 rounded-tl-sm'}`}>
                {msg.content}
              </div>
              <span className="text-xs text-gray-400">{formatTime(msg.created_at)}</span>
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
