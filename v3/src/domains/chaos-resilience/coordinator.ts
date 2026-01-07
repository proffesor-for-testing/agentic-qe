/**
 * Agentic QE v3 - Chaos & Resilience Coordinator
 * Orchestrates chaos engineering and resilience testing workflows
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err, DomainEvent } from '../../shared/types';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
  AgentSpawnConfig,
} from '../../kernel/interfaces';
import {
  ChaosExperiment,
  ExperimentResult,
  LoadTestResult,
  FaultType,
  ChaosSuiteReport,
  LoadTestSuiteReport,
  ResilienceAssessment,
  ResilienceWeakness,
  ResilienceRecommendation,
  ResilienceDashboard,
  ServiceArchitecture,
  ServiceDefinition,
  ServiceDependency,
  PerformanceBottleneck,
  IChaosResilienceCoordinator,
} from './interfaces';
import { ChaosEngineerService } from './services/chaos-engineer';
import { LoadTesterService } from './services/load-tester';
import { PerformanceProfilerService } from './services/performance-profiler';
import { RiskScore } from '../../shared/value-objects';

/**
 * Interface for the chaos resilience coordinator
 */
export interface IChaosResilienceCoordinatorExtended extends IChaosResilienceCoordinator {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  getActiveWorkflows(): WorkflowStatus[];
}

/**
 * Workflow status tracking
 */
export interface WorkflowStatus {
  id: string;
  type: 'chaos-suite' | 'load-suite' | 'assessment' | 'experiment-generation';
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  agentIds: string[];
  progress: number;
  error?: string;
}

/**
 * Coordinator configuration
 */
export interface CoordinatorConfig {
  maxConcurrentWorkflows: number;
  defaultTimeout: number;
  enableAutomatedExperiments: boolean;
  publishEvents: boolean;
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkflows: 3,
  defaultTimeout: 300000, // 5 minutes
  enableAutomatedExperiments: false,
  publishEvents: true,
};

/**
 * Chaos Resilience Coordinator
 * Orchestrates chaos engineering workflows and coordinates with agents
 */
