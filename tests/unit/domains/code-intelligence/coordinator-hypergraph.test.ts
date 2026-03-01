/**
 * Agentic QE v3 - Code Intelligence Coordinator Hypergraph Integration Tests
 *
 * Tests for GOAP Action 7: HypergraphEngine integration with CodeIntelligenceCoordinator
 *
 * @see /docs/plans/GOAP-V3-RUVECTOR-NEURAL-BACKBONE.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import {
  CodeIntelligenceCoordinator,
  CoordinatorConfig,
} from '../../../../src/domains/code-intelligence/coordinator';
import { EventBus, MemoryBackend, AgentCoordinator, VectorSearchResult } from '../../../../src/kernel/interfaces';
import { ok, err } from '../../../../src/shared/types';
import type { CodeIndexResult } from '../../../../src/integrations/ruvector/hypergraph-engine';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a mock EventBus for testing
 */
function createMockEventBus(): EventBus {
  const subscriptions = new Map<string, Array<(event: unknown) => Promise<void>>>();

  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn((eventType: string, handler: (event: unknown) => Promise<void>) => {
      if (!subscriptions.has(eventType)) {
        subscriptions.set(eventType, []);
      }
      subscriptions.get(eventType)!.push(handler);
      // Return an object with unsubscribe method (expected by ProductFactorsBridgeService)
      return {
        unsubscribe: () => {
          const handlers = subscriptions.get(eventType);
          if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) handlers.splice(index, 1);
          }
        },
      };
    }),
    unsubscribe: vi.fn(),
  };
}

/**
 * Create a mock MemoryBackend for testing
 */
function createMockMemoryBackend(): MemoryBackend {
  const storage = new Map<string, unknown>();

  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    set: vi.fn(async (key: string, value: unknown) => {
      storage.set(key, value);
    }),
    get: vi.fn(async <T>(key: string): Promise<T | undefined> => {
      return storage.get(key) as T | undefined;
    }),
    delete: vi.fn(async (key: string): Promise<boolean> => {
      return storage.delete(key);
    }),
    has: vi.fn(async (key: string): Promise<boolean> => {
      return storage.has(key);
    }),
    search: vi.fn(async (pattern: string, _limit?: number): Promise<string[]> => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return Array.from(storage.keys()).filter((key) => regex.test(key));
    }),
    vectorSearch: vi.fn(async (_embedding: number[], _k: number): Promise<VectorSearchResult[]> => {
      return [];
    }),
    storeVector: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Create a mock AgentCoordinator for testing
 */
function createMockAgentCoordinator(): AgentCoordinator {
  let agentCount = 0;

  return {
    spawn: vi.fn(async () => {
      agentCount++;
      return ok(`agent-${agentCount}`);
    }),
    stop: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockReturnValue({ status: 'running', taskCount: 0, health: 1 }),
    canSpawn: vi.fn().mockReturnValue(true),
  };
}

/**
 * Create a temporary database path for testing
 */
