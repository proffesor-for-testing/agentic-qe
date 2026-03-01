/**
 * Agentic QE v3 - Quality Assessment Plugin Unit Tests
 *
 * Tests for the quality assessment domain plugin covering:
 * - Lifecycle management (initialize/dispose)
 * - Task handlers (evaluate-gate, analyze-quality, deployment-advice, analyze-complexity)
 * - canHandleTask boundary conditions
 * - Cross-domain event handling
 * - Health tracking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  QualityAssessmentPlugin,
  createQualityAssessmentPlugin,
} from '../../../../src/domains/quality-assessment/plugin';
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

describe('QualityAssessmentPlugin', () => {
  let plugin: QualityAssessmentPlugin;
  let eventBus: MockEventBus;
  let memory: MockMemoryBackend;
  let agentCoordinator: MockAgentCoordinator;

  beforeEach(() => {
    eventBus = new MockEventBus();
    memory = new MockMemoryBackend();
    agentCoordinator = new MockAgentCoordinator();
    plugin = new QualityAssessmentPlugin(eventBus, memory, agentCoordinator);
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
      expect(plugin.name).toBe('quality-assessment');
    });

    it('should have correct version', () => {
      expect(plugin.version).toBe('1.0.0');
    });

    it('should have no dependencies', () => {
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
      const createdPlugin = createQualityAssessmentPlugin(eventBus, memory, agentCoordinator);
      expect(createdPlugin).toBeInstanceOf(QualityAssessmentPlugin);
      expect(createdPlugin.name).toBe('quality-assessment');
    });

    it('should accept optional configuration', () => {
      const createdPlugin = createQualityAssessmentPlugin(eventBus, memory, agentCoordinator, {
        coordinator: {},
        qualityGate: {},
      });
      expect(createdPlugin).toBeInstanceOf(QualityAssessmentPlugin);
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

      expect(api).toHaveProperty('evaluateGate');
      expect(api).toHaveProperty('analyzeQuality');
      expect(api).toHaveProperty('getDeploymentAdvice');
      expect(api).toHaveProperty('analyzeComplexity');
    });

    it('should return API with internal accessor methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('getCoordinator');
      expect(api).toHaveProperty('getQualityGate');
      expect(api).toHaveProperty('getQualityAnalyzer');
      expect(api).toHaveProperty('getDeploymentAdvisor');
    });
  });

  // ============================================================================
  // canHandleTask Tests
  // ============================================================================

  describe('canHandleTask', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle evaluate-gate task type', () => {
      expect(plugin.canHandleTask('evaluate-gate')).toBe(true);
    });

    it('should handle analyze-quality task type', () => {
      expect(plugin.canHandleTask('analyze-quality')).toBe(true);
    });

    it('should handle deployment-advice task type', () => {
      expect(plugin.canHandleTask('deployment-advice')).toBe(true);
    });

    it('should handle analyze-complexity task type', () => {
      expect(plugin.canHandleTask('analyze-complexity')).toBe(true);
    });

    it('should not handle unknown task types', () => {
      expect(plugin.canHandleTask('unknown-task')).toBe(false);
      expect(plugin.canHandleTask('')).toBe(false);
      expect(plugin.canHandleTask('execute-tests')).toBe(false);
    });

    it('should be case sensitive for task types', () => {
      expect(plugin.canHandleTask('Evaluate-Gate')).toBe(false);
      expect(plugin.canHandleTask('EVALUATE-GATE')).toBe(false);
    });
  });

  // ============================================================================
  // executeTask Tests
  // ============================================================================

  describe('executeTask', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should accept valid evaluate-gate task', async () => {
      const request = sampleTasks.qualityAssessment.evaluateGate;
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

    it('should return error for evaluate-gate with missing gateName', async () => {
      const request = createMockTaskRequest('evaluate-gate', {
        metrics: { coverage: 80 },
        thresholds: { coverage: { min: 70 } },
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing gateName, metrics, or thresholds');
    });

    it('should return error for evaluate-gate with missing metrics', async () => {
      const request = createMockTaskRequest('evaluate-gate', {
        gateName: 'test-gate',
        thresholds: { coverage: { min: 70 } },
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
    });

    it('should return error for analyze-quality with missing sourceFiles', async () => {
      const request = createMockTaskRequest('analyze-quality', {
        includeMetrics: ['coverage'],
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing sourceFiles');
    });

    it('should return error for analyze-quality with empty sourceFiles', async () => {
      const request = createMockTaskRequest('analyze-quality', {
        sourceFiles: [],
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
    });

    it('should return error for deployment-advice with missing releaseCandidate', async () => {
      const request = createMockTaskRequest('deployment-advice', {
        metrics: { coverage: 90 },
        riskTolerance: 'medium',
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing releaseCandidate or metrics');
    });

    it('should return error for analyze-complexity with missing sourceFiles', async () => {
      const request = createMockTaskRequest('analyze-complexity', {
        metrics: ['cyclomatic'],
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing sourceFiles');
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

      // Should store test results
      const stored = await memory.get(`quality-assessment:test-results:run_123`);
      expect(stored).toBeDefined();
    });

    it('should store quality concern for low passing rate', async () => {
      const event = createMockEvent(
        'test-execution.TestRunCompleted',
        'test-execution',
        {
          runId: 'run_456',
          passed: 70,
          failed: 30,
          skipped: 0,
          duration: 1000,
        }
      );

      await plugin.handleEvent(event);

      // Should store quality concern
      const stored = await memory.get(`quality-assessment:concerns:test-failures:run_456`);
      expect(stored).toBeDefined();
    });

    it('should handle coverage report events', async () => {
      const event = createMockEvent(
        'coverage-analysis.CoverageReportCreated',
        'coverage-analysis',
        {
          reportId: 'report_123',
          line: 85,
          branch: 80,
          function: 90,
          statement: 87,
        }
      );

      await plugin.handleEvent(event);

      const stored = await memory.get(`quality-assessment:coverage:report_123`);
      expect(stored).toBeDefined();
    });

    it('should handle defect prediction events for high probability', async () => {
      const event = createMockEvent(
        'defect-intelligence.DefectPredicted',
        'defect-intelligence',
        {
          predictionId: 'pred_123',
          file: 'src/risky.ts',
          probability: 0.85,
          factors: ['complexity', 'churn'],
        }
      );

      await plugin.handleEvent(event);

      // High probability defects should be stored
      const stored = await memory.get(`quality-assessment:defect-risks:pred_123`);
      expect(stored).toBeDefined();
    });

    it('should not store low probability defect predictions', async () => {
      const event = createMockEvent(
        'defect-intelligence.DefectPredicted',
        'defect-intelligence',
        {
          predictionId: 'pred_456',
          file: 'src/safe.ts',
          probability: 0.3,
          factors: [],
        }
      );

      await plugin.handleEvent(event);

      const stored = await memory.get(`quality-assessment:defect-risks:pred_456`);
      expect(stored).toBeUndefined();
    });

    it('should handle vulnerability detected events', async () => {
      const event = createMockEvent(
        'security-compliance.VulnerabilityDetected',
        'security-compliance',
        {
          vulnId: 'vuln_123',
          cve: 'CVE-2024-1234',
          severity: 'high',
          file: 'package.json',
        }
      );

      await plugin.handleEvent(event);

      const stored = await memory.get(`quality-assessment:vulnerabilities:vuln_123`);
      expect(stored).toBeDefined();
    });

    it('should update lastActivity on any event', async () => {
      const event = createMockEvent(
        'test-execution.TestRunCompleted',
        'test-execution',
        { runId: 'test', passed: 10, failed: 0, skipped: 0, duration: 100 }
      );

      await plugin.handleEvent(event);

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

    it('should start with idle status and zero agents', () => {
      const health = plugin.getHealth();
      expect(health.status).toBe('idle');
      expect(health.agents.total).toBe(0);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should track errors in health status', async () => {
      // Generate errors with invalid tasks
      for (let i = 0; i < 3; i++) {
        const request = createMockTaskRequest('evaluate-gate', {});
        const { callback, waitForResult } = createMockCallback();
        await plugin.executeTask(request, callback);
        await waitForResult();
      }

      const health = plugin.getHealth();
      expect(health.errors.length).toBeGreaterThan(0);
    });

    it('should limit stored errors to 10', async () => {
      for (let i = 0; i < 15; i++) {
        const request = createMockTaskRequest('evaluate-gate', {});
        const { callback, waitForResult } = createMockCallback();
        await plugin.executeTask(request, callback);
        await waitForResult();
      }

      const health = plugin.getHealth();
      expect(health.errors.length).toBeLessThanOrEqual(10);
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
        verifySeverities: ['critical', 'high'],
        autoApprovalThreshold: 0.95,
      });

      expect(plugin.hasConsensusEnabled()).toBe(true);
    });
  });
});
