/**
 * Agentic QE v3 - Security Compliance Plugin Unit Tests
 *
 * Tests for the security compliance domain plugin covering:
 * - Lifecycle management (initialize/dispose)
 * - Task handlers (security-audit, compliance-check, sast-scan, dast-scan)
 * - Vulnerability management
 * - Event handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SecurityCompliancePlugin,
  createSecurityCompliancePlugin,
} from '../../../../src/domains/security-compliance/plugin';
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

describe('SecurityCompliancePlugin', () => {
  let plugin: SecurityCompliancePlugin;
  let eventBus: MockEventBus;
  let memory: MockMemoryBackend;
  let agentCoordinator: MockAgentCoordinator;

  beforeEach(() => {
    eventBus = new MockEventBus();
    memory = new MockMemoryBackend();
    agentCoordinator = new MockAgentCoordinator();
    plugin = new SecurityCompliancePlugin(eventBus, memory, agentCoordinator);
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
      expect(plugin.name).toBe('security-compliance');
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
      const createdPlugin = createSecurityCompliancePlugin(eventBus, memory, agentCoordinator);
      expect(createdPlugin).toBeInstanceOf(SecurityCompliancePlugin);
      expect(createdPlugin.name).toBe('security-compliance');
    });

    it('should accept optional configuration', () => {
      const createdPlugin = createSecurityCompliancePlugin(eventBus, memory, agentCoordinator, {
        securityScanner: {},
        complianceValidator: {},
      });
      expect(createdPlugin).toBeInstanceOf(SecurityCompliancePlugin);
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

      expect(api).toHaveProperty('runSecurityAudit');
      expect(api).toHaveProperty('getSecurityPosture');
      expect(api).toHaveProperty('runSASTScan');
      expect(api).toHaveProperty('runDASTScan');
      expect(api).toHaveProperty('triageVulnerabilities');
      expect(api).toHaveProperty('runComplianceCheck');
      expect(api).toHaveProperty('getAvailableStandards');
    });

    it('should return API with internal accessor methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('getCoordinator');
      expect(api).toHaveProperty('getSecurityScanner');
      expect(api).toHaveProperty('getSecurityAuditor');
      expect(api).toHaveProperty('getComplianceValidator');
    });
  });

  // ============================================================================
  // canHandleTask Tests
  // ============================================================================

  describe('canHandleTask', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle security-audit task type', () => {
      expect(plugin.canHandleTask('security-audit')).toBe(true);
    });

    it('should handle compliance-check task type', () => {
      expect(plugin.canHandleTask('compliance-check')).toBe(true);
    });

    it('should handle sast-scan task type', () => {
      expect(plugin.canHandleTask('sast-scan')).toBe(true);
    });

    it('should handle dast-scan task type', () => {
      expect(plugin.canHandleTask('dast-scan')).toBe(true);
    });

    it('should handle triage-vulnerabilities task type', () => {
      expect(plugin.canHandleTask('triage-vulnerabilities')).toBe(true);
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

    it('should accept valid security-audit task', async () => {
      const request = sampleTasks.securityCompliance.runSecurityAudit;
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

    it('should return error for security-audit with missing target', async () => {
      const request = createMockTaskRequest('security-audit', {
        includesDependencies: true,
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing target');
    });

    it('should return error for compliance-check with missing standardId', async () => {
      const request = createMockTaskRequest('compliance-check', {});
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing standardId');
    });

    it('should return error for sast-scan with missing files', async () => {
      const request = createMockTaskRequest('sast-scan', {});
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing files');
    });

    it('should return error for dast-scan with missing targetUrl', async () => {
      const request = createMockTaskRequest('dast-scan', {});
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing targetUrl');
    });

    it('should return error for triage-vulnerabilities with missing vulnerabilities', async () => {
      const request = createMockTaskRequest('triage-vulnerabilities', {});
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing vulnerabilities');
    });
  });

  // ============================================================================
  // Event Handling Tests
  // ============================================================================

  describe('event handling', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle knowledge graph updated events', async () => {
      const event = createMockEvent(
        'code-intelligence.KnowledgeGraphUpdated',
        'code-intelligence',
        {
          filesIndexed: 50,
        }
      );

      await plugin.handleEvent(event);

      // Should store update for potential security review
      const keys = await memory.search('security:code-update:*');
      expect(keys.length).toBeGreaterThan(0);
    });

    it('should handle quality gate events with security checks', async () => {
      const event = createMockEvent(
        'quality-assessment.QualityGateEvaluated',
        'quality-assessment',
        {
          gateId: 'gate_123',
          passed: true,
          checks: [
            { name: 'security-vulnerabilities', passed: true },
            { name: 'coverage', passed: true },
          ],
        }
      );

      await plugin.handleEvent(event);

      const stored = await memory.get('security:gate-results:gate_123');
      expect(stored).toBeDefined();
    });

    it('should not store non-security gate results', async () => {
      const event = createMockEvent(
        'quality-assessment.QualityGateEvaluated',
        'quality-assessment',
        {
          gateId: 'gate_456',
          passed: true,
          checks: [{ name: 'coverage', passed: true }],
        }
      );

      await plugin.handleEvent(event);

      const stored = await memory.get('security:gate-results:gate_456');
      expect(stored).toBeUndefined();
    });

    it('should handle test run completed events', async () => {
      const event = createMockEvent(
        'test-execution.TestRunCompleted',
        'test-execution',
        {
          runId: 'run_123',
          passed: 100,
          failed: 0,
        }
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

    it('should start with idle status', () => {
      const health = plugin.getHealth();
      expect(health.status).toBe('idle');
    });

    it('should track failed operations', async () => {
      const request = createMockTaskRequest('security-audit', {});
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
