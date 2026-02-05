# Chaos & Resilience Testing Domain

## Bounded Context Overview

**Domain**: Chaos & Resilience Testing
**Responsibility**: Chaos engineering, fault injection, performance/load testing
**Location**: `src/domains/chaos-resilience/`

The Chaos & Resilience Testing domain validates system reliability through controlled chaos experiments, fault injection, load testing, and resilience assessment.

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Chaos Experiment** | Controlled fault injection to test resilience |
| **Hypothesis** | Expected system behavior under fault |
| **Steady State** | Normal system operating condition |
| **Blast Radius** | Scope of fault impact |
| **Rollback** | Automatic recovery from failed experiment |
| **Load Test** | Performance testing under load |
| **Virtual User** | Simulated user generating load |
| **Circuit Breaker** | Pattern that prevents cascade failures |

## Domain Model

### Aggregates

#### ChaosExperiment (Aggregate Root)
Complete chaos experiment definition.

```typescript
interface ChaosExperiment {
  id: string;
  name: string;
  description: string;
  hypothesis: Hypothesis;
  steadyState: SteadyStateDefinition;
  faults: FaultInjection[];
  blastRadius: BlastRadius;
  rollbackPlan: RollbackPlan;
  schedule?: ExperimentSchedule;
}
```

#### LoadTest (Aggregate Root)
Load test configuration.

```typescript
interface LoadTest {
  id: string;
  name: string;
  type: LoadTestType;
  target: LoadTestTarget;
  profile: LoadProfile;
  scenarios: LoadScenario[];
  assertions: LoadAssertion[];
}
```

### Entities

#### FaultInjection
Individual fault to inject.

```typescript
interface FaultInjection {
  id: string;
  type: FaultType;
  target: FaultTarget;
  parameters: FaultParameters;
  duration: number;
  probability?: number;
}
```

#### ExperimentResult
Result of chaos experiment execution.

```typescript
interface ExperimentResult {
  experimentId: string;
  status: ExperimentStatus;
  startTime: Date;
  endTime?: Date;
  hypothesisValidated: boolean;
  steadyStateVerified: boolean;
  faultResults: FaultResult[];
  metrics: MetricSnapshot[];
  incidents: Incident[];
}
```

#### LoadTestResult
Result of load test execution.

```typescript
interface LoadTestResult {
  testId: string;
  status: 'completed' | 'failed' | 'aborted';
  duration: number;
  summary: LoadTestSummary;
  timeline: TimelinePoint[];
  errors: LoadTestError[];
  assertionResults: AssertionResult[];
}
```

### Value Objects

#### FaultType
```typescript
type FaultType =
  | 'latency'
  | 'error'
  | 'timeout'
  | 'packet-loss'
  | 'cpu-stress'
  | 'memory-stress'
  | 'disk-stress'
  | 'network-partition'
  | 'dns-failure'
  | 'process-kill';
```

#### LoadTestType
```typescript
type LoadTestType = 'load' | 'stress' | 'spike' | 'soak' | 'breakpoint';
```

#### Hypothesis
Expected behavior under fault.

```typescript
interface Hypothesis {
  readonly statement: string;
  readonly metrics: MetricExpectation[];
  readonly tolerances: Tolerance[];
}
```

#### SteadyStateProbe
Probe to verify steady state.

```typescript
interface SteadyStateProbe {
  readonly name: string;
  readonly type: 'http' | 'tcp' | 'command' | 'metric';
  readonly target: string;
  readonly expected: unknown;
  readonly timeout: number;
  readonly expectedStatus?: number;
  readonly expectedOutput?: string;
  readonly threshold?: { operator: 'lt' | 'gt' | 'lte' | 'gte' | 'eq'; value: number };
}
```

#### BlastRadius
Scope of fault impact.

```typescript
interface BlastRadius {
  readonly scope: 'single' | 'subset' | 'all';
  readonly percentage?: number;
  readonly maxAffected?: number;
  readonly excludeProduction?: boolean;
}
```

#### LoadTestSummary
Aggregate load test metrics.

