# Phase 1 Examples (v1.0.5)

This directory contains code examples demonstrating Phase 1 features: Multi-Model Router and Streaming MCP Tools.

---

## 📁 Directory Structure

```
phase1/
├── routing/
│   ├── basic-routing.ts           # Basic model selection
│   └── cost-tracking.ts            # Cost tracking and reporting
├── streaming/
│   ├── test-generation-stream.ts   # Streaming test generation
│   └── test-execution-stream.ts    # Streaming test execution
└── cost-tracking/
    └── budget-management.ts        # Budget management and forecasting
```

---

## 🚀 Quick Start

### Prerequisites

```bash
# Install dependencies
npm install agentic-qe@latest
npm install progress chalk ora

# Set API keys
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Run Examples

```bash
# Routing examples
npx ts-node routing/basic-routing.ts
npx ts-node routing/cost-tracking.ts

# Streaming examples
npx ts-node streaming/test-generation-stream.ts
npx ts-node streaming/test-execution-stream.ts

# Budget management
npx ts-node cost-tracking/budget-management.ts
```

---

## 📚 Examples Overview

### 1. Basic Routing (`routing/basic-routing.ts`)

Demonstrates basic model selection based on task complexity.

**Features**:
- Simple task routing (GPT-3.5)
- Complex task routing (GPT-4)
- Critical task routing (Claude Sonnet 4.5)
- Cost estimation

**Key Concepts**:
```typescript
const router = new ModelRouter(config);
const selection = await router.selectModel(task);
console.log(`Selected: ${selection.modelId}`);
console.log(`Cost: $${selection.estimatedCost}`);
```

---

### 2. Cost Tracking (`routing/cost-tracking.ts`)

Comprehensive cost tracking and reporting.

**Features**:
- Real-time cost tracking
- Budget management
- Cost breakdown by model/agent
- Savings analysis
- CSV/JSON export

**Key Concepts**:
```typescript
const tracker = new CostTracker();
tracker.setBudget({ period: 'daily', limit: 50.00 });

// Track execution
tracker.record(execution);

// Get report
const report = await tracker.getBreakdown();
console.log(`Savings: ${report.savings.percentage}%`);
```

---

### 3. Test Generation Streaming (`streaming/test-generation-stream.ts`)

Real-time progress updates for test generation.

**Features**:
- Live progress bar
- Test-by-test updates
- Coverage tracking
- Colored terminal output
- Metrics monitoring

**Key Concepts**:
```typescript
const stream = await fleet.streamTestGeneration(options);

stream.on('progress', (update) => {
  console.log(`${update.progress}%`);
});

stream.on('test:generated', (test) => {
  console.log(`✓ ${test.name}`);
});

const result = await stream.complete();
```

---

### 4. Test Execution Streaming (`streaming/test-execution-stream.ts`)

Real-time progress updates for test execution.

**Features**:
- Live test results
- Pass/fail tracking
- Coverage updates
- Suite summaries
- Failed test details

**Key Concepts**:
```typescript
const stream = await fleet.streamTestExecution(options);

stream.on('test:passed', (test) => {
  console.log(`✓ ${test.name}`);
});

stream.on('test:failed', (test) => {
  console.error(`✗ ${test.name}: ${test.error.message}`);
});
```

---

### 5. Budget Management (`cost-tracking/budget-management.ts`)

Comprehensive budget management and forecasting.

**Features**:
- Multi-level budgets (daily, monthly, project, team)
- Alert configuration
- Dynamic adjustments
- Cost forecasting
- Report generation

**Key Concepts**:
```typescript
const budgetManager = new BudgetManager();

// Set budgets
await budgetManager.setBudget({
  period: 'daily',
  limit: 50.00,
  onExceeded: 'pause'
});

// Check status
const status = await budgetManager.getStatus('daily-budget');

// Forecast
const forecast = await budgetManager.forecastCosts({
  period: 'month'
});
```

---

## 🎯 Use Cases

### Cost Optimization

1. **Start with Basic Routing** to understand model selection
2. **Add Cost Tracking** to monitor spending
3. **Implement Budgets** to control costs
4. **Use Forecasting** for planning

### Real-Time Monitoring

1. **Enable Streaming** for long operations
2. **Add Progress Bars** for better UX
3. **Track Metrics** for performance
4. **Handle Errors** gracefully

### Team Management

1. **Set Team Budgets** for cost allocation
2. **Configure Alerts** for notifications
3. **Generate Reports** for stakeholders
4. **Optimize Rules** based on usage

---

## 📖 Related Documentation

- [Multi-Model Router Guide](../../guides/MULTI-MODEL-ROUTER.md)
- [Streaming API Tutorial](../../guides/STREAMING-API.md)
- [Cost Optimization Best Practices](../../guides/COST-OPTIMIZATION.md)
- [Migration Guide](../../guides/MIGRATION-V1.0.5.md)
- [Routing API Reference](../../api/ROUTING-API.md)
- [Streaming API Reference](../../api/STREAMING-API.md)

---

## 💡 Tips

### Performance

- Use streaming for operations >5 seconds
- Enable caching for repeated operations
- Batch operations when possible
- Monitor memory usage

### Cost Savings

- Use GPT-3.5 for simple tasks (10x cheaper)
- Enable adaptive routing (learns over time)
- Set daily/monthly budgets
- Review cost reports weekly

### Reliability

- Always handle errors
- Implement fallback chains
- Clean up event listeners
- Monitor connection status

---

## 🐛 Troubleshooting

### "No models available"

```typescript
// Ensure models are configured
const router = new ModelRouter({
  models: {
    available: [
      { id: 'gpt-3.5-turbo', provider: 'openai', costPer1kTokens: 0.002, maxTokens: 4096 }
    ]
  }
});
```

### "API key not found"

```bash
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
```

### "No progress updates"

```typescript
// Attach listeners BEFORE starting stream
stream.on('progress', handler);
await stream.start();  // Not before!
```

---

## 🤝 Contributing

Have a great example? Submit a PR!

1. Create example file in appropriate directory
2. Add documentation comments
3. Include expected output
4. Update this README

---

**Questions?** Open an issue: https://github.com/proffesor-for-testing/agentic-qe/issues
