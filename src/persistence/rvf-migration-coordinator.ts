/**
 * RVF Migration Coordinator (ADR-072 Phase 3)
 *
 * Wires together RvfMigrationAdapter, RvfConsistencyValidator, and
 * RvfStageGate into a single service that can be initialized during
 * kernel boot and exposed via MCP tools.
 *
 * Lifecycle:
 *   1. Kernel calls RvfMigrationCoordinator.initialize(db)
 *   2. Coordinator reads stage from feature flags, attaches SQLite + RVF handles
 *   3. MCP tools call getStatus(), runConsistencyCheck(), promote()
 *
 * @module persistence/rvf-migration-coordinator
 */

import { RvfMigrationAdapter, type MigrationStage, type MigrationMetrics, STAGE_NAMES } from './rvf-migration-adapter.js';
import { RvfConsistencyValidator, type ConsistencyCheckResult } from './rvf-consistency-validator.js';
import { RvfStageGate, type StageGateResult } from './rvf-stage-gate.js';

// ============================================================================
// Types
// ============================================================================

export interface MigrationStatus {
  stage: MigrationStage;
  stageName: string;
  metrics: MigrationMetrics;
  consistencyHistory: {
    totalChecks: number;
    rollingDivergenceRate: number;
    lastCheck: ConsistencyCheckResult | null;
  };
  gateEvaluation: StageGateResult;
  engineStatus: {
    sqliteVectorCount: number;
    rvfAvailable: boolean;
    rvfVectorCount: number | null;
    rvfDeadSpaceRatio: number | null;
  };
}

export interface MigrationCoordinatorConfig {
  /** Override migration stage (otherwise reads from feature flags) */
  stage?: MigrationStage;
  /** RVF file path */
  rvfPath?: string;
  /** Vector dimensions */
  dimensions?: number;
}

// ============================================================================
// Singleton
// ============================================================================

let instance: RvfMigrationCoordinator | null = null;

// ============================================================================
// RvfMigrationCoordinator
// ============================================================================

export class RvfMigrationCoordinator {
  private adapter: RvfMigrationAdapter;
  private validator: RvfConsistencyValidator;
  private gate: RvfStageGate;
  private currentStage: MigrationStage;
  private initialized = false;

