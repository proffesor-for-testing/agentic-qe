/**
 * Cross-Phase Memory Service
 *
 * Implements persistent memory for QCSD cross-phase feedback loops.
 * Enables automated learning between phases.
 *
 * @module cross-phase-memory
 * @version 1.0.0
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import {
  CrossPhaseSignal,
  ProductionRiskSignal,
  SFDIPOTWeightSignal,
  TestHealthSignal,
  ACQualitySignal,
  CROSS_PHASE_NAMESPACES,
  SIGNAL_TTL,
  createSignalId,
  calculateExpiry,
  isSignalExpired,
  getNamespaceForLoop,
  FeedbackLoopType,
  CrossPhaseNamespace,
  RiskWeight,
  FactorWeight,
  FlakyPattern,
  UntestablePattern,
} from '../types/cross-phase-signals.js';

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_BASE_PATH = process.env.AGENTIC_QE_DATA_DIR || '.agentic-qe';

export interface CrossPhaseMemoryConfig {
  basePath: string;
  enablePersistence: boolean;
  cleanupOnInit: boolean;
}

const defaultConfig: CrossPhaseMemoryConfig = {
  basePath: DEFAULT_BASE_PATH,
  enablePersistence: true,
  cleanupOnInit: true,
};

// =============================================================================
// Cross-Phase Memory Service
// =============================================================================

export class CrossPhaseMemoryService {
  private config: CrossPhaseMemoryConfig;
  private initialized: boolean = false;

  constructor(config: Partial<CrossPhaseMemoryConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create all namespace directories
    for (const namespace of Object.values(CROSS_PHASE_NAMESPACES)) {
      const dir = this.getNamespacePath(namespace);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    // Cleanup expired signals if configured
    if (this.config.cleanupOnInit) {
      await this.cleanupExpired();
    }

    this.initialized = true;
    console.log('[CrossPhaseMemory] Initialized with namespaces:', Object.keys(CROSS_PHASE_NAMESPACES).length);
  }

  private getNamespacePath(namespace: CrossPhaseNamespace): string {
    return join(this.config.basePath, namespace);
  }

  private getSignalPath(namespace: CrossPhaseNamespace, signalId: string): string {
    return join(this.getNamespacePath(namespace), `${signalId}.json`);
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

    await this.store(CROSS_PHASE_NAMESPACES.DEFECT_WEIGHTS, signal);
    return signal;
  }

  async queryRiskSignals(): Promise<ProductionRiskSignal[]> {
    await this.ensureInitialized();
    const signals = await this.queryByNamespace<ProductionRiskSignal>(
      CROSS_PHASE_NAMESPACES.DEFECT_WEIGHTS
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

    await this.store(CROSS_PHASE_NAMESPACES.FAILURE_MODES, signal);
    return signal;
  }

  async querySFDIPOTSignals(featureContext?: string): Promise<SFDIPOTWeightSignal[]> {
    await this.ensureInitialized();
    let signals = await this.queryByNamespace<SFDIPOTWeightSignal>(
      CROSS_PHASE_NAMESPACES.FAILURE_MODES
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
    gateFailures: TestHealthSignal['gateFailures'],
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

    await this.store(CROSS_PHASE_NAMESPACES.FLAKY_TESTS, signal);
    return signal;
  }

  async queryTestHealthSignals(): Promise<TestHealthSignal[]> {
    await this.ensureInitialized();
    const signals = await this.queryByNamespace<TestHealthSignal>(
      CROSS_PHASE_NAMESPACES.FLAKY_TESTS
    );
    return signals.filter(s => !isSignalExpired(s));
  }

  // ---------------------------------------------------------------------------
  // Loop 4: Development → Grooming (Quality Criteria)
  // ---------------------------------------------------------------------------

  async storeACQualitySignal(
    untestablePatterns: UntestablePattern[],
    coverageGaps: ACQualitySignal['coverageGaps'],
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

    await this.store(CROSS_PHASE_NAMESPACES.AC_PROBLEMS, signal);
    return signal;
  }

  async queryACQualitySignals(): Promise<ACQualitySignal[]> {
    await this.ensureInitialized();
    const signals = await this.queryByNamespace<ACQualitySignal>(
      CROSS_PHASE_NAMESPACES.AC_PROBLEMS
    );
    return signals.filter(s => !isSignalExpired(s));
  }

  // ---------------------------------------------------------------------------
  // Generic Operations
  // ---------------------------------------------------------------------------

  async store<T extends CrossPhaseSignal>(namespace: CrossPhaseNamespace, signal: T): Promise<void> {
    if (!this.config.enablePersistence) {
      console.log(`[CrossPhaseMemory] Persistence disabled, signal ${signal.id} not stored`);
      return;
    }

    const path = this.getSignalPath(namespace, signal.id);
    const dir = dirname(path);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(path, JSON.stringify(signal, null, 2), 'utf-8');
    console.log(`[CrossPhaseMemory] Stored signal: ${signal.id} in ${namespace}`);
  }

  async queryByNamespace<T extends CrossPhaseSignal>(namespace: CrossPhaseNamespace): Promise<T[]> {
    const dir = this.getNamespacePath(namespace);

    if (!existsSync(dir)) {
      return [];
    }

    const files = readdirSync(dir).filter(f => f.endsWith('.json'));
    const signals: T[] = [];

    for (const file of files) {
      try {
        const content = readFileSync(join(dir, file), 'utf-8');
        signals.push(JSON.parse(content) as T);
      } catch (err) {
        console.warn(`[CrossPhaseMemory] Failed to read ${file}:`, err);
      }
    }

    // Sort by timestamp descending (newest first)
    return signals.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  async delete(namespace: CrossPhaseNamespace, signalId: string): Promise<boolean> {
    const path = this.getSignalPath(namespace, signalId);

    if (existsSync(path)) {
      unlinkSync(path);
      console.log(`[CrossPhaseMemory] Deleted signal: ${signalId}`);
      return true;
    }

    return false;
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

export function getCrossPhaseMemory(config?: Partial<CrossPhaseMemoryConfig>): CrossPhaseMemoryService {
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
