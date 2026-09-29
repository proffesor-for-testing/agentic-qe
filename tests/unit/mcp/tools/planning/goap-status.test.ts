/**
 * GOAPStatusTool — world state (issue #535).
 *
 * `goap_status {type:"world"}` returned a static DEFAULT_V3_WORLD_STATE copy
 * (fleet.activeAgents always 0, securityScore 100, ...) and marked it as
 * real data. These tests pin the fix: the fleet section comes from the live
 * fleet state that `agent_list` reads, unobserved values are null, and the
 * result is never labelled 'real' while any exposed field is an assumption.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Fake in-process fleet: the same getFleetState()/isFleetInitialized() pair
// agent_list reads. Mutated per test.
const fleet = vi.hoisted(() => ({
  initialized: false,
  agents: [] as Array<{ id: string; type: string; status: string; domain: string; name: string }>,
  maxConcurrentAgents: 15,
}));

vi.mock('../../../../../src/mcp/handlers/core-handlers', () => ({
  isFleetInitialized: () => fleet.initialized,
  getFleetState: () => ({
    initialized: fleet.initialized,
    queen: fleet.initialized ? { listAllAgents: () => fleet.agents } : null,
    kernel: fleet.initialized
      ? { getConfig: () => ({ maxConcurrentAgents: fleet.maxConcurrentAgents }) }
      : null,
  }),
}));

import { GOAPStatusTool, type WorldStateResult } from '../../../../../src/mcp/tools/planning/goap-status';
import { readCoverageSummary, readLiveFleet } from '../../../../../src/mcp/tools/planning/world-state';

async function worldOf(tool: GOAPStatusTool) {
  const result = await tool.invoke({ type: 'world' });
  expect(result.success).toBe(true);
  const payload = result.data as { type: 'world'; data: WorldStateResult };
  expect(payload.type).toBe('world');
  return { world: payload.data, metadata: result.metadata! };
}

describe('GOAPStatusTool world state (issue #535)', () => {
  beforeEach(() => {
    fleet.initialized = false;
    fleet.agents = [];
    fleet.maxConcurrentAgents = 15;
  });

  it('reflects a spawned running agent from the live fleet', async () => {
    fleet.initialized = true;
    fleet.maxConcurrentAgents = 3;
    fleet.agents = [
      { id: 'a1', type: 'qe-test-generator', status: 'running', domain: 'test-generation', name: 'x' },
    ];
    const tool = new GOAPStatusTool({ readCoverage: () => null });

    const { world } = await worldOf(tool);

    expect(world.fleet.initialized).toBe(true);
    expect(world.fleet.activeAgents).toBe(1);
    expect(world.fleet.maxAgents).toBe(3);
    expect(world.fleet.availableAgents).toEqual(['qe-test-generator']);
    expect(world.provenance['fleet.activeAgents']).toBe('live');
  });

  it('counts only running agents as active (idle agents are available, not active)', async () => {
    fleet.initialized = true;
    fleet.agents = [
      { id: 'a1', type: 'qe-test-generator', status: 'running', domain: 'test-generation', name: 'x' },
      { id: 'a2', type: 'qe-coverage-specialist', status: 'idle', domain: 'coverage-analysis', name: 'y' },
      { id: 'a3', type: 'qe-flaky-hunter', status: 'failed', domain: 'test-execution', name: 'z' },
    ];

    const snapshot = await readLiveFleet();

    expect(snapshot).toEqual({
      activeAgents: 1,
      maxAgents: 15,
      availableAgents: ['qe-coverage-specialist', 'qe-test-generator'],
    });
  });

  it('does not label the result real while fields are defaulted, and reports them as null', async () => {
    fleet.initialized = true;
    const tool = new GOAPStatusTool({ readCoverage: () => null });

    const { world, metadata } = await worldOf(tool);

    expect(metadata.dataSource).not.toBe('real');
    expect(metadata.dataSource).toBe('estimated');
    // Previously these were the planner defaults (0 / 100 / 3600) presented as real.
    expect(world.coverage.line).toBeNull();
    expect(world.quality.securityScore).toBeNull();
    expect(world.quality.performanceScore).toBeNull();
    expect(world.resources.timeRemaining).toBeNull();
    expect(world.provenance['quality.securityScore']).toBe('default');
    expect(world.defaultedFields).toContain('quality.securityScore');
    expect(world.defaultedFields).not.toContain('fleet.activeAgents');
  });

  it('without a fleet: initialized=false, maxAgents unknown, fleet fields defaulted', async () => {
    const tool = new GOAPStatusTool({ readCoverage: () => null });

    const { world, metadata } = await worldOf(tool);

    expect(world.fleet.initialized).toBe(false);
    expect(world.fleet.activeAgents).toBe(0);
    expect(world.fleet.maxAgents).toBeNull();
    expect(world.provenance['fleet.activeAgents']).toBe('default');
    expect(metadata.dataSource).toBe('estimated');
  });

  it('uses measured coverage when a coverage report is available', async () => {
    const tool = new GOAPStatusTool({
      readCoverage: () => ({
        line: 72.5, branch: 60, function: 81, source: 'coverage/coverage-summary.json', measuredAt: '2026-01-01T00:00:00.000Z',
      }),
    });

    const { world } = await worldOf(tool);

    expect(world.coverage).toMatchObject({ line: 72.5, branch: 60, function: 81, measured: true });
    expect(world.coverage.report?.source).toBe('coverage/coverage-summary.json');
    expect(world.provenance['coverage.line']).toBe('measured');
  });

  describe('readCoverageSummary', () => {
    let root: string;

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-535-cov-'));
    });

    afterEach(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    it('reads istanbul json-summary totals', () => {
      fs.mkdirSync(path.join(root, 'coverage'));
      fs.writeFileSync(
        path.join(root, 'coverage', 'coverage-summary.json'),
        JSON.stringify({ total: { lines: { pct: 88.1 }, branches: { pct: 70 }, functions: { pct: 91.2 } } })
      );

      expect(readCoverageSummary(root)).toMatchObject({ line: 88.1, branch: 70, function: 91.2 });
    });

    it('returns null when the report is absent or malformed', () => {
      expect(readCoverageSummary(root)).toBeNull();
      fs.mkdirSync(path.join(root, 'coverage'));
      fs.writeFileSync(path.join(root, 'coverage', 'coverage-summary.json'), '{"total":{"lines":{"pct":"n/a"}}}');
      expect(readCoverageSummary(root)).toBeNull();
    });
  });
});
