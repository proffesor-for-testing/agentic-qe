/**
 * End-to-End Claude Flow Integration Tests
 * Tests complete workflow from requirements to reporting,
 * parallel agent execution, memory persistence across phases,
 * and performance under load
 */

import { QEMemory } from '../../src/memory/QEMemory';
import { TaskExecutor } from '../../src/advanced/task-executor';
import { Logger } from '../../src/utils/Logger';
import { QEMemoryEntry, MemoryType, QEAgent, QEContext, AgentType, TestCase, TestSuite, TestResult } from '../../src/types';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';

// Claude Flow Integration System
class ClaudeFlowIntegration extends EventEmitter {
  private memory: QEMemory;
  private taskExecutor: TaskExecutor;
  private logger: Logger;
  private activeWorkflows = new Map<string, WorkflowExecution>();
  private agentRegistry = new Map<string, QEAgent>();
  private testSuites = new Map<string, TestSuite>();
  private globalMetrics = {
    workflowsExecuted: 0,
    totalAgentsSpawned: 0,
    totalTestsRun: 0,
    totalTestsPassed: 0,
    totalExecutionTime: 0,
    averageWorkflowTime: 0,
    memoryOperations: 0,
    errorCount: 0
  };

  constructor(memory: QEMemory, taskExecutor: TaskExecutor, logger: Logger) {
    super();
    this.memory = memory;
    this.taskExecutor = taskExecutor;
    this.logger = logger;
  }

  async executeCompleteWorkflow(spec: WorkflowSpecification): Promise<WorkflowExecutionResult> {
    const workflowId = spec.id || `workflow-${Date.now()}`;
    const startTime = Date.now();
    
    const execution: WorkflowExecution = {
      id: workflowId,
      spec,
      status: 'running',
      startTime: new Date(),
      phases: [],
      context: {
        sessionId: workflowId,
        environment: spec.environment || 'test',
        variables: spec.variables || {},
        agents: [],
        sharedMemory: {},
        startTime: new Date()
      }
    };
    
    this.activeWorkflows.set(workflowId, execution);
    this.emit('workflow-started', { workflowId, spec });
    
    try {
      // Phase 1: Requirements Analysis
      const requirementsResult = await this.executeRequirementsPhase(execution);
      
      // Phase 2: Test Planning
      const planningResult = await this.executeTestPlanningPhase(execution, requirementsResult);
      
      // Phase 3: Parallel Agent Execution
      const executionResult = await this.executeParallelTestingPhase(execution, planningResult);
      
      // Phase 4: Results Analysis and Reporting
      const reportingResult = await this.executeReportingPhase(execution, executionResult);
      
      const duration = Date.now() - startTime;
      execution.status = 'completed';
      execution.endTime = new Date();
      execution.duration = duration;
      
      const result: WorkflowExecutionResult = {
        success: true,
        workflowId,
        duration,
        phases: execution.phases,
        testResults: reportingResult.testResults,
        metrics: this.calculateWorkflowMetrics(execution),
        artifacts: await this.collectWorkflowArtifacts(workflowId)
      };
      
      await this.persistWorkflowResult(workflowId, result);
      this.updateGlobalMetrics(result);
      
      this.emit('workflow-completed', { workflowId, result });
      return result;
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.error = error.message;
      
      const result: WorkflowExecutionResult = {
        success: false,
        workflowId,
        duration,
        error: error.message,
        phases: execution.phases,
        testResults: [],
        metrics: this.calculateWorkflowMetrics(execution),
        artifacts: []
      };
      
      this.globalMetrics.errorCount++;
      this.emit('workflow-failed', { workflowId, error: error.message });
      return result;
    } finally {
      this.activeWorkflows.delete(workflowId);
    }
  }

  private async executeRequirementsPhase(execution: WorkflowExecution): Promise<RequirementsPhaseResult> {
    const phaseId = `${execution.id}-requirements`;
    const startTime = Date.now();
    
    this.emit('phase-started', { workflowId: execution.id, phase: 'requirements' });
    
    // Spawn requirements explorer agent
    const requirementsAgent = await this.spawnAgent({
      type: 'requirements-explorer',
      workflowId: execution.id,
      phaseId,
      capabilities: ['requirement-analysis', 'testability-assessment', 'charter-generation']
    });
    
    // Analyze requirements and generate test scenarios
    const requirementsAnalysis = await this.executeAgentTask(requirementsAgent, {
      type: 'requirements-analysis',
      input: execution.spec.requirements,
      context: execution.context
    });
    
    // Store requirements analysis in shared memory
    await this.memory.store({
      key: `${execution.id}-requirements-analysis`,
      value: requirementsAnalysis,
      type: 'session',
      sessionId: execution.id,
      agentId: requirementsAgent.id,
      timestamp: new Date(),
      tags: ['requirements', 'analysis', 'phase-1']
    });
    
    const duration = Date.now() - startTime;
    const phaseResult: RequirementsPhaseResult = {
      phaseId,
      name: 'requirements',
      success: true,
      duration,
      agent: requirementsAgent,
      requirements: requirementsAnalysis.requirements,
      testScenarios: requirementsAnalysis.testScenarios,
      riskAssessment: requirementsAnalysis.riskAssessment
    };
    
    execution.phases.push(phaseResult);
    this.emit('phase-completed', { workflowId: execution.id, phase: 'requirements', result: phaseResult });
    
    return phaseResult;
  }

