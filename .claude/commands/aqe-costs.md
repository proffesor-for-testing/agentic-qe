---
name: aqe-costs
description: Display inference cost analysis and savings from local vs cloud providers
---

# AQE Inference Costs

Display comprehensive inference cost analysis showing local vs cloud inference costs and estimated savings.

## Usage

```bash
aqe costs [options]
# or
/aqe-costs [options]
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--period` | string | `24h` | Time period: 1h, 24h, 7d, 30d, all |
| `--provider` | string | - | Filter by provider: ruvllm, anthropic, openrouter, openai |
| `--format` | string | `text` | Output format: text, json |
| `--detailed` | boolean | `false` | Show detailed per-request breakdown |
| `--reset` | boolean | `false` | Reset cost tracking data |

## Examples

### Basic Cost Report

```bash
aqe costs
```

Displays cost summary for the last 24 hours with savings analysis.

### Weekly Cost Analysis

```bash
aqe costs --period 7d
```

Shows cost trends and savings over the past 7 days.

### Provider-Specific Costs

```bash
aqe costs --provider ruvllm
```

Displays costs for local ruvllm inference only.

### Detailed Breakdown

```bash
aqe costs --detailed
```

Shows per-request cost breakdown with agent and task attribution.

### JSON Export for Dashboards

```bash
aqe costs --format json > costs.json
```

Exports cost data in JSON format for integration with monitoring dashboards.

### Reset Cost Data

```bash
aqe costs --reset
```

Clears all tracked cost data (useful for testing or new billing periods).

## Integration with Claude Code

### Cost Monitoring Agent

```javascript
// Use Claude Code's Task tool for cost monitoring
Task("Monitor inference costs", `
  Analyze AQE inference costs and provide recommendations:
  - Check cost trends over the past 24 hours
  - Identify high-cost agents or tasks
  - Calculate savings from local inference
  - Recommend optimizations to reduce cloud costs

  Store findings in memory: aqe/costs/analysis/{timestamp}
`, "qe-quality-gate")
```

### Automated Cost Reporting Workflow

```javascript
// Daily cost report generation
[Single Message]:
  Task("Generate cost report", "Create daily inference cost summary", "qe-quality-gate")
  Task("Analyze cost trends", "Identify cost optimization opportunities", "qe-quality-gate")

  TodoWrite({ todos: [
    {content: "Fetch cost data from tracker", status: "in_progress", activeForm: "Fetching data"},
    {content: "Calculate savings metrics", status: "in_progress", activeForm: "Calculating savings"},
    {content: "Generate recommendations", status: "pending", activeForm: "Generating recommendations"},
    {content: "Store report in memory", status: "pending", activeForm: "Storing report"}
  ]})
```

## Expected Outputs

### Text Format (Default)

```
Inference Cost Report
====================

Period: 2025-12-15T00:00:00Z to 2025-12-15T23:59:59Z

Overall Metrics:
  Total Requests: 1,248
  Total Tokens: 3,456,789
  Total Cost: $5.2340
  Requests/Hour: 52.0
  Cost/Hour: $0.2181

Cost Savings Analysis:
  Actual Cost: $5.2340
  Cloud Baseline Cost: $18.7650
  Total Savings: $13.5310 (72.1%)
  Local Requests: 892 (71.5%)
  Cloud Requests: 356 (28.5%)

By Provider:
  🏠 ruvllm:
    Requests: 892
    Tokens: 2,234,567
    Cost: $0.0000
    Avg Cost/Request: $0.000000
    Top Model: meta-llama/llama-3.1-8b-instruct

  ☁️ anthropic:
    Requests: 245
    Tokens: 891,234
    Cost: $4.5678
    Avg Cost/Request: $0.018644
    Top Model: claude-sonnet-4-5-20250929

  ☁️ openrouter:
    Requests: 111
    Tokens: 330,988
    Cost: $0.6662
    Avg Cost/Request: $0.006002
    Top Model: meta-llama/llama-3.1-70b-instruct
```

### JSON Format

