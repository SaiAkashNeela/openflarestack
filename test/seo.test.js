import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipText, pageTitle } from '../scripts/lib/seo.js';

test('clipText: short text is unchanged', () => {
  assert.equal(clipText('Short and sweet.'), 'Short and sweet.');
});

test('clipText: prefers ending on a whole sentence when one is long enough', () => {
  const s = 'A'.repeat(100) + '. ' + 'More words that will not fit in the snippet at all, no matter how hard we try to squeeze them in here.';
  assert.equal(clipText(s), 'A'.repeat(100) + '.');
});

test('clipText: otherwise cuts at a word boundary and adds an ellipsis, within the limit', () => {
  const s = 'word '.repeat(60).trim();
  const out = clipText(s);
  assert.ok(out.length <= 160, `length ${out.length}`);
  assert.ok(out.endsWith('word…'), out.slice(-10));
});

test('clipText: drops trailing punctuation before the ellipsis', () => {
  const s = 'Alternatives to ' + 'Calendly, '.repeat(20);
  assert.match(clipText(s, 40), /[a-z]…$/);
});

test('pageTitle: adds the brand when it fits, and leaves it off when it would make the title too long', () => {
  assert.equal(pageTitle('Credits'), 'Credits | OpenFlareStack');
  assert.equal(pageTitle('OpenFlareStack: self-hosted apps'), 'OpenFlareStack: self-hosted apps');
  const long = 'Sink: self-hosted Bitly alternative on Cloudflare';
  assert.equal(pageTitle(long), long);
});
