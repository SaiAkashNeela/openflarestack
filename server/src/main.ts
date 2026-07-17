import { createServer } from 'node:http'
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import { Readable } from 'node:stream'
import { WebSocketServer } from 'ws'
import { app } from './index'
import { verifyWebChatSessionToken } from './integrations/webchat'
import { createNodeRuntime } from './node/runtime'

const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST ?? '127.0.0.1'

const runtime = await createNodeRuntime({ port })
const wss = new WebSocketServer({ noServer: true })

const server = createServer(async (request, response) => {
  try {
    const fetchRequest = toRequest(request, port)
    const fetchResponse = await app.fetch(fetchRequest, runtime.env)
    await writeResponse(response, fetchResponse)
  } catch (error) {
    console.error('Request failed', error)
    if (!response.headersSent) {
      response.statusCode = 500
      response.setHeader('content-type', 'application/json; charset=utf-8')
    }
    response.end(JSON.stringify({ error: 'Internal server error' }))
  }
})

server.on('upgrade', async (request, socket, head) => {
  try {
    const nodeSocket = request.socket as Socket
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `127.0.0.1:${port}`}`)

    if (isConversationSocket(url.pathname)) {
      const conversationId = url.pathname.split('/').pop() ?? ''
      const session = await getSession(request.headers)
      const tenant = await resolveTenant(session)
      if (!session?.user?.id) return rejectUpgrade(nodeSocket, 401, 'Unauthorized')
      if (!tenant) return rejectUpgrade(nodeSocket, 403, 'No active organization')

      const conversation = await runtime.env.DB.prepare(
        'SELECT id FROM conversations WHERE id = ? AND organization_id = ?',
      )
        .bind(conversationId, tenant.orgId)
        .first<{ id: string }>()
      if (!conversation) return rejectUpgrade(nodeSocket, 404, 'Not found')

      wss.handleUpgrade(request, nodeSocket, head, (ws) => {
        runtime.rooms.conversations.attach(conversationId, ws)
      })
      return
    }

    if (isNotificationSocket(url.pathname)) {
      const session = await getSession(request.headers)
      const tenant = await resolveTenant(session)
      if (!session?.user?.id) return rejectUpgrade(nodeSocket, 401, 'Unauthorized')
      if (!tenant) return rejectUpgrade(nodeSocket, 403, 'No active organization')

      wss.handleUpgrade(request, nodeSocket, head, (ws) => {
        runtime.rooms.notifications.attach(`${tenant.orgId}:${session.user.id}`, ws)
      })
      return
    }

    if (isPublicWebchatSocket(url.pathname)) {
      const conversationId = url.pathname.split('/').pop() ?? ''
      const token = url.searchParams.get('token') ?? ''
      const session = await verifyWebChatSessionToken(runtime.env, token)

      if (!session || session.conversationId !== conversationId) {
        return rejectUpgrade(nodeSocket, 401, 'Unauthorized')
      }

      wss.handleUpgrade(request, nodeSocket, head, (ws) => {
        runtime.rooms.conversations.attach(conversationId, ws)
      })
      return
    }

    return rejectUpgrade(nodeSocket, 404, 'Not found')
  } catch (error) {
    console.error('WebSocket upgrade failed', error)
    rejectUpgrade(request.socket as Socket, 500, 'Internal server error')
  }
})

server.listen(port, host, () => {
  console.log(`openflarestack server listening on http://${host}:${port}`)
})

async function getSession(headers: IncomingHttpHeaders) {
  const { createAuth } = await import('./auth')
  const auth = createAuth(runtime.env)
  return auth.api.getSession({ headers: headersToFetchHeaders(headers) })
}

async function resolveTenant(session: Awaited<ReturnType<typeof getSession>>) {
  const userId = session?.user?.id ?? ''
  let orgId = session?.session?.activeOrganizationId ?? null

  if (!orgId && userId) {
    const member = await runtime.env.DB.prepare(
      'SELECT organizationId FROM member WHERE userId = ? ORDER BY createdAt ASC LIMIT 1',
    )
      .bind(userId)
      .first<{ organizationId: string }>()
    orgId = member?.organizationId ?? null
  }

  if (!orgId) {
    return null
  }

  const member = await runtime.env.DB.prepare(
    'SELECT role FROM member WHERE organizationId = ? AND userId = ? LIMIT 1',
  )
    .bind(orgId, userId)
    .first<{ role: string }>()

  if (!member?.role) {
    return null
  }

  return { orgId, orgRole: member.role }
}

function toRequest(request: IncomingMessage, port: number) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `127.0.0.1:${port}`}`)
  const headers = headersToFetchHeaders(request.headers)

  if (!request.method || request.method === 'GET' || request.method === 'HEAD') {
    return new Request(url, { method: request.method ?? 'GET', headers })
  }

  return new Request(url, {
    method: request.method,
    headers,
    body: Readable.toWeb(request) as any,
    duplex: 'half',
  } as any)
}

async function writeResponse(response: ServerResponse, fetchResponse: Response) {
  response.statusCode = fetchResponse.status
  response.statusMessage = fetchResponse.statusText

  const headers = fetchResponse.headers as Headers & { getSetCookie?: () => string[] }
  const setCookies = headers.getSetCookie?.() ?? []
  if (setCookies.length > 0) {
    response.setHeader('set-cookie', setCookies)
  }

  fetchResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return
    response.setHeader(key, value)
  })

  if (!fetchResponse.body) {
    response.end()
    return
  }

  const body = Readable.fromWeb(fetchResponse.body as any)
  body.on('error', (error) => {
    console.error('Response stream failed', error)
    if (!response.headersSent) {
      response.statusCode = 500
    }
    response.end()
  })
  body.pipe(response)
}

function headersToFetchHeaders(headers: IncomingHttpHeaders) {
  const result = new Headers()
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'undefined') continue
    if (Array.isArray(value)) {
      for (const item of value) {
        result.append(key, item)
      }
      continue
    }
    result.set(key, value)
  }
  return result
}

function isConversationSocket(pathname: string) {
  return /^\/api\/v1\/ws\/[^/]+$/.test(pathname)
}

function isNotificationSocket(pathname: string) {
  return pathname === '/api/v1/notifications/ws'
}

function isPublicWebchatSocket(pathname: string) {
  return /^\/api\/public\/ws\/[^/]+$/.test(pathname)
}

function rejectUpgrade(socket: Socket, statusCode: number, message: string) {
  const statusText = HTTP_STATUS_TEXT[statusCode] ?? 'Error'
  const body = Buffer.from(message)
  socket.write(
    `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
      'Connection: close\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      `Content-Length: ${body.byteLength}\r\n` +
      '\r\n',
  )
  socket.write(body)
  socket.destroy()
}

const HTTP_STATUS_TEXT: Record<number, string> = {
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  500: 'Internal Server Error',
}
