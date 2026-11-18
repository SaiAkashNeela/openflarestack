# Security Audit Report — OpenFlareStack

| | |
|---|---|
| **Date** | 2026-11-18 |
| **Commit audited** | `657c36f` on `main` |
| **Remediation branch** | `claude/festive-thompson-sg9zro` (session branch, used instead of `security-audit/2026-11-18`) |
| **Scope** | Whole repository: `scripts/` (nightly pipeline, submission bot, site build), `lib/` (shared with the browser), `site/`, `.github/workflows/`, `wrangler.jsonc`, generated `dist/`. `data/` was reviewed as untrusted input, not edited. |
| **Auditor** | Claude (Ironclad skill) |

## 1. Executive summary

OpenFlareStack is a static site with no server, database or user accounts, so its attack surface is small. The real risk is that the site publishes text that third parties control: GitHub READMEs and repo metadata, and LLM output steered by those READMEs. One place let that text become live HTML on the home page (SEC-001, Medium). It's fixed, and a new test builds the whole site from a deliberately malicious catalog to stop it coming back. Responses also gained anti-framing, HSTS and Permissions-Policy headers (SEC-002, Low).

The site was already fast (Lighthouse 99–100). It's now faster on first visits: the stylesheet is inlined, which cuts mobile First Contentful Paint by about 100–250 ms. Meta titles and descriptions now fit search results and link previews. Documentation was brought in line with the code (AGENTS.md, CLAUDE.md, `.env.example`). Every finding is fixed, and no human action is required before merging.

| Severity | Found | Fixed | Open |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 1 | 1 | 0 |
| Low | 1 | 1 | 0 |
| Info | 0 | — | — |

Non-security findings (separate counts): SEO 3 found / 3 fixed, SOC 1 / 1, DOC 3 / 3.

## 2. Open action items (human required)

None are blocking. Optional follow-ups:

1. After deploy, re-scrape link previews (Facebook Sharing Debugger, LinkedIn Post Inspector, paste a URL into the X composer), because descriptions changed.
2. Resubmit `https://openflarestack.com/sitemap.xml` in Google Search Console and Bing Webmaster Tools so the shorter titles and descriptions are picked up sooner.
3. Decide on the recommendations in §13 (script-src CSP, pinning Actions to SHAs, a CI merge gate).

## 3. System overview

- **Stack:** Node 22+, plain ES modules, no dependencies. Static HTML built by `scripts/build-site.js` into `dist/` and served by a static-assets-only Cloudflare Worker (`wrangler.jsonc`, `_headers`).
- **Entry points:** there are no runtime server endpoints. Untrusted input reaches the system through:
  - the nightly pipeline (`daily.yml` → `scripts/daily.js`): GitHub code search, REST/GraphQL, the awesome-cloudflare-selfhosted list, and an optional OpenAI-compatible LLM;
  - the submission bot (`submission.yml` → `scripts/submission.js`), triggered by issues that anyone can open;
  - the in-browser repo checker (`site/app.js`), which calls GitHub's public API from the visitor's browser.
- **Trust boundaries:**
  - Third-party README text, repo metadata and LLM output → `data/catalog.json` → HTML pages, Markdown, JSON API.
  - Issue body → regex-parsed `owner/repo` → GitHub API (fixed host).
- **Identity:** none for site visitors. GitHub Actions hold `GH_SEARCH_TOKEN`, `LLM_API_KEY` and the workflow token (`contents: write`, `issues: write`).
- **Sensitive data:** none about users. Secrets live only in Actions secrets.
- **Third-party script:** PilotFox analytics (`defer`).

## 4. Methodology

Ironclad phases 0–6.
- **Recon:** read every source file and workflow.
- **Automated:**
  - `run_scanners.sh`: only the grep secret-pattern fallback was available. gitleaks, trufflehog, semgrep, osv-scanner, trivy, zizmor and actionlint were not installed and were not installed without asking. `npm audit` doesn't apply because there are no dependencies.
  - A manual regex sweep of all 50 commits of git history for token/key patterns: 0 hits.
  - `check_docs.py`, `check_seo.py` and `check_social_meta.py` against a local server for `dist/`.
  - Lighthouse 12 (mobile and desktop), with medians of 5 runs for the before/after comparison.
