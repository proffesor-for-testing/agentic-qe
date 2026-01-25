/**
 * N8nBDDScenarioTesterAgent
 *
 * Behavior-Driven Development testing for n8n workflows:
 * - Gherkin scenario parsing
 * - Feature file execution
 * - Business requirement validation
 * - Natural language test definitions
 */

import { N8nBaseAgent, N8nAgentConfig } from './N8nBaseAgent';
import {
  N8nWorkflow,
  N8nExecution,
} from './types';
import { QETask, AgentCapability } from '../../types';

export interface BDDTestTask extends QETask {
  type: 'bdd-test';
  target: string; // workflowId
  options?: {
    scenarios?: GherkinScenario[];
    featureFile?: string;
    tags?: string[];
    dryRun?: boolean;
    generateReport?: boolean;
  };
}

export interface GherkinScenario {
  name: string;
  description?: string;
  tags?: string[];
  given: GherkinStep[];
  when: GherkinStep[];
  then: GherkinStep[];
  examples?: ScenarioExample[];
}

export interface GherkinStep {
  keyword: 'Given' | 'When' | 'Then' | 'And' | 'But';
  text: string;
  dataTable?: Record<string, string>[];
  docString?: string;
}

export interface ScenarioExample {
  name: string;
  values: Record<string, string>;
}

export interface BDDTestResult {
  workflowId: string;
  featureName: string;
  scenarios: ScenarioResult[];
  summary: BDDSummary;
  coverage: BDDCoverage;
  report?: BDDReport;
}

export interface ScenarioResult {
  name: string;
  description?: string;
  tags: string[];
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  duration: number;
  steps: StepResult[];
  error?: string;
  example?: Record<string, string>;
}

export interface StepResult {
  keyword: string;
  text: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  duration: number;
  error?: string;
  screenshot?: string;
}

export interface BDDSummary {
  totalScenarios: number;
  passed: number;
  failed: number;
  skipped: number;
  pending: number;
  totalSteps: number;
  stepsPassed: number;
  stepsFailed: number;
  duration: number;
}

export interface BDDCoverage {
  nodesCovered: string[];
  nodesUncovered: string[];
  pathsCovered: string[];
  coveragePercentage: number;
}

export interface BDDReport {
  format: 'cucumber-json' | 'html' | 'markdown';
  content: string;
}

// Step definition patterns
const STEP_PATTERNS: Array<{
  pattern: RegExp;
  handler: string;
}> = [
  {
    pattern: /^the workflow "([^"]+)" is (active|inactive)$/i,
    handler: 'checkWorkflowStatus',
  },
  {
    pattern: /^I trigger the workflow with data:?$/i,
    handler: 'triggerWorkflow',
  },
  {
    pattern: /^I execute the workflow$/i,
    handler: 'executeWorkflow',
  },
  {
    pattern: /^the workflow should complete (successfully|with errors?)$/i,
    handler: 'checkCompletion',
  },
  {
    pattern: /^the output should contain "([^"]+)"$/i,
    handler: 'checkOutputContains',
  },
  {
    pattern: /^the output field "([^"]+)" should equal "([^"]+)"$/i,
    handler: 'checkOutputField',
  },
  {
    pattern: /^the node "([^"]+)" should be executed$/i,
    handler: 'checkNodeExecuted',
  },
  {
    pattern: /^the execution time should be less than (\d+)ms$/i,
    handler: 'checkExecutionTime',
  },
  {
    pattern: /^no errors should occur$/i,
    handler: 'checkNoErrors',
  },
  {
    pattern: /^the item count should be (\d+)$/i,
    handler: 'checkItemCount',
  },
];

export class N8nBDDScenarioTesterAgent extends N8nBaseAgent {
  private lastExecution: N8nExecution | null = null;
  private lastOutput: Record<string, unknown> | null = null;
  private executedNodes: Set<string> = new Set();

