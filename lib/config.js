// Project-wide settings. Shared by the scripts, the site build and the browser.

export const SITE_URL = 'https://openflarestack.com';
export const CATALOG_REPO = 'SaiAkashNeela/openflarestack';
export const SUBMIT_TEMPLATE = 'submit-app.yml';

// Never listed: this catalog itself, and lists of apps rather than apps.
export const EXCLUDE_REPOS = [CATALOG_REPO, 'theoephraim/awesome-cloudflare-selfhosted'].map((r) => r.toLowerCase());

export const CATEGORIES = [
  'Analytics',
  'Auth & security',
  'Business',
  'Chat & realtime',
  'CMS & docs',
  'Community',
  'Developer tools',
  'Email',
  'Files & media',
  'Link shorteners',
  'Notes',
  'Notifications',
  'Personal',
  'Remote access',
  'Status pages',
  'AI tools',
];

export const TOP_N = 100;
export const NEW_DAYS = 7;

export const README_RE = /^readme(\.(md|markdown|mdx|rst|txt))?$/i;
export const DEPLOY_HOST_RE = /deploy\.workers\.cloudflare\.com/i;

export function deployUrl(repo) {
  return 'https://deploy.workers.cloudflare.com/?url=' + encodeURIComponent('https://github.com/' + repo);
}

export function submitIssueUrl(repo) {
  const u = new URL(`https://github.com/${CATALOG_REPO}/issues/new`);
  u.searchParams.set('template', SUBMIT_TEMPLATE);
  u.searchParams.set('title', `Submit: ${repo}`);
  u.searchParams.set('repo_url', `https://github.com/${repo}`);
  return u.toString();
}

export function slugify(s) {
  return String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Licences that are source-available, not open source. These never get listed.
export const SOURCE_AVAILABLE = new Set([
  'BUSL-1.1', 'Elastic-2.0', 'SSPL-1.0', 'FSL-1.1-MIT', 'FSL-1.1-ALv2', 'Commons-Clause',
  'CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0', 'CC-BY-NC-ND-4.0', 'PolyForm-Noncommercial-1.0.0', 'PolyForm-Shield-1.0.0',
]);

// 'ok' for an open licence, 'review' when GitHub couldn't name it, 'no' otherwise.
export function licenceStatus(spdx) {
  if (!spdx) return 'no';
  if (spdx === 'NOASSERTION') return 'review';
  if (SOURCE_AVAILABLE.has(spdx)) return 'no';
  return 'ok';
}
