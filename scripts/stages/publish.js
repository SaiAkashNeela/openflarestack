// Decides each repo's status, scores and ranks the listed apps, and writes
// data/catalog.json (what the site renders) and data/review.md (the weekly human queue).
// data/overrides.json holds hand decisions from review and always wins.

import { readJson, writeJson, writeText, keyOf } from '../lib/store.js';
import { slugify, CATEGORIES, NEW_DAYS, licenceStatus } from '../../lib/config.js';
import { log } from '../lib/gh.js';
import { eligible } from './classify.js';

const AUTO_CONFIDENCE = 0.8;

export function score(stars, pushedAt, hasRelease) {
  const days = Math.max(0, (Date.now() - Date.parse(pushedAt)) / 864e5);
  return 10 * Math.log10(stars + 1) - Math.min(days, 120) / 12 + (hasRelease ? 1 : 0);
}

const pretty = (name) => String(name).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Returns [status, reason]. status: listed | review | rejected.
function decide(r, o) {
  if (o?.status === 'rejected') return ['rejected', o.reason || 'Rejected in review'];
  if (r.filtered) return ['rejected', r.filtered];
  if (!r.enrich) return ['review', 'Not read yet'];
  if (o?.status === 'listed') return ['listed', 'Approved in review'];
  // Curated entries are trusted to be the original; anything else that's a copy is dropped.
  if (r.enrich.copy_of && !r.sources.includes('awesome-cfsh')) return ['rejected', `Deploy-button copy of ${r.enrich.copy_of}`];
  if (!eligible(r)) return ['rejected', 'No Deploy button for this repo and no wrangler config'];
  if (licenceStatus(r.meta.license) === 'review') return ['review', 'Licence GitHub couldn’t identify (NOASSERTION)'];
  const c = r.classify;
  if (!c) return ['review', 'Waiting for classification'];
  if (c.is_complete_app && c.kind === 'app' && c.confidence >= AUTO_CONFIDENCE && c.category) return ['listed', null];
  // A human curator listed it and the model agrees it's an app: that's enough, whatever the confidence.
  if (c.kind === 'app' && c.category && r.sources.includes('awesome-cfsh')) return ['listed', null];
  if (!c.is_complete_app && c.kind !== 'app' && c.confidence >= AUTO_CONFIDENCE) {
    // A human curator listed it, so a disagreement needs a person to look.
    if (r.sources.includes('awesome-cfsh')) return ['review', `Curated list says app, model says ${c.kind}`];
    return ['rejected', `Not a complete app (${c.kind})`];
  }
  return ['review', `Low confidence (${c.kind}, ${c.confidence.toFixed(2)})`];
}

