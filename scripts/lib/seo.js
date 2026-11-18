// Lengths that search results and link previews show without cutting off.

export const BRAND = 'OpenFlareStack';
const TITLE_MAX = 65;
const DESC_MAX = 160;

// "Credits" -> "Credits | OpenFlareStack", unless the brand is already there or would push the title
// past what results show. Search engines usually print the site name next to the title anyway.
export function pageTitle(title) {
  if (title.includes(BRAND)) return title;
  const full = `${title} | ${BRAND}`;
  return full.length <= TITLE_MAX ? full : title;
}

// Shortens a meta description to `max` characters: at the end of a sentence if that keeps most of it,
// otherwise at a word boundary with an ellipsis. Never cuts a word in half.
export function clipText(s, max = DESC_MAX) {
  s = String(s).replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const head = s.slice(0, max + 1);
  const sentence = head.lastIndexOf('. ');
  if (sentence >= max * 0.5) return head.slice(0, sentence + 1);
  const cut = head.slice(0, max).lastIndexOf(' ');
  return head.slice(0, cut > 0 ? cut : max - 1).replace(/[\s,;:.–-]+$/, '') + '…';
}
