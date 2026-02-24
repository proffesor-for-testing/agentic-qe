/**
 * DreamEngine - Orchestrator for Dream-based Pattern Discovery
 * ADR-021: QE ReasoningBank - Dream Cycle Integration
 *
 * The DreamEngine orchestrates the complete dream cycle:
 * 1. Load patterns as concepts into the concept graph
 * 2. Run spreading activation (the "dreaming")
 * 3. Find novel associations from co-activated concepts
 * 4. Generate insights from activation patterns
 * 5. Persist insights for later application
 *
 * Dream cycles simulate the consolidation process that occurs during sleep,
 * where the brain strengthens important associations and discovers new connections.
 *
 * @module v3/learning/dream/dream-engine
 */

import { safeJsonParse } from '../../shared/safe-json.js';
import { toErrorMessage } from '../../shared/error-utils.js';
import { LoggerFactory } from '../../logging/index.js';

const dreamLogger = LoggerFactory.create('dream-engine');

import type { Database as DatabaseType } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

import { getUnifiedPersistence, type UnifiedPersistenceManager } from '../../kernel/unified-persistence.js';
import { ConceptGraph } from './concept-graph.js';
import {
  SpreadingActivation,
  type ActivationConfig,
  type ActivationResult,
  type ConceptGraph as SpreadingConceptGraph,
} from './spreading-activation.js';
import {
  InsightGenerator,
  type InsightConfig,
  type DreamInsight,
  type ConceptGraph as InsightConceptGraph,
} from './insight-generator.js';
import {
  RVCOWBranchManager,
  type Branch,
  type ValidationResult,
  type ValidationThresholds,
  DEFAULT_VALIDATION_THRESHOLDS,
} from './rvcow-branch-manager.js';
import type {
  DreamCycle,
  DreamCycleStatus,
  ConceptNode,
  ConceptEdge,
  ConceptGraphStats,
  PatternImportData,
} from './types.js';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Complete DreamEngine configuration
 */
export interface DreamConfig {
  /** Maximum dream duration in milliseconds. Default: 30000 (30 seconds) */
  maxDurationMs: number;

  /** Minimum concepts required to start dreaming. Default: 10 */
  minConceptsRequired: number;

  /** Spreading activation configuration */
  activationConfig: ActivationConfig;

  /** Insight generation configuration */
  insightConfig: InsightConfig;

  /** Enable RVCOW branching for reversible dream cycles (ADR-069). Default: true */
  enableBranching: boolean;

  /** Validation thresholds for dream branch quality checks */
  branchValidationThresholds: ValidationThresholds;
}

/**
 * Default DreamEngine configuration
 */
export const DEFAULT_DREAM_CONFIG: DreamConfig = {
  maxDurationMs: 30000,
  minConceptsRequired: 10,
  activationConfig: {
    decayRate: 0.1,
    spreadFactor: 0.5,
    threshold: 0.1,
    maxIterations: 20,
    noiseLevel: 0.05,
  },
  insightConfig: {
    minNoveltyScore: 0.3,
    minConfidence: 0.5,
    maxInsightsPerCycle: 10,
  },
  enableBranching: true,
  branchValidationThresholds: { ...DEFAULT_VALIDATION_THRESHOLDS },
};

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of a complete dream cycle
 */
export interface DreamCycleResult {
  /** The completed dream cycle record */
  cycle: DreamCycle;

  /** Insights generated during the dream */
  insights: DreamInsight[];

  /** Activation statistics */
  activationStats: {
    totalIterations: number;
    peakActivation: number;
    nodesActivated: number;
  };

  /** Number of patterns created from insights */
  patternsCreated: number;
}

/**
 * Result of applying an insight
 */
export interface ApplyInsightResult {
  success: boolean;
  patternId?: string;
  error?: string;
}

// ============================================================================
// ConceptGraph Adapter
// ============================================================================

