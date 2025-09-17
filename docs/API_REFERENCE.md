# API Reference

## Overview

The Agentic QE Framework provides a comprehensive TypeScript API for building AI-powered quality engineering solutions. This reference covers all classes, interfaces, methods, and configuration options available in the enhanced framework.

## 📚 Core Classes

### QEFramework

The main framework class that orchestrates all quality engineering operations.

```typescript
class QEFramework {
  constructor(config?: QEConfig)

  // Lifecycle methods
  async initialize(): Promise<void>
  async shutdown(): Promise<void>

  // Session management
  async createSession(config: SessionConfig): Promise<string>
  async getSession(sessionId: string): Promise<QESession>
  async endSession(sessionId: string): Promise<SessionResult>

  // Test execution
  async executeTestSuite(sessionId: string, testSuite: TestSuite, options?: ExecutionOptions): Promise<TestResult>
  async executeTest(sessionId: string, test: TestCase, options?: ExecutionOptions): Promise<TestResult>

  // Agent management
  async spawnAgent(agentType: string, config?: AgentConfig): Promise<QEAgent>
  async spawnAgentSwarm(agents: AgentConfig[], coordinationConfig?: SwarmConfig): Promise<QESwarm>

  // Performance monitoring
  getPerformanceMetrics(): PerformanceMetrics
  async generatePerformanceReport(options?: ReportOptions): Promise<PerformanceReport>
}
```

#### Usage Example

```typescript
import { QEFramework, TestSuite } from 'agentic-qe';

const framework = new QEFramework({
  performance: {
    enableAsyncQueue: true,
    enableBatchProcessor: true,
    maxConcurrent: 10
  },
  memory: {
    distributed: true,
    encryption: true
  }
});

await framework.initialize();

const sessionId = await framework.createSession({
  name: 'API Integration Tests',
  environment: 'staging',
  strategy: 'risk-based'
});

const testSuite: TestSuite = {
  id: 'api-integration',
  name: 'API Integration Test Suite',
  tests: [/* ... */],
  configuration: {
    parallel: true,
    timeout: 30000
  }
};

const result = await framework.executeTestSuite(sessionId, testSuite, {
  agentTypes: ['functional-tester', 'security-scanner'],
  parallel: true
});
```

### AsyncOperationQueue

High-performance operation queue for batched parallel execution.

```typescript
class AsyncOperationQueue<T = any> {
  constructor(config: QueueConfig)

  // Queue operations
  async add(operationType: string, payload: T, options?: OperationOptions): Promise<string>
  async addBatch(operations: QueueOperation<T>[]): Promise<string[]>

  // Processing
  async process(): Promise<ProcessResult[]>
  async processWithCallback(callback: ProgressCallback): Promise<ProcessResult[]>

  // Management
  async pause(): Promise<void>
  async resume(): Promise<void>
  async clear(): Promise<void>

  // Monitoring
  getStatus(): QueueStatus
  getMetrics(): QueueMetrics

  // Events
  on(event: QueueEvent, listener: EventListener): void
  off(event: QueueEvent, listener: EventListener): void
}
```

#### Configuration

```typescript
interface QueueConfig {
  maxConcurrent: number;          // Maximum concurrent operations
  batchSize: number;              // Operations per batch
  timeout: number;                // Operation timeout (ms)
  retryAttempts: number;          // Retry attempts for failed operations
  retryDelay: number;             // Delay between retries (ms)
  priorityLevels: number;         // Number of priority levels
  errorThreshold: number;         // Error threshold before queue pause
}
```

#### Usage Example

```typescript
import { AsyncOperationQueue } from 'agentic-qe';

const queue = new AsyncOperationQueue({
  maxConcurrent: 8,
  batchSize: 5,
  timeout: 30000,
  retryAttempts: 3
});

// Add operations
await queue.add('test-execution', {
  testFile: './tests/api.test.js',
  environment: 'staging'
}, { priority: 'high' });

// Process queue
const results = await queue.process();

// Monitor progress
queue.on('progress', (progress) => {
  console.log(`Progress: ${progress.completed}/${progress.total}`);
});
```

### BatchProcessor

Efficient bulk operation processor with intelligent chunking.

