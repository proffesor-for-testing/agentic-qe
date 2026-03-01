/**
 * InsightGenerator - Generate Actionable Insights from Dream Associations
 * ADR-021: QE ReasoningBank - Dream Cycle Integration
 *
 * Transforms co-activated concept associations into actionable insights
 * that can improve agent behavior and create new patterns.
 *
 * Insight Types:
 * - pattern_merge: Combine similar patterns into a more general one
 * - novel_association: Unexpected connection between concepts
 * - optimization: Improvement opportunity for existing patterns
 * - gap_detection: Missing knowledge or capability detected
 *
 * @module learning/dream/insight-generator
 */

import { randomUUID } from 'crypto';
import type {
  ConceptNode,
  DreamInsight as BaseDreamInsight,
  InsightType,
} from './types.js';
import type { ActivationResult } from './spreading-activation.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Extended DreamInsight with additional fields for V3
 */
export interface DreamInsight {
  /** Unique identifier */
  id: string;

  /** ID of the dream cycle that produced this insight */
  cycleId: string;

  /** Type of insight */
  type: 'pattern_merge' | 'novel_association' | 'optimization' | 'gap_detection';

  /** IDs of concepts that contributed to this insight */
  sourceConcepts: string[];

  /** Human-readable description of the insight */
  description: string;

  /** Novelty score (0-1), higher = more novel */
  noveltyScore: number;

  /** Confidence score (0-1), higher = more confident */
  confidenceScore: number;

  /** Whether this insight can be acted upon */
  actionable: boolean;

  /** Whether this insight has been applied */
  applied: boolean;

  /** Optional: pattern created from this insight */
  patternId?: string;

  /** Suggested action if actionable */
  suggestedAction?: string;

  /** When this insight was created */
  createdAt: Date;
}

/**
 * Configuration for insight generation
 */
export interface InsightConfig {
  /** Minimum novelty score to report an insight. Default: 0.3 */
  minNoveltyScore: number;

  /** Minimum confidence score to mark as actionable. Default: 0.5 */
  minConfidence: number;

  /** Maximum insights to generate per cycle. Default: 10 */
  maxInsightsPerCycle: number;
}

/**
 * Default insight configuration
 */
export const DEFAULT_INSIGHT_CONFIG: InsightConfig = {
  minNoveltyScore: 0.3,
  minConfidence: 0.5,
  maxInsightsPerCycle: 10,
};

/**
 * Pattern template generated from an insight
 */
export interface PatternTemplate {
  name: string;
  description: string;
  template: Record<string, unknown>;
}

// ============================================================================
// ConceptGraph Interface (minimal required interface)
// ============================================================================

/**
 * Minimal interface for ConceptGraph required by InsightGenerator
 */
export interface ConceptGraph {
  /** Get a concept node by ID */
  getConcept(id: string): ConceptNode | undefined;

  /** Get all concept nodes */
  getAllConcepts(minActivation?: number): ConceptNode[];

  /** Get nodes above a certain activation threshold */
  getActiveNodes(threshold: number): ConceptNode[];

  /** Get outgoing edges from a node */
  getEdges(nodeId: string): Array<{
    id: string;
    source: string;
    target: string;
    weight: number;
    edgeType: string;
    evidence: number;
  }>;

  /** Check if an edge exists between two nodes */
  getEdge(source: string, target: string): { weight: number } | undefined;
}

// ============================================================================
// InsightGenerator Class
// ============================================================================

/**
 * InsightGenerator creates actionable insights from concept associations
 * discovered during dream cycles.
 *
 * @example
 * ```typescript
 * const generator = new InsightGenerator(graph, {
 *   minNoveltyScore: 0.3,
 *   minConfidence: 0.5,
 * });
 *
 * const insights = await generator.generateFromActivation(
 *   'cycle-123',
 *   activationResult
 * );
 *
 * console.log(`Generated ${insights.length} insights`);
 *
 * // Convert actionable insight to pattern
 * if (insights[0].actionable) {
 *   const pattern = await generator.insightToPattern(insights[0]);
 * }
 * ```
 */
export class InsightGenerator {
  private readonly graph: ConceptGraph;
  private readonly config: InsightConfig;

  constructor(graph: ConceptGraph, config: Partial<InsightConfig> = {}) {
    this.graph = graph;
    this.config = { ...DEFAULT_INSIGHT_CONFIG, ...config };
  }

