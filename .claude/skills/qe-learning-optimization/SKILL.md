---
name: "qe-learning-optimization"
description: "Optimize QE agent performance with transfer learning, hyperparameter tuning, A/B testing, and continuous improvement loops. Use when tuning quality metrics or transferring knowledge between test agents."
---

# QE Learning Optimization

Optimize AI-powered testing agents through transfer learning, hyperparameter tuning, A/B experimentation, and feedback-driven continuous improvement.

## Quick Start

```bash
# Transfer knowledge between agents
aqe learn transfer --from jest-generator --to vitest-generator

# Tune hyperparameters
aqe learn tune --agent defect-predictor --metric accuracy

# Run A/B test
aqe learn ab-test --hypothesis "new-algorithm" --duration 7d

# View learning metrics
aqe learn metrics --agent test-generator --period 30d
```

## Workflow

### Step 1: Transfer Learning

Transfer patterns from one test framework agent to another.

```typescript
await transferSpecialist.transfer({
  source: {
    agent: 'qe-jest-generator',
    knowledge: ['patterns', 'heuristics', 'optimizations']
  },
  target: {
    agent: 'qe-vitest-generator',
    adaptations: ['framework-syntax', 'api-differences']
  },
  strategy: 'fine-tuning',
  validation: {
    testSet: 'validation-samples',
    minAccuracy: 0.9
  }
});
```

**Checkpoint:** Verify transfer accuracy >= 90% on validation set.

### Step 2: Hyperparameter Tuning

Run Bayesian optimization over agent parameters.

```typescript
await metricsOptimizer.tune({
  agent: 'defect-predictor',
  parameters: {
    learningRate: { min: 0.001, max: 0.1, type: 'log' },
    batchSize: { values: [16, 32, 64, 128] },
    patternThreshold: { min: 0.5, max: 0.95 }
  },
  optimization: {
    method: 'bayesian',
    objective: 'accuracy',
    trials: 50,
    parallelism: 4
  }
});
```

**Checkpoint:** Confirm accuracy improves > 5% over baseline before deploying.

### Step 3: A/B Testing

Compare algorithm variants with statistical rigor.

```typescript
await metricsOptimizer.abTest({
  hypothesis: 'ML pattern matching improves test quality',
  variants: {
    control: { algorithm: 'rule-based' },
    treatment: { algorithm: 'ml-enhanced' }
  },
  metrics: ['test-quality-score', 'generation-time'],
  traffic: { split: 50, minSampleSize: 1000 },
  duration: '7d',
  significance: 0.05
});
```

**Checkpoint:** Wait for statistical significance (p < 0.05) before concluding.

### Step 4: Feedback Loop

Wire real-time feedback into agent learning.

```typescript
await metricsOptimizer.feedbackLoop({
  agent: 'test-generator',
  feedback: {
    sources: ['user-corrections', 'test-results', 'code-reviews'],
    aggregation: 'weighted',
    frequency: 'real-time'
  },
  learning: {
    strategy: 'incremental',
    validationSplit: 0.2,
    earlyStoppingPatience: 5
  }
});
```

## Cross-Framework Transfer Mappings

```yaml
jest_to_vitest:
  syntax:
    "jest.mock": "vi.mock"
    "jest.fn": "vi.fn"
  patterns: [mock-module, async-testing, snapshot-testing]

mocha_to_jest:
  syntax:
    "chai.expect": "expect"
    "sinon.stub": "jest.fn"
  adaptations: [assertion-style, hook-naming]
```

## Continuous Improvement Schedule

| Cadence | Action | Auto |
|---------|--------|------|
| Hourly | Collect metrics | Yes |
| Weekly | Tune parameters | Yes |
| Monthly | Major model updates | Requires approval |

Degradation alert triggers at 5% decline. Auto-rollback enabled.

## Coordination

**Primary Agents**: qe-transfer-specialist, qe-metrics-optimizer, qe-pattern-learner
**Related Skills**: qe-test-generation, qe-defect-intelligence
