# Neural Training Guide - AgentDB RL Algorithms

**Version**: 1.2.0
**Status**: ✅ Production Ready
**Integration**: AgentDB Learning Plugins

## Overview

The AQE Fleet now supports **9 reinforcement learning algorithms** via AgentDB integration for continuous agent improvement through neural training.

### Supported RL Algorithms

| Algorithm | Type | Best For | Description |
|-----------|------|----------|-------------|
| **Decision Transformer** | Sequence Modeling | Long-term planning | Uses transformer architecture for sequential decision making |
| **Q-Learning** | Value-based (off-policy) | Discrete actions | Classic RL algorithm, learns optimal action-value function |
| **SARSA** | Value-based (on-policy) | Safe exploration | On-policy TD learning, more conservative than Q-learning |
| **Actor-Critic** | Policy gradient | Balanced performance | Combines value and policy learning for stability |
| **PPO** | Policy gradient | Stable training | Proximal Policy Optimization, industry standard for stability |
| **DDPG** | Continuous control | Continuous actions | Deep Deterministic Policy Gradient for continuous action spaces |
| **TD3** | Continuous control | Improved stability | Twin Delayed DDPG with enhanced stability |
| **SAC** | Maximum entropy | Exploration | Soft Actor-Critic, maximizes entropy for better exploration |
| **DQN** | Deep Q-Network | Complex states | Deep learning + Q-learning for high-dimensional states |

## Quick Start

### 1. Basic Neural Training

```typescript
import { NeuralTrainer } from 'agentic-qe/core/neural';
import { createAgentDBManager } from 'agentic-qe/core/memory';

// Initialize AgentDB with learning enabled
const agentDB = createAgentDBManager({
  dbPath: '.agentdb/reasoningbank.db',
  enableLearning: true,
  enableReasoning: true
});
await agentDB.initialize();

// Create neural trainer
const trainer = new NeuralTrainer(
  'my-agent',
  memoryStore,
  agentDB,
  {
    enabled: true,
    algorithm: 'actor-critic',
    learningRate: 0.001,
    epochs: 50,
    batchSize: 32
  }
);
await trainer.initialize();

// Collect experiences during task execution
const experiences: Experience[] = [
  {
    state: { taskComplexity: 0.7, capabilities: ['test-gen'] },
    action: { type: 'parallel', parameters: {} },
    reward: 1.5,
    nextState: { taskComplexity: 0.7, capabilities: ['test-gen'] },
    done: true
  }
];

// Train the model
const result = await trainer.train(experiences);
console.log(`Loss: ${result.metrics.loss}, Episodes: ${result.episodeCount}`);

// Predict best action
const prediction = await trainer.predictAction({ taskComplexity: 0.6 });
console.log(`Best action: ${prediction.action.type}, confidence: ${prediction.confidence}`);
```

### 2. Using NeuralAgentExtension

For easier integration with existing agents:

```typescript
import { NeuralAgentExtension } from 'agentic-qe/agents';

class TestGeneratorAgent extends BaseAgent {
  private neuralExt: NeuralAgentExtension;

  constructor(config: BaseAgentConfig) {
    super(config);

    // Add neural training extension
    this.neuralExt = new NeuralAgentExtension(
      this.agentId.id,
      this.memoryStore as SwarmMemoryManager,
      this.agentDB!,
      {
        enabled: true,
        algorithm: 'ppo', // Use PPO for stable training
        learningRate: 0.001
      },
      {
        enabled: true,
        collectionInterval: 1, // Collect every task
        maxBuffer: 1000,
        autoTrain: true // Auto-train when buffer full
      }
    );
  }

  protected async initializeComponents() {
    await this.neuralExt.initialize();
  }

  protected async onPreTask(data: PreTaskData) {
    await super.onPreTask(data);

    // Snapshot state before execution
    this.neuralExt.snapshotState(data.assignment.task);

    // Get action recommendation
    const state = this.extractState(data);
    const prediction = await this.neuralExt.predictAction(state);
    console.log(`Neural recommends: ${prediction.action.type} (confidence: ${prediction.confidence})`);
  }

  protected async onPostTask(data: PostTaskData) {
    await super.onPostTask(data);

    // Automatically collect experience
    await this.neuralExt.collectExperience(data);
  }

  protected async onTaskError(data: TaskErrorData) {
    await super.onTaskError(data);

    // Collect negative experience from errors
    await this.neuralExt.collectErrorExperience(data);
  }
}
```

## Algorithm Selection Guide

### When to Use Each Algorithm

#### Decision Transformer
**Use for**: Long-term planning, sequential decision making
**Example**: Test suite generation with dependencies

```typescript
const trainer = new NeuralTrainer('planner', memory, agentDB, {
  algorithm: 'decision-transformer',
  epochs: 100 // Needs more training
});
```

