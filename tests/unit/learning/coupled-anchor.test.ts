/**
 * ADR-118 coupled anchor — MECHANISM test (scripted generator, NOT real-model evidence).
 *
 * WHAT THIS PROVES: the WIRING propagates end-to-end —
 *   retrieve(policy) → examples → generate(examples) → evaluateOracle → anchorMean.
 * When the injected generator produces a stronger test given a helpful retrieved
 * example, the real oracle (subprocess mutation run) scores it higher and the
 * anchor mean moves. That is a real check of the plumbing and of the oracle.
 *
 * WHAT THIS DOES NOT PROVE: that a REAL model actually writes better tests when
 * given retrieved examples. The `generate` below is a SCRIPTED fake that returns
 * the STRONG test iff a 'boundary' example was retrieved — it hardcodes the very
 * outcome the "anchor moves" story wants, so the causal link (retrieval → better
 * tests) is assumed here, not demonstrated. The live qwen coupled run was an
 * HONEST NULL: retrieval did not move the anchor for the real model (see the
 * coupling experiment / the DOE where retrieval landed in the "beads" — a lever
 * that added harness without improving reliability). Do not cite this test as
 * evidence that coupling helps; it only shows the seam is connected correctly.
 *
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

// SCRIPTED retriever: a body-favoring policy (bodyWeight >= 1) surfaces the
// helpful example; a body-starved one (bodyWeight < 1) retrieves nothing useful.
const retrieve: RetrieveFn = (_q, policy) =>
  policy.bodyWeight >= 1 ? [{ id: 'good', name: 'boundary-example', body: 'covers boundaries' }] : [];

// SCRIPTED generator: hardcodes the outcome under test — returns the STRONG test
// iff a 'boundary' example was retrieved. This ASSUMES retrieval → better tests
// (it does not demonstrate it); a real model showed no such effect (honest null).
const generate: TestGenerator = (_input, examples) =>
  examples.some((e) => e.name.includes('boundary')) ? STRONG : WEAK;

describe('createCoupledAnchorScorer — MECHANISM (scripted generator, NOT real-model evidence)', () => {
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

  it('should_propagate_retrieval_through_generation_to_the_oracle_score_when_the_generator_is_scripted', async () => {
    // The SCRIPTED generator (not a model) decides strong-vs-weak from the
    // retrieved example, so this asserts the SEAM carries that decision into a
    // real oracle score — it is NOT evidence that retrieval helps a real model.
    const score = createCoupledAnchorScorer({ anchorPath, retrieve, generate });
    const good = await score({ ...DEFAULT_POLICY, bodyWeight: 1.5 }); // scripted → strong test
    const bad = await score({ ...DEFAULT_POLICY, bodyWeight: 0.5 });  // scripted → weak test
    expect(good).toBeGreaterThan(bad);       // the wiring carried the scripted difference through
    expect(good).toBe(1);                    // strong test kills all 3 mutants (real oracle)
    expect(bad).toBeLessThan(1);             // weak test misses mutants (real oracle)
  }, 30000);

  // The ONLY test that would be genuine evidence that coupling helps: a REAL
  // model-backed generator (not the scripted fake above) writing tests from
  // policy-retrieved examples, end to end into the real oracle. SKIPPED by
  // default — it needs a live model (no model / no network in CI), and as of the
  // last live qwen coupled run it was an HONEST NULL: retrieval did NOT move the
  // anchor (the effect the mechanism test only ASSUMES). Enable with
  // AQE_LIVE_COUPLING=1 AND a real TestGenerator injected below. Do NOT weaken
  // the assertion to make it pass on the scripted fake — flip it to `it` only
  // when a real model demonstrably benefits from retrieval.
  const runLive = process.env.AQE_LIVE_COUPLING === '1';
  (runLive ? it : it.skip)(
    'should_show_a_REAL_model_writes_stronger_tests_from_retrieved_examples__HONEST_NULL_needs_live_model',
    async () => {
      // Replace with a real model-backed generator (e.g. an LLM test-gen client).
      // Left unimplemented on purpose: the experiment fails LOUDLY rather than
      // fabricating a pass if enabled without a model. The mechanism test does the
      // wiring proof; this slot is reserved for real-model evidence.
      const realGenerate: TestGenerator = async () => {
        throw new Error(
          'AQE_LIVE_COUPLING=1 but no real model-backed TestGenerator was injected — ' +
          'this is the real-model coupling experiment (last live qwen run: honest null).',
        );
      };
      const score = createCoupledAnchorScorer({ anchorPath, retrieve, generate: realGenerate });
      const withRetrieval = await score({ ...DEFAULT_POLICY, bodyWeight: 1.5 });
      const withoutRetrieval = await score({ ...DEFAULT_POLICY, bodyWeight: 0.5 });
      // The causal claim the mechanism test assumes but cannot prove. Observed to
      // NOT hold for a real qwen generator — hence this test stays skipped.
      expect(withRetrieval).toBeGreaterThan(withoutRetrieval);
    },
    120000,
  );
});
