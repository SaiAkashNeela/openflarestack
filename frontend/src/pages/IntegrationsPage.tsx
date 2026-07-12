import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Integration } from '../lib/types'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'

export function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [botToken, setBotToken] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')

  useEffect(() => {
    api.get<{ integrations: Integration[] }>('/api/v1/integrations')
      .then((r) => setIntegrations(r.integrations))
      .catch(console.error)
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const r = await api.post<{ integration: Integration }>('/api/v1/integrations', {
        type: 'telegram', name, config: { bot_token: botToken },
      })
      setIntegrations((prev) => [...prev, r.integration])
      const workerUrl = import.meta.env.VITE_API_URL ?? window.location.origin
      setWebhookUrl(`${workerUrl}/api/webhooks/telegram/${r.integration.id}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    await api.del(`/api/v1/integrations/${id}`)
    setIntegrations((prev) => prev.filter((i) => i.id !== id))
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Integrations</h1>
        <Button onClick={() => setShowAdd(true)}>Add Telegram Bot</Button>
      </div>
      {integrations.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-10 text-center text-sm text-gray-400">
          No integrations yet. Add a Telegram bot to get started.
        </div>
      )}
      <div className="space-y-3">
        {integrations.map((int) => (
          <div key={int.id} className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <div>
              <p className="font-medium text-sm">{int.name}</p>
              <p className="text-xs text-gray-500">{int.type} · {int.enabled ? 'active' : 'disabled'}</p>
            </div>
            <Button variant="danger" size="sm" onClick={() => handleDelete(int.id)}>Remove</Button>
          </div>
        ))}
      </div>
      <Modal open={showAdd} title="Add Telegram Bot" onClose={() => { setShowAdd(false); setWebhookUrl('') }}>
        {!webhookUrl ? (
          <form onSubmit={handleAdd} className="space-y-4">
            <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Support Bot" required />
            <Input label="Telegram Bot Token" value={botToken} onChange={(e) => setBotToken(e.target.value)} placeholder="123456:ABC-DEF..." required />
            <Button type="submit" className="w-full justify-center" disabled={saving}>{saving ? 'Saving…' : 'Add Bot'}</Button>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Bot added! Set this webhook URL in BotFather or via the Telegram API:</p>
            <div className="rounded-lg bg-gray-100 dark:bg-gray-800 p-3 break-all text-xs font-mono">{webhookUrl}</div>
            <p className="text-xs text-gray-500">Run: <code>curl "https://api.telegram.org/bot{'<TOKEN>'}/setWebhook?url={'<above_url>'}"</code></p>
            <Button className="w-full justify-center" onClick={() => { setShowAdd(false); setWebhookUrl(''); setName(''); setBotToken('') }}>Done</Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
