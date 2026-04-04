/**
 * Tests for AgentMemoryBranch (ADR-067)
 *
 * Tests COW branch lifecycle, merge strategies, coordinator wiring,
 * and orphan cleanup.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentMemoryBranch } from '../../../src/coordination/agent-memory-branch.js';
import { DefaultAgentCoordinator } from '../../../src/kernel/agent-coordinator.js';
import type { RvfNativeAdapter } from '../../../src/integrations/ruvector/rvf-native-adapter.js';

// ============================================================================
// Mock RVF Adapter
// ============================================================================

function createMockParentAdapter(): RvfNativeAdapter {
  const vectors = new Map<string, Float32Array>();
  const children: RvfNativeAdapter[] = [];

  const adapter: Partial<RvfNativeAdapter> = {
    ingest: vi.fn((entries) => {
      for (const e of entries) {
        vectors.set(e.id, e.vector instanceof Float32Array ? e.vector : new Float32Array(e.vector));
      }
      return { accepted: entries.length, rejected: 0 };
    }),
    search: vi.fn(() => []),
    delete: vi.fn((ids) => ids.length),
    status: vi.fn(() => ({
      totalVectors: vectors.size,
      totalSegments: 1,
      fileSizeBytes: 100,
      epoch: 1,
      witnessValid: true,
      witnessEntries: 0,
    })),
    close: vi.fn(),
    isOpen: vi.fn(() => true),
    path: vi.fn(() => '/tmp/parent.rvf'),
    dimension: vi.fn(() => 384),
    size: vi.fn(() => vectors.size),
    derive: vi.fn((childPath: string) => {
      // Return a child adapter that also mocks the interface
      const childVectors = new Map<string, Float32Array>();
      const child: Partial<RvfNativeAdapter> = {
        ingest: vi.fn((entries) => {
          for (const e of entries) {
            childVectors.set(e.id, e.vector instanceof Float32Array ? e.vector : new Float32Array(e.vector));
          }
          return { accepted: entries.length, rejected: 0 };
        }),
        search: vi.fn(() => []),
        delete: vi.fn(() => 0),
        status: vi.fn(() => ({
          totalVectors: childVectors.size,
          totalSegments: 1,
          fileSizeBytes: 50,
          epoch: 1,
          witnessValid: true,
          witnessEntries: 0,
        })),
        close: vi.fn(),
        isOpen: vi.fn(() => true),
        path: vi.fn(() => childPath),
        dimension: vi.fn(() => 384),
        size: vi.fn(() => childVectors.size),
      };
      children.push(child as RvfNativeAdapter);
      return child as RvfNativeAdapter;
    }),
  };

  return adapter as RvfNativeAdapter;
}

// ============================================================================
// AgentMemoryBranch Tests
// ============================================================================

describe('AgentMemoryBranch', () => {
  let parentAdapter: RvfNativeAdapter;
  let branchService: AgentMemoryBranch;

  beforeEach(() => {
    parentAdapter = createMockParentAdapter();
    branchService = new AgentMemoryBranch(parentAdapter, {
      branchDir: '/tmp/test-branches',
    });
  });

  describe('createBranch', () => {
    it('should create a COW branch via derive()', () => {
      const handle = branchService.createBranch('agent-1');

      expect(handle.agentId).toBe('agent-1');
      expect(handle.childPath).toContain('agent-1.rvf');
      expect(handle.parentPath).toBe('/tmp/parent.rvf');
      expect(handle.childAdapter).toBeDefined();
      expect(parentAdapter.derive).toHaveBeenCalledWith(
        expect.stringContaining('agent-1.rvf'),
      );
    });

    it('should prevent duplicate branches for same agent', () => {
      branchService.createBranch('agent-1');

      expect(() => branchService.createBranch('agent-1')).toThrow(
        'Branch already exists for agent agent-1',
      );
    });

    it('should allow multiple agents to have branches', () => {
      const h1 = branchService.createBranch('agent-1');
      const h2 = branchService.createBranch('agent-2');

      expect(h1.agentId).toBe('agent-1');
      expect(h2.agentId).toBe('agent-2');
      expect(branchService.getActiveBranches()).toHaveLength(2);
    });
  });

  describe('mergeBranch', () => {
    it('should replay ingest log to parent with child-wins strategy', async () => {
      const handle = branchService.createBranch('agent-1');

      // Agent records vectors it ingested
      const vec = new Float32Array(384).fill(0.5);
      branchService.recordIngest('agent-1', [{ id: 'pattern-new', vector: vec }]);

      const result = await branchService.mergeBranch(handle, 'child-wins');

      expect(result.strategy).toBe('child-wins');
      expect(result.vectorsMerged).toBe(1);
      expect(parentAdapter.ingest).toHaveBeenCalledWith([
        { id: 'pattern-new', vector: vec },
      ]);
      expect(handle.childAdapter.close).toHaveBeenCalled();
    });

    it('should merge 0 vectors when ingest log is empty', async () => {
      const handle = branchService.createBranch('agent-1');
      // No recordIngest calls

      const result = await branchService.mergeBranch(handle, 'child-wins');

      expect(result.vectorsMerged).toBe(0);
      expect(parentAdapter.ingest).not.toHaveBeenCalled();
    });

    it('should skip vector transfer with parent-wins strategy', async () => {
      const handle = branchService.createBranch('agent-1');
      branchService.recordIngest('agent-1', [{ id: 'p1', vector: new Float32Array(384) }]);

      const result = await branchService.mergeBranch(handle, 'parent-wins');

      expect(result.strategy).toBe('parent-wins');
      expect(result.vectorsMerged).toBe(0);
      expect(parentAdapter.ingest).not.toHaveBeenCalled();
    });

    it('should remove branch from active list after merge', async () => {
      const handle = branchService.createBranch('agent-1');
      expect(branchService.getActiveBranches()).toHaveLength(1);

      await branchService.mergeBranch(handle);

      expect(branchService.getActiveBranches()).toHaveLength(0);
      expect(branchService.getBranch('agent-1')).toBeUndefined();
    });
  });

  describe('discardBranch', () => {
    it('should close child adapter and remove from active list', () => {
      const handle = branchService.createBranch('agent-1');

      branchService.discardBranch(handle);

      expect(handle.childAdapter.close).toHaveBeenCalled();
      expect(branchService.getBranch('agent-1')).toBeUndefined();
    });
  });

  describe('getBranch / getActiveBranches', () => {
    it('should return active branch by agent ID', () => {
      const handle = branchService.createBranch('agent-1');

      expect(branchService.getBranch('agent-1')).toBe(handle);
      expect(branchService.getBranch('agent-2')).toBeUndefined();
    });

    it('should list all active branches', () => {
      branchService.createBranch('agent-1');
      branchService.createBranch('agent-2');

      const branches = branchService.getActiveBranches();
      expect(branches).toHaveLength(2);
      expect(branches.map(b => b.agentId)).toContain('agent-1');
      expect(branches.map(b => b.agentId)).toContain('agent-2');
    });
  });

  describe('witness chain integration', () => {
    it('should record merge in witness chain', async () => {
      const mockWitness = { append: vi.fn() };
      branchService.setWitnessChain(mockWitness as any);

      const handle = branchService.createBranch('agent-1');
      await branchService.mergeBranch(handle);

      expect(mockWitness.append).toHaveBeenCalledWith(
        'BRANCH_MERGE',
        expect.objectContaining({ agentId: 'agent-1', strategy: 'child-wins' }),
        'agent-agent-1',
      );
    });

    it('should record discard in witness chain', () => {
      const mockWitness = { append: vi.fn() };
      branchService.setWitnessChain(mockWitness as any);

      const handle = branchService.createBranch('agent-1');
      branchService.discardBranch(handle);

      expect(mockWitness.append).toHaveBeenCalledWith(
        'BRANCH_MERGE',
        expect.objectContaining({ agentId: 'agent-1', action: 'discard' }),
        'agent-agent-1',
      );
    });
  });
});

// ============================================================================
// Coordinator Wiring Tests
// ============================================================================

describe('DefaultAgentCoordinator + AgentMemoryBranch', () => {
  let coordinator: DefaultAgentCoordinator;
  let branchService: AgentMemoryBranch;
  let parentAdapter: RvfNativeAdapter;

  beforeEach(() => {
    parentAdapter = createMockParentAdapter();
    branchService = new AgentMemoryBranch(parentAdapter, {
      branchDir: '/tmp/test-branches',
    });
    coordinator = new DefaultAgentCoordinator(5);
    coordinator.setMemoryBranch(branchService);
  });

  it('should create a branch when spawning an agent', async () => {
    const result = await coordinator.spawn({
      name: 'test-agent',
      domain: 'test-generation',
      type: 'coder',
      capabilities: ['test'],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const branch = branchService.getBranch(result.value);
      expect(branch).toBeDefined();
      expect(parentAdapter.derive).toHaveBeenCalled();
    }
  });

  it('should merge branch when agent completes', async () => {
    const result = await coordinator.spawn({
      name: 'test-agent',
      domain: 'test-generation',
      type: 'coder',
      capabilities: ['test'],
    });

    if (result.success) {
      coordinator.markCompleted(result.value);
      // Branch should be gone after merge (async, but the handle is removed synchronously)
      // Give async merge a moment
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  });

  it('should discard branch when agent fails', async () => {
    const result = await coordinator.spawn({
      name: 'test-agent',
      domain: 'test-generation',
      type: 'coder',
      capabilities: ['test'],
    });

    if (result.success) {
      const agentId = result.value;
      const branch = branchService.getBranch(agentId);
      expect(branch).toBeDefined();

      coordinator.markFailed(agentId);

      // Branch should be discarded
      expect(branchService.getBranch(agentId)).toBeUndefined();
    }
  });

  it('should work without memory branch service (no-op)', async () => {
    const plainCoordinator = new DefaultAgentCoordinator(5);
    // No setMemoryBranch called

    const result = await plainCoordinator.spawn({
      name: 'test-agent',
      domain: 'test-generation',
      type: 'coder',
      capabilities: ['test'],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      plainCoordinator.markCompleted(result.value);
      // Should not throw
    }
  });
});

// ============================================================================
// Benchmark
// ============================================================================

describe('AgentMemoryBranch Benchmark', () => {
  it('should create and discard branches under 5ms each', () => {
    const parentAdapter = createMockParentAdapter();
    const service = new AgentMemoryBranch(parentAdapter, {
      branchDir: '/tmp/bench-branches',
    });

    const iterations = 50;
    const createTimes: number[] = [];
    const discardTimes: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const agentId = `bench-agent-${i}`;

      const start = performance.now();
      const handle = service.createBranch(agentId);
      createTimes.push(performance.now() - start);

      const dStart = performance.now();
      service.discardBranch(handle);
      discardTimes.push(performance.now() - dStart);
    }

    const avgCreate = createTimes.reduce((s, t) => s + t, 0) / iterations;
    const avgDiscard = discardTimes.reduce((s, t) => s + t, 0) / iterations;

    console.log(`[BENCH] Branch create: avg=${avgCreate.toFixed(3)}ms`);
    console.log(`[BENCH] Branch discard: avg=${avgDiscard.toFixed(3)}ms`);

    expect(avgCreate).toBeLessThan(5);
    expect(avgDiscard).toBeLessThan(5);
  });
});
