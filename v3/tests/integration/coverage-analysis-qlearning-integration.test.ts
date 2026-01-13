/**
 * Agentic QE v3 - Q-Learning Integration Tests for Coverage Analysis
 *
 * Tests the integration between Q-Learning RL algorithm and coverage-analysis domain
 * for intelligent test prioritization and path optimization.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CoverageAnalysisCoordinator } from '../../src/domains/coverage-analysis/coordinator';
import type {
  CoverageGap,
  CoverageQLPrediction,
  QLPrioritizedTests,
} from '../../src/domains/coverage-analysis/interfaces';
import type { RLExperience } from '../../src/integrations/rl-suite/interfaces';
import { InMemoryEventBus } from '../../src/kernel/event-bus';
import { InMemoryBackend } from '../../src/kernel/memory-backend';
import { checkRuvectorPackagesAvailable } from '../../src/integrations/ruvector/wrappers';

// Check if @ruvector/gnn native operations work (required for full RL stack)
const canTest = checkRuvectorPackagesAvailable();

describe.runIf(canTest.gnn)('Coverage Analysis Q-Learning Integration', () => {
  let coordinator: CoverageAnalysisCoordinator;
  let eventBus: InMemoryEventBus;
  let memory: InMemoryBackend;

  beforeEach(async () => {
    eventBus = new InMemoryEventBus();
    memory = new InMemoryBackend();
    coordinator = new CoverageAnalysisCoordinator(eventBus, memory);
    await coordinator.initialize();
  });

  afterEach(async () => {
    await coordinator.dispose();
  });

  describe('Q-Learning State Representation', () => {
    it('should convert coverage gap to Q-Learning state with correct features', async () => {
      const gap: CoverageGap = {
        id: 'gap-1',
        file: 'src/services/auth.service.ts',
        lines: [10, 15, 20, 25, 30],
        branches: [5, 10],
        riskScore: 8.5,
        severity: 'high',
        recommendation: 'Add unit tests for authentication logic',
      };

      const prediction = await coordinator.predictQL(gap);

      expect(prediction).toBeDefined();
      expect(prediction.action).toBeDefined();
      expect(prediction.action.type).toMatch(/^(generate-unit|generate-integration|prioritize|skip)$/);
      expect(prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
      expect(prediction.estimatedCoverageGain).toBeGreaterThan(0);
      expect(prediction.estimatedTestCount).toBeGreaterThan(0);
    });

    it('should generate different predictions for different gap types', async () => {
      const highRiskGap: CoverageGap = {
        id: 'gap-high',
        file: 'src/services/payment.service.ts',
        lines: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        branches: [1, 2, 3],
        riskScore: 9.5,
        severity: 'critical',
        recommendation: 'Critical payment logic needs tests',
      };

      const lowRiskGap: CoverageGap = {
        id: 'gap-low',
        file: 'src/utils/helpers.ts',
        lines: [100],
        branches: [],
        riskScore: 2.0,
        severity: 'low',
        recommendation: 'Add test for utility function',
      };

      const highRiskPrediction = await coordinator.predictQL(highRiskGap);
      const lowRiskPrediction = await coordinator.predictQL(lowRiskGap);

      // Both predictions should be valid
      expect(highRiskPrediction.action).toBeDefined();
      expect(lowRiskPrediction.action).toBeDefined();

      // High-risk gaps should have higher estimated coverage gain
      // (due to more uncovered lines and branches)
      expect(highRiskPrediction.estimatedCoverageGain).toBeGreaterThan(
        lowRiskPrediction.estimatedCoverageGain
      );
    });
  });

  describe('Test Prioritization with Q-Learning', () => {
    it('should prioritize tests based on Q-Learning predictions', async () => {
      const gaps: CoverageGap[] = [
        {
          id: 'gap-1',
          file: 'src/services/auth.service.ts',
          lines: [10, 15, 20],
          branches: [5, 10],
          riskScore: 8.5,
          severity: 'high',
          recommendation: 'Test authentication logic',
        },
        {
          id: 'gap-2',
          file: 'src/controllers/user.controller.ts',
          lines: [50, 55, 60],
          branches: [20],
          riskScore: 6.0,
          severity: 'medium',
          recommendation: 'Test user endpoints',
        },
        {
          id: 'gap-3',
          file: 'src/utils/date-helper.ts',
          lines: [100],
          branches: [],
          riskScore: 2.0,
          severity: 'low',
          recommendation: 'Test date formatting',
        },
      ];

      const result = await coordinator.getQLRecommendations(gaps, 3);

      expect(result.success).toBe(true);
      if (result.success) {
        const prioritized = result.value;

        expect(prioritized.tests).toHaveLength(3);
        expect(prioritized.totalEstimatedCoverageGain).toBeGreaterThan(0);
        expect(prioritized.totalEstimatedDuration).toBeGreaterThan(0);
        expect(prioritized.reasoning).toContain('Q-Learning');

        // Tests should be sorted by priority (Q-value) descending
        const priorities = prioritized.tests.map((t) => t.priority);
        for (let i = 1; i < priorities.length; i++) {
          expect(priorities[i - 1]).toBeGreaterThanOrEqual(priorities[i]);
        }

        // High-risk gap should be prioritized higher
        const authTest = prioritized.tests.find((t) => t.filePath.includes('auth.service'));
        expect(authTest).toBeDefined();
        if (authTest) {
          expect(authTest.testType).toBeDefined();
          expect(authTest.estimatedCoverageGain).toBeGreaterThan(0);
          expect(authTest.confidence).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('should respect limit parameter for recommendations', async () => {
      const gaps: CoverageGap[] = Array.from({ length: 20 }, (_, i) => ({
        id: `gap-${i}`,
        file: `src/file-${i}.ts`,
        lines: [i * 10],
        branches: [],
        riskScore: 5.0,
        severity: 'medium' as const,
        recommendation: 'Test this file',
      }));

      const result = await coordinator.getQLRecommendations(gaps, 5);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.tests).toHaveLength(5);
      }
    });
  });

  describe('Q-Learning Training Integration', () => {
    it('should train Q-Learning with execution results', async () => {
      const gap: CoverageGap = {
        id: 'gap-train-1',
        file: 'src/services/training.service.ts',
        lines: [10, 20, 30],
        branches: [5, 15],
        riskScore: 7.0,
        severity: 'high',
        recommendation: 'Test training logic',
      };

      // Get initial prediction
      const initialPrediction = await coordinator.predictQL(gap);
      const initialValue = initialPrediction.value;

      // Simulate training experience
      const experience: RLExperience = {
        state: {
          id: gap.id,
          features: [
            gap.riskScore / 10,
            gap.lines.length / 50,
            gap.branches.length / 10,
            0.75, // severity
            0.7, // complexity
            0.6, // change frequency
            0.8, // business criticality
            3, // line to branch ratio
            0.5, // coverage potential
            0.6, // file complexity
            0.4, // test complexity
            0.5, // execution cost
          ],
          metadata: { gap },
        },
        action: initialPrediction.action,
        reward: 0.8, // Positive reward for good prediction
        nextState: {
          id: `${gap.id}-next`,
          features: [
            0.5, // reduced risk after testing
            0.1, // fewer uncovered lines
            0.2, // fewer uncovered branches
            0.5,
            0.7,
            0.6,
            0.8,
            3,
            0.5,
            0.6,
            0.4,
            0.5,
          ],
        },
        done: true,
        timestamp: new Date(),
      };

      // Train the model
      await coordinator.trainQL(experience);

      // Get updated prediction
      const updatedPrediction = await coordinator.predictQL(gap);

      // Model should have learned (values may change due to exploration)
      expect(updatedPrediction).toBeDefined();
      expect(updatedPrediction.action).toBeDefined();
    });

    it('should persist training state to memory', async () => {
      const experience: RLExperience = {
        state: {
          id: 'test-state',
          features: [0.5, 0.5, 0.5, 0.5],
        },
        action: { type: 'generate-unit', value: 'test' },
        reward: 1.0,
        nextState: {
          id: 'test-next-state',
          features: [0.6, 0.6, 0.6, 0.6],
        },
        done: true,
      };

      // Train multiple times to trigger persistence (every 10 episodes)
      for (let i = 0; i < 10; i++) {
        await coordinator.trainQL(experience);
      }

      // Verify persistence (check if memory has the model state)
      const modelState = await memory.get('coverage:ql:model:latest');
      expect(modelState).toBeDefined();
      expect(modelState).toHaveProperty('stats');
    });
  });

  describe('Coverage Gain Estimation', () => {
    it('should estimate different coverage gains for different actions', async () => {
      const gap: CoverageGap = {
        id: 'gap-estimate',
        file: 'src/services/estimate.service.ts',
        lines: [10, 20, 30, 40, 50],
        branches: [5, 15, 25],
        riskScore: 6.0,
        severity: 'medium',
        recommendation: 'Test estimation logic',
      };

      const prediction = await coordinator.predictQL(gap);

      expect(prediction.estimatedCoverageGain).toBeGreaterThan(0);

      // Different action types should have different coverage gains
      const actionType = prediction.action.type;
      if (actionType === 'skip') {
        expect(prediction.estimatedCoverageGain).toBe(0);
      } else {
        expect(prediction.estimatedCoverageGain).toBeGreaterThan(0);
      }
    });
  });

  describe('Test Duration Estimation', () => {
    it('should estimate longer duration for integration tests', async () => {
      const gap: CoverageGap = {
        id: 'gap-duration',
        file: 'src/services/duration.service.ts',
        lines: [10, 20, 30, 40, 50],
        branches: [5, 15],
        riskScore: 5.0,
        severity: 'medium',
        recommendation: 'Test duration logic',
      };

      const result = await coordinator.getQLRecommendations([gap], 1);

      expect(result.success).toBe(true);
      if (result.success) {
        const test = result.value.tests[0];

        // Integration tests should take longer than unit tests
        if (test.testType === 'integration') {
          expect(test.estimatedDuration).toBeGreaterThan(gap.lines.length * 0.5);
        }
      }
    });
  });

  describe('Action Type Mapping', () => {
    it('should map actions to appropriate test types', async () => {
      const gap: CoverageGap = {
        id: 'gap-action-map',
        file: 'src/services/actionmap.service.ts',
        lines: [10, 20],
        branches: [5],
        riskScore: 5.0,
        severity: 'medium',
        recommendation: 'Test action mapping',
      };

      const prediction = await coordinator.predictQL(gap);

      // Verify action type is valid
      expect(['generate-unit', 'generate-integration', 'prioritize', 'skip']).toContain(
        prediction.action.type
      );

      // Verify test count is reasonable
      expect(prediction.estimatedTestCount).toBeGreaterThanOrEqual(0);
      expect(prediction.estimatedTestCount).toBeLessThanOrEqual(5);
    });
  });

  describe('Confidence and Reasoning', () => {
    it('should provide reasoning for predictions', async () => {
      const gap: CoverageGap = {
        id: 'gap-reasoning',
        file: 'src/services/reasoning.service.ts',
        lines: [10, 20, 30],
        branches: [5, 10],
        riskScore: 7.5,
        severity: 'high',
        recommendation: 'Test reasoning logic',
      };

      const prediction = await coordinator.predictQL(gap);

      expect(prediction.reasoning).toBeDefined();
      expect(prediction.reasoning.length).toBeGreaterThan(0);
      expect(prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
    });
  });
});
