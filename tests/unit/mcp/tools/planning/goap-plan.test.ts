/**
 * GOAPPlanTool (issue #535).
 *
 * - The auto-detected start state came from a static DEFAULT_V3_WORLD_STATE
 *   copy; it now comes from live/measured sources with per-field provenance.
 * - The seeded `achieve-90-percent-coverage` goal returned "No valid plan
 *   found" (planner state-hash bug).
 * - `constraints.maxSteps` was silently ignored (not implemented at all).
 * - goap_execute dryRun must find the planId goap_plan returned.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GOAPPlanTool } from '../../../../../src/mcp/tools/planning/goap-plan';
import { GOAPExecuteTool } from '../../../../../src/mcp/tools/planning/goap-execute';
import { resetSharedGOAPPlanner } from '../../../../../src/planning/index';
import { resetUnifiedPersistence, initializeUnifiedPersistence } from '../../../../../src/kernel/unified-persistence';
import { resetUnifiedMemory, initializeUnifiedMemory } from '../../../../../src/kernel/unified-memory';
import type { FleetSnapshot } from '../../../../../src/mcp/tools/planning/world-state';

const UNIFIED_DB_DIR = path.join(os.tmpdir(), `aqe-test-goap-plan-tool-${process.pid}`);
const UNIFIED_DB_PATH = path.join(UNIFIED_DB_DIR, 'memory.db');

function cleanupUnifiedDb(): void {
  for (const suffix of ['', '-wal', '-shm']) {
    const p = `${UNIFIED_DB_PATH}${suffix}`;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

const liveFleet: FleetSnapshot = { activeAgents: 1, maxAgents: 3, availableAgents: ['qe-test-generator'] };

describe('GOAPPlanTool (issue #535)', () => {
  let tool: GOAPPlanTool;

  beforeEach(async () => {
    resetSharedGOAPPlanner();
    resetUnifiedPersistence();
    resetUnifiedMemory();
    cleanupUnifiedDb();
    fs.mkdirSync(UNIFIED_DB_DIR, { recursive: true });
    await initializeUnifiedPersistence({ dbPath: UNIFIED_DB_PATH });
    await initializeUnifiedMemory({ dbPath: UNIFIED_DB_PATH });

    tool = new GOAPPlanTool({ readFleet: async () => liveFleet, readCoverage: () => null });
  });

  afterEach(() => {
    tool.resetInstanceCache();
    resetSharedGOAPPlanner();
    resetUnifiedPersistence();
    resetUnifiedMemory();
    cleanupUnifiedDb();
  });

  it('plans achieve-90-percent-coverage from the auto-detected state', async () => {
    const result = await tool.invoke({ goal: 'achieve-90-percent-coverage' });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.data!.stepCount).toBeGreaterThan(0);
    expect(result.data!.actions.some((a) => a.name === 'generate-coverage-tests')).toBe(true);
  }, 30000);

  it('uses the live fleet for the start state and does not claim the result is real', async () => {
    const result = await tool.invoke({ goal: 'achieve-90-percent-coverage' });

    expect(result.success).toBe(true);
    expect(result.data!.stateProvenance['fleet.activeAgents']).toBe('live');
    expect(result.data!.defaultedFields).toContain('quality.securityScore');
    expect(result.data!.defaultedFields).not.toContain('fleet.activeAgents');
    expect(result.metadata!.dataSource).toBe('estimated');
  }, 30000);

  it('constraints.maxSteps: 3 is enforced (goal from coverage 0 needs 11 steps)', async () => {
    const result = await tool.invoke({
      goal: 'achieve-90-percent-coverage',
      constraints: { maxSteps: 3 },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No valid plan found');
    expect(result.error).toContain('maxSteps: 3');
  }, 30000);

  it('constraints.maxSteps admits a plan within the cap (caller-supplied partial state)', async () => {
    const result = await tool.invoke({
      goal: 'achieve-90-percent-coverage',
      currentState: { coverage: { line: 75, measured: true } },
      constraints: { maxSteps: 3 },
    });

    expect(result.error).toBeUndefined();
    expect(result.data!.stepCount).toBeLessThanOrEqual(3);
    expect(result.data!.stateProvenance['coverage.line']).toBe('caller');
  }, 30000);

  it.each([0, -2, 1.5, '3'])('rejects invalid constraints.maxSteps=%s', async (bad) => {
    const result = await tool.invoke({
      goal: 'achieve-90-percent-coverage',
      constraints: { maxSteps: bad as number },
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/maxSteps must be a positive integer/);
  });

  it.each([
    [{ coverage: { line: -20 } }, 'currentState.coverage.line must be a number between 0 and 100'],
    [{ context: { environment: 'invalid' } }, 'currentState.context.environment must be one of'],
    [{ quality: { typo: 100 } }, 'currentState.quality.typo is not a known world-state field'],
    [{ bogus: {} }, 'currentState.bogus is not a world-state section'],
    [{ fleet: { availableAgents: 'x' } }, 'currentState.fleet.availableAgents must be an array of strings'],
  ])('rejects an invalid caller currentState %j', async (currentState, message) => {
    const result = await tool.invoke({
      goal: 'achieve-90-percent-coverage',
      currentState: currentState as Record<string, never>,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid currentState');
    expect(result.error).toContain(message);
  });

  it('accepts planner flag keys used by the action library in currentState', async () => {
    const result = await tool.invoke({
      goal: 'achieve-90-percent-coverage',
      currentState: { coverage: { line: 80, measured: true, gapsIdentified: true } },
      constraints: { maxSteps: 1 },
    });

    expect(result.error).toBeUndefined();
    expect(result.data!.actions.map((a) => a.name)).toEqual(['generate-coverage-tests']);
    expect(result.data!.stateProvenance['coverage.gapsIdentified']).toBe('caller');
  }, 30000);

  it('rejects unknown constraint properties instead of silently ignoring them', async () => {
    const result = await tool.invoke({
      goal: 'achieve-90-percent-coverage',
      constraints: { maxStep: 3 } as Record<string, unknown>,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown constraint(s): maxStep');
    expect(result.error).toContain('maxSteps');
  });

  it('goap_execute dryRun finds the planId goap_plan returned', async () => {
    const planned = await tool.invoke({
      goal: 'achieve-90-percent-coverage',
      currentState: { coverage: { line: 75, measured: true } },
      constraints: { maxSteps: 3 },
    });
    expect(planned.success).toBe(true);

    const execute = new GOAPExecuteTool();
    const result = await execute.invoke({ planId: planned.data!.planId, dryRun: true });

    expect(result.error).toBeUndefined();
    expect(result.data!.mode).toBe('dry-run');
    expect(result.data!.planId).toBe(planned.data!.planId);
    expect(result.data!.steps.map((s) => s.action)).toEqual(planned.data!.actions.map((a) => a.name));
    execute.resetInstanceCache();
  }, 30000);
});
