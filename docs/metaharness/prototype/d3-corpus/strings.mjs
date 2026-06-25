/** D3 corpus fixture — string utilities with branch density for mutation testing.
 *  Pure ESM, no deps; tests run under `node --test`. */

export function slugify(input) {
  if (typeof input !== 'string') {
    throw new TypeError('input must be a string');
  }
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0) {
    return '';
  }
  let out = '';
  let prevDash = false;
  for (const ch of trimmed) {
    if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) {
      out += ch;
      prevDash = false;
    } else if (!prevDash && out.length > 0) {
      out += '-';
      prevDash = true;
    }
  }
  return prevDash ? out.slice(0, -1) : out;
}

export function truncate(text, max, ellipsis = '…') {
  if (typeof text !== 'string') {
    throw new TypeError('text must be a string');
  }
  if (typeof max !== 'number' || max < 0) {
    throw new RangeError('max must be >= 0');
  }
  if (text.length <= max) {
    return text;
  }
  if (max <= ellipsis.length) {
    return ellipsis.slice(0, max);
  }
  return text.slice(0, max - ellipsis.length) + ellipsis;
}

export function wordCount(text) {
  if (typeof text !== 'string') {
    throw new TypeError('text must be a string');
  }
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
  return words.length;
}
