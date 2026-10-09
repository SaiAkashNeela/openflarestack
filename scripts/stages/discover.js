// Finds repos whose README links to the Deploy to Cloudflare button, using GitHub code search.
// One query returns at most 1,000 results, so the query is sliced by file size until every
// slice is under the cap. Code search can't filter by date, so the full scan runs every night.

import { searchCode, log } from '../lib/gh.js';
import { upsert, today } from '../lib/store.js';

const BASE = 'deploy.workers.cloudflare.com filename:readme';
const CAP = 1000;
const MAX_SIZE = 384 * 1024; // code search only indexes files under 384 KB

async function collect(q, first, found) {
  const pages = Math.min(10, Math.ceil(Math.min(first.total_count, CAP) / 100));
  const take = (res) => {
    for (const it of res.items || []) {
      if (!it.repository || it.repository.fork || it.repository.private) continue;
      found.set(it.repository.full_name.toLowerCase(), it.repository.full_name);
    }
  };
  take(first);
  for (let p = 2; p <= pages; p++) take(await searchCode(q, p));
}

// Splits [lo, hi] in half until each slice has fewer than CAP results.
async function slice(lo, hi, found, stats) {
  const q = `${BASE} size:${lo}..${hi}`;
  const first = await searchCode(q, 1);
  stats.requests++;
  if (first.total_count >= CAP && hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    await slice(lo, mid, found, stats);
    await slice(mid + 1, hi, found, stats);
    return;
  }
  log(`  ${q}: ${first.total_count}${first.incomplete_results ? ' (incomplete)' : ''}`);
  stats.matched += first.total_count;
  await collect(q, first, found);
}

export async function discover(db) {
  const found = new Map();
  const stats = { requests: 0, matched: 0 };
  log('discover: sliced code search');
  // Most READMEs are small, so start with fixed slices and let slice() split any that are too big.
  const edges = [0, 1500, 3000, 5000, 8000, 12000, 20000, 40000, MAX_SIZE];
  for (let i = 0; i < edges.length - 1; i++) await slice(edges[i] + (i ? 1 : 0), edges[i + 1], found, stats);
  let added = 0;
  for (const repo of found.values()) {
    const isNew = !db.repos[repo.toLowerCase()];
    upsert(db, repo, 'search', { last_seen_search: today() });
    if (isNew) added++;
  }
  log(`discover: ${stats.matched} README matches, ${found.size} repos, ${added} new`);
  return { matched: stats.matched, repos: found.size, added };
}
