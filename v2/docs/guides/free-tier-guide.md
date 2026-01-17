# Free Tier Deployment Guide

## Overview

This guide shows you how to deploy Agentic QE Fleet without spending money on AI APIs. Perfect for students, open-source projects, or anyone on a budget.

**Zero-Cost Options**:
1. **Local Ollama** - Free, private, offline (requires hardware)
2. **Groq** - 14,400 requests/day FREE
3. **OpenRouter Free Tier** - Multiple FREE models
4. **Google AI Studio** - 1,500 requests/day FREE
5. **Together.ai Trial** - $25 free credits

## Quick Start (< 5 Minutes)

### Option 1: Fastest Setup (Groq)

```bash
# 1. Get free API key from https://console.groq.com/
export GROQ_API_KEY="gsk_..."

# 2. Install AQE
npm install -g agentic-qe

# 3. Initialize
aqe init

# 4. Use it!
claude "Use qe-test-generator to create tests for src/UserService.ts"
```

**What you get**:
- 14,400 requests/day (about 480 test generations)
- Llama 3.3 70B model
- Ultra-fast inference (<1s for most queries)
- No credit card required

### Option 2: Best Quality (OpenRouter Free + Ollama Backup)

```bash
# 1. Get free API keys
# OpenRouter: https://openrouter.ai/keys (GitHub login)
export OPENROUTER_API_KEY="sk-or-v1-..."

# 2. Install Ollama (backup)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen3-coder:30b

# 3. Install AQE
npm install -g agentic-qe
aqe init

# 4. Configure hybrid mode
cat > ~/.agentic-qe/llm-config.json <<EOF
{
  "defaultProvider": "auto",
  "enableFallback": true,
  "openrouter": {
    "apiKey": "$OPENROUTER_API_KEY",
    "defaultModel": "mistralai/devstral-2512:free"
  },
  "ruvllm": {
    "defaultModel": "qwen3-coder:30b"
  }
}
EOF
```

**What you get**:
- Devstral 2 123B FREE (best agentic coding)
- Automatic fallback to local Ollama
- Works offline with Ollama
- No credit card required

## Provider Comparison

| Provider | Daily Limit | Models | Speed | Quality | Setup |
|----------|-------------|--------|-------|---------|-------|
| **Groq** | 14,400 req | llama3.3:70b, mixtral-8x7b | Ultra-fast | High | 1 min |
| **OpenRouter FREE** | Varies | devstral:123b, qwen:32b | Fast | Very High | 2 min |
| **Google AI** | 1,500 req | gemini-1.5-pro, gemini-1.5-flash | Medium | High | 2 min |
| **Ollama** | Unlimited | Any local model | Fast (GPU) | Medium-High | 10 min |
| **Together.ai** | $25 credits | 100+ open models | Fast | High | 3 min |

## Detailed Setup

### Groq (Recommended - Easiest)

**Step 1: Get API Key**

1. Visit https://console.groq.com/
2. Sign up with GitHub (or email)
3. Navigate to API Keys
4. Create new key
5. Copy key (starts with `gsk_`)

**Step 2: Configure**

```bash
# Add to environment
echo 'export GROQ_API_KEY="gsk_..."' >> ~/.bashrc
source ~/.bashrc

# Or use .env file
cat > .env <<EOF
GROQ_API_KEY=gsk_...
EOF
```

**Step 3: Test**

```bash
# Test with curl
curl -X POST https://api.groq.com/openai/v1/chat/completions \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.3-70b-versatile",
    "messages": [{"role": "user", "content": "Say hello"}]
  }'

# Use with AQE
aqe init
```

**Rate Limits**:
- 14,400 requests/day
- 30 requests/minute
- 6,000 tokens/minute

**Best For**:
- Fast iteration during development
- CI/CD pipelines (high request volume)
- Real-time test generation

### OpenRouter Free Tier

**Step 1: Get API Key**

1. Visit https://openrouter.ai/keys
2. Sign in with GitHub
3. Create new key
4. Copy key (starts with `sk-or-v1-`)

**Step 2: Configure**

```bash
# Add to environment
echo 'export OPENROUTER_API_KEY="sk-or-v1-..."' >> ~/.bashrc
source ~/.bashrc
```

**Step 3: Choose Free Models**

```typescript
import { LLMProviderFactory } from 'agentic-qe';

const factory = new LLMProviderFactory({
  defaultProvider: 'openrouter',
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    // FREE Tier Models:
    defaultModel: 'mistralai/devstral-2512:free',  // 123B, best agentic
    fallbackModels: [
      'meta-llama/llama-3.3-70b-instruct:free',
      'qwen/qwen-2.5-coder-32b-instruct:free',
      'google/gemini-2.0-flash-exp:free'
    ]
  }
});
```

