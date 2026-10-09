// Builds the static site into dist/ from data/catalog.json. No framework: every page is written
// as finished HTML so search engines see the full content, and site/app.js adds search, filters,
// the detail sheet and the repo checker on top.

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BINDINGS, GROUPS } from '../lib/bindings.js';
import { SITE_URL, CATALOG_REPO, TOP_N, slugify } from '../lib/config.js';
import { esc, row, mqCard, tile, tiles, appDetail, appPath, avatar, ICONS } from '../lib/render.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist');
const SITE = join(ROOT, 'site');
const catalog = JSON.parse(readFileSync(join(ROOT, 'data', 'catalog.json'), 'utf8'));
const apps = catalog.apps;
const total = apps.length;
const now = Date.parse(catalog.generated_at);
const built = new Date(now).toISOString().slice(0, 10);
const ASSET_V = String(now).slice(-8); // cache-busts css/js after each nightly build

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

function write(path, html) {
  const p = join(OUT, path);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, html);
}

// "Auth & security" -> "auth & security", but "AI tools" and "CMS & docs" keep their acronyms.
const lower = (c) => c.replace(/\b([A-Z])(?=[a-z])/g, (m) => m.toLowerCase());
const catPath = (name) => `/category/${slugify(name)}/`;
const MARK = `<svg class="mark" aria-hidden="true"><use href="#ofs-mark"/></svg>`;
const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="ofs-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EE2463"/><stop offset="1" stop-color="#FF7A3D"/></linearGradient></defs><symbol id="ofs-mark" viewBox="0 0 40 40"><rect width="40" height="40" rx="11" fill="url(#ofs-g)"/><rect x=".5" y=".5" width="39" height="39" rx="10.5" fill="none" stroke="#fff" stroke-opacity=".18"/><g fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17.5 20 10.5l9 7"/><path d="M11 25 20 18l9 7" stroke-opacity=".7"/><path d="M11 32.5 20 25.5l9 7" stroke-opacity=".42"/></g></symbol></svg>`;

function layout({ title, description, path, body, jsonld = [], page = 'page', noindex = false }) {
  const url = SITE_URL + path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}<meta property="og:type" content="website">
<meta property="og:site_name" content="OpenFlareStack">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#F6F7F5">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&family=Geist+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/styles.css?v=${ASSET_V}">
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body data-page="${page}">
${SPRITE}
<header class="top">
  <div class="wrap">
    <a class="brand" href="/" aria-label="OpenFlareStack home">${MARK}<span class="wm">openflarestack</span></a>
    <nav class="nav" aria-label="Sections">
      <a href="/#catalog">Catalog</a>
      <a href="/#how">How it works</a>
      <a href="/#submit">Submit a repo</a>
    </nav>
  </div>
</header>
${body}
<footer class="foot">
  <div class="wrap">
    <a class="brand" href="/" aria-label="OpenFlareStack home">${MARK}<span class="wm">openflarestack</span></a>
    <div>
      <p>An independent project, not affiliated with Cloudflare, Inc. Cloudflare and Workers are trademarks of Cloudflare, Inc. Every app listed belongs to its authors and installs from their own repository.</p>
      <p>Rebuilt every night. Last update ${built}.</p>
      <nav aria-label="Footer">
        ${catalog.categories.map((c) => `<a href="${catPath(c.name)}">${esc(c.name)}</a>`).join('')}
      </nav>
      <nav aria-label="About">
        <a href="/credits/">Credits</a>
        <a href="https://github.com/${CATALOG_REPO}" rel="noopener">Source on GitHub</a>
        <a href="/#submit">Submit a repo</a>
      </nav>
    </div>
  </div>
