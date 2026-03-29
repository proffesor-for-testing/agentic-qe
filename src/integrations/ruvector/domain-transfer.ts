/**
 * Cross-Domain Transfer Learning Engine (Task 2.3, ADR-084)
 *
 * Enables knowledge transfer between QE domains using Thompson Sampling
 * with Beta priors, sqrt-dampening, transfer verification gates, domain
 * pair affinity scoring, coherence gate integration, and R7 meta-learning
 * enhancements (DecayingBeta, PlateauDetector, ParetoFront, CuriosityBonus).
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
import { CusumDetector } from './cusum-detector.js';

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
  /** Enable R7 meta-learning enhancements (ADR-087, Milestone 3) */
  useMetaLearningEnhancements: boolean;
}

/** Default domain transfer configuration */
export const DEFAULT_DOMAIN_TRANSFER_CONFIG: DomainTransferConfig = {
  minTransferProbability: 0.3,
  explorationWarmup: 5,
  verification: {},
  maxHistorySize: 1000,
  useMetaLearningEnhancements: true,
};

// --- R7 Meta-Learning Helpers (ADR-087, Milestone 3) ---

/** Point on the Pareto front, tracking multi-objective performance */
export interface ParetoPoint {
  pairKey: string;
  successRate: number;
  speed: number;
  confidence: number;
}

/** Applies time-based decay to Thompson Sampler exploration variance. */
export class DecayingBeta {
  constructor(private readonly decayThreshold = 100) {}

  /** Decay multiplier: 0.5^(successCount/threshold). 1.0 when count=0, 0.5 at threshold. */
  getDecayMultiplier(successCount: number): number {
    if (successCount <= 0) return 1.0;
    return Math.pow(0.5, successCount / this.decayThreshold);
  }

  /** Shrink sampled value toward mean by the decay multiplier. */
  applyDecay(sampled: number, mean: number, successCount: number): number {
    return mean + (sampled - mean) * this.getDecayMultiplier(successCount);
  }
}

/**
 * Detects when transfer success rate has plateaued using CUSUM (R2).
 *
 * Feeds a running success rate into a CusumDetector on the 'learn' gate.
 * Plateau is detected when CUSUM does NOT fire — i.e., the rate is
 * stationary (no drift in either direction) for enough samples.
 * CUSUM firing means the rate is changing, so NOT plateaued.
 */
export class PlateauDetector {
  private readonly cusum: CusumDetector;
  private readonly outcomes: boolean[] = [];
  private readonly windowSize: number;

  constructor(windowSize = 20) {
    this.windowSize = windowSize;
    // Low threshold + low slack = sensitive to any drift from mean.
    // If CUSUM doesn't fire after windowSize samples, rate is flat.
    // resetOnAlarm: false keeps the drift flag active so isPlateaued()
    // returns false for the rest of the window after a rate change.
    this.cusum = new CusumDetector({
      threshold: 3.0,
      slack: 0.1,
      resetOnAlarm: false,
      warmupSamples: Math.min(10, Math.floor(windowSize / 2)),
    });
  }

  record(success: boolean): void {
    this.outcomes.push(success);
    if (this.outcomes.length > this.windowSize * 2) {
      this.outcomes.splice(0, this.outcomes.length - this.windowSize * 2);
    }
    // Feed current success rate to CUSUM on the 'learn' gate
    const rate = this.getCurrentRate();
    this.cusum.update('learn', rate);
  }

  /**
   * Plateau = we have enough data AND CUSUM has not detected drift.
   * No drift means the rate is stationary — learning has stalled.
   */
  isPlateaued(): boolean {
    if (this.outcomes.length < this.windowSize) return false;
    const state = this.cusum.getState('learn');
    return !state.driftDetected;
  }

  getCurrentRate(): number {
    if (this.outcomes.length === 0) return 0;
    const recent = this.outcomes.slice(-this.windowSize);
    return recent.filter(Boolean).length / recent.length;
  }

  getOutcomeCount(): number { return this.outcomes.length; }

  /** Expose CUSUM state for observability */
  getCusumState() { return this.cusum.getState('learn'); }
}

/** Tracks Pareto-optimal transfer candidates across multiple objectives. */
export class ParetoFront {
  private readonly front: ParetoPoint[] = [];

  dominates(a: ParetoPoint, b: ParetoPoint): boolean {
    const geq = a.successRate >= b.successRate && a.speed >= b.speed && a.confidence >= b.confidence;
    const gt = a.successRate > b.successRate || a.speed > b.speed || a.confidence > b.confidence;
    return geq && gt;
  }

  add(point: ParetoPoint): void {
    for (let i = this.front.length - 1; i >= 0; i--) {
      if (this.dominates(point, this.front[i])) this.front.splice(i, 1);
    }
    if (!this.front.some(e => this.dominates(e, point))) this.front.push(point);
  }

