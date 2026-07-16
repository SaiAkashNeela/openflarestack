import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authClient } from '../lib/auth-client'
import { Button } from '../components/Button'
import { Input } from '../components/Input'

export function OnboardingPage() {
  const navigate = useNavigate()
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      const res = await authClient.organization.create({ name: orgName, slug })
      if (res.error) throw new Error(res.error.message)
      const orgId = res.data?.id
      if (!orgId) throw new Error('No org ID returned')
      const setRes = await authClient.organization.setActive({ organizationId: orgId })
      if (setRes.error) throw new Error(setRes.error.message)
      navigate('/inbox')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-brand-600">FlareDesk</h1>
          <p className="mt-1 text-sm text-gray-500">Set up your workspace</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-1 text-lg font-semibold">Create your organization</h2>
          <p className="mb-4 text-sm text-gray-500">This is your team's workspace in FlareDesk.</p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              label="Organization name"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Inc."
              required
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full justify-center" disabled={loading || !orgName.trim()}>
              {loading ? 'Creating…' : 'Create workspace'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
