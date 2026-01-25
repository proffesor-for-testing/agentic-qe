# Model Capability Registry

The Model Capability Registry provides intelligent LLM selection based on task requirements, complexity, and constraints.

## Overview

The registry maintains a comprehensive database of LLM models across multiple providers (Ollama, OpenRouter, Groq, Together, Claude, RuvLLM) with their capabilities, performance benchmarks, and deployment requirements.

## Key Features

- **Intelligent Model Selection**: Automatically select the best model for a specific task and complexity level
- **Multi-Provider Support**: Works with local (Ollama) and cloud providers
- **Cost Optimization**: Balance quality vs. cost based on constraints
- **Adaptive Learning**: Update quality ratings based on actual performance
- **Comprehensive Benchmarks**: Includes HumanEval, SWE-bench, and Aider Polyglot scores

## Model Database

### Local Models (Ollama)

| Model | Parameters | Context | Best For |
|-------|-----------|---------|----------|
| qwen2.5-coder:32b | 32B | 131K | Agentic workflows, code generation |
| llama3.3:70b | 70B | 128K | High-quality reasoning, general purpose |
| devstral:22b | 22B | 32K | Laptop deployment, balanced performance |
| deepseek-coder-v2:16b | 16B | 163K | Multi-language, large context |
| starcoder2:15b | 15B | 16K | Fast code generation |

### Free Tier Models

| Model | Provider | Context | Benchmarks |
|-------|----------|---------|------------|
| llama-3.3-70b-versatile | Groq | 128K | HumanEval: 73.8, SWE-bench: 52.1 |
| mistralai/devstral-2512:free | OpenRouter | 262K | HumanEval: 84.2, SWE-bench: 72.2 |

### Premium Models

| Model | Provider | Cost/1M | SWE-bench |
|-------|----------|---------|-----------|
| moonshotai/kimi-dev-72b | OpenRouter | $0.50 | 60.4 (SOTA) |
| mistralai/devstral-2-123b | OpenRouter | $1.50 | 72.2 |
| anthropic/claude-sonnet-4 | Claude | $3-15 | 68.7 |
| anthropic/claude-opus-4 | Claude | $15-75 | 71.3 |

## Usage

### Basic Usage

```typescript
import { ModelCapabilityRegistry } from '@/routing';

const registry = new ModelCapabilityRegistry();
registry.loadDefaultModels();

// Get best model for a task
const modelId = registry.getBestModelForTask(
  'test-generation',
  'moderate'
);

console.log(modelId); // e.g., "mistralai/devstral-2512:free"
```

### With Constraints

```typescript
// Prefer free tier models
const freeModel = registry.getBestModelForTask(
  'code-review',
  'simple',
  { preferFree: true }
);

// Local deployment only
const localModel = registry.getBestModelForTask(
  'bug-detection',
  'moderate',
  { requiresLocal: true }
);

// Budget constraint
const budgetModel = registry.getBestModelForTask(
  'refactoring',
  'complex',
  { maxCostPer1M: 1.0 }
);

// Large context required
const contextModel = registry.getBestModelForTask(
  'documentation',
  'complex',
  { minContextWindow: 128000 }
);
```

### Advanced Constraints

```typescript
const modelId = registry.getBestModelForTask(
  'security-scanning',
  'very_complex',
  {
    maxCostPer1M: 2.0,
    minContextWindow: 100000,
    requiredCapabilities: ['code-specialist', 'high-accuracy']
  }
);
```

### Adaptive Learning

```typescript
// Execute a task and rate the performance
const modelId = registry.getBestModelForTask('test-generation', 'moderate');

// ... execute task with selected model ...

// Update quality rating based on actual performance
const successRate = 0.92; // 92% of generated tests passed
registry.updateQualityRating(modelId, 'test-generation', successRate);

// Future selections will consider this updated rating
```

### Provider-Specific Selection

```typescript
// Get all Ollama models
const ollamaModels = registry.getModelsForProvider('ollama');

// Get all free tier models
const freeModels = registry.getAllModels().filter(m =>
  !m.pricing || (m.pricing.inputPer1M === 0 && m.pricing.outputPer1M === 0)
);

// Get Claude models only
const claudeModels = registry.getModelsForProvider('claude');
```

## Task Types

The registry supports the following task types:

- `test-generation`: Unit test, integration test generation
- `coverage-analysis`: Code coverage analysis and gap detection
- `code-review`: Code quality review and suggestions
- `bug-detection`: Bug and defect identification
- `documentation`: Code documentation generation
- `refactoring`: Code refactoring suggestions
- `performance-testing`: Performance analysis and optimization
- `security-scanning`: Security vulnerability detection

## Complexity Levels

Tasks can be classified into four complexity levels:

1. **Simple**: Basic operations, small scope
   - Ideal models: 1B-15B parameters
   - Examples: Single function test, simple refactoring

2. **Moderate**: Standard development tasks
   - Ideal models: 10B-40B parameters
   - Examples: Class-level testing, code review

3. **Complex**: Advanced tasks requiring deep understanding
   - Ideal models: 30B-80B parameters
   - Examples: System integration tests, architecture review

4. **Very Complex**: Sophisticated tasks requiring highest quality
   - Ideal models: 60B+ parameters
   - Examples: Security audits, complex refactoring

## Model Selection Algorithm

The registry uses a multi-factor scoring system:

