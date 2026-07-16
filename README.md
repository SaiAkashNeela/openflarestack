# openflarestack

Cloudflare-native customer support platform. Conversations, real-time messaging, Telegram integration, multi-tenant team inbox.

## Stack

- **Worker** - Hono v4, Better Auth, Durable Objects (WebSocket), D1, Queues, R2, KV
- **UI** - React 19, Vite 8, Tailwind 4, React Router 6

## Local dev

```bash
# Worker
cd worker
npm install
npm run dev

# UI
cd new-ui
npm install
npm run dev
```

The UI talks to the local worker through a Vite proxy on `/api`, so the worker
needs to be running on `http://127.0.0.1:8787` while you use the frontend.

## Deploy

```bash
# Worker
cd worker
npx wrangler deploy

# UI
cd new-ui
npm run build
npx wrangler pages deploy dist --project-name openflarestack --branch main
```

### First-time setup

```bash
cd worker

# Create resources
npx wrangler d1 create openflarestack-db
npx wrangler kv namespace create openflarestack-kv
npx wrangler r2 bucket create openflarestack-attachments
npx wrangler queues create openflarestack-queue

# Fill in the IDs in wrangler.toml, then:
npx wrangler d1 migrations apply openflarestack-db --remote
npx wrangler secret put BETTER_AUTH_SECRET   # paste a 32-byte hex secret
npx wrangler deploy
```

## Features

- Multi-tenant: every DB row scoped to `organization_id`
- Real-time conversation room via Durable Objects + WebSocket
- Telegram bot webhook -> inbound message queue -> D1 -> broadcast
- Google OAuth + email/password via Better Auth
- Dark mode persisted in `localStorage`
- Dashboard stats, conversation inbox, integrations management, team settings

## Environment variables (worker)

| Var | Description |
|-----|-------------|
| `BETTER_AUTH_SECRET` | 32-byte secret (wrangler secret) |
| `ENVIRONMENT` | `production` or `development` |
| `FRONTEND_URL` | CORS allowed origin |

## Telegram integration

1. Create a bot via BotFather
2. Add integration in openflarestack UI -> copy the webhook URL
3. Set webhook: `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WEBHOOK_URL>"`
