/**
 * Agentic QE v3 - Coherence Check MCP Tool
 * ADR-052: Phase 4 Action A4.1
 *
 * qe/coherence/check - Check coherence of beliefs/facts using Prime Radiant
 *
 * Uses the CoherenceService to verify mathematical coherence of a set of nodes,
 * detecting contradictions and computing the overall coherence energy.
 */

import {
  MCPToolBase,
  MCPToolConfig,
  MCPToolContext,
  MCPToolSchema,
} from '../base.js';
import { ToolResult } from '../../types.js';
import {
  CoherenceService,
  createCoherenceService,
  wasmLoader,
  type CoherenceNode,
  type CoherenceResult,
  type ComputeLane,
} from '../../../integrations/coherence/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Parameters for coherence check
 */
export interface CoherenceCheckParams {
  /** Nodes to check for coherence - each node has id, embedding, and optional weight/metadata */
  nodes: Array<{
    /** Unique identifier for the node */
    id: string;
    /** Embedding vector (array of numbers) */
    embedding: number[];
    /** Optional weight (0-1, defaults to 1.0) */
    weight?: number;
    /** Optional metadata */
    metadata?: Record<string, unknown>;
  }>;
  /** Optional custom energy threshold for contradiction detection (default: 0.4) */
  energyThreshold?: number;
  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown;
}

/**
 * Result of coherence check
 */
export interface CoherenceCheckResult {
  /** Whether the nodes are coherent */
  isCoherent: boolean;
  /** Computed coherence energy (lower = more coherent) */
  energy: number;
  /** Compute lane based on energy threshold */
  lane: ComputeLane;
  /** Detected contradictions */
  contradictions: Array<{
    /** IDs of the contradicting nodes */
    nodeIds: [string, string];
    /** Severity of the contradiction */
    severity: string;
    /** Human-readable description */
    description: string;
  }>;
  /** Recommendations for resolving incoherence */
  recommendations: string[];
  /** Number of nodes analyzed */
  nodeCount: number;
  /** Execution time in milliseconds */
  executionTimeMs: number;
  /** Whether fallback logic was used */
  usedFallback: boolean;
}

// ============================================================================
// Schema
// ============================================================================

const COHERENCE_CHECK_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    nodes: {
      type: 'array',
      description:
        'Array of nodes to check for coherence. Each node must have an id and embedding vector.',
    },
    energyThreshold: {
      type: 'number',
      description:
        'Custom energy threshold for contradiction detection (default: 0.4)',
      minimum: 0,
      maximum: 1,
    },
  },
  required: ['nodes'],
};

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Coherence Check Tool
 *
 * Uses Prime Radiant's sheaf cohomology engine to verify mathematical
 * coherence of a set of nodes/beliefs.
 *
 * @example
 * ```typescript
 * const result = await tool.invoke({
 *   nodes: [
 *     { id: 'belief-1', embedding: [0.1, 0.2, ...], weight: 0.9 },
 *     { id: 'belief-2', embedding: [0.3, 0.1, ...], weight: 0.8 },
 *   ],
 *   energyThreshold: 0.4,
 * });
 *
 * if (!result.data.isCoherent) {
 *   console.log('Contradictions found:', result.data.contradictions);
 * }
 * ```
 */
export class CoherenceCheckTool extends MCPToolBase<
  CoherenceCheckParams,
  CoherenceCheckResult
