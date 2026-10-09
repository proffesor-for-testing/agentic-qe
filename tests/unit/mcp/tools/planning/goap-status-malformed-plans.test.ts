/** Real saved-plan pages isolate invalid rows without hiding their presence. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getUnifiedPersistence, resetUnifiedPersistence } from '../../../../../src/kernel/unified-persistence.js';
import { DEFAULT_V3_WORLD_STATE, getAllQEActions, getSharedGOAPPlanner, resetSharedGOAPPlanner } from '../../../../../src/planning/index.js';
import { GOAPStatusTool, type PlansResult } from '../../../../../src/mcp/tools/planning/goap-status.js';
let root: string;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'aqe-malformed-plans-'));
  resetSharedGOAPPlanner(); resetUnifiedPersistence();
  await getUnifiedPersistence({ dbPath: join(root, 'memory.db') }).initialize();
  const planner = getSharedGOAPPlanner(); await planner.initialize();
  for (const id of ['good-neighbor', 'bad-row']) await planner.savePlan({
    id, status: 'pending', initialState: structuredClone(DEFAULT_V3_WORLD_STATE),
    goalState: {}, actions: [getAllQEActions()[0]], totalCost: 2, estimatedDurationMs: 1000,
  });
});
afterEach(() => {
  const bytes = readdirSync(root).reduce((sum, name) => sum + statSync(join(root, name)).size, 0);
  resetSharedGOAPPlanner(); resetUnifiedPersistence();
  rmSync(root, { recursive: true, force: true });
  expect(bytes).toBeLessThan(10 * 1024 * 1024);
});
function setSequence(value: string, id = 'bad-row') {
  getUnifiedPersistence().getDatabase().prepare('UPDATE goap_plans SET action_sequence = ? WHERE id = ?').run(value, id);
}
async function page(filter?: { status?: string; limit?: number }) {
  const result = await new GOAPStatusTool().invoke({ type: 'plans', filter });
  expect(result.success).toBe(true);
  return (result.data as { type: 'plans'; data: PlansResult }).data;
}

describe('GOAP status malformed persisted plans', () => {
  it.each([
    ['malformed JSON', '{owned-invalid'],
    ['unknown object schema', '{"owned":"unknown-schema"}'],
    ['null schema', 'null'],
    ['non-string action IDs', '[null,42,{"owned":true}]'],
  ])('retains the valid neighbor when another row contains %s', async (_label, sequence) => {
    setSequence(sequence);
    const data = await page();
    expect(data.plans.map(plan => plan.id)).toEqual(['good-neighbor']);
    expect(data.count).toBe(2);
    expect(data.invalidPlanIds).toEqual(['bad-row']);
    expect(JSON.stringify(data)).not.toContain(sequence);
  });

  it('retains valid empty sequences with zero steps and no invalid-row field', async () => {
    setSequence('[]');
    const data = await page();
    expect(data.plans.map(plan => [plan.id, plan.stepCount]).sort()).toEqual([['bad-row', 0], ['good-neighbor', 1]]);
    expect(data.count).toBe(2);
    expect(data).not.toHaveProperty('invalidPlanIds');
  });

  it('summarizes string IDs without executing or requiring their action definitions', async () => {
    setSequence('["owned-unavailable-action"]');
    const data = await page();
    expect(data.plans.find(plan => plan.id === 'bad-row')?.stepCount).toBe(1);
    expect(data).not.toHaveProperty('invalidPlanIds');
  });

  it('explicitly reports every invalid row when a page has no valid summaries', async () => {
    setSequence('{bad-one'); setSequence('null', 'good-neighbor');
    const data = await page();
    expect(data.plans).toEqual([]);
    expect(data.count).toBe(2);
    expect(data.invalidPlanIds?.slice().sort()).toEqual(['bad-row', 'good-neighbor']);
  });

  it('keeps filters and their stored-row counts scoped to the requested status', async () => {
    setSequence('{bad-filtered');
    getUnifiedPersistence().getDatabase().prepare('UPDATE goap_plans SET status = ? WHERE id = ?').run('completed', 'bad-row');
    const valid = await page({ status: 'pending' });
    expect(valid.count).toBe(1);
    expect(valid.plans.map(plan => plan.id)).toEqual(['good-neighbor']);
    expect(valid).not.toHaveProperty('invalidPlanIds');
    const invalid = await page({ status: 'completed' });
    expect(invalid.count).toBe(1);
    expect(invalid.plans).toEqual([]);
    expect(invalid.invalidPlanIds).toEqual(['bad-row']);
  });

  it('reports only inspected invalid rows and preserves the existing limit and order', async () => {
    setSequence('{bad-outside-page');
    const db = getUnifiedPersistence().getDatabase();
    db.prepare('UPDATE goap_plans SET created_at = ? WHERE id = ?').run('2026-01-01T00:00:00Z', 'bad-row');
    db.prepare('UPDATE goap_plans SET created_at = ? WHERE id = ?').run('2026-01-02T00:00:00Z', 'good-neighbor');
    const data = await page({ limit: 1 });
    expect(data.count).toBe(2);
    expect(data.plans.map(plan => plan.id)).toEqual(['good-neighbor']);
    expect(data).not.toHaveProperty('invalidPlanIds');
  });

  it('keeps malformed full-plan loading as an error rather than inventing executable actions', async () => {
    setSequence('{bad-execution');
    await expect(getSharedGOAPPlanner().getPlan('bad-row')).rejects.toThrow();
  });
});
