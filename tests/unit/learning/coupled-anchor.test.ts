/**
 * ADR-118 coupled anchor: retrieval → test-gen → anchor makes the anchor MOVE.
 *
 * The core claim: `anchorMean` now varies with the retrieval policy. A policy
 * that retrieves a helpful example yields a stronger generated test (kills all
 * mutants → 1.0); one that doesn't yields a weak test (misses mutants → < 1.0).
 * Uses a temp single-item frozen anchor + real evaluateOracle (subprocess).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createCoupledAnchorScorer,
  type RetrieveFn,
  type TestGenerator,
} from '../../../src/learning/qe-flywheel/coupled-anchor.js';
import { computeContentHash, type AnchorItem } from '../../../src/validation/anchor-set.js';
import { DEFAULT_POLICY } from '../../../src/learning/qe-flywheel/policy.js';

// A strong inRange test kills all 3 operator mutants; the weak one only checks
// the happy path and kills none.
const STRONG = `import assert from 'node:assert';
import { test } from 'node:test';
import { inRange } from '../src/inRange.mjs';
test('inside', () => assert.equal(inRange(5,1,10), true));
test('low boundary', () => assert.equal(inRange(1,1,10), true));
test('high boundary', () => assert.equal(inRange(10,1,10), true));
test('below', () => assert.equal(inRange(0,1,10), false));`;
const WEAK = `import assert from 'node:assert';
import { test } from 'node:test';
import { inRange } from '../src/inRange.mjs';
test('happy only', () => assert.equal(inRange(5,1,10), true));`;

const ITEM: AnchorItem = {
  id: 'X-inRange', moduleName: 'inRange',
  inputUnderTest: 'Generate a test for inRange(x, lo, hi).',
  referenceImpl: 'export function inRange(x, lo, hi) { return x >= lo && x <= hi; }',
  requirements: ['inside', 'low boundary', 'high boundary', 'outside'],
  expectedMutants: 3,
};

// Fake retriever: a body-favoring policy (bodyWeight >= 1) surfaces the helpful
// example; a body-starved one (bodyWeight < 1) retrieves nothing useful.
const retrieve: RetrieveFn = (_q, policy) =>
  policy.bodyWeight >= 1 ? [{ id: 'good', name: 'boundary-example', body: 'covers boundaries' }] : [];

// Fake generator: strong test iff a helpful example was retrieved.
const generate: TestGenerator = (_input, examples) =>
  examples.some((e) => e.name.includes('boundary')) ? STRONG : WEAK;

describe('createCoupledAnchorScorer — the anchor moves with the policy', () => {
  let dir: string;
  let anchorPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'coupled-'));
    anchorPath = join(dir, 'anchor.json');
    const items = [ITEM];
    writeFileSync(anchorPath, JSON.stringify({
      schemaVersion: 1,
      passBar: { mutationThreshold: 0.8, checklistCoverage: 1.0 },
      anchorTol: 0.0,
      contentHash: computeContentHash(items),
      items,
    }));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('should_score_higher_when_the_policy_retrieves_a_helpful_example', async () => {
    const score = createCoupledAnchorScorer({ anchorPath, retrieve, generate });
    const good = await score({ ...DEFAULT_POLICY, bodyWeight: 1.5 }); // retrieves helper → strong test
    const bad = await score({ ...DEFAULT_POLICY, bodyWeight: 0.5 });  // no helper → weak test
    expect(good).toBeGreaterThan(bad);       // THE ANCHOR MOVED
    expect(good).toBe(1);                    // strong test kills all 3 mutants
    expect(bad).toBeLessThan(1);             // weak test misses mutants
  }, 30000);
});
