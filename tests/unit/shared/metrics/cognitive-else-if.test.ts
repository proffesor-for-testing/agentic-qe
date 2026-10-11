import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CodeMetricsAnalyzer } from '../../../../src/shared/metrics/code-metrics';

let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(process.cwd(), 'aqe-cognitive-')); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

const examples = [
  ['straight-line', ['return x;'], 0],
  ['single-if', ['if (x > 0) {', 'return 1;', '}', 'return 0;'], 2],
  ['ordinary-else', ['if (x > 0) {', 'return 1;', '} else {', 'return 0;', '}'], 3],
  ['else-if', ['if (x > 0) {', 'return 1;', '} else if (x < 0) {', 'return -1;', '} else {', 'return 0;', '}'], 7],
  ['longer-ladder', ['if (x > 1) {', 'return 1;', '} else if (x === 1) {', 'return 2;', '} else if (x < 0) {', 'return -1;', '} else {', 'return 0;', '}'], 11],
  ['nested-if', ['if (x > 0) {', 'if (x > 1) {', 'return 1;', '}', '}', 'return 0;'], 6],
] as const;

describe('cognitive complexity for else-if ladders', () => {
  it.each(examples)('preserves the heuristic score for %s', async (name, body, expected) => {
    const filename = join(directory, `${name}.ts`);
    await writeFile(filename, ['export function choose(x: number) {', ...body, '}'].join('\n'));
    const metrics = await new CodeMetricsAnalyzer().analyzeFile(filename);
    expect(metrics?.functionCount).toBe(1);
    expect(metrics?.cognitiveComplexity).toBe(expected);
  });
});
