// Builds the static site into dist/ from data/catalog.json. No framework: every page is written
// as finished HTML so search engines see the full content, and site/app.js adds search, filters,
// the detail sheet and the repo checker on top.

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BINDINGS, GROUPS } from '../lib/bindings.js';
import { SITE_URL, CATALOG_REPO, TOP_N, AUTHOR, slugify } from '../lib/config.js';
import { esc, row, mqCard, tile, tiles, appDetail, appPath, avatar, ICONS, SPRITE_SYMBOLS, k, ago, daysSince } from '../lib/render.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist');
const SITE = join(ROOT, 'site');
const catalog = JSON.parse(readFileSync(join(ROOT, 'data', 'catalog.json'), 'utf8'));
const apps = catalog.apps;
const total = apps.length;
const now = Date.parse(catalog.generated_at);
const built = new Date(now).toISOString().slice(0, 10);
// Content hash of the CSS and JS. Every reference carries ?v=<hash>, so those files can be cached for a
// year and still update the moment they change.
const ASSET_FILES = [join(SITE, 'styles.css'), join(SITE, 'app.js'), ...readdirSync(join(ROOT, 'lib')).map((f) => join(ROOT, 'lib', f))];
const ASSET_V = createHash('sha256').update(ASSET_FILES.map((f) => readFileSync(f)).join('\n')).digest('hex').slice(0, 10);
const OG_IMAGE = `${SITE_URL}/og.png`;


rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Owner avatars are downloaded at build time and served from our own domain, so pages make no
// requests to other sites. 64px for lists and cards, 128px for app pages. If GitHub can't be
// reached, the app just shows its letter tile.
async function fetchAvatars() {
  mkdirSync(join(OUT, 'avatars'), { recursive: true });
  const owners = [...new Map(apps.filter((a) => a.owner?.avatar_url).map((a) => [a.owner.login.toLowerCase(), a.owner.avatar_url])).entries()];
  const saved = new Map();
  const jobs = owners.flatMap(([login, url]) => [64, 128].map((px) => ({ login, px, url: url.replace(/([?&])s=\d+/, '$1s=' + px) + (/[?&]s=\d+/.test(url) ? '' : (url.includes('?') ? '&' : '?') + 's=' + px) })));
  let ok = 0;
  await Promise.all(Array.from({ length: 16 }, async () => {
    for (let j; (j = jobs.shift());) {
      try {
        const res = await fetch(j.url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) continue;
        const ext = /png/.test(res.headers.get('content-type') || '') ? 'png' : 'jpg';
        const file = `/avatars/${j.login}-${j.px}.${ext}`;
        writeFileSync(join(OUT, file), Buffer.from(await res.arrayBuffer()));
        saved.set(`${j.login}-${j.px}`, file);
        ok++;
      } catch { /* letter tile instead */ }
    }
  }));
  for (const a of apps) {
    const login = a.owner?.login?.toLowerCase();
    a.avatar_sm = saved.get(`${login}-64`) || null;
    a.avatar_lg = saved.get(`${login}-128`) || a.avatar_sm;
  }
  return ok;
}
const avatarCount = await fetchAvatars();

function write(path, html) {
  const p = join(OUT, path);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, html);
}

// "Auth & security" -> "auth & security", but "AI tools" and "CMS & docs" keep their acronyms.
const lower = (c) => c.replace(/\b([A-Z])(?=[a-z])/g, (m) => m.toLowerCase());
const catPath = (name) => `/category/${slugify(name)}/`;
const MARK = `<svg class="mark" aria-hidden="true"><use href="#ofs-mark"/></svg>`;
const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${SPRITE_SYMBOLS}<defs><linearGradient id="ofs-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EE2463"/><stop offset="1" stop-color="#FF7A3D"/></linearGradient></defs><symbol id="ofs-mark" viewBox="0 0 40 40"><rect width="40" height="40" rx="11" fill="url(#ofs-g)"/><rect x=".5" y=".5" width="39" height="39" rx="10.5" fill="none" stroke="#fff" stroke-opacity=".18"/><g fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17.5 20 10.5l9 7"/><path d="M11 25 20 18l9 7" stroke-opacity=".7"/><path d="M11 32.5 20 25.5l9 7" stroke-opacity=".42"/></g></symbol></svg>`;

