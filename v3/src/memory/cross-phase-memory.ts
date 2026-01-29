/**
 * Cross-Phase Memory Service
 *
 * Implements persistent memory for QCSD cross-phase feedback loops.
 * Uses UnifiedMemoryManager (SQLite) for storage instead of file-based JSON.
 *
 * @module cross-phase-memory
 * @version 2.0.0
 */

import {
  UnifiedMemoryManager,
  getUnifiedMemory,
} from '../kernel/unified-memory.js';
import {
  CrossPhaseSignal,
  ProductionRiskSignal,
  SFDIPOTWeightSignal,
  TestHealthSignal,
  ACQualitySignal,
  SIGNAL_TTL,
  createSignalId,
  calculateExpiry,
  isSignalExpired,
  FeedbackLoopType,
  RiskWeight,
  FactorWeight,
  FlakyPattern,
  UntestablePattern,
  GateFailure,
  CoverageGap,
} from '../types/cross-phase-signals.js';

// =============================================================================
// Namespace Constants (stored in UnifiedMemory)
// =============================================================================

export const CROSS_PHASE_NAMESPACES = {
  STRATEGIC: 'qcsd/strategic',
  TACTICAL: 'qcsd/tactical',
  OPERATIONAL: 'qcsd/operational',
  QUALITY_CRITERIA: 'qcsd/quality-criteria',
} as const;

export type CrossPhaseNamespace = typeof CROSS_PHASE_NAMESPACES[keyof typeof CROSS_PHASE_NAMESPACES];

// =============================================================================
// Configuration
// =============================================================================

export interface CrossPhaseMemoryConfig {
  /** Custom UnifiedMemoryManager instance (for testing) */
  memoryManager?: UnifiedMemoryManager;
}

// =============================================================================
// Cross-Phase Memory Service
// =============================================================================

export class CrossPhaseMemoryService {
  private memory: UnifiedMemoryManager;
  private initialized: boolean = false;

  constructor(config: CrossPhaseMemoryConfig = {}) {
    this.memory = config.memoryManager || getUnifiedMemory();
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.memory.initialize();
    this.initialized = true;
    console.log('[CrossPhaseMemory] Initialized with UnifiedMemoryManager');
  }

  // ---------------------------------------------------------------------------
  // Loop 1: Production → Ideation (Strategic)
  // ---------------------------------------------------------------------------

  async storeRiskSignal(
    riskWeights: RiskWeight[],
    recommendations: ProductionRiskSignal['recommendations']
  ): Promise<ProductionRiskSignal> {
    await this.ensureInitialized();

    const signal: ProductionRiskSignal = {
      id: createSignalId('strategic', 'risk'),
      timestamp: new Date().toISOString(),
      source: 'production',
      target: 'ideation',
      loopType: 'strategic',
      version: '1.0.0',
      expiresAt: calculateExpiry(SIGNAL_TTL.RISK_WEIGHTS),
      riskWeights,
      recommendations,
    };

    await this.store(CROSS_PHASE_NAMESPACES.STRATEGIC, signal);
    return signal;
  }

  async queryRiskSignals(): Promise<ProductionRiskSignal[]> {
    await this.ensureInitialized();
    const signals = await this.queryByNamespace<ProductionRiskSignal>(
      CROSS_PHASE_NAMESPACES.STRATEGIC
    );
    return signals.filter(s => !isSignalExpired(s));
  }

  // ---------------------------------------------------------------------------
  // Loop 2: Production → Grooming (Tactical)
  // ---------------------------------------------------------------------------

  async storeSFDIPOTSignal(
    factorWeights: FactorWeight[],
    featureContext: string,
    recommendations: SFDIPOTWeightSignal['recommendations']
  ): Promise<SFDIPOTWeightSignal> {
    await this.ensureInitialized();

    const signal: SFDIPOTWeightSignal = {
      id: createSignalId('tactical', 'sfdipot'),
      timestamp: new Date().toISOString(),
      source: 'production',
      target: 'grooming',
      loopType: 'tactical',
      version: '1.0.0',
      expiresAt: calculateExpiry(SIGNAL_TTL.SFDIPOT_WEIGHTS),
      factorWeights,
      featureContext,
      recommendations,
    };

    await this.store(CROSS_PHASE_NAMESPACES.TACTICAL, signal);
    return signal;
  }

  async querySFDIPOTSignals(featureContext?: string): Promise<SFDIPOTWeightSignal[]> {
    await this.ensureInitialized();
    let signals = await this.queryByNamespace<SFDIPOTWeightSignal>(
      CROSS_PHASE_NAMESPACES.TACTICAL
    );
    signals = signals.filter(s => !isSignalExpired(s));

    if (featureContext) {
      signals = signals.filter(s =>
        s.featureContext.toLowerCase().includes(featureContext.toLowerCase())
      );
    }

    return signals;
  }

  // ---------------------------------------------------------------------------
  // Loop 3: CI/CD → Development (Operational)
  // ---------------------------------------------------------------------------

  async storeTestHealthSignal(
    flakyPatterns: FlakyPattern[],
    gateFailures: GateFailure[],
    recommendations: TestHealthSignal['recommendations']
  ): Promise<TestHealthSignal> {
    await this.ensureInitialized();

    const signal: TestHealthSignal = {
      id: createSignalId('operational', 'test-health'),
      timestamp: new Date().toISOString(),
      source: 'cicd',
      target: 'development',
      loopType: 'operational',
      version: '1.0.0',
      expiresAt: calculateExpiry(SIGNAL_TTL.FLAKY_PATTERNS),
      flakyPatterns,
      gateFailures,
      recommendations,
    };

    await this.store(CROSS_PHASE_NAMESPACES.OPERATIONAL, signal);
    return signal;
  }

