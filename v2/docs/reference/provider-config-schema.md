# LLM Provider Configuration Schema

## Overview

This reference documents all configuration options for the multi-provider LLM system in Agentic QE Fleet v2.6+.

## Factory Configuration

### LLMProviderFactory

Main factory for creating and managing LLM providers.

```typescript
interface LLMProviderFactoryConfig {
  // Provider-specific configurations
  claude?: ClaudeProviderConfig;
  ruvllm?: RuvllmProviderConfig;
  openrouter?: OpenRouterConfig;

  // Global settings
  defaultProvider?: ProviderType;
  enableFallback?: boolean;
  healthCheckInterval?: number;
  maxConsecutiveFailures?: number;
  enableSmartDetection?: boolean;
}
```

### Global Settings

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `defaultProvider` | `'claude' \| 'ruvllm' \| 'openrouter' \| 'auto'` | `'auto'` | Default provider to use |
| `enableFallback` | `boolean` | `true` | Enable automatic fallback on failure |
| `healthCheckInterval` | `number` | `60000` | Health check interval in ms |
| `maxConsecutiveFailures` | `number` | `3` | Max failures before marking unhealthy |
| `enableSmartDetection` | `boolean` | `true` | Auto-detect best provider |

### Provider Types

```typescript
type ProviderType = 'claude' | 'ruvllm' | 'openrouter' | 'auto';
```

- **claude**: Direct Anthropic Claude API
- **ruvllm**: Local inference via Ollama/RuvLLM
- **openrouter**: OpenRouter (300+ models)
- **auto**: Automatic provider selection

## Claude Provider Configuration

### ClaudeProviderConfig

Configuration for Anthropic Claude API.

```typescript
interface ClaudeProviderConfig extends LLMProviderConfig {
  apiKey?: string;
  defaultModel?: string;
  enableCaching?: boolean;
  baseUrl?: string;
}
```

### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `apiKey` | `string` | `process.env.ANTHROPIC_API_KEY` | Anthropic API key |
| `defaultModel` | `string` | `'claude-sonnet-4-20250514'` | Default model to use |
| `enableCaching` | `boolean` | `true` | Enable prompt caching |
| `baseUrl` | `string` | `undefined` | Custom API base URL |
| `name` | `string` | `'claude'` | Provider name |
| `debug` | `boolean` | `false` | Enable debug logging |
| `timeout` | `number` | `60000` | Request timeout (ms) |
| `maxRetries` | `number` | `3` | Maximum retry attempts |

### Available Models

| Model | Input Cost | Output Cost | Context | Best For |
|-------|-----------|-------------|---------|----------|
| `claude-sonnet-4-20250514` | $3/M | $15/M | 200K | General purpose |
| `claude-opus-4-20250514` | $15/M | $75/M | 200K | Complex reasoning |
| `claude-3-5-haiku-20241022` | $0.8/M | $4/M | 200K | Fast, cost-effective |

### Example

```typescript
const factory = new LLMProviderFactory({
  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    defaultModel: 'claude-sonnet-4-20250514',
    enableCaching: true,
    timeout: 120000,
    maxRetries: 5
  }
});
```

## OpenRouter Configuration

### OpenRouterConfig

Configuration for OpenRouter API.

```typescript
interface OpenRouterConfig extends LLMProviderConfig {
  apiKey?: string;
  defaultModel?: string;
  siteUrl?: string;
  siteName?: string;
  fallbackModels?: string[];
  enableModelDiscovery?: boolean;
  baseUrl?: string;
  enableAutoRoute?: boolean;
}
```

### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `apiKey` | `string` | `process.env.OPENROUTER_API_KEY` | OpenRouter API key |
| `defaultModel` | `string` | `'mistralai/devstral-2512:free'` | Default model |
| `siteUrl` | `string` | `process.env.OPENROUTER_SITE_URL` | Your site URL |
| `siteName` | `string` | `'Agentic-QE-Fleet'` | Your site name |
| `fallbackModels` | `string[]` | See below | Fallback model chain |
| `enableModelDiscovery` | `boolean` | `true` | Fetch available models |
| `baseUrl` | `string` | `'https://openrouter.ai/api/v1'` | API base URL |
| `enableAutoRoute` | `boolean` | `true` | Enable auto-routing |
| `name` | `string` | `'openrouter'` | Provider name |
| `debug` | `boolean` | `false` | Enable debug logging |
| `timeout` | `number` | `60000` | Request timeout (ms) |
| `maxRetries` | `number` | `3` | Maximum retry attempts |

### Default Fallback Chain