```typescript
class BatchProcessor<T = any> {
  constructor(config: BatchConfig)

  // Processing methods
  async processItems(items: T[], operation: BatchOperation<T>, options?: BatchOptions): Promise<ProcessResult<T>[]>
  async processFiles(patterns: string[], operation: FileOperation, options?: FileOptions): Promise<FileResult[]>
  async processWithCheckpoints(items: T[], operation: BatchOperation<T>, checkpointConfig: CheckpointConfig): Promise<ProcessResult<T>[]>

  // Progress tracking
  on(event: 'progress' | 'checkpoint' | 'error', listener: EventListener): void

  // State management
  async saveCheckpoint(checkpointId: string): Promise<void>
  async loadCheckpoint(checkpointId: string): Promise<BatchState>
}
```

#### Usage Example

```typescript
import { BatchProcessor } from 'agentic-qe';

const processor = new BatchProcessor({
  chunkSize: 20,
  concurrency: 5,
  checkpointInterval: 100
});

// Process test files
const results = await processor.processFiles([
  'tests/**/*.test.js'
], {
  operation: 'analyze-coverage',
  options: { includeSource: true }
});

// Process with checkpoints
await processor.processWithCheckpoints(testCases, async (chunk) => {
  return await executeTestChunk(chunk);
}, {
  checkpointId: 'test-execution-001',
  interval: 50,
  autoSave: true
});
```

### QECoordinator

Intelligent phase-based execution coordinator.

```typescript
class QECoordinator {
  constructor(config: CoordinatorConfig)

  // Execution coordination
  async execute(executionPlan: ExecutionPlan): Promise<ExecutionResult>
  async executePhase(phase: ExecutionPhase, context: ExecutionContext): Promise<PhaseResult>

  // Phase management
  async transitionToPhase(targetPhase: string, criteria?: TransitionCriteria): Promise<void>
  getCurrentPhase(): ExecutionPhase
  getPhaseHistory(): PhaseHistory[]

  // Resource management
  async allocateResources(requirements: ResourceRequirements): Promise<ResourceAllocation>
  async optimizeResourceUsage(): Promise<OptimizationResult>

  // Quality gates
  async evaluateQualityGates(context: ExecutionContext): Promise<QualityGateResult>
  async enforceQualityStandards(results: TestResult[]): Promise<EnforcementResult>
}
```

#### Usage Example

```typescript
import { QECoordinator } from 'agentic-qe';

const coordinator = new QECoordinator({
  phases: ['discovery', 'design', 'execution', 'analysis', 'reporting'],
  transitionCriteria: {
    discovery: { minRequirements: 5, maxTime: '2h' },
    execution: { minCoverage: 80, maxTime: '8h' }
  },
  qualityGates: {
    coverage: { threshold: 85, enforce: true },
    reliability: { threshold: 95, enforce: true }
  }
});

await coordinator.execute({
  testSuite: 'integration-tests',
  environment: 'production',
  strategy: 'comprehensive'
});
```

## 🧠 Neural AI Classes

### NeuralTrainer

Machine learning trainer for pattern recognition and prediction.

```typescript
class NeuralTrainer {
  constructor(config: NeuralConfig)

  // Training
  async trainPatterns(trainingData: TrainingData, options?: TrainingOptions): Promise<TrainingResult>
  async trainFromHistory(timeRange: string, filters?: HistoryFilters): Promise<TrainingResult>

  // Prediction
  async predict(input: PredictionInput): Promise<PredictionResult>
  async predictRisk(context: RiskContext): Promise<RiskPrediction>
  async predictPerformance(scenario: PerformanceScenario): Promise<PerformancePredicton>

  // Model management
  async saveModel(modelId: string, path: string): Promise<void>
  async loadModel(path: string): Promise<string>
  async getModelMetrics(modelId: string): Promise<ModelMetrics>
}
```

#### Usage Example

```typescript
import { NeuralTrainer } from 'agentic-qe';

const trainer = new NeuralTrainer({
  modelType: 'pattern-recognition',
  architecture: 'transformer',
  trainingParameters: {
    epochs: 100,
    learningRate: 0.001,
    batchSize: 32
  }
});

// Train from execution history
await trainer.trainFromHistory('30days', {
  includeFailures: true,
  includePerformanceMetrics: true
});

// Get risk prediction
const riskPrediction = await trainer.predictRisk({
  changes: ['user-service', 'payment-gateway'],
  environment: 'production',
  historicalContext: true
});
```

### QualityGateManager

Automated quality gate evaluation and enforcement.

