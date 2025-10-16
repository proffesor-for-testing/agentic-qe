# Routing API Reference

**Version**: 1.0.5
**Module**: `agentic-qe/routing`

---

## Overview

The Routing API provides intelligent model selection for AI-powered quality engineering operations. It analyzes task complexity and automatically routes requests to the most cost-effective model while maintaining quality thresholds.

---

## Core Classes

### ModelRouter

Main class for model selection and routing.

```typescript
import { ModelRouter } from 'agentic-qe';

class ModelRouter {
  constructor(config?: RouterConfig);

  // Model selection
  selectModel(task: QETask): Promise<ModelSelection>;
  selectModelSync(task: QETask): ModelSelection;

  // Cost tracking
  trackCost(execution: ModelExecution): void;
  getCosts(options?: CostQueryOptions): Promise<CostReport>;

  // Fallback management
  getFallbackModel(failedModel: string): string;
  testFallbackChain(): Promise<FallbackTestResult>;

  // Configuration
  updateConfig(config: Partial<RouterConfig>): void;
  getConfig(): RouterConfig;

  // Analytics
  getPerformanceStats(): Promise<PerformanceStats>;
  getModelDistribution(): Promise<ModelDistribution>;
}
```

---

## Interfaces

### RouterConfig

```typescript
interface RouterConfig {
  // Model definitions
  models: {
    available: ModelDefinition[];
    defaultModel: string;
    fallbackChain: string[];
  };

  // Routing strategy
  routing: {
    strategy: RoutingStrategy;
    complexity: ComplexityThresholds;
    agentOverrides?: AgentOverrides;
  };

  // Cost control
  costControl?: {
    maxCostPerTask?: number;
    dailyLimit?: number;
    monthlyLimit?: number;
    onLimitReached?: 'pause' | 'downgrade' | 'notify';
  };

  // Caching
  caching?: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
    similarityThreshold?: number;
  };

  // Rate limiting
  rateLimit?: {
    enabled: boolean;
    maxRequestsPerMinute: number;
    perModel?: Record<string, number>;
  };
}
```

---

### ModelDefinition

```typescript
interface ModelDefinition {
  // Identity
  id: string;
  provider: 'openai' | 'anthropic' | 'custom';

  // Pricing
  costPer1kTokens: number;

  // Capabilities
  maxTokens: number;
  supportsStreaming?: boolean;
  supportsFunctionCalling?: boolean;

  // Performance
  avgLatency?: number;
  reliability?: number;

  // Metadata
  metadata?: Record<string, any>;
}
```

**Example**:
```typescript
const model: ModelDefinition = {
  id: 'gpt-4',
  provider: 'openai',
  costPer1kTokens: 0.03,
  maxTokens: 8192,
  supportsStreaming: true,
  supportsFunctionCalling: true,
  avgLatency: 2000,
  reliability: 0.99
};
```

---

### ModelSelection

```typescript
interface ModelSelection {
  // Selected model
  modelId: string;
  provider: string;

  // Selection reasoning
  reason: string;
  confidence: number;
  complexity: ComplexityLevel;

  // Cost estimation
  estimatedCost: number;
  estimatedTokens: number;

  // Alternatives
  alternatives: Array<{
    modelId: string;
    score: number;
    reason: string;
  }>;

  // Metadata
  timestamp: number;
  taskId: string;
}
```

**Example**:
```typescript
const selection: ModelSelection = {
  modelId: 'gpt-3.5-turbo',
  provider: 'openai',
  reason: 'Task complexity is low (score: 0.2), using cost-optimized model',
  confidence: 0.92,
  complexity: 'simple',
  estimatedCost: 0.02,
  estimatedTokens: 1000,
  alternatives: [
    {
      modelId: 'claude-haiku-3',
      score: 0.88,
      reason: 'Slightly higher cost but faster'
    }
  ],
  timestamp: Date.now(),
  taskId: 'task-123'
};
```

---

### QETask

```typescript
interface QETask {
  // Task identity
  id: string;
  type: TaskType;
  agentType: string;

  // Source code
  sourceFile?: string;
  sourceCode?: string;
  linesOfCode?: number;

  // Complexity metrics
  cyclomaticComplexity?: number;
  cognitiveComplexity?: number;
  halsteadComplexity?: number;

  // Structural metrics
  classCount?: number;
  functionCount?: number;
  dependencyCount?: number;

  // Test requirements
  testCount?: number;
  targetCoverage?: number;
  testTypes?: string[];

  // Metadata
  metadata?: {
    priority?: 'low' | 'medium' | 'high' | 'critical';
    critical?: boolean;
    deadline?: number;
    [key: string]: any;
  };
}
```

---

### ComplexityLevel

