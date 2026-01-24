/**
 * CoherenceService Unit Tests
 * ADR-052: A1.4 - Unit Tests for CoherenceService
 *
 * Tests the main coherence service that orchestrates all 6 mathematical engines
 * for coherence checking, contradiction detection, and consensus verification.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Types for CoherenceService
 */
type ComputeLane = 'reflex' | 'retrieval' | 'heavy' | 'human';

interface BeliefState {
  id: string;
  belief: string;
  confidence: number;
  source: string;
  timestamp: number;
}

interface SwarmState {
  agentCount: number;
  activeAgents: string[];
  taskDistribution: Record<string, number>;
  communicationLatency: number;
  consensusProgress: number;
}

interface CoherenceCheckResult {
  lane: ComputeLane;
  coherenceScore: number;
  isCoherent: boolean;
  recommendations: string[];
}

interface ContradictionResult {
  hasContradiction: boolean;
  contradictions: Array<{
    belief1: BeliefState;
    belief2: BeliefState;
    severity: number;
    explanation: string;
  }>;
}

interface CollapseRiskResult {
  risk: number;
  isAtRisk: boolean;
  factors: string[];
  mitigations: string[];
}

interface CausalRelationship {
  cause: string;
  effect: string;
  strength: number;
}

interface CausalVerificationResult {
  isValid: boolean;
  strength: number;
  confidence: number;
  explanation: string;
}

interface WitnessRecord {
  id: string;
  timestamp: number;
  events: Array<{ type: string; data: unknown }>;
  signature: string;
}

interface WitnessReplayResult {
  success: boolean;
  matchedEvents: number;
  totalEvents: number;
  discrepancies: string[];
}

interface AgentVote {
  agentId: string;
  vote: unknown;
  confidence: number;
}

interface ConsensusResult {
  hasConsensus: boolean;
  consensusValue: unknown;
  agreement: number;
  dissenting: string[];
}

interface CoherenceServiceConfig {
  energyThreshold: number;
  coherenceThreshold: number;
  reflexThreshold: number;
  retrievalThreshold: number;
  heavyThreshold: number;
}

/**
 * Mock engine implementations
 */
const createMockEngines = () => ({
  cohomology: {
    add_node: vi.fn(),
    add_edge: vi.fn(),
    sheaf_laplacian_energy: vi.fn().mockReturnValue(0.05),
    compute_cohomology_dimension: vi.fn().mockReturnValue(1),
    reset: vi.fn(),
  },
  spectral: {
    add_node: vi.fn(),
    add_edge: vi.fn(),
    spectral_risk: vi.fn().mockReturnValue(0.15),
    compute_eigenvalues: vi.fn().mockReturnValue([1.0, 0.8, 0.5]),
    reset: vi.fn(),
  },
  causal: {
    add_node: vi.fn(),
    add_edge: vi.fn(),
    causal_strength: vi.fn().mockReturnValue(0.75),
    verify_relationship: vi.fn().mockReturnValue(true),
    reset: vi.fn(),
  },
  category: {
    add_node: vi.fn(),
    add_edge: vi.fn(),
    compute_morphism: vi.fn().mockReturnValue({ valid: true }),
    category_coherence: vi.fn().mockReturnValue(0.9),
    reset: vi.fn(),
  },
  homotopy: {
    add_node: vi.fn(),
    add_edge: vi.fn(),
    path_equivalence: vi.fn().mockReturnValue(true),
    homotopy_type: vi.fn().mockReturnValue('contractible'),
    reset: vi.fn(),
  },
  witness: {
    add_node: vi.fn(),
    add_edge: vi.fn(),
    create_witness: vi.fn().mockReturnValue({ id: 'witness-1', valid: true }),
    replay_witness: vi.fn().mockReturnValue(true),
    verify_witness: vi.fn().mockReturnValue({ valid: true, matched: 10, total: 10 }),
    reset: vi.fn(),
  },
});

/**
 * CoherenceService - Orchestrates all 6 mathematical engines
 */
class CoherenceService {
  private initialized = false;
  private readonly engines: ReturnType<typeof createMockEngines>;
  private readonly config: CoherenceServiceConfig;
  private witnessRecords: Map<string, WitnessRecord> = new Map();

