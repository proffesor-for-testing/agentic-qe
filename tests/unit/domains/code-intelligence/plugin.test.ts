/**
 * Agentic QE v3 - Code Intelligence Plugin Unit Tests
 *
 * Tests for the code intelligence domain plugin covering:
 * - Lifecycle management (initialize/dispose)
 * - Task handlers (index, search, analyze-impact, query-dependencies)
 * - Knowledge graph operations
 * - Event handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CodeIntelligencePlugin,
  createCodeIntelligencePlugin,
} from '../../../../src/domains/code-intelligence/plugin';
import {
  MockEventBus,
  MockMemoryBackend,
  MockAgentCoordinator,
  createMockTaskRequest,
  createMockCallback,
  createMockEvent,
  verifyIdleHealth,
  sampleTasks,
  expectSuccess,
  expectError,
} from '../plugin-test-utils';

describe('CodeIntelligencePlugin', () => {
  let plugin: CodeIntelligencePlugin;
  let eventBus: MockEventBus;
  let memory: MockMemoryBackend;
  let agentCoordinator: MockAgentCoordinator;

  beforeEach(() => {
    eventBus = new MockEventBus();
    memory = new MockMemoryBackend();
    agentCoordinator = new MockAgentCoordinator();
    plugin = new CodeIntelligencePlugin(eventBus, memory, agentCoordinator);
  });

  afterEach(async () => {
    if (plugin.isReady()) {
      await plugin.dispose();
    }
    await eventBus.dispose();
    await memory.dispose();
    await agentCoordinator.dispose();
  });

  // ============================================================================
  // Metadata Tests
  // ============================================================================

  describe('metadata', () => {
    it('should have correct domain name', () => {
      expect(plugin.name).toBe('code-intelligence');
    });

    it('should have correct version', () => {
      expect(plugin.version).toBe('1.0.0');
    });

    it('should have no required dependencies', () => {
      expect(plugin.dependencies).toEqual([]);
    });
  });

  // ============================================================================
  // Lifecycle Tests
  // ============================================================================

  describe('lifecycle', () => {
    it('should not be ready before initialization', () => {
      expect(plugin.isReady()).toBe(false);
    });

    it('should be ready after initialization', async () => {
      await plugin.initialize();
      expect(plugin.isReady()).toBe(true);
    });

    it('should have idle health status after initialization', async () => {
      await plugin.initialize();
      const health = plugin.getHealth();
      verifyIdleHealth(health);
    });

    it('should not be ready after disposal', async () => {
      await plugin.initialize();
      await plugin.dispose();
      expect(plugin.isReady()).toBe(false);
    });
  });

  // ============================================================================
  // Factory Function Tests
  // ============================================================================

  describe('factory function', () => {
    it('should create plugin via factory function', () => {
      const createdPlugin = createCodeIntelligencePlugin(eventBus, memory, agentCoordinator);
      expect(createdPlugin).toBeInstanceOf(CodeIntelligencePlugin);
      expect(createdPlugin.name).toBe('code-intelligence');
    });

    it('should accept optional configuration', () => {
      const createdPlugin = createCodeIntelligencePlugin(eventBus, memory, agentCoordinator, {
        knowledgeGraph: {},
        semanticAnalyzer: {},
      });
      expect(createdPlugin).toBeInstanceOf(CodeIntelligencePlugin);
    });
  });

  // ============================================================================
  // API Tests
  // ============================================================================

  describe('getAPI', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should return API with all expected methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('index');
      expect(api).toHaveProperty('search');
      expect(api).toHaveProperty('analyzeImpact');
      expect(api).toHaveProperty('getDependencies');
      expect(api).toHaveProperty('getMetrics');
    });

    it('should return API with internal accessor methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('getCoordinator');
      expect(api).toHaveProperty('getKnowledgeGraph');
      expect(api).toHaveProperty('getSemanticAnalyzer');
      expect(api).toHaveProperty('getImpactAnalyzer');
    });
  });

  // ============================================================================
  // canHandleTask Tests
  // ============================================================================

  describe('canHandleTask', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle index task type', () => {
      expect(plugin.canHandleTask('index')).toBe(true);
    });

    it('should handle search task type', () => {
      expect(plugin.canHandleTask('search')).toBe(true);
    });

    it('should handle analyze-impact task type', () => {
      expect(plugin.canHandleTask('analyze-impact')).toBe(true);
    });

    it('should handle query-dependencies task type', () => {
      expect(plugin.canHandleTask('query-dependencies')).toBe(true);
    });

    it('should not handle unknown task types', () => {
      expect(plugin.canHandleTask('unknown-task')).toBe(false);
      expect(plugin.canHandleTask('')).toBe(false);
      expect(plugin.canHandleTask('execute-tests')).toBe(false);
    });
  });

  // ============================================================================
  // executeTask Tests
  // ============================================================================

  describe('executeTask', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should accept valid index task', async () => {
      const request = sampleTasks.codeIntelligence.index;
      const { callback } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);
    });

    it('should return error for unknown task type', async () => {
      const request = createMockTaskRequest('unknown-task', {});
      const { callback } = createMockCallback();

      const result = await plugin.executeTask(request, callback);
      expectError(result);
      expect(result.error.message).toContain('no handler');
    });

    it('should return error for index with missing paths', async () => {
      const request = createMockTaskRequest('index', {
        language: 'typescript',
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing paths');
    });

    it('should return error for search with missing query', async () => {
      const request = createMockTaskRequest('search', {
        limit: 10,
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing query');
    });

    it('should return error for analyze-impact with missing changedFiles', async () => {
      const request = createMockTaskRequest('analyze-impact', {});
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing changedFiles');
    });

    it('should return error for query-dependencies with missing file', async () => {
      const request = createMockTaskRequest('query-dependencies', {
        depth: 2,
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing file');
    });
  });

  // ============================================================================
  // Event Handling Tests
  // ============================================================================

  describe('event handling', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle file changed events', async () => {
      const event = createMockEvent(
        'vcs.FileChanged',
        'vcs',
        {
          file: 'src/service.ts',
          changeType: 'modified',
        }
      );

      await plugin.handleEvent(event);

      const health = plugin.getHealth();
      expect(health.lastActivity).toBeInstanceOf(Date);
    });

    it('should handle test generation events for correlation', async () => {
      const event = createMockEvent(
        'test-generation.TestGenerated',
        'test-generation',
        {
          testId: 'test_123',
          sourceFile: 'src/service.ts',
          testFile: 'src/service.test.ts',
        }
      );

      await plugin.handleEvent(event);

      // Should store correlation
      const stored = await memory.get('code-intelligence:test-mapping:test_123');
      expect(stored).toBeDefined();
    });
  });

  // ============================================================================
  // Health Tracking Tests
  // ============================================================================

  describe('health tracking', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should start with idle status', () => {
      const health = plugin.getHealth();
      expect(health.status).toBe('idle');
    });
  });

  // ============================================================================
  // Integration Configuration Tests
  // ============================================================================

  describe('integration configuration', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should not have MinCut integration by default', () => {
      expect(plugin.hasMinCutIntegration()).toBe(false);
    });

    it('should not have consensus enabled by default', () => {
      expect(plugin.hasConsensusEnabled()).toBe(false);
    });
  });
});