  private async executeTestPlanningPhase(
    execution: WorkflowExecution,
    requirementsResult: RequirementsPhaseResult
  ): Promise<TestPlanningPhaseResult> {
    const phaseId = `${execution.id}-planning`;
    const startTime = Date.now();
    
    this.emit('phase-started', { workflowId: execution.id, phase: 'planning' });
    
    // Spawn multiple planning agents in parallel
    const plannerAgent = await this.spawnAgent({
      type: 'test-planner',
      workflowId: execution.id,
      phaseId,
      capabilities: ['test-generation', 'test-planning', 'test-prioritization']
    });
    
    const riskOracleAgent = await this.spawnAgent({
      type: 'risk-oracle',
      workflowId: execution.id,
      phaseId,
      capabilities: ['risk-scoring', 'predictive-analysis', 'failure-prediction']
    });
    
    // Execute planning tasks in parallel
    const [testPlan, riskAnalysis] = await Promise.all([
      this.executeAgentTask(plannerAgent, {
        type: 'test-planning',
        input: {
          requirements: requirementsResult.requirements,
          scenarios: requirementsResult.testScenarios
        },
        context: execution.context
      }),
      this.executeAgentTask(riskOracleAgent, {
        type: 'risk-analysis',
        input: {
          requirements: requirementsResult.requirements,
          riskAssessment: requirementsResult.riskAssessment
        },
        context: execution.context
      })
    ]);
    
    // Generate test suites based on planning results
    const testSuites = await this.generateTestSuites(testPlan, riskAnalysis, execution.context);
    
    // Store planning results in memory
    await Promise.all([
      this.memory.store({
        key: `${execution.id}-test-plan`,
        value: testPlan,
        type: 'session',
        sessionId: execution.id,
        agentId: plannerAgent.id,
        timestamp: new Date(),
        tags: ['planning', 'test-plan', 'phase-2']
      }),
      this.memory.store({
        key: `${execution.id}-risk-analysis`,
        value: riskAnalysis,
        type: 'session',
        sessionId: execution.id,
        agentId: riskOracleAgent.id,
        timestamp: new Date(),
        tags: ['planning', 'risk-analysis', 'phase-2']
      }),
      this.memory.store({
        key: `${execution.id}-test-suites`,
        value: testSuites,
        type: 'session',
        sessionId: execution.id,
        timestamp: new Date(),
        tags: ['planning', 'test-suites', 'phase-2']
      })
    ]);
    
    const duration = Date.now() - startTime;
    const phaseResult: TestPlanningPhaseResult = {
      phaseId,
      name: 'planning',
      success: true,
      duration,
      agents: [plannerAgent, riskOracleAgent],
      testPlan,
      riskAnalysis,
      testSuites
    };
    
    execution.phases.push(phaseResult);
    this.emit('phase-completed', { workflowId: execution.id, phase: 'planning', result: phaseResult });
    
    return phaseResult;
  }

  private async executeParallelTestingPhase(
    execution: WorkflowExecution,
    planningResult: TestPlanningPhaseResult
  ): Promise<TestExecutionPhaseResult> {
    const phaseId = `${execution.id}-execution`;
    const startTime = Date.now();
    
    this.emit('phase-started', { workflowId: execution.id, phase: 'execution' });
    
    // Determine optimal agent distribution based on test suites
    const agentSpecs = this.planAgentDistribution(planningResult.testSuites, planningResult.riskAnalysis);
    
    // Spawn agents in parallel
    const agents = await Promise.all(
      agentSpecs.map(spec => this.spawnAgent({
        type: spec.type,
        workflowId: execution.id,
        phaseId,
        capabilities: spec.capabilities,
        assignedSuites: spec.assignedSuites
      }))
    );
    
    // Execute test suites in parallel across agents
    const executionPromises = agents.map(agent => 
      this.executeTestSuitesOnAgent(agent, execution.context)
    );
    
    // Monitor execution progress
    const progressMonitor = this.startProgressMonitoring(execution.id, agents);
    
    try {
      const agentResults = await Promise.all(executionPromises);
      clearInterval(progressMonitor);
      
      // Aggregate results
      const allTestResults = agentResults.flat();
      const executionMetrics = this.calculateExecutionMetrics(agentResults, agents);
      
      // Store execution results
      await this.memory.store({
        key: `${execution.id}-execution-results`,
        value: {
          testResults: allTestResults,
          metrics: executionMetrics,
          agentPerformance: agents.map(a => ({
            agentId: a.id,
            type: a.type,
            metrics: a.metrics
          }))
        },
        type: 'session',
        sessionId: execution.id,
        timestamp: new Date(),
        tags: ['execution', 'results', 'phase-3']
      });
      
      const duration = Date.now() - startTime;
      const phaseResult: TestExecutionPhaseResult = {
        phaseId,
        name: 'execution',
        success: true,
        duration,
        agents,
        testResults: allTestResults,
        metrics: executionMetrics
      };
      
      execution.phases.push(phaseResult);
      this.emit('phase-completed', { workflowId: execution.id, phase: 'execution', result: phaseResult });
      
      return phaseResult;
      
    } catch (error: any) {
      clearInterval(progressMonitor);
      throw error;
    }
  }

  private async executeReportingPhase(
    execution: WorkflowExecution,
    executionResult: TestExecutionPhaseResult
  ): Promise<ReportingPhaseResult> {
    const phaseId = `${execution.id}-reporting`;
    const startTime = Date.now();
    
    this.emit('phase-started', { workflowId: execution.id, phase: 'reporting' });
    
    // Spawn analysis and reporting agents
    const analyzerAgent = await this.spawnAgent({
      type: 'test-analyzer',
      workflowId: execution.id,
      phaseId,
      capabilities: ['test-analysis', 'metrics-collection', 'report-generation']
    });
    
    // Analyze test results and generate comprehensive report
    const analysis = await this.executeAgentTask(analyzerAgent, {
      type: 'results-analysis',
      input: {
        testResults: executionResult.testResults,
        metrics: executionResult.metrics,
        context: execution.context
      },
      context: execution.context
    });
    
    // Generate artifacts and reports
    const reports = await this.generateReports(analysis, execution);
    
    // Store final results
    await this.memory.store({
      key: `${execution.id}-final-report`,
      value: {
        analysis,
        reports,
        summary: {
          totalTests: executionResult.testResults.length,
          passed: executionResult.testResults.filter(r => r.status === 'passed').length,
          failed: executionResult.testResults.filter(r => r.status === 'failed').length,
          coverage: analysis.coverage,
          quality: analysis.quality
        }
      },
      type: 'session',
      sessionId: execution.id,
      agentId: analyzerAgent.id,
      timestamp: new Date(),
      tags: ['reporting', 'final', 'phase-4']
    });
    
    const duration = Date.now() - startTime;
    const phaseResult: ReportingPhaseResult = {
      phaseId,
      name: 'reporting',
      success: true,
      duration,
      agent: analyzerAgent,
      analysis,
      reports,
      testResults: executionResult.testResults
    };
    
    execution.phases.push(phaseResult);
    this.emit('phase-completed', { workflowId: execution.id, phase: 'reporting', result: phaseResult });
    
    return phaseResult;
  }

  private async spawnAgent(spec: AgentSpawnSpec): Promise<QEAgent> {
    const agent: QEAgent = {
      id: `${spec.workflowId}-${spec.type}-${Date.now()}`,
      name: `${spec.type}-agent`,
      type: spec.type,
      status: 'idle',
      capabilities: spec.capabilities || [],
      startTime: new Date(),
      lastActivity: new Date(),
      metrics: {
        tasksCompleted: 0,
        tasksFailed: 0,
        averageExecutionTime: 0,
        cpuUsage: 0,
        memoryUsage: 0,
        successRate: 0,
        lastUpdated: new Date()
      }
    };
    
    this.agentRegistry.set(agent.id, agent);
    this.globalMetrics.totalAgentsSpawned++;
    
    // Store agent in memory
    await this.memory.store({
      key: `${agent.id}-info`,
      value: agent,
      type: 'agent-state',
      sessionId: spec.workflowId,
      agentId: agent.id,
      timestamp: new Date(),
      tags: ['agent', 'spawned', spec.type]
    });
    
    this.emit('agent-spawned', { agent, workflowId: spec.workflowId });
    return agent;
  }

