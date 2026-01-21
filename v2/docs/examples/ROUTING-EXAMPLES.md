# Multi-Model Router - Practical Examples

Complete examples for using the Multi-Model Router to achieve 70-81% cost savings.

## Table of Contents

- [Quick Start](#quick-start)
- [CLI Commands](#cli-commands)
- [Programmatic Usage](#programmatic-usage)
- [Cost Tracking](#cost-tracking)
- [Advanced Configurations](#advanced-configurations)
- [Best Practices](#best-practices)

---

## Quick Start

### 1. Enable Multi-Model Router

```bash
# Enable routing with default settings
aqe routing enable

# Enable with custom configuration
aqe routing enable --config .agentic-qe/config/routing.json

# Check status
aqe routing status
```

### 2. View Real-Time Cost Savings

```bash
# Launch interactive dashboard
aqe routing dashboard

# View statistics
aqe routing stats

# Generate detailed report
aqe routing report --format html --output routing-report.html
```

---

## CLI Commands

### Enable Routing

```bash
# Basic enable
aqe routing enable

# Enable with specific model preferences
aqe routing enable \
  --default-model claude-sonnet-4.5 \
  --enable-cost-tracking \
  --enable-fallback \
  --max-retries 3
```

**Configuration file** (`.agentic-qe/config/routing.json`):

```json
{
  "enabled": true,
  "defaultModel": "claude-sonnet-4.5",
  "enableCostTracking": true,
  "enableFallback": true,
  "maxRetries": 3,
  "costThreshold": 1000,
  "modelPreferences": {
    "simple": "gpt-3.5-turbo",
    "medium": "claude-haiku",
    "complex": "claude-sonnet-4.5",
    "critical": "gpt-4"
  },
  "budgets": {
    "daily": 50,
    "monthly": 1000
  },
  "alerting": {
    "enabled": true,
    "thresholds": [0.75, 0.9],
    "channels": ["email", "slack"]
  }
}
```

### View Status

```bash
# Show current configuration
aqe routing status

# Show detailed metrics
aqe routing status --verbose
```

**Output**:
```
✅ Multi-Model Router Status

Configuration:
  Status: ENABLED ✓
  Default Model: claude-sonnet-4.5
  Cost Tracking: ENABLED ✓
  Fallback Chains: ENABLED ✓
  Max Retries: 3

Cost Summary (Last 30 Days):
  Total Cost: $127.50
  Baseline Cost (single model): $545.00
  Savings: $417.50 (76.6%)
  Daily Average: $4.25
  Budget Status: ON TRACK ✓

Model Usage:
  ├─ gpt-3.5-turbo: 42% (simple tasks)
  ├─ claude-haiku: 31% (medium tasks)
  ├─ claude-sonnet-4.5: 20% (complex tasks)
  └─ gpt-4: 7% (critical tasks)
```

### Dashboard

```bash
# Launch interactive dashboard (updates every 5 seconds)
aqe routing dashboard

# Dashboard with custom refresh interval
aqe routing dashboard --interval 10
```

**Dashboard Output**:
```
╔══════════════════════════════════════════════════════════════╗
║        MULTI-MODEL ROUTER - REAL-TIME DASHBOARD             ║
╚══════════════════════════════════════════════════════════════╝

📊 COST SAVINGS (LAST 30 DAYS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Current Month:    $127.50
  Baseline:         $545.00
  Savings:          $417.50 (76.6%)
  Daily Average:    $4.25

  Budget Status:    ████████░░ 12.8% of monthly budget
  Forecast:         $131.50 (projected month-end)

🤖 MODEL USAGE BREAKDOWN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  gpt-3.5-turbo:    ████████████░░░░░░ 42% (2,345 tasks)
  claude-haiku:     ████████░░░░░░░░░░ 31% (1,789 tasks)
  claude-sonnet-4.5:████░░░░░░░░░░░░░░ 20% (1,123 tasks)
  gpt-4:            ██░░░░░░░░░░░░░░░░  7% (421 tasks)

⚡ PERFORMANCE METRICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total Requests:   5,678
  Success Rate:     99.8%
  Avg Latency:      234ms
  Cache Hit Rate:   67%

🎯 TOP SAVINGS OPPORTUNITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. Test Generation: $187.50 saved (45% of total)
  2. Coverage Analysis: $124.20 saved (30% of total)
  3. Code Review: $89.30 saved (21% of total)

Last Updated: 2025-10-16 11:30:45
Press Ctrl+C to exit
```

### Generate Reports

```bash
# Generate markdown report
aqe routing report --format markdown --output report.md

# Generate HTML report
aqe routing report --format html --output report.html

# Generate JSON for API integration
aqe routing report --format json --output report.json

# Email report
aqe routing report --format pdf --email team@company.com
```

### Statistics

```bash
# Show statistics for last 7 days
aqe routing stats --days 7

# Show detailed breakdown
aqe routing stats --detailed

# Export statistics
aqe routing stats --export stats.csv
```

---

## Programmatic Usage

### Basic Configuration

```typescript
import { AdaptiveModelRouter, ModelRules } from 'agentic-qe/routing';

// Initialize router with default configuration
const router = new AdaptiveModelRouter({
  enableCostTracking: true,
  enableFallback: true,
  maxRetries: 3,
  costThreshold: 1000
});

await router.initialize();

// Select optimal model for a task
const task = {
  id: 'test-gen-123',
  type: 'test-generation',
  complexity: 'medium',
  priority: 'high',
  metadata: {
    sourceFile: 'src/services/user-service.ts',
    framework: 'jest',
    coverage: 95
  }
};

const modelSelection = await router.selectModel(task);
console.log(`Using model: ${modelSelection.model}`);
console.log(`Estimated cost: $${modelSelection.estimatedCost}`);
console.log(`Reasoning: ${modelSelection.reasoning}`);
```

### Custom Model Rules

```typescript
import { ModelRules, ComplexityLevel } from 'agentic-qe/routing';

const customRules = new ModelRules({
  // Override default model preferences
  modelPreferences: {
    simple: 'gpt-3.5-turbo',      // <100 tokens, basic operations
    medium: 'claude-haiku',        // 100-500 tokens, standard tests
    complex: 'claude-sonnet-4.5',  // 500-2000 tokens, advanced analysis
    critical: 'gpt-4'              // >2000 tokens, mission-critical
  },

  // Custom complexity analysis
  complexityWeights: {
    tokenCount: 0.4,
    taskType: 0.3,
    priority: 0.2,
    context: 0.1
  },

  // Fallback chains
  fallbackChains: {
    'claude-sonnet-4.5': ['claude-haiku', 'gpt-3.5-turbo'],
    'gpt-4': ['claude-sonnet-4.5', 'claude-haiku'],
    'claude-haiku': ['gpt-3.5-turbo'],
    'gpt-3.5-turbo': []
  }
});

const router = new AdaptiveModelRouter({
  rules: customRules,
  enableCostTracking: true,
  enableFallback: true,
  maxRetries: 3
});
```

### Cost Tracking Integration

```typescript
import { CostTracker, BudgetConfig } from 'agentic-qe/routing';

// Configure budget management
const budgetConfig: BudgetConfig = {
  daily: 50,      // $50/day limit
  monthly: 1000,  // $1000/month limit
  alerts: {
    enabled: true,
    thresholds: [0.75, 0.9, 1.0],  // Alert at 75%, 90%, 100%
    channels: ['email', 'slack', 'webhook']
  }
};

const costTracker = new CostTracker({
  enableTracking: true,
  budgets: budgetConfig,
  persistenceInterval: 60000  // Save every minute
});

// Track individual request costs
await costTracker.trackRequest({
  model: 'claude-sonnet-4.5',
  inputTokens: 1500,
  outputTokens: 800,
  cost: 0.0245,
  taskType: 'test-generation',
  timestamp: Date.now()
});

// Get current usage
const usage = await costTracker.getCurrentUsage();
console.log(`Today: $${usage.daily.spent}/${usage.daily.limit}`);
console.log(`Month: $${usage.monthly.spent}/${usage.monthly.limit}`);
console.log(`Savings: $${usage.totalSavings} (${usage.savingsPercent}%)`);

// Check budget status
const status = await costTracker.checkBudgetStatus();
if (status.dailyExceeded || status.monthlyExceeded) {
  console.error('Budget exceeded! Switching to cheaper models.');
}
```

### Fleet Integration

```typescript
import { FleetManager, AdaptiveModelRouter } from 'agentic-qe';

// Initialize fleet with routing
const fleet = new FleetManager({
  maxAgents: 20,
  topology: 'mesh',
  routing: {
    enabled: true,
    defaultModel: 'claude-sonnet-4.5',
    enableCostTracking: true,
    enableFallback: true,
    maxRetries: 3,
    costThreshold: 1000,
    modelPreferences: {
      simple: 'gpt-3.5-turbo',
      medium: 'claude-haiku',
      complex: 'claude-sonnet-4.5',
      critical: 'gpt-4'
    }
  }
});

await fleet.initialize();

// Spawn agents with automatic model selection
const testGenAgent = await fleet.spawnAgent('test-generator', {
  targetCoverage: 95,
  framework: 'jest',
  // Router automatically selects optimal model based on task complexity
  useRouting: true
});

// Execute task (model is automatically selected)
const result = await testGenAgent.execute({
  sourceFile: 'src/services/user-service.ts',
  testStyle: 'property-based'
});

// Check cost savings
const savings = await fleet.getRoutingSavings();
console.log(`Total savings: $${savings.total} (${savings.percent}%)`);
```

---

## Cost Tracking

### Real-Time Monitoring

```typescript
import { CostTracker } from 'agentic-qe/routing';

const tracker = new CostTracker({
  enableTracking: true,
  realTimeUpdates: true,
  updateInterval: 5000  // Update every 5 seconds
});

// Subscribe to cost updates
tracker.on('cost-update', (update) => {
  console.log(`Current spend: $${update.currentSpend}`);
  console.log(`Savings: $${update.savings} (${update.savingsPercent}%)`);
});

// Subscribe to budget alerts
tracker.on('budget-alert', (alert) => {
  console.warn(`Budget alert: ${alert.threshold}% of ${alert.period} budget`);
  console.warn(`Current: $${alert.current} / $${alert.limit}`);
});

// Subscribe to threshold warnings
tracker.on('budget-exceeded', (data) => {
  console.error(`BUDGET EXCEEDED: ${data.period}`);
  console.error(`Limit: $${data.limit}, Spent: $${data.spent}`);

  // Take action (e.g., switch to cheaper models)
  await router.setEmergencyMode(true);
});
```

### Budget Management

```typescript
import { BudgetManager } from 'agentic-qe/routing';

const budgetManager = new BudgetManager({
  budgets: {
    daily: 50,
    weekly: 300,
    monthly: 1000,
    quarterly: 2500
  },
  enforcement: {
    softLimit: 0.9,  // Warning at 90%
    hardLimit: 1.0,  // Block at 100%
    action: 'downgrade'  // 'block' or 'downgrade'
  },
  rollover: {
    enabled: true,
    maxRollover: 0.25  // Roll over 25% of unused budget
  }
});

// Check if request is within budget
const canExecute = await budgetManager.checkRequest({
  estimatedCost: 0.05,
  priority: 'high'
});

if (!canExecute.allowed) {
  console.log(`Request blocked: ${canExecute.reason}`);
  console.log(`Suggested alternative: Use ${canExecute.suggestedModel}`);
}

// Get budget forecast
const forecast = await budgetManager.getForecast({
  period: 'monthly',
  confidence: 0.9
});

console.log(`Projected spend: $${forecast.projected}`);
console.log(`Confidence interval: $${forecast.min} - $${forecast.max}`);
console.log(`Risk of exceeding: ${forecast.riskPercent}%`);
```

### Cost Reporting

```typescript
import { CostReporter } from 'agentic-qe/routing';

const reporter = new CostReporter({
  format: 'html',
  includeCharts: true,
  includeRecommendations: true
});

// Generate comprehensive report
const report = await reporter.generate({
  period: 'monthly',
  breakdown: ['model', 'taskType', 'agent'],
  comparisons: ['baseline', 'previousMonth'],
  savings: true,
  trends: true
});

// Export report
await reporter.export(report, {
  format: 'html',
  output: 'reports/cost-analysis-october-2025.html',
  email: 'team@company.com',
  slack: '#qe-alerts'
});

// Get recommendations
const recommendations = await reporter.getRecommendations();
console.log('Cost Optimization Opportunities:');
recommendations.forEach((rec, idx) => {
  console.log(`${idx + 1}. ${rec.title}`);
  console.log(`   Potential savings: $${rec.potentialSavings}/month`);
  console.log(`   Action: ${rec.action}`);
});
```

---

## Advanced Configurations

### Dynamic Model Selection

```typescript
import { DynamicModelSelector } from 'agentic-qe/routing';

const selector = new DynamicModelSelector({
  // ML-based complexity prediction
  useMachineLearning: true,
  trainingDataPath: '.agentic-qe/ml/routing-model.json',

  // Dynamic threshold adjustment
  adaptiveThresholds: true,
  thresholdAdjustmentInterval: 3600000,  // 1 hour

  // Performance-based optimization
  optimizeForLatency: true,
  latencyWeight: 0.3,
  costWeight: 0.7,

  // Context-aware routing
  considerContext: {
    timeOfDay: true,
    currentLoad: true,
    previousResults: true,
    userPreferences: true
  }
});

// Select model with full context
const selection = await selector.selectWithContext({
  task: testGenerationTask,
  context: {
    previousAttempts: 0,
    urgency: 'high',
    budget: 'medium',
    qualityRequirement: 'high'
  }
});

console.log(`Selected: ${selection.model}`);
console.log(`Confidence: ${selection.confidence}`);
console.log(`Reasoning: ${selection.explanation}`);
```

### Fallback Strategies

```typescript
import { FallbackStrategy } from 'agentic-qe/routing';

const fallbackStrategy = new FallbackStrategy({
  // Cascade fallback
  cascade: {
    enabled: true,
    maxFallbacks: 3,
    chains: {
      'gpt-4': ['claude-sonnet-4.5', 'claude-haiku', 'gpt-3.5-turbo'],
      'claude-sonnet-4.5': ['claude-haiku', 'gpt-3.5-turbo'],
      'claude-haiku': ['gpt-3.5-turbo'],
      'gpt-3.5-turbo': []  // No fallback for cheapest model
    }
  },

  // Retry with exponential backoff
  retry: {
    enabled: true,
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2
  },

  // Circuit breaker
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    resetTimeout: 60000,
    halfOpenRequests: 3
  },

  // Quality degradation
  degradation: {
    allowQualityDegradation: true,
    minQualityScore: 0.7,
    degradationSteps: [
      { threshold: 0.9, action: 'reduce-context' },
      { threshold: 0.8, action: 'simplify-prompt' },
      { threshold: 0.7, action: 'use-cheaper-model' }
    ]
  }
});

// Execute with fallback protection
const result = await fallbackStrategy.executeWithFallback(async (model) => {
  return await aiService.complete({
    model: model,
    prompt: task.prompt,
    maxTokens: 2000
  });
}, {
  primaryModel: 'claude-sonnet-4.5',
  taskContext: task
});
```

### Multi-Region Routing

```typescript
import { MultiRegionRouter } from 'agentic-qe/routing';

const regionRouter = new MultiRegionRouter({
  regions: {
    'us-east-1': {
      models: ['gpt-4', 'gpt-3.5-turbo'],
      latency: 50,
      costMultiplier: 1.0
    },
    'eu-west-1': {
      models: ['claude-sonnet-4.5', 'claude-haiku'],
      latency: 80,
      costMultiplier: 1.1
    },
    'ap-southeast-1': {
      models: ['gpt-3.5-turbo', 'claude-haiku'],
      latency: 120,
      costMultiplier: 1.15
    }
  },

  // Routing strategy
  strategy: 'nearest',  // or 'cheapest', 'fastest', 'balanced'

  // Load balancing
  loadBalancing: {
    enabled: true,
    algorithm: 'round-robin',  // or 'least-loaded', 'random'
    healthCheck: true,
    healthCheckInterval: 30000
  },

  // Failover
  failover: {
    enabled: true,
    timeout: 5000,
    fallbackRegion: 'us-east-1'
  }
});

// Route request to optimal region
const result = await regionRouter.route({
  task: testGenerationTask,
  preferredRegion: 'auto',
  requirements: {
    maxLatency: 200,
    maxCost: 0.05
  }
});
```

---

## Best Practices

### 1. Start Small, Scale Gradually

```typescript
// Phase 1: Enable routing for non-critical tasks
const router = new AdaptiveModelRouter({
  enableCostTracking: true,
  enableFallback: false,  // Start without fallback
  taskFilter: {
    include: ['test-generation', 'coverage-analysis'],
    exclude: ['security-scan', 'production-validation']
  }
});

// Phase 2: Add fallback chains after 1 week
await router.updateConfig({
  enableFallback: true,
  maxRetries: 2
});

// Phase 3: Enable for all tasks after 2 weeks
await router.updateConfig({
  taskFilter: null  // Allow all tasks
});
```

### 2. Monitor and Optimize

```typescript
// Set up monitoring dashboards
const monitor = new RoutingMonitor({
  metrics: ['cost', 'latency', 'quality', 'errors'],
  aggregationInterval: 300000,  // 5 minutes
  alerting: {
    costSpike: { threshold: 2.0, window: 3600000 },
    errorRate: { threshold: 0.05, window: 300000 },
    latencyP99: { threshold: 5000, window: 600000 }
  }
});

// Review and optimize weekly
setInterval(async () => {
  const analysis = await monitor.analyze({
    period: 'week',
    recommendations: true
  });

  if (analysis.optimizations.length > 0) {
    console.log('Optimization opportunities found:');
    analysis.optimizations.forEach(opt => {
      console.log(`- ${opt.description} (saves $${opt.potentialSavings}/month)`);
    });
  }
}, 7 * 24 * 3600 * 1000);  // Weekly
```

### 3. Budget Management

```typescript
// Set conservative budgets initially
const budgets = {
  daily: 20,    // Start with $20/day
  monthly: 500  // $500/month
};

// Gradually increase based on ROI
const optimizer = new BudgetOptimizer({
  initialBudgets: budgets,
  targetROI: 5.0,  // 5x return on testing investment
  adjustmentStrategy: 'conservative',
  reviewInterval: 2592000000  // Monthly review
});

await optimizer.start();
```

### 4. Quality Assurance

```typescript
// Always validate model outputs
const qualityValidator = new OutputQualityValidator({
  minimumQualityScore: 0.85,
  validationRules: [
    'syntax-valid',
    'semantically-correct',
    'test-coverage-adequate',
    'no-duplication'
  ],
  fallbackOnFailure: true
});

const result = await router.executeWithValidation(task, {
  validator: qualityValidator,
  retryOnFailure: true,
  maxQualityRetries: 2
});
```

### 5. Cost Allocation

```typescript
// Track costs by team/project
const costAllocator = new CostAllocator({
  dimensions: ['team', 'project', 'taskType'],
  chargeback: {
    enabled: true,
    method: 'actual',  // or 'allocated'
    billingCycle: 'monthly'
  }
});

// Tag requests for tracking
await router.execute(task, {
  tags: {
    team: 'backend',
    project: 'user-service',
    costCenter: 'engineering'
  }
});

// Generate chargeback report
const chargebackReport = await costAllocator.generateReport({
  period: 'monthly',
  breakdown: ['team', 'project']
});
```

---

## Troubleshooting

### Common Issues

#### 1. High Costs Despite Routing

**Symptom**: Costs are still high even with routing enabled.

**Solution**:
```typescript
// Analyze actual vs expected costs
const analysis = await router.analyzeCosts({
  period: 'week',
  expectedSavings: 0.70
});

if (analysis.actualSavings < 0.50) {
  console.log('Underperforming routing detected!');
  console.log('Reasons:');
  analysis.issues.forEach(issue => {
    console.log(`- ${issue.description}`);
    console.log(`  Fix: ${issue.recommendation}`);
  });
}
```

#### 2. Model Selection Too Conservative

**Symptom**: Always using cheapest models, quality suffering.

**Solution**:
```typescript
// Adjust complexity thresholds
await router.updateRules({
  complexityWeights: {
    tokenCount: 0.3,  // Reduce token weight
    taskType: 0.4,    // Increase task type weight
    priority: 0.2,
    context: 0.1
  },
  qualityThreshold: 0.90  // Raise quality requirement
});
```

#### 3. Fallback Chains Too Aggressive

**Symptom**: Too many fallbacks, wasting time.

**Solution**:
```typescript
// Tighten fallback conditions
await router.updateConfig({
  fallbackStrategy: {
    maxFallbacks: 2,  // Reduce from 3
    fallbackOnlyOn: ['timeout', 'server-error'],  // Not on client errors
    minimumModelQuality: 0.80  // Higher bar for fallback
  }
});
```

---

## Next Steps

- [Multi-Model Router Guide](../guides/MULTI-MODEL-ROUTER.md) - Complete routing documentation
- [Cost Optimization Guide](../guides/COST-OPTIMIZATION.md) - Advanced cost optimization strategies
- [API Reference](../api/ROUTING-API.md) - Complete API documentation
- [Migration Guide](../guides/MIGRATION-V1.0.5.md) - Upgrade from v1.0.4

---

**Generated for v1.0.5** | [Report Issues](https://github.com/proffesor-for-testing/agentic-qe/issues)
