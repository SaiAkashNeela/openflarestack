// Builds the whole site once, offline, from a hostile fixture catalog, then checks the output.
// Catalog strings come from GitHub READMEs, repo metadata and LLM output, so every one is untrusted.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const XSS = '<img src=x onerror=alert(1)>';
const QUOTE = '"><svg onload=alert(2)>';

function app(i, over = {}) {
  return {
    repo: `owner${i}/app${i}`, slug: `app${i}`, name: `App ${i} ${XSS}`,
    owner: { login: `owner${i}`, avatar_url: null },
    description: `Does things ${XSS} ${QUOTE}`, category: 'Email', replaces: `Mailchimp ${i} ${XSS}`,
    bindings: ['D1'], config_file: 'wrangler.jsonc', has_deploy_button: true,
    deploy_url: 'https://deploy.workers.cloudflare.com/?url=https://github.com/owner/app',
    license: `MIT${XSS}`, stars: 100 - i, pushed_at: '2026-11-01T00:00:00Z', default_branch: `main${QUOTE}`,
    homepage: null, latest_release: { tag: `v1${XSS}` }, is_new: true, first_seen: '2026-11-01',
    score: 10, source: 'search', rank: i + 1, category_rank: i + 1, ...over,
  };
}

function buildFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'ofs-escape-'));
  const apps = [app(0), app(1), app(2, { replaces: `Mailchimp 1 ${XSS}` }), app(3, { repo: `owner3/x${QUOTE}`, deploy_url: null })];
  const catalog = {
    generated_at: '2026-11-17T03:00:00Z',
    counts: { tracked: 4, matched: 4, listed: 4, review: 0, new: 4, by_source: { search: 4 } },
    categories: [{ name: 'Email', slug: 'email', count: apps.length }],
    apps,
  };
  const file = join(dir, 'catalog.json');
  writeFileSync(file, JSON.stringify(catalog));
  const out = join(dir, 'dist');
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'build-site.js')], {
    env: { ...process.env, CATALOG_FILE: file, OUT_DIR: out, SKIP_AVATARS: '1' },
    stdio: 'pipe',
  });
  return { dir, out };
}

const htmlFiles = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? htmlFiles(p) : n.endsWith('.html') ? [p] : [];
});

let fx;
before(() => { fx = buildFixture(); });
after(() => rmSync(fx.dir, { recursive: true, force: true }));

test('no page renders markup from catalog data', () => {
  const { out } = fx;
  const files = htmlFiles(out);
  assert.ok(files.length >= 5, `expected the site to build, got ${files.length} pages`);
  const leaks = [];
  for (const f of files) {
    const html = readFileSync(f, 'utf8');
    // Escaped payloads read &lt;img / &lt;svg; a raw tag means data broke out into markup.
    for (const bad of ['<img src=x', '<svg onload']) {
      if (html.includes(bad)) leaks.push(`${f.slice(out.length)}: ${html.slice(Math.max(0, html.indexOf(bad) - 80), html.indexOf(bad) + 40)}`);
    }
  }
  assert.deepEqual(leaks, []);
});

// Workers static assets read dist/_headers. Parse the block for one path pattern.
function headersFor(text, pattern) {
  const lines = text.split('\n');
  const at = lines.indexOf(pattern);
  assert.ok(at >= 0, `no ${pattern} block in _headers`);
  const out = {};
  for (const l of lines.slice(at + 1)) {
    if (!/^\s/.test(l) || !l.trim()) break;
    const i = l.indexOf(':');
    out[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
  }
  return out;
}

test('every response carries the security headers', () => {
  const h = headersFor(readFileSync(join(fx.out, '_headers'), 'utf8'), '/*');
  assert.equal(h['x-content-type-options'], 'nosniff');
  assert.equal(h['x-frame-options'], 'DENY');
  assert.match(h['content-security-policy'], /frame-ancestors 'none'/);
  assert.match(h['content-security-policy'], /object-src 'none'/);
  assert.match(h['content-security-policy'], /base-uri 'self'/);
  assert.match(h['strict-transport-security'], /max-age=\d{8,}/);
  assert.ok(h['permissions-policy'], 'Permissions-Policy missing');
});
