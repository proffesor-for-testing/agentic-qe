/**
 * N8nBaseAgent - Abstract base class for all n8n testing agents
 *
 * Provides:
 * - N8n API client management
 * - Workflow caching and retrieval
 * - Execution tracking and monitoring
 * - Memory integration for test results
 * - Event emission for real-time monitoring
 * - Common validation utilities
 */

import { BaseAgent, BaseAgentConfig } from '../BaseAgent';
import { N8nAPIClient, N8nAPIError } from './N8nAPIClient';
import {
  N8nAPIConfig,
  N8nWorkflow,
  N8nExecution,
  N8nNode,
  N8nBaseAgentConfig,
  ValidationResult,
  ValidationIssue,
} from './types';
import {
  AgentCapability,
  QETask,
  AgentType,
} from '../../types';

export interface N8nAgentConfig extends BaseAgentConfig, N8nBaseAgentConfig {
  type: AgentType;
  capabilities: AgentCapability[];
}

export abstract class N8nBaseAgent extends BaseAgent {
  protected readonly n8nClient: N8nAPIClient;
  protected readonly n8nConfig: N8nAPIConfig;
  protected readonly workflowCache: Map<string, { workflow: N8nWorkflow; timestamp: number }> = new Map();
  protected readonly executionHistory: Map<string, N8nExecution[]> = new Map();
  private readonly cacheTTL: number;

  constructor(config: N8nAgentConfig) {
    super(config);
    this.n8nConfig = config.n8nConfig;
    this.n8nClient = new N8nAPIClient(config.n8nConfig);
    this.cacheTTL = config.cacheTTL ?? 60000; // 1 minute default
  }

  // ============================================================================
  // Workflow Operations
  // ============================================================================

  /**
   * Get workflow with caching support
   */
  protected async getWorkflow(workflowId: string, forceRefresh = false): Promise<N8nWorkflow> {
    if (!forceRefresh) {
      const cached = this.workflowCache.get(workflowId);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.workflow;
      }
    }

    const workflow = await this.n8nClient.getWorkflow(workflowId);
    this.workflowCache.set(workflowId, { workflow, timestamp: Date.now() });

    // Store in memory for cross-agent access
    await this.storeMemory(`workflow:${workflowId}`, workflow, this.cacheTTL);