/**
 * Adapter that bridges the actual ConceptGraph class to the minimal interfaces
 * expected by SpreadingActivation and InsightGenerator.
 *
 * The actual ConceptGraph uses async methods and SQLite persistence,
 * while the spreading activation expects synchronous in-memory access.
 * This adapter maintains an in-memory cache for fast access during dreams.
 */
class ConceptGraphAdapter implements SpreadingConceptGraph, InsightConceptGraph {
  private nodeCache: Map<string, ConceptNode> = new Map();
  private edgeCache: Map<string, ConceptEdge[]> = new Map();
  private activationLevels: Map<string, number> = new Map();

  constructor(private readonly graph: ConceptGraph) {}

  /**
   * Load all nodes and edges into memory for fast access
   */
  async loadIntoMemory(): Promise<void> {
    this.nodeCache.clear();
    this.edgeCache.clear();
    this.activationLevels.clear();

    // Load all nodes
    const nodes = await this.graph.getActiveNodes(0);
    for (const node of nodes) {
      this.nodeCache.set(node.id, node);
      this.activationLevels.set(node.id, node.activationLevel);
    }

    // Load edges for each node
    for (const node of nodes) {
      const neighbors = await this.graph.getNeighbors(node.id);
      const edges: ConceptEdge[] = neighbors.map((n) => n.edge);
      this.edgeCache.set(node.id, edges);
    }
  }

  /**
   * Persist activation levels back to the database
   */
  async persistActivations(): Promise<void> {
    const entries = Array.from(this.activationLevels.entries());
    for (const [nodeId, level] of entries) {
      await this.graph.updateActivation(nodeId, level);
    }
  }

  // SpreadingConceptGraph interface implementation

  getConcept(id: string): ConceptNode | undefined {
    const node = this.nodeCache.get(id);
    if (node) {
      return {
        ...node,
        activationLevel: this.activationLevels.get(id) ?? node.activationLevel,
      };
    }
    return undefined;
  }

  getAllConcepts(minActivation?: number): ConceptNode[] {
    const threshold = minActivation ?? 0;
    return Array.from(this.nodeCache.values())
      .map((node) => ({
        ...node,
        activationLevel: this.activationLevels.get(node.id) ?? node.activationLevel,
      }))
      .filter((node) => node.activationLevel >= threshold);
  }

  getActiveNodes(threshold: number): ConceptNode[] {
    return this.getAllConcepts(threshold);
  }

  getEdges(nodeId: string): ConceptEdge[] {
    return this.edgeCache.get(nodeId) ?? [];
  }

  getEdge(source: string, target: string): ConceptEdge | undefined {
    const edges = this.edgeCache.get(source) ?? [];
    return edges.find((e) => e.target === target);
  }

  setActivation(nodeId: string, level: number): void {
    this.activationLevels.set(nodeId, Math.max(0, Math.min(1, level)));
  }

  decayActivations(factor: number): void {
    const entries = Array.from(this.activationLevels.entries());
    for (const [nodeId, level] of entries) {
      this.activationLevels.set(nodeId, level * factor);
    }
  }

  getStats(): ConceptGraphStats {
    const nodes = Array.from(this.nodeCache.values());
    const byType: Record<string, number> = {
      pattern: 0,
      technique: 0,
      domain: 0,
      outcome: 0,
      error: 0,
    };

    let totalActivation = 0;
    for (const node of nodes) {
      byType[node.conceptType] = (byType[node.conceptType] ?? 0) + 1;
      totalActivation += this.activationLevels.get(node.id) ?? node.activationLevel;
    }

    let totalEdges = 0;
    const edgeValues = Array.from(this.edgeCache.values());
    for (const edges of edgeValues) {
      totalEdges += edges.length;
    }

    return {
      nodeCount: nodes.length,
      edgeCount: totalEdges,
      byType: byType as ConceptGraphStats['byType'],
      avgEdgesPerNode: nodes.length > 0 ? totalEdges / nodes.length : 0,
      avgActivation: nodes.length > 0 ? totalActivation / nodes.length : 0,
    };
  }
}

