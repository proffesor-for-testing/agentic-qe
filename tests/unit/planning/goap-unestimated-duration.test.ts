import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getUnifiedPersistence, resetUnifiedPersistence } from '../../../src/kernel/unified-persistence.js';
import { DEFAULT_V3_WORLD_STATE, getAllQEActions, getSharedGOAPPlanner, resetSharedGOAPPlanner } from '../../../src/planning/index.js';

let root: string;
let planner: ReturnType<typeof getSharedGOAPPlanner>;
let persistence: ReturnType<typeof getUnifiedPersistence>;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'aqe-owned-duration-'));
  resetSharedGOAPPlanner();
  resetUnifiedPersistence();
  persistence = getUnifiedPersistence({ dbPath: join(root, 'memory.db') });
  await persistence.initialize();
  planner = getSharedGOAPPlanner();
  await planner.initialize();
  planner.setPlanReuseEnabled(false);
});

afterEach(() => {
  resetSharedGOAPPlanner();
  resetUnifiedPersistence();
  rmSync(root, { recursive: true, force: true });
});

async function add(name: string, first: boolean, duration?: number) {
  return planner.addAction({
    name, agentType: 'owned-unestimated', category: 'coverage', cost: 1, successRate: 1,
    preconditions: first ? { 'coverage.measured': false } : { 'coverage.measured': true, 'coverage.line': 0 },
    effects: first ? { 'coverage.measured': true } : { 'coverage.line': 20 },
    estimatedDurationMs: duration,
  });
}

const state = () => structuredClone(DEFAULT_V3_WORLD_STATE);
const constraints = (maxDurationMs: number) => ({
  maxSteps: 2, maxDurationMs, requiredAgentTypes: ['owned-unestimated'],
});

describe('GOAP unestimated duration and atomic backfill', () => {
  it('budgets an unestimated action conservatively and stores its returned total', async () => {
    await add('first', true);
    expect(await planner.findPlan(state(), { 'coverage.measured': true }, constraints(999))).toBeNull();
    const plan = await planner.findPlan(state(), { 'coverage.measured': true }, constraints(1000));
    expect(plan?.estimatedDurationMs).toBe(1000);
    expect((await planner.getPlan(plan!.id))?.estimatedDurationMs).toBe(1000);
  });

  it('counts both unestimated actions in a cumulative budget', async () => {
    await add('first', true);
    await add('second', false);
    expect(await planner.findPlan(state(), { 'coverage.line': 20 }, constraints(1999))).toBeNull();
    expect((await planner.findPlan(state(), { 'coverage.line': 20 }, constraints(2000)))?.estimatedDurationMs).toBe(2000);
  });

  it('rechecks unestimated actions before reusing a stored plan', async () => {
    await add('first', true);
    planner.setPlanReuseEnabled(true);
    const initial = await planner.findPlan(state(), { 'coverage.measured': true }, constraints(1000));
    expect(initial).not.toBeNull();
    expect(await planner.findPlan(state(), { 'coverage.measured': true }, constraints(999))).toBeNull();
    const reused = await planner.findPlan(state(), { 'coverage.measured': true }, constraints(1000));
    expect(reused?.reusedFrom).toBeDefined();
    expect(reused?.estimatedDurationMs).toBe(1000);
  });

  it('preserves explicit zero and declared estimates', async () => {
    await add('first', true, 0);
    await add('second', false, 25);
    expect((await planner.findPlan(state(), { 'coverage.line': 20 }, constraints(25)))?.estimatedDurationMs).toBe(25);
  });

  it('rolls back all duration backfills when a later update fails', async () => {
    const db = persistence.getDatabase();
    const actions = getAllQEActions().filter(a => a.estimatedDurationMs !== undefined && a.params && a.implemented && a.method).slice(0, 2);
    expect(actions).toHaveLength(2);
    db.prepare('UPDATE goap_actions SET estimated_duration_ms = NULL WHERE name IN (?, ?)').run(actions[0].name, actions[1].name);
    db.exec(`CREATE TRIGGER owned_backfill_abort BEFORE UPDATE OF estimated_duration_ms ON goap_actions
      WHEN OLD.name = '${actions[1].name.replaceAll("'", "''")}' BEGIN SELECT RAISE(ABORT, 'owned backfill interruption'); END`);
    resetSharedGOAPPlanner();
    await expect(getSharedGOAPPlanner().initialize()).rejects.toThrow('owned backfill interruption');
    const rows = db.prepare('SELECT estimated_duration_ms AS duration FROM goap_actions WHERE name IN (?, ?)').all(actions[0].name, actions[1].name);
    expect(rows).toEqual([{ duration: null }, { duration: null }]);
  });

  it('backfills missing estimates while retaining explicit overrides', async () => {
    const db = persistence.getDatabase();
    const action = getAllQEActions().find(a => a.estimatedDurationMs !== undefined && a.params && a.implemented && a.method)!;
    db.prepare('UPDATE goap_actions SET estimated_duration_ms = NULL WHERE name = ?').run(action.name);
    resetSharedGOAPPlanner();
    await getSharedGOAPPlanner().initialize();
    expect(db.prepare('SELECT estimated_duration_ms AS duration FROM goap_actions WHERE name = ?').get(action.name))
      .toEqual({ duration: action.estimatedDurationMs });
    db.prepare('UPDATE goap_actions SET estimated_duration_ms = 0 WHERE name = ?').run(action.name);
    resetSharedGOAPPlanner();
    await getSharedGOAPPlanner().initialize();
    expect(db.prepare('SELECT estimated_duration_ms AS duration FROM goap_actions WHERE name = ?').get(action.name)).toEqual({ duration: 0 });
  });
});
