/**
 * Agentic QE v3 - ClaimVerifier Service
 * CV-003, CV-004, CV-005: Orchestrate verification using specialized verifiers
 *
 * This service coordinates multiple verification methods:
 * - FileBasedVerifier: For file existence and content claims
 * - TestBasedVerifier: For test execution and coverage claims
 * - OutputBasedVerifier: For command output claims
 *
 * @module agents/claim-verifier
 */

import type { Result } from '../../shared/types';
import type {
  Claim,
  ClaimType,
  ClaimVerifierAgent,
  ClaimVerifierConfig,
  VerificationResult,
  VerificationOptions,
  ReportVerificationOptions,
  QEReport,
  ReportVerification,
  FlaggedClaim,
  VerificationSummary,
  VerificationStats,
  TypeStats,
  MethodStats,
  AgentStats,
  VerificationMethod,
  VerificationError,
} from './interfaces';
import {
  createVerificationError,
  CLAIM_TYPE_TO_METHOD,
  STRICT_VERIFICATION_TYPES,
  DEFAULT_CLAIM_VERIFIER_CONFIG,
} from './interfaces';
import { FileBasedVerifier, type FileVerifierConfig } from './verifiers/file-verifier';
import { TestBasedVerifier, type TestVerifierConfig } from './verifiers/test-verifier';
import { OutputBasedVerifier, type OutputVerifierConfig } from './verifiers/output-verifier';

/**
 * Factory configuration for ClaimVerifierService.
 */
export interface ClaimVerifierServiceConfig {
  /**
   * Root directory for file operations
   */
  readonly rootDir: string;

  /**
   * Claim verifier configuration
   */
  readonly verifier?: Partial<ClaimVerifierConfig>;

  /**
   * File verifier configuration
   */
  readonly fileVerifier?: Partial<FileVerifierConfig>;

  /**
   * Test verifier configuration
   */
  readonly testVerifier?: Partial<TestVerifierConfig>;

  /**
   * Output verifier configuration
   */
  readonly outputVerifier?: Partial<OutputVerifierConfig>;
}

/**
 * Verification history entry for learning.
 */
interface VerificationHistoryEntry {
  readonly claimId: string;
  readonly claimType: ClaimType;
  readonly method: VerificationMethod;
  readonly result: VerificationResult;
  readonly timestamp: Date;
}

/**
 * ClaimVerifierService orchestrates claim verification using specialized verifiers.
 *
 * This service:
 * 1. Routes claims to appropriate verifiers based on type
 * 2. Aggregates evidence from multiple verifiers
 * 3. Tracks verification history for learning
 * 4. Provides batch and report verification
 *
 * @example
 * ```typescript
 * const service = createClaimVerifierService({
 *   rootDir: '/workspace/project'
 * });
 *
 * // Verify a single claim
 * const result = await service.verify(claim);
 *
 * // Verify a report
 * const reportResult = await service.verifyReport(report);
 * ```
 */
export class ClaimVerifierService implements ClaimVerifierAgent {
  private readonly config: ClaimVerifierConfig;
  private readonly fileVerifier: FileBasedVerifier;
  private readonly testVerifier: TestBasedVerifier;
  private readonly outputVerifier: OutputBasedVerifier;
  private readonly history: VerificationHistoryEntry[] = [];

  constructor(config: ClaimVerifierServiceConfig) {
    this.config = {
      ...DEFAULT_CLAIM_VERIFIER_CONFIG,
      ...config.verifier,
    };

    this.fileVerifier = new FileBasedVerifier({
      rootDir: config.rootDir,
      ...config.fileVerifier,
    });

    this.testVerifier = new TestBasedVerifier({
      rootDir: config.rootDir,
      ...config.testVerifier,
    });

    this.outputVerifier = new OutputBasedVerifier({
      rootDir: config.rootDir,
      ...config.outputVerifier,
    });
  }

