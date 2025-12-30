/**
 * N8n API Client
 *
 * HTTP client for interacting with n8n REST API
 * Handles authentication, retries, caching, and error handling
 */

import {
  N8nAPIConfig,
  N8nWorkflow,
  N8nExecution,
  N8nCredential,
} from './types';
import { Logger } from '../../utils/Logger';

export class N8nAPIClient {
  private readonly config: Required<Omit<N8nAPIConfig, 'sessionAuth'>> & { sessionAuth?: N8nAPIConfig['sessionAuth'] };
  private readonly cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private readonly cacheTTL: number;
  private sessionCookie: string | null = null;
  private sessionInitialized = false;

  constructor(config: N8nAPIConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ''), // Remove trailing slash
      apiKey: config.apiKey,
      timeout: config.timeout ?? 30000,
      retries: config.retries ?? 3,
      sessionAuth: config.sessionAuth,
    };
    this.cacheTTL = 60000; // 1 minute cache
  }

  /**
   * Initialize session-based authentication
   * Called automatically on first request if sessionAuth is configured
   */
  async initSession(): Promise<boolean> {
    if (!this.config.sessionAuth || this.sessionInitialized) {
      return !!this.sessionCookie;
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/rest/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailOrLdapLoginId: this.config.sessionAuth.email,
          password: this.config.sessionAuth.password,
        }),
      });

      if (!response.ok) {
        Logger.getInstance().warn('Session login failed:', response.status);
        this.sessionInitialized = true;
        return false;
      }

      // Extract session cookie
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        const match = setCookie.match(/n8n-auth=([^;]+)/);
        if (match) {
          this.sessionCookie = match[1];
          this.sessionInitialized = true;
          return true;
        }
      }

      this.sessionInitialized = true;
      return false;
    } catch (error) {
      Logger.getInstance().warn('Session initialization failed:', error);
      this.sessionInitialized = true;
      return false;
    }
  }

  // ============================================================================
  // Workflow Operations
  // ============================================================================

  /**
   * List all workflows
   */
  async listWorkflows(): Promise<N8nWorkflow[]> {
    const response = await this.request<{ data: N8nWorkflow[] }>('/api/v1/workflows');
    return response.data;
  }

  /**
   * Get workflow by ID
   */
  async getWorkflow(workflowId: string, useCache = true): Promise<N8nWorkflow> {
    const cacheKey = `workflow:${workflowId}`;

    if (useCache) {
      const cached = this.getFromCache<N8nWorkflow>(cacheKey);
      if (cached) return cached;
    }

    const workflow = await this.request<N8nWorkflow>(`/api/v1/workflows/${workflowId}`);
    this.setCache(cacheKey, workflow);
    return workflow;
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(
    workflowId: string,
    data?: Record<string, unknown>
  ): Promise<N8nExecution> {
    return this.request<N8nExecution>(
      `/api/v1/workflows/${workflowId}/execute`,
      {
        method: 'POST',
        body: data ? JSON.stringify({ data }) : undefined,
      }
    );
  }

  /**
   * Activate a workflow
   */
  async activateWorkflow(workflowId: string): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>(
      `/api/v1/workflows/${workflowId}/activate`,
      { method: 'POST' }
    );
  }

  /**
   * Deactivate a workflow
   */
  async deactivateWorkflow(workflowId: string): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>(
      `/api/v1/workflows/${workflowId}/deactivate`,
      { method: 'POST' }
    );
  }

  /**
   * Create a new workflow
   * Accepts workflow without id, createdAt, updatedAt (server will generate these)
   */
  async createWorkflow(workflow: Omit<N8nWorkflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>(
      '/api/v1/workflows',
      {
        method: 'POST',
        body: JSON.stringify(workflow),
      }
    );
  }

  /**
   * Update an existing workflow
   */
  async updateWorkflow(workflowId: string, workflow: Partial<N8nWorkflow>): Promise<N8nWorkflow> {
    // Invalidate cache
    this.cache.delete(`workflow:${workflowId}`);

    return this.request<N8nWorkflow>(
      `/api/v1/workflows/${workflowId}`,
      {
        method: 'PUT',
        body: JSON.stringify(workflow),
      }
    );
  }

  /**
   * Delete a workflow
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    // Invalidate cache
    this.cache.delete(`workflow:${workflowId}`);

    await this.request(
      `/api/v1/workflows/${workflowId}`,
      { method: 'DELETE' }
    );
  }

  // ============================================================================
  // Execution Operations
  // ============================================================================

  /**
   * List executions
   */
  async listExecutions(filters?: {
    workflowId?: string;
    status?: string;
    limit?: number;
  }): Promise<N8nExecution[]> {
    const params = new URLSearchParams();
    if (filters?.workflowId) params.set('workflowId', filters.workflowId);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.limit) params.set('limit', filters.limit.toString());

    const query = params.toString();
    const path = query ? `/api/v1/executions?${query}` : '/api/v1/executions';

    const response = await this.request<{ data: N8nExecution[] }>(path);
    return response.data;
  }

  /**
   * Get execution by ID
   */
  async getExecution(executionId: string): Promise<N8nExecution> {
    return this.request<N8nExecution>(`/api/v1/executions/${executionId}`);
  }

  /**
   * Delete execution
   */
  async deleteExecution(executionId: string): Promise<void> {
    await this.request(`/api/v1/executions/${executionId}`, { method: 'DELETE' });
  }

  /**
   * Wait for execution to complete
   */
  async waitForExecution(
    executionId: string,
    timeout = 30000,
    pollInterval = 1000
  ): Promise<N8nExecution> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const execution = await this.getExecution(executionId);

      if (execution.finished) {
        return execution;
      }

      await this.sleep(pollInterval);
    }

    throw new Error(`Execution ${executionId} did not complete within ${timeout}ms`);
  }

  // ============================================================================
  // Credential Operations
  // ============================================================================

  /**
   * List credentials (metadata only, no secrets)
   */
  async listCredentials(): Promise<N8nCredential[]> {
    const response = await this.request<{ data: N8nCredential[] }>('/api/v1/credentials');
    return response.data;
  }

  /**
   * Get credential by ID (metadata only)
   */
  async getCredential(credentialId: string): Promise<N8nCredential> {
    return this.request<N8nCredential>(`/api/v1/credentials/${credentialId}`);
  }

  // ============================================================================
  // Health & Status
  // ============================================================================

  /**
   * Check n8n API health
   */
  async healthCheck(): Promise<{ status: string }> {
    try {
      // n8n doesn't have a dedicated health endpoint, so we check workflows
      await this.request('/api/v1/workflows?limit=1');
      return { status: 'ok' };
    } catch (error) {
      return { status: 'error' };
    }
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      const health = await this.healthCheck();
      return health.status === 'ok';
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Make HTTP request with retry logic
   * Supports both API key auth (Public API) and session cookie auth (Internal REST API)
   */
  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Initialize session if configured and not yet initialized
    if (this.config.sessionAuth && !this.sessionInitialized) {
      await this.initSession();
    }

    // Determine which API to use based on authentication method
    const useSessionAuth = this.sessionCookie && path.startsWith('/api/v1/');

    // Convert Public API paths to Internal REST paths if using session auth
    let apiPath = path;
    if (useSessionAuth) {
      apiPath = path.replace('/api/v1/', '/rest/');
    }

    const url = `${this.config.baseUrl}${apiPath}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    // Add authentication header
    if (this.sessionCookie && useSessionAuth) {
      headers['Cookie'] = `n8n-auth=${this.sessionCookie}`;
    } else {
      headers['X-N8N-API-KEY'] = this.config.apiKey;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          let errorMessage: string;

          try {
            const errorJson = JSON.parse(errorBody);
            errorMessage = errorJson.message || errorJson.error || response.statusText;
          } catch {
            errorMessage = errorBody || response.statusText;
          }

          // If API key auth fails with 401, try session auth
          if (response.status === 401 && !useSessionAuth && this.config.sessionAuth && !this.sessionCookie) {
            const sessionInitialized = await this.initSession();
            if (sessionInitialized) {
              // Retry with session auth
              return this.request<T>(path, options);
            }
          }

          throw new N8nAPIError(
            `N8n API error: ${errorMessage}`,
            response.status,
            path
          );
        }

        // Handle empty responses
        const text = await response.text();
        if (!text) {
          return {} as T;
        }

        // Internal REST API wraps data in { data: ... }
        const parsed = JSON.parse(text);

        // Normalize response format (Public API vs Internal REST API)
        if (useSessionAuth && parsed.data !== undefined && !path.includes('?')) {
          // Internal REST API wraps single resources in { data: ... }
          // But not for list endpoints (which already return arrays)
          if (Array.isArray(parsed.data)) {
            return { data: parsed.data } as T;
          }
          return parsed.data as T;
        }

        return parsed as T;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on client errors (4xx) except 401 which we handle above
        if (error instanceof N8nAPIError && error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 401) {
          throw error;
        }

        // Wait before retry with exponential backoff
        if (attempt < this.config.retries) {
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Get item from cache
   */
  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return cached.data as T;
  }

  /**
   * Set item in cache
   */
  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Custom error class for N8n API errors
 */
export class N8nAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly path: string
  ) {
    super(message);
    this.name = 'N8nAPIError';
  }
}
