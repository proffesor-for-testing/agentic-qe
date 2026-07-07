/**
 * GOAPExecuteTool MCP tool tests (A14).
 *
 * Before this fix, `getExecutor()` unconditionally built a
 * `createMockExecutor` (successRate: 0.95) regardless of whether real
 * domain services were available — every "real execution" through this
 * MCP tool was actually a fabricated coin flip. These tests exercise the
 * tool wrapper directly (not just the underlying PlanExecutor class, which
 * has its own dedicated test file) since this MCP-layer wiring had zero
 * prior coverage.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GOAPExecuteTool } from '../../../../../src/mcp/tools/planning/goap-execute';
import { getSharedGOAPPlanner, resetSharedGOAPPlanner } from '../../../../../src/planning/index';
import { resetUnifiedPersistence, initializeUnifiedPersistence } from '../../../../../src/kernel/unified-persistence';
import { resetUnifiedMemory, initializeUnifiedMemory } from '../../../../../src/kernel/unified-memory';
import type { MCPToolContext } from '../../../../../src/mcp/tools/base';
import type { QEKernel } from '../../../../../src/kernel/interfaces';
import type { V3WorldState, GOAPAction, GOAPPlan } from '../../../../../src/planning/types';
import { DEFAULT_V3_WORLD_STATE } from '../../../../../src/planning/types';

/** Build a plan directly (bypassing A* search) so tests don't depend on search reachability. */
function makePlan(actions: GOAPAction[], initialState: V3WorldState = DEFAULT_V3_WORLD_STATE): GOAPPlan {
  return {
    id: `test-plan-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    initialState,
    goalState: {},
    actions,
    totalCost: actions.reduce((sum, a) => sum + a.cost, 0),
    estimatedDurationMs: 1000,
    status: 'pending',
  };
}

const UNIFIED_DB_DIR = path.join(os.tmpdir(), `aqe-test-goap-execute-tool-${process.pid}`);
const UNIFIED_DB_PATH = path.join(UNIFIED_DB_DIR, 'memory.db');

function cleanupUnifiedDb(): void {
  for (const suffix of ['', '-wal', '-shm']) {
    const p = `${UNIFIED_DB_PATH}${suffix}`;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

function makeContext(kernel?: QEKernel): MCPToolContext {
  return {
    requestId: 'test-request',
    startTime: Date.now(),
    kernel,
  };
}

describe('GOAPExecuteTool', () => {
  let tool: GOAPExecuteTool;

  beforeEach(async () => {
    resetSharedGOAPPlanner();
    resetUnifiedPersistence();
    resetUnifiedMemory();
    cleanupUnifiedDb();
    fs.mkdirSync(UNIFIED_DB_DIR, { recursive: true });
    await initializeUnifiedPersistence({ dbPath: UNIFIED_DB_PATH });
    await initializeUnifiedMemory({ dbPath: UNIFIED_DB_PATH });

    tool = new GOAPExecuteTool();
  });

  afterEach(async () => {
    tool.resetInstanceCache();
    resetSharedGOAPPlanner();
    resetUnifiedPersistence();
    resetUnifiedMemory();
    cleanupUnifiedDb();
  });

  it('should report "Plan not found" for an unknown planId', async () => {
    const result = await tool.execute({ planId: 'does-not-exist' }, makeContext());
    expect(result.success).toBe(false);
    expect(result.error).toContain('Plan not found');
  });

  it('dryRun should preview the plan without dispatching anything', async () => {
    const planner = getSharedGOAPPlanner();
    await planner.initialize();
    // Trivially reachable in one step: measure-coverage has no
    // preconditions and its only effect is coverage.measured=true.
    const state: V3WorldState = {
      coverage: { line: 0, branch: 0, function: 0, target: 80, measured: false },
      quality: { testsPassing: 0, totalTests: 0, securityScore: 100, performanceScore: 100 },
      fleet: { activeAgents: 0, availableAgents: [], maxAgents: 8 },
      resources: { timeRemaining: 3600, memoryAvailable: 4096, parallelSlots: 4 },
      context: { environment: 'development', riskLevel: 'medium' },
      patterns: { available: 0, reusable: 0 },
    };
    const plan = await planner.findPlan(state, { 'coverage.measured': true });
    expect(plan).not.toBeNull();

    const result = await tool.execute({ planId: plan!.id, dryRun: true }, makeContext());

    expect(result.success).toBe(true);
    expect(result.data?.mode).toBe('dry-run');
  });

  it('should dispatch an implemented:true action to a real domain API method when a kernel is available', async () => {
    const planner = getSharedGOAPPlanner();
    await planner.initialize();

    // addAction() assigns its own id (ignores any `id` field on the input)
    // and registers it in the planner's in-memory action registry —
    // getPlan() reconstructs a saved plan's actions by looking IDs up
    // there, so the action must be registered this way, not just embedded
    // in the plan object passed to savePlan().
    const actionId = await planner.addAction({
      name: 'Real Bound Action',
      agentType: 'qe-coverage-specialist',
      preconditions: {},
      effects: { 'coverage.measured': true },
      cost: 1.0,
      successRate: 1.0,
      category: 'coverage',
      qeDomain: 'coverage-analysis',
      method: 'analyze',
      params: {},
      implemented: true,
    });
    const registeredActions = await planner.getActionsByCategory('coverage');
    const action = registeredActions.find((a) => a.id === actionId)!;
    expect(action).toBeDefined();

    const plan = makePlan([action]);
    await planner.savePlan(plan);

    const realMethod = vi.fn().mockResolvedValue({ ok: true });
    const kernel = {
      getDomainAPI: vi.fn().mockReturnValue({ analyze: realMethod }),
    } as unknown as QEKernel;

    const result = await tool.execute({ planId: plan.id }, makeContext(kernel));

    expect(kernel.getDomainAPI).toHaveBeenCalledWith('coverage-analysis');
    expect(realMethod).toHaveBeenCalledWith({});
    expect(result.data?.mode).toBe('execution');
    expect(result.data?.status).toBe('completed');
    expect(result.data?.steps[0].status).toBe('completed');
  });

  it('should fail an implemented:false action honestly instead of a fabricated success', async () => {
    const planner = getSharedGOAPPlanner();
    await planner.initialize();

    const actionId = await planner.addAction({
      name: 'Unimplemented Bound Action',
      agentType: 'qe-mutation-tester',
      preconditions: {},
      effects: { 'quality.customUnimplementedFlag': true },
      cost: 1.0,
      successRate: 1.0,
      category: 'coverage',
      qeDomain: 'coverage-analysis',
      implemented: false,
    });
    const registeredActions = await planner.getActionsByCategory('coverage');
    const action = registeredActions.find((a) => a.id === actionId)!;
    expect(action).toBeDefined();

    const plan = makePlan([action]);
    await planner.savePlan(plan);

    const kernel = { getDomainAPI: vi.fn() } as unknown as QEKernel;
    const result = await tool.execute({ planId: plan.id }, makeContext(kernel));

    // The single unimplemented step fails and there's no alternative plan to
    // fall back to, so the whole execution reports failed — not a
    // fabricated success via the mock spawner.
    expect(result.data?.status).toBe('failed');
    expect(result.data?.steps[0].status).toBe('failed');
    expect(result.data?.steps[0].error).toContain('no real implementation');
    // getDomainAPI must never even be consulted for a known-unimplemented action.
    expect(kernel.getDomainAPI).not.toHaveBeenCalled();
  });
});
