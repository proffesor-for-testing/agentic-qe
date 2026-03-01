# Model Providers for Multi-Model Consensus

This directory contains model provider implementations for the multi-model consensus verification system.

## Overview

The consensus engine uses multiple AI models to verify security findings, reducing false positives from 73% to <25%. Each provider implements the `ModelProvider` interface and can be used independently or in combination.

## Implemented Providers

### 1. Claude Provider (`claude-provider.ts`)

**Models Supported:**
- `claude-3-5-sonnet-20241022` (recommended for cost/performance)
- `claude-3-5-sonnet-latest`
- `claude-3-opus-20240229` (highest accuracy)
- `claude-3-opus-latest`

**Configuration:**
```typescript
import { createClaudeProvider } from './providers';

const provider = createClaudeProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultModel: 'claude-3-5-sonnet-20241022',
  defaultTimeout: 30000,
  maxRetries: 3,
  enableLogging: false,
});
```

**Cost:**
- Claude 3.5 Sonnet: $3 input / $15 output per 1M tokens
- Claude 3 Opus: $15 input / $75 output per 1M tokens

### 2. OpenAI Provider (`openai-provider.ts`)

**Models Supported:**
- `gpt-4-turbo` (recommended)
- `gpt-4-turbo-preview`
- `gpt-4-0125-preview`
- `gpt-4-1106-preview`
- `gpt-4`

**Configuration:**
```typescript
import { createOpenAIProvider } from './providers';

const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_ORGANIZATION, // optional
  defaultModel: 'gpt-4-turbo',
  defaultTimeout: 30000,
  maxRetries: 3,
  enableLogging: false,
});
```

**Cost:**
- GPT-4-turbo: $10 input / $30 output per 1M tokens
- GPT-4: $30 input / $60 output per 1M tokens

### 3. Gemini Provider (`gemini-provider.ts`)

**Models Supported:**
- `gemini-1.5-pro-latest` (recommended)
- `gemini-1.5-pro`
- `gemini-1.5-flash-latest` (fastest, cheapest)
- `gemini-1.5-flash`
- `gemini-pro`

**Configuration:**
```typescript
import { createGeminiProvider } from './providers';

const provider = createGeminiProvider({
  apiKey: process.env.GOOGLE_API_KEY,
  defaultModel: 'gemini-1.5-pro-latest',
  defaultTimeout: 30000,
  maxRetries: 3,
  enableLogging: false,
});
```

**Cost:**
- Gemini 1.5 Pro: $3.50 input / $10.50 output per 1M tokens
- Gemini 1.5 Flash: $0.35 input / $1.05 output per 1M tokens (best cost/performance)
- Gemini Pro: $0.50 input / $1.50 output per 1M tokens

## Usage

### Register All Providers

```typescript
import { registerAllProviders } from './providers';

// Manual configuration
const registry = registerAllProviders({
  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    defaultModel: 'claude-3-5-sonnet-20241022',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    defaultModel: 'gpt-4-turbo',
  },
  gemini: {
    apiKey: process.env.GOOGLE_API_KEY,
    defaultModel: 'gemini-1.5-flash-latest',
  },
  enableLogging: true,
});

// Auto-detect from environment
import { registerProvidersFromEnv } from './providers';
const registry = registerProvidersFromEnv();

const providers = await registry.getAvailable();
console.log(`Registered ${providers.length} providers`);
```

### Get Recommended Providers

```typescript
import { getRecommendedProviders } from './providers';

// Get cost-optimized providers
const costOptimal = await getRecommendedProviders(registry, true, false);
// Returns: ['gemini', 'claude', 'openai']

// Get speed-optimized providers
const speedOptimal = await getRecommendedProviders(registry, false, true);
// Returns: ['gemini', 'claude', 'openai']

// Get accuracy-optimized providers (default)
const accuracyOptimal = await getRecommendedProviders(registry);
// Returns: ['claude', 'openai', 'gemini']
```

### Check Provider Health

```typescript
import { getHealthyProviders } from './providers';

const healthy = await getHealthyProviders(registry);
console.log(`Healthy providers: ${healthy.join(', ')}`);
```

## Environment Variables

Each provider requires an API key:

```bash
# Claude (Anthropic)
export ANTHROPIC_API_KEY="sk-ant-..."

# OpenAI
export OPENAI_API_KEY="sk-..."
export OPENAI_ORGANIZATION="org-..."  # Optional

# Gemini (Google)
export GOOGLE_API_KEY="AI..."
```

## Architecture

All providers extend `BaseModelProvider` which provides:

1. **Health checking** with caching (1-minute TTL)
2. **Retry logic** with exponential backoff
3. **Error handling** with non-retryable error detection
4. **Cost tracking** per token
5. **Verification prompt** generation
6. **Response parsing** for structured votes

### Provider Interface

```typescript
interface ModelProvider {
  readonly id: string;
  readonly name: string;
  readonly type: 'claude' | 'openai' | 'gemini' | ...;

  complete(prompt: string, options?: ModelCompletionOptions): Promise<string>;
  isAvailable(): Promise<boolean>;
  healthCheck(): Promise<ModelHealthResult>;
  getCostPerToken(): { input: number; output: number };
  getSupportedModels(): string[];
  dispose(): Promise<void>;
}
```

## Testing

Use the `MockModelProvider` for testing:

```typescript
import { createMockProvider } from '../model-provider';

const mockProvider = createMockProvider({
  id: 'mock-claude',
  name: 'Mock Claude',
  defaultAssessment: 'confirmed',
  defaultConfidence: 0.85,
  latencyMs: 100,
  healthy: true,
});

const response = await mockProvider.complete('test prompt');
// Returns formatted mock response
```

## Performance

| Provider | Avg Latency | Cost/1K tokens (avg) | Accuracy |
|----------|-------------|----------------------|----------|
| Claude 3.5 Sonnet | ~2-3s | $0.009 | High |
| Claude 3 Opus | ~3-5s | $0.045 | Highest |
| GPT-4-turbo | ~2-4s | $0.020 | High |
| GPT-4 | ~3-5s | $0.045 | High |
| Gemini 1.5 Pro | ~2-3s | $0.007 | High |
| Gemini 1.5 Flash | ~1-2s | $0.0007 | Medium-High |

## Error Handling

All providers implement robust error handling:

1. **Retryable errors:** Network issues, rate limits, temporary failures
2. **Non-retryable errors:** Authentication failures, invalid requests, quota exhausted
3. **Timeout handling:** Configurable per-request timeouts with abort controllers
4. **Safety blocking:** Gemini handles safety filters appropriately for security content

## Next Steps

See the parent `consensus` directory for:
- `ConsensusEngine` implementation (MM-006)
- Integration with security scanning workflow
- Caching and optimization strategies
