/**
 * Agentic QE v3 - Quality Assessment Services
 * Service layer exports for the quality-assessment domain
 */

export {
  QualityGateService,
  type IQualityGateService,
  type QualityGateConfig,
} from './quality-gate';

export {
  QualityAnalyzerService,
  type IQualityAnalyzerService,
  type QualityAnalyzerConfig,
} from './quality-analyzer';

export {
  DeploymentAdvisorService,
  type IDeploymentAdvisorService,
  type DeploymentAdvisorConfig,
  type DeploymentAccuracy,
} from './deployment-advisor';

// ============================================================================
// Coherence-Gated Quality Gates (ADR-030)
// ============================================================================

export {
  CoherenceGateService,
  createCoherenceGateService,
  type CoherenceGateResult,
  type CoherenceGateServiceConfig,
} from './coherence-gate';