- **Manual:** source → sink tracing of every catalog field into HTML, attributes, JSON-LD, Markdown and JSON, plus workflow injection, SSRF and command execution.
- **Limitations:** Cloudflare zone settings (WAF, Bot Fight Mode, Web Analytics auto-inject, Rocket Loader) are not visible from the repo. Lighthouse ran against a local gzip server, not Cloudflare's edge.

## 5. Findings

### SEC-001 — Stored XSS: LLM-sourced `replaces` rendered unescaped in the home page FAQ
| | |
|---|---|
| **Severity** | Medium |
| **Status** | Fixed |
| **CWE** | CWE-79: Improper Neutralization of Input During Web Page Generation |
| **OWASP** | A03:2021 Injection |
| **Location** | `scripts/build-site.js:239`, plus the same pattern at `lib/render.js:105` |

**Description:** The first home-page FAQ answer is HTML. It joined the top `replaces` values with `list(famous.slice(0, 4))` and no `esc()`. `appDetail()` also put `a.repo` into the "View source" `href` unescaped.

**Attack path:**
1. An attacker publishes a repo whose README contains a prompt injection.
2. `classify.js` sends the README to the LLM.
3. `validate()` accepts any string of 60 characters or less as `replaces`, for example `<img src=x onerror=…>`.
4. `publish.js` copies it to `catalog.json`.
5. `build-site.js` writes it raw into `index.html`.

Precondition: the app must rank among the first apps with a `replaces` value, which needs stars (purchasable). The `repo` sink is defence in depth, since GitHub restricts repo names to `[A-Za-z0-9._-]`.

**Impact:** script running on openflarestack.com for every visitor, which could deface the page, swap Deploy links for malicious ones, or show phishing content.

**Remediation:** `list(famous.slice(0, 4).map(esc))` and `` `https://github.com/${esc(a.repo)}` ``. The output for the current catalog is byte-identical.

**Verification:** `test/site-build.test.js` builds the full site offline from a catalog with XSS payloads in every free-text field and fails on any raw tag. It failed before the fix and passes after. Commit `470e957`.

### SEC-002 — No anti-framing, HSTS or Permissions-Policy headers
| | |
|---|---|
| **Severity** | Low |
| **Status** | Fixed |
| **CWE** | CWE-1021: Improper Restriction of Rendered UI Layers |
| **OWASP** | A05:2021 Security Misconfiguration |
| **Location** | `scripts/build-site.js:822` (`_headers`) |

**Description:** Only `X-Content-Type-Options` and `Referrer-Policy` were set.

**Impact:** a hostile page could frame the site and trick clicks on Deploy or Submit. There was also no HSTS.

**Remediation:** for `/*`, added `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'`, `Strict-Transport-Security: max-age=31536000` (no `includeSubDomains`, so other subdomains are unaffected) and a Permissions-Policy that turns off camera, microphone, geolocation, payment and USB. `script-src` was deliberately left out (see §13).

**Verification:** `test/site-build.test.js` → "every response carries the security headers". Commit `5e36e68`.

## 6. Social sharing & link previews

| Page | og:title | og:image (size / dimensions) | twitter:card | Server-rendered? | Status |
|---|---|---|---|---|---|
| `/` | ✅ | `/og.png` 1200×630, 243 KB | summary_large_image | ✅ | 12/12 pass |
| `/apps/sink/` | ✅ | same | summary_large_image | ✅ | 12/12 pass |
| `/category/files-and-storage/` | ✅ | same | summary_large_image | ✅ | 12/12 pass (was 1 warning) |

### SOC-001 — og:description / twitter:description too long on category pages
**Problem:** category previews carried up to 279-character descriptions.
**Fix:** the same `clipText()` as SEO-002, commit `57d10d7`.
**Re-scrape:** Facebook Sharing Debugger, LinkedIn Post Inspector, X composer.

## 7. Reliability: caching & rate limiting

**Cache inventory** (no Redis or app cache; CDN/browser cache only)