```typescript
class QualityGateManager {
  constructor(config: QualityGateConfig)

  // Gate evaluation
  async evaluate(context: EvaluationContext): Promise<QualityGateResult>
  async evaluateGate(gateId: string, metrics: QualityMetrics): Promise<GateResult>

  // Configuration
  async setThreshold(gateId: string, threshold: Threshold): Promise<void>
  async getThresholds(environment?: string): Promise<ThresholdConfig>

  // Enforcement
  async enforce(results: QualityGateResult[], policy: EnforcementPolicy): Promise<EnforcementResult>

  // Reporting
  async generateGateReport(timeRange: string): Promise<QualityGateReport>
  async getGateHistory(gateId: string, timeRange: string): Promise<GateHistory[]>
}
```

#### Usage Example

```typescript
import { QualityGateManager } from 'agentic-qe';

const gateManager = new QualityGateManager({
  gates: {
    coverage: { threshold: 85, enforce: true },
    performance: { threshold: '200ms', enforce: true },
    security: { threshold: 0, enforce: true }
  },
  enforcement: {
    blockOnFailure: true,
    notificationChannels: ['slack', 'email']
  }
});

const result = await gateManager.evaluate({
  testResults: testResults,
  coverageReport: coverageData,
  performanceMetrics: perfMetrics,
  securityScan: securityResults
});

if (!result.passed) {
  await gateManager.enforce([result], {
    action: 'block-deployment',
    notifications: true
  });
}
```

## 💾 Memory and Storage

### DistributedMemory

Enhanced memory system with distributed coordination.

```typescript
class DistributedMemory {
  constructor(config: MemoryConfig)

  // Storage operations
  async store(key: string, value: any, options?: StorageOptions): Promise<void>
  async retrieve(key: string): Promise<any>
  async remove(key: string): Promise<boolean>

  // Querying
  async query(filter: MemoryFilter): Promise<MemoryEntry[]>
  async search(pattern: string, options?: SearchOptions): Promise<SearchResult[]>

  // Coordination
  async synchronize(targetNodes?: string[]): Promise<SyncResult>
  async broadcast(event: MemoryEvent, data: any): Promise<void>

  // Management
  async cleanup(criteria?: CleanupCriteria): Promise<CleanupResult>
  async compress(targetCompression?: number): Promise<CompressionResult>
  async export(format: 'json' | 'binary', path: string): Promise<void>
}
```

#### Usage Example

```typescript
import { DistributedMemory } from 'agentic-qe';

const memory = new DistributedMemory({
  storagePath: './.claude/memory',
  encryption: true,
  compression: true,
  replication: 2,
  maxSize: '1GB'
});

// Store test context
await memory.store('session/api-tests', {
  environment: 'staging',
  configuration: testConfig,
  timestamp: new Date().toISOString()
}, {
  ttl: '7days',
  tags: ['api', 'integration'],
  replicate: true
});

// Query related data
const relatedData = await memory.query({
  tags: ['api'],
  timeRange: '24h',
  limit: 10
});
```

## 📊 Monitoring and Analytics

### PerformanceMonitor

Real-time performance monitoring and analysis.

```typescript
class PerformanceMonitor {
  constructor(config: MonitorConfig)

  // Monitoring
  async start(): Promise<void>
  async stop(): Promise<void>

  // Metrics
  getCurrentMetrics(): PerformanceMetrics
  async getHistoricalMetrics(timeRange: string): Promise<HistoricalMetrics>
  async analyzeBottlenecks(): Promise<BottleneckAnalysis>

  // Alerting
  async setAlert(metric: string, threshold: number, action: AlertAction): Promise<string>
  async removeAlert(alertId: string): Promise<boolean>

  // Reporting
  async generateReport(options: ReportOptions): Promise<PerformanceReport>
  async exportMetrics(format: 'json' | 'csv', timeRange: string): Promise<string>
}
```

#### Usage Example

```typescript
import { PerformanceMonitor } from 'agentic-qe';

const monitor = new PerformanceMonitor({
  metricsInterval: 5000,
  alerting: true,
  dashboard: {
    enabled: true,
    port: 3000
  }
});

await monitor.start();

// Set performance alerts
await monitor.setAlert('execution-time', 30000, {
  type: 'webhook',
  url: 'https://alerts.example.com/webhook'
});

await monitor.setAlert('memory-usage', 80, {
  type: 'slack',
  channel: '#alerts'
});

// Generate performance report
const report = await monitor.generateReport({
  timeRange: '24h',
  includeRecommendations: true,
  format: 'html'
});
```

## 🎯 Agent System

### QEAgent (Base Class)

Base class for all quality engineering agents.

