/**
 * Agentic QE v3 - Visual Accessibility Plugin Unit Tests
 *
 * Tests for the visual accessibility domain plugin covering:
 * - Lifecycle management (initialize/dispose)
 * - Task handlers (run-visual-tests, run-accessibility-audit, capture-screenshot)
 * - WCAG compliance validation
 * - Event handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  VisualAccessibilityPlugin,
  createVisualAccessibilityPlugin,
} from '../../../../src/domains/visual-accessibility/plugin';
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

describe('VisualAccessibilityPlugin', () => {
  let plugin: VisualAccessibilityPlugin;
  let eventBus: MockEventBus;
  let memory: MockMemoryBackend;
  let agentCoordinator: MockAgentCoordinator;

  beforeEach(() => {
    eventBus = new MockEventBus();
    memory = new MockMemoryBackend();
    agentCoordinator = new MockAgentCoordinator();
    plugin = new VisualAccessibilityPlugin(eventBus, memory, agentCoordinator);
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
      expect(plugin.name).toBe('visual-accessibility');
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

    it('should cleanup all services on disposal', async () => {
      await plugin.initialize();
      await plugin.dispose();

      const api = plugin.getAPI<{ getCoordinator: () => unknown }>();
      expect(api.getCoordinator()).toBeNull();
    });
  });

  // ============================================================================
  // Factory Function Tests
  // ============================================================================

  describe('factory function', () => {
    it('should create plugin via factory function', () => {
      const createdPlugin = createVisualAccessibilityPlugin(eventBus, memory, agentCoordinator);
      expect(createdPlugin).toBeInstanceOf(VisualAccessibilityPlugin);
      expect(createdPlugin.name).toBe('visual-accessibility');
    });

    it('should accept optional configuration', () => {
      const createdPlugin = createVisualAccessibilityPlugin(eventBus, memory, agentCoordinator, {
        visualTester: {},
        accessibilityTester: {},
        responsiveTester: {},
      });
      expect(createdPlugin).toBeInstanceOf(VisualAccessibilityPlugin);
    });
  });

  // ============================================================================
  // API Tests
  // ============================================================================

  describe('getAPI', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should return API with coordinator methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('runVisualTests');
      expect(api).toHaveProperty('runAccessibilityAudit');
      expect(api).toHaveProperty('approveVisualChanges');
      expect(api).toHaveProperty('generateRemediationPlan');
      expect(api).toHaveProperty('getVisualTestingStatus');
    });

    it('should return API with visual testing methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('captureScreenshot');
      expect(api).toHaveProperty('captureElement');
    });

    it('should return API with accessibility testing methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('auditAccessibility');
      expect(api).toHaveProperty('checkContrast');
      expect(api).toHaveProperty('validateWCAGLevel');
      expect(api).toHaveProperty('checkKeyboardNavigation');
    });

    it('should return API with responsive testing methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('testResponsiveness');
      expect(api).toHaveProperty('analyzeBreakpoints');
    });

    it('should return API with workflow integration method', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('registerWorkflowActions');
    });

    it('should return API with internal accessor methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('getCoordinator');
      expect(api).toHaveProperty('getVisualTester');
      expect(api).toHaveProperty('getAccessibilityTester');
      expect(api).toHaveProperty('getResponsiveTester');
    });
  });

  // ============================================================================
  // canHandleTask Tests
  // ============================================================================

  describe('canHandleTask', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle run-visual-tests task type', () => {
      expect(plugin.canHandleTask('run-visual-tests')).toBe(true);
    });

    it('should handle run-accessibility-audit task type', () => {
      expect(plugin.canHandleTask('run-accessibility-audit')).toBe(true);
    });

    it('should handle capture-screenshot task type', () => {
      expect(plugin.canHandleTask('capture-screenshot')).toBe(true);
    });

    it('should handle test-responsiveness task type', () => {
      expect(plugin.canHandleTask('test-responsiveness')).toBe(true);
    });

    it('should handle validate-wcag task type', () => {
      expect(plugin.canHandleTask('validate-wcag')).toBe(true);
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

    it('should accept valid run-visual-tests task', async () => {
      const request = sampleTasks.visualAccessibility.runVisualTests;
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

    it('should return error for run-visual-tests with missing urls', async () => {
      const request = createMockTaskRequest('run-visual-tests', {
        viewports: [{ width: 1920, height: 1080 }],
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing urls');
    });

    it('should return error for run-accessibility-audit with missing urls', async () => {
      const request = createMockTaskRequest('run-accessibility-audit', {
        level: 'AA',
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing urls');
    });

    it('should return error for capture-screenshot with missing url', async () => {
      const request = createMockTaskRequest('capture-screenshot', {});
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing url');
    });

    it('should return error for test-responsiveness with missing url', async () => {
      const request = createMockTaskRequest('test-responsiveness', {});
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing url');
    });

    it('should return error for validate-wcag with missing url', async () => {
      const request = createMockTaskRequest('validate-wcag', {
        level: 'AA',
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing url');
    });
  });

  // ============================================================================
  // Event Handling Tests
  // ============================================================================

  describe('event handling', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle deployment completed events', async () => {
      const event = createMockEvent(
        'ci-cd.DeploymentCompleted',
        'ci-cd',
        {
          environment: 'staging',
          urls: ['http://staging.example.com'],
        }
      );

      await plugin.handleEvent(event);

      // Should store deployment for potential testing
      const keys = await memory.search('visual-accessibility:deployment:*');
      expect(keys.length).toBeGreaterThan(0);
    });

    it('should handle file changed events for style files', async () => {
      const event = createMockEvent(
        'code-intelligence.FileChanged',
        'code-intelligence',
        {
          file: 'src/styles/main.css',
          changeType: 'modified',
        }
      );

      await plugin.handleEvent(event);

      // Should store style change for visual testing
      const keys = await memory.search('visual-accessibility:style-change:*');
      expect(keys.length).toBeGreaterThan(0);
    });

    it('should not store non-style file changes', async () => {
      const event = createMockEvent(
        'code-intelligence.FileChanged',
        'code-intelligence',
        {
          file: 'src/utils/helpers.ts',
          changeType: 'modified',
        }
      );

      await plugin.handleEvent(event);

      // Should not store non-style changes
      const keys = await memory.search('visual-accessibility:style-change:*');
      expect(keys.length).toBe(0);
    });

    it('should handle quality gate events with accessibility checks', async () => {
      const event = createMockEvent(
        'quality-assessment.QualityGateTriggered',
        'quality-assessment',
        {
          gateId: 'gate_123',
          checks: ['accessibility', 'coverage'],
        }
      );

      await plugin.handleEvent(event);

      const stored = await memory.get('visual-accessibility:quality-gate:gate_123');
      expect(stored).toBeDefined();
    });

    it('should not store quality gate events without accessibility checks', async () => {
      const event = createMockEvent(
        'quality-assessment.QualityGateTriggered',
        'quality-assessment',
        {
          gateId: 'gate_456',
          checks: ['coverage', 'tests'],
        }
      );

      await plugin.handleEvent(event);

      const stored = await memory.get('visual-accessibility:quality-gate:gate_456');
      expect(stored).toBeUndefined();
    });
  });

  // ============================================================================
  // Workflow Action Registration Tests (Issue #206)
  // ============================================================================

  describe('workflow action registration', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should throw when registering before initialization', async () => {
      await plugin.dispose();
      const api = plugin.getAPI<{ registerWorkflowActions: (orchestrator: unknown) => void }>();

      expect(() => api.registerWorkflowActions({})).toThrow('must be initialized');
    });

    it('should extract URLs from various input formats', async () => {
      const api = plugin.getAPI<{ extractUrls?: (input: Record<string, unknown>) => string[] }>();

      // Note: extractUrls is private, so we test through executeTask behavior
      // Single url
      const request1 = createMockTaskRequest('run-visual-tests', {
        url: 'http://example.com',
        viewports: [{ width: 1920, height: 1080 }],
      });
      const { callback: cb1 } = createMockCallback();
      const result1 = await plugin.executeTask(request1, cb1);
      expectSuccess(result1);

      // Multiple urls
      const request2 = createMockTaskRequest('run-visual-tests', {
        urls: ['http://example.com', 'http://example2.com'],
        viewports: [{ width: 1920, height: 1080 }],
      });
      const { callback: cb2 } = createMockCallback();
      const result2 = await plugin.executeTask(request2, cb2);
      expectSuccess(result2);

      // Target alias
      const request3 = createMockTaskRequest('run-visual-tests', {
        target: 'http://example.com',
        viewports: [{ width: 1920, height: 1080 }],
      });
      const { callback: cb3 } = createMockCallback();
      const result3 = await plugin.executeTask(request3, cb3);
      expectSuccess(result3);
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

    it('should track successful visual tests', async () => {
      const request = sampleTasks.visualAccessibility.runVisualTests;
      const { callback, waitForResult } = createMockCallback();

      await plugin.executeTask(request, callback);
      await waitForResult();

      const health = plugin.getHealth();
      expect(health.lastActivity).toBeInstanceOf(Date);
    });

    it('should track failed operations', async () => {
      const request = createMockTaskRequest('run-visual-tests', {});
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
