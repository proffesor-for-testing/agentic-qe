/**
 * N8nMonitoringValidatorAgent
 *
 * Validates monitoring and observability configuration:
 * - Logging configuration validation
 * - Alerting rule verification
 * - Metrics collection validation
 * - SLA compliance checking
 */

import { N8nBaseAgent, N8nAgentConfig } from './N8nBaseAgent';
import {
  N8nWorkflow,
  N8nNode,
  N8nExecution,
} from './types';
import { QETask, AgentCapability } from '../../types';

export interface MonitoringValidationTask extends QETask {
  type: 'monitoring-validation';
  target: string; // workflowId
  options?: {
    validateLogging?: boolean;
    validateAlerting?: boolean;
    validateMetrics?: boolean;
    checkSLACompliance?: boolean;
    slaThresholds?: SLAThresholds;
    executeRuntimeValidation?: boolean;  // Actually execute workflows to verify metrics
    testInput?: Record<string, unknown>;
    iterations?: number;  // Number of executions for metrics collection
  };
}

export interface SLAThresholds {
  maxExecutionTime?: number; // ms
  minSuccessRate?: number; // percentage
  maxErrorRate?: number; // percentage
  maxP99Latency?: number; // ms
  minThroughput?: number; // executions per hour
}

export interface MonitoringValidationResult {
  workflowId: string;
  loggingValidation: LoggingValidationResult;
  alertingValidation: AlertingValidationResult;
  metricsValidation: MetricsValidationResult;
  slaCompliance?: SLAComplianceResult;
  recommendations: MonitoringRecommendation[];
  overallScore: number;
}

export interface LoggingValidationResult {
  isConfigured: boolean;
  level: string;
  issues: LoggingIssue[];
  coverage: {
    nodesWithLogging: number;
    totalNodes: number;
    percentage: number;
  };
}

export interface LoggingIssue {
  type: 'missing' | 'insufficient' | 'excessive' | 'sensitive-data';
  severity: 'low' | 'medium' | 'high';
  location: string;
  description: string;
  recommendation: string;
}

export interface AlertingValidationResult {
  isConfigured: boolean;
  rules: AlertRule[];
  issues: AlertingIssue[];
  coverage: {
    errorAlerts: boolean;
    performanceAlerts: boolean;
    businessAlerts: boolean;
  };
}

export interface AlertRule {
  name: string;
  type: 'error' | 'performance' | 'business' | 'custom';
  condition: string;
  channels: string[];
  severity: 'info' | 'warning' | 'error' | 'critical';
  isValid: boolean;
}

export interface AlertingIssue {
  type: 'missing' | 'misconfigured' | 'noisy' | 'blind-spot';
  severity: 'low' | 'medium' | 'high';
  description: string;
  recommendation: string;
}

export interface MetricsValidationResult {
  isConfigured: boolean;
  metrics: MetricDefinition[];
  issues: MetricsIssue[];
  coverage: {
    executionMetrics: boolean;
    nodeMetrics: boolean;
    businessMetrics: boolean;
  };
}

export interface MetricDefinition {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  description: string;
  labels: string[];
  isCollected: boolean;
}

export interface MetricsIssue {
  type: 'missing' | 'cardinality' | 'naming' | 'coverage';
  severity: 'low' | 'medium' | 'high';
  description: string;
  recommendation: string;
}

export interface SLAComplianceResult {
  isCompliant: boolean;
  thresholds: SLAThresholds;
  actualMetrics: {
    avgExecutionTime: number;
    successRate: number;
    errorRate: number;
    p99Latency: number;
    throughput: number;
  };
  violations: SLAViolation[];
  trend: 'improving' | 'stable' | 'degrading';
}

export interface SLAViolation {
  metric: string;
  threshold: number;
  actual: number;
  severity: 'minor' | 'major' | 'critical';
  timestamp: Date;
}

export interface MonitoringRecommendation {
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'logging' | 'alerting' | 'metrics' | 'sla';
  issue: string;
  recommendation: string;
  impact: string;
}

// Standard metrics that should be collected
const REQUIRED_METRICS = [
  { name: 'n8n_workflow_executions_total', type: 'counter', description: 'Total workflow executions' },
  { name: 'n8n_workflow_execution_duration_seconds', type: 'histogram', description: 'Workflow execution duration' },
  { name: 'n8n_workflow_execution_errors_total', type: 'counter', description: 'Total workflow errors' },
  { name: 'n8n_node_execution_duration_seconds', type: 'histogram', description: 'Node execution duration' },
  { name: 'n8n_workflow_active_executions', type: 'gauge', description: 'Currently active executions' },
];

