/**
 * Agentic QE v3 - Token Usage MCP Tool
 *
 * qe/analysis/token_usage - Analyze token consumption patterns and identify optimization opportunities
 *
 * Implements ADR-042: V3 QE Token Tracking and Consumption Reduction
 *
 * This tool provides:
 * - Session-level token usage summaries
 * - Per-agent token consumption breakdown
 * - Per-domain token analysis
 * - Task-level metrics
 * - Optimization recommendations
 */

import { MCPToolBase, MCPToolConfig, MCPToolContext, MCPToolSchema } from '../base.js';
import { ToolResult } from '../../types.js';
import {
  TokenMetricsCollector,
  Timeframe,
  TokenUsage,
  AgentTokenMetrics,
  formatCostUsd,
} from '../../../learning/token-tracker.js';

// ============================================================================
// Types
// ============================================================================

export interface TokenUsageParams {
  operation: 'session' | 'agent' | 'domain' | 'task' | 'efficiency';
  timeframe?: Timeframe;
  agentId?: string;
  domain?: string;
  [key: string]: unknown; // Index signature for Record<string, unknown> compatibility
}

export interface TokenUsageResult {
  operation: string;
  timeframe: string;
  summary: {
    totalTokens: number;
    totalCost: string;
    tokensSaved: number;
    savingsPercentage: number;
  };
  breakdown?: {
    byAgent?: Record<string, { tokens: number; cost: string; tasks: number }>;
    byDomain?: Record<string, { tokens: number; cost: string }>;
  };
  optimization: {
    patternsReused: number;
    cacheHits: number;
    earlyExits: number;
    recommendations: string[];
  };
  details?: {
    agentMetrics?: AgentMetricsDetail;
    domainMetrics?: DomainMetricsDetail;
    taskMetrics?: TaskMetricsDetail[];
  };
}

export interface AgentMetricsDetail {
  agentId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: string;
  tasksExecuted: number;
  patternsReused: number;
  tokensSaved: number;
  efficiency: number;
}

export interface DomainMetricsDetail {
  domain: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: string;
}

export interface TaskMetricsDetail {
  taskId: string;
  agentId: string;
  domain: string;
  operation: string;
  tokens: number;
  cost: string;
  patternReused: boolean;
  tokensSaved: number;
  timestamp: string;
}

// ============================================================================
// Tool Implementation
// ============================================================================

