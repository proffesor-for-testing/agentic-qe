# RuvllmProvider Quick Start Guide

## Installation

Already installed in the project:
```json
"@ruvector/ruvllm": "^0.2.3"
```

## Basic Usage

### Simple Completion

```typescript
import { RuvllmProvider } from './providers/RuvllmProvider';

const provider = new RuvllmProvider();
await provider.initialize();

const response = await provider.complete({
  model: 'llama-3.2-3b-instruct',
  messages: [
    { role: 'user', content: 'Write a test case' }
  ]
});

console.log(response.content[0].text);
```

## TRM (Test-time Reasoning)

### Enable TRM for Quality Refinement

```typescript
const provider = new RuvllmProvider({
  enableTRM: true,
  maxTRMIterations: 7
});

await provider.initialize();

const response = await provider.complete({
  messages: [
    { role: 'user', content: 'Write a comprehensive test plan' }
  ],
  trmConfig: {
    maxIterations: 5,
    qualityMetric: 'coherence'  // or 'coverage' or 'diversity'
  }
});

// TRM-specific metadata
console.log(`Iterations: ${response.trmIterations}`);
console.log(`Final quality: ${response.finalQuality}`);
console.log(`Convergence:`, response.convergenceHistory);
```

### Quality Metrics

- **coherence**: Sentence flow and structure (best for long-form text)
- **coverage**: Breadth of content (best for comprehensive answers)
- **diversity**: Vocabulary richness (best for creative responses)

## SONA (Self-Organizing Neural Architecture)

### Enable Continuous Learning

```typescript
const provider = new RuvllmProvider({
  enableSONA: true,
  sonaConfig: {
    loraRank: 8,      // LoRA adapter rank
    loraAlpha: 16,    // LoRA scaling factor
    ewcLambda: 2000   // Catastrophic forgetting prevention
  }
});

await provider.initialize();

// First request - learns pattern
const response1 = await provider.complete({
  messages: [{ role: 'user', content: 'Generate tests for UserService' }]
});

// Second request - reuses learned pattern
const response2 = await provider.complete({
  messages: [{ role: 'user', content: 'Generate tests for OrderService' }]
});

console.log(`Memory hits: ${response2.metadata.memoryHits}`);
```

### SONA Components

- **SonaCoordinator**: Records learning trajectories
- **ReasoningBank**: Stores high-confidence patterns (>85%)
- **LoraManager**: Manages task-specific adapters
- **Memory Search**: Finds relevant context from past completions

## Configuration Reference

### Full Configuration

```typescript
const provider = new RuvllmProvider({
  // Basic settings
  name: 'ruvllm',
  defaultModel: 'llama-3.2-3b-instruct',
  port: 8080,
  gpuLayers: -1,        // -1 = all on GPU
  contextSize: 4096,
  threads: 4,
  defaultTemperature: 0.7,

  // Advanced features
  enableTRM: true,
  enableSONA: true,
  enableEmbeddings: false,

  // TRM settings
  maxTRMIterations: 7,
  convergenceThreshold: 0.95,

  // SONA settings
  sonaConfig: {
    loraRank: 8,
    loraAlpha: 16,
    ewcLambda: 2000
  },

  // Debug
  debug: false,
  timeout: 120000,
  maxRetries: 2
});
```

### Defaults

```typescript
{
  enableTRM: true,
  enableSONA: true,
  maxTRMIterations: 7,
  convergenceThreshold: 0.95,
  sonaConfig: {
    loraRank: 8,
    loraAlpha: 16,
    ewcLambda: 2000
  }
}
```

## Advanced Usage

### Streaming Responses

```typescript
const stream = provider.streamComplete({
  messages: [{ role: 'user', content: 'Write tests' }]
});

for await (const event of stream) {
  if (event.type === 'content_block_delta') {
    process.stdout.write(event.delta.text);
  }
}
```

### Embeddings

```typescript
const embedding = await provider.embed({
  text: 'test input',
  model: 'ruvllm-embedding'
});

console.log(embedding.embedding); // number[]
```

### Health Check

```typescript
const health = await provider.healthCheck();

console.log(`Healthy: ${health.healthy}`);
console.log(`Mode: ${health.metadata.mode}`);        // 'native' or 'server'
console.log(`SONA: ${health.metadata.sonaEnabled}`);
console.log(`TRM: ${health.metadata.trmEnabled}`);
```

## Modes of Operation

### Native Mode (Default)

Uses @ruvector/ruvllm directly:
- Memory search for context
- Direct embedding generation
- SONA trajectory tracking
- No external server required

### Server Mode (Fallback)

Falls back to OpenAI-compatible API if:
- ruvLLM initialization fails
- Server is already running
- Compatibility mode requested

Both modes provide the same API surface.

## Performance Tips

### 1. Disable TRM for Simple Queries

```typescript
// Without TRM (fast)
const response = await provider.complete({
  messages: [...]  // No trmConfig
});
```

### 2. Adjust Convergence Threshold

```typescript
// Stop earlier
trmConfig: {
  convergenceThreshold: 0.9  // vs default 0.95
}
```

### 3. Limit Iterations

