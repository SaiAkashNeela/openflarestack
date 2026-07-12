import { useState } from 'react'
import { authClient } from '../lib/auth-client'
import { Button } from '../components/Button'
import { Input } from '../components/Input'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        const res = await authClient.signUp.email({ email, password, name })
        if (res.error) throw new Error(res.error.message)
      } else {
        const res = await authClient.signIn.email({ email, password })
        if (res.error) throw new Error(res.error.message)
      }
      window.location.href = '/inbox'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    await authClient.signIn.social({ provider: 'google', callbackURL: '/inbox' })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-brand-600">FlareDesk</h1>
          <p className="mt-1 text-sm text-gray-500">Customer support, reimagined</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 text-lg font-semibold">{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && (
              <Input label="Name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
            )}
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full justify-center" disabled={loading}>
              {loading ? 'Loading…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
          <div className="my-4 flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
            <span className="text-xs text-gray-400">or</span>
            <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
          </div>
          <Button variant="secondary" className="w-full justify-center" onClick={handleGoogle}>
            Continue with Google
          </Button>
          <p className="mt-4 text-center text-xs text-gray-500">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button className="font-medium text-brand-600 hover:underline" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