  /**
   * Verify a single claim.
   */
  async verify(
    claim: Claim,
    options?: VerificationOptions
  ): Promise<Result<VerificationResult, VerificationError>> {
    try {
      // Merge options with config defaults
      const verificationOptions: VerificationOptions = {
        confidenceThreshold: this.config.defaultConfidenceThreshold,
        timeout: this.config.defaultTimeout,
        checkAllInstances: this.requiresStrictVerification(claim.type),
        collectCounterEvidence: true,
        useMultiModel: this.config.enableMultiModel && this.isSecurityClaim(claim.type),
        ...options,
      };

      // Get recommended method
      const method = this.selectVerificationMethod(claim, verificationOptions);

      // Route to appropriate verifier
      const result = await this.executeVerification(claim, method, verificationOptions);

      // Record in history
      if (this.config.enableStatistics) {
        this.recordVerification(claim, result);
      }

      return { success: true, value: result };
    } catch (error) {
      const verificationError = this.handleError(error, claim.id);
      return { success: false, error: verificationError };
    }
  }

  /**
   * Verify all claims in a QE report.
   */
  async verifyReport(
    report: QEReport,
    options?: ReportVerificationOptions
  ): Promise<Result<ReportVerification, VerificationError>> {
    try {
      const reportOptions: ReportVerificationOptions = {
        confidenceThreshold: this.config.defaultConfidenceThreshold,
        qualityThreshold: this.config.reportQualityThreshold,
        timeout: this.config.defaultTimeout,
        parallelLimit: this.config.maxParallelVerifications,
        failFast: false,
        verificationOrder: 'severity',
        ...options,
      };

      // Sort claims by priority
      const sortedClaims = this.sortClaimsByPriority(
        report.claims,
        reportOptions.verificationOrder
      );

      // Verify claims (with parallelization)
      const results: VerificationResult[] = [];
      const flaggedClaims: FlaggedClaim[] = [];

      for (let i = 0; i < sortedClaims.length; i += reportOptions.parallelLimit!) {
        const batch = sortedClaims.slice(i, i + reportOptions.parallelLimit!);
        const batchResults = await Promise.all(
          batch.map(claim => this.verify(claim, reportOptions))
        );

        for (const result of batchResults) {
          if (!result.success) {
            if (reportOptions.failFast) {
              // Type narrowing: when success is false, error exists
              const error = (result as { success: false; error: VerificationError }).error;
              throw error;
            }
            continue;
          }

          // Type narrowing: when success is true, value exists
          results.push(result.value);

          // Check if claim should be flagged
          const flagged = this.checkIfFlagged(
            batch.find(c => c.id === result.value.claimId)!,
            result.value,
            reportOptions
          );

          if (flagged) {
            flaggedClaims.push(flagged);
          }
        }
      }

      // Calculate summary
      const summary = this.calculateSummary(results);

      // Calculate overall confidence
      const overallConfidence = summary.averageConfidence;

      // Determine if report passed
      const passed = overallConfidence >= reportOptions.qualityThreshold! &&
                     flaggedClaims.filter(f => f.priority === 'urgent').length === 0;

      const verification: ReportVerification = {
        reportId: report.id,
        report,
        claims: report.claims,
        results,
        overallConfidence,
        flaggedClaims,
        summary,
        verifiedAt: new Date(),
        passed,
        qualityThreshold: reportOptions.qualityThreshold!,
      };

      return { success: true, value: verification };
    } catch (error) {
      const verificationError = this.handleError(error, report.id);
      return { success: false, error: verificationError };
    }
  }

  /**
   * Verify multiple claims in batch.
   */
  async verifyBatch(
    claims: Claim[],
    options?: VerificationOptions
  ): Promise<Result<VerificationResult[], VerificationError>> {
    try {
      const results = await Promise.all(
        claims.map(claim => this.verify(claim, options))
      );

      // Extract successful results
      const successfulResults = results
        .filter((r): r is { success: true; value: VerificationResult } => r.success)
        .map(r => r.value);

      // Check if any failed
      const failures = results.filter(r => !r.success);
      if (failures.length > 0) {
        const firstFailure = failures[0] as { success: false; error: VerificationError };
        return { success: false, error: firstFailure.error };
      }

      return { success: true, value: successfulResults };
    } catch (error) {
      const verificationError = this.handleError(error);
      return { success: false, error: verificationError };
    }
  }

