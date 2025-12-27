# LLM Provider Configuration Guide

## Overview

Agentic QE Fleet v2.6+ supports multiple LLM providers, enabling you to choose the best deployment mode for your environment:

- **Local Development**: Free Ollama models on your machine
- **Cloud Hosted**: OpenRouter with 300+ models
- **Free Cloud**: Groq, OpenRouter free tier, Google AI Studio
- **Direct API**: Claude API, Together.ai

This flexibility ensures you can run AQE agents regardless of budget, hardware, or deployment constraints.

## Supported Providers

### Provider Comparison Matrix

| Provider | Type | Cost | Setup Difficulty | Best For |
|----------|------|------|------------------|----------|
| **Ollama** | Local | FREE | Medium | Privacy, offline, no budget |
| **OpenRouter** | Cloud | Paid/Free | Easy | Multi-model access, flexibility |
| **Groq** | Cloud | FREE | Easy | High-speed inference, testing |
| **Claude API** | Cloud | Paid | Easy | Highest quality, production |
| **Together.ai** | Cloud | Paid | Easy | Open source models, cost-effective |
| **Google AI** | Cloud | FREE | Easy | Free tier, Gemini models |

### Deployment Modes

#### Local Development Mode
- **Best for**: Developers without budget, privacy-sensitive work
- **Provider**: Ollama
- **Cost**: $0
- **Requirements**: 8GB+ RAM, GPU recommended
- **Models**: qwen3-coder:30b, llama3.3:70b, devstral-small:24b

#### Hosted Cloud Mode
- **Best for**: Production, team collaboration
- **Provider**: OpenRouter, Claude API
- **Cost**: Pay-per-token ($0.06-$15 per million tokens)
- **Requirements**: API key, internet connection
- **Models**: 300+ models available

#### Free Cloud Mode
- **Best for**: Testing, learning, no budget
- **Provider**: Groq, OpenRouter free tier
- **Cost**: $0 (rate limits apply)
- **Requirements**: API key, internet connection
- **Limits**: Groq 14,400 requests/day, OpenRouter varies by model

## Configuration

### Environment Variables

```bash
# Claude API (paid)
export ANTHROPIC_API_KEY="sk-ant-..."

# OpenRouter (paid + free tier)
export OPENROUTER_API_KEY="sk-or-..."

# Groq (free tier)
export GROQ_API_KEY="gsk_..."

# Together.ai (paid)
export TOGETHER_API_KEY="..."

# Google AI Studio (free tier)
export GOOGLE_AI_API_KEY="..."

# Ollama (local, no key needed)
# Just install and run: ollama serve
```

### Provider Selection

AQE automatically detects the best provider based on your environment:

```typescript
// Priority order (configurable):
1. LLM_PROVIDER env var override
2. Claude Code environment → Claude API
3. OPENROUTER_API_KEY → OpenRouter
4. ANTHROPIC_API_KEY → Claude API
5. Ollama server running → Local inference
6. Fallback to first available provider
```

### Manual Configuration

Create a configuration file or use programmatic setup:

```typescript
import { LLMProviderFactory } from 'agentic-qe';

const factory = new LLMProviderFactory({
  // Option 1: Automatic detection
  defaultProvider: 'auto',
  enableSmartDetection: true,

  // Option 2: Explicit provider
  defaultProvider: 'openrouter',

  // Provider-specific configs
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultModel: 'mistralai/devstral-2512:free', // FREE
    enableAutoRoute: true,
    fallbackModels: [
      'mistralai/devstral-small-2505', // $0.06/$0.12 per M
      'openai/gpt-4o-mini'             // $0.15/$0.60 per M
    ]
  },

  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    defaultModel: 'claude-sonnet-4-20250514',
    enableCaching: true
  },

  ruvllm: {
    defaultModel: 'llama-3.2-3b-instruct',
    enableTRM: true,  // Test-time reasoning
    enableSONA: true  // Self-learning
  }
});

await factory.initialize();
```

## Provider-Specific Guides

### OpenRouter Setup

OpenRouter provides access to 300+ models from multiple providers through a single API.

```bash
# 1. Get API key from https://openrouter.ai/keys
export OPENROUTER_API_KEY="sk-or-v1-..."

# 2. Choose your model
# FREE tier: mistralai/devstral-2512:free
# Cheap paid: mistralai/devstral-small-2505 ($0.06/$0.12)
# High quality: anthropic/claude-3.5-sonnet ($3/$15)
```

**Recommended Models**:
- **FREE**: `mistralai/devstral-2512:free` - 123B, 256K context, best agentic coding
- **Cheapest Paid**: `mistralai/devstral-small-2505` - $0.06/$0.12 per M tokens
- **Balanced**: `qwen/qwen-2.5-coder-32b-instruct` - $0.18/$0.18 per M
- **High Quality**: `anthropic/claude-3.5-sonnet` - $3/$15 per M

