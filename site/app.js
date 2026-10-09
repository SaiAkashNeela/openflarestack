// Runs on top of the pre-rendered pages: search, filters, sort, layout, the detail sheet,
// copy buttons and the "Submit your repo" checker. No framework, no build step.

import { esc, k, row, tiles, appDetail, ICONS } from './lib/render.js';
import { BINDINGS } from './lib/bindings.js';
import { STEPS, runCheck, parseRepo, apiSource } from './lib/check.js';
import { TOP_N, submitIssueUrl, deployUrl } from './lib/config.js';

const $ = (id) => document.getElementById(id);
const lsGet = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const lsSet = (key, v) => { try { localStorage.setItem(key, v); } catch { /* private mode */ } };

// Avatar fallback: drop a broken image so the letter underneath shows.
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t && t.tagName === 'IMG' && t.parentNode?.classList?.contains('av')) t.remove();
}, true);

// Copy buttons on code cards (detail sheet and app pages).
document.addEventListener('click', (e) => {
  const b = e.target.closest('.copybtn');
  if (!b) return;
  const el = $(b.dataset.copy);
  if (!el) return;
  const done = (m) => { const o = b.textContent; b.textContent = m; setTimeout(() => { b.textContent = o; }, 1600); };
  const selectIt = () => { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); done('Selected, press Ctrl+C'); };
  try { navigator.clipboard.writeText(el.textContent).then(() => done('Copied'), selectIt); } catch { selectIt(); }
});

let catalog = null;
const loadCatalog = () => (catalog ||= fetch('/catalog.json').then((r) => r.json()));

// ---------- Detail sheet ----------
const sheet = $('sheet');
async function openSheet(repo) {
  const { apps } = await loadCatalog();
  const a = apps.find((x) => x.repo === repo);
  if (!a) return false;
  const d = appDetail(a, apps.length);
  sheet.innerHTML = `<div class="sheet-head">${d.head}<button class="iconbtn" type="button" id="closeSheet" aria-label="Close">${ICONS.close}</button></div>`
    + `<div class="sheet-body">${d.body}<p class="small"><a href="/apps/${esc(a.slug)}/">Open the full page for ${esc(a.name)}</a></p></div>`;
  if (typeof sheet.showModal === 'function') sheet.showModal(); else sheet.setAttribute('open', '');
  $('closeSheet').addEventListener('click', () => sheet.close());
  return true;
}
if (sheet) sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });

// Plain clicks on app links open the sheet on the home page; new-tab clicks still follow the link.
function sheetLinks(container, selector) {
  container?.addEventListener('click', (e) => {
    const a = e.target.closest(selector);
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    openSheet(a.dataset.repo).then((ok) => { if (!ok) location.href = a.href; });
  });
}

if (document.body.dataset.page === 'home') initHome();

