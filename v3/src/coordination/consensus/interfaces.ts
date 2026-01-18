/**
 * Agentic QE v3 - Multi-Model Consensus Interfaces
 * MM-001: ConsensusEngine interface for security verification
 *
 * Enables multi-model consensus for security findings to improve detection
 * accuracy from 27% to 75%+. CRITICAL/HIGH security findings are verified
 * by 2+ models, with a consensus engine determining finding validity.
 *
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 2: Multi-Model Verification
 */

import { Severity, Priority, Result } from '../../shared/types';

// ============================================================================
// Security Finding Types
// ============================================================================

/**
 * Location in source code where a security finding was detected
 */
export interface FindingLocation {
  /** File path relative to project root */
  readonly file: string;

  /** Line number (1-indexed) */
  readonly line?: number;

  /** Column number (1-indexed) */
  readonly column?: number;

  /** End line number for multi-line findings */
  readonly endLine?: number;

  /** End column number */
  readonly endColumn?: number;

  /** Function or method name containing the finding */
  readonly function?: string;

  /** Class or module name */
  readonly class?: string;
}

/**
 * Evidence supporting a security finding
 */
export interface FindingEvidence {
  /** Type of evidence */
  readonly type: 'code-snippet' | 'stack-trace' | 'data-flow' | 'configuration' | 'dependency';

  /** Evidence content */
  readonly content: string;

  /** Optional location for this evidence */
  readonly location?: FindingLocation;

  /** Confidence that this evidence supports the finding (0-1) */
  readonly confidence?: number;
}

/**
 * Category of security finding
 */
export type SecurityFindingCategory =
  | 'injection'           // SQL injection, command injection, etc.
  | 'authentication'      // Auth bypass, weak auth, etc.
  | 'authorization'       // Access control, privilege escalation
  | 'cryptography'        // Weak crypto, hardcoded keys, etc.
  | 'data-exposure'       // Information disclosure, PII exposure
  | 'configuration'       // Misconfigurations, insecure defaults
  | 'dependency'          // Vulnerable dependencies
  | 'input-validation'    // XSS, path traversal, etc.
  | 'session-management'  // Session fixation, hijacking
  | 'timing-attack'       // Timing side-channels
  | 'resource-management' // DoS, memory leaks
  | 'logging'             // Sensitive data in logs
  | 'other';

/**
 * Security finding requiring multi-model verification
 */
export interface SecurityFinding {
  /** Unique identifier for this finding */
  readonly id: string;

  /** Type of security issue (e.g., 'sql-injection', 'xss', 'hardcoded-secret') */
  readonly type: string;

  /** Category of the finding */
  readonly category: SecurityFindingCategory;

  /** Severity level */
  readonly severity: Severity;

  /** Priority for addressing */
  readonly priority?: Priority;

  /** Human-readable description of the finding */
  readonly description: string;

  /** Detailed explanation of the vulnerability */
  readonly explanation?: string;

  /** Location in source code */
  readonly location: FindingLocation;

  /** Supporting evidence */
  readonly evidence: FindingEvidence[];

  /** CWE ID if applicable (e.g., 'CWE-89' for SQL injection) */
  readonly cweId?: string;

  /** OWASP category if applicable */
  readonly owaspCategory?: string;

  /** CVE ID if this is a known vulnerability */
  readonly cveId?: string;

  /** Recommended remediation */
  readonly remediation?: string;

  /** Timestamp when finding was detected */
  readonly detectedAt: Date;

  /** Agent or scanner that detected this finding */
  readonly detectedBy: string;

  /** Correlation ID for tracing */
  readonly correlationId?: string;

  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

// ============================================================================
// Model Vote Types
// ============================================================================

/**
 * Assessment type from a model vote
 */
export type VoteAssessment =
  | 'confirmed'           // Model confirms the finding is valid
  | 'rejected'            // Model rejects the finding as false positive
  | 'inconclusive'        // Model cannot determine with confidence
  | 'needs-context'       // Model needs more context to decide
  | 'partial';            // Model partially agrees (e.g., correct issue but wrong severity)

/**
 * Vote from a single model on a security finding
 */
export interface ModelVote {
  /** Model provider ID (e.g., 'claude', 'openai', 'gemini') */
  readonly modelId: string;