  private async executeAgentTask(agent: QEAgent, task: AgentTask): Promise<any> {
    const startTime = Date.now();
    agent.status = 'running';
    agent.lastActivity = new Date();
    
    try {
      // Simulate task execution based on type
      const result = await this.simulateAgentWork(agent, task);
      
      const duration = Date.now() - startTime;
      agent.status = 'completed';
      agent.metrics!.tasksCompleted++;
      agent.metrics!.averageExecutionTime = 
        (agent.metrics!.averageExecutionTime * (agent.metrics!.tasksCompleted - 1) + duration) / agent.metrics!.tasksCompleted;
      agent.metrics!.successRate = agent.metrics!.tasksCompleted / (agent.metrics!.tasksCompleted + agent.metrics!.tasksFailed);
      agent.metrics!.lastUpdated = new Date();
      
      this.emit('agent-task-completed', { agent, task, result, duration });
      return result;
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      agent.status = 'failed';
      agent.metrics!.tasksFailed++;
      agent.metrics!.successRate = agent.metrics!.tasksCompleted / (agent.metrics!.tasksCompleted + agent.metrics!.tasksFailed);
      agent.metrics!.lastUpdated = new Date();
      
      this.emit('agent-task-failed', { agent, task, error: error.message, duration });
      throw error;
    }
  }

  private async simulateAgentWork(agent: QEAgent, task: AgentTask): Promise<any> {
    // Simulate different types of work based on agent type and task
    const baseDelay = this.getBaseDelayForTask(task.type);
    const variability = Math.random() * 0.4 + 0.8; // 80-120% of base delay
    const delay = baseDelay * variability;
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    switch (task.type) {
      case 'requirements-analysis':
        return {
          requirements: this.generateMockRequirements(task.input),
          testScenarios: this.generateMockTestScenarios(task.input),
          riskAssessment: this.generateMockRiskAssessment(task.input)
        };
        
      case 'test-planning':
        return {
          strategy: 'comprehensive',
          testTypes: ['unit', 'integration', 'e2e', 'performance', 'security'],
          coverage: 85,
          estimatedDuration: 120000,
          priority: 'high'
        };
        
      case 'risk-analysis':
        return {
          riskScore: Math.random() * 10,
          criticalRisks: this.generateMockRisks(),
          mitigationStrategies: this.generateMockMitigations()
        };
        
      case 'test-execution':
        return this.generateMockTestResults(task.input);
        
      case 'results-analysis':
        return {
          coverage: 87.5,
          quality: 92.3,
          performance: 88.7,
          security: 95.1,
          recommendations: this.generateMockRecommendations()
        };
        
      default:
        return { status: 'completed', message: `Task ${task.type} completed successfully` };
    }
  }

  private getBaseDelayForTask(taskType: string): number {
    const delays: Record<string, number> = {
      'requirements-analysis': 800,
      'test-planning': 600,
      'risk-analysis': 700,
      'test-execution': 1200,
      'results-analysis': 500
    };
    return delays[taskType] || 400;
  }

  private async generateTestSuites(testPlan: any, riskAnalysis: any, context: QEContext): Promise<TestSuite[]> {
    const suites: TestSuite[] = [];
    
    // Generate different types of test suites based on plan
    const suiteTypes = ['unit', 'integration', 'e2e', 'performance', 'security'];
    
    for (let i = 0; i < suiteTypes.length; i++) {
      const suiteType = suiteTypes[i];
      const suite: TestSuite = {
        id: `${context.sessionId}-suite-${suiteType}`,
        name: `${suiteType.charAt(0).toUpperCase() + suiteType.slice(1)} Test Suite`,
        description: `Comprehensive ${suiteType} testing suite`,
        tests: this.generateTestCases(suiteType, 5 + Math.floor(Math.random() * 10)),
        configuration: {
          environment: {
            name: context.environment,
            baseUrl: 'http://localhost:3000',
            variables: context.variables
          }
        },
        metadata: {
          type: suiteType,
          priority: riskAnalysis.riskScore > 7 ? 'high' : 'medium',
          estimatedDuration: (5 + Math.floor(Math.random() * 10)) * 1000
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      suites.push(suite);
      this.testSuites.set(suite.id, suite);
    }
    
    return suites;
  }

  private generateTestCases(suiteType: string, count: number): TestCase[] {
    const tests: TestCase[] = [];
    
    for (let i = 0; i < count; i++) {
      const test: TestCase = {
        id: `test-${suiteType}-${i + 1}`,
        name: `${suiteType} test case ${i + 1}`,
        description: `Test case for ${suiteType} testing`,
        type: suiteType as any,
        priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)] as any,
        steps: [
          {
            id: `step-${i + 1}-1`,
            order: 1,
            action: 'Setup test environment',
            expectedResult: 'Environment ready',
            status: 'pending'
          },
          {
            id: `step-${i + 1}-2`,
            order: 2,
            action: 'Execute test logic',
            expectedResult: 'Test passes',
            status: 'pending'
          },
          {
            id: `step-${i + 1}-3`,
            order: 3,
            action: 'Cleanup test environment',
            expectedResult: 'Environment cleaned',
            status: 'pending'
          }
        ],
        expectedResults: [],
        status: 'pending',
        retryCount: 0,
        tags: [suiteType, 'automated'],
        metadata: {
          estimatedDuration: 1000 + Math.random() * 3000
        }
      };
      
      tests.push(test);
    }
    
    return tests;
  }

  private planAgentDistribution(testSuites: TestSuite[], riskAnalysis: any): AgentSpec[] {
    const specs: AgentSpec[] = [];
    
    // Distribute test suites across different agent types
    const agentTypes: AgentType[] = ['test-executor', 'performance-tester', 'security-tester', 'api-tester'];
    
    testSuites.forEach((suite, index) => {
      const agentType = agentTypes[index % agentTypes.length];
      
      specs.push({
        type: agentType,
        capabilities: this.getCapabilitiesForAgentType(agentType),
        assignedSuites: [suite.id]
      });
    });
    
    return specs;
  }

