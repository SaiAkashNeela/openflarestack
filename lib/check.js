// Repo checker rules, shared by the site's "Submit your repo" checker and submission.yml.
// A `source` reads GitHub: { repoInfo(o, r), listRoot(o, r), readFile(o, r, path) }.
// repoInfo resolves to null when the repo doesn't exist.

import { parseBindings, CONFIG_FILES } from './bindings.js';
import { README_RE, DEPLOY_HOST_RE, SOURCE_AVAILABLE, EXCLUDE_REPOS } from './config.js';

export const STEPS = [
  ['repo', 'Find the repository'],
  ['readme', 'Read the README'],
  ['button', 'Look for a Deploy to Cloudflare button'],
  ['wrangler', 'Read the wrangler config'],
  ['licence', 'Check the licence'],
];

export function parseRepo(v) {
  v = String(v || '').trim();
  const m = v.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:[/?#].*)?$/i)
    || v.match(/^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/);
  return m ? { o: m[1], r: m[2] } : null;
}

// onStep(id, status, message, data) with status one of run | ok | warn | fail | skip.
export async function runCheck(src, o, r, onStep = () => {}) {
  const res = { o, r, ok: true, bindings: [], button: false, config: null };
  const fail = (id, msg) => {
    onStep(id, 'fail', msg);
    let hit = false;
    for (const [s] of STEPS) { if (s === id) { hit = true; continue; } if (hit) onStep(s, 'skip', 'Skipped'); }
    res.ok = false;
    res.failed = id;
    res.reason = msg;
    return res;
  };

  onStep('repo', 'run', `Looking up ${o}/${r}...`);
  const info = await src.repoInfo(o, r);
  if (!info) return fail('repo', 'We couldn’t find that repository. Check it’s public and the link is right.');
  if (info.priv) return fail('repo', 'This repository is private. Make it public so people can deploy it.');
  if (info.fork) return fail('repo', 'This is a fork. Submit the original repository instead.');
  if (info.archived) return fail('repo', 'This repository is archived. Unarchive it to get listed.');
  if (EXCLUDE_REPOS.includes(`${o}/${r}`.toLowerCase()) || (info.full_name && EXCLUDE_REPOS.includes(info.full_name.toLowerCase()))) {
    return fail('repo', 'That’s a catalog of apps, not an app, so it can’t be listed.');
  }
  res.info = info;
  // The API may answer with different casing than the link; use the canonical name from here on.
  if (info.full_name) [res.o, res.r] = info.full_name.split('/');
  onStep('repo', 'ok', `Found ${res.o}/${res.r}`, { stars: info.stars || 0 });

  onStep('readme', 'run', 'Reading the files at the root...');
  const files = await src.listRoot(res.o, res.r);
  const rd = files.find((f) => f.type === 'file' && README_RE.test(f.name));
  if (!rd) return fail('readme', 'No README at the root of the repo. Add a README.md, then check again.');
  res.readme = String(await src.readFile(res.o, res.r, rd.name));
  onStep('readme', 'ok', `Read ${rd.name}`, { file: rd.name });

  onStep('button', 'run', 'Searching the README...');
  res.button = DEPLOY_HOST_RE.test(res.readme);
  if (res.button) onStep('button', 'ok', 'Found a Deploy to Cloudflare button');
  else onStep('button', 'skip', 'No button in the README, so we’ll use the wrangler config instead');

  onStep('wrangler', 'run', 'Looking for wrangler.jsonc, wrangler.json or wrangler.toml...');
  const cfg = CONFIG_FILES.map((n) => files.find((f) => f.type === 'file' && f.name === n)).find(Boolean);
  if (!cfg) {
    if (res.button) onStep('wrangler', 'warn', 'No wrangler config at the root. The nightly scan will read it from the Deploy link.');
    else return fail('wrangler', 'No Deploy button and no wrangler config. Add a button to your README, or a wrangler.jsonc, wrangler.json or wrangler.toml at the root.');
  } else {
    res.config = cfg.name;
    res.bindings = parseBindings(await src.readFile(res.o, res.r, cfg.name), cfg.name);
    const n = res.bindings.length;
    onStep('wrangler', 'ok',
      `Read ${cfg.name}: ${n ? `${n} binding${n > 1 ? 's' : ''}` : 'no bindings, it’s a plain Worker'}${res.button ? '' : '. We’ll build the Deploy link for you.'}`,
      { file: cfg.name, bindings: res.bindings });
  }

  const lic = info.license;
  if (lic === undefined) onStep('licence', 'warn', 'Couldn’t read the licence here. The nightly scan will check it.');
  else if (!lic) return fail('licence', 'No licence found. Add an open-source licence, like MIT, so people know they can run it.');
  else if (SOURCE_AVAILABLE.has(lic)) return fail('licence', `${lic} is source-available, not open source. We only list open-source apps.`);
  else if (lic === 'NOASSERTION') onStep('licence', 'warn', 'There’s a licence file we didn’t recognise. It’ll be reviewed by hand.');
  else onStep('licence', 'ok', lic);
  return res;
}

// Reads GitHub's REST API with fetch. Works in the browser (no token, 60 calls an hour)
// and in Node (pass a token).
export function apiSource(token) {
  const headers = (accept) => ({
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });
  const err = (res, what) => Object.assign(new Error(`${what} (GitHub answered ${res.status})`), { status: res.status });
  return {
    async repoInfo(o, r) {
      const res = await fetch(`https://api.github.com/repos/${o}/${r}`, { headers: headers('application/vnd.github+json') });
      if (res.status === 404) return null;
      if (!res.ok) throw err(res, 'Could not look up the repository');
      const j = await res.json();
      return {
        full_name: j.full_name,
        name: j.name,
        fork: j.fork,
        archived: j.archived,
        priv: j.private,
        license: j.license ? j.license.spdx_id : null,
        description: j.description || '',
        stars: j.stargazers_count || 0,
        pushed: j.pushed_at,
        avatar: j.owner?.avatar_url || null,
      };
    },
    async listRoot(o, r) {
      const res = await fetch(`https://api.github.com/repos/${o}/${r}/contents/`, { headers: headers('application/vnd.github+json') });
      if (!res.ok) throw err(res, 'Could not list the repository files');
      return (await res.json()).map((f) => ({ name: f.name, type: f.type }));
    },
    async readFile(o, r, path) {
      const res = await fetch(`https://api.github.com/repos/${o}/${r}/contents/${encodeURIComponent(path)}`, { headers: headers('application/vnd.github.raw') });
      if (!res.ok) throw err(res, `Could not read ${path}`);
      return res.text();
    },
  };
}