function initHome() {
  sheetLinks(document.querySelector('.wall'), '.mq-card');
  sheetLinks($('list'), '.open');

  const state = { q: '', cat: 'All', sort: 'rank', view: 'rows', onlyNew: false, all: false };
  const sv = lsGet('ofs-view');
  if (sv === 'rows' || sv === 'tiles') state.view = sv;
  const q = $('q'), fNew = $('fNew'), listEl = $('list'), wrapEl = $('listWrap'), statusEl = $('status'), more = $('more');

  function matches(a) {
    if (state.cat !== 'All' && a.category !== state.cat) return false;
    if (state.onlyNew && !a.is_new) return false;
    if (!state.q) return true;
    const hay = `${a.name} ${a.replaces || ''} ${a.description} ${a.category} ${a.repo} ${(a.bindings || []).map((x) => BINDINGS[x].n).join(' ')}`.toLowerCase();
    return state.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  }

  async function render() {
    const { apps } = await loadCatalog();
    const filtered = apps.filter(matches).sort((x, y) => {
      if (state.sort === 'stars') return y.stars - x.stars;
      if (state.sort === 'upd') return Date.parse(y.pushed_at) - Date.parse(x.pushed_at) || x.rank - y.rank;
      return x.rank - y.rank;
    });
    const anyFilter = state.q || state.cat !== 'All' || state.onlyNew;
    const items = anyFilter || state.all ? filtered : filtered.slice(0, TOP_N);
    wrapEl.className = 'view-' + state.view;
    const bits = [`Showing <b>${items.length}</b> of ${apps.length} apps`];
    if (state.cat !== 'All') bits.push(`in <b>${esc(state.cat)}</b>`);
    if (state.q) bits.push(`matching <b>“${esc(state.q)}”</b>`);
    statusEl.innerHTML = `<span>${bits.join(' ')}</span>` + (anyFilter ? '<button type="button" id="clearAll">Clear filters</button>' : '');
    more.hidden = anyFilter || state.all || filtered.length <= TOP_N;
    listEl.innerHTML = items.length
      ? items.map((a) => row(a)).join('')
      : '<li class="empty"><h3>Nothing matches that yet</h3><p>Try the name of a tool you pay for, like Calendly or Mailchimp, or clear the filters to see everything.</p><button class="btn" type="button" id="clearEmpty">Clear filters</button></li>';
  }

  function setCat(c) {
    state.cat = c;
    document.querySelectorAll('#cats .cat').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === c)));
  }
  function clearAll() {
    state.q = ''; state.onlyNew = false; q.value = '';
    fNew.setAttribute('aria-pressed', 'false');
    setCat('All');
    render();
  }
  const toCatalog = () => $('catalog').scrollIntoView({ behavior: 'smooth' });

  $('cats').addEventListener('click', (e) => { const b = e.target.closest('.cat'); if (!b) return; setCat(b.dataset.cat); render(); });
  statusEl.addEventListener('click', (e) => { if (e.target.id === 'clearAll') clearAll(); });
  listEl.addEventListener('click', (e) => { if (e.target.id === 'clearEmpty') clearAll(); });
  $('showAll').addEventListener('click', () => { state.all = true; render(); });
  q.addEventListener('input', () => { state.q = q.value.trim(); render(); });
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); toCatalog(); } });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/input|select|textarea/i.test(document.activeElement.tagName) && !sheet.open) { e.preventDefault(); q.focus(); }
  });
  $('swaps')?.addEventListener('click', (e) => {
    const b = e.target.closest('.swap-chip');
    if (!b) return;
    q.value = state.q = b.dataset.q;
    setCat('All'); render(); toCatalog();
  });
  $('newPill')?.addEventListener('click', () => { state.onlyNew = true; fNew.setAttribute('aria-pressed', 'true'); render(); toCatalog(); });
  $('sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
  fNew.addEventListener('click', () => { state.onlyNew = !state.onlyNew; fNew.setAttribute('aria-pressed', String(state.onlyNew)); render(); });
  const vRows = $('vRows'), vTiles = $('vTiles');
  function setView(v) {
    state.view = v;
    vRows.setAttribute('aria-pressed', String(v === 'rows'));
    vTiles.setAttribute('aria-pressed', String(v === 'tiles'));
    wrapEl.className = 'view-' + v;
    lsSet('ofs-view', v);
  }
  vRows.addEventListener('click', () => setView('rows'));
  vTiles.addEventListener('click', () => setView('tiles'));
  setView(state.view);

  initChecker();
}

