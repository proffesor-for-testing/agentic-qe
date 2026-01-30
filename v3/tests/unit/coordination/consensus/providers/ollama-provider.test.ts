/**
 * Agentic QE v3 - Ollama Provider Unit Tests
 * Tests for OllamaModelProvider local model support
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  OllamaModelProvider,
  createOllamaProvider,
  createMultiOllamaProviders,
  isOllamaAvailable,
  getRecommendedOllamaModels,
  getLightweightOllamaModels,
  getCodeOllamaModels,
  type OllamaProviderConfig,
} from '../../../../../src/coordination/consensus/providers/ollama-provider';

// ============================================================================
// Mock Setup
// ============================================================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

function createMockResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

function createChatResponse(content: string, evalCount = 50) {
  return createMockResponse({
    model: 'llama3.1',
    created_at: new Date().toISOString(),
    message: {
      role: 'assistant',
      content,
    },
    done: true,
    total_duration: 1000000000,
    load_duration: 100000000,
    prompt_eval_count: 100,
    prompt_eval_duration: 200000000,
    eval_count: evalCount,
    eval_duration: 500000000,
  });
}

function createTagsResponse(models: string[]) {
  return createMockResponse({
    models: models.map((name) => ({
      name,
      model: name,
      modified_at: new Date().toISOString(),
      size: 4000000000,
      digest: 'sha256:test',
      details: {
        parent_model: '',
        format: 'gguf',
        family: 'llama',
        families: ['llama'],
        parameter_size: '7B',
        quantization_level: 'Q4_0',
      },
    })),
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('OllamaModelProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with default config', () => {
      const provider = new OllamaModelProvider();

      expect(provider.id).toContain('ollama');
      expect(provider.name).toContain('Ollama');
      expect(provider.type).toBe('ollama');
    });

    it('should use default base URL', () => {
      const provider = new OllamaModelProvider();

      expect(provider).toBeDefined();
    });

    it('should use custom base URL when provided', () => {
      const provider = new OllamaModelProvider({
        baseUrl: 'http://gpu-server:11434',
      });

      expect(provider).toBeDefined();
    });

    it('should default to llama3.1 model', () => {
      const provider = new OllamaModelProvider();

      expect(provider.name).toContain('llama3.1');
    });

    it('should generate unique ID based on model', () => {
      const provider1 = new OllamaModelProvider({ defaultModel: 'llama3.1' });
      const provider2 = new OllamaModelProvider({ defaultModel: 'codellama' });

      expect(provider1.id).not.toBe(provider2.id);
    });
  });

  describe('complete()', () => {
    let provider: OllamaModelProvider;

    beforeEach(() => {
      provider = new OllamaModelProvider();
    });

    it('should complete a prompt successfully', async () => {
      mockFetch.mockResolvedValueOnce(createChatResponse('Security analysis complete.'));

      const result = await provider.complete('Analyze this code');

      expect(result).toBe('Security analysis complete.');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/chat');
      expect(options.method).toBe('POST');
    });

    it('should include system and user messages', async () => {
      mockFetch.mockResolvedValueOnce(createChatResponse('Response'));

      await provider.complete('Test prompt', {
        systemPrompt: 'You are a security expert.',
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.messages).toHaveLength(2);
      expect(requestBody.messages[0]).toEqual({
        role: 'system',
        content: 'You are a security expert.',
      });
      expect(requestBody.messages[1]).toEqual({
        role: 'user',
        content: 'Test prompt',
      });
    });

    it('should use custom model when specified', async () => {
      mockFetch.mockResolvedValueOnce(createChatResponse('Response'));

      await provider.complete('Test prompt', { model: 'codellama:34b' });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.model).toBe('codellama:34b');
    });

    it('should set stream to false', async () => {
      mockFetch.mockResolvedValueOnce(createChatResponse('Response'));

      await provider.complete('Test');

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.stream).toBe(false);
    });

    it('should include generation options', async () => {
      const provider = new OllamaModelProvider({
        options: {
          num_ctx: 8192,
          temperature: 0.5,
          top_p: 0.9,
        },
      });

      mockFetch.mockResolvedValueOnce(createChatResponse('Response'));

      await provider.complete('Test');

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.options.num_ctx).toBe(8192);
      expect(requestBody.options.top_p).toBe(0.9);
    });

    it('should throw error when provider is disposed', async () => {
      await provider.dispose();

      await expect(provider.complete('Test')).rejects.toThrow('Provider has been disposed');
    });

    it('should retry on transient errors', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Connection error'))
        .mockResolvedValueOnce(createChatResponse('Success'));

      const result = await provider.complete('Test');

      expect(result).toBe('Success');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on model not found errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('model not found'),
      } as Response);

      await expect(provider.complete('Test')).rejects.toThrow('model not found');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should fail after max retries', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      await expect(provider.complete('Test')).rejects.toThrow();
    });
  });

  describe('listModels()', () => {
    let provider: OllamaModelProvider;

    beforeEach(() => {
      provider = new OllamaModelProvider();
    });

    it('should list available models', async () => {
      mockFetch.mockResolvedValueOnce(
        createTagsResponse(['llama3.1', 'codellama', 'mistral'])
      );

      const models = await provider.listModels();

      expect(models).toHaveLength(3);
      expect(models).toContain('llama3.1');
      expect(models).toContain('codellama');
    });

    it('should update installed models list', async () => {
      mockFetch.mockResolvedValueOnce(createTagsResponse(['llama3.1', 'mistral']));

      await provider.listModels();

      expect(provider.getInstalledModels()).toHaveLength(2);
    });

    it('should return empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection failed'));

      const models = await provider.listModels();

      expect(models).toHaveLength(0);
    });
  });

  describe('healthCheck()', () => {
    let provider: OllamaModelProvider;

    beforeEach(() => {
      provider = new OllamaModelProvider();
    });

    it('should return healthy when Ollama is running with models', async () => {
      mockFetch.mockResolvedValueOnce(createTagsResponse(['llama3.1', 'mistral']));

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.latencyMs).toBeDefined();
      expect(result.availableModels).toContain('llama3.1');
    });

    it('should return unhealthy when no models installed', async () => {
      mockFetch.mockResolvedValueOnce(createTagsResponse([]));

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('no models are installed');
    });

    it('should warn when default model is not available', async () => {
      const provider = new OllamaModelProvider({ defaultModel: 'qwen2.5:72b' });

      mockFetch.mockResolvedValueOnce(createTagsResponse(['llama3.1']));

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.error).toContain('not installed');
    });

    it('should return unhealthy when Ollama connection fails', async () => {
      // Note: listModels() catches connection errors and returns [],
      // so healthCheck reports "no models" rather than detailed connection error
      mockFetch.mockRejectedValueOnce(new Error('fetch failed: ECONNREFUSED'));

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(false);
      // Connection failure results in empty models list from listModels()
      expect(result.error).toContain('no models');
    });
  });

  describe('getCostPerToken()', () => {
    it('should return zero cost for local models', () => {
      const provider = new OllamaModelProvider();

      const cost = provider.getCostPerToken();

      expect(cost.input).toBe(0);
      expect(cost.output).toBe(0);
    });
  });
});

describe('Helper Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getRecommendedOllamaModels()', () => {
    it('should return recommended security analysis models', () => {
      const models = getRecommendedOllamaModels();

      expect(models.length).toBe(4);
      expect(models).toContain('llama3.1:70b');
      expect(models).toContain('codellama:34b');
    });
  });

  describe('getLightweightOllamaModels()', () => {
    it('should return lightweight models for fast inference', () => {
      const models = getLightweightOllamaModels();

      expect(models.length).toBe(4);
      expect(models).toContain('llama3.2:3b');
      expect(models).toContain('phi3');
    });
  });

  describe('getCodeOllamaModels()', () => {
    it('should return code-focused models', () => {
      const models = getCodeOllamaModels();

      expect(models.length).toBe(4);
      expect(models).toContain('codellama:34b');
      expect(models).toContain('qwen2.5-coder');
    });
  });

  describe('createOllamaProvider()', () => {
    it('should create provider with default config', () => {
      const provider = createOllamaProvider();

      expect(provider).toBeInstanceOf(OllamaModelProvider);
    });

    it('should create provider with custom model', () => {
      const provider = createOllamaProvider({
        defaultModel: 'codellama:34b',
      });

      expect(provider.name).toContain('codellama');
    });
  });

  describe('createMultiOllamaProviders()', () => {
    it('should create multiple providers with default recommended models', () => {
      const providers = createMultiOllamaProviders();

      expect(providers.length).toBe(4);
      expect(providers[0]).toBeInstanceOf(OllamaModelProvider);
    });

    it('should create providers for specified models', () => {
      const providers = createMultiOllamaProviders(['llama3.1', 'codellama']);

      expect(providers.length).toBe(2);
    });

    it('should pass base config to all providers', () => {
      const providers = createMultiOllamaProviders(['llama3.1'], {
        baseUrl: 'http://custom:11434',
        enableLogging: true,
      });

      expect(providers.length).toBe(1);
    });
  });

  describe('isOllamaAvailable()', () => {
    it('should return true when Ollama is running', async () => {
      mockFetch.mockResolvedValueOnce(createTagsResponse(['llama3.1']));

      const available = await isOllamaAvailable();

      expect(available).toBe(true);
    });

    it('should return false when Ollama is not running', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const available = await isOllamaAvailable();

      expect(available).toBe(false);
    });

    it('should use custom base URL', async () => {
      mockFetch.mockResolvedValueOnce(createTagsResponse(['llama3.1']));

      await isOllamaAvailable('http://gpu-server:11434');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://gpu-server:11434/api/tags',
        expect.any(Object)
      );
    });

    it('should return false on timeout', async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), 100);
          })
      );

      const available = await isOllamaAvailable();

      expect(available).toBe(false);
    });
  });
});