1. **Quality Rating** (0-40 points): Based on historical performance
2. **Benchmark Score** (0-30 points): HumanEval, SWE-bench, Aider Polyglot
3. **Complexity Match** (0-20 points): How well model size fits task complexity
4. **Cost Efficiency** (0-10 points): Preference for free/low-cost models

Higher score = better match. The highest-scoring model is selected.

## Model Constraints

### Cost Constraints

```typescript
interface ModelConstraints {
  maxCostPer1M?: number; // Maximum cost per 1M tokens
  preferFree?: boolean;   // Prefer free tier models
}
```

### Deployment Constraints

```typescript
interface ModelConstraints {
  requiresLocal?: boolean; // Must be locally deployable
  minContextWindow?: number; // Minimum context window size
}
```

### Capability Constraints

```typescript
interface ModelConstraints {
  requiredCapabilities?: string[]; // Required capability strings
}
```

## Model Capabilities Schema

```typescript
interface ModelCapabilities {
  modelId: string;
  provider: 'ollama' | 'openrouter' | 'groq' | 'together' | 'claude' | 'ruvllm';

  // Core specs
  parameters: string;
  contextWindow: number;
  pricing?: {
    inputPer1M: number;
    outputPer1M: number;
  };

  // Capabilities
  supportedTasks: TaskType[];
  strengths: string[];
  weaknesses?: string[];

  // Benchmarks
  benchmarks?: {
    humanEval?: number;
    sweBench?: number;
    aiderPolyglot?: number;
  };

  // Deployment
  availableOn: string[];
  requiresGPU: boolean;
  vramRequired?: number;

  // Adaptive ratings
  qualityRatings?: Partial<Record<TaskType, number>>;
}
```

## Benchmark Interpretation

### HumanEval
- Measures code generation accuracy
- Range: 0-100
- Good: >70, Excellent: >85

### SWE-bench
- Measures ability to solve real-world software engineering tasks
- Range: 0-100
- Good: >50, Excellent: >70

### Aider Polyglot
- Measures multi-language code editing capability
- Range: 0-100
- Good: >60, Excellent: >75

## Best Practices

### 1. Start with Free Tier

```typescript
// Try free tier first
const modelId = registry.getBestModelForTask(task, complexity, {
  preferFree: true
});

// Fall back to paid if quality insufficient
if (!modelId || needsHigherQuality) {
  const premiumModel = registry.getBestModelForTask(task, complexity, {
    maxCostPer1M: 2.0
  });
}
```

### 2. Use Adaptive Learning

```typescript
async function executeWithLearning(task, complexity) {
  const modelId = registry.getBestModelForTask(task, complexity);

  const result = await executeTask(modelId, task);

  // Rate performance
  const rating = calculateSuccessRate(result);
  registry.updateQualityRating(modelId, task, rating);

  return result;
}
```

### 3. Balance Cost and Quality

```typescript
// For simple tasks, use smaller models
const simpleModel = registry.getBestModelForTask('test-generation', 'simple', {
  preferFree: true
});

// For critical tasks, prioritize quality
const criticalModel = registry.getBestModelForTask('security-scanning', 'very_complex');
```

### 4. Local Development

```typescript
// Use local models during development
const devModel = registry.getBestModelForTask('code-review', 'moderate', {
  requiresLocal: true
});

// Use cloud models in CI/CD
const ciModel = registry.getBestModelForTask('code-review', 'moderate', {
  preferFree: true
});
```

## Extension

### Adding Custom Models

```typescript
import { ModelCapabilities } from '@/routing';

const customModel: ModelCapabilities = {
  modelId: 'my-custom-model',
  provider: 'ollama',
  parameters: '13B',
  contextWindow: 8192,
  supportedTasks: ['test-generation', 'code-review'],
  strengths: ['fast', 'efficient'],
  benchmarks: {
    humanEval: 68.5
  },
  availableOn: ['local'],
  requiresGPU: true,
  vramRequired: 8
};

registry.registerModel(customModel);
```

### Custom Scoring

If you need custom selection logic, you can extend the registry:

```typescript
class CustomRegistry extends ModelCapabilityRegistry {
  getBestModelForTask(task, complexity, constraints) {
    const candidates = this.getAllModels()
      .filter(m => m.supportedTasks.includes(task));

    // Apply custom scoring logic
    const scored = candidates.map(model => ({
      model,
      score: this.customScore(model, task, complexity)
    }));

    return scored.sort((a, b) => b.score - a.score)[0]?.model.modelId;
  }

  private customScore(model, task, complexity) {
    // Your custom scoring logic
    return 0;
  }
}
```

## Integration with Multi-Model Router

The Model Capability Registry integrates with the Multi-Model Router to provide intelligent provider selection:

```typescript
import { MultiModelRouter } from '@/routing';
import { ModelCapabilityRegistry } from '@/routing';

const router = new MultiModelRouter(config);
const registry = new ModelCapabilityRegistry();
registry.loadDefaultModels();

// Router uses registry for intelligent selection
const provider = await router.getProvider({
  task: 'test-generation',
  complexity: 'moderate',
  preferFree: true
});
```

## Related Documentation

- [LLM Providers Guide](../guides/llm-providers-guide.md)
- [Free Tier Guide](../guides/free-tier-guide.md)
- [Configuration Guide](../guides/configuration-guide.md)
- [Multi-Model Router](./multi-model-router.md)
