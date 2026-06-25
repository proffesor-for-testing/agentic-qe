/**
 * Darwin ScoreCard version contract (plan 05 / A8).
 *
 * AQE mirrors `@metaharness/darwin`'s `ScoreCard` locally (zero-coupling) instead
 * of importing the fast-moving pre-1.0 package. This guards the contract: if the
 * mirror's field set drifts, this fails — forcing a re-verification against
 * upstream before the change ships. The pinned set was confirmed identical to
 * upstream ScoreCard @ 0.2.1–0.7.0 on 2026-06-25.
 */
import { describe, it, expect } from 'vitest';
import type { DarwinScoreCard } from '../../../src/integrations/darwin/types.js';

// The agreed contract: upstream @metaharness/darwin ScoreCard fields (0.2.1–0.7.0).
const SCORECARD_CONTRACT = [
  'variantId',
  // positive weighted terms
  'taskSuccess', 'testPassRate', 'traceQuality', 'costEfficiency', 'latencyEfficiency', 'safetyScore',
  // hard penalties
  'secretExposure', 'destructiveAction', 'hallucinatedFile', 'toolLoop', 'costOverrun',
  // result
  'baseScore', 'finalScore', 'promoted', 'reason',
].sort();

describe('Darwin ScoreCard — version contract (A8)', () => {
  it('should expose exactly the upstream ScoreCard field set (no drift)', () => {
    // A fully-populated mirror instance — TS enforces the type; we assert the keys.
    const card: DarwinScoreCard = {
      variantId: 'v1',
      taskSuccess: 1, testPassRate: 1, traceQuality: 1, costEfficiency: 1, latencyEfficiency: 1, safetyScore: 1,
      secretExposure: 0, destructiveAction: 0, hallucinatedFile: 0, toolLoop: 0, costOverrun: 0,
      baseScore: 0.9, finalScore: 0.9, promoted: true, reason: 'ok',
    };
    expect(Object.keys(card).sort()).toEqual(SCORECARD_CONTRACT);
  });

  it('should keep the contract at 16 fields (6 terms + 5 penalties + 5 meta/result)', () => {
    expect(SCORECARD_CONTRACT).toHaveLength(16);
  });
});