  constructor(config?: MigrationCoordinatorConfig) {
    // Stage is set synchronously from config or default.
    // Feature flags are read asynchronously in initialize().
    this.currentStage = config?.stage ?? 1;

    this.adapter = new RvfMigrationAdapter({
      stage: this.currentStage,
      rvfPath: config?.rvfPath ?? '.agentic-qe/patterns.rvf',
      dimensions: config?.dimensions ?? 384,
      enableFallback: true,
    });

    this.validator = new RvfConsistencyValidator({
      sampleSize: 50,
      windowDurationMs: 7 * 24 * 60 * 60 * 1000, // 7 days
      compactionThreshold: 0.3,
      scoreTolerance: 0.05,
    });

    this.gate = new RvfStageGate({
      minChecksRequired: 10,
    });
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  /**
   * Attach the real SQLite database handle (from UnifiedMemoryManager).
   * Called during kernel boot.
   */
  attachSqliteDb(db: unknown): void {
    this.adapter.setSqliteDb(db as any);
    this.validator.setSqliteDb(db as any);
  }

  /**
   * Attach the shared RVF store (from shared-rvf-adapter singleton).
   * Called during kernel boot when native bindings are available.
   */
  attachRvfStore(store: unknown): void {
    this.adapter.setRvfStore(store as any);
    this.validator.setRvfStore(store as any);
  }

  /**
   * Attach a witness chain for audit trail of stage promotions.
   */
  attachWitnessChain(wc: unknown): void {
    this.gate.setWitnessChain(wc as any);
  }

  /**
   * Full initialization: reads handles from running system.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Read stage from feature flags (async import for ESM compatibility)
    if (this.currentStage === 1) {
      try {
        const { getRvfMigrationStage } = await import('../integrations/ruvector/feature-flags.js');
        const flagStage = getRvfMigrationStage();
        this.currentStage = flagStage;
        this.adapter.setStage(flagStage);
      } catch {
        // Feature flags unavailable — keep constructor default
      }
    }

    // Try to get SQLite handle from UnifiedMemoryManager
    try {
      const { UnifiedMemoryManager } = await import('../kernel/unified-memory.js');
      const umm = UnifiedMemoryManager.getInstance();
      await umm.initialize();
      const db = umm.getDatabase();
      if (db) this.attachSqliteDb(db);
    } catch {
      // UMM unavailable — adapter works without it (read/write ops return empty)
    }

    // Try to get shared RVF adapter
    try {
      const { getSharedRvfAdapter } = await import('../integrations/ruvector/shared-rvf-adapter.js');
      const adapter = getSharedRvfAdapter();
      if (adapter) this.attachRvfStore(adapter);
    } catch {
      // RVF native unavailable — adapter works without it
    }

    // Try to attach witness chain
    try {
      const { WitnessChain } = await import('../audit/witness-chain.js');
      const wc = new WitnessChain();
      await wc.initialize();
      this.attachWitnessChain(wc);
    } catch {
      // Witness chain is optional
    }

    this.initialized = true;
  }

  // --------------------------------------------------------------------------
  // User-Facing Operations
  // --------------------------------------------------------------------------

  /**
   * Get comprehensive migration status.
   * This is the primary user-facing method — shows stage, metrics,
   * consistency history, and gate evaluation at a glance.
   */
  getStatus(): MigrationStatus {
    const metrics = this.adapter.getMetrics();
    const engineStatus = this.adapter.status();
    const history = this.validator.getHistory();
    const gateEvaluation = this.gate.evaluate(
      this.currentStage,
      this.validator,
      metrics,
    );

    return {
      stage: this.currentStage,
      stageName: STAGE_NAMES[this.currentStage],
      metrics,
      consistencyHistory: {
        totalChecks: this.validator.getCheckCount(),
        rollingDivergenceRate: this.validator.getRollingDivergenceRate(),
        lastCheck: history.length > 0 ? history[history.length - 1] : null,
      },
      gateEvaluation,
      engineStatus: {
        sqliteVectorCount: engineStatus.sqlite.vectorCount,
        rvfAvailable: engineStatus.rvf !== null,
        rvfVectorCount: engineStatus.rvf?.totalVectors ?? null,
        rvfDeadSpaceRatio: (engineStatus.rvf as any)?.deadSpaceRatio ?? null,
      },
    };
  }

  /**
   * Run a consistency check between SQLite and RVF.
   * Returns the check result with divergence details.
   */
  runConsistencyCheck(): ConsistencyCheckResult {
    return this.validator.runCheck();
  }

  /**
   * Evaluate whether promotion to the next stage is allowed.
   */
  evaluateGate(): StageGateResult {
    return this.gate.evaluate(
      this.currentStage,
      this.validator,
      this.adapter.getMetrics(),
    );
  }

  /**
   * Attempt to promote to the next migration stage.
   *
   * @param force - Skip gate checks (records forced promotion in witness chain)
   * @returns Promotion result with new stage
   */
  promote(force = false): {
    promoted: boolean;
    previousStage: MigrationStage;
    newStage: MigrationStage;
    result: StageGateResult;
  } {
    const previousStage = this.currentStage;
    const { promoted, newStage, result } = this.gate.promote(
      this.currentStage,
      this.validator,
      this.adapter.getMetrics(),
      force,
    );

    if (promoted) {
      this.currentStage = newStage;
      // Propagate to adapter so write/read routing uses the new stage
      this.adapter.setStage(newStage);
      // Note: The feature flag default is NOT mutated at runtime.
      // The new stage is active for this process lifetime. To persist
      // the promotion, update rvfMigrationStage in feature-flags.ts.
    }

    return { promoted, previousStage, newStage, result };
  }

  /**
   * Write a vector through the migration adapter.
   * Used to verify dual-write routing at each stage.
   */
  write(id: string, vector: Float32Array | number[]) {
    return this.adapter.write(id, vector);
  }

  /**
   * Search through the migration adapter.
   * Used to verify read routing at each stage.
   */
  search(query: Float32Array | number[], k: number) {
    return this.adapter.search(query, k);
  }

  /**
   * Get the underlying adapter (for advanced use / testing).
   */
  getAdapter(): RvfMigrationAdapter {
    return this.adapter;
  }

  // --------------------------------------------------------------------------
  // Singleton
  // --------------------------------------------------------------------------

  static getInstance(config?: MigrationCoordinatorConfig): RvfMigrationCoordinator {
    if (!instance) {
      instance = new RvfMigrationCoordinator(config);
    }
    return instance;
  }

  static resetInstance(): void {
    instance = null;
  }
}
