// Classifies candidates with an LLM through any OpenAI-compatible chat completions endpoint
// (Workers AI, AI Gateway, OpenAI...). Asks for strict JSON with a fixed category list.
// With no LLM configured, entries from the awesome list fall back to that list's own category and summary.

import { CATEGORIES, CATEGORY_INFO } from '../../lib/config.js';
import { keyOf, today } from '../lib/store.js';
import { log, sleep } from '../lib/gh.js';

const BASE = (process.env.LLM_BASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.LLM_API_KEY || '';
// On OpenRouter the default is openrouter/free, its own router over whichever free models exist today,
// so the free model list never needs updating here. Elsewhere it defaults to Workers AI.
const IS_OPENROUTER = /openrouter\.ai/.test(BASE);
const MODEL = process.env.LLM_MODEL || (IS_OPENROUTER ? 'openrouter/free' : '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
const CONCURRENCY = Number(process.env.LLM_CONCURRENCY || 2);
// Free tiers have small limits (OpenRouter :free models: 20 a minute, 50 a day), so cap each run.
// Whatever is left waits for the next night.
const MAX_PER_RUN = Number(process.env.LLM_MAX_PER_RUN || 40);
const MIN_INTERVAL_MS = Number(process.env.LLM_MIN_INTERVAL_MS || 3500);
class OutOfQuota extends Error {}
export const llmConfigured = () => !!(BASE && KEY);

const KINDS = ['app', 'starter', 'library', 'demo', 'tutorial'];
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'is_complete_app', 'kind', 'category', 'replaces', 'one_liner', 'confidence'],
  properties: {
    name: { type: 'string' },
    is_complete_app: { type: 'boolean' },
    kind: { type: 'string', enum: KINDS },
    category: { type: 'string', enum: CATEGORIES },
    replaces: { type: ['string', 'null'] },
    one_liner: { type: 'string' },
    confidence: { type: 'number' },
  },
};

const SYSTEM = `You review GitHub repositories for a catalog of open-source apps that people deploy to their own Cloudflare account.
Answer with one JSON object and nothing else, with these keys:
- "name": the app's display name, as the README calls it (e.g. "Cloudflare Temp Email", not "cloudflare_temp_email").
- "is_complete_app": true only if this is a finished, usable application an end user or team would run as-is. False for starters, templates, boilerplates, SDKs, libraries, frameworks, demos, examples, tutorials, course material, and collections of templates.
- "kind": one of ${KINDS.join(', ')}.
- "category": exactly one of these (pick the most specific that fits):
${CATEGORIES.map((c) => `  - ${c}: ${CATEGORY_INFO[c]}`).join('\n')}
- "replaces": the best-known commercial product it replaces (e.g. "Calendly", "Google Analytics"), or null if none is obvious.
- "one_liner": what it does for the user, in plain casual English, at most 110 characters. Short sentence. No em dashes. Don't start with "A self-hosted" or the app name. Don't mention Cloudflare unless it matters.
- "confidence": 0 to 1, how sure you are about is_complete_app and kind.`;

function cleanReadme(md) {
  return String(md || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, 8000);
}

function prompt(r, readme) {
  const m = r.meta;
  return [
    `Repository: ${r.repo}`,
    `Description: ${m.description || '(none)'}`,
    m.homepage ? `Homepage: ${m.homepage}` : null,
    `Stars: ${m.stars}. Marked as a template repo: ${m.template ? 'yes' : 'no'}.`,
    `Cloudflare bindings in its wrangler config: ${(r.enrich.bindings || []).join(', ') || 'none found'}`,
    r.hints?.summary ? `A human curator described it as: "${r.hints.summary}" (category: ${r.hints.category || 'unknown'})` : null,
    '',
    'README:',
    cleanReadme(readme),
  ].filter((x) => x != null).join('\n');
}

function extractJson(text) {
  const s = String(text || '');
  const start = s.indexOf('{'), end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON in answer');
  return JSON.parse(s.slice(start, end + 1));
}

export function validate(j) {
  const out = {
    name: typeof j.name === 'string' ? j.name.trim().slice(0, 60) : null,
    is_complete_app: j.is_complete_app === true,
    kind: KINDS.includes(j.kind) ? j.kind : 'demo',
    category: CATEGORIES.includes(j.category) ? j.category : null,
    replaces: typeof j.replaces === 'string' && j.replaces.trim() && !/^(none|null|n\/a)$/i.test(j.replaces.trim()) ? j.replaces.trim().slice(0, 60) : null,
    one_liner: typeof j.one_liner === 'string' ? j.one_liner.replace(/\s*[—–]\s*/g, ', ').trim().slice(0, 160) : '',
    confidence: Math.max(0, Math.min(1, Number(j.confidence) || 0)),
  };
  if (!out.category) out.confidence = Math.min(out.confidence, 0.5);
  return out;
}