| Key pattern | Data | TTL | Written by | Invalidated by | Status |
|---|---|---|---|---|---|
| HTML pages | rendered catalog | revalidate (Workers default, ETag) | build | every deploy | OK |
| `/app.js?v=`, `/lib/*?v=` | JS | 1 year, immutable | build | content hash `?v=` | OK |
| `/fonts/*` | woff2 | 1 year, immutable | repo | file rename only | OK (fonts rarely change) |
| `/catalog.json`, `/api/v1/*` | catalog data | 1 hour | build | TTL | OK. The sheet falls back to the full page if a new app isn't in a stale `catalog.json` |
| `/avatars/*` | owner avatars | 7 days | build | TTL | OK |

**Rate-limit coverage**

| Endpoint | Abuse risk | Limit before | Limit after | Store | Status |
|---|---|---|---|---|---|
| Static assets | none (free, unlimited on Workers) | Cloudflare edge | same | edge | OK |
| In-browser checker → api.github.com | visitor's own GitHub quota | GitHub 60/h per IP | same | GitHub | OK |
| Submission issues | spam issues trigger the workflow | GitHub issue anti-abuse, `concurrency` group | same | GitHub | OK. Accepted repos are deduplicated, and the nightly filter still applies |

No REL findings.

## 8. Documentation

| File | Status | Notes |
|---|---|---|
| README.md | Updated | Analytics disclosure, inlined CSS, security headers, `scripts/lib/`, `test/`, offline build, merge gate |
| AGENTS.md | Created | Commands, layout, escaping, security, performance and merge-gate rules |
| CLAUDE.md (imports @AGENTS.md) | Created | `@AGENTS.md` |
| .env.example | Created | All 17 variables, no secret values |

### DOC-001 — No AGENTS.md or CLAUDE.md
**Problem:** no recorded rules for agents (escaping, performance, merging). **Fix:** commit `ba59c5f`.
### DOC-002 — No .env.example although the code reads 17 env vars
**Problem:** several variables were undocumented. **Fix:** commit `ba59c5f`.
### DOC-003 — README claimed no third-party requests
**Problem:** the PilotFox analytics script (added in `4f37265`) was not mentioned. **Fix:** commit `ba59c5f`.

## 9. SEO & AI search

| Check | Status | Notes |
|---|---|---|
| robots.txt (allow all, Sitemap line) | ✅ | Allows all crawlers and 16 named search/AI bots |
| Search & AI crawlers reach the site (CDN/WAF) | Not verifiable | Check Cloudflare Bot Fight Mode / AI Crawl Control lets them through |
| sitemap.xml / index (valid, canonical URLs only, real lastmod) | ✅ | lastmod = last commit for app pages |
| llms.txt / llms-full.txt | ✅ | The checker's "admin/internal" warning is a false positive: app descriptions contain those words |
| Server-rendered content & metadata | ✅ | Every page is pre-rendered |
| Titles, descriptions, canonicals, h1, lang | ✅ (fixed) | SEO-002, SEO-003 |
| Structured data (JSON-LD) | ✅ | Organization, WebSite, ItemList, FAQPage, WebApplication, BreadcrumbList |
| hreflang (if multilingual) | n/a | English only |
| Core Web Vitals (LCP / INP / CLS) | ✅ (improved) | SEO-001. CLS 0, TBT 0 ms |

### SEO-001 — Render-blocking stylesheet delayed first paint
**Impact:** Medium.
**Problem:** `styles.css` was the only request between the HTML and first paint; Lighthouse estimated 380–600 ms on mobile.
**Fix:** a conservative minifier (`scripts/lib/minify-css.js`), and the stylesheet is inlined into each page. Commits `296b01e` and `e9722c7`.

Verification:
- Chromium CSSOM equivalence for all 438 rules.
- 16 full-page screenshots (8 pages × desktop/mobile) byte-identical to before.
- Search and the detail sheet still work, with no console errors.

Lighthouse mobile, median of 5:

| Page | FCP before | FCP after | LCP before | LCP after |
|---|---|---|---|---|
| `/` | 1503 ms | 1257 ms | 1653 ms | 1502 ms |
| `/apps/sink/` | 1354 ms | 1257 ms | 1504 ms | 1579 ms (font-swap bound, within noise) |
| `/category/email/` | 1381 ms | 1253 ms | 1505 ms | 1503 ms |

Trade-off: each page's HTML grows by about 9 KB gzipped (8 KB with brotli), with no separate CSS request. This favours first visits from search.

