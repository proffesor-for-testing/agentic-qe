/**
 * Coherence Gate - Core Module (Task 3.1, ADR-083)
 *
 * CoherenceGate class, public API, types, and factory functions.
 * Validates AI-generated test artifacts using heuristic coherence scoring
 * based on word-level feature similarity.
 *
 * @module integrations/ruvector/coherence-gate-core
 * @see ADR-083-coherence-gated-agent-actions.md
 */

import { createHash, randomUUID } from 'crypto';
import { LoggerFactory } from '../../logging/index.js';
import type {
  ITransferCoherenceGate,
  CoherenceValidation,
} from './transfer-coherence-stub.js';
import { getRuVectorFeatureFlags } from './feature-flags.js';
import type { WitnessChain as GovernanceWitnessChain, WitnessDecision } from '../../governance/witness-chain.js';
import {
  computeReflexEnergy,
  computeRetrievalEnergy,
  REFLEX_LATENCY_BUDGET_MS,
} from './coherence-gate-energy.js';
import type { GateType } from './cusum-detector.js';

const logger = LoggerFactory.create('coherence-gate');

// ============================================================================
// Types
// ============================================================================

/**
 * Test artifact to validate for coherence.
 */
export interface TestArtifact {
  /** Assertions made by the generated test */
  assertions: string[];
  /** Observed behaviors from actual execution */
  observedBehavior: string[];
  /** Code coverage ratio (0-1) */
  coverage: number;
  /** Domain the test belongs to */
  domain: string;
  /** Confidence score of the generator (0-1) */
  confidence: number;
}

/**
 * Result of coherence energy computation.
 */
export interface CoherenceResult {
  /** Coherence energy score (0-1, lower = more coherent) */
  energy: number;
  /** Which compute tier was used */
  tier: 'reflex' | 'retrieval';
  /** Breakdown of energy components */
  components: EnergyComponents;
  /** Computation latency in milliseconds */
  latencyMs: number;
}

/**
 * Breakdown of energy components for explainability.
 */
export interface EnergyComponents {
  /** Energy from assertion-observation mismatch (0-1) */
  assertionCoverage: number;
  /** Energy from low code coverage (0-1) */
  codeCoverage: number;
  /** Energy from low confidence (0-1) */
  confidencePenalty: number;
  /** Energy from contradiction detection (0-1, retrieval only) */
  contradictionScore: number;
  /** Energy from sheaf Laplacian deviation (0-1, retrieval only) */
  laplacianDeviation: number;
}

/**
 * Result of validation against a threshold.
 */
export interface ValidationResult {
  /** Whether the artifact passes coherence validation */
  passed: boolean;
  /** The coherence energy score */
  energy: number;
  /** The threshold used for validation */
  threshold: number;
  /** Human-readable reason if validation failed */
  reason?: string;
  /** The witness record for this decision */
  witness: WitnessRecord;
}

/**
 * Hash-chained witness record for audit trail.
 */
export interface WitnessRecord {
  /** Unique record identifier */
  id: string;
  /** Timestamp of the decision */
  timestamp: number;
  /** Hash of the artifact that was validated */
  artifactHash: string;
  /** The coherence energy computed */
  energy: number;
  /** The threshold applied */
  threshold: number;
  /** Whether validation passed */
  passed: boolean;
  /** Hash of the previous witness record */
  previousHash: string;
  /** Hash of this record (chained) */
  recordHash: string;
}

/**
 * Decision log entry for observability.
 */
export interface CoherenceDecision {
  /** Unique decision identifier */
  id: string;
  /** Timestamp */
  timestamp: number;
  /** Domain of the artifact */
  domain: string;
  /** Computed energy */
  energy: number;
  /** Compute tier used */
  tier: 'reflex' | 'retrieval';
  /** Whether validation passed */
  passed: boolean;
  /** Threshold used */
  threshold: number;
}

/** Default coherence threshold (Normal regime) */
export const DEFAULT_COHERENCE_THRESHOLD = 0.4;

// ============================================================================
// Coherence Gate Implementation
// ============================================================================

/**
 * Coherence gate for validating AI-generated test artifacts.
 *
 * Uses word-level heuristic coherence scoring to detect hallucinated or
 * inconsistent test outputs. Implements ITransferCoherenceGate for
 * cross-domain transfer validation compatibility.
 *
 * @example
 * ```typescript
 * const gate = new CoherenceGate();
 * const result = gate.validate({
 *   assertions: ['expect(result).toBe(true)'],
 *   observedBehavior: ['result was true'],
 *   coverage: 0.85,
 *   domain: 'test-generation',
 *   confidence: 0.9,
 * });
 * if (!result.passed) {
 *   console.warn('Artifact may be hallucinated:', result.reason);
 * }
 * ```
 */
