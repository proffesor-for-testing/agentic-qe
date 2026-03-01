/**
 * Agentic QE v3 - Dream Cycle MCP Tool
 *
 * qe/learning/dream - On-demand dream cycles for pattern discovery
 *
 * ADR-046: V2 Feature Integration - Dream Cycles
 *
 * This tool provides on-demand access to the DreamEngine:
 * - Trigger dream cycles to discover novel pattern associations
 * - View pending insights from previous cycles
 * - Apply actionable insights to create new patterns
 * - Check dream cycle history and statistics
 */

import { MCPToolBase, MCPToolConfig, MCPToolContext, MCPToolSchema, getSharedMemoryBackend, defaultToolLogger } from '../base.js';
import { ToolResult } from '../../types.js';
import {
  DreamEngine,
  createDreamEngine,
  type DreamConfig,
} from '../../../learning/dream/index.js';
import type { DreamCycleResult, ApplyInsightResult as EngineApplyResult } from '../../../learning/dream/dream-engine.js';
import type { DreamInsight } from '../../../learning/dream/insight-generator.js';
import type { DreamCycle } from '../../../learning/dream/types.js';
import { createQEReasoningBank } from '../../../learning/qe-reasoning-bank.js';
import { toErrorMessage } from '../../../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

export interface DreamCycleParams {
  /** Action to perform */
  action: 'dream' | 'insights' | 'apply' | 'history' | 'status';

  /** Duration of dream cycle in milliseconds (default: 30000) */
  durationMs?: number;

  /** Minimum patterns required to start dreaming (default: 10) */
  minPatterns?: number;

  /** Insight ID to apply (for 'apply' action) */
  insightId?: string;

  /** Maximum results to return (for 'history' and 'insights') */
  limit?: number;

  /** Load patterns from ReasoningBank before dreaming */
  loadFromReasoningBank?: boolean;

  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown;
}

export interface DreamCycleToolResult {
  action: string;
  success: boolean;
  dreamResult?: DreamResultSummary;
  insights?: InsightSummary[];
  applyResult?: ApplyInsightResult;
  history?: DreamHistorySummary[];
  status?: DreamStatusResult;
  error?: string;
}

export interface DreamResultSummary {
  cycleId: string;
  status: string;
  durationMs: number;
  conceptsProcessed: number;
  associationsFound: number;
  insightsGenerated: number;
  activationStats: {
    totalIterations: number;
    peakActivation: number;
    nodesActivated: number;
  };
  patternsCreated: number;
}

export interface InsightSummary {
  id: string;
  type: string;
  description: string;
  noveltyScore: number;
  confidenceScore: number;
  actionable: boolean;
  applied: boolean;
  suggestedAction?: string;
  createdAt: string;
}

export interface ApplyInsightResult {
  insightId: string;
  success: boolean;
  patternId?: string;
  error?: string;
}

export interface DreamHistorySummary {
  id: string;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  status: string;
  conceptsProcessed: number;
  associationsFound: number;
  insightsGenerated: number;
}

export interface DreamStatusResult {
  isDreaming: boolean;
  currentCycle?: DreamHistorySummary;
  totalCycles: number;
  totalInsights: number;
  pendingInsights: number;
  lastDreamTime?: string;
}

// ============================================================================
// Schema
// ============================================================================

const DREAM_CYCLE_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['dream', 'insights', 'apply', 'history', 'status'],
      description: 'Action to perform: dream (run cycle), insights (view pending), apply (create pattern), history (view past), status (current state)',
    },
    durationMs: {
      type: 'number',
      description: 'Duration of dream cycle in milliseconds (default: 30000, max: 60000)',
      default: 30000,
    },
    minPatterns: {
      type: 'number',
      description: 'Minimum patterns required to start dreaming (default: 10)',
      default: 10,
    },
    insightId: {
      type: 'string',
      description: 'Insight ID to apply (required for apply action)',
    },
    limit: {
      type: 'number',
      description: 'Maximum results to return (default: 20)',
      default: 20,
    },
    loadFromReasoningBank: {
      type: 'boolean',
      description: 'Load patterns from ReasoningBank before dreaming (default: true)',
      default: true,
    },
  },
  required: ['action'],
};

