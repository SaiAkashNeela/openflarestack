#!/usr/bin/env node

import readline from 'node:readline'
import { argv, env, exit, stdin, stdout, stderr } from 'node:process'

const SERVER_INFO = { name: 'openflarestack-mcp', version: '0.1.0' }
const MCP_PROTOCOL_VERSION = '2025-06-18'
const DEFAULT_API_URL = 'http://127.0.0.1:8787'
const MAX_LIMIT = 100
const STATUS_VALUES = new Set(['all', 'open', 'pending', 'resolved', 'closed'])
const TOKEN_HINT = 'Copy the MCP access token from Settings -> Security in the web app.'

const TOOL_DEFINITIONS = [
  {
    name: 'workspace_summary',
    description: 'Summarize the active workspace with stats, team members, and recent unread notifications.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: 'search_workspace',
    description: 'Search conversations, customers, and notifications with one query.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', minLength: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_conversations',
    description: 'List conversations in the active organization.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { type: 'string', enum: ['all', 'open', 'pending', 'resolved', 'closed'], default: 'open' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
    },
  },
  {
    name: 'get_conversation',
    description: 'Fetch a conversation with its customer and message history.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        conversationId: { type: 'string', minLength: 1 },
      },
      required: ['conversationId'],
    },
  },
  {
    name: 'reply_to_conversation',
    description: 'Send an agent reply into a conversation.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        conversationId: { type: 'string', minLength: 1 },
        content: { type: 'string', minLength: 1 },
        contentType: { type: 'string', default: 'text' },
      },
      required: ['conversationId', 'content'],
    },
  },
  {
    name: 'update_conversation',
    description: 'Update conversation status, assignee, or read state.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        conversationId: { type: 'string', minLength: 1 },
        status: { type: 'string', enum: ['open', 'pending', 'resolved', 'closed'] },
        assignedTo: { type: ['string', 'null'] },
        readState: { type: 'string', enum: ['read', 'unread'] },
      },
      required: ['conversationId'],
    },
  },
  {
    name: 'list_customers',
    description: 'List or search customers in the active organization.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', minLength: 1 },
      },
    },
  },
  {
    name: 'get_customer',
    description: 'Fetch a customer and their recent conversations.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        customerId: { type: 'string', minLength: 1 },
      },
      required: ['customerId'],
    },
  },
  {
    name: 'list_team_members',
    description: 'List team members in the active organization.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: 'list_integrations',
    description: 'List connected integrations with secrets redacted.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: 'list_notifications',
    description: 'List notifications for the current user.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        unreadOnly: { type: 'boolean', default: false },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
      },
    },
  },
  {
    name: 'mark_notification_read',
    description: 'Mark one notification as read or unread.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        notificationId: { type: 'string', minLength: 1 },
        read: { type: 'boolean', default: true },
      },
      required: ['notificationId'],
    },
  },
  {
    name: 'mark_all_notifications_read',
    description: 'Mark every notification for the current user as read.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
]

async function main() {
  const command = argv[2] ?? 'serve'
  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  const apiUrl = normalizeUrl(env.FLAREDESK_API_URL ?? DEFAULT_API_URL)
  const token = env.FLAREDESK_BEARER_TOKEN?.trim() ?? ''

  if (!token) {
    stderr.write(`Missing FLAREDESK_BEARER_TOKEN.\n${TOKEN_HINT}\n`)
    exit(1)
    return
  }

  if (command === 'doctor') {
    await doctor(apiUrl, token)
    return
  }

  if (command !== 'serve') {
    stderr.write(`Unknown command: ${command}\n`)
    printHelp()
    exit(1)
    return
  }

  await doctor(apiUrl, token)
  stderr.write(`openflarestack MCP server ready on stdio using ${apiUrl}\n`)
  await serve(apiUrl, token)
}

async function doctor(apiUrl, token) {
  await requestJson(apiUrl, token, '/api/v1/conversations/stats')
}

