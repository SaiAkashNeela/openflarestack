import type { Customer, Conversation } from '../lib/types'
import { Avatar } from './Avatar'
import { Badge } from './Badge'
import { Button } from './Button'

interface Props {
  customer: Customer | null
  conversation: Conversation | null
  onResolve: () => void
}

export function CustomerPanel({ customer, conversation, onResolve }: Props) {
  if (!customer) return null
  return (
    <aside className="w-72 shrink-0 border-l border-gray-200 dark:border-gray-800 p-4 space-y-5 overflow-y-auto">
      <div className="flex flex-col items-center text-center gap-2 pt-2">
        <Avatar name={customer.name} size="lg" />
        <div>
          <p className="font-semibold">{customer.name}</p>
          {customer.email && <p className="text-sm text-gray-500">{customer.email}</p>}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Conversation</p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Status</span>
          <Badge variant={conversation?.status === 'open' ? 'success' : 'default'}>{conversation?.status}</Badge>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Channel</span>
          <span className="font-medium">{conversation?.channel}</span>
        </div>
      </div>
      {conversation?.status === 'open' && (
        <Button variant="secondary" size="sm" className="w-full justify-center" onClick={onResolve}>
          Resolve conversation
        </Button>
      )}
    </aside>
  )
}