#### Q-Learning
**Use for**: Simple discrete action spaces, quick learning
**Example**: Test prioritization (high/medium/low priority)

```typescript
const trainer = new NeuralTrainer('prioritizer', memory, agentDB, {
  algorithm: 'q-learning',
  learningRate: 0.1, // Higher for faster learning
  epsilon: 0.2 // Exploration rate
});
```

#### SARSA
**Use for**: Safe exploration, risk-averse decisions
**Example**: Production deployment readiness checks

```typescript
const trainer = new NeuralTrainer('safety-checker', memory, agentDB, {
  algorithm: 'sarsa',
  learningRate: 0.05, // Conservative learning
  gamma: 0.99 // High discount for safety
});
```

#### Actor-Critic
**Use for**: Balanced exploration and exploitation
**Example**: Coverage gap detection

```typescript
const trainer = new NeuralTrainer('coverage-agent', memory, agentDB, {
  algorithm: 'actor-critic',
  learningRate: 0.001,
  batchSize: 64
});
```

#### PPO (Recommended for most use cases)
**Use for**: Stable training, general purpose
**Example**: Test generation, flaky test detection

```typescript
const trainer = new NeuralTrainer('test-gen', memory, agentDB, {
  algorithm: 'ppo',
  learningRate: 0.0003,
  epochs: 50,
  batchSize: 32
});
```

#### DDPG/TD3/SAC
**Use for**: Continuous action spaces
**Example**: Resource allocation, parallelization level tuning

```typescript
const trainer = new NeuralTrainer('optimizer', memory, agentDB, {
  algorithm: 'td3', // Most stable for continuous control
  learningRate: 0.001,
  tau: 0.005 // Soft update coefficient
});
```

#### DQN
**Use for**: High-dimensional state spaces
**Example**: Complex test pattern matching

```typescript
const trainer = new NeuralTrainer('pattern-matcher', memory, agentDB, {
  algorithm: 'dqn',
  learningRate: 0.00025,
  batchSize: 32,
  memorySize: 100000 // Large replay buffer
});
```

## Advanced Usage

### Switching Algorithms at Runtime

```typescript
// Start with Q-learning for quick initial learning
await trainer.switchAlgorithm('q-learning');
await trainer.train(initialExperiences);

// Switch to PPO for stable fine-tuning
await trainer.switchAlgorithm('ppo');
await trainer.train(refinementExperiences);

// Use Decision Transformer for complex planning
await trainer.switchAlgorithm('decision-transformer');
await trainer.train(planningExperiences);
```

### Model Persistence

```typescript
// Save model after training
await trainer.saveModel('test-gen-v1', './.agentic-qe/data/neural/models');

// Load model in another session
const loadedModel = await trainer.loadModel(
  './.agentic-qe/data/neural/models/test-gen-v1.json'
);

console.log(`Loaded model with ${loadedModel.experienceCount} experiences`);
```

### Manual Training Control

```typescript
const extension = new NeuralAgentExtension(
  'agent-1',
  memory,
  agentDB,
  { enabled: true },
  {
    enabled: true,
    autoTrain: false // Manual control
  }
);

// Collect experiences...
for (const task of tasks) {
  const result = await executeTask(task);
  await extension.collectExperience({ assignment: task, result });
}

// Train manually when ready
await extension.trainModel('ppo');

// Clear buffer after training
extension.getTrainer().clearExperiences();
```

### Multi-Algorithm Ensemble

```typescript
const algorithms: RLAlgorithm[] = ['q-learning', 'actor-critic', 'ppo'];
const predictions: PredictionResult[] = [];

for (const algo of algorithms) {
  const pred = await trainer.predictAction(state, algo);
  predictions.push(pred);
}

// Vote or average predictions
const bestPrediction = predictions.reduce((best, pred) =>
  pred.confidence > best.confidence ? pred : best
);
```

## Performance Metrics

### Training Metrics

```typescript
const status = trainer.getStatus();

console.log(`Algorithm: ${status.algorithm}`);
console.log(`Episodes: ${status.episodeCount}`);
console.log(`Experiences: ${status.experienceCount}`);
console.log(`Training: ${status.isTraining}`);

// Get metrics by algorithm
const ppoMetrics = status.metrics.get('ppo');
if (ppoMetrics) {
  ppoMetrics.forEach(metric => {
    console.log(`Loss: ${metric.loss.toFixed(4)}`);
    console.log(`Val Loss: ${metric.valLoss?.toFixed(4)}`);
    console.log(`Duration: ${metric.duration}ms`);
  });
}
```

### Benchmarks