### SEO-002 — Meta descriptions over 160 characters on 271 of 427 pages
**Impact:** Low. **Fix:** `clipText()` in `layout()`, and category meta descriptions lead with the count and products. Commit `57d10d7`. Result: 0 descriptions over 160.
**Follow-up:** resubmit the sitemap.
### SEO-003 — Titles over 65 characters on 369 pages
**Impact:** Low. **Fix:** `pageTitle()` adds the brand only when it fits. Commit `57d10d7`. 64 long content titles remain because of long product names; that's acceptable.

## 10. Merge gate

See `.security-audit/merge-gate.md` (generated by `merge_gate.sh`) and the PR description for the final table.

## 11. Remediation log

| ID | Title | Commit | Test added | Notes |
|---|---|---|---|---|
| SEC-001 | Escape LLM-sourced text in home FAQ and repo links | `470e957` | `test/site-build.test.js` | Build gains `CATALOG_FILE`, `OUT_DIR` (guarded), `SKIP_AVATARS` |
| SEC-002 | Anti-framing, HSTS, Permissions-Policy headers | `5e36e68` | `test/site-build.test.js` | |
| SEO-001 | Inline minified CSS | `296b01e`, `e9722c7` | `test/minify-css.test.js` | Screenshots byte-identical |
| SEO-002 | Description length | `57d10d7` | `test/seo.test.js`, `test/site-build.test.js` | |
| SEO-003 | Title length | `57d10d7` | `test/seo.test.js` | |
| SOC-001 | Preview description length | `57d10d7` | `test/site-build.test.js` | |
| DOC-001..003 | AGENTS.md, CLAUDE.md, .env.example, README | `ba59c5f` | `check_docs.py` | |

Tests: 6 before → 18 after, all passing.

## 12. Scanner results not reported as findings

- **Grep secret patterns:** 0 matches. The git-history sweep also found 0.
- **`deploy_url` in `href`:** not a finding. `DEPLOY_RE` in `enrich.js` only captures `https?://deploy.workers.cloudflare.com/?url=…`, and only maintainers can set overrides.
- **`check_seo.py` "llms.txt mentions admin/internal":** false positive (words in app descriptions, not URLs).
- **`check_docs.py` "openrouter/free" path:** false positive (a model ID, not a path).
- **Workflow injection:** none. `submission.yml` and `daily.yml` pass event data through `env:`; GraphQL strings use `JSON.stringify`; `execFileSync` uses fixed arguments.
- **Lighthouse accessibility audits (not in Ironclad scope, listed for follow-up):**
  - `.pill.new` colour contrast;
  - `aria-pressed` on the category chip `<a>`;
  - Deploy `aria-label` doesn't contain the visible label;
  - heading order (`h3` after `h1`) on app and category pages.

## 13. Recommendations

1. **Enforce a `script-src` CSP.** Inventory first: PilotFox (`https://pilotfox.app`), the inline speculation rules (`'inline-speculation-rules'`), and any Cloudflare zone features that inject scripts. Start with `Content-Security-Policy-Report-Only`.
2. **Pin GitHub Actions to commit SHAs** (`actions/checkout`, `actions/setup-node`). Both workflows hold `contents: write` and secrets. Add Dependabot for `github-actions` to keep the pins fresh.
3. **Make the merge gate a CI check:** a workflow running `npm test` and `npm run build` on pull requests, required under branch protection (require PRs, require the check, require up-to-date branches, block force-pushes).
4. **Run secret scanning** (gitleaks pre-commit, or GitHub secret scanning with push protection), plus zizmor/actionlint on workflows.
5. **Constrain the LLM output further:** reject `replaces` or `name` values containing `<`, `>` or URLs in `validate()`. Escaping already makes this safe; this keeps the data clean too.
6. **Performance options considered but not applied:**
   - `content-visibility: auto` on below-the-fold home sections. Main-thread work is high on emulated mobile, but TBT is already 0 and it risks anchor scroll jumps.
   - WebP/AVIF avatars (about 19 KB saved on the home page; needs an image tool at build time).
7. **Fix the accessibility items in §12.** They're small and invisible in the design except the `.pill.new` contrast.
8. **Use Claude Code's `/security-review`** on future pull requests.

---
*Audit performed with Ironclad by [Sai Akash Neela](https://saiakashneela.com) · [GitHub](https://github.com/saiakashneela) · [X](https://x.com/thesaiakash)*