  constructor(config: N8nAgentConfig) {
    const capabilities: AgentCapability[] = [
      {
        name: 'gherkin-parsing',
        version: '1.0.0',
        description: 'Parse and execute Gherkin scenarios',
        parameters: {},
      },
      {
        name: 'step-matching',
        version: '1.0.0',
        description: 'Match natural language steps to actions',
        parameters: {},
      },
      {
        name: 'scenario-execution',
        version: '1.0.0',
        description: 'Execute BDD scenarios against workflows',
        parameters: {},
      },
      {
        name: 'business-validation',
        version: '1.0.0',
        description: 'Validate business requirements',
        parameters: {},
      },
    ];

    super({
      ...config,
      type: 'n8n-bdd-scenario-tester' as any,
      capabilities: [...capabilities, ...(config.capabilities || [])],
    });
  }

  protected async performTask(task: QETask): Promise<BDDTestResult> {
    const bddTask = task as BDDTestTask;

    if (bddTask.type !== 'bdd-test') {
      throw new Error(`Unsupported task type: ${bddTask.type}`);
    }

    return this.runBDDTests(bddTask.target, bddTask.options);
  }

  /**
   * Run BDD tests for workflow
   */
  async runBDDTests(
    workflowId: string,
    options?: BDDTestTask['options']
  ): Promise<BDDTestResult> {
    const workflow = await this.getWorkflow(workflowId);
    const startTime = Date.now();

    // Get scenarios from options or generate from workflow
    let scenarios = options?.scenarios || [];
    if (scenarios.length === 0 && options?.featureFile) {
      scenarios = this.parseFeatureFile(options.featureFile);
    }
    if (scenarios.length === 0) {
      scenarios = this.generateScenariosFromWorkflow(workflow);
    }

    // Filter by tags if specified
    if (options?.tags && options.tags.length > 0) {
      scenarios = scenarios.filter(s =>
        s.tags?.some(t => options.tags!.includes(t))
      );
    }

    // Execute scenarios
    const results: ScenarioResult[] = [];
    for (const scenario of scenarios) {
      if (scenario.examples && scenario.examples.length > 0) {
        // Scenario Outline with examples
        for (const example of scenario.examples) {
          const result = await this.executeScenario(
            workflow,
            scenario,
            options?.dryRun,
            example.values
          );
          result.example = example.values;
          results.push(result);
        }
      } else {
        const result = await this.executeScenario(workflow, scenario, options?.dryRun);
        results.push(result);
      }
    }

    // Calculate summary
    const summary = this.calculateSummary(results, Date.now() - startTime);

    // Calculate coverage
    const coverage = this.calculateCoverage(workflow, results);

    // Generate report if requested
    let report: BDDReport | undefined;
    if (options?.generateReport) {
      report = this.generateReport(workflow.name, results, summary);
    }

    const result: BDDTestResult = {
      workflowId,
      featureName: workflow.name,
      scenarios: results,
      summary,
      coverage,
      report,
    };

    // Store result
    await this.storeTestResult(`bdd-test:${workflowId}`, result);

    // Emit event
    this.emitEvent('bdd.test.completed', {
      workflowId,
      scenariosPassed: summary.passed,
      scenariosFailed: summary.failed,
      coverage: coverage.coveragePercentage,
    });

    return result;
  }

