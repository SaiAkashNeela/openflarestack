import { createRoute } from '@tanstack/react-router'
import SignupPage from '@/routes/signup'
import { rootRoute } from './__root'

export const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/signup',
  component: SignupPage,
})

export const Route = signupRoute