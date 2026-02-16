/**
 * Agentic QE v3 - Coherence Audit Memory MCP Tool
 * ADR-052: Phase 4 Action A4.1
 *
 * qe/coherence/audit - Audit QE memory for contradictions
 *
 * Uses the MemoryCoherenceAuditor to scan QE patterns for coherence issues,
 * detecting contradictions and generating remediation recommendations.
 */

import {
  MCPToolBase,
  MCPToolConfig,
  MCPToolContext,
  MCPToolSchema,
  getSharedMemoryBackend,
} from '../base.js';
import { ToolResult } from '../../types.js';
import {
  CoherenceService,
  createCoherenceService,
  wasmLoader,
} from '../../../integrations/coherence/index.js';
import {
  MemoryCoherenceAuditor,
  createMemoryAuditor,
  type MemoryAuditResult,
  type PatternHotspot,
  type AuditRecommendation,
} from '../../../learning/index.js';
import { toErrorMessage } from '../../../shared/error-utils.js';
import {
  createPatternStore,
  type QEPattern,
} from '../../../learning/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Parameters for memory audit
 */
export interface CoherenceAuditParams {
  /** Namespace to audit (default: 'qe-patterns') */
  namespace?: string;
  /** Maximum patterns to scan (default: 1000) */
  maxPatterns?: number;
  /** Energy threshold for flagging issues (default: 0.4) */
  energyThreshold?: number;
  /** Include detailed pattern information in results */
  includeDetails?: boolean;
  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown;
}

/**
 * Result of memory audit
 */
export interface CoherenceAuditResult {
  /** Total number of patterns in the database */
  totalPatterns: number;
  /** Number of patterns scanned in this audit */
  scannedPatterns: number;
  /** Number of contradictions found */
  contradictionCount: number;
  /** Overall coherence energy (lower = more coherent) */
  globalEnergy: number;
  /** High-energy domains requiring attention */
  hotspots: Array<{
    domain: string;
    patternIds: string[];
    energy: number;
    description: string;
  }>;
  /** Actionable recommendations */
  recommendations: Array<{
    type: 'merge' | 'remove' | 'review' | 'split';
    patternIds: string[];
    reason: string;
    priority: 'low' | 'medium' | 'high';
  }>;
  /** Audit duration in milliseconds */
  durationMs: number;
  /** Audit timestamp */
  timestamp: string;
  /** Memory health score (0-100, higher = healthier) */
  healthScore: number;
}

// ============================================================================
// Schema
// ============================================================================

const COHERENCE_AUDIT_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    namespace: {
      type: 'string',
      description: 'Namespace to audit (default: qe-patterns)',
      default: 'qe-patterns',
    },
    maxPatterns: {
      type: 'number',
      description: 'Maximum patterns to scan (default: 1000)',
      default: 1000,
      minimum: 1,
      maximum: 10000,
    },
    energyThreshold: {
      type: 'number',
      description: 'Energy threshold for flagging issues (default: 0.4)',
      default: 0.4,
      minimum: 0,
      maximum: 1,
    },
    includeDetails: {
      type: 'boolean',
      description: 'Include detailed pattern information in results',
      default: false,
    },
  },
  required: [],
};

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Coherence Audit Memory Tool
 *
 * Scans QE patterns for coherence issues using Prime Radiant:
 * - Detects contradictory patterns
 * - Identifies duplicate/overlapping patterns
 * - Flags outdated patterns with low usage
 * - Generates remediation recommendations
 *
 * @example
 * ```typescript
 * const result = await tool.invoke({
 *   namespace: 'qe-patterns',
 *   maxPatterns: 500,
 *   energyThreshold: 0.5,
 * });
 *
 * console.log(`Health Score: ${result.data.healthScore}/100`);
 * console.log('Hotspots:', result.data.hotspots);
 * console.log('Recommendations:', result.data.recommendations);
 * ```
 */
export class CoherenceAuditTool extends MCPToolBase<
  CoherenceAuditParams,
  CoherenceAuditResult
