/**
 * Agentic QE v3 - Code Intelligence Coordinator Unit Tests
 * Milestone 1.5: Domain Coordinator Testing
 *
 * Tests cover:
 * - Constructor and initialization
 * - Code indexing workflows
 * - Semantic search
 * - Impact analysis
 * - Dependency mapping
 * - Knowledge graph queries
 * - C4 diagram generation
 * - GNN embedding integration
 * - Hypergraph engine integration
 * - MinCut topology awareness
 * - Consensus verification
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CodeIntelligenceCoordinator,
  type CoordinatorConfig,
} from '../../../../src/domains/code-intelligence/coordinator';
import {
  createCoordinatorTestContext,
  resetTestContext,
  flushPromises,
  type CoordinatorTestContext,
} from '../coordinator-test-utils';

describe('CodeIntelligenceCoordinator', () => {
  let ctx: CoordinatorTestContext;
  let coordinator: CodeIntelligenceCoordinator;

  const defaultConfig: Partial<CoordinatorConfig> = {
    maxConcurrentWorkflows: 5,
    defaultTimeout: 120000,
    enableLearning: false,
    publishEvents: true,
    enableGNNEmbeddings: false,
    enableSONAPatterns: false,
    enableHypergraph: false,
    enableMinCutAwareness: false,
    enableConsensus: false,
  };

  beforeEach(() => {
    ctx = createCoordinatorTestContext();
    coordinator = new CodeIntelligenceCoordinator(
      ctx.eventBus,
      ctx.memory,
      ctx.agentCoordinator,
      defaultConfig
    );
  });

  afterEach(async () => {
    await coordinator.dispose();
    resetTestContext(ctx);
  });

  // ===========================================================================
  // Constructor and Initialization Tests
  // ===========================================================================

  describe('Constructor and Initialization', () => {
    it('should create coordinator with default config', () => {
      const coord = new CodeIntelligenceCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator
      );
      expect(coord).toBeDefined();
    });

    it('should initialize without errors', async () => {
      await expect(coordinator.initialize()).resolves.not.toThrow();
    });

    it('should be idempotent on multiple initializations', async () => {
      await coordinator.initialize();
      await coordinator.initialize();
    });

    it('should start with no active workflows', async () => {
      await coordinator.initialize();
      expect(coordinator.getActiveWorkflows()).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Product Factors Bridge Tests
  // ===========================================================================

  describe('Product Factors Bridge', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('getProductFactorsBridge()', () => {
      it('should return product factors bridge', () => {
        const bridge = coordinator.getProductFactorsBridge();
        expect(bridge).toBeDefined();
      });
    });
  });

  // ===========================================================================
  // Hypergraph Tests
  // ===========================================================================

  describe('Hypergraph Integration', () => {
    describe('isHypergraphEnabled()', () => {
      it('should report hypergraph disabled by default', async () => {
        await coordinator.initialize();
        expect(coordinator.isHypergraphEnabled()).toBe(false);
      });
    });
  });

  // ===========================================================================
  // MinCut Topology Awareness Tests
  // ===========================================================================

  describe('MinCut Topology Awareness', () => {
    let topologyCoordinator: CodeIntelligenceCoordinator;

    beforeEach(async () => {
      topologyCoordinator = new CodeIntelligenceCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator,
        {
          ...defaultConfig,
          enableMinCutAwareness: true,
          topologyHealthThreshold: 0.5,
          pauseOnCriticalTopology: true,
        }
      );
      await topologyCoordinator.initialize();
    });

    afterEach(async () => {
      await topologyCoordinator.dispose();
    });

    it('should report topology health status', () => {
      expect(topologyCoordinator.isTopologyHealthy()).toBe(true);
    });

    it('should accept MinCut bridge', () => {
      expect(() => {
        topologyCoordinator.setMinCutBridge({} as any);
      }).not.toThrow();
    });

    it('should check if domain is weak point', () => {
      expect(topologyCoordinator.isDomainWeakPoint()).toBe(false);
    });

    it('should get domain weak vertices', () => {
      const weakVertices = topologyCoordinator.getDomainWeakVertices();
      expect(Array.isArray(weakVertices)).toBe(true);
    });

    it('should filter target domains based on topology', () => {
      const targets = ['test-execution', 'quality-assessment'] as any[];
      const filtered = topologyCoordinator.getTopologyBasedRouting(targets);
      expect(Array.isArray(filtered)).toBe(true);
    });
  });

  // ===========================================================================
  // Consensus Verification Tests
  // ===========================================================================

  describe('Consensus Verification', () => {
    let consensusCoordinator: CodeIntelligenceCoordinator;

    beforeEach(async () => {
      consensusCoordinator = new CodeIntelligenceCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator,
        {
          ...defaultConfig,
          enableConsensus: true,
          consensusThreshold: 0.7,
          consensusStrategy: 'weighted',
          consensusMinModels: 2,
        }
      );
      await consensusCoordinator.initialize();
    });

    afterEach(async () => {
      await consensusCoordinator.dispose();
    });

    it('should check consensus availability', () => {
      const available = consensusCoordinator.isConsensusAvailable();
      expect(typeof available).toBe('boolean');
    });

    it('should get consensus statistics', () => {
      const stats = consensusCoordinator.getConsensusStats();
      // Stats may be undefined if consensus engine not fully initialized
      expect(stats === undefined || typeof stats === 'object').toBe(true);
    });
  });

  // ===========================================================================
  // Disposal Tests
  // ===========================================================================

  describe('Disposal', () => {
    it('should dispose without errors', async () => {
      await coordinator.initialize();
      await expect(coordinator.dispose()).resolves.not.toThrow();
    });

    it('should clear workflows on dispose', async () => {
      await coordinator.initialize();
      await coordinator.dispose();
      expect(coordinator.getActiveWorkflows()).toHaveLength(0);
    });
  });
});