function layout({ title, description, path, body, jsonld = [], page = 'page', noindex = false, markdown = null, type = 'website' }) {
  const url = SITE_URL + path;
  const full = title.includes('OpenFlareStack') ? title : `${title} | OpenFlareStack`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="${noindex ? 'noindex' : 'index, follow, max-image-preview:large, max-snippet:-1'}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="OpenFlareStack">
<meta property="og:locale" content="en_GB">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="OpenFlareStack: open-source apps you run on your own Cloudflare account">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<meta name="theme-color" content="#F6F7F5">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="sitemap" type="application/xml" href="/sitemap.xml">
<link rel="alternate" type="text/plain" title="llms.txt" href="/llms.txt">
${markdown ? `<link rel="alternate" type="text/markdown" href="${esc(markdown)}">\n` : ''}<link rel="preload" href="/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/space-grotesk-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css?v=${ASSET_V}">
<link rel="modulepreload" href="/app.js?v=${ASSET_V}">
${['render', 'bindings', 'check', 'config'].map((m) => `<link rel="modulepreload" href="/lib/${m}.js?v=${ASSET_V}">`).join('\n')}
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body data-page="${page}">
${SPRITE}
<header class="top">
  <div class="wrap">
    <a class="brand" href="/" aria-label="OpenFlareStack home">${MARK}<span class="wm">openflarestack</span></a>
    <nav class="nav" aria-label="Sections">
      <a href="/#catalog">Catalog</a>
      <a href="/alternatives/">Alternatives</a>
      <a href="/#how">How it works</a>
      <a class="nav-cta" href="/#submit">Submit a repo</a>
    </nav>
    <a class="gh-star" href="https://github.com/${CATALOG_REPO}" rel="noopener" aria-label="Star OpenFlareStack on GitHub">${ICONS.github}<span>Star this repo</span></a>
  </div>
</header>
${body}
<footer class="foot">
  <div class="wrap">
    <div class="foot-grid">
      <div class="foot-brand">
        <a class="brand" href="/" aria-label="OpenFlareStack home">${MARK}<span class="wm">openflarestack</span></a>
        <p>Open-source apps you run on your own Cloudflare account. Found on GitHub and ranked every night.</p>
        <a class="btn primary foot-cta" href="/#submit">Submit your app ${ICONS.arrow}</a>
      </div>
      <nav aria-label="Categories"><h2>Categories</h2><ul>${catalog.categories.map((c) => `<li><a href="${catPath(c.name)}">${esc(c.name)}</a></li>`).join('')}</ul></nav>
      <nav aria-label="Alternatives"><h2>Instead of</h2><ul>${ALTS.filter(hasPage).slice(0, 10).map((x) => `<li><a href="${altPath(x)}">${esc(x.name)}</a></li>`).join('')}<li><a href="/alternatives/">All alternatives</a></li></ul></nav>
      <nav aria-label="Project"><h2>Project</h2><ul>
        <li><a href="/#how">How it works</a></li>
        <li><a href="/#submit">Submit a repo</a></li>
        <li><a href="/credits/">Credits</a></li>
        <li><a href="https://github.com/${CATALOG_REPO}" rel="noopener">Source on GitHub</a></li>
        <li><a href="/llms.txt">llms.txt</a></li>
        <li><a href="/sitemap.xml">Sitemap</a></li>
      </ul></nav>
    </div>
    <div class="foot-bottom">
      <p>Built by <a href="${AUTHOR.url}" rel="noopener author">${esc(AUTHOR.name)}</a>. Last update ${built}.</p>
      <p>Apps are listed as-is. We don’t review, audit or guarantee any of them, and you install and run them at your own risk. Every app belongs to its authors and installs from their own repository.</p>
      <p>Not affiliated with Cloudflare, Inc. Cloudflare and Workers are trademarks of Cloudflare, Inc.</p>
    </div>
  </div>
</footer>
<dialog class="sheet" id="sheet" aria-labelledby="sheetTitle"></dialog>
<script type="speculationrules">{"prefetch":[{"where":{"href_matches":"/*"},"eagerness":"moderate"}]}</script>
<script type="module" src="/app.js?v=${ASSET_V}"></script>
</body>
</html>
`;
}

const crumbs = (items) => `<ol class="crumbs">${items.map(([name, href]) => `<li>${href ? `<a href="${href}">${esc(name)}</a>` : esc(name)}</li>`).join('')}</ol>`;
const crumbsLd = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, ...(href ? { item: SITE_URL + href } : {}) })),
});

// Questions and answers, shown on the page and repeated as FAQPage data for search and answer engines.
const faqHtml = (heading, items) => `<section class="faq" aria-labelledby="faq-h"><h2 id="faq-h">${esc(heading)}</h2><div class="qa">${items.map(([q, a]) => `<div><h3>${esc(q)}</h3><p>${a}</p></div>`).join('')}</div></section>`;
const faqLd = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })),
});
const ORG = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'OpenFlareStack',
  url: SITE_URL + '/',
  logo: `${SITE_URL}/apple-touch-icon.png`,
  sameAs: [`https://github.com/${CATALOG_REPO}`],
};
const list = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
const swapsFor = (xs, n = 4) => [...new Set(xs.map((a) => a.replaces).filter(Boolean))].slice(0, n);

// "Instead of X" groups: one landing page per product the apps replace.
const ALTS = (() => {
  const m = new Map();
  for (const a of apps) {
    if (!a.replaces) continue;
    const key = slugify(a.replaces);
    if (!key) continue;
    if (!m.has(key)) m.set(key, { name: a.replaces, slug: key, apps: [] });
    m.get(key).apps.push(a);
  }
  return [...m.values()].sort((x, y) => y.apps.length - x.apps.length || x.name.localeCompare(y.name));
})();
// One app on its own makes a thin page, so only products with two or more alternatives get one;
// the index links single ones straight to the app.
const hasPage = (alt) => alt.apps.length >= 2;
const altPath = (alt) => (hasPage(alt) ? `/alternatives/${alt.slug}/` : appPath(alt.apps[0]));
const altOf = (a) => ALTS.find((x) => x.apps.includes(a));

