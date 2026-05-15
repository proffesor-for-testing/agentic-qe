/**
 * ADR-095: ε-greedy exploration with Q-value blending and mincut safety gate.
 *
 * These tests cover the new helpers in `src/learning/agent-routing.ts`:
 *   - sigmoid Q-value normalization (via blendStaticAndQValue)
 *   - qWeight ramp from 0 (no visits) to MAX_Q_WEIGHT (saturated)
 *   - resolveExplorationRate priority (env > default) × mincut multiplier
 *   - applyExplorationPolicy swap semantics (uses crypto.randomInt)
 *   - deriveTaskType + buildRoutingStateKey contract with the Q-table writer
 *   - calculateAgentScores Q-blend integration
 *
 * The exploration tests use a deterministic seed-like pattern: they invoke
 * applyExplorationPolicy many times and assert the rate matches ε within
 * statistical tolerance, rather than asserting any specific draw.
 */

import { describe, it, expect } from 'vitest';
import {
  blendStaticAndQValue,
  resolveExplorationRate,
  applyExplorationPolicy,
  deriveTaskType,
  buildRoutingStateKey,
  deriveComplexityBucket,
  calculateAgentScores,
  MAX_Q_WEIGHT,
  QWEIGHT_RAMP_VISITS,
  type ScoredAgent,
  type RoutingWeights,
} from '../../../src/learning/agent-routing';

const WEIGHTS: RoutingWeights = { similarity: 1, performance: 1, capabilities: 1 };

describe('blendStaticAndQValue (#488 / ADR-095)', () => {
  it('returns static score unchanged when no Q-lookup is supplied', () => {
    const out = blendStaticAndQValue(0.6, undefined);
    expect(out.score).toBe(0.6);
    expect(out.qWeight).toBe(0);
    expect(out.qVisits).toBe(0);
  });

  it('returns static score unchanged when visits is 0 (Q-data not yet seeded)', () => {
    const out = blendStaticAndQValue(0.6, { qValue: 0.5, visits: 0 });
    expect(out.score).toBe(0.6);
    expect(out.qWeight).toBe(0);
  });

  it('qWeight ramps linearly from 0 to MAX_Q_WEIGHT over QWEIGHT_RAMP_VISITS', () => {
    // At half-ramp, qWeight should be MAX_Q_WEIGHT/2
    const halfRamp = Math.floor(QWEIGHT_RAMP_VISITS / 2);
    const out = blendStaticAndQValue(0.5, { qValue: 0, visits: halfRamp });
    expect(out.qWeight).toBeCloseTo(MAX_Q_WEIGHT / 2, 5);

    // Saturates at MAX_Q_WEIGHT no matter how many more visits
    const out2 = blendStaticAndQValue(0.5, { qValue: 0, visits: QWEIGHT_RAMP_VISITS * 5 });
    expect(out2.qWeight).toBeCloseTo(MAX_Q_WEIGHT, 5);
  });

  it('a neutral Q-value (0) contributes sigmoid(0) = 0.5 to the blend', () => {
    // staticScore=0.5, q_value=0, mature visits → qWeight=0.4
    // effective = 0.5 * 0.6 + 0.5 * 0.4 = 0.5 (no change since both are 0.5)
    const out = blendStaticAndQValue(0.5, { qValue: 0, visits: QWEIGHT_RAMP_VISITS });
    expect(out.score).toBeCloseTo(0.5, 5);
  });

  it('a strongly-positive Q-value pulls the score UP (toward 1)', () => {
    // staticScore=0.5, q_value=+3 → sigmoid(3) ≈ 0.953
    // effective = 0.5*0.6 + 0.953*0.4 = 0.3 + 0.381 = 0.681
    const out = blendStaticAndQValue(0.5, { qValue: 3, visits: QWEIGHT_RAMP_VISITS });
    expect(out.score).toBeGreaterThan(0.6);
    expect(out.score).toBeLessThan(0.7);
  });

  it('a strongly-negative Q-value pulls the score DOWN (toward 0)', () => {
    // staticScore=0.5, q_value=-3 → sigmoid(-3) ≈ 0.047
    // effective = 0.5*0.6 + 0.047*0.4 ≈ 0.319
    const out = blendStaticAndQValue(0.5, { qValue: -3, visits: QWEIGHT_RAMP_VISITS });
    expect(out.score).toBeGreaterThan(0.3);
    expect(out.score).toBeLessThan(0.4);
  });
});

