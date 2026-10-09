// Cheap metadata filter. Sets r.filtered to the rejection reason, or removes it when the repo passes.
// Runs on every repo every night, so a repo that gains stars or a licence comes back on its own.

import { licenceStatus, EXCLUDE_REPOS } from '../../lib/config.js';
import { log } from '../lib/gh.js';

export const MIN_STARS = Number(process.env.MIN_STARS || 3);
const STALE_DAYS = 365;

export function metaReason(m) {
  if (!m) return 'Repository not found';
  if (m.private) return 'Private repository';
  if (m.fork) return 'Fork';
  if (m.archived) return 'Archived';
  if (!m.pushed_at) return 'Empty repository';
  if (licenceStatus(m.license) === 'no') return m.license ? `Not an open-source licence (${m.license})` : 'No licence';
  if ((Date.now() - Date.parse(m.pushed_at)) / 864e5 > STALE_DAYS) return 'No commits in 12 months';
  if (m.stars < MIN_STARS) return `Fewer than ${MIN_STARS} stars`;
  return null;
}

export function filter(db) {
  let passed = 0, rejected = 0;
  for (const r of Object.values(db.repos)) {
    const why = EXCLUDE_REPOS.includes(r.repo.toLowerCase()) ? 'Excluded (a catalog, not an app)' : metaReason(r.meta);
    if (why) { r.filtered = why; rejected++; } else { delete r.filtered; passed++; }
  }
  log(`filter: ${passed} passed, ${rejected} rejected`);
  return { passed, rejected };
}