// ---------- Repo checker ----------
function initChecker() {
  const form = $('checkForm');
  if (!form) return;
  const clog = $('clog'), verdict = $('verdict'), sourceEl = $('source');
  const urlIn = $('repoUrl'), hasReadme = $('hasReadme'), urlErr = $('repoErr'), rdErr = $('readmeErr'), checkBtn = $('checkBtn');
  const ICON = { idle: '', run: '', ok: ICONS.check, warn: ICONS.bang, fail: ICONS.cross, skip: ICONS.dash };
  const src = apiSource();

  const resetSteps = () => {
    clog.innerHTML = STEPS.map(([id, label]) => `<li data-step="${id}" data-s="idle"><span class="ic"></span><b>${label}</b><span class="d"></span></li>`).join('');
    verdict.hidden = true;
    sourceEl.hidden = true;
  };
  const step = (id, s, msg, data) => {
    const li = clog.querySelector(`[data-step="${id}"]`);
    if (!li) return;
    li.dataset.s = s;
    li.querySelector('.ic').innerHTML = ICON[s] || '';
    let html = esc(msg);
    if (id === 'repo' && s === 'ok' && data) html += `, ${k(data.stars)} stars`;
    if (id === 'wrangler' && data?.bindings?.length) html += ` <span class="tiles" style="display:inline-flex;vertical-align:middle;margin-left:.3rem">${tiles(data.bindings)}</span>`;
    li.querySelector('.d').innerHTML = html;
  };

  function showVerdict(res) {
    verdict.hidden = false;
    if (!res.ok) { verdict.innerHTML = '<h4>Not ready yet</h4><p>Fix the step marked in red and check again. Nothing has been submitted.</p>'; return; }
    const repo = `${res.o}/${res.r}`;
    const info = res.info;
    const app = {
      name: info.name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      repo,
      owner: { login: res.o, avatar_url: info.avatar },
      description: info.description || 'No description yet.',
      bindings: res.bindings || [],
      license: info.license || null,
      stars: info.stars || 0,
      pushed_at: info.pushed,
      deploy_url: res.button || res.config ? deployUrl(repo) : null,
      pending: true,
    };
    verdict.innerHTML = '<h4>Looks good</h4><p>This is how your listing will look. Category and rank are set when it joins the catalog.</p>'
      + `<div class="preview"><div class="view-rows"><ol class="list">${row(app)}</ol></div></div>`
      + `<div class="row"><a class="btn primary" href="${esc(submitIssueUrl(repo))}" target="_blank" rel="noopener">Submit for tonight’s scan</a></div>`
      + '<p class="note">This opens a pre-filled GitHub issue. A bot runs the same checks on it, and the nightly scan adds your app to the list.</p>';
  }

  let busy = false;
  async function start(o, r) {
    if (busy) return;
    busy = true; checkBtn.disabled = true; resetSteps();
    try {
      const res = await runCheck(src, o, r, step);
      sourceEl.textContent = 'Checked live with GitHub’s public API.';
      sourceEl.hidden = false;
      showVerdict(res);
    } catch (err) {
      verdict.hidden = false;
      const limited = err && (err.status === 403 || err.status === 429);
      const msg = limited
        ? 'GitHub allows about 60 lookups an hour from your network, and that’s used up. Try again in a little while.'
        : `Something went wrong while reading the repo${err?.message ? ': ' + esc(err.message) : ''}. Check the link and try again.`;
      verdict.innerHTML = `<h4>We couldn’t run the check</h4><div class="notice ${limited ? 'info' : 'bad'}">${msg}</div>`;
    } finally {
      busy = false; checkBtn.disabled = false;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const p = parseRepo(urlIn.value);
    let ok = true;
    if (!p) { urlErr.textContent = 'That doesn’t look like a GitHub repo link. It should look like github.com/owner/repo.'; urlErr.hidden = false; urlIn.setAttribute('aria-invalid', 'true'); ok = false; }
    else { urlErr.hidden = true; urlIn.removeAttribute('aria-invalid'); }
    if (!hasReadme.checked) { rdErr.textContent = 'Tick this to confirm your repo has a README. We read it first.'; rdErr.hidden = false; ok = false; }
    else rdErr.hidden = true;
    if (!ok) { (p ? hasReadme : urlIn).focus(); return; }
    start(p.o, p.r);
  });
  document.querySelectorAll('.ex').forEach((b) => b.addEventListener('click', () => {
    urlIn.value = 'https://github.com/' + b.dataset.ex;
    hasReadme.checked = true; urlErr.hidden = true; rdErr.hidden = true; urlIn.removeAttribute('aria-invalid');
    const [o, r] = b.dataset.ex.split('/');
    start(o, r);
  }));
  resetSteps();
}
