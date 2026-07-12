# FlareDesk

Cloudflare-native customer support platform. Conversations, real-time messaging, Telegram integration, multi-tenant team inbox.

**Live:** https://flaredesk-evf.pages.dev  
**API:** https://flaredesk-worker.mrsan.workers.dev

## Stack

- **Worker** — Hono v4, Better Auth, Durable Objects (WebSocket), D1, Queues, R2, KV
- **Frontend** — React 18, Vite 5, Tailwind 3, React Router 6

## Local dev

```bash
# Worker
cd worker
npm install
npm run dev         # wrangler dev --local

# Frontend (separate terminal)
cd frontend
npm install
VITE_API_URL=http://localhost:8787 npm run dev
```

## Deploy

```bash
# Worker
cd worker
npx wrangler deploy

# Frontend
cd frontend
npm run build
npx wrangler pages deploy dist --project-name flaredesk --branch main
```

### First-time setup

```bash
cd worker

# Create resources
npx wrangler d1 create flaredesk-db
npx wrangler kv namespace create flaredesk-kv
npx wrangler r2 bucket create flaredesk-attachments
npx wrangler queues create flaredesk-queue

# Fill in the IDs in wrangler.toml, then:
npx wrangler d1 migrations apply flaredesk-db --remote
npx wrangler secret put BETTER_AUTH_SECRET   # paste a 32-byte hex secret
npx wrangler deploy
```

## Features

- Multi-tenant: every DB row scoped to `organization_id`
- Real-time conversation room via Durable Objects + WebSocket
- Telegram bot webhook → inbound message queue → D1 → broadcast
- Google OAuth + email/password via Better Auth
- Dark mode (persisted to localStorage)
- Dashboard stats, conversation inbox, integrations management, team settings

## Environment variables (worker)

| Var | Description |
|-----|-------------|
| `BETTER_AUTH_SECRET` | 32-byte secret (wrangler secret) |
| `ENVIRONMENT` | `production` or `development` |
| `FRONTEND_URL` | CORS allowed origin |

## Telegram integration

1. Create a bot via BotFather
2. Add integration in FlareDesk UI → copy the webhook URL
3. Set webhook: `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WEBHOOK_URL>"`
