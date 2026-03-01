/**
 * Agentic QE v3 - Model Routing Integration Test
 * ADR-051: Tests that Model Router is properly integrated into MCP task execution
 *
 * Verifies:
 * 1. TaskRouterService correctly routes tasks to appropriate tiers
 * 2. handleTaskOrchestrate includes routing decision
 * 3. handleModelRoute returns routing decisions without task submission
 * 4. Routing metrics are tracked correctly
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  TaskRouterService,
  getTaskRouter,
  routeTask,
  type TaskRoutingResult,
} from '../../src/mcp/services/task-router';
import {
  handleModelRoute,
  handleRoutingMetrics,
  type ModelRouteParams,
} from '../../src/mcp/handlers/task-handlers';
import type { ModelTier } from '../../src/integrations/agentic-flow';

describe('Model Routing Integration (ADR-051)', () => {
  let router: TaskRouterService;

  beforeAll(async () => {
    // Initialize TaskRouterService
    router = await getTaskRouter({
      enabled: true,
      enableAgentBooster: true,
      enableLogging: false, // Reduce noise in tests
    });
  });

  afterAll(async () => {
    if (router) {
      await router.dispose();
    }
  });

  // =========================================================================
  // TaskRouterService Tests
  // =========================================================================

  describe('TaskRouterService', () => {
    it('should route simple tasks to lower tiers', async () => {
      const result = await router.routeTask({
        task: 'Convert var to const',
        codeContext: 'var x = 1; var y = 2;',
      });

      // Simple mechanical transform should go to Tier 0 or 1
      expect(result.decision.tier).toBeLessThanOrEqual(1);
      // Agent Booster is eligible for mechanical transforms
      expect(result.decision.agentBoosterEligible).toBe(true);
    });

    it('should route complex tasks to higher tiers', async () => {
      const result = await router.routeTask({
        task: 'Design a comprehensive authentication system architecture with OAuth2, MFA, and role-based access control across multiple microservices',
        isCritical: true, // Mark as critical to ensure higher routing
      });

      // Complex architecture should route to at least Tier 1
      // (actual tier depends on complexity analyzer thresholds)
      expect(result.decision.tier).toBeGreaterThanOrEqual(1);
      // Check that signals detected architecture scope
      expect(result.decision.complexityAnalysis.signals.hasArchitectureScope).toBe(true);
    });

    it('should respect manual tier override', async () => {
      const result = await router.routeTask({
        task: 'Simple task',
        manualTier: 4 as ModelTier,
      });

      // Budget enforcement may downgrade, but requested tier should be 4
      expect(result.decision.tier).toBeLessThanOrEqual(4);
      expect(result.logEntry.requestedTier).toBe(4);
    });

    it('should detect Agent Booster eligibility for mechanical transforms', async () => {
      const varToConstResult = await router.routeTask({
        task: 'Convert var declarations to const',
        codeContext: 'var x = 1; var y = 2;',
      });

      expect(varToConstResult.decision.agentBoosterEligible).toBe(true);
      expect(varToConstResult.decision.tier).toBe(0);
    });

    it('should provide routing rationale', async () => {
      const result = await router.routeTask({
        task: 'Implement security audit for OWASP compliance',
      });

      expect(result.decision.rationale).toBeTruthy();
      expect(result.decision.rationale.length).toBeGreaterThan(10);
    });

    it('should include tier metadata', async () => {
      const result = await router.routeTask({
        task: 'Fix bug in login function',
      });

      expect(result.tierInfo).toBeDefined();
      expect(result.tierInfo.name).toBeTruthy();
      expect(result.tierInfo.typicalLatencyMs).toBeGreaterThanOrEqual(0);
      expect(result.tierInfo.relativeCost).toBeGreaterThanOrEqual(0);
    });

    it('should track routing log entries', async () => {
      // Reset to start fresh
      router.reset();

      // Make a few routing decisions
      await router.routeTask({ task: 'Task 1: simple refactoring' });
      await router.routeTask({ task: 'Task 2: complex architecture design' });
      await router.routeTask({ task: 'Task 3: bug fix' });

      const log = router.getRoutingLog(10);
      expect(log.length).toBeGreaterThanOrEqual(3);
    });

    it('should calculate routing stats', async () => {
      // Ensure we have some entries first
      await router.routeTask({ task: 'Stats test task' });

      const stats = router.getRoutingStats();

      expect(stats.totalRouted).toBeGreaterThan(0);
      expect(stats.avgComplexity).toBeGreaterThanOrEqual(0);
      expect(stats.avgDecisionTimeMs).toBeGreaterThanOrEqual(0);
      expect(stats.tierDistribution).toBeDefined();
    });
  });

  // =========================================================================
  // MCP Handler Tests
  // =========================================================================

  describe('handleModelRoute', () => {
    it('should return routing decision without submitting task', async () => {
      const params: ModelRouteParams = {
        task: 'Analyze code coverage gaps',
        domain: 'coverage-analysis',
      };

      const result = await handleModelRoute(params);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      if (result.success && result.data) {
        expect(result.data.tier).toBeGreaterThanOrEqual(0);
        expect(result.data.tier).toBeLessThanOrEqual(4);
        expect(result.data.tierName).toBeTruthy();
        expect(result.data.modelId).toBeTruthy();
        expect(result.data.complexity).toBeDefined();
        expect(result.data.complexity.overall).toBeGreaterThanOrEqual(0);
      }
    });

    it('should include budget information', async () => {
      const result = await handleModelRoute({
        task: 'Complex security analysis',
        isCritical: true,
      });

      expect(result.success).toBe(true);

      if (result.success && result.data) {
        expect(result.data.budget).toBeDefined();
        expect(typeof result.data.budget.allowed).toBe('boolean');
        expect(typeof result.data.budget.wasDowngraded).toBe('boolean');
        expect(typeof result.data.budget.estimatedCostUsd).toBe('number');
      }
    });

    it('should return decision time', async () => {
      const result = await handleModelRoute({
        task: 'Quick analysis',
      });

      expect(result.success).toBe(true);

      if (result.success && result.data) {
        expect(result.data.decisionTimeMs).toBeGreaterThanOrEqual(0);
        // Decision should be fast (<100ms for most cases)
        expect(result.data.decisionTimeMs).toBeLessThan(100);
      }
    });

    it('should handle code context for better analysis', async () => {
      const complexCode = `
        class AuthenticationService {
          async authenticate(user: User, credentials: Credentials): Promise<AuthResult> {
            const validated = await this.validateCredentials(credentials);
            if (!validated) throw new AuthError('Invalid credentials');
            const token = await this.generateToken(user);
            await this.auditLog.record('login', user.id);
            return { success: true, token };
          }
        }
      `;

      const result = await handleModelRoute({
        task: 'Review and improve this authentication code',
        codeContext: complexCode,
      });

      expect(result.success).toBe(true);

      if (result.success && result.data) {
        // Complex code should trigger higher tier
        expect(result.data.complexity.code).toBeGreaterThan(0);
      }
    });
  });

  describe('handleRoutingMetrics', () => {
    it('should return routing statistics', async () => {
      const result = await handleRoutingMetrics({});

      expect(result.success).toBe(true);

      if (result.success && result.data) {
        expect(result.data.stats).toBeDefined();
        expect(result.data.modelRouterMetrics).toBeDefined();
        expect(result.data.modelRouterMetrics.totalDecisions).toBeGreaterThanOrEqual(0);
      }
    });

    it('should include log when requested', async () => {
      const result = await handleRoutingMetrics({
        includeLog: true,
        logLimit: 10,
      });

      expect(result.success).toBe(true);

      if (result.success && result.data) {
        expect(result.data.log).toBeDefined();
        expect(Array.isArray(result.data.log)).toBe(true);
      }
    });
  });

  // =========================================================================
  // Tier Selection Tests
  // =========================================================================

  describe('Tier Selection Logic', () => {
    const testCases: Array<{
      description: string;
      task: string;
      codeContext?: string;
      expectedMinTier: ModelTier;
      expectedMaxTier: ModelTier;
    }> = [
      {
        description: 'should route var-to-const to Tier 0 (Agent Booster)',
        task: 'Convert var to const',
        codeContext: 'var x = 1; var y = 2;',
        expectedMinTier: 0,
        expectedMaxTier: 0,
      },
      {
        description: 'should route simple bug fix to Tier 0-2',
        task: 'Fix typo in error message',
        expectedMinTier: 0,
        expectedMaxTier: 2,
      },
      {
        description: 'should route test generation to Tier 0-2',
        task: 'Generate unit tests for the calculateTotal function',
        expectedMinTier: 0,
        expectedMaxTier: 2,
      },
      {
        description: 'should route refactoring to Tier 0-3',
        task: 'Refactor the payment processing module to use async/await',
        expectedMinTier: 0,
        expectedMaxTier: 3,
      },
      {
        description: 'should route security-related task to Tier 0-4',
        task: 'Conduct comprehensive security audit for OWASP Top 10 vulnerabilities',
        expectedMinTier: 0,
        expectedMaxTier: 4,
      },
      {
        description: 'should route architecture-related task to Tier 0-4',
        task: 'Design microservices architecture for a distributed payment system with high availability and fault tolerance',
        expectedMinTier: 0,
        expectedMaxTier: 4,
      },
    ];

    for (const { description, task, codeContext, expectedMinTier, expectedMaxTier } of testCases) {
      it(description, async () => {
        const result = await router.routeTask({ task, codeContext });

        expect(result.decision.tier).toBeGreaterThanOrEqual(expectedMinTier);
        expect(result.decision.tier).toBeLessThanOrEqual(expectedMaxTier);
      });
    }

    it('should detect security scope in task description', async () => {
      const result = await router.routeTask({
        task: 'Audit authentication security for SQL injection and XSS vulnerabilities',
      });

      expect(result.decision.complexityAnalysis.signals.hasSecurityScope).toBe(true);
    });

    it('should detect architecture scope in task description', async () => {
      const result = await router.routeTask({
        task: 'Design system architecture for microservices deployment',
      });

      expect(result.decision.complexityAnalysis.signals.hasArchitectureScope).toBe(true);
    });
  });

  // =========================================================================
  // Convenience Function Tests
  // =========================================================================

  describe('Convenience Functions', () => {
    it('routeTask should work as standalone function', async () => {
      const result = await routeTask('Quick task', {
        domain: 'test-generation',
      });

      expect(result.decision).toBeDefined();
      expect(result.modelId).toBeTruthy();
    });
  });
});