```typescript
type ComplexityLevel = 'simple' | 'moderate' | 'complex' | 'critical';

interface ComplexityAnalysis {
  level: ComplexityLevel;
  score: number;  // 0-1
  confidence: number;  // 0-1

  factors: {
    codeSize: number;
    structuralComplexity: number;
    algorithmicComplexity: number;
    testRequirements: number;
  };

  reasoning: string[];
}
```

---

### RoutingStrategy

```typescript
type RoutingStrategy =
  | 'cost-optimized'
  | 'quality-first'
  | 'balanced'
  | 'adaptive';

interface StrategyConfig {
  strategy: RoutingStrategy;

  // Cost-optimized
  costOptimized?: {
    maxCostPerTask: number;
    minQualityScore: number;
  };

  // Quality-first
  qualityFirst?: {
    minQualityScore: number;
    maxCostMultiplier: number;
  };

  // Balanced
  balanced?: {
    costWeight: number;
    qualityWeight: number;
  };

  // Adaptive
  adaptive?: {
    learningRate: number;
    explorationRate: number;
    optimizationWindow: number;
  };
}
```

---

## Methods

### selectModel()

Select optimal model for a given task.

```typescript
async selectModel(task: QETask): Promise<ModelSelection>
```

**Parameters**:
- `task: QETask` - Task to route

**Returns**: `Promise<ModelSelection>` - Selected model and reasoning

**Throws**:
- `NoModelsAvailableError` - No models configured
- `ComplexityAnalysisError` - Failed to analyze complexity
- `RateLimitExceededError` - Rate limit reached

**Example**:
```typescript
const router = new ModelRouter(config);

const task: QETask = {
  id: 'test-gen-123',
  type: 'test-generation',
  agentType: 'test-generator',
  sourceFile: 'src/services/user-service.ts',
  linesOfCode: 250,
  cyclomaticComplexity: 12,
  targetCoverage: 90
};

const selection = await router.selectModel(task);

console.log(`Selected: ${selection.modelId}`);
console.log(`Reason: ${selection.reason}`);
console.log(`Estimated cost: $${selection.estimatedCost}`);
```

---

### trackCost()

Track cost of a model execution.

```typescript
trackCost(execution: ModelExecution): void
```

**Parameters**:
```typescript
interface ModelExecution {
  taskId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  duration: number;
  success: boolean;
  timestamp: number;
}
```

**Example**:
```typescript
router.trackCost({
  taskId: 'test-gen-123',
  modelId: 'gpt-3.5-turbo',
  inputTokens: 800,
  outputTokens: 1200,
  totalCost: 0.004,
  duration: 2300,
  success: true,
  timestamp: Date.now()
});
```

---

### getCosts()

Get cost report.

```typescript
async getCosts(options?: CostQueryOptions): Promise<CostReport>
```

**Parameters**:
```typescript
interface CostQueryOptions {
  period?: 'today' | 'week' | 'month' | 'all';
  startDate?: string;
  endDate?: string;
  groupBy?: 'model' | 'agent' | 'project' | 'day';
  sortBy?: 'cost' | 'count' | 'date';
  limit?: number;
}
```

**Returns**:
```typescript
interface CostReport {
  totalCost: number;
  totalTasks: number;
  avgCostPerTask: number;
  period: {
    start: string;
    end: string;
  };

  byModel: Array<{
    modelId: string;
    cost: number;
    tasks: number;
    avgCost: number;
  }>;

  byAgent: Array<{
    agentType: string;
    cost: number;
    tasks: number;
    avgCost: number;
  }>;

  savings: {
    vsBaseline: number;
    percentage: number;
  };
}
```

**Example**:
```typescript
const report = await router.getCosts({
  period: 'today',
  groupBy: 'model'
});

console.log(`Total cost today: $${report.totalCost}`);
console.log(`Savings: $${report.savings.vsBaseline} (${report.savings.percentage}%)`);

report.byModel.forEach(m => {
  console.log(`${m.modelId}: ${m.tasks} tasks, $${m.cost}`);
});
```

---

### getFallbackModel()

Get fallback model when primary fails.

```typescript
getFallbackModel(failedModel: string): string
```

**Parameters**:
- `failedModel: string` - Model that failed

**Returns**: `string` - Next model in fallback chain

**Throws**:
- `NoFallbackAvailableError` - No more fallbacks

**Example**:
```typescript
try {
  await executeWithModel('gpt-4');
} catch (error) {
  const fallback = router.getFallbackModel('gpt-4');
  console.log(`Falling back to: ${fallback}`);
  await executeWithModel(fallback);
}
```

---

### getPerformanceStats()

Get performance statistics for model selection.