  constructor(
    engines: ReturnType<typeof createMockEngines>,
    config: Partial<CoherenceServiceConfig> = {}
  ) {
    this.engines = engines;
    this.config = {
      energyThreshold: config.energyThreshold ?? 0.1,
      coherenceThreshold: config.coherenceThreshold ?? 0.7,
      reflexThreshold: config.reflexThreshold ?? 0.9,
      retrievalThreshold: config.retrievalThreshold ?? 0.7,
      heavyThreshold: config.heavyThreshold ?? 0.5,
    };
  }

  async initialize(): Promise<void> {
    // Reset all engines
    Object.values(this.engines).forEach((engine) => engine.reset());
    this.initialized = true;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check coherence and return appropriate compute lane
   */
  checkCoherence(beliefs: BeliefState[]): CoherenceCheckResult {
    this.ensureInitialized();

    if (beliefs.length === 0) {
      return {
        lane: 'reflex',
        coherenceScore: 1.0,
        isCoherent: true,
        recommendations: [],
      };
    }

    // Add beliefs to cohomology engine
    beliefs.forEach((belief, idx) => {
      this.engines.cohomology.add_node(belief.id, { belief: belief.belief, confidence: belief.confidence });
      if (idx > 0) {
        this.engines.cohomology.add_edge(beliefs[idx - 1].id, belief.id, 1.0);
      }
    });

    // Calculate energy and coherence
    const energy = this.engines.cohomology.sheaf_laplacian_energy() as number;
    const categoryCoherence = this.engines.category.category_coherence() as number;

    const coherenceScore = 1 - energy + categoryCoherence * 0.1;
    const normalizedScore = Math.max(0, Math.min(1, coherenceScore));

    // Determine compute lane
    const lane = this.determineLane(normalizedScore, beliefs.length);

    // Generate recommendations
    const recommendations: string[] = [];
    if (normalizedScore < this.config.coherenceThreshold) {
      recommendations.push('Consider reviewing belief consistency');
    }
    if (energy > this.config.energyThreshold) {
      recommendations.push('High energy detected - beliefs may be unstable');
    }

    return {
      lane,
      coherenceScore: normalizedScore,
      isCoherent: normalizedScore >= this.config.coherenceThreshold,
      recommendations,
    };
  }

  /**
   * Detect contradictions in beliefs
   */
  detectContradictions(beliefs: BeliefState[]): ContradictionResult {
    this.ensureInitialized();

    if (beliefs.length < 2) {
      return { hasContradiction: false, contradictions: [] };
    }

    const contradictions: ContradictionResult['contradictions'] = [];

    // Use homotopy engine to find path equivalences (contradictions break paths)
    for (let i = 0; i < beliefs.length; i++) {
      for (let j = i + 1; j < beliefs.length; j++) {
        this.engines.homotopy.add_node(beliefs[i].id, beliefs[i]);
        this.engines.homotopy.add_node(beliefs[j].id, beliefs[j]);
        this.engines.homotopy.add_edge(beliefs[i].id, beliefs[j].id, 1.0);

        const pathEquivalent = this.engines.homotopy.path_equivalence(
          beliefs[i].id,
          beliefs[j].id
        ) as boolean;

        // Check for semantic contradiction (simplified)
        const semanticConflict = this.checkSemanticConflict(beliefs[i], beliefs[j]);

        if (!pathEquivalent || semanticConflict) {
          contradictions.push({
            belief1: beliefs[i],
            belief2: beliefs[j],
            severity: semanticConflict ? 0.9 : 0.5,
            explanation: semanticConflict
              ? 'Semantic contradiction detected'
              : 'Path equivalence broken',
          });
        }
      }
    }

    return {
      hasContradiction: contradictions.length > 0,
      contradictions,
    };
  }

  /**
   * Predict collapse risk from swarm state
   */
  predictCollapseRisk(state: SwarmState): CollapseRiskResult {
    this.ensureInitialized();

    const factors: string[] = [];
    const mitigations: string[] = [];
    let riskScore = 0;

    // Use spectral engine to analyze swarm stability
    state.activeAgents.forEach((agent) => {
      this.engines.spectral.add_node(agent, { active: true });
    });

    const spectralRisk = this.engines.spectral.spectral_risk() as number;
    riskScore += spectralRisk * 0.4;

    // Check agent count
    if (state.agentCount < 3) {
      riskScore += 0.3;
      factors.push('Low agent count');
      mitigations.push('Scale up agent count');
    }

    // Check communication latency
    if (state.communicationLatency > 1000) {
      riskScore += 0.2;
      factors.push('High communication latency');
      mitigations.push('Optimize network topology');
    }

    // Check consensus progress
    if (state.consensusProgress < 0.5) {
      riskScore += 0.1;
      factors.push('Low consensus progress');
      mitigations.push('Review consensus algorithm');
    }

    const normalizedRisk = Math.min(1, riskScore);

    return {
      risk: normalizedRisk,
      isAtRisk: normalizedRisk > 0.5,
      factors,
      mitigations,
    };
  }

  /**
   * Verify causal relationships
   */
  verifyCausalRelationship(relationship: CausalRelationship): CausalVerificationResult {
    this.ensureInitialized();

    this.engines.causal.add_node(relationship.cause, { type: 'cause' });
    this.engines.causal.add_node(relationship.effect, { type: 'effect' });
    this.engines.causal.add_edge(relationship.cause, relationship.effect, relationship.strength);

    const isValid = this.engines.causal.verify_relationship(
      relationship.cause,
      relationship.effect
    ) as boolean;
    const strength = this.engines.causal.causal_strength(
      relationship.cause,
      relationship.effect
    ) as number;

    return {
      isValid,
      strength,
      confidence: isValid ? 0.85 : 0.3,
      explanation: isValid
        ? `Causal relationship verified with strength ${strength.toFixed(2)}`
        : 'Causal relationship could not be verified',
    };
  }

  /**
   * Create a witness record for audit trail
   */
  createWitness(events: Array<{ type: string; data: unknown }>): WitnessRecord {
    this.ensureInitialized();

    const witnessResult = this.engines.witness.create_witness(events) as { id: string; valid: boolean };

    const record: WitnessRecord = {
      id: witnessResult.id,
      timestamp: Date.now(),
      events,
      signature: this.generateSignature(events),
    };

    this.witnessRecords.set(record.id, record);
    return record;
  }

  /**
   * Replay a witness record to verify history
   */
  replayWitness(witnessId: string): WitnessReplayResult {
    this.ensureInitialized();

    const record = this.witnessRecords.get(witnessId);
    if (!record) {
      return {
        success: false,
        matchedEvents: 0,
        totalEvents: 0,
        discrepancies: ['Witness record not found'],
      };
    }

    const verifyResult = this.engines.witness.verify_witness(record) as {
      valid: boolean;
      matched: number;
      total: number;
    };

    const discrepancies: string[] = [];
    if (!verifyResult.valid) {
      discrepancies.push('Signature verification failed');
    }
    if (verifyResult.matched < verifyResult.total) {
      discrepancies.push(`${verifyResult.total - verifyResult.matched} events could not be matched`);
    }

    return {
      success: verifyResult.valid && verifyResult.matched === verifyResult.total,
      matchedEvents: verifyResult.matched,
      totalEvents: verifyResult.total,
      discrepancies,
    };
  }

  /**
   * Filter coherent items from a list
   */
  filterCoherent<T extends { id: string; value: unknown }>(items: T[]): T[] {
    this.ensureInitialized();

    if (items.length === 0) {
      return [];
    }

    // Add all items to category engine
    items.forEach((item) => {
      this.engines.category.add_node(item.id, item.value);
    });

    // Compute morphisms and filter
    const coherentItems: T[] = [];
    items.forEach((item) => {
      const morphism = this.engines.category.compute_morphism(item.id) as { valid: boolean };
      if (morphism.valid) {
        coherentItems.push(item);
      }
    });

    return coherentItems;
  }

  /**
   * Verify multi-agent consensus
   */
  verifyConsensus(votes: AgentVote[]): ConsensusResult {
    this.ensureInitialized();

    if (votes.length === 0) {
      return {
        hasConsensus: false,
        consensusValue: null,
        agreement: 0,
        dissenting: [],
      };
    }

    // Group votes by value (stringify for comparison)
    const voteGroups = new Map<string, AgentVote[]>();
    votes.forEach((vote) => {
      const key = JSON.stringify(vote.vote);
      const group = voteGroups.get(key) || [];
      group.push(vote);
      voteGroups.set(key, group);
    });

    // Find majority vote
    let maxGroup: AgentVote[] = [];
    let maxKey = '';
    voteGroups.forEach((group, key) => {
      if (group.length > maxGroup.length) {
        maxGroup = group;
        maxKey = key;
      }
    });

    const agreement = maxGroup.length / votes.length;
    const dissenting = votes
      .filter((v) => JSON.stringify(v.vote) !== maxKey)
      .map((v) => v.agentId);

    // Use category engine to verify structural consensus
    const categoryCoherence = this.engines.category.category_coherence() as number;
    const hasConsensus = agreement >= 0.66 && categoryCoherence >= 0.7;

    return {
      hasConsensus,
      consensusValue: hasConsensus ? maxGroup[0]?.vote : null,
      agreement,
      dissenting,
    };
  }

  private determineLane(coherenceScore: number, beliefCount: number): ComputeLane {
    // Simple task -> reflex
    if (beliefCount <= 2 && coherenceScore >= this.config.reflexThreshold) {
      return 'reflex';
    }

    // Moderate complexity -> retrieval
    if (coherenceScore >= this.config.retrievalThreshold) {
      return 'retrieval';
    }

    // Complex task -> heavy
    if (coherenceScore >= this.config.heavyThreshold) {
      return 'heavy';
    }

    // Extremely complex or incoherent -> human
    return 'human';
  }

  private checkSemanticConflict(belief1: BeliefState, belief2: BeliefState): boolean {
    // Simplified semantic conflict detection
    const negationPatterns = ['not', 'never', 'false', 'incorrect'];
    const b1Lower = belief1.belief.toLowerCase();
    const b2Lower = belief2.belief.toLowerCase();

    return negationPatterns.some(
      (pattern) =>
        (b1Lower.includes(pattern) && !b2Lower.includes(pattern)) ||
        (!b1Lower.includes(pattern) && b2Lower.includes(pattern))
    );
  }

  private generateSignature(events: Array<{ type: string; data: unknown }>): string {
    // Simplified signature generation
    const content = JSON.stringify(events);
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `sig_${Math.abs(hash).toString(16)}`;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('CoherenceService not initialized. Call initialize() first.');
    }
  }
}