</footer>
<dialog class="sheet" id="sheet" aria-labelledby="sheetTitle"></dialog>
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

  const body = `<main id="top">
  <section class="hero" aria-labelledby="h1">
    <div class="hero-bg" aria-hidden="true"></div>
    <div class="wrap hero-inner">
      ${announce}
      <h1 id="h1">Stop renting software. <span class="l2">Run it on your own Cloudflare.</span></h1>
      <p class="lede">Open-source booking pages, analytics, email, password vaults and more, ranked every night. Deploy in one click and keep your data in your own account.</p>
      <div class="search" role="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <label for="q" class="vh">Search apps</label>
        <input id="q" type="search" autocomplete="off" placeholder="Search apps, or the tool you want to replace">
        <span class="kbd" aria-hidden="true">/</span>
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

  <section class="band" id="how" aria-labelledby="howh">
    <div class="wrap">
      <div class="band-head">
        <h2 id="howh">How apps get on the list</h2>
        <p>Two ways in. Every night a GitHub Action searches public READMEs for Deploy to Cloudflare buttons. Anyone can also submit a repo below, and it goes through the same checks straight away. Either way we read the app's wrangler config and turn each binding into a tile, so you see what gets created in your account before you deploy.</p>
      </div>
      <div class="how">
        <div>
          <div class="codecard">
            <header><span>CCCrafts/punctual/wrangler.toml</span><span>excerpt</span></header>
<pre><code><span class="c"># what Punctual asks Cloudflare for</span>
name = "punctual"

[[<span class="k">d1_databases</span>]]
binding = "DB"

[[<span class="k">kv_namespaces</span>]]
binding = "CACHE"

[[<span class="k">r2_buckets</span>]]
binding = "AVATARS"

[[<span class="k">durable_objects</span>.bindings]]
name = "HOST_CALENDAR"

[[<span class="k">analytics_engine_datasets</span>]]
binding = "INSIGHTS"

[[<span class="k">queues</span>.producers]]
binding = "TASKS"

[<span class="k">triggers</span>]
crons = ["*/5 * * * *"]</code></pre>
            <div class="becomes"><span>Shows up as</span><span class="tiles">${tiles(['D1', 'KV', 'R2', 'DO', 'Q', 'Cr', 'AE'])}</span></div>
          </div>
          <div class="skip">
            <h3>What stays off the list</h3>
            <p>Forks, archived repos, anything without an open licence, and projects with no commits for a year. Starters, demos and libraries are skipped too. If it isn't a finished app you'd actually use, it doesn't get ranked.</p>
          </div>
        </div>
        <ul class="groups">${GROUPS.map((g) => `<li><h3>${g.n}</h3><span class="tiles">${tiles(g.k)}</span><p>${g.d}</p></li>`).join('')}</ul>
      </div>
    </div>
  </section>

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
    title: 'OpenFlareStack: open-source apps for your own Cloudflare account',
    description: `${total} open-source apps you can deploy to your own Cloudflare account in one click. Alternatives to Calendly, Google Analytics, Mailchimp and more, ranked every night.`,
    path: '/',
    page: 'home',
    body,
    jsonld: [{
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'OpenFlareStack',
      url: SITE_URL + '/',
      description: 'A catalog of open-source apps that deploy to your own Cloudflare account.',
    }, {
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
      <div class="aside-box">
        <h2>About this listing</h2>
        <p>Found by OpenFlareStack's nightly scan and ranked by stars and recent commits. The code, licence and support all come from <a href="https://github.com/${esc(a.repo)}" rel="noopener">${esc(a.repo)}</a>.</p>
      </div>
    </aside>
  </div>
</main>`;
  write(`apps/${a.slug}/index.html`, layout({
    title: appTitle(a),
    description,
    path: appPath(a),
    body,
    jsonld: [{
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: a.name,
      description: a.description,
      url: SITE_URL + appPath(a),
      applicationCategory: a.category === 'Developer tools' ? 'DeveloperApplication' : 'BusinessApplication',
      operatingSystem: 'Cloudflare Workers',
      license: a.license ? `https://spdx.org/licenses/${a.license}.html` : undefined,
      codeRepository: `https://github.com/${a.repo}`,
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

// ---------- Credits ----------
function credits() {
  const notice = readFileSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  const mit = notice.split('```')[1]?.trim() || '';
  const body = `<main class="wrap page">
  ${crumbs([['Catalog', '/'], ['Credits', null]])}
  <div class="page-head"><h1>Credits</h1><p>OpenFlareStack stands on other people's work. Thank you.</p></div>
  <div class="prose">
    <h2>awesome-cloudflare-selfhosted</h2>
    <p>The first apps in this catalog came from <a href="https://github.com/theoephraim/awesome-cloudflare-selfhosted" rel="noopener">awesome-cloudflare-selfhosted</a>, a hand-picked list kept by its contributors. Their list is MIT licensed, and their notice is below.</p>
    <pre>${esc(mit)}</pre>
    <h2>The apps</h2>
    <p>Every app listed belongs to its authors. We link to their repositories and never host or mirror their code. Each one keeps its own licence.</p>
    <h2>Data</h2>
    <p>Stars, commit dates, licences and owner avatars come from the GitHub API. Deploy links go to Cloudflare's Deploy to Cloudflare service.</p>
    <h2>Fonts</h2>
    <p>Space Grotesk, Manrope and Geist Mono, all under the SIL Open Font License, served by Google Fonts.</p>
  </div>
</main>`;
  write('credits/index.html', layout({ title: 'Credits | OpenFlareStack', description: 'The projects, data and people OpenFlareStack builds on.', path: '/credits/', body }));
}

function notFound() {
  const body = `<main class="wrap page"><div class="page-head"><h1>That page isn't here</h1><p>It may have moved, or the app was taken off the list. <a href="/">Go back to the catalog</a>.</p></div></main>`;
  write('404.html', layout({ title: 'Page not found | OpenFlareStack', description: 'Page not found.', path: '/404.html', body, noindex: true }));
}

function sitemap() {
  const urls = [['/', built], ['/credits/', built],
    ...catalog.categories.map((c) => [catPath(c.name), built]),
    ...apps.map((a) => [appPath(a), String(a.pushed_at).slice(0, 10)])];
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, d]) => `  <url><loc>${SITE_URL}${u}</loc><lastmod>${d}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
}

home();
apps.forEach(appPage);
catalog.categories.forEach(categoryPage);
credits();
notFound();
sitemap();

// Static assets and the shared modules the browser imports.
cpSync(join(SITE, 'styles.css'), join(OUT, 'styles.css'));
cpSync(join(SITE, 'app.js'), join(OUT, 'app.js'));
cpSync(join(SITE, 'assets'), OUT, { recursive: true });
cpSync(join(ROOT, 'lib'), join(OUT, 'lib'), { recursive: true });
cpSync(join(ROOT, 'data', 'catalog.json'), join(OUT, 'catalog.json'));

console.log(`build: ${apps.length} app pages, ${catalog.categories.length} category pages -> dist/`);
