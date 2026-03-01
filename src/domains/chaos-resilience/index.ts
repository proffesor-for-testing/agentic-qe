/**
 * Agentic QE v3 - Chaos & Resilience Domain
 * Fault injection, chaos engineering, and resilience testing
 *
 * This module exports the public API for the chaos-resilience domain.
 */

// ============================================================================
// Domain Plugin (Primary Export)
// ============================================================================

export {
  ChaosResiliencePlugin,
  createChaosResiliencePlugin,
  type ChaosResiliencePluginConfig,
  type ChaosResilienceAPI,
  type ChaosResilienceExtendedAPI,
} from './plugin';

// ============================================================================
// Coordinator
// ============================================================================

export {
  ChaosResilienceCoordinator,
  type IChaosResilienceCoordinatorExtended,
  type WorkflowStatus,
  type CoordinatorConfig,
} from './coordinator';

// ============================================================================
// Services
// ============================================================================

export {
  ChaosEngineerService,
  type ChaosEngineerConfig,
} from './services/chaos-engineer';

export {
  LoadTesterService,
  type LoadTesterConfig,
} from './services/load-tester';

export {
  PerformanceProfilerService,
  type PerformanceProfilerConfig,
} from './services/performance-profiler';

// ============================================================================
// Interfaces (Types Only)
// ============================================================================

export type {
  // Chaos Experiment Types
  ChaosExperiment,
  Hypothesis,
  MetricExpectation,
  Tolerance,
  SteadyStateDefinition,
  SteadyStateProbe,
  FaultInjection,
  FaultType,
  FaultTarget,
  FaultParameters,
  BlastRadius,
  RollbackPlan,
  RollbackTrigger,
  RollbackStep,
  ExperimentSchedule,

  // Experiment Result Types
  ExperimentResult,
  ExperimentStatus,
  FaultResult,
  MetricSnapshot,
  Incident,

  // Load Test Types
  LoadTest,
  LoadTestType,
  LoadTestTarget,
  LoadProfile,
  VirtualUserConfig,
  LoadScenario,
  LoadStep,
  LoadAssertion,

  // Load Test Result Types
  LoadTestResult,
  LoadTestSummary,
  TimelinePoint,
  LoadTestError,
  AssertionResult,

  // Traffic Sample Types
  TrafficSample,
  SampledRequest,

  // Resilience Testing Types
  RecoveryTestResult,
  RecoveryEvent,
  FailoverTestResult,
  FailoverStep,
  CircuitBreakerTestOptions,
  CircuitBreakerTestResult,
  RateLimitTestResult,
  RateLimitResponse,

  // Service Architecture Types
  ServiceArchitecture,
  ServiceDefinition,
  ServiceDependency,

  // Report Types
  ChaosSuiteReport,
  LoadTestSuiteReport,
  PerformanceBottleneck,
  ResilienceAssessment,
  ResilienceWeakness,
  ResilienceRecommendation,
  ResilienceDashboard,
  ResilienceIssue,

  // Service Interfaces
  IChaosEngineeringService,
  ILoadTestingService,
  IResilienceTestingService,
  IChaosResilienceCoordinator,

  // Repository Interfaces
  IChaosExperimentRepository,
  IExperimentResultRepository,
  ILoadTestRepository,
  ILoadTestResultRepository,

  // Event Types
  ChaosExperimentStartedEvent,
  ChaosExperimentCompletedEvent,
  FaultInjectedEvent,
  LoadTestCompletedEvent,
  ResilienceIssueDetectedEvent,
} from './interfaces';
