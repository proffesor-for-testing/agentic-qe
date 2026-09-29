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
});
