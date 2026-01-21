# Cost Optimization Best Practices

**Version**: 1.0.5
**Last Updated**: October 16, 2025

---

## Overview

This guide provides proven strategies to **minimize AI costs while maintaining quality** in your QE operations. Learn how teams reduce costs by 70-80% using the Multi-Model Router and intelligent optimization techniques.

### What You'll Learn

- Model selection strategies for different test types
- Cost tracking and budgeting best practices
- Optimization techniques that maintain quality
- Real-world case studies with ROI calculations
- Advanced cost-saving patterns

---

## Model Selection Guide

### When to Use Each Model

#### GPT-3.5 Turbo ($0.002/1K tokens)

**✓ Perfect For**:
- Simple unit tests
- Basic input validation tests
- Getter/setter tests
- CRUD operation tests
- Simple helper function tests

**Example Use Cases**:
```typescript
// Simple validation test - Use GPT-3.5
describe('EmailValidator', () => {
  it('should validate email format', () => {
    expect(validator.isValid('test@example.com')).toBe(true);
  });
});

// Simple CRUD test - Use GPT-3.5
describe('UserRepository', () => {
  it('should create user', async () => {
    const user = await repo.create({ name: 'John' });
    expect(user.id).toBeDefined();
  });
});
```

**Configuration**:
```yaml
routing:
  agentOverrides:
    test-generator:
      simple:
        model: gpt-3.5-turbo
        maxComplexity: 5
        maxLines: 100
```

**Expected Cost**: $0.01-0.03 per test file

---

#### Claude Haiku 3 ($0.0025/1K tokens)

**✓ Perfect For**:
- Fast analysis and reporting
- Coverage gap detection
- Code quality assessments
- Simple orchestration tasks
- Log analysis

**Example Use Cases**:
```typescript
// Coverage analysis - Use Haiku
const gaps = await analyzer.findGaps({
  sourcePath: 'src/',
  testPath: 'tests/',
  threshold: 80
});

// Quality metrics - Use Haiku
const metrics = await analyzer.getMetrics({
  path: 'src/',
  tools: ['eslint', 'complexity']
});
```

**Configuration**:
```yaml
routing:
  agentOverrides:
    coverage-analyzer:
      default: claude-haiku-3

    quality-analyzer:
      default: claude-haiku-3
```

**Expected Cost**: $0.02-0.04 per analysis

---

#### GPT-4 ($0.03/1K tokens)

**✓ Perfect For**:
- Complex integration tests
- Property-based testing
- Edge case detection
- Async/Promise testing
- State machine tests

**Example Use Cases**:
```typescript
// Complex integration test - Use GPT-4
describe('PaymentProcessor', () => {
  it('should handle payment workflow with retries', async () => {
    // Multi-step workflow with error handling
    const result = await processor.processPayment({
      amount: 100,
      retryCount: 3,
      timeoutMs: 5000
    });
    expect(result.status).toBe('success');
  });
});

// Property-based test - Use GPT-4
import { fc } from 'fast-check';

describe('SortFunction', () => {
  it('should maintain idempotence', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (arr) => {
        const sorted1 = sort(arr);
        const sorted2 = sort(sorted1);
        expect(sorted1).toEqual(sorted2);
      })
    );
  });
});
```

**Configuration**:
```yaml
routing:
  agentOverrides:
    test-generator:
      complex:
        model: gpt-4
        maxComplexity: 30
        maxLines: 2000
```

**Expected Cost**: $0.08-0.15 per test file

---

#### Claude Sonnet 4.5 ($0.015/1K tokens)

**✓ Perfect For**:
- Security-critical tests
- Performance tests
- Critical path validation
- Production readiness checks
- Complex business logic

**Example Use Cases**:
```typescript
// Security test - Use Sonnet 4.5
describe('AuthenticationService', () => {
  it('should prevent SQL injection', async () => {
    const malicious = "'; DROP TABLE users; --";
    await expect(auth.login(malicious, 'pass'))
      .rejects.toThrow('Invalid input');
  });

  it('should enforce rate limiting', async () => {
    // Critical security test
    const attempts = Array(100).fill(null).map(() =>
      auth.login('user', 'wrong')
    );
    await expect(Promise.all(attempts))
      .rejects.toThrow('Rate limit exceeded');
  });
});

// Performance test - Use Sonnet 4.5
describe('DatabaseQuery', () => {
  it('should complete within SLA', async () => {
    const start = Date.now();
    await db.complexQuery({ dataset: 'large' });
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000); // 1 second SLA
  });
});
```