  /**
   * Get verification statistics.
   */
  getStats(): VerificationStats {
    const now = new Date();
    const stats: VerificationStats = {
      totalClaims: this.history.length,
      verified: this.history.filter(h => h.result.verified).length,
      rejected: this.history.filter(h => !h.result.verified).length,
      disputed: this.history.filter(h => h.result.confidence < 0.5).length,
      avgConfidence: this.calculateAverageConfidence(this.history),
      byType: this.calculateTypeStats(),
      byMethod: this.calculateMethodStats(),
      bySourceAgent: this.calculateAgentStats(),
      lastUpdated: now,
      timeWindow: {
        start: this.history[0]?.timestamp ?? now,
        end: now,
      },
    };

    return stats;
  }

  /**
   * Reset verification statistics.
   */
  resetStats(): void {
    this.history.length = 0;
  }

  /**
   * Check if a claim type requires strict verification.
   */
  requiresStrictVerification(type: ClaimType): boolean {
    return STRICT_VERIFICATION_TYPES.includes(type);
  }

  /**
   * Get the recommended verification method for a claim type.
   */
  getRecommendedMethod(type: ClaimType): VerificationMethod {
    return CLAIM_TYPE_TO_METHOD[type];
  }

  /**
   * Select the appropriate verification method.
   */
  private selectVerificationMethod(
    claim: Claim,
    options: VerificationOptions
  ): VerificationMethod {
    // Use preferred method if specified
    if (options.preferredMethods && options.preferredMethods.length > 0) {
      return options.preferredMethods[0];
    }

    // Use recommended method based on claim type
    return this.getRecommendedMethod(claim.type);
  }

  /**
   * Execute verification using the appropriate verifier.
   */
  private async executeVerification(
    claim: Claim,
    method: VerificationMethod,
    options: VerificationOptions
  ): Promise<VerificationResult> {
    switch (method) {
      case 'cross-file':
        return this.fileVerifier.verify(claim, options);

      case 'execution':
        // Determine if this is a test or output claim
        if (claim.type === 'coverage-claim' || claim.statement.toLowerCase().includes('test')) {
          return this.testVerifier.verify(claim, options);
        }
        return this.outputVerifier.verify(claim, options);

      case 'code-trace':
        // Use file verifier for code tracing
        return this.fileVerifier.verify(claim, options);

      case 'static-analysis':
        // Use file verifier for static analysis
        return this.fileVerifier.verify(claim, options);

      case 'multi-model':
        // Not yet implemented - fall back to recommended method
        const fallbackMethod = this.getRecommendedMethod(claim.type);
        return this.executeVerification(claim, fallbackMethod, options);

      default:
        throw createVerificationError(
          'METHOD_NOT_AVAILABLE',
          `Verification method '${method}' is not available`,
          { retryable: false }
        );
    }
  }

  /**
   * Check if claim is security-related.
   */
  private isSecurityClaim(type: ClaimType): boolean {
    return type === 'security-implementation' || type === 'security-vulnerability';
  }

