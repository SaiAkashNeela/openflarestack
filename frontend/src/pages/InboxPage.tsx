import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { api } from '../lib/api'
import type { Conversation } from '../lib/types'
import { ConversationList } from '../components/ConversationList'

export function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'open' | 'resolved' | 'all'>('open')

  useEffect(() => {
    setLoading(true)
    api.get<{ conversations: Conversation[] }>(`/api/v1/conversations?status=${status}`)
      .then((r) => setConversations(r.conversations))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [status])

  return (
    <div className="flex h-full">
      <div className="flex w-80 shrink-0 flex-col border-r border-gray-200 dark:border-gray-800">
        <div className="flex h-14 items-center justify-between border-b border-gray-200 px-4 dark:border-gray-800">
          <h1 className="font-semibold">Inbox</h1>
          <div className="flex gap-1">
            {(['open','resolved','all'] as const).map((s) => (
              <button key={s} onClick={() => setStatus(s)}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${status === s ? 'bg-brand-500 text-white' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-100'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <ConversationList conversations={conversations} loading={loading} />
      </div>
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  )
}