  // ==========================================================================
  // Main Generation Method
  // ==========================================================================

  /**
   * Generate insights from an activation result.
   *
   * Analyzes the activated nodes and novel associations to produce
   * actionable insights about patterns, optimizations, and gaps.
   *
   * @param cycleId - ID of the dream cycle that produced the activation
   * @param activationResult - Result from SpreadingActivation.spread() or .dream()
   * @returns Array of generated insights
   */
  async generateFromActivation(
    cycleId: string,
    activationResult: ActivationResult
  ): Promise<DreamInsight[]> {
    const allInsights: DreamInsight[] = [];

    // Get active concept nodes
    const activeNodes = activationResult.activatedNodes
      .map((n) => this.graph.getConcept(n.nodeId))
      .filter((n): n is ConceptNode => n !== undefined);

    if (activeNodes.length < 2) {
      return [];
    }

    // Detect pattern merges
    const patternMerges = await this.detectPatternMerges(activeNodes);
    for (const insight of patternMerges) {
      insight.cycleId = cycleId;
      allInsights.push(insight);
    }

    // Detect novel associations
    const novelAssociations = await this.detectNovelAssociations(
      activationResult.novelAssociations
    );
    for (const insight of novelAssociations) {
      insight.cycleId = cycleId;
      allInsights.push(insight);
    }

    // Detect optimizations
    const optimizations = await this.detectOptimizations(activeNodes);
    for (const insight of optimizations) {
      insight.cycleId = cycleId;
      allInsights.push(insight);
    }

    // Detect gaps
    const gaps = await this.detectGaps(activeNodes);
    for (const insight of gaps) {
      insight.cycleId = cycleId;
      allInsights.push(insight);
    }

    // Filter by novelty threshold and limit
    return allInsights
      .filter((i) => i.noveltyScore >= this.config.minNoveltyScore)
      .sort((a, b) => b.noveltyScore - a.noveltyScore)
      .slice(0, this.config.maxInsightsPerCycle);
  }

  // ==========================================================================
  // Pattern Merge Detection
  // ==========================================================================

  /**
   * Detect opportunities to merge similar patterns.
   *
   * Pattern merges are detected when:
   * - Multiple pattern-type concepts are co-activated
   * - They share similar content or metadata
   * - They have high edge weights between them (similarity)
   *
   * @param activeNodes - Currently activated concept nodes
   * @returns Array of pattern merge insights
   */
  async detectPatternMerges(activeNodes: ConceptNode[]): Promise<DreamInsight[]> {
    const insights: DreamInsight[] = [];

    // Find pattern-type nodes
    const patternNodes = activeNodes.filter(
      (n) => n.conceptType === 'pattern' || n.conceptType === 'technique'
    );

    if (patternNodes.length < 2) {
      return insights;
    }

    // Find pairs with high similarity
    for (let i = 0; i < patternNodes.length; i++) {
      for (let j = i + 1; j < patternNodes.length; j++) {
        const nodeA = patternNodes[i];
        const nodeB = patternNodes[j];

        // Check edge weight (similarity)
        const edge = this.graph.getEdge(nodeA.id, nodeB.id);
        const reverseEdge = this.graph.getEdge(nodeB.id, nodeA.id);
        const edgeWeight = Math.max(edge?.weight ?? 0, reverseEdge?.weight ?? 0);

        // Check content similarity
        const contentSimilarity = this.calculateContentSimilarity(
          nodeA.content,
          nodeB.content
        );

        // Co-activation strength
        const coActivation = Math.sqrt(
          nodeA.activationLevel * nodeB.activationLevel
        );

        // Score for merge opportunity
        const mergeScore =
          edgeWeight * 0.4 + contentSimilarity * 0.3 + coActivation * 0.3;

        if (mergeScore > 0.5) {
          const novelty = this.calculateNovelty({
            type: 'pattern_merge',
            sourceConcepts: [nodeA.id, nodeB.id],
          });

          const confidence = this.calculateConfidence({
            type: 'pattern_merge',
            sourceConcepts: [nodeA.id, nodeB.id],
            edgeWeight,
            contentSimilarity,
            coActivation,
          });

          insights.push({
            id: this.generateId(),
            cycleId: '', // Set by caller
            type: 'pattern_merge',
            sourceConcepts: [nodeA.id, nodeB.id],
            description: this.generatePatternMergeDescription(nodeA, nodeB, mergeScore),
            noveltyScore: novelty,
            confidenceScore: confidence,
            actionable: confidence >= this.config.minConfidence,
            applied: false,
            suggestedAction:
              confidence >= this.config.minConfidence
                ? `Merge "${this.truncate(nodeA.content, 30)}" with "${this.truncate(nodeB.content, 30)}" into a unified pattern.`
                : undefined,
            createdAt: new Date(),
          });
        }
      }
    }

    return insights;
  }