  private getCapabilitiesForAgentType(agentType: AgentType): string[] {
    const capabilityMap: Record<AgentType, string[]> = {
      'test-executor': ['test-execution', 'test-automation', 'ui-automation'],
      'performance-tester': ['performance-testing', 'load-testing', 'metrics-collection'],
      'security-tester': ['security-testing', 'vulnerability-scanning', 'penetration-testing'],
      'api-tester': ['api-testing', 'contract-testing', 'api-validation'],
      'test-planner': ['test-planning', 'test-generation', 'test-prioritization'],
      'test-analyzer': ['test-analysis', 'metrics-collection', 'report-generation'],
      'accessibility-tester': ['accessibility-testing', 'compliance-testing'],
      'visual-tester': ['visual-testing', 'screenshot-comparison'],
      'mobile-tester': ['mobile-testing', 'device-testing'],
      'cross-browser-tester': ['cross-browser-testing', 'compatibility-testing'],
      'data-validator': ['data-validation', 'schema-validation'],
      'regression-tester': ['regression-testing', 'baseline-comparison'],
      'smoke-tester': ['smoke-testing', 'sanity-testing'],
      'e2e-tester': ['e2e-testing', 'workflow-testing'],
      'unit-tester': ['unit-testing', 'component-testing'],
      'contract-tester': ['contract-testing', 'api-contracts'],
      'integration-tester': ['integration-testing', 'system-testing'],
      'load-tester': ['load-testing', 'stress-testing'],
      'chaos-tester': ['chaos-testing', 'fault-injection'],
      'exploratory-testing-navigator': ['exploratory-testing', 'session-management'],
      'risk-oracle': ['risk-assessment', 'predictive-analysis'],
      'tdd-pair-programmer': ['tdd-methodology', 'pair-programming'],
      'production-observer': ['production-monitoring', 'alerting'],
      'deployment-guardian': ['deployment-validation', 'rollback-automation'],
      'requirements-explorer': ['requirements-analysis', 'testability-assessment']
    };
    
    return capabilityMap[agentType] || ['general-testing'];
  }

  private async executeTestSuitesOnAgent(agent: QEAgent, context: QEContext): Promise<TestResult[]> {
    const assignedSuites = (agent as any).assignedSuites || [];
    const results: TestResult[] = [];
    
    for (const suiteId of assignedSuites) {
      const suite = this.testSuites.get(suiteId);
      if (!suite) continue;
      
      for (const testCase of suite.tests) {
        const testResult = await this.executeTestCase(agent, testCase, context);
        results.push(testResult);
        this.globalMetrics.totalTestsRun++;
        
        if (testResult.status === 'passed') {
          this.globalMetrics.totalTestsPassed++;
        }
      }
    }
    
    return results;
  }

  private async executeTestCase(agent: QEAgent, testCase: TestCase, context: QEContext): Promise<TestResult> {
    const startTime = new Date();
    
    // Simulate test execution
    const executionTime = (testCase.metadata?.estimatedDuration || 1000) + Math.random() * 1000;
    await new Promise(resolve => setTimeout(resolve, executionTime));
    
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();
    
    // Determine test result (90% success rate)
    const success = Math.random() > 0.1;
    
    const result: TestResult = {
      id: `result-${testCase.id}-${Date.now()}`,
      testCaseId: testCase.id,
      status: success ? 'passed' : 'failed',
      startTime,
      endTime,
      duration,
      message: success ? 'Test passed successfully' : 'Test failed due to assertion error',
      agentId: agent.id,
      sessionId: context.sessionId,
      error: success ? undefined : {
        type: 'AssertionError',
        message: 'Expected value did not match actual value',
        stack: 'Error stack trace here...'
      },
      artifacts: success ? [] : [{
        id: `artifact-${testCase.id}`,
        type: 'screenshot',
        name: 'failure-screenshot.png',
        path: `/artifacts/${testCase.id}-failure.png`,
        size: 1024 * 50, // 50KB
        mimeType: 'image/png'
      }],
      metrics: {
        assertions: 3,
        passed: success ? 3 : 2,
        failed: success ? 0 : 1,
        skipped: 0
      }
    };
    
    // Store test result in memory
    await this.memory.store({
      key: `test-result-${result.id}`,
      value: result,
      type: 'test-result',
      sessionId: context.sessionId,
      agentId: agent.id,
      timestamp: new Date(),
      tags: ['test-result', testCase.type, result.status]
    });
    
    return result;
  }

  private startProgressMonitoring(workflowId: string, agents: QEAgent[]): NodeJS.Timer {
    return setInterval(async () => {
      const progress = {
        workflowId,
        timestamp: new Date(),
        agentStatus: agents.map(agent => ({
          agentId: agent.id,
          type: agent.type,
          status: agent.status,
          metrics: agent.metrics
        })),
        overallProgress: this.calculateOverallProgress(agents)
      };
      
      await this.memory.store({
        key: `${workflowId}-progress-${Date.now()}`,
        value: progress,
        type: 'metric',
        sessionId: workflowId,
        timestamp: new Date(),
        tags: ['progress', 'monitoring'],
        ttl: 300000 // 5 minutes TTL for progress updates
      });
      
      this.emit('progress-update', progress);
    }, 5000); // Update every 5 seconds
  }

  private calculateOverallProgress(agents: QEAgent[]): number {
    if (agents.length === 0) return 0;
    
    const completedAgents = agents.filter(a => a.status === 'completed').length;
    const runningAgents = agents.filter(a => a.status === 'running').length;
    
    return (completedAgents + runningAgents * 0.5) / agents.length;
  }

  private calculateExecutionMetrics(agentResults: TestResult[][], agents: QEAgent[]): ExecutionMetrics {
    const allResults = agentResults.flat();
    const totalTests = allResults.length;
    const passedTests = allResults.filter(r => r.status === 'passed').length;
    const failedTests = allResults.filter(r => r.status === 'failed').length;
    
    return {
      totalTests,
      passedTests,
      failedTests,
      successRate: totalTests > 0 ? passedTests / totalTests : 0,
      averageExecutionTime: totalTests > 0 ? allResults.reduce((sum, r) => sum + r.duration, 0) / totalTests : 0,
      agentUtilization: agents.map(agent => ({
        agentId: agent.id,
        type: agent.type,
        utilization: agent.metrics?.successRate || 0,
        tasksCompleted: agent.metrics?.tasksCompleted || 0
      }))
    };
  }

  private calculateWorkflowMetrics(execution: WorkflowExecution): WorkflowMetrics {
    const totalDuration = execution.duration || 0;
    const phaseCount = execution.phases.length;
    const agentCount = execution.context.agents.length;
    
    return {
      totalDuration,
      phaseCount,
      agentCount,
      averagePhaseTime: phaseCount > 0 ? totalDuration / phaseCount : 0,
      memoryOperations: this.globalMetrics.memoryOperations,
      efficiency: this.calculateEfficiencyScore(execution)
    };
  }

