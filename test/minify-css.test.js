import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minifyCss } from '../scripts/lib/minify-css.js';

test('minifyCss: drops comments and collapses whitespace around braces, semicolons and commas', () => {
  assert.equal(minifyCss('/* hi */\n.a ,  .b {\n  color : red ;\n  margin: 0 auto;\n}\n'), '.a,.b{color : red;margin: 0 auto}');
});

test('minifyCss: keeps strings exactly, including spaces and comment-like text', () => {
  const css = '.g{grid-template-areas:". tiles" "rank  main";content:"/* not a comment */";font-family:\'Space Grotesk\'}';
  assert.equal(minifyCss(css), css);
});

test('minifyCss: keeps spaces that change meaning (descendant selectors, :pseudo, calc, media queries)', () => {
  assert.equal(minifyCss('.a .b :hover{width:calc(100% - 2rem + 1px)}'), '.a .b :hover{width:calc(100% - 2rem + 1px)}');
  assert.equal(minifyCss('@media (min-width:900px) and (max-width:1200px){.x{top:0}}'), '@media (min-width:900px) and (max-width:1200px){.x{top:0}}');
});

test('minifyCss: handles escaped quotes inside strings', () => {
  assert.equal(minifyCss('.q{content:"a\\"  b"}'), '.q{content:"a\\"  b"}');
});
