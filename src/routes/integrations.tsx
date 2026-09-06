import { createRoute } from '@tanstack/react-router'
import IntegrationsPage from '@/routes/integrations'
import { RequireAuth } from '../lib/route-guards'
import { rootRoute } from './__root'

export const integrationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/integrations',
  component: () => (
    <RequireAuth>
      <IntegrationsPage />
    </RequireAuth>
  ),
})

export const Route = integrationsRoute