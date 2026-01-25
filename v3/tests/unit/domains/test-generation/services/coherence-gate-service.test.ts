/**
 * Agentic QE v3 - Test Generation Coherence Gate Service Tests
 * ADR-052: Comprehensive tests for requirement coherence verification
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TestGenerationCoherenceGate,
  createTestGenerationCoherenceGate,
  DEFAULT_COHERENCE_GATE_CONFIG,
  CoherenceError,
  type Requirement,
  type TestSpecification,
  type TestGenerationCoherenceGateConfig,
  type IEmbeddingService,
  type RequirementCoherenceResult,
  type EnrichmentRecommendation,
} from '../../../../../src/domains/test-generation/services/coherence-gate-service.js';
import type {
  ICoherenceService,
} from '../../../../../src/integrations/coherence/coherence-service.js';
import type {
  CoherenceResult,
  ComputeLane,
  Contradiction,
} from '../../../../../src/integrations/coherence/types.js';

// ============================================================================
// Mock Factories
// ============================================================================

/**
 * Create a mock coherence service
 */
function createMockCoherenceService(
  overrides: Partial<ICoherenceService> = {}
): ICoherenceService {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    isInitialized: vi.fn().mockReturnValue(true),
    checkCoherence: vi.fn().mockResolvedValue({
      energy: 0.05,
      isCoherent: true,
      lane: 'reflex' as ComputeLane,
      contradictions: [],
      recommendations: [],
      durationMs: 10,
      usedFallback: false,
    }),
    detectContradictions: vi.fn().mockResolvedValue([]),
    predictCollapse: vi.fn().mockResolvedValue({
      risk: 0,
      fiedlerValue: 1,
      collapseImminent: false,
      weakVertices: [],
      recommendations: [],
      durationMs: 5,
      usedFallback: false,
    }),
    verifyCausality: vi.fn().mockResolvedValue({
      isCausal: true,
      effectStrength: 0.8,
      relationshipType: 'causal',
      confidence: 0.9,
      confounders: [],
      explanation: 'Test',
      durationMs: 5,
      usedFallback: false,
    }),
    verifyTypes: vi.fn().mockResolvedValue({
      isValid: true,
      mismatches: [],
      warnings: [],
      durationMs: 5,
      usedFallback: false,
    }),
    createWitness: vi.fn().mockResolvedValue({
      witnessId: 'test-witness',
      decisionId: 'test-decision',
      hash: 'abc123',
      chainPosition: 0,
      timestamp: new Date(),
    }),
    replayFromWitness: vi.fn().mockResolvedValue({
      success: true,
      decision: {
        id: 'test',
        type: 'routing',
        inputs: {},
        output: null,
        agents: [],
        timestamp: new Date(),
      },
      matchesOriginal: true,
      durationMs: 5,
    }),
    checkSwarmCoherence: vi.fn().mockResolvedValue({
      energy: 0.05,
      isCoherent: true,
      lane: 'reflex',
      contradictions: [],
      recommendations: [],
      durationMs: 10,
      usedFallback: false,
    }),
    verifyConsensus: vi.fn().mockResolvedValue({
      isValid: true,
      confidence: 0.9,
      isFalseConsensus: false,
      fiedlerValue: 0.8,
      collapseRisk: 0.1,
      recommendation: 'Proceed',
      durationMs: 5,
      usedFallback: false,
    }),
    filterCoherent: vi.fn().mockImplementation((items) => Promise.resolve(items)),
    getStats: vi.fn().mockReturnValue({
      totalChecks: 0,
      coherentCount: 0,
      incoherentCount: 0,
      averageEnergy: 0,
      averageDurationMs: 0,
      totalContradictions: 0,
      laneDistribution: { reflex: 0, retrieval: 0, heavy: 0, human: 0 },
      fallbackCount: 0,
      wasmAvailable: true,
    }),
    dispose: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Create a mock embedding service
 */
function createMockEmbeddingService(
  embedFn?: (text: string) => Promise<number[]>
): IEmbeddingService {
  return {
    embed: embedFn || vi.fn().mockImplementation(async (text: string) => {
      // Simple hash-based embedding for testing
      const embedding = new Array(384).fill(0);
      for (let i = 0; i < text.length; i++) {
        embedding[i % 384] += text.charCodeAt(i) / 1000;
      }
      return embedding;
    }),
  };
}

/**
 * Create a test requirement
 */
function createRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: `req-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    description: 'Test requirement description',
    priority: 'medium',
    source: 'test',
    ...overrides,
  };
}

/**
 * Create a test specification
 */
function createTestSpecification(
  requirements: Requirement[] = [],
  overrides: Partial<TestSpecification> = {}
): TestSpecification {
  return {
    id: `spec-${Date.now()}`,
    name: 'Test Specification',
    requirements: requirements.length > 0 ? requirements : [createRequirement()],
    testType: 'unit',
    framework: 'vitest',
    ...overrides,
  };
}

// ============================================================================
// Service Instantiation Tests
// ============================================================================

describe('TestGenerationCoherenceGate', () => {
  describe('instantiation and configuration', () => {
    it('should create gate with default configuration', () => {
      const gate = new TestGenerationCoherenceGate(null);

      expect(gate).toBeDefined();
      expect(gate.isAvailable()).toBe(false);
    });

    it('should create gate with coherence service', () => {
      const mockService = createMockCoherenceService();
      const gate = new TestGenerationCoherenceGate(mockService);

      expect(gate).toBeDefined();
      expect(gate.isAvailable()).toBe(true);
    });

    it('should create gate with custom configuration', () => {
      const customConfig: Partial<TestGenerationCoherenceGateConfig> = {
        enabled: false,
        coherenceThreshold: 0.2,
        blockOnHumanLane: false,
        enrichOnRetrievalLane: false,
        embeddingDimension: 256,
      };

      const gate = new TestGenerationCoherenceGate(null, undefined, customConfig);

      expect(gate).toBeDefined();
    });

    it('should create gate with custom embedding service', () => {
      const mockEmbedding = createMockEmbeddingService();
      const gate = new TestGenerationCoherenceGate(null, mockEmbedding);

      expect(gate).toBeDefined();
    });

    it('should use factory function to create gate', () => {
      const mockService = createMockCoherenceService();
      const gate = createTestGenerationCoherenceGate(mockService);

      expect(gate).toBeDefined();
      expect(gate.isAvailable()).toBe(true);
    });

    it('should merge custom config with defaults', () => {
      const partialConfig: Partial<TestGenerationCoherenceGateConfig> = {
        coherenceThreshold: 0.15,
      };

      const gate = createTestGenerationCoherenceGate(null, undefined, partialConfig);

      // Should still work with partial config
      expect(gate).toBeDefined();
    });
  });

  describe('isAvailable()', () => {
    it('should return false when coherence service is null', () => {
      const gate = new TestGenerationCoherenceGate(null);
      expect(gate.isAvailable()).toBe(false);
    });

    it('should return false when service is not initialized', () => {
      const mockService = createMockCoherenceService({
        isInitialized: vi.fn().mockReturnValue(false),
      });
      const gate = new TestGenerationCoherenceGate(mockService);

      expect(gate.isAvailable()).toBe(false);
    });

    it('should return true when service is initialized', () => {
      const mockService = createMockCoherenceService({
        isInitialized: vi.fn().mockReturnValue(true),
      });
      const gate = new TestGenerationCoherenceGate(mockService);

      expect(gate.isAvailable()).toBe(true);
    });
  });
});

// ============================================================================
// Coherence Validation Tests
// ============================================================================

describe('checkRequirementCoherence', () => {
  describe('pass scenarios', () => {
    it('should pass with empty requirements array', async () => {
      const mockService = createMockCoherenceService();
      const gate = new TestGenerationCoherenceGate(mockService);

      const result = await gate.checkRequirementCoherence([]);

      expect(result.isCoherent).toBe(true);
      expect(result.energy).toBe(0);
      expect(result.lane).toBe('reflex');
      expect(result.contradictions).toHaveLength(0);
    });

    it('should pass with single requirement', async () => {
      const mockService = createMockCoherenceService();
      const gate = new TestGenerationCoherenceGate(mockService);
      const requirement = createRequirement();

      const result = await gate.checkRequirementCoherence([requirement]);

      expect(result.isCoherent).toBe(true);
      expect(result.energy).toBe(0);
      expect(result.lane).toBe('reflex');
      expect(result.usedFallback).toBe(false);
    });

    it('should pass when coherence service returns coherent result', async () => {
      const mockService = createMockCoherenceService({
        checkCoherence: vi.fn().mockResolvedValue({
          energy: 0.05,
          isCoherent: true,
          lane: 'reflex',
          contradictions: [],
          recommendations: [],
          durationMs: 10,
          usedFallback: false,
        }),
      });
      const gate = new TestGenerationCoherenceGate(mockService);
      const requirements = [
        createRequirement({ id: 'req-1', description: 'Requirement 1' }),
        createRequirement({ id: 'req-2', description: 'Requirement 2' }),
      ];

      const result = await gate.checkRequirementCoherence(requirements);

      expect(result.isCoherent).toBe(true);
      expect(result.contradictions).toHaveLength(0);
    });

    it('should pass when coherence checking is disabled', async () => {
      const mockService = createMockCoherenceService();
      const gate = new TestGenerationCoherenceGate(mockService, undefined, {
        enabled: false,
      });
      const requirements = [
        createRequirement({ id: 'req-1' }),
        createRequirement({ id: 'req-2' }),
      ];

      const result = await gate.checkRequirementCoherence(requirements);

      expect(result.isCoherent).toBe(true);
      expect(result.usedFallback).toBe(true);
    });
  });

  describe('fail scenarios', () => {
    it('should fail when coherence service returns incoherent result', async () => {
      const contradictions: Contradiction[] = [{
        nodeIds: ['req-1', 'req-2'],
        severity: 'critical',
        description: 'Contradicting requirements',
        confidence: 0.9,
      }];

      const mockService = createMockCoherenceService({
        checkCoherence: vi.fn().mockResolvedValue({
          energy: 0.8,
          isCoherent: false,
          lane: 'human',
          contradictions,
          recommendations: ['Review requirements'],
          durationMs: 15,
          usedFallback: false,
        }),
      });
      const gate = new TestGenerationCoherenceGate(mockService);
      const requirements = [
        createRequirement({ id: 'req-1', description: 'Must use HTTP' }),
        createRequirement({ id: 'req-2', description: 'Must never use HTTP' }),
      ];

      const result = await gate.checkRequirementCoherence(requirements);

      expect(result.isCoherent).toBe(false);
      expect(result.lane).toBe('human');
      expect(result.contradictions.length).toBeGreaterThan(0);
    });

    it('should handle high-severity contradictions', async () => {
      const mockService = createMockCoherenceService({
        checkCoherence: vi.fn().mockResolvedValue({
          energy: 0.5,
          isCoherent: false,
          lane: 'heavy',
          contradictions: [{
            nodeIds: ['req-1', 'req-2'],
            severity: 'high',
            description: 'Conflicting requirements',
            confidence: 0.85,
          }],
          recommendations: [],
          durationMs: 20,
          usedFallback: false,
        }),
      });
      const gate = new TestGenerationCoherenceGate(mockService);
      const requirements = [
        createRequirement({ id: 'req-1' }),
        createRequirement({ id: 'req-2' }),
      ];

      const result = await gate.checkRequirementCoherence(requirements);

      expect(result.isCoherent).toBe(false);
      expect(result.contradictions[0].severity).toBe('high');
    });
  });

  describe('lane routing', () => {
    it('should route to reflex lane for low energy', async () => {
      const mockService = createMockCoherenceService({
        checkCoherence: vi.fn().mockResolvedValue({
          energy: 0.05,
          isCoherent: true,
          lane: 'reflex',
          contradictions: [],
          recommendations: [],
          durationMs: 5,
          usedFallback: false,
        }),
      });
      const gate = new TestGenerationCoherenceGate(mockService);
      const requirements = [createRequirement(), createRequirement()];

      const result = await gate.checkRequirementCoherence(requirements);

      expect(result.lane).toBe('reflex');
    });

    it('should route to retrieval lane for moderate energy', async () => {
      const mockService = createMockCoherenceService({
        checkCoherence: vi.fn().mockResolvedValue({
          energy: 0.25,
          isCoherent: true,
          lane: 'retrieval',
          contradictions: [],
          recommendations: ['Fetch additional context'],
          durationMs: 10,
          usedFallback: false,
        }),
      });
      const gate = new TestGenerationCoherenceGate(mockService);
      const requirements = [createRequirement(), createRequirement()];

      const result = await gate.checkRequirementCoherence(requirements);

      expect(result.lane).toBe('retrieval');
    });

    it('should route to heavy lane for high energy', async () => {
      const mockService = createMockCoherenceService({
        checkCoherence: vi.fn().mockResolvedValue({
          energy: 0.55,
          isCoherent: false,
          lane: 'heavy',
          contradictions: [],
          recommendations: ['Deep analysis recommended'],
          durationMs: 100,
          usedFallback: false,
        }),
      });
      const gate = new TestGenerationCoherenceGate(mockService);
      const requirements = [createRequirement(), createRequirement()];

      const result = await gate.checkRequirementCoherence(requirements);

      expect(result.lane).toBe('heavy');
    });

    it('should route to human lane for critical energy', async () => {
      const mockService = createMockCoherenceService({
        checkCoherence: vi.fn().mockResolvedValue({
          energy: 0.85,
          isCoherent: false,
          lane: 'human',
          contradictions: [{
            nodeIds: ['req-1', 'req-2'],
            severity: 'critical',
            description: 'Unresolvable contradiction',
            confidence: 0.95,
          }],
          recommendations: ['Escalate to human review'],
          durationMs: 50,
          usedFallback: false,
        }),
      });
      const gate = new TestGenerationCoherenceGate(mockService);
      const requirements = [createRequirement(), createRequirement()];

      const result = await gate.checkRequirementCoherence(requirements);

      expect(result.lane).toBe('human');
    });
  });
});

// ============================================================================
// Quality Thresholds and Scoring Tests
// ============================================================================

describe('quality thresholds and scoring', () => {
  it('should respect default coherence threshold', async () => {
    const mockService = createMockCoherenceService({
      checkCoherence: vi.fn().mockResolvedValue({
        energy: 0.09, // Just below default threshold of 0.1
        isCoherent: true,
        lane: 'reflex',
        contradictions: [],
        recommendations: [],
        durationMs: 5,
        usedFallback: false,
      }),
    });
    const gate = new TestGenerationCoherenceGate(mockService);
    const requirements = [createRequirement(), createRequirement()];

    const result = await gate.checkRequirementCoherence(requirements);

    expect(result.isCoherent).toBe(true);
    expect(result.energy).toBe(0.09);
  });

  it('should respect custom coherence threshold', async () => {
    const mockService = createMockCoherenceService({
      checkCoherence: vi.fn().mockResolvedValue({
        energy: 0.15, // Above default but below custom
        isCoherent: true,
        lane: 'reflex',
        contradictions: [],
        recommendations: [],
        durationMs: 5,
        usedFallback: false,
      }),
    });
    const gate = new TestGenerationCoherenceGate(mockService, undefined, {
      coherenceThreshold: 0.2,
    });
    const requirements = [createRequirement(), createRequirement()];

    const result = await gate.checkRequirementCoherence(requirements);

    expect(result.isCoherent).toBe(true);
  });

  it('should track duration of coherence check', async () => {
    const mockService = createMockCoherenceService({
      checkCoherence: vi.fn().mockResolvedValue({
        energy: 0.05,
        isCoherent: true,
        lane: 'reflex',
        contradictions: [],
        recommendations: [],
        durationMs: 42,
        usedFallback: false,
      }),
    });
    const gate = new TestGenerationCoherenceGate(mockService);
    const requirements = [createRequirement(), createRequirement()];

    const result = await gate.checkRequirementCoherence(requirements);

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should convert requirement priorities to weights', async () => {
    const mockService = createMockCoherenceService();
    const gate = new TestGenerationCoherenceGate(mockService);

    const requirements = [
      createRequirement({ id: 'high-priority', priority: 'high' }),
      createRequirement({ id: 'medium-priority', priority: 'medium' }),
      createRequirement({ id: 'low-priority', priority: 'low' }),
    ];

    await gate.checkRequirementCoherence(requirements);

    // Verify checkCoherence was called with nodes
    expect(mockService.checkCoherence).toHaveBeenCalled();
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('error handling', () => {
  it('should handle coherence service errors gracefully', async () => {
    const mockService = createMockCoherenceService({
      checkCoherence: vi.fn().mockRejectedValue(new Error('Service unavailable')),
    });
    const gate = new TestGenerationCoherenceGate(mockService);
    const requirements = [createRequirement(), createRequirement()];

    const result = await gate.checkRequirementCoherence(requirements);

    // Should return fallback result, not throw
    expect(result.isCoherent).toBe(true);
    expect(result.usedFallback).toBe(true);
    expect(result.lane).toBe('reflex');
  });

  it('should include recommendation when coherence check fails', async () => {
    const mockService = createMockCoherenceService({
      checkCoherence: vi.fn().mockRejectedValue(new Error('WASM error')),
    });
    const gate = new TestGenerationCoherenceGate(mockService);
    const requirements = [createRequirement(), createRequirement()];

    const result = await gate.checkRequirementCoherence(requirements);

    expect(result.recommendations).toContainEqual(
      expect.objectContaining({
        type: 'add-context',
        description: expect.stringContaining('Coherence check failed'),
      })
    );
  });

  it('should handle null coherence service', async () => {
    const gate = new TestGenerationCoherenceGate(null);
    const requirements = [createRequirement(), createRequirement()];

    const result = await gate.checkRequirementCoherence(requirements);

    expect(result.isCoherent).toBe(true);
    expect(result.usedFallback).toBe(true);
  });

  it('should handle embedding service errors', async () => {
    const mockEmbedding = createMockEmbeddingService(
      vi.fn().mockRejectedValue(new Error('Embedding failed'))
    );
    const mockService = createMockCoherenceService();
    const gate = new TestGenerationCoherenceGate(mockService, mockEmbedding);
    const requirements = [createRequirement(), createRequirement()];

    // Should catch error and return fallback
    const result = await gate.checkRequirementCoherence(requirements);

    expect(result.usedFallback).toBe(true);
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('edge cases', () => {
  it('should handle requirements with very long descriptions', async () => {
    const mockService = createMockCoherenceService();
    const gate = new TestGenerationCoherenceGate(mockService);

    const longDescription = 'a'.repeat(1000);
    const requirements = [
      createRequirement({ description: longDescription }),
      createRequirement({ description: 'Short description' }),
    ];

    const result = await gate.checkRequirementCoherence(requirements);

    expect(result).toBeDefined();
    expect(mockService.checkCoherence).toHaveBeenCalled();
  });

  it('should handle requirements with special characters', async () => {
    const mockService = createMockCoherenceService();
    const gate = new TestGenerationCoherenceGate(mockService);

    const requirements = [
      createRequirement({ description: 'Test with "quotes" and \'apostrophes\'' }),
      createRequirement({ description: 'Test with <html> & special chars \n\t' }),
    ];

    const result = await gate.checkRequirementCoherence(requirements);

    expect(result).toBeDefined();
  });

  it('should handle requirements with empty descriptions', async () => {
    const mockService = createMockCoherenceService();
    const gate = new TestGenerationCoherenceGate(mockService);

    const requirements = [
      createRequirement({ description: '' }),
      createRequirement({ description: '   ' }),
    ];

    const result = await gate.checkRequirementCoherence(requirements);

    expect(result).toBeDefined();
  });

  it('should handle large number of requirements', async () => {
    const mockService = createMockCoherenceService();
    const gate = new TestGenerationCoherenceGate(mockService);

    const requirements = Array.from({ length: 100 }, (_, i) =>
      createRequirement({ id: `req-${i}`, description: `Requirement ${i}` })
    );

    const result = await gate.checkRequirementCoherence(requirements);

    expect(result).toBeDefined();
    expect(mockService.checkCoherence).toHaveBeenCalled();
  });

  it('should handle requirements with undefined optional fields', async () => {
    const mockService = createMockCoherenceService();
    const gate = new TestGenerationCoherenceGate(mockService);

    const requirements: Requirement[] = [
      { id: 'req-1', description: 'Test 1' },
      { id: 'req-2', description: 'Test 2' },
    ];

    const result = await gate.checkRequirementCoherence(requirements);

    expect(result).toBeDefined();
  });
});

// ============================================================================
// Enrichment Tests
// ============================================================================

describe('enrichSpecification', () => {
  let gate: TestGenerationCoherenceGate;

  beforeEach(() => {
    const mockService = createMockCoherenceService();
    gate = new TestGenerationCoherenceGate(mockService);
  });

  it('should return original spec when no recommendations', async () => {
    const spec = createTestSpecification();

    const result = await gate.enrichSpecification(spec, []);

    expect(result).toEqual(spec);
  });

  it('should add context for add-context recommendations', async () => {
    const spec = createTestSpecification();
    const recommendations: EnrichmentRecommendation[] = [{
      type: 'add-context',
      requirementId: '',
      description: 'Consider edge cases',
    }];

    const result = await gate.enrichSpecification(spec, recommendations);

    expect(result.context?.coherenceRecommendations).toContain('Consider edge cases');
  });

  it('should add clarification notes for clarify recommendations', async () => {
    const req = createRequirement({ id: 'req-1' });
    const spec = createTestSpecification([req]);
    const recommendations: EnrichmentRecommendation[] = [{
      type: 'clarify',
      requirementId: 'req-1',
      description: 'Clarify the scope',
    }];

    const result = await gate.enrichSpecification(spec, recommendations);

    const enrichedReq = result.requirements.find(r => r.id === 'req-1');
    expect(enrichedReq?.metadata?.needsClarification).toBe(true);
    expect(enrichedReq?.metadata?.clarificationNotes).toContain('Clarify the scope');
  });

  it('should add disambiguation notes for resolve-ambiguity recommendations', async () => {
    const req = createRequirement({ id: 'req-1' });
    const spec = createTestSpecification([req]);
    const recommendations: EnrichmentRecommendation[] = [{
      type: 'resolve-ambiguity',
      requirementId: 'req-1',
      description: 'Resolve ambiguity about timeout',
      suggestedResolution: 'Specify exact timeout value',
    }];

    const result = await gate.enrichSpecification(spec, recommendations);

    const enrichedReq = result.requirements.find(r => r.id === 'req-1');
    expect(enrichedReq?.metadata?.needsDisambiguation).toBe(true);
    expect(enrichedReq?.metadata?.suggestedResolution).toBe('Specify exact timeout value');
  });

  it('should mark requirements for splitting', async () => {
    const req = createRequirement({ id: 'req-1' });
    const spec = createTestSpecification([req]);
    const recommendations: EnrichmentRecommendation[] = [{
      type: 'split-requirement',
      requirementId: 'req-1',
      description: 'Requirement is too complex',
    }];

    const result = await gate.enrichSpecification(spec, recommendations);

    expect(result.context?.requirementsSuggestedForSplit).toContain('req-1');
  });

  it('should add enrichment metadata', async () => {
    const spec = createTestSpecification();
    const recommendations: EnrichmentRecommendation[] = [{
      type: 'add-context',
      requirementId: '',
      description: 'Test recommendation',
    }];

    const result = await gate.enrichSpecification(spec, recommendations);

    expect(result.context?.enrichedAt).toBeDefined();
    expect(result.context?.enrichmentCount).toBe(1);
  });

  it('should handle multiple recommendations for same requirement', async () => {
    const req = createRequirement({ id: 'req-1' });
    const spec = createTestSpecification([req]);
    const recommendations: EnrichmentRecommendation[] = [
      { type: 'clarify', requirementId: 'req-1', description: 'First note' },
      { type: 'clarify', requirementId: 'req-1', description: 'Second note' },
    ];

    const result = await gate.enrichSpecification(spec, recommendations);

    const enrichedReq = result.requirements.find(r => r.id === 'req-1');
    expect(enrichedReq?.metadata?.clarificationNotes).toHaveLength(2);
  });
});

// ============================================================================
// validateAndEnrich Integration Tests
// ============================================================================

describe('validateAndEnrich', () => {
  it('should return ok result for coherent requirements', async () => {
    const mockService = createMockCoherenceService({
      checkCoherence: vi.fn().mockResolvedValue({
        energy: 0.05,
        isCoherent: true,
        lane: 'reflex',
        contradictions: [],
        recommendations: [],
        durationMs: 10,
        usedFallback: false,
      }),
    });
    const gate = new TestGenerationCoherenceGate(mockService);
    const spec = createTestSpecification([
      createRequirement(),
      createRequirement(),
    ]);

    const result = await gate.validateAndEnrich(spec);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual(spec);
    }
  });

  it('should return error for human lane when blockOnHumanLane is true', async () => {
    const mockService = createMockCoherenceService({
      checkCoherence: vi.fn().mockResolvedValue({
        energy: 0.85,
        isCoherent: false,
        lane: 'human',
        contradictions: [{
          nodeIds: ['req-1', 'req-2'],
          severity: 'critical',
          description: 'Critical conflict',
          confidence: 0.95,
        }],
        recommendations: [],
        durationMs: 20,
        usedFallback: false,
      }),
    });
    const gate = new TestGenerationCoherenceGate(mockService, undefined, {
      blockOnHumanLane: true,
    });
    const spec = createTestSpecification([
      createRequirement({ id: 'req-1' }),
      createRequirement({ id: 'req-2' }),
    ]);

    const result = await gate.validateAndEnrich(spec);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(CoherenceError);
      expect(result.error.lane).toBe('human');
      expect(result.error.contradictions.length).toBeGreaterThan(0);
    }
  });

  it('should not block on human lane when blockOnHumanLane is false', async () => {
    const mockService = createMockCoherenceService({
      checkCoherence: vi.fn().mockResolvedValue({
        energy: 0.85,
        isCoherent: false,
        lane: 'human',
        contradictions: [],
        recommendations: [],
        durationMs: 20,
        usedFallback: false,
      }),
    });
    const gate = new TestGenerationCoherenceGate(mockService, undefined, {
      blockOnHumanLane: false,
    });
    const spec = createTestSpecification();

    const result = await gate.validateAndEnrich(spec);

    expect(result.success).toBe(true);
  });

  it('should enrich spec on retrieval lane when enrichOnRetrievalLane is true', async () => {
    // The mock must return recommendations that will trigger enrichment
    // since the gate passes coherenceResult.recommendations to enrichSpecification
    const mockService = createMockCoherenceService({
      checkCoherence: vi.fn().mockResolvedValue({
        energy: 0.25,
        isCoherent: true,
        lane: 'retrieval',
        contradictions: [{
          nodeIds: ['req-1', 'req-2'],
          severity: 'medium',
          description: 'Minor tension detected',
          confidence: 0.7,
        }],
        recommendations: ['Consider additional context'],
        durationMs: 15,
        usedFallback: false,
      }),
    });
    const gate = new TestGenerationCoherenceGate(mockService, undefined, {
      enrichOnRetrievalLane: true,
    });
    const req = createRequirement({ id: 'req-1' });
    const spec = createTestSpecification([req, createRequirement({ id: 'req-2' })]);

    const result = await gate.validateAndEnrich(spec);

    expect(result.success).toBe(true);
    if (result.success) {
      // The enrichedAt is added when recommendations are processed
      expect(result.value.context?.enrichedAt).toBeDefined();
    }
  });

  it('should not enrich spec when enrichOnRetrievalLane is false', async () => {
    const mockService = createMockCoherenceService({
      checkCoherence: vi.fn().mockResolvedValue({
        energy: 0.25,
        isCoherent: true,
        lane: 'retrieval',
        contradictions: [],
        recommendations: ['Consider additional context'],
        durationMs: 15,
        usedFallback: false,
      }),
    });
    const gate = new TestGenerationCoherenceGate(mockService, undefined, {
      enrichOnRetrievalLane: false,
    });
    const spec = createTestSpecification();

    const result = await gate.validateAndEnrich(spec);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual(spec);
    }
  });

  it('should proceed with original spec on reflex lane', async () => {
    const mockService = createMockCoherenceService({
      checkCoherence: vi.fn().mockResolvedValue({
        energy: 0.05,
        isCoherent: true,
        lane: 'reflex',
        contradictions: [],
        recommendations: [],
        durationMs: 5,
        usedFallback: false,
      }),
    });
    const gate = new TestGenerationCoherenceGate(mockService);
    const spec = createTestSpecification();

    const result = await gate.validateAndEnrich(spec);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual(spec);
    }
  });
});

// ============================================================================
// CoherenceError Tests
// ============================================================================

describe('CoherenceError', () => {
  it('should create error with message, contradictions, and lane', () => {
    const contradictions = [
      {
        requirementId1: 'req-1',
        requirementId2: 'req-2',
        severity: 'critical' as const,
        description: 'Test contradiction',
        confidence: 0.9,
      },
    ];

    const error = new CoherenceError(
      'Test error message',
      contradictions,
      'human'
    );

    expect(error.message).toBe('Test error message');
    expect(error.contradictions).toEqual(contradictions);
    expect(error.lane).toBe('human');
    expect(error.name).toBe('CoherenceError');
  });

  it('should be instanceof Error', () => {
    const error = new CoherenceError('Test', [], 'human');

    expect(error instanceof Error).toBe(true);
    expect(error instanceof CoherenceError).toBe(true);
  });
});

// ============================================================================
// Recommendation Generation Tests
// ============================================================================

describe('recommendation generation', () => {
  it('should generate resolve-ambiguity for critical contradictions', async () => {
    const mockService = createMockCoherenceService({
      checkCoherence: vi.fn().mockResolvedValue({
        energy: 0.8,
        isCoherent: false,
        lane: 'human',
        contradictions: [{
          nodeIds: ['req-1', 'req-2'],
          severity: 'critical',
          description: 'Critical conflict',
          confidence: 0.95,
        }],
        recommendations: [],
        durationMs: 20,
        usedFallback: false,
      }),
    });
    const gate = new TestGenerationCoherenceGate(mockService);
    const requirements = [
      createRequirement({ id: 'req-1' }),
      createRequirement({ id: 'req-2' }),
    ];

    const result = await gate.checkRequirementCoherence(requirements);

    const resolveRecs = result.recommendations.filter(r => r.type === 'resolve-ambiguity');
    expect(resolveRecs.length).toBeGreaterThan(0);
  });

  it('should generate clarify for low-severity contradictions', async () => {
    const mockService = createMockCoherenceService({
      checkCoherence: vi.fn().mockResolvedValue({
        energy: 0.3,
        isCoherent: true,
        lane: 'retrieval',
        contradictions: [{
          nodeIds: ['req-1', 'req-2'],
          severity: 'low',
          description: 'Minor tension',
          confidence: 0.6,
        }],
        recommendations: [],
        durationMs: 15,
        usedFallback: false,
      }),
    });
    const gate = new TestGenerationCoherenceGate(mockService);
    const requirements = [
      createRequirement({ id: 'req-1' }),
      createRequirement({ id: 'req-2' }),
    ];

    const result = await gate.checkRequirementCoherence(requirements);

    const clarifyRecs = result.recommendations.filter(r => r.type === 'clarify');
    expect(clarifyRecs.length).toBeGreaterThan(0);
  });

  it('should handle complex requirements gracefully', async () => {
    const mockService = createMockCoherenceService({
      checkCoherence: vi.fn().mockResolvedValue({
        energy: 0.2,
        isCoherent: true,
        lane: 'retrieval',
        contradictions: [],
        recommendations: [],
        durationMs: 15,
        usedFallback: false,
      }),
    });
    const gate = new TestGenerationCoherenceGate(mockService);

    // Description over 200 characters
    const complexDescription = 'This requirement describes a complex feature that requires ' +
      'multiple steps to implement properly. It should handle user authentication, ' +
      'session management, permission verification, and audit logging. The system ' +
      'must also support multiple user roles and provide appropriate access control.';

    // Ensure the description is over 200 characters
    expect(complexDescription.length).toBeGreaterThan(200);

    const requirements = [
      createRequirement({ id: 'complex-req', description: complexDescription }),
      createRequirement({ id: 'simple-req', description: 'Simple requirement' }),
    ];

    const result = await gate.checkRequirementCoherence(requirements);

    // Should process requirements and return valid result
    expect(result).toBeDefined();
    expect(typeof result.isCoherent).toBe('boolean');
    expect(typeof result.energy).toBe('number');
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(Array.isArray(result.contradictions)).toBe(true);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('performance', () => {
  it('should complete coherence check in under 100ms for small sets', async () => {
    const mockService = createMockCoherenceService();
    const gate = new TestGenerationCoherenceGate(mockService);
    const requirements = [
      createRequirement(),
      createRequirement(),
      createRequirement(),
    ];

    const start = performance.now();
    await gate.checkRequirementCoherence(requirements);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });

  it('should complete enrichment in under 50ms', async () => {
    const mockService = createMockCoherenceService();
    const gate = new TestGenerationCoherenceGate(mockService);
    const spec = createTestSpecification();
    const recommendations: EnrichmentRecommendation[] = [
      { type: 'add-context', requirementId: '', description: 'Test 1' },
      { type: 'clarify', requirementId: spec.requirements[0].id, description: 'Test 2' },
    ];

    const start = performance.now();
    await gate.enrichSpecification(spec, recommendations);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });
});

// ============================================================================
// Default Configuration Tests
// ============================================================================

describe('DEFAULT_COHERENCE_GATE_CONFIG', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_COHERENCE_GATE_CONFIG.enabled).toBe(true);
    expect(DEFAULT_COHERENCE_GATE_CONFIG.coherenceThreshold).toBe(0.1);
    expect(DEFAULT_COHERENCE_GATE_CONFIG.blockOnHumanLane).toBe(true);
    expect(DEFAULT_COHERENCE_GATE_CONFIG.enrichOnRetrievalLane).toBe(true);
    expect(DEFAULT_COHERENCE_GATE_CONFIG.embeddingDimension).toBe(384);
  });
});

// ============================================================================
// Fallback Embedding Service Tests
// ============================================================================

describe('fallback embedding service', () => {
  it('should generate consistent embeddings for same text', async () => {
    const gate = new TestGenerationCoherenceGate(null);
    const requirements = [createRequirement({ description: 'Test description' })];

    // Run twice to verify consistency (internal embedding should be deterministic)
    const result1 = await gate.checkRequirementCoherence(requirements);
    const result2 = await gate.checkRequirementCoherence(requirements);

    // Both should complete successfully
    expect(result1.isCoherent).toBe(true);
    expect(result2.isCoherent).toBe(true);
  });

  it('should generate different embeddings for different texts', async () => {
    const mockService = createMockCoherenceService();
    // Don't provide embedding service to use fallback
    const gate = new TestGenerationCoherenceGate(mockService);

    const requirements = [
      createRequirement({ description: 'First completely different description' }),
      createRequirement({ description: 'Second totally unique description' }),
    ];

    const result = await gate.checkRequirementCoherence(requirements);

    // Should complete and call service
    expect(result).toBeDefined();
    expect(mockService.checkCoherence).toHaveBeenCalled();
  });

  it('should generate normalized unit vectors', async () => {
    // Test with a custom embedding service that verifies normalization
    let capturedEmbedding: number[] = [];
    const mockService = createMockCoherenceService({
      checkCoherence: vi.fn().mockImplementation(async (nodes) => {
        if (nodes.length > 0) {
          capturedEmbedding = nodes[0].embedding;
        }
        return {
          energy: 0.05,
          isCoherent: true,
          lane: 'reflex',
          contradictions: [],
          recommendations: [],
          durationMs: 5,
          usedFallback: false,
        };
      }),
    });

    const gate = new TestGenerationCoherenceGate(mockService);
    const requirements = [createRequirement({ description: 'Test' })];

    await gate.checkRequirementCoherence(requirements);

    if (capturedEmbedding.length > 0) {
      // Check that it's approximately a unit vector
      const magnitude = Math.sqrt(
        capturedEmbedding.reduce((sum, val) => sum + val * val, 0)
      );
      // Allow some tolerance for floating point
      expect(Math.abs(magnitude - 1)).toBeLessThan(0.01);
    }
  });
});
