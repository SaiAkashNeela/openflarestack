import { useEffect, useState } from 'react'
import { api } from '../lib/api'

interface Stats { open: number; resolved: number; today: number }

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-5 bg-white dark:bg-gray-900">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
    </div>
  )
}

export function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Stats>('/api/v1/conversations/stats')
      .then(setStats)
      .catch((e: Error) => setError(e.message))
  }, [])

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {stats ? (
        <div className="grid grid-cols-3 gap-4">
          <StatTile label="Open conversations" value={stats.open} />
          <StatTile label="Resolved" value={stats.resolved} />
          <StatTile label="New today" value={stats.today} />
        </div>
      ) : !error && (
        <div className="grid grid-cols-3 gap-4">
          {[0,1,2].map(i => <div key={i} className="h-24 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}
        </div>
      )}
    </div>
  )
}