  /** Specific model version used */
  readonly modelVersion?: string;

  /** Whether model agrees the finding is valid */
  readonly agrees: boolean;

  /** Detailed assessment */
  readonly assessment: VoteAssessment;

  /** Confidence in the vote (0-1) */
  readonly confidence: number;

  /** Model's reasoning for the vote */
  readonly reasoning: string;

  /** Alternative severity if model disagrees with original */
  readonly suggestedSeverity?: Severity;

  /** Additional context or suggestions */
  readonly suggestions?: string[];

  /** Time taken for model to respond (ms) */
  readonly executionTime: number;

  /** Token usage for this vote */
  readonly tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };

  /** Cost of this vote in USD */
  readonly cost?: number;

  /** Timestamp of the vote */
  readonly votedAt: Date;

  /** Error if model failed to vote */
  readonly error?: string;
}

// ============================================================================
// Consensus Result Types
// ============================================================================

/**
 * Final verdict from consensus
 */
export type ConsensusVerdict =
  | 'verified'    // Consensus reached: finding is valid
  | 'rejected'    // Consensus reached: finding is false positive
  | 'disputed'    // No consensus: models disagree
  | 'insufficient' // Not enough models available to reach consensus
  | 'error';      // Consensus process failed

/**
 * Result of multi-model consensus verification
 */
export interface ConsensusResult {
  /** Final verdict */
  readonly verdict: ConsensusVerdict;

  /** Original finding that was verified */
  readonly finding: SecurityFinding;

  /** Overall confidence in the verdict (0-1) */
  readonly confidence: number;

  /** All model votes */
  readonly votes: ModelVote[];

  /** Agreement ratio (votes agreeing / total votes) */
  readonly agreementRatio: number;

  /** Whether finding requires human review */
  readonly requiresHumanReview: boolean;

  /** Synthesized reasoning from all votes */
  readonly reasoning: string;

  /** Adjusted severity based on consensus */
  readonly adjustedSeverity?: Severity;

  /** Combined suggestions from all models */
  readonly combinedSuggestions?: string[];

  /** Total execution time (ms) */
  readonly totalExecutionTime: number;

  /** Total cost in USD */
  readonly totalCost?: number;

  /** Timestamp of consensus completion */
  readonly completedAt: Date;

  /** Correlation ID for tracing */
  readonly correlationId?: string;
}

// ============================================================================
// Verification Options
// ============================================================================

/**
 * Options for verification process
 */
export interface VerificationOptions {
  /** Specific model IDs to use (overrides default selection) */
  readonly models?: string[];

  /** Minimum number of models required for consensus */
  readonly minModels?: number;

  /** Override consensus threshold (default 2/3) */
  readonly consensusThreshold?: number;

  /** Timeout for entire verification process (ms) */
  readonly timeout?: number;

  /** Timeout per model (ms) */
  readonly perModelTimeout?: number;

  /** Maximum retries per model */
  readonly maxRetries?: number;

  /** Whether to include model costs in result */
  readonly trackCosts?: boolean;

  /** Force verification even for low-severity findings */
  readonly forceVerification?: boolean;

  /** Additional context to provide to models */
  readonly additionalContext?: string;

  /** Source code snippet to include */
  readonly sourceCode?: string;

  /** Related findings for context */
  readonly relatedFindings?: SecurityFinding[];

  /** Skip cache and force fresh verification */
  readonly skipCache?: boolean;

  /** Correlation ID for tracing */
  readonly correlationId?: string;
}

// ============================================================================
// Consensus Engine Interface
// ============================================================================

/**
 * Statistics for the consensus engine
 */
export interface ConsensusStats {
  /** Total verifications performed */
  readonly totalVerifications: number;

  /** Verifications by verdict */
  readonly byVerdict: Record<ConsensusVerdict, number>;

  /** Average confidence across all verifications */
  readonly averageConfidence: number;

  /** Average execution time (ms) */
  readonly averageExecutionTime: number;

  /** Total cost (USD) */
  readonly totalCost: number;

  /** Verifications requiring human review */
  readonly humanReviewCount: number;

