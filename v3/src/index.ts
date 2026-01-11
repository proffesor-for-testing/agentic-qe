/**
 * Agentic QE v3 - Main Entry Point
 * Domain-Driven Design Architecture with 12 Bounded Contexts
 */

// Shared Kernel - export types and utilities
export * from './shared/types';
export * from './shared/value-objects';
export * from './shared/events';

// Entities - export as namespace to avoid collisions
export * as Entities from './shared/entities';

// Kernel - export core kernel components
// Note: HNSWConfig is also in init, but kernel's is the primary
export * from './kernel';

// Coordination Layer - export coordination components
export * from './coordination';

// Domain Interfaces - export as namespaces
export * from './domains';

// MCP Server - Model Context Protocol integration
// Export only what's available from mcp module
export {
  MCPServer,
  createMCPServer,
  ToolRegistry,
  createToolRegistry,
} from './mcp';

// Learning Module - QE ReasoningBank for pattern learning (ADR-021)
// Exclude types that conflict with routing (ComplexityLevel, ProgrammingLanguage, TestFramework)
export {
  createQEReasoningBank,
  QEReasoningBank,
  RealQEReasoningBank,
  createRealQEReasoningBank,
  detectQEDomain,
  detectQEDomains,
  mapQEDomainToAQE,
  QE_DOMAIN_LIST,
  QE_DOMAINS,
} from './learning';
export type {
  QEPattern,
  QEPatternType,
  QEPatternTemplate,
  QEPatternContext,
  QEDomain,
  CreateQEPatternOptions,
  LearningOutcome,
  PatternSearchOptions,
  PatternSearchResult,
  QERoutingRequest,
  QERoutingResult,
} from './learning';

// Feedback Module - Quality Feedback Loop (ADR-023)
// Exclude types that conflict with shared/types (CoverageMetrics, QualityScore)
export {
  createTestOutcomeTracker,
  createCoverageLearner,
  createQualityScoreCalculator,
  createPatternPromotionManager,
  createQualityFeedbackLoop,
  QualityFeedbackLoop,
  TestOutcomeTracker,
  CoverageLearner,
  QualityScoreCalculator,
  PatternPromotionManager,
  DEFAULT_FEEDBACK_CONFIG,
  DEFAULT_QUALITY_WEIGHTS,
  DEFAULT_PROMOTION_CRITERIA,
} from './feedback';
export type {
  TestOutcome,
  CoverageSession,
  CoverageStrategy,
  CoverageTechnique,
  FeedbackConfig,
  PatternTier,
  CoverageGap as FeedbackCoverageGap,
  QualityDimensions,
  QualityWeights,
  PromotionCriteria,
  PatternPromotionEvent,
  PatternDemotionEvent,
} from './feedback';

// Routing Module - QE Router for agent selection (ADR-022)
export * from './routing';

// Optimization Module - Self-Optimization Engine (ADR-024)
export * from './optimization';

// Init Module - Enhanced Init with Self-Configuration (ADR-025)
// Exclude HNSWConfig (use kernel's), ALL_DOMAINS (use shared/types'), CoverageMetrics (use shared/types')
export {
  createDefaultConfig,
  createProjectAnalyzer,
  createSelfConfigurator,
  createInitOrchestrator,
  quickInit,
  formatInitResult,
  ProjectAnalyzer,
  SelfConfigurator,
  InitOrchestrator,
  DEFAULT_LEARNING_CONFIG,
  DEFAULT_ROUTING_CONFIG,
  DEFAULT_WORKERS_CONFIG,
  DEFAULT_HOOKS_CONFIG,
  DEFAULT_AUTO_TUNING_CONFIG,
} from './init';
export type {
  ProjectAnalysis,
  DetectedFramework,
  DetectedLanguage,
  ExistingTests,
  CodeComplexity,
  AQEInitConfig,
  LearningConfig,
  RoutingConfig as InitRoutingConfig,
  WorkersConfig,
  HooksConfig,
  AutoTuningConfig,
  InitResult,
  InitStepResult,
  WizardStep,
  WizardOption,
  WizardState,
  PretrainedPattern,
  PretrainedLibrary,
  InitOrchestratorOptions,
} from './init';

// Strange Loop Self-Awareness Module (ADR-031)
export {
  // Observer
  SwarmObserver,
  createSwarmObserver,
  createInMemorySwarmObserver,
  InMemoryAgentProvider,
  // Topology Analyzer
  TopologyAnalyzer,
  createTopologyAnalyzer,
  // Self-Model
  SwarmSelfModel,
  createSwarmSelfModel,
  // Self-Healing Controller
  SelfHealingController,
  createSelfHealingController,
  NoOpActionExecutor,
  // Strange Loop Orchestrator
  StrangeLoopOrchestrator,
  createStrangeLoopOrchestrator,
  createInMemoryStrangeLoop,
  // Config
  DEFAULT_STRANGE_LOOP_CONFIG,
} from './strange-loop';
export type {
  // Topology types
  TopologyType,
  AgentNode,
  CommunicationEdge,
  SwarmTopology,
  // Health metrics
  AgentHealthMetrics as StrangeLoopAgentHealthMetrics,
  ConnectivityMetrics,
  SwarmVulnerability,
  // Observation
  SwarmHealthObservation,
  // Self-modeling
  TrendDirection,
  TrendAnalysis,
  BottleneckInfo,
  BottleneckAnalysis,
  PredictedVulnerability,
  SwarmModelDelta,
  // Self-healing
  SelfHealingActionType,
  ActionPriority,
  SelfHealingAction,
  ActionResult,
  ExecutedAction,
  // Self-diagnosis
  SelfDiagnosis,
  // Config and stats
  StrangeLoopConfig,
  StrangeLoopStats,
  // Events
  StrangeLoopEventType,
  StrangeLoopEvent,
  StrangeLoopEventListener,
  // Interfaces
  AgentProvider,
  ActionExecutor,
} from './strange-loop';

// Version info
export const VERSION = '3.0.0-alpha';
export const ARCHITECTURE = 'DDD with 12 Bounded Contexts';
export const MAX_CONCURRENT_AGENTS = 15;

/**
 * Quick start example:
 *
 * ```typescript
 * import { createKernel } from '@agentic-qe/v3';
 *
 * const kernel = createKernel({
 *   maxConcurrentAgents: 15,
 *   memoryBackend: 'hybrid',
 *   hnswEnabled: true,
 * });
 *
 * await kernel.initialize();
 *
 * // Use domain APIs
 * const testGen = kernel.getDomainAPI<TestGenerationAPI>('test-generation');
 * const result = await testGen.generateTests({ ... });
 * ```
 */