// ============================================================================
// DreamEngine Class
// ============================================================================

/**
 * DreamEngine orchestrates dream-based pattern discovery.
 *
 * @example
 * ```typescript
 * const engine = new DreamEngine('.aqe/dream.db');
 * await engine.initialize();
 *
 * // Load patterns for dreaming
 * const patterns = await loadPatternsFromStore();
 * await engine.loadPatternsAsConcepts(patterns);
 *
 * // Run a dream cycle (30 seconds)
 * const result = await engine.dream(30000);
 *
 * console.log(`Generated ${result.insights.length} insights`);
 *
 * // Apply high-confidence insights
 * for (const insight of result.insights) {
 *   if (insight.confidenceScore > 0.8) {
 *     const applied = await engine.applyInsight(insight.id);
 *     console.log(`Applied insight: ${applied.patternId}`);
 *   }
 * }
 *
 * await engine.close();
 * ```
 */
export class DreamEngine {
  private readonly config: DreamConfig;
  private persistence: UnifiedPersistenceManager | null = null;
  private graph: ConceptGraph | null = null;
  private db: DatabaseType | null = null;
  private branchManager: RVCOWBranchManager | null = null;
  private currentCycle: DreamCycle | null = null;
  private initialized = false;
  private cancelled = false;
  private branchEventListeners: Array<(event: string, branch: Branch, detail?: ValidationResult) => void> = [];