export function publish(db, runStats = {}) {
  const overrides = readJson('overrides.json', {});
  const ov = Object.fromEntries(Object.entries(overrides).map(([k, v]) => [keyOf(k), v]));
  const now = Date.now();
  const listed = [];
  const review = [];
  const counts = { tracked: 0, listed: 0, review: 0, rejected: 0 };

  for (const r of Object.values(db.repos)) {
    counts.tracked++;
    const o = ov[keyOf(r.repo)];
    const [status, reason] = decide(r, o);
    r.status = status;
    if (reason) r.reason = reason; else delete r.reason;
    counts[status]++;
    if (status === 'review') review.push(r);
    if (status === 'listed') listed.push(r);
  }

  // Stable slugs: assigned once, kept forever.
  const taken = new Set(Object.values(db.repos).map((r) => r.slug).filter(Boolean));
  for (const r of listed.sort((a, b) => a.first_seen.localeCompare(b.first_seen) || a.repo.localeCompare(b.repo))) {
    if (r.slug) continue;
    const [owner, name] = r.repo.split('/');
    let s = slugify(name);
    if (!s || taken.has(s)) s = slugify(`${name}-${owner}`);
    for (let n = 2; taken.has(s); n++) s = slugify(`${name}-${owner}-${n}`);
    r.slug = s;
    taken.add(s);
  }

  const started = Date.parse(db.started);
  const apps = listed.map((r) => {
    const m = r.meta, e = r.enrich, c = r.classify || {}, o = ov[keyOf(r.repo)] || {};
    const firstSeen = Date.parse(r.first_seen);
    return {
      repo: r.repo,
      slug: r.slug,
      name: o.name || c.name || r.hints?.name || pretty(r.repo.split('/')[1]),
      owner: { login: m.owner_login, avatar_url: m.avatar_url },
      description: o.description || c.one_liner || r.hints?.summary || m.description || '',
      category: o.category || c.category || r.hints?.category || 'Developer tools',
      replaces: o.replaces !== undefined ? o.replaces : c.replaces || null,
      bindings: o.bindings || e.bindings,
      config_file: e.config_file,
      has_deploy_button: e.has_deploy_button,
      deploy_url: o.deploy_url !== undefined ? o.deploy_url : e.deploy_url,
      license: m.license,
      stars: m.stars,
      pushed_at: m.pushed_at,
      default_branch: m.default_branch,
      homepage: m.homepage,
      latest_release: m.latest_release,
      // Apps seen on the first run are the seed, not news.
      is_new: firstSeen > started && now - firstSeen <= NEW_DAYS * 864e5,
      first_seen: r.first_seen,
      score: Math.round(score(m.stars, m.pushed_at, !!m.latest_release) * 10) / 10,
      source: r.sources.includes('awesome-cfsh') ? 'awesome-cfsh' : r.sources.includes('submission') ? 'submission' : 'search',
    };
  });
  apps.sort((a, b) => b.score - a.score || b.stars - a.stars || a.repo.localeCompare(b.repo));
  apps.forEach((a, i) => { a.rank = i + 1; });
  const catRank = {};
  for (const a of apps) a.category_rank = catRank[a.category] = (catRank[a.category] || 0) + 1;

  const bySource = {};
  for (const a of apps) bySource[a.source] = (bySource[a.source] || 0) + 1;
  const prev = readJson('catalog.json', null);
  const catalog = {
    generated_at: new Date().toISOString(),
    counts: {
      tracked: counts.tracked,
      matched: runStats.matched ?? prev?.counts?.matched ?? null,
      listed: apps.length,
      review: counts.review,
      new: apps.filter((a) => a.is_new).length,
      by_source: bySource,
    },
    categories: CATEGORIES.map((name) => ({ name, slug: slugify(name), count: apps.filter((a) => a.category === name).length })).filter((c) => c.count),
    apps,
  };

  // Only rewrite when something other than the timestamp changed, so quiet nights make no commit.
  const strip = (c) => JSON.stringify({ ...c, generated_at: null });
  if (!prev || strip(prev) !== strip(catalog)) writeJson('catalog.json', catalog);
  else log('publish: catalog unchanged');

  review.sort((a, b) => (b.meta?.stars || 0) - (a.meta?.stars || 0));
  writeText('review.md', [
    '# Review queue',
    '',
    `${review.length} repos need a human look. Rebuilt every night.`,
    'Decide in `data/overrides.json`, e.g. `"owner/repo": { "status": "listed", "category": "Email" }` or `{ "status": "rejected", "reason": "Starter" }`.',
    '',
    '| Repo | Stars | Why | Model says |',
    '|---|---|---|---|',
    ...review.map((r) => `| [${r.repo}](https://github.com/${r.repo}) | ${r.meta?.stars ?? ''} | ${r.reason} | ${r.classify ? `${r.classify.kind}, ${r.classify.category || '?'}, ${r.classify.confidence}` : ''} |`),
    '',
  ].join('\n'));

  log(`publish: ${apps.length} listed, ${counts.review} in review, ${counts.rejected} rejected, ${counts.tracked} tracked`);
  return catalog;
}
