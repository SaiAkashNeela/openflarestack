import { Hono } from 'hono'
import type { AppEnv } from '../index'
import { nanoid } from '../lib/id'

const route = new Hono<AppEnv>()

route.post('/', async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  const form = await c.req.formData().catch(() => null)
  if (!form) return c.json({ error: 'Invalid form data' }, 400)

  const file = form.get('file')
  if (!isUploadedFile(file)) return c.json({ error: 'file required' }, 400)
  if (file.size > 10_000_000) return c.json({ error: 'file too large' }, 400)

  const objectId = nanoid()
  const key = `uploads/${objectId}`
  await c.env.R2.put(key, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream',
    },
    customMetadata: {
      filename: file.name,
    },
  })

  return c.json({
    id: objectId,
    name: file.name,
    url: new URL(`/api/public/uploads/${objectId}`, c.req.url).toString(),
  })
})

export default route

function isUploadedFile(value: unknown): value is File {
  const file = value as { arrayBuffer?: unknown; type?: unknown } | null
  return Boolean(file && typeof value !== 'string' && typeof file.arrayBuffer === 'function')
}
