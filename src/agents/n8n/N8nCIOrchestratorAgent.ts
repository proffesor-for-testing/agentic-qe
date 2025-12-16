/**
 * N8nCIOrchestratorAgent
 *
 * CI/CD orchestration for n8n workflow testing:
 * - Test suite execution
 * - Pre-deployment validation
 * - Environment promotion gates
 * - Automated rollback triggers
 * - Test report generation
 */

import { N8nBaseAgent, N8nAgentConfig } from './N8nBaseAgent';
import {
  N8nWorkflow,
  ValidationResult,
} from './types';
import { QETask, AgentCapability } from '../../types';

export interface CITestTask extends QETask {
  type: 'ci-test';
  target: string; // workflowId or 'all'
  options?: {
    environment?: 'development' | 'staging' | 'production';
    testTypes?: Array<'validation' | 'security' | 'performance' | 'integration'>;
    failFast?: boolean;
    generateReport?: boolean;
    promoteOnPass?: boolean;
    rollbackOnFail?: boolean;
    notifyChannels?: string[];
  };
}

export interface CITestResult {
  runId: string;
  workflowId: string;
  environment: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  status: 'passed' | 'failed' | 'error' | 'skipped';
  testResults: TestSuiteResult[];
  summary: CISummary;
  gates: GateResult[];
  actions: CIAction[];
  report?: CIReport;
}

export interface TestSuiteResult {
  type: string;
  status: 'passed' | 'failed' | 'error' | 'skipped';
  duration: number;
  testCount: number;
  passCount: number;
  failCount: number;
  errorCount: number;
  details: Record<string, unknown>;
}

export interface CISummary {
  totalTests: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  passRate: number;
  duration: number;
  critical: CriticalIssue[];
}

export interface CriticalIssue {
  type: string;
  severity: 'critical' | 'high' | 'medium';
  message: string;
  blocksDeployment: boolean;
}

export interface GateResult {
  name: string;
  type: 'quality' | 'security' | 'performance' | 'compliance';
  passed: boolean;
  threshold?: number;
  actual?: number;
  message: string;
}

export interface CIAction {
  action: string;
  status: 'executed' | 'skipped' | 'failed';
  timestamp: Date;
  details?: string;
}

export interface CIReport {
  format: 'json' | 'html' | 'markdown';
  content: string;
  artifacts: CIArtifact[];
}

export interface CIArtifact {
  name: string;
  type: string;
  path: string;
  size: number;
}

// Quality gates configuration
const DEFAULT_GATES: Record<string, { threshold: number; type: GateResult['type'] }> = {
  'test-pass-rate': { threshold: 95, type: 'quality' },
  'security-findings': { threshold: 0, type: 'security' },
  'p95-duration': { threshold: 5000, type: 'performance' },
  'validation-errors': { threshold: 0, type: 'quality' },
};

export class N8nCIOrchestratorAgent extends N8nBaseAgent {
  private testRunners: Map<string, () => Promise<TestSuiteResult>> = new Map();

  constructor(config: N8nAgentConfig) {
    const capabilities: AgentCapability[] = [
      {
        name: 'test-orchestration',
        version: '1.0.0',
        description: 'Orchestrate multi-type test suites',
        parameters: {},
      },
      {
        name: 'quality-gates',
        version: '1.0.0',
        description: 'Enforce deployment quality gates',
        parameters: {},
      },
      {
        name: 'environment-promotion',
        version: '1.0.0',
        description: 'Manage environment promotions',
        parameters: {},
      },
      {
        name: 'report-generation',
        version: '1.0.0',
        description: 'Generate CI/CD test reports',
        parameters: {},
      },
    ];

    super({
      ...config,
      type: 'n8n-ci-orchestrator' as any,
      capabilities: [...capabilities, ...(config.capabilities || [])],
    });
  }

  protected async performTask(task: QETask): Promise<CITestResult> {
    const ciTask = task as CITestTask;

    if (ciTask.type !== 'ci-test') {
      throw new Error(`Unsupported task type: ${ciTask.type}`);
    }

    return this.runCIPipeline(ciTask.target, ciTask.options);
  }

