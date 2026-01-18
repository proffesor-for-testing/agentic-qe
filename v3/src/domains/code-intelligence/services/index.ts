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

export {
  ProductFactorsBridgeService,
  createProductFactorsBridge,
  type IProductFactorsBridge,
  type ProductFactorsBridgeConfig,
} from './product-factors-bridge';

export {
  C4ModelService,
  createC4ModelService,
  type IC4ModelService,
  type C4ModelServiceConfig,
  type C4ContextDiagram,
  type C4ContainerDiagram,
  type C4ComponentDiagram,
  type C4Person,
  type C4System,
  type C4Container,
  type C4Component,
  type C4Relationship,
  type C4DiagramMetadata,
  type C4DiagramOptions,
  type BuildContextRequest,
  type BuildContainerRequest,
  type BuildComponentRequest,
  type DiagramResult,
  type StoredDiagram,
  type DiagramSearchResult,
  type ArchitectureAnalysis,
  type ArchitectureRecommendation,
  type CouplingAnalysis,
  type ContainerType,
  type ComponentType,
  type SystemType,
  type C4RelationshipType,
} from './c4-model';

// Metric Collector Service (RM-001, RM-002, RM-003)
export {
  MetricCollectorService,
  createMetricCollector,
  countLOC,
  countTests,
  detectTestRunner,
  checkLOCTools,
  checkTestRunners,
  type IMetricCollectorService,
  type MetricCollector,
  type MetricCollectorConfig,
  type ProjectMetrics,
  type LOCMetrics,
  type TestMetrics,
  type PatternMetrics,
  type PatternCounts,
  type ToolAvailability,
  DEFAULT_METRIC_CONFIG,
} from './metric-collector';
