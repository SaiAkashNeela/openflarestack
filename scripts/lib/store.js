// Git is the database: JSON files under data/.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA = join(ROOT, 'data');
export const today = () => new Date().toISOString().slice(0, 10);

export function readJson(name, fallback) {
  const p = join(DATA, name);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback;
}

export function writeJson(name, value) {
  const p = join(DATA, name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(value, null, 2) + '\n');
}

export function writeText(name, text) {
  const p = join(DATA, name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}

// repos.json: every repo ever seen, keyed by lowercase "owner/name".
export const keyOf = (repo) => String(repo).toLowerCase();

export function loadRepos() {
  const db = readJson('repos.json', null) || { version: 1, started: today(), repos: {} };
  return db;
}

export function saveRepos(db) {
  const sorted = Object.fromEntries(Object.entries(db.repos).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  writeJson('repos.json', { ...db, repos: sorted });
}

// Adds a repo (or a new source for a known repo). Returns the record.
export function upsert(db, repo, source, extra = {}) {
  const key = keyOf(repo);
  let r = db.repos[key];
  if (!r) {
    r = db.repos[key] = { repo, sources: [], first_seen: today(), status: 'new' };
  }
  if (!r.sources.includes(source)) r.sources.push(source);
  Object.assign(r, extra);
  return r;
}
