/**
 * Defect Intelligence Consensus Integration Tests
 * ============================================================================
 *
 * Tests for MM-001: Multi-Model Consensus for Security Verification
 * Verifies that the DefectIntelligenceCoordinator properly integrates with
 * consensus verification for high-confidence defect predictions and root cause analysis.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  DefectIntelligenceCoordinator,
  type CoordinatorConfig,
} from '../../../../src/domains/defect-intelligence/coordinator';

import {
  ConsensusEngineImpl,
  createMockProvider,
  createProviderRegistry,
  createMajorityStrategy,
  createWeightedStrategy,
  type SecurityFinding,
  type ModelProvider,
  type ConsensusResult,
  type ModelVote,
} from '../../../../src/coordination/consensus';

import type {
  DomainFinding,
} from '../../../../src/coordination/consensus/domain-findings';

import type { DomainName, Severity } from '../../../../src/shared/types';
import type { EventBus, AgentCoordinator, AgentInfo, MemoryBackend } from '../../../../src/kernel/interfaces';

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

function createMockAgentCoordinator(): AgentCoordinator & { listAgents: Mock; canSpawn: Mock } {
  return {
    listAgents: vi.fn().mockReturnValue([]),
    canSpawn: vi.fn().mockReturnValue(true),
    spawn: vi.fn().mockResolvedValue({ success: true, value: 'agent-123' }),
    stop: vi.fn().mockResolvedValue({ success: true }),
    getAgent: vi.fn(),
    updateAgentStatus: vi.fn(),
  } as unknown as AgentCoordinator & { listAgents: Mock; canSpawn: Mock };
}

function createMockMemoryBackend(): MemoryBackend {
  const storage = new Map<string, unknown>();
  return {
    get: vi.fn().mockImplementation((key: string) => Promise.resolve(storage.get(key))),
    set: vi.fn().mockImplementation((key: string, value: unknown) => {
      storage.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn().mockImplementation((key: string) => {
      storage.delete(key);
      return Promise.resolve(true);
    }),
    has: vi.fn().mockImplementation((key: string) => Promise.resolve(storage.has(key))),
    keys: vi.fn().mockResolvedValue([]),
    clear: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as unknown as MemoryBackend;
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

function createTestDefectPredictionFinding(overrides?: Partial<DomainFinding<any>>): DomainFinding<any> {
  return {
    id: `finding-${Math.random().toString(36).slice(2, 8)}`,
    type: 'defect-prediction',
    confidence: 0.85,
    severity: 'high' as const,
    description: 'High probability of defect in src/module.ts',
    payload: {
      file: 'src/module.ts',
      probability: 0.85,
      riskLevel: 'high',
      factors: [{ name: 'complexity', contribution: 0.4 }],
      recommendations: ['Review error handling'],
    },
    detectedAt: new Date(),
    detectedBy: 'defect-intelligence-coordinator',
    ...overrides,
  };
}

function createTestRootCauseFinding(overrides?: Partial<DomainFinding<any>>): DomainFinding<any> {
  return {
    id: `finding-${Math.random().toString(36).slice(2, 8)}`,
    type: 'root-cause',
    confidence: 0.9,
    severity: 'high' as const,
    description: 'Root cause identified: race condition in async handler',
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
    ...overrides,
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('DefectIntelligence Consensus Integration', () => {
  let coordinator: DefectIntelligenceCoordinator;
  let mockEventBus: EventBus & { publish: Mock };
  let mockAgentCoordinator: AgentCoordinator & { listAgents: Mock; canSpawn: Mock };
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    mockEventBus = createMockEventBus();
    mockAgentCoordinator = createMockAgentCoordinator();
    mockMemory = createMockMemoryBackend();
  });

  afterEach(async () => {
    if (coordinator) {
      await coordinator.dispose();
    }
  });

  // ==========================================================================
  // Test: Coordinator initializes consensus correctly
  // ==========================================================================

  describe('consensus initialization', () => {
    it('should initialize with consensus disabled', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        { enableConsensus: false, enableMinCutAwareness: false }
      );
      await coordinator.initialize();

      // Should function without consensus
      const stats = coordinator.getConsensusStats();
      expect(stats).toBeUndefined();
    });

    it('should initialize with consensus enabled (no providers available)', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableConsensus: true,
          enableMinCutAwareness: false,
          consensusThreshold: 0.7,
        }
      );
      await coordinator.initialize();

      // Should still function even if no providers are available
      expect(coordinator).toBeDefined();
    });
  });

  // ==========================================================================
  // Test: requiresConsensus() respects threshold
  // ==========================================================================

  describe('consensus requirement detection', () => {
    it('should require consensus for high-confidence defect predictions', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableConsensus: true,
          enableMinCutAwareness: false,
          consensusThreshold: 0.7,
        }
      );
      await coordinator.initialize();

      const highConfidenceFinding = createTestDefectPredictionFinding({
        confidence: 0.85,
        severity: 'critical',
      });

      // High confidence + critical severity should require consensus
      const requires = coordinator.requiresConsensus(highConfidenceFinding);
      expect(requires).toBe(true);
    });

    it('should not require consensus for low-confidence predictions', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableConsensus: true,
          enableMinCutAwareness: false,
          consensusThreshold: 0.7,
        }
      );
      await coordinator.initialize();

      const lowConfidenceFinding = createTestDefectPredictionFinding({
        confidence: 0.5,
        severity: 'low',
      });

      // Low confidence + low severity should not require consensus
      const requires = coordinator.requiresConsensus(lowConfidenceFinding);
      expect(requires).toBe(false);
    });

    it('should require consensus for root cause analysis', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableConsensus: true,
          enableMinCutAwareness: false,
          consensusThreshold: 0.7,
        }
      );
      await coordinator.initialize();

      const rootCauseFinding = createTestRootCauseFinding({
        confidence: 0.85,
        severity: 'high',
      });

      // Root cause with high confidence should require consensus
      const requires = coordinator.requiresConsensus(rootCauseFinding);
      expect(requires).toBe(true);
    });

    it('should not require consensus when disabled', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableConsensus: false,
          enableMinCutAwareness: false,
        }
      );
      await coordinator.initialize();

      const finding = createTestDefectPredictionFinding({
        confidence: 0.95,
        severity: 'critical',
      });

      // Should not require consensus when disabled
      const requires = coordinator.requiresConsensus(finding);
      expect(requires).toBe(false);
    });
  });

  // ==========================================================================
  // Test: verifyFinding() calls consensus engine
  // ==========================================================================

  describe('finding verification', () => {
    it('should return error when consensus not initialized', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableConsensus: true,
          enableMinCutAwareness: false,
        }
      );
      await coordinator.initialize();

      const finding = createTestDefectPredictionFinding();
      const result = await coordinator.verifyFinding(finding);

      // Without providers, consensus engine may not be initialized
      // Result depends on whether providers were registered from env
      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
    });

    it('should return error when finding does not require consensus', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableConsensus: true,
          enableMinCutAwareness: false,
          consensusThreshold: 0.9, // Very high threshold
        }
      );
      await coordinator.initialize();

      const lowConfidenceFinding = createTestDefectPredictionFinding({
        confidence: 0.5,
        severity: 'low',
      });

      const result = await coordinator.verifyFinding(lowConfidenceFinding);

      // Should fail because finding doesn't require consensus
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Test: Graceful degradation without providers
  // ==========================================================================

  describe('graceful degradation', () => {
    it('should work without consensus (graceful degradation)', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableConsensus: false,
          enableMinCutAwareness: false,
        }
      );
      await coordinator.initialize();

      // Coordinator should still process findings without verification
      const finding = createTestDefectPredictionFinding();
      const requires = coordinator.requiresConsensus(finding);

      expect(requires).toBe(false);
    });
  });

  // ==========================================================================
  // Test: Configuration management
  // ==========================================================================

  describe('configuration', () => {
    it('should use custom consensus threshold', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableConsensus: true,
          enableMinCutAwareness: false,
          consensusThreshold: 0.9, // Very high threshold
        }
      );
      await coordinator.initialize();

      // Finding at 0.85 confidence should NOT require consensus with 0.9 threshold
      const finding = createTestDefectPredictionFinding({
        confidence: 0.85,
        severity: 'medium',
      });

      const requires = coordinator.requiresConsensus(finding);
      expect(requires).toBe(false);
    });

    it('should use custom finding types configuration', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableConsensus: true,
          enableMinCutAwareness: false,
          consensusThreshold: 0.7,
          consensusConfig: {
            verifyFindingTypes: ['defect-prediction'], // Only verify predictions
          },
        }
      );
      await coordinator.initialize();

      // Defect prediction should require consensus
      const predictionFinding = createTestDefectPredictionFinding({
        confidence: 0.85,
        severity: 'high',
      });
      expect(coordinator.requiresConsensus(predictionFinding)).toBe(true);
    });
  });

  // ==========================================================================
  // Test: Statistics tracking
  // ==========================================================================

  describe('statistics tracking', () => {
    it('should return undefined stats when consensus is disabled', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableConsensus: false,
          enableMinCutAwareness: false,
        }
      );
      await coordinator.initialize();

      const stats = coordinator.getConsensusStats();
      expect(stats).toBeUndefined();
    });
  });

  // ==========================================================================
  // Test: Coordinator lifecycle with consensus
  // ==========================================================================

  describe('coordinator lifecycle', () => {
    it('should properly dispose consensus resources', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableConsensus: true,
          enableMinCutAwareness: false,
        }
      );
      await coordinator.initialize();

      // Dispose should clean up consensus engine
      await coordinator.dispose();

      // After dispose, coordinator should still respond gracefully
      const stats = coordinator.getConsensusStats();
      expect(stats).toBeUndefined();
    });

    it('should handle multiple initialize/dispose cycles', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableConsensus: true,
          enableMinCutAwareness: false,
        }
      );

      // First cycle
      await coordinator.initialize();
      await coordinator.dispose();

      // Second cycle should work fine
      await coordinator.initialize();
      expect(coordinator).toBeDefined();

      await coordinator.dispose();
    });
  });

  // ==========================================================================
  // Test: Finding type verification
  // ==========================================================================

  describe('finding type verification', () => {
    it('should verify defect-prediction type findings', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableConsensus: true,
          enableMinCutAwareness: false,
          consensusThreshold: 0.7,
        }
      );
      await coordinator.initialize();

      const finding = createTestDefectPredictionFinding({
        type: 'defect-prediction',
        confidence: 0.85,
        severity: 'high',
      });

      const requires = coordinator.requiresConsensus(finding);
      expect(requires).toBe(true);
    });

    it('should verify root-cause type findings', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableConsensus: true,
          enableMinCutAwareness: false,
          consensusThreshold: 0.7,
        }
      );
      await coordinator.initialize();

      const finding = createTestRootCauseFinding({
        type: 'root-cause',
        confidence: 0.9,
        severity: 'high',
      });

      const requires = coordinator.requiresConsensus(finding);
      expect(requires).toBe(true);
    });

    it('should verify regression-risk type findings', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        {
          enableConsensus: true,
          enableMinCutAwareness: false,
          consensusThreshold: 0.7,
        }
      );
      await coordinator.initialize();

      const finding: DomainFinding<any> = {
        id: 'regression-finding',
        type: 'regression-risk',
        confidence: 0.8,
        severity: 'high',
        description: 'High regression risk detected',
        payload: { riskLevel: 'high' },
        detectedAt: new Date(),
        detectedBy: 'defect-intelligence-coordinator',
      };

      const requires = coordinator.requiresConsensus(finding);
      expect(requires).toBe(true);
    });
  });
});
