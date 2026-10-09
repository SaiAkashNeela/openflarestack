// HTML fragments shared by the site build (pre-rendered pages) and the browser (filters, sheet, checker).

import { BINDINGS } from './bindings.js';

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export const k = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));
export const pad = (n) => (n < 10 ? '0' + n : String(n));
export function daysSince(iso, now = Date.now()) {
  const d = Date.parse(iso);
  return isNaN(d) ? null : Math.max(0, Math.round((now - d) / 864e5));
}
export function ago(d) {
  if (d == null) return 'unknown';
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return d + ' days ago';
  if (d < 60) return Math.round(d / 7) + ' weeks ago';
  if (d < 730) return Math.round(d / 30) + ' months ago';
  return Math.round(d / 365) + ' years ago';
}

export const ICONS = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  bang: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" aria-hidden="true"><path d="M12 6v8M12 18.5v.1"/></svg>',
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" aria-hidden="true"><path d="M7 12h10"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5"/><path d="M12 12v8M9 15l3-3 3 3"/></svg>',
  terminal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 7 5 5-5 5M12 17h7"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  github: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.6 1 1.6 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z"/></svg>',
};

export const tile = (x) => `<span class="tile g-${BINDINGS[x].g}" title="${BINDINGS[x].n}">${x}</span>`;
export const tiles = (a) => a.map(tile).join('');
const groupOf = (a) => (a.bindings && a.bindings.length ? BINDINGS[a.bindings[0]].g : '');

// Owner avatar from GitHub. If the image can't load, the browser removes it and the repo's first letter shows.
export function avatar(a, cls) {
  const [owner, name = owner] = String(a.repo).split('/');
  const letter = (name.replace(/[^A-Za-z0-9]/g, '').charAt(0) || '?').toUpperCase();
  const g = groupOf(a);
  const src = a.owner && a.owner.avatar_url
    ? (/[?&]s=\d+/.test(a.owner.avatar_url) ? a.owner.avatar_url : a.owner.avatar_url + (a.owner.avatar_url.includes('?') ? '&' : '?') + 's=96')
    : `https://github.com/${encodeURIComponent(owner)}.png?size=96`;
  return `<span class="av ${cls}${g ? ' g-' + g : ''}" aria-hidden="true">${letter}<img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>`;
}

export const appPath = (a) => `/apps/${a.slug}/`;

export function deployButton(a, cls = 'deploy') {
  if (a.deploy_url) {
    return `<a class="${cls}" href="${esc(a.deploy_url)}" target="_blank" rel="noopener" aria-label="Deploy ${esc(a.name)} to Cloudflare">${ICONS.cloud}Deploy to Cloudflare</a>`;
  }
  return `<a class="${cls} cli" href="https://github.com/${esc(a.repo)}#readme" target="_blank" rel="noopener" aria-label="Install ${esc(a.name)} with the CLI">${ICONS.terminal}Install with CLI</a>`;
}

// One catalog row. `a` is a catalog.json app (or a pending preview from the checker).
export function row(a, now = Date.now()) {
  const badges = (a.pending ? '<span class="pill pend">Pending review</span>' : '') + (a.is_new ? '<span class="pill new">New</span>' : '');
  const swap = a.pending
    ? '<small>Category</small><span class="none">Set during review</span>'
    : a.replaces
      ? `<small>Instead of</small><span>${esc(a.replaces)}</span>`
      : `<small>Category</small><span class="none">${esc(a.category)}</span>`;
  const title = a.pending ? esc(a.name) : `<a class="open" href="${appPath(a)}" data-repo="${esc(a.repo)}">${esc(a.name)}</a>`;
  const b = a.bindings || [];
  return `<li><article class="app">`
    + `<span class="rank${a.rank && a.rank <= 3 ? ' top3' : ''}"${a.rank ? ` aria-label="Rank ${a.rank}"` : ' aria-label="Not ranked yet"'}>${a.rank ? pad(a.rank) : '--'}</span>`
    + `<div class="main"><div class="name-line">${avatar(a, 'av-sm')}<h3>${title}</h3>${badges}</div>`
    + `<p class="desc">${esc(a.description)}</p><p class="repo">${esc(a.repo)}</p></div>`
    + `<div class="swapcol">${swap}</div>`
    + `<div class="tiles">${b.length ? tiles(b) : '<span class="small">No bindings found</span>'}</div>`
    + `<div class="meta"><span class="stars">${ICONS.star}${k(a.stars || 0)}</span><span>${esc(a.license || 'No licence')}</span><span>${ago(daysSince(a.pushed_at, now))}</span></div>`
    + `<div class="act">${deployButton(a)}</div>`
    + `</article></li>`;
}

