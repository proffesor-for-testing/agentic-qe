# GitHub Models Provider

LLM provider implementation for GitHub Models API with unlimited free usage in GitHub Codespaces.

## Features

- ✅ **Free in Codespaces**: Unlimited usage in GitHub Codespaces environment
- ✅ **OpenAI-Compatible**: Uses standard OpenAI API format
- ✅ **Multiple Models**: GPT-4o, GPT-4o-mini, Phi-3.5, Meta LLaMA 3.1
- ✅ **Streaming Support**: Server-Sent Events (SSE) streaming
- ✅ **Auto-Detection**: Automatically detects Codespaces environment
- ✅ **Cost Tracking**: Tracks usage and calculates costs (free in Codespaces)

## Available Models

| Model | Type | Use Case |
|-------|------|----------|
| `gpt-4o-mini` | Fast & Efficient | Default, general purpose |
| `gpt-4o` | Advanced | Complex reasoning tasks |
| `Phi-3.5-mini-instruct` | Lightweight | Edge deployment, quick responses |
| `Meta-Llama-3.1-8B-Instruct` | Open Source | Privacy-focused applications |

## Quick Start

### Prerequisites

```bash
# Set your GitHub token
export GITHUB_TOKEN="ghp_your_token_here"

# Optional: Codespaces is auto-detected
# CODESPACES=true is set automatically in GitHub Codespaces
```

### Basic Usage

```typescript
import { GitHubModelsProvider } from '@agentic-qe/providers';

// Create provider
const provider = new GitHubModelsProvider({
  defaultModel: 'gpt-4o-mini'
});

// Initialize
await provider.initialize();

// Complete a prompt
const response = await provider.complete({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'user', content: 'Hello, how are you?' }
  ],
  maxTokens: 100
});

console.log(response.content[0].text);
```

### Streaming Responses

```typescript
for await (const event of provider.streamComplete({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'user', content: 'Tell me a story.' }
  ],
  maxTokens: 500
})) {
  if (event.type === 'content_block_delta') {
    process.stdout.write(event.delta.text);
  }
}
```

### System Prompts

```typescript
const response = await provider.complete({
  model: 'gpt-4o',
  system: [
    {
      type: 'text',
      text: 'You are a helpful coding assistant.'
    }
  ],
  messages: [
    { role: 'user', content: 'Explain async/await in JavaScript.' }
  ]
});
```

## Configuration

```typescript
interface GitHubModelsProviderConfig {
  /** GitHub token (defaults to process.env.GITHUB_TOKEN) */
  token?: string;

  /** Base URL for GitHub Models API */
  baseUrl?: string; // default: 'https://models.inference.ai.azure.com'

  /** Default model name */
  defaultModel?: string; // default: 'gpt-4o-mini'

  /** Force Codespaces mode (auto-detected if not set) */
  inCodespaces?: boolean;

  /** Enable debug logging */
  debug?: boolean;

  /** Request timeout in milliseconds */
  timeout?: number; // default: 60000

  /** Maximum retries on failure */
  maxRetries?: number; // default: 3
}
```

## API Reference

### Methods

#### `initialize(): Promise<void>`
Initialize the provider and validate GitHub token.

```typescript
await provider.initialize();
```

#### `complete(options): Promise<LLMCompletionResponse>`
Generate a completion from the model.

```typescript
const response = await provider.complete({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello!' }],
  maxTokens: 100,
  temperature: 0.7
});
```

#### `streamComplete(options): AsyncIterableIterator<LLMStreamEvent>`
Stream a completion from the model.

```typescript
for await (const event of provider.streamComplete({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello!' }]
})) {
  // Handle streaming events
}
```

#### `healthCheck(): Promise<LLMHealthStatus>`
Check if the provider is healthy and accessible.

```typescript
const health = await provider.healthCheck();
console.log(`Healthy: ${health.healthy}, Latency: ${health.latency}ms`);
```

#### `getMetadata(): LLMProviderMetadata`
Get provider capabilities and metadata.

```typescript
const metadata = provider.getMetadata();
console.log(`Models: ${metadata.models}`);
console.log(`Costs: $${metadata.costs.inputPerMillion}/M tokens`);
```

#### `trackCost(usage): number`
Calculate cost for token usage (returns 0 in Codespaces).

```typescript
const cost = provider.trackCost({
  input_tokens: 1000,
  output_tokens: 500
});
console.log(`Cost: $${cost}`);
```

#### `setModel(model): Promise<void>`
Switch to a different model.

```typescript
await provider.setModel('gpt-4o');
```

#### `getCurrentModel(): string`
Get the currently active model.

```typescript
console.log(provider.getCurrentModel()); // 'gpt-4o-mini'
```

#### `getAvailableModels(): string[]`
Get list of available models.

```typescript
const models = provider.getAvailableModels();
// ['gpt-4o-mini', 'gpt-4o', 'Phi-3.5-mini-instruct', 'Meta-Llama-3.1-8B-Instruct']
```

