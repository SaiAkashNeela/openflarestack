// Small GitHub client for the nightly scripts: REST, code search and GraphQL, with rate-limit handling.

const TOKEN = process.env.GH_SEARCH_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const API = 'https://api.github.com';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function headers(accept = 'application/vnd.github+json') {
  if (!TOKEN) throw new Error('Set GH_SEARCH_TOKEN (or GITHUB_TOKEN / GH_TOKEN). Code search needs an authenticated token.');
  return { Accept: accept, Authorization: `Bearer ${TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'openflarestack-catalog' };
}

// Waits out primary and secondary rate limits, then retries (up to 6 times).
async function request(url, init = {}, tries = 6) {
  for (let i = 0; ; i++) {
    let res;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) }); // never hang on a stuck connection
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(2000 * (i + 1));
      continue;
    }
    if ((res.status === 403 || res.status === 429) && i < tries) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const reset = Number(res.headers.get('x-ratelimit-reset'));
      const remaining = res.headers.get('x-ratelimit-remaining');
      let wait = 60_000;
      if (retryAfter) wait = retryAfter * 1000;
      else if (remaining === '0' && reset) wait = Math.max(1000, reset * 1000 - Date.now() + 1000);
      log(`rate limited (${res.status}), waiting ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    if (res.status >= 500 && i < tries) {
      await sleep(3000 * (i + 1));
      continue;
    }
    return res;
  }
}

export async function rest(path, params = {}) {
  const u = new URL(API + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await request(u, { headers: headers() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

// Code search allows 10 requests a minute, so space the calls out.
let lastSearch = 0;
export async function searchCode(q, page = 1) {
  const gap = 6500 - (Date.now() - lastSearch);
  if (gap > 0) await sleep(gap);
  lastSearch = Date.now();
  const u = new URL(API + '/search/code');
  u.searchParams.set('q', q);
  u.searchParams.set('per_page', '100');
  u.searchParams.set('page', String(page));
  const res = await request(u, { headers: headers() });
  if (res.status === 422) return { total_count: 0, incomplete_results: false, items: [] };
  if (!res.ok) throw new Error(`search ${q} p${page} -> ${res.status} ${await res.text()}`);
  return res.json();
}

// GraphQL answers with partial data when some aliases fail (e.g. NOT_FOUND), so return both.
export async function graphql(query, variables = {}) {
  for (let i = 0; ; i++) {
    // Fail fast on 5xx: callers split the query into smaller ones instead of waiting.
    const res = await request(API + '/graphql', {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    }, 1);
    if (!res.ok) {
      if (i < 1 && res.status >= 500) { await sleep(3000); continue; }
      throw new Error(`graphql -> ${res.status} ${await res.text()}`);
    }
    // A slow query can come back as an empty or cut-off body; treat that like a timeout.
    let j;
    try { j = JSON.parse(await res.text()); } catch (e) {
      if (i < 3) { await sleep(5000); continue; }
      throw new Error('graphql: unreadable response (' + e.message + ')');
    }
    if (!j.data && j.errors) {
      if (i < 3 && j.errors.some((e) => /timeout|something went wrong/i.test(e.message))) { await sleep(5000); continue; }
      throw new Error('graphql errors: ' + JSON.stringify(j.errors).slice(0, 500));
    }
    return { data: j.data || {}, errors: j.errors || [] };
  }
}

// Returns a GraphQL string literal.
export const gqlStr = (s) => JSON.stringify(String(s));

export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