  private calculateEfficiencyScore(execution: WorkflowExecution): number {
    // Simple efficiency calculation based on time and success rate
    const baseScore = 100;
    const timeScore = Math.max(0, 100 - (execution.duration || 0) / 1000); // Penalty for long execution
    const successScore = execution.status === 'completed' ? 100 : 0;
    
    return (baseScore + timeScore + successScore) / 3;
  }

  private async collectWorkflowArtifacts(workflowId: string): Promise<WorkflowArtifact[]> {
    const artifacts: WorkflowArtifact[] = [];
    
    // Collect test result artifacts
    const testResults = await this.memory.query({
      sessionId: workflowId,
      type: 'test-result'
    });
    
    testResults.forEach(entry => {
      const result = entry.value as any;
      if (result.artifacts) {
        artifacts.push(...result.artifacts.map((artifact: any) => ({
          ...artifact,
          workflowId,
          phase: 'execution'
        })));
      }
    });
    
    // Add workflow summary artifact
    artifacts.push({
      id: `${workflowId}-summary`,
      type: 'report',
      name: 'workflow-summary.json',
      path: `/artifacts/${workflowId}/summary.json`,
      size: 1024 * 10, // 10KB
      mimeType: 'application/json',
      workflowId,
      phase: 'reporting'
    });
    
    return artifacts;
  }

  private async generateReports(analysis: any, execution: WorkflowExecution): Promise<WorkflowReport[]> {
    return [
      {
        id: `${execution.id}-summary`,
        type: 'summary',
        title: 'Workflow Execution Summary',
        content: {
          overview: `Workflow ${execution.id} completed successfully`,
          metrics: analysis,
          phases: execution.phases.map(p => ({
            name: p.name,
            duration: p.duration,
            success: p.success
          }))
        },
        generatedAt: new Date()
      },
      {
        id: `${execution.id}-detailed`,
        type: 'detailed',
        title: 'Detailed Test Results',
        content: {
          testResults: 'Detailed test results would be here',
          coverage: analysis.coverage,
          performance: analysis.performance
        },
        generatedAt: new Date()
      }
    ];
  }

  private async persistWorkflowResult(workflowId: string, result: WorkflowExecutionResult): Promise<void> {
    await this.memory.store({
      key: `${workflowId}-final-result`,
      value: result,
      type: 'session',
      sessionId: workflowId,
      timestamp: new Date(),
      tags: ['workflow', 'result', 'final']
    });
    
    this.globalMetrics.memoryOperations++;
  }

  private updateGlobalMetrics(result: WorkflowExecutionResult): void {
    this.globalMetrics.workflowsExecuted++;
    this.globalMetrics.totalExecutionTime += result.duration;
    this.globalMetrics.averageWorkflowTime = 
      this.globalMetrics.totalExecutionTime / this.globalMetrics.workflowsExecuted;
  }

  // Mock data generators
  private generateMockRequirements(input: any): any {
    return {
      functional: ['User authentication', 'Data processing', 'Report generation'],
      nonFunctional: ['Performance < 2s', 'Security compliance', '99.9% uptime'],
      constraints: ['Mobile compatibility', 'Browser support']
    };
  }

  private generateMockTestScenarios(input: any): any {
    return [
      { id: 'scenario-1', name: 'Happy path user flow', priority: 'high' },
      { id: 'scenario-2', name: 'Error handling', priority: 'medium' },
      { id: 'scenario-3', name: 'Edge cases', priority: 'low' }
    ];
  }

  private generateMockRiskAssessment(input: any): any {
    return {
      highRisk: ['Authentication bypass', 'Data corruption'],
      mediumRisk: ['Performance degradation', 'UI inconsistencies'],
      lowRisk: ['Minor usability issues']
    };
  }

  private generateMockRisks(): any {
    return [
      { id: 'risk-1', description: 'SQL injection vulnerability', severity: 'high', likelihood: 0.3 },
      { id: 'risk-2', description: 'Memory leak in processing', severity: 'medium', likelihood: 0.6 }
    ];
  }

  private generateMockMitigations(): any {
    return [
      { riskId: 'risk-1', strategy: 'Input validation and parameterized queries' },
      { riskId: 'risk-2', strategy: 'Regular memory profiling and cleanup' }
    ];
  }

  private generateMockTestResults(input: any): TestResult[] {
    return [
      {
        id: 'result-1',
        testCaseId: 'test-1',
        status: 'passed',
        startTime: new Date(),
        endTime: new Date(),
        duration: 1500,
        message: 'Test passed successfully'
      }
    ] as TestResult[];
  }

  private generateMockRecommendations(): any {
    return [
      'Increase test coverage for edge cases',
      'Implement performance monitoring',
      'Add security scanning to CI/CD pipeline'
    ];
  }

  getGlobalMetrics() {
    return { ...this.globalMetrics };
  }

  getActiveWorkflows(): WorkflowExecution[] {
    return Array.from(this.activeWorkflows.values());
  }

  getRegisteredAgents(): QEAgent[] {
    return Array.from(this.agentRegistry.values());
  }

  async shutdown(): Promise<void> {
    // Clean up all active workflows
    this.activeWorkflows.clear();
    this.agentRegistry.clear();
    this.testSuites.clear();
    this.removeAllListeners();
  }
}

// Type definitions
interface WorkflowSpecification {
  id?: string;
  name: string;
  requirements: any;
  environment?: string;
  variables?: Record<string, any>;
  constraints?: any;
}

interface WorkflowExecution {
  id: string;
  spec: WorkflowSpecification;
  status: 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  error?: string;
  phases: PhaseResult[];
  context: QEContext;
}

interface WorkflowExecutionResult {
  success: boolean;
  workflowId: string;
  duration: number;
  error?: string;
  phases: PhaseResult[];
  testResults: TestResult[];
  metrics: WorkflowMetrics;
  artifacts: WorkflowArtifact[];
}

interface PhaseResult {
  phaseId: string;
  name: string;
  success: boolean;
  duration: number;
  error?: string;
  [key: string]: any;
}

interface RequirementsPhaseResult extends PhaseResult {
  agent: QEAgent;
  requirements: any;
  testScenarios: any;
  riskAssessment: any;
}

interface TestPlanningPhaseResult extends PhaseResult {
  agents: QEAgent[];
  testPlan: any;
  riskAnalysis: any;
  testSuites: TestSuite[];
}

interface TestExecutionPhaseResult extends PhaseResult {
  agents: QEAgent[];
  testResults: TestResult[];
  metrics: ExecutionMetrics;
}

interface ReportingPhaseResult extends PhaseResult {
  agent: QEAgent;
  analysis: any;
  reports: WorkflowReport[];
  testResults: TestResult[];
}

interface AgentSpawnSpec {
  type: AgentType;
  workflowId: string;
  phaseId: string;
  capabilities?: string[];
  assignedSuites?: string[];
}