#### `countTokens(options): Promise<number>`
Estimate token count for text (approximate).

```typescript
const tokens = await provider.countTokens({
  text: 'Hello, world!'
});
```

#### `isInCodespaces(): boolean`
Check if running in GitHub Codespaces.

```typescript
if (provider.isInCodespaces()) {
  console.log('FREE usage enabled!');
}
```

#### `shutdown(): Promise<void>`
Gracefully shutdown the provider.

```typescript
await provider.shutdown();
```

## Cost Information

### In GitHub Codespaces
- **Input tokens**: $0/million (FREE)
- **Output tokens**: $0/million (FREE)
- **Rate limits**: Standard GitHub API rate limits

### Outside Codespaces
Estimated pricing (may vary):

| Model | Input ($/M tokens) | Output ($/M tokens) |
|-------|-------------------|---------------------|
| gpt-4o-mini | $0.15 | $0.60 |
| gpt-4o | $2.50 | $10.00 |
| Phi-3.5-mini | FREE | FREE |
| Meta-Llama-3.1-8B | FREE | FREE |

## Error Handling

The provider throws `LLMProviderError` with specific error codes:

```typescript
try {
  await provider.initialize();
} catch (error) {
  if (error instanceof LLMProviderError) {
    console.error(`Provider Error [${error.code}]: ${error.message}`);
    console.error(`Retryable: ${error.retryable}`);
  }
}
```

### Error Codes

- `AUTH_ERROR`: Invalid or missing GitHub token
- `NOT_INITIALIZED`: Provider not initialized
- `API_ERROR`: GitHub Models API error
- `NOT_SUPPORTED`: Feature not supported (e.g., embeddings)

## Environment Variables

```bash
# Required
GITHUB_TOKEN=ghp_your_token_here

# Auto-detected (set by GitHub Codespaces)
CODESPACES=true

# Optional
LOG_LEVEL=debug
```

## Best Practices

### 1. Token Management
```typescript
// Use environment variable (recommended)
const provider = new GitHubModelsProvider();

// Or pass explicitly
const provider = new GitHubModelsProvider({
  token: process.env.GITHUB_TOKEN
});
```

### 2. Model Selection
```typescript
// Use mini for general tasks (faster, cheaper)
const miniProvider = new GitHubModelsProvider({
  defaultModel: 'gpt-4o-mini'
});

// Use full GPT-4o for complex reasoning
const advancedProvider = new GitHubModelsProvider({
  defaultModel: 'gpt-4o'
});
```

### 3. Error Handling
```typescript
async function safeComplete(prompt: string) {
  try {
    return await provider.complete({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }]
    });
  } catch (error) {
    if (error instanceof LLMProviderError && error.retryable) {
      // Retry logic
      await new Promise(resolve => setTimeout(resolve, 1000));
      return safeComplete(prompt);
    }
    throw error;
  }
}
```

### 4. Health Monitoring
```typescript
// Check health before heavy operations
const health = await provider.healthCheck();
if (!health.healthy) {
  console.error('Provider unhealthy:', health.error);
  return;
}

// Proceed with operations
```

## Examples

See [examples/github-models-provider-example.ts](../../examples/github-models-provider-example.ts) for a complete working example.

## Integration with LLMProviderFactory

The GitHubModelsProvider can be integrated into the LLMProviderFactory for automatic provider selection:

```typescript
import { LLMProviderFactory } from '@agentic-qe/providers';

const factory = new LLMProviderFactory({
  githubModels: {
    defaultModel: 'gpt-4o-mini'
  },
  enableSmartDetection: true
});

await factory.initialize();

// Factory will auto-select GitHub Models in Codespaces
const provider = factory.selectBestProvider();
```

## Limitations

1. **No Embeddings**: GitHub Models API does not support embeddings
2. **No Vision**: Image/multimodal inputs not supported
3. **No Caching**: No built-in prompt caching (unlike Claude)
4. **Rate Limits**: Subject to GitHub API rate limits

## Troubleshooting

### Token Issues
```bash
# Verify token is set
echo $GITHUB_TOKEN

# Test token validity
gh auth status

# Refresh token if needed
gh auth refresh
```

### Codespaces Detection
```typescript
// Check if properly detected
console.log('CODESPACES env:', process.env.CODESPACES);
console.log('Detected:', provider.isInCodespaces());
```

### API Errors
```typescript
// Enable debug logging
const provider = new GitHubModelsProvider({
  debug: true
});

// Check health
const health = await provider.healthCheck();
console.log('Health:', health);
```

## Related Documentation

- [ILLMProvider Interface](./interface.md)
- [LLMProviderFactory](./factory.md)
- [Hybrid Router](./hybrid-router.md)
- [Cost Optimization](./cost-optimization.md)

## Version

Current version: 1.0.0

## License

Part of the Agentic QE Fleet project.
