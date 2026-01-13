/**
 * Agentic QE v3 - Chaos & Resilience Domain Plugin
 * Integrates the chaos-resilience domain into the kernel
 */

import { DomainName, DomainEvent, Result } from '../../shared/types';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
} from '../../kernel/interfaces';
import { BaseDomainPlugin } from '../domain-interface';
import {
  ChaosExperiment,
  ExperimentResult,
  LoadTest,
  LoadTestResult,
  ChaosSuiteReport,
  LoadTestSuiteReport,
  ResilienceAssessment,
  ResilienceDashboard,
  ServiceArchitecture,
  IChaosResilienceCoordinator,
  IChaosEngineeringService,
  ILoadTestingService,
  IResilienceTestingService,
  SteadyStateDefinition,
  FaultInjection,
  FaultResult,
  TimelinePoint,
  TrafficSample,
  FaultType,
  RecoveryTestResult,
  FailoverTestResult,
  CircuitBreakerTestOptions,
  CircuitBreakerTestResult,
  RateLimitTestResult,
} from './interfaces';
import {
  ChaosResilienceCoordinator,
  IChaosResilienceCoordinatorExtended,
  CoordinatorConfig,
} from './coordinator';
import {
  ChaosEngineerService,
  ChaosEngineerConfig,
} from './services/chaos-engineer';
import {
  LoadTesterService,
  LoadTesterConfig,
} from './services/load-tester';
import {
  PerformanceProfilerService,
  PerformanceProfilerConfig,
} from './services/performance-profiler';

/**
 * Plugin configuration options
 */
export interface ChaosResiliencePluginConfig {
  coordinator?: Partial<CoordinatorConfig>;
  chaosEngineer?: Partial<ChaosEngineerConfig>;
  loadTester?: Partial<LoadTesterConfig>;
  performanceProfiler?: Partial<PerformanceProfilerConfig>;
}

/**
 * Combined API for chaos and resilience testing
 */
export interface ChaosResilienceAPI
  extends IChaosResilienceCoordinator,
    IChaosEngineeringService,
    ILoadTestingService,
    IResilienceTestingService {}

/**
 * Extended API with internal access
 */
export interface ChaosResilienceExtendedAPI extends ChaosResilienceAPI {
  /** Get the internal coordinator */
  getCoordinator(): IChaosResilienceCoordinatorExtended;

  /** Get the chaos engineer service */
  getChaosEngineer(): IChaosEngineeringService;

  /** Get the load tester service */
  getLoadTester(): ILoadTestingService;

  /** Get the performance profiler service */
  getPerformanceProfiler(): IResilienceTestingService;
}

/**
 * Chaos & Resilience Domain Plugin
 * Provides chaos engineering and resilience testing capabilities
 */
export class ChaosResiliencePlugin extends BaseDomainPlugin {
  private coordinator: IChaosResilienceCoordinatorExtended | null = null;
  private chaosEngineer: IChaosEngineeringService | null = null;
  private loadTester: ILoadTestingService | null = null;
  private performanceProfiler: IResilienceTestingService | null = null;
  private readonly pluginConfig: ChaosResiliencePluginConfig;

  constructor(
    eventBus: EventBus,
    memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: ChaosResiliencePluginConfig = {}
  ) {
    super(eventBus, memory);
    this.pluginConfig = config;
  }

  // ============================================================================
  // DomainPlugin Interface Implementation
  // ============================================================================

  get name(): DomainName {
    return 'chaos-resilience';
  }

  get version(): string {
    return '1.0.0';
  }

  get dependencies(): DomainName[] {
    // Chaos resilience can optionally use quality assessment for deployment triggers
    return [];
  }