// ---------- Home ----------
function home() {
  const newN = catalog.counts.new || 0;
  const announce = newN
    ? `<button class="announce" id="newPill" type="button"><span class="dot" aria-hidden="true"></span><span><b>${newN} new app${newN === 1 ? '' : 's'}</b> this week</span><span class="go">See them</span></button>`
    : `<a class="announce" href="#catalog" style="text-decoration:none"><span class="dot" aria-hidden="true"></span><span><b>${total} apps</b>, ranked every night</span><span class="go">Browse</span></a>`;
  const seen = new Set();
  const swaps = apps.filter((a) => a.replaces && !seen.has(a.replaces.toLowerCase()) && seen.add(a.replaces.toLowerCase())).slice(0, 5);
  const wall = apps.slice(0, 26);
  const half = Math.ceil(wall.length / 2);
  const track = (list) => list.map((a) => mqCard(a, false)).join('') + list.map((a) => mqCard(a, true)).join('');
  const top = apps.slice(0, TOP_N);
  const cats = [['All', total], ...catalog.categories.map((c) => [c.name, c.count])];
  const exButton = apps.find((a) => a.has_deploy_button && a.config_file && !a.config_file.includes('/'));
  const exConfig = apps.find((a) => !a.has_deploy_button && a.config_file && !a.config_file.includes('/'));
  const famous = swapsFor(apps, 6);
  const HOME_FAQ = [
    ['What is OpenFlareStack?', `A free catalog of ${total} open-source apps you can run on your own Cloudflare account, such as self-hosted alternatives to ${list(famous.slice(0, 4))}. A GitHub Action finds new apps every night and ranks them by stars and recent commits.`],
    ['How do I self-host an app on Cloudflare?', 'Open an app and press Deploy to Cloudflare. Cloudflare copies the repository into your GitHub account, creates the databases and storage it needs (like D1, KV or R2) and deploys it to Workers. Apps without a Deploy button have install steps in their README.'],
    ['Do I need a server?', 'No. The apps run on Cloudflare Workers, so there is no server, container or VPS to look after. Your data stays in your own Cloudflare account.'],
    ['Is it free?', 'The apps are open source and free to use. Many small apps fit inside Cloudflare’s free plan. Busy apps can need a paid Workers plan, so check the app’s README and Cloudflare’s current pricing.'],
    ['How do I keep a deployed app up to date?', 'The Deploy button makes a copy, not a fork, so updates are not automatic. Every app page has a three-line snippet that pulls the latest version from the original repository and redeploys it.'],
    ['How are apps ranked?', 'By GitHub stars, how recently the code changed, and whether there is a published release. Forks, archived projects, repos without an open-source licence and starter templates are left out.'],
    ['How do I get my app listed?', 'Use the checker below. It runs the same checks as the nightly scan, and if your repo passes it opens a pre-filled GitHub issue. Apps with a Deploy to Cloudflare button in their README are found automatically.'],
    ['Is OpenFlareStack part of Cloudflare?', 'No. It is an independent project. Every app belongs to its authors and installs from their own repository.'],
  ];

  const body = `<main id="top">
  <section class="hero" aria-labelledby="h1">
    <div class="hero-bg" aria-hidden="true"></div>
    <div class="wrap hero-inner">
      ${announce}
      <h1 id="h1">Stop renting software. <span class="l2">Run it on your own Cloudflare.</span></h1>
      <p class="lede">${total} open-source, self-hosted apps for Cloudflare Workers: booking pages, analytics, email, password vaults and more, ranked every night. Deploy in one click and keep your data in your own account.</p>
      <div class="search" role="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <label for="q" class="vh">Search apps</label>
        <input id="q" type="search" autocomplete="off" placeholder="Search apps, or the tool you want to replace" role="combobox" aria-expanded="false" aria-controls="suggest" aria-autocomplete="list">
        <span class="kbd" aria-hidden="true">/</span>
        <div class="suggest" id="suggest" role="listbox" aria-label="Matching apps" hidden></div>
      </div>
      ${swaps.length ? `<div class="swaps" id="swaps"><span>Popular swaps</span>${swaps.map((a) => `<button class="swap-chip" type="button" data-q="${esc(a.replaces)}"><s>${esc(a.replaces)}</s>${ICONS.arrow}<b>${esc(a.name)}</b></button>`).join('')}</div>` : ''}
    </div>
    <div class="wall" aria-label="Some of the apps in the catalog">
      <div class="marquee"><div class="mq-track">${track(wall.slice(0, half))}</div></div>
      <div class="marquee"><div class="mq-track rev">${track(wall.slice(half))}</div></div>
      <p class="wall-cap wrap">Every card is a real open-source project. Tap one to see what it sets up.</p>
    </div>
  </section>

  <div class="wrap">
    <section class="catalog" id="catalog" aria-labelledby="cath">
      <aside class="side" aria-label="Filter by category">
        <h2>Categories</h2>
        <ul class="cats" id="cats">${cats.map(([c, n], i) => `<li><button class="cat" type="button" data-cat="${esc(c)}" aria-pressed="${i === 0}"><span>${c === 'All' ? 'All apps' : esc(c)}</span><span class="n">${n}</span></button></li>`).join('')}</ul>
        <div class="legend-mini">
          <p>Coloured tiles show what an app sets up in your Cloudflare account.</p>
          <ul>${GROUPS.map((g) => `<li>${tile(g.k[0])}<span>${g.n}</span></li>`).join('')}</ul>
        </div>
      </aside>
      <div style="min-width:0">
        <div class="bar">
          <div class="bar-title">
            <h2 id="cath">Top ${Math.min(TOP_N, total)}</h2>
            <p>Ranked by stars and recent commits. Rebuilt every night.</p>
          </div>
          <div class="controls">
            <button class="toggle" id="fNew" type="button" aria-pressed="false">New this week</button>
            <div class="select">
              <label for="sort" class="vh">Sort apps</label>
              <select id="sort">
                <option value="rank">Sort by rank</option>
                <option value="stars">Most stars</option>
                <option value="upd">Recently updated</option>
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
            </div>
            <div class="seg" role="group" aria-label="Layout">
              <button type="button" id="vRows" aria-pressed="true" aria-label="Show as list"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
              <button type="button" id="vTiles" aria-pressed="false" aria-label="Show as grid"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg></button>
            </div>
          </div>
        </div>
        <div class="status" id="status" aria-live="polite"><span>Showing <b>${top.length}</b> of ${total} apps</span><span>Updated ${built}</span></div>
        <div id="listWrap" class="view-rows"><ol class="list" id="list">${top.map((a) => row(a, now)).join('')}</ol></div>
        <div class="more" id="more"${total > TOP_N ? '' : ' hidden'}><button class="btn" type="button" id="showAll">Show all ${total} apps</button></div>
      </div>
    </section>
  </div>

  <section class="band band-tight" id="how" aria-labelledby="howh">
    <div class="wrap">
      <div class="band-head">
        <h2 id="howh">How apps get on the list</h2>
        <p>No hand-picking and no paid spots. A GitHub Action rebuilds the list every night.</p>
      </div>
      <ol class="steps">
        <li><span class="idx">1</span><h3>Found</h3><p>We search every public README on GitHub for a Deploy to Cloudflare button, and add hand-picked apps and submissions.</p></li>
        <li><span class="idx">2</span><h3>Checked</h3><p>Forks, archived repos, Deploy-button copies, stale projects and anything without an open licence drop out.</p></li>
        <li><span class="idx">3</span><h3>Read</h3><p>We read the README and wrangler config, keep finished apps (not starters or demos) and turn each binding into a tile.</p></li>
        <li><span class="idx">4</span><h3>Ranked</h3><p>Stars, recent commits and releases set the order. Stars and dates refresh every night.</p></li>
      </ol>
      <div class="legend">
        <p>The tiles show what an app creates in your Cloudflare account:</p>
        <ul>${GROUPS.map((g) => `<li title="${esc(g.d)}"><span class="tiles">${tiles(g.k)}</span>${g.n}</li>`).join('')}</ul>
      </div>
    </div>
  </section>

  <div class="band"><div class="wrap">${faqHtml('Questions people ask', HOME_FAQ)}</div></div>

  <section class="band" id="submit" aria-labelledby="subh">
    <div class="wrap submit">
      <div>
        <div class="band-head">
          <h2 id="subh">Submit your repo</h2>
          <p>Paste a GitHub link and we check it right here, in the same order the nightly scan does. If it passes you'll see your listing before you send it.</p>
        </div>
        <ol class="reqs">
          <li><span class="idx">1</span><b>A public repository</b><p>Not a fork and not archived.</p></li>
          <li><span class="idx">2</span><b>A README at the root <span class="pill pend">Required</span></b><p>It's the first thing we read. No README means no listing.</p></li>
          <li><span class="idx">3</span><b>A Deploy to Cloudflare button, or a wrangler config</b><p>We look for the button in your README first. If it isn't there we read <code>wrangler.jsonc</code>, <code>wrangler.json</code> or <code>wrangler.toml</code> from the root and build the Deploy link for you.</p></li>
          <li><span class="idx">4</span><b>An open-source licence</b><p>MIT, Apache, GPL and the like, so people know they're allowed to run it.</p></li>
        </ol>
      </div>
      <div class="checker">
        <h3>Check a repository</h3>
        <p>Nothing is submitted until you press Submit at the end.</p>
        <form id="checkForm" novalidate>
          <div class="field">
            <label for="repoUrl">GitHub repository link</label>
            <input id="repoUrl" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://github.com/owner/repo" aria-describedby="repoErr">
            <p class="err" id="repoErr" aria-live="polite" hidden></p>
          </div>
          <label class="confirm" for="hasReadme"><input id="hasReadme" type="checkbox"><span>My repository has a README at the root. We read it first, so the check stops without one.</span></label>
          <p class="err" id="readmeErr" aria-live="polite" hidden></p>
          <div class="row"><button class="btn primary" id="checkBtn" type="submit">Check repository</button></div>
        </form>
        ${exButton || exConfig ? `<div class="examples"><span>Or try a listed app:</span>${[[exButton, 'Has a Deploy button'], [exConfig, 'Wrangler config only']].filter(([a]) => a).map(([a, l]) => `<button class="ex" type="button" data-ex="${esc(a.repo)}">${l}</button>`).join('')}</div>` : ''}
        <ol class="clog" id="clog"></ol>
        <p class="source" id="source" hidden></p>
        <div class="verdict" id="verdict" hidden></div>
      </div>
    </div>
  </section>
</main>`;

  write('index.html', layout({
    title: 'OpenFlareStack: self-hosted open-source apps for Cloudflare',
    description: `${total} open-source apps you can deploy to your own Cloudflare account in one click. Self-hosted alternatives to ${list(famous.slice(0, 3))} and more, ranked every night.`,
    path: '/',
    page: 'home',
    body,
    markdown: '/llms.txt',
    jsonld: [ORG, {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'OpenFlareStack',
      url: SITE_URL + '/',
      description: 'A catalog of open-source apps that deploy to your own Cloudflare account.',
      publisher: { '@type': 'Organization', name: 'OpenFlareStack', url: SITE_URL + '/' },
    }, faqLd(HOME_FAQ), {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Top open-source apps for Cloudflare',
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      numberOfItems: top.length,
      itemListElement: top.map((a) => ({ '@type': 'ListItem', position: a.rank, url: SITE_URL + appPath(a), name: a.name })),
    }],
  }));
}

