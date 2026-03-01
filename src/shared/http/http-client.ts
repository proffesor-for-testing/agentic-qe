/**
 * Agentic QE v3 - HTTP Client
 * Fetch wrapper with timeout, retry, and circuit breaker patterns
 */

import { Result, ok, err } from '../types';
import { toError } from '../error-utils.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface RequestOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
  circuitBreaker?: boolean;
}

export interface HttpError {
  message: string;
  code: string;
  status?: number;
  cause?: Error;
  timing?: RequestTiming;
}

export interface RequestTiming {
  startTime: number;
  endTime: number;
  duration: number;
  retryCount: number;
}

export interface CircuitBreakerState {
  failures: number;
  lastFailure: number | null;
  state: 'closed' | 'open' | 'half-open';
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_TIMEOUT = 30000;

// ============================================================================
// Circuit Breaker Implementation
// ============================================================================

class CircuitBreaker {
  private circuits: Map<string, CircuitBreakerState> = new Map();

  private getCircuitKey(url: string): string {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.origin;
    } catch {
      return url;
    }
  }

  getState(url: string): CircuitBreakerState {
    const key = this.getCircuitKey(url);
    if (!this.circuits.has(key)) {
      this.circuits.set(key, {
        failures: 0,
        lastFailure: null,
        state: 'closed',
      });
    }
    return this.circuits.get(key)!;
  }

  recordSuccess(url: string): void {
    const key = this.getCircuitKey(url);
    this.circuits.set(key, {
      failures: 0,
      lastFailure: null,
      state: 'closed',
    });
  }

  recordFailure(url: string): void {
    const key = this.getCircuitKey(url);
    const state = this.getState(url);
    const newFailures = state.failures + 1;

    this.circuits.set(key, {
      failures: newFailures,
      lastFailure: Date.now(),
      state: newFailures >= CIRCUIT_BREAKER_THRESHOLD ? 'open' : 'closed',
    });
  }

  canRequest(url: string): boolean {
    const state = this.getState(url);

    if (state.state === 'closed') {
      return true;
    }

    if (state.state === 'open') {
      const timeSinceLastFailure = state.lastFailure
        ? Date.now() - state.lastFailure
        : Infinity;

      if (timeSinceLastFailure >= CIRCUIT_BREAKER_RESET_TIMEOUT) {
        const key = this.getCircuitKey(url);
        this.circuits.set(key, {
          ...state,
          state: 'half-open',
        });
        return true;
      }
      return false;
    }

    // half-open: allow one request through
    return true;
  }

  reset(url?: string): void {
    if (url) {
      const key = this.getCircuitKey(url);
      this.circuits.delete(key);
    } else {
      this.circuits.clear();
    }
  }
}

// ============================================================================
// HTTP Client Implementation
// ============================================================================

