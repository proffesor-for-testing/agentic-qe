# Multi-Model Router (ADR-051)

Enhanced model routing system with 5-tier hierarchy, complexity analysis, and budget enforcement.

## Overview

The Multi-Model Router extends ADR-026's 3-tier system to provide intelligent routing across 5 capability tiers:

| Tier | Name | Latency | Cost | Use Cases |
|------|------|---------|------|-----------|
| **0** | Agent Booster | <1ms | $0 | Mechanical transforms (var→const, add-types) |
| **1** | Haiku | ~500ms | Low | Simple tasks, bug fixes, documentation |
| **2** | Sonnet | 2-5s | Medium | Feature implementation, complex refactoring |
| **3** | Sonnet Extended | 5-10s | High | Multi-step workflows, orchestration |
| **4** | Opus | 3-5s | Highest | Architecture decisions, security audits |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ModelRouter                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  1. Receive RoutingInput                             │  │
│  │     - Task description                               │  │
│  │     - Code context (optional)                        │  │
│  │     - Manual tier override (optional)                │  │
│  └──────────────────────────────────────────────────────┘  │
│                            ↓                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  2. ComplexityAnalyzer.analyze()                     │  │
│  │     - Keyword pattern matching                       │  │
│  │     - Code metrics (LOC, cyclomatic complexity)      │  │
│  │     - Scope detection (architecture, security)       │  │
│  │     - Agent Booster eligibility check                │  │
│  │     → ComplexityScore (0-100)                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                            ↓                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  3. Tier Recommendation                              │  │
│  │     0-10:   Tier 0 (Agent Booster)                   │  │
│  │     10-35:  Tier 1 (Haiku)                           │  │
│  │     35-70:  Tier 2 (Sonnet)                          │  │
│  │     60-85:  Tier 3 (Sonnet Extended)                 │  │
│  │     75-100: Tier 4 (Opus)                            │  │
│  └──────────────────────────────────────────────────────┘  │
│                            ↓                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  4. BudgetEnforcer.checkBudget()                     │  │
│  │     - Verify daily cost limit                        │  │
│  │     - Verify requests/hour limit                     │  │
│  │     - Verify requests/day limit                      │  │
│  │     - Apply downgrade if budget exceeded             │  │
│  │     → BudgetDecision (allowed/downgraded/error)      │  │
│  └──────────────────────────────────────────────────────┘  │
│                            ↓                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  5. Return RoutingDecision                           │  │
│  │     - Selected tier and model ID                     │  │
│  │     - Complexity analysis                            │  │
│  │     - Budget decision                                │  │
│  │     - Confidence score                               │  │
│  │     - Rationale and warnings                         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. ComplexityAnalyzer

Analyzes task complexity using multiple signals:

**Code Complexity Signals (0-100):**
- Lines of code (0-30 points)
- File count (0-20 points)
- Cyclomatic complexity (0-30 points)
- Language complexity (0-20 points)

**Reasoning Complexity Signals (0-100):**
- Keyword matches (0-60 points)
- Multi-step reasoning requirements (0-20 points)
- Creativity requirements (0-20 points)

**Scope Complexity Signals (0-100):**
- Architecture scope (0-40 points)
- Security scope (0-30 points)
- Cross-domain coordination (0-20 points)
- Dependency count (0-10 points)

**Agent Booster Detection:**
- Keyword pattern matching for mechanical transforms
- Integration with Agent Booster adapter for opportunity detection
- Confidence thresholding (default: 0.7)

### 2. BudgetEnforcer

Enforces cost limits and tracks spending:

**Budget Limits:**
- Per-tier daily cost limit (USD)
- Per-tier requests per hour
- Per-tier requests per day
- Global daily cost limit across all tiers

**Enforcement Actions:**
- `error`: Throw BudgetExceededError
- `downgrade`: Auto-downgrade to cheaper tier
- `queue`: Queue request (not yet implemented)

**Warning Thresholds:**
- Default: 80% of budget triggers warning
- Configurable per deployment

**Critical Task Overrides:**
- Allow budget overrides for critical tasks
- Requires explicit `isCritical: true` flag

### 3. ModelRouter

Main routing orchestrator:

**Features:**
- Decision caching (default: 5 min TTL)
- Timeout protection (default: 10ms max decision time)
- Metrics tracking
- Fallback handling

**Decision Process:**
1. Check manual override (if allowed)
2. Analyze complexity
3. Recommend tier
4. Check budget
5. Apply downgrades if needed
6. Return decision with rationale

## Usage Examples

### Basic Routing

```typescript
import { createModelRouter } from '@integrations/agentic-flow/model-router';

const router = createModelRouter({
  enableAgentBooster: true,
  budgetConfig: {
    enabled: true,
    maxDailyCostUsd: 50.0,
  },
});

// Simple task
const decision1 = await router.route({
  task: 'Fix typo in documentation',
});
// → Tier 1 (Haiku)

// Complex task
const decision2 = await router.route({
  task: 'Design authentication system architecture',
  codeContext: existingAuthCode,
});
// → Tier 4 (Opus)

// Mechanical transform
const decision3 = await router.route({
  task: 'Convert var declarations to const',
  codeContext: 'var x = 1; var y = 2;',
});
// → Tier 0 (Agent Booster)
```

