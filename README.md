# OpenFlareStack

A free, static catalog of open-source apps that deploy to your own Cloudflare account, discovered automatically every night from GitHub and ranked. Live at [openflarestack.com](https://openflarestack.com).

There's no backend and no database. Git is the database, GitHub Actions does the work, and the site is plain HTML served by a static-assets-only Cloudflare Worker.

## How it works

```
awesome-cloudflare-selfhosted ─┐
GitHub README search ──────────┼─► daily.yml (03:00 UTC) ─► data/catalog.json ─► npm run build ─► dist/ ─► Cloudflare
"Submit an app" issues ────────┘   import → discover → refresh → filter → enrich → classify → publish
```

1. **Import** the hand-picked entries from [awesome-cloudflare-selfhosted](https://github.com/theoephraim/awesome-cloudflare-selfhosted) (MIT, see `THIRD_PARTY_NOTICES.md`), plus accepted submissions from `data/submissions.json`.
2. **Discover** every README on GitHub that links to `deploy.workers.cloudflare.com`. Code search caps each query at 1,000 results, so the query is sliced by file size.
3. **Refresh** stars, last push, licence, avatar and latest release for every repo, about 100 per GraphQL request.
4. **Filter** out forks, archived repos, repos without an open licence, repos with no commits in 12 months and repos with fewer than 3 stars.
5. **Enrich** new or changed repos: read the README and wrangler config(s), find the Deploy button and turn bindings into tiles.
6. **Classify** with an LLM (strict JSON, fixed category list). Without an LLM configured, awesome-list entries use that list's own category and summary, and everything else waits in `data/review.md`.
7. **Publish** `data/catalog.json` (scored and ranked) and `data/review.md`.

Score: `10 × log10(stars + 1) − min(daysSinceLastPush, 120) / 12 + (hasRelease ? 1 : 0)`.

## Layout

```
lib/          shared by the scripts, the build and the browser (plain ES modules)
  bindings.js   wrangler config → binding tiles
  check.js      the repo checker rules (site checker + submission.yml)
  config.js     site URL, categories, licence rules
  render.js     HTML fragments (rows, cards, detail sheet)
scripts/
  daily.js      the nightly pipeline (stages/ holds each step)
  submission.js handles "Submit an app" issues
  build-site.js writes dist/: home, /apps/<slug>/, /category/<slug>/, /credits/, sitemap.xml
site/         styles.css, app.js (search, filters, sheet, checker), assets/
data/
  repos.json       every repo ever seen and why it is or isn't listed
  catalog.json     what the site renders
  submissions.json accepted submissions
  overrides.json   hand decisions from review (always win)
  review.md        the weekly human queue
```

## Running it locally

Node 22 or newer. No dependencies.

```bash
# The nightly run. Needs a GitHub token for code search.
GH_SEARCH_TOKEN=$(gh auth token) npm run catalog:daily

# Optional: classify with an LLM through any OpenAI-compatible endpoint, e.g. Workers AI
LLM_BASE_URL=https://api.cloudflare.com/client/v4/accounts/<account_id>/ai/v1 \
LLM_API_KEY=<api token> \
GH_SEARCH_TOKEN=$(gh auth token) npm run catalog:daily -- --skip-discover

# Build the site into dist/ and preview it
npm run build
npx wrangler dev

npm test
```

## Reviewing

Open `data/review.md`, then record decisions in `data/overrides.json`:

```json
{
  "owner/repo": { "status": "listed", "category": "Email", "replaces": "Mailchimp" },
  "other/repo": { "status": "rejected", "reason": "Starter template" }
}
```

Overrides can also set `name`, `description`, `bindings` and `deploy_url`.

## Setup

| What | Where |
|---|---|
| `GH_SEARCH_TOKEN` | Actions secret. Fine-grained PAT with public read only. Falls back to the workflow token. |
| `LLM_BASE_URL`, `LLM_API_KEY` | Actions secrets. Any OpenAI-compatible chat completions endpoint, e.g. OpenRouter: `https://openrouter.ai/api/v1`. |
| `LLM_MODEL` | Optional Actions variable. With OpenRouter it defaults to `openrouter/free`, which routes to whatever free models OpenRouter has that day, so nothing needs updating. Otherwise it defaults to `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (Workers AI). |
| `LLM_MAX_PER_RUN` | Actions variable. Default 40, which keeps OpenRouter free models under their 50 requests a day. The rest waits for the next night, most-starred first. |
| `MIN_STARS` | Actions variable. Default 3. |
| Labels `submission`, `accepted`, `needs-changes` | Must exist so the issue form can apply them. |
| Cloudflare | Connect this repo to a Worker named `openflarestack` with Workers Builds. Build command `npm run build`, deploy command `npx wrangler deploy`. |

An independent project, not affiliated with Cloudflare, Inc.
