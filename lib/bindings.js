// Wrangler bindings -> tile codes. Shared by the nightly scripts, the site build and the browser.

export const BINDINGS = {
  D1: { g: 'data', n: 'D1 database', d: 'A SQL database for the app’s records.' },
  KV: { g: 'data', n: 'KV namespace', d: 'A key value store for settings and fast lookups.' },
  Hd: { g: 'data', n: 'Hyperdrive', d: 'Connects to a Postgres or MySQL database you already run.' },
  R2: { g: 'storage', n: 'R2 bucket', d: 'Storage for files and uploads.' },
  Im: { g: 'storage', n: 'Images', d: 'Resizes and serves pictures.' },
  DO: { g: 'state', n: 'Durable Objects', d: 'Keeps live sessions and realtime state.' },
  Q: { g: 'state', n: 'Queues', d: 'Runs background jobs.' },
  Wf: { g: 'state', n: 'Workflows', d: 'Runs long jobs with several steps.' },
  AI: { g: 'ai', n: 'Workers AI', d: 'Runs AI models inside your account.' },
  Br: { g: 'ai', n: 'Browser Rendering', d: 'Loads web pages in a headless browser.' },
  Cr: { g: 'cron', n: 'Cron trigger', d: 'Runs scheduled tasks.' },
  Em: { g: 'mail', n: 'Email', d: 'Sends and receives mail on your domain.' },
  AE: { g: 'metrics', n: 'Analytics Engine', d: 'Stores high-volume event data cheaply.' },
};

export const ORDER = ['D1', 'KV', 'Hd', 'R2', 'Im', 'DO', 'Q', 'Wf', 'AI', 'Br', 'Cr', 'Em', 'AE'];

export const GROUPS = [
  { n: 'Data', k: ['D1', 'KV', 'Hd'], d: 'Where the app keeps its records. A D1 database is the most common.' },
  { n: 'Storage', k: ['R2', 'Im'], d: 'Files, uploads and images, kept in your own bucket.' },
  { n: 'Live state', k: ['DO', 'Q', 'Wf'], d: 'Realtime sessions, background jobs and long multi-step tasks.' },
  { n: 'AI', k: ['AI', 'Br'], d: 'Models and a headless browser that run inside your account.' },
  { n: 'Schedules', k: ['Cr'], d: 'Jobs that run on a timer, like reminders or nightly cleanups.' },
  { n: 'Email', k: ['Em'], d: 'Sending and receiving mail on your own domain.' },
  { n: 'Metrics', k: ['AE'], d: 'Event and traffic data that stays cheap at high volume.' },
];

export const CONFIG_FILES = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'];

// Also counts template and deploy variants (wrangler.toml.template, wrangler-action.toml), but not
// dev, test or local ones. Returns 0 for exact names, 1 for variants, -1 for anything else.
export function configRank(name) {
  if (CONFIG_FILES.includes(name)) return 0;
  if (/^wrangler[\w.-]*\.(toml|jsonc?)(\.(template|example|sample))?$/i.test(name) && !/(dev|test|e2e|local|staging|preview)/i.test(name)) return 1;
  return -1;
}

// Strip // and /* */ comments from JSONC without touching "https://..." inside strings.
function stripJsonComments(s) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (c === '\\') { out += s[++i] ?? ''; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && s[i + 1] === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i++; continue; }
    out += c;
  }
  return out;
}

// Remove TOML comments: whole-line "# ..." and trailing " # ..." outside quotes.
function stripTomlComments(s) {
  return s.split('\n').map((line) => {
    let inStr = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inStr) { if (c === '\\' && inStr === '"') i++; else if (c === inStr) inStr = null; continue; }
      if (c === '"' || c === "'") { inStr = c; continue; }
      if (c === '#') return line.slice(0, i);
    }
    return line;
  }).join('\n');
}

export function parseBindings(text, file) {
  const isToml = /\.toml(\.|$)/i.test(file);
  const s = isToml ? stripTomlComments(String(text || '')) : stripJsonComments(String(text || ''));
  const key = (k) => (isToml
    ? new RegExp(`^\\s*\\[{1,2}\\s*(env\\.[\\w-]+\\.)?${k}(\\.[\\w.]+)?\\s*\\]{1,2}|^\\s*${k}\\s*=`, 'm')
    : new RegExp(`"${k}"\\s*:`));
  const found = new Set();
  if (key('d1_databases').test(s)) found.add('D1');
  if (key('kv_namespaces').test(s)) found.add('KV');
  if (key('hyperdrive').test(s)) found.add('Hd');
  if (key('r2_buckets').test(s)) found.add('R2');
  if (key('images').test(s)) found.add('Im');
  if (key('durable_objects').test(s)) found.add('DO');
  if (key('queues').test(s)) found.add('Q');
  if (key('workflows').test(s)) found.add('Wf');
  if (key('ai').test(s)) found.add('AI');
  if (key('browser').test(s)) found.add('Br');
  if (/crons["']?\s*[=:]\s*\[\s*["']/.test(s)) found.add('Cr');
  if (key('send_email').test(s)) found.add('Em');
  if (key('analytics_engine_datasets').test(s)) found.add('AE');
  return ORDER.filter((x) => found.has(x));
}