```json
{
  "timestamp": "2025-12-15T23:59:59Z",
  "period": {
    "start": "2025-12-15T00:00:00Z",
    "end": "2025-12-15T23:59:59Z"
  },
  "overall": {
    "totalRequests": 1248,
    "totalTokens": 3456789,
    "totalCost": 5.234,
    "requestsPerHour": 52.0,
    "costPerHour": 0.2181
  },
  "savings": {
    "actualCost": 5.234,
    "cloudBaselineCost": 18.765,
    "totalSavings": 13.531,
    "savingsPercentage": 72.1,
    "localRequestPercentage": 71.5,
    "cloudRequestPercentage": 28.5,
    "localRequests": 892,
    "cloudRequests": 356,
    "totalRequests": 1248
  },
  "byProvider": {
    "ruvllm": {
      "provider": "ruvllm",
      "providerType": "local",
      "requestCount": 892,
      "inputTokens": 1489711,
      "outputTokens": 744856,
      "totalTokens": 2234567,
      "totalCost": 0,
      "avgCostPerRequest": 0,
      "topModel": "meta-llama/llama-3.1-8b-instruct",
      "modelCounts": {
        "meta-llama/llama-3.1-8b-instruct": 892
      }
    },
    "anthropic": {
      "provider": "anthropic",
      "providerType": "cloud",
      "requestCount": 245,
      "inputTokens": 594156,
      "outputTokens": 297078,
      "totalTokens": 891234,
      "totalCost": 4.5678,
      "avgCostPerRequest": 0.018644,
      "topModel": "claude-sonnet-4-5-20250929",
      "modelCounts": {
        "claude-sonnet-4-5-20250929": 187,
        "claude-3-5-haiku-20241022": 58
      }
    },
    "openrouter": {
      "provider": "openrouter",
      "providerType": "cloud",
      "requestCount": 111,
      "inputTokens": 220659,
      "outputTokens": 110329,
      "totalTokens": 330988,
      "totalCost": 0.6662,
      "avgCostPerRequest": 0.006002,
      "topModel": "meta-llama/llama-3.1-70b-instruct",
      "modelCounts": {
        "meta-llama/llama-3.1-70b-instruct": 111
      }
    }
  }
}
```

### Detailed Format

```
Inference Cost Report (Detailed)
================================

Period: 2025-12-15T00:00:00Z to 2025-12-15T23:59:59Z

Recent Requests (Last 20):

[2025-12-15T23:58:45Z] ruvllm/meta-llama/llama-3.1-8b-instruct
  Agent: qe-test-generator
  Tokens: 1,234 input / 567 output = 1,801 total
  Cost: $0.0000

[2025-12-15T23:57:23Z] anthropic/claude-sonnet-4-5-20250929
  Agent: qe-quality-gate
  Task: quality-check-456
  Tokens: 3,456 input / 1,789 output = 5,245 total
  Cost: $0.0372

[2025-12-15T23:56:12Z] ruvllm/meta-llama/llama-3.1-8b-instruct
  Agent: qe-test-executor
  Task: test-run-789
  Tokens: 876 input / 432 output = 1,308 total
  Cost: $0.0000

... (17 more)

Provider Summary:
  🏠 Local (ruvllm, onnx): 892 requests (71.5%)
  ☁️ Cloud (anthropic, openrouter, openai): 356 requests (28.5%)

Cost Optimization Recommendations:
  ✓ Excellent local inference usage (71.5%)
  ✓ Saving $13.53 per day vs full cloud inference
  💡 Consider migrating more quality-gate checks to local inference
  💡 Estimated monthly savings: $405.93
```

## Memory Operations

### Input Memory Keys

```bash
# Retrieve stored cost data
npx claude-flow@alpha memory retrieve --key "aqe/costs/tracker-data"

# Retrieve previous cost reports
npx claude-flow@alpha memory retrieve --key "aqe/costs/reports/latest"
```

### Output Memory Keys

```bash
# Store cost report
npx claude-flow@alpha memory store \
  --key "aqe/costs/reports/${timestamp}" \
  --value '{"totalCost": 5.234, "savings": 13.531}'

# Store cost optimization recommendations
npx claude-flow@alpha memory store \
  --key "aqe/costs/recommendations" \
  --value '[{"action": "migrate-to-local", "potentialSavings": 13.53}]'
```

## Cost Tracking API

### Track Inference Request

```typescript
import { getInferenceCostTracker } from 'agentic-qe/core/metrics';

const tracker = getInferenceCostTracker();

// Track local inference (free)
tracker.trackRequest({
  provider: 'ruvllm',
  model: 'meta-llama/llama-3.1-8b-instruct',
  tokens: {
    inputTokens: 1000,
    outputTokens: 500,
    totalTokens: 1500,
  },
  agentId: 'qe-test-generator',
  taskId: 'task-123',
});

// Track cloud inference
tracker.trackRequest({
  provider: 'anthropic',
  model: 'claude-sonnet-4-5-20250929',
  tokens: {
    inputTokens: 2000,
    outputTokens: 1000,
    totalTokens: 3000,
  },
  agentId: 'qe-quality-gate',
});
```

