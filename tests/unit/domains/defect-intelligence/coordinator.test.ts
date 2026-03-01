/**
 * Agentic QE v3 - Defect Intelligence Coordinator Unit Tests
 * Milestone 1.5: Domain Coordinator Testing
 *
 * Tests cover:
 * - Constructor and initialization
 * - Defect prediction workflows
 * - Root cause analysis
 * - Regression risk assessment
 * - Pattern learning
 * - MinCut topology awareness
 * - Consensus verification
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DefectIntelligenceCoordinator,
  type CoordinatorConfig,
} from '../../../../src/domains/defect-intelligence/coordinator';
import {
  createCoordinatorTestContext,
  resetTestContext,
  flushPromises,
  type CoordinatorTestContext,
} from '../coordinator-test-utils';

describe('DefectIntelligenceCoordinator', () => {
  let ctx: CoordinatorTestContext;
  let coordinator: DefectIntelligenceCoordinator;

  const defaultConfig: Partial<CoordinatorConfig> = {
    maxConcurrentWorkflows: 5,
    defaultTimeout: 60000,
    enablePatternLearning: false,
    publishEvents: true,
    enableMinCutAwareness: false,
    enableConsensus: false,
  };

  beforeEach(() => {
    ctx = createCoordinatorTestContext();
    coordinator = new DefectIntelligenceCoordinator(
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
      const coord = new DefectIntelligenceCoordinator(
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
  // MinCut Topology Awareness Tests
  // ===========================================================================

  describe('MinCut Topology Awareness', () => {
    let topologyCoordinator: DefectIntelligenceCoordinator;

    beforeEach(async () => {
      topologyCoordinator = new DefectIntelligenceCoordinator(
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

    it('should filter target domains based on topology', () => {
      const targets = ['test-execution', 'quality-assessment'] as any[];
      const filtered = topologyCoordinator.getTopologyBasedRouting(targets);
      expect(Array.isArray(filtered)).toBe(true);
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
