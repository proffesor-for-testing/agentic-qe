/**
 * GitHub Models Provider Example
 *
 * Demonstrates how to use the GitHubModelsProvider for LLM inference
 * with free unlimited usage in GitHub Codespaces.
 *
 * Prerequisites:
 * - GITHUB_TOKEN environment variable must be set
 * - Optionally running in GitHub Codespaces for free usage
 *
 * Usage:
 * ```bash
 * export GITHUB_TOKEN="your-github-token"
 * npx tsx examples/github-models-provider-example.ts
 * ```
 */

import { GitHubModelsProvider } from '../src/providers/GitHubModelsProvider';

async function main() {
  console.log('🚀 GitHub Models Provider Example\n');

  // Create and initialize provider
  const provider = new GitHubModelsProvider({
    defaultModel: 'gpt-4o-mini',
    debug: true
  });

  console.log('📦 Initializing provider...');
  await provider.initialize();

  // Check if running in Codespaces
  const inCodespaces = provider.isInCodespaces();
  console.log(`🌍 Environment: ${inCodespaces ? 'GitHub Codespaces (FREE)' : 'External'}\n`);

  // Get provider metadata
  console.log('📊 Provider Metadata:');
  const metadata = provider.getMetadata();
  console.log(`  - Name: ${metadata.name}`);
  console.log(`  - Version: ${metadata.version}`);
  console.log(`  - Location: ${metadata.location}`);
  console.log(`  - Available Models: ${metadata.models.join(', ')}`);
  console.log(`  - Cost (Input/Million): $${metadata.costs.inputPerMillion}`);
  console.log(`  - Cost (Output/Million): $${metadata.costs.outputPerMillion}`);
  console.log(`  - Capabilities:`, metadata.capabilities);
  console.log('');

  // Health check
  console.log('🏥 Running health check...');
  const health = await provider.healthCheck();
  console.log(`  - Status: ${health.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
  console.log(`  - Latency: ${health.latency}ms`);
  if (health.error) {
    console.log(`  - Error: ${health.error}`);
  }
  console.log('');

  // Basic completion
  console.log('💬 Testing basic completion...');
  const response = await provider.complete({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'user', content: 'What is the capital of France?' }
    ],
    maxTokens: 100
  });

  console.log('Response:');
  console.log(`  - Content: ${response.content[0].text}`);
  console.log(`  - Model: ${response.model}`);
  console.log(`  - Input Tokens: ${response.usage.input_tokens}`);
  console.log(`  - Output Tokens: ${response.usage.output_tokens}`);
  console.log(`  - Cost: $${response.metadata?.cost || 0}`);
  console.log(`  - Latency: ${response.metadata?.latency}ms`);
  console.log('');

  // Streaming completion
  console.log('🌊 Testing streaming completion...');
  console.log('Response: ');
  process.stdout.write('  ');

  let streamedText = '';
  for await (const event of provider.streamComplete({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'user', content: 'Count from 1 to 5 slowly.' }
    ],
    maxTokens: 100
  })) {
    if (event.type === 'content_block_delta' && event.delta?.text) {
      process.stdout.write(event.delta.text);
      streamedText += event.delta.text;
    }
  }
  console.log('\n');

  // System prompt example
  console.log('🤖 Testing with system prompt...');
  const systemResponse = await provider.complete({
    model: 'gpt-4o-mini',
    system: [
      {
        type: 'text',
        text: 'You are a helpful AI assistant specialized in programming. Keep responses concise.'
      }
    ],
    messages: [
      { role: 'user', content: 'Explain what a REST API is in one sentence.' }
    ],
    maxTokens: 100
  });

  console.log('Response:');
  console.log(`  - ${systemResponse.content[0].text}`);
  console.log('');

  // Model switching
  console.log('🔄 Testing model switching...');
  console.log(`Current model: ${provider.getCurrentModel()}`);

  await provider.setModel('gpt-4o');
  console.log(`Switched to: ${provider.getCurrentModel()}`);

  const gpt4Response = await provider.complete({
    model: 'gpt-4o',
    messages: [
      { role: 'user', content: 'What is 2 + 2?' }
    ],
    maxTokens: 50
  });

  console.log(`Response from ${gpt4Response.model}: ${gpt4Response.content[0].text}`);
  console.log('');

  // Available models
  console.log('📋 Available models:');
  const models = provider.getAvailableModels();
  models.forEach((model, i) => {
    console.log(`  ${i + 1}. ${model}`);
  });
  console.log('');

  // Token counting
  console.log('🔢 Testing token counting...');
  const text = 'This is a test message for token counting.';
  const tokens = await provider.countTokens({ text });
  console.log(`  - Text: "${text}"`);
  console.log(`  - Estimated tokens: ${tokens}`);
  console.log('');

  // Cost tracking example
  console.log('💰 Cost tracking example:');
  const usage = {
    input_tokens: 1_000_000,
    output_tokens: 500_000
  };
  const cost = provider.trackCost(usage);
  console.log(`  - Input: ${usage.input_tokens.toLocaleString()} tokens`);
  console.log(`  - Output: ${usage.output_tokens.toLocaleString()} tokens`);
  console.log(`  - Total cost: $${cost.toFixed(4)}`);
  console.log(`  - Note: ${inCodespaces ? 'FREE in Codespaces!' : 'Paid usage outside Codespaces'}`);
  console.log('');

  // Shutdown
  console.log('🛑 Shutting down provider...');
  await provider.shutdown();

  console.log('\n✅ Example completed successfully!');
}

// Run example
main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