  constructor(config?: Partial<DreamConfig>) {
    this.config = { ...DEFAULT_DREAM_CONFIG, ...config };
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize using unified persistence
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.persistence = getUnifiedPersistence();
      if (!this.persistence.isInitialized()) {
        await this.persistence.initialize();
      }
      this.db = this.persistence.getDatabase();

      // Migrate legacy schema: rename 'duration' → 'duration_ms' if needed
      this.migrateSchema();

      // Initialize concept graph (shares same unified persistence)
      this.graph = new ConceptGraph();
      await this.graph.initialize();

      // Initialize RVCOW branch manager (ADR-069)
      if (this.config.enableBranching) {
        this.branchManager = new RVCOWBranchManager(
          this.db,
          this.config.branchValidationThresholds,
        );
      }

      this.initialized = true;
      console.log(`[DreamEngine] Initialized: ${this.persistence.getDbPath()}`);
    } catch (error) {
      throw new Error(
        `Failed to initialize DreamEngine: ${toErrorMessage(error)}`
      );
    }
  }

  /**
   * Migrate legacy schema if needed.
   * Handles the 'duration' → 'duration_ms' column rename in dream_cycles.
   */
  private migrateSchema(): void {
    if (!this.db) return;
    try {
      // Migrate dream_cycles: rename 'duration' → 'duration_ms'
      const cycleCols = this.db.prepare('PRAGMA table_info(dream_cycles)').all() as Array<{ name: string }>;
      const hasDurationMs = cycleCols.some(c => c.name === 'duration_ms');
      const hasDuration = cycleCols.some(c => c.name === 'duration');
      if (!hasDurationMs && hasDuration) {
        this.db.exec('ALTER TABLE dream_cycles RENAME COLUMN duration TO duration_ms');
      }

      // Migrate dream_insights: check for legacy 'type' column (should be 'insight_type')
      const insightCols = this.db.prepare('PRAGMA table_info(dream_insights)').all() as Array<{ name: string }>;
      const colNames = new Set(insightCols.map(c => c.name));
      const hasInsightType = colNames.has('insight_type');
      const hasSourceConcepts = colNames.has('source_concepts');

      // SAFE migration: add missing columns instead of dropping the table.
      // Previous implementation used DROP TABLE which destroyed all dream insights.
      // See: Data loss incidents Feb 17-23, 2026.
      if (!hasInsightType) {
        try {
          this.db.exec("ALTER TABLE dream_insights ADD COLUMN insight_type TEXT NOT NULL DEFAULT 'general'");
          dreamLogger.info('Added insight_type column to dream_insights (safe migration)');
        } catch { /* column may already exist */ }
      }
      if (!hasSourceConcepts) {
        try {
          this.db.exec("ALTER TABLE dream_insights ADD COLUMN source_concepts TEXT NOT NULL DEFAULT '[]'");
          dreamLogger.info('Added source_concepts column to dream_insights (safe migration)');
        } catch { /* column may already exist */ }
      }
      // Ensure indexes exist regardless
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_insight_cycle ON dream_insights(cycle_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_insight_type ON dream_insights(insight_type)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_insight_novelty ON dream_insights(novelty_score DESC)');
    } catch (e) {
      // Ignore migration errors — table may not exist yet
      dreamLogger.debug('Dream schema migration skipped', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  // ==========================================================================
  // Main Dream Cycle
  // ==========================================================================

  /**
   * Run a complete dream cycle.
   *
   * The dream cycle:
   * 1. Checks for sufficient concepts
   * 2. Runs spreading activation (the "dreaming")
   * 3. Finds novel associations
   * 4. Generates insights from activation patterns
   * 5. Persists the cycle and insights
   *
   * @param durationMs - Maximum duration in milliseconds (default: config.maxDurationMs)
   * @returns Dream cycle result with insights and statistics
   */
  async dream(durationMs?: number): Promise<DreamCycleResult> {
    this.ensureInitialized();
    this.cancelled = false;

    const maxDuration = durationMs ?? this.config.maxDurationMs;
    const startTime = Date.now();

    // Create cycle record
    this.currentCycle = {
      id: uuidv4(),
      startTime: new Date(),
      conceptsProcessed: 0,
      associationsFound: 0,
      insightsGenerated: 0,
      status: 'running' as DreamCycleStatus,
    };
    await this.saveCycle(this.currentCycle);

    // ADR-069: Create RVCOW branch before dream consolidation
    let branch: Branch | null = null;
    if (this.branchManager) {
      const branchName = `dream-${this.currentCycle.id}-${Date.now()}`;
      branch = this.branchManager.createBranch(branchName);
      this.emitBranchEvent('dream:branch_created', branch);
    }

    try {
      // 1. Check we have enough concepts
      const allNodes = await this.graph!.getActiveNodes(0);
      if (allNodes.length < this.config.minConceptsRequired) {
        throw new Error(
          `Insufficient concepts: ${allNodes.length} < ${this.config.minConceptsRequired}`
        );
      }

      // 2. Create adapter and load graph into memory
      const adapter = new ConceptGraphAdapter(this.graph!);
      await adapter.loadIntoMemory();

      // 3. Run spreading activation (the "dreaming")
      const activation = new SpreadingActivation(adapter, this.config.activationConfig);
      const activationResult = await activation.dream(maxDuration);

      // Check for cancellation
      if (this.cancelled) {
        this.currentCycle.status = 'interrupted';
        this.currentCycle.endTime = new Date();
        this.currentCycle.durationMs = Date.now() - startTime;
        await this.updateCycle(this.currentCycle);
        throw new Error('Dream cycle cancelled');
      }

      this.currentCycle.conceptsProcessed = activationResult.nodesActivated;
      this.currentCycle.associationsFound = activationResult.novelAssociations.length;

      // 4. Persist activation levels
      await adapter.persistActivations();

      // 5. Generate insights from activation
      const generator = new InsightGenerator(adapter, this.config.insightConfig);
      const insights = await generator.generateFromActivation(
        this.currentCycle.id,
        activationResult
      );

      this.currentCycle.insightsGenerated = insights.length;

      // 6. Save insights
      for (const insight of insights) {
        await this.saveInsight(insight);
      }

      // 7. Finalize cycle
      this.currentCycle.endTime = new Date();
      this.currentCycle.durationMs = Date.now() - startTime;
      this.currentCycle.status = 'completed';
      await this.updateCycle(this.currentCycle);

      // ADR-069: Validate and merge/discard the RVCOW branch
      if (branch && this.branchManager) {
        const validation = this.branchManager.validateBranch(branch);
        if (validation.passed) {
          this.branchManager.mergeBranch(branch);
          this.emitBranchEvent('dream:branch_merged', branch, validation);
        } else {
          this.branchManager.discardBranch(branch);
          this.emitBranchEvent('dream:branch_discarded', branch, validation);
          dreamLogger.warn('Dream branch discarded: quality validation failed', {
            cycleId: this.currentCycle.id,
            reason: validation.reason,
          });
          // Still return results so caller sees what happened
        }
        branch = null; // Prevent double-discard in catch
      }

      const result: DreamCycleResult = {
        cycle: { ...this.currentCycle },
        insights,
        activationStats: {
          totalIterations: activationResult.iterations,
          peakActivation: activationResult.peakActivation,
          nodesActivated: activationResult.nodesActivated,
        },
        patternsCreated: 0, // Updated when insights are applied
      };

      this.currentCycle = null;
      return result;
    } catch (error) {
      // ADR-069: Discard branch on error to ensure no partial mutations persist
      if (branch && this.branchManager) {
        try {
          this.branchManager.discardBranch(branch);
          this.emitBranchEvent('dream:branch_discarded', branch);
        } catch {
          // Branch may already be discarded; ignore
        }
      }

      if (this.currentCycle) {
        if (this.currentCycle.status === 'running') {
          this.currentCycle.status = 'failed';
        }
        this.currentCycle.error = toErrorMessage(error);
        this.currentCycle.endTime = new Date();
        this.currentCycle.durationMs = Date.now() - startTime;
        await this.updateCycle(this.currentCycle);
      }
      this.currentCycle = null;
      throw error;
    }
  }

  // ==========================================================================
  // Pattern Loading
  // ==========================================================================

  /**
   * Load patterns as concepts for dreaming.
   *
   * Converts patterns from the pattern store into concept nodes
   * that can be activated during dream cycles.
   *
   * @param patterns - Array of pattern data to load
   * @returns Number of patterns successfully loaded
   */
  async loadPatternsAsConcepts(patterns: PatternImportData[]): Promise<number> {
    this.ensureInitialized();
    return this.graph!.loadFromPatterns(patterns);
  }

  /**
   * Ensure sufficient concepts are loaded for dreaming.
   * If the concept graph has fewer nodes than minConceptsRequired,
   * auto-loads patterns from the qe_patterns table.
   *
   * @returns Number of concepts loaded (0 if already sufficient)
   */
  async ensureConceptsLoaded(): Promise<number> {
    this.ensureInitialized();
    const existing = await this.graph!.getActiveNodes(0);
    if (existing.length >= this.config.minConceptsRequired) {
      return 0;
    }

    // Load patterns from qe_patterns table in the shared unified DB
    const rows = this.db!.prepare(
      `SELECT id, name, description, qe_domain as domain, pattern_type as patternType,
              confidence, success_rate as successRate
       FROM qe_patterns
       WHERE confidence >= 0.3
       ORDER BY quality_score DESC
       LIMIT 200`
    ).all() as PatternImportData[];

    if (rows.length === 0) {
      return 0;
    }

    return this.graph!.loadFromPatterns(rows);
  }

  // ==========================================================================
  // Insight Management
  // ==========================================================================

  /**
   * Apply an insight by converting it to a pattern.
   *
   * @param insightId - ID of the insight to apply
   * @returns Result with success status and pattern ID
   */
  async applyInsight(insightId: string): Promise<ApplyInsightResult> {
    this.ensureInitialized();

    try {
      // Get the insight from database
      const insightRow = await this.getInsightRowById(insightId);
      if (!insightRow) {
        return { success: false, error: `Insight not found: ${insightId}` };
      }

      if (insightRow.actionable !== 1) {
        return { success: false, error: 'Insight is not actionable' };
      }

      if (insightRow.applied === 1) {
        return {
          success: true,
          patternId: insightRow.pattern_id ?? undefined,
          error: 'Insight already applied',
        };
      }

      // Generate a pattern ID
      const patternId = `dream-pattern-${uuidv4()}`;

      // Mark insight as applied
      const stmt = this.db!.prepare(`
        UPDATE dream_insights
        SET applied = 1, pattern_id = ?
        WHERE id = ?
      `);
      stmt.run(patternId, insightId);

      return { success: true, patternId };
    } catch (error) {
      return {
        success: false,
        error: toErrorMessage(error),
      };
    }
  }

  /**
   * Get pending insights that haven't been applied.
   *
   * @param limit - Maximum number of insights to return (default: 20)
   * @returns Array of pending insights
   */
  async getPendingInsights(limit?: number): Promise<DreamInsight[]> {
    this.ensureInitialized();

    const maxResults = limit ?? 20;
    const stmt = this.db!.prepare(`
      SELECT * FROM dream_insights
      WHERE applied = 0 AND actionable = 1
      ORDER BY novelty_score DESC, confidence_score DESC
      LIMIT ?
    `);

    const rows = stmt.all(maxResults) as InsightRow[];
    return rows.map((row) => this.rowToInsight(row));
  }

  /**
   * Get dream cycle history.
   *
   * @param limit - Maximum number of cycles to return (default: 20)
   * @returns Array of dream cycles
   */
  async getDreamHistory(limit?: number): Promise<DreamCycle[]> {
    this.ensureInitialized();

    const maxResults = limit ?? 20;
    const stmt = this.db!.prepare(`
      SELECT * FROM dream_cycles
      ORDER BY start_time DESC
      LIMIT ?
    `);

    const rows = stmt.all(maxResults) as CycleRow[];
    return rows.map((row) => this.rowToCycle(row));
  }

  // ==========================================================================
  // Dream Control
  // ==========================================================================

  /**
   * Cancel the running dream cycle.
   */
  async cancelDream(): Promise<void> {
    this.cancelled = true;
  }

  /**
   * Check if a dream is currently running.
   */
  isDreaming(): boolean {
    return this.currentCycle !== null && this.currentCycle.status === 'running';
  }

  /**
   * Get the current dream cycle status.
   */
  getCurrentCycle(): DreamCycle | null {
    return this.currentCycle ? { ...this.currentCycle } : null;
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  private async saveCycle(cycle: DreamCycle): Promise<void> {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT INTO dream_cycles
      (id, start_time, end_time, duration_ms, concepts_processed, associations_found,
       insights_generated, status, error, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      cycle.id,
      cycle.startTime.toISOString(),
      cycle.endTime?.toISOString() ?? null,
      cycle.durationMs ?? null,
      cycle.conceptsProcessed,
      cycle.associationsFound,
      cycle.insightsGenerated,
      cycle.status,
      cycle.error ?? null,
      cycle.startTime.toISOString()
    );
  }

  private async updateCycle(cycle: DreamCycle): Promise<void> {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      UPDATE dream_cycles
      SET end_time = ?, duration_ms = ?, concepts_processed = ?, associations_found = ?,
          insights_generated = ?, status = ?, error = ?
      WHERE id = ?
    `);

    stmt.run(
      cycle.endTime?.toISOString() ?? null,
      cycle.durationMs ?? null,
      cycle.conceptsProcessed,
      cycle.associationsFound,
      cycle.insightsGenerated,
      cycle.status,
      cycle.error ?? null,
      cycle.id
    );
  }

  private async saveInsight(insight: DreamInsight): Promise<void> {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT INTO dream_insights
      (id, cycle_id, insight_type, source_concepts, description, novelty_score,
       confidence_score, actionable, applied, suggested_action, pattern_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      insight.id,
      insight.cycleId,
      insight.type,
      JSON.stringify(insight.sourceConcepts),
      insight.description,
      insight.noveltyScore,
      insight.confidenceScore,
      insight.actionable ? 1 : 0,
      0, // Not applied yet
      insight.suggestedAction ?? null,
      null // No pattern yet
    );
  }

  private async getInsightRowById(id: string): Promise<InsightRow | null> {
    if (!this.db) return null;

    const stmt = this.db.prepare('SELECT * FROM dream_insights WHERE id = ?');
    const row = stmt.get(id) as InsightRow | undefined;

    return row ?? null;
  }

  // ==========================================================================
  // Branch Management (ADR-069)
  // ==========================================================================

  /**
   * Get the RVCOW branch manager, if branching is enabled.
   */
  getBranchManager(): RVCOWBranchManager | null {
    return this.branchManager;
  }

  /**
   * Register a listener for branch lifecycle events.
   */
  onBranchEvent(listener: (event: string, branch: Branch, detail?: ValidationResult) => void): void {
    this.branchEventListeners.push(listener);
  }

  private emitBranchEvent(event: string, branch: Branch, detail?: ValidationResult): void {
    for (const listener of this.branchEventListeners) {
      try {
        listener(event, branch, detail);
      } catch {
        // Swallow listener errors
      }
    }
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Release resources (does NOT close the shared database)
   */
  async close(): Promise<void> {
    if (this.graph) {
      await this.graph.close();
      this.graph = null;
    }

    this.db = null;
    this.persistence = null;
    this.branchManager = null;
    this.initialized = false;
    this.currentCycle = null;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private ensureInitialized(): void {
    if (!this.initialized || !this.graph || !this.db) {
      throw new Error('DreamEngine not initialized. Call initialize() first.');
    }
  }

  private rowToCycle(row: CycleRow): DreamCycle {
    return {
      id: row.id,
      startTime: new Date(row.start_time),
      endTime: row.end_time ? new Date(row.end_time) : undefined,
      durationMs: row.duration_ms ?? undefined,
      conceptsProcessed: row.concepts_processed,
      associationsFound: row.associations_found,
      insightsGenerated: row.insights_generated,
      status: row.status as DreamCycleStatus,
      error: row.error ?? undefined,
    };
  }

  private rowToInsight(row: InsightRow): DreamInsight {
    return {
      id: row.id,
      cycleId: row.cycle_id,
      type: row.insight_type as DreamInsight['type'],
      sourceConcepts: safeJsonParse<string[]>(row.source_concepts),
      description: row.description,
      noveltyScore: row.novelty_score,
      confidenceScore: row.confidence_score,
      actionable: row.actionable === 1,
      applied: row.applied === 1,
      patternId: row.pattern_id ?? undefined,
      suggestedAction: row.suggested_action ?? undefined,
      createdAt: new Date(row.created_at),
    };
  }
}

// ============================================================================
// Row Types
// ============================================================================

interface CycleRow {
  id: string;
  start_time: string;
  end_time: string | null;
  duration_ms: number | null;
  concepts_processed: number;
  associations_found: number;
  insights_generated: number;
  status: string;
  error: string | null;
  created_at: string;
}

interface InsightRow {
  id: string;
  cycle_id: string;
  insight_type: string;
  source_concepts: string;
  description: string;
  novelty_score: number;
  confidence_score: number;
  actionable: number;
  applied: number;
  suggested_action: string | null;
  pattern_id: string | null;
  created_at: string;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new DreamEngine instance
 */
export function createDreamEngine(config?: Partial<DreamConfig>): DreamEngine {
  return new DreamEngine(config);
}

export default DreamEngine;
