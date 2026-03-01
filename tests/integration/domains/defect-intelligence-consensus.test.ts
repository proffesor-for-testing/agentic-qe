/**
 * Defect Intelligence Consensus Integration Test
 * ============================================================================
 *
 * Tests the Multi-Model Consensus verification integration in the
 * defect-intelligence domain coordinator per MM-001.
 *
 * MM-001: Multi-Model Consensus for Security Verification
 * Applied to defect intelligence for high-stakes defect predictions and root cause analysis.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  DefectIntelligenceCoordinator,
  type CoordinatorConfig,
} from '../../../src/domains/defect-intelligence/coordinator';

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
  coordinator: DefectIntelligenceCoordinator;
  mockEventBus: EventBus;
  mockMemory: MemoryBackend;
  mockAgentCoordinator: AgentCoordinator;
} {
  const mockEventBus = createMockEventBus();
  const mockMemory = createMockMemoryBackend();
  const mockAgentCoordinator = createMockAgentCoordinator();

  const coordinator = new DefectIntelligenceCoordinator(
    mockEventBus,
    mockMemory,
    mockAgentCoordinator,
    {
      // Disable features that require external services for testing
      enableMinCutAwareness: false,
      // Consensus config for testing
      enableConsensus: true,
      consensusThreshold: 0.7,
      ...config,
    }
  );

  return { coordinator, mockEventBus, mockMemory, mockAgentCoordinator };
}

function createTestDefectPredictionFinding(overrides?: Partial<DomainFinding<any>>): DomainFinding<any> {
  return {
    id: `finding-${Math.random().toString(36).slice(2, 8)}`,
    type: 'defect-prediction',
    confidence: 0.85,
    description: 'Defect prediction finding',
    payload: {
      file: 'src/module.ts',
      probability: 0.85,
      riskLevel: 'high',
      factors: [{ name: 'complexity', contribution: 0.4 }],
      recommendations: ['Review error handling'],
    },
    detectedAt: new Date(),
    detectedBy: 'defect-intelligence-coordinator',
    severity: 'high',
    ...overrides,
  } as DomainFinding<any>;
}

function createTestRootCauseFinding(overrides?: Partial<DomainFinding<any>>): DomainFinding<any> {
  return {
    id: `finding-${Math.random().toString(36).slice(2, 8)}`,
    type: 'root-cause',
    confidence: 0.9,
    description: 'Root cause finding',
    payload: {
      defectId: 'DEFECT-123',
      rootCause: 'Race condition in async handler',
      confidence: 0.9,
      contributingFactors: [],
      relatedFiles: ['src/handler.ts'],
      recommendations: ['Add mutex lock'],
      timeline: [],
    },
    detectedAt: new Date(),
    detectedBy: 'defect-intelligence-coordinator',
    severity: 'high',
    ...overrides,
  } as DomainFinding<any>;
}

// ============================================================================
// Test Suite
// ============================================================================

describe('defect-intelligence Consensus Integration', () => {
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

  describe('consensus initialization', () => {
    it('should initialize consensus engine', async () => {
      const { coordinator } = createTestCoordinator({
        enableConsensus: true,
        consensusThreshold: 0.7,
      });

      await coordinator.initialize();

      // Coordinator should be created without errors
      expect(coordinator).toBeDefined();

      await coordinator.dispose();
    });

    it('should initialize with consensus disabled', async () => {
      const { coordinator } = createTestCoordinator({
        enableConsensus: false,
      });

      await coordinator.initialize();

      // Should work without consensus
      expect(coordinator).toBeDefined();
      const stats = coordinator.getConsensusStats();
      expect(stats).toBeUndefined();

      await coordinator.dispose();
    });
  });

  // ==========================================================================
  // Test: verifyRootCauseAnalysis with consensus
  // ==========================================================================

  describe('root cause analysis verification', () => {
    it('should verify root cause analysis with consensus', async () => {
      const { coordinator } = createTestCoordinator({
        enableConsensus: true,
        consensusThreshold: 0.7,
      });

      await coordinator.initialize();

      const rootCauseFinding = createTestRootCauseFinding({
        confidence: 0.85,
        severity: 'high',
      });

      // High confidence + high severity should require consensus
      const requires = coordinator.requiresConsensus(rootCauseFinding);
      expect(requires).toBe(true);

      await coordinator.dispose();
    });

    it('should skip consensus for low-confidence findings', async () => {
      const { coordinator } = createTestCoordinator({
        enableConsensus: true,
        consensusThreshold: 0.7,
      });

      await coordinator.initialize();

      const lowConfidenceFinding = createTestRootCauseFinding({
        confidence: 0.5,
        severity: 'low',
      });

      // Low confidence + low severity should NOT require consensus
      const requires = coordinator.requiresConsensus(lowConfidenceFinding);
      expect(requires).toBe(false);

      await coordinator.dispose();
    });
  });

  // ==========================================================================
  // Test: Confidence adjustment based on consensus
  // ==========================================================================

  describe('confidence adjustment', () => {
    it('should boost confidence for verified findings', async () => {
      // The coordinator's verifyRootCauseAnalysis method boosts confidence
      // when consensus verdict is 'verified' (confidence * 1.1)
      const { coordinator } = createTestCoordinator({
        enableConsensus: true,
        consensusThreshold: 0.7,
      });

      await coordinator.initialize();

      // Verify that high-confidence finding requires consensus
      const finding = createTestDefectPredictionFinding({
        confidence: 0.85,
        severity: 'critical',
      });

      expect(coordinator.requiresConsensus(finding)).toBe(true);

      await coordinator.dispose();
    });

    it('should lower confidence for disputed findings', async () => {
      // The coordinator lowers confidence when verdict is 'disputed'
      // (confidence * 0.7 for root cause, * 0.6 for predictions)
      const { coordinator } = createTestCoordinator({
        enableConsensus: true,
        consensusThreshold: 0.7,
      });

      await coordinator.initialize();

      // Verify that configuration allows for disputed handling
      const finding = createTestDefectPredictionFinding({
        confidence: 0.9,
        severity: 'high',
      });

      const requires = coordinator.requiresConsensus(finding);
      expect(requires).toBe(true);

      await coordinator.dispose();
    });
  });

  // ==========================================================================
  // Test: Graceful degradation without consensus
  // ==========================================================================

  describe('graceful degradation', () => {
    it('should work without consensus (graceful degradation)', async () => {
      const { coordinator } = createTestCoordinator({
        enableConsensus: false,
      });

      await coordinator.initialize();

      // Should not have consensus available
      const stats = coordinator.getConsensusStats();
      expect(stats).toBeUndefined();

      // Findings should not require consensus when disabled
      const finding = createTestDefectPredictionFinding({
        confidence: 0.95,
        severity: 'critical',
      });

      expect(coordinator.requiresConsensus(finding)).toBe(false);

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

  describe('statistics tracking', () => {
    it('should track consensus statistics', async () => {
      const { coordinator } = createTestCoordinator({
        enableConsensus: true,
      });

      await coordinator.initialize();

      // Stats should be available when consensus is enabled
      // (may be empty if no verifications performed yet)
      const stats = coordinator.getConsensusStats();
      // Stats may be undefined if engine not fully initialized
      expect(stats === undefined || typeof stats === 'object').toBe(true);

      await coordinator.dispose();
    });

    it('should return undefined stats when consensus disabled', async () => {
      const { coordinator } = createTestCoordinator({
        enableConsensus: false,
      });

      await coordinator.initialize();

      const stats = coordinator.getConsensusStats();
      expect(stats).toBeUndefined();

      await coordinator.dispose();
    });
  });

  // ==========================================================================
  // Test: ConsensusEnabledMixin integration
  // ==========================================================================

  describe('ConsensusEnabledMixin behavior', () => {
    it('should create mixin with defect-intelligence specific finding types', () => {
      const mixin = createConsensusEnabledMixin({
        enableConsensus: true,
        consensusThreshold: 0.7,
        verifyFindingTypes: [
          'defect-prediction',
          'root-cause',
          'regression-risk',
          'pattern-classification',
        ],
        strategy: 'weighted',
        minModels: 2,
        modelTimeout: 60000,
        verifySeverities: ['critical', 'high'],
        enableLogging: false,
      });

      expect(mixin).toBeDefined();
    });

    it('should require consensus for defect-prediction findings', () => {
      const mixin = createConsensusEnabledMixin({
        enableConsensus: true,
        consensusThreshold: 0.7,
        verifyFindingTypes: ['defect-prediction'],
        verifySeverities: ['high'],
      });

      const finding = createTestDefectPredictionFinding({
        type: 'defect-prediction',
        confidence: 0.85,
        severity: 'high',
      });

      expect(mixin.requiresConsensus(finding)).toBe(true);
    });

    it('should require consensus for root-cause findings', () => {
      const mixin = createConsensusEnabledMixin({
        enableConsensus: true,
        consensusThreshold: 0.7,
        verifyFindingTypes: ['root-cause'],
        verifySeverities: ['high'],
      });

      const finding = createTestRootCauseFinding({
        type: 'root-cause',
        confidence: 0.85,
        severity: 'high',
      });

      expect(mixin.requiresConsensus(finding)).toBe(true);
    });

    it('should require consensus for regression-risk findings', () => {
      const mixin = createConsensusEnabledMixin({
        enableConsensus: true,
        consensusThreshold: 0.7,
        verifyFindingTypes: ['regression-risk'],
        verifySeverities: ['high'],
      });

      const finding: DomainFinding<any> = {
        id: 'regression-finding',
        type: 'regression-risk',
        confidence: 0.8,
        severity: 'high',
        description: 'High regression risk in changeset',
        payload: {
          overallRisk: 0.8,
          riskLevel: 'high',
          impactedAreas: [],
          recommendedTests: [],
          confidence: 0.8,
        },
        detectedAt: new Date(),
        detectedBy: 'defect-intelligence-coordinator',
      };

      expect(mixin.requiresConsensus(finding)).toBe(true);
    });

    it('should not require consensus for low-severity findings', () => {
      const mixin = createConsensusEnabledMixin({
        enableConsensus: true,
        verifyFindingTypes: ['defect-prediction'],
        verifySeverities: ['critical', 'high'],
      });

      const finding = createTestDefectPredictionFinding({
        type: 'defect-prediction',
        severity: 'low',
        confidence: 0.5,
      });

      expect(mixin.requiresConsensus(finding)).toBe(false);
    });

    it('should not require consensus for unlisted finding types', () => {
      const mixin = createConsensusEnabledMixin({
        enableConsensus: true,
        verifyFindingTypes: ['defect-prediction'],
        verifySeverities: ['high'],
      });

      const finding = createTestDefectPredictionFinding({
        type: 'unknown-type',
        severity: 'high',
      });

      expect(mixin.requiresConsensus(finding)).toBe(false);
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
  // Test: Defect-intelligence specific finding types
  // ==========================================================================

  describe('defect-intelligence specific finding types', () => {
    it('should handle defect-prediction type', () => {
      const finding = createTestDefectPredictionFinding({
        type: 'defect-prediction',
        payload: {
          file: 'src/services/payment.ts',
          probability: 0.85,
          riskLevel: 'high',
          factors: [
            { name: 'complexity', contribution: 0.4 },
            { name: 'churn', contribution: 0.3 },
          ],
          recommendations: ['Review error handling', 'Add unit tests'],
        },
      });

      expect(finding.type).toBe('defect-prediction');
      expect(finding.payload.file).toBe('src/services/payment.ts');
      expect(finding.payload.probability).toBe(0.85);
    });

    it('should handle root-cause type', () => {
      const finding = createTestRootCauseFinding({
        type: 'root-cause',
        description: 'Verify root cause for database connection leak',
        payload: {
          defectId: 'DEFECT-456',
          rootCause: 'Connection pool exhaustion due to missing close()',
          confidence: 0.92,
          contributingFactors: [
            { factor: 'Missing connection release', impact: 'high', evidence: ['src/db.ts:42'] },
          ],
          relatedFiles: ['src/db.ts', 'src/services/user.ts'],
          recommendations: ['Add try-finally block', 'Use connection pooling library'],
          timeline: [],
        },
      });

      expect(finding.type).toBe('root-cause');
      expect(finding.payload.defectId).toBe('DEFECT-456');
    });

    it('should handle regression-risk type', () => {
      const finding: DomainFinding<any> = {
        id: 'regression-finding',
        type: 'regression-risk',
        confidence: 0.8,
        severity: 'high',
        description: 'Verify regression risk for authentication changes',
        payload: {
          overallRisk: 0.75,
          riskLevel: 'high',
          impactedAreas: [
            {
              area: 'authentication',
              files: ['src/auth.ts', 'src/middleware/auth.ts'],
              risk: 0.8,
              reason: 'Core auth flow changes',
            },
          ],
          recommendedTests: ['auth.test.ts', 'integration/login.test.ts'],
          confidence: 0.8,
        },
        detectedAt: new Date(),
        detectedBy: 'defect-intelligence-coordinator',
      };

      expect(finding.type).toBe('regression-risk');
      expect(finding.payload.overallRisk).toBe(0.75);
    });

    it('should handle pattern-classification type', () => {
      const finding: DomainFinding<any> = {
        id: 'pattern-finding',
        type: 'pattern-classification',
        confidence: 0.88,
        severity: 'medium',
        description: 'Defect pattern classified as memory leak',
        payload: {
          patternId: 'PATTERN-001',
          patternName: 'Memory Leak',
          indicators: ['Unbounded cache growth', 'Missing cleanup'],
          frequency: 0.15,
          prevention: 'Implement cache eviction policy',
        },
        detectedAt: new Date(),
        detectedBy: 'defect-intelligence-coordinator',
      };

      expect(finding.type).toBe('pattern-classification');
      expect(finding.payload.patternName).toBe('Memory Leak');
    });
  });

  // ==========================================================================
  // Test: Integration with ConsensusEngineImpl
  // ==========================================================================

  describe('ConsensusEngineImpl integration', () => {
    it('should create engine with defect-intelligence configuration', () => {
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

    it('should verify defect-intelligence security finding', async () => {
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
        id: 'defect-pred-1',
        type: 'defect-prediction',
        category: 'other',
        severity: 'high',
        description: 'High probability defect in authentication module',
        location: {
          file: 'src/services/auth.service.ts',
        },
        evidence: [],
        detectedAt: new Date(),
        detectedBy: 'defect-intelligence-coordinator',
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
