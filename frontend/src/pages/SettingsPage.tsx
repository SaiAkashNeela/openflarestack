import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Avatar } from '../components/Avatar'
import { Badge } from '../components/Badge'

interface Member { user_id: string; name: string; email: string; role: string; image: string | null }

export function SettingsPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<{ members: Member[] }>('/api/v1/teams')
      .then((r) => setMembers(r.members))
      .catch((e: Error) => setError(e.message))
  }, [])

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold mb-4">Team Members</h1>
        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-200 dark:divide-gray-800">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-3 p-4">
              <Avatar name={m.name} src={m.image} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{m.name}</p>
                <p className="text-xs text-gray-500">{m.email}</p>
              </div>
              <Badge>{m.role}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
