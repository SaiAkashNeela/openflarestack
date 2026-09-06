import { createRoute } from '@tanstack/react-router'
import LoginPage from '@/routes/login'
import { rootRoute } from './__root'

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

export const Route = loginRoute