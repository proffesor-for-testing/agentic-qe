# Neural Pattern Matcher - Usage Examples

Complete guide for using the Neural Training System in Agentic QE.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Basic Training](#basic-training)
3. [Making Predictions](#making-predictions)
4. [Hyperparameter Tuning](#hyperparameter-tuning)
5. [Incremental Training](#incremental-training)
6. [Model Persistence](#model-persistence)
7. [Integration with QE Agents](#integration-with-qe-agents)
8. [Advanced Configuration](#advanced-configuration)
9. [Production Deployment](#production-deployment)

## Quick Start

```typescript
import { NeuralTrainer, TrainingConfig } from './src/learning/NeuralTrainer';
import { ModelBackend, NeuralArchitecture } from './src/learning/NeuralPatternMatcher';
import { SwarmMemoryManager } from './src/swarm/SwarmMemoryManager';

// 1. Configure neural architecture
const architecture: NeuralArchitecture = {
  inputSize: 12,           // Feature vector size
  hiddenLayers: [16, 8],   // Two hidden layers
  outputSize: 2,           // Binary classification
  activation: 'relu',
  dropout: 0.2,
  learningRate: 0.001,
  batchSize: 32,
  epochs: 50
};

// 2. Configure training
const config: TrainingConfig = {
  backend: ModelBackend.SIMPLE_NN,
  architecture,
  validationSplit: 0.2,
  dataAugmentation: true,
  crossValidationFolds: 5,
  modelPath: '.agentic-qe/models'
};

// 3. Initialize trainer
const memoryManager = new SwarmMemoryManager(/* ... */);
const trainer = new NeuralTrainer(config, memoryManager);

// 4. Train model
const result = await trainer.train();

console.log(`Training completed!`);
console.log(`Accuracy: ${(result.metrics.accuracy * 100).toFixed(2)}%`);
console.log(`Training time: ${result.totalTime}ms`);

// 5. Make prediction
const prediction = await trainer.predict({
  cyclomaticComplexity: 5,
  linesOfCode: 150,
  hasLoops: true,
  hasConditionals: true
});

console.log(`Confidence: ${(prediction.pattern.confidence * 100).toFixed(2)}%`);
console.log(`Suggested tests:`, prediction.pattern.testCases);
```

## Basic Training

### Simple Training Workflow

```typescript
import { NeuralTrainer } from './src/learning/NeuralTrainer';

async function trainModel() {
  // Configure trainer
  const trainer = new NeuralTrainer(config, memoryManager);

  // Listen to training events
  trainer.on('training:started', (data) => {
    console.log('Training started:', data);
  });

  trainer.on('training:progress', (progress) => {
    console.log(`Epoch ${progress.epoch}/${progress.totalEpochs}`);
    console.log(`Loss: ${progress.trainingLoss.toFixed(4)}`);
    console.log(`Accuracy: ${(progress.accuracy * 100).toFixed(2)}%`);
  });

  trainer.on('training:completed', (result) => {
    console.log('Training completed!');
    console.log('Final metrics:', result.metrics);
  });

  // Train
  const result = await trainer.train();

  // Save model
  await trainer.saveModel();

  return result;
}
```

### Training with Custom Data

```typescript
import { TrainingDataPoint } from './src/learning/NeuralPatternMatcher';

async function trainWithCustomData() {
  // Prepare training data
  const trainingData: TrainingDataPoint[] = [
    {
      features: [0.5, 0.3, 0.8, 0.2, 0.9, 0.4, 0.6, 0.7, 0.1, 0.5, 0.3, 0.8],
      labels: [1, 0], // Success
      metadata: {
        testId: 'test-1',
        codePattern: 'unit',
        timestamp: Date.now(),
        success: true,
        coverage: 0.85
      }
    },
    // ... more data points
  ];

  // Train with custom data
  const result = await trainer.train(trainingData);

  return result;
}
```

## Making Predictions

### Basic Prediction

```typescript
async function predictTestCases(codePattern: any) {
  const prediction = await trainer.predict(codePattern);

  console.log('Prediction Results:');
  console.log('==================');
  console.log(`Pattern Type: ${prediction.pattern.type}`);
  console.log(`Confidence: ${(prediction.pattern.confidence * 100).toFixed(2)}%`);
  console.log(`Expected Coverage: ${prediction.pattern.expectedCoverage.toFixed(2)}%`);
  console.log('\nSuggested Test Cases:');

  prediction.pattern.testCases.forEach((testCase, idx) => {
    console.log(`${idx + 1}. ${testCase}`);
  });

  return prediction;
}

// Example: Predict for a function with loops
const loopPrediction = await predictTestCases({
  cyclomaticComplexity: 8,
  linesOfCode: 200,
  numberOfFunctions: 5,
  numberOfBranches: 10,
  hasLoops: true,
  hasConditionals: true,
  hasAsyncOperations: false,
  lineCoverage: 0.75,
  branchCoverage: 0.70
});
```

### Batch Predictions

```typescript
async function batchPredict(codePatterns: any[]) {
  const predictions = await Promise.all(
    codePatterns.map(pattern => trainer.predict(pattern))
  );

  // Aggregate results
  const avgConfidence = predictions.reduce(
    (sum, p) => sum + p.pattern.confidence,
    0
  ) / predictions.length;

  console.log(`Processed ${predictions.length} patterns`);
  console.log(`Average confidence: ${(avgConfidence * 100).toFixed(2)}%`);

  return predictions;
}
```

## Hyperparameter Tuning

### Grid Search

```typescript
import { HyperparameterConfig } from './src/learning/NeuralTrainer';

async function tuneHyperparameters() {
  const tuningConfig: HyperparameterConfig = {
    learningRates: [0.0001, 0.001, 0.01, 0.1],
    batchSizes: [16, 32, 64, 128],
    hiddenLayerConfigs: [
      [8, 4],
      [16, 8],
      [32, 16, 8],
      [64, 32, 16]
    ],
    dropoutRates: [0.0, 0.1, 0.2, 0.3],
    trialsPerConfig: 1,
    maxTrials: 50
  };

  // Monitor tuning progress
  trainer.on('tuning:trial:completed', (data) => {
    console.log(`Trial ${data.trial} completed`);
    console.log(`Accuracy: ${(data.metrics.accuracy * 100).toFixed(2)}%`);
    if (data.isBest) {
      console.log('✓ New best configuration found!');
    }
  });

  // Run tuning
  const result = await trainer.tuneHyperparameters(tuningConfig);

  console.log('\nBest Configuration:');
  console.log('===================');
  console.log('Learning rate:', result.bestConfig.learningRate);
  console.log('Batch size:', result.bestConfig.batchSize);
  console.log('Hidden layers:', result.bestConfig.hiddenLayers);
  console.log('Dropout:', result.bestConfig.dropout);
  console.log('\nBest Metrics:');
  console.log('Accuracy:', (result.bestMetrics.accuracy * 100).toFixed(2) + '%');
  console.log('F1 Score:', result.bestMetrics.f1Score.toFixed(4));
  console.log('\nTotal tuning time:', result.totalTime + 'ms');

  return result;
}
```

## Incremental Training

### Online Learning

```typescript
async function incrementalLearning() {
  // Initial training
  console.log('Phase 1: Initial training...');
  await trainer.train();

  // Simulate new data arriving over time
  for (let batch = 0; batch < 5; batch++) {
    console.log(`\nPhase ${batch + 2}: Incremental update ${batch + 1}...`);

    // Generate new training data
    const newData: TrainingDataPoint[] = generateNewData(20);

    // Incremental train
    const result = await trainer.incrementalTrain(newData);

    console.log(`Updated accuracy: ${(result.metrics.accuracy * 100).toFixed(2)}%`);

    // Save updated model
    await trainer.saveModel();
  }
}

function generateNewData(count: number): TrainingDataPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    features: Array.from({ length: 12 }, () => Math.random()),
    labels: Math.random() > 0.5 ? [1, 0] : [0, 1],
    metadata: {
      testId: `new-test-${Date.now()}-${i}`,
      codePattern: 'unit',
      timestamp: Date.now(),
      success: Math.random() > 0.3,
      coverage: 0.7 + Math.random() * 0.3
    }
  }));
}
```

## Model Persistence

### Save and Load Models

```typescript
async function modelPersistence() {
  // Train and save
  console.log('Training model...');
  await trainer.train();

  console.log('Saving model...');
  await trainer.saveModel();

  // Load in new session
  console.log('Loading model in new session...');
  const newTrainer = new NeuralTrainer(config, memoryManager);
  await newTrainer.loadModel();

  // Verify loaded model works
  const prediction = await newTrainer.predict({
    cyclomaticComplexity: 3,
    linesOfCode: 100
  });

  console.log('Loaded model prediction confidence:', prediction.pattern.confidence);
}
```

### Version Management

```typescript
async function manageModelVersions() {
  // Train version 1.0
  await trainer.train();
  await trainer.saveModel(); // Saves as version 1.0.0

  // Make improvements and train version 2.0
  config.architecture.learningRate = 0.0005;
  const improvedTrainer = new NeuralTrainer(config, memoryManager);
  await improvedTrainer.train();
  await improvedTrainer.saveModel(); // Saves as version 1.0.0 (overwrites)

  // Load specific version
  await trainer.loadModel('1.0.0');
}
```

## Integration with QE Agents

### Using with Test Generator Agent

```typescript
import { TestGeneratorAgent } from './src/agents/TestGeneratorAgent';

async function integrateWithTestGenerator() {
  // Train neural model
  const trainer = new NeuralTrainer(config, memoryManager, reasoningBank);
  await trainer.train();

  // Initialize test generator with trained model
  const testGenerator = new TestGeneratorAgent(
    agentId,
    swarmBus,
    memoryStore,
    eventBus
  );

  // Analyze code and predict tests
  const codeToTest = {
    filePath: 'src/utils/calculator.ts',
    cyclomaticComplexity: 6,
    linesOfCode: 120,
    hasLoops: true,
    hasConditionals: true,
    functions: ['add', 'subtract', 'multiply', 'divide']
  };

  // Get AI predictions
  const prediction = await trainer.predict(codeToTest);

  // Generate tests based on predictions
  const testPlan = {
    targetFile: codeToTest.filePath,
    suggestedTests: prediction.pattern.testCases,
    expectedCoverage: prediction.pattern.expectedCoverage,
    confidence: prediction.pattern.confidence
  };

  console.log('AI-Generated Test Plan:', testPlan);

  return testPlan;
}
```

### Using with Coverage Analyzer

```typescript
import { CoverageAnalyzer } from './src/agents/CoverageAnalyzer';

async function predictCoverageGaps() {
  // Train model on historical coverage data
  await trainer.train();

  // Analyze current code coverage
  const currentCoverage = {
    lineCoverage: 0.65,
    branchCoverage: 0.58,
    functionCoverage: 0.72,
    statementCoverage: 0.68,
    cyclomaticComplexity: 15,
    linesOfCode: 500
  };

  // Predict optimal test strategy
  const prediction = await trainer.predict(currentCoverage);

  console.log('Predicted Coverage Improvements:');
  console.log(`Current: ${(currentCoverage.lineCoverage * 100).toFixed(1)}%`);
  console.log(`Target: ${prediction.pattern.expectedCoverage.toFixed(1)}%`);
  console.log(`Confidence: ${(prediction.pattern.confidence * 100).toFixed(1)}%`);
  console.log('\nRecommended Test Cases:');
  prediction.pattern.testCases.forEach((test, idx) => {
    console.log(`  ${idx + 1}. ${test}`);
  });

  return prediction;
}
```

## Advanced Configuration

### Custom Feature Extractors

```typescript
import { NeuralPatternMatcher } from './src/learning/NeuralPatternMatcher';

class CustomNeuralMatcher extends NeuralPatternMatcher {
  protected initializeEncoding() {
    const encoding = super.initializeEncoding();

    // Add custom feature extractor
    encoding.extractors.set('custom', (pattern) => {
      return [
        pattern.customMetric1 || 0,
        pattern.customMetric2 || 0,
        pattern.customMetric3 || 0,
        pattern.customMetric4 || 0
      ];
    });

    return encoding;
  }
}
```

### Cross-Validation Training

```typescript
async function crossValidationTraining() {
  // Configure 5-fold cross-validation
  const cvConfig: TrainingConfig = {
    ...config,
    crossValidationFolds: 5
  };

  const trainer = new NeuralTrainer(cvConfig, memoryManager);

  // Monitor each fold
  trainer.on('crossvalidation:fold:completed', (data) => {
    console.log(`Fold ${data.fold}:`);
    console.log(`  Accuracy: ${(data.metrics.accuracy * 100).toFixed(2)}%`);
    console.log(`  F1 Score: ${data.metrics.f1Score.toFixed(4)}`);
  });

  // Train with cross-validation
  const result = await trainer.train();

  console.log('\nCross-Validation Results:');
  console.log(`Average Accuracy: ${(result.metrics.accuracy * 100).toFixed(2)}%`);
  console.log(`Average F1 Score: ${result.metrics.f1Score.toFixed(4)}`);

  return result;
}
```

### Data Preprocessing Options

```typescript
async function customPreprocessing() {
  // Load raw data
  const rawData = await trainer.getPatternMatcher().loadTrainingData();

  // Custom preprocessing
  const processedData = await trainer.preprocessData(rawData, {
    normalize: true,        // Min-max scaling
    handleMissing: true,    // Remove incomplete data
    removeOutliers: true,   // IQR-based outlier removal
    balanceClasses: true    // Oversample minority class
  });

  console.log(`Raw data: ${rawData.length} samples`);
  console.log(`Processed data: ${processedData.length} samples`);

  // Train with preprocessed data
  const result = await trainer.train(processedData);

  return result;
}
```

## Production Deployment

### Complete Production Workflow

```typescript
import { EventEmitter } from 'events';

class ProductionNeuralSystem extends EventEmitter {
  private trainer: NeuralTrainer;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: TrainingConfig, memoryManager: SwarmMemoryManager) {
    super();
    this.trainer = new NeuralTrainer(config, memoryManager);
  }

  async initialize(): Promise<void> {
    console.log('Initializing Neural Pattern Matcher...');

    try {
      // Try to load existing model
      await this.trainer.loadModel();
      console.log('✓ Loaded existing model');
    } catch (error) {
      // Train new model if none exists
      console.log('No existing model found. Training new model...');
      await this.trainer.train();
      await this.trainer.saveModel();
      console.log('✓ New model trained and saved');
    }

    // Start health monitoring
    this.startHealthMonitoring();

    this.emit('initialized');
  }

  async predict(codePattern: any) {
    try {
      const prediction = await this.trainer.predict(codePattern);

      this.emit('prediction:success', {
        pattern: codePattern,
        prediction
      });

      return prediction;
    } catch (error) {
      this.emit('prediction:error', {
        pattern: codePattern,
        error
      });
      throw error;
    }
  }

  async incrementalUpdate(newData: TrainingDataPoint[]): Promise<void> {
    console.log(`Performing incremental update with ${newData.length} new samples...`);

    try {
      const result = await this.trainer.incrementalTrain(newData);

      console.log(`✓ Model updated. New accuracy: ${(result.metrics.accuracy * 100).toFixed(2)}%`);

      // Save updated model
      await this.trainer.saveModel();

      this.emit('model:updated', { metrics: result.metrics });
    } catch (error) {
      this.emit('model:update:error', { error });
      throw error;
    }
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      const info = this.trainer.getPatternMatcher().getModelInfo();

      const health = {
        modelVersion: info.version,
        lastTrained: info.lastTrained,
        accuracy: info.metrics?.accuracy || 0,
        status: info.metrics && info.metrics.accuracy > 0.85 ? 'healthy' : 'needs_retraining'
      };

      this.emit('health:check', health);

      if (health.status === 'needs_retraining') {
        console.warn('⚠ Model accuracy below threshold. Consider retraining.');
      }
    }, 60000); // Check every minute
  }

  async shutdown(): Promise<void> {
    console.log('Shutting down Neural Pattern Matcher...');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Save final state
    await this.trainer.saveModel();

    this.emit('shutdown');
    console.log('✓ Shutdown complete');
  }
}

// Usage
async function deployToProduction() {
  const system = new ProductionNeuralSystem(config, memoryManager);

  // Setup monitoring
  system.on('health:check', (health) => {
    console.log('Health check:', health);
  });

  system.on('prediction:error', (data) => {
    console.error('Prediction error:', data.error);
  });

  // Initialize
  await system.initialize();

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    await system.shutdown();
    process.exit(0);
  });

  return system;
}
```

## Performance Tips

1. **Batch Processing**: Process multiple predictions in parallel for better throughput
2. **Model Caching**: Load model once and reuse for multiple predictions
3. **Incremental Updates**: Use incremental training for frequent updates
4. **Feature Selection**: Reduce input size for faster training
5. **Early Stopping**: Monitor validation loss to prevent overfitting
6. **Hardware Acceleration**: Consider GPU backend for large models

## Troubleshooting

### Low Accuracy

```typescript
// 1. Check data quality
const data = await trainer.getPatternMatcher().loadTrainingData();
console.log('Training samples:', data.length);
console.log('Feature completeness:',
  data.filter(d => d.features.every(f => !isNaN(f))).length
);

// 2. Try hyperparameter tuning
const tuningResult = await trainer.tuneHyperparameters(tuningConfig);

// 3. Increase model capacity
config.architecture.hiddenLayers = [32, 16, 8]; // Deeper network
config.architecture.epochs = 100; // More training

// 4. Add more training data
const augmentedData = await trainer.augmentData(data, 3);
await trainer.train(augmentedData);
```

### Overfitting

```typescript
// 1. Increase dropout
config.architecture.dropout = 0.3;

// 2. Add regularization through cross-validation
config.crossValidationFolds = 5;

// 3. Reduce model complexity
config.architecture.hiddenLayers = [8, 4]; // Simpler network

// 4. Get more diverse training data
config.dataAugmentation = true;
```

## Next Steps

- Explore the [API Documentation](/docs/api/neural-training.md)
- Read about [Model Architecture](/docs/architecture/neural-models.md)
- Check out [Integration Patterns](/docs/guides/neural-integration.md)
- Review [Performance Benchmarks](/docs/benchmarks/neural-performance.md)
