import { Hono } from 'hono'

// Env interface exposing all Cloudflare bindings declared in wrangler.toml.
// NOTE: REPLACE_AFTER_CREATE placeholders in wrangler.toml must be updated
// with real IDs after running:
//   wrangler d1 create flaredesk-db
//   wrangler kv namespace create flaredesk-kv
//   wrangler queues create flaredesk-queue
//   wrangler r2 bucket create flaredesk-attachments
export interface Env {
  // D1 relational database
  DB: D1Database
  // Durable Object for real-time conversation rooms
  CONVERSATION_ROOM: DurableObjectNamespace
  // Queue for async job processing
  QUEUE: Queue
  // R2 object storage for attachments
  R2: R2Bucket
  // KV store for session caching / feature flags
  KV: KVNamespace
  // Vars from wrangler.toml [vars] and .dev.vars
  ENVIRONMENT: string
  FRONTEND_URL: string
  BETTER_AUTH_SECRET: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
}

const app = new Hono<{ Bindings: Env }>()

app.get('/', (c) => c.text('FlareDesk Worker OK'))

export default app

// ---------------------------------------------------------------------------
// Durable Object: ConversationRoom
// Handles real-time WebSocket sessions for a single support conversation.
// ---------------------------------------------------------------------------
export class ConversationRoom implements DurableObject {
  private readonly state: DurableObjectState

  constructor(state: DurableObjectState) {
    this.state = state
  }

  async fetch(_request: Request): Promise<Response> {
    return new Response('ConversationRoom stub — WebSocket logic coming in Task 5', {
      status: 200,
    })
  }
}