  getFront(): ParetoPoint[] { return [...this.front]; }

  isNonDominated(point: ParetoPoint): boolean {
    return !this.front.some(e => this.dominates(e, point));
  }
}

/** Curiosity bonus for novel/untried source-target domain pairs. */
export class CuriosityBonus {
  private readonly triedPairs: Set<string> = new Set();
  constructor(private readonly bonusScale = 0.2) {}

  markTried(pairKey: string): void { this.triedPairs.add(pairKey); }
  isTried(pairKey: string): boolean { return this.triedPairs.has(pairKey); }
  getBonus(pairKey: string): number { return this.triedPairs.has(pairKey) ? 0 : this.bonusScale; }
  apply(sampledProbability: number, pairKey: string): number {
    return Math.min(1.0, sampledProbability + this.getBonus(pairKey));
  }
  getTriedCount(): number { return this.triedPairs.size; }
}

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

  // R7 Meta-Learning components (ADR-087, Milestone 3)
  private readonly decayingBeta: DecayingBeta;
  private readonly plateauDetector: PlateauDetector;
  private readonly paretoFront: ParetoFront;
  private readonly curiosityBonus: CuriosityBonus;

  constructor(config: Partial<DomainTransferConfig> = {}) {
    this.config = { ...DEFAULT_DOMAIN_TRANSFER_CONFIG, ...config };
    this.sampler = new ThompsonSampler();
    this.verifier = createTransferVerifier(this.config.verification);
    this.coherenceGate = createTransferCoherenceGate();
    this.decayingBeta = new DecayingBeta();
    this.plateauDetector = new PlateauDetector();
    this.paretoFront = new ParetoFront();
    this.curiosityBonus = new CuriosityBonus();
    this.tryLoadNativeModule();
  }

  /**
   * Evaluate whether a transfer between two domains should be attempted.
   * Uses Thompson Sampling to balance exploration and exploitation.
   * When meta-learning is enabled, applies DecayingBeta and CuriosityBonus.
   */
  evaluateTransfer(sourceDomain: string, targetDomain: string): TransferCandidate {
    if (!this.isEnabled()) {
      return this.createRejectedCandidate(sourceDomain, targetDomain);
    }

    const pairKey = this.makePairKey(sourceDomain, targetDomain);
    let sampledProbability = this.sampler.sample(pairKey);
    const observationCount = this.sampler.getObservationCount(pairKey);
    const isExploration = observationCount < this.config.explorationWarmup;
    const affinityScore = this.getAffinityScore(sourceDomain, targetDomain);

    if (this.isMetaLearningEnabled()) {
      // DecayingBeta: reduce exploration variance for well-known pairs
      const mean = this.sampler.getMean(pairKey);
      const successCount = this.sampler.getAlpha(pairKey) - 1; // subtract prior
      sampledProbability = this.decayingBeta.applyDecay(sampledProbability, mean, successCount);
      // CuriosityBonus: boost untried domain pairs
      sampledProbability = this.curiosityBonus.apply(sampledProbability, pairKey);
    }

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

    // Step 6b: Update meta-learning components
    if (this.isMetaLearningEnabled()) {
      this.plateauDetector.record(success);
      this.curiosityBonus.markTried(candidate.pairKey);
      const mean = this.sampler.getMean(candidate.pairKey);
      this.paretoFront.add({
        pairKey: candidate.pairKey,
        successRate: mean,
        speed: 1 / (1 + dampeningFactor), // inverse dampening as speed proxy
        confidence: this.getAffinityScore(candidate.sourceDomain, candidate.targetDomain),
      });
    }

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

  /** Get the DecayingBeta component (for testing). */
  getDecayingBeta(): DecayingBeta { return this.decayingBeta; }

  /** Get the PlateauDetector component (for testing). */
  getPlateauDetector(): PlateauDetector { return this.plateauDetector; }

  /** Get the ParetoFront component (for testing). */
  getParetoFront(): ParetoFront { return this.paretoFront; }

  /** Get the CuriosityBonus component (for testing). */
  getCuriosityBonus(): CuriosityBonus { return this.curiosityBonus; }

  /** Check if learning has plateaued */
  isLearningPlateaued(): boolean { return this.plateauDetector.isPlateaued(); }

  // --- Private Helpers ---

  private isEnabled(): boolean {
    return getRuVectorFeatureFlags().useCrossDomainTransfer === true;
  }

  private isMetaLearningEnabled(): boolean {
    // Check both the engine config AND the system-wide feature flag.
    // Either one being false disables meta-learning.
    return this.config.useMetaLearningEnhancements === true
      && getRuVectorFeatureFlags().useMetaLearningEnhancements !== false;
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