```typescript
fallbackModels: [
  'mistralai/devstral-small-2505',      // $0.06/$0.12 per M
  'mistralai/devstral-small',           // $0.07/$0.28 per M
  'mistralai/devstral-medium',          // $0.40/$2.00 per M
  'openai/gpt-4o-mini',                 // $0.15/$0.60 per M
]
```

### Recommended Models

| Constant | Model ID | Cost | Description |
|----------|----------|------|-------------|
| `AGENTIC_CODING_FREE` | `mistralai/devstral-2512:free` | FREE | Best free agentic coding (123B) |
| `CHEAPEST_PAID` | `mistralai/devstral-small-2505` | $0.06/$0.12 | Cheapest paid option |
| `LIGHTWEIGHT_CODING` | `mistralai/devstral-small` | $0.07/$0.28 | 24B, good balance |
| `COMPLEX_REASONING` | `mistralai/devstral-medium` | $0.40/$2.00 | Complex tasks |
| `QWEN_CODER` | `qwen/qwen-2.5-coder-32b-instruct` | $0.18/$0.18 | Well-tested coder |
| `HIGH_QUALITY` | `anthropic/claude-3.5-sonnet` | $3/$15 | Highest quality |
| `COST_EFFECTIVE` | `openai/gpt-4o-mini` | $0.15/$0.60 | Cost-effective vendor |

### Example

```typescript
import { LLMProviderFactory, RECOMMENDED_MODELS } from 'agentic-qe';

const factory = new LLMProviderFactory({
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultModel: RECOMMENDED_MODELS.AGENTIC_CODING_FREE,
    fallbackModels: [
      RECOMMENDED_MODELS.CHEAPEST_PAID,
      RECOMMENDED_MODELS.QWEN_CODER,
      RECOMMENDED_MODELS.HIGH_QUALITY
    ],
    enableAutoRoute: true,
    siteUrl: 'https://my-project.com',
    siteName: 'My Testing Project'
  }
});
```

## RuvLLM/Ollama Configuration

### RuvllmProviderConfig

Configuration for local LLM inference.

```typescript
interface RuvllmProviderConfig extends LLMProviderConfig {
  ruvllmPath?: string;
  port?: number;
  defaultModel?: string;
  gpuLayers?: number;
  contextSize?: number;
  threads?: number;
  defaultTemperature?: number;
  enableEmbeddings?: boolean;
  enableTRM?: boolean;
  enableSONA?: boolean;
  maxTRMIterations?: number;
  convergenceThreshold?: number;
  sonaConfig?: SONAConfig;
  enableSessions?: boolean;
  sessionTimeout?: number;
  maxSessions?: number;
}
```

### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `ruvllmPath` | `string` | `'npx'` | Path to ruvllm executable |
| `port` | `number` | `8080` | Local server port |
| `defaultModel` | `string` | `'llama-3.2-3b-instruct'` | Default model |
| `gpuLayers` | `number` | `-1` | GPU layers to offload (-1 = all) |
| `contextSize` | `number` | `4096` | Context window size |
| `threads` | `number` | `4` | Number of threads |
| `defaultTemperature` | `number` | `0.7` | Default temperature |
| `enableEmbeddings` | `boolean` | `false` | Enable embeddings model |
| `enableTRM` | `boolean` | `true` | Enable test-time reasoning |
| `enableSONA` | `boolean` | `true` | Enable self-learning |
| `maxTRMIterations` | `number` | `7` | Max TRM iterations |
| `convergenceThreshold` | `number` | `0.95` | TRM convergence threshold |
| `sonaConfig` | `SONAConfig` | See below | SONA configuration |
| `enableSessions` | `boolean` | `true` | Enable session management |
| `sessionTimeout` | `number` | `1800000` | Session timeout (30 min) |
| `maxSessions` | `number` | `100` | Max concurrent sessions |

### SONAConfig

```typescript
interface SONAConfig {
  loraRank?: number;      // LoRA rank (default: 8)
  loraAlpha?: number;     // LoRA alpha (default: 16)
  ewcLambda?: number;     // EWC lambda (default: 2000)
}
```

### TRMConfig

```typescript
interface TRMConfig {
  maxIterations?: number;          // Default: 7
  convergenceThreshold?: number;   // Default: 0.95
  qualityMetric?: 'coherence' | 'coverage' | 'diversity';
}
```

### Available Models

| Model | Size | Context | Best For |
|-------|------|---------|----------|
| `qwen3-coder:30b` | 30B | 32K | Primary coding |
| `llama3.3:70b` | 70B | 128K | Large general-purpose |
| `devstral-small:24b` | 24B | 128K | Efficient coding |
| `rnj-1:8b` | 8B | 128K | Edge deployment |
| `deepseek-coder-v2:16b` | 16B | 128K | Code-specific |

