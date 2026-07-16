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
- Cloudflare Email Service inbound routing -> queue -> D1 -> broadcast
- Cloudflare Email Service outbound replies from the Worker binding
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

## Email integration

Cloudflare Email Service can cover both inbound support mail and outbound replies, but the plan matters:

- Inbound routing works on Free and Paid plans.
- Outbound sending to arbitrary customer addresses requires Workers Paid.
- Sending to verified destination addresses is free on all plans.

Setup:

1. Onboard your domain in Cloudflare Email Service.
2. Create an Email Routing rule for the support address you want Flaredesk to own.
3. Add that same address as an Email channel in the Flaredesk UI.
4. Add the `send_email` binding named `EMAIL` in `worker/wrangler.toml`.

The worker parses incoming mail with `postal-mime` and turns it into a normal conversation message, so email becomes another channel in the same inbox instead of a separate system.

## Cloudflare-native extras to consider

If you want the stack to stay as Cloudflare-first as possible, the best next additions are:

- Replace Google OAuth with a Cloudflare-native auth path if you want to remove the last third-party login dependency.
- Add Turnstile to signup and invite flows for abuse prevention.
- Use Workers AI for reply suggestions, conversation summaries, or auto-triage.
- Use R2 for attachments and generated exports so files stay on Cloudflare too.
- Keep Email Service for inbound/outbound support mail and Webhooks/Queues for everything else.