    return workflow;
  }

  /**
   * Execute workflow with tracking
   */
  protected async executeWorkflow(
    workflowId: string,
    inputData?: Record<string, unknown>,
    options?: { waitForCompletion?: boolean; timeout?: number }
  ): Promise<N8nExecution> {
    const startTime = Date.now();

    this.emitEvent('workflow.execution.started', {
      workflowId,
      inputData,
      timestamp: startTime,
    });

    try {
      const execution = await this.n8nClient.executeWorkflow(workflowId, inputData);

      // Wait for completion if requested
      if (options?.waitForCompletion) {
        const completed = await this.n8nClient.waitForExecution(
          execution.id,
          options.timeout ?? 30000
        );

        this.trackExecution(workflowId, completed);

        this.emitEvent('workflow.execution.completed', {
          workflowId,
          executionId: completed.id,
          status: completed.status,
          duration: Date.now() - startTime,
        });

        return completed;
      }

      this.trackExecution(workflowId, execution);
      return execution;
    } catch (error) {
      this.emitEvent('workflow.execution.failed', {
        workflowId,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Track execution in history
   */
  private trackExecution(workflowId: string, execution: N8nExecution): void {
    const history = this.executionHistory.get(workflowId) || [];
    history.push(execution);

    // Keep only last 100 executions per workflow
    if (history.length > 100) {
      history.shift();
    }

    this.executionHistory.set(workflowId, history);
  }

  /**
   * Get execution history for a workflow
   */
  protected getExecutionHistory(workflowId: string): N8nExecution[] {
    return this.executionHistory.get(workflowId) || [];
  }

  /**
   * Get a specific execution by ID
   */
  protected async getExecution(executionId: string): Promise<N8nExecution> {
    return this.n8nClient.getExecution(executionId);
  }

  // ============================================================================
  // Node Utilities
  // ============================================================================

  /**
   * Find nodes by type
   */
  protected findNodesByType(workflow: N8nWorkflow, type: string | RegExp): N8nNode[] {
    return workflow.nodes.filter(node => {
      if (typeof type === 'string') {
        return node.type === type || node.type.includes(type);
      }
      return type.test(node.type);
    });
  }

  /**
   * Find node by name
   */
  protected findNodeByName(workflow: N8nWorkflow, name: string): N8nNode | undefined {
    return workflow.nodes.find(node => node.name === name);
  }

  /**
   * Get trigger nodes
   */
  protected getTriggerNodes(workflow: N8nWorkflow): N8nNode[] {
    const triggerTypes = [
      'n8n-nodes-base.webhook',
      'n8n-nodes-base.cron',
      'n8n-nodes-base.schedule',
      'n8n-nodes-base.emailTrigger',
      'n8n-nodes-base.slackTrigger',
    ];

    return workflow.nodes.filter(node =>
      triggerTypes.some(t => node.type.includes(t)) ||
      node.type.toLowerCase().includes('trigger')
    );
  }

  /**
   * Get downstream nodes from a given node
   */
  protected getDownstreamNodes(workflow: N8nWorkflow, nodeName: string): N8nNode[] {
    const connections = workflow.connections[nodeName];
    if (!connections?.main) return [];

    const downstream: N8nNode[] = [];

    for (const output of connections.main) {
      for (const conn of output) {
        const node = this.findNodeByName(workflow, conn.node);
        if (node) {
          downstream.push(node);
          // Recursively get downstream
          downstream.push(...this.getDownstreamNodes(workflow, node.name));
        }
      }
    }

    return downstream;
  }

  /**
   * Get all node types in workflow
   */
  protected getNodeTypes(workflow: N8nWorkflow): string[] {
    return [...new Set(workflow.nodes.map(node => node.type))];
  }

  // ============================================================================
  // Validation Utilities
  // ============================================================================

  /**
   * Validate workflow structure
   */
  protected validateWorkflowStructure(workflow: N8nWorkflow): ValidationResult {
    const issues: ValidationIssue[] = [];

    // Check for required fields
    if (!workflow.id) {
      issues.push({
        severity: 'error',
        code: 'MISSING_ID',
        message: 'Workflow is missing ID',
      });
    }

    if (!workflow.nodes || workflow.nodes.length === 0) {
      issues.push({
        severity: 'error',
        code: 'NO_NODES',
        message: 'Workflow has no nodes',
      });
    }

    // Check each node
    for (const node of workflow.nodes) {
      if (!node.id) {
        issues.push({
          severity: 'error',
          code: 'NODE_MISSING_ID',
          message: `Node "${node.name}" is missing ID`,
          node: node.name,
        });
      }

      if (!node.type) {
        issues.push({
          severity: 'error',
          code: 'NODE_MISSING_TYPE',
          message: `Node "${node.name}" is missing type`,
          node: node.name,
        });
      }

      if (!node.parameters) {
        issues.push({
          severity: 'warning',
          code: 'NODE_MISSING_PARAMETERS',
          message: `Node "${node.name}" has no parameters`,
          node: node.name,
        });
      }
    }

    // Check connections reference valid nodes
    const nodeNames = new Set(workflow.nodes.map(n => n.name));
    for (const [sourceName, connections] of Object.entries(workflow.connections)) {
      if (!nodeNames.has(sourceName)) {
        issues.push({
          severity: 'error',
          code: 'INVALID_CONNECTION_SOURCE',
          message: `Connection source "${sourceName}" does not exist`,
        });
      }

      if (connections.main) {
        for (const output of connections.main) {
          for (const conn of output) {
            if (!nodeNames.has(conn.node)) {
              issues.push({
                severity: 'error',
                code: 'INVALID_CONNECTION_TARGET',
                message: `Connection target "${conn.node}" does not exist`,
                node: sourceName,
              });
            }
          }
        }
      }
    }

    // Check for orphan nodes (no connections)
    const connectedNodes = new Set<string>();
    for (const [source, connections] of Object.entries(workflow.connections)) {
      connectedNodes.add(source);
      if (connections.main) {
        for (const output of connections.main) {
          for (const conn of output) {
            connectedNodes.add(conn.node);
          }
        }
      }
    }

    const triggers = this.getTriggerNodes(workflow);
    for (const node of workflow.nodes) {
      const isTrigger = triggers.some(t => t.name === node.name);
      if (!connectedNodes.has(node.name) && !isTrigger) {
        issues.push({
          severity: 'warning',
          code: 'ORPHAN_NODE',
          message: `Node "${node.name}" has no connections`,
          node: node.name,
        });
      }
    }

    const errorCount = issues.filter(i => i.severity === 'error').length;
    const score = Math.max(0, 100 - (errorCount * 20) - (issues.length - errorCount) * 5);

    return {
      valid: errorCount === 0,
      score,
      issues,
      warnings: issues.filter(i => i.severity === 'warning').map(i => ({
        code: i.code,
        message: i.message,
        node: i.node,
      })),
    };
  }

  /**
   * Validate node has required parameters
   */
  protected validateNodeParameters(
    node: N8nNode,
    requiredParams: string[]
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const param of requiredParams) {
      const value = this.getNestedValue(node.parameters, param);
      if (value === undefined || value === null || value === '') {
        issues.push({
          severity: 'error',
          code: 'MISSING_PARAMETER',
          message: `Node "${node.name}" is missing required parameter "${param}"`,
          node: node.name,
          field: param,
        });
      }
    }

    return issues;
  }

  // ============================================================================
  // Expression Utilities
  // ============================================================================

  /**
   * Extract all expressions from a workflow
   */
  protected extractExpressions(workflow: N8nWorkflow): Array<{
    node: string;
    field: string;
    expression: string;
  }> {
    const expressions: Array<{ node: string; field: string; expression: string }> = [];
    const expressionPattern = /\{\{[^}]+\}\}/g;

    for (const node of workflow.nodes) {
      this.extractExpressionsFromObject(
        node.parameters,
        node.name,
        '',
        expressions,
        expressionPattern
      );
    }

    return expressions;
  }

  /**
   * Recursively extract expressions from object
   */
  private extractExpressionsFromObject(
    obj: unknown,
    nodeName: string,
    path: string,
    expressions: Array<{ node: string; field: string; expression: string }>,
    pattern: RegExp
  ): void {
    if (typeof obj === 'string') {
      const matches = obj.match(pattern);
      if (matches) {
        for (const match of matches) {
          expressions.push({
            node: nodeName,
            field: path,
            expression: match,
          });
        }
      }
    } else if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        this.extractExpressionsFromObject(
          obj[i],
          nodeName,
          `${path}[${i}]`,
          expressions,
          pattern
        );
      }
    } else if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        this.extractExpressionsFromObject(
          value,
          nodeName,
          path ? `${path}.${key}` : key,
          expressions,
          pattern
        );
      }
    }
  }

  // ============================================================================
  // Metric Utilities
  // ============================================================================

  /**
   * Calculate execution metrics from run data
   */
  protected calculateExecutionMetrics(execution: N8nExecution): {
    totalDuration: number;
    nodeMetrics: Array<{
      node: string;
      duration: number;
      percentage: number;
      status: string;
    }>;
    bottleneck: string | null;
  } {
    const runData = execution.data?.resultData?.runData;
    if (!runData) {
      return { totalDuration: 0, nodeMetrics: [], bottleneck: null };
    }

    let totalDuration = 0;
    const nodeMetrics: Array<{
      node: string;
      duration: number;
      percentage: number;
      status: string;
    }> = [];

    // Calculate total duration
    for (const [nodeName, nodeRuns] of Object.entries(runData)) {
      const run = nodeRuns[0];
      if (run) {
        totalDuration += run.executionTime;
        nodeMetrics.push({
          node: nodeName,
          duration: run.executionTime,
          percentage: 0, // Will calculate after
          status: run.executionStatus,
        });
      }
    }

    // Calculate percentages and find bottleneck
    let bottleneck: string | null = null;
    let maxPercentage = 0;

    for (const metric of nodeMetrics) {
      metric.percentage = totalDuration > 0
        ? (metric.duration / totalDuration) * 100
        : 0;

      if (metric.percentage > maxPercentage && metric.percentage > 30) {
        maxPercentage = metric.percentage;
        bottleneck = metric.node;
      }
    }

    // Sort by duration descending
    nodeMetrics.sort((a, b) => b.duration - a.duration);

    return { totalDuration, nodeMetrics, bottleneck };
  }

  // ============================================================================
  // Memory Operations
  // ============================================================================

  /**
   * Store test result in memory
   */
  protected async storeTestResult(
    testId: string,
    result: unknown,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const key = `test-result:${testId}`;
    await this.storeMemory(key, {
      result,
      metadata,
      timestamp: new Date().toISOString(),
      agentId: this.getAgentId().id,
    });
  }

  /**
   * Get test results for a workflow
   */
  protected async getTestResults(workflowId: string): Promise<unknown[]> {
    // This would retrieve from memory store
    const key = `test-results:${workflowId}`;
    const result = await this.retrieveMemory(key);
    return Array.isArray(result) ? result : [];
  }

  // ============================================================================
  // LLM-Powered Analysis (Phase 1.2.3)
  // ============================================================================

  /**
   * Phase 1.2.3: Analyze workflow with LLM for insights
   * Uses IAgentLLM for provider-independent LLM calls
   * Child agents can call this for AI-powered workflow analysis
   *
   * @param workflow - The workflow to analyze
   * @param analysisType - Type of analysis to perform
   * @returns AI-generated insights or undefined if LLM unavailable
   */
  protected async analyzeWorkflowWithLLM(
    workflow: N8nWorkflow,
    analysisType: 'complexity' | 'optimization' | 'security' | 'general' = 'general'
  ): Promise<string | undefined> {
    const llm = this.getAgentLLM();
    if (!llm) {
      return undefined;
    }

    try {
      const nodeTypes = this.getNodeTypes(workflow);
      const triggers = this.getTriggerNodes(workflow);
      const expressions = this.extractExpressions(workflow);

      const workflowSummary = `
Workflow: ${workflow.name || workflow.id}
Nodes: ${workflow.nodes.length} (types: ${nodeTypes.slice(0, 5).join(', ')})
Triggers: ${triggers.map(t => t.type).join(', ') || 'none'}
Expressions: ${expressions.length}
Active: ${workflow.active}`;

      const prompts: Record<string, string> = {
        complexity: `Assess the complexity of this n8n workflow and identify potential issues in 2-3 sentences:\n${workflowSummary}`,
        optimization: `Suggest 2-3 optimizations for this n8n workflow:\n${workflowSummary}`,
        security: `Identify potential security concerns in this n8n workflow (2-3 points):\n${workflowSummary}`,
        general: `Summarize this n8n workflow's purpose and structure in 2-3 sentences:\n${workflowSummary}`,
      };

      const response = await llm.complete(prompts[analysisType], {
        complexity: 'simple',
        maxTokens: 200,
        temperature: 0.3,
      });

      return response.trim();
    } catch (error) {
      // Silently fail - LLM analysis is optional enhancement
      return undefined;
    }
  }

  /**
   * Phase 1.2.3: Generate test suggestions for workflow nodes
   * Uses IAgentLLM for provider-independent LLM calls
   *
   * @param node - The node to generate test suggestions for
   * @returns Array of test suggestions or empty array if LLM unavailable
   */
  protected async generateNodeTestSuggestions(node: N8nNode): Promise<string[]> {
    const llm = this.getAgentLLM();
    if (!llm) {
      return [];
    }

    try {
      const prompt = `Suggest 3 specific test cases for this n8n node (JSON array of strings):
Node type: ${node.type}
Node name: ${node.name}
Parameters: ${JSON.stringify(Object.keys(node.parameters || {})).slice(0, 200)}

Test suggestions:`;

      const response = await llm.complete(prompt, {
        complexity: 'simple',
        maxTokens: 150,
        temperature: 0.3,
      });

      // Try to parse JSON array
      const match = response.match(/\[[\s\S]*?\]/);
      if (match) {
        return JSON.parse(match[0]);
      }
      return [];
    } catch {
      return [];
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Test n8n API connectivity
   */
  async testConnection(): Promise<boolean> {
    return this.n8nClient.testConnection();
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  protected async initializeComponents(): Promise<void> {
    // Test n8n connection
    const connected = await this.testConnection();
    if (!connected) {
      console.warn(`[${this.getAgentId().id}] Warning: Could not connect to n8n API at ${this.n8nConfig.baseUrl}`);
    }
  }

  protected async loadKnowledge(): Promise<void> {
    // Load any cached workflow data from memory
    // Subclasses can override to load agent-specific knowledge
  }

  protected async cleanup(): Promise<void> {
    // Clear caches
    this.workflowCache.clear();
    this.n8nClient.clearCache();
  }
}