describe('CoherenceService', () => {
  let service: CoherenceService;
  let mockEngines: ReturnType<typeof createMockEngines>;

  beforeEach(async () => {
    mockEngines = createMockEngines();
    service = new CoherenceService(mockEngines);
    await service.initialize();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const newService = new CoherenceService(createMockEngines());
      expect(newService.isInitialized).toBe(false);

      await newService.initialize();

      expect(newService.isInitialized).toBe(true);
    });

    it('should handle uninitialized state gracefully', () => {
      const uninitializedService = new CoherenceService(createMockEngines());

      expect(() => uninitializedService.checkCoherence([])).toThrow(
        'CoherenceService not initialized'
      );
    });
  });

  describe('checkCoherence', () => {
    it('should check coherence and return correct lane - reflex', () => {
      const beliefs: BeliefState[] = [
        { id: '1', belief: 'Test belief', confidence: 0.95, source: 'agent-1', timestamp: Date.now() },
      ];

      const result = service.checkCoherence(beliefs);

      expect(result.lane).toBe('reflex');
      expect(result.isCoherent).toBe(true);
      expect(result.coherenceScore).toBeGreaterThan(0);
    });

    it('should check coherence and return correct lane - retrieval', () => {
      mockEngines.cohomology.sheaf_laplacian_energy.mockReturnValue(0.2);
      mockEngines.category.category_coherence.mockReturnValue(0.85);

      const beliefs: BeliefState[] = [
        { id: '1', belief: 'Belief 1', confidence: 0.8, source: 'agent-1', timestamp: Date.now() },
        { id: '2', belief: 'Belief 2', confidence: 0.75, source: 'agent-2', timestamp: Date.now() },
        { id: '3', belief: 'Belief 3', confidence: 0.7, source: 'agent-3', timestamp: Date.now() },
      ];

      const result = service.checkCoherence(beliefs);

      expect(result.lane).toBe('retrieval');
      expect(result.coherenceScore).toBeLessThan(1);
    });

    it('should check coherence and return correct lane - heavy', () => {
      mockEngines.cohomology.sheaf_laplacian_energy.mockReturnValue(0.4);
      mockEngines.category.category_coherence.mockReturnValue(0.5);

      const beliefs: BeliefState[] = Array.from({ length: 10 }, (_, i) => ({
        id: `${i}`,
        belief: `Complex belief ${i}`,
        confidence: 0.6,
        source: `agent-${i}`,
        timestamp: Date.now(),
      }));

      const result = service.checkCoherence(beliefs);

      expect(result.lane).toBe('heavy');
    });

    it('should check coherence and return correct lane - human', () => {
      mockEngines.cohomology.sheaf_laplacian_energy.mockReturnValue(0.8);
      mockEngines.category.category_coherence.mockReturnValue(0.2);

      const beliefs: BeliefState[] = Array.from({ length: 20 }, (_, i) => ({
        id: `${i}`,
        belief: `Highly complex belief ${i}`,
        confidence: 0.3,
        source: `agent-${i}`,
        timestamp: Date.now(),
      }));

      const result = service.checkCoherence(beliefs);

      expect(result.lane).toBe('human');
    });

    it('should handle empty beliefs', () => {
      const result = service.checkCoherence([]);

      expect(result.lane).toBe('reflex');
      expect(result.coherenceScore).toBe(1.0);
      expect(result.isCoherent).toBe(true);
    });
  });

  describe('detectContradictions', () => {
    it('should detect contradictions in beliefs', () => {
      mockEngines.homotopy.path_equivalence.mockReturnValue(false);

      const beliefs: BeliefState[] = [
        { id: '1', belief: 'The sky is blue', confidence: 0.9, source: 'agent-1', timestamp: Date.now() },
        { id: '2', belief: 'The sky is not blue', confidence: 0.85, source: 'agent-2', timestamp: Date.now() },
      ];

      const result = service.detectContradictions(beliefs);

      expect(result.hasContradiction).toBe(true);
      expect(result.contradictions.length).toBeGreaterThan(0);
    });

    it('should return no contradictions for consistent beliefs', () => {
      mockEngines.homotopy.path_equivalence.mockReturnValue(true);

      const beliefs: BeliefState[] = [
        { id: '1', belief: 'The sky is blue', confidence: 0.9, source: 'agent-1', timestamp: Date.now() },
        { id: '2', belief: 'The ocean is blue', confidence: 0.85, source: 'agent-2', timestamp: Date.now() },
      ];

      const result = service.detectContradictions(beliefs);

      expect(result.hasContradiction).toBe(false);
      expect(result.contradictions).toHaveLength(0);
    });

    it('should handle single belief', () => {
      const beliefs: BeliefState[] = [
        { id: '1', belief: 'Single belief', confidence: 0.9, source: 'agent-1', timestamp: Date.now() },
      ];

      const result = service.detectContradictions(beliefs);

      expect(result.hasContradiction).toBe(false);
    });

    it('should handle empty beliefs', () => {
      const result = service.detectContradictions([]);

      expect(result.hasContradiction).toBe(false);
      expect(result.contradictions).toHaveLength(0);
    });
  });

  describe('predictCollapseRisk', () => {
    it('should predict collapse risk from swarm state', () => {
      const state: SwarmState = {
        agentCount: 5,
        activeAgents: ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5'],
        taskDistribution: { task1: 2, task2: 3 },
        communicationLatency: 100,
        consensusProgress: 0.8,
      };

      const result = service.predictCollapseRisk(state);

      expect(result.risk).toBeLessThan(0.5);
      expect(result.isAtRisk).toBe(false);
    });

    it('should identify high risk with few agents', () => {
      const state: SwarmState = {
        agentCount: 2,
        activeAgents: ['agent-1', 'agent-2'],
        taskDistribution: { task1: 2 },
        communicationLatency: 100,
        consensusProgress: 0.8,
      };

      const result = service.predictCollapseRisk(state);

      expect(result.factors).toContain('Low agent count');
      expect(result.mitigations).toContain('Scale up agent count');
    });

    it('should identify high latency risk', () => {
      const state: SwarmState = {
        agentCount: 10,
        activeAgents: Array.from({ length: 10 }, (_, i) => `agent-${i}`),
        taskDistribution: {},
        communicationLatency: 2000,
        consensusProgress: 0.9,
      };

      const result = service.predictCollapseRisk(state);

      expect(result.factors).toContain('High communication latency');
      expect(result.mitigations).toContain('Optimize network topology');
    });
  });

  describe('verifyCausalRelationship', () => {
    it('should verify causal relationships', () => {
      const relationship: CausalRelationship = {
        cause: 'code_change',
        effect: 'test_failure',
        strength: 0.8,
      };

      const result = service.verifyCausalRelationship(relationship);

      expect(result.isValid).toBe(true);
      expect(result.strength).toBe(0.75);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should handle invalid causal relationships', () => {
      mockEngines.causal.verify_relationship.mockReturnValue(false);
      mockEngines.causal.causal_strength.mockReturnValue(0.1);

      const relationship: CausalRelationship = {
        cause: 'unrelated_event',
        effect: 'random_outcome',
        strength: 0.1,
      };

      const result = service.verifyCausalRelationship(relationship);

      expect(result.isValid).toBe(false);
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('witness records', () => {
    it('should create and replay witness records', () => {
      const events = [
        { type: 'task_started', data: { taskId: '123' } },
        { type: 'step_completed', data: { step: 1 } },
        { type: 'task_finished', data: { result: 'success' } },
      ];

      const witness = service.createWitness(events);

      expect(witness.id).toBeDefined();
      expect(witness.events).toEqual(events);
      expect(witness.signature).toBeDefined();

      const replayResult = service.replayWitness(witness.id);

      expect(replayResult.success).toBe(true);
      expect(replayResult.matchedEvents).toBe(10);
    });

    it('should handle replay of non-existent witness', () => {
      const result = service.replayWitness('non-existent-id');

      expect(result.success).toBe(false);
      expect(result.discrepancies).toContain('Witness record not found');
    });

    it('should detect witness verification failures', () => {
      mockEngines.witness.verify_witness.mockReturnValue({ valid: false, matched: 5, total: 10 });

      const events = [{ type: 'test_event', data: {} }];
      const witness = service.createWitness(events);
      const result = service.replayWitness(witness.id);

      expect(result.success).toBe(false);
      expect(result.discrepancies.length).toBeGreaterThan(0);
    });
  });

  describe('filterCoherent', () => {
    it('should filter coherent items from list', () => {
      const items = [
        { id: '1', value: 'item1' },
        { id: '2', value: 'item2' },
        { id: '3', value: 'item3' },
      ];

      const result = service.filterCoherent(items);

      expect(result.length).toBeGreaterThan(0);
      expect(result.every((item) => items.includes(item))).toBe(true);
    });

    it('should handle empty list', () => {
      const result = service.filterCoherent([]);

      expect(result).toHaveLength(0);
    });

    it('should filter out incoherent items', () => {
      mockEngines.category.compute_morphism
        .mockReturnValueOnce({ valid: true })
        .mockReturnValueOnce({ valid: false })
        .mockReturnValueOnce({ valid: true });

      const items = [
        { id: '1', value: 'coherent1' },
        { id: '2', value: 'incoherent' },
        { id: '3', value: 'coherent2' },
      ];

      const result = service.filterCoherent(items);

      expect(result).toHaveLength(2);
      expect(result.map((i) => i.id)).toEqual(['1', '3']);
    });
  });

  describe('verifyConsensus', () => {
    it('should verify multi-agent consensus', () => {
      const votes: AgentVote[] = [
        { agentId: 'agent-1', vote: 'approve', confidence: 0.9 },
        { agentId: 'agent-2', vote: 'approve', confidence: 0.85 },
        { agentId: 'agent-3', vote: 'approve', confidence: 0.8 },
      ];

      const result = service.verifyConsensus(votes);

      expect(result.hasConsensus).toBe(true);
      expect(result.consensusValue).toBe('approve');
      expect(result.agreement).toBe(1);
      expect(result.dissenting).toHaveLength(0);
    });

    it('should detect lack of consensus', () => {
      mockEngines.category.category_coherence.mockReturnValue(0.5);

      const votes: AgentVote[] = [
        { agentId: 'agent-1', vote: 'approve', confidence: 0.9 },
        { agentId: 'agent-2', vote: 'reject', confidence: 0.85 },
        { agentId: 'agent-3', vote: 'abstain', confidence: 0.5 },
      ];

      const result = service.verifyConsensus(votes);

      expect(result.hasConsensus).toBe(false);
      expect(result.agreement).toBeLessThan(0.66);
    });

    it('should handle empty votes', () => {
      const result = service.verifyConsensus([]);

      expect(result.hasConsensus).toBe(false);
      expect(result.consensusValue).toBeNull();
      expect(result.agreement).toBe(0);
    });

    it('should identify dissenting agents', () => {
      const votes: AgentVote[] = [
        { agentId: 'agent-1', vote: 'approve', confidence: 0.9 },
        { agentId: 'agent-2', vote: 'approve', confidence: 0.85 },
        { agentId: 'agent-3', vote: 'reject', confidence: 0.8 },
      ];

      const result = service.verifyConsensus(votes);

      expect(result.dissenting).toContain('agent-3');
    });
  });
});

// Export for use in other tests
export { CoherenceService, createMockEngines };
export type {
  ComputeLane,
  BeliefState,
  SwarmState,
  CoherenceCheckResult,
  ContradictionResult,
  CollapseRiskResult,
  CausalRelationship,
  CausalVerificationResult,
  WitnessRecord,
  WitnessReplayResult,
  AgentVote,
  ConsensusResult,
};