### Example

```typescript
const factory = new LLMProviderFactory({
  ruvllm: {
    defaultModel: 'qwen3-coder:30b',
    gpuLayers: -1,              // Offload all to GPU
    contextSize: 8192,
    threads: 8,
    enableTRM: true,            // Test-time reasoning
    maxTRMIterations: 5,
    enableSONA: true,           // Self-learning
    sonaConfig: {
      loraRank: 8,
      loraAlpha: 16,
      ewcLambda: 2000
    },
    enableSessions: true,
    sessionTimeout: 1800000,    // 30 minutes
    maxSessions: 50
  }
});
```

## Ollama Provider Configuration

### OllamaProviderConfig

Configuration for Ollama server.

```typescript
interface OllamaProviderConfig extends LLMProviderConfig {
  baseUrl?: string;
  defaultModel?: string;
  keepAlive?: boolean;
  keepAliveDuration?: number;
}
```

### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `baseUrl` | `string` | `'http://localhost:11434'` | Ollama server URL |
| `defaultModel` | `string` | `'qwen3-coder:30b'` | Default model |
| `keepAlive` | `boolean` | `true` | Keep model in memory |
| `keepAliveDuration` | `number` | `300` | Keep alive duration (seconds) |
| `timeout` | `number` | `120000` | Request timeout (ms) |
| `maxRetries` | `number` | `2` | Maximum retry attempts |

### Example

```typescript
const provider = new OllamaProvider({
  baseUrl: 'http://localhost:11434',
  defaultModel: 'qwen3-coder:30b',
  keepAlive: true,
  keepAliveDuration: 600,     // 10 minutes
  timeout: 180000,            // 3 minutes
  debug: false
});
```

## Environment Variables

### Provider Keys

```bash
# Claude API
export ANTHROPIC_API_KEY="sk-ant-..."

# OpenRouter
export OPENROUTER_API_KEY="sk-or-v1-..."
export OPENROUTER_SITE_URL="https://my-project.com"
export OPENROUTER_SITE_NAME="My Project"

# Groq (via OpenRouter)
export GROQ_API_KEY="gsk_..."

# Google AI Studio
export GOOGLE_AI_API_KEY="..."

# Together.ai
export TOGETHER_API_KEY="..."
```

### Provider Selection

```bash
# Override automatic provider selection
export LLM_PROVIDER="claude"        # Force Claude
export LLM_PROVIDER="openrouter"    # Force OpenRouter
export LLM_PROVIDER="ruvllm"        # Force local
export LLM_PROVIDER="auto"          # Auto-detect (default)
```

### Ollama Configuration

```bash
# Ollama server URL
export OLLAMA_HOST="http://localhost:11434"

# Ollama models directory
export OLLAMA_MODELS="/path/to/models"

# GPU configuration
export CUDA_VISIBLE_DEVICES="0,1"   # Use GPUs 0 and 1

# Debug mode
export OLLAMA_DEBUG="1"
```

## Configuration File

### YAML Configuration

```yaml
# ~/.agentic-qe/llm-config.yaml

defaultProvider: auto
enableFallback: true
enableSmartDetection: true
healthCheckInterval: 60000
maxConsecutiveFailures: 3

claude:
  defaultModel: claude-sonnet-4-20250514
  enableCaching: true
  timeout: 120000
  maxRetries: 5

openrouter:
  defaultModel: mistralai/devstral-2512:free
  fallbackModels:
    - mistralai/devstral-small-2505
    - qwen/qwen-2.5-coder-32b-instruct
    - anthropic/claude-3.5-sonnet
  enableAutoRoute: true
  siteUrl: https://my-project.com
  siteName: My Testing Project

ruvllm:
  defaultModel: qwen3-coder:30b
  gpuLayers: -1
  contextSize: 8192
  threads: 8
  enableTRM: true
  maxTRMIterations: 7
  enableSONA: true
  sonaConfig:
    loraRank: 8
    loraAlpha: 16
    ewcLambda: 2000
  enableSessions: true
  sessionTimeout: 1800000
  maxSessions: 100
```

### JSON Configuration