  /**
   * Sort claims by priority.
   */
  private sortClaimsByPriority(
    claims: Claim[],
    order: 'severity' | 'type' | 'sequential' = 'severity'
  ): Claim[] {
    if (order === 'sequential') {
      return [...claims];
    }

    return [...claims].sort((a, b) => {
      if (order === 'severity') {
        const severityOrder = ['critical', 'high', 'medium', 'low'];
        return severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity);
      }

      // Sort by type
      const typeOrder: ClaimType[] = [
        'security-vulnerability',
        'security-implementation',
        'coverage-claim',
        'pattern-implementation',
        'metric-count',
      ];
      return typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type);
    });
  }

  /**
   * Check if a claim should be flagged.
   */
  private checkIfFlagged(
    claim: Claim,
    result: VerificationResult,
    options: ReportVerificationOptions
  ): FlaggedClaim | null {
    if (result.verified && result.confidence >= options.confidenceThreshold!) {
      return null; // No flagging needed
    }

    // Determine flag reason
    let reason: FlaggedClaim['reason'];
    if (!result.verified) {
      reason = 'verification-failed';
    } else if (result.confidence < options.confidenceThreshold!) {
      reason = 'low-confidence';
    } else if (!result.allInstancesChecked && this.requiresStrictVerification(claim.type)) {
      reason = 'partial-verification';
    } else {
      reason = 'verification-failed';
    }

    // Determine recommended action
    let recommendedAction: FlaggedClaim['recommendedAction'];
    if (!result.verified) {
      recommendedAction = 'remove-from-report';
    } else if (result.confidence < 0.5) {
      recommendedAction = 'human-review-required';
    } else if (result.confidence < options.confidenceThreshold!) {
      recommendedAction = 'add-disclaimer';
    } else {
      recommendedAction = 're-verify';
    }

    // Determine priority
    let priority: FlaggedClaim['priority'];
    if (this.isSecurityClaim(claim.type) && !result.verified) {
      priority = 'urgent';
    } else if (claim.severity === 'critical') {
      priority = 'high';
    } else if (claim.severity === 'high') {
      priority = 'medium';
    } else {
      priority = 'low';
    }

    return {
      claim,
      result,
      reason,
      recommendedAction,
      priority,
    };
  }

  /**
   * Calculate verification summary.
   */
  private calculateSummary(results: VerificationResult[]): VerificationSummary {
    const byType: Record<ClaimType, any> = {
      'security-implementation': { total: 0, verified: 0, rejected: 0, avgConfidence: 0 },
      'security-vulnerability': { total: 0, verified: 0, rejected: 0, avgConfidence: 0 },
      'metric-count': { total: 0, verified: 0, rejected: 0, avgConfidence: 0 },
      'pattern-implementation': { total: 0, verified: 0, rejected: 0, avgConfidence: 0 },
      'coverage-claim': { total: 0, verified: 0, rejected: 0, avgConfidence: 0 },
    };

    const byMethod: Record<VerificationMethod, number> = {
      'code-trace': 0,
      'execution': 0,
      'cross-file': 0,
      'multi-model': 0,
      'static-analysis': 0,
    };

    let totalTimeMs = 0;
    let totalConfidence = 0;

    for (const result of results) {
      byMethod[result.method]++;
      totalTimeMs += result.verificationTimeMs ?? 0;
      totalConfidence += result.confidence;
    }

    return {
      totalClaims: results.length,
      verified: results.filter(r => r.verified).length,
      rejected: results.filter(r => !r.verified).length,
      disputed: results.filter(r => r.confidence < 0.5).length,
      requiresReview: results.filter(r => r.requiresHumanReview).length,
      averageConfidence: results.length > 0 ? totalConfidence / results.length : 0,
      totalTimeMs,
      byType,
      byMethod,
    };
  }

  /**
   * Record a verification in history.
   */
  private recordVerification(claim: Claim, result: VerificationResult): void {
    this.history.push({
      claimId: claim.id,
      claimType: claim.type,
      method: result.method,
      result,
      timestamp: new Date(),
    });
  }

  /**
   * Calculate average confidence from history.
   */
  private calculateAverageConfidence(history: VerificationHistoryEntry[]): number {
    if (history.length === 0) return 0;
    const total = history.reduce((sum, h) => sum + h.result.confidence, 0);
    return total / history.length;
  }

  /**
   * Calculate statistics by claim type.
   */
  private calculateTypeStats(): Record<ClaimType, TypeStats> {
    // Use mutable objects for calculation
    const stats: Record<ClaimType, any> = {
      'security-implementation': this.createEmptyTypeStats(),
      'security-vulnerability': this.createEmptyTypeStats(),
      'metric-count': this.createEmptyTypeStats(),
      'pattern-implementation': this.createEmptyTypeStats(),
      'coverage-claim': this.createEmptyTypeStats(),
    };

    for (const entry of this.history) {
      const typeStats = stats[entry.claimType];
      typeStats.total++;
      if (entry.result.verified) typeStats.verified++;
      else typeStats.rejected++;
    }

    // Calculate averages
    for (const type of Object.keys(stats) as ClaimType[]) {
      const typeHistory = this.history.filter(h => h.claimType === type);
      stats[type].avgConfidence = this.calculateAverageConfidence(typeHistory);
      stats[type].avgVerificationTimeMs = typeHistory.length > 0
        ? typeHistory.reduce((sum, h) => sum + (h.result.verificationTimeMs ?? 0), 0) / typeHistory.length
        : 0;
    }

    return stats as Record<ClaimType, TypeStats>;
  }

  /**
   * Calculate statistics by verification method.
   */
  private calculateMethodStats(): Record<VerificationMethod, MethodStats> {
    // Use mutable objects for calculation
    const stats: Record<VerificationMethod, any> = {
      'code-trace': this.createEmptyMethodStats(),
      'execution': this.createEmptyMethodStats(),
      'cross-file': this.createEmptyMethodStats(),
      'multi-model': this.createEmptyMethodStats(),
      'static-analysis': this.createEmptyMethodStats(),
    };

    for (const entry of this.history) {
      const methodStats = stats[entry.method];
      methodStats.timesUsed++;
    }

    // Calculate success rates and averages
    for (const method of Object.keys(stats) as VerificationMethod[]) {
      const methodHistory = this.history.filter(h => h.method === method);
      if (methodHistory.length > 0) {
        stats[method].successRate = methodHistory.filter(h => h.result.verified).length / methodHistory.length;
        stats[method].avgConfidence = this.calculateAverageConfidence(methodHistory);
        stats[method].avgTimeMs = methodHistory.reduce((sum, h) => sum + (h.result.verificationTimeMs ?? 0), 0) / methodHistory.length;
      }
    }

    return stats as Record<VerificationMethod, MethodStats>;
  }

  /**
   * Calculate statistics by source agent.
   */
  private calculateAgentStats(): Record<string, AgentStats> {
    // Use mutable objects for calculation
    const stats: Record<string, any> = {};

    for (const entry of this.history) {
      const agentId = entry.claimId.split('-')[0]; // Extract agent ID from claim ID

      if (!stats[agentId]) {
        stats[agentId] = {
          claimsSubmitted: 0,
          claimsVerified: 0,
          claimsRejected: 0,
          verificationRate: 0,
          avgConfidence: 0,
        };
      }

      stats[agentId].claimsSubmitted++;
      if (entry.result.verified) {
        stats[agentId].claimsVerified++;
      } else {
        stats[agentId].claimsRejected++;
      }
    }

    // Calculate rates and averages
    for (const agentId of Object.keys(stats)) {
      const agentHistory = this.history.filter(h => h.claimId.startsWith(agentId));
      stats[agentId].verificationRate = stats[agentId].claimsVerified / stats[agentId].claimsSubmitted;
      stats[agentId].avgConfidence = this.calculateAverageConfidence(agentHistory);
    }

    return stats as Record<string, AgentStats>;
  }

  /**
   * Create empty type stats.
   */
  private createEmptyTypeStats(): TypeStats {
    return {
      total: 0,
      verified: 0,
      rejected: 0,
      disputed: 0,
      avgConfidence: 0,
      avgVerificationTimeMs: 0,
    };
  }

  /**
   * Create empty method stats.
   */
  private createEmptyMethodStats(): MethodStats {
    return {
      timesUsed: 0,
      successRate: 0,
      avgConfidence: 0,
      avgTimeMs: 0,
    };
  }

  /**
   * Handle verification errors.
   */
  private handleError(error: unknown, claimId?: string): VerificationError {
    if (error && typeof error === 'object' && 'code' in error) {
      return error as VerificationError;
    }

    const message = error instanceof Error ? error.message : 'Unknown verification error';

    return createVerificationError('INTERNAL_ERROR', message, {
      claimId,
      retryable: false,
    });
  }
}

/**
 * Factory function to create a ClaimVerifierService instance.
 *
 * @param config - Service configuration
 * @returns ClaimVerifierService instance
 */
export function createClaimVerifierService(
  config: ClaimVerifierServiceConfig
): ClaimVerifierAgent {
  return new ClaimVerifierService(config);
}