  // ==========================================================================
  // Novel Association Detection
  // ==========================================================================

  /**
   * Detect insights from novel associations.
   *
   * Novel associations are unexpected links between concepts that
   * may represent new understanding or connection opportunities.
   *
   * @param associations - Novel associations from activation result
   * @returns Array of novel association insights
   */
  async detectNovelAssociations(
    associations: Array<{ source: string; target: string; strength: number }>
  ): Promise<DreamInsight[]> {
    const insights: DreamInsight[] = [];

    for (const assoc of associations) {
      const sourceNode = this.graph.getConcept(assoc.source);
      const targetNode = this.graph.getConcept(assoc.target);

      if (!sourceNode || !targetNode) continue;

      // Skip if nodes are too similar (not really novel)
      const edge = this.graph.getEdge(assoc.source, assoc.target);
      if (edge && edge.weight > 0.5) continue;

      // Check if types are different (cross-domain connection)
      const isCrossDomain = sourceNode.conceptType !== targetNode.conceptType;

      const novelty = this.calculateNovelty({
        type: 'novel_association',
        sourceConcepts: [assoc.source, assoc.target],
        isCrossDomain,
        strength: assoc.strength,
      });

      const confidence = this.calculateConfidence({
        type: 'novel_association',
        sourceConcepts: [assoc.source, assoc.target],
        coActivation: assoc.strength,
        isCrossDomain,
      });

      insights.push({
        id: this.generateId(),
        cycleId: '', // Set by caller
        type: 'novel_association',
        sourceConcepts: [assoc.source, assoc.target],
        description: this.generateNovelAssociationDescription(
          sourceNode,
          targetNode,
          assoc.strength,
          isCrossDomain
        ),
        noveltyScore: novelty,
        confidenceScore: confidence,
        actionable: confidence >= this.config.minConfidence,
        applied: false,
        suggestedAction:
          confidence >= this.config.minConfidence
            ? `Investigate connection between "${this.truncate(sourceNode.content, 25)}" and "${this.truncate(targetNode.content, 25)}".`
            : undefined,
        createdAt: new Date(),
      });
    }

    return insights;
  }

  // ==========================================================================
  // Optimization Detection
  // ==========================================================================

  /**
   * Detect optimization opportunities from active patterns.
   *
   * Optimizations are detected when:
   * - A pattern has low success rate metadata
   * - A technique has high execution count but mediocre outcomes
   * - Multiple related patterns could be consolidated
   *
   * @param activeNodes - Currently activated concept nodes
   * @returns Array of optimization insights
   */
  async detectOptimizations(activeNodes: ConceptNode[]): Promise<DreamInsight[]> {
    const insights: DreamInsight[] = [];

    for (const node of activeNodes) {
      // Skip if not pattern or technique type
      if (node.conceptType !== 'pattern' && node.conceptType !== 'technique') {
        continue;
      }

      // Check metadata for optimization signals
      const metadata = node.metadata ?? {};
      const successRate = metadata.successRate as number | undefined;
      const executionCount = metadata.executionCount as number | undefined;
      const confidence = metadata.confidence as number | undefined;

      // Look for patterns with room for improvement
      const hasLowSuccess = successRate !== undefined && successRate < 0.7;
      const hasHighUsage = executionCount !== undefined && executionCount > 10;
      const hasLowConfidence = confidence !== undefined && confidence < 0.6;

      if (hasLowSuccess || (hasHighUsage && hasLowConfidence)) {
        const novelty = this.calculateNovelty({
          type: 'optimization',
          sourceConcepts: [node.id],
          hasLowSuccess,
          hasHighUsage,
        });

        const insightConfidence = this.calculateConfidence({
          type: 'optimization',
          sourceConcepts: [node.id],
          hasLowSuccess,
          hasHighUsage,
          metadata,
        });

        insights.push({
          id: this.generateId(),
          cycleId: '', // Set by caller
          type: 'optimization',
          sourceConcepts: [node.id],
          description: this.generateOptimizationDescription(
            node,
            successRate,
            executionCount
          ),
          noveltyScore: novelty,
          confidenceScore: insightConfidence,
          actionable: insightConfidence >= this.config.minConfidence,
          applied: false,
          suggestedAction:
            insightConfidence >= this.config.minConfidence
              ? `Review and optimize "${this.truncate(node.content, 40)}" to improve success rate.`
              : undefined,
          createdAt: new Date(),
        });
      }
    }

    return insights;
  }

