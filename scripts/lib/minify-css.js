// A small, conservative CSS minifier for the site's own stylesheet (no dependencies).
// Strings are copied exactly, comments are dropped, whitespace runs become one space, and spaces
// are removed only next to { } ; , where CSS never needs them. Spaces around ":" "+" "-" ">" stay,
// because they can matter (".a :hover", calc(1px + 2px)).

const TIGHT = new Set(['{', '}', ';', ',']);

export function minifyCss(css) {
  let out = '';
  let pendingSpace = false;
  const emit = (s) => {
    if (pendingSpace && out && !TIGHT.has(out[out.length - 1]) && !TIGHT.has(s[0])) out += ' ';
    pendingSpace = false;
    out += s;
  };
  for (let i = 0; i < css.length;) {
    const c = css[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== c) j += css[j] === '\\' ? 2 : 1;
      emit(css.slice(i, j + 1));
      i = j + 1;
    } else if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? css.length : end + 2;
      pendingSpace = true;
    } else if (/\s/.test(c)) {
      while (i < css.length && /\s/.test(css[i])) i++;
      pendingSpace = true;
    } else {
      emit(c);
      i++;
    }
  }
  return out.replace(/;}/g, '}');
}
