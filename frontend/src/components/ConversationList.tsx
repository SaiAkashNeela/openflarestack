import { useNavigate, useParams } from 'react-router-dom'
import type { Conversation } from '../lib/types'
import { Avatar } from './Avatar'
import { Badge } from './Badge'

interface Props {
  conversations: Conversation[]
  loading: boolean
}

function timeAgo(ts: number | null): string {
  if (!ts) return ''
  const diff = Math.floor((Date.now() / 1000) - ts)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function ConversationList({ conversations, loading }: Props) {
  const navigate = useNavigate()
  const { conversationId } = useParams()

  if (loading) return (
    <div className="flex-1 p-4 space-y-2">
      {[...Array(6)].map((_, i) => (
        <div key={`skeleton-${i}`} className="h-16 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
      ))}
    </div>
  )

  if (!conversations.length) return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-gray-400">
      <p className="text-sm">No conversations yet</p>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto">
      {conversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => navigate(`/inbox/${conv.id}`)}
          className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${conv.id === conversationId ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}
        >
          <Avatar name={conv.customer_name} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">{conv.customer_name}</span>
              <span className="text-xs text-gray-400 shrink-0">{timeAgo(conv.last_message_at)}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-500 truncate">{conv.subject ?? conv.channel}</span>
              <Badge variant={conv.status === 'open' ? 'success' : 'default'}>{conv.status}</Badge>
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}
