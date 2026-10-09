import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { initializeUnifiedPersistence, resetUnifiedPersistence } from '../../../../../src/kernel/unified-persistence.js';
import {
  DEFAULT_V3_WORLD_STATE,
  getAllQEActions,
  getSharedGOAPPlanner,
  resetSharedGOAPPlanner,
  type GOAPPlan,
} from '../../../../../src/planning/index.js';
import { GOAPStatusTool, type PlansResult } from '../../../../../src/mcp/tools/planning/goap-status.js';

let testDir: string;

describe('GOAP status persisted plans', () => {
  beforeEach(async () => {
    resetSharedGOAPPlanner();
    resetUnifiedPersistence();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-goap-status-'));
    await initializeUnifiedPersistence({ dbPath: path.join(testDir, 'memory.db') });
  });

  afterEach(() => {
    resetSharedGOAPPlanner();
    resetUnifiedPersistence();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('lists real plans with filters, limits, and a total count', async () => {
    const planner = getSharedGOAPPlanner();
    await planner.initialize();
    const action = getAllQEActions()[0];
    const planBase = {
      initialState: DEFAULT_V3_WORLD_STATE,
      goalState: {},
      actions: [action],
      totalCost: 2,
      estimatedDurationMs: 1000,
    };
    await planner.savePlan({ ...planBase, id: 'pending-plan', status: 'pending' });
    await planner.savePlan({ ...planBase, id: 'completed-plan', status: 'completed' });

    const tool = new GOAPStatusTool();
    const filtered = await tool.invoke({ type: 'plans', filter: { status: 'completed' } });
    expect(filtered.success).toBe(true);
    const filteredData = (filtered.data as { type: 'plans'; data: PlansResult }).data;
    expect(filteredData.count).toBe(1);
    expect(filteredData.plans).toMatchObject([
      { id: 'completed-plan', status: 'completed', stepCount: 1, totalCost: 2 },
    ]);
    expect(filteredData.plans[0].createdAt).toBeTruthy();

    const limited = await tool.invoke({ type: 'plans', filter: { limit: 1 } });
    const limitedData = (limited.data as { type: 'plans'; data: PlansResult }).data;
    expect(limitedData.count).toBe(2);
    expect(limitedData.plans).toHaveLength(1);
  });

  const statuses: GOAPPlan['status'][] = ['pending', 'executing', 'completed', 'failed', 'cancelled'];

  async function saveStatusControls(): Promise<void> {
    const planner = getSharedGOAPPlanner();
    await planner.initialize();
    for (const status of statuses) {
      await planner.savePlan({
        id: `fixture-${status}`, initialState: DEFAULT_V3_WORLD_STATE, goalState: {},
        actions: [], totalCost: 0, estimatedDurationMs: 0, status,
      });
    }
  }

  it('advertises every persisted plan status in the tool schema', () => {
    const schema = new GOAPStatusTool().config.schema;
    expect(schema.properties.filter.properties?.status.enum).toEqual(statuses);
  });

  for (const status of statuses) {
    it(`filters the actual saved ${status} plan`, async () => {
      await saveStatusControls();
      const result = await new GOAPStatusTool().invoke({ type: 'plans', filter: { status } });
      expect(result.success).toBe(true);
      expect((result.data as { type: 'plans'; data: PlansResult }).data).toMatchObject({
        count: 1, plans: [{ id: `fixture-${status}`, status }],
      });
    });
  }

  for (const status of ['not-a-status', '']) {
    it(`rejects the unknown status ${JSON.stringify(status)} instead of reporting an empty or unfiltered page`, async () => {
      await saveStatusControls();
      const tool = new GOAPStatusTool();
      const result = await tool.invoke({ type: 'plans', filter: { status } });
      expect(result.success).toBe(false);
      expect(result.error).toContain('filter.status');
      expect(result.data).toBeUndefined();
      const unfiltered = await tool.invoke({ type: 'plans' });
      expect(unfiltered.success).toBe(true);
      expect((unfiltered.data as { type: 'plans'; data: PlansResult }).data.count).toBe(5);
    });
  }

  it('rejects an unknown status through direct execution as well as invocation', async () => {
    await saveStatusControls();
    const result = await new GOAPStatusTool().execute(
      { type: 'plans', filter: { status: 'not-a-status' } },
      { requestId: 'owned-status-control', startTime: Date.now() },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('filter.status');
  });

});
