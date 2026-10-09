import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBindings } from '../lib/bindings.js';
import { parseRepo } from '../lib/check.js';
import { parseDeployLink } from '../scripts/stages/enrich.js';

test('TOML: finds bindings and ignores commented-out ones', () => {
  const toml = `name = "punctual"
[[d1_databases]]
binding = "DB"
[[kv_namespaces]]
binding = "CACHE"
[[r2_buckets]]
binding = "AVATARS"
[[durable_objects.bindings]]
name = "HOST_CALENDAR"
[[analytics_engine_datasets]]
binding = "INSIGHTS"
[[queues.producers]]
binding = "TASKS"
[triggers]
crons = ["*/5 * * * *"]
# [[send_email]]
# name = "MAIL"
`;
  assert.deepEqual(parseBindings(toml, 'wrangler.toml'), ['D1', 'KV', 'R2', 'DO', 'Q', 'Cr', 'AE']);
});

test('TOML: inline tables, env sections and trailing comments', () => {
  const toml = `ai = { binding = "AI" } # models
[[env.production.d1_databases]]
binding = "DB"
[browser]
binding = "BROWSER"
url = "https://example.com/#not-a-comment"
[triggers]
crons = []`;
  assert.deepEqual(parseBindings(toml, 'wrangler.toml'), ['D1', 'AI', 'Br']);
});

test('JSONC: strips comments without breaking URLs in strings', () => {
  const jsonc = `{
  "name": "booking-worker", // trailing comment
  "vars": { "SITE": "https://example.com/a//b" },
  /* "r2_buckets": [{ "binding": "OLD" }], */
  "d1_databases": [{ "binding": "DB" }],
  "kv_namespaces": [{ "binding": "CACHE" }],
  "send_email": [{ "name": "MAIL" }],
  "triggers": { "crons": ["0 * * * *"] }
}`;
  assert.deepEqual(parseBindings(jsonc, 'wrangler.jsonc'), ['D1', 'KV', 'Cr', 'Em']);
});

test('parseRepo accepts links and owner/name', () => {
  assert.deepEqual(parseRepo('https://github.com/CCCrafts/punctual'), { o: 'CCCrafts', r: 'punctual' });
  assert.deepEqual(parseRepo('github.com/a/b.git'), { o: 'a', r: 'b' });
  assert.deepEqual(parseRepo('a/b-c.d'), { o: 'a', r: 'b-c.d' });
  assert.equal(parseRepo('https://gitlab.com/a/b'), null);
});

test('parseDeployLink handles encoded URLs and subfolders', () => {
  assert.deepEqual(parseDeployLink('https%3A%2F%2Fgithub.com%2FCCCrafts%2Fpunctual'), { repo: 'CCCrafts/punctual', path: '' });
  assert.deepEqual(parseDeployLink('https://github.com/o/r/tree/main/apps/web'), { repo: 'o/r', path: 'apps/web' });
});

test('configRank: exact names, template and deploy variants, but not dev or test configs', async () => {
  const { configRank } = await import('../lib/bindings.js');
  assert.equal(configRank('wrangler.toml'), 0);
  assert.equal(configRank('wrangler.toml.template'), 1);
  assert.equal(configRank('wrangler-action.toml'), 1);
  assert.equal(configRank('wrangler.example.jsonc'), 1);
  assert.equal(configRank('wrangler-dev.toml'), -1);
  assert.equal(configRank('wrangler.toml.e2e'), -1);
  assert.equal(configRank('package.json'), -1);
  assert.deepEqual(parseBindings('[[d1_databases]]\nbinding = "DB"', 'worker/wrangler.toml.template'), ['D1']);
});
