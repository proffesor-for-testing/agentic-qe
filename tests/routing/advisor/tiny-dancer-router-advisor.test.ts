/**
 * TinyDancerRouter × Advisor Wiring Tests (ADR-092 Phase 0)
 *
 * Verifies two things:
 *  1. Backward compatibility — TinyDancerRouter with no executor behaves
 *     identically to its pre-ADR-092 state (the `triggerMultiModel` flag
 *     is set but nothing happens beyond the flag).
 *  2. The new `routeWithAdvisor()` path actually calls the executor when
 *     `triggerMultiModel === true` and returns an AdvisorResult.
 */

import { describe, it, expect, vi } from 'vitest';
import { TinyDancerRouter } from '../../../src/routing/tiny-dancer-router.js';
import type { IMultiModelExecutor, AdvisorResult } from '../../../src/routing/advisor/types.js';
import type { ClassifiableTask } from '../../../src/routing/task-classifier.js';

/**
 * A task crafted to land in the "complex" bucket with confidence near the
 * boundary so `triggerMultiModel` fires. The classifier cares about domain,
 * capabilities, and description keywords.
 */
function makeAmbiguousComplexTask(): ClassifiableTask {
  return {
    id: 'task-complex-1',
    type: 'vulnerability-assessment',
    description: 'Perform comprehensive security vulnerability assessment of the distributed authentication and authorization module with OWASP Top 10 coverage including SQL injection, XSS, CSRF, and privilege escalation analysis across microservices',
    domain: 'security-compliance',
    priority: 'critical',
    requiredCapabilities: ['sast', 'dast', 'vulnerability', 'owasp', 'security-scanning'],
    createdAt: new Date(),
  } as ClassifiableTask;
}

/**
 * A trivially simple task that should route with high confidence and NOT
 * trigger multi-model.
 */
function makeSimpleTask(): ClassifiableTask {
  return {
    id: 'task-simple-1',
    type: 'documentation',
    description: 'fix typo',
    domain: 'docs',
    priority: 'low',
    requiredCapabilities: [],
    createdAt: new Date(),
  } as ClassifiableTask;
}

describe('TinyDancerRouter × Advisor wiring (ADR-092)', () => {
  describe('backward compatibility', () => {
    it('router without executor returns no advisor in routeWithAdvisor()', async () => {
      const router = new TinyDancerRouter();
      expect(router.hasExecutor()).toBe(false);

      const task = makeAmbiguousComplexTask();
      const { route, advisor } = await router.routeWithAdvisor(task);

      expect(route).toBeDefined();
      expect(advisor).toBeUndefined();
      expect(router.getStats().advisorConsultations).toBe(0);
    });

    it('existing route() API is unchanged — no executor field touched', async () => {
      const router = new TinyDancerRouter();
      const task = makeAmbiguousComplexTask();

      const result = await router.route(task);

      // The original fields all still work
      expect(result.model).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(typeof result.triggerMultiModel).toBe('boolean');
      expect(typeof result.triggerHumanReview).toBe('boolean');
    });
  });

  describe('executor wiring', () => {
    it('calls the executor when triggerMultiModel is true', async () => {
      const mockAdvice: AdvisorResult = {
        advice: '1. Read the code. 2. Write a test.',
        model: 'anthropic/claude-opus-4.7',
        provider: 'openrouter',
        tokensIn: 500,
        tokensOut: 20,
        latencyMs: 1500,
        costUsd: 0.002,
        adviceHash: 'a'.repeat(64),
        triggerReason: 'test',
        cacheHit: false,
      };

      const executor: IMultiModelExecutor = {
        consult: vi.fn(async () => mockAdvice),
      };

      // Both thresholds at 0.99 guarantees any non-simple task triggers triggerMultiModel
      const router = new TinyDancerRouter({
        executor,
        confidenceThreshold: 0.99,
        securityConfidenceThreshold: 0.99,
      });
      expect(router.hasExecutor()).toBe(true);

      const task = makeAmbiguousComplexTask();
      const { route, advisor } = await router.routeWithAdvisor(task, {
        messages: [{ role: 'user', content: 'Generate tests' }],
      });

      // M3 fix: unconditional assertion that the expected branch was taken.
      // The complex security task SHOULD trigger multi-model. If it doesn't,
      // the test fails explicitly instead of passing vacuously.
      expect(route.triggerMultiModel).toBe(true);
      expect(executor.consult).toHaveBeenCalledTimes(1);
      expect(advisor).toEqual(mockAdvice);
      expect(router.getStats().advisorConsultations).toBe(1);
    });

    it('does not call the executor for simple high-confidence tasks', async () => {
      const executor: IMultiModelExecutor = {
        consult: vi.fn(),
      };

      const router = new TinyDancerRouter({ executor });
      const task = makeSimpleTask();

      const { route, advisor } = await router.routeWithAdvisor(task, {
        messages: [{ role: 'user', content: 'fix typo' }],
      });

      // M3 fix: simple task SHOULD NOT trigger multi-model
      expect(route.triggerMultiModel).toBe(false);
      expect(executor.consult).toHaveBeenCalledTimes(0);
      expect(advisor).toBeUndefined();
    });

    it('does not call the executor when transcript is omitted even if triggerMultiModel fires', async () => {
      const executor: IMultiModelExecutor = {
        consult: vi.fn(),
      };

      const router = new TinyDancerRouter({ executor });
      const task = makeAmbiguousComplexTask();

      // No transcript passed — advisor consultation is skipped
      const { advisor } = await router.routeWithAdvisor(task);

      expect(executor.consult).toHaveBeenCalledTimes(0);
      expect(advisor).toBeUndefined();
    });

    it('tracks advisorConsultations separately from multiModelTriggers', async () => {
      const mockAdvice: AdvisorResult = {
        advice: 'test',
        model: 'test',
        provider: 'openrouter',
        tokensIn: 1,
        tokensOut: 1,
        latencyMs: 1,
        costUsd: 0,
        adviceHash: 'a'.repeat(64),
        triggerReason: 'test',
        cacheHit: false,
      };

      const executor: IMultiModelExecutor = {
        consult: vi.fn(async () => mockAdvice),
      };

      const router = new TinyDancerRouter({ executor });

      // Call without transcript several times — multiModelTriggers increments
      // (via route()) but advisorConsultations should stay 0.
      for (let i = 0; i < 3; i++) {
        await router.routeWithAdvisor(makeAmbiguousComplexTask());
      }

      const stats = router.getStats();
      expect(stats.advisorConsultations).toBe(0);
      // multiModelTriggers may or may not be > 0 depending on classifier output,
      // but advisorConsultations must be 0 when transcript is omitted.
    });
  });
});
