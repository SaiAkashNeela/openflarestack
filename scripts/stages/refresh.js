// Refreshes stars, last push, licence, avatar and latest release with batched GraphQL
// (about 100 repos per request, ~1 point each). Also catches renames and deleted repos.

import { graphql, gqlStr, chunk, log } from '../lib/gh.js';
import { keyOf, today } from '../lib/store.js';

const FIELDS = `nameWithOwner name stargazerCount pushedAt isArchived isFork isPrivate isTemplate description homepageUrl
  licenseInfo { spdxId } owner { login avatarUrl(size: 96) } latestRelease { tagName publishedAt } defaultBranchRef { name }`;

export const needsRefresh = (r) => !r.gone;

export async function refresh(db) {
  const targets = Object.values(db.repos).filter(needsRefresh);
  log(`refresh: ${targets.length} repos`);
  const counters = { gone: 0, renamed: 0 };
  // Big batches occasionally time out; halve the batch until it goes through.
  async function run(batch) {
    try {
      await applyBatch(db, batch, counters);
    } catch (e) {
      if (batch.length === 1) { log(`refresh: skipped ${batch[0].repo}: ${e.message.slice(0, 120)}`); return; }
      const half = Math.ceil(batch.length / 2);
      await run(batch.slice(0, half));
      await run(batch.slice(half));
    }
  }
  // Four requests at a time is well inside GitHub's secondary limits (100 concurrent, 2,000 points a minute).
  const queue = chunk(targets, 50);
  await Promise.all(Array.from({ length: 4 }, async () => { for (let b; (b = queue.shift());) await run(b); }));
  const { gone, renamed } = counters;
  log(`refresh: done, ${gone} gone, ${renamed} renamed`);
  return { refreshed: targets.length, gone, renamed };
}

async function applyBatch(db, batch, counters) {
  const q = 'query {' + batch.map((r, i) => {
    const [owner, name] = r.repo.split('/');
    return ` r${i}: repository(owner: ${gqlStr(owner)}, name: ${gqlStr(name)}) { ${FIELDS} }`;
  }).join('') + ' }';
  const { data, errors } = await graphql(q);
  const notFound = new Set(errors.filter((e) => e.type === 'NOT_FOUND').map((e) => e.path && e.path[0]));
  batch.forEach((r, i) => {
    const d = data[`r${i}`];
    if (!d && !notFound.has(`r${i}`)) return; // some other error: keep what we had, try again tomorrow
    if (!d) {
      r.gone = today();
      r.meta = null;
      counters.gone++;
      return;
    }
    r.meta = {
      stars: d.stargazerCount,
      pushed_at: d.pushedAt,
      archived: d.isArchived,
      fork: d.isFork,
      private: d.isPrivate,
      template: d.isTemplate,
      license: d.licenseInfo ? d.licenseInfo.spdxId : null,
      description: d.description || '',
      homepage: d.homepageUrl || null,
      owner_login: d.owner.login,
      avatar_url: d.owner.avatarUrl,
      default_branch: d.defaultBranchRef ? d.defaultBranchRef.name : null,
      latest_release: d.latestRelease ? { tag: d.latestRelease.tagName, published_at: d.latestRelease.publishedAt } : null,
    };
    if (d.nameWithOwner !== r.repo) {
      const oldKey = keyOf(r.repo), newKey = keyOf(d.nameWithOwner);
      r.repo = d.nameWithOwner;
      if (oldKey !== newKey) {
        if (db.repos[newKey]) {
          // Already tracked under the new name: merge sources and drop the old record.
          for (const s of r.sources) if (!db.repos[newKey].sources.includes(s)) db.repos[newKey].sources.push(s);
          db.repos[newKey].hints ||= r.hints;
        } else {
          db.repos[newKey] = r;
        }
        delete db.repos[oldKey];
        counters.renamed++;
      }
    }
  });
  }