**Available FREE Models**:
- `mistralai/devstral-2512:free` - 123B, 256K context, agentic coding
- `meta-llama/llama-3.3-70b-instruct:free` - 70B, general purpose
- `qwen/qwen-2.5-coder-32b-instruct:free` - 32B, coding specialist
- `google/gemini-2.0-flash-exp:free` - Multimodal, fast

**Rate Limits**: Varies by model, no hard daily limit

**Best For**:
- Access to multiple cutting-edge models
- Flexibility to switch models
- Long-context tasks (256K)

### Google AI Studio

**Step 1: Get API Key**

1. Visit https://aistudio.google.com/
2. Sign in with Google account
3. Click "Get API Key"
4. Create API key
5. Copy key

**Step 2: Configure**

```bash
# Add to environment
echo 'export GOOGLE_AI_API_KEY="..."' >> ~/.bashrc
source ~/.bashrc
```

**Step 3: Use with OpenRouter**

```typescript
// Google AI via OpenRouter (easier integration)
const factory = new LLMProviderFactory({
  defaultProvider: 'openrouter',
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultModel: 'google/gemini-2.0-flash-exp:free'
  }
});
```

**Rate Limits**:
- 1,500 requests/day (free tier)
- 60 requests/minute
- 2 million tokens/minute

**Best For**:
- Multimodal tasks (vision + text)
- Long context windows
- Fast inference

### Ollama (Local/Offline)

**Step 1: Install**

```bash
# macOS/Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows: Download from https://ollama.com/download
```

**Step 2: Download Models**

```bash
# Fast, lightweight (8B - good for testing)
ollama pull rnj-1:8b

# Balanced quality (30B - recommended)
ollama pull qwen3-coder:30b

# Best quality (70B - needs 64GB+ RAM)
ollama pull llama3.3:70b
```

**Step 3: Start Server**

```bash
# Start Ollama service
ollama serve

# Or run in background
ollama serve > /dev/null 2>&1 &
```

**Step 4: Configure AQE**

```typescript
const factory = new LLMProviderFactory({
  defaultProvider: 'ruvllm',  // Local Ollama
  ruvllm: {
    defaultModel: 'qwen3-coder:30b',
    baseUrl: 'http://localhost:11434'
  }
});
```

**Requirements**:
- 8GB+ RAM (for 3B-7B models)
- 32GB+ RAM (for 13B-30B models)
- 64GB+ RAM (for 70B models)
- GPU recommended but not required

**Best For**:
- Complete privacy (data never leaves machine)
- Offline work
- Unlimited usage
- Full control

### Together.ai (Free Credits)

**Step 1: Get API Key**

1. Visit https://www.together.ai/
2. Sign up for account
3. Get $25 free credits
4. Copy API key from dashboard

**Step 2: Configure**

```bash
# Add to environment
echo 'export TOGETHER_API_KEY="..."' >> ~/.bashrc
source ~/.bashrc
```

**Step 3: Use via OpenRouter**

```typescript
const factory = new LLMProviderFactory({
  defaultProvider: 'openrouter',
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultModel: 'together-ai/qwen-2.5-coder-32b-instruct'
  }
});
```

**Free Credits**:
- $25 initial credits
- Expires after 30 days
- Models from $0.10-$1.00 per million tokens

**Best For**:
- Testing before committing to paid tier
- Short-term projects
- Access to Llama, Qwen, Mistral models

## Hybrid Deployment (Recommended)

Combine multiple free tiers for reliability:

```typescript
import { LLMProviderFactory } from 'agentic-qe';

const factory = new LLMProviderFactory({
  // Auto-select best available provider
  defaultProvider: 'auto',
  enableFallback: true,
  maxConsecutiveFailures: 3,

  // Priority 1: OpenRouter FREE (best quality)
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultModel: 'mistralai/devstral-2512:free',
    fallbackModels: [
      'meta-llama/llama-3.3-70b-instruct:free',
      'qwen/qwen-2.5-coder-32b-instruct:free'
    ]
  },

  // Priority 2: Groq (high volume)
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    defaultModel: 'llama-3.3-70b-versatile'
  },

  // Priority 3: Local Ollama (backup)
  ruvllm: {
    defaultModel: 'qwen3-coder:30b',
    baseUrl: 'http://localhost:11434'
  }
});

await factory.initialize();

// Automatic failover across all providers
const response = await factory.executeWithFallback(
  provider => provider.complete({
    model: 'auto',
    messages: [{ role: 'user', content: 'Generate tests...' }]
  })
);
```