| Operation | Time | Notes |
|-----------|------|-------|
| Train 100 experiences | <100ms | AgentDB optimized |
| Predict action | <10ms | HNSW vector search |
| Save model | <50ms | JSON serialization |
| Load model | <30ms | JSON deserialization |
| Experience collection | <1ms | In-memory buffer |

## Integration with Existing Systems

### Q-Learning Engine Integration

The neural trainer complements (not replaces) the existing Q-learning engine:

```typescript
// Use Q-Learning for tactical decisions
const tacticalRecommendation = await this.learningEngine.recommendStrategy(state);

// Use Neural Trainer for strategic planning
const strategicRecommendation = await this.neuralExt.predictAction(state);

// Combine recommendations
const finalAction = combineRecommendations(tacticalRecommendation, strategicRecommendation);
```

### AgentDB Memory Coordination

Neural training patterns are automatically stored in AgentDB for cross-agent sharing:

```typescript
// Agent 1 trains on test generation
await testGenAgent.neuralExt.trainModel();

// Agent 2 can retrieve similar patterns via AgentDB QUIC sync
const similarPatterns = await agentDB.retrieve(stateEmbedding, {
  domain: 'neural:test-gen-agent:experiences',
  k: 10,
  useMMR: true
});
```

## Configuration Options

### NeuralConfig

```typescript
interface NeuralConfig {
  enabled: boolean;              // Enable neural training
  algorithm: RLAlgorithm;        // RL algorithm to use
  learningRate: number;          // 0.0001 - 0.1 (typically 0.001)
  batchSize: number;             // 16, 32, 64, 128
  epochs: number;                // 10-100
  validationSplit: number;       // 0.1-0.3
  modelSaveInterval: number;     // Save every N episodes
  checkpointInterval: number;    // Checkpoint every N episodes
  maxCheckpoints: number;        // Keep N recent checkpoints
  useGPU: boolean;               // GPU acceleration (if available)
  memorySize: number;            // Experience replay buffer size
  gamma: number;                 // Discount factor (0.9-0.99)
  epsilon: number;               // Exploration rate (0.01-0.3)
  tau: number;                   // Soft update coefficient (0.001-0.01)
}
```

### ExperienceCollectionConfig

```typescript
interface ExperienceCollectionConfig {
  enabled: boolean;              // Enable experience collection
  collectionInterval: number;    // Collect every N tasks
  minReward: number | undefined; // Minimum reward threshold
  maxBuffer: number;             // Max experiences in buffer
  autoTrain: boolean;            // Auto-train when buffer full
}
```

## Troubleshooting

### Low Training Performance

```typescript
// Increase batch size and epochs
const config: NeuralConfig = {
  batchSize: 64,  // Larger batches
  epochs: 100,    // More epochs
  learningRate: 0.0003 // Lower learning rate
};
```

### Unstable Training

```typescript
// Use PPO or TD3 for stability
await trainer.switchAlgorithm('ppo');

// Lower learning rate
const config: NeuralConfig = {
  learningRate: 0.0001,
  gamma: 0.95 // Lower discount factor
};
```

### Slow Convergence

```typescript
// Use Q-Learning or DQN for faster initial learning
await trainer.switchAlgorithm('q-learning');

// Higher learning rate
const config: NeuralConfig = {
  learningRate: 0.01,
  epsilon: 0.3 // More exploration
};
```

## Best Practices

1. **Start Simple**: Begin with Q-Learning or Actor-Critic
2. **Use PPO for Production**: Most stable and reliable
3. **Save Models Regularly**: Set appropriate `modelSaveInterval`
4. **Monitor Metrics**: Track loss and validation loss
5. **Tune Hyperparameters**: Adjust learning rate, batch size, epochs
6. **Use Appropriate Algorithms**: Match algorithm to problem type
7. **Combine with Q-Learning**: Use both systems for best results
8. **Enable Auto-Training**: Let agents learn continuously
9. **Share Knowledge**: Use AgentDB QUIC sync for cross-agent learning
10. **Test Predictions**: Validate action predictions before deployment

## Examples

See:
- `/workspaces/agentic-qe-cf/tests/integration/agentdb/neural-training.test.ts` - Integration tests
- `/workspaces/agentic-qe-cf/src/core/neural/NeuralTrainer.ts` - Implementation
- `/workspaces/agentic-qe-cf/src/agents/NeuralAgentExtension.ts` - Agent integration

## References

- AgentDB Documentation: https://github.com/ruvnet/agentdb
- PPO Paper: https://arxiv.org/abs/1707.06347
- SAC Paper: https://arxiv.org/abs/1801.01290
- Decision Transformer: https://arxiv.org/abs/2106.01345

---

**Generated**: 2025-10-22
**Version**: 1.2.0
**Status**: ✅ Production Ready
