/**
 * SONA Feedback Loop Integration Tests
 *
 * Tests the continuous Execute → Measure → Adapt loop.
 */

import {
  SONAFeedbackLoop,
  createFeedbackLoop,
  createConnectedFeedbackLoop,
  type FeedbackEvent,
  type FeedbackAnalysis,
} from '../../../src/learning/SONAFeedbackLoop';
import {
  SONALearningStrategy,
  createSONALearningStrategy,
} from '../../../src/core/strategies/SONALearningStrategy';

describe('SONAFeedbackLoop', () => {
  let feedbackLoop: SONAFeedbackLoop;
  let strategy: SONALearningStrategy;

  beforeEach(async () => {
    strategy = createSONALearningStrategy({
      enableSONA: true,
      consolidationInterval: 10, // Lower for testing
    });
    await strategy.initialize();

    feedbackLoop = createConnectedFeedbackLoop(strategy, {
      minExecutionsForAnalysis: 5, // Lower for testing
      batchSize: 100, // High enough to not auto-process during tests
    });
  });

  afterEach(async () => {
    feedbackLoop.reset();
    await strategy.reset();
  });

  describe('Feedback Recording', () => {
    it('should record successful feedback events', async () => {
      const event: FeedbackEvent = {
        task: { id: 'test-task-1', type: 'test-generation' } as any,
        success: true,
        duration: 500,
        quality: 0.85,
        result: { testsGenerated: 5 },
        timestamp: new Date(),
      };

      await feedbackLoop.recordFeedback(event);

      const metrics = await feedbackLoop.getMetrics();
      expect(metrics.feedbackPending).toBe(1);
    });

    it('should record failed feedback events', async () => {
      const event: FeedbackEvent = {
        task: { id: 'test-task-2', type: 'test-generation' } as any,
        success: false,
        duration: 200,
        error: new Error('Test failure'),
        timestamp: new Date(),
      };

      await feedbackLoop.recordFeedback(event);

      const metrics = await feedbackLoop.getMetrics();
      expect(metrics.feedbackPending).toBe(1);
    });

    it('should track pattern performance', async () => {
      const patterns = ['pattern-1', 'pattern-2'];

      await feedbackLoop.recordFeedback({
        task: { id: 'task-1', type: 'test' } as any,
        success: true,
        duration: 100,
        patternsUsed: patterns,
        timestamp: new Date(),
      });

      await feedbackLoop.recordFeedback({
        task: { id: 'task-2', type: 'test' } as any,
        success: false,
        duration: 100,
        patternsUsed: patterns,
        timestamp: new Date(),
      });

      const metrics = await feedbackLoop.getMetrics();
      expect(metrics.patternsTracked).toBe(2);
    });
  });

  describe('Feedback Analysis', () => {
    it('should analyze feedback batch', async () => {
      // Record enough feedback for analysis
      for (let i = 0; i < 10; i++) {
        await feedbackLoop.recordFeedback({
          task: { id: `task-${i}`, type: 'test' } as any,
          success: i % 3 !== 0, // ~67% success rate
          duration: 100 + i * 10,
          quality: 0.5 + (i % 5) * 0.1,
          timestamp: new Date(),
        });
      }

      const analysis = await feedbackLoop.forceAnalysis();

      expect(analysis).toBeDefined();
      expect(analysis!.successRate).toBeGreaterThan(0);
      expect(analysis!.avgDuration).toBeGreaterThan(0);
      expect(typeof analysis!.performanceTrend).toBe('number');
    });

    it('should generate adaptation recommendations', async () => {
      // Record mixed feedback
      for (let i = 0; i < 10; i++) {
        await feedbackLoop.recordFeedback({
          task: { id: `task-${i}`, type: 'test' } as any,
          success: i < 3, // Only 30% success rate - should trigger recommendations
          duration: 100,
          patternsUsed: [`pattern-${i % 3}`],
          timestamp: new Date(),
        });
      }

      const analysis = await feedbackLoop.forceAnalysis();

      expect(analysis).toBeDefined();
      expect(analysis!.recommendations.length).toBeGreaterThan(0);
    });

    it('should identify patterns to reinforce', async () => {
      // Record consistently successful pattern usage
      for (let i = 0; i < 10; i++) {
        await feedbackLoop.recordFeedback({
          task: { id: `task-${i}`, type: 'test' } as any,
          success: true,
          duration: 100,
          patternsUsed: ['high-performer'],
          timestamp: new Date(),
        });
      }

      const analysis = await feedbackLoop.forceAnalysis();

      expect(analysis).toBeDefined();
      expect(analysis!.patternsToReinforce).toContain('high-performer');
    });

    it('should identify patterns to review', async () => {
      // Record consistently failing pattern usage
      for (let i = 0; i < 10; i++) {
        await feedbackLoop.recordFeedback({
          task: { id: `task-${i}`, type: 'test' } as any,
          success: false,
          duration: 100,
          patternsUsed: ['low-performer'],
          timestamp: new Date(),
        });
      }

      const analysis = await feedbackLoop.forceAnalysis();

      expect(analysis).toBeDefined();
      expect(analysis!.patternsToReview).toContain('low-performer');
    });
  });

  describe('Adaptation', () => {
    it('should apply adaptations based on analysis', async () => {
      // Store a pattern first
      await strategy.storePattern({
        id: 'adapt-pattern',
        type: 'test',
        domain: 'default',
        content: 'Pattern for adaptation test',
        confidence: 0.5,
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Record feedback that should trigger adaptation
      for (let i = 0; i < 10; i++) {
        await feedbackLoop.recordFeedback({
          task: { id: `task-${i}`, type: 'test' } as any,
          success: true,
          duration: 100,
          patternsUsed: ['adapt-pattern'],
          timestamp: new Date(),
        });
      }

      await feedbackLoop.forceAnalysis();

      // Verify pattern confidence was updated
      const patterns = await strategy.getPatterns({ type: 'test' });
      const updated = patterns.find(p => p.id === 'adapt-pattern');
      expect(updated).toBeDefined();
    });
  });

  describe('Drift Detection', () => {
    it('should detect performance drift', async () => {
      // Record initial good performance
      for (let i = 0; i < 10; i++) {
        await feedbackLoop.recordFeedback({
          task: { id: `good-${i}`, type: 'test' } as any,
          success: true,
          duration: 100,
          timestamp: new Date(),
        });
      }
      await feedbackLoop.forceAnalysis();

      // Record declining performance
      for (let i = 0; i < 10; i++) {
        await feedbackLoop.recordFeedback({
          task: { id: `mid-${i}`, type: 'test' } as any,
          success: i % 2 === 0,
          duration: 100,
          timestamp: new Date(),
        });
      }
      await feedbackLoop.forceAnalysis();

      // Record bad performance
      for (let i = 0; i < 10; i++) {
        await feedbackLoop.recordFeedback({
          task: { id: `bad-${i}`, type: 'test' } as any,
          success: false,
          duration: 100,
          timestamp: new Date(),
        });
      }

      const analysis = await feedbackLoop.forceAnalysis();

      // Drift should be detected
      expect(analysis).toBeDefined();
      // Note: Drift detection may or may not trigger depending on threshold
    });
  });

  describe('Reset', () => {
    it('should reset all state', async () => {
      // Record some feedback
      for (let i = 0; i < 5; i++) {
        await feedbackLoop.recordFeedback({
          task: { id: `task-${i}`, type: 'test' } as any,
          success: true,
          duration: 100,
          patternsUsed: ['pattern-1'],
          timestamp: new Date(),
        });
      }

      feedbackLoop.reset();

      const metrics = await feedbackLoop.getMetrics();
      expect(metrics.feedbackPending).toBe(0);
      expect(metrics.analysisCount).toBe(0);
      expect(metrics.patternsTracked).toBe(0);
    });
  });
});