  // ==========================================================================
  // Gap Detection
  // ==========================================================================

  /**
   * Detect knowledge gaps from active patterns.
   *
   * Gaps are detected when:
   * - Expected concepts are not activated (missing connections)
   * - Outcome nodes lack corresponding technique nodes
   * - Error patterns exist without resolution patterns
   *
   * @param activeNodes - Currently activated concept nodes
   * @returns Array of gap detection insights
   */
  async detectGaps(activeNodes: ConceptNode[]): Promise<DreamInsight[]> {
    const insights: DreamInsight[] = [];

    // Group nodes by type
    const byType: Record<string, ConceptNode[]> = {
      pattern: [],
      technique: [],
      domain: [],
      outcome: [],
      error: [],
    };

    for (const node of activeNodes) {
      const typeKey = node.conceptType ?? 'pattern';
      if (!byType[typeKey]) {
        byType[typeKey] = [];
      }
      byType[typeKey].push(node);
    }

    // Gap: Error without resolution
    for (const errorNode of byType.error ?? []) {
      // Check if there's a connected technique or pattern
      const edges = this.graph.getEdges(errorNode.id);
      const hasResolution = edges.some((e) => {
        const target = this.graph.getConcept(e.target);
        return (
          target &&
          (target.conceptType === 'pattern' || target.conceptType === 'technique')
        );
      });

      if (!hasResolution) {
        const novelty = this.calculateNovelty({
          type: 'gap_detection',
          sourceConcepts: [errorNode.id],
          gapType: 'missing_resolution',
        });

        const confidence = this.calculateConfidence({
          type: 'gap_detection',
          sourceConcepts: [errorNode.id],
          gapType: 'missing_resolution',
        });

        insights.push({
          id: this.generateId(),
          cycleId: '', // Set by caller
          type: 'gap_detection',
          sourceConcepts: [errorNode.id],
          description: `No resolution pattern found for error: "${this.truncate(errorNode.content, 50)}". Consider creating a fix pattern.`,
          noveltyScore: novelty,
          confidenceScore: confidence,
          actionable: true,
          applied: false,
          suggestedAction: `Create a resolution pattern for: "${this.truncate(errorNode.content, 40)}".`,
          createdAt: new Date(),
        });
      }
    }

    // Gap: Outcome without technique
    for (const outcomeNode of byType.outcome ?? []) {
      // Check if there's a connected technique
      const edges = this.graph.getEdges(outcomeNode.id);
      const hasTechnique = edges.some((e) => {
        const target = this.graph.getConcept(e.target);
        return target && target.conceptType === 'technique';
      });

      if (!hasTechnique && (byType.technique?.length ?? 0) === 0) {
        const novelty = this.calculateNovelty({
          type: 'gap_detection',
          sourceConcepts: [outcomeNode.id],
          gapType: 'missing_technique',
        });

        const confidence = this.calculateConfidence({
          type: 'gap_detection',
          sourceConcepts: [outcomeNode.id],
          gapType: 'missing_technique',
        });

        insights.push({
          id: this.generateId(),
          cycleId: '', // Set by caller
          type: 'gap_detection',
          sourceConcepts: [outcomeNode.id],
          description: `Outcome "${this.truncate(outcomeNode.content, 40)}" has no associated technique. Document how this outcome is achieved.`,
          noveltyScore: novelty,
          confidenceScore: confidence,
          actionable: true,
          applied: false,
          suggestedAction: `Document the technique for achieving: "${this.truncate(outcomeNode.content, 35)}".`,
          createdAt: new Date(),
        });
      }
    }

    return insights;
  }

  // ==========================================================================
  // Scoring Methods
  // ==========================================================================