export class HttpClient {
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.circuitBreaker = new CircuitBreaker();
  }

  /**
   * Perform a GET request
   */
  async get(
    url: string,
    options?: RequestOptions
  ): Promise<Result<Response, HttpError>> {
    return this.request(url, { method: 'GET' }, options);
  }

  /**
   * Perform a POST request
   */
  async post(
    url: string,
    body: unknown,
    options?: RequestOptions
  ): Promise<Result<Response, HttpError>> {
    return this.request(
      url,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      },
      options
    );
  }

  /**
   * Perform a PUT request
   */
  async put(
    url: string,
    body: unknown,
    options?: RequestOptions
  ): Promise<Result<Response, HttpError>> {
    return this.request(
      url,
      {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      },
      options
    );
  }

  /**
   * Perform a PATCH request
   */
  async patch(
    url: string,
    body: unknown,
    options?: RequestOptions
  ): Promise<Result<Response, HttpError>> {
    return this.request(
      url,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      },
      options
    );
  }

  /**
   * Perform a DELETE request
   */
  async delete(
    url: string,
    options?: RequestOptions
  ): Promise<Result<Response, HttpError>> {
    return this.request(url, { method: 'DELETE' }, options);
  }

  /**
   * Perform a health check on the given URL
   * Returns true if the endpoint is reachable and returns a successful status
   */
  async healthCheck(url: string): Promise<boolean> {
    const result = await this.get(url, {
      timeout: 5000,
      retries: 1,
      circuitBreaker: false,
    });

    if (!result.success) {
      return false;
    }
    return result.value.ok;
  }

  /**
   * Get the current circuit breaker state for a URL
   */
  getCircuitState(url: string): CircuitBreakerState {
    return this.circuitBreaker.getState(url);
  }

  /**
   * Reset the circuit breaker for a specific URL or all circuits
   */
  resetCircuit(url?: string): void {
    this.circuitBreaker.reset(url);
  }

  /**
   * Core request method with timeout, retry, and circuit breaker
   */
  private async request(
    url: string,
    fetchOptions: RequestInit,
    options?: RequestOptions
  ): Promise<Result<Response, HttpError>> {
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    const maxRetries = options?.retries ?? DEFAULT_RETRIES;
    const baseRetryDelay = options?.retryDelay ?? DEFAULT_RETRY_DELAY;
    const useCircuitBreaker = options?.circuitBreaker ?? true;

    // Merge headers
    const headers = {
      ...fetchOptions.headers,
      ...options?.headers,
    };

    const timing: RequestTiming = {
      startTime: Date.now(),
      endTime: 0,
      duration: 0,
      retryCount: 0,
    };

    // Check circuit breaker
    if (useCircuitBreaker && !this.circuitBreaker.canRequest(url)) {
      timing.endTime = Date.now();
      timing.duration = timing.endTime - timing.startTime;
      return err({
        message: 'Circuit breaker is open',
        code: 'CIRCUIT_OPEN',
        timing,
      });
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      timing.retryCount = attempt;

      try {
        const response = await this.fetchWithTimeout(
          url,
          { ...fetchOptions, headers },
          timeout
        );

        timing.endTime = Date.now();
        timing.duration = timing.endTime - timing.startTime;

        // Record success for circuit breaker
        if (useCircuitBreaker) {
          this.circuitBreaker.recordSuccess(url);
        }

        return ok(response);
      } catch (error) {
        lastError = toError(error);

        // Record failure for circuit breaker
        if (useCircuitBreaker) {
          this.circuitBreaker.recordFailure(url);
        }

        // Don't retry if it's the last attempt
        if (attempt < maxRetries) {
          // Exponential backoff: delay * 2^attempt
          const delay = baseRetryDelay * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    timing.endTime = Date.now();
    timing.duration = timing.endTime - timing.startTime;

    return err({
      message: lastError?.message || 'Request failed',
      code: this.getErrorCode(lastError),
      cause: lastError ?? undefined,
      timing,
    });
  }

  /**
   * Fetch with timeout using AbortController
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Determine error code from error type
   */
  private getErrorCode(error: Error | null): string {
    if (!error) {
      return 'UNKNOWN_ERROR';
    }

    if (error.name === 'AbortError') {
      return 'TIMEOUT';
    }

    if (error.message.includes('ECONNREFUSED')) {
      return 'CONNECTION_REFUSED';
    }

    if (error.message.includes('ENOTFOUND')) {
      return 'DNS_ERROR';
    }

    if (error.message.includes('ETIMEDOUT')) {
      return 'NETWORK_TIMEOUT';
    }

    return 'REQUEST_FAILED';
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultClient: HttpClient | null = null;

/**
 * Get the default HTTP client instance
 */
export function getHttpClient(): HttpClient {
  if (!defaultClient) {
    defaultClient = new HttpClient();
  }
  return defaultClient;
}

/**
 * Create a new HTTP client instance
 */
export function createHttpClient(): HttpClient {
  return new HttpClient();
}