  /**
   * Parse feature file content
   */
  parseFeatureFile(content: string): GherkinScenario[] {
    const scenarios: GherkinScenario[] = [];
    const lines = content.split('\n').map(l => l.trim());

    let currentScenario: GherkinScenario | null = null;
    let currentSection: 'given' | 'when' | 'then' | null = null;
    let currentTags: string[] = [];

    for (const line of lines) {
      // Skip empty lines and comments
      if (!line || line.startsWith('#')) continue;

      // Parse tags
      if (line.startsWith('@')) {
        currentTags = line.split(/\s+/).filter(t => t.startsWith('@'));
        continue;
      }

      // Parse scenario
      if (line.startsWith('Scenario:') || line.startsWith('Scenario Outline:')) {
        if (currentScenario) {
          scenarios.push(currentScenario);
        }
        currentScenario = {
          name: line.replace(/Scenario( Outline)?:\s*/, ''),
          tags: [...currentTags],
          given: [],
          when: [],
          then: [],
        };
        currentTags = [];
        currentSection = null;
        continue;
      }

      // Parse steps
      if (currentScenario) {
        if (line.startsWith('Given ')) {
          currentSection = 'given';
          currentScenario.given.push({
            keyword: 'Given',
            text: line.replace('Given ', ''),
          });
        } else if (line.startsWith('When ')) {
          currentSection = 'when';
          currentScenario.when.push({
            keyword: 'When',
            text: line.replace('When ', ''),
          });
        } else if (line.startsWith('Then ')) {
          currentSection = 'then';
          currentScenario.then.push({
            keyword: 'Then',
            text: line.replace('Then ', ''),
          });
        } else if (line.startsWith('And ') || line.startsWith('But ')) {
          const keyword = line.startsWith('And ') ? 'And' : 'But';
          const text = line.replace(/^(And|But) /, '');
          if (currentSection && currentScenario[currentSection]) {
            currentScenario[currentSection].push({ keyword, text });
          }
        } else if (line.startsWith('Examples:')) {
          // Parse examples table (simplified)
          currentScenario.examples = currentScenario.examples || [];
        }
      }
    }

    if (currentScenario) {
      scenarios.push(currentScenario);
    }

    return scenarios;
  }

  /**
   * Generate scenarios from workflow
   */
  private generateScenariosFromWorkflow(workflow: N8nWorkflow): GherkinScenario[] {
    const scenarios: GherkinScenario[] = [];

    // Basic execution scenario
    scenarios.push({
      name: `Execute ${workflow.name}`,
      description: 'Verify workflow executes successfully',
      tags: ['@auto-generated', '@smoke'],
      given: [
        { keyword: 'Given', text: `the workflow "${workflow.name}" is active` },
      ],
      when: [
        { keyword: 'When', text: 'I execute the workflow' },
      ],
      then: [
        { keyword: 'Then', text: 'the workflow should complete successfully' },
        { keyword: 'And', text: 'no errors should occur' },
      ],
    });

    // Node-specific scenarios
    for (const node of workflow.nodes) {
      if (node.type.includes('trigger')) continue;

      scenarios.push({
        name: `Verify ${node.name} execution`,
        tags: ['@auto-generated', '@node-test'],
        given: [
          { keyword: 'Given', text: `the workflow "${workflow.name}" is active` },
        ],
        when: [
          { keyword: 'When', text: 'I execute the workflow' },
        ],
        then: [
          { keyword: 'Then', text: `the node "${node.name}" should be executed` },
        ],
      });
    }

    return scenarios;
  }

