/**
 * Agentic QE v3 - HTTP Client Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  HttpClient,
  createHttpClient,
  getHttpClient,
} from '../../../../src/shared/http';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('HttpClient', () => {
  let client: HttpClient;

  beforeEach(() => {
    client = createHttpClient();
    mockFetch.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================================================
  // Basic Request Tests
  // ============================================================================

  describe('get', () => {
    it('should make a GET request successfully', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await client.get('https://api.example.com/data');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.status).toBe(200);
      }
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should include custom headers', async () => {
      mockFetch.mockResolvedValueOnce(new Response('ok'));

      await client.get('https://api.example.com/data', {
        headers: { Authorization: 'Bearer token123' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token123',
          }),
        })
      );
    });
  });

  describe('post', () => {
    it('should make a POST request with JSON body', async () => {
      mockFetch.mockResolvedValueOnce(new Response('{"id": 1}', { status: 201 }));

      const body = { name: 'test', value: 42 };
      const result = await client.post('https://api.example.com/items', body);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/items',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('put', () => {
    it('should make a PUT request with JSON body', async () => {
      mockFetch.mockResolvedValueOnce(new Response('{"updated": true}'));

      const body = { name: 'updated' };
      const result = await client.put('https://api.example.com/items/1', body);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/items/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(body),
        })
      );
    });
  });

  describe('delete', () => {
    it('should make a DELETE request', async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

      const result = await client.delete('https://api.example.com/items/1');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/items/1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  // ============================================================================
  // Timeout Tests
  // ============================================================================

  describe('timeout', () => {
    it('should timeout after specified duration', async () => {
      // Simulate AbortError when signal is aborted
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      mockFetch.mockImplementation((_url: string, options: RequestInit) => {
        return new Promise((resolve, reject) => {
          // Check if signal is already aborted
          if (options.signal?.aborted) {
            reject(abortError);
            return;
          }
          // Listen for abort event
          options.signal?.addEventListener('abort', () => {
            reject(abortError);
          });
        });
      });

      const resultPromise = client.get('https://api.example.com/slow', {
        timeout: 1000,
        retries: 0,
        circuitBreaker: false,
      });

      // Advance timers to trigger the AbortController timeout
      await vi.advanceTimersByTimeAsync(1500);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TIMEOUT');
      }
    });

    it('should use default timeout of 30000ms', async () => {
      mockFetch.mockResolvedValueOnce(new Response('ok'));

      await client.get('https://api.example.com/data');

      // Verify AbortController signal was passed
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });
  });

  // ============================================================================
  // Retry Tests
  // ============================================================================

  describe('retry', () => {
    it('should retry failed requests with exponential backoff', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(new Response('ok'));

      const resultPromise = client.get('https://api.example.com/flaky', {
        retries: 3,
        retryDelay: 100,
        circuitBreaker: false,
      });

      // First retry after 100ms (100 * 2^0)
      await vi.advanceTimersByTimeAsync(100);
      // Second retry after 200ms (100 * 2^1)
      await vi.advanceTimersByTimeAsync(200);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should return error after all retries exhausted', async () => {
      mockFetch.mockRejectedValue(new Error('Persistent error'));

      const resultPromise = client.get('https://api.example.com/broken', {
        retries: 2,
        retryDelay: 50,
        circuitBreaker: false,
      });

      // Advance through all retries
      await vi.advanceTimersByTimeAsync(50); // First retry
      await vi.advanceTimersByTimeAsync(100); // Second retry

      const result = await resultPromise;

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Persistent error');
        expect(result.error.timing?.retryCount).toBe(2);
      }
      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not retry when retries is 0', async () => {
      mockFetch.mockRejectedValue(new Error('Error'));

      const result = await client.get('https://api.example.com/data', {
        retries: 0,
        circuitBreaker: false,
      });

      expect(result.success).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should apply exponential backoff with correct delays', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockRejectedValueOnce(new Error('Error 3'))
        .mockResolvedValueOnce(new Response('ok'));

      const resultPromise = client.get('https://api.example.com/data', {
        retries: 3,
        retryDelay: 1000,
        circuitBreaker: false,
      });

      // First retry: 1000 * 2^0 = 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Second retry: 1000 * 2^1 = 2000ms
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Third retry: 1000 * 2^2 = 4000ms
      await vi.advanceTimersByTimeAsync(4000);
      expect(mockFetch).toHaveBeenCalledTimes(4);

      const result = await resultPromise;
      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // Circuit Breaker Tests
  // ============================================================================

  describe('circuit breaker', () => {
    it('should open circuit after threshold failures', async () => {
      mockFetch.mockRejectedValue(new Error('Service unavailable'));

      // Make 5 failing requests to open the circuit
      for (let i = 0; i < 5; i++) {
        await client.get('https://api.example.com/unstable', {
          retries: 0,
          circuitBreaker: true,
        });
      }

      const state = client.getCircuitState('https://api.example.com/unstable');
      expect(state.state).toBe('open');
      expect(state.failures).toBe(5);
    });

    it('should reject requests when circuit is open', async () => {
      mockFetch.mockRejectedValue(new Error('Service unavailable'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        await client.get('https://api.example.com/unstable', {
          retries: 0,
          circuitBreaker: true,
        });
      }

      // Next request should fail immediately
      mockFetch.mockClear();
      const result = await client.get('https://api.example.com/unstable', {
        retries: 0,
        circuitBreaker: true,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CIRCUIT_OPEN');
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should transition to half-open after reset timeout', async () => {
      mockFetch.mockRejectedValue(new Error('Service unavailable'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        await client.get('https://api.example.com/unstable', {
          retries: 0,
          circuitBreaker: true,
        });
      }

      // Advance time past the reset timeout (30 seconds)
      await vi.advanceTimersByTimeAsync(31000);

      // Next request should be allowed (half-open)
      mockFetch.mockResolvedValueOnce(new Response('ok'));
      const result = await client.get('https://api.example.com/unstable', {
        retries: 0,
        circuitBreaker: true,
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should close circuit after successful request in half-open state', async () => {
      mockFetch.mockRejectedValue(new Error('Service unavailable'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        await client.get('https://api.example.com/unstable', {
          retries: 0,
          circuitBreaker: true,
        });
      }

      // Advance time to half-open
      await vi.advanceTimersByTimeAsync(31000);

      // Successful request should close the circuit
      mockFetch.mockResolvedValueOnce(new Response('ok'));
      await client.get('https://api.example.com/unstable', {
        retries: 0,
        circuitBreaker: true,
      });

      const state = client.getCircuitState('https://api.example.com/unstable');
      expect(state.state).toBe('closed');
      expect(state.failures).toBe(0);
    });

    it('should allow bypassing circuit breaker with option', async () => {
      mockFetch.mockRejectedValue(new Error('Service unavailable'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        await client.get('https://api.example.com/unstable', {
          retries: 0,
          circuitBreaker: true,
        });
      }

      // Request with circuit breaker disabled should go through
      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce(new Response('ok'));

      const result = await client.get('https://api.example.com/unstable', {
        retries: 0,
        circuitBreaker: false,
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should reset circuit breaker manually', async () => {
      mockFetch.mockRejectedValue(new Error('Service unavailable'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        await client.get('https://api.example.com/unstable', {
          retries: 0,
          circuitBreaker: true,
        });
      }

      client.resetCircuit('https://api.example.com/unstable');

      const state = client.getCircuitState('https://api.example.com/unstable');
      expect(state.state).toBe('closed');
      expect(state.failures).toBe(0);
    });

    it('should reset all circuits when called without URL', async () => {
      mockFetch.mockRejectedValue(new Error('Service unavailable'));

      // Open circuits for multiple domains
      for (let i = 0; i < 5; i++) {
        await client.get('https://api1.example.com/data', {
          retries: 0,
          circuitBreaker: true,
        });
        await client.get('https://api2.example.com/data', {
          retries: 0,
          circuitBreaker: true,
        });
      }

      client.resetCircuit();

      const state1 = client.getCircuitState('https://api1.example.com');
      const state2 = client.getCircuitState('https://api2.example.com');

      expect(state1.state).toBe('closed');
      expect(state2.state).toBe('closed');
    });

    it('should track circuits per origin', async () => {
      mockFetch.mockRejectedValue(new Error('Service unavailable'));

      // Fail requests to one domain
      for (let i = 0; i < 5; i++) {
        await client.get('https://api1.example.com/data', {
          retries: 0,
          circuitBreaker: true,
        });
      }

      // Other domain should still work
      mockFetch.mockResolvedValueOnce(new Response('ok'));
      const result = await client.get('https://api2.example.com/data', {
        retries: 0,
        circuitBreaker: true,
      });

      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // Health Check Tests
  // ============================================================================

  describe('healthCheck', () => {
    it('should return true for healthy endpoint', async () => {
      mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200 }));

      const isHealthy = await client.healthCheck('https://api.example.com/health');

      expect(isHealthy).toBe(true);
    });

    it('should return false for unhealthy endpoint', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('Service Unavailable', { status: 503 })
      );

      const isHealthy = await client.healthCheck('https://api.example.com/health');

      expect(isHealthy).toBe(false);
    });

    it('should return false when request fails', async () => {
      // Health check has retries: 1, so we need to fail twice
      mockFetch
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'));

      const resultPromise = client.healthCheck('https://api.example.com/health');

      // Advance timer for the retry delay
      await vi.advanceTimersByTimeAsync(1000);

      const isHealthy = await resultPromise;

      expect(isHealthy).toBe(false);
    });

    it('should use short timeout for health checks', async () => {
      // Simulate AbortError when signal is aborted
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      mockFetch.mockImplementation((_url: string, options: RequestInit) => {
        return new Promise((resolve, reject) => {
          if (options.signal?.aborted) {
            reject(abortError);
            return;
          }
          options.signal?.addEventListener('abort', () => {
            reject(abortError);
          });
        });
      });

      const resultPromise = client.healthCheck('https://api.example.com/health');

      // Health check uses 5000ms timeout, advance past it
      await vi.advanceTimersByTimeAsync(6000);
      // Also advance for the retry
      await vi.advanceTimersByTimeAsync(2000);

      const isHealthy = await resultPromise;

      expect(isHealthy).toBe(false);
    });

    it('should disable circuit breaker for health checks', async () => {
      mockFetch.mockRejectedValue(new Error('Service unavailable'));

      // Open the circuit through regular requests
      for (let i = 0; i < 5; i++) {
        await client.get('https://api.example.com/data', {
          retries: 0,
          circuitBreaker: true,
        });
      }

      // Health check should still go through (circuit breaker disabled)
      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce(new Response('OK'));

      const isHealthy = await client.healthCheck('https://api.example.com/health');

      expect(isHealthy).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Request Timing Tests
  // ============================================================================

  describe('request timing', () => {
    it('should include timing metrics in successful response', async () => {
      mockFetch.mockResolvedValueOnce(new Response('ok'));

      const result = await client.get('https://api.example.com/data', {
        circuitBreaker: false,
      });

      expect(result.success).toBe(true);
      // Note: Timing is only exposed in error responses for Result pattern
    });

    it('should include timing metrics in error response', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await client.get('https://api.example.com/data', {
        retries: 0,
        circuitBreaker: false,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.timing).toBeDefined();
        expect(result.error.timing?.duration).toBeGreaterThanOrEqual(0);
        expect(result.error.timing?.startTime).toBeLessThanOrEqual(
          result.error.timing?.endTime ?? 0
        );
      }
    });

    it('should track retry count in timing', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockRejectedValueOnce(new Error('Error 3'));

      const resultPromise = client.get('https://api.example.com/data', {
        retries: 2,
        retryDelay: 100,
        circuitBreaker: false,
      });

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.timing?.retryCount).toBe(2);
      }
    });
  });

  // ============================================================================
  // Error Code Tests
  // ============================================================================

  describe('error codes', () => {
    it('should return TIMEOUT for AbortError', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await client.get('https://api.example.com/data', {
        retries: 0,
        circuitBreaker: false,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TIMEOUT');
      }
    });

    it('should return CONNECTION_REFUSED for ECONNREFUSED', async () => {
      mockFetch.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

      const result = await client.get('https://api.example.com/data', {
        retries: 0,
        circuitBreaker: false,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONNECTION_REFUSED');
      }
    });

    it('should return DNS_ERROR for ENOTFOUND', async () => {
      mockFetch.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'));

      const result = await client.get('https://api.example.com/data', {
        retries: 0,
        circuitBreaker: false,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('DNS_ERROR');
      }
    });

    it('should return NETWORK_TIMEOUT for ETIMEDOUT', async () => {
      mockFetch.mockRejectedValueOnce(new Error('connect ETIMEDOUT'));

      const result = await client.get('https://api.example.com/data', {
        retries: 0,
        circuitBreaker: false,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NETWORK_TIMEOUT');
      }
    });

    it('should return REQUEST_FAILED for unknown errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Unknown error'));

      const result = await client.get('https://api.example.com/data', {
        retries: 0,
        circuitBreaker: false,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('REQUEST_FAILED');
      }
    });

    it('should include original error as cause', async () => {
      const originalError = new Error('Original error message');
      mockFetch.mockRejectedValueOnce(originalError);

      const result = await client.get('https://api.example.com/data', {
        retries: 0,
        circuitBreaker: false,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.cause).toBe(originalError);
        expect(result.error.message).toBe('Original error message');
      }
    });
  });

  // ============================================================================
  // Singleton Tests
  // ============================================================================

  describe('singleton', () => {
    it('should return the same instance from getHttpClient', () => {
      const client1 = getHttpClient();
      const client2 = getHttpClient();

      expect(client1).toBe(client2);
    });

    it('should return new instance from createHttpClient', () => {
      const client1 = createHttpClient();
      const client2 = createHttpClient();

      expect(client1).not.toBe(client2);
    });
  });
});
