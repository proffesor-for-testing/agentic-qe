/**
 * Unit Tests for BaseDomainPlugin - Domain Interface
 * FACTORY-UPDATE-001: Verifies backward compatibility and new DI features
 *
 * Tests:
 * 1. Backward compatibility - existing domains still work without integration config
 * 2. Optional MinCut bridge injection
 * 3. Optional Consensus configuration injection
 * 4. Integration hooks are called correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BaseDomainPlugin,
  TaskHandler,
  DomainConsensusConfig,
  DomainPluginIntegrationConfig,
} from '../../../src/domains/domain-interface';
import type { DomainName, DomainEvent, Result } from '../../../src/shared/types';
import type {
  DomainHealth,
  EventBus,
  MemoryBackend,
  DomainTaskRequest,
  TaskCompletionCallback,
} from '../../../src/kernel/interfaces';
import type { QueenMinCutBridge } from '../../../src/coordination/mincut';

// ============================================================================
// Test Implementation of BaseDomainPlugin
// ============================================================================

/**
 * Concrete implementation for testing BaseDomainPlugin
 */
class TestDomainPlugin extends BaseDomainPlugin {
  public onMinCutBridgeSetCalled = false;
  public onConsensusConfigSetCalled = false;
  public lastMinCutBridge: QueenMinCutBridge | undefined;
  public lastConsensusConfig: DomainConsensusConfig | undefined;

  get name(): DomainName {
    return 'test-generation'; // Use a valid domain name
  }

  get version(): string {
    return '1.0.0';
  }

  get dependencies(): DomainName[] {
    return [];
  }

  getAPI<T>(): T {
    return {
      testMethod: () => 'test',
    } as T;
  }

  // Expose protected methods for testing
  public exposeMinCutBridge(): QueenMinCutBridge | undefined {
    return this._minCutBridge;
  }

  public exposeConsensusConfig(): DomainConsensusConfig | undefined {
    return this._consensusConfig;
  }

  // Override hooks to track calls
  protected override onMinCutBridgeSet(bridge: QueenMinCutBridge): void {
    this.onMinCutBridgeSetCalled = true;
    this.lastMinCutBridge = bridge;
  }

  protected override onConsensusConfigSet(config: DomainConsensusConfig): void {
    this.onConsensusConfigSetCalled = true;
    this.lastConsensusConfig = config;
  }
}

/**
 * Plugin that does NOT override hooks (tests default no-op behavior)
 */
class MinimalTestPlugin extends BaseDomainPlugin {
  get name(): DomainName {
    return 'test-execution';
  }

  get version(): string {
    return '1.0.0';
  }

  get dependencies(): DomainName[] {
    return [];
  }