describe('resolveExplorationRate (#488 / ADR-095)', () => {
  it('defaults to 0.05 when no env override and topology not critical', () => {
    const out = resolveExplorationRate({ envOverride: undefined, topologyCritical: false });
    expect(out.baseEpsilon).toBe(0.05);
    expect(out.safetyMultiplier).toBe(1.0);
    expect(out.epsilon).toBeCloseTo(0.05, 5);
  });

  it('dampens by 5x when topology is critical', () => {
    const out = resolveExplorationRate({ envOverride: undefined, topologyCritical: true });
    expect(out.safetyMultiplier).toBe(0.2);
    expect(out.epsilon).toBeCloseTo(0.05 * 0.2, 5);
  });

  it('honors env override over default', () => {
    const out = resolveExplorationRate({ envOverride: '0.10', topologyCritical: false });
    expect(out.baseEpsilon).toBe(0.10);
  });

  it('falls back to default for unparseable env values', () => {
    const out = resolveExplorationRate({ envOverride: 'not-a-number', topologyCritical: false });
    expect(out.baseEpsilon).toBe(0.05);
  });

  it('falls back to default for out-of-range env values', () => {
    const out1 = resolveExplorationRate({ envOverride: '-0.5', topologyCritical: false });
    expect(out1.baseEpsilon).toBe(0.05);
    const out2 = resolveExplorationRate({ envOverride: '1.5', topologyCritical: false });
    expect(out2.baseEpsilon).toBe(0.05);
  });

  it('env value of 0 means deterministic routing (rollback path)', () => {
    const out = resolveExplorationRate({ envOverride: '0', topologyCritical: false });
    expect(out.baseEpsilon).toBe(0);
    expect(out.epsilon).toBe(0);
  });

  it('result is clamped to [0, 1]', () => {
    const out = resolveExplorationRate({ envOverride: '0.5', topologyCritical: true });
    expect(out.epsilon).toBeGreaterThanOrEqual(0);
    expect(out.epsilon).toBeLessThanOrEqual(1);
  });
});

function makeAgents(): ScoredAgent[] {
  return [
    { agent: 'a-top',    score: 0.9, reasoning: ['top'] },
    { agent: 'b-second', score: 0.8, reasoning: ['second'] },
    { agent: 'c-third',  score: 0.7, reasoning: ['third'] },
    { agent: 'd-fourth', score: 0.6, reasoning: ['fourth'] },
  ];
}

describe('applyExplorationPolicy (#488 / ADR-095)', () => {
  it('no-op when epsilon is 0', () => {
    const agents = makeAgents();
    applyExplorationPolicy(agents, 0);
    expect(agents[0].agent).toBe('a-top');
    expect(agents[0].exploration).toBeUndefined();
  });

  it('no-op when only one agent exists', () => {
    const agents: ScoredAgent[] = [{ agent: 'solo', score: 0.5, reasoning: [] }];
    applyExplorationPolicy(agents, 1.0); // even at 100% there's no alternative to swap to
    expect(agents[0].agent).toBe('solo');
    expect(agents[0].exploration).toBeUndefined();
  });

  it('always explores when epsilon = 1 (sanity check)', () => {
    const agents = makeAgents();
    applyExplorationPolicy(agents, 1.0);
    // After exploration, top is one of b/c/d (not a-top)
    expect(agents[0].agent).not.toBe('a-top');
    expect(agents[0].exploration).toBe(true);
  });

  it('marks the promoted agent with exploration=true', () => {
    const agents = makeAgents();
    applyExplorationPolicy(agents, 1.0);
    expect(agents[0].exploration).toBe(true);
    expect(agents[0].reasoning).toContain('(exploration)');
  });

  it('observes the configured rate within statistical tolerance over many trials', () => {
    const trials = 2000;
    const epsilon = 0.10;
    let explorations = 0;
    for (let i = 0; i < trials; i++) {
      const agents = makeAgents();
      applyExplorationPolicy(agents, epsilon);
      if (agents[0].exploration) explorations++;
    }
    const observedRate = explorations / trials;
    // 99.9% CI for 10% rate over 2000 samples is roughly ±2.2% — use ±3% to allow CI flake margin
    expect(observedRate).toBeGreaterThan(0.07);
    expect(observedRate).toBeLessThan(0.13);
  });

  it('only ever picks from positions 1..3 (top-3 alternatives), never beyond', () => {
    const agents: ScoredAgent[] = [
      { agent: 'a', score: 1, reasoning: [] },
      { agent: 'b', score: 0.9, reasoning: [] },
      { agent: 'c', score: 0.8, reasoning: [] },
      { agent: 'd', score: 0.7, reasoning: [] },
      { agent: 'e', score: 0.6, reasoning: [] }, // position 4 — should NEVER be picked
      { agent: 'f', score: 0.5, reasoning: [] }, // position 5 — should NEVER be picked
    ];

    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const fresh = agents.map((a) => ({ ...a, reasoning: [...a.reasoning] }));
      applyExplorationPolicy(fresh, 1.0);
      seen.add(fresh[0].agent);
    }
    // After many forced explorations, the top position should be drawn from
    // {b, c, d} only (positions 1..3).
    expect(seen.has('e')).toBe(false);
    expect(seen.has('f')).toBe(false);
  });
});

