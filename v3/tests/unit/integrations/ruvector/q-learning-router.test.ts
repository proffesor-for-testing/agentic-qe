/**
 * Agentic QE v3 - Q-Learning Router Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createQLearningRouter,
  RuVectorQLearningRouter,
  FallbackQLearningRouter,
} from '../../../../src/integrations/ruvector';
import type {
  TestTask,
  RuVectorConfig,
  QLearningState,
  QLearningAction,
} from '../../../../src/integrations/ruvector';

// Test fixtures
function createTestTask(overrides: Partial<TestTask> = {}): TestTask {
  return {
    id: `task-${Date.now()}`,
    name: 'Test Task',
    type: 'unit',
    complexity: 0.5,
    priority: 'p2',
    ...overrides,
  };
}

function createConfig(overrides: Partial<RuVectorConfig> = {}): RuVectorConfig {
  return {
    enabled: true,
    endpoint: 'http://localhost:8080',
    fallbackEnabled: true,
    cacheEnabled: false,
    ...overrides,
  };
}

describe('Q-Learning Router', () => {
  describe('Factory Function', () => {
    it('should create RuVectorQLearningRouter when enabled', () => {
      const router = createQLearningRouter(createConfig({ enabled: true }));
      expect(router).toBeInstanceOf(RuVectorQLearningRouter);
    });

    it('should create FallbackQLearningRouter when disabled', () => {
      const router = createQLearningRouter(createConfig({ enabled: false }));
      expect(router).toBeInstanceOf(FallbackQLearningRouter);
    });
  });

  describe('RuVectorQLearningRouter', () => {
    let router: RuVectorQLearningRouter;

    beforeEach(() => {
      router = new RuVectorQLearningRouter(createConfig());
    });

    describe('routeTask', () => {
      it('should route a unit test task', async () => {
        const task = createTestTask({ type: 'unit' });
        const result = await router.routeTask(task);

        expect(result).toHaveProperty('agentType');
        expect(result).toHaveProperty('domain');
        expect(result).toHaveProperty('confidence');
        expect(result).toHaveProperty('reasoning');
        expect(result).toHaveProperty('alternatives');
        expect(result.usedFallback).toBe(false);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      });

      it('should route an integration test task', async () => {
        const task = createTestTask({ type: 'integration' });
        const result = await router.routeTask(task);

        expect(result.domain).toBeDefined();
        expect(result.alternatives.length).toBeGreaterThanOrEqual(0);
      });

      it('should route a security test task to security domain', async () => {
        const task = createTestTask({ type: 'security', priority: 'p0' });
        const result = await router.routeTask(task);

        expect(result.agentType).toBeDefined();
        expect(result.reasoning).toContain('security');
      });

      it('should provide alternatives for routing', async () => {
        const task = createTestTask({ type: 'performance', complexity: 0.8 });
        const result = await router.routeTask(task);

        expect(Array.isArray(result.alternatives)).toBe(true);
        expect(result.alternatives.length).toBeLessThanOrEqual(3);

        for (const alt of result.alternatives) {
          expect(alt).toHaveProperty('agentType');
          expect(alt).toHaveProperty('domain');
          expect(alt).toHaveProperty('confidence');
        }
      });

      it('should include Q-values for debugging', async () => {
        const task = createTestTask();
        const result = await router.routeTask(task);

        expect(result.qValues).toBeDefined();
        expect(typeof result.qValues).toBe('object');
      });
    });

    describe('routeTasks', () => {
      it('should route multiple tasks', async () => {
        const tasks = [
          createTestTask({ id: '1', type: 'unit' }),
          createTestTask({ id: '2', type: 'integration' }),
          createTestTask({ id: '3', type: 'e2e' }),
        ];

        const results = await router.routeTasks(tasks);

        expect(results).toHaveLength(3);
        results.forEach((result) => {
          expect(result).toHaveProperty('agentType');
          expect(result).toHaveProperty('domain');
        });
      });
    });

    describe('provideFeedback', () => {
      it('should accept feedback for learning', async () => {
        const task = createTestTask({ id: 'feedback-task' });
        await router.routeTask(task);

        await expect(
          router.provideFeedback('feedback-task', {
            success: true,
            durationMs: 1000,
            quality: 0.9,
          })
        ).resolves.not.toThrow();
      });

      it('should handle feedback for unknown tasks gracefully', async () => {
        await expect(
          router.provideFeedback('unknown-task', {
            success: true,
            durationMs: 500,
            quality: 0.8,
          })
        ).resolves.not.toThrow();
      });
    });

    describe('getQValue', () => {
      it('should return Q-value for state-action pair', () => {
        const state: QLearningState = {
          taskType: 'unit',
          complexity: 0.5,
          priority: 'p2',
          contextHash: 'test-hash',
        };
        const action: QLearningAction = {
          agentType: 'tester',
          domain: 'test-execution',
        };

        const qValue = router.getQValue(state, action);

        expect(typeof qValue).toBe('number');
      });
    });

    describe('reset', () => {
      it('should reset learning state', async () => {
        // Route some tasks and provide feedback
        const task = createTestTask();
        await router.routeTask(task);
        await router.provideFeedback(task.id, {
          success: true,
          durationMs: 1000,
          quality: 0.9,
        });

        await router.reset();

        // After reset, Q-values should be neutral
        const state: QLearningState = {
          taskType: 'unit',
          complexity: 0.5,
          priority: 'p2',
          contextHash: 'test',
        };
        const action: QLearningAction = {
          agentType: 'tester',
          domain: 'test-execution',
        };
        const qValue = router.getQValue(state, action);

        expect(qValue).toBe(0);
      });
    });

    describe('exportModel / importModel', () => {
      it('should export model state', async () => {
        const model = await router.exportModel();

        expect(model).toHaveProperty('type', 'ruvector-qlearning');
        expect(model).toHaveProperty('version');
        expect(model).toHaveProperty('qTable');
        expect(model).toHaveProperty('params');
      });

      it('should import model state', async () => {
        const model = await router.exportModel();
        const newRouter = new RuVectorQLearningRouter(createConfig());

        await expect(newRouter.importModel(model)).resolves.not.toThrow();
      });

      it('should reject invalid model type', async () => {
        const newRouter = new RuVectorQLearningRouter(createConfig());

        await expect(
          newRouter.importModel({ type: 'invalid' })
        ).rejects.toThrow('Invalid model type');
      });
    });
  });

  describe('FallbackQLearningRouter', () => {
    let router: FallbackQLearningRouter;

    beforeEach(() => {
      router = new FallbackQLearningRouter();
    });

    it('should route tasks using rules', async () => {
      const task = createTestTask({ type: 'unit' });
      const result = await router.routeTask(task);

      expect(result.usedFallback).toBe(true);
      expect(result.agentType).toBe('tester');
      expect(result.domain).toBe('test-execution');
    });

    it('should route security tasks appropriately', async () => {
      const task = createTestTask({ type: 'security' });
      const result = await router.routeTask(task);

      expect(result.usedFallback).toBe(true);
      expect(result.domain).toBe('security-compliance');
    });

    it('should route performance tasks appropriately', async () => {
      const task = createTestTask({ type: 'performance' });
      const result = await router.routeTask(task);

      expect(result.usedFallback).toBe(true);
      expect(result.domain).toBe('chaos-resilience');
    });

    it('should always return neutral Q-values', () => {
      const state: QLearningState = {
        taskType: 'unit',
        complexity: 0.5,
        priority: 'p2',
        contextHash: 'test',
      };
      const action: QLearningAction = {
        agentType: 'tester',
        domain: 'test-execution',
      };

      expect(router.getQValue(state, action)).toBe(0.5);
    });
  });

  describe('Integration', () => {
    it('should fallback when RuVector disabled', async () => {
      const router = createQLearningRouter(createConfig({ enabled: false }));
      const task = createTestTask();

      const result = await router.routeTask(task);

      expect(result.usedFallback).toBe(true);
    });

    it('should handle learning cycle', async () => {
      const router = createQLearningRouter(createConfig({ enabled: true }));

      // Simulate multiple routing + feedback cycles
      for (let i = 0; i < 5; i++) {
        const task = createTestTask({ id: `task-${i}`, type: 'unit' });
        const result = await router.routeTask(task);

        await router.provideFeedback(task.id, {
          success: true,
          durationMs: 1000 - i * 100, // Faster each time
          quality: 0.7 + i * 0.05,
        });
      }

      // After learning, routing should work
      const finalTask = createTestTask({ type: 'unit' });
      const finalResult = await router.routeTask(finalTask);

      expect(finalResult).toHaveProperty('agentType');
      expect(finalResult).toHaveProperty('reasoning');
    });
  });
});
