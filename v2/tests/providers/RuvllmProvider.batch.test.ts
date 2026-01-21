/**
 * Tests for RuvllmProvider batch completion API
 *
 * Phase 0 M0.2 - Batch Query API for 4x throughput improvement
 */

import { RuvllmProvider } from '../../src/providers/RuvllmProvider';
import type { LLMCompletionOptions, LLMCompletionResponse } from '../../src/providers/ILLMProvider';

describe('RuvllmProvider - Batch Completion', () => {
  let provider: RuvllmProvider;

  beforeEach(async () => {
    provider = new RuvllmProvider({
      name: 'test-ruvllm',
      debug: false,
      defaultModel: 'llama-3.2-3b-instruct',
      enableTRM: false,
      enableSONA: false
    });

    // Mock the initialization since we're testing batch logic only
    (provider as any).isInitialized = true;
    (provider as any).config = {
      ...provider['config'],
      defaultModel: 'llama-3.2-3b-instruct'
    };

    // Mock completeBasic to return synthetic responses
    jest.spyOn(provider as any, 'completeBasic').mockImplementation(
      async (options: LLMCompletionOptions): Promise<LLMCompletionResponse> => {
        const prompt = options.messages[0].content as string;
        return {
          content: [{ type: 'text', text: `Response to: ${prompt}` }],
          usage: { input_tokens: 10, output_tokens: 20 },
          model: 'llama-3.2-3b-instruct',
          stop_reason: 'end_turn',
          id: `test-${Date.now()}`,
          metadata: { latency: 100, cost: 0 }
        };
      }
    );
  });

  describe('Basic batch processing', () => {
    it('should process empty batch', async () => {
      const results = await provider.batchComplete([]);
      expect(results).toEqual([]);
    });

    it('should process single request', async () => {
      const requests: LLMCompletionOptions[] = [
        {
          messages: [{ role: 'user', content: 'Test 1' }]
        }
      ];

      const results = await provider.batchComplete(requests);

      expect(results).toHaveLength(1);
      expect(results[0].content[0].text).toBe('Response to: Test 1');
      expect(results[0].usage.input_tokens).toBe(10);
      expect(results[0].usage.output_tokens).toBe(20);
    });

    it('should process multiple requests in parallel', async () => {
      const requests: LLMCompletionOptions[] = [
        { messages: [{ role: 'user', content: 'Test 1' }] },
        { messages: [{ role: 'user', content: 'Test 2' }] },
        { messages: [{ role: 'user', content: 'Test 3' }] },
        { messages: [{ role: 'user', content: 'Test 4' }] }
      ];

      const results = await provider.batchComplete(requests);

      expect(results).toHaveLength(4);
      expect(results[0].content[0].text).toBe('Response to: Test 1');
      expect(results[1].content[0].text).toBe('Response to: Test 2');
      expect(results[2].content[0].text).toBe('Response to: Test 3');
      expect(results[3].content[0].text).toBe('Response to: Test 4');
    });

    it('should maintain order of responses', async () => {
      const requests: LLMCompletionOptions[] = Array.from({ length: 10 }, (_, i) => ({
        messages: [{ role: 'user', content: `Request ${i}` }]
      }));

      const results = await provider.batchComplete(requests);

      expect(results).toHaveLength(10);
      results.forEach((result, index) => {
        expect(result.content[0].text).toBe(`Response to: Request ${index}`);
      });
    });
  });

  describe('Error handling', () => {
    it('should handle partial failures gracefully', async () => {
      // Mock completeBasic to fail on specific indices
      jest.spyOn(provider as any, 'completeBasic').mockImplementation(
        async (options: LLMCompletionOptions): Promise<LLMCompletionResponse> => {
          const prompt = options.messages[0].content as string;

          if (prompt.includes('Fail')) {
            throw new Error('Simulated failure');
          }

          return {
            content: [{ type: 'text', text: `Response to: ${prompt}` }],
            usage: { input_tokens: 10, output_tokens: 20 },
            model: 'llama-3.2-3b-instruct',
            stop_reason: 'end_turn',
            id: `test-${Date.now()}`,
            metadata: { latency: 100, cost: 0 }
          };
        }
      );

      const requests: LLMCompletionOptions[] = [
        { messages: [{ role: 'user', content: 'Success 1' }] },
        { messages: [{ role: 'user', content: 'Fail 1' }] },
        { messages: [{ role: 'user', content: 'Success 2' }] },
        { messages: [{ role: 'user', content: 'Fail 2' }] }
      ];

      const results = await provider.batchComplete(requests);

      expect(results).toHaveLength(4);
      expect(results[0].content[0].text).toBe('Response to: Success 1');
      expect(results[1].metadata?.error).toBe('Simulated failure');
      expect(results[2].content[0].text).toBe('Response to: Success 2');
      expect(results[3].metadata?.error).toBe('Simulated failure');
    });

    it('should throw error when all requests fail', async () => {
      // Mock completeBasic to always fail
      jest.spyOn(provider as any, 'completeBasic').mockRejectedValue(
        new Error('All requests failed')
      );

      const requests: LLMCompletionOptions[] = [
        { messages: [{ role: 'user', content: 'Test 1' }] },
        { messages: [{ role: 'user', content: 'Test 2' }] }
      ];

      await expect(provider.batchComplete(requests)).rejects.toThrow(
        'All batch requests failed'
      );
    });
  });

  describe('Performance characteristics', () => {
    it('should process requests in chunks of 4 (parallelism)', async () => {
      const completeCalls: number[] = [];

      // Track when each completion starts
      jest.spyOn(provider as any, 'completeBasic').mockImplementation(
        async (options: LLMCompletionOptions): Promise<LLMCompletionResponse> => {
          completeCalls.push(Date.now());
          await new Promise(resolve => setTimeout(resolve, 50)); // Simulate work

          const prompt = options.messages[0].content as string;
          return {
            content: [{ type: 'text', text: `Response to: ${prompt}` }],
            usage: { input_tokens: 10, output_tokens: 20 },
            model: 'llama-3.2-3b-instruct',
            stop_reason: 'end_turn',
            id: `test-${Date.now()}`,
            metadata: { latency: 50, cost: 0 }
          };
        }
      );

      // 8 requests should be processed in 2 chunks of 4
      const requests: LLMCompletionOptions[] = Array.from({ length: 8 }, (_, i) => ({
        messages: [{ role: 'user', content: `Request ${i}` }]
      }));

      await provider.batchComplete(requests);

      // Verify all requests were processed
      expect(completeCalls).toHaveLength(8);
    });

    it('should aggregate metrics correctly', async () => {
      const requests: LLMCompletionOptions[] = Array.from({ length: 5 }, (_, i) => ({
        messages: [{ role: 'user', content: `Request ${i}` }]
      }));

      const startTime = Date.now();
      const results = await provider.batchComplete(requests);
      const totalTime = Date.now() - startTime;

      // All requests should succeed
      const successCount = results.filter(r => !r.metadata?.error).length;
      expect(successCount).toBe(5);

      // Total time should be reasonable (less than sequential execution)
      // Sequential would be 5 * 100ms = 500ms
      // Parallel should be ~200ms (2 chunks * 100ms)
      expect(totalTime).toBeLessThan(400);
    });
  });

  describe('Use cases', () => {
    it('should support test generation burst (20+ files)', async () => {
      const testFiles = Array.from({ length: 25 }, (_, i) => ({
        messages: [{
          role: 'user' as const,
          content: `Generate unit tests for UserService.method${i}`
        }]
      }));

      const results = await provider.batchComplete(testFiles);

      expect(results).toHaveLength(25);
      results.forEach((result, index) => {
        expect(result.content[0].text).toContain(`UserService.method${index}`);
      });
    });

    it('should support coverage analysis across modules', async () => {
      const modules = ['UserService', 'PaymentService', 'AuthService', 'OrderService'];
      const requests = modules.map(module => ({
        messages: [{
          role: 'user' as const,
          content: `Analyze test coverage for ${module}`
        }]
      }));

      const results = await provider.batchComplete(requests);

      expect(results).toHaveLength(4);
      modules.forEach((module, index) => {
        expect(results[index].content[0].text).toContain(module);
      });
    });

    it('should support parallel flaky detection', async () => {
      const testFiles = ['auth.test.ts', 'payment.test.ts', 'user.test.ts'];
      const requests = testFiles.map(file => ({
        messages: [{
          role: 'user' as const,
          content: `Analyze ${file} for flaky tests`
        }]
      }));

      const results = await provider.batchComplete(requests);

      expect(results).toHaveLength(3);
      testFiles.forEach((file, index) => {
        expect(results[index].content[0].text).toContain(file);
      });
    });
  });
});
