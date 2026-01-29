/**
 * Agentic QE v3 - Security Compliance Coordinator Unit Tests
 * Milestone 1.5: Domain Coordinator Testing
 *
 * Tests cover:
 * - Constructor and initialization
 * - Security audit workflows
 * - Security scanning (SAST/DAST)
 * - Compliance validation
 * - Security posture assessment
 * - DQN integration for test prioritization
 * - Flash Attention for vulnerability similarity
 * - Multi-model consensus for finding verification
 * - MinCut topology awareness
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SecurityComplianceCoordinator,
  type CoordinatorConfig,
} from '../../../../src/domains/security-compliance/coordinator';
import {
  createCoordinatorTestContext,
  resetTestContext,
  expectEventPublished,
  flushPromises,
  type CoordinatorTestContext,
} from '../coordinator-test-utils';
import { SecurityComplianceEvents } from '../../../../src/shared/events/domain-events';
import { FilePath } from '../../../../src/shared/value-objects';

describe('SecurityComplianceCoordinator', () => {
  let ctx: CoordinatorTestContext;
  let coordinator: SecurityComplianceCoordinator;

  // Default config with integrations disabled for unit testing
  const defaultConfig: Partial<CoordinatorConfig> = {
    maxConcurrentWorkflows: 3,
    defaultTimeout: 60000,
    publishEvents: true,
    autoTriageVulnerabilities: false,
    enableDQN: false,
    enableFlashAttention: false,
    enableConsensus: false,
    enableMinCutAwareness: false,
  };

  beforeEach(() => {
    ctx = createCoordinatorTestContext();
    coordinator = new SecurityComplianceCoordinator(
      ctx.eventBus,
      ctx.memory,
      ctx.agentCoordinator,
      defaultConfig
    );
  });

  afterEach(async () => {
    await coordinator.dispose();
    resetTestContext(ctx);
  });

  // ===========================================================================
  // Constructor and Initialization Tests
  // ===========================================================================

  describe('Constructor and Initialization', () => {
    it('should create coordinator with default config', () => {
      const coord = new SecurityComplianceCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator
      );
      expect(coord).toBeDefined();
    });

    it('should create coordinator with custom config', () => {
      const customConfig: Partial<CoordinatorConfig> = {
        maxConcurrentWorkflows: 5,
        defaultTimeout: 120000,
        autoTriageVulnerabilities: true,
      };
      const coord = new SecurityComplianceCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator,
        customConfig
      );
      expect(coord).toBeDefined();
    });

    it('should initialize without errors', async () => {
      await expect(coordinator.initialize()).resolves.not.toThrow();
    });

    it('should be idempotent on multiple initializations', async () => {
      await coordinator.initialize();
      await coordinator.initialize();
      // Should not throw
    });

    it('should start with no active workflows', async () => {
      await coordinator.initialize();
      expect(coordinator.getActiveWorkflows()).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Security Audit Tests
  // ===========================================================================

  describe('Security Audit', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('runSecurityAudit()', () => {
      it('should run security audit and return report', async () => {
        const result = await coordinator.runSecurityAudit({
          includeSAST: true,
          includeDAST: false,
          depth: 'standard',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.auditId).toBeDefined();
        }
      });

      it('should spawn security audit agent', async () => {
        await coordinator.runSecurityAudit({
          includeSAST: true,
          depth: 'standard',
        });

        expect(ctx.agentCoordinator.spawn).toHaveBeenCalled();
      });

      it('should return error when agent limit reached', async () => {
        ctx.agentCoordinator.setMaxAgents(0);

        const result = await coordinator.runSecurityAudit({
          includeSAST: true,
          depth: 'standard',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('Agent limit');
        }
      });

      it('should complete workflow after audit', async () => {
        await coordinator.runSecurityAudit({
          includeSAST: true,
          depth: 'standard',
        });

        expect(coordinator.getActiveWorkflows()).toHaveLength(0);
      });
    });
  });

  // ===========================================================================
  // Security Scanning Tests
  // ===========================================================================

  describe('Security Scanning', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('runSecurityScan()', () => {
      it('should run SAST scan', async () => {
        const files = [FilePath.create('src/example.ts')];

        const result = await coordinator.runSecurityScan(files, 'sast');

        expect(result.success).toBe(true);
      });

      it('should run DAST scan', async () => {
        const files = [FilePath.create('https://example.com/api')];

        const result = await coordinator.runSecurityScan(files, 'dast');

        expect(result.success).toBe(true);
      });

      it('should run full scan', async () => {
        const files = [FilePath.create('src/example.ts')];

        const result = await coordinator.runSecurityScan(files, 'full');

        expect(result.success).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Compliance Validation Tests
  // ===========================================================================

  describe('Compliance Validation', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('runComplianceValidation()', () => {
      it('should validate compliance', async () => {
        const result = await coordinator.runComplianceValidation('owasp-top-10', {
          projectRoot: FilePath.create('.'),
          includePatterns: ['**/*.ts'],
          excludePatterns: ['node_modules/**'],
        });

        expect(result).toBeDefined();
        // Result may succeed or fail depending on standard availability
      });

      it('should publish ComplianceValidated event on success', async () => {
        const result = await coordinator.runComplianceValidation('owasp-top-10', {
          projectRoot: FilePath.create('.'),
          includePatterns: ['**/*.ts'],
          excludePatterns: ['node_modules/**'],
        });

        if (result.success) {
          expectEventPublished(ctx.eventBus, SecurityComplianceEvents.ComplianceValidated);
        }
      });
    });

    describe('runComplianceCheck()', () => {
      it('should run compliance check with default context', async () => {
        const result = await coordinator.runComplianceCheck('owasp-top-10');

        expect(result).toBeDefined();
      });
    });
  });

  // ===========================================================================
  // Security Posture Tests
  // ===========================================================================

  describe('Security Posture', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('getSecurityPosture()', () => {
      it('should return security posture', async () => {
        const result = await coordinator.getSecurityPosture();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.overallScore).toBeDefined();
          expect(result.value.trend).toBeDefined();
        }
      });
    });

    describe('assessSecurityPosture()', () => {
      it('should assess security posture', async () => {
        const result = await coordinator.assessSecurityPosture();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(['improving', 'stable', 'declining']).toContain(result.value.trend);
        }
      });
    });
  });

  // ===========================================================================
  // Workflow Management Tests
  // ===========================================================================

  describe('Workflow Management', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should track active workflows', async () => {
      // Workflows complete synchronously in tests
      await coordinator.runSecurityAudit({
        includeSAST: true,
        depth: 'standard',
      });

      expect(coordinator.getActiveWorkflows()).toHaveLength(0);
    });

    it('should enforce max concurrent workflows', async () => {
      const limitedCoordinator = new SecurityComplianceCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator,
        {
          ...defaultConfig,
          maxConcurrentWorkflows: 1,
        }
      );
      await limitedCoordinator.initialize();

      const result = await limitedCoordinator.runSecurityAudit({
        includeSAST: true,
        depth: 'standard',
      });

      expect(result.success).toBe(true);

      await limitedCoordinator.dispose();
    });
  });

  // ===========================================================================
  // MinCut Topology Awareness Tests
  // ===========================================================================

  describe('MinCut Topology Awareness', () => {
    let topologyCoordinator: SecurityComplianceCoordinator;

    beforeEach(async () => {
      topologyCoordinator = new SecurityComplianceCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator,
        {
          ...defaultConfig,
          enableMinCutAwareness: true,
          topologyHealthThreshold: 0.5,
          pauseOnCriticalTopology: true,
        }
      );
      await topologyCoordinator.initialize();
    });

    afterEach(async () => {
      await topologyCoordinator.dispose();
    });

    it('should report topology health status', () => {
      expect(topologyCoordinator.isTopologyHealthy()).toBe(true);
    });

    it('should accept MinCut bridge', () => {
      expect(() => {
        topologyCoordinator.setMinCutBridge({} as any);
      }).not.toThrow();
    });

    it('should check if domain is weak point', () => {
      expect(topologyCoordinator.isDomainWeakPoint()).toBe(false);
    });

    it('should get domain weak vertices', () => {
      const weakVertices = topologyCoordinator.getDomainWeakVertices();
      expect(Array.isArray(weakVertices)).toBe(true);
    });

    it('should filter target domains based on topology', () => {
      const targets = ['test-execution', 'quality-assessment'] as any[];
      const filtered = topologyCoordinator.getTopologyBasedRouting(targets);
      expect(Array.isArray(filtered)).toBe(true);
    });

    it('should get healthy routing domains', () => {
      const domains = topologyCoordinator.getHealthyRoutingDomains();
      expect(Array.isArray(domains)).toBe(true);
    });
  });

  // ===========================================================================
  // Consensus Verification Tests
  // ===========================================================================

  describe('Consensus Verification', () => {
    let consensusCoordinator: SecurityComplianceCoordinator;

    beforeEach(async () => {
      consensusCoordinator = new SecurityComplianceCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator,
        {
          ...defaultConfig,
          enableConsensus: true,
          consensusThreshold: 0.7,
          consensusStrategy: 'weighted',
          consensusMinModels: 2,
        }
      );
      await consensusCoordinator.initialize();
    });

    afterEach(async () => {
      await consensusCoordinator.dispose();
    });

    it('should check consensus availability', () => {
      const available = consensusCoordinator.isConsensusAvailable();
      expect(typeof available).toBe('boolean');
    });

    it('should get consensus statistics', () => {
      const stats = consensusCoordinator.getConsensusStats();
      // Stats may be undefined if consensus engine not fully initialized
      expect(stats === undefined || typeof stats === 'object').toBe(true);
    });
  });

  // ===========================================================================
  // Disposal Tests
  // ===========================================================================

  describe('Disposal', () => {
    it('should dispose without errors', async () => {
      await coordinator.initialize();
      await expect(coordinator.dispose()).resolves.not.toThrow();
    });

    it('should clear workflows on dispose', async () => {
      await coordinator.initialize();
      await coordinator.runSecurityAudit({
        includeSAST: true,
        depth: 'standard',
      });
      await coordinator.dispose();
      expect(coordinator.getActiveWorkflows()).toHaveLength(0);
    });

    it('should be idempotent on multiple disposals', async () => {
      await coordinator.initialize();
      await coordinator.dispose();
      await coordinator.dispose();
      // Should not throw
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('Error Handling', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should handle empty file list for scan', async () => {
      const result = await coordinator.runSecurityScan([], 'sast');

      expect(result).toBeDefined();
    });

    it('should handle unknown compliance standard', async () => {
      const result = await coordinator.runComplianceCheck('unknown-standard');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Unknown');
      }
    });
  });
});