  /**
   * Calculate novelty score for an insight.
   *
   * Novelty is higher when:
   * - Concepts are from different types/domains
   * - No existing strong edges between concepts
   * - Co-activation pattern is unusual
   */
  private calculateNovelty(context: {
    type: DreamInsight['type'];
    sourceConcepts: string[];
    isCrossDomain?: boolean;
    strength?: number;
    hasLowSuccess?: boolean;
    hasHighUsage?: boolean;
    gapType?: string;
  }): number {
    let novelty = 0.5; // Base novelty

    // Cross-domain connections are more novel
    if (context.isCrossDomain) {
      novelty += 0.2;
    }

    // Strong unexpected connections are novel
    if (context.strength !== undefined && context.strength > 0.5) {
      novelty += 0.15;
    }

    // Gap detections are novel by nature
    if (context.type === 'gap_detection') {
      novelty += 0.2;
    }

    // High usage with low success indicates unexplored optimization
    if (context.hasHighUsage && context.hasLowSuccess) {
      novelty += 0.15;
    }

    // Check edge novelty between concepts
    if (context.sourceConcepts.length >= 2) {
      const edge = this.graph.getEdge(
        context.sourceConcepts[0],
        context.sourceConcepts[1]
      );
      if (!edge) {
        novelty += 0.1; // No existing edge = more novel
      } else if (edge.weight < 0.3) {
        novelty += 0.05; // Weak edge = somewhat novel
      }
    }

    return Math.min(1, Math.max(0, novelty));
  }

