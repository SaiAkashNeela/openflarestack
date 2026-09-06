import { createRoute } from '@tanstack/react-router'
import NotificationsPage from '@/routes/notifications'
import { RequireAuth } from '../lib/route-guards'
import { rootRoute } from './__root'

export const notificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notifications',
  component: () => (
    <RequireAuth>
      <NotificationsPage />
    </RequireAuth>
  ),
})

export const Route = notificationsRoute