> {
  readonly config: MCPToolConfig = {
    name: 'qe/coherence/audit',
    description:
      'Audit QE memory for contradictions and coherence issues. ' +
      'Scans patterns, detects hotspots, and generates remediation recommendations.',
    domain: 'learning-optimization',
    schema: COHERENCE_AUDIT_SCHEMA,
    streaming: false,
    timeout: 60000,
  };

  private coherenceService: CoherenceService | null = null;
  private auditor: MemoryCoherenceAuditor | null = null;

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
    this.auditor = null;
  }

  /**
   * Execute the memory audit
   */
  async execute(
    params: CoherenceAuditParams,
    context: MCPToolContext
  ): Promise<ToolResult<CoherenceAuditResult>> {
    const {
      namespace = 'qe-patterns',
      maxPatterns = 1000,
      energyThreshold = 0.4,
    } = params;

    try {
      // Get coherence service
      const service = await this.getService();

      // Create auditor if not exists
      if (!this.auditor) {
        this.auditor = createMemoryAuditor(service, undefined, {
          energyThreshold,
          hotspotThreshold: energyThreshold + 0.2,
          maxRecommendations: 10,
        });
      }

      // Get memory backend and fetch patterns
      const memory = await getSharedMemoryBackend();
      const patternStore = createPatternStore(memory, {
        namespace,
        embeddingDimension: 768,
      });
      await patternStore.initialize();

      // Search for all patterns (empty query returns all)
      const searchResult = await patternStore.search('', {
        limit: maxPatterns,
        useVectorSearch: false,
      });

      const patterns: QEPattern[] = searchResult.success
        ? searchResult.value.map((r) => r.pattern)
        : [];

      // Run audit if we have patterns
      let auditResult: MemoryAuditResult;

      if (patterns.length > 0) {
        auditResult = await this.auditor.auditPatterns(patterns);
      } else {
        // No patterns - return empty audit
        auditResult = {
          totalPatterns: 0,
          scannedPatterns: 0,
          contradictionCount: 0,
          globalEnergy: 0,
          hotspots: [],
          recommendations: [],
          duration: 0,
          timestamp: new Date(),
        };
      }

      // Calculate health score (0-100)
      const healthScore = this.calculateHealthScore(auditResult);

      this.markAsRealData();

      return {
        success: true,
        data: {
          totalPatterns: auditResult.totalPatterns,
          scannedPatterns: auditResult.scannedPatterns,
          contradictionCount: auditResult.contradictionCount,
          globalEnergy: auditResult.globalEnergy,
          hotspots: auditResult.hotspots.map((h: PatternHotspot) => ({
            domain: h.domain,
            patternIds: h.patternIds,
            energy: h.energy,
            description: h.description,
          })),
          recommendations: auditResult.recommendations.map(
            (r: AuditRecommendation) => ({
              type: r.type,
              patternIds: r.patternIds,
              reason: r.reason,
              priority: r.priority,
            })
          ),
          durationMs: auditResult.duration,
          timestamp: auditResult.timestamp.toISOString(),
          healthScore,
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
            totalPatterns: 0,
            scannedPatterns: 0,
            contradictionCount: 0,
            globalEnergy: 0,
            hotspots: [],
            recommendations: [
              {
                type: 'review',
                patternIds: [],
                reason:
                  'WASM module unavailable - install prime-radiant-advanced-wasm for full audit',
                priority: 'medium',
              },
            ],
            durationMs: 0,
            timestamp: new Date().toISOString(),
            healthScore: 100,
          },
        };
      }

      return {
        success: false,
        error: toErrorMessage(error),
      };
    }
  }

  /**
   * Calculate memory health score (0-100)
   */
  private calculateHealthScore(result: MemoryAuditResult): number {
    let score = 100;

    // Deduct for contradictions
    score -= Math.min(30, result.contradictionCount * 5);

    // Deduct for high energy
    score -= Math.min(30, result.globalEnergy * 50);

    // Deduct for hotspots
    score -= Math.min(20, result.hotspots.length * 5);

    // Deduct for critical recommendations
    const criticalCount = result.recommendations.filter(
      (r) => r.priority === 'high'
    ).length;
    score -= Math.min(20, criticalCount * 5);

    return Math.max(0, Math.round(score));
  }
}

/**
 * Create a CoherenceAuditTool instance
 */
export function createCoherenceAuditTool(): CoherenceAuditTool {
  return new CoherenceAuditTool();
}