  /**
   * Calculate confidence score for an insight.
   *
   * Confidence is higher when:
   * - High co-activation strength
   * - Strong evidence (edge weights, execution counts)
   * - Consistent metadata supports the insight
   */
  private calculateConfidence(context: {
    type: DreamInsight['type'];
    sourceConcepts: string[];
    edgeWeight?: number;
    contentSimilarity?: number;
    coActivation?: number;
    isCrossDomain?: boolean;
    hasLowSuccess?: boolean;
    hasHighUsage?: boolean;
    metadata?: Record<string, unknown>;
    gapType?: string;
  }): number {
    let confidence = 0.4; // Base confidence

    // High co-activation increases confidence
    if (context.coActivation !== undefined) {
      confidence += context.coActivation * 0.3;
    }

    // Strong edge weight increases confidence
    if (context.edgeWeight !== undefined) {
      confidence += context.edgeWeight * 0.2;
    }

    // Content similarity increases confidence for merges
    if (context.contentSimilarity !== undefined && context.type === 'pattern_merge') {
      confidence += context.contentSimilarity * 0.2;
    }

    // Cross-domain reduces confidence slightly (more speculative)
    if (context.isCrossDomain) {
      confidence -= 0.1;
    }

    // High usage with clear signals increases confidence
    if (context.hasHighUsage && context.hasLowSuccess) {
      confidence += 0.15;
    }

    // Metadata quality increases confidence
    if (context.metadata) {
      const metadataQuality = Math.min(Object.keys(context.metadata).length * 0.05, 0.15);
      confidence += metadataQuality;
    }

    // Gap detection with clear gap type
    if (context.gapType) {
      confidence += 0.1;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  // ==========================================================================
  // Pattern Conversion
  // ==========================================================================

  /**
   * Convert an actionable insight into a pattern template.
   *
   * @param insight - The insight to convert
   * @returns Pattern template or null if not convertible
   */
  async insightToPattern(insight: DreamInsight): Promise<PatternTemplate | null> {
    if (!insight.actionable) {
      return null;
    }

    // Get source concepts
    const concepts = insight.sourceConcepts
      .map((id) => this.graph.getConcept(id))
      .filter((c): c is ConceptNode => c !== undefined);

    if (concepts.length === 0) {
      return null;
    }

    switch (insight.type) {
      case 'pattern_merge': {
        const [conceptA, conceptB] = concepts;
        return {
          name: `Merged: ${this.truncate(conceptA?.content ?? '', 20)} + ${this.truncate(conceptB?.content ?? '', 20)}`,
          description: insight.description,
          template: {
            type: 'merged_pattern',
            sourcePatterns: insight.sourceConcepts,
            mergedContent: concepts.map((c) => c.content).join(' | '),
            metadata: {
              noveltyScore: insight.noveltyScore,
              confidenceScore: insight.confidenceScore,
              createdFrom: 'dream_insight',
            },
          },
        };
      }

      case 'novel_association': {
        const [sourceNode, targetNode] = concepts;
        return {
          name: `Association: ${sourceNode?.conceptType} - ${targetNode?.conceptType}`,
          description: insight.description,
          template: {
            type: 'association_pattern',
            source: {
              id: sourceNode?.id,
              type: sourceNode?.conceptType,
              content: sourceNode?.content,
            },
            target: {
              id: targetNode?.id,
              type: targetNode?.conceptType,
              content: targetNode?.content,
            },
            metadata: {
              noveltyScore: insight.noveltyScore,
              confidenceScore: insight.confidenceScore,
              createdFrom: 'dream_insight',
            },
          },
        };
      }

      case 'optimization': {
        const [concept] = concepts;
        return {
          name: `Optimized: ${this.truncate(concept?.content ?? '', 30)}`,
          description: insight.description,
          template: {
            type: 'optimization_pattern',
            originalPattern: concept?.id,
            suggestedAction: insight.suggestedAction,
            metadata: {
              noveltyScore: insight.noveltyScore,
              confidenceScore: insight.confidenceScore,
              createdFrom: 'dream_insight',
            },
          },
        };
      }

      case 'gap_detection': {
        const [concept] = concepts;
        return {
          name: `Gap Fill: ${this.truncate(concept?.content ?? '', 30)}`,
          description: insight.description,
          template: {
            type: 'gap_fill_pattern',
            relatedConcept: concept?.id,
            gapType: concept?.conceptType === 'error' ? 'missing_resolution' : 'missing_technique',
            suggestedAction: insight.suggestedAction,
            metadata: {
              noveltyScore: insight.noveltyScore,
              confidenceScore: insight.confidenceScore,
              createdFrom: 'dream_insight',
            },
          },
        };
      }

      default:
        return null;
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Generate a unique ID for an insight
   */
  private generateId(): string {
    const timestamp = Date.now();
    const random = randomUUID().slice(0, 8);
    return `insight-${timestamp}-${random}`;
  }

  /**
   * Calculate content similarity using Jaccard similarity
   */
  private calculateContentSimilarity(contentA: string, contentB: string): number {
    const wordsA = contentA.toLowerCase().split(/\s+/);
    const wordsB = contentB.toLowerCase().split(/\s+/);

    const setA = new Set(wordsA);
    const setB = new Set(wordsB);

    const intersection = wordsA.filter((w) => setB.has(w));
    const unionSize = setA.size + setB.size - intersection.length;

    if (unionSize === 0) return 0;
    return intersection.length / unionSize;
  }

  /**
   * Truncate string to max length
   */
  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }

  /**
   * Generate description for pattern merge insight
   */
  private generatePatternMergeDescription(
    nodeA: ConceptNode,
    nodeB: ConceptNode,
    mergeScore: number
  ): string {
    const scorePercent = Math.round(mergeScore * 100);
    return (
      `Pattern merge opportunity (${scorePercent}% match): ` +
      `"${this.truncate(nodeA.content, 40)}" and ` +
      `"${this.truncate(nodeB.content, 40)}" share similar structure and could be combined.`
    );
  }

  /**
   * Generate description for novel association insight
   */
  private generateNovelAssociationDescription(
    source: ConceptNode,
    target: ConceptNode,
    strength: number,
    isCrossDomain: boolean
  ): string {
    const strengthPercent = Math.round(strength * 100);
    const domainNote = isCrossDomain ? ' (cross-domain)' : '';
    return (
      `Novel association discovered${domainNote}: ` +
      `[${source.conceptType}] "${this.truncate(source.content, 30)}" is connected to ` +
      `[${target.conceptType}] "${this.truncate(target.content, 30)}" ` +
      `with ${strengthPercent}% co-activation strength.`
    );
  }

  /**
   * Generate description for optimization insight
   */
  private generateOptimizationDescription(
    node: ConceptNode,
    successRate?: number,
    executionCount?: number
  ): string {
    const parts: string[] = [
      `Optimization opportunity for "${this.truncate(node.content, 40)}":`,
    ];

    if (successRate !== undefined) {
      parts.push(`Success rate is ${Math.round(successRate * 100)}%.`);
    }

    if (executionCount !== undefined) {
      parts.push(`Used ${executionCount} times.`);
    }

    parts.push('Consider reviewing and improving this pattern.');
    return parts.join(' ');
  }

  /**
   * Get configuration
   */
  getConfig(): InsightConfig {
    return { ...this.config };
  }
}

export default InsightGenerator;