  async queryTestHealthSignals(): Promise<TestHealthSignal[]> {
    await this.ensureInitialized();
    const signals = await this.queryByNamespace<TestHealthSignal>(
      CROSS_PHASE_NAMESPACES.OPERATIONAL
    );
    return signals.filter(s => !isSignalExpired(s));
  }

  // ---------------------------------------------------------------------------
  // Loop 4: Development → Grooming (Quality Criteria)
  // ---------------------------------------------------------------------------

  async storeACQualitySignal(
    untestablePatterns: UntestablePattern[],
    coverageGaps: CoverageGap[],
    recommendations: ACQualitySignal['recommendations']
  ): Promise<ACQualitySignal> {
    await this.ensureInitialized();

    const signal: ACQualitySignal = {
      id: createSignalId('quality-criteria', 'ac-quality'),
      timestamp: new Date().toISOString(),
      source: 'development',
      target: 'grooming',
      loopType: 'quality-criteria',
      version: '1.0.0',
      expiresAt: calculateExpiry(SIGNAL_TTL.AC_QUALITY),
      untestablePatterns,
      coverageGaps,
      recommendations,
    };

    await this.store(CROSS_PHASE_NAMESPACES.QUALITY_CRITERIA, signal);
    return signal;
  }

  async queryACQualitySignals(): Promise<ACQualitySignal[]> {
    await this.ensureInitialized();
    const signals = await this.queryByNamespace<ACQualitySignal>(
      CROSS_PHASE_NAMESPACES.QUALITY_CRITERIA
    );
    return signals.filter(s => !isSignalExpired(s));
  }

  // ---------------------------------------------------------------------------
  // Generic Operations
  // ---------------------------------------------------------------------------

  async store<T extends CrossPhaseSignal>(namespace: CrossPhaseNamespace, signal: T): Promise<void> {
    // Calculate TTL in seconds for UnifiedMemoryManager
    const expiresAtMs = new Date(signal.expiresAt).getTime();
    const ttlSeconds = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));

    await this.memory.kvSet(signal.id, signal, namespace, ttlSeconds > 0 ? ttlSeconds : undefined);
    console.log(`[CrossPhaseMemory] Stored signal: ${signal.id} in ${namespace}`);
  }

  async queryByNamespace<T extends CrossPhaseSignal>(namespace: CrossPhaseNamespace): Promise<T[]> {
    // Search for all keys in this namespace
    const keys = await this.memory.kvSearch('*', namespace, 1000);
    const signals: T[] = [];

    for (const key of keys) {
      const signal = await this.memory.kvGet<T>(key, namespace);
      if (signal) {
        signals.push(signal);
      }
    }

    // Sort by timestamp descending (newest first)
    return signals.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  async delete(namespace: CrossPhaseNamespace, signalId: string): Promise<boolean> {
    const deleted = await this.memory.kvDelete(signalId, namespace);
    if (deleted) {
      console.log(`[CrossPhaseMemory] Deleted signal: ${signalId}`);
    }
    return deleted;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  async cleanupExpired(): Promise<{ deleted: number; namespaces: Record<string, number> }> {
    const result = {
      deleted: 0,
      namespaces: {} as Record<string, number>,
    };

    for (const namespace of Object.values(CROSS_PHASE_NAMESPACES)) {
      const signals = await this.queryByNamespace(namespace);
      let deletedInNamespace = 0;

      for (const signal of signals) {
        if (isSignalExpired(signal)) {
          await this.delete(namespace, signal.id);
          deletedInNamespace++;
          result.deleted++;
        }
      }

      if (deletedInNamespace > 0) {
        result.namespaces[namespace] = deletedInNamespace;
      }
    }

    if (result.deleted > 0) {
      console.log(`[CrossPhaseMemory] Cleanup: deleted ${result.deleted} expired signals`);
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  async getStats(): Promise<{
    totalSignals: number;
    byLoop: Record<FeedbackLoopType, number>;
    byNamespace: Record<string, number>;
    oldestSignal: string | null;
    newestSignal: string | null;
  }> {
    await this.ensureInitialized();

    const stats = {
      totalSignals: 0,
      byLoop: {
        strategic: 0,
        tactical: 0,
        operational: 0,
        'quality-criteria': 0,
      } as Record<FeedbackLoopType, number>,
      byNamespace: {} as Record<string, number>,
      oldestSignal: null as string | null,
      newestSignal: null as string | null,
    };

    let oldest: Date | null = null;
    let newest: Date | null = null;

    for (const namespace of Object.values(CROSS_PHASE_NAMESPACES)) {
      const signals = await this.queryByNamespace(namespace);
      const activeSignals = signals.filter(s => !isSignalExpired(s));

      stats.byNamespace[namespace] = activeSignals.length;
      stats.totalSignals += activeSignals.length;

      for (const signal of activeSignals) {
        stats.byLoop[signal.loopType]++;

        const timestamp = new Date(signal.timestamp);
        if (!oldest || timestamp < oldest) {
          oldest = timestamp;
          stats.oldestSignal = signal.timestamp;
        }
        if (!newest || timestamp > newest) {
          newest = timestamp;
          stats.newestSignal = signal.timestamp;
        }
      }
    }

    return stats;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: CrossPhaseMemoryService | null = null;

export function getCrossPhaseMemory(config?: CrossPhaseMemoryConfig): CrossPhaseMemoryService {
  if (!instance) {
    instance = new CrossPhaseMemoryService(config);
  }
  return instance;
}

export function resetCrossPhaseMemory(): void {
  instance = null;
}

// =============================================================================
// Exports
// =============================================================================

export default CrossPhaseMemoryService;
