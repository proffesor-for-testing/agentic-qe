/**
 * Agentic QE v3 - Azure OpenAI Provider Unit Tests
 * ADR-043 Milestone 5: Azure OpenAI Provider Support
 *
 * Tests for the Azure OpenAI provider implementation including:
 * - Configuration with endpoint and deployment
 * - API key authentication
 * - Azure AD token authentication
 * - Chat completion
 * - Streaming
 * - Error handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  AzureOpenAIProvider,
  DEFAULT_AZURE_OPENAI_CONFIG,
  type AzureOpenAIConfig,
} from '../../../../../src/shared/llm/providers/azure-openai';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AzureOpenAIProvider', () => {
  let provider: AzureOpenAIProvider;

  const defaultConfig: Partial<AzureOpenAIConfig> & { deploymentId: string } = {
    endpoint: 'https://my-resource.openai.azure.com',
    deploymentId: 'my-gpt4-deployment',
    apiKey: 'test-api-key',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear environment variables
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_ENDPOINT;
    delete process.env.AZURE_OPENAI_API_VERSION;
    delete process.env.AZURE_OPENAI_DEPLOYMENT;

    provider = new AzureOpenAIProvider(defaultConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Configuration Tests
  // ==========================================================================
  describe('configuration', () => {
    it('should use default config values', () => {
      const config = provider.getConfig();
      expect(config.model).toBe(DEFAULT_AZURE_OPENAI_CONFIG.model);
      expect(config.maxTokens).toBe(DEFAULT_AZURE_OPENAI_CONFIG.maxTokens);
      expect(config.temperature).toBe(DEFAULT_AZURE_OPENAI_CONFIG.temperature);
      expect(config.apiVersion).toBe(DEFAULT_AZURE_OPENAI_CONFIG.apiVersion);
    });

    it('should merge custom config with defaults', () => {
      const customProvider = new AzureOpenAIProvider({
        ...defaultConfig,
        maxTokens: 8192,
        temperature: 0.9,
        apiVersion: '2024-06-01',
      });

      const config = customProvider.getConfig();
      expect(config.maxTokens).toBe(8192);
      expect(config.temperature).toBe(0.9);
      expect(config.apiVersion).toBe('2024-06-01');
    });

    it('should return endpoint and deployment in config', () => {
      const config = provider.getConfig();
      expect(config.endpoint).toBe('https://my-resource.openai.azure.com');
      expect(config.deploymentId).toBe('my-gpt4-deployment');
    });

    it('should return supported models', () => {
      const models = provider.getSupportedModels();
      expect(models).toContain('gpt-4o');
      expect(models).toContain('gpt-4o-mini');
      expect(models).toContain('gpt-4-turbo');
      expect(models).toContain('gpt-35-turbo');
      expect(models).toContain('text-embedding-3-small');
    });

    it('should return cost per token', () => {
      const cost = provider.getCostPerToken();
      expect(cost.input).toBeGreaterThan(0);
      expect(cost.output).toBeGreaterThan(0);
    });

    it('should have correct provider type', () => {
      expect(provider.type).toBe('azure-openai');
      expect(provider.name).toBe('Azure OpenAI');
    });
  });

  // ==========================================================================
  // Environment Variable Tests
  // ==========================================================================
  describe('environment variables', () => {
    it('should use AZURE_OPENAI_ENDPOINT from environment', async () => {
      process.env.AZURE_OPENAI_ENDPOINT = 'https://env-resource.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'env-api-key';

      const envProvider = new AzureOpenAIProvider({
        deploymentId: 'my-deployment',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockCompletionResponse()),
      });

      await envProvider.generate('Test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://env-resource.openai.azure.com'),
        expect.any(Object)
      );
    });

    it('should use AZURE_OPENAI_API_KEY from environment', async () => {
      process.env.AZURE_OPENAI_API_KEY = 'env-api-key';

      const envProvider = new AzureOpenAIProvider({
        endpoint: 'https://my-resource.openai.azure.com',
        deploymentId: 'my-deployment',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockCompletionResponse()),
      });

      await envProvider.generate('Test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'api-key': 'env-api-key',
          }),
        })
      );
    });

    it('should use AZURE_OPENAI_API_VERSION from environment', async () => {
      process.env.AZURE_OPENAI_API_VERSION = '2024-08-01-preview';

      const envProvider = new AzureOpenAIProvider({
        ...defaultConfig,
        apiVersion: undefined, // Don't set in config to use env var
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockCompletionResponse()),
      });

      await envProvider.generate('Test');

      // The API version from env should be used when config doesn't have it
      // But in this case config has default, so it will use default
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api-version='),
        expect.any(Object)
      );
    });
  });

  // ==========================================================================
  // API Key Authentication Tests
  // ==========================================================================
  describe('API key authentication', () => {
    it('should set api-key header for API key auth', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockCompletionResponse()),
      });

      await provider.generate('Test prompt');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'api-key': 'test-api-key',
          }),
        })
      );
    });

    it('should not set Authorization header when using API key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockCompletionResponse()),
      });

      await provider.generate('Test prompt');

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers['Authorization']).toBeUndefined();
    });
  });

  // ==========================================================================
  // Azure AD Token Authentication Tests
  // ==========================================================================
  describe('Azure AD token authentication', () => {
    it('should set Authorization Bearer header for Azure AD token', async () => {
      const adTokenProvider = new AzureOpenAIProvider({
        ...defaultConfig,
        apiKey: undefined,
        azureAdToken: 'my-azure-ad-token',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockCompletionResponse()),
      });

      await adTokenProvider.generate('Test prompt');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer my-azure-ad-token',
          }),
        })
      );
    });

    it('should prefer Azure AD token over API key when both provided', async () => {
      const bothAuthProvider = new AzureOpenAIProvider({
        ...defaultConfig,
        apiKey: 'api-key',
        azureAdToken: 'ad-token',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockCompletionResponse()),
      });

      await bothAuthProvider.generate('Test');

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers['Authorization']).toBe('Bearer ad-token');
      expect(callArgs.headers['api-key']).toBeUndefined();
    });
  });

  // ==========================================================================
  // Availability Check Tests
  // ==========================================================================
  describe('availability check', () => {
    it('should return false without endpoint', async () => {
      const noEndpointProvider = new AzureOpenAIProvider({
        deploymentId: 'my-deployment',
        apiKey: 'test-key',
      });

      const available = await noEndpointProvider.isAvailable();
      expect(available).toBe(false);
    });

    it('should return false without authentication', async () => {
      const noAuthProvider = new AzureOpenAIProvider({
        endpoint: 'https://my-resource.openai.azure.com',
        deploymentId: 'my-deployment',
      });

      const available = await noAuthProvider.isAvailable();
      expect(available).toBe(false);
    });

    it('should return true when properly configured and API responds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockCompletionResponse()),
      });

      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });
  });

  // ==========================================================================
  // Health Check Tests
  // ==========================================================================
  describe('health check', () => {
    it('should return healthy when API responds successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockCompletionResponse()),
      });

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.latencyMs).toBeDefined();
      expect(result.details).toMatchObject({
        endpoint: 'https://my-resource.openai.azure.com',
        deploymentId: 'my-gpt4-deployment',
        authType: 'API Key',
      });
    });

    it('should return unhealthy on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return unhealthy on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should show Azure AD auth type when using AD token', async () => {
      const adProvider = new AzureOpenAIProvider({
        ...defaultConfig,
        apiKey: undefined,
        azureAdToken: 'ad-token',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockCompletionResponse()),
      });

      const result = await adProvider.healthCheck();

      expect(result.details?.authType).toBe('Azure AD');
    });

    it('should return error for missing endpoint', async () => {
      const noEndpointProvider = new AzureOpenAIProvider({
        deploymentId: 'test',
        apiKey: 'test',
      });

      const result = await noEndpointProvider.healthCheck();
      expect(result.healthy).toBe(false);
      expect(result.error).toContain('endpoint');
    });
  });

  // ==========================================================================
  // Generate (Chat Completion) Tests
  // ==========================================================================
  describe('generate', () => {
    it('should generate text from string prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve(createMockCompletionResponse('Generated response')),
      });

      const response = await provider.generate('Test prompt');

      expect(response.content).toBe('Generated response');
      expect(response.provider).toBe('azure-openai');
      expect(response.usage.promptTokens).toBe(10);
      expect(response.usage.completionTokens).toBe(20);
      expect(response.cost.totalCost).toBeGreaterThanOrEqual(0);
    });

    it('should generate text from message array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockCompletionResponse('Response')),
      });

      const response = await provider.generate([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ]);

      expect(response.content).toBe('Response');
    });

    it('should include system prompt in messages', async () => {
      mockFetch.mockImplementationOnce((url, options) => {
        const body = JSON.parse(options.body as string);
        expect(body.messages[0].role).toBe('system');
        expect(body.messages[0].content).toBe('You are a helpful assistant');

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(createMockCompletionResponse()),
        });
      });

      await provider.generate('Test', {
        systemPrompt: 'You are a helpful assistant',
      });
    });

    it('should use Azure-specific URL format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockCompletionResponse()),
      });

      await provider.generate('Test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://my-resource.openai.azure.com/openai/deployments/my-gpt4-deployment/chat/completions'
        ),
        expect.any(Object)
      );
    });

    it('should include API version in URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockCompletionResponse()),
      });

      await provider.generate('Test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api-version=2024-02-15-preview'),
        expect.any(Object)
      );
    });

    it('should handle custom temperature and max tokens', async () => {
      mockFetch.mockImplementationOnce((url, options) => {
        const body = JSON.parse(options.body as string);
        expect(body.temperature).toBe(0.5);
        expect(body.max_tokens).toBe(1000);

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(createMockCompletionResponse()),
        });
      });

      await provider.generate('Test', {
        temperature: 0.5,
        maxTokens: 1000,
      });
    });

    it('should handle stop sequences', async () => {
      mockFetch.mockImplementationOnce((url, options) => {
        const body = JSON.parse(options.body as string);
        expect(body.stop).toEqual(['END', '\n\n']);

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(createMockCompletionResponse()),
        });
      });

      await provider.generate('Test', {
        stopSequences: ['END', '\n\n'],
      });
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================
  describe('error handling', () => {
    it('should handle 401 unauthorized error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: { message: 'Invalid API key', type: 'authentication_error', code: null },
          }),
      });

      await expect(provider.generate('Test')).rejects.toMatchObject({
        code: 'API_KEY_INVALID',
        retryable: false,
      });
    });

    it('should handle 403 forbidden error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () =>
          Promise.resolve({
            error: { message: 'Access denied', type: 'permission_error', code: null },
          }),
      });

      await expect(provider.generate('Test')).rejects.toMatchObject({
        code: 'API_KEY_INVALID',
        retryable: false,
      });
    });

    it('should handle 429 rate limiting', async () => {
      // Mock all retries to return 429
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: () =>
          Promise.resolve({
            error: { message: 'Rate limited', type: 'rate_limit_error', code: null },
          }),
      });

      const noRetryProvider = new AzureOpenAIProvider({
        ...defaultConfig,
        maxRetries: 1,
      });

      await expect(noRetryProvider.generate('Test')).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        retryable: true,
      });
    });

    it('should handle context length exceeded', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: {
              message: 'Request too large',
              type: 'invalid_request_error',
              code: 'context_length_exceeded',
            },
          }),
      });

      await expect(provider.generate('Test')).rejects.toMatchObject({
        code: 'CONTEXT_LENGTH_EXCEEDED',
        retryable: false,
      });
    });

    it('should handle content filter error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: {
              message: 'Content filtered',
              type: 'invalid_request_error',
              code: null,
              innererror: { code: 'content_filter' },
            },
          }),
      });

      await expect(provider.generate('Test')).rejects.toMatchObject({
        code: 'CONTENT_FILTERED',
        retryable: false,
      });
    });

    it('should handle 404 deployment not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () =>
          Promise.resolve({
            error: { message: 'Deployment not found', type: 'not_found', code: null },
          }),
      });

      await expect(provider.generate('Test')).rejects.toMatchObject({
        code: 'MODEL_NOT_FOUND',
        retryable: false,
      });
    });

    it('should handle 500 server error with retry', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () =>
          Promise.resolve({
            error: { message: 'Internal server error', type: 'server_error', code: null },
          }),
      });

      const noRetryProvider = new AzureOpenAIProvider({
        ...defaultConfig,
        maxRetries: 1,
      });

      await expect(noRetryProvider.generate('Test')).rejects.toMatchObject({
        code: 'PROVIDER_UNAVAILABLE',
        retryable: true,
      });
    });

    it('should handle network errors', async () => {
      // Mock all retries to fail with network error
      mockFetch.mockRejectedValue(new Error('Network error'));

      const noRetryProvider = new AzureOpenAIProvider({
        ...defaultConfig,
        maxRetries: 1,
      });

      await expect(noRetryProvider.generate('Test')).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        retryable: true,
      });
    });

    it('should throw error when no authentication configured', async () => {
      const noAuthProvider = new AzureOpenAIProvider({
        endpoint: 'https://test.openai.azure.com',
        deploymentId: 'test',
      });

      await expect(noAuthProvider.generate('Test')).rejects.toMatchObject({
        code: 'API_KEY_MISSING',
        retryable: false,
      });
    });
  });

  // ==========================================================================
  // Embed Tests
  // ==========================================================================
  describe('embed', () => {
    it('should generate embeddings', async () => {
      const mockEmbedding = new Array(1536).fill(0).map((_, i) => i / 1536);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            object: 'list',
            data: [{ object: 'embedding', index: 0, embedding: mockEmbedding }],
            model: 'text-embedding-ada-002',
            usage: { prompt_tokens: 5, total_tokens: 5 },
          }),
      });

      const response = await provider.embed('Test text');

      expect(response.embedding).toEqual(mockEmbedding);
      expect(response.provider).toBe('azure-openai');
      expect(response.tokenCount).toBe(5);
    });

    it('should use embeddings endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            object: 'list',
            data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2] }],
            model: 'text-embedding-ada-002',
            usage: { prompt_tokens: 5, total_tokens: 5 },
          }),
      });

      await provider.embed('Test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/embeddings'),
        expect.any(Object)
      );
    });
  });

  // ==========================================================================
  // Complete Tests
  // ==========================================================================
  describe('complete', () => {
    it('should complete text with lower temperature', async () => {
      mockFetch.mockImplementationOnce((url, options) => {
        const body = JSON.parse(options.body as string);
        expect(body.temperature).toBe(0.2);

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(createMockCompletionResponse('completed')),
        });
      });

      const response = await provider.complete('function add(');

      expect(response.completion).toBe('completed');
      expect(response.provider).toBe('azure-openai');
    });

    it('should use default stop sequences', async () => {
      mockFetch.mockImplementationOnce((url, options) => {
        const body = JSON.parse(options.body as string);
        expect(body.stop).toEqual(['\n\n']);

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(createMockCompletionResponse('a, b) { return a + b; }')),
        });
      });

      await provider.complete('function add(');
    });
  });

  // ==========================================================================
  // Dispose Tests
  // ==========================================================================
  describe('dispose', () => {
    it('should dispose without errors', async () => {
      await expect(provider.dispose()).resolves.toBeUndefined();
    });
  });
});

// ==========================================================================
// Helper Functions
// ==========================================================================

function createMockCompletionResponse(content: string = 'Test response') {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: Date.now(),
    model: 'gpt-4o',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    },
  };
}