export class ChaosResilienceCoordinator implements IChaosResilienceCoordinatorExtended {
  private readonly config: CoordinatorConfig;
  private readonly chaosEngineer: ChaosEngineerService;
  private readonly loadTester: LoadTesterService;
  private readonly performanceProfiler: PerformanceProfilerService;
  private readonly workflows: Map<string, WorkflowStatus> = new Map();
  private initialized = false;

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: Partial<CoordinatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.chaosEngineer = new ChaosEngineerService(memory);
    this.loadTester = new LoadTesterService(memory);
    this.performanceProfiler = new PerformanceProfilerService(memory);
  }

  /**
   * Initialize the coordinator
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Subscribe to relevant events
    this.subscribeToEvents();

    // Load any persisted workflow state
    await this.loadWorkflowState();

    this.initialized = true;
  }

  /**
   * Dispose and cleanup
   */
  async dispose(): Promise<void> {
    await this.saveWorkflowState();
    this.workflows.clear();
    this.initialized = false;
  }

  /**
   * Get active workflow statuses
   */
  getActiveWorkflows(): WorkflowStatus[] {
    return Array.from(this.workflows.values()).filter(
      (w) => w.status === 'running' || w.status === 'pending'
    );
  }

  // ============================================================================
  // IChaosResilienceCoordinator Implementation
  // ============================================================================

  /**
   * Run a suite of chaos experiments
   */
  async runChaosSuite(experimentIds: string[]): Promise<Result<ChaosSuiteReport>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'chaos-suite');

      if (!this.agentCoordinator.canSpawn()) {
        return err(new Error('Agent limit reached, cannot spawn chaos agents'));
      }

      // Spawn chaos coordinator agent
      const agentResult = await this.spawnChaosAgent(workflowId, 'coordinator');
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);

      const results: ExperimentResult[] = [];
      const recommendations: ResilienceRecommendation[] = [];
      let passed = 0;
      let failed = 0;

      // Run each experiment
      for (let i = 0; i < experimentIds.length; i++) {
        const experimentId = experimentIds[i];
        this.updateWorkflowProgress(
          workflowId,
          Math.round(((i + 1) / experimentIds.length) * 100)
        );

        const result = await this.chaosEngineer.runExperiment(experimentId);

        if (result.success) {
          results.push(result.value);

          if (result.value.hypothesisValidated) {
            passed++;
          } else {
            failed++;
            // Generate recommendations for failed experiments
            const recs = this.generateRecommendationsFromExperiment(result.value);
            recommendations.push(...recs);
          }

          // Publish event
          if (this.config.publishEvents) {
            await this.publishExperimentCompleted(result.value);
          }
        } else {
          failed++;
          recommendations.push({
            priority: 'high',
            category: 'experiment-failure',
            recommendation: `Failed to run experiment ${experimentId}: ${result.error.message}`,
            effort: 'moderate',
          });
        }
      }

      // Stop agent
      await this.agentCoordinator.stop(agentResult.value);
      this.completeWorkflow(workflowId);

      const report: ChaosSuiteReport = {
        totalExperiments: experimentIds.length,
        passed,
        failed,
        results,
        recommendations,
      };

      // Store report
      await this.storeReport('chaos-suite', workflowId, report);

      return ok(report);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Run a suite of load tests
   */
  async runLoadTestSuite(testIds: string[]): Promise<Result<LoadTestSuiteReport>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'load-suite');

      // Spawn load test agent
      const agentResult = await this.spawnLoadTestAgent(workflowId, 'orchestrator');
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);

      const results: LoadTestResult[] = [];
      const bottlenecks: PerformanceBottleneck[] = [];
      let passed = 0;
      let failed = 0;

      // Run each load test
      for (let i = 0; i < testIds.length; i++) {
        const testId = testIds[i];
        this.updateWorkflowProgress(
          workflowId,
          Math.round(((i + 1) / testIds.length) * 100)
        );

        const result = await this.loadTester.runTest(testId);

        if (result.success) {
          results.push(result.value);

          if (result.value.status === 'completed') {
            passed++;
          } else {
            failed++;
          }

          // Detect bottlenecks from test results
          const detectedBottlenecks = this.detectBottlenecks(result.value);
          bottlenecks.push(...detectedBottlenecks);

          // Publish event
          if (this.config.publishEvents) {
            await this.publishLoadTestCompleted(result.value);
          }
        } else {
          failed++;
        }
      }

      // Stop agent
      await this.agentCoordinator.stop(agentResult.value);
      this.completeWorkflow(workflowId);

      const report: LoadTestSuiteReport = {
        totalTests: testIds.length,
        passed,
        failed,
        results,
        bottlenecks,
      };

      await this.storeReport('load-suite', workflowId, report);

      return ok(report);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Perform a full resilience assessment
   */
  async assessResilience(services: string[]): Promise<Result<ResilienceAssessment>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'assessment');

      const serviceScores = new Map<string, number>();
      const strengths: string[] = [];
      const weaknesses: ResilienceWeakness[] = [];
      const recommendations: ResilienceRecommendation[] = [];

      // Spawn assessment agent
      const agentResult = await this.spawnAssessmentAgent(workflowId);
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);

      // Assess each service
      for (let i = 0; i < services.length; i++) {
        const service = services[i];
        this.updateWorkflowProgress(
          workflowId,
          Math.round(((i + 1) / services.length) * 100)
        );

        // Test recovery
        const recoveryResult = await this.performanceProfiler.testRecovery(
          service,
          'latency',
          5000 // 5 second expected recovery
        );

        // Test circuit breaker
        const circuitResult = await this.performanceProfiler.testCircuitBreaker(service);

        // Test rate limiting
        const rateLimitResult = await this.performanceProfiler.testRateLimiting(service, 100);

        // Calculate service score
        let score = 0;

        if (recoveryResult.success && recoveryResult.value.passed) {
          score += 33.3;
          strengths.push(`${service}: Fast recovery (${recoveryResult.value.recoveryTime}ms)`);
        } else {
          const recoveryTime = recoveryResult.success ? recoveryResult.value.recoveryTime : 'unknown';
          weaknesses.push({
            service,
            type: 'recovery',
            description: 'Slow or failed recovery after fault',
            risk: RiskScore.create(0.7),
          });
          recommendations.push({
            priority: 'high',
            category: 'recovery',
            recommendation: `Improve ${service} recovery time - currently ${recoveryTime}ms`,
            effort: 'moderate',
          });
        }

        if (circuitResult.success && circuitResult.value.passed) {
          score += 33.3;
          strengths.push(`${service}: Circuit breaker functioning correctly`);
        } else {
          weaknesses.push({
            service,
            type: 'circuit-breaker',
            description: 'Circuit breaker not functioning as expected',
            risk: RiskScore.create(0.6),
          });
          recommendations.push({
            priority: 'medium',
            category: 'circuit-breaker',
            recommendation: `Review ${service} circuit breaker configuration`,
            effort: 'minor',
          });
        }

        if (rateLimitResult.success && rateLimitResult.value.passed) {
          score += 33.4;
          strengths.push(`${service}: Rate limiting effective`);
        } else {
          weaknesses.push({
            service,
            type: 'rate-limiting',
            description: 'Rate limiting not properly configured',
            risk: RiskScore.create(0.5),
          });
          recommendations.push({
            priority: 'medium',
            category: 'rate-limiting',
            recommendation: `Configure rate limiting for ${service}`,
            effort: 'minor',
          });
        }

        serviceScores.set(service, score);
      }

      // Calculate overall score
      const overallScore =
        services.length > 0
          ? Array.from(serviceScores.values()).reduce((a, b) => a + b, 0) / services.length
          : 0;

      // Stop agent
      await this.agentCoordinator.stop(agentResult.value);
      this.completeWorkflow(workflowId);

      const assessment: ResilienceAssessment = {
        overallScore,
        serviceScores,
        strengths,
        weaknesses,
        recommendations,
      };

      await this.storeReport('assessment', workflowId, assessment);

      return ok(assessment);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate chaos experiments from architecture
   */
  async generateExperiments(
    architecture: ServiceArchitecture
  ): Promise<Result<ChaosExperiment[]>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'experiment-generation');

      const experiments: ChaosExperiment[] = [];

      // Generate experiments for each service
      for (const service of architecture.services) {
        const serviceExperiments = this.generateServiceExperiments(
          service,
          architecture.dependencies
        );
        experiments.push(...serviceExperiments);
      }

      // Generate experiments for critical paths
      for (const criticalPath of architecture.criticalPaths) {
        const pathExperiment = this.generateCriticalPathExperiment(
          criticalPath,
          architecture
        );
        experiments.push(pathExperiment);
      }

      // Store generated experiments
      for (const experiment of experiments) {
        await this.chaosEngineer.createExperiment(experiment);
      }

      this.completeWorkflow(workflowId);

      return ok(experiments);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get resilience dashboard data
   */
  async getResilienceDashboard(): Promise<Result<ResilienceDashboard>> {
    try {
      // Gather metrics from stored results
      const experimentResults = await this.memory.search('chaos:results:*', 10);
      const loadTestResults = await this.memory.search('loadtest:results:*', 10);

      // Calculate metrics
      let lastExperimentDate: Date | undefined;
      let lastLoadTestDate: Date | undefined;
      let activeIncidents = 0;
      let totalRecoveryTime = 0;
      let recoveryCount = 0;
      let failedChanges = 0;
      let totalChanges = 0;

      // Process experiment results
      for (const key of experimentResults) {
        const result = await this.memory.get<ExperimentResult>(key);
        if (result) {
          if (!lastExperimentDate || result.startTime > lastExperimentDate) {
            lastExperimentDate = result.startTime;
          }
          activeIncidents += result.incidents.filter((i) => !i.resolved).length;
        }
      }

      // Process load test results
      for (const key of loadTestResults) {
        const result = await this.memory.get<LoadTestResult>(key);
        if (result && result.timeline.length > 0) {
          const testDate = result.timeline[0].timestamp;
          if (!lastLoadTestDate || testDate > lastLoadTestDate) {
            lastLoadTestDate = testDate;
          }
          totalChanges++;
          if (result.status === 'failed') {
            failedChanges++;
          }
        }
      }

      // Calculate derived metrics
      const mttr = recoveryCount > 0 ? totalRecoveryTime / recoveryCount : 0;
      const changeFailureRate =
        totalChanges > 0 ? (failedChanges / totalChanges) * 100 : 0;

      // Determine overall health
      let overallHealth: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (activeIncidents > 5 || changeFailureRate > 25) {
        overallHealth = 'unhealthy';
      } else if (activeIncidents > 0 || changeFailureRate > 10) {
        overallHealth = 'degraded';
      }

      const dashboard: ResilienceDashboard = {
        overallHealth,
        lastExperimentDate,
        lastLoadTestDate,
        activeIncidents,
        uptime: 99.9, // Would be calculated from actual uptime data
        mttr,
        changeFailureRate,
      };

      return ok(dashboard);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Agent Spawning Methods
  // ============================================================================

  private async spawnChaosAgent(
    workflowId: string,
    role: string
  ): Promise<Result<string, Error>> {
    const config: AgentSpawnConfig = {
      name: `chaos-${role}-${workflowId.slice(0, 8)}`,
      domain: 'chaos-resilience',
      type: 'specialist',
      capabilities: ['chaos-engineering', 'fault-injection', role],
      config: { workflowId },
    };

    return this.agentCoordinator.spawn(config);
  }

  private async spawnLoadTestAgent(
    workflowId: string,
    role: string
  ): Promise<Result<string, Error>> {
    const config: AgentSpawnConfig = {
      name: `loadtest-${role}-${workflowId.slice(0, 8)}`,
      domain: 'chaos-resilience',
      type: 'specialist',
      capabilities: ['load-testing', 'performance', role],
      config: { workflowId },
    };

    return this.agentCoordinator.spawn(config);
  }

  private async spawnAssessmentAgent(workflowId: string): Promise<Result<string, Error>> {
    const config: AgentSpawnConfig = {
      name: `assessment-${workflowId.slice(0, 8)}`,
      domain: 'chaos-resilience',
      type: 'analyzer',
      capabilities: ['resilience-assessment', 'analysis'],
      config: { workflowId },
    };

    return this.agentCoordinator.spawn(config);
  }

  // ============================================================================
  // Event Publishing Methods
  // ============================================================================

  private async publishExperimentCompleted(result: ExperimentResult): Promise<void> {
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'chaos-resilience.ExperimentCompleted',
      timestamp: new Date(),
      source: 'chaos-resilience',
      payload: {
        experimentId: result.experimentId,
        status: result.status,
        hypothesisValidated: result.hypothesisValidated,
        incidentCount: result.incidents.length,
      },
    };

    await this.eventBus.publish(event);
  }

  private async publishLoadTestCompleted(result: LoadTestResult): Promise<void> {
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'chaos-resilience.LoadTestCompleted',
      timestamp: new Date(),
      source: 'chaos-resilience',
      payload: {
        testId: result.testId,
        status: result.status,
        summary: result.summary,
        assertionsPassed: result.assertionResults.filter((a) => a.passed).length,
        assertionsFailed: result.assertionResults.filter((a) => !a.passed).length,
      },
    };

    await this.eventBus.publish(event);
  }

  // ============================================================================
  // Workflow Management
  // ============================================================================

  private startWorkflow(id: string, type: WorkflowStatus['type']): void {
    const activeWorkflows = this.getActiveWorkflows();
    if (activeWorkflows.length >= this.config.maxConcurrentWorkflows) {
      throw new Error(
        `Maximum concurrent workflows (${this.config.maxConcurrentWorkflows}) reached`
      );
    }

    this.workflows.set(id, {
      id,
      type,
      status: 'running',
      startedAt: new Date(),
      agentIds: [],
      progress: 0,
    });
  }

  private completeWorkflow(id: string): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      workflow.status = 'completed';
      workflow.completedAt = new Date();
      workflow.progress = 100;
    }
  }

  private failWorkflow(id: string, error: string): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      workflow.status = 'failed';
      workflow.completedAt = new Date();
      workflow.error = error;
    }
  }

  private addAgentToWorkflow(workflowId: string, agentId: string): void {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.agentIds.push(agentId);
    }
  }

  private updateWorkflowProgress(id: string, progress: number): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      workflow.progress = Math.min(100, Math.max(0, progress));
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private generateRecommendationsFromExperiment(
    result: ExperimentResult
  ): ResilienceRecommendation[] {
    const recommendations: ResilienceRecommendation[] = [];

    if (!result.hypothesisValidated) {
      recommendations.push({
        priority: 'high',
        category: 'hypothesis-failure',
        recommendation: `Experiment ${result.experimentId} hypothesis was not validated - review system behavior under fault conditions`,
        effort: 'moderate',
      });
    }

    if (!result.steadyStateVerified) {
      recommendations.push({
        priority: 'critical',
        category: 'steady-state',
        recommendation: 'System did not maintain steady state - investigate stability issues',
        effort: 'major',
      });
    }

    for (const incident of result.incidents) {
      if (incident.severity === 'critical' || incident.severity === 'high') {
        recommendations.push({
          priority: incident.severity,
          category: 'incident',
          recommendation: `Address ${incident.type}: ${incident.message}`,
          effort: 'moderate',
        });
      }
    }

    return recommendations;
  }

  private detectBottlenecks(result: LoadTestResult): PerformanceBottleneck[] {
    const bottlenecks: PerformanceBottleneck[] = [];

    // High response time bottleneck
    if (result.summary.p95ResponseTime > 1000) {
      bottlenecks.push({
        location: 'api',
        type: 'network',
        description: `P95 response time is ${result.summary.p95ResponseTime}ms (>1000ms)`,
        impact: result.summary.p95ResponseTime > 2000 ? 'high' : 'medium',
        recommendation: 'Investigate API response time, consider caching or query optimization',
      });
    }

    // High error rate bottleneck
    if (result.summary.errorRate > 5) {
      bottlenecks.push({
        location: 'service',
        type: 'cpu',
        description: `Error rate is ${result.summary.errorRate.toFixed(2)}% (>5%)`,
        impact: result.summary.errorRate > 10 ? 'high' : 'medium',
        recommendation: 'Investigate error causes, scale resources if under load',
      });
    }

    // Throughput bottleneck
    if (result.summary.requestsPerSecond < 10) {
      bottlenecks.push({
        location: 'backend',
        type: 'io',
        description: `Low throughput: ${result.summary.requestsPerSecond.toFixed(2)} RPS`,
        impact: 'medium',
        recommendation: 'Review I/O operations, database queries, and connection pooling',
      });
    }

    return bottlenecks;
  }

  private generateServiceExperiments(
    service: ServiceDefinition,
    dependencies: ServiceDependency[]
  ): ChaosExperiment[] {
    const experiments: ChaosExperiment[] = [];

    // Latency experiment
    experiments.push(this.createExperiment(
      `${service.name}-latency`,
      `Test ${service.name} behavior under latency`,
      'latency',
      service.name
    ));

    // Error experiment
    experiments.push(this.createExperiment(
      `${service.name}-error`,
      `Test ${service.name} error handling`,
      'error',
      service.name
    ));

    // Resource stress experiment
    experiments.push(this.createExperiment(
      `${service.name}-cpu-stress`,
      `Test ${service.name} under CPU stress`,
      'cpu-stress',
      service.name
    ));

    // Dependency failure experiments
    const serviceDeps = dependencies.filter((d) => d.from === service.name);
    for (const dep of serviceDeps) {
      if (dep.criticality === 'critical') {
        experiments.push(this.createExperiment(
          `${service.name}-${dep.to}-failure`,
          `Test ${service.name} when ${dep.to} fails`,
          'error',
          dep.to
        ));
      }
    }

    return experiments;
  }

  private generateCriticalPathExperiment(
    path: string[],
    _architecture: ServiceArchitecture
  ): ChaosExperiment {
    const pathName = path.join('-');

    return {
      id: uuidv4(),
      name: `critical-path-${pathName}`,
      description: `Test critical path: ${path.join(' -> ')}`,
      hypothesis: {
        statement: 'System should handle partial path failure gracefully',
        metrics: [
          { metric: 'error_rate', operator: 'lt', value: 10 },
          { metric: 'response_time_ms', operator: 'lt', value: 2000 },
        ],
        tolerances: [
          { metric: 'error_rate', maxDeviation: 5, unit: 'percent' },
        ],
      },
      steadyState: {
        description: 'All services in path are healthy',
        probes: path.map((service) => ({
          name: `${service}-health`,
          type: 'http' as const,
          target: `http://${service}/health`,
          expected: { status: 200 },
          timeout: 5000,
        })),
      },
      faults: path.slice(0, -1).map((service) => ({
        id: uuidv4(),
        type: 'latency' as FaultType,
        target: {
          type: 'service' as const,
          selector: service,
        },
        parameters: { latencyMs: 500 },
        duration: 30000,
      })),
      blastRadius: {
        scope: 'subset',
        percentage: 50,
        excludeProduction: true,
      },
      rollbackPlan: {
        automatic: true,
        triggerConditions: [
          { type: 'error-rate', condition: 'error_rate > 20' },
          { type: 'timeout', condition: 'duration > 60000' },
        ],
        steps: [
          { order: 1, action: 'Remove all faults', timeout: 5000 },
          { order: 2, action: 'Verify service health' },
        ],
      },
    };
  }

  private createExperiment(
    name: string,
    description: string,
    faultType: FaultType,
    target: string
  ): ChaosExperiment {
    return {
      id: uuidv4(),
      name,
      description,
      hypothesis: {
        statement: `${target} should recover within 5 seconds from ${faultType}`,
        metrics: [
          { metric: 'response_time_ms', operator: 'lt', value: 1000 },
          { metric: 'error_rate', operator: 'lt', value: 5 },
        ],
        tolerances: [
          { metric: 'response_time_ms', maxDeviation: 50, unit: 'percent' },
        ],
      },
      steadyState: {
        description: `${target} is healthy and responsive`,
        probes: [
          {
            name: `${target}-health`,
            type: 'http',
            target: `http://${target}/health`,
            expected: { status: 200 },
            timeout: 5000,
          },
        ],
      },
      faults: [
        {
          id: uuidv4(),
          type: faultType,
          target: { type: 'service', selector: target },
          parameters: this.getDefaultFaultParameters(faultType),
          duration: 30000, // 30 seconds
        },
      ],
      blastRadius: {
        scope: 'single',
        excludeProduction: true,
      },
      rollbackPlan: {
        automatic: true,
        triggerConditions: [
          { type: 'error-rate', condition: 'error_rate > 50' },
        ],
        steps: [
          { order: 1, action: `Remove ${faultType} fault` },
          { order: 2, action: 'Verify recovery' },
        ],
      },
    };
  }

  private getDefaultFaultParameters(faultType: FaultType): Record<string, unknown> {
    const defaults: Record<FaultType, Record<string, unknown>> = {
      'latency': { latencyMs: 500 },
      'error': { errorCode: 500 },
      'timeout': { timeoutMs: 30000 },
      'packet-loss': { packetLossPercent: 10 },
      'cpu-stress': { cpuPercent: 80 },
      'memory-stress': { memoryBytes: 1024 * 1024 * 256 }, // 256MB
      'disk-stress': {},
      'network-partition': {},
      'dns-failure': {},
      'process-kill': {},
    };

    return defaults[faultType] || {};
  }

  private async storeReport(type: string, id: string, report: unknown): Promise<void> {
    await this.memory.set(
      `chaos-resilience:reports:${type}:${id}`,
      report,
      { namespace: 'chaos-resilience', persist: true }
    );
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  private subscribeToEvents(): void {
    // Subscribe to deployment events to trigger chaos tests
    this.eventBus.subscribe(
      'quality-assessment.DeploymentApproved',
      this.handleDeploymentApproved.bind(this)
    );

    // Subscribe to quality gate events
    this.eventBus.subscribe(
      'quality-assessment.QualityGateEvaluated',
      this.handleQualityGateEvaluated.bind(this)
    );
  }

  private async handleDeploymentApproved(event: DomainEvent): Promise<void> {
    if (!this.config.enableAutomatedExperiments) return;

    // Could trigger automated chaos experiments after deployment
    const payload = event.payload as { services?: string[] };
    if (payload.services) {
      // Queue assessment for deployed services
      await this.memory.set(
        `chaos-resilience:pending-assessment:${event.id}`,
        payload.services,
        { namespace: 'chaos-resilience', ttl: 3600 }
      );
    }
  }

  private async handleQualityGateEvaluated(event: DomainEvent): Promise<void> {
    // Track quality gate results for resilience correlation
    const payload = event.payload as { gateId: string; passed: boolean };

    if (!payload.passed) {
      // Store for later analysis
      await this.memory.set(
        `chaos-resilience:quality-gate-failures:${event.id}`,
        payload,
        { namespace: 'chaos-resilience', ttl: 86400 }
      );
    }
  }

  // ============================================================================
  // State Persistence
  // ============================================================================

  private async loadWorkflowState(): Promise<void> {
    const savedState = await this.memory.get<WorkflowStatus[]>(
      'chaos-resilience:coordinator:workflows'
    );

    if (savedState) {
      for (const workflow of savedState) {
        if (workflow.status === 'running') {
          workflow.status = 'failed';
          workflow.error = 'Coordinator restarted';
          workflow.completedAt = new Date();
        }
        this.workflows.set(workflow.id, workflow);
      }
    }
  }

  private async saveWorkflowState(): Promise<void> {
    const workflows = Array.from(this.workflows.values());
    await this.memory.set(
      'chaos-resilience:coordinator:workflows',
      workflows,
      { namespace: 'chaos-resilience', persist: true }
    );
  }
}