// ---------- App pages ----------
function appTitle(a) {
  return a.replaces
    ? `${a.name}: self-hosted ${a.replaces} alternative on Cloudflare`
    : `${a.name}: open-source ${lower(a.category)} app for Cloudflare`;
}

function appPage(a) {
  const d = appDetail(a, total, { now, headingTag: 'h1', idPrefix: 'page' });
  const related = apps.filter((x) => x.category === a.category && x.repo !== a.repo).slice(0, 6);
  const trail = [['Catalog', '/'], [a.category, catPath(a.category)], [a.name, null]];
  const description = `${a.description.replace(/\.?$/, '.')} Open source (${a.license}). ${a.deploy_url ? 'Deploy it to your own Cloudflare account in one click.' : 'Install it on your own Cloudflare account.'}`;
  const b = a.bindings || [];
  const alt = altOf(a);
  const faq = [
    [`What is ${a.name}?`, `${esc(a.description.replace(/\.?$/, '.'))}${a.replaces ? ` It’s an open-source, self-hosted alternative to ${esc(a.replaces)}.` : ''} It runs on Cloudflare Workers in your own account.`],
    [`What does ${a.name} set up in my Cloudflare account?`, b.length ? `${esc(list(b.map((x) => BINDINGS[x].n)))}. They are created in your account, so the data stays yours.` : 'We didn’t find any bindings in its wrangler config, so it may be a plain Worker. Check its README for setup steps.'],
    [`How do I deploy ${a.name}?`, a.deploy_url ? 'Press Deploy to Cloudflare. Cloudflare copies the repository into your GitHub account, creates what it needs and deploys it with Workers Builds.' : `It installs from the command line. Follow the steps in the <a href="https://github.com/${esc(a.repo)}#readme" rel="noopener">${esc(a.repo)} README</a>.`],
    [`Is ${a.name} free and open source?`, `Yes. It’s published under the ${esc(a.license)} licence. Running it uses your own Cloudflare account, and small setups usually fit in the free plan.`],
    [`How do I update ${a.name}?`, `Pull from the original repository and redeploy: add <code>https://github.com/${esc(a.repo)}.git</code> as an upstream remote, run <code>git pull upstream ${esc(a.default_branch || 'main')}</code>, then <code>npx wrangler deploy</code>.`],
  ];
  const body = `<main class="wrap page">
  ${crumbs(trail)}
  <div class="app-page">
    <article class="app-card">
      <div class="sheet-head">${d.head}</div>
      <div class="sheet-body">${d.body}</div>
    </article>
    <aside>
      <div class="aside-box">
        <h2>More ${esc(lower(a.category))} apps</h2>
        ${related.length ? `<ul class="related">${related.map((x) => `<li><a href="${appPath(x)}">${avatar(x, 'av-sm')}<b>${esc(x.name)}</b><small>${x.replaces ? `Instead of ${esc(x.replaces)}` : esc(x.repo)}</small></a></li>`).join('')}</ul>` : '<p>This is the only one so far.</p>'}
        <p style="margin-top:.7rem"><a href="${catPath(a.category)}">See all ${esc(a.category)} apps</a></p>
      </div>
      ${alt && alt.apps.length > 1 ? `<div class="aside-box"><h2>Other ${esc(alt.name)} alternatives</h2><p>${alt.apps.length} apps in the catalog replace ${esc(alt.name)}. <a href="${altPath(alt)}">Compare them</a>.</p></div>` : ''}
      <div class="aside-box">
        <h2>About this listing</h2>
        <p>Found by OpenFlareStack's nightly scan and ranked by stars and recent commits. The code, licence and support all come from <a href="https://github.com/${esc(a.repo)}" rel="noopener">${esc(a.repo)}</a>.</p>
      </div>
    </aside>
  </div>
  ${faqHtml(`${a.name} questions`, faq)}
</main>`;
  write(`apps/${a.slug}/index.html`, layout({
    title: appTitle(a),
    description,
    path: appPath(a),
    body,
    markdown: `/apps/${a.slug}.md`,
    jsonld: [faqLd(faq), {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: a.name,
      description: a.description,
      url: SITE_URL + appPath(a),
      applicationCategory: a.category === 'Developer tools' ? 'DeveloperApplication' : 'BusinessApplication',
      operatingSystem: 'Cloudflare Workers',
      license: a.license ? `https://spdx.org/licenses/${a.license}.html` : undefined,
      codeRepository: `https://github.com/${a.repo}`,
      image: a.owner?.avatar_url || undefined,
      author: { '@type': 'Person', name: a.owner?.login || a.repo.split('/')[0], url: `https://github.com/${a.repo.split('/')[0]}` },
      dateModified: a.pushed_at,
      softwareVersion: a.latest_release?.tag || undefined,
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    }, crumbsLd(trail)],
  }));
}

