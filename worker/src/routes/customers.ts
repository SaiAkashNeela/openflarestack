import { Hono } from 'hono'
import type { AppEnv } from '../index'
import { nanoid } from '../lib/id'
import { extractMetadataFields, mergeMetadata } from '../lib/customer-metadata'

const route = new Hono<AppEnv>()

route.get('/', async (c) => {
  const orgId = c.get('orgId')
  const q = c.req.query('q')
  let stmt = c.env.DB.prepare(
    q
      ? `SELECT * FROM customers WHERE organization_id = ? AND (name LIKE ? OR email LIKE ?) ORDER BY created_at DESC LIMIT 50`
      : `SELECT * FROM customers WHERE organization_id = ? ORDER BY created_at DESC LIMIT 50`
  )
  const params = q ? [orgId, `%${q}%`, `%${q}%`] : [orgId]
  const { results } = await stmt.bind(...params).all()
  return c.json({ customers: results })
})

route.post('/', async (c) => {
  const orgId = c.get('orgId')
  const body = await c.req.json<Record<string, unknown>>()
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return c.json({ error: 'name required' }, 400)

  const email = typeof body.email === 'string' ? body.email : null
  const phone = typeof body.phone === 'string' ? body.phone : null
  const externalId = typeof body.external_id === 'string' ? body.external_id : null
  const avatarUrl = typeof body.avatar_url === 'string' ? body.avatar_url : null
  const metadata = extractMetadataFields(body, ['name', 'email', 'phone', 'external_id', 'avatar_url'])

  const existing = externalId
    ? await c.env.DB.prepare(
        'SELECT id, name, email, phone, avatar_url, external_id, metadata FROM customers WHERE organization_id = ? AND external_id = ?',
      )
        .bind(orgId, externalId)
        .first<{
          id: string
          name: string
          email: string | null
          phone: string | null
          avatar_url: string | null
          external_id: string | null
          metadata: string | null
        }>()
    : null

  const id = existing?.id ?? nanoid()
  const mergedMetadata = mergeMetadata(existing?.metadata, metadata)
  const nextEmail = email ?? existing?.email ?? null
  const nextPhone = phone ?? existing?.phone ?? null
  const nextAvatarUrl = avatarUrl ?? existing?.avatar_url ?? null

  if (existing) {
    await c.env.DB.prepare(`
      UPDATE customers
      SET name = ?, email = ?, phone = ?, avatar_url = ?, metadata = ?, updated_at = unixepoch()
      WHERE id = ? AND organization_id = ?
    `).bind(name, nextEmail, nextPhone, nextAvatarUrl, JSON.stringify(mergedMetadata), id, orgId).run()
  } else {
    await c.env.DB.prepare(`
      INSERT INTO customers (id, organization_id, name, email, phone, external_id, avatar_url, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, orgId, name, nextEmail, nextPhone, externalId, nextAvatarUrl, JSON.stringify(mergedMetadata)).run()
  }

  const customer = await c.env.DB.prepare(
    'SELECT * FROM customers WHERE id = ? AND organization_id = ?',
  ).bind(id, orgId).first()
  return c.json({ customer }, existing ? 200 : 201)
})

route.patch('/:id', async (c) => {
  const orgId = c.get('orgId')
  const customer = await c.env.DB.prepare(
    'SELECT id, name, email, phone, external_id, avatar_url, metadata FROM customers WHERE id = ? AND organization_id = ?',
  )
    .bind(c.req.param('id'), orgId)
    .first<{
      id: string
      name: string
      email: string | null
      phone: string | null
      external_id: string | null
      avatar_url: string | null
      metadata: string | null
    }>()

  if (!customer) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json<Record<string, unknown>>()
  const nextName = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : customer.name
  const nextEmail =
    typeof body.email === 'string' ? body.email : 'email' in body ? null : customer.email
  const nextPhone =
    typeof body.phone === 'string' ? body.phone : 'phone' in body ? null : customer.phone
  const nextExternalId =
    typeof body.external_id === 'string'
      ? body.external_id
      : 'external_id' in body
        ? null
        : customer.external_id
  const nextAvatarUrl =
    typeof body.avatar_url === 'string'
      ? body.avatar_url
      : 'avatar_url' in body
        ? null
        : customer.avatar_url
  const metadata = extractMetadataFields(body, ['name', 'email', 'phone', 'external_id', 'avatar_url'])
  const mergedMetadata = mergeMetadata(customer.metadata, metadata)

  await c.env.DB.prepare(`
    UPDATE customers
    SET name = ?, email = ?, phone = ?, external_id = ?, avatar_url = ?, metadata = ?, updated_at = unixepoch()
    WHERE id = ? AND organization_id = ?
  `).bind(
    nextName,
    nextEmail,
    nextPhone,
    nextExternalId,
    nextAvatarUrl,
    JSON.stringify(mergedMetadata),
    customer.id,
    orgId,
  ).run()

  const updated = await c.env.DB.prepare(
    'SELECT * FROM customers WHERE id = ? AND organization_id = ?',
  ).bind(customer.id, orgId).first()
  return c.json({ customer: updated })
})

route.get('/:id', async (c) => {
  const orgId = c.get('orgId')
  const customer = await c.env.DB.prepare(
    'SELECT * FROM customers WHERE id = ? AND organization_id = ?'
  ).bind(c.req.param('id'), orgId).first()
  if (!customer) return c.json({ error: 'Not found' }, 404)
  const { results: conversations } = await c.env.DB.prepare(
    'SELECT * FROM conversations WHERE customer_id = ? AND organization_id = ? ORDER BY last_message_at DESC LIMIT 20'
  ).bind(c.req.param('id'), orgId).all()
  return c.json({ customer, conversations })
})

export default route