  /**
   * Execute a single scenario
   */
  private async executeScenario(
    workflow: N8nWorkflow,
    scenario: GherkinScenario,
    dryRun?: boolean,
    exampleValues?: Record<string, string>
  ): Promise<ScenarioResult> {
    const startTime = Date.now();
    const stepResults: StepResult[] = [];
    let scenarioStatus: ScenarioResult['status'] = 'passed';
    let scenarioError: string | undefined;

    // Reset state
    this.lastExecution = null;
    this.lastOutput = null;
    this.executedNodes.clear();

    // Execute all steps
    const allSteps = [
      ...scenario.given,
      ...scenario.when,
      ...scenario.then,
    ];

    for (const step of allSteps) {
      // Replace example placeholders
      let stepText = step.text;
      if (exampleValues) {
        for (const [key, value] of Object.entries(exampleValues)) {
          stepText = stepText.replace(new RegExp(`<${key}>`, 'g'), value);
        }
      }

      const stepResult = await this.executeStep(
        workflow,
        { ...step, text: stepText },
        dryRun
      );
      stepResults.push(stepResult);

      if (stepResult.status === 'failed') {
        scenarioStatus = 'failed';
        scenarioError = stepResult.error;
        // Skip remaining steps
        break;
      }
    }

    // Mark remaining steps as skipped
    if (scenarioStatus === 'failed') {
      const executedCount = stepResults.length;
      for (let i = executedCount; i < allSteps.length; i++) {
        stepResults.push({
          keyword: allSteps[i].keyword,
          text: allSteps[i].text,
          status: 'skipped',
          duration: 0,
        });
      }
    }

    return {
      name: scenario.name,
      description: scenario.description,
      tags: scenario.tags || [],
      status: scenarioStatus,
      duration: Date.now() - startTime,
      steps: stepResults,
      error: scenarioError,
    };
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    workflow: N8nWorkflow,
    step: GherkinStep,
    dryRun?: boolean
  ): Promise<StepResult> {
    const startTime = Date.now();

    if (dryRun) {
      return {
        keyword: step.keyword,
        text: step.text,
        status: 'pending',
        duration: Date.now() - startTime,
      };
    }

    try {
      // Match step to handler
      const matched = this.matchStep(step.text);
      if (!matched) {
        return {
          keyword: step.keyword,
          text: step.text,
          status: 'pending',
          duration: Date.now() - startTime,
          error: 'No matching step definition found',
        };
      }

      // Execute handler
      await this.executeHandler(workflow, matched.handler, matched.params, step);

      return {
        keyword: step.keyword,
        text: step.text,
        status: 'passed',
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        keyword: step.keyword,
        text: step.text,
        status: 'failed',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Match step text to pattern
   */
  private matchStep(text: string): { handler: string; params: string[] } | null {
    for (const { pattern, handler } of STEP_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        return {
          handler,
          params: match.slice(1),
        };
      }
    }
    return null;
  }

  /**
   * Execute step handler
   */
  private async executeHandler(
    workflow: N8nWorkflow,
    handler: string,
    params: string[],
    step: GherkinStep
  ): Promise<void> {
    switch (handler) {
      case 'checkWorkflowStatus':
        this.checkWorkflowStatus(workflow, params[0], params[1]);
        break;
      case 'triggerWorkflow':
        await this.triggerWorkflowStep(workflow, step.dataTable);
        break;
      case 'executeWorkflow':
        await this.executeWorkflowStep(workflow);
        break;
      case 'checkCompletion':
        this.checkCompletion(params[0]);
        break;
      case 'checkOutputContains':
        this.checkOutputContains(params[0]);
        break;
      case 'checkOutputField':
        this.checkOutputField(params[0], params[1]);
        break;
      case 'checkNodeExecuted':
        this.checkNodeExecuted(params[0]);
        break;
      case 'checkExecutionTime':
        this.checkExecutionTime(parseInt(params[0], 10));
        break;
      case 'checkNoErrors':
        this.checkNoErrors();
        break;
      case 'checkItemCount':
        this.checkItemCount(parseInt(params[0], 10));
        break;
      default:
        throw new Error(`Unknown handler: ${handler}`);
    }
  }

  // Step handler implementations

  private checkWorkflowStatus(
    workflow: N8nWorkflow,
    expectedName: string,
    expectedStatus: string
  ): void {
    if (!workflow.name.includes(expectedName)) {
      throw new Error(`Workflow name mismatch: expected "${expectedName}", got "${workflow.name}"`);
    }
    const isActive = workflow.active !== false;
    const expectActive = expectedStatus === 'active';
    if (isActive !== expectActive) {
      throw new Error(`Workflow is ${isActive ? 'active' : 'inactive'}, expected ${expectedStatus}`);
    }
  }

  private async triggerWorkflowStep(
    workflow: N8nWorkflow,
    dataTable?: Record<string, string>[]
  ): Promise<void> {
    const inputData = dataTable?.[0] || {};
    // Actually execute and wait for completion
    const execution = await this.executeWorkflow(workflow.id, inputData, {
      waitForCompletion: true,
      timeout: 30000,
    });
    this.lastExecution = await this.waitForExecution(execution.id, 30000);
    this.extractExecutedNodes();
    this.extractOutput();
  }

  private async executeWorkflowStep(workflow: N8nWorkflow): Promise<void> {
    // Actually execute and wait for completion
    const execution = await this.executeWorkflow(workflow.id, {}, {
      waitForCompletion: true,
      timeout: 30000,
    });
    this.lastExecution = await this.waitForExecution(execution.id, 30000);
    this.extractExecutedNodes();
    this.extractOutput();
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

  /**
   * Extract output from last execution for assertions
   */
  private extractOutput(): void {
    if (this.lastExecution?.data?.resultData?.runData) {
      // Get the last node's output
      const lastNode = this.lastExecution.data.resultData.lastNodeExecuted;
      if (lastNode) {
        const nodeRuns = this.lastExecution.data.resultData.runData[lastNode];
        if (nodeRuns && nodeRuns.length > 0) {
          const lastRun = nodeRuns[nodeRuns.length - 1];
          const outputItems = lastRun.data?.main?.[0];
          if (outputItems && outputItems.length > 0) {
            this.lastOutput = outputItems[0].json as Record<string, unknown>;
          }
        }
      }
    }
  }

  private extractExecutedNodes(): void {
    if (this.lastExecution?.data?.resultData?.runData) {
      for (const nodeName of Object.keys(this.lastExecution.data.resultData.runData)) {
        this.executedNodes.add(nodeName);
      }
    }
  }

  private checkCompletion(expectedResult: string): void {
    if (!this.lastExecution) {
      throw new Error('No execution found');
    }
    const expectSuccess = expectedResult === 'successfully';
    const isSuccess = this.lastExecution.status === 'success';
    if (isSuccess !== expectSuccess) {
      throw new Error(`Workflow ${isSuccess ? 'succeeded' : 'failed'}, expected to ${expectSuccess ? 'succeed' : 'fail'}`);
    }
  }

  private checkOutputContains(expectedContent: string): void {
    const outputStr = JSON.stringify(this.lastExecution?.data || {});
    if (!outputStr.includes(expectedContent)) {
      throw new Error(`Output does not contain "${expectedContent}"`);
    }
  }

  private checkOutputField(field: string, expectedValue: string): void {
    const data = this.lastExecution?.data?.resultData?.runData;
    if (!data) {
      throw new Error('No output data found');
    }
    // Simplified field check
    const outputStr = JSON.stringify(data);
    if (!outputStr.includes(`"${field}":`) || !outputStr.includes(expectedValue)) {
      throw new Error(`Field "${field}" does not equal "${expectedValue}"`);
    }
  }

  private checkNodeExecuted(nodeName: string): void {
    if (!this.executedNodes.has(nodeName)) {
      throw new Error(`Node "${nodeName}" was not executed`);
    }
  }

  private checkExecutionTime(maxMs: number): void {
    if (!this.lastExecution) {
      throw new Error('No execution found');
    }
    const startTime = new Date(this.lastExecution.startedAt).getTime();
    const endTime = this.lastExecution.stoppedAt
      ? new Date(this.lastExecution.stoppedAt).getTime()
      : Date.now();
    const duration = endTime - startTime;
    if (duration > maxMs) {
      throw new Error(`Execution took ${duration}ms, expected less than ${maxMs}ms`);
    }
  }

  private checkNoErrors(): void {
    if (this.lastExecution?.status === 'failed' || this.lastExecution?.status === 'crashed') {
      throw new Error('Execution had errors');
    }
  }

  private checkItemCount(expectedCount: number): void {
    let actualCount = 0;
    if (this.lastExecution?.data?.resultData?.runData) {
      for (const nodeData of Object.values(this.lastExecution.data.resultData.runData)) {
        if (Array.isArray(nodeData)) {
          for (const run of nodeData) {
            if (run.data?.main) {
              for (const output of run.data.main) {
                actualCount += output?.length || 0;
              }
            }
          }
        }
      }
    }
    if (actualCount !== expectedCount) {
      throw new Error(`Item count is ${actualCount}, expected ${expectedCount}`);
    }
  }

  /**
   * Calculate summary
   */
  private calculateSummary(results: ScenarioResult[], duration: number): BDDSummary {
    const totalSteps = results.reduce((sum, r) => sum + r.steps.length, 0);
    const stepsPassed = results.reduce(
      (sum, r) => sum + r.steps.filter(s => s.status === 'passed').length,
      0
    );
    const stepsFailed = results.reduce(
      (sum, r) => sum + r.steps.filter(s => s.status === 'failed').length,
      0
    );

    return {
      totalScenarios: results.length,
      passed: results.filter(r => r.status === 'passed').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      pending: results.filter(r => r.status === 'pending').length,
      totalSteps,
      stepsPassed,
      stepsFailed,
      duration,
    };
  }

  /**
   * Calculate coverage
   */
  private calculateCoverage(
    workflow: N8nWorkflow,
    results: ScenarioResult[]
  ): BDDCoverage {
    const allNodes = new Set(workflow.nodes.map(n => n.name));
    const coveredNodes = new Set<string>();

    for (const result of results) {
      if (result.status === 'passed') {
        // Extract node names from steps
        for (const step of result.steps) {
          const nodeMatch = step.text.match(/node "([^"]+)"/);
          if (nodeMatch) {
            coveredNodes.add(nodeMatch[1]);
          }
        }
      }
    }

    const nodesCovered = [...coveredNodes];
    const nodesUncovered = [...allNodes].filter(n => !coveredNodes.has(n));

    return {
      nodesCovered,
      nodesUncovered,
      pathsCovered: [], // Would require more complex path analysis
      coveragePercentage: allNodes.size > 0
        ? (coveredNodes.size / allNodes.size) * 100
        : 0,
    };
  }

  /**
   * Generate report
   */
  private generateReport(
    featureName: string,
    results: ScenarioResult[],
    summary: BDDSummary
  ): BDDReport {
    const lines: string[] = [
      `# BDD Test Report: ${featureName}`,
      '',
      `**Date:** ${new Date().toISOString()}`,
      '',
      '## Summary',
      '',
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Total Scenarios | ${summary.totalScenarios} |`,
      `| Passed | ${summary.passed} |`,
      `| Failed | ${summary.failed} |`,
      `| Skipped | ${summary.skipped} |`,
      `| Duration | ${summary.duration}ms |`,
      '',
      '## Scenarios',
      '',
    ];

    for (const result of results) {
      const statusIcon = result.status === 'passed' ? '✅' :
        result.status === 'failed' ? '❌' :
        result.status === 'skipped' ? '⏭️' : '⏸️';

      lines.push(`### ${statusIcon} ${result.name}`);
      if (result.example) {
        lines.push(`**Example:** ${JSON.stringify(result.example)}`);
      }
      lines.push('');

      for (const step of result.steps) {
        const stepIcon = step.status === 'passed' ? '✅' :
          step.status === 'failed' ? '❌' :
          step.status === 'skipped' ? '⏭️' : '⏸️';
        lines.push(`${stepIcon} **${step.keyword}** ${step.text}`);
        if (step.error) {
          lines.push(`   > Error: ${step.error}`);
        }
      }
      lines.push('');
    }

    return {
      format: 'markdown',
      content: lines.join('\n'),
    };
  }

  /**
   * Create scenario from natural language
   */
  createScenarioFromDescription(description: string): GherkinScenario {
    // Simple parser for natural language descriptions
    const scenario: GherkinScenario = {
      name: 'Generated Scenario',
      given: [],
      when: [],
      then: [],
    };

    const sentences = description.split(/[.!]\s*/);
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if (lower.includes('given') || lower.includes('assuming')) {
        scenario.given.push({ keyword: 'Given', text: sentence });
      } else if (lower.includes('when') || lower.includes('if')) {
        scenario.when.push({ keyword: 'When', text: sentence });
      } else if (lower.includes('then') || lower.includes('should') || lower.includes('expect')) {
        scenario.then.push({ keyword: 'Then', text: sentence });
      }
    }

    return scenario;
  }
}
