/**
 * Agentic QE v3 - MCP Tools Module
 *
 * This module implements ADR-010: MCP-First Tool Design
 * All QE functionality is exposed as MCP tools first, with CLI as thin wrappers.
 *
 * Tool naming convention: qe/<domain>/<action>
 * Example: qe/tests/generate, qe/coverage/analyze
 *
 * 19 Tools across 13 DDD Domains:
 * 1. qe/tests/generate       - Test generation (AI-powered)
 * 2. qe/tests/execute        - Test execution (parallel, retry, flaky detection)
 * 3. qe/coverage/analyze     - Coverage analysis
 * 4. qe/coverage/gaps        - Coverage gap detection (O(log n) HNSW)
 * 5. qe/quality/evaluate     - Quality gate evaluation
 * 6. qe/defects/predict      - Defect prediction (ML)
 * 7. qe/requirements/validate - Requirements validation
 * 8. qe/code/analyze         - Code intelligence (knowledge graph)
 * 9. qe/security/scan        - Security scanning (SAST/DAST)
 * 10. qe/contracts/validate  - Contract testing
 * 11. qe/visual/compare      - Visual regression
 * 12. qe/a11y/audit          - Accessibility audit
 * 13. qe/chaos/inject        - Chaos engineering
 * 14. qe/learning/optimize   - Learning optimization
 * 15. qe/analysis/token_usage - Token consumption analysis (ADR-042)
 * 16. qe/coherence/check     - Coherence verification (ADR-052)
 * 17. qe/coherence/audit     - Memory coherence audit (ADR-052)
 * 18. qe/coherence/consensus - Multi-agent consensus verification (ADR-052)
 * 19. qe/coherence/collapse  - Swarm collapse prediction (ADR-052)
 */

// ============================================================================
// Base Infrastructure
// ============================================================================

export {
  MCPToolBase,
  type MCPToolConfig,
  type MCPToolSchema,
  type MCPSchemaProperty,
  type MCPToolContext,
  type StreamCallback,
} from './base';

// ============================================================================
// Test Generation Domain
// ============================================================================

export {
  TestGenerateTool,
  type TestGenerateParams,
  type TestGenerateResult,
  type GeneratedTest,
  type AntiPattern,
} from './test-generation/generate';

// ============================================================================
// Test Execution Domain
// ============================================================================

export {
  TestExecuteTool,
  type TestExecuteParams,
  type TestExecuteResult,
  type TestSummary,
  type TestResult,
  type FlakyTest,
} from './test-execution/execute';

// ============================================================================
// Coverage Analysis Domain
// ============================================================================

export {
  CoverageAnalyzeTool,
  CoverageGapsTool,
  type CoverageAnalyzeParams,
  type CoverageAnalyzeResult,
  type CoverageGapsParams,
  type CoverageGapsResult,
  type CoverageGap,
  type TestSuggestion,
} from './coverage-analysis';

// ============================================================================
// Quality Assessment Domain
// ============================================================================

export {
  QualityEvaluateTool,
  type QualityEvaluateParams,
  type QualityEvaluateResult,
  type QualityCheck,
  type DeploymentAdvice,
  type Recommendation,
} from './quality-assessment/evaluate';

// ============================================================================
// Defect Intelligence Domain
// ============================================================================

export {
  DefectPredictTool,
  type DefectPredictParams,
  type DefectPredictResult,
  type FilePrediction,
  type RiskFactor,
} from './defect-intelligence/predict';

// ============================================================================
// Requirements Validation Domain
// ============================================================================

export {
  RequirementsValidateTool,
  type RequirementsValidateParams,
  type RequirementsValidateResult,
  type RequirementInput,
  type ValidationResult,
  type TestabilityScore,
  type BDDScenario,
} from './requirements-validation/validate';

export {
  QualityCriteriaTool,
  qualityCriteriaTool,
  type QualityCriteriaParams,
  type QualityCriteriaResult,
  type EvidencePointInput,
  type AgentInvocation,
} from './requirements-validation/quality-criteria';

