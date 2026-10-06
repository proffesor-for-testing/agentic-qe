import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';
import { CodeMetricsAnalyzer } from '../../../../src/shared/metrics/code-metrics';

let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(process.cwd(), 'aqe-metrics-')); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

const examples = [
  ['straight-line', 'export function choose(x: number) { return x; }', 1],
  ['single-if', 'export function choose(x: number) { if (x > 0) { return 1; } return 0; }', 2],
  ['else-if', 'export function choose(x: number) { if (x > 0) { return 1; } else if (x < 0) { return -1; } return 0; }', 3],
  ['longer-ladder', 'export function choose(x: number) { if (x > 1) { return 1; } else if (x === 1) { return 2; } else if (x < 0) { return -1; } return 0; }', 4],
  ['independent-ifs', 'export function choose(x: number) { if (x > 0) { return 1; } if (x < 0) { return -1; } return 0; }', 3],
] as const;

describe('cyclomatic complexity for if ladders', () => {
  it.each(examples)('counts each decision once in %s', async (name, source, expected) => {
    const filename = join(directory, `${name}.ts`);
    await writeFile(filename, source);
    const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
    let decisions = 0;
    const visit = (node: ts.Node) => {
      if (ts.isIfStatement(node)) decisions++;
      ts.forEachChild(node, visit);
    };
    visit(ast);
    expect(decisions + 1).toBe(expected);
    const metrics = await new CodeMetricsAnalyzer().analyzeFile(filename);
    expect(metrics?.functionCount).toBe(1);
    expect(metrics?.cyclomaticComplexity).toBe(expected);
  });
});
