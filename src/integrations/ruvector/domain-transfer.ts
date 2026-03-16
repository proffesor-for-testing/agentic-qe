/**
 * Cross-Domain Transfer Learning Engine (Task 2.3, ADR-084)
 *
 * Enables knowledge transfer between QE domains using Thompson Sampling
 * with Beta priors, sqrt-dampening, transfer verification gates, domain
 * pair affinity scoring, and coherence gate integration.
 *
 * @module integrations/ruvector/domain-transfer
 */

import { LoggerFactory } from '../../logging/index.js';
import type { ITransferCoherenceGate, CoherenceValidation } from './transfer-coherence-stub.js';
import { createTransferCoherenceGate } from './transfer-coherence-stub.js';
import {
  TransferVerifier, createTransferVerifier,
  type DomainPerformanceSnapshot, type TransferResultForVerification,
  type VerificationResult, type TransferVerificationConfig,
} from './transfer-verification.js';
import { getRuVectorFeatureFlags } from './feature-flags.js';
import { ThompsonSampler } from './thompson-sampler.js';

export { ThompsonSampler } from './thompson-sampler.js';

const logger = LoggerFactory.create('domain-transfer');

// ============================================================================
// Types
// ============================================================================

/** Candidate for a cross-domain transfer */
export interface TransferCandidate {
  sourceDomain: string;
  targetDomain: string;
  /** Thompson-sampled probability of success */
  sampledProbability: number;
  affinityScore: number;
  /** Whether this candidate was selected for exploration (vs exploitation) */
  isExploration: boolean;
  /** Domain pair key (e.g., "test-generation->coverage-analysis") */
  pairKey: string;
}

/** Result of executing a transfer */
export interface TransferResult {
  transferId: string;
  candidate: TransferCandidate;
  success: boolean;
  /** Dampening factor applied (sqrt-dampening) */
  dampeningFactor: number;
  verification: VerificationResult;
  coherenceResult: CoherenceValidation;
  sourcePerformanceBefore: DomainPerformanceSnapshot;
  sourcePerformanceAfter: DomainPerformanceSnapshot;
  targetPerformanceBefore: DomainPerformanceSnapshot;
  targetPerformanceAfter: DomainPerformanceSnapshot;
  timestamp: number;
}

/** Record of a past transfer for history tracking */
export interface TransferRecord {
  transferId: string;
  sourceDomain: string;
  targetDomain: string;
  success: boolean;
  sampledProbability: number;
  dampeningFactor: number;
  sourceDelta: number;
  targetDelta: number;
  timestamp: number;
}

/** Configuration for the domain transfer engine */
export interface DomainTransferConfig {
  /** Minimum Thompson sample probability to attempt a transfer */
  minTransferProbability: number;
  /** Number of initial explorations before Thompson kicks in */
  explorationWarmup: number;
  verification: Partial<TransferVerificationConfig>;
  /** Maximum transfer records to retain in history */
  maxHistorySize: number;
}

/** Default domain transfer configuration */
export const DEFAULT_DOMAIN_TRANSFER_CONFIG: DomainTransferConfig = {
  minTransferProbability: 0.3,
  explorationWarmup: 5,
  verification: {},
  maxHistorySize: 1000,
};

// ============================================================================
// Domain Transfer Engine
// ============================================================================

/**
 * Cross-domain transfer learning engine. Moves learned patterns between QE
 * domains using Thompson Sampling, sqrt-dampening, and a double verification gate.
 */
export class DomainTransferEngine {
  private readonly config: DomainTransferConfig;
  private readonly sampler: ThompsonSampler;
  private readonly verifier: TransferVerifier;
  private readonly coherenceGate: ITransferCoherenceGate;
  private readonly transferHistory: TransferRecord[] = [];
  private readonly affinityScores: Map<string, number> = new Map();
  private performanceProvider: ((domain: string) => DomainPerformanceSnapshot) | null = null;
  private transferExecutor: ((source: string, target: string, dampening: number) => boolean) | null = null;
  private nativeModule: unknown = null;

  constructor(config: Partial<DomainTransferConfig> = {}) {
    this.config = { ...DEFAULT_DOMAIN_TRANSFER_CONFIG, ...config };
    this.sampler = new ThompsonSampler();
    this.verifier = createTransferVerifier(this.config.verification);
    this.coherenceGate = createTransferCoherenceGate();
    this.tryLoadNativeModule();
  }