```typescript
async getPerformanceStats(): Promise<PerformanceStats>
```

**Returns**:
```typescript
interface PerformanceStats {
  totalSelections: number;
  avgSelectionTime: number;

  accuracy: {
    correctSelections: number;
    incorrectSelections: number;
    accuracyRate: number;
  };

  models: Array<{
    modelId: string;
    selections: number;
    successRate: number;
    avgCost: number;
    avgDuration: number;
  }>;

  costEfficiency: {
    avgCostPerTask: number;
    savingsVsBaseline: number;
    costEfficiencyScore: number;
  };
}
```

**Example**:
```typescript
const stats = await router.getPerformanceStats();

console.log(`Accuracy: ${stats.accuracy.accuracyRate * 100}%`);
console.log(`Avg selection time: ${stats.avgSelectionTime}ms`);
console.log(`Cost efficiency: ${stats.costEfficiency.costEfficiencyScore}`);
```

---

## Complexity Analyzer

### ComplexityAnalyzer

Analyze code complexity for routing decisions.

```typescript
class ComplexityAnalyzer {
  constructor(config?: AnalyzerConfig);

  analyze(task: QETask): Promise<ComplexityAnalysis>;
  analyzeCode(code: string): Promise<ComplexityMetrics>;
  analyzeFile(filePath: string): Promise<ComplexityMetrics>;
}
```

**Example**:
```typescript
import { ComplexityAnalyzer } from 'agentic-qe/routing';

const analyzer = new ComplexityAnalyzer();

const analysis = await analyzer.analyze(task);

console.log(`Complexity: ${analysis.level}`);
console.log(`Score: ${analysis.score}`);
console.log(`Confidence: ${analysis.confidence}`);
```

---

## Cost Tracker

### CostTracker

Track and report on model usage costs.

```typescript
class CostTracker {
  constructor(config?: TrackerConfig);

  // Recording
  record(execution: ModelExecution): void;
  recordBatch(executions: ModelExecution[]): void;

  // Querying
  getTodayCost(): Promise<number>;
  getCost(period: string): Promise<number>;
  getBreakdown(options: CostQueryOptions): Promise<CostReport>;

  // Budgets
  setBudget(budget: BudgetConfig): void;
  checkBudget(): Promise<BudgetStatus>;

  // Alerts
  setAlert(alert: AlertConfig): void;
  getAlerts(): Promise<Alert[]>;

  // Exports
  exportCosts(options: ExportOptions): Promise<string>;
}
```

**Example**:
```typescript
import { CostTracker } from 'agentic-qe/routing';

const tracker = new CostTracker();

// Set budget
tracker.setBudget({
  period: 'daily',
  limit: 50.00,
  onExceeded: 'pause'
});

// Check budget status
const status = await tracker.checkBudget();
if (status.exceeded) {
  console.warn(`Budget exceeded: $${status.current} / $${status.limit}`);
}

// Get breakdown
const breakdown = await tracker.getBreakdown({
  period: 'today',
  groupBy: 'model'
});
```

---

## Error Types

### NoModelsAvailableError

```typescript
class NoModelsAvailableError extends Error {
  constructor(message: string);
}
```

Thrown when no models are configured or available.

---

### ComplexityAnalysisError

```typescript
class ComplexityAnalysisError extends Error {
  constructor(
    message: string,
    public task: QETask,
    public reason: string
  );
}
```

Thrown when complexity analysis fails.

---

### RateLimitExceededError

```typescript
class RateLimitExceededError extends Error {
  constructor(
    message: string,
    public modelId: string,
    public retryAfter: number
  );
}
```

Thrown when rate limit is exceeded.

---

### BudgetExceededError

```typescript
class BudgetExceededError extends Error {
  constructor(
    message: string,
    public period: string,
    public limit: number,
    public current: number
  );
}
```

Thrown when cost budget is exceeded.

---

## Type Guards

```typescript
// Check if model selection is valid
function isValidModelSelection(sel: any): sel is ModelSelection;

// Check if task is complete
function isCompleteTask(task: any): task is QETask;

// Check if complexity level is valid
function isComplexityLevel(level: any): level is ComplexityLevel;
```

---

## Utility Functions

### calculateCost()

```typescript
function calculateCost(
  inputTokens: number,
  outputTokens: number,
  costPer1k: number
): number
```

Calculate cost from token counts.

**Example**:
```typescript
import { calculateCost } from 'agentic-qe/routing';

const cost = calculateCost(800, 1200, 0.002);
console.log(`Cost: $${cost}`);  // $0.004
```

---

### estimateTokens()

```typescript
function estimateTokens(text: string): number
```

Estimate token count from text.