  /** Model performance stats */
  readonly modelStats: Record<string, {
    votes: number;
    agreements: number;
    averageConfidence: number;
    averageExecutionTime: number;
    errors: number;
  }>;
}

/**
 * Configuration for the consensus engine
 */
export interface ConsensusEngineConfig {
  /** Default consensus threshold (votes agreeing / total) */
  readonly defaultThreshold: number;

  /** Minimum models required for valid consensus */
  readonly minModels: number;

  /** Maximum models to use per verification */
  readonly maxModels: number;

  /** Default timeout per model (ms) */
  readonly defaultModelTimeout: number;

  /** Default retries per model */
  readonly defaultRetries: number;

  /** Severity levels that require verification */
  readonly verifySeverities: Severity[];

  /** Enable result caching */
  readonly enableCache: boolean;

  /** Cache TTL (ms) */
  readonly cacheTtlMs: number;

  /** Enable cost tracking */
  readonly enableCostTracking: boolean;

  /** Maximum cost per verification (USD) */
  readonly maxCostPerVerification?: number;

  /** Human review threshold (confidence below this triggers review) */
  readonly humanReviewThreshold: number;
}

/**
 * Consensus engine for multi-model security verification
 *
 * Orchestrates multiple model providers to verify security findings,
 * improving detection accuracy by requiring consensus among models.
 *
 * @example
 * ```typescript
 * const engine = createConsensusEngine({
 *   defaultThreshold: 2/3,
 *   minModels: 2,
 *   verifySeverities: ['critical', 'high'],
 * });
 *
 * engine.setModels([claudeProvider, gptProvider]);
 *
 * const result = await engine.verify(securityFinding);
 * if (result.verdict === 'verified') {
 *   // Finding is valid, take action
 * }
 * ```
 */
export interface ConsensusEngine {
  /**
   * Verify a security finding using multiple models
   *
   * @param finding - The security finding to verify
   * @param options - Optional verification configuration
   * @returns Promise resolving to consensus result
   */
  verify(
    finding: SecurityFinding,
    options?: VerificationOptions
  ): Promise<Result<ConsensusResult, Error>>;

  /**
   * Verify multiple findings in batch
   *
   * @param findings - Array of findings to verify
   * @param options - Optional verification configuration
   * @returns Promise resolving to array of consensus results
   */
  verifyBatch(
    findings: SecurityFinding[],
    options?: VerificationOptions
  ): Promise<Result<ConsensusResult[], Error>>;

  /**
   * Get current consensus threshold
   *
   * @returns Current threshold (0-1)
   */
  getThreshold(): number;

  /**
   * Set consensus threshold
   *
   * @param threshold - New threshold (0-1)
   */
  setThreshold(threshold: number): void;

  /**
   * Configure which models to use for verification
   *
   * @param models - Array of model providers
   */
  setModels(models: ModelProvider[]): void;

  /**
   * Get currently configured models
   *
   * @returns Array of model provider IDs
   */
  getModels(): string[];

  /**
   * Add a model provider
   *
   * @param model - Model provider to add
   */
  addModel(model: ModelProvider): void;

  /**
   * Remove a model provider
   *
   * @param modelId - ID of model to remove
   * @returns true if model was removed
   */
  removeModel(modelId: string): boolean;

  /**
   * Get engine configuration
   *
   * @returns Current configuration
   */
  getConfig(): ConsensusEngineConfig;

  /**
   * Update engine configuration
   *
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<ConsensusEngineConfig>): void;

  /**
   * Get verification statistics
   *
   * @returns Current statistics
   */
  getStats(): ConsensusStats;

  /**
   * Reset statistics
   */
  resetStats(): void;

  /**
   * Check if a finding requires verification based on severity
   *
   * @param finding - Finding to check
   * @returns true if verification is required
   */
  requiresVerification(finding: SecurityFinding): boolean;

  /**
   * Dispose engine resources
   */
  dispose(): Promise<void>;
}

// ============================================================================
// Model Provider Interface (for consensus)
// ============================================================================

/**
 * Model provider for consensus verification
 *
 * This extends the base LLM provider concept with specific methods
 * needed for security finding verification.
 */