export class CoherenceGate implements ITransferCoherenceGate {
  private readonly threshold: number;
  private decisionLog: CoherenceDecision[] = [];
  private witnessChain: WitnessRecord[] = [];
  private lastWitnessHash: string = '0'.repeat(64);
  private nativeAvailable: boolean | null = null;
  /** Optional governance witness chain for SQLite persistence */
  private governanceChain: GovernanceWitnessChain | null = null;

  constructor(threshold: number = DEFAULT_COHERENCE_THRESHOLD) {
    this.threshold = threshold;
  }

  /**
   * Attach a governance WitnessChain (or PersistentWitnessChain) for
   * durable persistence of coherence decisions.
   */
  setGovernanceChain(chain: GovernanceWitnessChain): void {
    this.governanceChain = chain;
  }

  // ==========================================================================
  // Core API
  // ==========================================================================

  /**
   * Compute coherence energy for a test artifact.
   *
   * Uses a two-tier compute ladder:
   * - Reflex (<1ms): Simple heuristic checks
   * - Retrieval (~10ms): Full sheaf Laplacian computation
   *
   * @param artifact - Test artifact to evaluate
   * @param forceRetrieval - Skip reflex tier and go straight to retrieval
   * @param gateType - Gate action type for CUSUM drift tracking (default: 'retrieve')
   */
  computeEnergy(
    artifact: TestArtifact,
    forceRetrieval: boolean = false,
    gateType: GateType = 'retrieve',
  ): CoherenceResult {
    const startTime = performance.now();

    // Tier 1: Reflex check
    if (!forceRetrieval) {
      const reflexResult = computeReflexEnergy(artifact, gateType);
      const reflexLatency = performance.now() - startTime;

      if (reflexLatency <= REFLEX_LATENCY_BUDGET_MS) {
        return {
          energy: reflexResult.energy,
          tier: 'reflex',
          components: reflexResult.components,
          latencyMs: reflexLatency,
        };
      }
    }

    // Tier 2: Full retrieval computation
    const retrievalResult = computeRetrievalEnergy(artifact, gateType);
    const latencyMs = performance.now() - startTime;

    return {
      energy: retrievalResult.energy,
      tier: 'retrieval',
      components: retrievalResult.components,
      latencyMs,
    };
  }

  /**
   * Validate a test artifact against the coherence threshold.
   *
   * @param artifact - Test artifact to validate
   * @param threshold - Optional override threshold (default: constructor threshold)
   * @param gateType - Gate action type for CUSUM drift tracking (default: 'retrieve')
   */
  validate(
    artifact: TestArtifact,
    threshold?: number,
    gateType: GateType = 'retrieve',
  ): ValidationResult {
    const effectiveThreshold = threshold ?? this.threshold;
    const coherenceResult = this.computeEnergy(artifact, false, gateType);
    const passed = coherenceResult.energy <= effectiveThreshold;

    // Build reason for failure
    let reason: string | undefined;
    if (!passed) {
      reason = this.buildFailureReason(coherenceResult, effectiveThreshold);
    }

    // Create witness record
    const witness = this.createWitnessRecord(
      artifact,
      coherenceResult.energy,
      effectiveThreshold,
      passed,
    );

    // Log decision
    this.logDecision({
      id: witness.id,
      timestamp: witness.timestamp,
      domain: artifact.domain,
      energy: coherenceResult.energy,
      tier: coherenceResult.tier,
      passed,
      threshold: effectiveThreshold,
    });

    return {
      passed,
      energy: coherenceResult.energy,
      threshold: effectiveThreshold,
      reason,
      witness,
    };
  }

  /** Get the decision log for observability. */
  getDecisionLog(): CoherenceDecision[] {
    return [...this.decisionLog];
  }

  /** Get the witness chain for audit purposes. */
  getWitnessChain(): WitnessRecord[] {
    return [...this.witnessChain];
  }

  /** Get the current threshold. */
  getThreshold(): number {
    return this.threshold;
  }

  /** Clear the decision log (for testing). */
  clearDecisionLog(): void {
    this.decisionLog = [];
  }

  // ==========================================================================
  // ITransferCoherenceGate Implementation
  // ==========================================================================