  /**
   * Evaluate whether a transfer between two domains should be attempted.
   * Uses Thompson Sampling to balance exploration and exploitation.
   */
  evaluateTransfer(sourceDomain: string, targetDomain: string): TransferCandidate {
    if (!this.isEnabled()) {
      return this.createRejectedCandidate(sourceDomain, targetDomain);
    }

    const pairKey = this.makePairKey(sourceDomain, targetDomain);
    const sampledProbability = this.sampler.sample(pairKey);
    const observationCount = this.sampler.getObservationCount(pairKey);
    const isExploration = observationCount < this.config.explorationWarmup;
    const affinityScore = this.getAffinityScore(sourceDomain, targetDomain);

    return { sourceDomain, targetDomain, sampledProbability, affinityScore, isExploration, pairKey };
  }

  /**
   * Execute a cross-domain transfer through the full pipeline:
   * coherence gate -> snapshot before -> sqrt-dampen & execute ->
   * snapshot after -> verify -> update sampler & affinity.
   */
  executeTransfer(candidate: TransferCandidate): TransferResult {
    const transferId = `transfer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Step 1: Coherence gate
    const coherenceResult = this.coherenceGate.validateTransfer(
      { domain: candidate.sourceDomain }, candidate.targetDomain,
    );
    if (!coherenceResult.approved) {
      logger.info('Transfer blocked by coherence gate', {
        transferId, source: candidate.sourceDomain,
        target: candidate.targetDomain, reason: coherenceResult.rejectionReason,
      });
      return this.createBlockedResult(transferId, candidate, coherenceResult);
    }

    // Step 2-4: Snapshot, execute, snapshot
    const sourcePerformanceBefore = this.getPerformanceSnapshot(candidate.sourceDomain);
    const targetPerformanceBefore = this.getPerformanceSnapshot(candidate.targetDomain);
    const dampeningFactor = this.computeSqrtDampening(candidate);
    const transferSuccess = this.doTransfer(candidate.sourceDomain, candidate.targetDomain, dampeningFactor);
    const sourcePerformanceAfter = this.getPerformanceSnapshot(candidate.sourceDomain);
    const targetPerformanceAfter = this.getPerformanceSnapshot(candidate.targetDomain);

    // Step 5: Verify
    const verification = this.verifier.verifyTransfer({
      transferId, sourceDomain: candidate.sourceDomain, targetDomain: candidate.targetDomain,
      sourcePerformanceBefore, sourcePerformanceAfter,
      targetPerformanceBefore, targetPerformanceAfter,
    });
    const success = transferSuccess && verification.passed;

    // Step 6: Update Thompson Sampling and affinity
    this.sampler.update(candidate.pairKey, success);
    this.updateAffinityScore(candidate.pairKey, success);

    this.addToHistory({
      transferId, sourceDomain: candidate.sourceDomain, targetDomain: candidate.targetDomain,
      success, sampledProbability: candidate.sampledProbability, dampeningFactor,
      sourceDelta: verification.sourceDelta, targetDelta: verification.targetDelta,
      timestamp: Date.now(),
    });

    logger.info('Transfer completed', {
      transferId, source: candidate.sourceDomain, target: candidate.targetDomain,
      success, dampeningFactor: dampeningFactor.toFixed(4),
      sourceDelta: verification.sourceDelta.toFixed(4),
      targetDelta: verification.targetDelta.toFixed(4),
    });

    return {
      transferId, candidate, success, dampeningFactor, verification, coherenceResult,
      sourcePerformanceBefore, sourcePerformanceAfter,
      targetPerformanceBefore, targetPerformanceAfter,
      timestamp: Date.now(),
    };
  }

  /** Get the affinity score for a domain pair (0-1, default 0.5). */
  getAffinityScore(source: string, target: string): number {
    return this.affinityScores.get(this.makePairKey(source, target)) ?? 0.5;
  }

  /** Get the full transfer history. */
  getTransferHistory(): TransferRecord[] {
    return [...this.transferHistory];
  }

  /** Get the Thompson Sampler's mean success probability for a domain pair. */
  getExpectedSuccessRate(source: string, target: string): number {
    return this.sampler.getMean(this.makePairKey(source, target));
  }

  /** Get the total number of observations for a domain pair. */
  getObservationCount(source: string, target: string): number {
    return this.sampler.getObservationCount(this.makePairKey(source, target));
  }

  /** Inject a performance provider for testing or custom integration. */
  setPerformanceProvider(provider: (domain: string) => DomainPerformanceSnapshot): void {
    this.performanceProvider = provider;
  }

  /** Inject a transfer executor for testing or custom integration. */
  setTransferExecutor(executor: (source: string, target: string, dampening: number) => boolean): void {
    this.transferExecutor = executor;
  }

  /** Get the Thompson Sampler (for testing). */
  getSampler(): ThompsonSampler { return this.sampler; }

  /** Get the coherence gate (for testing). */
  getCoherenceGate(): ITransferCoherenceGate { return this.coherenceGate; }

  // --- Private Helpers ---

  private isEnabled(): boolean {
    return getRuVectorFeatureFlags().useCrossDomainTransfer === true;
  }

  private makePairKey(source: string, target: string): string {
    return `${source}->${target}`;
  }

  /**
   * Sqrt-dampening: sqrt(observations / (observations + warmup)).
   * New pairs -> ~0 (conservative), proven pairs -> ~1 (full strength).
   */
  private computeSqrtDampening(candidate: TransferCandidate): number {
    const obs = this.sampler.getObservationCount(candidate.pairKey);
    return Math.sqrt(obs / (obs + this.config.explorationWarmup));
  }

  private doTransfer(source: string, target: string, dampening: number): boolean {
    if (this.transferExecutor) return this.transferExecutor(source, target, dampening);
    return true;
  }

  private getPerformanceSnapshot(domain: string): DomainPerformanceSnapshot {
    if (this.performanceProvider) return this.performanceProvider(domain);
    return { domain, successRate: 0.5, avgConfidence: 0.5, patternCount: 0, timestamp: Date.now() };
  }

  /** EMA update (alpha=0.2) for affinity score */
  private updateAffinityScore(pairKey: string, success: boolean): void {
    const current = this.affinityScores.get(pairKey) ?? 0.5;
    this.affinityScores.set(pairKey, 0.2 * (success ? 1 : 0) + 0.8 * current);
  }

  private addToHistory(record: TransferRecord): void {
    this.transferHistory.push(record);
    while (this.transferHistory.length > this.config.maxHistorySize) {
      this.transferHistory.shift();
    }
  }

  private createBlockedResult(
    transferId: string, candidate: TransferCandidate, coherenceResult: CoherenceValidation,
  ): TransferResult {
    const empty: DomainPerformanceSnapshot = {
      domain: '', successRate: 0, avgConfidence: 0, patternCount: 0, timestamp: Date.now(),
    };
    return {
      transferId, candidate, success: false, dampeningFactor: 0,
      verification: {
        passed: false, sourceStable: false, targetImproved: false,
        sourceDelta: 0, targetDelta: 0, sourceConfidenceDelta: 0, targetConfidenceDelta: 0,
        failureReason: `Coherence gate rejected: ${coherenceResult.rejectionReason ?? 'unknown'}`,
      },
      coherenceResult,
      sourcePerformanceBefore: { ...empty, domain: candidate.sourceDomain },
      sourcePerformanceAfter: { ...empty, domain: candidate.sourceDomain },
      targetPerformanceBefore: { ...empty, domain: candidate.targetDomain },
      targetPerformanceAfter: { ...empty, domain: candidate.targetDomain },
      timestamp: Date.now(),
    };
  }

  private createRejectedCandidate(sourceDomain: string, targetDomain: string): TransferCandidate {
    return {
      sourceDomain, targetDomain, sampledProbability: 0,
      affinityScore: 0, isExploration: false,
      pairKey: this.makePairKey(sourceDomain, targetDomain),
    };
  }

  /**
   * Check for native domain transfer module.
   * No native package exists — Thompson Sampling works well in TypeScript.
   */
  private tryLoadNativeModule(): void {
    this.nativeModule = null;
  }
}

// ============================================================================
// Factory
// ============================================================================

/** Create a DomainTransferEngine with the given configuration. */
export function createDomainTransferEngine(
  config?: Partial<DomainTransferConfig>,
): DomainTransferEngine {
  return new DomainTransferEngine(config);
}
