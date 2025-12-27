/**
 * RuvllmProvider Unit Tests
 *
 * Tests for local LLM inference provider with TRM and SONA support.
 *
 * NOTE: Full ruvllm integration tests require the @ruvector/ruvllm package.
 * For integration testing, see tests/integration/trm/ and tests/integration/strategies/
 * These unit tests focus on provider behavior without requiring the actual library.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';
import { RuvllmProvider, RuvllmProviderConfig } from '../../src/providers/RuvllmProvider';
import { resetRuvLLMLoader } from '../../src/utils/ruvllm-loader';

describe('RuvllmProvider', () => {
  beforeAll(() => {
    // Reset loader state before tests
    resetRuvLLMLoader();
  });

  describe('provider metadata', () => {
    let provider: RuvllmProvider;

    afterEach(async () => {
      if (provider) {
        try {
          await provider.shutdown();
        } catch {
          // Ignore shutdown errors
        }
      }
    });

    it('should return provider metadata without initialization', () => {
      provider = new RuvllmProvider();
      const metadata = provider.getMetadata();

      expect(metadata.name).toBe('ruvllm');
      expect(metadata.version).toBeDefined();
      expect(metadata.models).toBeDefined();
      expect(metadata.models.length).toBeGreaterThan(0);
      expect(metadata.capabilities).toBeDefined();
    });

    it('should report local location', () => {
      provider = new RuvllmProvider();
      const metadata = provider.getMetadata();
      expect(metadata.location).toBe('local');
    });

    it('should report zero costs (local inference)', () => {
      provider = new RuvllmProvider();
      const metadata = provider.getMetadata();

      expect(metadata.costs.inputPerMillion).toBe(0);
      expect(metadata.costs.outputPerMillion).toBe(0);
    });

    it('should have streaming capability', () => {
      provider = new RuvllmProvider();
      const metadata = provider.getMetadata();

      expect(metadata.capabilities.streaming).toBe(true);
    });

    it('should report embeddings capability based on config (default: false)', () => {
      provider = new RuvllmProvider();
      const metadata = provider.getMetadata();

      // Default config has enableEmbeddings: false
      expect(metadata.capabilities.embeddings).toBe(false);
    });

    it('should report embeddings capability when enabled in config', () => {
      provider = new RuvllmProvider({ enableEmbeddings: true });
      const metadata = provider.getMetadata();

      expect(metadata.capabilities.embeddings).toBe(true);
    });
  });

  describe('cost tracking', () => {
    let provider: RuvllmProvider;

    afterEach(async () => {
      if (provider) {
        try {
          await provider.shutdown();
        } catch {
          // Ignore shutdown errors
        }
      }
    });

    it('should always return 0 for local inference', () => {
      provider = new RuvllmProvider();
      const cost = provider.trackCost({
        input_tokens: 1000,
        output_tokens: 500
      });

      expect(cost).toBe(0);
    });

    it('should return 0 even for large token counts', () => {
      provider = new RuvllmProvider();
      const cost = provider.trackCost({
        input_tokens: 1000000,
        output_tokens: 500000
      });

      expect(cost).toBe(0);
    });
  });

  describe('health check before initialization', () => {
    let provider: RuvllmProvider;

    afterEach(async () => {
      if (provider) {
        try {
          await provider.shutdown();
        } catch {
          // Ignore shutdown errors
        }
      }
    });

    it('should report unhealthy when not initialized', async () => {
      provider = new RuvllmProvider();

      const health = await provider.healthCheck();
      expect(health.healthy).toBe(false);
      expect(health.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('error handling', () => {
    let provider: RuvllmProvider;

    afterEach(async () => {
      if (provider) {
        try {
          await provider.shutdown();
        } catch {
          // Ignore shutdown errors
        }
      }
    });

    it('should throw when completing without initialization', async () => {
      provider = new RuvllmProvider();

      await expect(provider.complete({
        messages: [{ role: 'user', content: 'Test' }]
      })).rejects.toThrow(/not initialized/i);
    });

    it('should throw when embedding without initialization', async () => {
      provider = new RuvllmProvider();

      await expect(provider.embed({
        text: 'Test embedding'
      })).rejects.toThrow(/not initialized/i);
    });

    it('should throw when streaming without initialization', async () => {
      provider = new RuvllmProvider();

      const generator = provider.streamComplete({
        messages: [{ role: 'user', content: 'Test' }]
      });

      await expect(generator.next()).rejects.toThrow(/not initialized/i);
    });
  });

  describe('configuration', () => {
    let provider: RuvllmProvider;

    afterEach(async () => {
      if (provider) {
        try {
          await provider.shutdown();
        } catch {
          // Ignore shutdown errors
        }
      }
    });

    it('should accept custom config', () => {
      const config: RuvllmProviderConfig = {
        name: 'custom-ruvllm',
        defaultModel: 'phi-3-mini',
        enableTRM: true,
        enableSONA: true,
        maxTRMIterations: 5,
        convergenceThreshold: 0.9
      };

      provider = new RuvllmProvider(config);

      // Provider is created successfully
      expect(provider).toBeDefined();
    });

    it('should use default config when none provided', () => {
      provider = new RuvllmProvider();

      const metadata = provider.getMetadata();
      expect(metadata.name).toBe('ruvllm');
    });

    it('should handle fallback mode config', () => {
      provider = new RuvllmProvider({ fallbackMode: true });

      expect(provider).toBeDefined();
    });
  });

  describe('shutdown', () => {
    it('should handle shutdown when not initialized', async () => {
      const provider = new RuvllmProvider();

      // Should not throw
      await expect(provider.shutdown()).resolves.not.toThrow();
    });
  });
});
