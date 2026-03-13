/**
 * Multi-Signal Confidence Merger (Issue #342, Item 3)
 *
 * Combines three independent routing signals with clear precedence:
 *
 * | Signal | AQE Equivalent | Confidence | Precedence |
 * |--------|---------------|------------|------------|
 * | User declaration | preferredAgent in task context or CLAUDE.md | 1.0 | Overrides all |
 * | Static analysis | Code pattern scanning (domain + capability match) | 0.5-0.9 | Overrides behavioral |
 * | Behavioral co-usage | Learning DB: which agents succeed together | 0.0-1.0 (linear ramp) | Lowest |
 *
 * Key rules from Skillsmith:
 * - When declaration and inference agree, keep declaration, drop inferred (dedup)
 * - Behavioral confidence ramps linearly: min(1.0, success_count / 20)
 */

import type { CoExecutionStats } from './co-execution-repository.js';

// ============================================================================
// Types
// ============================================================================

/** Signal source type */
export type SignalSource = 'user-declaration' | 'static-analysis' | 'behavioral';

/** A single routing signal */
export interface RoutingSignal {
  /** Signal source */
  readonly source: SignalSource;
  /** Recommended agent ID */
  readonly agentId: string;
  /** Confidence score (0-1) */
  readonly confidence: number;
  /** Human-readable reason */
  readonly reason: string;
}

/** Merged signal result for one agent */
export interface MergedAgentScore {
  /** Agent ID */
  readonly agentId: string;
  /** Final merged confidence */
  readonly mergedConfidence: number;
  /** Individual signal contributions */
  readonly signals: RoutingSignal[];
  /** Which signal determined the final score */
  readonly determinedBy: SignalSource;
  /** Whether signals agreed */
  readonly signalsAgreed: boolean;
}

/** Configuration for the signal merger */
export interface SignalMergerConfig {
  /** Weight for static analysis signal when no declaration present */
  readonly staticAnalysisWeight: number;
  /** Weight for behavioral signal when no declaration present */
  readonly behavioralWeight: number;
  /** Minimum behavioral confidence to contribute to scoring */
  readonly minBehavioralConfidence: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_SIGNAL_MERGER_CONFIG: SignalMergerConfig = {
  staticAnalysisWeight: 0.7,
  behavioralWeight: 0.3,
  minBehavioralConfidence: 0.05, // At least 1 successful co-execution
};

// ============================================================================
// Signal Merger
// ============================================================================

export class SignalMerger {
  private readonly config: SignalMergerConfig;

  constructor(config: Partial<SignalMergerConfig> = {}) {
    this.config = { ...DEFAULT_SIGNAL_MERGER_CONFIG, ...config };
  }

  /**
   * Merge multiple routing signals for a set of candidate agents.
   *
   * Precedence rules:
   * 1. User declaration (confidence 1.0) overrides everything
   * 2. Static analysis (0.5-0.9) overrides behavioral
   * 3. Behavioral co-usage (0.0-1.0 linear ramp) is lowest priority
   *
   * Deduplication: when declaration and analysis agree on the same agent,
   * keep declaration, drop analysis (Skillsmith rule).
   */
  merge(
    candidateAgentIds: string[],
    signals: {
      /** User-declared preferred agent (confidence 1.0) */
      userDeclaration?: string;
      /** Static analysis scores per agent */
      staticAnalysis: Map<string, { confidence: number; reason: string }>;
      /** Behavioral co-execution data per agent */
      behavioral: Map<string, CoExecutionStats>;
    },
  ): MergedAgentScore[] {
    const results: MergedAgentScore[] = [];

    for (const agentId of candidateAgentIds) {
      const agentSignals: RoutingSignal[] = [];
      let determinedBy: SignalSource = 'static-analysis';
      let mergedConfidence: number;

      // Signal 1: User declaration (highest precedence)
      const isUserDeclared = signals.userDeclaration === agentId;
      if (isUserDeclared) {
        agentSignals.push({
          source: 'user-declaration',
          agentId,
          confidence: 1.0,
          reason: 'User explicitly selected this agent',
        });
      }

      // Signal 2: Static analysis
      const staticScore = signals.staticAnalysis.get(agentId);
      if (staticScore) {
        // Dedup: if user declared the same agent, don't add static signal
        if (!isUserDeclared) {
          agentSignals.push({
            source: 'static-analysis',
            agentId,
            confidence: staticScore.confidence,
            reason: staticScore.reason,
          });
        }
      }

      // Signal 3: Behavioral co-execution
      const behavioralStats = signals.behavioral.get(agentId);
      if (behavioralStats && behavioralStats.behavioralConfidence >= this.config.minBehavioralConfidence) {
        agentSignals.push({
          source: 'behavioral',
          agentId,
          confidence: behavioralStats.behavioralConfidence,
          reason: `${behavioralStats.successCount} successful co-executions (${(behavioralStats.successRate * 100).toFixed(0)}% success rate)`,
        });
      }

      // Merge using precedence rules
      if (isUserDeclared) {
        // User declaration overrides everything
        mergedConfidence = 1.0;
        determinedBy = 'user-declaration';
      } else if (staticScore && behavioralStats) {
        // Both static and behavioral available -- weighted merge
        const behavioralConf = behavioralStats.behavioralConfidence >= this.config.minBehavioralConfidence
          ? behavioralStats.behavioralConfidence * behavioralStats.successRate
          : 0;

        mergedConfidence =
          this.config.staticAnalysisWeight * staticScore.confidence +
          this.config.behavioralWeight * behavioralConf;

        // Clamp to [0, 1]
        mergedConfidence = Math.min(1.0, Math.max(0, mergedConfidence));

        determinedBy = staticScore.confidence >= behavioralConf
          ? 'static-analysis'
          : 'behavioral';
      } else if (staticScore) {
        // Only static analysis
        mergedConfidence = staticScore.confidence;
        determinedBy = 'static-analysis';
      } else if (behavioralStats && behavioralStats.behavioralConfidence >= this.config.minBehavioralConfidence) {
        // Only behavioral
        mergedConfidence = behavioralStats.behavioralConfidence * behavioralStats.successRate;
        determinedBy = 'behavioral';
      } else {
        // No signals -- baseline
        mergedConfidence = 0;
        determinedBy = 'static-analysis';
      }

      const signalsAgreed = agentSignals.length > 1 &&
        agentSignals.every(s => s.agentId === agentSignals[0].agentId);

      results.push({
        agentId,
        mergedConfidence,
        signals: agentSignals,
        determinedBy,
        signalsAgreed,
      });
    }

    // Sort by merged confidence descending
    results.sort((a, b) => b.mergedConfidence - a.mergedConfidence);

    return results;
  }
}

/** Create a signal merger instance */
export function createSignalMerger(config?: Partial<SignalMergerConfig>): SignalMerger {
  return new SignalMerger(config);
}