async function serve(apiUrl, token) {
  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: false, crlfDelay: Infinity })
  rl.on('line', (line) => {
    if (!line.trim()) return
    void handleIncomingLine(apiUrl, token, line)
  })

  await new Promise((resolve) => {
    rl.on('close', resolve)
  })
}

async function handleIncomingLine(apiUrl, token, line) {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    writeResponse({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    })
    return
  }

  if (Array.isArray(message)) {
    const responses = []
    for (const item of message) {
      const response = await handleMessage(apiUrl, token, item)
      if (response) responses.push(response)
    }
    if (responses.length > 0) {
      writeResponse(responses)
    }
    return
  }

  const response = await handleMessage(apiUrl, token, message)
  if (response) {
    writeResponse(response)
  }
}

async function handleMessage(apiUrl, token, message) {
  if (!message || typeof message !== 'object') {
    return errorResponse(null, -32600, 'Invalid Request')
  }

  const { id, method, params } = message
  if (typeof method !== 'string') {
    return errorResponse(id ?? null, -32600, 'Invalid Request')
  }

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {
              tools: { listChanged: false },
            },
            serverInfo: SERVER_INFO,
          },
        }
      case 'notifications/initialized':
      case 'ping':
        return id == null
          ? null
          : {
              jsonrpc: '2.0',
              id,
              result: {},
            }
      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: TOOL_DEFINITIONS,
          },
        }
      case 'tools/call':
        return {
          jsonrpc: '2.0',
          id,
          result: await callTool(apiUrl, token, params),
        }
      default:
        return errorResponse(id ?? null, -32601, `Method not found: ${method}`)
    }
  } catch (error) {
    return errorResponse(id ?? null, -32000, error instanceof Error ? error.message : String(error))
  }
}

async function callTool(apiUrl, token, params) {
  const name = typeof params?.name === 'string' ? params.name : ''
  const args = isPlainObject(params?.arguments) ? params.arguments : {}
  const handler = TOOL_HANDLERS[name]
  if (!handler) {
    return toolError(`Unknown tool: ${name}`)
  }
  return handler(apiUrl, token, args)
}