export interface ModelProvider {
  /** Unique provider identifier (e.g., 'claude', 'openai', 'gemini') */
  readonly id: string;

  /** Human-readable provider name */
  readonly name: string;

  /** Provider type for categorization */
  readonly type: 'claude' | 'openai' | 'gemini' | 'ollama' | 'openrouter' | 'azure-openai' | 'bedrock' | 'custom';

  /**
   * Complete a prompt and return the response
   *
   * @param prompt - The prompt to complete
   * @param options - Optional completion options
   * @returns Promise resolving to completion string
   */
  complete(prompt: string, options?: ModelCompletionOptions): Promise<string>;

  /**
   * Check if provider is available and properly configured
   *
   * @returns Promise resolving to availability status
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get provider health status
   *
   * @returns Promise resolving to health check result
   */
  healthCheck(): Promise<ModelHealthResult>;

  /**
   * Get cost per token for this provider
   *
   * @returns Input and output costs per token in USD
   */
  getCostPerToken(): { input: number; output: number };

  /**
   * Get supported model versions
   *
   * @returns Array of supported model version strings
   */
  getSupportedModels(): string[];

  /**
   * Dispose provider resources
   */
  dispose(): Promise<void>;
}

/**
 * Options for model completion
 */
export interface ModelCompletionOptions {
  /** Specific model version to use */
  readonly model?: string;

  /** Temperature for generation (0-2) */
  readonly temperature?: number;

  /** Maximum tokens to generate */
  readonly maxTokens?: number;

  /** Timeout in milliseconds */
  readonly timeout?: number;

  /** System prompt to use */
  readonly systemPrompt?: string;
}

/**
 * Health check result for model provider
 */
export interface ModelHealthResult {
  /** Whether provider is healthy */
  readonly healthy: boolean;

  /** Latency in ms (if healthy) */
  readonly latencyMs?: number;

  /** Error message (if unhealthy) */
  readonly error?: string;

  /** Available models */
  readonly availableModels?: string[];

  /** Rate limit status */
  readonly rateLimitStatus?: {
    remaining: number;
    resetAt?: Date;
  };
}

// ============================================================================
// Event Types for Consensus
// ============================================================================

/**
 * Events emitted by the consensus engine
 */
export type ConsensusEventType =
  | 'verification:started'
  | 'verification:vote-received'
  | 'verification:completed'
  | 'verification:failed'
  | 'verification:human-review-required'
  | 'model:added'
  | 'model:removed'
  | 'model:unavailable'
  | 'threshold:changed'
  | 'config:updated';

/**
 * Consensus engine event
 */
export interface ConsensusEvent<T = unknown> {
  readonly type: ConsensusEventType;
  readonly timestamp: Date;
  readonly payload: T;
  readonly correlationId?: string;
}

/**
 * Verification started event payload
 */
export interface VerificationStartedPayload {
  readonly findingId: string;
  readonly finding: SecurityFinding;
  readonly models: string[];
}

/**
 * Vote received event payload
 */
export interface VoteReceivedPayload {
  readonly findingId: string;
  readonly vote: ModelVote;
  readonly votesReceived: number;
  readonly votesExpected: number;
}

/**
 * Verification completed event payload
 */
export interface VerificationCompletedPayload {
  readonly findingId: string;
  readonly result: ConsensusResult;
}

// ============================================================================
// Factory Function Types
// ============================================================================

/**
 * Factory function to create a consensus engine
 */
export type CreateConsensusEngine = (
  config?: Partial<ConsensusEngineConfig>,
  models?: ModelProvider[]
) => ConsensusEngine;

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default consensus engine configuration
 */
export const DEFAULT_CONSENSUS_CONFIG: ConsensusEngineConfig = {
  defaultThreshold: 2 / 3,
  minModels: 2,
  maxModels: 3,
  defaultModelTimeout: 30000,
  defaultRetries: 2,
  verifySeverities: ['critical', 'high'],
  enableCache: true,
  cacheTtlMs: 3600000, // 1 hour
  enableCostTracking: true,
  maxCostPerVerification: 0.50, // 50 cents max per verification
  humanReviewThreshold: 0.6,
};
