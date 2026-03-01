/**
 * Agentic QE v3 - Test Generation Coherence Gate
 * ADR-052: Coherence verification before test generation
 *
 * Verifies requirement coherence using Prime Radiant mathematical gates
 * before allowing test generation to proceed.
 *
 * @module domains/test-generation/coherence-gate
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types/index.js';
import type {
  ICoherenceService,
} from '../../../integrations/coherence/coherence-service.js';
import type {
  CoherenceResult,
  CoherenceNode,
  ComputeLane,
  Contradiction,
} from '../../../integrations/coherence/types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A requirement for test generation
 */
export interface Requirement {
  /** Unique requirement identifier */
  id: string;
  /** Requirement description */
  description: string;
  /** Optional priority */
  priority?: 'high' | 'medium' | 'low';
  /** Optional source of the requirement */
  source?: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Test specification containing requirements
 */
export interface TestSpecification {
  /** Specification identifier */
  id: string;
  /** Name of the test specification */
  name: string;
  /** Requirements to generate tests for */
  requirements: Requirement[];
  /** Test type */
  testType: 'unit' | 'integration' | 'e2e';
  /** Target framework */
  framework: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Enrichment recommendation from coherence analysis
 */
export interface EnrichmentRecommendation {
  /** Type of enrichment */
  type: 'clarify' | 'add-context' | 'resolve-ambiguity' | 'split-requirement';
  /** Target requirement ID */
  requirementId: string;
  /** Description of what to do */
  description: string;
  /** Optional suggested resolution */
  suggestedResolution?: string;
}

/**
 * Result of coherence check on requirements
 */
export interface RequirementCoherenceResult {
  /** Whether requirements are coherent */
  isCoherent: boolean;
  /** Coherence energy (lower = more coherent) */
  energy: number;
  /** Recommended compute lane */
  lane: ComputeLane;
  /** Detected contradictions between requirements */
  contradictions: RequirementContradiction[];
  /** Recommendations for resolving issues */
  recommendations: EnrichmentRecommendation[];
  /** Duration of the check in milliseconds */
  durationMs: number;
  /** Whether fallback logic was used */
  usedFallback: boolean;
}

/**
 * Severity type for requirement contradictions
 */
export type ContradictionSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * A contradiction between requirements
 */
export interface RequirementContradiction {
  /** First requirement ID */
  requirementId1: string;
  /** Second requirement ID */
  requirementId2: string;
  /** Severity of the contradiction */
  severity: ContradictionSeverity;
  /** Description of the contradiction */
  description: string;
  /** Confidence that this is a true contradiction */
  confidence: number;
  /** Suggested resolution */
  suggestedResolution?: string;
}

/**
 * Configuration for the coherence gate
 */
export interface TestGenerationCoherenceGateConfig {
  /** Whether coherence checking is enabled */
  enabled: boolean;
  /** Coherence threshold for passing (default: 0.1) */
  coherenceThreshold: number;
  /** Whether to block on human lane (default: true) */
  blockOnHumanLane: boolean;
  /** Whether to enrich spec on retrieval lane (default: true) */
  enrichOnRetrievalLane: boolean;
  /** Embedding dimension for requirements (default: 384) */
  embeddingDimension: number;
}

/**
 * Default configuration
 */
export const DEFAULT_COHERENCE_GATE_CONFIG: TestGenerationCoherenceGateConfig = {
  enabled: true,
  coherenceThreshold: 0.1,
  blockOnHumanLane: true,
  enrichOnRetrievalLane: true,
  embeddingDimension: 384,
};

/**
 * Error thrown when requirements have unresolvable contradictions
 */
export class CoherenceError extends Error {
  constructor(
    message: string,
    public readonly contradictions: RequirementContradiction[],
    public readonly lane: ComputeLane
  ) {
    super(message);
    this.name = 'CoherenceError';
  }
}

// ============================================================================
// Embedding Service Interface
// ============================================================================

/**
 * Interface for embedding service (dependency injection)
 */
export interface IEmbeddingService {
  /** Generate embedding for text */
  embed(text: string): Promise<number[]>;
}

/**
 * Simple fallback embedding service using character-based hashing
 * Used when no embedding service is provided
 */
class FallbackEmbeddingService implements IEmbeddingService {
  constructor(private readonly dimension: number = 384) {}

