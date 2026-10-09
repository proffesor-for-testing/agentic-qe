/** Actual SQLite plans must honor declared action duration estimates. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getUnifiedPersistence, resetUnifiedPersistence } from '../../../src/kernel/unified-persistence.js';
import {
  DEFAULT_V3_WORLD_STATE, getAllQEActions, getSharedGOAPPlanner, resetSharedGOAPPlanner,
} from '../../../src/planning/index.js';

let root: string;
let planner: ReturnType<typeof getSharedGOAPPlanner>;
let persistence: ReturnType<typeof getUnifiedPersistence>;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'aqe-duration-budget-'));
  resetSharedGOAPPlanner();
  resetUnifiedPersistence();
  persistence = getUnifiedPersistence({ dbPath: join(root, 'memory.db') });
  await persistence.initialize();
  planner = getSharedGOAPPlanner();
  await planner.initialize();
  planner.setPlanReuseEnabled(false);
});

afterEach(() => {
  const bytes = readdirSync(root).reduce((total, name) => total + statSync(join(root, name)).size, 0);
  resetSharedGOAPPlanner();
  resetUnifiedPersistence();
  rmSync(root, { recursive: true, force: true });
  expect(bytes).toBeLessThan(10 * 1024 * 1024);
});

const initialState = () => structuredClone(DEFAULT_V3_WORLD_STATE);
const constraints = (maxDurationMs: number) => ({
  maxSteps: 2, maxDurationMs, requiredAgentTypes: ['owned-duration'],
});

async function addAction(name: string, duration: number, cost: number, first: boolean) {
  return planner.addAction({
    name, agentType: 'owned-duration',
    preconditions: first ? { 'coverage.measured': false } : { 'coverage.measured': true, 'coverage.line': 0 },
    effects: first ? { 'coverage.measured': true } : { 'coverage.line': 20 },
    cost, estimatedDurationMs: duration, successRate: 1, category: 'coverage',
  });
}

async function reloadPlanner() {
  resetSharedGOAPPlanner();
  planner = getSharedGOAPPlanner();
  await planner.initialize();
}

describe('GOAP duration budgets with real persistence', () => {
  it('persists library estimates and applies a seeded single-action budget', async () => {
    const low = await planner.findPlan(initialState(), { 'coverage.measured': true }, { maxSteps: 1, maxDurationMs: 1 });
    const allowed = await planner.findPlan(initialState(), { 'coverage.measured': true }, { maxSteps: 1, maxDurationMs: 30000 });
    expect(low).toBeNull();
    expect(allowed?.estimatedDurationMs).toBe(30000);
    const stored = persistence.getDatabase().prepare('SELECT name, estimated_duration_ms FROM goap_actions').all() as {
      name: string; estimated_duration_ms: number | null;
    }[];
    for (const action of getAllQEActions()) {
      expect(stored.find(row => row.name === action.name)?.estimated_duration_ms).toBe(action.estimatedDurationMs);
    }
    expect((await planner.getPlan(allowed!.id))?.estimatedDurationMs).toBe(30000);
  });

  it('rejects a cumulative 70-second plan under 60 seconds and accepts it at 70', async () => {
    await addAction('first-30s', 30000, 1, true);
    await addAction('last-40s', 40000, 1, false);
    const low = await planner.findPlan(initialState(), { 'coverage.line': 20 }, constraints(60000));
    const allowed = await planner.findPlan(initialState(), { 'coverage.line': 20 }, constraints(70000));
    expect(low).toBeNull();
    expect(allowed?.estimatedDurationMs).toBe(70000);
    expect(allowed?.actions.map(action => action.name)).toEqual(['first-30s', 'last-40s']);
  });

  it('retains a costlier faster prefix when the cheaper prefix cannot finish within budget', async () => {
    await addAction('cheap-slow', 15000, 1, true);
    await addAction('costlier-fast', 5000, 3, true);
    await addAction('finish', 10000, 1, false);
    const limited = await planner.findPlan(initialState(), { 'coverage.line': 20 }, constraints(20000));
    const relaxed = await planner.findPlan(initialState(), { 'coverage.line': 20 }, constraints(25000));
    expect(limited?.estimatedDurationMs).toBe(15000);
    expect(limited?.actions.map(action => action.name)).toEqual(['costlier-fast', 'finish']);
    expect(relaxed?.estimatedDurationMs).toBe(25000);
    expect(relaxed?.actions.map(action => action.name)).toEqual(['cheap-slow', 'finish']);
  });

  it('retains a shallower feasible label when duration and step caps apply together', async () => {
    await planner.addAction({
      name: 'cheap-detour', agentType: 'owned-duration',
      preconditions: { 'coverage.measured': false, 'coverage.line': 0 },
      effects: { 'coverage.line': 5 }, cost: 0.2, estimatedDurationMs: 1000,
      successRate: 1, category: 'coverage',
    });
    await planner.addAction({
      name: 'cheap-convergence', agentType: 'owned-duration',
      preconditions: { 'coverage.measured': false, 'coverage.line': 5 },
      effects: { 'coverage.measured': true, 'coverage.line': 0 }, cost: 0.2,
      estimatedDurationMs: 1000, successRate: 1, category: 'coverage',
    });
    await addAction('direct', 1000, 3, true);
    await addAction('finish', 1000, 1, false);
    const plan = await planner.findPlan(initialState(), { 'coverage.line': 20 }, constraints(4000));
    expect(plan?.actions.map(action => action.name)).toEqual(['direct', 'finish']);
    expect(plan?.estimatedDurationMs).toBe(2000);
  });

  it('preserves explicit stored zero and positive overrides across initialization', async () => {
    const db = persistence.getDatabase();
    const rows = db.prepare('SELECT id FROM goap_actions ORDER BY name LIMIT 2').all() as { id: string }[];
    db.prepare('UPDATE goap_actions SET estimated_duration_ms = ? WHERE id = ?').run(0, rows[0].id);
    db.prepare('UPDATE goap_actions SET estimated_duration_ms = ? WHERE id = ?').run(17123, rows[1].id);
    await reloadPlanner();
    const stored = rows.map(row => db.prepare('SELECT estimated_duration_ms AS value FROM goap_actions WHERE id = ?').get(row.id));
    expect(stored).toEqual([{ value: 0 }, { value: 17123 }]);
  });

  it('repairs canonical legacy nulls while leaving a modified same-name custom action unknown', async () => {
    const db = persistence.getDatabase();
    const canonical = getAllQEActions().find(action => action.name === 'measure-coverage')!;
    db.prepare('UPDATE goap_actions SET estimated_duration_ms = NULL WHERE name = ?').run(canonical.name);
    const customId = await planner.addAction({
      name: canonical.name, agentType: 'owned-custom',
      preconditions: { 'coverage.measured': true }, effects: { 'coverage.line': 17 },
      cost: 1, successRate: 1, category: 'analysis',
    });
    await reloadPlanner();
    const rows = db.prepare('SELECT id, estimated_duration_ms FROM goap_actions WHERE name = ?').all(canonical.name) as {
      id: string; estimated_duration_ms: number | null;
    }[];
    expect(rows.find(row => row.id !== customId)?.estimated_duration_ms).toBe(canonical.estimatedDurationMs);
    expect(rows.find(row => row.id === customId)?.estimated_duration_ms).toBeNull();
  });

  it('does not guess a library estimate for a same-name action with a custom execution binding', async () => {
    const canonical = getAllQEActions().find(action => action.name === 'measure-coverage')!;
    const id = await planner.addAction({
      ...canonical, agentType: canonical.agentType!, successRate: 1,
      method: 'ownedCustomMethod', params: { owned: true }, implemented: true,
      estimatedDurationMs: undefined,
    });
    await reloadPlanner();
    expect(persistence.getDatabase().prepare('SELECT estimated_duration_ms AS value FROM goap_actions WHERE id = ?').get(id))
      .toEqual({ value: null });
  });

  it('rechecks reloaded estimates when reusing and persists the corrected clone duration', async () => {
    planner.setPlanReuseEnabled(true);
    const old = await planner.findPlan(initialState(), { 'coverage.measured': true });
    expect(old).not.toBeNull();
    const db = persistence.getDatabase();
    db.prepare('UPDATE goap_plans SET estimated_duration_ms = 0 WHERE id = ?').run(old!.id);
    db.prepare('UPDATE goap_actions SET estimated_duration_ms = 30000 WHERE name = ?').run('measure-coverage');
    await reloadPlanner();
    const low = await planner.findPlan(initialState(), { 'coverage.measured': true }, { maxDurationMs: 1, maxSteps: 1 });
    const allowed = await planner.findPlan(initialState(), { 'coverage.measured': true }, { maxDurationMs: 30000, maxSteps: 1 });
    expect(low).toBeNull();
    expect(allowed?.estimatedDurationMs).toBe(30000);
    expect((await planner.getPlan(allowed!.id))?.estimatedDurationMs).toBe(30000);
  });
});
