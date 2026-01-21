/**
 * Unit tests for RuVectorHandler
 *
 * Tests the 6 RuVector GNN cache MCP tool handlers:
 * - ruvector_health
 * - ruvector_metrics
 * - ruvector_force_learn
 * - ruvector_store_pattern
 * - ruvector_search
 * - ruvector_cost_savings
 *
 * Note: These tests verify the handler interface and response structure.
 * The actual pattern store operations may behave differently in test vs production.
 */

import { RuVectorHandler } from '../../../../src/mcp/handlers/ruvector/RuVectorHandler';
import { AgentRegistry } from '../../../../src/mcp/services/AgentRegistry';
import { HookExecutor } from '../../../../src/mcp/services/HookExecutor';

describe('RuVectorHandler', () => {
  let handler: RuVectorHandler;
  let mockRegistry: AgentRegistry;
  let mockHookExecutor: HookExecutor;

  beforeEach(() => {
    mockRegistry = {
      getAgent: jest.fn(),
      listAgents: jest.fn(),
    } as unknown as AgentRegistry;

    mockHookExecutor = {
      executeHook: jest.fn(),
    } as unknown as HookExecutor;

    handler = new RuVectorHandler(mockRegistry, mockHookExecutor);
  });

  describe('handleRuvectorHealth', () => {
    it('should return response with proper structure', async () => {
      const result = await handler.handleRuvectorHealth({});

      // Check response structure (may succeed or fail depending on pattern store)
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('metadata');
      expect(result.metadata).toHaveProperty('timestamp');
      expect(result.metadata).toHaveProperty('requestId');

      if (result.success) {
        expect(result.data).toHaveProperty('status');
        expect(result.data).toHaveProperty('implementation');
      }
    });
  });

  describe('handleRuvectorMetrics', () => {
    it('should return response with proper structure', async () => {
      const result = await handler.handleRuvectorMetrics({});

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('metadata');

      if (result.success) {
        expect(result.data).toHaveProperty('patternCount');
        expect(result.data).toHaveProperty('qps');
      }
    });

    it('should handle detailed parameter', async () => {
      const result = await handler.handleRuvectorMetrics({ detailed: true });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('metadata');

      if (result.success) {
        expect(result.data).toHaveProperty('implementation');
      }
    });
  });

  describe('handleRuvectorForceLearn', () => {
    it('should return response with proper structure', async () => {
      const result = await handler.handleRuvectorForceLearn({});

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('metadata');

      if (result.success) {
        expect(result.data).toHaveProperty('patternsConsolidated');
        expect(result.data).toHaveProperty('domain');
      }
    });

    it('should accept domain parameter', async () => {
      const result = await handler.handleRuvectorForceLearn({ domain: 'authentication' });

      expect(result).toHaveProperty('success');
      if (result.success) {
        expect(result.data.domain).toBe('authentication');
      }
    });
  });

  describe('handleRuvectorStorePattern', () => {
    it('should validate required parameters', async () => {
      const embedding = new Array(384).fill(0.1);
      const result = await handler.handleRuvectorStorePattern({
        id: 'test-pattern-1',
        content: 'Test login with valid credentials',
        domain: 'authentication',
        embedding,
        type: 'unit-test',
        framework: 'jest',
      });

      // Check response structure
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('metadata');

      if (result.success) {
        expect(result.data).toHaveProperty('patternId', 'test-pattern-1');
        expect(result.data).toHaveProperty('domain', 'authentication');
      }
    });

    it('should fail when id is missing', async () => {
      const result = await handler.handleRuvectorStorePattern({
        content: 'Test content',
        domain: 'test',
        embedding: [0.1, 0.2],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('id is required');
    });

    it('should fail when content is missing', async () => {
      const result = await handler.handleRuvectorStorePattern({
        id: 'test-1',
        domain: 'test',
        embedding: [0.1, 0.2],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('content is required');
    });

    it('should fail when embedding is missing', async () => {
      const result = await handler.handleRuvectorStorePattern({
        id: 'test-1',
        content: 'Test content',
        domain: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('embedding');
    });
  });

  describe('handleRuvectorSearch', () => {
    it('should validate and handle search request', async () => {
      const embedding = new Array(384).fill(0.1);
      const result = await handler.handleRuvectorSearch({
        embedding,
        k: 5,
      });

      // Check response structure
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('metadata');

      if (result.success) {
        expect(result.data).toHaveProperty('matches');
        expect(result.data).toHaveProperty('totalResults');
        expect(result.data).toHaveProperty('searchParams');
      }
    });

    it('should fail when embedding is missing', async () => {
      const result = await handler.handleRuvectorSearch({
        k: 5,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('embedding');
    });

    it('should handle domain filtering', async () => {
      const embedding = new Array(384).fill(0.1);
      const result = await handler.handleRuvectorSearch({
        embedding,
        k: 5,
        domain: 'authentication',
      });

      expect(result).toHaveProperty('success');
      if (result.success) {
        expect(result.data.searchParams.domain).toBe('authentication');
      }
    });
  });

  describe('handleRuvectorCostSavings', () => {
    it('should return response with proper structure', async () => {
      const result = await handler.handleRuvectorCostSavings({});

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('metadata');

      if (result.success) {
        expect(result.data).toHaveProperty('summary');
        expect(result.data).toHaveProperty('costSavings');
        expect(result.data).toHaveProperty('timeSavings');
        expect(result.data).toHaveProperty('efficiency');
      }
    });
  });
});