  async embed(text: string): Promise<number[]> {
    const embedding = new Array(this.dimension).fill(0);
    const normalized = text.toLowerCase().trim();

    // Simple character-based embedding with positional encoding
    for (let i = 0; i < normalized.length; i++) {
      const charCode = normalized.charCodeAt(i);
      const position = i % this.dimension;
      embedding[position] += Math.sin(charCode * (i + 1) * 0.1);
      embedding[(position + 1) % this.dimension] += Math.cos(charCode * (i + 1) * 0.1);
    }

    // Normalize to unit vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }
}

// ============================================================================
// Test Generation Coherence Gate Implementation
// ============================================================================

/**
 * Test Generation Coherence Gate
 *
 * Verifies requirement coherence before allowing test generation.
 * Per ADR-052, this gate uses Prime Radiant mathematical coherence
 * checking to detect contradictions and route to appropriate compute lanes.
 *
 * @example
 * ```typescript
 * const gate = new TestGenerationCoherenceGate(coherenceService);
 *
 * const result = await gate.checkRequirementCoherence(spec.requirements);
 *
 * if (result.lane === 'human') {
 *   throw new CoherenceError('Requirements contain unresolvable contradictions', result.contradictions);
 * }
 *
 * if (result.lane === 'retrieval') {
 *   spec = await gate.enrichSpecification(spec, result.recommendations);
 * }
 * ```
 */
export class TestGenerationCoherenceGate {
  private readonly config: TestGenerationCoherenceGateConfig;
  private readonly embeddingService: IEmbeddingService;

  constructor(
    private readonly coherenceService: ICoherenceService | null,
    embeddingService?: IEmbeddingService,
    config: Partial<TestGenerationCoherenceGateConfig> = {}
  ) {
    this.config = { ...DEFAULT_COHERENCE_GATE_CONFIG, ...config };
    this.embeddingService = embeddingService || new FallbackEmbeddingService(this.config.embeddingDimension);
  }

  /**
   * Check coherence of requirements
   *
   * @param requirements - Array of requirements to check
   * @returns Coherence result with lane recommendation
   */
  async checkRequirementCoherence(
    requirements: Requirement[]
  ): Promise<RequirementCoherenceResult> {
    const startTime = Date.now();

    // If coherence checking is disabled or no service, return coherent
    if (!this.config.enabled || !this.coherenceService) {
      return this.createPassingResult(startTime, true);
    }

    // Handle edge cases
    if (requirements.length === 0) {
      return this.createPassingResult(startTime, false);
    }

    if (requirements.length === 1) {
      // Single requirement is always coherent with itself
      return this.createPassingResult(startTime, false);
    }

    try {
      // Convert requirements to coherence nodes
      const nodes = await this.requirementsToNodes(requirements);

      // Check coherence using the service
      const coherenceResult = await this.coherenceService.checkCoherence(nodes);

      // Convert result to requirement-specific format
      return this.transformCoherenceResult(
        coherenceResult,
        requirements,
        Date.now() - startTime
      );
    } catch (error) {
      console.error('[TestGenerationCoherenceGate] Coherence check failed:', error);

      // Return fallback result - don't block on errors
      return {
        isCoherent: true,
        energy: 0,
        lane: 'reflex',
        contradictions: [],
        recommendations: [{
          type: 'add-context',
          requirementId: '',
          description: 'Coherence check failed. Manual review recommended.',
          suggestedResolution: 'Review requirements manually before proceeding.',
        }],
        durationMs: Date.now() - startTime,
        usedFallback: true,
      };
    }
  }

  /**
   * Enrich a test specification based on coherence recommendations
   *
   * @param spec - Original test specification
   * @param recommendations - Recommendations from coherence check
   * @returns Enriched specification
   */
  async enrichSpecification(
    spec: TestSpecification,
    recommendations: EnrichmentRecommendation[]
  ): Promise<TestSpecification> {
    if (recommendations.length === 0) {
      return spec;
    }

    // Create a deep copy of the specification
    const enrichedSpec: TestSpecification = {
      ...spec,
      requirements: [...spec.requirements],
      context: { ...spec.context },
    };

    // Track which requirements need updates
    const requirementUpdates = new Map<string, Partial<Requirement>>();

    for (const rec of recommendations) {
      switch (rec.type) {
        case 'clarify':
          // Add clarification note to requirement metadata
          this.addClarificationNote(requirementUpdates, rec);
          break;

        case 'add-context':
          // Add context to the specification
          enrichedSpec.context = {
            ...enrichedSpec.context,
            coherenceRecommendations: [
              ...((enrichedSpec.context?.coherenceRecommendations as string[]) || []),
              rec.description,
            ],
          };
          break;

        case 'resolve-ambiguity':
          // Add disambiguation note
          this.addDisambiguationNote(requirementUpdates, rec);
          break;

        case 'split-requirement':
          // Mark requirement for potential splitting
          enrichedSpec.context = {
            ...enrichedSpec.context,
            requirementsSuggestedForSplit: [
              ...((enrichedSpec.context?.requirementsSuggestedForSplit as string[]) || []),
              rec.requirementId,
            ],
          };
          break;
      }
    }

    // Apply requirement updates
    enrichedSpec.requirements = enrichedSpec.requirements.map(req => {
      const updates = requirementUpdates.get(req.id);
      if (updates) {
        return {
          ...req,
          metadata: {
            ...req.metadata,
            ...updates.metadata,
          },
        };
      }
      return req;
    });

    // Add enrichment metadata
    enrichedSpec.context = {
      ...enrichedSpec.context,
      enrichedAt: new Date().toISOString(),
      enrichmentCount: recommendations.length,
    };

    return enrichedSpec;
  }

