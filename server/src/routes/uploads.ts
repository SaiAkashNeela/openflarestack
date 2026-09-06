import { Hono } from 'hono'
import type { AppEnv } from '../index'
import { nanoid } from '../lib/id'
import { sanitizeFilename, validateUpload } from '../lib/upload-validation'

const route = new Hono<AppEnv>()

route.post('/', async (c) => {
  const user = c.get('user')
  const orgId = c.var.orgId
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (!orgId) return c.json({ error: 'No active organization' }, 403)

  const form = await c.req.formData().catch(() => null)
  if (!form) return c.json({ error: 'Invalid form data' }, 400)

  const file = form.get('file')
  if (!isUploadedFile(file)) return c.json({ error: 'file required' }, 400)

  const validationError = validateUpload(file)
  if (validationError) return c.json({ error: validationError }, 400)

  const objectId = nanoid()
  const safeName = sanitizeFilename(file.name)
  const key = `uploads/${objectId}`
  await c.env.STORAGE.put(key, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream',
    },
    customMetadata: {
      filename: safeName,
      organizationId: orgId,
      uploadedBy: user.id,
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