// ---------- Category pages ----------
function categoryPage(c) {
  const list = apps.filter((a) => a.category === c.name);
  const trail = [['Catalog', '/'], [c.name, null]];
  const swaps = [...new Set(list.map((a) => a.replaces).filter(Boolean))].slice(0, 4);
  const lede = `${list.length} open-source ${lower(c.name)} app${list.length === 1 ? '' : 's'} you can run on your own Cloudflare account${swaps.length ? `, including alternatives to ${swaps.join(', ').replace(/, ([^,]*)$/, ' and $1')}` : ''}. Ranked by stars and recent commits, rebuilt every night.`;
  const body = `<main class="wrap page">
  ${crumbs(trail)}
  <div class="page-head">
    <h1>Self-hosted ${esc(lower(c.name))} apps for Cloudflare</h1>
    <p>${esc(lede)}</p>
  </div>
  <nav class="chips" aria-label="Other categories">${catalog.categories.map((x) => `<a class="cat"${x.name === c.name ? ' aria-current="page" aria-pressed="true"' : ''} href="${catPath(x.name)}"><span>${esc(x.name)}</span><span class="n">${x.count}</span></a>`).join('')}</nav>
  <div class="view-rows"><ol class="list">${list.map((a) => row(a, now)).join('')}</ol></div>
</main>`;
  write(`category/${c.slug}/index.html`, layout({
    title: `Self-hosted ${lower(c.name)} apps for Cloudflare`,
    description: lede,
    path: catPath(c.name),
    body,
    jsonld: [crumbsLd(trail), {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `Self-hosted ${c.name} apps for Cloudflare`,
      numberOfItems: list.length,
      itemListElement: list.map((a, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE_URL + appPath(a), name: a.name })),
    }],
  }));
}

