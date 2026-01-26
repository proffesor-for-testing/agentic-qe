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
  ChaosStrategyContext,
  ChaosStrategyResult,
} from './interfaces';
import { ChaosEngineerService } from './services/chaos-engineer';
import { LoadTesterService } from './services/load-tester';
import { PerformanceProfilerService } from './services/performance-profiler';
import { RiskScore } from '../../shared/value-objects';
import { PolicyGradientAlgorithm } from '../../integrations/rl-suite/algorithms/policy-gradient.js';
import { PersistentSONAEngine, createPersistentSONAEngine } from '../../integrations/ruvector/sona-persistence.js';
import type { RLState, RLAction } from '../../integrations/rl-suite/interfaces.js';

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
  enablePolicyGradient: boolean;
  enableQESONA: boolean;
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkflows: 3,
  defaultTimeout: 300000, // 5 minutes
  enableAutomatedExperiments: false,
  publishEvents: true,
  enablePolicyGradient: true,
  enableQESONA: true,
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

  // RL Integration: PolicyGradient for chaos engineering strategy
  private policyGradient?: PolicyGradientAlgorithm;

  // SONA Integration: PersistentSONAEngine for resilience pattern learning (patterns survive restarts)
  private qesona?: PersistentSONAEngine;

  private initialized = false;

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: Partial<CoordinatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.chaosEngineer = new ChaosEngineerService({ memory });
    this.loadTester = new LoadTesterService(memory);
    this.performanceProfiler = new PerformanceProfilerService(memory);
  }

  /**
   * Initialize the coordinator
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize PolicyGradient if enabled
    if (this.config.enablePolicyGradient) {
      try {
        this.policyGradient = new PolicyGradientAlgorithm({
          stateSize: 10,
          actionSize: 5,
          hiddenLayers: [64, 64],
        });
        // First call to predict will initialize the algorithm
        console.log('[chaos-resilience] PolicyGradient algorithm created successfully');
      } catch (error) {
        console.error('[chaos-resilience] Failed to create PolicyGradient:', error);
        throw new Error(`PolicyGradient creation failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Initialize PersistentSONAEngine if enabled (patterns survive restarts)
    if (this.config.enableQESONA) {
      try {
        this.qesona = await createPersistentSONAEngine({
          domain: 'chaos-resilience',
          loadOnInit: true,
          autoSaveInterval: 60000, // Save every minute
          maxPatterns: 5000,
          minConfidence: 0.6,
        });
        console.log('[chaos-resilience] PersistentSONAEngine initialized successfully');
      } catch (error) {
        // Log and continue - SONA is enhancement, not critical
        console.error('[chaos-resilience] Failed to initialize PersistentSONAEngine:', error);
        console.warn('[chaos-resilience] Continuing without SONA pattern persistence');
        this.qesona = undefined;
      }
    }

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

    // Dispose PersistentSONAEngine (flushes pending saves)
    if (this.qesona) {
      await this.qesona.close();
      this.qesona = undefined;
    }

    // Clear PolicyGradient (no explicit dispose method exists)
    this.policyGradient = undefined;

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
   * Run strategic chaos suite using PolicyGradient RL
   * Uses selectChaosStrategy to determine optimal experiments, then runs them
   */
  async runStrategicChaosSuite(
    services: ServiceDefinition[],
    context: ChaosStrategyContext
  ): Promise<Result<ChaosSuiteReport>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'chaos-suite');

      if (!this.agentCoordinator.canSpawn()) {
        return err(new Error('Agent limit reached, cannot spawn chaos agents'));
      }

      // Use PolicyGradient RL to select optimal chaos strategy and experiments
      const strategyResult = await this.selectChaosStrategy(services, context);

      if (!strategyResult.success) {
        this.failWorkflow(workflowId, strategyResult.error.message);
        return err(strategyResult.error);
      }

      const selectedExperiments = strategyResult.value.selectedExperiments;
      console.log(
        `[chaos-resilience] Using ${strategyResult.value.strategy} strategy with ${selectedExperiments.length} experiments (confidence: ${strategyResult.value.confidence.toFixed(2)})`
      );

      if (selectedExperiments.length === 0) {
        this.completeWorkflow(workflowId);
        return ok({
          totalExperiments: 0,
          passed: 0,
          failed: 0,
          results: [],
          recommendations: [{
            priority: 'low',
            category: 'strategy',
            recommendation: 'No experiments selected - consider adjusting strategy context',
            effort: 'trivial',
          }],
        });
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

      // First, create the experiments in the chaos engineer service
      for (const experiment of selectedExperiments) {
        await this.chaosEngineer.createExperiment(experiment);
      }

      // Run each selected experiment
      for (let i = 0; i < selectedExperiments.length; i++) {
        const experiment = selectedExperiments[i];
        this.updateWorkflowProgress(
          workflowId,
          Math.round(((i + 1) / selectedExperiments.length) * 100)
        );

        const result = await this.chaosEngineer.runExperiment(experiment.id);

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

          // Store pattern for QESONA learning
          const quality = result.value.hypothesisValidated ? 0.8 : 0.2;
          await this.storeResiliencePattern(experiment, result.value, quality);

          // Publish event
          if (this.config.publishEvents) {
            await this.publishExperimentCompleted(result.value);
          }
        } else {
          failed++;
          recommendations.push({
            priority: 'high',
            category: 'experiment-failure',
            recommendation: `Failed to run experiment ${experiment.name}: ${result.error.message}`,
            effort: 'moderate',
          });
        }
      }

      // Stop agent
      await this.agentCoordinator.stop(agentResult.value);
      this.completeWorkflow(workflowId);

      const report: ChaosSuiteReport = {
        totalExperiments: selectedExperiments.length,
        passed,
        failed,
        results,
        recommendations,
      };

      // Store report
      await this.storeReport('strategic-chaos-suite', workflowId, report);

      return ok(report);
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
  // PolicyGradient Integration: Chaos Engineering Strategy
  // ============================================================================

  /**
   * Select chaos strategy using PolicyGradient
   * Uses learned policy to choose optimal chaos experiments
   */
  async selectChaosStrategy(
    services: ServiceDefinition[],
    context: ChaosStrategyContext
  ): Promise<Result<ChaosStrategyResult>> {
    if (!this.policyGradient || !this.config.enablePolicyGradient) {
      // Return default strategy if PolicyGradient is disabled
      return ok({
        strategy: 'default',
        selectedExperiments: this.getDefaultExperiments(services.slice(0, 3)),
        confidence: 1.0,
        reasoning: 'Default strategy (PolicyGradient disabled)',
      });
    }

    if (services.length === 0) {
      return ok({
        strategy: 'empty',
        selectedExperiments: [],
        confidence: 1.0,
        reasoning: 'No services provided',
      });
    }

    try {
      // Create state from context
      const state: RLState = {
        id: `chaos-strategy-${Date.now()}`,
        features: [
          context.riskTolerance,
          context.availableCapacity / 100,
          services.length / 50,
          services.filter((s) => !s.hasFailover).length / Math.max(1, services.length),
          services.filter((s) => s.type === 'database').length / Math.max(1, services.length),
          context.environment === 'production' ? 0 : 1,
          context.environment === 'staging' ? 1 : 0,
          services.filter((s) => s.type === 'cache').length / Math.max(1, services.length),
          services.filter((s) => s.type === 'queue').length / Math.max(1, services.length),
          services.reduce((sum, s) => sum + s.replicas, 0) / Math.max(1, services.length * 5),
        ],
      };

      // Get PolicyGradient prediction for strategy
      const prediction = await this.policyGradient.predict(state);

      // Generate experiments based on selected action
      let selectedExperiments: ChaosExperiment[] = [];
      let strategy = 'default';

      switch (prediction.action.type) {
        case 'allocate':
          const allocValue = typeof prediction.action.value === 'object' ? prediction.action.value : null;
          if (allocValue && 'agentType' in allocValue && allocValue.agentType === 'tester') {
            // Allocate more tests to high-risk services (no failover, databases)
            const criticalServices = services.filter((s) => !s.hasFailover || s.type === 'database').slice(0, 3);
            selectedExperiments = this.generateExperimentsForServices(criticalServices, ['latency', 'error']);
            strategy = 'allocate-critical';
          }
          break;

        case 'reallocate':
          const reallocValue = typeof prediction.action.value === 'object' ? prediction.action.value : null;
          if (reallocValue && 'domain' in reallocValue && reallocValue.domain === 'test-execution') {
            // Reallocate to test different fault types
            selectedExperiments = this.generateExperimentsForServices(services.slice(0, 5), ['cpu-stress', 'memory-stress']);
            strategy = 'reallocate-resource-stress';
          }
          break;

        case 'scale-up':
          // Scale up experiment count
          selectedExperiments = this.generateExperimentsForServices(services, ['latency', 'error', 'timeout']);
          strategy = 'scale-up-comprehensive';
          break;

        case 'scale-down':
          // Scale down to minimal experiments
          selectedExperiments = this.generateExperimentsForServices(services.slice(0, 2), ['latency']);
          strategy = 'scale-down-minimal';
          break;

        default:
          selectedExperiments = this.getDefaultExperiments(services.slice(0, 3));
          strategy = 'default';
          break;
      }

      // Train PolicyGradient with feedback
      const reward = await this.calculateStrategyReward(selectedExperiments, context);
      const action: RLAction = prediction.action;

      await this.policyGradient.train({
        state,
        action,
        reward,
        nextState: state,
        done: true,
      });

      console.log(
        `[chaos-resilience] PolicyGradient selected ${strategy} strategy for ${services.length} services (confidence: ${prediction.confidence.toFixed(2)})`
      );

      return ok({
        strategy,
        selectedExperiments,
        confidence: prediction.confidence,
        reasoning: prediction.reasoning || `PolicyGradient selected: ${strategy}`,
      });
    } catch (error) {
      console.error('[chaos-resilience] PolicyGradient strategy selection failed:', error);
      // Return default strategy on error (graceful degradation)
      return ok({
        strategy: 'fallback',
        selectedExperiments: this.getDefaultExperiments(services.slice(0, 3)),
        confidence: 0.5,
        reasoning: 'Fallback to default (PolicyGradient error)',
      });
    }
  }

  /**
   * Generate experiments for specific services
   */
  private generateExperimentsForServices(
    services: ServiceDefinition[],
    faultTypes: FaultType[]
  ): ChaosExperiment[] {
    const experiments: ChaosExperiment[] = [];

    for (const service of services) {
      for (const faultType of faultTypes) {
        experiments.push(this.createExperiment(
          `${service.name}-${faultType}-${Date.now()}`,
          `Test ${service.name} with ${faultType} fault`,
          faultType,
          service.name
        ));
      }
    }

    return experiments;
  }

  /**
   * Get default experiments
   */
  private getDefaultExperiments(services: ServiceDefinition[]): ChaosExperiment[] {
    return this.generateExperimentsForServices(services, ['latency', 'error']);
  }

  /**
   * Calculate reward for chaos strategy
   */
  private async calculateStrategyReward(
    experiments: ChaosExperiment[],
    context: { riskTolerance: number; availableCapacity: number }
  ): Promise<number> {
    let reward = 0.5;

    // Reward for matching risk tolerance
    const experimentCount = experiments.length;
    if (context.riskTolerance > 0.7 && experimentCount > 5) {
      reward += 0.2;
    } else if (context.riskTolerance < 0.3 && experimentCount <= 3) {
      reward += 0.2;
    }

    // Reward for capacity utilization
    if (context.availableCapacity > 70 && experimentCount > 5) {
      reward += 0.1;
    } else if (context.availableCapacity < 30 && experimentCount <= 3) {
      reward += 0.1;
    }

    // Reward for fault type diversity
    const faultTypes = new Set(experiments.map((e) => e.faults[0]?.type));
    reward += Math.min(0.1, faultTypes.size / 5);

    return Math.max(0, Math.min(1, reward));
  }

  // ============================================================================
  // QESONA Integration: Resilience Pattern Learning
  // ============================================================================

  /**
   * Store resilience pattern for learning
   */
  async storeResiliencePattern(
    experiment: ChaosExperiment,
    result: ExperimentResult,
    quality: number
  ): Promise<void> {
    if (!this.qesona || !this.config.enableQESONA) {
      return;
    }

    try {
      const state: RLState = {
        id: `chaos-${experiment.id}`,
        features: [
          experiment.faults.length / 10,
          experiment.faults[0]?.duration ? experiment.faults[0].duration / 60000 : 0,
          experiment.steadyState.probes.length / 20,
          experiment.blastRadius.excludeProduction ? 1 : 0,
          (experiment.blastRadius.percentage ?? 0) / 100,
          result.hypothesisValidated ? 1 : 0,
          result.steadyStateVerified ? 1 : 0,
          result.incidents.length / 10,
          result.incidents.filter((i) => i.severity === 'critical').length / 5,
          quality,
        ],
      };

      const action: RLAction = {
        type: result.hypothesisValidated ? 'validate' : 'reject',
        value: quality,
      };

      this.qesona.createPattern(
        state,
        action,
        {
          reward: result.hypothesisValidated ? quality : -quality,
          success: result.hypothesisValidated,
          quality,
        },
        'defect-prediction',
        'chaos-resilience',
        {
          experimentId: experiment.id,
          experimentName: experiment.name,
          faultType: experiment.faults[0]?.type,
          hypothesisValidated: result.hypothesisValidated,
        }
      );

      console.log(`[chaos-resilience] Stored resilience pattern for ${experiment.id} (validated: ${result.hypothesisValidated}, quality: ${quality.toFixed(2)})`);
    } catch (error) {
      console.error('[chaos-resilience] Failed to store resilience pattern:', error);
    }
  }

  /**
   * Adapt resilience strategies using learned patterns
   */
  async adaptStrategies(
    service: ServiceDefinition,
    context: { environment: string; riskTolerance: number }
  ): Promise<{
    shouldRunChaos: boolean;
    recommendedFaults: FaultType[];
    confidence: number;
  }> {
    if (!this.qesona || !this.config.enableQESONA) {
      return {
        shouldRunChaos: context.environment !== 'production',
        recommendedFaults: ['latency', 'error'],
        confidence: 0.5,
      };
    }

    try {
      const state: RLState = {
        id: `chaos-adapt-${service.name}-${Date.now()}`,
        features: [
          !service.hasFailover ? 1 : 0,
          context.riskTolerance,
          service.type === 'api' ? 1 : 0,
          service.type === 'database' ? 1 : 0,
          service.type === 'cache' ? 1 : 0,
          context.environment === 'production' ? 1 : 0,
          context.environment === 'staging' ? 1 : 0,
          service.replicas / 10,
          service.type === 'worker' ? 1 : 0,
          service.type === 'queue' ? 1 : 0,
        ],
      };

      const adaptation = await this.qesona.adaptPattern(
        state,
        'defect-prediction',
        'chaos-resilience'
      );

      if (adaptation.success && adaptation.pattern) {
        const shouldRunChaos = adaptation.pattern.outcome.success;
        const recommendedFaults = this.getRecommendedFaults(adaptation.pattern.action.type);

        console.log(
          `[chaos-resilience] QESONA adapted strategy for ${service.name}: shouldRun=${shouldRunChaos}, faults=${recommendedFaults.join(',')}, confidence=${adaptation.similarity.toFixed(2)}`
        );

        return {
          shouldRunChaos,
          recommendedFaults,
          confidence: adaptation.similarity,
        };
      }

      return {
        shouldRunChaos: context.environment !== 'production',
        recommendedFaults: ['latency', 'error'],
        confidence: 0.5,
      };
    } catch (error) {
      console.error('[chaos-resilience] QESONA strategy adaptation failed:', error);
      return {
        shouldRunChaos: context.environment !== 'production',
        recommendedFaults: ['latency', 'error'],
        confidence: 0.5,
      };
    }
  }

  /**
   * Get recommended fault types from action
   */
  private getRecommendedFaults(actionType: string): FaultType[] {
    switch (actionType) {
      case 'validate':
        return ['latency', 'error', 'timeout'];
      case 'reject':
        return ['latency'];
      case 'allocate':
        return ['latency', 'cpu-stress'];
      case 'scale-up':
        return ['latency', 'error', 'timeout', 'packet-loss'];
      case 'scale-down':
        return ['latency'];
      default:
        return ['latency', 'error'];
    }
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