describe('deriveTaskType', () => {
  it.each([
    ['generate tests for foo.ts', 'test-generation'],
    ['analyze coverage gaps', 'coverage-analysis'],
    ['quality audit', 'quality-assessment'],
    ['security vulnerability scan', 'security-compliance'],
    ['defect prediction', 'defect-intelligence'],
    ['validate requirement specs', 'requirements-validation'],
    ['refactor the routing module', 'refactoring'],
    ['run integration tests', 'test-execution'],
    ['something random', 'unknown'],
  ])('classifies "%s" as %s', (description, expected) => {
    expect(deriveTaskType(description)).toBe(expected);
  });
});

describe('buildRoutingStateKey', () => {
  it('produces the canonical Q-table state_key format', () => {
    const k = buildRoutingStateKey({
      taskType: 'test-generation',
      priority: 'normal',
      domain: 'coverage-analysis',
      complexityBucket: 3,
    });
    expect(k).toBe('test-generation|normal|coverage-analysis|3');
  });

  it('defaults priority to "normal" and domain to "any"', () => {
    const k = buildRoutingStateKey({ taskType: 'unknown', complexityBucket: 0 });
    expect(k).toBe('unknown|normal|any|0');
  });
});

describe('deriveComplexityBucket', () => {
  it('returns 0 for empty / short descriptions', () => {
    expect(deriveComplexityBucket('')).toBe(0);
    expect(deriveComplexityBucket('hi')).toBe(0);
  });

  it('returns 10 for descriptions at or beyond the 200-character cap', () => {
    expect(deriveComplexityBucket('x'.repeat(200))).toBe(10);
    expect(deriveComplexityBucket('x'.repeat(500))).toBe(10);
  });

  it('scales linearly between 0 and 10', () => {
    // length=100 → 100/200 = 0.5 → bucket 5
    expect(deriveComplexityBucket('x'.repeat(100))).toBe(5);
  });
});

describe('calculateAgentScores Q-blend integration', () => {
  it('produces identical results to no-lookup when qValueLookup returns undefined for every agent', () => {
    const patternCounts = new Map<string, number>();
    const without = calculateAgentScores(
      ['test-generation'],
      undefined,
      patternCounts,
      WEIGHTS,
    );
    const with_ = calculateAgentScores(
      ['test-generation'],
      undefined,
      patternCounts,
      WEIGHTS,
      undefined,
      undefined,
      () => undefined, // no Q-data for any agent
    );
    // Same agent ordering
    expect(with_.map((a) => a.agent)).toEqual(without.map((a) => a.agent));
    // qWeight is 0 across the board
    for (const a of with_) {
      expect(a.qWeight).toBe(0);
    }
  });

  it('moves an agent up the ordering when its Q-value is strongly positive', () => {
    // Force qe-coverage-analyzer to have a very positive Q-value for this state.
    // Without Q-bonus it would not be first for a test-generation task.
    const patternCounts = new Map<string, number>();
    const baseline = calculateAgentScores(
      ['test-generation'],
      undefined,
      patternCounts,
      WEIGHTS,
    );
    const baselinePos = baseline.findIndex((a) => a.agent === 'qe-coverage-analyzer');

    const withQ = calculateAgentScores(
      ['test-generation'],
      undefined,
      patternCounts,
      WEIGHTS,
      undefined,
      undefined,
      (agentType) =>
        agentType === 'qe-coverage-analyzer'
          ? { qValue: 5, visits: QWEIGHT_RAMP_VISITS * 2 } // mature, strong-positive
          : undefined,
    );
    const newPos = withQ.findIndex((a) => a.agent === 'qe-coverage-analyzer');

    // Q-blend should push it strictly upward (lower index) or keep it at the top.
    expect(newPos).toBeLessThanOrEqual(baselinePos);
    // And the qWeight + qValue are recorded for telemetry.
    const cov = withQ.find((a) => a.agent === 'qe-coverage-analyzer')!;
    expect(cov.qWeight).toBeGreaterThan(0);
    expect(cov.qValue).toBe(5);
  });
});
