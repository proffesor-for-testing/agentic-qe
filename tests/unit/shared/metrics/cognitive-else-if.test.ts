/**
 * Issue #907: cognitive complexity must follow the SonarSource rules.
 * - `if`, loops, `switch`, `catch`: +1 plus the current nesting level
 * - `else if` and `else`: +1 flat, no nesting bonus, and `else if` is not also an `if`
 * - only those structures nest; a function body or try block does not
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { CodeMetricsAnalyzer } from '../../../../src/shared/metrics/code-metrics';

let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(process.cwd(), 'aqe-cognitive-')); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

const examples: ReadonlyArray<readonly [string, number, string]> = [
  ['if / else if / else', 3, `export function sign(x: number) {
  if (x > 0) {
    return 1;
  } else if (x < 0) {
    return -1;
  } else {
    return 0;
  }
}`],
  ['longer ladder', 4, `export function bucket(x: number) {
  if (x > 10) {
    return 'xl';
  } else if (x > 5) {
    return 'l';
  } else if (x > 0) {
    return 'm';
  } else {
    return 's';
  }
}`],
  ['ladder does not leak nesting into the next if', 4, `export function grade(x: number, loud: boolean) {
  let g = 'c';
  if (x > 90) {
    g = 'a';
  } else if (x > 80) {
    g = 'b';
  } else {
    g = 'c';
  }
  if (loud) {
    g += '!';
  }
  return g;
}`],
  ['nested loops and if', 6, `export function countPositive(m: number[][]) {
  let s = 0;
  for (let i = 0; i < m.length; i++) {
    for (let j = 0; j < m[i].length; j++) {
      if (m[i][j] > 0) {
        s++;
      }
    }
  }
  return s;
}`],
  ['else-if chain inside a loop', 5, `export function classify(xs: number[]) {
  const out: string[] = [];
  for (const x of xs) {
    if (x > 0) {
      out.push('p');
    } else if (x < 0) {
      out.push('n');
    } else {
      out.push('z');
    }
  }
  return out;
}`],
  ['switch', 1, `export function getWords(n: number) {
  switch (n) {
    case 1:
      return 'one';
    case 2:
      return 'a couple';
    default:
      return 'lots';
  }
}`],
  ['switch nested in a loop', 3, `export function words(ns: number[]) {
  const out: string[] = [];
  while (ns.length) {
    switch (ns.pop()) {
      case 1:
        out.push('one');
        break;
      default:
        out.push('many');
    }
  }
  return out;
}`],
  ['catch with nested if', 3, `export function parse(s: string) {
  try {
    return JSON.parse(s);
  } catch (e) {
    if (s === '') {
      return null;
    }
    throw e;
  }
}`],
  ['multi-line condition still nests its body', 4, `export function both(a: boolean, b: boolean, xs: number[]) {
  if (a &&
      b) {
    for (const x of xs) {
      void x;
    }
  }
}`],
  ['brace-less if does not make the next block nest', 2, `export function guard(x: number) {
  if (x > 0) return 1;
  try {
    if (x < 0) {
      return 2;
    }
  } finally {
    x = 0;
  }
  return 3;
}`],
  ['single-line else-if', 2,
    'export function choose(x: number) { if (x > 0) { return 1; } else if (x < 0) { return -1; } return 0; }'],
];

describe('cognitive complexity (SonarSource rules, issue #907)', () => {
  it.each(examples)('scores %s as %i', async (name, expected, source) => {
    const filename = join(directory, `${name.replace(/\W+/g, '-')}.ts`);
    await writeFile(filename, source);
    // Relative path keeps FileReader's system-path guard out of the way for checkouts under /home/<user>/.<dir>.
    const metrics = await new CodeMetricsAnalyzer().analyzeFile(relative(process.cwd(), filename));
    expect(metrics?.functionCount).toBe(1);
    expect(metrics?.cognitiveComplexity).toBe(expected);
  });
});