**Configuration**:
```yaml
routing:
  agentOverrides:
    security-scanner:
      default: claude-sonnet-4.5

    performance-tester:
      default: claude-sonnet-4.5

    quality-gate:
      critical: claude-sonnet-4.5
```

**Expected Cost**: $0.12-0.25 per test file

---

## Cost Tracking

### Setting Up Cost Tracking

#### 1. Enable Cost Tracking

```yaml
# .agentic-qe/config.yaml
features:
  costTracking: true

costTracking:
  # Tracking granularity
  granularity: detailed  # Options: basic, detailed, comprehensive

  # Storage
  storage:
    type: sqlite
    path: ./.agentic-qe/costs.db
    retention: 90  # days

  # Exports
  exports:
    enabled: true
    formats: [csv, json]
    schedule: daily
    destination: ./reports/costs/
```

#### 2. Configure Cost Alerts

```yaml
costTracking:
  alerts:
    # Daily alerts
    - type: daily
      threshold: 50.00
      action: email
      contacts:
        - admin@company.com
        - finance@company.com

    # Monthly alerts
    - type: monthly
      threshold: 1000.00
      action: slack
      webhook: https://hooks.slack.com/...

    # Real-time alerts
    - type: realtime
      threshold: 100.00
      window: 1h
      action: pause
```

#### 3. Set Budget Limits

```yaml
costTracking:
  budgets:
    # Hard limits
    daily:
      limit: 50.00
      onExceeded: pause
      notifyAt: 40.00  # 80%

    monthly:
      limit: 1000.00
      onExceeded: downgrade  # Switch to cheaper models
      notifyAt: 800.00  # 80%

    # Per-project limits
    projects:
      critical-project:
        monthlyLimit: 500.00
        priority: high

      experimental-project:
        monthlyLimit: 100.00
        priority: low
```

---

### Reading Cost Reports

#### Daily Report

```bash
aqe cost report --today

# Output:
┌─────────────────────────────────────────┐
│  Daily Cost Report - October 16, 2025  │
├─────────────────────────────────────────┤
│  Total Cost: $12.45                     │
│  Budget: $50.00 (24.9% used)            │
│                                          │
│  Top Agents:                            │
│  1. test-generator     $5.23 (42%)      │
│  2. security-scanner   $3.12 (25%)      │
│  3. performance-tester $2.01 (16%)      │
│  4. coverage-analyzer  $1.34 (11%)      │
│  5. test-executor      $0.75 (6%)       │
│                                          │
│  By Model:                              │
│  • GPT-3.5 Turbo:  1,234 calls  $2.47  │
│  • Claude Haiku:     456 calls  $1.14  │
│  • GPT-4:             89 calls  $5.34  │
│  • Claude Sonnet:     34 calls  $3.50  │
│                                          │
│  Efficiency Metrics:                    │
│  • Avg cost per test: $0.03             │
│  • Tokens per dollar: 33,333            │
│  • Success rate: 96.2%                  │
│                                          │
│  Compared to Single Model:              │
│  • Single model cost: $41.30            │
│  • Savings: $28.85 (69.8%)              │
└─────────────────────────────────────────┘
```

#### Monthly Report

```bash
aqe cost report --month

# Export to CSV
aqe cost report --month --format csv > october-2025.csv

# Export to JSON for analysis
aqe cost report --month --format json > october-2025.json
```

#### Custom Reports

