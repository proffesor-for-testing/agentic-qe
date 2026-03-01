/**
 * Agentic QE v3 - Multi-Model Consensus Module
 * Phase 2: Multi-Model Verification for Security Findings
 *
 * This module provides multi-model consensus verification for security findings,
 * improving detection accuracy from 27% to 75%+ by requiring agreement among
 * multiple AI models before confirming security vulnerabilities.
 *
 * Key Components:
 * - ConsensusEngine: Orchestrates multi-model verification
 * - ModelProvider: Abstract interface for model providers
 * - Verification prompt building and response parsing
 *
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 2
 *
 * @example
 * ```typescript
 * import {
 *   ConsensusEngine,
 *   createProviderRegistry,
 *   DEFAULT_CONSENSUS_CONFIG,
 * } from './coordination/consensus';
 *
 * // Register model providers
 * const registry = createProviderRegistry([
 *   new ClaudeConsensusProvider(config),
 *   new GPTConsensusProvider(config),
 * ]);
 *
 * // Create consensus engine (implementation TBD in MM-006)
 * const engine = createConsensusEngine(DEFAULT_CONSENSUS_CONFIG, registry.getAll());
 *
 * // Verify a security finding
 * const result = await engine.verify(finding);
 * if (result.success && result.value.verdict === 'verified') {
 *   // Finding confirmed by multiple models
 * }
 * ```
 */

// ============================================================================
// Core Interfaces (MM-001)
// ============================================================================

export type {
  // Security Finding Types
  FindingLocation,
  FindingEvidence,
  SecurityFindingCategory,
  SecurityFinding,

  // Model Vote Types
  VoteAssessment,
  ModelVote,

  // Consensus Result Types
  ConsensusVerdict,
  ConsensusResult,

  // Verification Options
  VerificationOptions,

  // Consensus Engine Types
  ConsensusStats,
  ConsensusEngineConfig,
  ConsensusEngine,

  // Model Provider Types
  ModelProvider,
  ModelCompletionOptions,
  ModelHealthResult,

  // Event Types
  ConsensusEventType,
  ConsensusEvent,
  VerificationStartedPayload,
  VoteReceivedPayload,
  VerificationCompletedPayload,

  // Factory Types
  CreateConsensusEngine,
} from './interfaces';

export { DEFAULT_CONSENSUS_CONFIG } from './interfaces';

// ============================================================================
// Model Provider Abstraction (MM-002)
// ============================================================================

export {
  // Base Provider
  BaseModelProvider,

  // Prompt Building
  buildVerificationPrompt,
  type VerificationPromptOptions,

  // Response Parsing
  parseVerificationResponse,
  type ParsedVerificationResponse,

  // Vote Building
  buildModelVote,
  type VoteBuildOptions,

  // Mock Provider for Testing
  MockModelProvider,
  type MockProviderConfig,

  // Provider Registry
  ModelProviderRegistry,

  // Factory Functions
  createMockProvider,
  createProviderRegistry,
} from './model-provider';

// ============================================================================
// Concrete Provider Implementations (MM-003, MM-004, MM-005)
// ============================================================================

export {
  // Claude Provider
  ClaudeModelProvider,
  createClaudeProvider,
  type ClaudeProviderConfig,
  type ClaudeAPIModel,

  // OpenAI Provider
  OpenAIModelProvider,
  createOpenAIProvider,
  type OpenAIProviderConfig,
  type OpenAIModel,

  // Gemini Provider
  GeminiModelProvider,
  createGeminiProvider,
  type GeminiProviderConfig,
  type GeminiModel,

  // OpenRouter Provider (supports 100+ models via unified API)
  OpenRouterModelProvider,
  createOpenRouterProvider,
  createMultiModelProviders,
  getRecommendedSecurityModels,
  getCostOptimizedModels,
  type OpenRouterProviderConfig,
  type OpenRouterModel,

  // Ollama Provider (local/on-prem models)
  OllamaModelProvider,
  createOllamaProvider,
  createMultiOllamaProviders,
  isOllamaAvailable,
  getRecommendedOllamaModels,
  getLightweightOllamaModels,
  getCodeOllamaModels,
  type OllamaProviderConfig,
  type OllamaModel,

  // Native Learning Provider (uses cached patterns first)
  NativeLearningProvider,
  createNativeLearningProvider,
  withNativeLearning,
  type NativeLearningProviderConfig,
  type SecurityVerificationPattern,
  type PatternMatchResult,

  // Provider Registration
  registerAllProviders,
  registerProvidersFromEnv,
  getRecommendedProviders,
  getHealthyProviders,
  type RegisterProvidersConfig,
} from './providers';

// ============================================================================
// Consensus Strategies (MM-007, MM-008, MM-009)
// ============================================================================

export {
  // Strategy Types
  type ConsensusStrategyType,
  type ConsensusStrategyResult,

  // Majority Strategy
  MajorityStrategy,
  createMajorityStrategy,
  type MajorityStrategyConfig,

  // Weighted Strategy
  WeightedStrategy,
  createWeightedStrategy,
  type WeightedStrategyConfig,

  // Unanimous Strategy
  UnanimousStrategy,
  createUnanimousStrategy,
  type UnanimousStrategyConfig,

  // Strategy Factory
  createStrategy,
} from './strategies';

// ============================================================================
// Consensus Engine Implementation (MM-006)
// ============================================================================

export {
  ConsensusEngineImpl,
  setConsensusStrategy,
} from './consensus-engine';

// ============================================================================
// Factory Functions (MM-010)
// ============================================================================

export {
  createConsensusEngine,
  createConsensusEngineWithProviders,
  createTestConsensusEngine,
  createCriticalConsensusEngine,
  createCostOptimizedEngine,
  createHighAccuracyEngine,
  type CreateConsensusEngineConfig,
} from './factory';

// ============================================================================
// Domain Finding Types (for cross-domain consensus)
// ============================================================================

export {
  createDomainFinding,
  isHighStakesFinding,
  generateFindingId,
} from './domain-findings';

export type {
  DomainFinding,
  FindingSeverity,
  FindingLocation as DomainFindingLocation,
  FindingEvidence as DomainFindingEvidence,
  SecurityFindingPayload,
  // CoverageGapPayload - already exported from shared/events
  DefectPredictionPayload,
  ContractViolationPayload,
} from './domain-findings';