export class N8nMonitoringValidatorAgent extends N8nBaseAgent {
  private monitoringExecutionHistory: Map<string, N8nExecution[]> = new Map();

  constructor(config: N8nAgentConfig) {
    const capabilities: AgentCapability[] = [
      {
        name: 'logging-validation',
        version: '1.0.0',
        description: 'Validate logging configuration',
        parameters: {},
      },
      {
        name: 'alerting-validation',
        version: '1.0.0',
        description: 'Validate alerting rules',
        parameters: {},
      },
      {
        name: 'metrics-validation',
        version: '1.0.0',
        description: 'Validate metrics collection',
        parameters: {},
      },
      {
        name: 'sla-compliance',
        version: '1.0.0',
        description: 'Check SLA compliance',
        parameters: {},
      },
    ];

    super({
      ...config,
      type: 'n8n-monitoring-validator' as any,
      capabilities: [...capabilities, ...(config.capabilities || [])],
    });
  }

  protected async performTask(task: QETask): Promise<MonitoringValidationResult> {
    const monitoringTask = task as MonitoringValidationTask;

    if (monitoringTask.type !== 'monitoring-validation') {
      throw new Error(`Unsupported task type: ${monitoringTask.type}`);
    }

    return this.validateMonitoring(monitoringTask.target, monitoringTask.options);
  }

  /**
   * Validate monitoring configuration
   *
   * PRODUCTION DEFAULT: Runtime validation and SLA checking are ENABLED by default.
   * This ensures actual metrics are collected and validated, not just configuration.
   * Set executeRuntimeValidation: false to skip if workflow cannot be executed.
   */
  async validateMonitoring(
    workflowId: string,
    options?: MonitoringValidationTask['options']
  ): Promise<MonitoringValidationResult> {
    const workflow = await this.getWorkflow(workflowId);

    // Validate logging (static analysis)
    const loggingValidation = options?.validateLogging !== false
      ? this.validateLogging(workflow)
      : this.getDefaultLoggingResult();

    // Validate alerting (static analysis)
    const alertingValidation = options?.validateAlerting !== false
      ? this.validateAlerting(workflow)
      : this.getDefaultAlertingResult();

    // Validate metrics (static analysis)
    const metricsValidation = options?.validateMetrics !== false
      ? this.validateMetrics(workflow)
      : this.getDefaultMetricsResult();

    // Runtime validation - ENABLED BY DEFAULT
    // Actually execute workflows to collect real metrics
    // Set executeRuntimeValidation: false explicitly to skip
    if (options?.executeRuntimeValidation !== false) {
      try {
        await this.executeRuntimeMetricsValidation(
          workflowId,
          options?.testInput,
          options?.iterations || 5
        );
      } catch (error) {
        // If runtime execution fails, emit warning but continue with static results
        this.emitEvent('monitoring.runtime.skipped', {
          workflowId,
          reason: error instanceof Error ? error.message : 'Runtime metrics validation failed',
          note: 'Static monitoring analysis completed, but runtime metrics collection was skipped',
        });
      }
    }

    // Check SLA compliance - ENABLED BY DEFAULT for production
    // Real execution data is used if runtime validation was run
    // Set checkSLACompliance: false explicitly to skip
    let slaCompliance: SLAComplianceResult | undefined;
    if (options?.checkSLACompliance !== false) {
      slaCompliance = await this.checkSLACompliance(
        workflowId,
        options?.slaThresholds || this.getDefaultSLAThresholds()
      );
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      loggingValidation,
      alertingValidation,
      metricsValidation,
      slaCompliance
    );

    // Calculate overall score
    const overallScore = this.calculateOverallScore(
      loggingValidation,
      alertingValidation,
      metricsValidation,
      slaCompliance
    );

    const result: MonitoringValidationResult = {
      workflowId,
      loggingValidation,
      alertingValidation,
      metricsValidation,
      slaCompliance,
      recommendations,
      overallScore,
    };

    // Store result
    await this.storeTestResult(`monitoring-validation:${workflowId}`, result);

    // Emit event
    this.emitEvent('monitoring.validation.completed', {
      workflowId,
      overallScore,
      recommendationCount: recommendations.length,
      slaCompliant: slaCompliance?.isCompliant ?? true,
    });

    return result;
  }

