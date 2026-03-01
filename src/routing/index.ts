/**
 * QE Agent Routing Module
 * ADR-022: Adaptive QE Agent Routing
 *
 * ML-based task routing that combines:
 * - Vector similarity (semantic matching via transformer embeddings)
 * - Historical performance (agent success rates from feedback)
 * - Capability matching (task requirements vs agent capabilities)
 */

// Types
export type {
  QEAgentProfile,
  QETask,
  QERoutingDecision,
  AgentScore,
  RoutingWeights,
  QERouterConfig,
  RoutingOutcome,
  AgentPerformanceMetrics,
  AgentCapability,
  ProgrammingLanguage,
  TestFramework,
  ComplexityLevel,
} from './types.js';

export { DEFAULT_ROUTER_CONFIG } from './types.js';

// Registry
export {
  QE_AGENT_REGISTRY,
  getAgentsByDomain,
  getAgentsByCapability,
  getAgentsByLanguage,
  getAgentsByFramework,
  getAgentsByComplexity,
  getAgentById,
  getAgentCounts,
} from './qe-agent-registry.js';

// Router
export {
  QETaskRouter,
  createQETaskRouter,
} from './qe-task-router.js';

// Feedback
export {
  RoutingFeedbackCollector,
  createRoutingFeedbackCollector,
} from './routing-feedback.js';

// Task Classifier (TD-002)
export {
  classifyTask,
  isSimpleTask,
  requiresOpus,
  getRecommendedModel,
  getComplexityScore,
  COMPLEX_DOMAINS,
  MODERATE_DOMAINS,
  COMPLEX_CAPABILITIES,
  COMPLEXITY_THRESHOLDS,
  COMPLEXITY_TO_MODEL,
} from './task-classifier.js';

export type {
  TaskComplexity,
  ClaudeModel,
  ComplexityFactor,
  ClassificationResult,
  ClassifiableTask,
} from './task-classifier.js';

// TinyDancer Router (TD-003)
export {
  TinyDancerRouter,
  createTinyDancerRouter,
} from './tiny-dancer-router.js';

export type {
  RouteResult,
  TinyDancerConfig,
  RoutingOutcome as TinyDancerRoutingOutcome,
  RouterStats,
} from './tiny-dancer-router.js';

// Routing Configuration (TD-004)
export {
  DEFAULT_ROUTING_CONFIG,
  DEFAULT_CONFIDENCE_THRESHOLDS,
  DEFAULT_TIER_MAPPING,
  DEFAULT_COST_OPTIMIZATION,
  DEFAULT_FALLBACK_CONFIG,
  loadRoutingConfigFromEnv,
  mapComplexityToTier,
  getNextFallbackTier,
  tierToModel,
  estimateTaskCost,
  validateRoutingConfig,
} from './routing-config.js';

export type {
  AgentTier,
  ConfidenceThresholds,
  ComplexityTierMapping,
  CostOptimizationConfig,
  FallbackConfig,
  RoutingConfig,
} from './routing-config.js';

// Queen Integration (TD-005)
export {
  QueenRouterAdapter,
  createQueenRouterAdapter,
} from './queen-integration.js';

export type {
  QueenRouteDecision,
  TaskOutcome,
  CostStats,
  QueenRouterConfig,
} from './queen-integration.js';
