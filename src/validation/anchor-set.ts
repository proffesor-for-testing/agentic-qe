/**
 * Frozen oracle-grade QE anchor set (ADR-117).
 *
 * A small, human-labeled, content-hash-pinned, constant-denominator eval set
 * that promotion gates (ADR-118 accept(), ADR-120 re-executed gates) must
 * evaluate and never regress against. The loader recomputes the content hash on
 * load and THROWS on drift — a frozen anchor the optimizer can silently edit is
 * not frozen. Mirrors ruflo `harness-frozen-eval` + retort's constant-denominator
 * `REQUIREMENTS.json`.
 *
 * Each item is a test-generation task graded by the ADR-113 oracle
 * (`evaluateOracle`): the policy produces a test for `referenceImpl`, and the
 * mutation kill rate is the score. `requirements` is the pinned checklist (the
 * constant denominator) the ADR-119 judge grades against.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';

export interface AnchorItem {
  /** Stable item id (e.g. "A1-inRange"). */
  id: string;
  /** Human-readable spec the test-gen policy is asked to produce a test for. */
  inputUnderTest: string;
  /** Base module name (no extension) for the reference impl. */
  moduleName: string;
  /** ESM source of the correct implementation. */
  referenceImpl: string;
  /** Pinned checklist of requirements — the CONSTANT denominator (frozen count). */
  requirements: string[];
  /** Ground-truth mutant count a correct test must kill (measured via the oracle at freeze time). */
  expectedMutants: number;
}

export interface AnchorPassBar {
  /** Minimum mutation kill rate for an item to pass (ADR-117 "High" bar = 0.8). */
  mutationThreshold: number;
  /** Required checklist coverage for the ADR-119 judge (pass only at 1.0). */
  checklistCoverage: number;
}

export interface AnchorSet {
  schemaVersion: number;
  /** The frozen quality bar. */
  passBar: AnchorPassBar;
  /** No-regression tolerance: a promotion may not drop the anchor mean by more than this. */
  anchorTol: number;
  /** SHA-256 over the canonicalized items — recomputed and checked on load. */
  contentHash: string;
  items: AnchorItem[];
}

/**
 * Deterministic canonical form of the items for hashing: items sorted by id,
 * object keys sorted, no incidental whitespace. Independent of file formatting
 * and key order so a semantically-identical file hashes identically.
 */
export function canonicalizeItems(items: AnchorItem[]): string {
  const norm = [...items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((it) => ({
      id: it.id,
      inputUnderTest: it.inputUnderTest,
      moduleName: it.moduleName,
      referenceImpl: it.referenceImpl,
      requirements: it.requirements,
      expectedMutants: it.expectedMutants,
    }));
  return JSON.stringify(norm);
}

/** SHA-256 content hash over the canonicalized items. */
export function computeContentHash(items: AnchorItem[]): string {
  return createHash('sha256').update(canonicalizeItems(items)).digest('hex');
}

/**
 * Load a frozen anchor set, refusing to return if the recorded hash does not
 * match the recomputed one (ADR-117 §2). No promotion path may read the anchor
 * except through this loader.
 */
export function loadAnchorSet(path: string): AnchorSet {
  const raw = JSON.parse(fs.readFileSync(path, 'utf8')) as AnchorSet;
  const recomputed = computeContentHash(raw.items);
  if (recomputed !== raw.contentHash) {
    throw new Error(
      `Anchor set hash drift at ${path}: recorded ${raw.contentHash}, `
      + `recomputed ${recomputed}. Refusing to load a mutated frozen anchor (ADR-117). `
      + `A legitimate change must be a versioned re-freeze (qe-anchor-v2), never an in-place edit.`,
    );
  }
  if (raw.items.length === 0) {
    throw new Error(`Anchor set at ${path} has no items — a frozen anchor must be non-empty.`);
  }
  return raw;
}

/** The score of one anchor item = its oracle mutation kill rate. */
export function anchorItemScore(oracleResult: { mutationScore: number }): number {
  return oracleResult.mutationScore;
}

/**
 * The anchor mean: Σ score / N with N constant (the constant-denominator
 * property — comparable across runs and generations).
 */
export function anchorMean(scores: number[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * No-regression contract (ADR-117 §4, ADR-118 accept(), ADR-120 re-exec).
 * A candidate policy may not drop the anchor mean below baseline − tol.
 */
export function meetsNoRegression(
  candidateMean: number,
  baselineMean: number,
  tol: number,
): boolean {
  return candidateMean >= baselineMean - tol;
}