export class TokenUsageTool extends MCPToolBase<TokenUsageParams, TokenUsageResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/analysis/token_usage',
    description: 'Analyze token consumption patterns and identify optimization opportunities across agents and domains.',
    domain: 'learning-optimization',
    schema: TOKEN_USAGE_SCHEMA,
    streaming: false,
    timeout: 30000,
  };

  async execute(
    params: TokenUsageParams,
    context: MCPToolContext
  ): Promise<ToolResult<TokenUsageResult>> {
    const { operation, timeframe, agentId, domain } = params;

    try {
      if (this.isAborted(context)) {
        return { success: false, error: 'Operation aborted' };
      }

      let result: TokenUsageResult;

      switch (operation) {
        case 'session':
          result = this.getSessionUsage(timeframe);
          break;
        case 'agent':
          result = this.getAgentUsage(agentId, timeframe);
          break;
        case 'domain':
          result = this.getDomainUsage(domain, timeframe);
          break;
        case 'task':
          result = this.getTaskUsage(timeframe);
          break;
        case 'efficiency':
          result = this.getEfficiencyReport(timeframe);
          break;
        default:
          return { success: false, error: `Unknown operation: ${operation}` };
      }

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: `Token usage analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ============================================================================
  // Operation Handlers
  // ============================================================================

  private getSessionUsage(timeframe?: Timeframe): TokenUsageResult {
    const summary = TokenMetricsCollector.getSessionSummary(timeframe);

    // Build agent breakdown
    const byAgent: Record<string, { tokens: number; cost: string; tasks: number }> = {};
    for (const [agentId, metrics] of summary.byAgent) {
      byAgent[agentId] = {
        tokens: metrics.totalTokens,
        cost: formatCostUsd(metrics.totalCost),
        tasks: metrics.tasksExecuted,
      };
    }

    // Build domain breakdown
    const byDomain: Record<string, { tokens: number; cost: string }> = {};
    for (const [domain, usage] of summary.byDomain) {
      byDomain[domain] = {
        tokens: usage.totalTokens,
        cost: formatCostUsd(usage.estimatedCostUsd || 0),
      };
    }

    return {
      operation: 'session',
      timeframe: timeframe || 'all',
      summary: {
        totalTokens: summary.totalUsage.totalTokens,
        totalCost: formatCostUsd(summary.totalUsage.estimatedCostUsd || 0),
        tokensSaved: summary.optimizationStats.tokensSaved,
        savingsPercentage: summary.optimizationStats.savingsPercentage,
      },
      breakdown: {
        byAgent: Object.keys(byAgent).length > 0 ? byAgent : undefined,
        byDomain: Object.keys(byDomain).length > 0 ? byDomain : undefined,
      },
      optimization: {
        patternsReused: summary.optimizationStats.patternsReused,
        cacheHits: summary.optimizationStats.cacheHits,
        earlyExits: summary.optimizationStats.earlyExits,
        recommendations: this.generateSessionRecommendations(summary),
      },
    };
  }

  private getAgentUsage(agentId?: string, timeframe?: Timeframe): TokenUsageResult {
    const metrics = TokenMetricsCollector.getAgentMetrics(agentId, timeframe);
    const sessionSummary = TokenMetricsCollector.getSessionSummary(timeframe);

    if (agentId && !Array.isArray(metrics)) {
      // Single agent
      const agentMetrics = metrics as AgentTokenMetrics;
      const efficiency = agentMetrics.tasksExecuted > 0
        ? (agentMetrics.patternsReused / agentMetrics.tasksExecuted)
        : 0;

      return {
        operation: 'agent',
        timeframe: timeframe || 'all',
        summary: {
          totalTokens: agentMetrics.totalTokens,
          totalCost: formatCostUsd(agentMetrics.totalCost),
          tokensSaved: agentMetrics.estimatedTokensSaved,
          savingsPercentage: this.calculateSavingsPercentage(
            agentMetrics.totalTokens,
            agentMetrics.estimatedTokensSaved
          ),
        },
        optimization: {
          patternsReused: agentMetrics.patternsReused,
          cacheHits: sessionSummary.optimizationStats.cacheHits,
          earlyExits: sessionSummary.optimizationStats.earlyExits,
          recommendations: this.generateAgentRecommendations(agentMetrics),
        },
        details: {
          agentMetrics: {
            agentId: agentMetrics.agentId,
            totalInputTokens: agentMetrics.totalInputTokens,
            totalOutputTokens: agentMetrics.totalOutputTokens,
            totalTokens: agentMetrics.totalTokens,
            totalCost: formatCostUsd(agentMetrics.totalCost),
            tasksExecuted: agentMetrics.tasksExecuted,
            patternsReused: agentMetrics.patternsReused,
            tokensSaved: agentMetrics.estimatedTokensSaved,
            efficiency: Math.round(efficiency * 100),
          },
        },
      };
    }

    // All agents
    const allAgents = Array.isArray(metrics) ? metrics : [metrics];
    const byAgent: Record<string, { tokens: number; cost: string; tasks: number }> = {};

    let totalTokens = 0;
    let totalCost = 0;
    let totalSaved = 0;
    let totalReused = 0;

    for (const agent of allAgents) {
      byAgent[agent.agentId] = {
        tokens: agent.totalTokens,
        cost: formatCostUsd(agent.totalCost),
        tasks: agent.tasksExecuted,
      };
      totalTokens += agent.totalTokens;
      totalCost += agent.totalCost;
      totalSaved += agent.estimatedTokensSaved;
      totalReused += agent.patternsReused;
    }

    return {
      operation: 'agent',
      timeframe: timeframe || 'all',
      summary: {
        totalTokens,
        totalCost: formatCostUsd(totalCost),
        tokensSaved: totalSaved,
        savingsPercentage: this.calculateSavingsPercentage(totalTokens, totalSaved),
      },
      breakdown: {
        byAgent: Object.keys(byAgent).length > 0 ? byAgent : undefined,
      },
      optimization: {
        patternsReused: totalReused,
        cacheHits: sessionSummary.optimizationStats.cacheHits,
        earlyExits: sessionSummary.optimizationStats.earlyExits,
        recommendations: this.generateMultiAgentRecommendations(allAgents),
      },
    };
  }

  private getDomainUsage(domain?: string, timeframe?: Timeframe): TokenUsageResult {
    const metrics = TokenMetricsCollector.getDomainMetrics(domain, timeframe);
    const sessionSummary = TokenMetricsCollector.getSessionSummary(timeframe);

    if (domain && !(metrics instanceof Map)) {
      // Single domain
      const domainUsage = metrics as TokenUsage;

      return {
        operation: 'domain',
        timeframe: timeframe || 'all',
        summary: {
          totalTokens: domainUsage.totalTokens,
          totalCost: formatCostUsd(domainUsage.estimatedCostUsd || 0),
          tokensSaved: sessionSummary.optimizationStats.tokensSaved,
          savingsPercentage: sessionSummary.optimizationStats.savingsPercentage,
        },
        optimization: {
          patternsReused: sessionSummary.optimizationStats.patternsReused,
          cacheHits: sessionSummary.optimizationStats.cacheHits,
          earlyExits: sessionSummary.optimizationStats.earlyExits,
          recommendations: this.generateDomainRecommendations(domain, domainUsage),
        },
        details: {
          domainMetrics: {
            domain,
            inputTokens: domainUsage.inputTokens,
            outputTokens: domainUsage.outputTokens,
            totalTokens: domainUsage.totalTokens,
            cost: formatCostUsd(domainUsage.estimatedCostUsd || 0),
          },
        },
      };
    }

    // All domains
    const allDomains = metrics instanceof Map ? metrics : new Map();
    const byDomain: Record<string, { tokens: number; cost: string }> = {};

    let totalTokens = 0;
    let totalCost = 0;

    for (const [domainName, usage] of allDomains) {
      byDomain[domainName] = {
        tokens: usage.totalTokens,
        cost: formatCostUsd(usage.estimatedCostUsd || 0),
      };
      totalTokens += usage.totalTokens;
      totalCost += usage.estimatedCostUsd || 0;
    }

    return {
      operation: 'domain',
      timeframe: timeframe || 'all',
      summary: {
        totalTokens,
        totalCost: formatCostUsd(totalCost),
        tokensSaved: sessionSummary.optimizationStats.tokensSaved,
        savingsPercentage: sessionSummary.optimizationStats.savingsPercentage,
      },
      breakdown: {
        byDomain: Object.keys(byDomain).length > 0 ? byDomain : undefined,
      },
      optimization: {
        patternsReused: sessionSummary.optimizationStats.patternsReused,
        cacheHits: sessionSummary.optimizationStats.cacheHits,
        earlyExits: sessionSummary.optimizationStats.earlyExits,
        recommendations: this.generateMultiDomainRecommendations(allDomains),
      },
    };
  }

  private getTaskUsage(timeframe?: Timeframe): TokenUsageResult {
    const tasks = TokenMetricsCollector.getTaskMetrics(timeframe);
    const sessionSummary = TokenMetricsCollector.getSessionSummary(timeframe);

    const taskDetails: TaskMetricsDetail[] = tasks.slice(-100).map(task => ({
      taskId: task.taskId,
      agentId: task.agentId,
      domain: task.domain,
      operation: task.operation,
      tokens: task.usage.totalTokens,
      cost: formatCostUsd(task.usage.estimatedCostUsd || 0),
      patternReused: task.patternReused,
      tokensSaved: task.tokensSaved || 0,
      timestamp: new Date(task.timestamp).toISOString(),
    }));

    return {
      operation: 'task',
      timeframe: timeframe || 'all',
      summary: {
        totalTokens: sessionSummary.totalUsage.totalTokens,
        totalCost: formatCostUsd(sessionSummary.totalUsage.estimatedCostUsd || 0),
        tokensSaved: sessionSummary.optimizationStats.tokensSaved,
        savingsPercentage: sessionSummary.optimizationStats.savingsPercentage,
      },
      optimization: {
        patternsReused: sessionSummary.optimizationStats.patternsReused,
        cacheHits: sessionSummary.optimizationStats.cacheHits,
        earlyExits: sessionSummary.optimizationStats.earlyExits,
        recommendations: [`${tasks.length} tasks analyzed in timeframe`],
      },
      details: {
        taskMetrics: taskDetails,
      },
    };
  }

  private getEfficiencyReport(timeframe?: Timeframe): TokenUsageResult {
    const report = TokenMetricsCollector.getEfficiencyReport(timeframe);
    const sessionSummary = TokenMetricsCollector.getSessionSummary(timeframe);

    return {
      operation: 'efficiency',
      timeframe: timeframe || 'all',
      summary: {
        totalTokens: report.totalTokensUsed,
        totalCost: formatCostUsd(
          report.totalTokensUsed * 0.000003 + // Input approximation
          report.totalTokensUsed * 0.000015   // Output approximation
        ),
        tokensSaved: report.totalTokensSaved,
        savingsPercentage: report.savingsPercentage,
      },
      optimization: {
        patternsReused: sessionSummary.optimizationStats.patternsReused,
        cacheHits: sessionSummary.optimizationStats.cacheHits,
        earlyExits: sessionSummary.optimizationStats.earlyExits,
        recommendations: report.recommendations,
      },
    };
  }

  // ============================================================================
  // Recommendation Generators
  // ============================================================================

  private generateSessionRecommendations(summary: ReturnType<typeof TokenMetricsCollector.getSessionSummary>): string[] {
    const recommendations: string[] = [];

    if (summary.totalUsage.totalTokens === 0) {
      return ['No token usage recorded yet. Start executing tasks to track consumption.'];
    }

    const { patternsReused, cacheHits, earlyExits, savingsPercentage } = summary.optimizationStats;

    if (savingsPercentage < 10) {
      recommendations.push('Token savings below 10%. Enable pattern reuse and caching for better efficiency.');
    }

    if (patternsReused === 0 && summary.byAgent.size > 0) {
      recommendations.push('No patterns reused. Consider enabling the pattern store for similar tasks.');
    }

    if (cacheHits === 0 && summary.totalUsage.totalTokens > 10000) {
      recommendations.push('No cache hits detected. Enable response caching to reduce API calls.');
    }

    if (earlyExits === 0 && summary.byAgent.size > 1) {
      recommendations.push('Early exit optimization not used. Enable high-confidence pattern matching.');
    }

    if (savingsPercentage > 25) {
      recommendations.push(`Excellent token efficiency! ${savingsPercentage.toFixed(1)}% savings achieved.`);
    }

    return recommendations.length > 0 ? recommendations : ['Token usage is within normal parameters.'];
  }

  private generateAgentRecommendations(metrics: AgentTokenMetrics): string[] {
    const recommendations: string[] = [];

    if (metrics.tasksExecuted === 0) {
      return ['No tasks executed by this agent yet.'];
    }

    const reuseRate = metrics.patternsReused / metrics.tasksExecuted;

    if (reuseRate < 0.1) {
      recommendations.push('Low pattern reuse rate. Consider caching successful patterns.');
    }

    const avgTokensPerTask = metrics.totalTokens / metrics.tasksExecuted;
    if (avgTokensPerTask > 5000) {
      recommendations.push(`High average tokens per task (${Math.round(avgTokensPerTask)}). Consider optimizing prompts.`);
    }

    if (metrics.totalOutputTokens > metrics.totalInputTokens * 2) {
      recommendations.push('High output-to-input ratio. Request more concise responses.');
    }

    return recommendations.length > 0 ? recommendations : ['Agent token usage is efficient.'];
  }

  private generateMultiAgentRecommendations(agents: AgentTokenMetrics[]): string[] {
    const recommendations: string[] = [];

    if (agents.length === 0) {
      return ['No agent data available.'];
    }

    // Find highest consumer
    const sorted = [...agents].sort((a, b) => b.totalTokens - a.totalTokens);
    if (sorted[0].totalTokens > 0) {
      recommendations.push(
        `Highest consumer: ${sorted[0].agentId} (${sorted[0].totalTokens.toLocaleString()} tokens)`
      );
    }

    // Check for imbalanced distribution
    const totalTokens = agents.reduce((sum, a) => sum + a.totalTokens, 0);
    const topAgentShare = sorted[0].totalTokens / (totalTokens || 1);
    if (topAgentShare > 0.5 && agents.length > 1) {
      recommendations.push('Token usage imbalanced. Consider distributing workload across agents.');
    }

    return recommendations;
  }

  private generateDomainRecommendations(domain: string, usage: TokenUsage): string[] {
    const recommendations: string[] = [];

    if (usage.totalTokens === 0) {
      return [`No token usage recorded for ${domain}.`];
    }

    // Domain-specific recommendations
    if (domain === 'test-generation' && usage.totalTokens > 10000) {
      recommendations.push('Test generation consuming significant tokens. Consider batching test requests.');
    }

    if (domain === 'code-intelligence' && usage.outputTokens > usage.inputTokens * 3) {
      recommendations.push('Code intelligence generating verbose output. Consider summary-only mode.');
    }

    return recommendations.length > 0 ? recommendations : [`${domain} token usage is normal.`];
  }

  private generateMultiDomainRecommendations(domains: Map<string, TokenUsage>): string[] {
    const recommendations: string[] = [];

    if (domains.size === 0) {
      return ['No domain data available.'];
    }

    const sorted = Array.from(domains.entries())
      .sort((a, b) => b[1].totalTokens - a[1].totalTokens);

    if (sorted[0][1].totalTokens > 0) {
      recommendations.push(
        `Highest consuming domain: ${sorted[0][0]} (${sorted[0][1].totalTokens.toLocaleString()} tokens)`
      );
    }

    return recommendations;
  }

  private calculateSavingsPercentage(used: number, saved: number): number {
    const total = used + saved;
    if (total === 0) return 0;
    return Math.round((saved / total) * 10000) / 100;
  }
}

// ============================================================================
// Schema Definition
// ============================================================================

const TOKEN_USAGE_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    operation: {
      type: 'string',
      description: 'Type of analysis to perform',
      enum: ['session', 'agent', 'domain', 'task', 'efficiency'],
    },
    timeframe: {
      type: 'string',
      description: 'Time period to analyze',
      enum: ['1h', '24h', '7d', '30d'],
    },
    agentId: {
      type: 'string',
      description: 'Specific agent ID to analyze (for agent operation)',
    },
    domain: {
      type: 'string',
      description: 'Specific domain to analyze (for domain operation)',
      enum: [
        'test-generation', 'test-execution', 'coverage-analysis', 'quality-assessment',
        'defect-intelligence', 'requirements-validation', 'code-intelligence',
        'security-compliance', 'contract-testing', 'visual-accessibility',
        'chaos-resilience', 'learning-optimization',
      ],
    },
  },
  required: ['operation'],
};

// ============================================================================
// Standalone Tool Export (for direct MCP registration)
// ============================================================================

/**
 * Standalone tool definition for direct MCP server registration
 */
export const tokenUsageTool = {
  name: 'token_usage',
  description: 'Analyze token consumption patterns and identify optimization opportunities',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['session', 'agent', 'domain', 'task', 'efficiency'],
        description: 'Scope of analysis',
      },
      timeframe: {
        type: 'string',
        enum: ['1h', '24h', '7d', '30d'],
        description: 'Time period to analyze',
      },
      agentId: {
        type: 'string',
        description: 'Specific agent to analyze (optional)',
      },
      domain: {
        type: 'string',
        description: 'Specific domain to analyze (optional)',
      },
    },
    required: ['operation'],
  },
  async execute(args: TokenUsageParams): Promise<TokenUsageResult> {
    const tool = new TokenUsageTool();
    const context = {
      requestId: `standalone-${Date.now()}`,
      startTime: Date.now(),
    };
    const result = await tool.execute(args, context);
    if (result.success && result.data) {
      return result.data;
    }
    throw new Error(result.error || 'Token usage analysis failed');
  },
};
