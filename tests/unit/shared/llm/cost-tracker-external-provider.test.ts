import { describe, expect, it } from 'vitest';
import { CostTracker } from '../../../../src/shared/llm/cost-tracker';

const usage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };

describe('external provider cost summaries', () => {
  it('accumulates repeated charges under the external provider identity', () => {
    const tracker = new CostTracker();
    const first = tracker.recordUsage('owned-local-host', 'gpt-4o', usage, 'first');
    const second = tracker.recordUsage('owned-local-host', 'gpt-4o', usage, 'second');
    const summary = tracker.getSummary('all');
    expect(summary.byProvider['owned-local-host']).toBe(first.totalCost + second.totalCost);
    expect(summary.byProvider['owned-local-host']).toBe(summary.totalCost);
    expect(summary.totalRequests).toBe(2);
  });

  it('keeps distinct external and built-in providers in separate buckets', () => {
    const tracker = new CostTracker();
    const external = tracker.recordUsage('first-host', 'gpt-4o', usage, 'first');
    const other = tracker.recordUsage('second-host', 'gpt-4o', usage, 'second');
    const builtin = tracker.recordUsage('openai', 'gpt-4o', usage, 'third');
    const summary = tracker.getSummary('all');
    expect(summary.byProvider['first-host']).toBe(external.totalCost);
    expect(summary.byProvider['second-host']).toBe(other.totalCost);
    expect(summary.byProvider.openai).toBe(builtin.totalCost);
    expect(summary.byProvider.claude).toBe(0);
    expect(Object.values(summary.byProvider).reduce((sum, value) => sum + value, 0)).toBe(summary.totalCost);
  });

  it('treats an accepted constructor provider name as an owned numeric bucket', () => {
    const tracker = new CostTracker();
    const first = tracker.recordUsage('constructor', 'gpt-4o', usage, 'first');
    const second = tracker.recordUsage('constructor', 'gpt-4o', usage, 'second');
    const summary = tracker.getSummary('all');
    expect(Object.hasOwn(summary.byProvider, 'constructor')).toBe(true);
    expect(summary.byProvider.constructor).toBe(first.totalCost + second.totalCost);
    expect(summary.byProvider.constructor).toBe(summary.totalCost);
  });

  it('reports zero cost rather than NaN for a local external model', () => {
    const tracker = new CostTracker();
    tracker.recordUsage('local-host', 'llama3.1', usage, 'free');
    const summary = tracker.getSummary('all');
    expect(summary.byProvider['local-host']).toBe(0);
    expect(summary.totalCost).toBe(0);
  });
});
