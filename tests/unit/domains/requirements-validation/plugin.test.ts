/**
 * Agentic QE v3 - Requirements Validation Plugin Unit Tests
 *
 * Tests for the requirements validation domain plugin covering:
 * - Lifecycle management (initialize/dispose)
 * - Task handlers (validate, generate-scenarios, score-testability)
 * - BDD scenario generation
 * - Event handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RequirementsValidationPlugin,
  createRequirementsValidationPlugin,
} from '../../../../src/domains/requirements-validation/plugin';
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

describe('RequirementsValidationPlugin', () => {
  let plugin: RequirementsValidationPlugin;
  let eventBus: MockEventBus;
  let memory: MockMemoryBackend;
  let agentCoordinator: MockAgentCoordinator;

  beforeEach(() => {
    eventBus = new MockEventBus();
    memory = new MockMemoryBackend();
    agentCoordinator = new MockAgentCoordinator();
    plugin = new RequirementsValidationPlugin(eventBus, memory, agentCoordinator);
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
      expect(plugin.name).toBe('requirements-validation');
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
      const createdPlugin = createRequirementsValidationPlugin(eventBus, memory, agentCoordinator);
      expect(createdPlugin).toBeInstanceOf(RequirementsValidationPlugin);
      expect(createdPlugin.name).toBe('requirements-validation');
    });

    it('should accept optional configuration', () => {
      const createdPlugin = createRequirementsValidationPlugin(eventBus, memory, agentCoordinator, {
        validator: {},
        bddWriter: {},
        testabilityScorer: {},
      });
      expect(createdPlugin).toBeInstanceOf(RequirementsValidationPlugin);
    });
  });

  // ============================================================================
  // API Tests
  // ============================================================================

  describe('getAPI', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should return API with validation methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('validate');
      expect(api).toHaveProperty('validateAgainstCriteria');
      expect(api).toHaveProperty('detectAmbiguity');
      expect(api).toHaveProperty('analyzeDependencies');
    });

    it('should return API with testability scoring methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('scoreRequirement');
      expect(api).toHaveProperty('scoreRequirements');
      expect(api).toHaveProperty('suggestImprovements');
      expect(api).toHaveProperty('meetsThreshold');
    });

    it('should return API with BDD generation methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('generateScenarios');
      expect(api).toHaveProperty('generateScenariosWithExamples');
      expect(api).toHaveProperty('toGherkin');
      expect(api).toHaveProperty('parseGherkin');
    });

    it('should return API with coordinated workflow methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('analyzeRequirement');
      expect(api).toHaveProperty('generateTestArtifacts');
      expect(api).toHaveProperty('validateSprintRequirements');
    });

    it('should return API with internal accessor methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('getCoordinator');
      expect(api).toHaveProperty('getValidator');
      expect(api).toHaveProperty('getBDDWriter');
      expect(api).toHaveProperty('getTestabilityScorer');
      expect(api).toHaveProperty('getActiveWorkflows');
    });
  });

  // ============================================================================
  // canHandleTask Tests
  // ============================================================================

  describe('canHandleTask', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle validate task type', () => {
      expect(plugin.canHandleTask('validate')).toBe(true);
    });

    it('should handle generate-scenarios task type', () => {
      expect(plugin.canHandleTask('generate-scenarios')).toBe(true);
    });

    it('should handle score-testability task type', () => {
      expect(plugin.canHandleTask('score-testability')).toBe(true);
    });

    it('should handle detect-ambiguity task type', () => {
      expect(plugin.canHandleTask('detect-ambiguity')).toBe(true);
    });

    it('should handle analyze-dependencies task type', () => {
      expect(plugin.canHandleTask('analyze-dependencies')).toBe(true);
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

    it('should accept valid validate task', async () => {
      const request = sampleTasks.requirementsValidation.validate;
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

    it('should return error for validate with missing requirement', async () => {
      const request = createMockTaskRequest('validate', {});
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing requirement');
    });

    it('should return error for generate-scenarios with missing requirementId', async () => {
      const request = createMockTaskRequest('generate-scenarios', {});
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing requirementId');
    });

    it('should return error for score-testability with missing requirement', async () => {
      const request = createMockTaskRequest('score-testability', {});
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing requirement');
    });

    it('should return error for analyze-dependencies with missing requirements', async () => {
      const request = createMockTaskRequest('analyze-dependencies', {});
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing requirements');
    });
  });

  // ============================================================================
  // Event Handling Tests
  // ============================================================================

  describe('event handling', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle test generated events for traceability', async () => {
      const event = createMockEvent(
        'test-generation.TestGenerated',
        'test-generation',
        {
          testId: 'test_123',
          sourceFile: 'src/feature.ts',
        }
      );

      await plugin.handleEvent(event);

      // Should store test link for traceability
      const stored = await memory.get('requirements-validation:test-link:test_123');
      expect(stored).toBeDefined();
    });

    it('should handle impact analysis events', async () => {
      const event = createMockEvent(
        'code-intelligence.ImpactAnalysisCompleted',
        'code-intelligence',
        {
          analysisId: 'analysis_123',
          changedFiles: ['src/feature.ts'],
          impactedTests: ['test/feature.test.ts'],
        }
      );

      await plugin.handleEvent(event);

      const stored = await memory.get('requirements-validation:impact:analysis_123');
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

    it('should track successful operations', async () => {
      const request = sampleTasks.requirementsValidation.validate;
      const { callback, waitForResult } = createMockCallback();

      await plugin.executeTask(request, callback);
      await waitForResult();

      const health = plugin.getHealth();
      expect(health.lastActivity).toBeInstanceOf(Date);
    });

    it('should track failed operations', async () => {
      const request = createMockTaskRequest('validate', {});
      const { callback, waitForResult } = createMockCallback();

      await plugin.executeTask(request, callback);
      await waitForResult();

      const health = plugin.getHealth();
      expect(health.errors.length).toBeGreaterThan(0);
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