### Get Cost Report

```typescript
import { getInferenceCostTracker, formatCostReport } from 'agentic-qe/core/metrics';

const tracker = getInferenceCostTracker();

// Get report for last 24 hours
const report = tracker.getCostReport();

// Format as text
const textReport = formatCostReport(report);
console.log(textReport);

// Get savings
console.log(`Total savings: $${report.savings.totalSavings.toFixed(2)}`);
console.log(`Savings rate: ${report.savings.savingsPercentage.toFixed(1)}%`);
```

## Cost Optimization Strategies

### 1. Maximize Local Inference

Route routine tasks to local inference:
- Test generation with predictable patterns
- Coverage analysis
- Simple quality checks

**Potential Savings:** Up to 90% cost reduction

### 2. Use Cloud for Complex Tasks

Reserve cloud inference for:
- Security scanning requiring latest threat intelligence
- Complex quality gate decisions
- High-stakes production validations

**Balance:** Quality vs Cost

### 3. Hybrid Approach

Implement fallback strategy:
```javascript
// Try local first, fallback to cloud if needed
async function generateTests(spec) {
  try {
    return await localInference(spec);
  } catch (err) {
    return await cloudInference(spec);
  }
}
```

**Result:** Optimal cost-quality balance

### 4. Monitor and Optimize

Regular cost reviews:
```bash
# Weekly review
aqe costs --period 7d --detailed

# Identify high-cost agents
# Migrate eligible workloads to local
```

**Target:** >70% local inference ratio

## Performance Characteristics

- **Time Complexity**: O(n) where n = number of tracked requests
- **Target Time**: <100ms for report generation
- **Memory Usage**: ~1KB per request (with TTL pruning)
- **Storage**: In-memory with 24-hour TTL (default)
- **Persistence**: Optional export to memory store

## Cost Estimation Models

### Local Inference (ruvllm, ONNX)
- **Cost**: $0.00 per token
- **Note**: Infrastructure costs (compute, storage) not included

### Cloud Inference

**Anthropic Claude Sonnet 4.5** (January 2025):
- Input: $3.00 per 1M tokens
- Output: $15.00 per 1M tokens
- Cache write: $3.75 per 1M tokens (25% premium)
- Cache read: $0.30 per 1M tokens (90% discount)

**OpenRouter** (99% savings vs Claude):
- Llama 3.1 8B: $0.03 input / $0.15 output per 1M tokens
- Llama 3.1 70B: $0.18 input / $0.90 output per 1M tokens

**OpenAI GPT-4 Turbo**:
- Input: $10.00 per 1M tokens
- Output: $30.00 per 1M tokens

## Use Cases

### Daily Cost Monitoring
```bash
aqe costs
# Quick check of daily costs and savings
```

### Monthly Budget Review
```bash
aqe costs --period 30d --format json > monthly-costs.json
# Export for finance review
```

### Cost Optimization Analysis
```bash
aqe costs --detailed
# Identify high-cost agents and tasks for optimization
```

### CI/CD Cost Tracking
```bash
aqe costs --period 1h --format json
# Track costs per CI/CD pipeline run
```

## Error Handling

### No Data Available

```bash
⚠️  No inference requests tracked in the specified period.

Use 'aqe costs --period all' to see all-time data.
```

**Solution:** Inference tracking may need to be enabled.

### Invalid Period

```bash
❌ Error: Invalid period '5y'

Valid periods: 1h, 24h, 7d, 30d, all
```

**Solution:** Use a supported time period.

### Provider Not Found

```bash
⚠️  Warning: No requests found for provider 'unknown'

Available providers: ruvllm, anthropic, openrouter, openai, onnx
```

**Solution:** Check provider name spelling.

## Integration with Other Commands

- `/aqe-fleet-status` - View agent status with cost attribution
- `/aqe-execute` - Track execution costs
- `/aqe-generate` - Track generation costs
- `/aqe-report` - Include cost analysis in quality reports

## Privacy and Security

- **No PII**: Cost data contains no prompt content or sensitive information
- **Aggregated Only**: Individual request details stored in memory only
- **TTL Protection**: Data automatically expires after retention period
- **Local Storage**: All data stored in local memory, not sent externally

## See Also

- `/aqe-fleet-status` - Fleet health and status
- `/aqe-report` - Quality reports
- `/aqe-benchmark` - Performance benchmarking
- [Pricing Configuration](../../src/telemetry/metrics/collectors/pricing-config.ts)
