/**
 * Test Generation Coherence Gate Tests
 * ADR-052: Verifies coherence gating for test generation requirements
 *
 * Tests:
 * - Block generation on incoherent requirements (human lane)
 * - Enrich spec on retrieval lane
 * - Pass through on reflex lane
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TestGenerationCoherenceGate,
  createTestGenerationCoherenceGate,
  CoherenceError,
  type Requirement,
  type TestSpecification,
  type IEmbeddingService,
} from '../../../src/domains/test-generation/services/coherence-gate-service.js';
import type { ICoherenceService } from '../../../src/integrations/coherence/coherence-service.js';
import type {
  CoherenceResult,
  CoherenceNode,
  ComputeLane,
} from '../../../src/integrations/coherence/types.js';

// ============================================================================
// Mock Coherence Service
// ============================================================================

/**
 * Create a mock coherence service with configurable behavior
 */
function createMockCoherenceService(options: {
  lane?: ComputeLane;
  isCoherent?: boolean;
  energy?: number;
  contradictions?: Array<{
    nodeIds: [string, string];
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    confidence: number;
  }>;
  isInitialized?: boolean;
} = {}): ICoherenceService {
  const {
    lane = 'reflex',
    isCoherent = true,
    energy = 0.05,
    contradictions = [],
    isInitialized = true,
  } = options;

  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    isInitialized: vi.fn().mockReturnValue(isInitialized),
    checkCoherence: vi.fn().mockResolvedValue({
      energy,
      isCoherent,
      lane,
      contradictions,
      recommendations: lane === 'retrieval'
        ? ['Consider adding more context to resolve ambiguity']
        : [],
      durationMs: 5,
      usedFallback: false,
    } as CoherenceResult),
    detectContradictions: vi.fn().mockResolvedValue(contradictions),
    predictCollapse: vi.fn().mockResolvedValue({
      risk: 0.1,
      fiedlerValue: 0.8,
      collapseImminent: false,
      weakVertices: [],
      recommendations: [],
      durationMs: 1,
      usedFallback: false,
    }),
    verifyCausality: vi.fn().mockResolvedValue({
      isCausal: true,
      effectStrength: 0.7,
      relationshipType: 'causal',
      confidence: 0.8,
      confounders: [],
      explanation: 'Verified',
      durationMs: 1,
      usedFallback: false,
    }),
    verifyTypes: vi.fn().mockResolvedValue({
      isValid: true,
      mismatches: [],
      warnings: [],
      durationMs: 1,
      usedFallback: false,
    }),
    createWitness: vi.fn().mockResolvedValue({
      witnessId: 'w1',
      decisionId: 'd1',
      hash: 'abc123',
      chainPosition: 0,
      timestamp: new Date(),
    }),
    replayFromWitness: vi.fn().mockResolvedValue({
      success: true,
      decision: { id: 'd1', type: 'generation', inputs: {}, output: {}, agents: [], timestamp: new Date() },
      matchesOriginal: true,
      durationMs: 1,
    }),
    checkSwarmCoherence: vi.fn().mockResolvedValue({
      energy: 0.05,
      isCoherent: true,
      lane: 'reflex',
      contradictions: [],
      recommendations: [],
      durationMs: 1,
      usedFallback: false,
    }),
    verifyConsensus: vi.fn().mockResolvedValue({
      isValid: true,
      confidence: 0.9,
      isFalseConsensus: false,
      fiedlerValue: 0.5,
      collapseRisk: 0.1,
      recommendation: 'Consensus verified',
      durationMs: 1,
      usedFallback: false,
    }),
    filterCoherent: vi.fn().mockImplementation(items => Promise.resolve(items)),
    getStats: vi.fn().mockReturnValue({
      totalChecks: 1,
      coherentCount: 1,
      incoherentCount: 0,
      averageEnergy: 0.05,
      averageDurationMs: 5,
      totalContradictions: 0,
      laneDistribution: { reflex: 1, retrieval: 0, heavy: 0, human: 0 },
      fallbackCount: 0,
      wasmAvailable: true,
    }),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as unknown as ICoherenceService;
}

/**
 * Create test requirements
 */
