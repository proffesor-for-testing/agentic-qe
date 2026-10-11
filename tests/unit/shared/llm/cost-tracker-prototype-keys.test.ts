/**
 * Issue #914: model and agent names that match Object.prototype members must
 * count as ordinary numeric buckets.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { CostTracker } from '../../../../src/shared/llm/cost-tracker';
import { InMemorySpendLedger, SqliteSpendLedger, type SpendEntry } from '../../../../src/shared/llm/spend-ledger';

const usage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };
const PROTOTYPE_NAMES = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'];

function spend(agent: string, costUsd: number): SpendEntry {
  return {
    provider: 'openai', model: 'gpt-4o', costUsd, costSource: 'local-estimate',
    promptTokens: 1, completionTokens: 1, requestId: `${agent}-${costUsd}`, agent,
  };
}

const cleanup: string[] = [];
afterEach(() => {
  for (const dir of cleanup.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  delete (Object as unknown as Record<string, unknown>).cost;
});

describe('CostTracker model buckets (#914)', () => {
  it.each(PROTOTYPE_NAMES)('sums cost for a model named %s as a number', (model) => {
    const tracker = new CostTracker();
    const first = tracker.recordUsage('openai', model, usage, 'first');
    const second = tracker.recordUsage('openai', model, usage, 'second');
    const summary = tracker.getSummary('all');

    expect(Object.hasOwn(summary.byModel, model)).toBe(true);
    expect(typeof summary.byModel[model]).toBe('number');
    expect(summary.byModel[model]).toBe(first.totalCost + second.totalCost);
    expect(Object.keys(summary.byModel)).toEqual([model]);
  });

  it('keeps an ordinary model next to a prototype-named one', () => {
    const tracker = new CostTracker();
    const a = tracker.recordUsage('openai', 'gpt-4o', usage, 'a');
    const b = tracker.recordUsage('openai', 'toString', usage, 'b');
    const summary = tracker.getSummary('all');
    expect(summary.byModel['gpt-4o']).toBe(a.totalCost);
    expect(summary.byModel.toString).toBe(b.totalCost);
    expect(JSON.parse(JSON.stringify(summary.byModel))).toEqual({ 'gpt-4o': a.totalCost, toString: b.totalCost });
  });

  it('records a __proto__ provider bucket instead of dropping it', () => {
    const tracker = new CostTracker();
    const record = tracker.recordUsage('__proto__', 'gpt-4o', usage, 'proto');
    const summary = tracker.getSummary('all');
    expect(Object.hasOwn(summary.byProvider, '__proto__')).toBe(true);
    expect(Object.values(summary.byProvider).reduce((sum, value) => sum + value, 0)).toBe(record.totalCost);
  });

  it.each(PROTOTYPE_NAMES)('per-model usage for %s stays local and never touches Object', (model) => {
    const tracker = new CostTracker();
    const record = tracker.recordUsage('openai', model, usage, 'x');
    const byProvider = tracker.getUsageByProvider('openai');

    expect(Object.hasOwn(byProvider.models, model)).toBe(true);
    expect(byProvider.models[model]).toEqual({ cost: record.totalCost, tokens: 1500, requests: 1 });
    expect(Object.hasOwn(Object, 'cost')).toBe(false);
  });
});

describe('SpendLedger agent buckets (#914)', () => {
  it.each(PROTOTYPE_NAMES)('in-memory ledger sums agent %s as a number', (agent) => {
    const ledger = new InMemorySpendLedger();
    ledger.record(spend(agent, 0.25));
    ledger.record(spend(agent, 0.5));
    const byAgent = ledger.spentByAgentSince(60_000);
    expect(Object.hasOwn(byAgent, agent)).toBe(true);
    expect(byAgent[agent]).toBe(0.75);
  });

  it('SQLite ledger keeps a __proto__ agent bucket', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spend-proto-'));
    cleanup.push(dir);
    const db = new Database(path.join(dir, 'ledger.db'));
    try {
      const ledger = new SqliteSpendLedger(db);
      ledger.record(spend('__proto__', 0.5));
      ledger.record(spend('constructor', 0.25));
      const byAgent = ledger.spentByAgentSince(60_000);
      expect(Object.hasOwn(byAgent, '__proto__')).toBe(true);
      expect(byAgent.__proto__ as unknown).toBe(0.5);
      expect(byAgent.constructor as unknown).toBe(0.25);
    } finally {
      db.close();
    }
  });
});
