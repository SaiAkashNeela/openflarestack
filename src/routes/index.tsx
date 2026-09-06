import { createRoute } from '@tanstack/react-router'
import InboxPage from '@/routes/index'
import { RequireAuth } from '../lib/route-guards'
import { rootRoute } from './__root'

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <RequireAuth>
      <InboxPage />
    </RequireAuth>
  ),
})

export const Route = indexRoute