  validateTransfer(
    pattern: { id?: string; domain?: string; confidence?: number; [key: string]: unknown },
    targetDomain: string,
  ): CoherenceValidation {
    const flags = getRuVectorFeatureFlags();
    if (!flags.useCoherenceGate) {
      return { approved: true };
    }

    const artifact: TestArtifact = {
      assertions: this.extractAssertions(pattern),
      observedBehavior: this.extractObservedBehavior(pattern),
      coverage: typeof pattern.coverage === 'number' ? pattern.coverage : 0.5,
      domain: targetDomain,
      confidence: pattern.confidence ?? 0.5,
    };

    // Transfer validation uses 'write' gate type for CUSUM tracking
    const result = this.validate(artifact, undefined, 'write');

    return {
      approved: result.passed,
      energy: result.energy,
      rejectionReason: result.reason,
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private buildFailureReason(
    result: CoherenceResult,
    threshold: number,
  ): string {
    const parts: string[] = [];
    parts.push(
      `Coherence energy ${result.energy.toFixed(3)} exceeds threshold ${threshold.toFixed(3)}.`,
    );

    const c = result.components;
    if (c.assertionCoverage > 0.5) {
      parts.push('High assertion-observation mismatch (possible hallucination).');
    }
    if (c.codeCoverage > 0.5) {
      parts.push('Low code coverage.');
    }
    if (c.confidencePenalty > 0.5) {
      parts.push('Low generator confidence.');
    }
    if (c.contradictionScore > 0.3) {
      parts.push('Contradictions detected between assertions and observed behavior.');
    }
    if (c.laplacianDeviation > 0.5) {
      parts.push('Inconsistent assertion structure (high Laplacian deviation).');
    }

    return parts.join(' ');
  }

  private createWitnessRecord(
    artifact: TestArtifact,
    energy: number,
    threshold: number,
    passed: boolean,
  ): WitnessRecord {
    const id = randomUUID();
    const timestamp = Date.now();
    const artifactHash = this.hashContent(JSON.stringify(artifact));

    const record: WitnessRecord = {
      id,
      timestamp,
      artifactHash,
      energy,
      threshold,
      passed,
      previousHash: this.lastWitnessHash,
      recordHash: '',
    };

    // Compute record hash (chain link)
    const hashPayload = `${id}|${timestamp}|${artifactHash}|${energy}|${threshold}|${passed}|${this.lastWitnessHash}`;
    record.recordHash = this.hashContent(hashPayload);

    // Update chain
    const flags = getRuVectorFeatureFlags();
    if (flags.useWitnessChain) {
      this.witnessChain.push(record);
      this.lastWitnessHash = record.recordHash;

      // Persist to governance chain if attached
      if (this.governanceChain) {
        try {
          const governanceDecision: WitnessDecision = {
            type: 'coherence-gate',
            decision: passed ? 'PASS' : 'FAIL',
            context: { energy, threshold, artifactHash: record.artifactHash },
          };
          this.governanceChain.appendWitness(governanceDecision);
        } catch (err) {
          logger.debug('Failed to persist to governance chain', { error: String(err) });
        }
      }
    }

    return record;
  }

  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private logDecision(decision: CoherenceDecision): void {
    this.decisionLog.push(decision);

    // Keep bounded
    const maxLog = 1000;
    if (this.decisionLog.length > maxLog) {
      this.decisionLog = this.decisionLog.slice(-maxLog);
    }

    logger.debug('Coherence decision', {
      domain: decision.domain,
      energy: decision.energy,
      tier: decision.tier,
      passed: decision.passed,
    });
  }

  private extractAssertions(pattern: Record<string, unknown>): string[] {
    if (Array.isArray(pattern.assertions)) {
      return pattern.assertions.map(String);
    }
    if (typeof pattern.description === 'string') {
      return [pattern.description];
    }
    return ['transfer-pattern'];
  }

  private extractObservedBehavior(pattern: Record<string, unknown>): string[] {
    if (Array.isArray(pattern.observedBehavior)) {
      return pattern.observedBehavior.map(String);
    }
    if (typeof pattern.evidence === 'string') {
      return [pattern.evidence];
    }
    return ['observed'];
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a coherence gate instance.
 */
export function createCoherenceGate(
  threshold?: number,
  governanceChain?: GovernanceWitnessChain,
): CoherenceGate {
  const gate = new CoherenceGate(threshold);
  if (governanceChain) {
    gate.setGovernanceChain(governanceChain);
  }
  return gate;
}

/**
 * Create a transfer coherence gate.
 * Returns the real CoherenceGate implementation (replacing the stub).
 */
export function createRealTransferCoherenceGate(): ITransferCoherenceGate {
  return new CoherenceGate();
}