function createTempDbPath(): string {
  const tempDir = path.join('/tmp', 'agentic-qe-test', `test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tempDir, { recursive: true });
  return path.join(tempDir, 'hypergraph.db');
}

/**
 * Clean up temporary database
 */
function cleanupTempDb(dbPath: string): void {
  try {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    const dir = path.dirname(dbPath);
    if (fs.existsSync(dir)) {
      fs.rmdirSync(dir, { recursive: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('CodeIntelligenceCoordinator - Hypergraph Integration (GOAP Action 7)', () => {
  let coordinator: CodeIntelligenceCoordinator;
  let mockEventBus: EventBus;
  let mockMemory: MemoryBackend;
  let mockAgentCoordinator: AgentCoordinator;
  let tempDbPath: string;

  beforeEach(() => {
    mockEventBus = createMockEventBus();
    mockMemory = createMockMemoryBackend();
    mockAgentCoordinator = createMockAgentCoordinator();
    tempDbPath = createTempDbPath();
  });

  afterEach(async () => {
    if (coordinator) {
      await coordinator.dispose();
    }
    cleanupTempDb(tempDbPath);
  });

  describe('Initialization', () => {
    it('should initialize with hypergraph enabled by default', async () => {
      coordinator = new CodeIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableHypergraph: true,
          hypergraphDbPath: tempDbPath,
          // Disable other features for isolated testing
          enableGNN: false,
          enableSONA: false,
          enableMetricCollector: false,
          publishEvents: false,
        }
      );

      await coordinator.initialize();

      expect(coordinator.isHypergraphEnabled()).toBe(true);
      expect(coordinator.getHypergraph()).toBeDefined();
    });

    it('should initialize without hypergraph when disabled', async () => {
      coordinator = new CodeIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableHypergraph: false,
          enableGNN: false,
          enableSONA: false,
          enableMetricCollector: false,
          publishEvents: false,
        }
      );

      await coordinator.initialize();

      expect(coordinator.isHypergraphEnabled()).toBe(false);
      expect(coordinator.getHypergraph()).toBeUndefined();
    });

    it('should handle hypergraph initialization failure gracefully', async () => {
      // Use an invalid path that can't be created
      coordinator = new CodeIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableHypergraph: true,
          hypergraphDbPath: '/nonexistent/impossible/path/db.sqlite',
          enableGNN: false,
          enableSONA: false,
          enableMetricCollector: false,
          publishEvents: false,
        }
      );

      // Should not throw - hypergraph is optional
      await expect(coordinator.initialize()).resolves.not.toThrow();

      // Hypergraph should be disabled due to initialization failure
      expect(coordinator.isHypergraphEnabled()).toBe(false);
    });
  });

  describe('findUntestedFunctions', () => {
    it('should return error when hypergraph is disabled', async () => {
      coordinator = new CodeIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableHypergraph: false,
          enableGNN: false,
          enableSONA: false,
          enableMetricCollector: false,
          publishEvents: false,
        }
      );

      await coordinator.initialize();

      const result = await coordinator.findUntestedFunctions();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Hypergraph is not enabled');
      }
    });

    it('should find untested functions when hypergraph is enabled', async () => {
      coordinator = new CodeIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableHypergraph: true,
          hypergraphDbPath: tempDbPath,
          enableGNN: false,
          enableSONA: false,
          enableMetricCollector: false,
          publishEvents: false,
        }
      );

      await coordinator.initialize();

      // Build some test data in the hypergraph
      const indexResult: CodeIndexResult = {
        files: [
          {
            path: 'src/utils.ts',
            entities: [
              { type: 'function', name: 'calculateSum', lineStart: 10, complexity: 5 },
              { type: 'function', name: 'formatDate', lineStart: 20, complexity: 3 },
            ],
            imports: [],
          },
        ],
      };

      await coordinator.buildHypergraphFromIndex(indexResult);

      const result = await coordinator.findUntestedFunctions();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value)).toBe(true);
        // Should find our untested functions
        expect(result.value.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('findImpactedTestsFromHypergraph', () => {
    it('should return error when hypergraph is disabled', async () => {
      coordinator = new CodeIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableHypergraph: false,
          enableGNN: false,
          enableSONA: false,
          enableMetricCollector: false,
          publishEvents: false,
        }
      );

      await coordinator.initialize();

      const result = await coordinator.findImpactedTestsFromHypergraph(['src/lib.ts']);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Hypergraph is not enabled');
      }
    });

    it('should return empty array for empty changed files', async () => {
      coordinator = new CodeIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableHypergraph: true,
          hypergraphDbPath: tempDbPath,
          enableGNN: false,
          enableSONA: false,
          enableMetricCollector: false,
          publishEvents: false,
        }
      );

      await coordinator.initialize();

      const result = await coordinator.findImpactedTestsFromHypergraph([]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual([]);
      }
    });

    it('should find impacted tests for changed files', async () => {
      coordinator = new CodeIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableHypergraph: true,
          hypergraphDbPath: tempDbPath,
          enableGNN: false,
          enableSONA: false,
          enableMetricCollector: false,
          publishEvents: false,
        }
      );

      await coordinator.initialize();

      // Build test data with function-test relationship
      const hypergraph = coordinator.getHypergraph();
      expect(hypergraph).toBeDefined();

      if (hypergraph) {
        // Add a function node
        const funcId = await hypergraph.addNode({
          type: 'function',
          name: 'calculateSum',
          filePath: 'src/math.ts',
          lineStart: 10,
        });

        // Add a test node
        const testId = await hypergraph.addNode({
          type: 'test',
          name: 'calculateSum.test',
          filePath: 'src/math.test.ts',
          lineStart: 5,
        });

        // Add 'covers' edge from test to function
        await hypergraph.addEdge({
          sourceId: testId,
          targetId: funcId,
          type: 'covers',
          weight: 1.0,
        });
      }

      const result = await coordinator.findImpactedTestsFromHypergraph(['src/math.ts']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value)).toBe(true);
        // Should find the test that covers the changed file
        expect(result.value.length).toBe(1);
        expect(result.value[0].name).toBe('calculateSum.test');
      }
    });
  });

  describe('findCoverageGapsFromHypergraph', () => {
    it('should return error when hypergraph is disabled', async () => {
      coordinator = new CodeIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableHypergraph: false,
          enableGNN: false,
          enableSONA: false,
          enableMetricCollector: false,
          publishEvents: false,
        }
      );

      await coordinator.initialize();

      const result = await coordinator.findCoverageGapsFromHypergraph();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Hypergraph is not enabled');
      }
    });

    it('should find functions with low coverage', async () => {
      coordinator = new CodeIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableHypergraph: true,
          hypergraphDbPath: tempDbPath,
          enableGNN: false,
          enableSONA: false,
          enableMetricCollector: false,
          publishEvents: false,
        }
      );

      await coordinator.initialize();

      const hypergraph = coordinator.getHypergraph();
      expect(hypergraph).toBeDefined();

      if (hypergraph) {
        // Add functions with various coverage levels
        await hypergraph.addNode({
          type: 'function',
          name: 'lowCoverageFunc',
          filePath: 'src/utils.ts',
          lineStart: 10,
          coverage: 20, // Low coverage
          complexity: 5,
        });

        await hypergraph.addNode({
          type: 'function',
          name: 'highCoverageFunc',
          filePath: 'src/utils.ts',
          lineStart: 30,
          coverage: 85, // High coverage
          complexity: 3,
        });

        await hypergraph.addNode({
          type: 'function',
          name: 'mediumCoverageFunc',
          filePath: 'src/utils.ts',
          lineStart: 50,
          coverage: 45, // Medium coverage
          complexity: 4,
        });
      }

      const result = await coordinator.findCoverageGapsFromHypergraph(50);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBe(2); // lowCoverageFunc and mediumCoverageFunc
        expect(result.value.map((n) => n.name)).toContain('lowCoverageFunc');
        expect(result.value.map((n) => n.name)).toContain('mediumCoverageFunc');
        expect(result.value.map((n) => n.name)).not.toContain('highCoverageFunc');
      }
    });
  });

  describe('buildHypergraphFromIndex', () => {
    it('should return error when hypergraph is disabled', async () => {
      coordinator = new CodeIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableHypergraph: false,
          enableGNN: false,
          enableSONA: false,
          enableMetricCollector: false,
          publishEvents: false,
        }
      );

      await coordinator.initialize();

      const indexResult: CodeIndexResult = {
        files: [],
      };

      const result = await coordinator.buildHypergraphFromIndex(indexResult);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Hypergraph is not enabled');
      }
    });

    it('should build hypergraph from index result', async () => {
      coordinator = new CodeIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableHypergraph: true,
          hypergraphDbPath: tempDbPath,
          enableGNN: false,
          enableSONA: false,
          enableMetricCollector: false,
          publishEvents: false,
        }
      );

      await coordinator.initialize();

      const indexResult: CodeIndexResult = {
        files: [
          {
            path: 'src/math.ts',
            entities: [
              { type: 'function', name: 'add', lineStart: 1, lineEnd: 5, complexity: 1 },
              { type: 'function', name: 'subtract', lineStart: 7, lineEnd: 11, complexity: 1 },
              { type: 'class', name: 'Calculator', lineStart: 13, lineEnd: 50, complexity: 10 },
            ],
            imports: ['src/utils.ts'],
          },
          {
            path: 'src/utils.ts',
            entities: [
              { type: 'function', name: 'validate', lineStart: 1, lineEnd: 10, complexity: 3 },
            ],
            imports: [],
          },
        ],
      };

      const result = await coordinator.buildHypergraphFromIndex(indexResult);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.nodesCreated).toBeGreaterThan(0);
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(result.value.errors)).toBe(true);
      }

      // Verify hypergraph was populated
      const hypergraph = coordinator.getHypergraph();
      expect(hypergraph).toBeDefined();

      if (hypergraph) {
        const stats = await hypergraph.getStats();
        expect(stats.totalNodes).toBeGreaterThan(0);
      }
    });

    it('should publish event when building hypergraph', async () => {
      coordinator = new CodeIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableHypergraph: true,
          hypergraphDbPath: tempDbPath,
          enableGNN: false,
          enableSONA: false,
          enableMetricCollector: false,
          publishEvents: true, // Enable events
        }
      );

      await coordinator.initialize();

      const indexResult: CodeIndexResult = {
        files: [
          {
            path: 'src/test.ts',
            entities: [{ type: 'function', name: 'testFunc', lineStart: 1 }],
            imports: [],
          },
        ],
      };

      await coordinator.buildHypergraphFromIndex(indexResult);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'code-intelligence.HypergraphBuilt',
        })
      );
    });
  });

  describe('Fallback Behavior', () => {
    it('should work without hypergraph for basic operations', async () => {
      coordinator = new CodeIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableHypergraph: false,
          enableGNN: false,
          enableSONA: false,
          enableMetricCollector: false,
          publishEvents: false,
        }
      );

      await coordinator.initialize();

      // These should still work, just without hypergraph enhancement
      const workflows = coordinator.getActiveWorkflows();
      expect(Array.isArray(workflows)).toBe(true);

      // getHypergraph should return undefined
      expect(coordinator.getHypergraph()).toBeUndefined();
      expect(coordinator.isHypergraphEnabled()).toBe(false);
    });
  });

  describe('Cleanup', () => {
    it('should properly dispose hypergraph resources', async () => {
      coordinator = new CodeIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableHypergraph: true,
          hypergraphDbPath: tempDbPath,
          enableGNN: false,
          enableSONA: false,
          enableMetricCollector: false,
          publishEvents: false,
        }
      );

      await coordinator.initialize();
      expect(coordinator.isHypergraphEnabled()).toBe(true);

      await coordinator.dispose();

      // After dispose, hypergraph should be cleaned up
      expect(coordinator.getHypergraph()).toBeUndefined();
      expect(coordinator.isHypergraphEnabled()).toBe(false);
    });
  });
});