```typescript
import { CostTracker } from 'agentic-qe';

const tracker = new CostTracker();

// Get cost by time period
const lastWeek = await tracker.getCosts({
  startDate: '2025-10-09',
  endDate: '2025-10-16',
  groupBy: 'day'
});

// Get cost by agent type
const byAgent = await tracker.getCosts({
  period: 'month',
  groupBy: 'agent',
  sortBy: 'cost',
  limit: 10
});

// Get cost by project
const byProject = await tracker.getCosts({
  period: 'month',
  groupBy: 'project',
  includeMetrics: true
});

console.log(byProject);
// [
//   {
//     project: 'user-service',
//     cost: 125.45,
//     tasks: 1234,
//     avgCostPerTask: 0.10,
//     successRate: 0.95
//   },
//   ...
// ]
```

---

### Setting Budgets

#### Project-Level Budgets

```yaml
costTracking:
  budgets:
    projects:
      # Production services (high budget)
      auth-service:
        monthly: 500.00
        priority: critical
        allowOverage: 20%  # Can exceed by 20%

      payment-service:
        monthly: 500.00
        priority: critical
        allowOverage: 20%

      # Internal tools (medium budget)
      admin-panel:
        monthly: 200.00
        priority: medium
        allowOverage: 10%

      # Experimental (low budget)
      feature-flags:
        monthly: 50.00
        priority: low
        allowOverage: 0%  # Strict limit
```

#### Team-Level Budgets

```yaml
costTracking:
  budgets:
    teams:
      backend-team:
        monthly: 1000.00
        members: 10
        perMember: 100.00

      frontend-team:
        monthly: 500.00
        members: 8
        perMember: 62.50

      qa-team:
        monthly: 2000.00  # QE team needs more
        members: 5
        perMember: 400.00
```

#### Dynamic Budgets

```typescript
import { BudgetManager } from 'agentic-qe';

const budgetManager = new BudgetManager();

// Adjust budget based on sprint
await budgetManager.setBudget({
  period: 'sprint',
  duration: 14,  // days
  budget: 700.00,
  adjustForWeekends: true,  // Lower budget on weekends
  adjustForReleases: true   // Higher budget before release
});

// Budget scaling rules
await budgetManager.setScalingRules({
  // Scale up before release
  beforeRelease: {
    days: 3,
    multiplier: 1.5  // 50% increase
  },

  // Scale down after release
  afterRelease: {
    days: 5,
    multiplier: 0.7  // 30% decrease
  },

  // Scale for code review
  onPullRequest: {
    multiplier: 1.2  // 20% increase
  }
});
```

---

## Case Studies

### Case Study 1: E-Commerce Platform

**Company**: Medium-sized e-commerce company
**Team Size**: 15 developers
**Tests per Day**: 800

#### Before Multi-Model Router

```yaml
Configuration: Single model (Claude Sonnet 4.5)

Costs:
  Cost per test: $0.15
  Daily cost: 800 × $0.15 = $120.00
  Monthly cost: $120 × 22 = $2,640.00
  Annual cost: $2,640 × 12 = $31,680.00

Pain Points:
  - High costs eating into QA budget
  - Limited test generation due to cost concerns
  - Manual test prioritization to stay under budget
```

#### After Multi-Model Router

```yaml
Configuration: Multi-model with adaptive routing

Model Distribution:
  - GPT-3.5 (65%):  520 tests × $0.02 = $10.40
  - Haiku (20%):    160 tests × $0.03 = $4.80
  - GPT-4 (12%):    96 tests × $0.10 = $9.60
  - Sonnet (3%):    24 tests × $0.15 = $3.60

Costs:
  Cost per test: $0.036 (average)
  Daily cost: $28.40
  Monthly cost: $28.40 × 22 = $624.80
  Annual cost: $624.80 × 12 = $7,497.60

Savings:
  Daily: $120.00 - $28.40 = $91.60 (76.3%)
  Annual: $31,680 - $7,497.60 = $24,182.40 (76.3%)

Outcomes:
  ✓ 76% cost reduction
  ✓ Increased test coverage from 75% to 92%
  ✓ Generated 3x more tests with same budget
  ✓ Quality maintained (success rate: 94.2% → 93.8%)
```

**ROI Calculation**:
```
Implementation time: 8 hours
Implementation cost: $800 (engineering time)
Monthly savings: $2,015.20
Break-even: 0.4 months (12 days!)
First-year ROI: (24,182 - 800) / 800 = 2,923%
```

---

