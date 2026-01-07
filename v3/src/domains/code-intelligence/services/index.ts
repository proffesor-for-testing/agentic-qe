/**
 * Agentic QE v3 - Code Intelligence Services
 * Service layer exports for the code-intelligence domain
 */

export {
  KnowledgeGraphService,
  type IKnowledgeGraphService,
  type KnowledgeGraphConfig,
} from './knowledge-graph';

export {
  SemanticAnalyzerService,
  type ISemanticAnalyzerService,
  type SemanticAnalyzerConfig,
  type SemanticAnalysis,
  type CodeComplexity,
  type HalsteadMetrics,
} from './semantic-analyzer';

export {
  ImpactAnalyzerService,
  type IImpactAnalyzerService,
  type ImpactAnalyzerConfig,
  type RiskWeights,
} from './impact-analyzer';