### Claude API Setup

Direct access to Claude models with prompt caching.

```bash
# 1. Get API key from https://console.anthropic.com/
export ANTHROPIC_API_KEY="sk-ant-..."

# 2. Model automatically selected: claude-sonnet-4-20250514
```

**Features**:
- Prompt caching (90% cost reduction on repeated context)
- 200K context window
- Best-in-class quality for complex reasoning

### Ollama Setup

See [Ollama Setup Guide](./ollama-setup.md) for detailed instructions.

```bash
# Quick start
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen3-coder:30b
ollama serve
```

### Groq Setup (Free Tier)

Fast inference with generous free tier.

```bash
# 1. Get API key from https://console.groq.com/
export GROQ_API_KEY="gsk_..."

# 2. Use OpenRouter-compatible endpoint
# 14,400 requests/day free tier
```

**Available Models**:
- `llama3.3-70b-versatile` - General purpose
- `mixtral-8x7b-32768` - Long context
- `gemma2-9b-it` - Lightweight

### Google AI Studio Setup (Free Tier)

Free access to Gemini models.

```bash
# 1. Get API key from https://aistudio.google.com/
export GOOGLE_AI_API_KEY="..."

# 2. Use via OpenRouter or direct API
```

**Free Tier Limits**:
- 60 requests/minute
- 2 million tokens/minute
- 1,500 requests/day

## Configuration Patterns

### Cost Optimization

```typescript
// Hybrid routing: Local for simple, cloud for complex
const factory = new LLMProviderFactory({
  defaultProvider: 'auto',
  enableFallback: true,

  // Try local first
  ruvllm: {
    defaultModel: 'llama-3.2-3b-instruct'
  },

  // Fallback to cheapest cloud
  openrouter: {
    defaultModel: 'mistralai/devstral-2512:free',
    fallbackModels: [
      'mistralai/devstral-small-2505',
      'openai/gpt-4o-mini'
    ]
  }
});

// Route by task complexity
const provider = factory.selectBestProvider({
  preferLocal: true,        // Try local first
  preferLowCost: true,      // Then cheapest cloud
  maxCostPerMillion: 1.0    // Cap at $1 per M tokens
});
```

### Multi-Provider Reliability

```typescript
// Automatic fallback chain
const factory = new LLMProviderFactory({
  enableFallback: true,
  maxConsecutiveFailures: 3,
  healthCheckInterval: 60000, // Check every minute

  // Primary
  claude: { apiKey: process.env.ANTHROPIC_API_KEY },

  // Secondary
  openrouter: { apiKey: process.env.OPENROUTER_API_KEY },

  // Tertiary (local)
  ruvllm: { defaultModel: 'llama-3.2-3b-instruct' }
});

// Executes with automatic failover
await factory.executeWithFallback(async (provider) => {
  return await provider.complete({
    model: 'auto',
    messages: [{ role: 'user', content: 'Generate tests' }]
  });
});
```

### Model Hot-Swapping

```typescript
// Runtime model switching (OpenRouter)
const factory = new LLMProviderFactory({
  defaultProvider: 'openrouter',
  openrouter: {
    defaultModel: 'mistralai/devstral-2512:free'
  }
});

await factory.initialize();

// Switch to different model mid-session
await factory.hotSwapModel('anthropic/claude-3.5-sonnet');

// Check current model
const currentModel = factory.getCurrentModel();
console.log(`Using: ${currentModel}`);

// List available models
const models = await factory.listAvailableModels();
console.log(`Available: ${models.length} models`);
```

## Troubleshooting

### Common Issues

#### "Provider not initialized"
```bash
# Ensure you've initialized the factory
await factory.initialize();
```

#### "API key not found"
```bash
# Check environment variables
echo $ANTHROPIC_API_KEY
echo $OPENROUTER_API_KEY

# Or pass explicitly
const factory = new LLMProviderFactory({
  claude: { apiKey: 'sk-ant-...' }
});
```

#### "Ollama connection refused"
```bash
# Check if Ollama is running
ollama list

# Start Ollama server
ollama serve

# Test connectivity
curl http://localhost:11434/api/tags
```

#### "Rate limit exceeded"
```bash
# Free tiers have limits
# Groq: 14,400 requests/day
# Google AI: 1,500 requests/day

# Solution: Enable fallback to paid providers
const factory = new LLMProviderFactory({
  defaultProvider: 'groq',
  enableFallback: true,
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultModel: 'mistralai/devstral-small-2505' // Cheap backup
  }
});
```

### Health Monitoring

