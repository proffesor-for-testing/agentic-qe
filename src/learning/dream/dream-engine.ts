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
 * @module learning/dream/dream-engine
 */

import { safeJsonParse } from '../../shared/safe-json.js';
import { toErrorMessage } from '../../shared/error-utils.js';
import { PatternMutationError } from '../pattern-mutation-error.js';
import { LoggerFactory } from '../../logging/index.js';

const dreamLogger = LoggerFactory.create('dream-engine');

/** #1239: an unreadable retention setting is reported once per process. */
let retentionWarningsLogged = false;

/**
 * #1239: how long retention waits for a locked database. better-sqlite3 waits
 * synchronously, and retention is optional (the next dream retries), so it
 * gives up quickly instead of using the engine's 60 s commit wait.
 */
export const RETENTION_BUSY_TIMEOUT_MS = 1000;

import type { Database as DatabaseType } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

import { getUnifiedPersistence, type UnifiedPersistenceManager } from '../../kernel/unified-persistence.js';
import { registerStoreCloser } from '../../kernel/process-lifecycle.js';
import { ConceptGraph } from './concept-graph.js';
import {
  DREAM_LOCK_WAIT_MS,
  DREAM_SHUTDOWN_LOCK_WAIT_MS,
  isBusyError,
  retryWhileBusy,
  withBusyTimeout,
} from './dream-lock-retry.js';
import {
  SpreadingActivation,
  type ActivationConfig,
  type ConceptGraph as SpreadingConceptGraph,
} from './spreading-activation.js';
import {
  InsightGenerator,
  type InsightConfig,
  type DreamInsight,
  type ConceptGraph as InsightConceptGraph,
} from './insight-generator.js';
import {
  type Branch,
  type ValidationResult,
  type ValidationThresholds,
  DEFAULT_VALIDATION_THRESHOLDS,
} from './rvcow-branch-manager.js';
import {
  commitDream,
  markAbandonedCycles,
  ABANDONED_CYCLE_GRACE_MS,
  type ComputedDream,
} from './dream-commit.js';
import type { WitnessChain } from '../../audit/witness-chain.js';
import {
  describeRetention,
  resolveDefaultRetention,
  runDreamRetention,
  type DreamRetentionReport,
} from '../learning-retention.js';
import type {
  DreamCycle,
  DreamCycleStatus,
  ConceptNode,
  ConceptEdge,
  ConceptGraphStats,
  PatternImportData,
  FailureImportData,
  SuccessImportData,
} from './types.js';
import type { QEPatternType } from '../qe-patterns.js';
import { addToCount } from '../../shared/utils/safe-record.js';

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

  /**
   * @deprecated #1060: ignored. A dream is computed in memory and its results
   * are committed in one short synchronous transaction (see dream-commit.ts),
   * which gives the atomicity branching was meant to provide without holding
   * a SAVEPOINT on the shared connection across the asynchronous dream (that
   * rolled back acknowledged foreground writes). Setting it to true logs a
   * warning and has no other effect. Kept so existing configs still load.
   */
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
  // #1060: deprecated and ignored; see DreamConfig.enableBranching.
  enableBranching: false,
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

  /** #1060: how long the single commit transaction held the write lock, in ms. */
  commitDurationMs?: number;

  /**
   * #1239: dream retention after the commit, with row counts. Off by default
   * (AQE_DREAM_RETENTION); while off, the steps are a dry run showing what
   * they would remove.
   */
  retention?: DreamRetentionReport;

  /**
   * #1060: the uncommitted results of a `dream(…, { commit: false })` run.
   * Pass the result to DreamEngine.commitDreamResult() to write them.
   */
  pending?: ComputedDream;
}

/** #1060: per-call options for DreamEngine.dream(). */
export interface DreamRunOptions {
  /** Minimum concepts required for this run (default: config.minConceptsRequired). */
  minConceptsRequired?: number;
  /** Activation parameter overrides for this run (SpeculativeDreamer strategies). */
  activationConfig?: Partial<ActivationConfig>;
  /**
   * Write the results (default true). With false the dream writes nothing at
   * all, not even its cycle row, and returns them in `pending`.
   */
  commit?: boolean;
}

