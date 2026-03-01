/**
 * Governance Module - @claude-flow/guidance integration
 *
 * This module provides governance mechanisms for the Agentic QE Fleet:
 * - ContinueGate: Loop detection and throttling
 * - MemoryWriteGate: Contradiction detection
 * - TrustAccumulator: Agent trust scoring
 * - DeterministicGateway: Tool idempotency enforcement
 * - EvolutionPipeline: Rule effectiveness tracking and pattern evolution
 * - ShardRetriever: Semantic shard retrieval for domain governance
 * - WasmKernelIntegration: WASM-accelerated crypto operations with JS fallback
 * - ProofEnvelope: Audit trails
 * - BudgetMeter: Cost tracking
 * - AdversarialDefense: Prompt injection and malicious input detection
 * - ConstitutionalEnforcer: 7 invariant enforcement from constitution.md
 *
 * @module governance
 * @see ADR-058-guidance-governance-integration.md
 */

// Feature flags for gradual rollout
export {
  DEFAULT_GOVERNANCE_FLAGS,
  governanceFlags,
  isABBenchmarkingEnabled,
  isAdversarialDefenseEnabled,
  isBudgetMeterEnabled,
  isComplianceReporterEnabled,
  isConstitutionalEnforcerEnabled,
  isContinueGateEnabled,
  isDeterministicGatewayEnabled,
  isEvolutionPipelineEnabled,
  isMemoryWriteGateEnabled,
  isProofEnvelopeEnabled,
  isShardRetrieverEnabled,
  isShardEmbeddingsEnabled,
  isStrictMode,
  isTrustAccumulatorEnabled,
  loadFlagsFromEnv,
  mergeFlags,
} from './feature-flags.js';

// Gate integrations
export * from './continue-gate-integration.js';
export * from './memory-write-gate-integration.js';

// Trust accumulator - explicit exports to avoid conflicts
export {
  TrustAccumulatorIntegration,
  trustAccumulatorIntegration,
  createTaskOutcome as createTrustTaskOutcome,
  type TrustTier,
  type TaskOutcome as TrustTaskOutcome,
  type AgentTrustMetrics,
  type AgentSelectionResult,
  type TierThresholds,
} from './trust-accumulator-integration.js';

export * from './deterministic-gateway-integration.js';

// Evolution pipeline - explicit exports to avoid conflicts
export {
  EvolutionPipelineIntegration,
  evolutionPipelineIntegration,
  createTaskOutcome as createEvolutionTaskOutcome,
  withRuleTracking,
  type RuleContext,
  type RuleEffectiveness,
  type DomainEffectiveness,
  type TaskTypeEffectiveness,
  type PromotionStatus,
  type RuleModifications,
  type TaskOutcome as EvolutionTaskOutcome,
  type RuleOptimization,
  type VariantTest,
  type VariantResult,
  type EvolutionStats,
} from './evolution-pipeline-integration.js';

// Queen integration adapter
export * from './queen-governance-adapter.js';

// WASM kernel integration
export * from './wasm-kernel-integration.js';

// Proof envelope integration
export {
  ProofEnvelopeIntegration,
  proofEnvelopeIntegration,
  createProofEnvelopeIntegration,
  isProofRequiredForClaims,
  type ProofEnvelope,
  type VerificationResult,
  type ChainVerificationResult,
  type TamperDetectionResult,
  type ProofStats,
} from './proof-envelope-integration.js';

// Shard retriever integration
export {
  ShardRetrieverIntegration,
  shardRetrieverIntegration,
  DEFAULT_SHARD_RETRIEVER_FLAGS,
  type ShardContent,
  type ShardRetrieverFlags,
  type AgentConstraints,
  type AgentRole,
  type EscalationTrigger,
  type QualityThresholds,
  type IntegrationPoint,
  type PatternReference,
  type TaskContext,
  type InjectedRules,
  type ShardStats,
  type CacheStats,
} from './shard-retriever-integration.js';

// Re-export additional types from feature-flags
export type { GovernanceFeatureFlags } from './feature-flags.js';

// Re-export additional types from queen-governance-adapter
export type {
  TaskGovernanceContext,
  TaskGovernanceDecision,
  MemoryWriteContext,
  AgentActionContext,
} from './queen-governance-adapter.js';

// Re-export types from wasm-kernel-integration
export type { WasmKernelMetrics } from './wasm-kernel-integration.js';

// A/B Benchmarking Framework
export {
  ABBenchmarkingFramework,
  abBenchmarkingFramework,
  createBenchmarkConfig,
  runQuickBenchmark,
  isABBenchmarkingEnabled as isABBenchmarkingFrameworkEnabled,
  type MetricType,
  type MetricConfig,
  type VariantConfig,
  type BenchmarkConfig,
  type MetricDataPoint,
  type VariantMetrics,
  type Benchmark,
  type MetricStatistics,
  type SignificanceResult,
  type ComparisonResult,
  type WinnerResult,
  type SuggestionResult,
  type BenchmarkSummary,
  type BenchmarkResults,
} from './ab-benchmarking.js';

// Shard Embeddings Manager
export {
  ShardEmbeddingsManager,
  shardEmbeddingsManager,
  DEFAULT_SHARD_EMBEDDINGS_FLAGS,
  type SectionType,
  type ShardEmbedding,
  type SimilarityResult,
  type RelevantShard,
  type IndexStats,
  type ShardEmbeddingsFlags,
} from './shard-embeddings.js';

// Adversarial Defense Integration
export {
  AdversarialDefenseIntegration,
  adversarialDefenseIntegration,
  quickThreatAssess,
  isSafeInput,
  sanitizeUserInput,
  type ThreatContext,
  type DetectedPattern,
  type ThreatAssessment,
  type DetectionPattern,
  type ThreatCategory,
  type PatternStats,
  type DefenseStats,
} from './adversarial-defense-integration.js';

// Compliance Reporter
export {
  ComplianceReporter,
  complianceReporter,
  createComplianceReporter,
  isComplianceReporterEnabled as isComplianceReporterFeatureEnabled,
  DEFAULT_COMPLIANCE_REPORTER_FLAGS,
  type ViolationType,
  type ViolationSeverity,
  type ComplianceViolation,
  type ViolationFilter,
  type TimeWindow,
  type ComplianceScore,
  type ReportOptions,
  type ComplianceReport,
  type Alert,
  type ComplianceStats,
  type ComplianceReporterFlags,
} from './compliance-reporter.js';

// Constitutional Enforcer
export {
  ConstitutionalEnforcer,
  constitutionalEnforcer,
  createConstitutionalEnforcer,
  isConstitutionalEnforcementEnabled,
  isStrictEnforcementEnabled,
  DEFAULT_CONSTITUTIONAL_ENFORCER_FLAGS,
  type Invariant,
  type InvariantCheck,
  type EnforcementResult,
  type EnforcementStats,
  type ExecutionProof,
  type SecurityScan,
  type Backup,
  type DeleteOperation,
  type AgentStats as ConstitutionalAgentStats,
  type MemoryPattern as ConstitutionalMemoryPattern,
  type Verification,
  type ConstitutionalEnforcerFlags,
} from './constitutional-enforcer.js';
