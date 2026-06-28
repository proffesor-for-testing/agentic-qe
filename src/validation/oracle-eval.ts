/**
 * Agentic QE v3 - Oracle Evaluator for skill evals (Oracle-Evals plan, Phase 0/1)
 *
 * Turns a skill eval from a keyword grep into a real ORACLE: it RUNS a
 * generated test against a reference implementation (must pass) and against
 * first-order operator mutants of that implementation (each surviving mutant
 * is a bug the test failed to catch). The mutation kill rate is the eval's
 * pass signal — a test that asserts nothing scores 0 and fails.
 *
 * Reuses the proven qe-arena primitives (ADR-104): the deterministic operator
 * mutator and the real `node --test` fixture runner. Nothing is simulated.
 */

import * as fs from 'fs';
import * as path from 'path';
import { enumerateMutants, applyMutant } from '../arena/mutator.js';
import { runNodeTest, makeTmpRoot, cleanupTmpRoot } from '../arena/runner.js';

export interface OracleSpec {
  /** Base name (no extension) for the module under test, e.g. "inRange". */
  moduleName: string;
  /** ESM source of the correct implementation, e.g. `export function inRange(...) {...}`. */
  referenceImpl: string;
  /** Generated test source. Imports the impl as `../src/<moduleName>.mjs`. */
  generatedTest: string;
  /** Cap on mutants evaluated (deterministic prefix of the position-sorted list). */
  maxMutants?: number;
  /** Minimum mutation kill rate required to pass. Default 0.5. */
  threshold?: number;
  /** Per-`node --test` timeout in ms. Default 30s (evals run many subprocesses). */
  timeoutMs?: number;
}

export interface OracleResult {
  /** Did the generated test pass against the unmutated reference implementation? */
  baselinePassed: boolean;
  mutantsTotal: number;
  mutantsKilled: number;
  /** killed / total, rounded to 4dp (0 when there are no mutants). */
  mutationScore: number;
  /** Mutant ids the test failed to catch (bugs it would let through). */
  survivedMutantIds: string[];
  /** baselinePassed AND mutationScore >= threshold AND at least one mutant existed. */
  passed: boolean;
  /** Human-readable explanation of the verdict. */
  reason: string;
}

/** Write a throwaway { src/<m>.mjs, tests/<m>.test.mjs } workspace and return its dir. */
function materialize(tmpRoot: string, moduleName: string, impl: string, test: string): string {
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'oracle-ws-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', `${moduleName}.mjs`), impl);
  fs.writeFileSync(path.join(dir, 'tests', `${moduleName}.test.mjs`), test);
  return dir;
}

/**
 * Evaluate a generated test as an oracle against a reference implementation.
 * Real `node --test` runs; deterministic mutant enumeration.
 */
export function evaluateOracle(spec: OracleSpec): OracleResult {
  const threshold = spec.threshold ?? 0.5;
  const timeoutMs = spec.timeoutMs ?? 30_000;
  const tmpRoot = makeTmpRoot();

  try {
    // 0. Sanity: reject output that is not a runnable, asserting test. An empty
    // or assertion-less file passes `node --test` (exit 0) but proves nothing —
    // catch it here so the verdict is honest rather than relying on a 0 kill rate.
    if (!/assert\s*[.(]|expect\s*\(|\.(toBe|toEqual|toThrow|toMatch)\b/.test(spec.generatedTest)) {
      return {
        baselinePassed: false,
        mutantsTotal: 0,
        mutantsKilled: 0,
        mutationScore: 0,
        survivedMutantIds: [],
        passed: false,
        reason: 'generated output contains no assertions — not a runnable test',
      };
    }

    // 1. Baseline: the test must pass against the correct implementation.
    const baselineDir = materialize(tmpRoot, spec.moduleName, spec.referenceImpl, spec.generatedTest);
    const baseline = runNodeTest(baselineDir, { timeoutMs });
    if (!baseline.ok) {
      return {
        baselinePassed: false,
        mutantsTotal: 0,
        mutantsKilled: 0,
        mutationScore: 0,
        survivedMutantIds: [],
        passed: false,
        reason: 'generated test does not pass against the reference implementation',
      };
    }

    // 2. Mutants: each one the test fails to fail-on is a missed bug.
    let mutants = enumerateMutants(spec.referenceImpl, spec.moduleName);
    if (spec.maxMutants !== undefined && mutants.length > spec.maxMutants) {
      mutants = mutants.slice(0, spec.maxMutants);
    }
    if (mutants.length === 0) {
      return {
        baselinePassed: true,
        mutantsTotal: 0,
        mutantsKilled: 0,
        mutationScore: 0,
        survivedMutantIds: [],
        passed: false,
        reason: 'no operator mutants could be generated for the reference implementation (cannot prove the test catches anything)',
      };
    }

    let killed = 0;
    const survived: string[] = [];
    for (const mutant of mutants) {
      const dir = materialize(
        tmpRoot,
        spec.moduleName,
        applyMutant(spec.referenceImpl, mutant),
        spec.generatedTest,
      );
      const run = runNodeTest(dir, { timeoutMs });
      if (!run.ok) killed++;
      else survived.push(mutant.id);
    }

    const total = mutants.length;
    const score = Math.round((killed / total) * 10000) / 10000;
    const passed = score >= threshold;
    return {
      baselinePassed: true,
      mutantsTotal: total,
      mutantsKilled: killed,
      mutationScore: score,
      survivedMutantIds: survived,
      passed,
      reason: passed
        ? `killed ${killed}/${total} mutants (score ${(score * 100).toFixed(0)}%)`
        : `mutation score ${(score * 100).toFixed(0)}% < threshold ${(threshold * 100).toFixed(0)}% — ${survived.length} mutant(s) survived`,
    };
  } finally {
    cleanupTmpRoot(tmpRoot);
  }
}
