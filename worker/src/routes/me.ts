import { Hono } from 'hono'
import type { AppEnv } from '../index'

const route = new Hono<AppEnv>()

route.post('/avatar', async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  const form = await c.req.formData().catch(() => null)
  if (!form) return c.json({ error: 'Invalid form data' }, 400)

  const file = form.get('avatar')
  if (!isUploadedFile(file)) return c.json({ error: 'avatar file required' }, 400)
  if (!file.type.startsWith('image/')) return c.json({ error: 'image file required' }, 400)
  if (file.size > 5_000_000) return c.json({ error: 'image too large' }, 400)

  const key = `avatars/${user.id}`
  await c.env.R2.put(key, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type,
    },
  })

  return c.json({
    imageUrl: new URL(`/api/public/avatars/${user.id}?v=${Date.now()}`, c.req.url).toString(),
  })
})

export default route

function isUploadedFile(value: unknown): value is File {
  const file = value as { arrayBuffer?: unknown; type?: unknown } | null
  return Boolean(file && typeof value !== 'string' && typeof file.arrayBuffer === 'function')
}
