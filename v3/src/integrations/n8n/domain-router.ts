/**
 * N8n Domain Router
 *
 * Routes n8n workflow testing tasks to the appropriate v3 DDD domain services.
 * Integrates with the v3 domain plugin architecture.
 */

import type { QEDomain } from '../../learning/qe-patterns.js';
import type {
  N8nAgentType,
  N8nRoutingResult,
  WorkflowDomainContext,
} from './types.js';
import { N8N_TO_V3_DOMAIN_MAP, getAgentCapabilities } from './workflow-mapper.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Task to be routed to a v3 domain
 */
export interface N8nTask {
  id: string;
  agentType: N8nAgentType;
  workflowId: string;
  workflowContext?: WorkflowDomainContext;
  payload: unknown;
  priority?: 'low' | 'normal' | 'high' | 'critical';
}

/**
 * Result of routing a task
 */
export interface RoutedTask {
  task: N8nTask;
  routing: N8nRoutingResult;
  domainTasks: DomainTask[];
}

/**
 * Task formatted for a v3 domain
 */
export interface DomainTask {
  domain: QEDomain;
  operation: string;
  payload: unknown;
  metadata: {
    sourceAgent: N8nAgentType;
    workflowId: string;
    capabilities: string[];
  };
}

/**
 * Router configuration
 */
export interface DomainRouterConfig {
  /** Enable multi-domain routing (task goes to multiple domains) */
  enableMultiDomainRouting: boolean;
  /** Minimum confidence for routing */
  minConfidence: number;
  /** Fallback domain if routing fails */
  fallbackDomain: QEDomain;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_ROUTER_CONFIG: DomainRouterConfig = {
  enableMultiDomainRouting: true,
  minConfidence: 0.7,
  fallbackDomain: 'test-execution',
};

// ============================================================================
// Domain Router
// ============================================================================

/**
 * N8n Domain Router
 *
 * Routes n8n testing tasks to v3 DDD domains based on:
 * - Agent type mapping
 * - Workflow context analysis
 * - Capability matching
 */
export class N8nDomainRouter {
  private config: DomainRouterConfig;
  private routingHistory: Map<string, { routing: N8nRoutingResult; timestamp: number }>;

  constructor(config: Partial<DomainRouterConfig> = {}) {
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config };
    this.routingHistory = new Map();
  }

  // ==========================================================================
  // Task Routing
  // ==========================================================================

  /**
   * Route an n8n task to appropriate v3 domain(s)
   */
  routeTask(task: N8nTask): RoutedTask {
    const routing = this.calculateRouting(task);
    const domainTasks = this.createDomainTasks(task, routing);

    // Record routing for learning
    this.routingHistory.set(task.id, {
      routing,
      timestamp: Date.now(),
    });

    return {
      task,
      routing,
      domainTasks,
    };
  }

  /**
   * Calculate routing for a task
   */
  private calculateRouting(task: N8nTask): N8nRoutingResult {
    const mapping = N8N_TO_V3_DOMAIN_MAP[task.agentType];

    if (!mapping) {
      return {
        requestedAgent: task.agentType,
        primaryDomain: this.config.fallbackDomain,
        supportingDomains: [],
        confidence: 0.5,
        explanation: `Unknown agent type: ${task.agentType}`,
        useV2Fallback: true,
      };
    }

    // Adjust routing based on workflow context
    let confidence = 0.9;
    const supportingDomains = [...(mapping.secondaryDomains || [])];

    if (task.workflowContext) {
      // Boost confidence if workflow analysis agrees
      if (task.workflowContext.relevantDomains.includes(mapping.primaryDomain)) {
        confidence = Math.min(1.0, confidence + 0.05);
      }

      // Add additional supporting domains from workflow analysis
      for (const domain of task.workflowContext.relevantDomains) {
        if (domain !== mapping.primaryDomain && !supportingDomains.includes(domain)) {
          supportingDomains.push(domain);
        }
      }
    }

    return {
      requestedAgent: task.agentType,
      primaryDomain: mapping.primaryDomain,
      supportingDomains,
      confidence,
      explanation: `${task.agentType} → ${mapping.primaryDomain}: ${mapping.description}`,
      useV2Fallback: confidence < this.config.minConfidence,
    };
  }

  /**
   * Create domain-specific tasks from routing
   */
  private createDomainTasks(task: N8nTask, routing: N8nRoutingResult): DomainTask[] {
    const tasks: DomainTask[] = [];
    const capabilities = getAgentCapabilities(task.agentType);

    // Primary domain task
    tasks.push({
      domain: routing.primaryDomain,
      operation: this.mapAgentToOperation(task.agentType, routing.primaryDomain),
      payload: task.payload,
      metadata: {
        sourceAgent: task.agentType,
        workflowId: task.workflowId,
        capabilities,
      },
    });

    // Supporting domain tasks (if multi-domain routing enabled)
    if (this.config.enableMultiDomainRouting) {
      for (const domain of routing.supportingDomains) {
        tasks.push({
          domain,
          operation: this.mapAgentToOperation(task.agentType, domain),
          payload: task.payload,
          metadata: {
            sourceAgent: task.agentType,
            workflowId: task.workflowId,
            capabilities,
          },
        });
      }
    }

    return tasks;
  }

