/**
 * #1371: comment and string-literal removal for the token checks in
 * test-substance and source-import-check.
 *
 * An assertion token or a source name that appears only inside a comment or a
 * string (`t.Fatal("Add failed")`, `print("assert add(1, 2) == 3")`) is not an
 * assertion or a call. A one-pass scanner is used because regex stripping
 * cannot tell a `#` or `//` inside a string from a comment.
 *
 * String contents are replaced by a placeholder that is the same for equal
 * contents (`"a"` and `"a"` stay equal, `"a"` and `"b"` stay different), so
 * the tautology rules still recognise `assertEquals("a", "a")`.
 */

export type CodeLanguage = 'python' | 'go' | 'jvm';

interface Syntax {
  lineComment: string;
  blockComment: boolean;
  /** Quote characters that open a single-line string. */
  quotes: string[];
  /** Delimiters of multi-line strings whose contents are not escaped. */
  rawQuotes: string[];
}

const SYNTAX: Record<CodeLanguage, Syntax> = {
  python: { lineComment: '#', blockComment: false, quotes: ['"', "'"], rawQuotes: ['"""', "'''"] },
  go: { lineComment: '//', blockComment: true, quotes: ['"', "'"], rawQuotes: ['`'] },
  jvm: { lineComment: '//', blockComment: true, quotes: ['"', "'"], rawQuotes: ['"""'] },
};

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
  let out = '';
  let i = 0;
  const emitString = (open: string, close: string, content: string) => {
    out += open + (keepStrings ? content : placeholder(content)) + close;
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
      while (j < code.length && code[j] !== quote && code[j] !== '\n') j += code[j] === '\\' ? 2 : 1;
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
  if (/\.(?:java|kt|kts)$/i.test(file)) return 'jvm';
  return undefined;
}