```typescript
interface LoadTestSummary {
  readonly totalRequests: number;
  readonly successfulRequests: number;
  readonly failedRequests: number;
  readonly requestsPerSecond: number;
  readonly avgResponseTime: number;
  readonly p50ResponseTime: number;
  readonly p95ResponseTime: number;
  readonly p99ResponseTime: number;
  readonly maxResponseTime: number;
  readonly errorRate: number;
}
```

## Domain Services

### IChaosResilienceCoordinator
Primary coordinator for the domain.

```typescript
interface IChaosResilienceCoordinator {
  runChaosSuite(experimentIds: string[]): Promise<Result<ChaosSuiteReport>>;
  runLoadTestSuite(testIds: string[]): Promise<Result<LoadTestSuiteReport>>;
  assessResilience(services: string[]): Promise<Result<ResilienceAssessment>>;
  generateExperiments(architecture: ServiceArchitecture): Promise<Result<ChaosExperiment[]>>;
  getResilienceDashboard(): Promise<Result<ResilienceDashboard>>;
  selectChaosStrategy(services: ServiceDefinition[], context: ChaosStrategyContext): Promise<Result<ChaosStrategyResult>>;
  runStrategicChaosSuite(services: ServiceDefinition[], context: ChaosStrategyContext): Promise<Result<ChaosSuiteReport>>;
}
```

### IChaosEngineeringService
Chaos experiment execution.

```typescript
interface IChaosEngineeringService {
  createExperiment(experiment: ChaosExperiment): Promise<Result<string>>;
  runExperiment(experimentId: string): Promise<Result<ExperimentResult>>;
  abortExperiment(experimentId: string, reason: string): Promise<Result<void>>;
  verifySteadyState(definition: SteadyStateDefinition): Promise<Result<boolean>>;
  injectFault(fault: FaultInjection): Promise<Result<FaultResult>>;
  removeFault(faultId: string): Promise<Result<void>>;
}
```

### ILoadTestingService
Load test execution.

```typescript
interface ILoadTestingService {
  createTest(test: LoadTest): Promise<Result<string>>;
  runTest(testId: string): Promise<Result<LoadTestResult>>;
  stopTest(testId: string): Promise<Result<LoadTestResult>>;
  getRealtimeMetrics(testId: string): Promise<Result<TimelinePoint>>;
  generateFromTraffic(trafficSample: TrafficSample, multiplier: number): Promise<Result<LoadTest>>;
}
```

### IResilienceTestingService
Resilience pattern testing.

```typescript
interface IResilienceTestingService {
  testRecovery(service: string, faultType: FaultType, expectedRecoveryTime: number): Promise<Result<RecoveryTestResult>>;
  testFailover(primaryService: string, secondaryService: string): Promise<Result<FailoverTestResult>>;
  testCircuitBreaker(service: string, options?: CircuitBreakerTestOptions): Promise<Result<CircuitBreakerTestResult>>;
  testRateLimiting(service: string, expectedLimit: number): Promise<Result<RateLimitTestResult>>;
}
```

## PolicyGradient RL Integration

The domain uses PolicyGradient reinforcement learning for chaos strategy selection:

```typescript
interface ChaosStrategyContext {
  readonly environment: string;
  readonly riskTolerance: number;
  readonly availableCapacity: number;
}

interface ChaosStrategyResult {
  readonly strategy: string;
  readonly selectedExperiments: ChaosExperiment[];
  readonly confidence: number;
  readonly reasoning: string;
}
```

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `ChaosExperimentStartedEvent` | Experiment starts | `{ experimentId, name, faultTypes, blastRadius }` |
| `ChaosExperimentCompletedEvent` | Experiment ends | `{ experimentId, status, hypothesisValidated, incidentCount }` |
| `FaultInjectedEvent` | Fault injected | `{ experimentId, faultId, faultType, target }` |
| `LoadTestCompletedEvent` | Load test done | `{ testId, testType, summary, passed }` |
| `ResilienceIssueDetectedEvent` | Issue found | `{ issueSource, issue, severity }` |