/**
 * #1060: the longest dream the MCP tool runs (its durationMs cap). The
 * abandoned-cycle sweep waits at least this long plus the grace period.
 */
const MAX_TOOL_DREAM_MS = 60_000;

/** #1060: a second dream on the same engine while one is running. */
export class DreamAlreadyRunningError extends Error {
  constructor(readonly cycleId: string) {
    super(`A dream cycle is already running (cycle ${cycleId}); wait for it to finish or cancel it`);
    this.name = 'DreamAlreadyRunningError';
  }
}

/**
 * Result of applying an insight
 */
export interface ApplyInsightResult {
  success: boolean;
  patternId?: string;
  /**
   * The pattern row committed to SQLite but its vector index is pending
   * (COMMITTED_PENDING_INDEX, e.g. the RVF index is unbound or locked).
   */
  indexPending?: boolean;
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
 * Exported for tests only (#1186).
 */
export class ConceptGraphAdapter implements SpreadingConceptGraph, InsightConceptGraph {
  private nodeCache: Map<string, ConceptNode> = new Map();
  private edgeCache: Map<string, ConceptEdge[]> = new Map();
  private activationLevels: Map<string, number> = new Map();
  /** #1060: each node's level when loaded, for the commit's conflict check. */
  private loadedLevels: Map<string, number> = new Map();

  constructor(private readonly graph: ConceptGraph) {}

  /**
   * Load nodes and edges into memory for fast access.
   * @param maxNodes - Maximum number of nodes to load (prevents slow loading
   *   on accumulated concept graphs). Nodes are sorted by activation level
   *   descending, so the most active concepts are prioritized. Default: no limit.
   */
  async loadIntoMemory(maxNodes?: number): Promise<void> {
    this.nodeCache.clear();
    this.edgeCache.clear();
    this.activationLevels.clear();
    this.loadedLevels.clear();

    // Load nodes (all or capped)
    let nodes = await this.graph.getActiveNodes(0);
    if (maxNodes && nodes.length > maxNodes) {
      nodes = nodes
        .sort((a, b) => b.activationLevel - a.activationLevel)
        .slice(0, maxNodes);
    }

    for (const node of nodes) {
      this.nodeCache.set(node.id, node);
      this.activationLevels.set(node.id, node.activationLevel);
      this.loadedLevels.set(node.id, node.activationLevel);
    }

    // Load edges for each node
    for (const node of nodes) {
      const neighbors = await this.graph.getNeighbors(node.id);
      const edges: ConceptEdge[] = neighbors.map((n) => n.edge);
      this.edgeCache.set(node.id, edges);
    }
  }

  /**
   * Final activation levels with the levels loaded, written by commitDream()
   * in the cycle's single transaction (#1060) instead of one awaited UPDATE
   * per node. The loaded level lets the commit skip a node a foreground write
   * changed during the dream.
   */
  activationEntries(): Array<[string, number, number | undefined]> {
    return Array.from(this.activationLevels.entries(), ([id, level]) => [
      id,
      level,
      this.loadedLevels.get(id),
    ]);
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
      // #1186: a stored concept type such as `constructor` or `__proto__` is
      // counted as its own bucket, not added to the inherited member.
      addToCount(byType, node.conceptType);
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
 * const engine = new DreamEngine('.agentic-qe/dream.db');
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
  /** #1060: marks the in-flight dream cycle interrupted (set while dreaming). */
  private interruptActiveDream: (() => void) | null = null;
  /** #1060: the in-flight dream, so close() can wait for it to stop. */
  private activeDream: { cycleId: string; done: Promise<unknown> } | null = null;
  /** #1060: stops the in-flight dream's activation loop. */
  private activeAbort: AbortController | null = null;
  private currentCycle: DreamCycle | null = null;
  private initialized = false;
  private cancelled = false;
  /** #1060: how many times cancelDream() was called (see cancelCount). */
  private cancelRequests = 0;
  /** #1060: set by close() until the engine is initialized again. */
  private closing = false;
  private branchEventListeners: Array<(event: string, branch: Branch, detail?: ValidationResult) => void> = [];

  /** Optional witness chain for audit trail of dream decisions (ADR-070) */
  private _witnessChain: WitnessChain | null = null;
  set witnessChain(wc: WitnessChain | null) { this._witnessChain = wc; }

  /** @deprecated #1060: branching is ignored, so the RVF adapter is unused. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set rvfAdapter(_adapter: any) { /* ignored (#1060) */ }

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

      // #1253: no 60 s busy_timeout on this shared connection. better-sqlite3
      // waits synchronously, so it froze the whole process (the MCP event loop)
      // while another writer held the database. Dream writes instead wait
      // briefly per attempt and retry asynchronously (dream-lock-retry.ts),
      // which keeps the patience that avoided failures under contention (#1060).

      // Migrate legacy schema: rename 'duration' → 'duration_ms' if needed.
      // #1253: a short lock wait only; migrateSchema() logs and carries on.
      withBusyTimeout(this.db, DREAM_LOCK_WAIT_MS, () => this.migrateSchema());

      // Initialize concept graph (shares same unified persistence)
      this.graph = new ConceptGraph();
      await this.graph.initialize();

      // #1060: branching is deprecated; dream results commit in one transaction.
      if (this.config.enableBranching) {
        dreamLogger.warn(
          'DreamConfig.enableBranching is deprecated and ignored (#1060): dream results are ' +
            'committed in one short transaction instead of a SAVEPOINT held across the dream',
        );
      }

      // #1060: a process that exited mid-dream left its cycle 'running'.
      // #1253: housekeeping, so a locked database skips it after a short
      // wait instead of blocking the process; the next initialize() retries.
      const db = this.db;
      try {
        const abandoned = withBusyTimeout(db, DREAM_LOCK_WAIT_MS, () => markAbandonedCycles(
          db,
          Math.max(this.config.maxDurationMs, MAX_TOOL_DREAM_MS) + ABANDONED_CYCLE_GRACE_MS,
        ));
        if (abandoned > 0) {
          dreamLogger.info('Marked abandoned dream cycles as interrupted', { abandoned });
        }
      } catch (error) {
        if (!isBusyError(error)) throw error;
        dreamLogger.warn('Abandoned dream cycle sweep skipped: database is locked', { error: toErrorMessage(error) });
      }

      this.initialized = true;
      this.closing = false;
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
   * The cycle row is written as 'running' when the dream starts. Another
   * process's DreamEngine.initialize() marks a cycle still 'running' after
   * max(its config.maxDurationMs, 60 s) + ABANDONED_CYCLE_GRACE_MS (10 min),
   * i.e. 11 minutes by default, as interrupted ('abandoned: process exited').
   * The MCP tool and the CLI cap dreams at 60 s. A library caller that runs
   * dreams longer than about 10 minutes (graph loading included) should give
   * every engine sharing the database a maxDurationMs at least that long, or
   * a live cycle can be marked interrupted. Its commit still records the
   * final status, and nothing is deleted.
   *
   * @param durationMs - Maximum duration in milliseconds (default: config.maxDurationMs)
   * @returns Dream cycle result with insights and statistics
   */
  async dream(durationMs?: number, options: DreamRunOptions = {}): Promise<DreamCycleResult> {
    this.ensureInitialized();
    if (this.closing) throw new Error('Dream engine is closing; no new dream is started');
    // #1060: one dream at a time per engine; a second request is refused.
    if (this.activeDream) throw new DreamAlreadyRunningError(this.activeDream.cycleId);

    const cycle: DreamCycle = {
      id: uuidv4(),
      startTime: new Date(),
      conceptsProcessed: 0,
      associationsFound: 0,
      insightsGenerated: 0,
      status: 'running' as DreamCycleStatus,
    };
    const run = this.runDream(cycle, durationMs ?? this.config.maxDurationMs, options);
    this.activeDream = { cycleId: cycle.id, done: run.catch(() => undefined) };
    try {
      return await run;
    } finally {
      if (this.activeDream?.cycleId === cycle.id) this.activeDream = null;
    }
  }

  /**
   * #1060: compute, then commit. Everything up to the commit reads the
   * database or works in memory; the results are written by commitDream() in
   * one synchronous transaction, so no lock is held across an await and no
   * foreground write can join the dream's writes or be rolled back with them.
   */
  private async runDream(
    cycle: DreamCycle,
    maxDuration: number,
    options: DreamRunOptions,
  ): Promise<DreamCycleResult> {
    const db = this.db!;
    const graph = this.graph!;
    const startTime = Date.now();
    const abort = new AbortController();
    this.activeAbort = abort;
    this.cancelled = false;
    this.currentCycle = cycle;
    const commitResults = options.commit !== false;

    // If the engine closes or the process shuts down mid-dream, stop the dream
    // and record the cycle as interrupted instead of leaving it 'running'.
    // Registered before the first await, so a close() or shutdown right after
    // dream() is called still reaches this dream.
    const interrupt = this.createCycleInterrupter(cycle, startTime, abort);
    this.interruptActiveDream = interrupt;
    const unregisterShutdownGuard = registerStoreCloser(interrupt);
    // The engine still owns this database and nobody asked the dream to stop.
    const live = () => !this.cancelled && !abort.signal.aborted && this.db === db;
    let committed = false;

    try {
      if (commitResults) await this.saveCycle(cycle, live);
      if (!live()) throw new Error('Dream cycle cancelled');

      // 1. Check we have enough concepts
      const minConcepts = options.minConceptsRequired ?? this.config.minConceptsRequired;
      const allNodes = await graph.getActiveNodes(0);
      if (allNodes.length < minConcepts) {
        throw new Error(`Insufficient concepts: ${allNodes.length} < ${minConcepts}`);
      }

      // 2. Load the graph into memory. Each node requires DB queries for
      //    edges, so the node count is capped to keep wall-clock time reasonable.
      const adapter = new ConceptGraphAdapter(graph);
      await adapter.loadIntoMemory(30);

      // 3. Spreading activation (the "dreaming"), in memory only.
      const activation = new SpreadingActivation(adapter, {
        ...this.config.activationConfig,
        ...options.activationConfig,
      });
      const activationResult = await activation.dream(maxDuration, abort.signal);
      if (!live()) throw new Error('Dream cycle cancelled');

      cycle.conceptsProcessed = activationResult.nodesActivated;
      cycle.associationsFound = activationResult.novelAssociations.length;

      // 4. Insights, in memory only.
      const generator = new InsightGenerator(adapter, this.config.insightConfig);
      const insights = await generator.generateFromActivation(cycle.id, activationResult);
      if (!live()) throw new Error('Dream cycle cancelled');

      // 5. Commit activations, insights and the final cycle row together.
      //    live() was checked synchronously just above, so the dream is
      //    still wanted and the engine still owns the database.
      cycle.insightsGenerated = insights.length;
      cycle.endTime = new Date();
      cycle.durationMs = Date.now() - startTime;
      cycle.status = 'completed';
      const computed: ComputedDream = { cycle, activations: adapter.activationEntries(), insights };
      const result: DreamCycleResult = {
        cycle: { ...cycle },
        insights,
        activationStats: {
          totalIterations: activationResult.iterations,
          peakActivation: activationResult.peakActivation,
          nodesActivated: activationResult.nodesActivated,
        },
        patternsCreated: 0, // Updated when insights are applied
      };
      if (!commitResults) {
        committed = true; // nothing to record: the caller decides
        return { ...result, pending: computed };
      }
      const commit = await this.commitComputed(db, computed, live);
      committed = true;
      result.commitDurationMs = commit.durationMs;
      result.retention = commit.retention;
      return result;
    } catch (error) {
      // Nothing of the dream was committed. An interrupted cycle was already
      // recorded by the interrupter; anything else is recorded as failed.
      if (!committed && cycle.status !== 'interrupted') {
        cycle.status = this.cancelled ? 'interrupted' : 'failed';
        cycle.error = toErrorMessage(error);
        cycle.endTime = new Date();
        cycle.durationMs = Date.now() - startTime;
        if (commitResults && this.db === db) {
          try {
            await retryWhileBusy(db, () => this.updateCycleSync(cycle), { shouldContinue: () => this.db === db });
          } catch { /* best effort */ }
        }
      }
      if (!committed && commitResults) {
        try {
          this._witnessChain?.append('DREAM_DISCARD', {
            cycleId: cycle.id, reason: toErrorMessage(error),
          }, 'dream-engine');
        } catch { /* best-effort witness */ }
      }
      throw error;
    } finally {
      unregisterShutdownGuard();
      if (this.interruptActiveDream === interrupt) this.interruptActiveDream = null;
      if (this.currentCycle === cycle) this.currentCycle = null;
      if (this.activeAbort === abort) this.activeAbort = null;
    }
  }

  /**
   * #1060: write the results of a `dream(…, { commit: false })` run, in the
   * same single transaction a normal dream uses. Returns the commit duration
   * in ms. Throws (and writes nothing) if the engine is closed or the write
   * fails. #1253: async, because a locked database is retried without
   * blocking the process.
   */
  async commitDreamResult(result: DreamCycleResult): Promise<number> {
    this.ensureInitialized();
    if (this.closing) {
      throw new Error('Dream engine is closing; nothing is committed');
    }
    if (!result.pending) {
      throw new Error('Dream result has nothing pending to commit (it was already committed)');
    }
    const db = this.db!;
    const commit = await this.commitComputed(db, result.pending, () => !this.closing && this.db === db);
    result.pending = undefined;
    result.commitDurationMs = commit.durationMs;
    result.retention = commit.retention;
    return commit.durationMs;
  }

  /**
   * Commit a computed dream, then record it in the witness chain (#1060) and
   * run the default retention steps (#1239).
   */
  private async commitComputed(
    db: DatabaseType,
    computed: ComputedDream,
    live: () => boolean,
  ): Promise<{ durationMs: number; retention: DreamRetentionReport }> {
    // #1253: retry a locked database asynchronously; each attempt is short.
    const commit = await retryWhileBusy(db, () => commitDream(db, computed), {
      shouldContinue: live,
      cancelledError: () => new Error('Dream cycle cancelled'),
    });
    try {
      this._witnessChain?.append('DREAM_COMMIT', {
        cycleId: computed.cycle.id,
        insights: commit.insightsWritten,
        activations: commit.activationsWritten,
        commitDurationMs: commit.commitDurationMs,
      }, 'dream-engine');
    } catch { /* best-effort witness */ }
    return { durationMs: commit.commitDurationMs, retention: this.runDefaultRetention(db) };
  }

  /**
   * #1239: after a committed dream, drop failed cycles past their retention
   * window and outcome concepts beyond the cap when AQE_DREAM_RETENTION=on;
   * otherwise only count what that would remove. The dream is already
   * committed, so a failure here (a locked database, say) is only logged.
   */
  private runDefaultRetention(db: DatabaseType): DreamRetentionReport {
    const settings = resolveDefaultRetention();
    if (settings.warnings.length > 0 && !retentionWarningsLogged) {
      retentionWarningsLogged = true;
      for (const warning of settings.warnings) dreamLogger.warn(warning);
    }
    const previousBusyTimeout = db.pragma('busy_timeout', { simple: true }) as number;
    try {
      db.pragma(`busy_timeout = ${RETENTION_BUSY_TIMEOUT_MS}`);
      const report = runDreamRetention(db, settings);
      if (report.enabled) {
        for (const step of report.steps) {
          if (step.affected > 0) dreamLogger.info(`Retention ${describeRetention(step)}`);
        }
      }
      return report;
    } catch (error) {
      dreamLogger.warn('Dream retention skipped after dream commit', { error: toErrorMessage(error) });
      return { enabled: settings.enabled, steps: [], error: toErrorMessage(error) };
    } finally {
      try { db.pragma(`busy_timeout = ${previousBusyTimeout}`); } catch { /* connection gone */ }
    }
  }

  /**
   * #1060: build a synchronous handler that stops a still-running dream and
   * records its cycle as 'interrupted'. It runs from close() and from a
   * process store closer, which runs before the shared database closes
   * (closers run newest first). Nothing of the dream is committed afterwards.
   */
  private createCycleInterrupter(
    cycle: DreamCycle,
    startTime: number,
    abort: AbortController,
  ): () => void {
    return () => {
      abort.abort();
      if (cycle.status !== 'running' || !this.db) return;
      cycle.status = 'interrupted';
      cycle.error = 'Interrupted: engine closed or process shut down during the dream cycle';
      cycle.endTime = new Date();
      cycle.durationMs = Date.now() - startTime;
      try {
        // #1253: a short wait only; if the database stays locked, the
        // abandoned-cycle sweep marks the cycle interrupted later.
        withBusyTimeout(this.db, DREAM_SHUTDOWN_LOCK_WAIT_MS, () => this.updateCycleSync(cycle));
      } catch {
        // Best effort during shutdown
      }
    };
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
   * Load real ADR-110 pattern-null (failure) data as 'error' concept nodes
   * (A8-EXT) — public wrapper for direct/test use; `ensureConceptsLoaded()`
   * calls this automatically from the real qe_pattern_nulls table.
   */
  async loadFailuresAsConcepts(failures: FailureImportData[]): Promise<number> {
    this.ensureInitialized();
    return this.graph!.loadFailuresAsErrors(failures);
  }

  /**
   * Load real qe_pattern_usage success data as 'outcome' concept nodes
   * (A8-EXT) — public wrapper for direct/test use; `ensureConceptsLoaded()`
   * calls this automatically from the real qe_pattern_usage table.
   */
  async loadSuccessesAsConcepts(successes: SuccessImportData[]): Promise<number> {
    this.ensureInitialized();
    return this.graph!.loadSuccessesAsOutcomes(successes);
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

    // A8-EXT follow-up fix: this refresh must NOT be gated behind the
    // "do we have enough concepts to dream at all" check below — on any
    // project that's run more than a handful of dream cycles,
    // `existing.length` permanently exceeds `minConceptsRequired`, so the
    // gate would make this whole block unreachable in real, automatic
    // operation forever (only reachable via the direct
    // loadFailuresAsConcepts()/loadSuccessesAsConcepts() test/manual
    // wrappers). Runs on every call instead: loadFailuresAsErrors() /
    // loadSuccessesAsOutcomes() are idempotent (synthetic
    // `error:<id>`/`outcome:<id>` keys), and each query is a single
    // indexed LIMIT-100 read, so refreshing every dream cycle is cheap.
    try {
      const failureRows = this.db!.prepare(
        `SELECT n.id as id, n.pattern_id as sourcePatternId, p.qe_domain as domain, n.failure_mode as failureMode
         FROM qe_pattern_nulls n
         JOIN qe_patterns p ON p.id = n.pattern_id
         ORDER BY n.updated_at DESC
         LIMIT 100`
      ).all() as FailureImportData[];
      if (failureRows.length > 0) {
        await this.graph!.loadFailuresAsErrors(failureRows);
      }

      const successRows = this.db!.prepare(
        `SELECT u.id as id, u.pattern_id as sourcePatternId, p.qe_domain as domain,
                ('Pattern "' || p.name || '" applied successfully') as description
         FROM qe_pattern_usage u
         JOIN qe_patterns p ON p.id = u.pattern_id
         WHERE u.success = 1
         ORDER BY u.created_at DESC
         LIMIT 100`
      ).all() as SuccessImportData[];
      if (successRows.length > 0) {
        await this.graph!.loadSuccessesAsOutcomes(successRows);
      }
    } catch (error) {
      if (process.env.DEBUG) {
        dreamLogger.debug('Error/outcome concept loading skipped', { error: toErrorMessage(error) });
      }
    }

    const existing = await this.graph!.getActiveNodes(0);
    if (existing.length >= this.config.minConceptsRequired) {
      return 0;
    }

    // Load patterns from qe_patterns table in the shared unified DB.
    // A8-EXT: the top-160-by-quality pool alone starves detectOptimizations —
    // quality_score already weights success_rate at 0.5, so the best-quality
    // patterns are, by construction, rarely the "room for improvement"
    // candidates that detector looks for. Union in a genuine low-performer
    // sample (bottom-40 by success_rate among confidence>=0.3 patterns) so
    // real optimization candidates actually reach the detector.
    const rows = this.db!.prepare(
      `SELECT * FROM (
         SELECT id, name, description, qe_domain as domain, pattern_type as patternType,
                confidence, success_rate as successRate
         FROM qe_patterns
         WHERE confidence >= 0.3
         ORDER BY quality_score DESC
         LIMIT 160
       )
       UNION
       SELECT * FROM (
         SELECT id, name, description, qe_domain as domain, pattern_type as patternType,
                confidence, success_rate as successRate
         FROM qe_patterns
         WHERE confidence >= 0.3 AND success_rate < 0.7
         ORDER BY usage_count DESC
         LIMIT 40
       )`
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

      // Create a REAL pattern in QEReasoningBank — this used to mint a fake
      // `dream-pattern-<uuid>` that never resolved to any qe_patterns row.
      // Single implementation shared with the MCP `apply` action (dream.ts)
      // and the scheduler's autoApplyInsights, both of which call this method
      // directly — no duplicate pattern-creation logic to drift out of sync.
      const { getSharedMemoryBackend } = await import('../../mcp/tools/base.js');
      const { createQEReasoningBank } = await import('../qe-reasoning-bank.js');

      const memoryBackend = await getSharedMemoryBackend();
      const reasoningBank = createQEReasoningBank(memoryBackend);
      await reasoningBank.initialize();

      // Wire RVF dual-writer (optional, best-effort — matches the prior
      // MCP-only implementation's parity with other pattern-creation paths).
      try {
        const { getSharedRvfDualWriter } = await import('../../integrations/ruvector/shared-rvf-dual-writer.js');
        const dualWriter = await getSharedRvfDualWriter();
        if (dualWriter) reasoningBank.setRvfDualWriter(dualWriter);
      } catch (e) {
        if (process.env.DEBUG) dreamLogger.debug('RVF wiring skipped', { error: toErrorMessage(e) });
      }

      let sourceConcepts: string[] = [];
      try {
        sourceConcepts = safeJsonParse<string[]>(insightRow.source_concepts);
      } catch {
        // Malformed source_concepts shouldn't block pattern creation.
      }
      const patternResult = await reasoningBank.storePattern({
        patternType: mapInsightTypeToPatternType(insightRow.insight_type),
        name: `Dream Insight: ${insightRow.insight_type}`,
        description: `${insightRow.description} (confidence: ${insightRow.confidence_score.toFixed(2)})`,
        template: {
          type: 'workflow',
          content: insightRow.suggested_action || insightRow.description,
          variables: [],
        },
        context: {
          tags: ['dream-generated', insightRow.insight_type, ...sourceConcepts.slice(0, 3)],
          complexity: 'medium',
        },
      });

      // COMMITTED_PENDING_INDEX proves the authoritative SQLite row exists;
      // only the derived vector index is pending (unbound or locked RVF).
      // The pattern is real, so the insight is applied — re-applying would
      // just hit the same row. Any other failure stays retryable.
      const pendingIndex =
        !patternResult.success &&
        patternResult.error instanceof PatternMutationError &&
        patternResult.error.disposition === 'COMMITTED_PENDING_INDEX'
          ? patternResult.error
          : null;

      if (!patternResult.success && !pendingIndex) {
        // Do NOT mark applied — leave it retryable rather than silently
        // swallowing a real pattern-creation failure behind a fake success.
        return {
          success: false,
          error: `Failed to create pattern: ${patternResult.error?.message ?? 'unknown error'}`,
        };
      }

      const patternId = patternResult.success ? patternResult.value.id : pendingIndex!.patternId;
      if (pendingIndex) {
        dreamLogger.warn('Insight applied; pattern committed with vector index pending', {
          insightId,
          patternId,
          cause: toErrorMessage(pendingIndex.cause),
        });
      }

      // Mark insight as applied — pattern_id now points at the REAL row.
      const stmt = this.db!.prepare(`
        UPDATE dream_insights
        SET applied = 1, pattern_id = ?
        WHERE id = ?
      `);
      stmt.run(patternId, insightId);

      return pendingIndex ? { success: true, patternId, indexPending: true } : { success: true, patternId };
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
   * #1060: number of cancelDream() calls so far. A caller that runs several
   * dreams in a row (SpeculativeDreamer) compares it to stop after a cancel.
   */
  get cancelCount(): number {
    return this.cancelRequests;
  }

  /**
   * Cancel the running dream cycle.
   */
  async cancelDream(): Promise<void> {
    this.cancelled = true;
    this.cancelRequests++;
    // #1060: stop the activation loop now; nothing of the dream is committed.
    this.activeAbort?.abort();
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

  private async saveCycle(cycle: DreamCycle, live: () => boolean): Promise<void> {
    if (!this.db) return;
    const db = this.db;

    const stmt = this.db.prepare(`
      INSERT INTO dream_cycles
      (id, start_time, end_time, duration_ms, concepts_processed, associations_found,
       insights_generated, status, error, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    await retryWhileBusy(db, () => stmt.run(
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
    ), { shouldContinue: live, cancelledError: () => new Error('Dream cycle cancelled') });
  }

  private updateCycleSync(cycle: DreamCycle): void {
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
   * @deprecated #1060: branching is ignored; always null.
   */
  getBranchManager(): null {
    return null;
  }

  /**
   * @deprecated #1060: branching is ignored, so no branch event is emitted.
   */
  onBranchEvent(listener: (event: string, branch: Branch, detail?: ValidationResult) => void): void {
    this.branchEventListeners.push(listener);
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Release resources (does NOT close the shared database)
   */
  async close(): Promise<void> {
    // #1060: stop a dream still in flight and record it as interrupted, then
    // wait (briefly) for it to unwind before letting go of the database.
    // A close counts as a cancel, so a caller running several dreams in a row
    // (SpeculativeDreamer) stops instead of committing an earlier result.
    this.closing = true;
    this.cancelRequests++;
    this.interruptActiveDream?.();
    this.interruptActiveDream = null;
    this.activeAbort?.abort();
    const inFlight = this.activeDream?.done;
    if (inFlight) {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([inFlight, new Promise((resolve) => { timer = setTimeout(resolve, 2000); })]);
      clearTimeout(timer);
    }

    if (this.graph) {
      await this.graph.close();
      this.graph = null;
    }

    this.db = null;
    this.persistence = null;
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

/**
 * Map a dream insight type to the closest QEPatternType. Shared by
 * DreamEngine.applyInsight — the single implementation used by both the
 * MCP `apply` action and the scheduler's auto-apply path.
 */
function mapInsightTypeToPatternType(insightType: string): QEPatternType {
  const mapping: Record<string, QEPatternType> = {
    'cross-domain': 'coverage-strategy',
    'novel-path': 'test-template',
    'cluster': 'refactor-safe',
    'high-activation': 'assertion-pattern',
    'bridge': 'mock-pattern',
  };
  return mapping[insightType] || 'test-template';
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
 * Create a new DreamEngine instance.
 * When useRVFPatternStore is enabled, auto-wires the RVF adapter for
 * COW branching (ADR-069) so callers don't need to set it manually.
 */
export function createDreamEngine(config?: Partial<DreamConfig>): DreamEngine {
  const engine = new DreamEngine(config);

  // ADR-069: Auto-wire RVF adapter from the shared singleton (M4 fix).
  // Uses the same adapter instance as the kernel to avoid dual file handles.
  // Dynamic import() for ESM compatibility — wiring resolves before
  // engine.initialize() is called since callers always await that.
  import('../../integrations/ruvector/feature-flags.js')
    .then(({ isRVFPatternStoreEnabled }) => {
      if (!isRVFPatternStoreEnabled()) return null;
      return import('../../integrations/ruvector/shared-rvf-adapter.js');
    })
    .then((mod) => {
      if (!mod) return;
      const adapter = mod.getSharedRvfAdapter();
      if (adapter) {
        engine.rvfAdapter = adapter;
      }
    })
    .catch(() => {
      // RVF adapter wiring is best-effort — DreamEngine works without it
    });

  return engine;
}

export default DreamEngine;