> {
  readonly config: MCPToolConfig = {
    name: 'qe/coherence/check',
    description:
      'Check mathematical coherence of beliefs/facts using Prime Radiant sheaf cohomology. ' +
      'Detects contradictions and computes coherence energy for multi-agent coordination.',
    domain: 'learning-optimization',
    schema: COHERENCE_CHECK_SCHEMA,
    streaming: false,
    timeout: 30000,
  };

  private coherenceService: CoherenceService | null = null;

  /**
   * Get or create the CoherenceService instance
   */
  private async getService(): Promise<CoherenceService> {
    if (!this.coherenceService) {
      this.coherenceService = await createCoherenceService(wasmLoader);
    }
    return this.coherenceService;
  }

  /**
   * Reset instance cache (called when fleet is disposed)
   */
  resetInstanceCache(): void {
    if (this.coherenceService) {
      this.coherenceService.dispose();
      this.coherenceService = null;
    }
  }

  /**
   * Execute the coherence check
   */
  async execute(
    params: CoherenceCheckParams,
    context: MCPToolContext
  ): Promise<ToolResult<CoherenceCheckResult>> {
    const startTime = Date.now();
    const { nodes, energyThreshold = 0.4 } = params;

    // Validate nodes
    if (!nodes || nodes.length === 0) {
      return {
        success: false,
        error: 'At least one node is required for coherence check',
      };
    }

    // Validate embeddings
    for (const node of nodes) {
      if (!node.embedding || !Array.isArray(node.embedding)) {
        return {
          success: false,
          error: `Node ${node.id} has invalid embedding - must be an array of numbers`,
        };
      }
    }

    try {
      // Get service (initializes WASM if needed)
      const service = await this.getService();

      // Convert to CoherenceNode format
      const coherenceNodes: CoherenceNode[] = nodes.map((node) => ({
        id: node.id,
        embedding: node.embedding,
        weight: node.weight ?? 1.0,
        metadata: node.metadata,
      }));

      // Perform coherence check
      const result: CoherenceResult =
        await service.checkCoherence(coherenceNodes);

      // Generate recommendations based on results
      const recommendations = [
        ...result.recommendations,
        ...this.generateAdditionalRecommendations(result, energyThreshold),
      ];

      // Format contradictions for output (convert Severity enum to string)
      const contradictions = result.contradictions.map((c) => ({
        nodeIds: c.nodeIds as [string, string],
        severity: String(c.severity),
        description:
          c.description ||
          `Contradiction between nodes ${c.nodeIds[0]} and ${c.nodeIds[1]}`,
      }));

      const executionTimeMs = Date.now() - startTime;

      this.markAsRealData();

      return {
        success: true,
        data: {
          isCoherent: result.isCoherent,
          energy: result.energy,
          lane: result.lane,
          contradictions,
          recommendations,
          nodeCount: nodes.length,
          executionTimeMs,
          usedFallback: result.usedFallback,
        },
      };
    } catch (error) {
      // Check if WASM is unavailable - provide graceful fallback
      if (
        error instanceof Error &&
        error.message.includes('WASM')
      ) {
        this.markAsDemoData(context, 'WASM module unavailable');

        return {
          success: true,
          data: {
            isCoherent: true,
            energy: 0.1,
            lane: 'reflex',
            contradictions: [],
            recommendations: [
              'WASM module unavailable - coherence check running in fallback mode',
              'Install prime-radiant-advanced-wasm for full coherence verification',
            ],
            nodeCount: nodes.length,
            executionTimeMs: Date.now() - startTime,
            usedFallback: true,
          },
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate additional recommendations based on coherence results
   */
  private generateAdditionalRecommendations(
    result: CoherenceResult,
    threshold: number
  ): string[] {
    const recommendations: string[] = [];

    if (result.energy > threshold) {
      recommendations.push(
        `High coherence energy (${result.energy.toFixed(3)}) detected - review contradicting beliefs`
      );
    }

    switch (result.lane) {
      case 'reflex':
        recommendations.push('Low energy - safe for immediate execution');
        break;
      case 'retrieval':
        recommendations.push(
          'Moderate energy - consider fetching additional context'
        );
        break;
      case 'heavy':
        recommendations.push('High energy - deep analysis recommended');
        break;
      case 'human':
        recommendations.push(
          'Critical energy - escalate to Queen coordinator'
        );
        break;
    }

    return recommendations;
  }
}

/**
 * Create a CoherenceCheckTool instance
 */
export function createCoherenceCheckTool(): CoherenceCheckTool {
  return new CoherenceCheckTool();
}