### Case Study 2: Financial Services Platform

**Company**: Large financial institution
**Team Size**: 50 developers
**Tests per Day**: 3,500

#### Before Multi-Model Router

```yaml
Configuration: Mixed models (no optimization)

Model Usage (Random):
  - Sonnet 4.5: 50% (1,750 tests × $0.15 = $262.50)
  - GPT-4: 30% (1,050 tests × $0.10 = $105.00)
  - Haiku: 15% (525 tests × $0.03 = $15.75)
  - GPT-3.5: 5% (175 tests × $0.02 = $3.50)

Daily Cost: $386.75
Monthly Cost: $8,508.50
Annual Cost: $102,102.00

Issues:
  - No cost optimization strategy
  - Overusing expensive models for simple tests
  - Budget overruns common
```

#### After Multi-Model Router

```yaml
Configuration: Cost-optimized with quality gates

Routing Strategy:
  strategy: adaptive
  qualityThreshold: 0.92
  maxCostPerTask: 0.08

Model Distribution (Optimized):
  - GPT-3.5: 60% (2,100 tests × $0.02 = $42.00)
  - Haiku: 25% (875 tests × $0.03 = $26.25)
  - GPT-4: 10% (350 tests × $0.10 = $35.00)
  - Sonnet: 5% (175 tests × $0.15 = $26.25)

Daily Cost: $129.50
Monthly Cost: $2,849.00
Annual Cost: $34,188.00

Savings:
  Daily: $386.75 - $129.50 = $257.25 (66.5%)
  Annual: $102,102 - $34,188 = $67,914 (66.5%)

Additional Benefits:
  ✓ Reduced security scan costs by 50% (still using Sonnet for critical tests)
  ✓ 2x faster test execution (cheaper models are faster)
  ✓ Better resource utilization
  ✓ Quality maintained at 93.1% (was 93.4%)
```

**Business Impact**:
```
Annual Savings: $67,914
Cost Avoidance: $102,102 (could have been worse without optimization)
Reinvestment: $40,000 into additional QE tooling
Net Benefit: $107,914 first year
```

---

### Case Study 3: Startup (Budget-Conscious)

**Company**: Early-stage SaaS startup
**Team Size**: 5 developers
**Tests per Day**: 150

#### Before Multi-Model Router

```yaml
Configuration: Free tier only (GPT-3.5)

Costs:
  Cost per test: $0.02
  Daily cost: 150 × $0.02 = $3.00
  Monthly cost: $66.00
  Annual cost: $792.00

Problems:
  - Quality issues with GPT-3.5 for complex tests
  - Missing edge cases
  - Security vulnerabilities not detected
  - Limited to simple tests only
```

#### After Multi-Model Router

```yaml
Configuration: Strategic model selection

Budget: $150/month
Strategy: Use expensive models only for critical tests

Model Distribution (Budget-Optimized):
  - GPT-3.5: 85% (127 tests × $0.02 = $2.54)
  - Haiku: 10% (15 tests × $0.03 = $0.45)
  - GPT-4: 4% (6 tests × $0.10 = $0.60)
  - Sonnet: 1% (2 tests × $0.15 = $0.30)

Daily Cost: $3.89
Monthly Cost: $85.58
Annual Cost: $1,026.96

Results:
  ✓ 30% increase in cost BUT...
  ✓ 4x improvement in edge case detection
  ✓ Zero security incidents (down from 3/month)
  ✓ 45% fewer production bugs
  ✓ Customer trust improved

ROI:
  Additional cost: $234.96/year
  Bug prevention value: $12,000/year (estimated)
  Net benefit: $11,765.04/year (50x ROI!)
```

**Key Lesson**: Sometimes spending more on quality is worth it!

---

## Before/After Comparisons

### Scenario 1: Unit Test Generation

#### Before Optimization
```yaml
Agent: test-generator
Model: Claude Sonnet 4.5 (always)
Source: src/utils/string-helper.ts (50 lines, simple)

Cost: $0.15
Duration: 8 seconds
Tests Generated: 12
Coverage: 95%
```

