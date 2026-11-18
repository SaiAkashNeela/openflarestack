# AGENTS.md

Instructions for AI coding agents (and humans) working on OpenFlareStack. This file is the single
source of truth; `CLAUDE.md` imports it.

## What this is

A static catalog of open-source apps that deploy to Cloudflare. There is no server and no database:
`data/*.json` in git is the database, GitHub Actions runs the nightly pipeline and the submission
bot, and `scripts/build-site.js` writes plain HTML into `dist/`, served by a static-assets-only
Cloudflare Worker (`wrangler.jsonc`). Node 22+, ES modules, **no dependencies**.

## Commands

| What | Command |
|---|---|
| Tests (Node's built-in runner) | `npm test` |
| Build the site into `dist/` | `npm run build` |
| Build offline (no avatar downloads) | `SKIP_AVATARS=1 npm run build` |
| Build and preview with Wrangler | `npm run dev` |
| Nightly pipeline (needs a GitHub token) | `GH_SEARCH_TOKEN=$(gh auth token) npm run catalog:daily` |
| Submission bot (GitHub Actions only) | `npm run catalog:submission` |

Environment variables are listed in `.env.example`.

## Layout

- `lib/` – shared by the scripts, the build **and the browser** (shipped as-is to `/lib/`). Keep it
  free of Node-only APIs and secrets.
- `scripts/daily.js` + `scripts/stages/` – import → discover → refresh → filter → enrich → classify → publish.
- `scripts/build-site.js` – every page, `sitemap.xml`, `robots.txt`, `llms.txt`, the JSON API and `_headers`.
- `scripts/lib/` – Node-only helpers (GitHub client, data store, CSS minifier, title/description limits).
- `site/` – `site/styles.css` (inlined into every page at build time), `site/app.js`, static assets.
- `data/` – written by the pipeline. Hand decisions go in `data/overrides.json` only.
- `test/` – `node --test` files. `test/site-build.test.js` builds the whole site from a hostile fixture.

## Conventions

- No new runtime or dev dependencies without asking. The site has no framework and no bundler.
- Pages are HTML template strings. **Every catalog value goes through `esc()`** from `lib/render.js`,
  in text and in attributes, including values that "can't" contain markup (repo names, licences).
- JSON-LD is written with `JSON.stringify(...).replace(/</g, '\\u003c')`. Keep it that way.
- Meta titles and descriptions go through `pageTitle()` / `clipText()` (`scripts/lib/seo.js`) in
  `layout()`. Don't bypass them.
- Slugs are stable forever once assigned (`scripts/stages/publish.js`). Never rename existing slugs.
- Markdown, `llms.txt` and JSON outputs are text, not HTML; they are served with explicit
  `Content-Type` and `nosniff` from `_headers`.

## Security rules

- Treat all catalog data as untrusted: it comes from third-party READMEs, GitHub metadata and LLM
  output that a README can steer. New sinks need `esc()` and a case in `test/site-build.test.js`.
- `deploy_url` must stay an `https://deploy.workers.cloudflare.com/...` link (see `DEPLOY_RE` in
  `scripts/stages/enrich.js` and `deployUrl()` in `lib/config.js`).
- Workflows: never interpolate `${{ github.event.* }}` into `run:`; pass values through `env:`.
  `.github/workflows/submission.yml` runs on issues anyone can open.
- Secrets live in GitHub Actions secrets only. Never commit tokens, `.env` or `.dev.vars`.
- Security headers for every response are set in the `_headers` block at the end of
  `scripts/build-site.js` and checked by `test/site-build.test.js`. Don't remove them. Adding a `script-src`
  CSP needs the PilotFox analytics origin and any Cloudflare zone features (Web Analytics,
  Rocket Loader) accounted for first.

## Performance rules

- The stylesheet is minified and inlined into each page; keep `site/styles.css` lean, since every
  page carries it. Don't add a `<link rel="stylesheet">` back.
- No third-party requests other than the PilotFox analytics script. Fonts and avatars are served
  from our own domain. Avatars below the fold use `data-src` and load on scroll.
- JS and `lib/` modules are cached for a year via the `?v=<hash>` query; the hash covers
  `site/` and `lib/` and is recomputed by the build.
- Check changes with Lighthouse (mobile) on `/`, an app page and a category page.

## Before merging (merge gate)

Nothing merges to `main` unless all of these pass on the branch, up to date with `main`:

1. `npm test` – all tests pass, none skipped or deleted.
2. `npm run build` – completes without errors.
3. No secrets in the diff; no new dependencies without sign-off.
4. README.md, AGENTS.md and `.env.example` match any changed commands, paths or env vars.
5. Findings in `.security-audit/findings.json` are all `fixed`, or `accepted` by the maintainer.