// ---------- "X alternatives" pages ----------
function alternativePage(alt) {
  const trail = [['Catalog', '/'], ['Alternatives', '/alternatives/'], [`${alt.name} alternatives`, null]];
  const best = alt.apps[0];
  const n = alt.apps.length;
  const lede = `${n} open-source, self-hosted ${alt.name} alternative${n === 1 ? '' : 's'} you can deploy to your own Cloudflare account. No subscription, no seat limits, and your data stays in your account.`;
  const faq = [
    [`What is the best open-source ${alt.name} alternative on Cloudflare?`, `${esc(best.name)} ranks highest right now, with ${k(best.stars)} GitHub stars and its last commit ${ago(daysSince(best.pushed_at, now))}. ${esc(best.description)}`],
    [`Can I self-host a ${alt.name} alternative for free?`, `Yes. ${n === 1 ? 'This app is' : 'These apps are'} open source, and ${n === 1 ? 'it runs' : 'they run'} on Cloudflare Workers in your own account. Small setups usually fit in Cloudflare’s free plan.`],
    ['How do I install one?', 'Open the app and press Deploy to Cloudflare, or follow the install steps in its README. Cloudflare creates the databases and storage it needs in your account.'],
  ];
  const body = `<main class="wrap page">
  ${crumbs(trail)}
  <div class="page-head">
    <h1>Self-hosted ${esc(alt.name)} alternatives on Cloudflare</h1>
    <p>${esc(lede)}</p>
  </div>
  <div class="view-rows"><ol class="list">${alt.apps.map((a) => row(a, now)).join('')}</ol></div>
  ${faqHtml(`${alt.name} alternative questions`, faq)}
</main>`;
  write(`alternatives/${alt.slug}/index.html`, layout({
    title: `Open-source ${alt.name} alternatives you can self-host on Cloudflare`,
    description: lede,
    path: altPath(alt),
    body,
    jsonld: [crumbsLd(trail), faqLd(faq), {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `Self-hosted ${alt.name} alternatives on Cloudflare`,
      numberOfItems: n,
      itemListElement: alt.apps.map((a, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE_URL + appPath(a), name: a.name })),
    }],
  }));
}

function alternativesIndex() {
  const trail = [['Catalog', '/'], ['Alternatives', null]];
  const body = `<main class="wrap page">
  ${crumbs(trail)}
  <div class="page-head">
    <h1>Self-hosted alternatives to the tools you pay for</h1>
    <p>Open-source apps that replace ${ALTS.length} paid products, and run on your own Cloudflare account. Pick the tool you want to stop renting.</p>
  </div>
  <ul class="alt-grid">${ALTS.map((x) => `<li><a href="${altPath(x)}"><s>${esc(x.name)}</s><span>${x.apps.length} alternative${x.apps.length === 1 ? '' : 's'}: ${esc(list(x.apps.slice(0, 3).map((a) => a.name)))}</span></a></li>`).join('')}</ul>
</main>`;
  write('alternatives/index.html', layout({
    title: 'Self-hosted alternatives to paid software, on Cloudflare',
    description: `Open-source alternatives to ${list(ALTS.slice(0, 5).map((x) => x.name))} and ${Math.max(0, ALTS.length - 5)} more paid tools, deployable to your own Cloudflare account.`,
    path: '/alternatives/',
    body,
    jsonld: [crumbsLd(trail)],
  }));
}