// ============================================================================
// Code Intelligence Domain
// ============================================================================

export {
  CodeAnalyzeTool,
  type CodeAnalyzeParams,
  type CodeAnalyzeResult,
  type IndexResult,
  type SearchResult,
  type ImpactResult,
  type DependencyResult,
} from './code-intelligence/analyze';

// ============================================================================
// Security Compliance Domain
// ============================================================================

export {
  SecurityScanTool,
  type SecurityScanParams,
  type SecurityScanResult,
  type Vulnerability,
  type ScanSummary,
  type ComplianceResult,
} from './security-compliance/scan';

// ============================================================================
// Contract Testing Domain
// ============================================================================

export {
  ContractValidateTool,
  type ContractValidateParams,
  type ContractValidateResult,
  type BreakingChange,
  type VerificationResult,
  type CompatibilityReport,
} from './contract-testing/validate';

// ============================================================================
// Visual Accessibility Domain
// ============================================================================

export {
  VisualCompareTool,
  A11yAuditTool,
  type VisualCompareParams,
  type VisualCompareResult,
  type A11yAuditParams,
  type A11yAuditResult,
  type A11yViolation,
  type VisualComparison,
} from './visual-accessibility';

// ============================================================================
// Chaos Resilience Domain
// ============================================================================

export {
  ChaosInjectTool,
  type ChaosInjectParams,
  type ChaosInjectResult,
  type FaultType,
  type ExperimentStatus,
  type Incident,
} from './chaos-resilience/inject';

// ============================================================================
// Learning Optimization Domain
// ============================================================================

export {
  LearningOptimizeTool,
  type LearningOptimizeParams,
  type LearningOptimizeResult,
  type LearnResult,
  type OptimizeResult,
  type TransferResult,
  type PatternResult,
  type DashboardResult,
} from './learning-optimization/optimize';

// ============================================================================
// Analysis Tools (ADR-042)
// ============================================================================

export {
  TokenUsageTool,
  tokenUsageTool,
  type TokenUsageParams,
  type TokenUsageResult,
  type AgentMetricsDetail,
  type DomainMetricsDetail,
  type TaskMetricsDetail,
} from './analysis/token-usage';

// ============================================================================
// ONNX Embeddings Domain (ADR-051)
// ============================================================================

export {
  EmbeddingGenerateTool,
  EmbeddingCompareTool,
  EmbeddingSearchTool,
  EmbeddingStoreTool,
  EmbeddingStatsTool,
  embeddingGenerateTool,
  embeddingCompareTool,
  embeddingSearchTool,
  embeddingStoreTool,
  embeddingStatsTool,
  resetEmbeddingAdapter,
  type EmbeddingGenerateParams,
  type EmbeddingGenerateResult,
  type EmbeddingCompareParams,
  type EmbeddingCompareResult,
  type EmbeddingSearchParams,
  type EmbeddingSearchResult,
  type EmbeddingStoreParams,
  type EmbeddingStoreResult,
  type EmbeddingStatsResult,
} from './embeddings';

// ============================================================================
// Coherence Domain (ADR-052)
// ============================================================================

export {
  CoherenceCheckTool,
  CoherenceAuditTool,
  CoherenceConsensusTool,
  CoherenceCollapseTool,
  createCoherenceCheckTool,
  createCoherenceAuditTool,
  createCoherenceConsensusTool,
  createCoherenceCollapseTool,
  COHERENCE_TOOLS,
  COHERENCE_TOOL_NAMES,
  type CoherenceCheckParams,
  type CoherenceCheckResult,
  type CoherenceAuditParams,
  type CoherenceAuditResult,
  type CoherenceConsensusParams,
  type CoherenceConsensusResult,
  type CoherenceCollapseParams,
  type CoherenceCollapseResult,
} from './coherence';

// ============================================================================
// Registry and Registration
// ============================================================================

export {
  QE_TOOL_NAMES,
  QE_TOOLS,
  registerAllQETools,
  getQETool,
  getToolsByDomain,
  getToolDefinition,
  getAllToolDefinitions,
} from './registry';