  /**
   * Validate logging configuration
   */
  private validateLogging(workflow: N8nWorkflow): LoggingValidationResult {
    const issues: LoggingIssue[] = [];
    let nodesWithLogging = 0;

    // Check workflow-level settings
    const loggingLevel = workflow.settings?.saveExecutionProgress ? 'detailed' :
      workflow.settings?.saveDataErrorExecution ? 'errors' : 'minimal';

    // Check node-level logging
    for (const node of workflow.nodes) {
      const hasLogging = this.nodeHasLogging(node);
      if (hasLogging) {
        nodesWithLogging++;
      }

      // Check for sensitive data logging
      if (this.nodeLogsSensitiveData(node)) {
        issues.push({
          type: 'sensitive-data',
          severity: 'high',
          location: node.name,
          description: 'Node may log sensitive data',
          recommendation: 'Add data masking or reduce log verbosity',
        });
      }
    }

    // Check for missing error logging
    const errorNodes = workflow.nodes.filter(n => n.type.includes('Error') || n.type.includes('error'));
    if (errorNodes.length === 0) {
      issues.push({
        type: 'missing',
        severity: 'medium',
        location: 'workflow',
        description: 'No explicit error handling/logging nodes',
        recommendation: 'Add error trigger node to capture and log errors',
      });
    }

    // Check for insufficient logging
    if (loggingLevel === 'minimal' && workflow.nodes.length > 5) {
      issues.push({
        type: 'insufficient',
        severity: 'medium',
        location: 'workflow',
        description: 'Complex workflow with minimal logging',
        recommendation: 'Enable saveExecutionProgress for debugging',
      });
    }

    return {
      isConfigured: loggingLevel !== 'minimal',
      level: loggingLevel,
      issues,
      coverage: {
        nodesWithLogging,
        totalNodes: workflow.nodes.length,
        percentage: workflow.nodes.length > 0
          ? (nodesWithLogging / workflow.nodes.length) * 100
          : 0,
      },
    };
  }

  /**
   * Check if node has logging configured
   */
  private nodeHasLogging(node: N8nNode): boolean {
    // Check for explicit logging configuration
    const params = node.parameters as Record<string, unknown>;
    return !!(
      params.onError ||
      params.logging ||
      params.debug ||
      node.type.includes('log') ||
      node.type.includes('debug')
    );
  }

  /**
   * Check if node might log sensitive data
   */
  private nodeLogsSensitiveData(node: N8nNode): boolean {
    const sensitivePatterns = ['password', 'token', 'secret', 'key', 'credential'];
    const paramsStr = JSON.stringify(node.parameters).toLowerCase();
    return sensitivePatterns.some(p => paramsStr.includes(p));
  }

  /**
   * Validate alerting configuration
   */
  private validateAlerting(workflow: N8nWorkflow): AlertingValidationResult {
    const rules: AlertRule[] = [];
    const issues: AlertingIssue[] = [];

    // Check for error workflow
    const errorWorkflow = workflow.settings?.errorWorkflow;
    if (errorWorkflow) {
      rules.push({
        name: 'Error Workflow Trigger',
        type: 'error',
        condition: 'Workflow execution fails',
        channels: ['error-workflow'],
        severity: 'error',
        isValid: true,
      });
    } else {
      issues.push({
        type: 'missing',
        severity: 'high',
        description: 'No error workflow configured',
        recommendation: 'Configure an error workflow to handle failures',
      });
    }

    // Check for notification nodes
    const notificationNodes = workflow.nodes.filter(n =>
      n.type.includes('slack') ||
      n.type.includes('email') ||
      n.type.includes('telegram') ||
      n.type.includes('webhook')
    );

    for (const node of notificationNodes) {
      // Check if it's in error handling path
      const isErrorHandler = this.isInErrorHandlingPath(workflow, node);
      if (isErrorHandler) {
        rules.push({
          name: `Alert: ${node.name}`,
          type: 'error',
          condition: 'Error detected',
          channels: [node.type],
          severity: 'warning',
          isValid: true,
        });
      }
    }

    // Check coverage
    const hasErrorAlerts = rules.some(r => r.type === 'error');
    const hasPerformanceAlerts = rules.some(r => r.type === 'performance');
    const hasBusinessAlerts = rules.some(r => r.type === 'business');

    if (!hasPerformanceAlerts) {
      issues.push({
        type: 'blind-spot',
        severity: 'medium',
        description: 'No performance alerting configured',
        recommendation: 'Add alerts for slow execution or timeout',
      });
    }

    return {
      isConfigured: rules.length > 0,
      rules,
      issues,
      coverage: {
        errorAlerts: hasErrorAlerts,
        performanceAlerts: hasPerformanceAlerts,
        businessAlerts: hasBusinessAlerts,
      },
    };
  }

