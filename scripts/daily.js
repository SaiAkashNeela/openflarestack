// The nightly run: import -> discover -> refresh -> filter -> enrich -> classify -> publish.
// Usage: node scripts/daily.js [--skip-discover] [--skip-import] [--skip-refresh]
// README_DUMP=<dir> also saves each README read this run (for classifying outside the pipeline).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRepos, saveRepos, readJson, upsert } from './lib/store.js';
import { log } from './lib/gh.js';
import { importAwesome } from './stages/import-awesome.js';
import { discover } from './stages/discover.js';
import { refresh } from './stages/refresh.js';
import { filter } from './stages/filter.js';
import { enrich } from './stages/enrich.js';
import { classify } from './stages/classify.js';
import { publish } from './stages/publish.js';

const args = new Set(process.argv.slice(2));
const db = loadRepos();
const stats = {};

if (!args.has('--skip-import')) await importAwesome(db);

for (const s of readJson('submissions.json', [])) upsert(db, s.repo, 'submission');

if (!args.has('--skip-discover')) Object.assign(stats, await discover(db));
saveRepos(db); // discovery is the slow part, so keep it even if a later stage fails

if (!args.has('--skip-refresh')) { await refresh(db); saveRepos(db); }
filter(db);
const { readmes } = await enrich(db);
saveRepos(db);
if (process.env.README_DUMP) {
  mkdirSync(process.env.README_DUMP, { recursive: true });
  for (const [key, text] of readmes) writeFileSync(join(process.env.README_DUMP, key.replace('/', '__') + '.md'), text);
}
await classify(db, readmes);
publish(db, stats);
saveRepos(db);
log('daily: done');
