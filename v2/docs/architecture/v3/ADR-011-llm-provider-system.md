# ADR-011: LLM Provider System for Quality Engineering

## Status

**Accepted** - 2026-01-09

## Context

Agentic QE v3 requires integration with Large Language Models (LLMs) for:
- Test generation and analysis
- Code understanding and quality assessment
- Natural language processing of requirements
- Intelligent defect prediction

We need a flexible, resilient system that can:
1. Support multiple LLM providers (cloud and local)
2. Handle provider failures gracefully
3. Control and track costs
4. Cache repeated queries for efficiency
5. Support different models for different tasks

## Decision

We implement a **multi-provider LLM system** with the following components:

### 1. Provider Abstraction (`LLMProvider` interface)

```typescript
interface LLMProvider {
  type: LLMProviderType;
  name: string;
  isAvailable(): Promise<boolean>;
  healthCheck(): Promise<HealthCheckResult>;
  generate(input: string | Message[], options?: GenerateOptions): Promise<LLMResponse>;
  embed(text: string, options?: EmbedOptions): Promise<EmbeddingResponse>;
  complete(prompt: string, options?: CompleteOptions): Promise<CompletionResponse>;
  getCostPerToken(): { input: number; output: number };
  dispose(): Promise<void>;
}
```

### 2. Provider Implementations

| Provider | Use Case | Cost Model |
|----------|----------|------------|
| **ClaudeProvider** | Primary for QE tasks, best reasoning | Pay-per-token |
| **OpenAIProvider** | Secondary, embeddings support | Pay-per-token |
| **OllamaProvider** | Local development, zero-cost iteration | Free (local) |

### 3. Provider Manager

Coordinates multiple providers with:
- **Load Balancing**: Round-robin, least-cost, least-latency, random
- **Automatic Failover**: Falls back to next provider on failure
- **Circuit Breaker Integration**: Prevents cascading failures

### 4. Circuit Breaker Pattern

Three states for each provider:
- **Closed**: Normal operation
- **Open**: Failures exceeded threshold, requests rejected
- **Half-Open**: Testing recovery with limited requests

Configuration:
```typescript
{
  failureThreshold: 5,        // Failures before opening
  resetTimeoutMs: 30000,      // Time before half-open
  halfOpenSuccessThreshold: 2, // Successes to close
  failureWindowMs: 60000,     // Window for counting failures
  includeTimeouts: true       // Count timeouts as failures
}
```

### 5. LRU Cache

Caches responses to reduce costs and latency:
- Separate caches for generations, embeddings, completions
- Configurable TTL per entry
- Key generation based on input + options hash
- Memory usage tracking

### 6. Cost Tracker

Tracks token usage and costs:
- Per-provider and per-model breakdown
- Period-based summaries (hour, day, week, month)
- Cost alerts with thresholds
- Pre-request cost estimation

## Consequences

### Positive

1. **Resilience**: System continues operating even when providers fail
2. **Cost Control**: Clear visibility and limits on LLM spending
3. **Flexibility**: Easy to add new providers or switch between them
4. **Performance**: Caching reduces latency for repeated queries
5. **Local Development**: Ollama enables zero-cost iteration

### Negative

1. **Complexity**: More components to maintain
2. **Testing**: Need to mock multiple providers
3. **Configuration**: Multiple provider configs to manage

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Provider API changes | Abstract interface isolates changes |
| Cost overruns | Alerts and limits in CostTracker |
| Cache staleness | TTL-based expiration |
| Circuit flapping | Hysteresis via half-open state |

## Implementation

Location: `v3/src/shared/llm/`

```
llm/
  index.ts              # Public exports
  interfaces.ts         # Core types and interfaces
  circuit-breaker.ts    # Resilience pattern
  cache.ts             # LRU caching
  cost-tracker.ts      # Usage and cost tracking
  provider-manager.ts  # Multi-provider coordination
  providers/
    index.ts
    claude.ts          # Anthropic Claude
    openai.ts          # OpenAI GPT-4
    ollama.ts          # Local Ollama
```

## Usage Examples

### Basic Generation

```typescript
import { createQEProviderManager } from '@agentic-qe/v3/shared/llm';

const manager = createQEProviderManager();
await manager.initialize();

const response = await manager.generate('Analyze this code for bugs', {
  systemPrompt: 'You are a QE assistant specializing in code analysis.',
  maxTokens: 2048,
  temperature: 0.3,
});

console.log(response.content);
console.log(`Cost: $${response.cost.totalCost.toFixed(4)}`);
```

### Embeddings for Semantic Search

```typescript
const embedding = await manager.embed('test coverage analysis');
// Use embedding for vector similarity search
```

### Code Completion

```typescript
const completion = await manager.complete('function calculateTotal(items) {');
console.log(completion.completion);
```

### Cost Monitoring

```typescript
const summary = manager.getCostSummary('day');
console.log(`Today's cost: $${summary.totalCost.toFixed(2)}`);
console.log(`Total tokens: ${summary.totalTokens}`);
```

## Model Selection Guidelines

| Task | Recommended Model | Reason |
|------|-------------------|--------|
| Test generation | Claude Sonnet 4 | Best code understanding |
| Code review | Claude Sonnet 4 | Strong reasoning |
| Quick analysis | GPT-4o-mini | Fast and cheap |
| Embeddings | text-embedding-3-small | High quality, low cost |
| Local iteration | Llama 3.1 | Zero cost |

## Testing

Unit tests: `v3/tests/unit/shared/llm/`
- 136 tests covering all components
- Mock-based testing for API calls
- Coverage of error scenarios

```bash
cd v3 && npm test -- --run tests/unit/shared/llm/
```

## References

- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Anthropic API Documentation](https://docs.anthropic.com/)
- [OpenAI API Documentation](https://platform.openai.com/docs/)
- [Ollama Documentation](https://ollama.ai/docs/)
