# FlareDesk Design Spec
_Date: 2026-07-11_

## What We're Building

FlareDesk is a Cloudflare-native SaaS customer support platform. Think Intercom/Chatwoot but simpler, faster, and built entirely on Cloudflare's edge infrastructure — no external servers, no Redis, no Socket.IO.

---

## Architecture

### Frontend — Cloudflare Pages

- **Framework:** React + Vite (TypeScript strict mode)
- **Styling:** Tailwind CSS with Inter font
- **Themes:** Light + dark mode
- **Build/deploy:** Wrangler Pages deployment

### Backend — Cloudflare Workers

- Single Worker as API gateway
- Routes: REST API for CRUD, WebSocket upgrade endpoint
- Authentication via Better Auth (Google OAuth + email)
- Roles: Owner → Admin → Agent → Viewer

### Database — Cloudflare D1

Multi-tenant schema. Every row carries `organization_id`.

Core tables:
- `organizations` — tenant root
- `users` — people with login access
- `team_members` — user ↔ organization ↔ role join
- `customers` — end-users who contact support
- `conversations` — a thread between a customer and the org
- `messages` — individual messages within a conversation
- `integrations` — configured channels (Telegram bot, webhook, API key)
- `events` — append-only audit/event log (message.created, ticket.assigned, etc.)

### Real-Time — Cloudflare Durable Objects

One `ConversationRoom` DO per active conversation:
- Holds WebSocket connections for agents viewing the conversation
- Broadcasts new messages, typing indicators, presence
- State lives only in the DO (no D1 round-trip for live updates)

### Background Jobs — Cloudflare Queues

Queue consumers handle:
- Incoming webhook payloads (validate → create conversation/message in D1 → broadcast via DO)
- Outbound reply delivery (Worker → integration API)
- Notifications

### Long-Running Automation — Cloudflare Workflows (later phase)

- SLA escalation timers
- Auto-assignment rules

### Storage — Cloudflare R2

- File/attachment uploads from agents or customers

---

## Data Flow (Happy Path)

```
Customer message (Telegram / webhook / API)
  → Worker POST /integrations/:id/webhook
  → validate signature
  → enqueue to Cloudflare Queue
  → Queue consumer: upsert customer + conversation + message in D1
  → broadcast via ConversationRoom DO to connected agents
  → agent sees message appear instantly (WebSocket push)

Agent replies in FlareDesk UI
  → POST /conversations/:id/messages (Worker)
  → insert message in D1
  → broadcast via DO to all connected agents
  → enqueue outbound delivery job
  → Queue consumer: call integration API (Telegram sendMessage, etc.)
```

---

## Integration System

Clean interface, no hardcoded channels:

```ts
interface Integration {
  receiveMessage(payload: unknown): Promise<IncomingMessage>
  sendMessage(conv: Conversation, text: string): Promise<void>
}
```

First implementation: `telegram.ts`
Then: `webhook.ts`, `custom-api.ts`

Each integration is a single file under `worker/integrations/`.

---

## Authentication

Better Auth handles sessions. Workers validate `Authorization` header (Bearer token from Better Auth session).

Multi-tenancy: every authenticated request resolves `organizationId` from the session. All D1 queries filter by `organization_id`.

---

## Main Screens

| Screen | Purpose |
|--------|---------|
| Dashboard | KPIs: open convos, avg response time, agent activity |
| Inbox | Conversation list + filters + search. Main agent workspace |
| Conversation | Real-time message thread, customer info panel, internal notes |
| Integrations | Add/configure Telegram bot, webhooks, API keys |
| Settings | Users, roles, org settings |

---

## Phased Delivery

### Phase 1 — Core Foundation
- Repo scaffold (Worker + Pages + D1)
- Database schema + migrations
- Better Auth (email + Google)
- Organization multi-tenancy middleware

### Phase 2 — Conversations
- D1 CRUD for conversations + messages
- Inbox UI
- Conversation view (polling first, then WebSocket)

### Phase 3 — Real-Time
- Durable Object `ConversationRoom`
- WebSocket upgrade in Worker
- Typing indicators + presence in UI

### Phase 4 — Telegram Integration
- Telegram webhook receiver
- Reply sender
- Integration config UI

### Phase 5 — Queues + Polish
- Move webhook processing off the hot path into Queues
- File attachments via R2
- Dashboard metrics
- Dark mode, keyboard shortcuts

### Phase 6 — Production Hardening
- Tests (unit + integration + webhook simulation)
- Wrangler deploy scripts
- README + ARCHITECTURE + INTEGRATIONS docs

---

## Anti-Slop Constraints (Ponytail Active)

- No abstraction layers unless they remove real complexity
- No wrapper functions for wrappers' sake
- Integration = one file per channel
- If a feature fits 20 lines, it stays 20 lines
- Complexity budget enforced per feature