const TOOL_HANDLERS = {
  workspace_summary: async (apiUrl, token) => {
    const [stats, team, notifications, conversations] = await Promise.all([
      requestJson(apiUrl, token, '/api/v1/conversations/stats'),
      requestJson(apiUrl, token, '/api/v1/teams'),
      requestJson(apiUrl, token, '/api/v1/notifications?unread=true&limit=5'),
      requestJson(apiUrl, token, '/api/v1/conversations?status=open&limit=5'),
    ])

    return toolResult({
      stats,
      teamMembers: Array.isArray(team?.members) ? team.members.length : 0,
      recentUnreadNotifications: Array.isArray(notifications?.notifications) ? notifications.notifications : [],
      recentConversations: Array.isArray(conversations?.conversations) ? conversations.conversations : [],
    })
  },

  search_workspace: async (apiUrl, token, args) => {
    const query = requireString(args.query, 'query')
    const limit = clampInt(args.limit, 10, 1, 50)
    const q = query.toLowerCase()

    const [conversations, customers, notifications] = await Promise.all([
      requestJson(apiUrl, token, '/api/v1/conversations?status=all&limit=100'),
      requestJson(apiUrl, token, `/api/v1/customers?q=${encodeURIComponent(query)}`),
      requestJson(apiUrl, token, '/api/v1/notifications?limit=100'),
    ])

    const conversationMatches = (conversations?.conversations ?? [])
      .filter((item) => {
        const haystack = [
          item.subject,
          item.customer_name,
          item.customer_email,
          item.customer_external_id,
          item.channel,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
      .slice(0, limit)

    const customerMatches = (customers?.customers ?? [])
      .filter((item) => {
        const haystack = [item.name, item.email, item.phone, item.external_id]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
      .slice(0, limit)

    const notificationMatches = (notifications?.notifications ?? [])
      .filter((item) => {
        const haystack = [item.title, item.body, item.entity_type, item.type]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
      .slice(0, limit)

    return toolResult({
      query,
      conversations: conversationMatches,
      customers: customerMatches,
      notifications: notificationMatches,
    })
  },

  list_conversations: async (apiUrl, token, args) => {
    const status = typeof args.status === 'string' ? args.status.trim().toLowerCase() : 'open'
    if (!STATUS_VALUES.has(status)) {
      return toolError(`Invalid status: ${args.status}`)
    }
    const limit = clampInt(args.limit, 20, 1, MAX_LIMIT)
    const response = await requestJson(
      apiUrl,
      token,
      `/api/v1/conversations?status=${encodeURIComponent(status)}&limit=${limit}`,
    )
    return toolResult({ status, limit, conversations: response?.conversations ?? [] })
  },

  get_conversation: async (apiUrl, token, args) => {
    const conversationId = requireString(args.conversationId, 'conversationId')
    const conversation = await requestJson(apiUrl, token, `/api/v1/conversations/${encodeURIComponent(conversationId)}`)
    if (!conversation?.conversation) {
      return toolError(`Conversation not found: ${conversationId}`)
    }

    const [messages, customer] = await Promise.all([
      requestJson(apiUrl, token, `/api/v1/messages/${encodeURIComponent(conversationId)}`),
      requestJson(apiUrl, token, `/api/v1/customers/${encodeURIComponent(conversation.conversation.customer_id)}`),
    ])

    return toolResult({
      conversation: conversation.conversation,
      customer: customer?.customer ?? null,
      messages: messages?.messages ?? [],
      recentCustomerConversations: customer?.conversations ?? [],
    })
  },

  reply_to_conversation: async (apiUrl, token, args) => {
    const conversationId = requireString(args.conversationId, 'conversationId')
    const content = requireString(args.content, 'content')
    const contentType = typeof args.contentType === 'string' && args.contentType.trim()
      ? args.contentType.trim()
      : 'text'
    const response = await requestJson(apiUrl, token, `/api/v1/messages/${encodeURIComponent(conversationId)}`, {
      method: 'POST',
      body: { content, content_type: contentType },
    })

    return toolResult({
      message: response?.message ?? null,
      conversationId,
    })
  },

  update_conversation: async (apiUrl, token, args) => {
    const conversationId = requireString(args.conversationId, 'conversationId')
    const body = {}
    if (typeof args.status === 'string') {
      const status = normalizeConversationStatus(args.status)
      if (!status) {
        return toolError(`Invalid status: ${args.status}`)
      }
      body.status = status
    }
    if ('assignedTo' in args) {
      body.assigned_to = typeof args.assignedTo === 'string' ? args.assignedTo : null
    }
    if (typeof args.readState === 'string') {
      body.readState = args.readState
    }

    if (Object.keys(body).length === 0) {
      return toolError('Provide at least one of status, assignedTo, or readState.')
    }

    const response = await requestJson(apiUrl, token, `/api/v1/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'PATCH',
      body,
    })

    return toolResult({
      conversation: response?.conversation ?? null,
    })
  },

  list_customers: async (apiUrl, token, args) => {
    const query = typeof args.query === 'string' ? args.query.trim() : ''
    const path = query ? `/api/v1/customers?q=${encodeURIComponent(query)}` : '/api/v1/customers'
    const response = await requestJson(apiUrl, token, path)
    return toolResult({
      query: query || null,
      customers: response?.customers ?? [],
    })
  },

  get_customer: async (apiUrl, token, args) => {
    const customerId = requireString(args.customerId, 'customerId')
    const response = await requestJson(apiUrl, token, `/api/v1/customers/${encodeURIComponent(customerId)}`)
    if (!response?.customer) {
      return toolError(`Customer not found: ${customerId}`)
    }
    return toolResult({
      customer: response.customer,
      conversations: response.conversations ?? [],
    })
  },

  list_team_members: async (apiUrl, token) => {
    const response = await requestJson(apiUrl, token, '/api/v1/teams')
    return toolResult({
      members: response?.members ?? [],
    })
  },

  list_integrations: async (apiUrl, token) => {
    const response = await requestJson(apiUrl, token, '/api/v1/integrations')
    const integrations = (response?.integrations ?? []).map(redactIntegration)
    return toolResult({ integrations })
  },

  list_notifications: async (apiUrl, token, args) => {
    const unreadOnly = Boolean(args.unreadOnly)
    const limit = clampInt(args.limit, 25, 1, MAX_LIMIT)
    const query = `/api/v1/notifications?limit=${limit}${unreadOnly ? '&unread=1' : ''}`
    const response = await requestJson(apiUrl, token, query)
    return toolResult({
      notifications: response?.notifications ?? [],
      unreadCount: response?.unreadCount ?? 0,
      preferences: response?.preferences ?? null,
    })
  },

  mark_notification_read: async (apiUrl, token, args) => {
    const notificationId = requireString(args.notificationId, 'notificationId')
    const read = args.read ?? true
    const response = await requestJson(apiUrl, token, `/api/v1/notifications/${encodeURIComponent(notificationId)}`, {
      method: 'PATCH',
      body: { read: Boolean(read) },
    })
    return toolResult({
      notification: response?.notification ?? null,
    })
  },

  mark_all_notifications_read: async (apiUrl, token) => {
    const response = await requestJson(apiUrl, token, '/api/v1/notifications/read-all', {
      method: 'POST',
    })
    return toolResult({
      ok: Boolean(response?.ok),
    })
  },
}

function toolResult(value) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
    structuredContent: value,
  }
}

function toolError(message) {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
    structuredContent: { error: message },
  }
}

async function requestJson(apiUrl, token, path, options = {}) {
  const method = options.method ?? 'GET'
  const headers = {
    authorization: `Bearer ${token}`,
    ...(options.body ? { 'content-type': 'application/json' } : {}),
  }

  const res = await fetch(new URL(path, apiUrl), {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const text = await res.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }
  }

  if (!res.ok) {
    const error = data?.error ?? data?.message ?? text ?? `HTTP ${res.status}`
    throw new Error(`Worker request failed (${res.status}): ${error}`)
  }

  return data
}

function redactIntegration(integration) {
  const config = safeParseJson(integration.config)
  return {
    id: integration.id,
    type: integration.type,
    name: integration.name,
    enabled: Boolean(integration.enabled),
    created_at: integration.created_at,
    config: redactSecrets(config),
  }
}

function redactSecrets(value) {
  if (Array.isArray(value)) {
    return value.map(redactSecrets)
  }
  if (!isPlainObject(value)) return value

  const sensitive = new Set([
    'apiKey',
    'authToken',
    'clientSecret',
    'privateKey',
    'botToken',
    'secret',
    'webhookSecret',
    'password',
    'accessToken',
    'refreshToken',
  ])

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sensitive.has(key) ? redactValue(entry) : redactSecrets(entry),
    ]),
  )
}

function redactValue(value) {
  if (typeof value !== 'string') return '[redacted]'
  if (!value) return value
  return `${value.slice(0, 4)}…[redacted]`
}

function safeParseJson(value) {
  if (typeof value !== 'string' || !value) return {}
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} is required`)
  }
  return value.trim()
}

function clampInt(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

function normalizeConversationStatus(value) {
  if (typeof value !== 'string') return null
  const next = value.trim().toLowerCase()
  return ['open', 'pending', 'resolved', 'closed'].includes(next) ? next : null
}

function normalizeUrl(value) {
  const next = new URL(value)
  return next.toString().replace(/\/$/, '')
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function errorResponse(id, code, message) {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message },
  }
}

function writeResponse(payload) {
  stdout.write(`${JSON.stringify(payload)}\n`)
}

function printHelp() {
  stderr.write(`Usage:
  node mcp.mjs serve
  node mcp.mjs doctor

Environment:
  FLAREDESK_API_URL       Worker URL, default ${DEFAULT_API_URL}
  FLAREDESK_BEARER_TOKEN  Better Auth bearer token

${TOKEN_HINT}
`)
}

main().catch((error) => {
  stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  exit(1)
})