function createTestRequirements(count: number = 3): Requirement[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `req-${i + 1}`,
    description: `Test requirement ${i + 1}: The system should handle case ${i + 1}`,
    priority: i === 0 ? 'high' : i === 1 ? 'medium' : 'low',
    source: 'test-suite',
  }));
}

/**
 * Create a test specification
 */
function createTestSpecification(requirements: Requirement[]): TestSpecification {
  return {
    id: 'spec-1',
    name: 'Test Specification',
    requirements,
    testType: 'unit',
    framework: 'vitest',
    context: { version: '1.0.0' },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('TestGenerationCoherenceGate', () => {
  describe('creation', () => {
    it('should create gate with coherence service', () => {
      const mockService = createMockCoherenceService();
      const gate = createTestGenerationCoherenceGate(mockService);

      expect(gate).toBeInstanceOf(TestGenerationCoherenceGate);
    });

    it('should create gate without coherence service (disabled mode)', () => {
      const gate = createTestGenerationCoherenceGate(null);

      expect(gate).toBeInstanceOf(TestGenerationCoherenceGate);
    });

    it('should create gate with custom config', () => {
      const mockService = createMockCoherenceService();
      const gate = createTestGenerationCoherenceGate(mockService, undefined, {
        enabled: false,
        coherenceThreshold: 0.2,
      });

      expect(gate).toBeInstanceOf(TestGenerationCoherenceGate);
    });
  });

  describe('isAvailable', () => {
    it('should return true when coherence service is initialized', () => {
      const mockService = createMockCoherenceService({ isInitialized: true });
      const gate = createTestGenerationCoherenceGate(mockService);

      expect(gate.isAvailable()).toBe(true);
    });

    it('should return false when coherence service is not initialized', () => {
      const mockService = createMockCoherenceService({ isInitialized: false });
      const gate = createTestGenerationCoherenceGate(mockService);

      expect(gate.isAvailable()).toBe(false);
    });

    it('should return false when no coherence service is provided', () => {
      const gate = createTestGenerationCoherenceGate(null);

      expect(gate.isAvailable()).toBe(false);
    });
  });

  describe('checkRequirementCoherence', () => {
    it('should return coherent result for reflex lane', async () => {
      const mockService = createMockCoherenceService({
        lane: 'reflex',
        isCoherent: true,
        energy: 0.05,
      });
      const gate = createTestGenerationCoherenceGate(mockService);
      const requirements = createTestRequirements(3);

      const result = await gate.checkRequirementCoherence(requirements);

      expect(result.isCoherent).toBe(true);
      expect(result.lane).toBe('reflex');
      expect(result.energy).toBe(0.05);
      expect(result.contradictions).toHaveLength(0);
    });

    it('should return retrieval lane with recommendations', async () => {
      const mockService = createMockCoherenceService({
        lane: 'retrieval',
        isCoherent: true,
        energy: 0.25,
      });
      const gate = createTestGenerationCoherenceGate(mockService);
      const requirements = createTestRequirements(3);

      const result = await gate.checkRequirementCoherence(requirements);

      expect(result.lane).toBe('retrieval');
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should return human lane with contradictions', async () => {
      const mockService = createMockCoherenceService({
        lane: 'human',
        isCoherent: false,
        energy: 0.8,
        contradictions: [
          {
            nodeIds: ['req-1', 'req-2'] as [string, string],
            severity: 'critical',
            description: 'Requirements are mutually exclusive',
            confidence: 0.95,
          },
        ],
      });
      const gate = createTestGenerationCoherenceGate(mockService);
      const requirements = createTestRequirements(3);

      const result = await gate.checkRequirementCoherence(requirements);

      expect(result.isCoherent).toBe(false);
      expect(result.lane).toBe('human');
      expect(result.contradictions).toHaveLength(1);
      expect(result.contradictions[0].requirementId1).toBe('req-1');
      expect(result.contradictions[0].requirementId2).toBe('req-2');
      expect(result.contradictions[0].severity).toBe('critical');
    });

    it('should return coherent for empty requirements', async () => {
      const mockService = createMockCoherenceService();
      const gate = createTestGenerationCoherenceGate(mockService);

      const result = await gate.checkRequirementCoherence([]);

      expect(result.isCoherent).toBe(true);
      expect(result.lane).toBe('reflex');
    });

    it('should return coherent for single requirement', async () => {
      const mockService = createMockCoherenceService();
      const gate = createTestGenerationCoherenceGate(mockService);

      const result = await gate.checkRequirementCoherence([createTestRequirements(1)[0]]);

      expect(result.isCoherent).toBe(true);
      expect(result.lane).toBe('reflex');
    });

    it('should return coherent when gate is disabled', async () => {
      const mockService = createMockCoherenceService();
      const gate = createTestGenerationCoherenceGate(mockService, undefined, { enabled: false });
      const requirements = createTestRequirements(3);

      const result = await gate.checkRequirementCoherence(requirements);

      expect(result.isCoherent).toBe(true);
      expect(result.usedFallback).toBe(true);
    });

    it('should return coherent when no service provided', async () => {
      const gate = createTestGenerationCoherenceGate(null);
      const requirements = createTestRequirements(3);

      const result = await gate.checkRequirementCoherence(requirements);

      expect(result.isCoherent).toBe(true);
      expect(result.usedFallback).toBe(true);
    });
  });

  describe('enrichSpecification', () => {
    it('should return original spec when no recommendations', async () => {
      const mockService = createMockCoherenceService();
      const gate = createTestGenerationCoherenceGate(mockService);
      const spec = createTestSpecification(createTestRequirements(3));

      const enrichedSpec = await gate.enrichSpecification(spec, []);

      expect(enrichedSpec).toEqual(spec);
    });

    it('should add context for add-context recommendations', async () => {
      const mockService = createMockCoherenceService();
      const gate = createTestGenerationCoherenceGate(mockService);
      const spec = createTestSpecification(createTestRequirements(3));

      const enrichedSpec = await gate.enrichSpecification(spec, [
        {
          type: 'add-context',
          requirementId: '',
          description: 'Consider performance implications',
        },
      ]);

      expect(enrichedSpec.context?.coherenceRecommendations).toBeDefined();
      expect(enrichedSpec.context?.coherenceRecommendations).toContain('Consider performance implications');
      expect(enrichedSpec.context?.enrichedAt).toBeDefined();
    });

    it('should mark requirements for clarification', async () => {
      const mockService = createMockCoherenceService();
      const gate = createTestGenerationCoherenceGate(mockService);
      const spec = createTestSpecification(createTestRequirements(3));

      const enrichedSpec = await gate.enrichSpecification(spec, [
        {
          type: 'clarify',
          requirementId: 'req-1',
          description: 'Unclear acceptance criteria',
        },
      ]);

      const req1 = enrichedSpec.requirements.find(r => r.id === 'req-1');
      expect(req1?.metadata?.needsClarification).toBe(true);
      expect(req1?.metadata?.clarificationNotes).toContain('Unclear acceptance criteria');
    });

    it('should mark requirements for disambiguation', async () => {
      const mockService = createMockCoherenceService();
      const gate = createTestGenerationCoherenceGate(mockService);
      const spec = createTestSpecification(createTestRequirements(3));

      const enrichedSpec = await gate.enrichSpecification(spec, [
        {
          type: 'resolve-ambiguity',
          requirementId: 'req-2',
          description: 'Conflicts with req-3',
          suggestedResolution: 'Prioritize req-2 over req-3',
        },
      ]);

      const req2 = enrichedSpec.requirements.find(r => r.id === 'req-2');
      expect(req2?.metadata?.needsDisambiguation).toBe(true);
      expect(req2?.metadata?.suggestedResolution).toBe('Prioritize req-2 over req-3');
    });

    it('should track requirements suggested for split', async () => {
      const mockService = createMockCoherenceService();
      const gate = createTestGenerationCoherenceGate(mockService);
      const spec = createTestSpecification(createTestRequirements(3));

      const enrichedSpec = await gate.enrichSpecification(spec, [
        {
          type: 'split-requirement',
          requirementId: 'req-1',
          description: 'Complex requirement should be split',
        },
      ]);

      expect(enrichedSpec.context?.requirementsSuggestedForSplit).toContain('req-1');
    });
  });

  describe('validateAndEnrich', () => {
    it('should block generation on human lane (incoherent requirements)', async () => {
      const mockService = createMockCoherenceService({
        lane: 'human',
        isCoherent: false,
        energy: 0.8,
        contradictions: [
          {
            nodeIds: ['req-1', 'req-2'] as [string, string],
            severity: 'critical',
            description: 'Requirements are mutually exclusive',
            confidence: 0.95,
          },
        ],
      });
      const gate = createTestGenerationCoherenceGate(mockService, undefined, {
        blockOnHumanLane: true,
      });
      const spec = createTestSpecification(createTestRequirements(3));

      const result = await gate.validateAndEnrich(spec);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(CoherenceError);
        expect(result.error.message).toContain('unresolvable contradictions');
        expect(result.error.contradictions).toHaveLength(1);
        expect(result.error.lane).toBe('human');
      }
    });

    it('should enrich spec on retrieval lane', async () => {
      const mockService = createMockCoherenceService({
        lane: 'retrieval',
        isCoherent: true,
        energy: 0.25,
      });
      const gate = createTestGenerationCoherenceGate(mockService, undefined, {
        enrichOnRetrievalLane: true,
      });
      const spec = createTestSpecification(createTestRequirements(3));

      const result = await gate.validateAndEnrich(spec);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.context?.enrichedAt).toBeDefined();
      }
    });

    it('should pass through on reflex lane', async () => {
      const mockService = createMockCoherenceService({
        lane: 'reflex',
        isCoherent: true,
        energy: 0.05,
      });
      const gate = createTestGenerationCoherenceGate(mockService);
      const spec = createTestSpecification(createTestRequirements(3));

      const result = await gate.validateAndEnrich(spec);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual(spec);
      }
    });

    it('should pass through on heavy lane', async () => {
      const mockService = createMockCoherenceService({
        lane: 'heavy',
        isCoherent: true,
        energy: 0.55,
      });
      const gate = createTestGenerationCoherenceGate(mockService);
      const spec = createTestSpecification(createTestRequirements(3));

      const result = await gate.validateAndEnrich(spec);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual(spec);
      }
    });

    it('should not block when blockOnHumanLane is false', async () => {
      const mockService = createMockCoherenceService({
        lane: 'human',
        isCoherent: false,
        energy: 0.8,
      });
      const gate = createTestGenerationCoherenceGate(mockService, undefined, {
        blockOnHumanLane: false,
      });
      const spec = createTestSpecification(createTestRequirements(3));

      const result = await gate.validateAndEnrich(spec);

      expect(result.success).toBe(true);
    });

    it('should not enrich when enrichOnRetrievalLane is false', async () => {
      const mockService = createMockCoherenceService({
        lane: 'retrieval',
        isCoherent: true,
        energy: 0.25,
      });
      const gate = createTestGenerationCoherenceGate(mockService, undefined, {
        enrichOnRetrievalLane: false,
      });
      const spec = createTestSpecification(createTestRequirements(3));

      const result = await gate.validateAndEnrich(spec);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual(spec);
      }
    });
  });

  describe('error handling', () => {
    it('should handle coherence service errors gracefully', async () => {
      const mockService = createMockCoherenceService();
      (mockService.checkCoherence as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('WASM engine failed')
      );

      const gate = createTestGenerationCoherenceGate(mockService);
      const requirements = createTestRequirements(3);

      // Should not throw, should return fallback result
      const result = await gate.checkRequirementCoherence(requirements);

      expect(result.isCoherent).toBe(true);
      expect(result.usedFallback).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('embedding service', () => {
    it('should use custom embedding service when provided', async () => {
      const mockService = createMockCoherenceService();
      const mockEmbeddingService: IEmbeddingService = {
        embed: vi.fn().mockResolvedValue(new Array(384).fill(0.1)),
      };

      const gate = createTestGenerationCoherenceGate(
        mockService,
        mockEmbeddingService
      );
      const requirements = createTestRequirements(3);

      await gate.checkRequirementCoherence(requirements);

      expect(mockEmbeddingService.embed).toHaveBeenCalledTimes(3);
    });

    it('should use fallback embedding service when none provided', async () => {
      const mockService = createMockCoherenceService();
      const gate = createTestGenerationCoherenceGate(mockService);
      const requirements = createTestRequirements(3);

      // Should not throw
      const result = await gate.checkRequirementCoherence(requirements);

      expect(result).toBeDefined();
    });
  });
});