```typescript
abstract class QEAgent {
  constructor(config: AgentConfig)

  // Lifecycle
  abstract async initialize(): Promise<void>
  abstract async execute(task: AgentTask): Promise<AgentResult>
  abstract async cleanup(): Promise<void>

  // Coordination
  async coordinate(agents: QEAgent[], task: CoordinationTask): Promise<CoordinationResult>
  async shareContext(context: AgentContext): Promise<void>
  async receiveContext(context: AgentContext): Promise<void>

  // Capabilities
  getCapabilities(): AgentCapabilities
  canHandle(task: AgentTask): boolean

  // Memory
  async remember(key: string, value: any, ttl?: string): Promise<void>
  async recall(key: string): Promise<any>
}
```

### RiskOracle

Specialized agent for risk assessment and prediction.

```typescript
class RiskOracle extends QEAgent {
  // Risk assessment
  async assessRisk(context: RiskContext): Promise<RiskAssessment>
  async predictFailures(scenario: TestScenario): Promise<FailurePrediction[]>

  // Analysis
  async analyzeChanges(changes: CodeChange[]): Promise<ChangeAnalysis>
  async assessDeploymentRisk(deployment: DeploymentContext): Promise<DeploymentRisk>

  // Recommendations
  async recommendTests(riskProfile: RiskProfile): Promise<TestRecommendation[]>
  async prioritizeTests(tests: TestCase[], riskContext: RiskContext): Promise<PrioritizedTests>
}
```

## 🔧 Configuration Types

### QEConfig

Main framework configuration interface.

```typescript
interface QEConfig {
  framework: {
    version: string;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    environment: string;
  };

  performance: {
    enableAsyncQueue: boolean;
    enableBatchProcessor: boolean;
    enableNeuralTraining: boolean;
    maxConcurrent: number;
    timeout: number;
  };

  memory: {
    distributed: boolean;
    encryption: boolean;
    compression: boolean;
    maxSize: string;
    retentionPeriod: string;
  };

  agents: {
    defaultModel: string;
    defaultTemperature: number;
    maxTokens: number;
    timeout: number;
  };

  neural: {
    enableTraining: boolean;
    modelType: 'pattern-recognition' | 'prediction' | 'optimization';
    trainingInterval: string;
    predictionThreshold: number;
  };

  monitoring: {
    enableRealTime: boolean;
    metricsInterval: number;
    alerting: boolean;
    dashboard: DashboardConfig;
  };

  quality: {
    gates: QualityGateConfig;
    thresholds: ThresholdConfig;
    enforcement: EnforcementConfig;
  };
}
```

### TestSuite

Test suite definition interface.

```typescript
interface TestSuite {
  id: string;
  name: string;
  description?: string;
  version: string;

  tests: TestCase[];

  configuration: {
    parallel: boolean;
    maxConcurrent?: number;
    timeout: number;
    retryAttempts: number;
    environment: string;
    tags: string[];
  };

  hooks?: {
    beforeAll?: HookFunction[];
    afterAll?: HookFunction[];
    beforeEach?: HookFunction[];
    afterEach?: HookFunction[];
  };

  reporting?: {
    formats: ReportFormat[];
    outputPath: string;
    includeDetails: boolean;
  };
}
```

### TestCase

Individual test case definition.

```typescript
interface TestCase {
  id: string;
  name: string;
  description?: string;
  type: 'unit' | 'integration' | 'e2e' | 'performance' | 'security';
  priority: 'low' | 'medium' | 'high' | 'critical';

  steps: TestStep[];
  expectedResults: ExpectedResult[];

  metadata: {
    tags: string[];
    requirements: string[];
    risks: string[];
    estimatedDuration: number;
  };

  configuration?: {
    timeout?: number;
    retryAttempts?: number;
    skipConditions?: SkipCondition[];
    dependencies?: string[];
  };

  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  result?: TestResult;
}
```

## 🔌 Extension Points

### Hook System

Extensible hook system for lifecycle events.

```typescript
interface Hook {
  name: string;
  events: HookEvent[];
  handler: HookHandler;
  priority: number;
  conditions?: HookCondition[];
}

interface HookEvent {
  type: 'before' | 'after' | 'on';
  target: 'test' | 'suite' | 'session' | 'agent' | 'framework';
  action: string;
}

type HookHandler = (context: HookContext) => Promise<void> | void;
```

### Plugin System

Plugin architecture for extending framework capabilities.

```typescript
interface Plugin {
  name: string;
  version: string;
  description: string;

  dependencies?: string[];

  activate(framework: QEFramework): Promise<void>;
  deactivate(): Promise<void>;

  getCapabilities(): PluginCapabilities;
  getConfiguration(): PluginConfig;
}

interface PluginCapabilities {
  agents?: AgentType[];
  hooks?: Hook[];
  commands?: Command[];
  reporters?: Reporter[];
}
```

