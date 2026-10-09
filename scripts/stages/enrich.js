// Reads each candidate's README and wrangler config(s) through GraphQL, for repos that are new,
// changed since the last read, or not classified yet. Finds the Deploy button and parses bindings.

import { graphql, rest, gqlStr, chunk, log } from '../lib/gh.js';
import { parseBindings, configRank } from '../../lib/bindings.js';
import { README_RE, deployUrl } from '../../lib/config.js';
import { upsert, keyOf } from '../lib/store.js';
import { llmConfigured } from './classify.js';

const SKIP_DIR = /(^|\/)(node_modules|examples?|tests?|__tests__|fixtures|\.github|\.changeset)(\/|$)/i;
const DEPLOY_RE = /https?:\/\/deploy\.workers\.cloudflare\.com\/?\?url=([^)\s"'<>\]]+)/gi;

// The awesome list writes bindings as words; map them to our tiles (used only when we find no config).
const AWESOME_TILE = {
  'D1': 'D1', 'KV': 'KV', 'Hyperdrive': 'Hd', 'R2': 'R2', 'Images': 'Im', 'Durable Objects': 'DO', 'Queues': 'Q',
  'Workflows': 'Wf', 'Workers AI': 'AI', 'AI': 'AI', 'Browser Rendering': 'Br', 'Cron': 'Cr', 'Email': 'Em',
  'Analytics Engine': 'AE',
};

// Bump when enrich starts recording something new, so every repo gets read again once.
const ENRICH_V = 3;

export const needsEnrich = (r) => !r.filtered && r.meta && (!r.enrich || r.enrich.v !== ENRICH_V || r.enrich.pushed_at !== r.meta.pushed_at
  || !r.classify || (r.classify.model === 'awesome-hints' && llmConfigured()));

// Every file up to three folders deep, from one REST call (git trees, recursive). Deeper trees are cut off.
async function listFiles(repo, branch) {
  const t = await rest(`/repos/${repo}/git/trees/${encodeURIComponent(branch || 'HEAD')}`, { recursive: '1' });
  if (!t || !Array.isArray(t.tree)) return null;
  return t.tree
    .filter((e) => e.type === 'blob' && !SKIP_DIR.test(e.path))
    .map((e) => ({ path: e.path, depth: e.path.split('/').length - 1 }))
    .filter((f) => f.depth <= 3);
}

// Returns { repo, path } for a Deploy link like ?url=https://github.com/o/r/tree/main/apps/x
export function parseDeployLink(raw) {
  let target;
  try { target = decodeURIComponent(raw); } catch { target = raw; }
  const m = target.match(/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/[^/]+\/(.+?))?\/?(?:[?#].*)?$/i);
  return m ? { repo: `${m[1]}/${m[2]}`, path: m[3] ? m[3].replace(/\/+$/, '') : '' } : null;
}

export async function enrich(db) {
  const todo = Object.values(db.repos).filter(needsEnrich);
  log(`enrich: ${todo.length} repos to read`);
  const readmes = new Map();
  const linked = new Set();

  // A huge monorepo can time out a whole batch, so on failure retry repo by repo and skip the bad one.
  const batches = chunk(todo, 8);
  for (const [n, batch] of batches.entries()) {
    if (n % 10 === 0) log(`enrich: batch ${n + 1} of ${batches.length}`);
    try {
      await enrichBatch(batch, readmes, linked);
    } catch (e) {
      log(`enrich: batch failed (${e.message.slice(0, 120)}), retrying one by one`);
      for (const r of batch) {
        try { await enrichBatch([r], readmes, linked); } catch (e2) { log(`enrich: skipped ${r.repo}: ${e2.message.slice(0, 120)}`); }
      }
    }
  }

  // Deploy links that point at other repos are new leads.
  let leads = 0;
  for (const repo of linked) {
    if (!db.repos[keyOf(repo)]) { upsert(db, repo, 'deploy-link'); leads++; }
  }
  log(`enrich: done, ${leads} new repos found through Deploy links`);
  return { enriched: todo.length, readmes, leads };
}

async function enrichBatch(batch, readmes, linked) {
  {
    // Round 1: file lists, fetched in parallel.
    const plans = await Promise.all(batch.map(async (r) => {
      const files = await listFiles(r.repo, r.meta.default_branch);
      if (!files) return null;
      const readme = files.find((f) => f.depth === 0 && README_RE.test(f.path));
      const rank = (f) => configRank(f.path.split('/').pop());
      const configs = files.filter((f) => rank(f) >= 0).sort((a, b) => a.depth - b.depth || rank(a) - rank(b) || a.path.localeCompare(b.path));
      return { r, readme: readme?.path || null, configs };
    }));

    // Round 2: README and up to 6 configs per repo.
    const wanted = [];
    plans.forEach((p, i) => {
      if (!p) return;
      if (p.readme) wanted.push([i, 'readme', p.readme]);
      p.configs.slice(0, 10).forEach((c, j) => wanted.push([i, `c${j}`, c.path]));
    });
    const blobs = new Map();
    for (const part of chunk(wanted, 60)) {
      const byRepo = new Map();
      for (const w of part) (byRepo.get(w[0]) || byRepo.set(w[0], []).get(w[0])).push(w);
      const q2 = 'query {' + [...byRepo].map(([i, ws]) => {
        const [o, n] = plans[i].r.repo.split('/');
        return ` r${i}: repository(owner: ${gqlStr(o)}, name: ${gqlStr(n)}) {` + ws.map(([, alias, path]) =>
          ` ${alias}: object(expression: ${gqlStr('HEAD:' + path)}) { ... on Blob { text isBinary } }`).join('') + ' }';
      }).join('') + ' }';
      const { data: b } = await graphql(q2);
      for (const [i, alias, path] of part) {
        const o = b[`r${i}`]?.[alias];
        if (o && !o.isBinary && typeof o.text === 'string') blobs.set(`${i}:${path}`, o.text);
      }
    }

    plans.forEach((p, i) => {
      if (!p) return;
      const { r } = p;
      const readme = p.readme ? blobs.get(`${i}:${p.readme}`) || '' : '';
      readmes.set(keyOf(r.repo), readme);

      // Deploy buttons in the README: keep the one for this repo, queue links to other repos.
      let own = null;
      const others = new Set();
      for (const m of readme.matchAll(DEPLOY_RE)) {
        const link = parseDeployLink(m[1]);
        if (!link) continue;
        if (keyOf(link.repo) === keyOf(r.repo)) own ||= { url: m[0], path: link.path };
        else { linked.add(link.repo); others.add(link.repo); }
      }
      // The Deploy button clones a repo README and all, and the clone is not marked as a fork. So a README
      // whose only Deploy button points at one other repo is almost always someone's deployed copy of it.
      // Same owner means the repo was renamed after the button was written, not copied.
      const [owner] = r.repo.split('/');
      const target = others.size === 1 ? [...others][0] : null;
      const copyOf = !own && target && keyOf(target.split('/')[0]) !== keyOf(owner) ? target : null;

      // Bindings: configs under the Deploy link's folder, else the root, else everything we found.
      const parsed = p.configs.slice(0, 10).map((c) => ({ ...c, text: blobs.get(`${i}:${c.path}`) })).filter((c) => c.text != null)
        .map((c) => ({ ...c, b: parseBindings(c.text, c.path) }));
      const under = (dir) => parsed.filter((c) => (dir ? c.path.startsWith(dir + '/') : c.depth === 0));
      const found = (cs) => cs.some((c) => c.b.length);
      // The Deploy link's folder first, then the root. A root config with no bindings is often just a
      // dev router in a monorepo, so then take every config we found.
      let chosen = own && own.path ? under(own.path) : [];
      if (!found(chosen)) chosen = under('');
      if (!found(chosen)) chosen = parsed;
      const bindings = [...new Set(chosen.flatMap((c) => c.b))];
      let bindingsSource = chosen.length ? 'config' : null;
      if (!chosen.length && r.hints?.bindings?.length) {
        bindings.push(...new Set(r.hints.bindings.map((x) => AWESOME_TILE[x]).filter(Boolean)));
        bindingsSource = 'awesome';
      }
      const rootConfig = parsed.find((c) => c.depth === 0 && configRank(c.path) === 0);

      r.enrich = {
        v: ENRICH_V,
        pushed_at: r.meta.pushed_at,
        copy_of: copyOf,
        readme_file: p.readme,
        has_deploy_button: !!own,
        deploy_url: own ? own.url : rootConfig ? deployUrl(r.repo) : null,
        config_file: (chosen.find((c) => c.b.length) || chosen[0])?.path || null,
        bindings: [...new Set(bindings)],
        bindings_source: bindingsSource,
      };
    });
  }
}
