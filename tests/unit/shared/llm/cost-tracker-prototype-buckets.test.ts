import { describe, expect, it } from 'vitest';
import { CostTracker } from '../../../../src/shared/llm/cost-tracker';

const usage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };

describe('cost tracker treats caller identities as dictionary keys', () => {
  it.each(['constructor', 'toString', '__proto__'])('prices and totals unknown model %s as finite zero', (model) => {
    const tracker = new CostTracker();
    try {
      tracker.recordUsage('local-host', model, usage, 'one');
      tracker.recordUsage('local-host', model, usage, 'two');
      const summary = tracker.getSummary('all');
      expect(CostTracker.getCostPerToken(model)).toEqual({ input: 0, output: 0 });
      expect(summary.totalCost).toBe(0);
      expect(Object.hasOwn(summary.byModel, model)).toBe(true);
      expect(summary.byModel[model]).toBe(0);
      expect(JSON.parse(JSON.stringify(summary)).byModel[model]).toBe(0);
    } finally { tracker.dispose(); }
  });

  it.each(['constructor', 'toString', '__proto__'])('keeps usage for model %s in an owned bucket without modifying prototypes', (model) => {
    const inherited = ({} as Record<string, object>)[model];
    const keys = ['cost', 'tokens', 'requests'];
    const before = keys.map(key => Object.getOwnPropertyDescriptor(inherited, key));
    const tracker = new CostTracker();
    try {
      tracker.recordUsage('local-host', model, usage, 'one');
      tracker.recordUsage('local-host', model, usage, 'two');
      const result = tracker.getUsageByProvider('local-host');
      expect(Object.hasOwn(result.models, model)).toBe(true);
      expect(result.models[model]).toEqual({ cost: 0, tokens: 3000, requests: 2 });
      keys.forEach((key, i) => expect(Object.getOwnPropertyDescriptor(inherited, key)).toEqual(before[i]));
    } finally {
      keys.forEach((key, i) => {
        if (before[i]) Object.defineProperty(inherited, key, before[i]!);
        else Reflect.deleteProperty(inherited, key);
      });
      tracker.dispose();
    }
  });

  it('owns a prototype-named provider bucket and preserves ordinary paid costs', () => {
    const tracker = new CostTracker();
    try {
      const first = tracker.recordUsage('__proto__', 'gpt-4o', usage, 'one');
      const second = tracker.recordUsage('__proto__', 'gpt-4o', usage, 'two');
      const summary = tracker.getSummary('all');
      expect(Object.hasOwn(summary.byProvider, '__proto__')).toBe(true);
      expect(summary.byProvider['__proto__']).toBe(first.totalCost + second.totalCost);
      expect(summary.byModel['gpt-4o']).toBe(summary.totalCost);
    } finally { tracker.dispose(); }
  });

  it('keeps ordinary paid and unrecognized free model accounting', () => {
    const tracker = new CostTracker();
    try {
      const paid = tracker.recordUsage('openai', 'gpt-4o', usage, 'paid');
      tracker.recordUsage('ollama', 'owned-local-model', usage, 'free');
      expect(paid.totalCost).toBe(0.0125);
      const summary = tracker.getSummary('all');
      expect(summary.totalCost).toBe(paid.totalCost);
      expect(summary.byModel['owned-local-model']).toBe(0);
      expect(tracker.getUsageByProvider('openai').models['gpt-4o']).toEqual({ cost: paid.totalCost, tokens: 1500, requests: 1 });
    } finally { tracker.dispose(); }
  });
});