### Agent Booster Integration

```typescript
import { createModelRouterWithAgentBooster } from '@integrations/agentic-flow/model-router';

const router = await createModelRouterWithAgentBooster({
  agentBoosterThreshold: 0.7,
});

const decision = await router.route({
  task: 'Add TypeScript type annotations',
  codeContext: codeSnippet,
});

if (decision.agentBoosterEligible) {
  console.log('Tier 0: Agent Booster detected!');
  console.log(`Transform: ${decision.agentBoosterTransform}`);
  console.log(`Confidence: ${decision.confidence}`);
}
```

### Manual Override

```typescript
const decision = await router.route({
  task: 'Quick documentation update',
  manualTier: 4, // Force Opus
  isCritical: true, // Allow budget override
});

console.log(decision.rationale);
// "Manual override to Tier 4"
```

### Budget Configuration

```typescript
import { createModelRouter } from '@integrations/agentic-flow/model-router';

const router = createModelRouter({
  budgetConfig: {
    enabled: true,
    maxDailyCostUsd: 100.0,
    warningThreshold: 0.8,
    onBudgetExceeded: 'downgrade',
    onBudgetWarning: 'warn',
    allowCriticalOverrides: true,
    tierBudgets: {
      1: {
        tier: 1,
        maxCostPerRequest: 0.01,
        maxRequestsPerHour: 100,
        maxRequestsPerDay: 1000,
        maxDailyCostUsd: 5.0,
        enabled: true,
      },
      2: {
        tier: 2,
        maxCostPerRequest: 0.1,
        maxRequestsPerHour: 50,
        maxRequestsPerDay: 500,
        maxDailyCostUsd: 20.0,
        enabled: true,
      },
      // ... other tiers
    },
  },
});
```

### Metrics and Monitoring

```typescript
const metrics = router.getMetrics();

console.log(`Total decisions: ${metrics.totalDecisions}`);
console.log(`Avg decision time: ${metrics.avgDecisionTimeMs}ms`);
console.log(`P95 decision time: ${metrics.p95DecisionTimeMs}ms`);

// Agent Booster stats
console.log('Agent Booster:');
console.log(`  Eligible: ${metrics.agentBoosterStats.eligible}`);
console.log(`  Used: ${metrics.agentBoosterStats.used}`);
console.log(`  Success rate: ${metrics.agentBoosterStats.successRate}`);

// Budget stats
console.log('Budget:');
console.log(`  Total spent: $${metrics.budgetStats.totalSpentUsd.toFixed(2)}`);
console.log(`  Downgrades: ${metrics.budgetStats.downgradeCount}`);

// Per-tier metrics
for (const [tier, stats] of Object.entries(metrics.byTier)) {
  console.log(`Tier ${tier}:`);
  console.log(`  Selections: ${stats.selectionCount}`);
  console.log(`  Avg complexity: ${stats.avgComplexity.toFixed(1)}`);
  console.log(`  Success rate: ${(stats.successRate * 100).toFixed(1)}%`);
  console.log(`  Total cost: $${stats.totalCostUsd.toFixed(2)}`);
}
```

### Convenience Functions

```typescript
import {
  quickRoute,
  getTierRecommendation,
  checkAgentBoosterEligibility,
  estimateTaskCost,
} from '@integrations/agentic-flow/model-router';

// Quick routing without creating router instance
const decision = await quickRoute('Fix authentication bug', {
  codeContext: buggyCode,
  isCritical: true,
});

// Get tier recommendation only
const { tier, complexity, explanation } = await getTierRecommendation(
  'Refactor authentication module',
  authModuleCode
);

// Check Agent Booster eligibility
const { eligible, transformType, confidence } = await checkAgentBoosterEligibility(
  'Convert var to const',
  codeSnippet
);

// Estimate cost
const estimate = await estimateTaskCost('Implement OAuth2 flow');
console.log(`Estimated: $${estimate.recommendedCost.toFixed(4)} (Tier ${estimate.recommendedTier})`);
```

## Integration with Task Tool

```typescript
import { createModelRouter } from '@integrations/agentic-flow/model-router';

const router = createModelRouter();

// Before spawning agent via Task tool
const decision = await router.route({
  task: taskDescription,
  codeContext: fileContent,
  agentType: 'coder',
  domain: 'test-generation',
});

// Use recommended tier in Task tool
await Task({
  prompt: taskDescription,
  subagent_type: 'coder',
  model: decision.tier === 0 ? 'agent-booster' :
         decision.tier === 1 ? 'haiku' :
         decision.tier === 2 ? 'sonnet' :
         decision.tier === 3 ? 'sonnet' :
         'opus',
});

// Record actual cost after completion
await router.budgetEnforcer.recordCost(decision.tier, actualCost);
```