## 📈 Result Types

### TestResult

Comprehensive test execution result.

```typescript
interface TestResult {
  testId: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';

  execution: {
    startTime: Date;
    endTime: Date;
    duration: number;
    attempts: number;
  };

  metrics: {
    coverage?: CoverageMetrics;
    performance?: PerformanceMetrics;
    memory?: MemoryMetrics;
  };

  artifacts: {
    logs: string[];
    screenshots?: string[];
    videos?: string[];
    reports?: string[];
  };

  errors?: TestError[];
  warnings?: TestWarning[];

  agent?: {
    type: string;
    version: string;
    execution: AgentExecution;
  };
}
```

### PerformanceMetrics

Performance measurement data.

```typescript
interface PerformanceMetrics {
  execution: {
    totalTime: number;
    setupTime: number;
    testTime: number;
    teardownTime: number;
  };

  resources: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    networkUsage: number;
  };

  throughput: {
    testsPerSecond: number;
    operationsPerSecond: number;
  };

  reliability: {
    successRate: number;
    errorRate: number;
    retryRate: number;
  };

  trends: {
    improvementFactor: number;
    performanceScore: number;
    bottlenecks: string[];
  };
}
```

## 🚀 Usage Examples

### Complete Integration Example

```typescript
import {
  QEFramework,
  AsyncOperationQueue,
  NeuralTrainer,
  QualityGateManager,
  PerformanceMonitor
} from 'agentic-qe';

class AdvancedQEIntegration {
  private framework: QEFramework;
  private queue: AsyncOperationQueue;
  private neural: NeuralTrainer;
  private gates: QualityGateManager;
  private monitor: PerformanceMonitor;

  async initialize() {
    // Initialize framework with enhanced features
    this.framework = new QEFramework({
      performance: {
        enableAsyncQueue: true,
        enableBatchProcessor: true,
        enableNeuralTraining: true,
        maxConcurrent: 12
      },
      neural: {
        enableTraining: true,
        modelType: 'pattern-recognition'
      },
      quality: {
        gates: {
          coverage: { threshold: 85, enforce: true },
          performance: { threshold: '200ms', enforce: true }
        }
      }
    });

    await this.framework.initialize();

    // Setup neural training
    this.neural = new NeuralTrainer({
      modelType: 'pattern-recognition'
    });

    // Setup quality gates
    this.gates = new QualityGateManager({
      configPath: './qe-gates.yaml'
    });

    // Setup monitoring
    this.monitor = new PerformanceMonitor({
      metricsInterval: 5000,
      alerting: true
    });

    await this.monitor.start();
  }

  async executeEnhancedTestSuite(testSuite: TestSuite) {
    // Create session with neural predictions
    const sessionId = await this.framework.createSession({
      name: testSuite.name,
      strategy: 'neural-optimized'
    });

    // Get risk predictions
    const riskPrediction = await this.neural.predictRisk({
      testSuite: testSuite.id,
      environment: 'production'
    });

    // Spawn optimized agent swarm
    const swarm = await this.framework.spawnAgentSwarm([
      { type: 'risk-oracle', priority: 'high' },
      { type: 'test-planner', priority: 'high' },
      { type: 'functional-tester', priority: 'medium' }
    ], {
      coordination: 'neural-enhanced',
      riskContext: riskPrediction
    });

    // Execute with performance monitoring
    const result = await this.framework.executeTestSuite(
      sessionId,
      testSuite,
      {
        parallel: true,
        monitoring: true,
        qualityGates: true
      }
    );

    // Evaluate quality gates
    const gateResult = await this.gates.evaluate({
      testResults: result,
      performanceMetrics: this.monitor.getCurrentMetrics()
    });

    // Train neural patterns from results
    await this.neural.trainFromHistory('current-session');

    return {
      testResult: result,
      qualityGates: gateResult,
      performance: this.monitor.getCurrentMetrics(),
      session: await this.framework.getSession(sessionId)
    };
  }
}
```

## 📚 Additional Resources

- [Enhanced Features Guide](./ENHANCED_FEATURES.md) - Detailed feature documentation
- [Performance Guide](./PERFORMANCE_GUIDE.md) - Performance optimization
- [Configuration Reference](./configuration.md) - Complete configuration options
- [Examples Directory](../examples/) - Practical usage examples

---

This API reference provides comprehensive documentation for the enhanced Agentic QE Framework. For additional examples and advanced usage patterns, see the examples directory and feature-specific guides.