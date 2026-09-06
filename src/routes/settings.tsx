import { createRoute } from '@tanstack/react-router'
import SettingsPage from '@/routes/settings'
import { RequireAuth } from '../lib/route-guards'
import { rootRoute } from './__root'

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: () => (
    <RequireAuth>
      <SettingsPage />
    </RequireAuth>
  ),
})

export const Route = settingsRoute