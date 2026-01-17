/**
 * GroqProvider Usage Example
 *
 * Demonstrates how to use the GroqProvider for ultra-fast LLM inference
 * with the FREE tier (14,400 requests/day, 10 req/min)
 */

import { GroqProvider, GroqProviderConfig } from '../src/providers';

async function main() {
  // Example 1: Basic completion
  console.log('=== Example 1: Basic Completion ===\n');

  const config: GroqProviderConfig = {
    apiKey: process.env.GROQ_API_KEY, // or pass directly
    defaultModel: 'llama-3.3-70b-versatile',
    maxRetries: 3,
    rateLimitRetryDelay: 6000 // 6 seconds
  };

  const provider = new GroqProvider(config);

  try {
    // Initialize the provider (verifies API key and connection)
    await provider.initialize();
    console.log('✓ GroqProvider initialized successfully\n');

    // Simple completion
    const response = await provider.complete({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'user', content: 'What is the capital of France?' }
      ],
      maxTokens: 100,
      temperature: 0.7
    });

    console.log('Response:', response.content[0].text);
    console.log('Tokens used:', {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens
    });
    console.log('Cost:', response.metadata?.cost, '(FREE tier)');
    console.log('Latency:', response.metadata?.latency, 'ms\n');

    // Example 2: System message with caching
    console.log('=== Example 2: System Message (with prompt caching) ===\n');

    const systemResponse = await provider.complete({
      model: 'llama-3.3-70b-versatile',
      system: [
        {
          type: 'text',
          text: 'You are a helpful AI assistant specialized in software testing.',
          cache_control: { type: 'ephemeral' } // Enable caching
        }
      ],
      messages: [
        { role: 'user', content: 'What is unit testing?' }
      ],
      maxTokens: 200
    });

    console.log('Response:', systemResponse.content[0].text.substring(0, 100) + '...');
    console.log('Groq metadata:', systemResponse.metadata?.groq_metadata, '\n');

    // Example 3: Streaming completion
    console.log('=== Example 3: Streaming Completion ===\n');

    console.log('Streaming response: ');
    let streamedText = '';

    for await (const event of provider.streamComplete({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'user', content: 'Count from 1 to 5' }
      ]
    })) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        process.stdout.write(event.delta.text);
        streamedText += event.delta.text;
      }
    }

    console.log('\n\nTotal streamed text length:', streamedText.length, '\n');

    // Example 4: Health check
    console.log('=== Example 4: Health Check ===\n');

    const health = await provider.healthCheck();
    console.log('Health status:', {
      healthy: health.healthy,
      latency: health.latency,
      timestamp: health.timestamp
    });

    // Example 5: Provider metadata
    console.log('\n=== Example 5: Provider Metadata ===\n');

    const metadata = provider.getMetadata();
    console.log('Provider:', metadata.name, 'v' + metadata.version);
    console.log('Available models:', metadata.models.slice(0, 5).join(', '), '...');
    console.log('Capabilities:', metadata.capabilities);
    console.log('Location:', metadata.location);
    console.log('Costs:', metadata.costs);

    // Example 6: Token counting
    console.log('\n=== Example 6: Token Counting ===\n');

    const text = 'This is a sample text for token counting. It should be approximately 15-20 tokens.';
    const tokenCount = await provider.countTokens({ text });
    console.log('Text:', text);
    console.log('Estimated tokens:', tokenCount);

    // Cleanup
    await provider.shutdown();
    console.log('\n✓ GroqProvider shutdown complete');

  } catch (error) {
    console.error('Error:', error);

    if (error instanceof Error) {
      console.error('Message:', error.message);
      if ('code' in error) {
        console.error('Code:', (error as any).code);
      }
      if ('retryable' in error) {
        console.error('Retryable:', (error as any).retryable);
      }
    }
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { main };
