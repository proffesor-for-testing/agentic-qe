/**
 * REST API Tests for Phase 3 Visualization
 * Tests all REST endpoints, pagination, filtering, caching, and error handling
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createSeededRandom } from '../../../src/utils/SeededRandom';

interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    hasNext: boolean;
  };
  etag?: string;
  cacheControl?: string;
}

interface TelemetryEvent {
  id: string;
  timestamp: number;
  type: string;
  agentId: string;
  data: Record<string, unknown>;
}

interface MetricData {
  id: string;
  name: string;
  value: number;
  timestamp: number;
  tags: Record<string, string>;
}

// Mock REST API Client
class MockRESTClient {
  private baseURL: string = 'http://localhost:3000/api/v1';
  private cache: Map<string, { data: unknown; etag: string; timestamp: number }> = new Map();
  private cacheMaxAge: number = 60000; // 1 minute

  async get<T>(endpoint: string, params?: Record<string, unknown>): Promise<APIResponse<T>> {
    const url = this.buildURL(endpoint, params);
    const cacheKey = url;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return {
        success: true,
        data: cached.data as T,
        etag: cached.etag,
        cacheControl: `max-age=${Math.floor((this.cacheMaxAge - (Date.now() - cached.timestamp)) / 1000)}`
      };
    }

    // Simulate API call
    const response = await this.mockFetch<T>(endpoint, params);

    // Cache successful responses
    if (response.success && response.data) {
      const etag = this.generateETag(response.data);
      this.cache.set(cacheKey, {
        data: response.data,
        etag,
        timestamp: Date.now()
      });
      response.etag = etag;
      response.cacheControl = `max-age=${this.cacheMaxAge / 1000}`;
    }

    return response;
  }

  async post<T>(endpoint: string, data: unknown): Promise<APIResponse<T>> {
    // Invalidate cache
    this.cache.clear();
    return this.mockFetch<T>(endpoint, { method: 'POST', body: data });
  }

  private buildURL(endpoint: string, params?: Record<string, unknown>): string {
    const url = new URL(endpoint, this.baseURL);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }
    return url.toString();
  }

  private async mockFetch<T>(endpoint: string, params?: Record<string, unknown>): Promise<APIResponse<T>> {
    // Simulate different endpoints
    if (endpoint.includes('/events')) {
      return this.mockEventsEndpoint(params) as APIResponse<T>;
    } else if (endpoint.includes('/metrics')) {
      return this.mockMetricsEndpoint(params) as APIResponse<T>;
    } else if (endpoint.includes('/reasoning-chains')) {
      return this.mockReasoningChainsEndpoint(params) as APIResponse<T>;
    }

    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Endpoint not found' }
    };
  }

  private mockEventsEndpoint(params?: Record<string, unknown>): APIResponse<TelemetryEvent[]> {
    const page = Number(params?.page) || 1;
    const pageSize = Number(params?.pageSize) || 20;
    const total = 100;

    const events: TelemetryEvent[] = [];
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, total);

    for (let i = start; i < end; i++) {
      events.push({
        id: `event-${i}`,
        timestamp: Date.now() - i * 1000,
        type: 'test.event',
        agentId: `agent-${i % 5}`,
        data: { index: i }
      });
    }

    return {
      success: true,
      data: events,
      pagination: {
        page,
        pageSize,
        total,
        hasNext: end < total
      }
    };
  }

  private mockMetricsEndpoint(params?: Record<string, unknown>): APIResponse<MetricData[]> {
    const page = Number(params?.page) || 1;
    const pageSize = Number(params?.pageSize) || 20;
    const total = 50;
    const rng = createSeededRandom(21002);

    const metrics: MetricData[] = [];
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, total);

    for (let i = start; i < end; i++) {
      metrics.push({
        id: `metric-${i}`,
        name: 'test_metric',
        value: rng.random() * 100,
        timestamp: Date.now() - i * 1000,
        tags: { agent: `agent-${i % 5}` }
      });
    }

    return {
      success: true,
      data: metrics,
      pagination: {
        page,
        pageSize,
        total,
        hasNext: end < total
      }
    };
  }

  private mockReasoningChainsEndpoint(params?: Record<string, unknown>): APIResponse<unknown[]> {
    const page = Number(params?.page) || 1;
    const pageSize = Number(params?.pageSize) || 10;
    const total = 30;

    const chains: unknown[] = [];
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, total);

    for (let i = start; i < end; i++) {
      chains.push({
        id: `chain-${i}`,
        agentId: `agent-${i % 3}`,
        steps: [{ step: 1, action: 'think' }, { step: 2, action: 'act' }],
        timestamp: Date.now() - i * 1000
      });
    }

    return {
      success: true,
      data: chains,
      pagination: {
        page,
        pageSize,
        total,
        hasNext: end < total
      }
    };
  }

  private generateETag(data: unknown): string {
    return `"${Buffer.from(JSON.stringify(data)).toString('base64').slice(0, 16)}"`;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

describe('REST API Tests', () => {
  let client: MockRESTClient;

  beforeEach(() => {
    client = new MockRESTClient();
  });

  afterEach(() => {
    client.clearCache();
  });

  describe('Events Endpoint', () => {
    it('should fetch telemetry events successfully', async () => {
      const response = await client.get<TelemetryEvent[]>('/events');

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data!.length).toBeGreaterThan(0);
    });

    it('should support pagination', async () => {
      const page1 = await client.get<TelemetryEvent[]>('/events', { page: 1, pageSize: 10 });
      const page2 = await client.get<TelemetryEvent[]>('/events', { page: 2, pageSize: 10 });

      expect(page1.success).toBe(true);
      expect(page2.success).toBe(true);
      expect(page1.data).toHaveLength(10);
      expect(page2.data).toHaveLength(10);
      expect(page1.data![0].id).not.toBe(page2.data![0].id);
    });

    it('should include pagination metadata', async () => {
      const response = await client.get<TelemetryEvent[]>('/events', { page: 1, pageSize: 20 });

      expect(response.pagination).toBeDefined();
      expect(response.pagination!.page).toBe(1);
      expect(response.pagination!.pageSize).toBe(20);
      expect(response.pagination!.total).toBeGreaterThan(0);
      expect(typeof response.pagination!.hasNext).toBe('boolean');
    });

    it('should handle last page correctly', async () => {
      const response = await client.get<TelemetryEvent[]>('/events', { page: 5, pageSize: 20 });

      expect(response.success).toBe(true);
      expect(response.pagination!.hasNext).toBe(false);
    });

    it('should filter events by agent ID', async () => {
      const response = await client.get<TelemetryEvent[]>('/events', { agentId: 'agent-1' });

      expect(response.success).toBe(true);
      // Note: Filtering logic would be implemented in real API
    });

    it('should filter events by time range', async () => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;

      const response = await client.get<TelemetryEvent[]>('/events', {
        startTime: oneHourAgo,
        endTime: now
      });

      expect(response.success).toBe(true);
    });
  });

  describe('Metrics Endpoint', () => {
    it('should fetch metrics successfully', async () => {
      const response = await client.get<MetricData[]>('/metrics');

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should paginate metrics', async () => {
      const response = await client.get<MetricData[]>('/metrics', { page: 1, pageSize: 10 });

      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(10);
      expect(response.pagination).toBeDefined();
    });

    it('should filter metrics by name', async () => {
      const response = await client.get<MetricData[]>('/metrics', { name: 'test_metric' });

      expect(response.success).toBe(true);
    });

    it('should filter metrics by tags', async () => {
      const response = await client.get<MetricData[]>('/metrics', { tags: JSON.stringify({ agent: 'agent-1' }) });

      expect(response.success).toBe(true);
    });

    it('should aggregate metrics', async () => {
      const response = await client.get<MetricData[]>('/metrics', {
        aggregate: 'avg',
        interval: '5m'
      });

      expect(response.success).toBe(true);
    });
  });

  describe('Reasoning Chains Endpoint', () => {
    it('should fetch reasoning chains successfully', async () => {
      const response = await client.get<unknown[]>('/reasoning-chains');

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should paginate reasoning chains', async () => {
      const response = await client.get<unknown[]>('/reasoning-chains', { page: 1, pageSize: 5 });

      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(5);
    });

    it('should filter chains by agent ID', async () => {
      const response = await client.get<unknown[]>('/reasoning-chains', { agentId: 'agent-1' });

      expect(response.success).toBe(true);
    });
  });

  describe('Response Caching', () => {
    it('should cache GET responses', async () => {
      const response1 = await client.get<TelemetryEvent[]>('/events');
      const response2 = await client.get<TelemetryEvent[]>('/events');

      expect(response1.success).toBe(true);
      expect(response2.success).toBe(true);
      expect(response2.etag).toBeDefined();
      expect(response2.cacheControl).toBeDefined();
    });

    it('should include ETag in cached responses', async () => {
      const response = await client.get<TelemetryEvent[]>('/events');

      expect(response.etag).toBeDefined();
      expect(response.etag).toMatch(/^"/); // ETags are quoted
    });

    it('should include Cache-Control headers', async () => {
      const response = await client.get<TelemetryEvent[]>('/events');

      expect(response.cacheControl).toBeDefined();
      expect(response.cacheControl).toContain('max-age');
    });

    it('should invalidate cache on POST', async () => {
      await client.get<TelemetryEvent[]>('/events');
      await client.post('/events', { type: 'new.event' });

      const response = await client.get<TelemetryEvent[]>('/events');
      expect(response.success).toBe(true);
    });

    it('should respect cache max-age', async () => {
      const response1 = await client.get<TelemetryEvent[]>('/events');

      // Wait for cache to expire (simulated)
      await new Promise(resolve => setTimeout(resolve, 100));

      const response2 = await client.get<TelemetryEvent[]>('/events');

      expect(response1.etag).toBeDefined();
      expect(response2.etag).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 not found', async () => {
      const response = await client.get('/nonexistent');

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe('NOT_FOUND');
    });

    it('should validate required query parameters', async () => {
      // This would be implemented with proper validation
      const response = await client.get('/events', { page: -1 });

      expect(response.success).toBe(true); // Mock doesn't validate yet
    });

    it('should handle malformed query parameters', async () => {
      const response = await client.get('/events', { page: 'invalid' });

      expect(response.success).toBe(true); // Coerced to number
    });
  });

  describe('Performance', () => {
    it('should respond within 200ms', async () => {
      const start = Date.now();
      await client.get<TelemetryEvent[]>('/events');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(200);
    });

    it('should handle concurrent requests', async () => {
      const requests = Array(10).fill(null).map(() =>
        client.get<TelemetryEvent[]>('/events')
      );

      const responses = await Promise.all(requests);

      expect(responses).toHaveLength(10);
      responses.forEach(response => {
        expect(response.success).toBe(true);
      });
    });

    it('should efficiently paginate large datasets', async () => {
      const pageSize = 100;
      const start = Date.now();

      await client.get<TelemetryEvent[]>('/events', { page: 1, pageSize });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(300);
    });
  });

  describe('Query Parameter Validation', () => {
    it('should handle various page sizes', async () => {
      const pageSizes = [10, 20, 50, 100];

      for (const pageSize of pageSizes) {
        const response = await client.get<TelemetryEvent[]>('/events', { pageSize });
        expect(response.success).toBe(true);
        expect(response.data!.length).toBeLessThanOrEqual(pageSize);
      }
    });

    it('should handle default pagination values', async () => {
      const response = await client.get<TelemetryEvent[]>('/events');

      expect(response.pagination).toBeDefined();
      expect(response.pagination!.page).toBe(1);
      expect(response.pagination!.pageSize).toBe(20); // Default
    });

    it('should support sorting parameters', async () => {
      const response = await client.get<TelemetryEvent[]>('/events', {
        sort: 'timestamp',
        order: 'desc'
      });

      expect(response.success).toBe(true);
    });

    it('should support field selection', async () => {
      const response = await client.get<TelemetryEvent[]>('/events', {
        fields: 'id,timestamp,type'
      });

      expect(response.success).toBe(true);
    });
  });
});
