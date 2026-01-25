/**
 * Agentic QE v3 - Coherence Verify Consensus MCP Tool
 * ADR-052: Phase 4 Action A4.1
 *
 * qe/coherence/consensus - Verify multi-agent consensus mathematically
 *
 * Uses the CoherenceService's spectral analysis to detect false consensus
 * (agents appearing to agree while actually having different beliefs).
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
  type AgentVote,
  type ConsensusResult,
} from '../../../integrations/coherence/index.js';
import type { AgentType } from '../../../shared/types/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Parameters for consensus verification
 */
export interface CoherenceConsensusParams {
  /** Array of agent votes to verify */
  votes: Array<{
    /** Agent identifier */
    agentId: string;
    /** Agent type */
    agentType?: string;
    /** The agent's verdict/decision (string, number, or boolean) */
    verdict: string | number | boolean;
    /** Confidence in the verdict (0-1) */
    confidence: number;
    /** Optional reasoning text */
    reasoning?: string;
  }>;
  /** Minimum confidence threshold (0-1, default: 0.5) */
  confidenceThreshold?: number;
  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown;
}

/**
 * Result of consensus verification
 */
export interface CoherenceConsensusResult {
  /** Whether consensus is mathematically valid */
  isValid: boolean;
  /** Whether this is a false consensus (appears unified but isn't) */
  isFalseConsensus: boolean;
  /** Confidence in the consensus */
  confidence: number;
  /** Fiedler value from spectral analysis (indicates connectivity) */
  fiedlerValue: number;
  /** Risk of consensus collapsing (0-1) */
  collapseRisk: number;
  /** Recommendation for next steps */
  recommendation: string;
  /** Whether fallback logic was used */
  usedFallback: boolean;
  /** Execution time in milliseconds */
  executionTimeMs: number;
}

// ============================================================================
// Schema
// ============================================================================

const COHERENCE_CONSENSUS_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    votes: {
      type: 'array',
      description: 'Array of agent votes to verify for consensus',
    },
    confidenceThreshold: {
      type: 'number',
      description: 'Minimum confidence threshold (0-1, default: 0.5)',
      default: 0.5,
      minimum: 0,
      maximum: 1,
    },
  },
  required: ['votes'],
};

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Coherence Verify Consensus Tool
 *
 * Uses Prime Radiant's spectral analysis to mathematically verify
 * multi-agent consensus, detecting false consensus situations.
 *
 * @example
 * ```typescript
 * const result = await tool.invoke({
 *   votes: [
 *     { agentId: 'agent-1', verdict: 'pass', confidence: 0.9 },
 *     { agentId: 'agent-2', verdict: 'pass', confidence: 0.85 },
 *     { agentId: 'agent-3', verdict: 'fail', confidence: 0.6 },
 *   ],
 * });
 *
 * if (result.data.isFalseConsensus) {
 *   console.log('False consensus detected - spawn independent reviewer');
 * }
 * ```
 */
export class CoherenceConsensusTool extends MCPToolBase<
  CoherenceConsensusParams,
  CoherenceConsensusResult
> {
  readonly config: MCPToolConfig = {
    name: 'qe/coherence/consensus',
    description:
      'Verify multi-agent consensus mathematically using spectral analysis. ' +
      'Detects false consensus where agents appear to agree but have divergent beliefs.',
    domain: 'learning-optimization',
    schema: COHERENCE_CONSENSUS_SCHEMA,
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
   * Execute consensus verification
   */
  async execute(
    params: CoherenceConsensusParams,
    context: MCPToolContext
  ): Promise<ToolResult<CoherenceConsensusResult>> {
    const startTime = Date.now();
    const { votes, confidenceThreshold = 0.5 } = params;

    // Validate votes
    if (!votes || votes.length === 0) {
      return {
        success: false,
        error: 'At least one vote is required for consensus verification',
      };
    }

    if (votes.length < 2) {
      return {
        success: false,
        error: 'At least two votes are required to verify consensus',
      };
    }

    try {
      // Get service
      const service = await this.getService();

      // Convert to AgentVote format
      const agentVotes: AgentVote[] = votes.map((v) => ({
        agentId: v.agentId,
        agentType: (v.agentType || 'worker') as AgentType,
        verdict: v.verdict,
        confidence: v.confidence,
        reasoning: v.reasoning,
        timestamp: new Date(),
      }));

      // Verify consensus using spectral analysis
      const result: ConsensusResult = await service.verifyConsensus(agentVotes);

      // Enhance recommendation based on confidence threshold
      let recommendation = result.recommendation;
      const avgConfidence =
        votes.reduce((sum, v) => sum + v.confidence, 0) / votes.length;

      if (avgConfidence < confidenceThreshold) {
        recommendation =
          `Low average confidence (${(avgConfidence * 100).toFixed(1)}%) - ` +
          'consider gathering more evidence. ' +
          recommendation;
      }

      const executionTimeMs = Date.now() - startTime;

      this.markAsRealData();

      return {
        success: true,
        data: {
          isValid: result.isValid,
          isFalseConsensus: result.isFalseConsensus,
          confidence: result.confidence,
          fiedlerValue: result.fiedlerValue,
          collapseRisk: result.collapseRisk,
          recommendation,
          usedFallback: result.usedFallback,
          executionTimeMs,
        },
      };
    } catch (error) {
      // Check if WASM is unavailable - provide graceful fallback
      if (
        error instanceof Error &&
        error.message.includes('WASM')
      ) {
        // Fall back to simple majority voting analysis
        const fallbackResult = this.simpleMajorityAnalysis(votes);

        this.markAsDemoData(context, 'WASM module unavailable');

        return {
          success: true,
          data: {
            ...fallbackResult,
            recommendation:
              'Running in fallback mode (simple analysis). ' +
              'Install prime-radiant-advanced-wasm for spectral consensus analysis.',
            usedFallback: true,
            executionTimeMs: Date.now() - startTime,
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
   * Simple majority analysis fallback
   */
  private simpleMajorityAnalysis(
    votes: CoherenceConsensusParams['votes']
  ): Omit<CoherenceConsensusResult, 'recommendation' | 'usedFallback' | 'executionTimeMs'> {
    // Count votes by verdict (stringified for comparison)
    const verdictCounts = new Map<string, number>();

    for (const vote of votes) {
      const key = String(vote.verdict);
      verdictCounts.set(key, (verdictCounts.get(key) || 0) + 1);
    }

    // Find majority
    let maxCount = 0;
    for (const count of verdictCounts.values()) {
      if (count > maxCount) {
        maxCount = count;
      }
    }

    const agreement = maxCount / votes.length;
    const avgConfidence =
      votes.reduce((sum, v) => sum + v.confidence, 0) / votes.length;

    return {
      isValid: agreement >= 0.5 && avgConfidence >= 0.5,
      isFalseConsensus: false, // Can't detect without spectral analysis
      confidence: avgConfidence,
      fiedlerValue: 0, // Can't compute without spectral analysis
      collapseRisk: 1 - agreement,
    };
  }
}

/**
 * Create a CoherenceConsensusTool instance
 */
export function createCoherenceConsensusTool(): CoherenceConsensusTool {
  return new CoherenceConsensusTool();
}
