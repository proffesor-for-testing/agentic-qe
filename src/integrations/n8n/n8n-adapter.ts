/**
 * N8n Platform Adapter
 *
 * Core adapter that bridges v2 n8n agents with v3 DDD domains.
 * Provides workflow analysis, domain routing, and agent coordination.
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import type { QEDomain } from '../../learning/qe-patterns.js';
import type {
  N8nAdapterConfig,
  N8nAgentType,
  N8nRoutingResult,
  WorkflowAnalysisRequest,
  WorkflowAnalysisResult,
  WorkflowDomainContext,
} from './types.js';
import {
  N8N_TO_V3_DOMAIN_MAP,
  analyzeWorkflowForDomains,
  getAllDomains,
  getPrimaryDomain,
} from './workflow-mapper.js';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: N8nAdapterConfig = {
  v2AgentsAvailable: false,
  enableDomainRouting: true,
  enableCaching: true,
  cacheTTLMs: 60000, // 1 minute
};

// ============================================================================
// N8n Platform Adapter
// ============================================================================

/**
 * N8n Platform Adapter
 *
 * Bridges v2 n8n testing agents with v3 DDD domain architecture.
 * Provides:
 * - Availability checking for v2 agents
 * - Workflow analysis and domain mapping
 * - Task routing to appropriate v3 domains
 * - Agent factory integration
 */
export class N8nPlatformAdapter {
  private config: N8nAdapterConfig;
  private analysisCache: Map<string, { result: WorkflowDomainContext; timestamp: number }>;

  constructor(config: Partial<N8nAdapterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.analysisCache = new Map();

    // Auto-detect v2 agents availability
    if (!config.v2AgentsAvailable) {
      this.config.v2AgentsAvailable = this.detectV2Agents();
    }
  }

  // ==========================================================================
  // Availability Checks
  // ==========================================================================

  /**
   * Check if v2 n8n agents are available
   */
  isAvailable(): boolean {
    return this.config.v2AgentsAvailable;
  }

  /**
   * Detect if v2 n8n agents exist in the codebase
   */
  private detectV2Agents(): boolean {
    const possiblePaths = [
      // From src/integrations/n8n/ context
      '../../../src/agents/n8n',
      '../../src/agents/n8n',
      // Absolute paths
      resolve(process.cwd(), 'src/agents/n8n'),
    ];

    for (const path of possiblePaths) {
      try {
        const resolved = resolve(__dirname, path);
        if (existsSync(resolved)) {
          this.config.v2AgentsPath = resolved;
          return true;
        }
      } catch {
        // Continue checking other paths
      }
    }

    // Check if running in agentic-qe project
    const projectPath = resolve(process.cwd(), 'src/agents/n8n/index.ts');
    if (existsSync(projectPath)) {
      this.config.v2AgentsPath = resolve(process.cwd(), 'src/agents/n8n');
      return true;
    }

    return false;
  }

  /**
   * Get the path to v2 agents
   */
  getV2AgentsPath(): string | undefined {
    return this.config.v2AgentsPath;
  }

  // ==========================================================================
  // Workflow Analysis
  // ==========================================================================

  /**
   * Analyze a workflow to determine relevant v3 domains
   */
  analyzeWorkflow(
    workflow: {
      id?: string;
      name?: string;
      nodes: Array<{ type: string; name: string; credentials?: unknown }>;
      connections: unknown;
      settings?: { errorWorkflow?: string };
    }
  ): WorkflowDomainContext {
    const cacheKey = workflow.id || JSON.stringify(workflow.nodes.map(n => n.type));

    // Check cache
    if (this.config.enableCaching) {
      const cached = this.analysisCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTTLMs) {
        return { ...cached.result, workflowId: workflow.id || '', workflowName: workflow.name || '' };
      }
    }

    // Perform analysis
    const context = analyzeWorkflowForDomains(workflow);
    context.workflowId = workflow.id || '';
    context.workflowName = workflow.name || '';

    // Cache result
    if (this.config.enableCaching && workflow.id) {
      this.analysisCache.set(cacheKey, { result: context, timestamp: Date.now() });
    }

