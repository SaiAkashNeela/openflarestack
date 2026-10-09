// Seeds the catalog from theoephraim/awesome-cloudflare-selfhosted (MIT, see THIRD_PARTY_NOTICES.md).
// Reads data/entries/*.md from a sparse clone. Their licence and bindings are re-checked later; only
// name, category and summary are kept, as hints for classification.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { upsert } from '../lib/store.js';
import { log } from '../lib/gh.js';

const REPO_URL = 'https://github.com/theoephraim/awesome-cloudflare-selfhosted.git';

// Their category slugs -> our fixed list.
export const AWESOME_CATEGORIES = {
  'analytics': 'Analytics',
  'auth-secrets-and-security': 'Auth & security',
  'blogs-cms-and-docs': 'CMS & docs',
  'business-and-operations': 'Business',
  'chat-and-realtime': 'Chat & realtime',
  'community-and-comments': 'Community',
  'developer-tools': 'Developer tools',
  'email-and-inboxes': 'Email',
  'files-images-and-sharing': 'Files & storage',
  'link-shorteners': 'Link shorteners',
  'notes-knowledge-and-sync': 'Notes',
  'notifications-and-push': 'Notifications',
  'personal': 'Personal',
  'remote-access': 'Remote access',
  'uptime-and-status-pages': 'Status pages',
};

function ensureClone() {
  const dir = process.env.AWESOME_DIR || join(tmpdir(), 'awesome-cloudflare-selfhosted');
  if (!existsSync(join(dir, 'data', 'entries'))) {
    log('cloning awesome-cloudflare-selfhosted (sparse) into', dir);
    execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', REPO_URL, dir], { stdio: 'inherit' });
    execFileSync('git', ['-C', dir, 'sparse-checkout', 'set', 'data/entries', 'data/categories'], { stdio: 'inherit' });
  }
  return dir;
}

// Their frontmatter is flat "key: value" lines, and some values contain unquoted colons that a strict
// YAML parser rejects, so read it line by line: split on the first ": ", and parse [a, b] lists.
function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map((x) => unquote(x.trim())).filter(Boolean);
    else v = unquote(v);
    out[kv[1]] = v;
  }
  return out;
}

function unquote(v) {
  if (/^"(.*)"$/.test(v)) { try { return JSON.parse(v); } catch { return v.slice(1, -1); } }
  if (/^'(.*)'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

export async function importAwesome(db) {
  const dir = ensureClone();
  const entriesDir = join(dir, 'data', 'entries');
  let added = 0, seen = 0, skipped = 0;
  for (const f of readdirSync(entriesDir).filter((n) => n.endsWith('.md'))) {
    const fm = frontmatter(readFileSync(join(entriesDir, f), 'utf8'));
    const repo = fm && typeof fm.repo === 'string' ? fm.repo.replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, '') : null;
    if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) { skipped++; continue; }
    seen++;
    const before = Object.keys(db.repos).length;
    const r = upsert(db, repo, 'awesome-cfsh');
    if (Object.keys(db.repos).length > before) added++;
    r.hints = {
      name: fm.name || null,
      category: AWESOME_CATEGORIES[fm.category] || null,
      summary: fm.summary || null,
      bindings: Array.isArray(fm.bindings) ? fm.bindings : [],
    };
  }
  log(`awesome: ${seen} entries, ${added} new, ${skipped} without a usable repo`);
  return { seen, added };
}