**Benefits**:
- Never run out of quota
- Automatic failover
- Best of all providers
- Still 100% free

## Cost Optimization Strategies

### 1. Smart Model Selection

```typescript
// Use smaller models for simple tasks
const simpleProvider = factory.selectBestProvider({
  preferLocal: true,        // Try Ollama first (free)
  preferLowCost: true,      // Then cheapest cloud
  maxCostPerMillion: 0.0    // Only FREE models
});

// Complex tasks: use best free model
const complexProvider = factory.selectBestProvider({
  requiredModels: ['mistralai/devstral-2512:free']
});
```

### 2. Cache Results Locally

```typescript
import { readFileSync, writeFileSync, existsSync } from 'fs';

function cachedGenerate(prompt: string) {
  const cacheKey = crypto.createHash('sha256')
    .update(prompt)
    .digest('hex');

  const cachePath = `.cache/${cacheKey}.json`;

  // Return cached result
  if (existsSync(cachePath)) {
    return JSON.parse(readFileSync(cachePath, 'utf-8'));
  }

  // Generate and cache
  const result = await provider.complete({...});
  writeFileSync(cachePath, JSON.stringify(result));
  return result;
}
```

### 3. Batch Requests

```typescript
// Instead of 10 separate requests
for (const file of files) {
  await generateTests(file);  // 10 API calls
}

// Batch in single request
const allFiles = files.join('\n---\n');
const result = await generateTests(allFiles);  // 1 API call
```

### 4. Use Local for Development

```bash
# Development: Use fast local model
export LLM_PROVIDER=ruvllm
export RUVLLM_MODEL=rnj-1:8b

# Production: Use high-quality free cloud
export LLM_PROVIDER=openrouter
export OPENROUTER_MODEL=mistralai/devstral-2512:free
```

### 5. Monitor Usage

```typescript
// Track daily usage
const stats = factory.getUsageStats();

for (const [provider, stat] of stats.entries()) {
  console.log(`${provider}: ${stat.requestCount} requests today`);

  // Warn when approaching limits
  if (provider === 'groq' && stat.requestCount > 12000) {
    console.warn('Groq: 84% of daily quota used');
  }
}
```

## Rate Limit Management

### Detecting Rate Limits

```typescript
try {
  const response = await provider.complete(options);
} catch (error) {
  if (error.message.includes('rate limit')) {
    // Switch to backup provider
    const backup = factory.getProvider('ruvllm');
    const response = await backup.complete(options);
  }
}
```

### Automatic Retry with Backoff

```typescript
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      const delay = Math.pow(2, i) * 1000;  // Exponential backoff
      console.log(`Rate limited, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

const response = await retryWithBackoff(() =>
  provider.complete(options)
);
```

### Multi-Provider Queue

```typescript
class RateLimitedQueue {
  private queues: Map<string, Array<() => Promise<any>>>;
  private processing: Map<string, boolean>;

  async add(provider: string, fn: () => Promise<any>) {
    if (!this.queues.has(provider)) {
      this.queues.set(provider, []);
    }

    this.queues.get(provider)!.push(fn);
    this.process(provider);
  }

  private async process(provider: string) {
    if (this.processing.get(provider)) return;
    this.processing.set(provider, true);

    const queue = this.queues.get(provider)!;

    while (queue.length > 0) {
      const fn = queue.shift()!;
      try {
        await fn();
        await this.delay(provider);  // Rate limit delay
      } catch (error) {
        if (error.message.includes('rate limit')) {
          queue.unshift(fn);  // Re-queue
          await this.delay(provider, true);  // Longer delay
        }
      }
    }

    this.processing.set(provider, false);
  }

  private async delay(provider: string, rateLimited = false) {
    const delays = {
      groq: rateLimited ? 60000 : 2000,       // 1 min : 2 sec
      openrouter: rateLimited ? 10000 : 500,  // 10 sec : 0.5 sec
      google: rateLimited ? 60000 : 1000      // 1 min : 1 sec
    };
    await new Promise(resolve => setTimeout(resolve, delays[provider] || 1000));
  }
}
```

## Example Workflows

### Daily Test Generation (< 100 files)

```bash
# Use Groq free tier (14,400 requests/day)
export GROQ_API_KEY="gsk_..."
export LLM_PROVIDER=groq