  /**
   * Validate requirements before test generation
   *
   * Convenience method that combines coherence check with automatic
   * enrichment and error handling per ADR-052 specification.
   *
   * @param spec - Test specification to validate
   * @returns Validated (and possibly enriched) specification
   * @throws CoherenceError if requirements have unresolvable contradictions
   */
  async validateAndEnrich(
    spec: TestSpecification
  ): Promise<Result<TestSpecification, CoherenceError>> {
    const coherenceResult = await this.checkRequirementCoherence(spec.requirements);

    // Human lane = unresolvable contradictions, block generation
    if (this.config.blockOnHumanLane && coherenceResult.lane === 'human') {
      return err(new CoherenceError(
        'Requirements contain unresolvable contradictions that require human review',
        coherenceResult.contradictions,
        coherenceResult.lane
      ));
    }

    // Retrieval lane = needs enrichment
    if (this.config.enrichOnRetrievalLane && coherenceResult.lane === 'retrieval') {
      const enrichedSpec = await this.enrichSpecification(
        spec,
        coherenceResult.recommendations
      );
      return ok(enrichedSpec);
    }

    // Reflex or heavy lane = proceed with original spec
    return ok(spec);
  }

  /**
   * Check if the gate is available (coherence service is initialized)
   */
  isAvailable(): boolean {
    return this.coherenceService?.isInitialized() ?? false;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Convert requirements to coherence nodes
   */
  private async requirementsToNodes(requirements: Requirement[]): Promise<CoherenceNode[]> {
    const nodes: CoherenceNode[] = [];

    for (const req of requirements) {
      const embedding = await this.embeddingService.embed(req.description);

      nodes.push({
        id: req.id,
        embedding,
        weight: this.priorityToWeight(req.priority),
        metadata: {
          description: req.description,
          source: req.source,
          ...req.metadata,
        },
      });
    }

    return nodes;
  }

  /**
   * Transform coherence result to requirement-specific format
   */
  private transformCoherenceResult(
    result: CoherenceResult,
    requirements: Requirement[],
    durationMs: number
  ): RequirementCoherenceResult {
    // Create requirement ID lookup
    const reqById = new Map(requirements.map(r => [r.id, r]));

    // Transform contradictions
    const contradictions: RequirementContradiction[] = result.contradictions.map(c => ({
      requirementId1: c.nodeIds[0],
      requirementId2: c.nodeIds[1],
      severity: this.mapSeverity(c.severity),
      description: c.description,
      confidence: c.confidence,
      suggestedResolution: c.resolution || this.generateResolutionSuggestion(
        reqById.get(c.nodeIds[0]),
        reqById.get(c.nodeIds[1]),
        c.severity
      ),
    }));

    // Generate enrichment recommendations
    const recommendations = this.generateRecommendations(
      result,
      contradictions,
      requirements
    );

    return {
      isCoherent: result.isCoherent,
      energy: result.energy,
      lane: result.lane,
      contradictions,
      recommendations,
      durationMs,
      usedFallback: result.usedFallback,
    };
  }

  /**
   * Generate enrichment recommendations based on coherence result
   */
  private generateRecommendations(
    result: CoherenceResult,
    contradictions: RequirementContradiction[],
    requirements: Requirement[]
  ): EnrichmentRecommendation[] {
    const recommendations: EnrichmentRecommendation[] = [];

    // Add recommendations from coherence service
    for (const rec of result.recommendations) {
      recommendations.push({
        type: 'add-context',
        requirementId: '',
        description: rec,
      });
    }

    // Add specific recommendations for contradictions
    for (const contradiction of contradictions) {
      if (contradiction.severity === 'critical' || contradiction.severity === 'high') {
        recommendations.push({
          type: 'resolve-ambiguity',
          requirementId: contradiction.requirementId1,
          description: `Potential conflict with requirement ${contradiction.requirementId2}: ${contradiction.description}`,
          suggestedResolution: contradiction.suggestedResolution,
        });
      } else {
        recommendations.push({
          type: 'clarify',
          requirementId: contradiction.requirementId1,
          description: `Minor tension with requirement ${contradiction.requirementId2}: ${contradiction.description}`,
        });
      }
    }

    // Check for requirements that might need splitting
    const complexRequirements = requirements.filter(r =>
      r.description.length > 200 ||
      r.description.includes(' and ') && r.description.includes(' or ')
    );

    for (const req of complexRequirements) {
      recommendations.push({
        type: 'split-requirement',
        requirementId: req.id,
        description: 'Complex requirement may benefit from splitting into smaller, focused requirements',
      });
    }

    return recommendations;
  }

  /**
   * Generate a resolution suggestion for a contradiction
   */
  private generateResolutionSuggestion(
    req1: Requirement | undefined,
    req2: Requirement | undefined,
    severity: string
  ): string {
    if (!req1 || !req2) {
      return 'Review and reconcile conflicting requirements.';
    }

    if (severity === 'critical') {
      return `Requirements "${req1.id}" and "${req2.id}" appear to be mutually exclusive. ` +
             `Consider removing one or explicitly documenting the conditions under which each applies.`;
    }

    if (severity === 'high') {
      return `Requirements "${req1.id}" and "${req2.id}" may conflict. ` +
             `Add clarification about their relationship and precedence.`;
    }

    return `Minor tension between "${req1.id}" and "${req2.id}". ` +
           `Consider adding context to clarify their relationship.`;
  }

  /**
   * Create a passing coherence result
   */
  private createPassingResult(
    startTime: number,
    usedFallback: boolean
  ): RequirementCoherenceResult {
    return {
      isCoherent: true,
      energy: 0,
      lane: 'reflex',
      contradictions: [],
      recommendations: [],
      durationMs: Date.now() - startTime,
      usedFallback,
    };
  }

  /**
   * Convert priority to weight
   */
  private priorityToWeight(priority?: string): number {
    switch (priority) {
      case 'high': return 1.0;
      case 'medium': return 0.7;
      case 'low': return 0.4;
      default: return 0.5;
    }
  }

  /**
   * Map Severity type to ContradictionSeverity
   * Coherence Severity includes 'info' which we map to 'low'
   */
  private mapSeverity(severity: string): ContradictionSeverity {
    switch (severity) {
      case 'critical': return 'critical';
      case 'high': return 'high';
      case 'medium': return 'medium';
      case 'low':
      case 'info':
      default: return 'low';
    }
  }

  /**
   * Add clarification note to requirement updates
   */
  private addClarificationNote(
    updates: Map<string, Partial<Requirement>>,
    rec: EnrichmentRecommendation
  ): void {
    const existing = updates.get(rec.requirementId) || { metadata: {} };
    const notes = (existing.metadata?.clarificationNotes as string[]) || [];
    notes.push(rec.description);

    updates.set(rec.requirementId, {
      ...existing,
      metadata: {
        ...existing.metadata,
        clarificationNotes: notes,
        needsClarification: true,
      },
    });
  }

  /**
   * Add disambiguation note to requirement updates
   */
  private addDisambiguationNote(
    updates: Map<string, Partial<Requirement>>,
    rec: EnrichmentRecommendation
  ): void {
    const existing = updates.get(rec.requirementId) || { metadata: {} };
    const notes = (existing.metadata?.disambiguationNotes as string[]) || [];
    notes.push(rec.description);

    updates.set(rec.requirementId, {
      ...existing,
      metadata: {
        ...existing.metadata,
        disambiguationNotes: notes,
        needsDisambiguation: true,
        suggestedResolution: rec.suggestedResolution,
      },
    });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a TestGenerationCoherenceGate
 *
 * @param coherenceService - Optional coherence service (can be null for disabled mode)
 * @param embeddingService - Optional embedding service
 * @param config - Optional configuration
 * @returns Configured coherence gate
 *
 * @example
 * ```typescript
 * // With coherence service
 * const gate = createTestGenerationCoherenceGate(coherenceService);
 *
 * // Disabled mode (no blocking)
 * const disabledGate = createTestGenerationCoherenceGate(null, null, { enabled: false });
 * ```
 */
export function createTestGenerationCoherenceGate(
  coherenceService: ICoherenceService | null,
  embeddingService?: IEmbeddingService,
  config?: Partial<TestGenerationCoherenceGateConfig>
): TestGenerationCoherenceGate {
  return new TestGenerationCoherenceGate(coherenceService, embeddingService, config);
}