// ---------- Machine-readable copies for LLMs and answer engines (llmstxt.org) ----------
function appMarkdown(a) {
  const b = a.bindings || [];
  return [
    `# ${a.name}`,
    '',
    `> ${a.description}`,
    '',
    `- Category: ${a.category}`,
    a.replaces ? `- Self-hosted alternative to: ${a.replaces}` : null,
    `- Repository: https://github.com/${a.repo}`,
    `- Licence: ${a.license}`,
    `- GitHub stars: ${a.stars}`,
    `- Last commit: ${String(a.pushed_at).slice(0, 10)}`,
    a.latest_release ? `- Latest release: ${a.latest_release.tag}` : null,
    `- Rank: ${a.rank} of ${total} on OpenFlareStack`,
    `- Cloudflare resources it creates: ${b.length ? b.map((x) => BINDINGS[x].n).join(', ') : 'none found in its wrangler config'}`,
    a.deploy_url ? `- Deploy: ${a.deploy_url}` : `- Install: see https://github.com/${a.repo}#readme`,
    `- Page: ${SITE_URL}${appPath(a)}`,
    '',
    '## Keeping it up to date',
    '',
    '```bash',
    `git remote add upstream https://github.com/${a.repo}.git`,
    `git pull upstream ${a.default_branch || 'main'}`,
    'npx wrangler deploy',
    '```',
    '',
  ].filter((x) => x != null).join('\n');
}

function llmsFiles() {
  const line = (a) => `- [${a.name}](${SITE_URL}/apps/${a.slug}.md): ${a.description}${a.replaces ? ` Replaces ${a.replaces}.` : ''}`;
  const head = [
    '# OpenFlareStack',
    '',
    `> A free, independent catalog of ${total} open-source apps that deploy to your own Cloudflare account (Cloudflare Workers), discovered from GitHub and ranked every night by stars and recent commits. Updated ${built}.`,
    '',
    'Every app listed is open source, not a fork, not archived, and has a commit in the last 12 months. Most have a "Deploy to Cloudflare" button that copies the repository into the user’s GitHub account, creates the D1 databases, KV namespaces, R2 buckets and other resources it needs, and deploys it with Workers Builds. OpenFlareStack never hosts the apps’ code; it links to each author’s repository. It is not affiliated with Cloudflare, Inc.',
    '',
  ];
  const llms = [...head,
    '## Categories', '',
    ...catalog.categories.map((c) => `- [${c.name}](${SITE_URL}${catPath(c.name)}): ${c.count} apps`), '',
    '## Self-hosted alternatives', '',
    ...ALTS.map((x) => `- [${x.name} alternative${hasPage(x) ? 's' : ''}](${SITE_URL}${altPath(x)}): ${list(x.apps.slice(0, 3).map((a) => a.name))}`), '',
    '## Top apps', '',
    ...apps.slice(0, 50).map(line), '',
    '## Optional', '',
    `- [Full catalog](${SITE_URL}/llms-full.txt): every app with its category, licence, stars and Cloudflare resources`,
    `- [Catalog data (JSON)](${SITE_URL}/catalog.json): machine-readable catalog, rebuilt nightly`,
    `- [Source code](https://github.com/${CATALOG_REPO}): how apps are discovered, filtered and ranked`,
    '',
  ];
  write('llms.txt', llms.join('\n'));
  const full = [...head, ...catalog.categories.flatMap((c) => [`## ${c.name}`, '', ...apps.filter((a) => a.category === c.name).map((a) =>
    `### ${a.name}\n\n${a.description}${a.replaces ? ` Self-hosted alternative to ${a.replaces}.` : ''}\n\n- Repository: https://github.com/${a.repo} (${a.license}, ${a.stars} stars, last commit ${String(a.pushed_at).slice(0, 10)})\n- Creates: ${(a.bindings || []).map((x) => BINDINGS[x].n).join(', ') || 'no bindings found'}\n- ${a.deploy_url ? `Deploy: ${a.deploy_url}` : 'Install with the CLI, see the README'}\n- Page: ${SITE_URL}${appPath(a)}\n`), ''])];
  write('llms-full.txt', full.join('\n'));
  for (const a of apps) write(`apps/${a.slug}.md`, appMarkdown(a));
}