// ============================================================================
// Tool Implementation
// ============================================================================

export class DreamCycleTool extends MCPToolBase<DreamCycleParams, DreamCycleToolResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/learning/dream',
    description: 'Trigger dream cycles for pattern discovery. Dreams find novel associations between patterns through spreading activation, generating actionable insights.',
    domain: 'learning-optimization',
    schema: DREAM_CYCLE_SCHEMA,
    streaming: false,
    timeout: 120000, // 2 minutes max (dream cycle + overhead)
  };

  private engine: DreamEngine | null = null;
  private engineConfig: Partial<DreamConfig> | null = null;

  /**
   * Get or create the DreamEngine instance.
   *
   * If config differs from the cached engine's config, the engine is
   * recreated to respect the new configuration. This prevents the bug
   * where subsequent calls with different durationMs/minPatterns were ignored.
   */
  private async getEngine(config?: Partial<DreamConfig>): Promise<DreamEngine> {
    // Check if we need to recreate due to config change
    const configChanged = this.engine && config && !this.configsEqual(this.engineConfig, config);

    if (configChanged && this.engine) {
      await this.engine.close().catch(() => {});
      this.engine = null;
      this.engineConfig = null;
    }

    if (!this.engine) {
      this.engine = createDreamEngine(config);
      this.engineConfig = config || null;
      await this.engine.initialize();
    }
    return this.engine;
  }

  /**
   * Compare two configs for equality (shallow comparison of relevant fields)
   */
  private configsEqual(a: Partial<DreamConfig> | null, b: Partial<DreamConfig> | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return (
      a.maxDurationMs === b.maxDurationMs &&
      a.minConceptsRequired === b.minConceptsRequired
    );
  }

  /**
   * Load patterns from ReasoningBank into the DreamEngine
   *
   * Uses empty string query which triggers the "no query" path in PatternStore,
   * returning all patterns sorted by quality score. The '*' wildcard was broken
   * because it's treated as a literal string match, not a glob pattern.
   */
  private async loadPatternsFromReasoningBank(engine: DreamEngine): Promise<number> {
    try {
      // Get shared memory backend for ReasoningBank
      const memoryBackend = await getSharedMemoryBackend();
      const reasoningBank = createQEReasoningBank(memoryBackend);
      await reasoningBank.initialize();

      // Wire RVF dual-writer (optional, best-effort)
      try {
        const { getSharedRvfDualWriter } = await import('../../../integrations/ruvector/shared-rvf-dual-writer.js');
        const dualWriter = await getSharedRvfDualWriter();
        if (dualWriter) reasoningBank.setRvfDualWriter(dualWriter);
      } catch (e) {
        if (process.env.DEBUG) this.logger.info('RVF wiring skipped', { error: String(e) });
      }

      // Use empty string to get ALL patterns (not '*' which is literal match)
      // Empty query triggers quality-score-based return of all patterns
      const patternsResult = await reasoningBank.searchPatterns('', {
        limit: 100,
        minConfidence: 0.3,
      });

      if (!patternsResult.success || !patternsResult.value.length) {
        this.logger.info('No patterns found in ReasoningBank to load');
        return 0;
      }

      // Convert search results to PatternImportData format
      const importPatterns = patternsResult.value.map((result) => ({
        id: result.pattern.id,
        name: result.pattern.name,
        description: result.pattern.description || `${result.pattern.patternType} pattern`,
        domain: result.pattern.qeDomain || 'learning-optimization',
        patternType: result.pattern.patternType,
        confidence: result.pattern.confidence,
        successRate: result.pattern.successRate || 0.5,
      }));

      const loaded = await engine.loadPatternsAsConcepts(importPatterns);
      this.logger.info(`Loaded ${loaded} patterns as concepts from ReasoningBank`);
      return loaded;
    } catch (error) {
      this.logger.warn('Failed to load patterns from ReasoningBank', { error: String(error) });
      return 0;
    }
  }

  /**
   * Execute the tool
   */
  async execute(params: DreamCycleParams, context: MCPToolContext): Promise<ToolResult<DreamCycleToolResult>> {
    const { action } = params;

    try {
      switch (action) {
        case 'dream':
          return this.runDreamCycle(params, context);

        case 'insights':
          return this.getPendingInsights(params, context);

        case 'apply':
          return this.applyInsight(params, context);

        case 'history':
          return this.getDreamHistory(params, context);

        case 'status':
          return this.getDreamStatus(params, context);

        default:
          return {
            success: false,
            error: `Unknown action: ${action}`,
            data: { action, success: false, error: `Unknown action: ${action}` },
          };
      }
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      return {
        success: false,
        error: errorMessage,
        data: { action, success: false, error: errorMessage },
      };
    }
  }

  /**
   * Run a dream cycle
   */
  private async runDreamCycle(
    params: DreamCycleParams,
    context: MCPToolContext
  ): Promise<ToolResult<DreamCycleToolResult>> {
    const durationMs = Math.min(params.durationMs || 30000, 60000);
    const minPatterns = params.minPatterns || 10;
    const loadFromRB = params.loadFromReasoningBank !== false;

    this.logger.info(`Starting dream cycle (${durationMs}ms, min: ${minPatterns} patterns)`);

    const engine = await this.getEngine({
      maxDurationMs: durationMs,
      minConceptsRequired: minPatterns,
    });

    // Load patterns from ReasoningBank if requested
    if (loadFromRB) {
      const loaded = await this.loadPatternsFromReasoningBank(engine);
      this.logger.info(`Loaded ${loaded} patterns from ReasoningBank`);
    }

    // Run the dream cycle
    const result: DreamCycleResult = await engine.dream(durationMs);

    const dreamResult: DreamResultSummary = {
      cycleId: result.cycle.id,
      status: result.cycle.status,
      durationMs: result.cycle.durationMs || 0,
      conceptsProcessed: result.cycle.conceptsProcessed,
      associationsFound: result.cycle.associationsFound,
      insightsGenerated: result.cycle.insightsGenerated,
      activationStats: result.activationStats,
      patternsCreated: result.patternsCreated,
    };

    const insights: InsightSummary[] = result.insights.map((i: DreamInsight) => ({
      id: i.id,
      type: i.type,
      description: i.description,
      noveltyScore: i.noveltyScore,
      confidenceScore: i.confidenceScore,
      actionable: i.actionable,
      applied: i.applied || false,
      suggestedAction: i.suggestedAction,
      createdAt: i.createdAt?.toISOString() || new Date().toISOString(),
    }));

    this.logger.info(
      `Dream cycle complete: ${result.cycle.insightsGenerated} insights, ` +
        `${result.cycle.associationsFound} associations found`
    );

    return {
      success: true,
      data: {
        action: 'dream',
        success: true,
        dreamResult,
        insights,
      },
    };
  }

  /**
   * Get pending insights
   */
  private async getPendingInsights(
    params: DreamCycleParams,
    context: MCPToolContext
  ): Promise<ToolResult<DreamCycleToolResult>> {
    const limit = params.limit || 20;

    const engine = await this.getEngine();
    const pending = await engine.getPendingInsights(limit);

    const insights: InsightSummary[] = pending.map((i: DreamInsight) => ({
      id: i.id,
      type: i.type,
      description: i.description,
      noveltyScore: i.noveltyScore,
      confidenceScore: i.confidenceScore,
      actionable: i.actionable,
      applied: i.applied || false,
      suggestedAction: i.suggestedAction,
      createdAt: i.createdAt?.toISOString() || new Date().toISOString(),
    }));

    return {
      success: true,
      data: {
        action: 'insights',
        success: true,
        insights,
      },
    };
  }

  /**
   * Apply an insight to create a REAL pattern in QEReasoningBank.
   *
   * This fixes the issue where applyInsight was generating fake pattern IDs.
   * Now it:
   * 1. Gets the insight details from pending insights
   * 2. Creates a REAL pattern in QEReasoningBank with proper structure
   * 3. Marks the insight as applied in the engine
   * 4. Returns the REAL pattern ID
   */
  private async applyInsight(
    params: DreamCycleParams,
    context: MCPToolContext
  ): Promise<ToolResult<DreamCycleToolResult>> {
    if (!params.insightId) {
      return {
        success: false,
        error: 'insightId is required for apply action',
        data: {
          action: 'apply',
          success: false,
          error: 'insightId is required for apply action',
        },
      };
    }

    try {
      const engine = await this.getEngine();

      // Step 1: Find the insight from pending insights
      const pendingInsights = await engine.getPendingInsights(100);
      const insight = pendingInsights.find((i) => i.id === params.insightId);

      if (!insight) {
        // Check if already applied or doesn't exist
        return {
          success: false,
          error: `Insight not found or already applied: ${params.insightId}`,
          data: {
            action: 'apply',
            success: false,
            error: `Insight not found or already applied: ${params.insightId}`,
          },
        };
      }

      if (!insight.actionable) {
        return {
          success: false,
          error: 'Insight is not actionable',
          data: {
            action: 'apply',
            success: false,
            error: 'Insight is not actionable',
          },
        };
      }

      // Step 2: Create a REAL pattern in QEReasoningBank
      const memoryBackend = await getSharedMemoryBackend();
      const reasoningBank = createQEReasoningBank(memoryBackend);
      await reasoningBank.initialize();

      // Wire RVF dual-writer (optional, best-effort)
      try {
        const { getSharedRvfDualWriter } = await import('../../../integrations/ruvector/shared-rvf-dual-writer.js');
        const dualWriter = await getSharedRvfDualWriter();
        if (dualWriter) reasoningBank.setRvfDualWriter(dualWriter);
      } catch (e) {
        if (process.env.DEBUG) this.logger.info('RVF wiring skipped', { error: String(e) });
      }

      // Map insight type to QE pattern type
      const patternType = this.mapInsightTypeToPatternType(insight.type);

      // Create the pattern with proper structure
      const patternResult = await reasoningBank.storePattern({
        patternType,
        name: `Dream Insight: ${insight.type}`,
        description: `${insight.description} (confidence: ${insight.confidenceScore.toFixed(2)})`,
        template: {
          type: 'workflow',
          content: insight.suggestedAction || insight.description,
          variables: [],
        },
        context: {
          tags: ['dream-generated', insight.type, ...insight.sourceConcepts.slice(0, 3)],
          complexity: 'medium',
        },
      });

      if (!patternResult.success) {
        const errorMsg = patternResult.error?.message || 'Unknown error';
        return {
          success: false,
          error: `Failed to create pattern: ${errorMsg}`,
          data: {
            action: 'apply',
            success: false,
            error: `Failed to create pattern: ${errorMsg}`,
          },
        };
      }

      const realPatternId = patternResult.value.id;

      // Step 3: Mark insight as applied in the engine
      // This updates the engine's internal database (ignore its fake pattern ID)
      await engine.applyInsight(params.insightId);

      this.logger.info(
        `Applied insight ${params.insightId} → REAL pattern ${realPatternId} in ReasoningBank`
      );

      const applyResult: ApplyInsightResult = {
        insightId: params.insightId,
        success: true,
        patternId: realPatternId, // Return the REAL pattern ID
      };

      return {
        success: true,
        data: {
          action: 'apply',
          success: true,
          applyResult,
        },
      };
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      return {
        success: false,
        error: errorMessage,
        data: {
          action: 'apply',
          success: false,
          error: errorMessage,
        },
      };
    }
  }

  /**
   * Map DreamInsight type to QEPatternType.
   *
   * Dream insights have types like 'cross-domain', 'novel-path', etc.
   * QEPatterns have types like 'test-template', 'coverage-strategy', etc.
   */
  private mapInsightTypeToPatternType(
    insightType: string
  ): 'test-template' | 'assertion-pattern' | 'mock-pattern' | 'coverage-strategy' |
     'mutation-strategy' | 'api-contract' | 'visual-baseline' | 'a11y-check' |
     'perf-benchmark' | 'flaky-fix' | 'refactor-safe' | 'error-handling' {
    // Map insight types to the most appropriate pattern type
    const mapping: Record<string, typeof this.mapInsightTypeToPatternType extends
      (arg: string) => infer R ? R : never> = {
      'cross-domain': 'coverage-strategy',    // Cross-domain insights suggest coverage approaches
      'novel-path': 'test-template',          // Novel paths suggest new test templates
      'cluster': 'refactor-safe',             // Clusters suggest refactoring patterns
      'high-activation': 'assertion-pattern', // High activation suggests important assertions
      'bridge': 'mock-pattern',               // Bridges between concepts suggest mocking
    };

    return mapping[insightType] || 'test-template';
  }

  /**
   * Get dream cycle history
   */
  private async getDreamHistory(
    params: DreamCycleParams,
    context: MCPToolContext
  ): Promise<ToolResult<DreamCycleToolResult>> {
    const limit = params.limit || 20;

    const engine = await this.getEngine();
    const cycles = await engine.getDreamHistory(limit);

    const history: DreamHistorySummary[] = cycles.map((c: DreamCycle) => ({
      id: c.id,
      startTime: c.startTime.toISOString(),
      endTime: c.endTime?.toISOString(),
      durationMs: c.durationMs,
      status: c.status,
      conceptsProcessed: c.conceptsProcessed,
      associationsFound: c.associationsFound,
      insightsGenerated: c.insightsGenerated,
    }));

    return {
      success: true,
      data: {
        action: 'history',
        success: true,
        history,
      },
    };
  }

  /**
   * Get dream status
   */
  private async getDreamStatus(
    params: DreamCycleParams,
    context: MCPToolContext
  ): Promise<ToolResult<DreamCycleToolResult>> {
    const engine = await this.getEngine();

    const isDreaming = engine.isDreaming();
    const currentCycle = engine.getCurrentCycle();
    const history = await engine.getDreamHistory(100);
    const pending = await engine.getPendingInsights(100);

    const totalInsights = history.reduce((sum, c) => sum + c.insightsGenerated, 0);
    const lastCycle = history[0];

    const status: DreamStatusResult = {
      isDreaming,
      currentCycle: currentCycle
        ? {
            id: currentCycle.id,
            startTime: currentCycle.startTime.toISOString(),
            endTime: currentCycle.endTime?.toISOString(),
            durationMs: currentCycle.durationMs,
            status: currentCycle.status,
            conceptsProcessed: currentCycle.conceptsProcessed,
            associationsFound: currentCycle.associationsFound,
            insightsGenerated: currentCycle.insightsGenerated,
          }
        : undefined,
      totalCycles: history.length,
      totalInsights,
      pendingInsights: pending.length,
      lastDreamTime: lastCycle?.startTime.toISOString(),
    };

    return {
      success: true,
      data: {
        action: 'status',
        success: true,
        status,
      },
    };
  }

  /**
   * Reset instance cache (for fleet dispose)
   */
  override resetInstanceCache(): void {
    if (this.engine) {
      this.engine.close().catch(console.error);
      this.engine = null;
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createDreamCycleTool(): DreamCycleTool {
  return new DreamCycleTool();
}