  /**
   * Run complete CI pipeline
   */
  async runCIPipeline(
    workflowId: string,
    options?: CITestTask['options']
  ): Promise<CITestResult> {
    const runId = `ci-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = new Date();
    const environment = options?.environment || 'development';
    const testTypes = options?.testTypes || ['validation', 'security'];

    const actions: CIAction[] = [];
    const testResults: TestSuiteResult[] = [];

    // Log start
    actions.push({
      action: 'pipeline-start',
      status: 'executed',
      timestamp: new Date(),
      details: `Starting CI pipeline for ${workflowId} in ${environment}`,
    });

    try {
      // Get workflow
      const workflow = await this.getWorkflow(workflowId);

      // Run test suites
      for (const testType of testTypes) {
        const result = await this.runTestSuite(workflow, testType, options);
        testResults.push(result);

        // Fail fast if enabled
        if (options?.failFast && result.status === 'failed') {
          actions.push({
            action: 'fail-fast-triggered',
            status: 'executed',
            timestamp: new Date(),
            details: `Test suite ${testType} failed, stopping pipeline`,
          });
          break;
        }
      }

      // Evaluate quality gates
      const gates = this.evaluateGates(testResults);

      // Calculate summary
      const summary = this.calculateSummary(testResults);

      // Determine overall status
      const allGatesPassed = gates.every(g => g.passed);
      const status = this.determineStatus(testResults, allGatesPassed);

      // Execute post-test actions
      if (status === 'passed' && options?.promoteOnPass) {
        actions.push(await this.promoteEnvironment(workflowId, environment));
      }

      if (status === 'failed' && options?.rollbackOnFail) {
        actions.push(await this.triggerRollback(workflowId, environment));
      }

      // Generate report
      let report: CIReport | undefined;
      if (options?.generateReport) {
        report = this.generateReport(runId, workflowId, testResults, summary, gates);
      }

      // Notify if configured
      if (options?.notifyChannels) {
        actions.push(await this.sendNotifications(
          options.notifyChannels,
          workflowId,
          status,
          summary
        ));
      }

      const endTime = new Date();

      const result: CITestResult = {
        runId,
        workflowId,
        environment,
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        status,
        testResults,
        summary,
        gates,
        actions,
        report,
      };

      // Store result
      await this.storeTestResult(`ci-run:${runId}`, result);

      // Emit event
      this.emitEvent('ci.pipeline.completed', {
        runId,
        workflowId,
        status,
        duration: result.duration,
        passRate: summary.passRate,
      });

      return result;
    } catch (error) {
      const endTime = new Date();

      actions.push({
        action: 'pipeline-error',
        status: 'failed',
        timestamp: new Date(),
        details: error instanceof Error ? error.message : String(error),
      });

      return {
        runId,
        workflowId,
        environment,
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        status: 'error',
        testResults,
        summary: {
          totalTests: 0,
          passed: 0,
          failed: 0,
          errors: 1,
          skipped: 0,
          passRate: 0,
          duration: 0,
          critical: [{
            type: 'pipeline-error',
            severity: 'critical',
            message: error instanceof Error ? error.message : String(error),
            blocksDeployment: true,
          }],
        },
        gates: [],
        actions,
      };
    }
  }

  /**
   * Run a specific test suite
   */
  private async runTestSuite(
    workflow: N8nWorkflow,
    testType: string,
    options?: CITestTask['options']
  ): Promise<TestSuiteResult> {
    const startTime = Date.now();

    try {
      switch (testType) {
        case 'validation':
          return await this.runValidationSuite(workflow);
        case 'security':
          return await this.runSecuritySuite(workflow);
        case 'performance':
          return await this.runPerformanceSuite(workflow);
        case 'integration':
          return await this.runIntegrationSuite(workflow);
        default:
          return {
            type: testType,
            status: 'skipped',
            duration: Date.now() - startTime,
            testCount: 0,
            passCount: 0,
            failCount: 0,
            errorCount: 0,
            details: { reason: `Unknown test type: ${testType}` },
          };
      }
    } catch (error) {
      return {
        type: testType,
        status: 'error',
        duration: Date.now() - startTime,
        testCount: 1,
        passCount: 0,
        failCount: 0,
        errorCount: 1,
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  /**
   * Run validation test suite
   */
  private async runValidationSuite(workflow: N8nWorkflow): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const validation = this.validateWorkflowStructure(workflow);

    return {
      type: 'validation',
      status: validation.valid ? 'passed' : 'failed',
      duration: Date.now() - startTime,
      testCount: validation.issues.length + 1,
      passCount: validation.valid ? validation.issues.length + 1 : 0,
      failCount: validation.valid ? 0 : validation.issues.filter(i => i.severity === 'error').length,
      errorCount: 0,
      details: {
        valid: validation.valid,
        issues: validation.issues,
      },
    };
  }

  /**
   * Run security test suite
   */
  private async runSecuritySuite(workflow: N8nWorkflow): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const findings: Array<{ severity: string; message: string }> = [];

    // Check for hardcoded secrets
    for (const node of workflow.nodes) {
      const params = JSON.stringify(node.parameters);
      if (/password|secret|api_?key|token/i.test(params)) {
        const matches = params.match(/(password|secret|api_?key|token)\s*[=:]\s*["'][^"']+["']/gi);
        if (matches) {
          findings.push({
            severity: 'critical',
            message: `Potential hardcoded secret in node ${node.name}`,
          });
        }
      }
    }

    // Check for dangerous code
    const codeNodes = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.code');
    for (const node of codeNodes) {
      const code = node.parameters.jsCode as string;
      if (code && /eval\s*\(|new\s+Function|exec\s*\(/i.test(code)) {
        findings.push({
          severity: 'high',
          message: `Dangerous code pattern in node ${node.name}`,
        });
      }
    }

    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;

    return {
      type: 'security',
      status: criticalCount > 0 ? 'failed' : (highCount > 0 ? 'failed' : 'passed'),
      duration: Date.now() - startTime,
      testCount: workflow.nodes.length,
      passCount: workflow.nodes.length - findings.length,
      failCount: findings.length,
      errorCount: 0,
      details: {
        findings,
        criticalCount,
        highCount,
      },
    };
  }

  /**
   * Run performance test suite
   */
  private async runPerformanceSuite(workflow: N8nWorkflow): Promise<TestSuiteResult> {
    const startTime = Date.now();

    // Analyze workflow complexity
    const complexity = this.analyzeComplexity(workflow);
    const issues: string[] = [];

    if (complexity.nodeCount > 50) {
      issues.push('Workflow has more than 50 nodes - consider breaking into sub-workflows');
    }

    if (complexity.maxDepth > 10) {
      issues.push('Workflow depth exceeds 10 levels - may cause performance issues');
    }

    if (complexity.httpRequestCount > 10) {
      issues.push('More than 10 HTTP requests - consider batching or parallelization');
    }

    return {
      type: 'performance',
      status: issues.length === 0 ? 'passed' : 'failed',
      duration: Date.now() - startTime,
      testCount: 3,
      passCount: 3 - issues.length,
      failCount: issues.length,
      errorCount: 0,
      details: {
        complexity,
        issues,
      },
    };
  }

  /**
   * Run integration test suite
   */
  private async runIntegrationSuite(workflow: N8nWorkflow): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const issues: string[] = [];

    // Check for missing credentials
    for (const node of workflow.nodes) {
      if (this.requiresCredentials(node) && !node.credentials) {
        issues.push(`Node ${node.name} requires credentials but none configured`);
      }
    }

    // Check for broken connections
    const nodeIds = new Set(workflow.nodes.map(n => n.id));
    for (const conn of Object.values(workflow.connections)) {
      for (const outputs of Object.values(conn)) {
        for (const connections of outputs) {
          for (const connection of connections) {
            if (!nodeIds.has(connection.node)) {
              issues.push(`Connection references non-existent node: ${connection.node}`);
            }
          }
        }
      }
    }

    return {
      type: 'integration',
      status: issues.length === 0 ? 'passed' : 'failed',
      duration: Date.now() - startTime,
      testCount: workflow.nodes.length + Object.keys(workflow.connections).length,
      passCount: workflow.nodes.length + Object.keys(workflow.connections).length - issues.length,
      failCount: issues.length,
      errorCount: 0,
      details: {
        issues,
        nodesChecked: workflow.nodes.length,
        connectionsChecked: Object.keys(workflow.connections).length,
      },
    };
  }

  /**
   * Check if node requires credentials
   */
  private requiresCredentials(node: { type: string }): boolean {
    const credentialNodes = [
      'httpRequest', 'slack', 'github', 'postgres', 'mysql',
      'mongodb', 'redis', 'smtp', 'aws', 'googleSheets',
    ];
    return credentialNodes.some(n => node.type.toLowerCase().includes(n.toLowerCase()));
  }

  /**
   * Analyze workflow complexity
   */
  private analyzeComplexity(workflow: N8nWorkflow): {
    nodeCount: number;
    maxDepth: number;
    httpRequestCount: number;
    codeNodeCount: number;
  } {
    return {
      nodeCount: workflow.nodes.length,
      maxDepth: this.calculateMaxDepth(workflow),
      httpRequestCount: workflow.nodes.filter(n => n.type.includes('httpRequest')).length,
      codeNodeCount: workflow.nodes.filter(n => n.type.includes('code')).length,
    };
  }

  /**
   * Calculate max workflow depth
   */
  private calculateMaxDepth(workflow: N8nWorkflow): number {
    const nodeMap = new Map(workflow.nodes.map(n => [n.id, n]));
    const depths = new Map<string, number>();

    const calculateDepth = (nodeId: string, visited: Set<string> = new Set()): number => {
      if (visited.has(nodeId)) return 0;
      if (depths.has(nodeId)) return depths.get(nodeId)!;

      visited.add(nodeId);
      let maxChildDepth = 0;

      const nodeConnections = workflow.connections[nodeId];
      if (nodeConnections) {
        for (const outputs of Object.values(nodeConnections)) {
          for (const connections of outputs) {
            for (const conn of connections) {
              const childDepth = calculateDepth(conn.node, new Set(visited));
              maxChildDepth = Math.max(maxChildDepth, childDepth);
            }
          }
        }
      }

      const depth = maxChildDepth + 1;
      depths.set(nodeId, depth);
      return depth;
    };

    let maxDepth = 0;
    for (const node of workflow.nodes) {
      maxDepth = Math.max(maxDepth, calculateDepth(node.id));
    }

    return maxDepth;
  }

  /**
   * Evaluate quality gates
   */
  private evaluateGates(testResults: TestSuiteResult[]): GateResult[] {
    const gates: GateResult[] = [];

    // Test pass rate gate
    const totalTests = testResults.reduce((sum, r) => sum + r.testCount, 0);
    const passedTests = testResults.reduce((sum, r) => sum + r.passCount, 0);
    const passRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

    gates.push({
      name: 'Test Pass Rate',
      type: 'quality',
      passed: passRate >= DEFAULT_GATES['test-pass-rate'].threshold,
      threshold: DEFAULT_GATES['test-pass-rate'].threshold,
      actual: passRate,
      message: passRate >= DEFAULT_GATES['test-pass-rate'].threshold
        ? `Pass rate ${passRate.toFixed(1)}% meets threshold`
        : `Pass rate ${passRate.toFixed(1)}% below ${DEFAULT_GATES['test-pass-rate'].threshold}% threshold`,
    });

    // Security findings gate
    const securityResult = testResults.find(r => r.type === 'security');
    if (securityResult) {
      const criticalFindings = (securityResult.details.criticalCount as number) || 0;
      gates.push({
        name: 'Security Findings',
        type: 'security',
        passed: criticalFindings === 0,
        threshold: 0,
        actual: criticalFindings,
        message: criticalFindings === 0
          ? 'No critical security findings'
          : `${criticalFindings} critical security findings detected`,
      });
    }

    // Validation errors gate
    const validationResult = testResults.find(r => r.type === 'validation');
    if (validationResult) {
      gates.push({
        name: 'Validation Errors',
        type: 'quality',
        passed: validationResult.status === 'passed',
        message: validationResult.status === 'passed'
          ? 'Workflow validation passed'
          : 'Workflow has validation errors',
      });
    }

    return gates;
  }

  /**
   * Calculate summary
   */
  private calculateSummary(testResults: TestSuiteResult[]): CISummary {
    const totalTests = testResults.reduce((sum, r) => sum + r.testCount, 0);
    const passed = testResults.reduce((sum, r) => sum + r.passCount, 0);
    const failed = testResults.reduce((sum, r) => sum + r.failCount, 0);
    const errors = testResults.reduce((sum, r) => sum + r.errorCount, 0);
    const skipped = testResults.filter(r => r.status === 'skipped').length;
    const duration = testResults.reduce((sum, r) => sum + r.duration, 0);

    const critical: CriticalIssue[] = [];

    // Collect critical issues
    for (const result of testResults) {
      if (result.status === 'failed' && result.type === 'security') {
        const findings = result.details.findings as Array<{ severity: string; message: string }>;
        for (const finding of findings.filter(f => f.severity === 'critical')) {
          critical.push({
            type: 'security',
            severity: 'critical',
            message: finding.message,
            blocksDeployment: true,
          });
        }
      }
    }

    return {
      totalTests,
      passed,
      failed,
      errors,
      skipped,
      passRate: totalTests > 0 ? (passed / totalTests) * 100 : 0,
      duration,
      critical,
    };
  }

  /**
   * Determine overall status
   */
  private determineStatus(
    testResults: TestSuiteResult[],
    allGatesPassed: boolean
  ): CITestResult['status'] {
    if (testResults.some(r => r.status === 'error')) {
      return 'error';
    }
    if (!allGatesPassed || testResults.some(r => r.status === 'failed')) {
      return 'failed';
    }
    if (testResults.every(r => r.status === 'skipped')) {
      return 'skipped';
    }
    return 'passed';
  }

  /**
   * Promote to next environment
   */
  private async promoteEnvironment(
    workflowId: string,
    currentEnv: string
  ): Promise<CIAction> {
    const nextEnv = currentEnv === 'development' ? 'staging' : 'production';

    // In a real implementation, this would trigger deployment
    return {
      action: 'environment-promotion',
      status: 'executed',
      timestamp: new Date(),
      details: `Promoting ${workflowId} from ${currentEnv} to ${nextEnv}`,
    };
  }

  /**
   * Trigger rollback
   */
  private async triggerRollback(
    workflowId: string,
    environment: string
  ): Promise<CIAction> {
    // In a real implementation, this would trigger rollback
    return {
      action: 'rollback',
      status: 'executed',
      timestamp: new Date(),
      details: `Rolling back ${workflowId} in ${environment}`,
    };
  }

  /**
   * Send notifications
   */
  private async sendNotifications(
    channels: string[],
    workflowId: string,
    status: string,
    summary: CISummary
  ): Promise<CIAction> {
    // In a real implementation, this would send to Slack, email, etc.
    return {
      action: 'notification',
      status: 'executed',
      timestamp: new Date(),
      details: `Notified ${channels.join(', ')} about ${workflowId} status: ${status}`,
    };
  }

  /**
   * Generate CI report
   */
  private generateReport(
    runId: string,
    workflowId: string,
    testResults: TestSuiteResult[],
    summary: CISummary,
    gates: GateResult[]
  ): CIReport {
    const markdown = `# CI Test Report

## Run Information
- **Run ID**: ${runId}
- **Workflow**: ${workflowId}
- **Date**: ${new Date().toISOString()}

## Summary
- **Total Tests**: ${summary.totalTests}
- **Passed**: ${summary.passed}
- **Failed**: ${summary.failed}
- **Pass Rate**: ${summary.passRate.toFixed(1)}%
- **Duration**: ${summary.duration}ms

## Quality Gates
${gates.map(g => `- ${g.passed ? '✅' : '❌'} **${g.name}**: ${g.message}`).join('\n')}

## Test Results
${testResults.map(r => `
### ${r.type.charAt(0).toUpperCase() + r.type.slice(1)} Tests
- Status: ${r.status}
- Tests: ${r.testCount} (${r.passCount} passed, ${r.failCount} failed)
- Duration: ${r.duration}ms
`).join('\n')}

${summary.critical.length > 0 ? `
## Critical Issues
${summary.critical.map(c => `- ⚠️ **${c.type}**: ${c.message}`).join('\n')}
` : ''}
`;

    return {
      format: 'markdown',
      content: markdown,
      artifacts: [],
    };
  }

  /**
   * Run CI for all workflows
   */
  async runCIForAllWorkflows(
    options?: CITestTask['options']
  ): Promise<CITestResult[]> {
    const workflows = await this.n8nClient.listWorkflows();
    const results: CITestResult[] = [];

    for (const workflow of workflows) {
      const result = await this.runCIPipeline(workflow.id, options);
      results.push(result);
    }

    return results;
  }
}
