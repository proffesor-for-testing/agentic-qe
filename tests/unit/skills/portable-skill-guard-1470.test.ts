/**
 * #1470 guard — shipped skill commands must not use GNU-only grep features:
 *   - `grep -P` / `--perl-regexp` in skill scripts or fenced shell blocks in guides
 *   - GNU BRE escapes `\s`, `\w`, `\+`, `\|` in grep patterns in skill scripts
 * BSD grep (macOS) rejects -P and does not reliably support the GNU escapes.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT } from './helpers/bsd-grep-env';

const TREES = ['assets/skills', '.claude/skills', '.kiro/skills', 'plugins/agentic-qe-fleet/skills'];
const GREP_P = /\bgrep\b[^\n|;&]*?\s(?:-[A-Za-z]*P[A-Za-z]*\b|--perl-regexp\b)/;
const GREP_GNU_ESCAPE = /\bgrep\b[^\n|;&]*\\[sw+|]/;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const isScript = (file: string, text: string): boolean =>
  /\.(sh|bash)$/.test(file) || /^#!\s*\/(usr\/)?bin\/(env\s+)?(ba)?sh\b/.test(text);
const code = (lines: string[]): string[] => lines.filter((l) => !l.trim().startsWith('#'));

function offenders(): { grepP: string[]; gnuEscape: string[] } {
  const grepP: string[] = [];
  const gnuEscape: string[] = [];
  for (const tree of TREES) {
    for (const file of walk(join(ROOT, tree))) {
      const rel = relative(ROOT, file);
      const text = readFileSync(file, 'utf8');
      if (isScript(file, text)) {
        for (const line of code(text.split('\n'))) {
          if (GREP_P.test(line)) grepP.push(`${rel}: ${line.trim()}`);
          if (GREP_GNU_ESCAPE.test(line)) gnuEscape.push(`${rel}: ${line.trim()}`);
        }
      } else if (file.endsWith('.md')) {
        for (const m of text.matchAll(/```(?:bash|sh|shell|zsh|console)\n([\s\S]*?)```/g)) {
          for (const line of code(m[1].split('\n'))) if (GREP_P.test(line)) grepP.push(`${rel}: ${line.trim()}`);
        }
      }
    }
  }
  return { grepP, gnuEscape };
}

describe('#1470 guard: GNU-only grep in shipped skill commands', () => {
  it('recognises the forms that shipped before #1470', () => {
    expect(GREP_P.test('if echo "$C" | grep -qP "$pattern"; then')).toBe(true);
    expect(GREP_P.test("npm run x 2>&1 | grep -oP '\\d+'")).toBe(true);
    expect(GREP_P.test('grep --perl-regexp foo')).toBe(true);
    expect(GREP_P.test('grep -Eq -- "$pattern"')).toBe(false);
    expect(GREP_GNU_ESCAPE.test('grep -q "^\\s*}"')).toBe(true);
    expect(GREP_GNU_ESCAPE.test('grep -r "new\\s\\+\\w\\+("')).toBe(true);
    expect(GREP_GNU_ESCAPE.test('grep -r "TODO\\|FIXME"')).toBe(true);
    expect(GREP_GNU_ESCAPE.test('grep -rE "global\\.|window\\."')).toBe(false);
    expect(GREP_GNU_ESCAPE.test("printf '%s\\n' \"$X\" | grep -Eq -- \"$p\"")).toBe(false);
  });

  it('finds no grep -P in skill scripts or fenced shell blocks', () => {
    expect(offenders().grepP).toEqual([]);
  });

  it('finds no GNU BRE escapes (\\s \\w \\+ \\|) in grep patterns in skill scripts', () => {
    expect(offenders().gnuEscape).toEqual([]);
  });
});
