/**
 * Unit tests for MinCutAwareDomainMixin
 * ADR-047: MinCut Self-Organizing QE Integration
 *
 * Tests the MinCut-aware domain mixin for topology-based routing
 * and health monitoring in domain coordinators.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MinCutAwareDomainMixin,
  createMinCutAwareMixin,
  isMinCutAwareDomain,
  DEFAULT_MINCUT_AWARE_CONFIG,
  IMinCutAwareDomain,
  MinCutAwareConfig,
} from '../../../../src/coordination/mixins/mincut-aware-domain';
import { QueenMinCutBridge } from '../../../../src/coordination/mincut/queen-integration';
import { MinCutHealth, WeakVertex, SwarmVertex } from '../../../../src/coordination/mincut/interfaces';
import { DomainName } from '../../../../src/shared/types';

// ============================================================================
// Mock Factory
// ============================================================================

function createMockBridge(options: {
  health?: Partial<MinCutHealth>;
  weakVertices?: WeakVertex[];
  minCutValue?: number;
} = {}): QueenMinCutBridge {
  const defaultHealth: MinCutHealth = {
    status: 'healthy',
    minCutValue: 5.0,
    healthyThreshold: 3.0,
    warningThreshold: 2.0,
    weakVertexCount: 0,
    topWeakVertices: [],
    trend: 'stable',
    history: [],
    lastUpdated: new Date(),
    ...options.health,
  };

  return {
    getMinCutHealth: vi.fn(() => ({ ...defaultHealth, ...options.health })),
    getWeakVertices: vi.fn(() => options.weakVertices ?? []),
    getMinCutValue: vi.fn(() => options.minCutValue ?? defaultHealth.minCutValue),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as unknown as QueenMinCutBridge;
}

function createMockWeakVertex(
  id: string,
  domain: DomainName,
  riskScore: number = 0.5
): WeakVertex {
  const vertex: SwarmVertex = {
    id,
    type: 'agent',
    domain,
    weight: 1.0,
    createdAt: new Date(),
  };

  return {
    vertexId: id,
    vertex,
    weightedDegree: 1.0,
    riskScore,
    reason: 'Low connectivity',
    suggestions: [],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('MinCutAwareDomainMixin', () => {
  let mixin: MinCutAwareDomainMixin;
  let mockBridge: QueenMinCutBridge;

  beforeEach(() => {
    vi.useFakeTimers();
    mockBridge = createMockBridge();
    mixin = createMinCutAwareMixin('test-generation');
  });

  afterEach(() => {
    mixin.dispose();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Construction & Configuration
  // ==========================================================================

  describe('Construction', () => {
    it('should create mixin with domain name', () => {
      expect(mixin).toBeDefined();
      expect(mixin.getDomainName()).toBe('test-generation');
    });

    it('should create mixin with default config', () => {
      const config = mixin.getConfig();
      expect(config.enableMinCutAwareness).toBe(true);
      expect(config.topologyHealthThreshold).toBe(0.7);
      expect(config.pauseOnCriticalTopology).toBe(false);
      expect(config.monitoredDomains).toEqual([]);
    });

    it('should create mixin with custom config', () => {
      const customMixin = createMinCutAwareMixin('test-execution', {
        enableMinCutAwareness: false,
        topologyHealthThreshold: 0.9,
        pauseOnCriticalTopology: true,
        monitoredDomains: ['test-generation', 'coverage-analysis'],
      });

      const config = customMixin.getConfig();
      expect(config.enableMinCutAwareness).toBe(false);
      expect(config.topologyHealthThreshold).toBe(0.9);
      expect(config.pauseOnCriticalTopology).toBe(true);
      expect(config.monitoredDomains).toEqual(['test-generation', 'coverage-analysis']);

      customMixin.dispose();
    });

    it('should expose default config constant', () => {
      expect(DEFAULT_MINCUT_AWARE_CONFIG).toBeDefined();
      expect(DEFAULT_MINCUT_AWARE_CONFIG.enableMinCutAwareness).toBe(true);
      expect(DEFAULT_MINCUT_AWARE_CONFIG.topologyHealthThreshold).toBe(0.7);
    });
  });

  // ==========================================================================
  // Bridge Management
  // ==========================================================================

  describe('Bridge Management', () => {
    it('should not have bridge initially', () => {
      expect(mixin.hasBridge()).toBe(false);
      expect(mixin.getMinCutBridge()).toBeNull();
    });

    it('should set bridge via dependency injection', () => {
      mixin.setMinCutBridge(mockBridge);

      expect(mixin.hasBridge()).toBe(true);
      expect(mixin.getMinCutBridge()).toBe(mockBridge);
    });

    it('should replace existing bridge', () => {
      const bridge1 = createMockBridge();
      const bridge2 = createMockBridge();

      mixin.setMinCutBridge(bridge1);
      expect(mixin.getMinCutBridge()).toBe(bridge1);

      mixin.setMinCutBridge(bridge2);
      expect(mixin.getMinCutBridge()).toBe(bridge2);
    });
  });

  // ==========================================================================
  // isTopologyHealthy
  // ==========================================================================

  describe('isTopologyHealthy', () => {
    it('should return true when no bridge is set', () => {
      expect(mixin.isTopologyHealthy()).toBe(true);
    });

    it('should return true when awareness is disabled', () => {
      mixin.updateConfig({ enableMinCutAwareness: false });
      mixin.setMinCutBridge(createMockBridge({ health: { status: 'critical' } }));

      expect(mixin.isTopologyHealthy()).toBe(true);
    });

    it('should return true when status is healthy', () => {
      mixin.setMinCutBridge(createMockBridge({ health: { status: 'healthy' } }));

      expect(mixin.isTopologyHealthy()).toBe(true);
    });

    it('should return true when status is warning', () => {
      mixin.setMinCutBridge(createMockBridge({ health: { status: 'warning' } }));

      expect(mixin.isTopologyHealthy()).toBe(true);
    });

    it('should return true when status is idle', () => {
      mixin.setMinCutBridge(createMockBridge({ health: { status: 'idle' } }));

      expect(mixin.isTopologyHealthy()).toBe(true);
    });

    it('should return false when status is critical', () => {
      mixin.setMinCutBridge(createMockBridge({ health: { status: 'critical' } }));

      expect(mixin.isTopologyHealthy()).toBe(false);
    });
  });

  // ==========================================================================
  // getDomainWeakVertices
  // ==========================================================================

  describe('getDomainWeakVertices', () => {
    it('should return empty array when no bridge', () => {
      expect(mixin.getDomainWeakVertices()).toEqual([]);
    });

    it('should return empty array when no weak vertices', () => {
      mixin.setMinCutBridge(createMockBridge({ weakVertices: [] }));

      expect(mixin.getDomainWeakVertices()).toEqual([]);
    });

    it('should filter weak vertices by domain', () => {
      const weakVertices: WeakVertex[] = [
        createMockWeakVertex('agent-1', 'test-generation'),
        createMockWeakVertex('agent-2', 'test-execution'),
        createMockWeakVertex('agent-3', 'test-generation'),
        createMockWeakVertex('agent-4', 'coverage-analysis'),
      ];

      mixin.setMinCutBridge(createMockBridge({ weakVertices }));

      const domainWeakVertices = mixin.getDomainWeakVertices();
      expect(domainWeakVertices).toHaveLength(2);
      expect(domainWeakVertices.map(v => v.vertexId)).toContain('agent-1');
      expect(domainWeakVertices.map(v => v.vertexId)).toContain('agent-3');
    });

    it('should return empty array when no weak vertices match domain', () => {
      const weakVertices: WeakVertex[] = [
        createMockWeakVertex('agent-1', 'test-execution'),
        createMockWeakVertex('agent-2', 'coverage-analysis'),
      ];

      mixin.setMinCutBridge(createMockBridge({ weakVertices }));

      expect(mixin.getDomainWeakVertices()).toEqual([]);
    });
  });

  // ==========================================================================
  // isDomainWeakPoint
  // ==========================================================================

  describe('isDomainWeakPoint', () => {
    it('should return false when no bridge', () => {
      expect(mixin.isDomainWeakPoint()).toBe(false);
    });

    it('should return false when no weak vertices in domain', () => {
      const weakVertices: WeakVertex[] = [
        createMockWeakVertex('agent-1', 'test-execution'),
      ];

      mixin.setMinCutBridge(createMockBridge({ weakVertices }));

      expect(mixin.isDomainWeakPoint()).toBe(false);
    });

    it('should return true when domain has weak vertices', () => {
      const weakVertices: WeakVertex[] = [
        createMockWeakVertex('agent-1', 'test-generation'),
      ];

      mixin.setMinCutBridge(createMockBridge({ weakVertices }));

      expect(mixin.isDomainWeakPoint()).toBe(true);
    });
  });

  // ==========================================================================
  // getTopologyBasedRouting
  // ==========================================================================

  describe('getTopologyBasedRouting', () => {
    const targetDomains: DomainName[] = [
      'test-generation',
      'test-execution',
      'coverage-analysis',
      'quality-assessment',
    ];

    it('should return all domains when no bridge', () => {
      const result = mixin.getTopologyBasedRouting(targetDomains);
      expect(result).toEqual(targetDomains);
    });

    it('should return all domains when awareness disabled', () => {
      mixin.updateConfig({ enableMinCutAwareness: false });
      const weakVertices: WeakVertex[] = [
        createMockWeakVertex('agent-1', 'test-generation'),
      ];
      mixin.setMinCutBridge(createMockBridge({ weakVertices }));

      const result = mixin.getTopologyBasedRouting(targetDomains);
      expect(result).toEqual(targetDomains);
    });

    it('should return all domains when no weak vertices', () => {
      mixin.setMinCutBridge(createMockBridge({ weakVertices: [] }));

      const result = mixin.getTopologyBasedRouting(targetDomains);
      expect(result).toEqual(targetDomains);
    });

    it('should filter out weak domains', () => {
      const weakVertices: WeakVertex[] = [
        createMockWeakVertex('agent-1', 'test-generation'),
        createMockWeakVertex('agent-2', 'coverage-analysis'),
      ];
      mixin.setMinCutBridge(createMockBridge({ weakVertices }));

      const result = mixin.getTopologyBasedRouting(targetDomains);

      expect(result).toHaveLength(2);
      expect(result).toContain('test-execution');
      expect(result).toContain('quality-assessment');
      expect(result).not.toContain('test-generation');
      expect(result).not.toContain('coverage-analysis');
    });

    it('should handle all domains being weak', () => {
      const weakVertices: WeakVertex[] = targetDomains.map((domain, i) =>
        createMockWeakVertex(`agent-${i}`, domain)
      );
      mixin.setMinCutBridge(createMockBridge({ weakVertices }));

      const result = mixin.getTopologyBasedRouting(targetDomains);
      expect(result).toEqual([]);
    });
  });

  // ==========================================================================
  // onTopologyHealthChange
  // ==========================================================================

  describe('onTopologyHealthChange', () => {
    it('should subscribe to health changes', () => {
      const callback = vi.fn();

      mixin.setMinCutBridge(mockBridge);
      const unsubscribe = mixin.onTopologyHealthChange(callback);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should notify on initial subscription with immediate check', () => {
      const callback = vi.fn();

      mixin.setMinCutBridge(mockBridge);
      mixin.onTopologyHealthChange(callback);

      // Immediate check should trigger callback
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should notify on status change', () => {
      const callback = vi.fn();
      let currentStatus: MinCutHealth['status'] = 'healthy';

      const dynamicBridge = {
        ...mockBridge,
        getMinCutHealth: vi.fn(() => ({
          status: currentStatus,
          minCutValue: 5.0,
          healthyThreshold: 3.0,
          warningThreshold: 2.0,
          weakVertexCount: 0,
          topWeakVertices: [],
          trend: 'stable' as const,
          history: [],
          lastUpdated: new Date(),
        })),
      } as unknown as QueenMinCutBridge;

      mixin.setMinCutBridge(dynamicBridge);
      mixin.onTopologyHealthChange(callback);

      // Initial call
      expect(callback).toHaveBeenCalledTimes(1);

      // Simulate status change
      currentStatus = 'critical';
      vi.advanceTimersByTime(5000);

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback.mock.calls[1][0].status).toBe('critical');
    });

    it('should not notify when status stays the same', () => {
      const callback = vi.fn();

      mixin.setMinCutBridge(mockBridge);
      mixin.onTopologyHealthChange(callback);

      // Initial call
      expect(callback).toHaveBeenCalledTimes(1);

      // Advance time - status stays 'healthy'
      vi.advanceTimersByTime(5000);
      vi.advanceTimersByTime(5000);

      // Should still be 1 call since status didn't change
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should unsubscribe correctly', () => {
      const callback = vi.fn();
      let currentStatus: MinCutHealth['status'] = 'healthy';

      const dynamicBridge = {
        ...mockBridge,
        getMinCutHealth: vi.fn(() => ({
          status: currentStatus,
          minCutValue: 5.0,
          healthyThreshold: 3.0,
          warningThreshold: 2.0,
          weakVertexCount: 0,
          topWeakVertices: [],
          trend: 'stable' as const,
          history: [],
          lastUpdated: new Date(),
        })),
      } as unknown as QueenMinCutBridge;

      mixin.setMinCutBridge(dynamicBridge);
      const unsubscribe = mixin.onTopologyHealthChange(callback);

      // Initial call
      expect(callback).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      // Change status and advance time
      currentStatus = 'critical';
      vi.advanceTimersByTime(5000);

      // Should not get another call
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple subscribers', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      let currentStatus: MinCutHealth['status'] = 'healthy';

      const dynamicBridge = {
        ...mockBridge,
        getMinCutHealth: vi.fn(() => ({
          status: currentStatus,
          minCutValue: 5.0,
          healthyThreshold: 3.0,
          warningThreshold: 2.0,
          weakVertexCount: 0,
          topWeakVertices: [],
          trend: 'stable' as const,
          history: [],
          lastUpdated: new Date(),
        })),
      } as unknown as QueenMinCutBridge;

      mixin.setMinCutBridge(dynamicBridge);
      mixin.onTopologyHealthChange(callback1);

      // First subscriber gets immediate notification
      expect(callback1).toHaveBeenCalledTimes(1);

      // Add second subscriber - doesn't get immediate notification
      // because monitoring is already running and status hasn't changed
      mixin.onTopologyHealthChange(callback2);
      expect(callback2).toHaveBeenCalledTimes(0);

      // Now trigger a status change - both should be notified
      currentStatus = 'critical';
      vi.advanceTimersByTime(5000);

      expect(callback1).toHaveBeenCalledTimes(2);
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Extended Methods
  // ==========================================================================

  describe('Extended Methods', () => {
    describe('getCurrentHealth', () => {
      it('should return null when no bridge', () => {
        expect(mixin.getCurrentHealth()).toBeNull();
      });

      it('should return health from bridge', () => {
        mixin.setMinCutBridge(mockBridge);
        const health = mixin.getCurrentHealth();

        expect(health).not.toBeNull();
        expect(health?.status).toBe('healthy');
      });
    });

    describe('getMinCutValue', () => {
      it('should return null when no bridge', () => {
        expect(mixin.getMinCutValue()).toBeNull();
      });

      it('should return value from bridge', () => {
        mixin.setMinCutBridge(createMockBridge({ minCutValue: 7.5 }));

        expect(mixin.getMinCutValue()).toBe(7.5);
      });
    });

    describe('shouldPauseOperations', () => {
      it('should return false when pauseOnCriticalTopology is false', () => {
        mixin.setMinCutBridge(createMockBridge({ health: { status: 'critical' } }));

        expect(mixin.shouldPauseOperations()).toBe(false);
      });

      it('should return false when topology is healthy', () => {
        mixin.updateConfig({ pauseOnCriticalTopology: true });
        mixin.setMinCutBridge(createMockBridge({ health: { status: 'healthy' } }));

        expect(mixin.shouldPauseOperations()).toBe(false);
      });

      it('should return true when topology is critical and pause enabled', () => {
        mixin.updateConfig({ pauseOnCriticalTopology: true });
        mixin.setMinCutBridge(createMockBridge({ health: { status: 'critical' } }));

        expect(mixin.shouldPauseOperations()).toBe(true);
      });
    });

    describe('getNormalizedHealthScore', () => {
      it('should return 1.0 when no bridge', () => {
        expect(mixin.getNormalizedHealthScore()).toBe(1.0);
      });

      it('should calculate normalized score correctly', () => {
        mixin.setMinCutBridge(createMockBridge({
          health: {
            minCutValue: 1.5,
            healthyThreshold: 3.0,
          },
        }));

        expect(mixin.getNormalizedHealthScore()).toBe(0.5);
      });

      it('should cap score at 1.0', () => {
        mixin.setMinCutBridge(createMockBridge({
          health: {
            minCutValue: 6.0,
            healthyThreshold: 3.0,
          },
        }));

        expect(mixin.getNormalizedHealthScore()).toBe(1.0);
      });

      it('should handle zero threshold', () => {
        mixin.setMinCutBridge(createMockBridge({
          health: {
            minCutValue: 5.0,
            healthyThreshold: 0,
          },
        }));

        expect(mixin.getNormalizedHealthScore()).toBe(1.0);
      });
    });

    describe('meetsHealthThreshold', () => {
      it('should return true when score meets threshold', () => {
        mixin.updateConfig({ topologyHealthThreshold: 0.5 });
        mixin.setMinCutBridge(createMockBridge({
          health: {
            minCutValue: 2.1,
            healthyThreshold: 3.0,
          },
        }));

        expect(mixin.meetsHealthThreshold()).toBe(true);
      });

      it('should return false when score is below threshold', () => {
        mixin.updateConfig({ topologyHealthThreshold: 0.8 });
        mixin.setMinCutBridge(createMockBridge({
          health: {
            minCutValue: 1.5,
            healthyThreshold: 3.0,
          },
        }));

        expect(mixin.meetsHealthThreshold()).toBe(false);
      });
    });

    describe('getHealthyRoutingDomains', () => {
      it('should use all domains when monitoredDomains is empty', () => {
        mixin.setMinCutBridge(createMockBridge({ weakVertices: [] }));

        const result = mixin.getHealthyRoutingDomains();

        // Should include all 13 domains
        expect(result.length).toBe(13);
      });

      it('should use monitoredDomains when specified', () => {
        mixin.updateConfig({
          monitoredDomains: ['test-generation', 'test-execution'],
        });
        mixin.setMinCutBridge(createMockBridge({ weakVertices: [] }));

        const result = mixin.getHealthyRoutingDomains();

        expect(result).toEqual(['test-generation', 'test-execution']);
      });
    });
  });

  // ==========================================================================
  // Configuration Updates
  // ==========================================================================

  describe('Configuration Updates', () => {
    it('should update config', () => {
      mixin.updateConfig({ topologyHealthThreshold: 0.9 });

      expect(mixin.getConfig().topologyHealthThreshold).toBe(0.9);
    });

    it('should start monitoring when awareness is enabled', () => {
      mixin.updateConfig({ enableMinCutAwareness: false });
      mixin.setMinCutBridge(mockBridge);

      const callback = vi.fn();
      mixin.onTopologyHealthChange(callback);

      // Should not be called yet (awareness disabled)
      expect(callback).not.toHaveBeenCalled();

      // Enable awareness
      mixin.updateConfig({ enableMinCutAwareness: true });

      // Should now trigger monitoring
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Disposal
  // ==========================================================================

  describe('Disposal', () => {
    it('should dispose without error', () => {
      mixin.setMinCutBridge(mockBridge);
      mixin.onTopologyHealthChange(vi.fn());

      expect(() => mixin.dispose()).not.toThrow();
    });

    it('should clear bridge on dispose', () => {
      mixin.setMinCutBridge(mockBridge);
      mixin.dispose();

      expect(mixin.hasBridge()).toBe(false);
    });

    it('should stop monitoring on dispose', () => {
      const callback = vi.fn();
      let status: MinCutHealth['status'] = 'healthy';

      const dynamicBridge = {
        ...mockBridge,
        getMinCutHealth: vi.fn(() => ({
          status,
          minCutValue: 5.0,
          healthyThreshold: 3.0,
          warningThreshold: 2.0,
          weakVertexCount: 0,
          topWeakVertices: [],
          trend: 'stable' as const,
          history: [],
          lastUpdated: new Date(),
        })),
      } as unknown as QueenMinCutBridge;

      mixin.setMinCutBridge(dynamicBridge);
      mixin.onTopologyHealthChange(callback);

      expect(callback).toHaveBeenCalledTimes(1);

      mixin.dispose();

      status = 'critical';
      vi.advanceTimersByTime(10000);

      // Should not get more calls after dispose
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Factory Function
  // ==========================================================================

  describe('Factory Function', () => {
    it('should create mixin via factory', () => {
      const factoryMixin = createMinCutAwareMixin('coverage-analysis');

      expect(factoryMixin).toBeInstanceOf(MinCutAwareDomainMixin);
      expect(factoryMixin.getDomainName()).toBe('coverage-analysis');

      factoryMixin.dispose();
    });

    it('should create mixin with config via factory', () => {
      const factoryMixin = createMinCutAwareMixin('quality-assessment', {
        pauseOnCriticalTopology: true,
      });

      expect(factoryMixin.getConfig().pauseOnCriticalTopology).toBe(true);

      factoryMixin.dispose();
    });
  });

  // ==========================================================================
  // Type Guard
  // ==========================================================================

  describe('isMinCutAwareDomain Type Guard', () => {
    it('should return true for valid mixin', () => {
      expect(isMinCutAwareDomain(mixin)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isMinCutAwareDomain(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isMinCutAwareDomain(undefined)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isMinCutAwareDomain('string')).toBe(false);
      expect(isMinCutAwareDomain(123)).toBe(false);
    });

    it('should return false for object missing methods', () => {
      expect(isMinCutAwareDomain({})).toBe(false);
      expect(isMinCutAwareDomain({ setMinCutBridge: () => {} })).toBe(false);
    });

    it('should return true for object implementing interface', () => {
      const customImpl: IMinCutAwareDomain = {
        setMinCutBridge: vi.fn(),
        isTopologyHealthy: vi.fn(() => true),
        getDomainWeakVertices: vi.fn(() => []),
        isDomainWeakPoint: vi.fn(() => false),
        getTopologyBasedRouting: vi.fn((domains) => domains),
        onTopologyHealthChange: vi.fn(() => () => {}),
      };

      expect(isMinCutAwareDomain(customImpl)).toBe(true);
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe('Error Handling', () => {
    it('should handle callback errors gracefully', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      const normalCallback = vi.fn();
      let currentStatus: MinCutHealth['status'] = 'healthy';

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const dynamicBridge = {
        ...mockBridge,
        getMinCutHealth: vi.fn(() => ({
          status: currentStatus,
          minCutValue: 5.0,
          healthyThreshold: 3.0,
          warningThreshold: 2.0,
          weakVertexCount: 0,
          topWeakVertices: [],
          trend: 'stable' as const,
          history: [],
          lastUpdated: new Date(),
        })),
      } as unknown as QueenMinCutBridge;

      mixin.setMinCutBridge(dynamicBridge);

      // First subscriber gets immediate notification (will throw error)
      mixin.onTopologyHealthChange(errorCallback);
      expect(errorCallback).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      // Second subscriber registered (no immediate call - already monitoring)
      mixin.onTopologyHealthChange(normalCallback);

      // Trigger status change - both should be called
      currentStatus = 'critical';
      vi.advanceTimersByTime(5000);

      // Error callback throws again, normal callback should still be called
      expect(errorCallback).toHaveBeenCalledTimes(2);
      expect(normalCallback).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);

      consoleErrorSpy.mockRestore();
    });
  });

  // ==========================================================================
  // Integration Scenarios
  // ==========================================================================

  describe('Integration Scenarios', () => {
    it('should handle full lifecycle', async () => {
      // Create mixin
      const integrationMixin = createMinCutAwareMixin('defect-intelligence', {
        pauseOnCriticalTopology: true,
        topologyHealthThreshold: 0.6,
      });

      // Initially no bridge
      expect(integrationMixin.isTopologyHealthy()).toBe(true);
      expect(integrationMixin.shouldPauseOperations()).toBe(false);

      // Set bridge with healthy state
      integrationMixin.setMinCutBridge(createMockBridge({
        health: { status: 'healthy', minCutValue: 5.0, healthyThreshold: 3.0 },
      }));

      expect(integrationMixin.isTopologyHealthy()).toBe(true);
      expect(integrationMixin.getNormalizedHealthScore()).toBeGreaterThan(0.6);
      expect(integrationMixin.meetsHealthThreshold()).toBe(true);

      // Replace with critical bridge
      integrationMixin.setMinCutBridge(createMockBridge({
        health: { status: 'critical', minCutValue: 1.0, healthyThreshold: 3.0 },
      }));

      expect(integrationMixin.isTopologyHealthy()).toBe(false);
      expect(integrationMixin.shouldPauseOperations()).toBe(true);

      // Dispose
      integrationMixin.dispose();
      expect(integrationMixin.hasBridge()).toBe(false);
    });

    it('should correctly route based on topology', () => {
      const router = createMinCutAwareMixin('coordination');

      // Setup weak vertices in some domains
      router.setMinCutBridge(createMockBridge({
        weakVertices: [
          createMockWeakVertex('weak-1', 'test-execution'),
          createMockWeakVertex('weak-2', 'security-compliance'),
        ],
      }));

      const candidates: DomainName[] = [
        'test-generation',
        'test-execution',
        'coverage-analysis',
        'security-compliance',
      ];

      const healthyRoutes = router.getTopologyBasedRouting(candidates);

      expect(healthyRoutes).toHaveLength(2);
      expect(healthyRoutes).toContain('test-generation');
      expect(healthyRoutes).toContain('coverage-analysis');
      expect(healthyRoutes).not.toContain('test-execution');
      expect(healthyRoutes).not.toContain('security-compliance');

      router.dispose();
    });
  });
});
