import { createRoute } from '@tanstack/react-router'
import DashboardPage from '@/routes/dashboard'
import { RequireAuth } from '../lib/route-guards'
import { rootRoute } from './__root'

export const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: () => (
    <RequireAuth>
      <DashboardPage />
    </RequireAuth>
  ),
})

export const Route = dashboardRoute