```json
{
  "defaultProvider": "auto",
  "enableFallback": true,
  "enableSmartDetection": true,

  "claude": {
    "defaultModel": "claude-sonnet-4-20250514",
    "enableCaching": true
  },

  "openrouter": {
    "defaultModel": "mistralai/devstral-2512:free",
    "fallbackModels": [
      "mistralai/devstral-small-2505",
      "qwen/qwen-2.5-coder-32b-instruct"
    ],
    "enableAutoRoute": true
  },

  "ruvllm": {
    "defaultModel": "qwen3-coder:30b",
    "enableTRM": true,
    "enableSONA": true
  }
}
```

## Programmatic Configuration

### TypeScript

```typescript
import { LLMProviderFactory, RECOMMENDED_MODELS } from 'agentic-qe';

const factory = new LLMProviderFactory({
  // Global settings
  defaultProvider: 'auto',
  enableFallback: true,
  healthCheckInterval: 60000,
  maxConsecutiveFailures: 3,
  enableSmartDetection: true,

  // Claude configuration
  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    defaultModel: 'claude-sonnet-4-20250514',
    enableCaching: true,
    timeout: 120000,
    maxRetries: 5
  },

  // OpenRouter configuration
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultModel: RECOMMENDED_MODELS.AGENTIC_CODING_FREE,
    fallbackModels: [
      RECOMMENDED_MODELS.CHEAPEST_PAID,
      RECOMMENDED_MODELS.QWEN_CODER,
      RECOMMENDED_MODELS.HIGH_QUALITY
    ],
    enableAutoRoute: true,
    siteUrl: 'https://my-project.com',
    siteName: 'My Testing Project'
  },

  // RuvLLM configuration
  ruvllm: {
    defaultModel: 'qwen3-coder:30b',
    gpuLayers: -1,
    contextSize: 8192,
    threads: 8,
    enableTRM: true,
    maxTRMIterations: 7,
    enableSONA: true,
    sonaConfig: {
      loraRank: 8,
      loraAlpha: 16,
      ewcLambda: 2000
    },
    enableSessions: true,
    sessionTimeout: 1800000,
    maxSessions: 100
  }
});

await factory.initialize();
```

### JavaScript (ES6)

```javascript
const { LLMProviderFactory } = require('agentic-qe');

const factory = new LLMProviderFactory({
  defaultProvider: 'auto',
  enableFallback: true,

  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultModel: 'mistralai/devstral-2512:free'
  }
});

await factory.initialize();
```

## Provider Selection Criteria

### ProviderSelectionCriteria

```typescript
interface ProviderSelectionCriteria {
  preferLocal?: boolean;
  preferLowCost?: boolean;
  requiredCapabilities?: Array<keyof LLMProviderMetadata['capabilities']>;
  maxCostPerMillion?: number;
  requiredModels?: string[];
}
```

### Example Usage

```typescript
// Select cheapest provider
const cheapProvider = factory.selectBestProvider({
  preferLowCost: true,
  maxCostPerMillion: 1.0
});

// Select local provider
const localProvider = factory.selectBestProvider({
  preferLocal: true
});

// Select by capabilities
const streamingProvider = factory.selectBestProvider({
  requiredCapabilities: ['streaming', 'vision']
});

// Select by model
const claudeProvider = factory.selectBestProvider({
  requiredModels: ['claude-sonnet-4-20250514']
});
```

## Default Values

### Provider Defaults

| Provider | Default Model | Default Cost | Location |
|----------|--------------|--------------|----------|
| Claude | `claude-sonnet-4-20250514` | $3/$15 per M | Cloud |
| OpenRouter | `mistralai/devstral-2512:free` | FREE | Cloud |
| RuvLLM | `llama-3.2-3b-instruct` | FREE | Local |
| Ollama | `qwen3-coder:30b` | FREE | Local |

### Global Defaults

| Setting | Default | Description |
|---------|---------|-------------|
| `defaultProvider` | `'auto'` | Auto-detect best provider |
| `enableFallback` | `true` | Enable automatic fallback |
| `healthCheckInterval` | `60000` | Health check every 1 minute |
| `maxConsecutiveFailures` | `3` | Mark unhealthy after 3 failures |
| `enableSmartDetection` | `true` | Auto-detect environment |

## Validation

The configuration is validated at initialization:

```typescript
// Invalid configuration will throw error
try {
  const factory = new LLMProviderFactory({
    claude: {
      defaultModel: 'invalid-model'  // ❌ Error
    }
  });
  await factory.initialize();
} catch (error) {
  console.error('Configuration error:', error.message);
}
```

## See Also

- [LLM Providers Guide](../guides/llm-providers-guide.md)
- [Ollama Setup Guide](../guides/ollama-setup.md)
- [Free Tier Guide](../guides/free-tier-guide.md)
- [API Reference](../API.md#llm-providers)
