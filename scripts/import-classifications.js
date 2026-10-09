// Loads classifications made outside the pipeline (e.g. a one-off bootstrap by hand or by another
// model) into data/repos.json, using the same validation as the LLM stage, then republishes.
// Usage: node scripts/import-classifications.js --model <label> file1.json [file2.json ...]
// Each file is a JSON array of { repo, name, is_complete_app, kind, category, replaces, one_liner, confidence }.

import { readFileSync } from 'node:fs';
import { loadRepos, saveRepos, keyOf, today } from './lib/store.js';
import { validate } from './stages/classify.js';
import { publish } from './stages/publish.js';

const args = process.argv.slice(2);
const mi = args.indexOf('--model');
const model = mi >= 0 ? args.splice(mi, 2)[1] : 'manual';
const db = loadRepos();
let applied = 0, unknown = 0;
for (const file of args) {
  for (const item of JSON.parse(readFileSync(file, 'utf8'))) {
    const r = db.repos[keyOf(item.repo)];
    if (!r) { unknown++; continue; }
    r.classify = { ...validate(item), model, at: today() };
    applied++;
  }
}
console.log(`import: ${applied} classifications applied, ${unknown} repos not tracked`);
publish(db);
saveRepos(db);
