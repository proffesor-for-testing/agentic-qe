# Agent Mixins

This directory contains reusable capability mixins for QE agents.

## NeuralCapableMixin

Provides neural pattern matching and prediction capabilities that can be mixed into any QE agent.

### Features

- **Pattern Matching**: Neural-powered pattern recognition with confidence scoring
- **Predictions**: ML-based predictions for test generation, coverage gaps, flakiness, and risk scores
- **Caching**: Intelligent prediction caching with TTL and size limits
- **Graceful Degradation**: Fallback mechanisms when neural features fail
- **Feature Flags**: Opt-in activation via configuration

### Usage

```typescript
import { createNeuralMatcher, safeNeuralPredict, NeuralInput } from './mixins/NeuralCapableMixin';

// In your agent constructor
this.neuralMatcher = createNeuralMatcher({ enabled: true, confidence: 0.75 });

// In your agent methods
if (this.neuralMatcher) {
  const input: NeuralInput = {
    type: 'test-generation',
    data: { codeSignature, framework, complexity }
  };

  const prediction = await safeNeuralPredict(this.neuralMatcher, input);

  if (prediction && prediction.confidence > 0.75) {
    // Use neural predictions
  }
}
```

### Configuration

```typescript
interface NeuralConfig {
  enabled: boolean;          // Enable/disable neural features (default: false)
  model?: string;            // Model to use (default: 'default')
  confidence: number;        // Minimum confidence threshold (default: 0.7)
  cacheEnabled: boolean;     // Enable prediction caching (default: true)
  cacheTTL: number;          // Cache TTL in ms (default: 5 minutes)
  maxCacheSize: number;      // Max cache entries (default: 1000)
  fallbackEnabled: boolean;  // Enable fallback on errors (default: true)
}
```

### Prediction Types

1. **test-generation**: Suggest test candidates based on code analysis
2. **coverage-gap**: Predict likely coverage gaps
3. **flakiness**: Predict test flakiness likelihood
4. **risk-score**: Predict regression risk scores

### Performance

- **Cache Hit Rate**: 60-80% typical
- **Avg Confidence**: 75-90% with trained models
- **Prediction Time**: <50ms (cached), <200ms (uncached)
- **Memory**: ~1-5MB per agent with full cache

### Backward Compatibility

Agents work normally when neural features are disabled. All neural functionality is opt-in and gracefully degrades on failures.