interface AgentTask {
  type: string;
  input: any;
  context: QEContext;
}

interface AgentSpec {
  type: AgentType;
  capabilities: string[];
  assignedSuites: string[];
}

interface ExecutionMetrics {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  successRate: number;
  averageExecutionTime: number;
  agentUtilization: Array<{
    agentId: string;
    type: AgentType;
    utilization: number;
    tasksCompleted: number;
  }>;
}

interface WorkflowMetrics {
  totalDuration: number;
  phaseCount: number;
  agentCount: number;
  averagePhaseTime: number;
  memoryOperations: number;
  efficiency: number;
}

interface WorkflowArtifact {
  id: string;
  type: string;
  name: string;
  path: string;
  size: number;
  mimeType: string;
  workflowId: string;
  phase: string;
}

interface WorkflowReport {
  id: string;
  type: string;
  title: string;
  content: any;
  generatedAt: Date;
}

describe('Claude Flow Integration E2E', () => {
  let integration: ClaudeFlowIntegration;
  let memory: QEMemory;
  let taskExecutor: TaskExecutor;
  let testDir: string;
  let logger: Logger;

  beforeAll(async () => {
    testDir = path.join(os.tmpdir(), 'claude-flow-e2e-test', Date.now().toString());
    await fs.ensureDir(testDir);
    logger = new Logger('E2ETest', { level: 'debug' });
  });

  afterAll(async () => {
    if (integration) {
      await integration.shutdown();
    }
    if (taskExecutor) {
      await taskExecutor.shutdown();
    }
    if (memory) {
      await memory.destroy();
    }
    await fs.remove(testDir);
  });

  beforeEach(async () => {
    memory = new QEMemory({
      persistPath: path.join(testDir, `e2e-memory-${Date.now()}.json`),
      maxEntries: 10000,
      defaultTTL: 300000, // 5 minutes
      autoCleanup: true,
      cleanupInterval: 30000 // 30 seconds
    }, logger);
    
    taskExecutor = new TaskExecutor({ maxConcurrent: 10 });
    integration = new ClaudeFlowIntegration(memory, taskExecutor, logger);
  });

  afterEach(async () => {
    if (integration) {
      await integration.shutdown();
    }
    if (taskExecutor) {
      await taskExecutor.shutdown();
    }
    if (memory) {
      await memory.destroy();
    }
  });

  describe('Complete Workflow Execution', () => {
    it('should execute a complete workflow from requirements to reporting', async () => {
      const workflowSpec: WorkflowSpecification = {
        name: 'E-commerce Platform Testing',
        requirements: {
          functional: [
            'User registration and authentication',
            'Product catalog management',
            'Shopping cart functionality',
            'Payment processing',
            'Order management'
          ],
          nonFunctional: [
            'Response time < 2 seconds',
            'Support 1000 concurrent users',
            'PCI DSS compliance',
            '99.9% uptime'
          ]
        },
        environment: 'staging',
        variables: {
          BASE_URL: 'https://staging.ecommerce.example.com',
          API_VERSION: 'v2',
          MAX_USERS: '1000'
        }
      };
      
      const startTime = Date.now();
      const result = await integration.executeCompleteWorkflow(workflowSpec);
      const totalTime = Date.now() - startTime;
      
      // Verify workflow completed successfully
      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.duration).toBeLessThan(30000); // Should complete within 30 seconds
      
      // Verify all phases completed
      expect(result.phases).toHaveLength(4);
      expect(result.phases[0].name).toBe('requirements');
      expect(result.phases[1].name).toBe('planning');
      expect(result.phases[2].name).toBe('execution');
      expect(result.phases[3].name).toBe('reporting');
      
      // Verify each phase succeeded
      result.phases.forEach(phase => {
        expect(phase.success).toBe(true);
        expect(phase.duration).toBeGreaterThan(0);
      });
      
      // Verify test results
      expect(result.testResults.length).toBeGreaterThan(0);
      const passedTests = result.testResults.filter(r => r.status === 'passed').length;
      const totalTests = result.testResults.length;
      expect(passedTests / totalTests).toBeGreaterThan(0.8); // >80% pass rate
      
      // Verify metrics
      expect(result.metrics.totalDuration).toBe(result.duration);
      expect(result.metrics.phaseCount).toBe(4);
      expect(result.metrics.agentCount).toBeGreaterThan(0);
      expect(result.metrics.efficiency).toBeGreaterThan(50);
      
      // Verify artifacts generated
      expect(result.artifacts.length).toBeGreaterThan(0);
      
      console.log(`E2E Workflow Performance:`);
      console.log(`  Total Duration: ${result.duration}ms`);
      console.log(`  Phases: ${result.phases.length}`);
      console.log(`  Tests Run: ${result.testResults.length}`);
      console.log(`  Pass Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
      console.log(`  Efficiency Score: ${result.metrics.efficiency.toFixed(1)}`);
    }, 45000); // 45 second timeout

    it('should handle workflow failures gracefully', async () => {
      // Create a workflow that will fail due to invalid requirements
      const failingSpec: WorkflowSpecification = {
        name: 'Failing Workflow Test',
        requirements: null, // Invalid requirements to trigger failure
        environment: 'test'
      };
      
      // Override the task executor to force failures
      const originalExecuteTask = taskExecutor.executeTask;
      taskExecutor.executeTask = async () => {
        throw new Error('Simulated task failure');
      };
      
      const result = await integration.executeCompleteWorkflow(failingSpec);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.duration).toBeGreaterThan(0);
      
      // Should still have partial results
      expect(result.phases.length).toBeGreaterThan(0);
      expect(result.metrics).toBeDefined();
      
      // Verify error was tracked
      const globalMetrics = integration.getGlobalMetrics();
      expect(globalMetrics.errorCount).toBeGreaterThan(0);
      
      // Restore original executor
      taskExecutor.executeTask = originalExecuteTask;
    });
  });

  describe('Parallel Agent Execution', () => {
    it('should execute multiple agents in parallel efficiently', async () => {
      const workflowSpec: WorkflowSpecification = {
        name: 'Parallel Agent Test',
        requirements: {
          functional: ['Multiple test scenarios'],
          nonFunctional: ['Performance requirements']
        },
        environment: 'test'
      };
      
      const startTime = Date.now();
      const result = await integration.executeCompleteWorkflow(workflowSpec);
      const totalTime = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      
      // Verify multiple agents were spawned
      const globalMetrics = integration.getGlobalMetrics();
      expect(globalMetrics.totalAgentsSpawned).toBeGreaterThan(3);
      
      // Verify parallel execution efficiency
      // Total time should be less than sum of individual phase times
      const sequentialTime = result.phases.reduce((sum, phase) => sum + phase.duration, 0);
      expect(totalTime).toBeLessThan(sequentialTime * 0.8); // Should be at least 20% faster
      
      // Verify agent utilization
      const executionPhase = result.phases.find(p => p.name === 'execution') as TestExecutionPhaseResult;
      if (executionPhase) {
        expect(executionPhase.agents.length).toBeGreaterThan(1);
        executionPhase.agents.forEach(agent => {
          expect(agent.metrics?.tasksCompleted).toBeGreaterThan(0);
        });
      }
      
      console.log(`Parallel Execution Metrics:`);
      console.log(`  Total Agents: ${globalMetrics.totalAgentsSpawned}`);
      console.log(`  Parallel Efficiency: ${((sequentialTime - totalTime) / sequentialTime * 100).toFixed(1)}% faster`);
    });

    it('should coordinate agent communication through shared memory', async () => {
      const workflowSpec: WorkflowSpecification = {
        name: 'Agent Communication Test',
        requirements: {
          functional: ['Cross-agent data sharing'],
          nonFunctional: ['Coordination requirements']
        },
        environment: 'test'
      };
      
      const result = await integration.executeCompleteWorkflow(workflowSpec);
      
      expect(result.success).toBe(true);
      
      // Verify data was shared between phases
      const memoryEntries = await memory.query({
        sessionId: result.workflowId,
        tags: ['phase-1']
      });
      
      expect(memoryEntries.length).toBeGreaterThan(0);
      
      // Verify subsequent phases could access earlier phase data
      const planningEntries = await memory.query({
        sessionId: result.workflowId,
        tags: ['phase-2']
      });
      
      expect(planningEntries.length).toBeGreaterThan(0);
      
      // Verify cross-phase data references
      const executionEntries = await memory.query({
        sessionId: result.workflowId,
        tags: ['phase-3']
      });
      
      expect(executionEntries.length).toBeGreaterThan(0);
    });
  });

  describe('Memory Persistence Across Phases', () => {
    it('should maintain memory consistency throughout workflow execution', async () => {
      const workflowSpec: WorkflowSpecification = {
        name: 'Memory Persistence Test',
        requirements: {
          functional: ['Data persistence'],
          nonFunctional: ['Memory consistency']
        },
        environment: 'test'
      };
      
      const result = await integration.executeCompleteWorkflow(workflowSpec);
      
      expect(result.success).toBe(true);
      
      // Verify memory contains data from all phases
      const allEntries = await memory.query({
        sessionId: result.workflowId
      });
      
      expect(allEntries.length).toBeGreaterThan(10); // Should have substantial data
      
      // Verify data from each phase is present
      const phaseData = {
        requirements: await memory.query({ sessionId: result.workflowId, tags: ['requirements'] }),
        planning: await memory.query({ sessionId: result.workflowId, tags: ['planning'] }),
        execution: await memory.query({ sessionId: result.workflowId, tags: ['execution'] }),
        reporting: await memory.query({ sessionId: result.workflowId, tags: ['reporting'] })
      };
      
      Object.entries(phaseData).forEach(([phase, entries]) => {
        expect(entries.length).toBeGreaterThan(0);
        console.log(`${phase} phase: ${entries.length} memory entries`);
      });
      
      // Verify chronological order of entries
      const chronologicalEntries = allEntries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      expect(chronologicalEntries.length).toBe(allEntries.length);
      
      // Verify memory statistics
      const stats = memory.getStats();
      expect(stats.totalEntries).toBe(allEntries.length);
      expect(stats.entriesBySession[result.workflowId]).toBeGreaterThan(0);
    });

    it('should handle memory cleanup and TTL correctly', async () => {
      // Create entries with short TTL
      const sessionId = 'ttl-test-session';
      
      await memory.store({
        key: 'short-lived-entry',
        value: { test: 'data' },
        type: 'test-data',
        sessionId,
        timestamp: new Date(),
        ttl: 500, // 500ms TTL
        tags: ['temporary']
      });
      
      await memory.store({
        key: 'long-lived-entry',
        value: { test: 'data' },
        type: 'test-data',
        sessionId,
        timestamp: new Date(),
        ttl: 30000, // 30s TTL
        tags: ['persistent']
      });
      
      // Verify both entries exist initially
      let entries = await memory.query({ sessionId });
      expect(entries).toHaveLength(2);
      
      // Wait for short TTL to expire
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Trigger cleanup
      await memory.cleanup();
      
      // Verify only long-lived entry remains
      entries = await memory.query({ sessionId });
      expect(entries).toHaveLength(1);
      expect(entries[0].key).toBe('long-lived-entry');
      
      // Verify stats reflect cleanup
      const stats = memory.getStats();
      expect(stats.totalEntries).toBe(entries.length);
    });
  });

  describe('Performance Under Load', () => {
    it('should handle high-volume workflow execution efficiently', async () => {
      const workflowCount = 5;
      const workflows: Promise<WorkflowExecutionResult>[] = [];
      
      const startTime = Date.now();
      
      // Execute multiple workflows concurrently
      for (let i = 0; i < workflowCount; i++) {
        const workflowSpec: WorkflowSpecification = {
          name: `Load Test Workflow ${i + 1}`,
          requirements: {
            functional: [`Feature set ${i + 1}`],
            nonFunctional: [`Performance requirement ${i + 1}`]
          },
          environment: 'load-test',
          variables: { WORKFLOW_ID: `load-${i + 1}` }
        };
        
        workflows.push(integration.executeCompleteWorkflow(workflowSpec));
      }
      
      const results = await Promise.all(workflows);
      const totalTime = Date.now() - startTime;
      
      // Verify all workflows succeeded
      expect(results.every(r => r.success)).toBe(true);
      
      // Verify performance metrics
      const globalMetrics = integration.getGlobalMetrics();
      expect(globalMetrics.workflowsExecuted).toBe(workflowCount);
      expect(globalMetrics.totalAgentsSpawned).toBeGreaterThan(workflowCount * 3);
      expect(globalMetrics.totalTestsRun).toBeGreaterThan(workflowCount * 10);
      
      // Verify concurrent execution was efficient
      const sequentialTime = results.reduce((sum, r) => sum + r.duration, 0);
      const efficiency = (sequentialTime - totalTime) / sequentialTime;
      expect(efficiency).toBeGreaterThan(0.3); // At least 30% efficiency gain
      
      // Verify memory usage is reasonable
      const stats = memory.getStats();
      expect(stats.totalEntries).toBeLessThan(10000); // Should not exceed reasonable limits
      
      console.log(`Load Test Performance:`);
      console.log(`  Workflows: ${workflowCount}`);
      console.log(`  Total Time: ${totalTime}ms`);
      console.log(`  Sequential Time: ${sequentialTime}ms`);
      console.log(`  Efficiency Gain: ${(efficiency * 100).toFixed(1)}%`);
      console.log(`  Total Tests: ${globalMetrics.totalTestsRun}`);
      console.log(`  Pass Rate: ${((globalMetrics.totalTestsPassed / globalMetrics.totalTestsRun) * 100).toFixed(1)}%`);
      console.log(`  Memory Entries: ${stats.totalEntries}`);
    }, 60000); // 60 second timeout for load test

    it('should maintain performance with large memory datasets', async () => {
      const sessionId = 'large-dataset-test';
      const entryCount = 1000;
      
      // Populate memory with large dataset
      const startTime = Date.now();
      const storePromises = [];
      
      for (let i = 0; i < entryCount; i++) {
        storePromises.push(
          memory.store({
            key: `large-entry-${i}`,
            value: {
              index: i,
              data: `Large data chunk ${i}`,
              metadata: {
                batch: Math.floor(i / 100),
                timestamp: Date.now() + i,
                processed: i % 2 === 0
              }
            },
            type: 'test-data',
            sessionId,
            timestamp: new Date(Date.now() + i),
            tags: ['large-dataset', `batch-${Math.floor(i / 100)}`]
          })
        );
      }
      
      await Promise.all(storePromises);
      const storeTime = Date.now() - startTime;
      
      // Test query performance with large dataset
      const queryStart = Date.now();
      
      const queries = [
        memory.query({ sessionId, tags: ['large-dataset'] }),
        memory.query({ sessionId, tags: ['batch-5'] }),
        memory.query({ sessionId, limit: 100, sortBy: 'timestamp', sortOrder: 'desc' }),
        memory.query({ sessionId, offset: 500, limit: 50 })
      ];
      
      const queryResults = await Promise.all(queries);
      const queryTime = Date.now() - queryStart;
      
      // Verify results
      expect(queryResults[0]).toHaveLength(entryCount); // All entries
      expect(queryResults[1]).toHaveLength(100); // Batch 5 (entries 500-599)
      expect(queryResults[2]).toHaveLength(100); // Latest 100 entries
      expect(queryResults[3]).toHaveLength(50); // Paginated results
      
      // Verify performance
      expect(storeTime).toBeLessThan(entryCount * 5); // <5ms per entry on average
      expect(queryTime).toBeLessThan(2000); // <2s for all queries
      
      // Test workflow execution with large memory
      const workflowSpec: WorkflowSpecification = {
        name: 'Large Memory Test Workflow',
        requirements: {
          functional: ['Memory performance test'],
          nonFunctional: ['Large dataset handling']
        },
        environment: 'performance-test'
      };
      
      const workflowStart = Date.now();
      const result = await integration.executeCompleteWorkflow(workflowSpec);
      const workflowTime = Date.now() - workflowStart;
      
      expect(result.success).toBe(true);
      expect(workflowTime).toBeLessThan(15000); // Should complete within 15 seconds even with large memory
      
      console.log(`Large Dataset Performance:`);
      console.log(`  Store ${entryCount} entries: ${storeTime}ms (${(storeTime/entryCount).toFixed(2)}ms/entry)`);
      console.log(`  Query operations: ${queryTime}ms`);
      console.log(`  Workflow with large memory: ${workflowTime}ms`);
      
      // Verify memory stats
      const stats = memory.getStats();
      expect(stats.totalEntries).toBeGreaterThan(entryCount);
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });

  describe('Integration Resilience', () => {
    it('should recover from component failures gracefully', async () => {
      const workflowSpec: WorkflowSpecification = {
        name: 'Resilience Test Workflow',
        requirements: {
          functional: ['Failure recovery'],
          nonFunctional: ['Resilience testing']
        },
        environment: 'resilience-test'
      };
      
      // Start workflow normally
      const workflowPromise = integration.executeCompleteWorkflow(workflowSpec);
      
      // Simulate component stress during execution
      setTimeout(async () => {
        // Simulate memory pressure
        for (let i = 0; i < 100; i++) {
          await memory.store({
            key: `stress-entry-${i}`,
            value: { stress: 'test', data: 'x'.repeat(1000) },
            type: 'test-data',
            sessionId: 'stress-session',
            timestamp: new Date(),
            tags: ['stress'],
            ttl: 1000
          });
        }
      }, 1000);
      
      const result = await workflowPromise;
      
      // Workflow should still complete successfully despite stress
      expect(result.success).toBe(true);
      expect(result.phases.length).toBeGreaterThan(0);
      
      // Verify system remained stable
      const globalMetrics = integration.getGlobalMetrics();
      expect(globalMetrics.errorCount).toBe(0);
      
      // Verify memory cleanup handled stress entries
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for TTL
      await memory.cleanup();
      
      const stressEntries = await memory.query({
        sessionId: 'stress-session'
      });
      
      expect(stressEntries.length).toBe(0); // Should be cleaned up
    });

    it('should handle rapid workflow succession without degradation', async () => {
      const workflowCount = 3;
      const results: WorkflowExecutionResult[] = [];
      const executionTimes: number[] = [];
      
      // Execute workflows in rapid succession
      for (let i = 0; i < workflowCount; i++) {
        const workflowSpec: WorkflowSpecification = {
          name: `Rapid Succession Workflow ${i + 1}`,
          requirements: {
            functional: [`Feature ${i + 1}`],
            nonFunctional: [`Requirement ${i + 1}`]
          },
          environment: 'succession-test',
          variables: { ITERATION: (i + 1).toString() }
        };
        
        const startTime = Date.now();
        const result = await integration.executeCompleteWorkflow(workflowSpec);
        const executionTime = Date.now() - startTime;
        
        results.push(result);
        executionTimes.push(executionTime);
        
        expect(result.success).toBe(true);
      }
      
      // Verify no performance degradation
      const averageTime = executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length;
      const lastTime = executionTimes[executionTimes.length - 1];
      
      // Last execution should not be significantly slower than average
      expect(lastTime).toBeLessThan(averageTime * 1.5);
      
      // Verify all workflows completed successfully
      expect(results.every(r => r.success)).toBe(true);
      
      // Verify memory didn't grow excessively
      const stats = memory.getStats();
      expect(stats.totalEntries).toBeLessThan(workflowCount * 200); // Reasonable upper bound
      
      console.log(`Rapid Succession Performance:`);
      console.log(`  Workflows: ${workflowCount}`);
      console.log(`  Execution Times: ${executionTimes.map(t => `${t}ms`).join(', ')}`);
      console.log(`  Average Time: ${averageTime.toFixed(0)}ms`);
      console.log(`  Final Memory Entries: ${stats.totalEntries}`);
    });
  });
});