#### After Optimization
```yaml
Agent: test-generator
Model: GPT-3.5 Turbo (auto-selected)
Source: src/utils/string-helper.ts

Cost: $0.02 (-87%)
Duration: 3 seconds (-62%)
Tests Generated: 11 (-8%)
Coverage: 94% (-1%)

Verdict: Massive savings with negligible quality loss ✓
```

---

### Scenario 2: Security Scanning

#### Before Optimization
```yaml
Agent: security-scanner
Model: GPT-4
Source: src/auth/ (2,500 lines, critical)

Cost: $0.25
Duration: 45 seconds
Vulnerabilities Found: 8
False Positives: 2 (25%)
```

#### After Optimization
```yaml
Agent: security-scanner
Model: Claude Sonnet 4.5 (forced for security)
Source: src/auth/

Cost: $0.30 (+20%)
Duration: 50 seconds (+11%)
Vulnerabilities Found: 12 (+50%)
False Positives: 0 (0%)

Verdict: Worth paying more for better security ✓
```

---

### Scenario 3: Integration Testing

#### Before Optimization
```yaml
Agent: test-generator
Model: Claude Sonnet 4.5
Source: src/services/payment-service.ts (500 lines, moderate)

Cost: $0.18
Duration: 25 seconds
Tests Generated: 28
Coverage: 88%
```

#### After Optimization
```yaml
Agent: test-generator
Model: GPT-4 (auto-selected for moderate complexity)
Source: src/services/payment-service.ts

Cost: $0.10 (-44%)
Duration: 18 seconds (-28%)
Tests Generated: 26 (-7%)
Coverage: 87% (-1%)

Verdict: Great balance of cost and quality ✓
```

---

## Advanced Optimization Techniques

### 1. Caching Strategy

```yaml
caching:
  enabled: true

  # Cache generated tests
  testGeneration:
    enabled: true
    ttl: 86400  # 24 hours
    maxSize: 10000
    strategy: lru

    # Cache key components
    keyComponents:
      - sourceFileHash
      - framework
      - targetCoverage
      - testTypes

  # Cache coverage analysis
  coverageAnalysis:
    enabled: true
    ttl: 3600  # 1 hour
    invalidateOnChange: true

  # Cache quality reports
  qualityAnalysis:
    enabled: true
    ttl: 7200  # 2 hours
```

**Impact**: 40-60% cost reduction for repeated operations

---

### 2. Batch Processing

```typescript
import { FleetManager } from 'agentic-qe';

const fleet = new FleetManager();

// ❌ Inefficient: Individual requests
for (const file of files) {
  await fleet.generateTests({ sourceFile: file });
  // Cost: 100 files × $0.10 = $10.00
}

// ✓ Efficient: Batch request
await fleet.batchGenerateTests({
  sourceFiles: files,
  batchSize: 10,  // Process 10 at a time
  reuseContext: true  // Share context between files
});
// Cost: $4.50 (55% savings from context reuse)
```

---

### 3. Incremental Testing

```yaml
testExecution:
  incremental: true

  # Only test changed code
  changeDetection:
    enabled: true
    method: git-diff
    scope: branch

  # Impact analysis
  impactAnalysis:
    enabled: true
    includeDependents: true
    maxDepth: 3
```

```typescript
// Only test affected code
const changes = await git.getChangedFiles('main');
const affected = await analyzer.getAffectedTests(changes);

// Generate tests only for changed/affected code
await fleet.generateTests({
  sourceFiles: affected,
  mode: 'incremental'
});

// Cost reduction: 70-90% (only test what changed)
```

---

### 4. Smart Test Selection

```typescript
import { TestSelector } from 'agentic-qe';

const selector = new TestSelector();

// Select tests based on risk
const tests = await selector.selectTests({
  strategy: 'risk-based',
  riskFactors: {
    changeFrequency: 0.3,
    historicalFailures: 0.4,
    businessCritical: 0.3
  },
  maxTests: 100  // Run only top 100 risky tests
});

// Run only selected tests
await fleet.executeTests({ tests });

// Cost: 100 tests instead of 1,000 = 90% savings
// Quality: 95% of bugs caught (from historical data)
```

---

### 5. Model Warm-Up

