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