    return context;
  }

  /**
   * Full workflow analysis with multiple analysis types
   */
  async analyzeWorkflowFull(request: WorkflowAnalysisRequest): Promise<WorkflowAnalysisResult> {
    const workflow = request.workflow as {
      id?: string;
      name?: string;
      nodes: Array<{ type: string; name: string; credentials?: unknown }>;
      connections: unknown;
      settings?: { errorWorkflow?: string };
    } | undefined;

    const domainContext = workflow
      ? this.analyzeWorkflow(workflow)
      : {
          workflowId: request.workflowId,
          workflowName: '',
          relevantDomains: [] as QEDomain[],
          suggestedAgents: [] as N8nAgentType[],
          complexity: 'medium' as const,
          analysisHints: {
            hasSecurityConcerns: request.analysisTypes.includes('security'),
            hasPerformanceConcerns: request.analysisTypes.includes('performance'),
            hasComplianceRequirements: request.analysisTypes.includes('compliance'),
            hasChaosTestingPotential: request.analysisTypes.includes('chaos'),
            hasContractTestingNeeds: request.analysisTypes.includes('contracts'),
          },
        };

    // Add domains based on requested analysis types
    for (const analysisType of request.analysisTypes) {
      const domainForType = this.getDomainsForAnalysisType(analysisType);
      for (const domain of domainForType) {
        if (!domainContext.relevantDomains.includes(domain)) {
          domainContext.relevantDomains.push(domain);
        }
      }
    }

    return {
      workflowId: request.workflowId,
      analysisTimestamp: new Date(),
      domainContext,
      analysisResults: {},
      recommendations: this.generateRecommendations(domainContext),
      overallRiskScore: this.calculateRiskScore(domainContext),
    };
  }

  /**
   * Map analysis type to v3 domains
   */
  private getDomainsForAnalysisType(analysisType: string): QEDomain[] {
    const mapping: Record<string, QEDomain[]> = {
      security: ['security-compliance'],
      performance: ['test-execution'],
      compliance: ['security-compliance'],
      contracts: ['contract-testing'],
      triggers: ['test-execution'],
      expressions: ['code-intelligence'],
      chaos: ['chaos-resilience'],
    };
    return mapping[analysisType] || [];
  }

  /**
   * Generate recommendations based on workflow context
   */
  private generateRecommendations(context: WorkflowDomainContext): string[] {
    const recommendations: string[] = [];

    if (context.analysisHints.hasSecurityConcerns) {
      recommendations.push('Run security audit before production deployment');
      recommendations.push('Validate credential scoping with secrets-hygiene-auditor');
    }

    if (context.analysisHints.hasPerformanceConcerns) {
      recommendations.push('Run performance baseline tests');
      recommendations.push('Identify bottlenecks with performance-tester');
    }

    if (context.analysisHints.hasComplianceRequirements) {
      recommendations.push('Validate compliance with relevant frameworks (GDPR, HIPAA)');
    }

    if (context.analysisHints.hasChaosTestingPotential) {
      recommendations.push('Run chaos experiments to validate error handling');
    }

    if (context.analysisHints.hasContractTestingNeeds) {
      recommendations.push('Add contract tests for external integrations');
    }

    if (context.complexity === 'complex') {
      recommendations.push('Consider breaking workflow into smaller, testable units');
    }

    return recommendations;
  }

  /**
   * Calculate risk score based on workflow context
   */
  private calculateRiskScore(context: WorkflowDomainContext): number {
    let score = 0;

    if (context.analysisHints.hasSecurityConcerns) score += 25;
    if (context.analysisHints.hasComplianceRequirements) score += 20;
    if (context.analysisHints.hasContractTestingNeeds) score += 15;
    if (context.analysisHints.hasChaosTestingPotential) score += 10;
    if (context.analysisHints.hasPerformanceConcerns) score += 10;

    // Complexity multiplier
    if (context.complexity === 'complex') score *= 1.5;
    else if (context.complexity === 'medium') score *= 1.2;

    return Math.min(100, Math.round(score));
  }

  // ==========================================================================
  // Domain Routing
  // ==========================================================================

  /**
   * Route an n8n agent task to appropriate v3 domain(s)
   */
  routeAgentToDomain(agentType: N8nAgentType): N8nRoutingResult {
    const mapping = N8N_TO_V3_DOMAIN_MAP[agentType];

    if (!mapping) {
      return {
        requestedAgent: agentType,
        primaryDomain: 'test-execution',
        supportingDomains: [],
        confidence: 0.5,
        explanation: `Unknown n8n agent type: ${agentType}. Defaulting to test-execution domain.`,
        useV2Fallback: true,
      };
    }

    const primaryDomain = getPrimaryDomain(agentType);
    const allDomains = getAllDomains(agentType);
    const supportingDomains = allDomains.filter((d) => d !== primaryDomain);

    return {
      requestedAgent: agentType,
      primaryDomain,
      supportingDomains,
      confidence: 0.9,
      explanation: `${agentType} maps to ${primaryDomain} domain. ${mapping.description}`,
      useV2Fallback: !this.config.enableDomainRouting,
    };
  }

  /**
   * Get all n8n agents that can be handled by a specific v3 domain
   */
  getAgentsForDomain(domain: QEDomain): N8nAgentType[] {
    const agents: N8nAgentType[] = [];

    for (const [agentType, mapping] of Object.entries(N8N_TO_V3_DOMAIN_MAP)) {
      if (
        mapping.primaryDomain === domain ||
        mapping.secondaryDomains?.includes(domain)
      ) {
        agents.push(agentType as N8nAgentType);
      }
    }

    return agents;
  }

  /**
   * Get all supported n8n agent types
   */
  getSupportedAgentTypes(): N8nAgentType[] {
    return Object.keys(N8N_TO_V3_DOMAIN_MAP) as N8nAgentType[];
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Get current configuration
   */
  getConfig(): N8nAdapterConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<N8nAdapterConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    this.analysisCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; oldestEntry: number | null } {
    let oldestTimestamp: number | null = null;

    for (const entry of this.analysisCache.values()) {
      if (oldestTimestamp === null || entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
    }

    return {
      size: this.analysisCache.size,
      oldestEntry: oldestTimestamp,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new N8n Platform Adapter instance
 */
export function createN8nAdapter(
  config?: Partial<N8nAdapterConfig>
): N8nPlatformAdapter {
  return new N8nPlatformAdapter(config);
}

/**
 * Singleton instance for convenience
 */
let defaultAdapter: N8nPlatformAdapter | null = null;

/**
 * Get the default adapter instance (creates one if needed)
 */
export function getDefaultAdapter(): N8nPlatformAdapter {
  if (!defaultAdapter) {
    defaultAdapter = createN8nAdapter();
  }
  return defaultAdapter;
}

/**
 * Reset the default adapter (useful for testing)
 */
export function resetDefaultAdapter(): void {
  defaultAdapter = null;
}