  getAPI<T>(): T {
    return {} as T;
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('BaseDomainPlugin - Domain Interface', () => {
  let mockEventBus: EventBus;
  let mockMemory: MemoryBackend;
  let mockMinCutBridge: QueenMinCutBridge;

  beforeEach(() => {
    // Create mock event bus
    mockEventBus = {
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn(), active: true }),
      subscribeToChannel: vi.fn().mockReturnValue({ unsubscribe: vi.fn(), active: true }),
      getHistory: vi.fn().mockResolvedValue([]),
      dispose: vi.fn().mockResolvedValue(undefined),
    };

    // Create mock memory backend
    mockMemory = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true),
      has: vi.fn().mockResolvedValue(false),
      search: vi.fn().mockResolvedValue([]),
      vectorSearch: vi.fn().mockResolvedValue([]),
      storeVector: vi.fn().mockResolvedValue(undefined),
      count: vi.fn().mockResolvedValue(0),
      hasCodeIntelligenceIndex: vi.fn().mockResolvedValue(false),
      initialize: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
    } as unknown as MemoryBackend;

    // Create mock MinCut bridge
    mockMinCutBridge = {
      initialize: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
      getMinCutHealth: vi.fn().mockReturnValue({ status: 'healthy', minCutValue: 5 }),
      getMinCutValue: vi.fn().mockReturnValue(5),
      getWeakVertices: vi.fn().mockReturnValue([]),
      isTopologyCritical: vi.fn().mockReturnValue(false),
      getGraph: vi.fn().mockReturnValue({}),
      getMonitor: vi.fn().mockReturnValue({}),
      addVertex: vi.fn(),
      addEdge: vi.fn(),
      removeVertex: vi.fn().mockReturnValue(true),
      refreshGraph: vi.fn().mockResolvedValue(undefined),
    } as unknown as QueenMinCutBridge;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Backward Compatibility Tests
  // ==========================================================================

  describe('Backward Compatibility', () => {
    it('should work without any integration configuration', async () => {
      const plugin = new TestDomainPlugin(mockEventBus, mockMemory);

      // Should initialize and work normally
      await plugin.initialize();
      expect(plugin.isReady()).toBe(true);
      expect(plugin.name).toBe('test-generation');
      expect(plugin.version).toBe('1.0.0');

      // API should still work
      const api = plugin.getAPI<{ testMethod: () => string }>();
      expect(api.testMethod()).toBe('test');

      // Dispose should work
      await plugin.dispose();
      expect(plugin.isReady()).toBe(false);
    });

    it('should have undefined integration config by default', () => {
      const plugin = new TestDomainPlugin(mockEventBus, mockMemory);

      expect(plugin.getMinCutBridge()).toBeUndefined();
      expect(plugin.getConsensusConfig()).toBeUndefined();
      expect(plugin.hasMinCutIntegration()).toBe(false);
      expect(plugin.hasConsensusEnabled()).toBe(false);
    });

    it('should maintain health tracking without integration', async () => {
      const plugin = new TestDomainPlugin(mockEventBus, mockMemory);
      await plugin.initialize();

      const health = plugin.getHealth();
      expect(health.status).toBe('idle');
      expect(health.agents.total).toBe(0);
      expect(health.errors).toEqual([]);
    });

    it('should work with existing domain patterns', () => {
      // Create plugin without integration config (existing pattern)
      const plugin = new MinimalTestPlugin(mockEventBus, mockMemory);

      // All standard methods should work
      expect(plugin.name).toBe('test-execution');
      expect(plugin.version).toBe('1.0.0');
      expect(plugin.dependencies).toEqual([]);
      expect(plugin.getHealth().status).toBe('idle');
    });
  });

  // ==========================================================================
  // MinCut Bridge Injection Tests
  // ==========================================================================

  describe('MinCut Bridge Injection', () => {
    it('should accept MinCut bridge via setMinCutBridge', () => {
      const plugin = new TestDomainPlugin(mockEventBus, mockMemory);

      plugin.setMinCutBridge(mockMinCutBridge);

      expect(plugin.getMinCutBridge()).toBe(mockMinCutBridge);
      expect(plugin.hasMinCutIntegration()).toBe(true);
    });

    it('should call onMinCutBridgeSet hook when bridge is set', () => {
      const plugin = new TestDomainPlugin(mockEventBus, mockMemory);

      expect(plugin.onMinCutBridgeSetCalled).toBe(false);

      plugin.setMinCutBridge(mockMinCutBridge);

      expect(plugin.onMinCutBridgeSetCalled).toBe(true);
      expect(plugin.lastMinCutBridge).toBe(mockMinCutBridge);
    });

    it('should not throw when hook is not overridden', () => {
      const plugin = new MinimalTestPlugin(mockEventBus, mockMemory);

      // Should not throw - default no-op behavior
      expect(() => plugin.setMinCutBridge(mockMinCutBridge)).not.toThrow();
      expect(plugin.hasMinCutIntegration()).toBe(true);
    });

    it('should store bridge internally via protected property', () => {
      const plugin = new TestDomainPlugin(mockEventBus, mockMemory);

      plugin.setMinCutBridge(mockMinCutBridge);

      // Verify internal storage via exposed method
      expect(plugin.exposeMinCutBridge()).toBe(mockMinCutBridge);
    });
  });

  // ==========================================================================
  // Consensus Configuration Injection Tests
  // ==========================================================================

  describe('Consensus Configuration Injection', () => {
    const consensusConfig: DomainConsensusConfig = {
      enabled: true,
      verifySeverities: ['critical', 'high'],
      autoApprovalThreshold: 0.9,
    };

    it('should accept consensus config via setConsensusConfig', () => {
      const plugin = new TestDomainPlugin(mockEventBus, mockMemory);

      plugin.setConsensusConfig(consensusConfig);

      expect(plugin.getConsensusConfig()).toEqual(consensusConfig);
      expect(plugin.hasConsensusEnabled()).toBe(true);
    });

    it('should call onConsensusConfigSet hook when config is set', () => {
      const plugin = new TestDomainPlugin(mockEventBus, mockMemory);

      expect(plugin.onConsensusConfigSetCalled).toBe(false);

      plugin.setConsensusConfig(consensusConfig);

      expect(plugin.onConsensusConfigSetCalled).toBe(true);
      expect(plugin.lastConsensusConfig).toEqual(consensusConfig);
    });

    it('should return false for hasConsensusEnabled when disabled', () => {
      const plugin = new TestDomainPlugin(mockEventBus, mockMemory);

      plugin.setConsensusConfig({ enabled: false });

      expect(plugin.hasConsensusEnabled()).toBe(false);
    });

    it('should not throw when hook is not overridden', () => {
      const plugin = new MinimalTestPlugin(mockEventBus, mockMemory);

      // Should not throw - default no-op behavior
      expect(() => plugin.setConsensusConfig(consensusConfig)).not.toThrow();
    });

    it('should store config internally via protected property', () => {
      const plugin = new TestDomainPlugin(mockEventBus, mockMemory);

      plugin.setConsensusConfig(consensusConfig);

      // Verify internal storage via exposed method
      expect(plugin.exposeConsensusConfig()).toEqual(consensusConfig);
    });
  });

  // ==========================================================================
  // Integration Configuration Tests
  // ==========================================================================

  describe('Combined Integration Configuration', () => {
    const consensusConfig: DomainConsensusConfig = {
      enabled: true,
      verifySeverities: ['critical'],
      autoApprovalThreshold: 0.85,
    };

    it('should accept both configs via setIntegrationConfig', () => {
      const plugin = new TestDomainPlugin(mockEventBus, mockMemory);

      const integrationConfig: DomainPluginIntegrationConfig = {
        minCutBridge: mockMinCutBridge,
        consensusConfig: consensusConfig,
      };

      plugin.setIntegrationConfig(integrationConfig);

      expect(plugin.getMinCutBridge()).toBe(mockMinCutBridge);
      expect(plugin.getConsensusConfig()).toEqual(consensusConfig);
      expect(plugin.hasMinCutIntegration()).toBe(true);
      expect(plugin.hasConsensusEnabled()).toBe(true);
    });

    it('should call both hooks when both configs provided', () => {
      const plugin = new TestDomainPlugin(mockEventBus, mockMemory);

      plugin.setIntegrationConfig({
        minCutBridge: mockMinCutBridge,
        consensusConfig: consensusConfig,
      });

      expect(plugin.onMinCutBridgeSetCalled).toBe(true);
      expect(plugin.onConsensusConfigSetCalled).toBe(true);
    });

    it('should handle partial integration config - only MinCut', () => {
      const plugin = new TestDomainPlugin(mockEventBus, mockMemory);

      plugin.setIntegrationConfig({
        minCutBridge: mockMinCutBridge,
      });

      expect(plugin.hasMinCutIntegration()).toBe(true);
      expect(plugin.hasConsensusEnabled()).toBe(false);
      expect(plugin.onMinCutBridgeSetCalled).toBe(true);
      expect(plugin.onConsensusConfigSetCalled).toBe(false);
    });

    it('should handle partial integration config - only Consensus', () => {
      const plugin = new TestDomainPlugin(mockEventBus, mockMemory);

      plugin.setIntegrationConfig({
        consensusConfig: consensusConfig,
      });

      expect(plugin.hasMinCutIntegration()).toBe(false);
      expect(plugin.hasConsensusEnabled()).toBe(true);
      expect(plugin.onMinCutBridgeSetCalled).toBe(false);
      expect(plugin.onConsensusConfigSetCalled).toBe(true);
    });

    it('should handle empty integration config gracefully', () => {
      const plugin = new TestDomainPlugin(mockEventBus, mockMemory);

      plugin.setIntegrationConfig({});

      expect(plugin.hasMinCutIntegration()).toBe(false);
      expect(plugin.hasConsensusEnabled()).toBe(false);
      expect(plugin.onMinCutBridgeSetCalled).toBe(false);
      expect(plugin.onConsensusConfigSetCalled).toBe(false);
    });
  });

  // ==========================================================================
  // Type Safety Tests
  // ==========================================================================

  describe('Type Safety', () => {
    it('should enforce DomainConsensusConfig structure', () => {
      const plugin = new TestDomainPlugin(mockEventBus, mockMemory);

      // Valid config should work
      const validConfig: DomainConsensusConfig = {
        enabled: true,
        engineConfig: { defaultThreshold: 0.67 },
        verifySeverities: ['critical', 'high', 'medium'],
        autoApprovalThreshold: 0.95,
      };

      plugin.setConsensusConfig(validConfig);
      expect(plugin.getConsensusConfig()).toEqual(validConfig);
    });

    it('should accept minimal DomainConsensusConfig', () => {
      const plugin = new TestDomainPlugin(mockEventBus, mockMemory);

      // Minimal config with only required field
      const minimalConfig: DomainConsensusConfig = {
        enabled: false,
      };

      plugin.setConsensusConfig(minimalConfig);
      expect(plugin.getConsensusConfig()?.enabled).toBe(false);
    });
  });
});
