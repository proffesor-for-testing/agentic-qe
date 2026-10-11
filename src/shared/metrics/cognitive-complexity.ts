/**
 * Line-based cognitive complexity heuristic (SonarSource rules, issues #907).
 * Known gaps (lambdas, labelled jumps, boolean sequences, ...) are tracked in #967.
 */

// A `/` after one of these starts a regex literal; after an operand it is division.
const REGEX_PREFIX = /(?:^|[(,=:[!&|?{;+\-*%~^]|\b(?:return|typeof|case|do|else|in|of|void|yield|await))$/;

const blank = (text: string): string => text.replace(/[^\n]/g, ' ');

/** True when a `/` appended to `out` would start a regex literal (checks only the last token). */
function regexCanStart(out: string): boolean {
  let k = out.length - 1;
  while (k >= 0 && /\s/.test(out[k])) k--;
  return REGEX_PREFIX.test(out.slice(Math.max(0, k - 9), k + 1));
}

/** Index just past a string, template or regex literal starting at `start`, and whether it closed. */
function scanLiteral(code: string, start: number): { end: number; closed: boolean } {
  const quote = code[start];
  let inClass = false;
  for (let j = start + 1; j < code.length; j++) {
    const c = code[j];
    if (c === '\\') { j++; continue; }
    if (c === '\n' && quote !== '`') return { end: j, closed: false };
    if (quote === '/' && c === '[') inClass = true;
    else if (quote === '/' && c === ']') inClass = false;
    else if (c === quote && !(quote === '/' && inClass)) return { end: j + 1, closed: true };
  }
  return { end: code.length, closed: false };
}

/**
 * Blank out comments and the contents of string, template and regex literals,
 * keeping newlines and delimiters, so keywords and braces inside them are not counted.
 */
export function maskCommentsAndLiterals(code: string): string {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];
    if (ch === '/' && (next === '/' || next === '*')) {
      const close = next === '/' ? code.indexOf('\n', i) : code.indexOf('*/', i + 2);
      const end = close < 0 ? code.length : next === '/' ? close : close + 2;
      out += blank(code.slice(i, end));
      i = end;
    } else if (ch === '"' || ch === "'" || ch === '`' || (ch === '/' && regexCanStart(out))) {
      const { end, closed } = scanLiteral(code, i);
      out += ch + blank(code.slice(i + 1, closed ? end - 1 : end)) + (closed ? code[end - 1] : '');
      i = end;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/**
 * `if`, loops, `switch`, `catch` and ternaries score +1 plus the nesting level;
 * `else if` and `else` score a flat +1 (an `else if` is not also an `if`).
 * Nesting rises only inside the braces of those structures, so a function
 * body, try block or object literal adds no nesting bonus.
 */
export function calculateCognitiveComplexity(code: string): number {
  const count = (text: string, pattern: RegExp) => (text.match(pattern) || []).length;
  let complexity = 0;
  const braces: boolean[] = []; // one entry per open `{`: true when it opens a nesting structure
  let pendingNest = false; // nesting structure whose `{` has not been seen yet

  for (const line of maskCommentsAndLiterals(code).split('\n')) {
    let rest = line.trim();
    // `} else {` / `} catch (e) {`: the previous block closes before this structure is scored.
    while (rest.startsWith('}')) {
      braces.pop();
      rest = rest.slice(1).trimStart();
    }
    const nesting = braces.filter(Boolean).length;

    const flat = count(rest, /\belse\s+if\s*\(/g) + count(rest, /\belse\b(?!\s+if\b)/g);
    const nested = count(rest, /(?<!\belse\s+)\bif\s*\(/g) + count(rest, /\b(?:for|while|switch|catch)\s*\(/g);
    complexity += flat + nested * (1 + nesting);
    if (/\?\s*[^:]/.test(rest)) {
      complexity += 1 + nesting; // Ternary
    }
    if (/&&|\|\|/.test(rest)) {
      complexity += 1; // Boolean operators
    }

    pendingNest ||= flat + nested > 0 || /\bdo\b/.test(rest);
    for (const ch of rest.match(/[{}]/g) || []) {
      if (ch === '{') {
        braces.push(pendingNest);
        pendingNest = false;
      } else {
        braces.pop();
      }
    }
    // A brace-less body (`if (x) return;`) ends the structure without nesting anything.
    if (rest.endsWith(';')) pendingNest = false;
  }

  return complexity;
}
