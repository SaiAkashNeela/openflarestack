// Project-wide settings. Shared by the scripts, the site build and the browser.

export const SITE_URL = 'https://openflarestack.com';
export const CATALOG_REPO = 'SaiAkashNeela/openflarestack';
export const SUBMIT_TEMPLATE = 'submit-app.yml';
export const AUTHOR = { name: 'Sai Akash Neela', url: 'https://github.com/SaiAkashNeela' };

// Never listed: this catalog itself, and lists of apps rather than apps.
export const EXCLUDE_REPOS = [CATALOG_REPO, 'theoephraim/awesome-cloudflare-selfhosted'].map((r) => r.toLowerCase());

// The fixed category list, in display order. The description goes into the classifier's prompt
// and onto each category page.
export const CATEGORY_INFO = {
  'AI tools': 'AI chat apps, assistants, bots and AI-powered utilities.',
  'AI agents': 'Agents that do work for you, and the sandboxes, publishing and tools they run on.',
  'LLM gateways': 'One API in front of many LLM providers: proxies, routers, key management and usage tracking.',
  'Analytics': 'Website analytics, SEO and traffic dashboards.',
  'Auth & security': 'Logins, OAuth and OpenID providers, 2FA codes and password vaults.',
  'Business': 'CRM, customer support, social media scheduling, feedback, polls and team tools.',
  'Shops & payments': 'Online stores, digital goods and payment gateways.',
  'Finance': 'Invoices, budgets, subscription and renewal trackers.',
  'Chat & realtime': 'Chat rooms, messaging, video calls and realtime collaboration.',
  'Community': 'Comments, forums and community bots.',
  'CMS & docs': 'Blogs, headless CMSs, website builders and documentation sites.',
  'Notes': 'Notes, wikis, whiteboards and knowledge bases.',
  'RSS & reading': 'RSS readers, feeds and read-it-later apps.',
  'Developer tools': 'Database GUIs, crawlers, webhooks, API testing and other tools for developers.',
  'Git & CI': 'Git hosting, CI runners, build caches and package or update servers.',
  'Email': 'Webmail, shared inboxes, newsletters and email sending.',
  'Temporary email': 'Disposable and throwaway inboxes on your own domain.',
  'Notifications': 'Push notifications, alerts and webhook-to-message relays.',
  'Files & storage': 'Cloud drives, file browsers, WebDAV and file sharing.',
  'Image hosting': 'Image hosts and picture beds with upload, resize and share links.',
  'Pastebins': 'Pastebins and encrypted text sharing.',
  'Media': 'Music, video, podcasts, books, photos and screen recording.',
  'Link shorteners': 'Short links, QR codes and click stats.',
  'Status pages': 'Uptime monitoring, status pages and server monitors.',
  'Remote access': 'Tunnels, browser SSH, remote desktops and VPN tools.',
  'Personal': 'Single-person tools: bookmarks, start pages, recipes, trips and habits.',
};
export const CATEGORIES = Object.keys(CATEGORY_INFO);

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
