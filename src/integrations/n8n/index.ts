/**
 * N8n Platform Integration
 *
 * Lightweight platform adapter that bridges v2 n8n workflow testing agents
 * with v3 DDD domain architecture.
 *
 * @module agentic-qe/integrations/n8n
 *
 * Features:
 * - Domain mapping: Maps 19 n8n agents to 9 v3 domains
 * - Workflow analysis: Analyzes n8n workflows for relevant domains
 * - Task routing: Routes n8n testing tasks to appropriate v3 domains
 * - Agent factory: Creates v2 agents with v3 integration
 *
 * Usage:
 * ```typescript
 * import { createN8nAdapter, createDomainRouter } from 'agentic-qe/integrations/n8n';
 *
 * // Create adapter
 * const adapter = createN8nAdapter();
 *
 * // Check availability
 * if (adapter.isAvailable()) {
 *   // Analyze workflow
 *   const context = adapter.analyzeWorkflow(workflow);
 *
 *   // Route task
 *   const router = createDomainRouter();
 *   const routed = router.routeTask({
 *     id: 'task-1',
 *     agentType: 'security-auditor',
 *     workflowId: workflow.id,
 *     payload: { ... }
 *   });
 * }
 * ```
 */

// Types - import for local use
import type {
  N8nAgentType,
  WorkflowDomainContext,
  N8nRoutingResult,
} from './types.js';

// Types - re-export for consumers
export type {
  N8nAgentType,
  N8nToDomainMapping,
  WorkflowDomainContext,
  N8nAdapterConfig,
  N8nRoutingResult,
  WorkflowAnalysisRequest,
  WorkflowAnalysisResult,
  N8nPlatformConfig,
  N8nInitResult,
} from './types.js';

export {
  ALL_N8N_AGENT_TYPES,
  N8N_AGENT_CATEGORIES,
} from './types.js';

// Workflow Mapper
export {
  N8N_TO_V3_DOMAIN_MAP,
  getAgentsForDomain,
  getPrimaryDomain,
  getAllDomains,
  analyzeWorkflowForDomains,
  findAgentsByCapability,
  getAgentCapabilities,
  getAgentDescription,
} from './workflow-mapper.js';

// N8n Adapter
export {
  N8nPlatformAdapter,
  createN8nAdapter,
  getDefaultAdapter,
  resetDefaultAdapter,
} from './n8n-adapter.js';

// Domain Router
export type {
  N8nTask,
  RoutedTask,
  DomainTask,
  DomainRouterConfig,
} from './domain-router.js';

export {
  N8nDomainRouter,
  createDomainRouter,
  getDefaultRouter,
  resetDefaultRouter,
} from './domain-router.js';

// Agent Factory
export type {
  N8nAgentFactoryConfig,
  N8nAgentInstance,
  AgentPoolStatus,
} from './agent-factory.js';

export {
  N8nAgentFactory,
  createAgentFactory,
  getDefaultFactory,
  resetDefaultFactory,
} from './agent-factory.js';

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Check if n8n integration is available
 */
export function isN8nAvailable(): boolean {
  const { getDefaultAdapter } = require('./n8n-adapter.js');
  return getDefaultAdapter().isAvailable();
}

/**
 * Quick workflow analysis
 */
export function analyzeN8nWorkflow(workflow: {
  id?: string;
  name?: string;
  nodes: Array<{ type: string; name: string; credentials?: unknown }>;
  connections: unknown;
  settings?: { errorWorkflow?: string };
}): WorkflowDomainContext {
  const { getDefaultAdapter } = require('./n8n-adapter.js');
  return getDefaultAdapter().analyzeWorkflow(workflow);
}

/**
 * Route an n8n agent type to v3 domain
 */
export function routeN8nAgent(agentType: N8nAgentType): N8nRoutingResult {
  const { getDefaultAdapter } = require('./n8n-adapter.js');
  return getDefaultAdapter().routeAgentToDomain(agentType);
}

// Re-export relevant types from v2 for convenience
export type {
  N8nAPIConfig,
  N8nWorkflow,
  N8nNode,
  N8nExecution,
  ValidationResult,
  SecurityFinding,
  SecurityAuditResult,
} from './types.js';
