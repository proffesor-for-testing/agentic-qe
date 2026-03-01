# QE RL Suite

Reinforcement Learning algorithms for Quality Engineering.

## Overview

Per ADR-040, this module implements 9 RL algorithms for QE-specific applications:

| Algorithm | Category | QE Application | Domain |
|-----------|----------|----------------|--------|
| Decision Transformer | Offline RL | Test case prioritization | test-execution |
| Q-Learning | Value-based | Coverage path optimization | coverage-analysis |
| SARSA | Value-based | Defect prediction sequencing | defect-intelligence |
| Actor-Critic | Policy-based | Quality gate threshold tuning | quality-assessment |
| Policy Gradient | Policy-based | Resource allocation | coordination |
| DQN | Value-based | Parallel execution scheduling | test-execution |
| PPO | Actor-Critic | Adaptive retry strategies | test-execution |
| A2C | Actor-Critic | Fleet coordination | coordination |
| DDPG | Deterministic | Continuous resource control | coordination |

## Quick Start

```typescript
import { createQERLSuite, RLState, RLAction } from '@v3/integrations/rl-suite';

// Create RL suite
const rlSuite = createQERLSuite();

// Make prediction
const state: RLState = {
  id: 'test-1',
  features: [0.8, 0.5, 0.3],
};

const prediction = await rlSuite.predict(state, 'test-execution');

// Train with experience
const experience = {
  state,
  action: prediction.action,
  reward: 0.8,
  nextState: nextState,
  done: false,
};

await rlSuite.train('decision-transformer', experience);
```

## Domain-Specific Usage

### Test Execution (Decision Transformer, DQN, PPO)

```typescript
const state: TestExecutionState = {
  id: 'test-1',
  testType: 'unit',
  priority: 'p1',
  complexity: 0.7,
  domain: 'test-execution',
  dependencies: [],
  estimatedDuration: 5000,
  coverage: 0.8,
  failureHistory: [0, 1, 0],
};

const prediction = await rlSuite.predict(state, 'test-execution');
```

### Coverage Optimization (Q-Learning)

```typescript
const state: CoverageAnalysisState = {
  id: 'file-1',
  filePath: '/src/service.ts',
  currentCoverage: 0.45,
  targetCoverage: 0.8,
  complexity: 0.6,
  changeFrequency: 0.3,
  businessCriticality: 0.9,
  uncoveredLines: [10, 25, 40],
  branchPoints: 5,
};

const prediction = await rlSuite.predict(state, 'coverage-analysis');
```

### Quality Gate Tuning (Actor-Critic)

```typescript
const state: QualityGateState = {
  id: 'gate-1',
  metricName: 'code-coverage',
  currentValue: 0.75,
  threshold: 0.8,
  trend: 'improving',
  variance: 0.05,
  sampleSize: 100,
  confidence: 0.9,
};

const prediction = await rlSuite.predict(state, 'quality-assessment');
```

### Resource Allocation (Policy Gradient, A2C, DDPG)

```typescript
const state: ResourceAllocationState = {
  id: 'resource-1',
  domain: 'coordination',
  pendingTasks: 15,
  availableAgents: 5,
  currentLoad: 0.6,
  avgTaskDuration: 30000,
  priorityDistribution: { p1: 3, p2: 8, p3: 4 },
  slaDeadlines: 2,
};

const prediction = await rlSuite.predict(state, 'coordination');
```

## Reward Signals

Domain-specific reward signals are automatically applied:

- **Test Execution**: Success, speed, quality, early failure detection
- **Coverage**: Coverage gain, critical path coverage, efficiency
- **Defect Prediction**: Accuracy, early prediction, false negative penalty
- **Quality Gate**: Decision accuracy, confidence, speed
- **Resource Allocation**: Task completion, efficiency, load balance

## Model Persistence

```typescript
// Export all models
const models = await rlSuite.exportAllModels();
await fs.writeFile('rl-models.json', JSON.stringify(models));

// Import models
const data = await fs.readFile('rl-models.json', 'utf-8');
const models = JSON.parse(data);
await rlSuite.importAllModels(models);
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      QERLSuite                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 Orchestrator                         │   │
│  │  • Algorithm selection                               │   │
│  │  • Domain routing                                     │   │
│  │  • Reward calculation                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌────────────────────────┼─────────────────────────────┐  │
│  │                BaseRLAlgorithm                        │  │
│  │  • Training logic                                     │  │
│  │  • Model persistence                                  │  │
│  │  • Statistics                                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                 │
│  ┌───────────┬───────────┬────────────┬──────────────┐    │
│  │  Value    │  Policy   │ Actor-     │   Offline    │    │
│  │  Based    │  Based    │ Critic     │     RL       │    │
│  ├───────────┼───────────┼────────────┼──────────────┤    │
│  │ Q-Learning│ Policy    │ Actor-     │ Decision     │    │
│  │ SARSA     │ Gradient  │ Critic     │ Transformer  │    │
│  │ DQN       │           │ PPO        │              │    │
│  │           │           │ A2C        │              │    │
│  │           │           │ DDPG       │              │    │
│  └───────────┴───────────┴────────────┴──────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## API Reference

### QERLSuite

Main orchestrator class.

#### Methods

- `predict(state, domain?)` - Make prediction
- `predictWithAlgorithm(type, state)` - Predict with specific algorithm
- `train(type, experience)` - Train single experience
- `trainBatch(type, experiences)` - Train batch
- `getAlgorithm(type)` - Get algorithm instance
- `getAlgorithmForDomain(domain)` - Get algorithm for domain
- `calculateReward(domain, context)` - Calculate reward
- `exportAllModels()` - Export all models
- `importAllModels(models)` - Import models
- `getStats()` - Get suite statistics

### RL Algorithms

All algorithms implement `RLAlgorithm` interface:

- `predict(state)` - Make prediction
- `train(experience)` - Train single experience
- `trainBatch(experiences)` - Train batch
- `reset()` - Reset algorithm
- `exportModel()` - Export model
- `importModel(model)` - Import model
- `getStats()` - Get statistics
- `getInfo()` - Get algorithm info

## Performance Targets

Per ADR-040:

| Metric | Target |
|--------|--------|
| RL decision | <20ms |
| Training update | <100ms |
| Model export | <500ms |
| Memory usage | ~80MB |

## Contributing

When adding new algorithms:

1. Extend `BaseRLAlgorithm`
2. Implement required abstract methods
3. Add to `RLAlgorithmType` union
4. Update domain mappings
5. Add tests

## License

MIT