export function mqCard(a, dup) {
  return `<a class="mq-card" href="${appPath(a)}" data-repo="${esc(a.repo)}"${dup ? ' aria-hidden="true" tabindex="-1"' : ''}>${avatar(a, 'mq-ico')}<b>${esc(a.name)}</b><small>${a.replaces ? `Instead of <s>${esc(a.replaces)}</s>` : esc(a.category)}</small></a>`;
}

export function updateSnippet(a) {
  const branch = a.default_branch || 'main';
  return `git remote add upstream https://github.com/${a.repo}.git\ngit pull upstream ${branch}\nnpx wrangler deploy`;
}

// Body of the detail sheet and of each /apps/<slug>/ page.
export function appDetail(a, total, { now = Date.now(), headingTag = 'h2', idPrefix = 'sheet' } = {}) {
  const gh = `https://github.com/${a.repo}`;
  const b = a.bindings || [];
  return {
    head: `${avatar(a, 'av-lg')}<div><span class="rk">Ranked <b>${pad(a.rank)}</b> of ${total}</span>`
      + `<${headingTag} id="${idPrefix}Title">${esc(a.name)}</${headingTag}><p class="repo">${esc(a.repo)}</p></div>`,
    body: `<div><p class="sheet-desc">${esc(a.description)}</p>${a.replaces ? `<p class="sheet-swap">A self-hosted alternative to <b>${esc(a.replaces)}</b>.</p>` : ''}</div>`
      + `<div class="actions">${deployButton(a, 'btn primary')}<a class="btn" href="${gh}" target="_blank" rel="noopener">${ICONS.github}View source</a></div>`
      + `<div><h3>What it sets up in your account</h3>`
      + (b.length
        ? `<ul class="blist">${b.map((x) => `<li>${tile(x)}<div><b>${BINDINGS[x].n}</b><br><span>${BINDINGS[x].d}</span></div></li>`).join('')}</ul>`
        : '<p class="small">We didn’t find any bindings in its wrangler config. It may be a plain Worker, or set them up from its README.</p>')
      + `</div>`
      + `<dl class="facts">`
      + `<div><dt>Category</dt><dd>${esc(a.category)}</dd></div>`
      + `<div><dt>Licence</dt><dd>${esc(a.license)}</dd></div>`
      + `<div><dt>Stars</dt><dd>${(a.stars || 0).toLocaleString('en-GB')}</dd></div>`
      + `<div><dt>Last commit</dt><dd>${ago(daysSince(a.pushed_at, now))}</dd></div>`
      + (a.latest_release ? `<div><dt>Latest release</dt><dd>${esc(a.latest_release.tag)}</dd></div>` : '')
      + `</dl>`
      + `<div><h3>Keeping it up to date</h3><p class="small" style="margin-bottom:.7rem">${a.deploy_url ? 'The Deploy button copies the repo into your GitHub. Run this in your copy whenever a new version comes out.' : 'Run this in your copy whenever a new version comes out.'}</p>`
      + `<div class="codecard"><header><span>terminal</span><button class="copybtn" type="button" data-copy="${idPrefix}Upd">Copy</button></header><pre><code id="${idPrefix}Upd">${esc(updateSnippet(a))}</code></pre></div></div>`,
  };
}
