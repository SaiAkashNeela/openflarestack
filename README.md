# openflarestack

Node.js customer support platform. Conversations, real-time messaging, Telegram integration, multi-tenant team inbox.

## Stack

- **Server** - Node.js, TypeScript, Hono v4, Better Auth, PostgreSQL, Redis, BullMQ, WebSocket rooms, S3-compatible object storage
- **UI** - React 19, Vite 8, Tailwind 4, React Router 6

## Local dev

Start PostgreSQL and Redis in Docker first, then run the server and frontend:

```bash
# Server
cd server
npm install
DATABASE_URL=postgresql://admin:pass@127.0.0.1:5432/flaredesk_codex_20260717?sslmode=disable \
REDIS_URL=redis://127.0.0.1:6379/0 \
BETTER_AUTH_URL=http://127.0.0.1:8787 \
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

The frontend talks to the local backend through a Vite proxy on `/api`, so the
backend needs to be running on `http://127.0.0.1:8787` while you use the frontend.

## MCP Server

```bash
FLAREDESK_API_URL=http://127.0.0.1:8787 \
FLAREDESK_BEARER_TOKEN=<token from Settings -> Security> \
node mcp.mjs serve
```

The MCP server exposes high-level tools for workspace summary, conversations,
customers, integrations, notifications, and safe message replies. The bearer
token comes from the web app's Security tab after sign-in.

## Features

- Multi-tenant: every DB row scoped to `organization_id`
- Real-time conversation room updates over WebSockets
- Telegram bot webhook -> inbound job -> PostgreSQL -> broadcast
- Redis-backed background jobs with retries, backoff, and dead-letter logging
- Email channel parsing and outbound replies through the server email adapter
- Avatar and attachment uploads through provider-agnostic object storage
- Email/password and Google OAuth auth via Better Auth
- Dark mode persisted in `localStorage`
- Dashboard stats, conversation inbox, integrations management, team settings

## Environment variables (server)

| Var | Description |
|-----|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string used by BullMQ |
| `BETTER_AUTH_SECRET` | 32-byte secret |
| `BETTER_AUTH_URL` | Backend URL used by Better Auth |
| `FRONTEND_URL` | CORS allowed origin |
| `QUEUE_CONCURRENCY` | Optional BullMQ worker concurrency |
| `FLAREDESK_DATA_DIR` | Optional local data directory override |
| `OBJECT_STORAGE_PROVIDER` | `local` by default, set to `s3` for S3-compatible storage |
| `OBJECT_STORAGE_BUCKET` | Bucket name used when `OBJECT_STORAGE_PROVIDER=s3` |
| `OBJECT_STORAGE_REGION` | Region used when `OBJECT_STORAGE_PROVIDER=s3` |
| `OBJECT_STORAGE_ENDPOINT` | Optional S3-compatible endpoint override |
| `OBJECT_STORAGE_ACCESS_KEY_ID` | Optional S3 access key override |
| `OBJECT_STORAGE_SECRET_ACCESS_KEY` | Optional S3 secret key override |
| `OBJECT_STORAGE_FORCE_PATH_STYLE` | Optional path-style toggle for S3-compatible endpoints |
| `GOOGLE_CLIENT_ID` | Optional Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Optional Google OAuth client secret |
| `WEBCHAT_SECRET` | Optional webchat secret; falls back to `BETTER_AUTH_SECRET` |
| `GITHUB_APP_ID` | Optional GitHub App ID |
| `GITHUB_PRIVATE_KEY` | Optional GitHub App private key |

Frontend env:

| Var | Description |
|-----|-------------|
| `VITE_API_URL` | Backend API base URL used by the frontend build |
| `VITE_GOOGLE_CLIENT_ID` | Optional Google OAuth client ID used to show the social sign-in button |

## Telegram integration

1. Create a bot via BotFather
2. Add the integration in the UI and copy the webhook URL
3. Set the webhook: `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WEBHOOK_URL>"`
