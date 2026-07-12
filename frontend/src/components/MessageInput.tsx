import { useState } from 'react'
import { Button } from './Button'

interface Props {
  onSend: (text: string) => Promise<void>
  onTyping: () => void
  disabled?: boolean
}

export function MessageInput({ onSend, onTyping, disabled }: Props) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  async function doSend() {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await onSend(text.trim())
      setText('')
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void doSend() }} className="border-t border-gray-200 dark:border-gray-800 p-4">
      <div className="flex gap-2 items-end">
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); onTyping() }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void doSend() } }}
          placeholder="Type a reply… (Enter to send, Shift+Enter for newline)"
          rows={2}
          disabled={disabled}
          className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900"
        />
        <Button type="submit" disabled={!text.trim() || sending || disabled}>
          {sending ? '…' : 'Send'}
        </Button>
      </div>
    </form>
  )
}
