/**
 * #1020: the static analyzer reports a metric as measured only when the file
 * was parsed. A regex estimate (non-TS/JS files) is not a measurement, the
 * whole TS/JS family (.mts/.cts/.mjs/.cjs) is parsed, and a UTF-16 file is a
 * gap in the scope rather than "binary".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodeMetricsAnalyzer } from '../../../../src/shared/metrics/code-metrics';
import { TypeScriptParser } from '../../../../src/shared/parsers/typescript-parser';

const TS_SOURCE = `export function pick(a: number, b: number): number {
  if (a > b) {
    return a;
  }
  return b;
}
`;
const JS_SOURCE = `export function pick(a, b) {
  if (a > b) {
    return a;
  }
  return b;
}
`;
const PY_SOURCE = `def classify(n):
    if n < 0:
        return "neg"
    elif n == 0:
        return "zero"
    return "pos"
`;

describe('CodeMetricsAnalyzer evidence (#1020)', () => {
  let dir: string;
  let analyzer: CodeMetricsAnalyzer;

  const write = (rel: string, content: string | Buffer) => {
    const file = join(dir, rel);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, content);
    return file;
  };

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1020-metrics-')));
    vi.stubEnv('AQE_PROJECT_ROOT', dir);
    analyzer = new CodeMetricsAnalyzer();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it('does not report a regex estimate for a Python file as measured', async () => {
    const outcome = await analyzer.analyzeFileDetailed(write('src/app.py', PY_SOURCE));

    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toMatch(/not parsed.*regex estimate/i);
  });

  it.each([
    ['.mts', TS_SOURCE],
    ['.cts', TS_SOURCE],
    ['.mjs', JS_SOURCE],
    ['.cjs', JS_SOURCE],
  ])('parses a %s file and measures it', async (ext, content) => {
    const outcome = await analyzer.analyzeFileDetailed(write(`src/mod${ext}`, content));

    expect(outcome.status).toBe('measured');
    expect(outcome.metrics?.functionCount).toBe(1);
    expect(outcome.metrics?.cyclomaticComplexity).toBe(2);
  });

  it('fails an .mts file with syntax errors instead of estimating it', async () => {
    const outcome = await analyzer.analyzeFileDetailed(write('src/broken.mts', 'export function broken(a: number {\n  return a +;\n}\n'));

    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toMatch(/syntax error/i);
  });

  it('reports a UTF-16 TypeScript file as a failed read, not as binary content', async () => {
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(TS_SOURCE, 'utf16le')]);
    const outcome = await analyzer.analyzeFileDetailed(write('src/wide.ts', utf16));

    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toMatch(/UTF-16/);
  });
});

describe('TypeScriptParser.countSyntaxErrors (#1020)', () => {
  const parser = new TypeScriptParser();

  it('counts no errors for valid TypeScript', () => {
    expect(parser.countSyntaxErrors(parser.parseFile('ok.ts', TS_SOURCE))).toBe(0);
  });

  it('counts the syntax errors of broken TypeScript', () => {
    expect(parser.countSyntaxErrors(parser.parseFile('bad.ts', 'export function ( {{{ ]]]\n'))).toBeGreaterThan(0);
  });

  it('counts TypeScript-only syntax in a JavaScript module as an error', () => {
    expect(parser.countSyntaxErrors(parser.parseFile('typed.mjs', TS_SOURCE))).toBeGreaterThan(0);
  });
});