// Some OpenAI-compatible endpoints don't take json_schema, so step down until one works.
const FORMATS = [
  { type: 'json_schema', json_schema: { name: 'classification', strict: true, schema: SCHEMA } },
  { type: 'json_object' },
  null,
];
let formatIdx = 0;

let lastCall = 0;
async function ask(content) {
  let badAnswers = 0;
  for (let tries = 0; ; tries++) {
    const gap = MIN_INTERVAL_MS - (Date.now() - lastCall);
    if (gap > 0) await sleep(gap);
    lastCall = Date.now();
    // Reasoning models spend max_tokens on thinking before they answer, so leave plenty of room.
    const body = { model: MODEL, temperature: 0, max_tokens: 4000, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content }] };
    // OpenRouter: keep reasoning short and out of the reply (low, not none: some models can't turn it off).
    if (IS_OPENROUTER) body.reasoning = { effort: 'low', exclude: true };
    if (FORMATS[formatIdx]) body.response_format = FORMATS[formatIdx];
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body),
    });
    if (res.status === 429 && tries >= 2) throw new OutOfQuota('rate limit or daily quota reached');
    if ((res.status === 429 || res.status >= 500) && tries < 4) { await sleep(10_000 * (tries + 1)); continue; }
    if (res.status === 400 && formatIdx < FORMATS.length - 1) {
      log(`classify: endpoint refused response_format ${FORMATS[formatIdx]?.type}, trying the next one`);
      formatIdx++;
      continue;
    }
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = await res.json();
    const choice = j.choices?.[0];
    try {
      // Routers answer with the model they actually used; keep it so odd results can be traced.
      return { out: extractJson(choice?.message?.content), model: j.model || MODEL };
    } catch (e) {
      // openrouter/free picks a model at random, and some aren't chat models (e.g. safety filters).
      // Asking again usually lands on a different one.
      if (badAnswers++ < 2) { log(`classify: unusable answer from ${j.model || MODEL}, asking again`); continue; }
      throw new Error(`${e.message} (model ${j.model || MODEL}, finish_reason ${choice?.finish_reason}, content: ${JSON.stringify(String(choice?.message?.content ?? '').slice(0, 120))})`);
    }
  }
}

export const eligible = (r) => !r.filtered && r.enrich
  && (!r.enrich.copy_of || r.sources.includes('awesome-cfsh'))
  && (r.enrich.has_deploy_button || r.enrich.config_file || r.sources.includes('awesome-cfsh'));

export async function classify(db, readmes) {
  const todo = Object.values(db.repos).filter((r) => eligible(r)
    && (!r.classify || (r.classify.model === 'awesome-hints' && llmConfigured())));
  if (!llmConfigured()) {
    let hinted = 0;
    for (const r of todo) {
      if (r.hints?.category) {
        r.classify = {
          name: r.hints.name, is_complete_app: true, kind: 'app', category: r.hints.category, replaces: null,
          one_liner: r.hints.summary || '', confidence: 0.85, model: 'awesome-hints', at: today(),
        };
        hinted++;
      }
    }
    log(`classify: no LLM configured (set LLM_BASE_URL and LLM_API_KEY). ${hinted} awesome entries used their own hints, ${todo.length - hinted} wait for review.`);
    return { classified: 0, hinted, waiting: todo.length - hinted };
  }
  // Most-starred first, so the apps people care about get classified first.
  const queue = todo.sort((a, b) => b.meta.stars - a.meta.stars).slice(0, MAX_PER_RUN);
  log(`classify: ${queue.length} of ${todo.length} repos with ${MODEL}`);
  let done = 0, failed = 0, stopped = false;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let r; !stopped && (r = queue.shift());) {
      try {
        const { out, model } = await ask(prompt(r, readmes.get(keyOf(r.repo))));
        r.classify = { ...validate(out), model, at: today() };
        done++;
      } catch (e) {
        if (e instanceof OutOfQuota) { stopped = true; log('classify: out of quota, the rest waits for the next run'); break; }
        failed++;
        log(`classify: ${r.repo} failed: ${e.message}`);
      }
    }
  }));
  log(`classify: ${done} done, ${failed} failed`);
  return { classified: done, failed };
}
