import { Outlet, createRootRoute, useLocation } from '@tanstack/react-router'

const PAGE_META: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'Inbox - openflarestack',
    description: 'All customer conversations from email, Telegram, and web chat in one unified inbox.',
  },
  '/dashboard': {
    title: 'Dashboard - openflarestack',
    description: 'Key support metrics: open conversations, response time, team throughput.',
  },
  '/integrations': {
    title: 'Channels - openflarestack',
    description:
      'Connect email, Telegram, web chat, GitHub, Discord, and model providers to route conversations into openflarestack.',
  },
  '/team': {
    title: 'Team - openflarestack',
    description: 'Manage teammates, roles, and permissions across your openflarestack workspace.',
  },
  '/notifications': {
    title: 'Notifications - openflarestack',
    description: 'View your recent notifications and mark them read.',
  },
  '/welcome': {
    title: 'Welcome - openflarestack',
    description: 'Connect your first channel to start managing customer conversations in openflarestack.',
  },
  '/login': {
    title: 'Sign in - openflarestack',
    description: 'Sign in to your openflarestack workspace to manage customer conversations.',
  },
  '/signup': {
    title: 'Create your workspace - openflarestack',
    description: 'Start a new openflarestack workspace and connect your first support channel in minutes.',
  },
  '/profile': {
    title: 'Profile - openflarestack',
    description: 'Manage your openflarestack profile and personal preferences.',
  },
  '/settings': {
    title: 'Settings - openflarestack',
    description: 'Workspace preferences, notifications, and appearance.',
  },
  '*': {
    title: 'Not found - openflarestack',
    description: 'The page you tried to open does not exist in openflarestack.',
  },
}

export const rootRoute = createRootRoute({
  component: RootLayout,
})

export const Route = rootRoute

function RootLayout() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const meta = PAGE_META[pathname] ?? PAGE_META['*']

  if (typeof document !== 'undefined') {
    document.title = meta.title

    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!description) {
      description = document.createElement('meta')
      description.setAttribute('name', 'description')
      document.head.appendChild(description)
    }
    description.setAttribute('content', meta.description)
  }

  return <Outlet />
}