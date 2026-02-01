/**
 * Agentic QE v3 - Coverage Analysis Plugin Unit Tests
 *
 * Tests for the coverage analysis domain plugin covering:
 * - Lifecycle management (initialize/dispose)
 * - Task handlers (analyze-coverage, detect-gaps, calculate-risk)
 * - canHandleTask boundary conditions
 * - Event handling from test-execution
 * - Health tracking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CoverageAnalysisPlugin,
  createCoverageAnalysisPlugin,
} from '../../../../src/domains/coverage-analysis/plugin';
import {
  MockEventBus,
  MockMemoryBackend,
  createMockTaskRequest,
  createMockCallback,
  createMockEvent,
  sampleTasks,
  expectSuccess,
  expectError,
} from '../plugin-test-utils';

describe('CoverageAnalysisPlugin', () => {
  let plugin: CoverageAnalysisPlugin;
  let eventBus: MockEventBus;
  let memory: MockMemoryBackend;

  beforeEach(() => {
    eventBus = new MockEventBus();
    memory = new MockMemoryBackend();
    // Note: CoverageAnalysisPlugin only takes eventBus and memory (no agentCoordinator)
    plugin = new CoverageAnalysisPlugin(eventBus, memory);
  });

  afterEach(async () => {
    if (plugin.isReady()) {
      await plugin.dispose();
    }
    await eventBus.dispose();
    await memory.dispose();
  });

  // ============================================================================
  // Metadata Tests
  // ============================================================================

  describe('metadata', () => {
    it('should have correct domain name', () => {
      expect(plugin.name).toBe('coverage-analysis');
    });

    it('should have correct version', () => {
      expect(plugin.version).toBe('1.0.0');
    });

    it('should depend on test-execution', () => {
      expect(plugin.dependencies).toContain('test-execution');
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
      expect(health.status).toBe('idle');
    });

    it('should not be ready after disposal', async () => {
      await plugin.initialize();
      await plugin.dispose();
      expect(plugin.isReady()).toBe(false);
    });

    it('should set unhealthy status on disposal', async () => {
      await plugin.initialize();
      await plugin.dispose();
      const health = plugin.getHealth();
      expect(health.status).toBe('unhealthy');
    });

    it('should be idempotent on multiple initializations', async () => {
      await plugin.initialize();
      await plugin.initialize();
      expect(plugin.isReady()).toBe(true);
    });
  });

  // ============================================================================
  // Factory Function Tests
  // ============================================================================

  describe('factory function', () => {
    it('should create plugin via factory function', () => {
      const createdPlugin = createCoverageAnalysisPlugin(eventBus, memory);
      expect(createdPlugin).toBeInstanceOf(CoverageAnalysisPlugin);
      expect(createdPlugin.name).toBe('coverage-analysis');
    });
  });

  // ============================================================================
  // API Tests
  // ============================================================================

  describe('getAPI', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should return coordinator as API', () => {
      const api = plugin.getAPI<Record<string, unknown>>();
      expect(api).toBeDefined();
    });

    it('should provide typed API via getCoverageAPI', () => {
      const api = plugin.getCoverageAPI();
      expect(api).toBeDefined();
      expect(api).toHaveProperty('analyze');
      expect(api).toHaveProperty('detectGaps');
      expect(api).toHaveProperty('calculateRisk');
    });
  });

  // ============================================================================
  // canHandleTask Tests
  // ============================================================================

  describe('canHandleTask', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle analyze-coverage task type', () => {
      expect(plugin.canHandleTask('analyze-coverage')).toBe(true);
    });

    it('should handle detect-gaps task type', () => {
      expect(plugin.canHandleTask('detect-gaps')).toBe(true);
    });

    it('should handle calculate-risk task type', () => {
      expect(plugin.canHandleTask('calculate-risk')).toBe(true);
    });

    it('should not handle unknown task types', () => {
      expect(plugin.canHandleTask('unknown-task')).toBe(false);
      expect(plugin.canHandleTask('')).toBe(false);
      expect(plugin.canHandleTask('generate-tests')).toBe(false);
    });

    it('should be case sensitive for task types', () => {
      expect(plugin.canHandleTask('Analyze-Coverage')).toBe(false);
      expect(plugin.canHandleTask('ANALYZE-COVERAGE')).toBe(false);
    });
  });

  // ============================================================================
  // executeTask Tests
  // ============================================================================

  describe('executeTask', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should accept valid analyze-coverage task', async () => {
      const request = sampleTasks.coverageAnalysis.analyzeCoverage;
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

    it('should return error for analyze-coverage with missing coverageData', async () => {
      const request = createMockTaskRequest('analyze-coverage', {
        threshold: 80,
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing coverageData');
    });

    it('should return error for detect-gaps with missing coverageData', async () => {
      const request = createMockTaskRequest('detect-gaps', {
        minCoverage: 80,
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing coverageData');
    });

    it('should return error for calculate-risk with missing file', async () => {
      const request = createMockTaskRequest('calculate-risk', {
        uncoveredLines: [1, 2, 3],
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing file or uncoveredLines');
    });

    it('should return error for calculate-risk with missing uncoveredLines', async () => {
      const request = createMockTaskRequest('calculate-risk', {
        file: 'src/index.ts',
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
    });
  });

  // ============================================================================
  // Event Handling Tests
  // ============================================================================

  describe('event handling', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle test run completed events', async () => {
      const event = createMockEvent(
        'test-execution.TestRunCompleted',
        'test-execution',
        {
          runId: 'run_123',
          passed: 95,
          failed: 5,
          skipped: 0,
          duration: 1000,
        }
      );

      await plugin.handleEvent(event);

      // Should update health activity
      const health = plugin.getHealth();
      expect(health.lastActivity).toBeInstanceOf(Date);
    });

    it('should trigger analysis when test run includes coverage data', async () => {
      const event = createMockEvent(
        'test-execution.TestRunCompleted',
        'test-execution',
        {
          runId: 'run_456',
          passed: 100,
          failed: 0,
          skipped: 0,
          duration: 500,
          coverageData: {
            totalLines: 1000,
            coveredLines: 850,
          },
        }
      );

      await plugin.handleEvent(event);

      // Should process coverage data
      const health = plugin.getHealth();
      expect(health.lastActivity).toBeInstanceOf(Date);
    });
  });

  // ============================================================================
  // Health Tracking Tests
  // ============================================================================

  describe('health tracking', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should report 3 total services', () => {
      const health = plugin.getHealth();
      expect(health.agents.total).toBe(3);
    });

    it('should report all services idle when no analysis running', () => {
      const health = plugin.getHealth();
      expect(health.agents.idle).toBe(3);
      expect(health.agents.active).toBe(0);
    });

    it('should track activity during analysis', async () => {
      const request = sampleTasks.coverageAnalysis.analyzeCoverage;
      const { callback, waitForResult } = createMockCallback();

      await plugin.executeTask(request, callback);
      await waitForResult();

      const health = plugin.getHealth();
      expect(health.lastActivity).toBeInstanceOf(Date);
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

    it('should allow setting consensus config', () => {
      plugin.setConsensusConfig({
        enabled: true,
        verifySeverities: ['critical'],
      });

      expect(plugin.hasConsensusEnabled()).toBe(true);
    });
  });
});