## Complexity Score Examples

**Tier 0 (0-10): Agent Booster**
```
Task: "Convert var declarations to const"
Signals:
  - isMechanicalTransform: true
  - detectedTransformType: 'var-to-const'
  - confidence: 0.95
Complexity: 5/100
```

**Tier 1 (10-35): Haiku**
```
Task: "Fix typo in variable name"
Signals:
  - linesOfCode: 15
  - fileCount: 1
  - keywordMatches.simple: ['fix', 'rename']
Complexity: 25/100
```

**Tier 2 (35-70): Sonnet**
```
Task: "Implement rate limiting for API endpoints"
Signals:
  - linesOfCode: 150
  - fileCount: 3
  - requiresMultiStepReasoning: true
  - keywordMatches.moderate: ['implement', 'api integration']
Complexity: 55/100
```

**Tier 3 (60-85): Sonnet Extended**
```
Task: "Orchestrate multi-service authentication flow"
Signals:
  - linesOfCode: 300
  - fileCount: 8
  - requiresMultiStepReasoning: true
  - requiresCrossDomainCoordination: true
  - keywordMatches.complex: ['orchestrate', 'multi-service']
Complexity: 75/100
```

**Tier 4 (75-100): Opus**
```
Task: "Design authentication system architecture for microservices"
Signals:
  - hasArchitectureScope: true
  - hasSecurityScope: true
  - requiresCreativity: true
  - keywordMatches.critical: ['architecture', 'design', 'security']
Complexity: 90/100
```

## Testing

```typescript
import { ModelRouter, ComplexityAnalyzer, BudgetEnforcer } from '@integrations/agentic-flow/model-router';

describe('ModelRouter', () => {
  it('should route simple task to Tier 1', async () => {
    const router = new ModelRouter();
    const decision = await router.route({
      task: 'Fix typo in documentation',
    });

    expect(decision.tier).toBe(1);
    expect(decision.complexityAnalysis.overall).toBeLessThan(35);
  });

  it('should detect Agent Booster eligibility', async () => {
    const router = await createModelRouterWithAgentBooster();
    const decision = await router.route({
      task: 'Convert var to const',
      codeContext: 'var x = 1;',
    });

    expect(decision.agentBoosterEligible).toBe(true);
    expect(decision.tier).toBe(0);
  });

  it('should enforce budget limits', async () => {
    const router = new ModelRouter({
      budgetConfig: {
        enabled: true,
        tierBudgets: {
          2: {
            tier: 2,
            maxDailyCostUsd: 0.01,
            maxRequestsPerDay: 1,
            enabled: true,
          },
        },
        onBudgetExceeded: 'downgrade',
      },
    });

    // First request should succeed
    const decision1 = await router.route({ task: 'Complex task' });
    expect(decision1.tier).toBe(2);

    // Second request should be downgraded
    const decision2 = await router.route({ task: 'Complex task' });
    expect(decision2.tier).toBeLessThan(2);
    expect(decision2.budgetDecision.wasDowngraded).toBe(true);
  });
});
```

## Performance

- **Decision time:** <10ms (cached: <1ms)
- **Agent Booster detection:** <5ms
- **Memory:** ~2MB baseline + cache
- **Throughput:** 1000+ decisions/second

## Configuration Reference

See `types.ts` for complete type definitions:

- `ModelRouterConfig`: Main router configuration
- `BudgetConfig`: Budget enforcement settings
- `TierBudget`: Per-tier budget limits
- `ComplexitySignals`: Detected complexity indicators
- `RoutingDecision`: Output decision format

## Error Handling

```typescript
import {
  ModelRouterError,
  BudgetExceededError,
  ComplexityAnalysisError,
  RoutingTimeoutError,
} from '@integrations/agentic-flow/model-router';

try {
  const decision = await router.route(input);
} catch (error) {
  if (error instanceof BudgetExceededError) {
    console.error('Budget exceeded:', error.tier, error.usage);
  } else if (error instanceof RoutingTimeoutError) {
    console.error('Routing timeout:', error.timeoutMs);
  } else if (error instanceof ComplexityAnalysisError) {
    console.error('Complexity analysis failed:', error.message);
  }
}
```

## Future Enhancements

1. **Learning-based routing:** Use historical success rates to refine tier selection
2. **Queue system:** Implement request queuing when budget exceeded
3. **Cost prediction:** ML-based cost estimation per task
4. **A/B testing:** Compare routing strategies
5. **Integration with claude-flow hooks:** Auto-report routing decisions

## References

- **ADR-051:** Multi-Model Router specification
- **ADR-026:** Original 3-tier model routing
- **Agent Booster:** `../agent-booster/README.md`
- **HybridRouter:** `../../../shared/llm/router/types.ts`
