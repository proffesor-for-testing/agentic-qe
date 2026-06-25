/**
 * Cost-Pareto Value Score (A13). Pure quality-per-$ ranking + Pareto frontier.
 */
import { describe, it, expect } from 'vitest';
import {
  valueScore, rankByValue, paretoFrontier, MEASURED_QE_TEST_GEN, type ModelEconomics,
} from '../../../src/routing/value-score';

const free = { model: 'local', quality: 0.7, costPerInstance: 0 };
const frontier = { model: 'frontier', quality: 0.85, costPerInstance: 0.05 };
const dominated = { model: 'mid-bad', quality: 0.6, costPerInstance: 0.04 }; // worse than free on both

describe('valueScore', () => {
  it('should return pure quality when costWeight=0', () => {
    expect(valueScore(frontier, { costWeight: 0 })).toBeCloseTo(0.85);
  });

  it('should reward a $0 tier on the cost axis (perfect efficiency)', () => {
    // costWeight=1 → pure cost-efficiency; a $0 tier is 1.0, a costly one < 1.0.
    expect(valueScore(free, { costWeight: 1, costCap: 0.05 })).toBeCloseTo(1);
    expect(valueScore(frontier, { costWeight: 1, costCap: 0.05 })).toBeCloseTo(0);
  });

  it('should blend quality and cost-efficiency at the default slider', () => {
    const v = valueScore(frontier, { costWeight: 0.5, costCap: 0.05 });
    expect(v).toBeCloseTo(0.5 * 0.85 + 0.5 * 0); // high quality, zero cost-efficiency at cap
  });
});

describe('rankByValue', () => {
  it('should rank the free competitive tier above the costlier frontier when cost matters', () => {
    const ranked = rankByValue([frontier, free], { costWeight: 0.6 });
    expect(ranked[0].model).toBe('local'); // $0 + decent quality wins on value
    expect(ranked.every((r) => typeof r.value === 'number')).toBe(true);
  });

  it('should put the frontier first when only quality matters', () => {
    expect(rankByValue([free, frontier], { costWeight: 0 })[0].model).toBe('frontier');
  });
});

describe('paretoFrontier', () => {
  it('should drop a strictly dominated model', () => {
    const front = paretoFrontier([free, frontier, dominated]);
    expect(front.map((m) => m.model)).not.toContain('mid-bad'); // worse on both axes
    expect(front.map((m) => m.model)).toEqual(['local', 'frontier']); // cheapest → dearest
  });

  it('should keep both ends of a genuine cost/quality tradeoff', () => {
    const front = paretoFrontier([free, frontier]);
    expect(front).toHaveLength(2); // neither dominates the other
  });

  it('should treat the measured QE test-gen pool as a sensible frontier', () => {
    const front = paretoFrontier([...MEASURED_QE_TEST_GEN]);
    const models = front.map((m) => m.model);
    // qwen3:8b (0 quality, $0) is dominated by qwen3:30b-a3b (higher quality, also $0).
    expect(models).not.toContain('qwen3:8b');
    // the floor-clearing free tier and the frontier ceiling are both on the frontier.
    expect(models).toContain('qwen3:30b-a3b');
    expect(models).toContain('claude-sonnet-4-6');
  });
});