```typescript
// Fewer iterations = faster
trmConfig: {
  maxIterations: 3  // vs default 7
}
```

## Error Handling

```typescript
try {
  const response = await provider.complete({...});
} catch (error) {
  if (error instanceof LLMProviderError) {
    console.log(`Provider: ${error.provider}`);
    console.log(`Code: ${error.code}`);
    console.log(`Retryable: ${error.retryable}`);
  }
}
```

### Error Codes

- `INIT_ERROR`: Failed to initialize
- `INFERENCE_ERROR`: Completion failed
- `STREAM_ERROR`: Streaming failed
- `EMBEDDING_ERROR`: Embedding generation failed
- `NOT_INITIALIZED`: Provider not initialized

## Response Metadata

### Standard Response

```typescript
{
  content: [{ type: 'text', text: '...' }],
  usage: {
    input_tokens: 100,
    output_tokens: 200
  },
  model: 'llama-3.2-3b-instruct',
  stop_reason: 'end_turn',
  id: 'ruvllm-123456',
  metadata: {
    latency: 123,        // ms
    confidence: 0.87,    // model confidence
    memoryHits: 3,       // relevant memories found
    cost: 0              // always 0 for local
  }
}
```

### TRM Response

```typescript
{
  ...standardResponse,
  trmIterations: 3,
  finalQuality: 0.87,
  convergenceHistory: [
    { iteration: 0, quality: 0.75, improvement: 0 },
    { iteration: 1, quality: 0.82, improvement: 0.07 },
    { iteration: 2, quality: 0.87, improvement: 0.05 }
  ],
  metadata: {
    ...standardMetadata,
    trmLatency: 456,           // TRM-specific latency
    qualityMetric: 'coherence'
  }
}
```

## Supported Models

- `llama-3.2-3b-instruct`
- `llama-3.2-1b-instruct`
- `llama-3.1-8b-instruct`
- `phi-3-mini`
- `mistral-7b-instruct`
- `qwen2-7b-instruct`

## Migration from v1.0.0

### No Breaking Changes

Existing code works without modification:

```typescript
// v1.0.0 code still works
const provider = new RuvllmProvider();
await provider.initialize();
const response = await provider.complete({...});
```

### Opt-In to New Features

```typescript
// v2.0.0 - Enable TRM and SONA
const provider = new RuvllmProvider({
  enableTRM: true,
  enableSONA: true
});

// Use TRM on specific requests
const response = await provider.complete({
  messages: [...],
  trmConfig: { qualityMetric: 'coherence' }
});
```

## Cost Comparison

| Provider | Input Cost | Output Cost | Total (1M tokens) |
|----------|-----------|-------------|-------------------|
| Claude Opus 4.5 | $15/M | $75/M | ~$45,000 |
| GPT-4 | $10/M | $30/M | ~$20,000 |
| **RuvLLM Local** | **$0** | **$0** | **$0** |

Local inference = 100% cost savings for compute-intensive tasks.

## When to Use TRM

### Use TRM For:
- Complex reasoning tasks
- High-quality content generation
- Critical outputs (test plans, documentation)
- When accuracy > speed

### Skip TRM For:
- Simple queries
- Real-time responses needed
- Bulk processing
- Low-stakes outputs

## When to Use SONA

### Use SONA For:
- Repetitive tasks (test generation)
- Pattern-heavy workloads
- Long-running sessions
- Continuous improvement scenarios

### Skip SONA For:
- One-off queries
- Privacy-sensitive data (no learning)
- Stateless operations

## Troubleshooting

### Issue: "RuvllmProvider not initialized"

**Solution**:
```typescript
await provider.initialize(); // Must call before use
```

### Issue: "Module not found: @ruvector/ruvllm"

**Solution**:
```bash
npm install @ruvector/ruvllm@^0.2.3
```

### Issue: Server mode when expecting native

**Cause**: ruvLLM initialization failed

**Debug**:
```typescript
const provider = new RuvllmProvider({ debug: true });
await provider.initialize(); // Check logs

const health = await provider.healthCheck();
console.log(health.metadata.mode); // 'native' or 'server'
```

## Examples

### Test Generation with TRM

```typescript
const provider = new RuvllmProvider({
  enableTRM: true,
  maxTRMIterations: 5
});

await provider.initialize();

const response = await provider.complete({
  messages: [
    { role: 'system', content: 'You are a QE expert' },
    { role: 'user', content: 'Generate comprehensive tests for UserService' }
  ],
  trmConfig: {
    qualityMetric: 'coverage'
  }
});

console.log(`Quality: ${response.finalQuality}`);
console.log(response.content[0].text);
```

### Learning from Patterns

```typescript
const provider = new RuvllmProvider({ enableSONA: true });
await provider.initialize();

// Train on good examples
for (const example of trainingExamples) {
  await provider.complete({
    messages: [
      { role: 'user', content: example.input }
    ]
  });
}

// Use learned patterns
const response = await provider.complete({
  messages: [{ role: 'user', content: 'New task similar to training' }]
});

console.log(`Reused ${response.metadata.memoryHits} patterns`);
```

---

**For full details**: See [ruvllm-integration-complete.md](../analysis/ruvllm-integration-complete.md)