# Generate tests for all source files
aqe test src/**/*.ts

# Daily usage: ~100 requests (< 1% of quota)
```

### CI/CD Pipeline

```yaml
# .github/workflows/test-generation.yml
name: Generate Tests

on: [push, pull_request]

jobs:
  generate-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup AQE
        run: |
          npm install -g agentic-qe
          aqe init
        env:
          GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}

      - name: Generate Tests
        run: |
          aqe test src/**/*.ts --output tests/

      - name: Commit Tests
        run: |
          git config --global user.name "AQE Bot"
          git config --global user.email "bot@agentic-qe.com"
          git add tests/
          git commit -m "chore: generate tests" || true
          git push
```

### Large Project (1000+ files)

```typescript
// Use hybrid approach with multiple providers

// Chunk 1-500: OpenRouter FREE
process.env.LLM_PROVIDER = 'openrouter';
await generateTests(files.slice(0, 500));

// Chunk 501-1000: Groq
process.env.LLM_PROVIDER = 'groq';
await generateTests(files.slice(500, 1000));

// Chunk 1001+: Ollama (local, unlimited)
process.env.LLM_PROVIDER = 'ruvllm';
await generateTests(files.slice(1000));
```

## Monitoring and Analytics

### Track Provider Usage

```typescript
// Log all requests
const logger = {
  log: (provider: string, tokens: number) => {
    const date = new Date().toISOString().split('T')[0];
    const logFile = `logs/${provider}-${date}.json`;

    const entry = {
      timestamp: Date.now(),
      provider,
      tokens,
      cost: 0
    };

    appendFileSync(logFile, JSON.stringify(entry) + '\n');
  }
};

// After each request
logger.log('groq', response.usage.input_tokens + response.usage.output_tokens);
```

### Daily Summary

```bash
#!/bin/bash
# daily-summary.sh

echo "=== Daily LLM Usage ==="
echo "Date: $(date +%Y-%m-%d)"
echo ""

# Groq usage
groq_count=$(grep -c "groq" logs/groq-*.json 2>/dev/null || echo 0)
echo "Groq: $groq_count / 14,400 requests ($(($groq_count * 100 / 14400))%)"

# OpenRouter usage
or_count=$(grep -c "openrouter" logs/openrouter-*.json 2>/dev/null || echo 0)
echo "OpenRouter: $or_count requests"

# Ollama usage (local)
ollama_count=$(grep -c "ruvllm" logs/ruvllm-*.json 2>/dev/null || echo 0)
echo "Ollama (local): $ollama_count requests (FREE)"
```

## Troubleshooting

### "Rate limit exceeded"

```bash
# Check current usage
aqe status --provider groq

# Switch to backup provider
export LLM_PROVIDER=openrouter

# Or wait for reset (midnight UTC)
echo "Groq resets at $(TZ=UTC date -d 'tomorrow 00:00' '+%H:%M:%S %Z')"
```

### "Invalid API key"

```bash
# Verify key format
echo $GROQ_API_KEY  # Should start with gsk_
echo $OPENROUTER_API_KEY  # Should start with sk-or-v1-

# Test key
curl https://api.groq.com/openai/v1/models \
  -H "Authorization: Bearer $GROQ_API_KEY"
```

### "Model not available"

```bash
# Check available free models
curl https://openrouter.ai/api/v1/models | jq '.data[] | select(.pricing.prompt == "0") | .id'

# Use verified free model
export OPENROUTER_MODEL="mistralai/devstral-2512:free"
```

## Next Steps

- **Ollama Setup**: [Detailed Ollama Guide](./ollama-setup.md)
- **Provider Guide**: [All Providers Overview](./llm-providers-guide.md)
- **Configuration**: [Config Schema Reference](../reference/provider-config-schema.md)

## Resources

### Free Tier Links
- Groq: https://console.groq.com/
- OpenRouter: https://openrouter.ai/keys
- Google AI: https://aistudio.google.com/
- Ollama: https://ollama.com/download
- Together.ai: https://www.together.ai/

### Documentation
- Groq API Docs: https://console.groq.com/docs
- OpenRouter Docs: https://openrouter.ai/docs
- Ollama Docs: https://github.com/ollama/ollama/tree/main/docs
- Google AI Docs: https://ai.google.dev/

### Community
- AQE Discussions: https://github.com/proffesor-for-testing/agentic-qe/discussions
- Ollama Discord: https://discord.gg/ollama
- OpenRouter Discord: https://discord.gg/openrouter