```typescript
// Check provider health
const health = await provider.healthCheck();
console.log(`Healthy: ${health.healthy}`);
console.log(`Latency: ${health.latency}ms`);

// Get all provider statuses
const statuses = factory.getAvailableProviders();
console.log(`Available providers: ${statuses.join(', ')}`);

// View usage stats
const stats = factory.getUsageStats();
for (const [provider, stat] of stats.entries()) {
  console.log(`${provider}: ${stat.requestCount} requests, $${stat.totalCost.toFixed(2)} cost`);
}
```

### Performance Optimization

```typescript
// Enable streaming for real-time feedback
for await (const chunk of provider.streamComplete(options)) {
  if (chunk.type === 'content_block_delta') {
    process.stdout.write(chunk.delta.text);
  }
}

// Use prompt caching (Claude only)
const options = {
  model: 'claude-sonnet-4',
  system: [{
    type: 'text',
    text: 'You are a test generator...',
    cache_control: { type: 'ephemeral' }  // Cache this prompt
  }],
  messages: [{ role: 'user', content: 'Generate tests for UserService' }]
};

// Subsequent requests with same system prompt = 90% cheaper
```

## Migration Guide

### From Single Provider to Multi-Provider

**Before** (Claude only):
```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const response = await client.messages.create({
  model: 'claude-sonnet-4',
  messages: [{ role: 'user', content: 'Hello' }]
});
```

**After** (Multi-provider):
```typescript
import { LLMProviderFactory } from 'agentic-qe';

const factory = new LLMProviderFactory({
  defaultProvider: 'auto',  // Auto-detect best provider
  enableFallback: true      // Automatic failover
});

await factory.initialize();

const response = await factory.executeWithFallback(
  provider => provider.complete({
    model: 'auto',  // Auto-select best model
    messages: [{ role: 'user', content: 'Hello' }]
  })
);
```

### Adding Local Inference

```typescript
// 1. Install Ollama
// See: https://ollama.com/download

// 2. Update configuration
const factory = new LLMProviderFactory({
  // Try local first (free)
  defaultProvider: 'auto',

  ruvllm: {
    defaultModel: 'llama-3.2-3b-instruct',
    enableTRM: true   // Test-time reasoning
  },

  // Cloud backup
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultModel: 'mistralai/devstral-2512:free'
  }
});

// Automatic routing: local if available, cloud otherwise
await factory.initialize();
```

## Best Practices

### 1. Use Auto-Detection

Let AQE choose the best provider based on your environment:

```typescript
const factory = new LLMProviderFactory({
  defaultProvider: 'auto',
  enableSmartDetection: true
});
```

### 2. Enable Fallback

Always configure backup providers:

```typescript
const factory = new LLMProviderFactory({
  enableFallback: true,
  claude: { apiKey: process.env.ANTHROPIC_API_KEY },
  openrouter: { apiKey: process.env.OPENROUTER_API_KEY },
  ruvllm: { defaultModel: 'llama-3.2-3b-instruct' }
});
```

### 3. Monitor Costs

Track usage and costs:

```typescript
const totalCost = factory.getTotalCost();
const stats = factory.getUsageStats();

// Log daily
console.log(`Daily cost: $${totalCost.toFixed(2)}`);
```

### 4. Match Model to Task

Use cheap models for simple tasks, expensive for complex:

```typescript
// Simple task: use free model
const simpleProvider = factory.selectBestProvider({
  preferLowCost: true,
  maxCostPerMillion: 0.5
});

// Complex task: use high-quality model
const complexProvider = factory.selectBestProvider({
  requiredCapabilities: ['streaming', 'vision']
});
```

### 5. Cache Aggressively

Use prompt caching to reduce costs:

```typescript
// Cache long prompts (Claude)
const systemPrompt = [{
  type: 'text',
  text: readFileSync('prompts/test-generator.md', 'utf-8'),
  cache_control: { type: 'ephemeral' }
}];

// First request: full cost
await provider.complete({ system: systemPrompt, messages: [...] });

// Subsequent requests: 90% cheaper
await provider.complete({ system: systemPrompt, messages: [...] });
```

## Next Steps

- **Local Setup**: [Ollama Setup Guide](./ollama-setup.md)
- **Free Tier**: [Free Tier Deployment Guide](./free-tier-guide.md)
- **Configuration**: [Provider Config Schema](../reference/provider-config-schema.md)
- **API Reference**: [LLM Provider API](../API.md#llm-providers)

## Support

- **Issues**: [GitHub Issues](https://github.com/proffesor-for-testing/agentic-qe/issues)
- **Discussions**: [GitHub Discussions](https://github.com/proffesor-for-testing/agentic-qe/discussions)
- **Examples**: [Code Examples](../../examples/)