// ---------- Credits ----------
function credits() {
  const notice = readFileSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  const mit = notice.split('```')[1]?.trim() || '';
  const authors = new Set(apps.map((a) => a.repo.split('/')[0].toLowerCase())).size;
  const card = (title, body) => `<section class="credit"><h2>${title}</h2>${body}</section>`;
  const body = `<main class="wrap page">
  ${crumbs([['Catalog', '/'], ['Credits', null]])}
  <div class="page-head"><h1>Credits</h1><p>OpenFlareStack stands on other people’s work. Here’s who and what makes it possible.</p></div>
  <div class="credits">
    ${card('Made by', `<p>OpenFlareStack is built and run by <a href="${AUTHOR.url}" rel="noopener author">${esc(AUTHOR.name)}</a>. The code is on <a href="https://github.com/${CATALOG_REPO}" rel="noopener">GitHub</a>; issues and ideas are welcome there.</p>`)}
    ${card(`The ${total} apps and their ${authors} authors`, `<p>Every app listed belongs to the people who build it. We link to their repositories and never host or mirror their code, and each app keeps its own licence. If you use one, star its repo or sponsor its author.</p>`)}
    ${card('awesome-cloudflare-selfhosted', `<p>The first apps in this catalog came from <a href="https://github.com/theoephraim/awesome-cloudflare-selfhosted" rel="noopener">awesome-cloudflare-selfhosted</a>, a hand-picked list kept by its contributors. Their names, categories and summaries seeded the list, and they are still imported every night. Thank you.</p><details><summary>Their MIT licence notice</summary><pre>${esc(mit)}</pre></details>`)}
    ${card('Data', `<p>Stars, commit dates, licences and owner avatars come from the <a href="https://docs.github.com/en/rest" rel="noopener">GitHub API</a>. The Deploy buttons use Cloudflare’s <a href="https://developers.cloudflare.com/workers/platform/deploy-buttons/" rel="noopener">Deploy to Cloudflare</a> service.</p>`)}
    ${card('Fonts', `<p><a href="https://fonts.google.com/specimen/Space+Grotesk" rel="noopener">Space Grotesk</a>, <a href="https://fonts.google.com/specimen/Manrope" rel="noopener">Manrope</a> and <a href="https://fonts.google.com/specimen/Geist+Mono" rel="noopener">Geist Mono</a>, all under the SIL Open Font License, self-hosted on this site (<a href="/fonts/OFL-manrope.txt">licence texts</a>).</p>`)}
    ${card('Hosting', `<p>The site is plain HTML served from Cloudflare Workers, and the catalog is rebuilt by GitHub Actions. OpenFlareStack is independent and not affiliated with Cloudflare, Inc.</p>`)}
  </div>
</main>`;
  write('credits/index.html', layout({ title: 'Credits | OpenFlareStack', description: `Who makes OpenFlareStack possible: ${AUTHOR.name}, the authors of ${total} open-source apps, awesome-cloudflare-selfhosted, the GitHub API and more.`, path: '/credits/', body }));
}

function notFound() {
  const body = `<main class="wrap page"><div class="page-head"><h1>That page isn't here</h1><p>It may have moved, or the app was taken off the list. <a href="/">Go back to the catalog</a>.</p></div></main>`;
  write('404.html', layout({ title: 'Page not found | OpenFlareStack', description: 'Page not found.', path: '/404.html', body, noindex: true }));
}

function sitemap() {
  const urls = [['/', built], ['/alternatives/', built], ['/credits/', built],
    ...catalog.categories.map((c) => [catPath(c.name), built]),
    ...ALTS.filter(hasPage).map((x) => [altPath(x), built]),
    ...apps.map((a) => [appPath(a), String(a.pushed_at).slice(0, 10)])];
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, d]) => `  <url><loc>${SITE_URL}${u}</loc><lastmod>${d}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  // Search engines and AI crawlers are all welcome: being cited by answer engines is the point.
  const bots = ['Googlebot', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot',
    'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot', 'Applebot-Extended', 'CCBot', 'DuckAssistBot', 'meta-externalagent'];
  write('robots.txt', [
    '# OpenFlareStack: open-source apps for your own Cloudflare account.',
    '# Everything here is public. Search engines and AI assistants are welcome.',
    '# A plain-text summary for language models lives at /llms.txt',
    '',
    'User-agent: *',
    'Allow: /',
    '',
    ...bots.flatMap((b) => [`User-agent: ${b}`, 'Allow: /', '']),
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n'));
}

home();
apps.forEach(appPage);
catalog.categories.forEach(categoryPage);
ALTS.filter(hasPage).forEach(alternativePage);
alternativesIndex();
llmsFiles();
credits();
notFound();
sitemap();

// Static assets and the shared modules the browser imports. Relative imports get the same ?v=<hash>
// as the page's preload links, so the browser fetches each module once and can cache it for a year.
const versioned = (code) => code.replace(/(from\s+['"])(\.{1,2}\/[^'"?]+\.js)(['"])/g, `$1$2?v=${ASSET_V}$3`);
cpSync(join(SITE, 'styles.css'), join(OUT, 'styles.css'));
writeFileSync(join(OUT, 'app.js'), versioned(readFileSync(join(SITE, 'app.js'), 'utf8')));
mkdirSync(join(OUT, 'lib'), { recursive: true });
for (const f of readdirSync(join(ROOT, 'lib'))) writeFileSync(join(OUT, 'lib', f), versioned(readFileSync(join(ROOT, 'lib', f), 'utf8')));
cpSync(join(SITE, 'assets'), OUT, { recursive: true });
writeFileSync(join(OUT, 'catalog.json'), JSON.stringify(catalog));

// Cache rules (Workers static assets read dist/_headers). Pages stay fresh; hashed CSS/JS and
// images are cached for a long time.
write('_headers', `/styles.css
  Cache-Control: public, max-age=31536000, immutable
/app.js
  Cache-Control: public, max-age=31536000, immutable
/lib/*
  Cache-Control: public, max-age=31536000, immutable
/fonts/*
  Cache-Control: public, max-age=31536000, immutable
/avatars/*
  Cache-Control: public, max-age=604800
/favicon.svg
  Cache-Control: public, max-age=604800
/og.png
  Cache-Control: public, max-age=604800
/apple-touch-icon.png
  Cache-Control: public, max-age=604800
/catalog.json
  Cache-Control: public, max-age=3600
/llms.txt
  Content-Type: text/plain; charset=utf-8
/llms-full.txt
  Content-Type: text/plain; charset=utf-8
/apps/*.md
  Content-Type: text/markdown; charset=utf-8
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
`);

console.log(`build: ${avatarCount} avatars saved, ${apps.length} app pages, ${catalog.categories.length} category pages, ${ALTS.filter(hasPage).length} alternatives pages -> dist/`);
