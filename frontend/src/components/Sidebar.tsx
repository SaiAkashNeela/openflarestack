import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { authClient } from '../lib/auth-client'
import { getTheme, applyTheme } from '../lib/theme'

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: '◼' },
  { to: '/inbox', label: 'Inbox', icon: '✉' },
  { to: '/integrations', label: 'Integrations', icon: '⚡' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

export function Sidebar() {
  const { data: session } = authClient.useSession()
  const [dark, setDark] = useState(getTheme() === 'dark')
  function toggleTheme() {
    const next = dark ? 'light' : 'dark'
    applyTheme(next)
    setDark(!dark)
  }
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex h-14 items-center gap-2 border-b border-gray-200 px-4 dark:border-gray-800">
        <span className="text-lg font-bold text-brand-600">FlareDesk</span>
      </div>
      <nav className="flex-1 space-y-0.5 p-2">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'}`
            }
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      {session?.user && (
        <div className="border-t border-gray-200 p-3 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-semibold">
              {session.user.name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{session.user.name}</p>
              <p className="text-xs text-gray-500 truncate">{session.user.email}</p>
            </div>
          </div>
          <button type="button" onClick={toggleTheme} aria-label="Toggle dark mode" className="mt-2 w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
            {dark ? '☀ Light mode' : '☾ Dark mode'}
          </button>
        </div>
      )}
    </aside>
  )
}