  /**
   * Get the domain's public API
   */
  getAPI<T>(): T {
    const api: ChaosResilienceExtendedAPI = {
      // Coordinator API
      runChaosSuite: this.runChaosSuite.bind(this),
      runLoadTestSuite: this.runLoadTestSuite.bind(this),
      assessResilience: this.assessResilience.bind(this),
      generateExperiments: this.generateExperiments.bind(this),
      getResilienceDashboard: this.getResilienceDashboard.bind(this),

      // Chaos Engineering API
      createExperiment: this.createExperiment.bind(this),
      runExperiment: this.runExperiment.bind(this),
      abortExperiment: this.abortExperiment.bind(this),
      verifySteadyState: this.verifySteadyState.bind(this),
      injectFault: this.injectFault.bind(this),
      removeFault: this.removeFault.bind(this),

      // Load Testing API
      createTest: this.createTest.bind(this),
      runTest: this.runTest.bind(this),
      stopTest: this.stopTest.bind(this),
      getRealtimeMetrics: this.getRealtimeMetrics.bind(this),
      generateFromTraffic: this.generateFromTraffic.bind(this),

      // Resilience Testing API
      testRecovery: this.testRecovery.bind(this),
      testFailover: this.testFailover.bind(this),
      testCircuitBreaker: this.testCircuitBreaker.bind(this),
      testRateLimiting: this.testRateLimiting.bind(this),

      // RL-enhanced methods
      selectChaosStrategy: this.coordinator!.selectChaosStrategy.bind(this.coordinator),
      runStrategicChaosSuite: this.coordinator!.runStrategicChaosSuite.bind(this.coordinator),

      // Internal access methods
      getCoordinator: () => this.coordinator!,
      getChaosEngineer: () => this.chaosEngineer!,
      getLoadTester: () => this.loadTester!,
      getPerformanceProfiler: () => this.performanceProfiler!,
    };

    return api as T;
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  protected async onInitialize(): Promise<void> {
    // Create services
    this.chaosEngineer = new ChaosEngineerService(
      this.memory,
      this.pluginConfig.chaosEngineer
    );

    this.loadTester = new LoadTesterService(
      this.memory,
      this.pluginConfig.loadTester
    );

    this.performanceProfiler = new PerformanceProfilerService(
      this.memory,
      this.pluginConfig.performanceProfiler
    );

    // Create coordinator
    this.coordinator = new ChaosResilienceCoordinator(
      this.eventBus,
      this.memory,
      this.agentCoordinator,
      this.pluginConfig.coordinator
    );

    // Initialize coordinator
    await this.coordinator.initialize();

    // Update health status
    this.updateHealth({
      status: 'healthy',
      agents: { total: 0, active: 0, idle: 0, failed: 0 },
      lastActivity: new Date(),
      errors: [],
    });
  }

  protected async onDispose(): Promise<void> {
    if (this.coordinator) {
      await this.coordinator.dispose();
    }

    this.coordinator = null;
    this.chaosEngineer = null;
    this.loadTester = null;
    this.performanceProfiler = null;
  }

  protected subscribeToEvents(): void {
    // Subscribe to deployment events for automated chaos testing
    this.eventBus.subscribe(
      'quality-assessment.DeploymentApproved',
      this.handleDeploymentApproved.bind(this)
    );

    // Subscribe to test execution events for load testing correlation
    this.eventBus.subscribe(
      'test-execution.TestRunCompleted',
      this.handleTestRunCompleted.bind(this)
    );

    // Subscribe to security events for resilience testing triggers
    this.eventBus.subscribe(
      'security-compliance.VulnerabilityDetected',
      this.handleVulnerabilityDetected.bind(this)
    );
  }

  protected async onEvent(event: DomainEvent): Promise<void> {
    // Track activity
    this.updateHealth({
      lastActivity: new Date(),
    });

    // Route to appropriate handler based on event type
    switch (event.type) {
      case 'quality-assessment.DeploymentApproved':
        await this.handleDeploymentApproved(event);
        break;
      case 'test-execution.TestRunCompleted':
        await this.handleTestRunCompleted(event);
        break;
      case 'security-compliance.VulnerabilityDetected':
        await this.handleVulnerabilityDetected(event);
        break;
      default:
        // No specific handling needed
        break;
    }
  }

  // ============================================================================
  // Coordinator API Implementation
  // ============================================================================

  private async runChaosSuite(
    experimentIds: string[]
  ): Promise<Result<ChaosSuiteReport, Error>> {
    this.ensureInitialized();
    try {
      const result = await this.coordinator!.runChaosSuite(experimentIds);
      if (result.success) {
        this.trackSuccessfulOperation('chaos-suite');
      } else {
        this.trackFailedOperation(result.error);
      }
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async runLoadTestSuite(
    testIds: string[]
  ): Promise<Result<LoadTestSuiteReport, Error>> {
    this.ensureInitialized();
    try {
      const result = await this.coordinator!.runLoadTestSuite(testIds);
      if (result.success) {
        this.trackSuccessfulOperation('load-suite');
      } else {
        this.trackFailedOperation(result.error);
      }
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async assessResilience(
    services: string[]
  ): Promise<Result<ResilienceAssessment, Error>> {
    this.ensureInitialized();
    try {
      return await this.coordinator!.assessResilience(services);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async generateExperiments(
    architecture: ServiceArchitecture
  ): Promise<Result<ChaosExperiment[], Error>> {
    this.ensureInitialized();
    try {
      return await this.coordinator!.generateExperiments(architecture);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async getResilienceDashboard(): Promise<Result<ResilienceDashboard, Error>> {
    this.ensureInitialized();
    try {
      return await this.coordinator!.getResilienceDashboard();
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Chaos Engineering API Implementation
  // ============================================================================

  private async createExperiment(
    experiment: ChaosExperiment
  ): Promise<Result<string, Error>> {
    this.ensureInitialized();
    try {
      return await this.chaosEngineer!.createExperiment(experiment);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async runExperiment(
    experimentId: string
  ): Promise<Result<ExperimentResult, Error>> {
    this.ensureInitialized();
    try {
      const result = await this.chaosEngineer!.runExperiment(experimentId);
      if (result.success) {
        await this.publishExperimentEvent(result.value);
      }
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async abortExperiment(
    experimentId: string,
    reason: string
  ): Promise<Result<void, Error>> {
    this.ensureInitialized();
    try {
      return await this.chaosEngineer!.abortExperiment(experimentId, reason);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async verifySteadyState(
    definition: SteadyStateDefinition
  ): Promise<Result<boolean, Error>> {
    this.ensureInitialized();
    try {
      return await this.chaosEngineer!.verifySteadyState(definition);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async injectFault(fault: FaultInjection): Promise<Result<FaultResult, Error>> {
    this.ensureInitialized();
    try {
      return await this.chaosEngineer!.injectFault(fault);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async removeFault(faultId: string): Promise<Result<void, Error>> {
    this.ensureInitialized();
    try {
      return await this.chaosEngineer!.removeFault(faultId);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Load Testing API Implementation
  // ============================================================================

  private async createTest(test: LoadTest): Promise<Result<string, Error>> {
    this.ensureInitialized();
    try {
      return await this.loadTester!.createTest(test);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async runTest(testId: string): Promise<Result<LoadTestResult, Error>> {
    this.ensureInitialized();
    try {
      const result = await this.loadTester!.runTest(testId);
      if (result.success) {
        await this.publishLoadTestEvent(result.value);
      }
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async stopTest(testId: string): Promise<Result<LoadTestResult, Error>> {
    this.ensureInitialized();
    try {
      return await this.loadTester!.stopTest(testId);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async getRealtimeMetrics(
    testId: string
  ): Promise<Result<TimelinePoint, Error>> {
    this.ensureInitialized();
    try {
      return await this.loadTester!.getRealtimeMetrics(testId);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async generateFromTraffic(
    trafficSample: TrafficSample,
    multiplier: number
  ): Promise<Result<LoadTest, Error>> {
    this.ensureInitialized();
    try {
      return await this.loadTester!.generateFromTraffic(trafficSample, multiplier);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Resilience Testing API Implementation
  // ============================================================================

  private async testRecovery(
    service: string,
    faultType: FaultType,
    expectedRecoveryTime: number
  ): Promise<Result<RecoveryTestResult, Error>> {
    this.ensureInitialized();
    try {
      return await this.performanceProfiler!.testRecovery(
        service,
        faultType,
        expectedRecoveryTime
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async testFailover(
    primaryService: string,
    secondaryService: string
  ): Promise<Result<FailoverTestResult, Error>> {
    this.ensureInitialized();
    try {
      return await this.performanceProfiler!.testFailover(
        primaryService,
        secondaryService
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async testCircuitBreaker(
    service: string,
    options?: CircuitBreakerTestOptions
  ): Promise<Result<CircuitBreakerTestResult, Error>> {
    this.ensureInitialized();
    try {
      return await this.performanceProfiler!.testCircuitBreaker(service, options);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async testRateLimiting(
    service: string,
    expectedLimit: number
  ): Promise<Result<RateLimitTestResult, Error>> {
    this.ensureInitialized();
    try {
      return await this.performanceProfiler!.testRateLimiting(service, expectedLimit);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private async handleDeploymentApproved(event: DomainEvent): Promise<void> {
    // Could trigger automated resilience assessment after deployment
    const payload = event.payload as { services?: string[] };

    if (payload.services && payload.services.length > 0) {
      await this.memory.set(
        `chaos-resilience:pending-assessment:${event.id}`,
        {
          services: payload.services,
          triggeredAt: new Date(),
          source: 'deployment-approved',
        },
        { namespace: 'chaos-resilience', ttl: 3600 }
      );
    }
  }

  private async handleTestRunCompleted(event: DomainEvent): Promise<void> {
    // Track test results for load testing baseline
    const payload = event.payload as {
      runId: string;
      duration: number;
      passed: number;
      failed: number;
    };

    await this.memory.set(
      `chaos-resilience:test-baseline:${payload.runId}`,
      {
        duration: payload.duration,
        successRate: payload.passed / (payload.passed + payload.failed),
        timestamp: new Date(),
      },
      { namespace: 'chaos-resilience', ttl: 86400 }
    );
  }

  private async handleVulnerabilityDetected(event: DomainEvent): Promise<void> {
    // Queue security-focused resilience testing
    const payload = event.payload as {
      vulnId: string;
      severity: string;
      file: string;
    };

    if (payload.severity === 'critical' || payload.severity === 'high') {
      await this.memory.set(
        `chaos-resilience:security-tests:${payload.vulnId}`,
        {
          vulnerabilityId: payload.vulnId,
          severity: payload.severity,
          file: payload.file,
          triggeredAt: new Date(),
        },
        { namespace: 'chaos-resilience', ttl: 86400 }
      );
    }
  }

  // ============================================================================
  // Event Publishing
  // ============================================================================

  private async publishExperimentEvent(result: ExperimentResult): Promise<void> {
    await this.publishEvent('chaos-resilience.ExperimentCompleted', {
      experimentId: result.experimentId,
      status: result.status,
      hypothesisValidated: result.hypothesisValidated,
      steadyStateVerified: result.steadyStateVerified,
      faultCount: result.faultResults.length,
      incidentCount: result.incidents.length,
      duration: result.endTime
        ? result.endTime.getTime() - result.startTime.getTime()
        : 0,
    });
  }

  private async publishLoadTestEvent(result: LoadTestResult): Promise<void> {
    await this.publishEvent('chaos-resilience.LoadTestCompleted', {
      testId: result.testId,
      status: result.status,
      duration: result.duration,
      totalRequests: result.summary.totalRequests,
      successRate:
        result.summary.totalRequests > 0
          ? (result.summary.successfulRequests / result.summary.totalRequests) * 100
          : 0,
      p95ResponseTime: result.summary.p95ResponseTime,
      errorRate: result.summary.errorRate,
      assertionsPassed: result.assertionResults.filter((a) => a.passed).length,
      assertionsFailed: result.assertionResults.filter((a) => !a.passed).length,
    });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('ChaosResiliencePlugin is not initialized');
    }

    if (
      !this.coordinator ||
      !this.chaosEngineer ||
      !this.loadTester ||
      !this.performanceProfiler
    ) {
      throw new Error('ChaosResiliencePlugin services are not available');
    }
  }

  private handleError<T>(error: unknown): Result<T, Error> {
    const err = error instanceof Error ? error : new Error(String(error));

    // Track error
    const currentHealth = this.getHealth();
    this.updateHealth({
      errors: [...currentHealth.errors.slice(-9), err.message],
      status: currentHealth.errors.length >= 5 ? 'degraded' : currentHealth.status,
    });

    return { success: false, error: err };
  }

  private trackSuccessfulOperation(_type: string): void {
    const health = this.getHealth();
    this.updateHealth({
      agents: {
        ...health.agents,
        total: health.agents.total + 1,
        idle: health.agents.idle + 1,
      },
      lastActivity: new Date(),
    });
  }

  private trackFailedOperation(error: Error): void {
    const health = this.getHealth();
    this.updateHealth({
      agents: {
        ...health.agents,
        failed: health.agents.failed + 1,
      },
      errors: [...health.errors.slice(-9), error.message],
    });
  }
}

/**
 * Factory function to create a ChaosResiliencePlugin
 */
export function createChaosResiliencePlugin(
  eventBus: EventBus,
  memory: MemoryBackend,
  agentCoordinator: AgentCoordinator,
  config?: ChaosResiliencePluginConfig
): ChaosResiliencePlugin {
  return new ChaosResiliencePlugin(eventBus, memory, agentCoordinator, config);
}