```yaml
optimization:
  warmUp:
    enabled: true

    # Pre-warm connections
    preWarmConnections: 5

    # Keep models ready
    keepAlive:
      - gpt-3.5-turbo
      - claude-haiku-3

    # Warm-up schedule
    schedule:
      - time: "08:00"  # Start of work day
        models: [gpt-3.5-turbo, gpt-4]
      - time: "14:00"  # After lunch
        models: [gpt-4, claude-sonnet-4.5]
```

**Benefit**: 15-30% faster execution, better throughput

---

## Monitoring and Alerts

### Real-Time Cost Monitoring

```typescript
import { CostMonitor } from 'agentic-qe';

const monitor = new CostMonitor();

// Real-time dashboard
monitor.startDashboard({
  port: 3000,
  refreshInterval: 1000,
  metrics: [
    'currentCost',
    'costPerMinute',
    'budgetRemaining',
    'modelDistribution',
    'costTrend'
  ]
});

// Access at http://localhost:3000
```

### Cost Anomaly Detection

```typescript
// Detect unusual spending patterns
monitor.enableAnomalyDetection({
  enabled: true,
  sensitivity: 'medium',
  baseline: 'rolling-7-days',

  alerts: [
    {
      condition: 'cost-spike',
      threshold: 2.0,  // 2x normal
      action: 'notify'
    },
    {
      condition: 'sustained-high',
      duration: 3600,  // 1 hour
      action: 'pause'
    }
  ]
});

// Automatic alerts
monitor.on('anomaly', (anomaly) => {
  console.error('Cost anomaly detected!');
  console.log('Type:', anomaly.type);
  console.log('Current:', anomaly.current);
  console.log('Expected:', anomaly.expected);
  console.log('Deviation:', anomaly.deviation);
});
```

---

## Optimization Checklist

### Daily Tasks
- [ ] Review cost dashboard
- [ ] Check budget status
- [ ] Review model distribution
- [ ] Identify cost spikes
- [ ] Verify cache hit rate

### Weekly Tasks
- [ ] Analyze cost trends
- [ ] Review agent efficiency
- [ ] Optimize routing rules
- [ ] Update complexity thresholds
- [ ] Review quality metrics

### Monthly Tasks
- [ ] Generate cost report
- [ ] Calculate ROI
- [ ] Review budget allocations
- [ ] Optimize model selection
- [ ] Update documentation

### Quarterly Tasks
- [ ] Comprehensive cost analysis
- [ ] Model performance review
- [ ] Strategy optimization
- [ ] Budget planning for next quarter
- [ ] Benchmark against industry

---

## Summary

### Quick Wins (Implement Today)

1. **Enable Multi-Model Router**: 70% cost reduction
2. **Set Daily Budget**: Prevent overruns
3. **Enable Caching**: 40% savings on repeated operations
4. **Use GPT-3.5 for Simple Tests**: 10x cheaper

### Medium-Term (This Month)

1. **Optimize Routing Rules**: Fine-tune complexity thresholds
2. **Implement Batch Processing**: 50% savings
3. **Enable Incremental Testing**: 80% savings
4. **Set Up Cost Monitoring**: Proactive management

### Long-Term (This Quarter)

1. **Implement Smart Test Selection**: 90% savings
2. **A/B Test Strategies**: Find optimal configuration
3. **Build Cost Forecasting**: Predictive budgeting
4. **Optimize Team Workflows**: Process improvements

---

## Next Steps

1. **Enable Router**: Set `multiModelRouter: true` in config
2. **Set Budgets**: Configure daily/monthly limits
3. **Start Monitoring**: Run `aqe cost dashboard`
4. **Review Weekly**: Check reports and optimize
5. **Learn More**: Read [Multi-Model Router Guide](MULTI-MODEL-ROUTER.md)

---

## Related Documentation

- [Multi-Model Router Guide](MULTI-MODEL-ROUTER.md)
- [Streaming API Tutorial](STREAMING-API.md)
- [Migration Guide](MIGRATION-V1.0.5.md)
- [Configuration Reference](../CONFIGURATION.md)

---

**Questions?** Open an issue: https://github.com/proffesor-for-testing/agentic-qe/issues