**Example**:
```typescript
import { estimateTokens } from 'agentic-qe/routing';

const code = `function hello() { return "world"; }`;
const tokens = estimateTokens(code);
console.log(`Estimated tokens: ${tokens}`);
```

---

## Configuration Examples

### Cost-Optimized Configuration

```typescript
const config: RouterConfig = {
  models: {
    available: [
      { id: 'gpt-3.5-turbo', provider: 'openai', costPer1kTokens: 0.002, maxTokens: 4096 },
      { id: 'gpt-4', provider: 'openai', costPer1kTokens: 0.03, maxTokens: 8192 }
    ],
    defaultModel: 'gpt-3.5-turbo',
    fallbackChain: ['gpt-3.5-turbo', 'gpt-4']
  },
  routing: {
    strategy: 'cost-optimized',
    complexity: {
      simple: { maxLines: 100, maxComplexity: 5, model: 'gpt-3.5-turbo' },
      moderate: { maxLines: 500, maxComplexity: 15, model: 'gpt-3.5-turbo' },
      complex: { maxLines: 2000, maxComplexity: 30, model: 'gpt-4' },
      critical: { maxLines: Infinity, maxComplexity: Infinity, model: 'gpt-4' }
    }
  },
  costControl: {
    maxCostPerTask: 0.05,
    dailyLimit: 50.00
  }
};
```

---

### Quality-First Configuration

```typescript
const config: RouterConfig = {
  models: {
    available: [
      { id: 'gpt-4', provider: 'openai', costPer1kTokens: 0.03, maxTokens: 8192 },
      { id: 'claude-sonnet-4.5', provider: 'anthropic', costPer1kTokens: 0.015, maxTokens: 200000 }
    ],
    defaultModel: 'gpt-4',
    fallbackChain: ['gpt-4', 'claude-sonnet-4.5']
  },
  routing: {
    strategy: 'quality-first',
    complexity: {
      simple: { model: 'gpt-4' },
      moderate: { model: 'gpt-4' },
      complex: { model: 'claude-sonnet-4.5' },
      critical: { model: 'claude-sonnet-4.5' }
    }
  }
};
```

---

## Best Practices

### 1. Always Handle Fallbacks

```typescript
async function generateWithFallback(task: QETask) {
  let currentModel = await router.selectModel(task);

  while (true) {
    try {
      return await generate(task, currentModel.modelId);
    } catch (error) {
      try {
        const fallback = router.getFallbackModel(currentModel.modelId);
        console.log(`Falling back to: ${fallback}`);
        currentModel = { ...currentModel, modelId: fallback };
      } catch {
        throw new Error('All models failed');
      }
    }
  }
}
```

---

### 2. Track All Executions

```typescript
async function executeWithTracking(task: QETask) {
  const selection = await router.selectModel(task);
  const startTime = Date.now();

  try {
    const result = await execute(task, selection.modelId);

    router.trackCost({
      taskId: task.id,
      modelId: selection.modelId,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalCost: calculateCost(result.inputTokens, result.outputTokens, selection.cost),
      duration: Date.now() - startTime,
      success: true,
      timestamp: startTime
    });

    return result;
  } catch (error) {
    router.trackCost({
      taskId: task.id,
      modelId: selection.modelId,
      inputTokens: 0,
      outputTokens: 0,
      totalCost: 0,
      duration: Date.now() - startTime,
      success: false,
      timestamp: startTime
    });

    throw error;
  }
}
```

---

### 3. Monitor Budgets

```typescript
async function executeWithBudgetCheck(task: QETask) {
  const status = await tracker.checkBudget();

  if (status.exceeded) {
    throw new BudgetExceededError(
      'Daily budget exceeded',
      'daily',
      status.limit,
      status.current
    );
  }

  if (status.current / status.limit > 0.8) {
    console.warn('Budget at 80%, consider downgrading models');
  }

  return await execute(task);
}
```

---

## Migration Guide

### From Non-Routed to Routed

**Before**:
```typescript
const result = await agent.generateTests({
  sourceFile: 'src/service.ts',
  model: 'gpt-4'  // Hardcoded
});
```

**After**:
```typescript
const router = new ModelRouter(config);
const selection = await router.selectModel(task);

const result = await agent.generateTests({
  sourceFile: 'src/service.ts',
  model: selection.modelId  // Auto-selected
});
```

---

## Related Documentation

- [Multi-Model Router Guide](../guides/MULTI-MODEL-ROUTER.md)
- [Cost Optimization Best Practices](../guides/COST-OPTIMIZATION.md)
- [Migration Guide](../guides/MIGRATION-V1.0.5.md)
- [Streaming API Reference](STREAMING-API.md)

---

**Questions?** Open an issue: https://github.com/proffesor-for-testing/agentic-qe/issues