  /**
   * Map agent type to domain operation
   */
  private mapAgentToOperation(agentType: N8nAgentType, domain: QEDomain): string {
    const operationMap: Record<string, Record<string, string>> = {
      'security-compliance': {
        'security-auditor': 'scanVulnerabilities',
        'secrets-hygiene-auditor': 'auditSecrets',
        'compliance-validator': 'validateCompliance',
      },
      'test-execution': {
        'workflow-executor': 'executeTest',
        'trigger-test': 'testTriggers',
        'performance-tester': 'runPerformanceTest',
        'replayability-tester': 'testReplayability',
        'idempotency-tester': 'testIdempotency',
      },
      'test-generation': {
        'unit-tester': 'generateUnitTests',
      },
      'chaos-resilience': {
        'chaos-tester': 'runChaosExperiment',
        'failure-mode-tester': 'testFailureModes',
        'monitoring-validator': 'validateMonitoring',
        'idempotency-tester': 'testConcurrency',
      },
      'contract-testing': {
        'contract-tester': 'validateContracts',
        'integration-test': 'testIntegrations',
      },
      'code-intelligence': {
        'expression-validator': 'validateExpressions',
        'node-validator': 'validateNodes',
        'secrets-hygiene-auditor': 'scanCodeForSecrets',
      },
      'requirements-validation': {
        'bdd-scenario-tester': 'runBDDScenarios',
      },
      'quality-assessment': {
        'ci-orchestrator': 'orchestrateCI',
      },
      'defect-intelligence': {
        'version-comparator': 'compareVersions',
      },
    };

    return operationMap[domain]?.[agentType] || 'processTask';
  }

  // ==========================================================================
  // Batch Routing
  // ==========================================================================

  /**
   * Route multiple tasks efficiently
   */
  routeTasks(tasks: N8nTask[]): RoutedTask[] {
    return tasks.map((task) => this.routeTask(task));
  }

  /**
   * Group tasks by primary domain
   */
  groupByDomain(tasks: N8nTask[]): Map<QEDomain, N8nTask[]> {
    const grouped = new Map<QEDomain, N8nTask[]>();

    for (const task of tasks) {
      const routing = this.calculateRouting(task);
      const domain = routing.primaryDomain;

      if (!grouped.has(domain)) {
        grouped.set(domain, []);
      }
      grouped.get(domain)!.push(task);
    }

    return grouped;
  }

  // ==========================================================================
  // History & Learning
  // ==========================================================================

  /**
   * Get routing history for a task
   */
  getRoutingHistory(taskId: string): N8nRoutingResult | undefined {
    return this.routingHistory.get(taskId)?.routing;
  }

  /**
   * Get routing statistics
   */
  getRoutingStats(): {
    totalRouted: number;
    byDomain: Record<string, number>;
    avgConfidence: number;
    v2FallbackCount: number;
  } {
    const byDomain: Record<string, number> = {};
    let totalConfidence = 0;
    let v2FallbackCount = 0;

    for (const entry of this.routingHistory.values()) {
      const domain = entry.routing.primaryDomain;
      byDomain[domain] = (byDomain[domain] || 0) + 1;
      totalConfidence += entry.routing.confidence;
      if (entry.routing.useV2Fallback) v2FallbackCount++;
    }

    return {
      totalRouted: this.routingHistory.size,
      byDomain,
      avgConfidence:
        this.routingHistory.size > 0
          ? totalConfidence / this.routingHistory.size
          : 0,
      v2FallbackCount,
    };
  }

  /**
   * Clear routing history
   */
  clearHistory(): void {
    this.routingHistory.clear();
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Get current configuration
   */
  getConfig(): DomainRouterConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<DomainRouterConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Domain Router instance
 */
export function createDomainRouter(
  config?: Partial<DomainRouterConfig>
): N8nDomainRouter {
  return new N8nDomainRouter(config);
}

/**
 * Singleton instance
 */
let defaultRouter: N8nDomainRouter | null = null;

/**
 * Get the default router instance
 */
export function getDefaultRouter(): N8nDomainRouter {
  if (!defaultRouter) {
    defaultRouter = createDomainRouter();
  }
  return defaultRouter;
}

/**
 * Reset the default router
 */
export function resetDefaultRouter(): void {
  defaultRouter = null;
}