## Repositories

```typescript
interface IChaosExperimentRepository {
  findById(id: string): Promise<ChaosExperiment | null>;
  findByName(name: string): Promise<ChaosExperiment[]>;
  findScheduled(): Promise<ChaosExperiment[]>;
  save(experiment: ChaosExperiment): Promise<void>;
  delete(id: string): Promise<void>;
}

interface IExperimentResultRepository {
  findByExperimentId(experimentId: string): Promise<ExperimentResult[]>;
  findLatest(experimentId: string): Promise<ExperimentResult | null>;
  findByDateRange(startDate: Date, endDate: Date): Promise<ExperimentResult[]>;
  save(result: ExperimentResult): Promise<void>;
}

interface ILoadTestRepository {
  findById(id: string): Promise<LoadTest | null>;
  findByType(type: LoadTestType): Promise<LoadTest[]>;
  save(test: LoadTest): Promise<void>;
}
```

## Context Integration

### Upstream Dependencies
- Chaos tools (Chaos Monkey, Litmus, Gremlin)
- Load testing tools (k6, Artillery, Locust)
- Infrastructure APIs (Kubernetes, Docker)

### Downstream Consumers
- **Quality Assessment**: Resilience metrics for gates
- **Defect Intelligence**: Failure pattern analysis
- SRE/DevOps teams: Reliability dashboards

### Anti-Corruption Layer
The domain abstracts different chaos and load testing tools through service interfaces.

## Task Handlers

| Task Type | Handler | Description |
|-----------|---------|-------------|
| `run-chaos-suite` | `runChaosSuite()` | Execute chaos experiments |
| `run-load-suite` | `runLoadTestSuite()` | Execute load tests |
| `assess-resilience` | `assessResilience()` | Full resilience assessment |
| `generate-experiments` | `generateExperiments()` | Generate from architecture |
| `strategic-chaos` | `runStrategicChaosSuite()` | RL-optimized chaos |

## Configuration Constants

```typescript
const CHAOS_CONSTANTS = {
  CHUNK_SIZE_BYTES: 1024 * 1024,    // 1MB for memory tests
  SPIKE_INTERVAL_MS: 30000,          // 30 seconds between spikes
  SPIKE_DURATION_MS: 5000,           // 5 second spike duration
};
```

## Resilience Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| **MTTR** | Mean Time To Recovery | < 5 minutes |
| **MTBF** | Mean Time Between Failures | > 30 days |
| **Error Budget** | Allowed failure percentage | > 99.9% uptime |
| **Recovery Time** | Time to restore service | < 1 minute |
| **Failover Time** | Time to switch to backup | < 30 seconds |

## Sample Chaos Experiment

```typescript
const networkPartitionExperiment: ChaosExperiment = {
  id: 'exp-001',
  name: 'Database Network Partition',
  description: 'Test service behavior when database is unreachable',
  hypothesis: {
    statement: 'Service returns cached data when database is unavailable',
    metrics: [
      { metric: 'error_rate', operator: 'lt', value: 5 },
      { metric: 'response_time_p99', operator: 'lt', value: 500 },
    ],
    tolerances: [
      { metric: 'cache_hit_rate', maxDeviation: 10, unit: 'percent' },
    ],
  },
  steadyState: {
    description: 'Service responds with p99 < 100ms',
    probes: [
      { name: 'health-check', type: 'http', target: '/health', expected: 200, timeout: 5000 },
    ],
  },
  faults: [
    {
      id: 'fault-001',
      type: 'network-partition',
      target: { type: 'service', selector: 'database', namespace: 'production' },
      parameters: {},
      duration: 60000,
    },
  ],
  blastRadius: { scope: 'single', excludeProduction: true },
  rollbackPlan: {
    automatic: true,
    triggerConditions: [{ type: 'error-rate', condition: 'error_rate > 10' }],
    steps: [{ order: 1, action: 'remove-fault', target: 'fault-001' }],
  },
};
```

## ADR References

- **ADR-047**: MinCut topology for distributed chaos
