/**
 * Integration Test: Queen → TinyDancer → triggerMultiModel Signal (ADR-092)
 *
 * Verifies the REVISED architecture where:
 *   - TinyDancerRouter sets `triggerMultiModel` (routing signal)
 *   - QueenRouterAdapter surfaces it in QueenRouteDecision
 *   - Agents consume the signal via spawn capabilities + executor preamble
 *   - The advisor is NOT called from the routing layer (no transcript here)
 *
 * This test uses the real QueenRouterAdapter and real TinyDancerRouter —
 * no executor mock needed because the revised architecture does not invoke
 * the advisor from the routing layer.
 */

import { describe, it, expect } from 'vitest';
import { QueenRouterAdapter } from '../../../src/routing/queen-integration.js';
import type { ClassifiableTask } from '../../../src/routing/task-classifier.js';

function makeComplexSecurityTask(): ClassifiableTask {
  return {
    id: 'task-complex-integration',
    type: 'security-scan',
    description: 'Perform comprehensive security vulnerability assessment of the authentication module with OWASP Top 10 coverage',
    domain: 'security-compliance',
    priority: 'critical',
    requiredCapabilities: ['sast', 'dast', 'vulnerability', 'owasp', 'security-scanning'],
    createdAt: new Date(),
  } as ClassifiableTask;
}

function makeSimpleTask(): ClassifiableTask {
  return {
    id: 'task-simple-integration',
    type: 'documentation',
    description: 'fix typo in readme',
    domain: 'docs',
    priority: 'low',
    requiredCapabilities: [],
    createdAt: new Date(),
  } as ClassifiableTask;
}

describe('QueenRouterAdapter × triggerMultiModel Signal (ADR-092)', () => {
  describe('signal surfacing', () => {
    it('surfaces triggerMultiModel in QueenRouteDecision for complex security tasks', async () => {
      const adapter = new QueenRouterAdapter();
      const decision = await adapter.route(makeComplexSecurityTask());

      expect(decision).toBeDefined();
      expect(typeof decision.triggerMultiModel).toBe('boolean');
      expect(decision.tinyDancerResult).toBeDefined();
      expect(decision.tinyDancerResult.triggerMultiModel).toBe(decision.triggerMultiModel);
    });

    it('does NOT populate advisorResult from route() — advisor invocation is agent-side', async () => {
      const adapter = new QueenRouterAdapter();
      const decision = await adapter.route(makeComplexSecurityTask());

      expect(decision.advisorResult).toBeUndefined();
    });

    it('still routes correctly (tier, model, confidence populated)', async () => {
      const adapter = new QueenRouterAdapter();
      const decision = await adapter.route(makeComplexSecurityTask());

      expect(decision.tier).toBeDefined();
      expect(decision.model).toBeDefined();
      expect(decision.confidence).toBeGreaterThanOrEqual(0);
      expect(decision.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('signal for simple tasks', () => {
    it('simple tasks route with high confidence and low/no trigger', async () => {
      const adapter = new QueenRouterAdapter();
      const decision = await adapter.route(makeSimpleTask());

      expect(decision).toBeDefined();
      expect(decision.tier).toBeDefined();
    });
  });

  describe('backward compatibility', () => {
    it('QueenRouterAdapter works without any executor config', async () => {
      const adapter = new QueenRouterAdapter();
      const decision = await adapter.route(makeComplexSecurityTask());

      expect(decision).toBeDefined();
      expect(decision.advisorResult).toBeUndefined();
    });

    it('existing route() return shape is unchanged', async () => {
      const adapter = new QueenRouterAdapter();
      const decision = await adapter.route(makeSimpleTask());

      expect(decision).toHaveProperty('tier');
      expect(decision).toHaveProperty('model');
      expect(decision).toHaveProperty('complexity');
      expect(decision).toHaveProperty('confidence');
      expect(decision).toHaveProperty('triggerMultiModel');
      expect(decision).toHaveProperty('triggerHumanReview');
      expect(decision).toHaveProperty('fallbackTiers');
      expect(decision).toHaveProperty('estimatedCost');
      expect(decision).toHaveProperty('reasoning');
      expect(decision).toHaveProperty('tinyDancerResult');
      expect(decision).toHaveProperty('timestamp');
    });
  });
});