  /**
   * Check if node is in error handling path
   */
  private isInErrorHandlingPath(workflow: N8nWorkflow, node: N8nNode): boolean {
    // Simplified check - look for connection from error nodes
    for (const [sourceNode, outputs] of Object.entries(workflow.connections)) {
      const sourceNodeDef = workflow.nodes.find(n => n.id === sourceNode || n.name === sourceNode);
      if (sourceNodeDef?.type.includes('Error')) {
        for (const outputType of Object.values(outputs)) {
          for (const connections of outputType) {
            if (connections.some(c => c.node === node.id || c.node === node.name)) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  /**
   * Validate metrics configuration
   */
  private validateMetrics(workflow: N8nWorkflow): MetricsValidationResult {
    const metrics: MetricDefinition[] = [];
    const issues: MetricsIssue[] = [];

    // Check for standard metrics (these would be collected by n8n)
    for (const requiredMetric of REQUIRED_METRICS) {
      metrics.push({
        ...requiredMetric,
        type: requiredMetric.type as MetricDefinition['type'],
        labels: ['workflow_id', 'workflow_name'],
        isCollected: true, // Assume n8n collects these
      });
    }

    // Check for custom metrics in code nodes
    const codeNodes = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.code');
    for (const node of codeNodes) {
      const code = (node.parameters.jsCode as string) || '';
      if (code.includes('metrics') || code.includes('counter') || code.includes('gauge')) {
        metrics.push({
          name: `custom_${node.name}_metric`,
          type: 'custom' as any,
          description: 'Custom metric in code node',
          labels: [],
          isCollected: true,
        });
      }
    }

    // Check for high cardinality
    const httpNodes = workflow.nodes.filter(n => n.type.includes('httpRequest'));
    if (httpNodes.length > 0) {
      issues.push({
        type: 'cardinality',
        severity: 'medium',
        description: 'HTTP request nodes may generate high cardinality metrics',
        recommendation: 'Use bucketed labels for URL paths',
      });
    }

    // Check coverage
    const hasExecutionMetrics = metrics.some(m => m.name.includes('execution'));
    const hasNodeMetrics = metrics.some(m => m.name.includes('node'));
    const hasBusinessMetrics = metrics.some(m => !m.name.startsWith('n8n_'));

    if (!hasBusinessMetrics) {
      issues.push({
        type: 'coverage',
        severity: 'low',
        description: 'No business-specific metrics defined',
        recommendation: 'Consider adding custom metrics for business KPIs',
      });
    }

    return {
      isConfigured: metrics.length > 0,
      metrics,
      issues,
      coverage: {
        executionMetrics: hasExecutionMetrics,
        nodeMetrics: hasNodeMetrics,
        businessMetrics: hasBusinessMetrics,
      },
    };
  }

  /**
   * Check SLA compliance
   */
  private async checkSLACompliance(
    workflowId: string,
    thresholds: SLAThresholds
  ): Promise<SLAComplianceResult> {
    // Get recent executions
    const executions = this.monitoringExecutionHistory.get(workflowId) || [];

    // Calculate actual metrics
    const durations = executions
      .filter(e => e.stoppedAt)
      .map(e => new Date(e.stoppedAt!).getTime() - new Date(e.startedAt).getTime());

    const successCount = executions.filter(e => e.status === 'success').length;
    const errorCount = executions.filter(e => e.status === 'failed' || e.status === 'crashed').length;
    const totalCount = executions.length || 1;

    const avgExecutionTime = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    const sortedDurations = [...durations].sort((a, b) => a - b);
    const p99Index = Math.floor(sortedDurations.length * 0.99);
    const p99Latency = sortedDurations[p99Index] || avgExecutionTime;

    const actualMetrics = {
      avgExecutionTime,
      successRate: (successCount / totalCount) * 100,
      errorRate: (errorCount / totalCount) * 100,
      p99Latency,
      throughput: totalCount, // executions in sample period
    };

    // Check violations
    const violations: SLAViolation[] = [];

    if (thresholds.maxExecutionTime && avgExecutionTime > thresholds.maxExecutionTime) {
      violations.push({
        metric: 'avgExecutionTime',
        threshold: thresholds.maxExecutionTime,
        actual: avgExecutionTime,
        severity: avgExecutionTime > thresholds.maxExecutionTime * 2 ? 'critical' : 'major',
        timestamp: new Date(),
      });
    }

    if (thresholds.minSuccessRate && actualMetrics.successRate < thresholds.minSuccessRate) {
      violations.push({
        metric: 'successRate',
        threshold: thresholds.minSuccessRate,
        actual: actualMetrics.successRate,
        severity: actualMetrics.successRate < thresholds.minSuccessRate - 10 ? 'critical' : 'major',
        timestamp: new Date(),
      });
    }

    if (thresholds.maxErrorRate && actualMetrics.errorRate > thresholds.maxErrorRate) {
      violations.push({
        metric: 'errorRate',
        threshold: thresholds.maxErrorRate,
        actual: actualMetrics.errorRate,
        severity: actualMetrics.errorRate > thresholds.maxErrorRate * 2 ? 'critical' : 'major',
        timestamp: new Date(),
      });
    }

    if (thresholds.maxP99Latency && p99Latency > thresholds.maxP99Latency) {
      violations.push({
        metric: 'p99Latency',
        threshold: thresholds.maxP99Latency,
        actual: p99Latency,
        severity: 'major',
        timestamp: new Date(),
      });
    }

    return {
      isCompliant: violations.length === 0,
      thresholds,
      actualMetrics,
      violations,
      trend: 'stable', // Would need historical data for real trend
    };
  }

  /**
   * Get default SLA thresholds
   */
  private getDefaultSLAThresholds(): SLAThresholds {
    return {
      maxExecutionTime: 30000, // 30 seconds
      minSuccessRate: 99, // 99%
      maxErrorRate: 1, // 1%
      maxP99Latency: 60000, // 60 seconds
      minThroughput: 10, // 10 per hour
    };
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    logging: LoggingValidationResult,
    alerting: AlertingValidationResult,
    metrics: MetricsValidationResult,
    sla?: SLAComplianceResult
  ): MonitoringRecommendation[] {
    const recommendations: MonitoringRecommendation[] = [];

    // Logging recommendations
    for (const issue of logging.issues) {
      recommendations.push({
        priority: issue.severity === 'high' ? 'high' : 'medium',
        category: 'logging',
        issue: issue.description,
        recommendation: issue.recommendation,
        impact: 'Improved debugging and troubleshooting',
      });
    }

    // Alerting recommendations
    for (const issue of alerting.issues) {
      recommendations.push({
        priority: issue.severity === 'high' ? 'high' : 'medium',
        category: 'alerting',
        issue: issue.description,
        recommendation: issue.recommendation,
        impact: 'Faster incident detection and response',
      });
    }

    // Metrics recommendations
    for (const issue of metrics.issues) {
      recommendations.push({
        priority: issue.severity === 'high' ? 'high' : 'low',
        category: 'metrics',
        issue: issue.description,
        recommendation: issue.recommendation,
        impact: 'Better observability and performance insights',
      });
    }

    // SLA recommendations
    if (sla && !sla.isCompliant) {
      for (const violation of sla.violations) {
        recommendations.push({
          priority: violation.severity === 'critical' ? 'critical' : 'high',
          category: 'sla',
          issue: `SLA violation: ${violation.metric} is ${violation.actual.toFixed(2)}, threshold is ${violation.threshold}`,
          recommendation: `Investigate and optimize ${violation.metric} to meet SLA`,
          impact: 'Meeting business SLAs and customer expectations',
        });
      }
    }

    // Sort by priority
    const priorityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recommendations;
  }

  /**
   * Calculate overall score
   */
  private calculateOverallScore(
    logging: LoggingValidationResult,
    alerting: AlertingValidationResult,
    metrics: MetricsValidationResult,
    sla?: SLAComplianceResult
  ): number {
    let score = 100;

    // Logging deductions
    if (!logging.isConfigured) score -= 15;
    score -= logging.issues.filter(i => i.severity === 'high').length * 10;
    score -= logging.issues.filter(i => i.severity === 'medium').length * 5;

    // Alerting deductions
    if (!alerting.isConfigured) score -= 20;
    if (!alerting.coverage.errorAlerts) score -= 10;
    if (!alerting.coverage.performanceAlerts) score -= 5;
    score -= alerting.issues.filter(i => i.severity === 'high').length * 10;

    // Metrics deductions
    if (!metrics.isConfigured) score -= 10;
    if (!metrics.coverage.executionMetrics) score -= 5;
    score -= metrics.issues.filter(i => i.severity === 'high').length * 5;

    // SLA deductions
    if (sla && !sla.isCompliant) {
      score -= sla.violations.filter(v => v.severity === 'critical').length * 15;
      score -= sla.violations.filter(v => v.severity === 'major').length * 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get default results
   */
  private getDefaultLoggingResult(): LoggingValidationResult {
    return {
      isConfigured: false,
      level: 'unknown',
      issues: [],
      coverage: { nodesWithLogging: 0, totalNodes: 0, percentage: 0 },
    };
  }

  private getDefaultAlertingResult(): AlertingValidationResult {
    return {
      isConfigured: false,
      rules: [],
      issues: [],
      coverage: { errorAlerts: false, performanceAlerts: false, businessAlerts: false },
    };
  }

  private getDefaultMetricsResult(): MetricsValidationResult {
    return {
      isConfigured: false,
      metrics: [],
      issues: [],
      coverage: { executionMetrics: false, nodeMetrics: false, businessMetrics: false },
    };
  }

  /**
   * Record execution for SLA tracking
   */
  recordExecution(workflowId: string, execution: N8nExecution): void {
    const executions = this.monitoringExecutionHistory.get(workflowId) || [];
    executions.push(execution);
    // Keep last 100 executions
    if (executions.length > 100) {
      executions.shift();
    }
    this.monitoringExecutionHistory.set(workflowId, executions);
  }

  /**
   * Execute workflows multiple times to collect real metrics
   * This validates that metrics are actually being collected correctly
   */
  private async executeRuntimeMetricsValidation(
    workflowId: string,
    testInput?: Record<string, unknown>,
    iterations: number = 5
  ): Promise<void> {
    const input = testInput || { test: true, timestamp: Date.now() };

    for (let i = 0; i < iterations; i++) {
      try {
        // Execute workflow
        const execution = await this.executeWorkflow(workflowId, {
          ...input,
          iteration: i + 1,
        }, {
          waitForCompletion: true,
          timeout: 30000,
        });

        // Wait for completion
        const completedExecution = await this.waitForExecution(execution.id, 30000);

        // Record the execution for metrics
        this.recordExecution(workflowId, completedExecution);

        // Verify that execution metadata is captured
        this.verifyExecutionMetadata(completedExecution, i + 1);
      } catch (error) {
        // Record failed execution too - important for error rate
        const failedExecution: N8nExecution = {
          id: `failed-${Date.now()}-${i}`,
          finished: true,
          status: 'failed',
          mode: 'manual',
          startedAt: new Date().toISOString(),
          stoppedAt: new Date().toISOString(),
          workflowId,
          data: {
            resultData: {
              error: {
                message: error instanceof Error ? error.message : 'Unknown error',
                node: 'unknown',
              },
              runData: {},
              lastNodeExecuted: '',
            },
          },
        };
        this.recordExecution(workflowId, failedExecution);
      }
    }
  }

  /**
   * Verify execution has proper metadata for monitoring
   */
  private verifyExecutionMetadata(
    execution: N8nExecution,
    iteration: number
  ): void {
    const issues: string[] = [];

    // Check for required fields
    if (!execution.startedAt) {
      issues.push('Missing startedAt timestamp');
    }
    if (!execution.stoppedAt && execution.finished) {
      issues.push('Missing stoppedAt timestamp');
    }
    if (!execution.workflowId) {
      issues.push('Missing workflowId');
    }

    // Check run data for node metrics
    const runData = execution.data?.resultData?.runData;
    if (runData) {
      for (const [nodeName, nodeRuns] of Object.entries(runData)) {
        for (const run of nodeRuns) {
          if (!run.startTime) {
            issues.push(`Node ${nodeName}: Missing startTime`);
          }
          if (run.executionStatus === undefined) {
            issues.push(`Node ${nodeName}: Missing executionStatus`);
          }
        }
      }
    }

    if (issues.length > 0) {
      console.warn(`Execution ${execution.id} (iteration ${iteration}) has monitoring issues:`, issues);
    }
  }

  /**
   * Wait for workflow execution to complete
   */
  private async waitForExecution(
    executionId: string,
    timeoutMs: number
  ): Promise<N8nExecution> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const execution = await this.getExecution(executionId);

      if (execution.status !== 'running' && execution.status !== 'waiting') {
        return execution;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`Execution ${executionId} timed out after ${timeoutMs}ms`);
  }
}
