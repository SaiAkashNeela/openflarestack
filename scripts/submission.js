// Handles a "Submit an app" issue: runs the same checks as the site (lib/check.js), comments the
// result, and on a pass adds the repo to data/submissions.json, labels the issue and closes it.
// The workflow commits data/ afterwards. Runs inside GitHub Actions (GITHUB_EVENT_PATH, GITHUB_TOKEN).

import { readFileSync, writeFileSync } from 'node:fs';
import { runCheck, apiSource, parseRepo, STEPS } from '../lib/check.js';
import { readJson, writeJson, today, keyOf } from './lib/store.js';
import { SITE_URL } from '../lib/config.js';

const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY;
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const issue = event.issue;

async function gh(method, path, body) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    method,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const comment = (body) => gh('POST', `/issues/${issue.number}/comments`, { body });

// The issue form renders as "### GitHub repository link\n\n<value>"; take the first GitHub repo link.
const link = (String(issue.body || '').match(/https?:\/\/(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+/i) || [])[0];
const parsed = parseRepo(link);
if (!parsed) {
  await comment('We couldn’t find a GitHub repository link in this issue. Edit the issue so the **GitHub repository link** field looks like `https://github.com/owner/repo`, and the check runs again.');
  process.exit(0);
}

// Already in the catalog? Then there's nothing to do but point at its page.
const listed = (repo) => (readJson('catalog.json', { apps: [] }).apps || []).find((a) => keyOf(a.repo) === keyOf(repo));
async function closeAsListed(a) {
  await comment(`**${a.repo}** is already in the stack: it's number ${a.category_rank} in ${a.category} and ${a.rank} overall.\n\n${SITE_URL}/apps/${a.slug}/\n\nThe nightly scan keeps its stars, bindings and details up to date, so there's nothing to submit. If something about the listing is wrong, say so here and a maintainer will take a look.`);
  await gh('POST', `/issues/${issue.number}/labels`, { labels: ['accepted'] }).catch(() => {});
  await gh('PATCH', `/issues/${issue.number}`, { state: 'closed', state_reason: 'completed' });
}
const known = listed(`${parsed.o}/${parsed.r}`);
if (known) { await closeAsListed(known); process.exit(0); }

const results = new Map();
let res;
try {
  res = await runCheck(apiSource(TOKEN), parsed.o, parsed.r, (id, status, msg) => { if (status !== 'run') results.set(id, [status, msg]); });
} catch (e) {
  await comment(`The check couldn’t finish: ${e.message}. A maintainer will take a look.`);
  process.exit(1);
}

const ICON = { ok: '✅', warn: '⚠️', fail: '❌', skip: '➖' };
const table = ['| Step | Result |', '|---|---|',
  ...STEPS.map(([id, label]) => { const [s, m] = results.get(id) || ['skip', 'Skipped']; return `| ${ICON[s]} ${label} | ${m.replace(/\|/g, '\\|')} |`; })].join('\n');
const repo = `${res.o}/${res.r}`;
// The link may have used an old name for a renamed repo.
const renamed = listed(repo);
if (renamed) { await closeAsListed(renamed); process.exit(0); }

if (!res.ok) {
  await comment(`Thanks for submitting **${repo}**. It isn’t ready yet:\n\n${table}\n\nFix the step marked ❌, then edit this issue (any edit works) and the check runs again.`);
  await gh('POST', `/issues/${issue.number}/labels`, { labels: ['needs-changes'] }).catch(() => {});
  process.exit(0);
}

const subs = readJson('submissions.json', []);
if (!subs.some((s) => keyOf(s.repo) === keyOf(repo))) {
  subs.push({ repo, issue: issue.number, at: today() });
  writeJson('submissions.json', subs);
}
// Tell the workflow there is something to commit.
if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `accepted=${repo}\n`, { flag: 'a' });

await comment(`**${repo}** passed every check:\n\n${table}\n\nIt’s queued for tonight’s scan, which sets its category and rank. Most apps show up on the site the next morning. If it doesn’t appear, it’s waiting for a quick human review.`);
await gh('DELETE', `/issues/${issue.number}/labels/needs-changes`).catch(() => {});
await gh('POST', `/issues/${issue.number}/labels`, { labels: ['accepted'] }).catch(() => {});
await gh('PATCH', `/issues/${issue.number}`, { state: 'closed', state_reason: 'completed' });
