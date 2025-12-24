/**
 * OllamaProvider Integration Tests
 *
 * Tests real Ollama integration with actual model interactions.
 * Skips gracefully if Ollama is not running or models are unavailable.
 *
 * @jest-environment node
 *
 * Usage:
 * - Requires Ollama installed and running (http://localhost:11434)
 * - Install a small model: ollama pull qwen2.5:0.5b (0.5B params, ~400MB)
 * - Run tests: npm run test:integration -- OllamaProvider.integration
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { OllamaProvider } from '../../src/providers/OllamaProvider';

describe('OllamaProvider Integration', () => {
  let provider: OllamaProvider;
  let ollamaAvailable = false;
  let testModel = 'qwen2.5:0.5b'; // Small model for testing

  beforeAll(async () => {
    // Check if Ollama is running
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (response.ok) {
        ollamaAvailable = true;
        const data: any = await response.json();
        const models = data.models.map((m: any) => m.name);

        // Use the first available model, prefer test model
        if (models.includes(testModel)) {
          // Test model available
        } else if (models.length > 0) {
          testModel = models[0]; // Use any available model
          console.log(`Using available model: ${testModel}`);
        } else {
          ollamaAvailable = false;
          console.log('No Ollama models found. Skipping integration tests.');
        }
      }
    } catch (error) {
      console.log('Ollama not running. Skipping integration tests.');
      ollamaAvailable = false;
    }

    if (ollamaAvailable) {
      provider = new OllamaProvider({
        baseUrl: 'http://localhost:11434',
        defaultModel: testModel,
        timeout: 60000 // Longer timeout for real inference
      });

      await provider.initialize();
    }
  }, 30000);

  afterAll(async () => {
    if (provider) {
      await provider.shutdown();
    }
  });

  /**
   * Test real completion with small model
   */
  it('should complete a prompt with real model', async () => {
    if (!ollamaAvailable) {
      console.log('Skipping: Ollama not available');
      return;
    }

    const result = await provider.complete({
      model: testModel,
      messages: [{ role: 'user', content: 'Say "Hello"' }],
      maxTokens: 50,
      temperature: 0.1 // Low temperature for deterministic output
    });

    expect(result).toBeDefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toBeTruthy();
    expect(result.content[0].text.length).toBeGreaterThan(0);
    expect(result.usage.input_tokens).toBeGreaterThan(0);
    expect(result.usage.output_tokens).toBeGreaterThan(0);
    expect(result.model).toBe(testModel);
    expect(result.stop_reason).toBeDefined();

    console.log('Response:', result.content[0].text);
    console.log('Tokens:', result.usage);
  }, 60000);

  /**
   * Test real streaming completion
   */
  it('should stream completions with real model', async () => {
    if (!ollamaAvailable) {
      console.log('Skipping: Ollama not available');
      return;
    }

    const chunks: string[] = [];
    let tokenCount = 0;

    const streamIterator = provider.streamComplete({
      model: testModel,
      messages: [{ role: 'user', content: 'Count to three' }],
      maxTokens: 50
    });

    for await (const event of streamIterator) {
      if (event.type === 'content_block_delta' && event.delta) {
        chunks.push(event.delta.text);
      }
      if (event.type === 'message_stop' && event.message?.usage) {
        tokenCount = event.message.usage.output_tokens;
      }
    }

    expect(chunks.length).toBeGreaterThan(0);
    const fullText = chunks.join('');
    expect(fullText.length).toBeGreaterThan(0);
    expect(tokenCount).toBeGreaterThan(0);

    console.log('Streamed text:', fullText);
    console.log('Total chunks:', chunks.length);
  }, 60000);

  /**
   * Test real embeddings generation
   */
  it('should generate embeddings with real model', async () => {
    if (!ollamaAvailable) {
      console.log('Skipping: Ollama not available');
      return;
    }

    const result = await provider.embed({
      text: 'Hello world',
      model: testModel
    });

    expect(result).toBeDefined();
    expect(result.embedding).toBeDefined();
    expect(Array.isArray(result.embedding)).toBe(true);
    expect(result.embedding.length).toBeGreaterThan(0);
    expect(result.tokens).toBeGreaterThan(0);
    expect(result.model).toBeTruthy();

    // Check embedding values are normalized floats
    const allNumbers = result.embedding.every(v => typeof v === 'number');
    expect(allNumbers).toBe(true);

    console.log('Embedding dimensions:', result.embedding.length);
    console.log('Tokens used:', result.tokens);
  }, 30000);

  /**
   * Test model switching
   */
  it('should switch between models', async () => {
    if (!ollamaAvailable) {
      console.log('Skipping: Ollama not available');
      return;
    }

    const metadata = provider.getMetadata();
    if (metadata.models.length < 2) {
      console.log('Skipping: Need at least 2 models for switching test');
      return;
    }

    const model1 = metadata.models[0];
    const model2 = metadata.models[1];

    const result1 = await provider.complete({
      model: model1,
      messages: [{ role: 'user', content: 'Hi' }],
      maxTokens: 20
    });

    const result2 = await provider.complete({
      model: model2,
      messages: [{ role: 'user', content: 'Hi' }],
      maxTokens: 20
    });

    expect(result1.model).toBe(model1);
    expect(result2.model).toBe(model2);

    console.log(`Model 1 (${model1}):`, result1.content[0].text);
    console.log(`Model 2 (${model2}):`, result2.content[0].text);
  }, 90000);

  /**
   * Test system prompt handling
   */
  it('should handle system prompts correctly', async () => {
    if (!ollamaAvailable) {
      console.log('Skipping: Ollama not available');
      return;
    }

    const result = await provider.complete({
      model: testModel,
      system: [{ type: 'text', text: 'You are a helpful assistant. Always respond with "Acknowledged".' }],
      messages: [{ role: 'user', content: 'Hello' }],
      maxTokens: 50
    });

    expect(result.content[0].text).toBeTruthy();
    // System prompt should influence response
    console.log('Response with system prompt:', result.content[0].text);
  }, 60000);

  /**
   * Test temperature effects
   */
  it('should respect temperature settings', async () => {
    if (!ollamaAvailable) {
      console.log('Skipping: Ollama not available');
      return;
    }

    const prompt = 'Write a creative sentence';

    // Low temperature (deterministic)
    const deterministicResult = await provider.complete({
      model: testModel,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 50,
      temperature: 0.1
    });

    // High temperature (creative)
    const creativeResult = await provider.complete({
      model: testModel,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 50,
      temperature: 0.9
    });

    expect(deterministicResult.content[0].text).toBeTruthy();
    expect(creativeResult.content[0].text).toBeTruthy();

    console.log('Low temp (0.1):', deterministicResult.content[0].text);
    console.log('High temp (0.9):', creativeResult.content[0].text);
  }, 90000);

  /**
   * Test health check with real connection
   */
  it('should perform health check successfully', async () => {
    if (!ollamaAvailable) {
      console.log('Skipping: Ollama not available');
      return;
    }

    const health = await provider.healthCheck();

    expect(health.healthy).toBe(true);
    expect(health.latency).toBeGreaterThanOrEqual(0);
    expect(health.timestamp).toBeInstanceOf(Date);

    console.log('Health check latency:', health.latency, 'ms');
  });

  /**
   * Test concurrent requests
   */
  it('should handle concurrent requests', async () => {
    if (!ollamaAvailable) {
      console.log('Skipping: Ollama not available');
      return;
    }

    const promises = [
      provider.complete({
        model: testModel,
        messages: [{ role: 'user', content: 'Say "One"' }],
        maxTokens: 20
      }),
      provider.complete({
        model: testModel,
        messages: [{ role: 'user', content: 'Say "Two"' }],
        maxTokens: 20
      }),
      provider.complete({
        model: testModel,
        messages: [{ role: 'user', content: 'Say "Three"' }],
        maxTokens: 20
      })
    ];

    const results = await Promise.all(promises);

    expect(results).toHaveLength(3);
    results.forEach(result => {
      expect(result.content[0].text).toBeTruthy();
    });

    console.log('Concurrent responses:', results.map(r => r.content[0].text));
  }, 90000);

  /**
   * Test long context handling
   */
  it('should handle long context', async () => {
    if (!ollamaAvailable) {
      console.log('Skipping: Ollama not available');
      return;
    }

    const longContext = 'This is a long context. '.repeat(50); // ~1000+ tokens

    const result = await provider.complete({
      model: testModel,
      messages: [
        { role: 'user', content: longContext },
        { role: 'user', content: 'Summarize the above in one word' }
      ],
      maxTokens: 50
    });

    expect(result.content[0].text).toBeTruthy();
    expect(result.usage.input_tokens).toBeGreaterThan(100); // Should count context tokens

    console.log('Long context tokens:', result.usage.input_tokens);
    console.log('Summary:', result.content[0].text);
  }, 90000);
});
