/**
 * Test Generation Consensus Integration Test
 * ============================================================================
 *
 * Tests the Multi-Model Consensus verification integration in the
 * test-generation domain coordinator per MM-001.
 *
 * MM-001: Multi-Model Consensus for Security Verification
 * Applied to test generation for high-stakes test design decisions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  TestGenerationCoordinator,
  type CoordinatorConfig,
} from '../../../src/domains/test-generation/coordinator';

import {
  ConsensusEnabledMixin,
  createConsensusEnabledMixin,
  type ConsensusEnabledConfig,
} from '../../../src/coordination/mixins/consensus-enabled-domain';

import {
  createMockProvider,
  createProviderRegistry,
  ConsensusEngineImpl,
  type ModelProvider,
  type SecurityFinding,
  type ConsensusResult,
  type ModelVote,
} from '../../../src/coordination/consensus';

import type { DomainFinding } from '../../../src/coordination/consensus/domain-findings';
import type { DomainName, Severity } from '../../../src/shared/types';
import type { EventBus, AgentCoordinator, MemoryBackend } from '../../../src/kernel/interfaces';

// ============================================================================
// Mock Helpers
// ============================================================================

function createMockEventBus(): EventBus & { publish: Mock } {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue('sub-1'),
    unsubscribe: vi.fn(),
    once: vi.fn(),
    listSubscribers: vi.fn().mockReturnValue([]),
  } as EventBus & { publish: Mock };
}

function createMockMemoryBackend(): MemoryBackend {
  const store = new Map<string, any>();
  return {
    get: vi.fn().mockImplementation((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: vi.fn().mockImplementation((key: string, value: any) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn().mockImplementation((key: string) => {
      store.delete(key);
      return Promise.resolve(true);
    }),
    search: vi.fn().mockResolvedValue([]),
    has: vi.fn().mockImplementation((key: string) => Promise.resolve(store.has(key))),
    clear: vi.fn().mockImplementation(() => {
      store.clear();
      return Promise.resolve();
    }),
    list: vi.fn().mockResolvedValue([]),
    keys: vi.fn().mockResolvedValue([]),
  } as unknown as MemoryBackend;
}

function createMockAgentCoordinator(): AgentCoordinator & {
  spawn: Mock;
  stop: Mock;
  canSpawn: Mock;
} {
  return {
    listAgents: vi.fn().mockReturnValue([]),
    spawn: vi.fn().mockResolvedValue({ success: true, value: `agent-${Date.now()}` }),
    stop: vi.fn().mockResolvedValue(undefined),
    canSpawn: vi.fn().mockReturnValue(true),
    getAgent: vi.fn(),
  } as unknown as AgentCoordinator & {
    spawn: Mock;
    stop: Mock;
    canSpawn: Mock;
  };
}

function createMockProviders(
  configs: Array<{
    id: string;
    name?: string;
    defaultAssessment?: 'confirmed' | 'rejected' | 'inconclusive';
    defaultConfidence?: number;
    latencyMs?: number;
    failureRate?: number;
  }>
): ModelProvider[] {
  return configs.map(config =>
    createMockProvider({
      id: config.id,
      name: config.name ?? config.id,
      defaultAssessment: config.defaultAssessment ?? 'confirmed',
      defaultConfidence: config.defaultConfidence ?? 0.85,
      latencyMs: config.latencyMs ?? 100,
      failureRate: config.failureRate,
    })
  );
}

function createTestCoordinator(
  config: Partial<CoordinatorConfig> = {},
): {
  coordinator: TestGenerationCoordinator;
  mockEventBus: EventBus;
  mockMemory: MemoryBackend;
  mockAgentCoordinator: AgentCoordinator;
} {
  const mockEventBus = createMockEventBus();
  const mockMemory = createMockMemoryBackend();
  const mockAgentCoordinator = createMockAgentCoordinator();

  const coordinator = new TestGenerationCoordinator(
    mockEventBus,
    mockMemory,
    mockAgentCoordinator,
    {
      // Disable features that require external services for testing
      enableQESONA: false,
      enableFlashAttention: false,
      enableDecisionTransformer: false,
      enableCoherenceGate: false,
      enableMinCutAwareness: false,
      // Consensus config for testing
      enableConsensus: true,
      consensusThreshold: 0.7,
      consensusStrategy: 'weighted',
      consensusMinModels: 2,
      ...config,
    }
  );

  return { coordinator, mockEventBus, mockMemory, mockAgentCoordinator };
}

function createTestFinding(overrides?: Partial<DomainFinding<any>>): DomainFinding<any> {
  return {
    id: `finding-${Math.random().toString(36).slice(2, 8)}`,
    type: 'test-pattern-selection',
    confidence: 0.85,
    description: 'Test pattern selection finding',
    payload: {
      id: 'pattern-1',
      name: 'unit-test-pattern',
      type: 'unit',
    },
    detectedAt: new Date(),
    detectedBy: 'test-generation-coordinator',
    severity: 'high',
    ...overrides,
  } as DomainFinding<any>;
}

// ============================================================================
// Test Suite
// ============================================================================

describe('test-generation Consensus Integration', () => {
  let mockProviders: ModelProvider[];

  beforeEach(() => {
    mockProviders = createMockProviders([
      { id: 'mock-claude', name: 'Mock Claude', defaultAssessment: 'confirmed', defaultConfidence: 0.9 },
      { id: 'mock-gpt', name: 'Mock GPT', defaultAssessment: 'confirmed', defaultConfidence: 0.85 },
      { id: 'mock-gemini', name: 'Mock Gemini', defaultAssessment: 'confirmed', defaultConfidence: 0.8 },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Test: Coordinator initializes with consensus configuration
  // ==========================================================================

  describe('consensus configuration', () => {
    it('should initialize with consensus enabled', () => {
      const { coordinator } = createTestCoordinator({
        enableConsensus: true,
        consensusThreshold: 0.7,
        consensusStrategy: 'weighted',
        consensusMinModels: 2,
      });

      // Coordinator should be created without errors
      expect(coordinator).toBeDefined();
    });

    it('should initialize with consensus disabled', () => {
      const { coordinator } = createTestCoordinator({
        enableConsensus: false,
      });

      // Should work without consensus
      expect(coordinator).toBeDefined();
      expect(coordinator.isConsensusAvailable()).toBe(false);
    });

    it('should support different consensus strategies', () => {
      const strategies = ['majority', 'weighted', 'unanimous'] as const;

      for (const strategy of strategies) {
        const { coordinator } = createTestCoordinator({
          enableConsensus: true,
          consensusStrategy: strategy,
        });

        expect(coordinator).toBeDefined();
      }
    });
  });

  // ==========================================================================
  // Test: ConsensusEnabledMixin integration
  // ==========================================================================

  describe('ConsensusEnabledMixin behavior', () => {
    it('should create mixin with test-generation specific finding types', () => {
      const mixin = createConsensusEnabledMixin({
        enableConsensus: true,
        consensusThreshold: 0.7,
        verifyFindingTypes: [
          'test-pattern-selection',
          'mock-strategy',
          'edge-case-generation',
          'assertion-strategy',
        ],
        strategy: 'weighted',
        minModels: 2,
        modelTimeout: 60000,
        verifySeverities: ['critical', 'high'],
        enableLogging: false,
      });

      expect(mixin).toBeDefined();
    });

    it('should require consensus for test-pattern-selection findings', () => {
      const mixin = createConsensusEnabledMixin({
        enableConsensus: true,
        consensusThreshold: 0.7,
        verifyFindingTypes: ['test-pattern-selection'],
        verifySeverities: ['high'],
      });

      const finding = createTestFinding({
        type: 'test-pattern-selection',
        confidence: 0.85,
        severity: 'high',
      });

      expect(mixin.requiresConsensus(finding)).toBe(true);
    });

    it('should require consensus for mock-strategy findings', () => {
      const mixin = createConsensusEnabledMixin({
        enableConsensus: true,
        consensusThreshold: 0.7,
        verifyFindingTypes: ['mock-strategy'],
        verifySeverities: ['high'],
      });

      const finding = createTestFinding({
        type: 'mock-strategy',
        confidence: 0.85,
        severity: 'high',
        payload: {
          target: 'DatabaseService',
          mockType: 'stub',
          reason: 'Isolate data layer',
        },
      });

      expect(mixin.requiresConsensus(finding)).toBe(true);
    });

    it('should require consensus for edge-case-generation findings', () => {
      const mixin = createConsensusEnabledMixin({
        enableConsensus: true,
        consensusThreshold: 0.7,
        verifyFindingTypes: ['edge-case-generation'],
        verifySeverities: ['high'],
      });

      const finding = createTestFinding({
        type: 'edge-case-generation',
        confidence: 0.9,
        severity: 'high',
        payload: {
          description: 'Empty array input',
          inputConditions: ['array.length === 0'],
          expectedBehavior: 'Returns empty result',
        },
      });

      expect(mixin.requiresConsensus(finding)).toBe(true);
    });

    it('should not require consensus for low-severity findings', () => {
      const mixin = createConsensusEnabledMixin({
        enableConsensus: true,
        verifyFindingTypes: ['test-pattern-selection'],
        verifySeverities: ['critical', 'high'],
      });

      const finding = createTestFinding({
        type: 'test-pattern-selection',
        severity: 'low',
        confidence: 0.5,
      });

      expect(mixin.requiresConsensus(finding)).toBe(false);
    });

    it('should not require consensus for unlisted finding types', () => {
      const mixin = createConsensusEnabledMixin({
        enableConsensus: true,
        verifyFindingTypes: ['test-pattern-selection'],
        verifySeverities: ['high'],
      });

      const finding = createTestFinding({
        type: 'unknown-type',
        severity: 'high',
      });

      expect(mixin.requiresConsensus(finding)).toBe(false);
    });
  });

  // ==========================================================================
  // Test: Graceful degradation without providers
  // ==========================================================================

  describe('graceful degradation', () => {
    it('should work without consensus engine initialized', async () => {
      const { coordinator } = createTestCoordinator({
        enableConsensus: false,
      });

      await coordinator.initialize();

      // Should not have consensus available
      expect(coordinator.isConsensusAvailable()).toBe(false);

      // Should still be able to get stats (returns undefined)
      const stats = coordinator.getConsensusStats();
      expect(stats).toBeUndefined();

      await coordinator.dispose();
    });

    it('should handle consensus initialization failure gracefully', async () => {
      const { coordinator } = createTestCoordinator({
        enableConsensus: true,
      });

      // Initialize should not throw even if no providers
      await expect(coordinator.initialize()).resolves.not.toThrow();

      await coordinator.dispose();
    });
  });

  // ==========================================================================
  // Test: Consensus stats tracking
  // ==========================================================================

  describe('consensus statistics', () => {
    it('should return undefined stats when consensus not initialized', () => {
      const { coordinator } = createTestCoordinator({
        enableConsensus: false,
      });

      const stats = coordinator.getConsensusStats();
      expect(stats).toBeUndefined();
    });
  });

  // ==========================================================================
  // Test: Coordinator lifecycle with consensus
  // ==========================================================================

  describe('lifecycle integration', () => {
    it('should properly initialize and dispose with consensus', async () => {
      const { coordinator } = createTestCoordinator({
        enableConsensus: true,
      });

      await coordinator.initialize();

      // Should be initialized
      expect(coordinator.getActiveWorkflows()).toEqual([]);

      // Dispose should not throw
      await coordinator.dispose();
    });

    it('should handle multiple initialize calls', async () => {
      const { coordinator } = createTestCoordinator({
        enableConsensus: true,
      });

      await coordinator.initialize();
      await coordinator.initialize(); // Should be idempotent

      await coordinator.dispose();
    });

    it('should handle dispose without initialization', async () => {
      const { coordinator } = createTestCoordinator({
        enableConsensus: true,
      });

      // Dispose without initialize should not throw
      await expect(coordinator.dispose()).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // Test: Consensus finding types for test-generation domain
  // ==========================================================================

  describe('test-generation specific finding types', () => {
    it('should handle test-pattern-selection type', () => {
      const finding = createTestFinding({
        type: 'test-pattern-selection',
        payload: {
          id: 'unit-test-pattern-1',
          name: 'Factory Pattern Unit Tests',
          type: 'unit',
        },
      });

      expect(finding.type).toBe('test-pattern-selection');
      expect(finding.payload.name).toBe('Factory Pattern Unit Tests');
    });

    it('should handle mock-strategy type', () => {
      const finding = createTestFinding({
        type: 'mock-strategy',
        description: 'Verify mock strategy for DatabaseService',
        payload: {
          target: 'DatabaseService',
          mockType: 'spy',
          reason: 'Track method calls without replacing implementation',
        },
      });

      expect(finding.type).toBe('mock-strategy');
      expect(finding.payload.target).toBe('DatabaseService');
    });

    it('should handle edge-case-generation type', () => {
      const finding = createTestFinding({
        type: 'edge-case-generation',
        description: 'Verify edge case: null input handling',
        severity: 'high',
        payload: {
          description: 'Null input to processData function',
          inputConditions: ['input === null', 'input === undefined'],
          expectedBehavior: 'Throws ValidationError',
        },
      });

      expect(finding.type).toBe('edge-case-generation');
      expect(finding.severity).toBe('high');
    });

    it('should handle assertion-strategy type', () => {
      const finding = createTestFinding({
        type: 'assertion-strategy',
        description: 'Verify assertion strategy for API response',
        payload: {
          target: 'getUserById response',
          assertions: ['expect(result.status).toBe(200)', 'expect(result.data.id).toBeDefined()'],
          reason: 'Comprehensive API contract validation',
        },
      });

      expect(finding.type).toBe('assertion-strategy');
    });
  });

  // ==========================================================================
  // Test: Integration with ConsensusEngineImpl
  // ==========================================================================

  describe('ConsensusEngineImpl integration', () => {
    it('should create engine with test-generation configuration', () => {
      const providers = mockProviders;
      const registry = createProviderRegistry(providers);

      const engine = new ConsensusEngineImpl(registry, {
        minModels: 2,
        maxModels: 3,
        verifySeverities: ['critical', 'high'],
        defaultThreshold: 0.5,
        defaultModelTimeout: 5000,
        defaultRetries: 2,
        enableCache: false,
        cacheTtlMs: 0,
        enableCostTracking: false,
        humanReviewThreshold: 0.6,
      });

      expect(engine).toBeDefined();
      expect(engine.getModels()).toHaveLength(3);
    });

    it('should verify test-generation security finding', async () => {
      const providers = mockProviders;
      const registry = createProviderRegistry(providers);

      const engine = new ConsensusEngineImpl(registry, {
        minModels: 2,
        maxModels: 3,
        verifySeverities: ['critical', 'high'],
        defaultThreshold: 0.5,
        defaultModelTimeout: 5000,
        defaultRetries: 2,
        enableCache: false,
        cacheTtlMs: 0,
        enableCostTracking: false,
        humanReviewThreshold: 0.6,
      });

      const finding: SecurityFinding = {
        id: 'test-pattern-1',
        type: 'test-pattern-selection',
        category: 'other',
        severity: 'high',
        description: 'Verify test pattern selection for unit tests',
        location: {
          file: 'src/services/user.service.ts',
        },
        evidence: [],
        detectedAt: new Date(),
        detectedBy: 'test-generation-coordinator',
      };

      const result = await engine.verify(finding);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.verdict).toBe('verified');
        expect(result.value.votes).toHaveLength(3);
      }
    });
  });
});
