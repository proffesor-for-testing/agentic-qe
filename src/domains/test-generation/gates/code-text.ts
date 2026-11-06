/**
 * #1371: comment and string-literal removal for the token checks in
 * test-substance and source-import-check.
 *
 * An assertion token or a source name that appears only inside a comment or a
 * string (`t.Fatal("Add failed")`, `print("assert add(1, 2) == 3")`) is not an
 * assertion or a call. A one-pass scanner is used because regex stripping
 * cannot tell a `#` or `//` inside a string from a comment. It only uses
 * indexOf/startsWith and fixed-length sticky matches, so it is linear.
 *
 * String contents are replaced by a placeholder that is the same for equal
 * contents (`"a"` and `"a"` stay equal, `"a"` and `"b"` stay different), so
 * the tautology rules still recognise `assertEquals("a", "a")`.
 *
 * Kotlin: `${expr}` and `$name` inside a string are code, so they are kept
 * (after the string's placeholder); a backtick name (`` fun `it's ok`() ``) is
 * an identifier, not a string.
 */

export type CodeLanguage = 'python' | 'go' | 'java' | 'kotlin';

interface Syntax {
  lineComment: string;
  blockComment: boolean;
  /** Quote characters that open a single-line, escapable string. */
  quotes: string[];
  /** Delimiters of multi-line strings whose contents are not escaped. */
  rawQuotes: string[];
  /** `'` opens a character/rune literal (one character or escape), not a string. */
  charLiterals: boolean;
  /** Kotlin: `${...}` / `$name` templates inside strings, and backtick identifiers. */
  kotlin: boolean;
}

const C_LIKE = { lineComment: '//', blockComment: true, charLiterals: true };
const SYNTAX: Record<CodeLanguage, Syntax> = {
  python: { lineComment: '#', blockComment: false, quotes: ['"', "'"], rawQuotes: ['"""', "'''"], charLiterals: false, kotlin: false },
  go: { ...C_LIKE, quotes: ['"'], rawQuotes: ['`'], kotlin: false },
  java: { ...C_LIKE, quotes: ['"'], rawQuotes: ['"""'], kotlin: false },
  kotlin: { ...C_LIKE, quotes: ['"'], rawQuotes: ['"""'], kotlin: true },
};

/** A char/rune literal: one character, or one escape (`\n`, `\'`, `A`, `\x41`, `\101`). */
const CHAR_LITERAL = /'(?:\\(?:u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|x[0-9a-fA-F]{2}|[0-7]{3}|[^\n])|[^'\\\n])'/y;
const IDENTIFIER = /[A-Za-z_]\w*/y;

/** End index (exclusive) of the `${...}` starting at `start` (pointing at `$`), honouring nested strings. */
function templateEnd(code: string, start: number, stop: number): number {
  let depth = 0;
  for (let i = start + 1; i < stop; i++) {
    const c = code[i];
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
    else if (c === '"') {
      i++;
      while (i < stop && code[i] !== '"' && code[i] !== '\n') i += code[i] === '\\' ? 2 : 1;
    }
  }
  return stop;
}

/**
 * Remove comments; replace string contents with `S<n>` (or keep them when
 * `keepStrings`). Line breaks are kept so line-anchored rules still work.
 */
export function stripCode(code: string, language: CodeLanguage, keepStrings = false): string {
  const syntax = SYNTAX[language];
  const ids = new Map<string, string>();
  const placeholder = (content: string) => {
    if (!ids.has(content)) ids.set(content, `S${ids.size}`);
    return ids.get(content)!;
  };
  /** Kotlin template expressions in a string body, stripped as code. */
  const templates = (body: string): string => {
    if (!syntax.kotlin) return '';
    const parts: string[] = [];
    for (let k = 0; k < body.length; k++) {
      if (body[k] !== '$') continue;
      if (body[k + 1] === '{') {
        const end = templateEnd(body, k, body.length);
        parts.push(stripCode(body.slice(k + 2, end - 1), language));
        k = end - 1;
      } else {
        IDENTIFIER.lastIndex = k + 1;
        const m = IDENTIFIER.exec(body);
        if (m) { parts.push(m[0]); k += m[0].length; }
      }
    }
    return parts.length > 0 ? ` ${parts.join(' ')} ` : '';
  };
  let out = '';
  let i = 0;
  const emitString = (open: string, close: string, content: string) => {
    out += open + (keepStrings ? content : placeholder(content)) + close + (keepStrings ? '' : templates(content));
  };
  while (i < code.length) {
    if (code.startsWith(syntax.lineComment, i)) {
      const end = code.indexOf('\n', i);
      i = end < 0 ? code.length : end;
      continue;
    }
    if (syntax.blockComment && code.startsWith('/*', i)) {
      const end = code.indexOf('*/', i + 2);
      const comment = code.slice(i, end < 0 ? code.length : end + 2);
      out += comment.replace(/[^\n]/g, '');
      i = end < 0 ? code.length : end + 2;
      continue;
    }
    if (syntax.kotlin && code[i] === '`') {
      // A backtick identifier: copied as is, never a string.
      const end = code.indexOf('`', i + 1);
      const line = code.indexOf('\n', i + 1);
      const stop = end < 0 || (line >= 0 && line < end) ? i + 1 : end + 1;
      out += code.slice(i, stop);
      i = stop;
      continue;
    }
    if (syntax.charLiterals && code[i] === "'") {
      CHAR_LITERAL.lastIndex = i;
      const m = CHAR_LITERAL.exec(code);
      if (m) {
        emitString("'", "'", m[0].slice(1, -1));
        i += m[0].length;
      } else {
        out += "'";
        i++;
      }
      continue;
    }
    const raw = syntax.rawQuotes.find(q => code.startsWith(q, i));
    if (raw) {
      const end = code.indexOf(raw, i + raw.length);
      const content = code.slice(i + raw.length, end < 0 ? code.length : end);
      emitString(raw, raw, content);
      i = end < 0 ? code.length : end + raw.length;
      continue;
    }
    const quote = syntax.quotes.find(q => code[i] === q);
    if (quote) {
      let j = i + 1;
      while (j < code.length && code[j] !== quote && code[j] !== '\n') {
        if (syntax.kotlin && code[j] === '$' && code[j + 1] === '{') {
          // A single-line string's template ends on its line at the latest.
          const line = code.indexOf('\n', j);
          j = templateEnd(code, j, line < 0 ? code.length : line);
        }
        else j += code[j] === '\\' ? 2 : 1;
      }
      emitString(quote, code[j] === quote ? quote : '', code.slice(i + 1, Math.min(j, code.length)));
      i = code[j] === quote ? j + 1 : j;
      continue;
    }
    out += code[i];
    i++;
  }
  return out;
}

/** The language whose syntax stripCode knows for a source file, if any. */
export function codeLanguageOf(file: string): CodeLanguage | undefined {
  if (/\.py$/i.test(file)) return 'python';
  if (/\.go$/i.test(file)) return 'go';
  if (/\.java$/i.test(file)) return 'java';
  if (/\.kts?$/i.test(file)) return 'kotlin';
  return undefined;
}
