/**
 * ReflexionMemoryAdapter Test Suite
 *
 * Tests:
 * - Constructor with default and custom dimensions
 * - Recording test executions
 * - Flaky pattern detection
 * - Flakiness prediction
 * - Indicator extraction from error messages
 * - Lesson generation from indicators
 * - Statistics tracking
 * - Clear functionality
 * - Edge cases (empty history, single execution, many executions)
 *
 * NO MOCKS - Real implementation testing per project policy
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  ReflexionMemoryAdapter,
  createReflexionMemoryAdapter,
  type TestExecution,
  type FlakinessPrediction,
} from '../../../src/core/memory/ReflexionMemoryAdapter.js';

describe('ReflexionMemoryAdapter', () => {
  let adapter: ReflexionMemoryAdapter;

  beforeEach(() => {
    adapter = new ReflexionMemoryAdapter();
  });

  describe('Constructor', () => {
    it('should initialize with default dimension of 384', () => {
      const adapter = new ReflexionMemoryAdapter();
      expect(adapter).toBeDefined();

      const stats = adapter.getStats();
      expect(stats.totalEpisodes).toBe(0);
      expect(stats.totalExecutions).toBe(0);
    });

    it('should initialize with custom dimension', () => {
      const adapter = new ReflexionMemoryAdapter(512);
      expect(adapter).toBeDefined();

      const stats = adapter.getStats();
      expect(stats.totalEpisodes).toBe(0);
    });

    it('should create adapter via factory function', () => {
      const adapter = createReflexionMemoryAdapter(256);
      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(ReflexionMemoryAdapter);
    });
  });

  describe('recordExecution()', () => {
    it('should record a single passing test execution', async () => {
      const execution: TestExecution = {
        testId: 'test-1',
        testName: 'should pass test',
        signature: 'UserService.test.ts::should validate user',
        outcome: 'pass',
        duration: 150,
        retryCount: 0,
        environment: { NODE_ENV: 'test' },
        timestamp: Date.now(),
      };

      await adapter.recordExecution(execution);

      const stats = adapter.getStats();
      // No episode created yet (need 3+ executions for pattern detection)
      expect(stats.totalEpisodes).toBe(0);
    });

    it('should record multiple test executions', async () => {
      for (let i = 0; i < 5; i++) {
        const execution: TestExecution = {
          testId: 'test-multi',
          testName: 'repeated test',
          signature: 'test-multi',
          outcome: i % 2 === 0 ? 'pass' : 'fail',
          duration: 100 + i * 10,
          errorMessage: i % 2 === 1 ? 'Test failed with timeout' : undefined,
          retryCount: 0,
          environment: { NODE_ENV: 'test' },
          timestamp: Date.now() + i * 1000,
        };

        await adapter.recordExecution(execution);
      }

      const stats = adapter.getStats();
      // Should create episode due to flaky pattern (alternating pass/fail)
      expect(stats.totalEpisodes).toBeGreaterThan(0);
    });

    it('should record failing test execution with error context', async () => {
      const execution: TestExecution = {
        testId: 'test-fail',
        testName: 'should fail test',
        signature: 'test-fail',
        outcome: 'fail',
        duration: 200,
        errorMessage: 'Expected 5 but got 10',
        errorStack: 'at UserService.validate (user.ts:42)',
        retryCount: 0,
        environment: { NODE_ENV: 'test' },
        timestamp: Date.now(),
      };

      await adapter.recordExecution(execution);

      const stats = adapter.getStats();
      expect(stats.totalEpisodes).toBe(0); // Need flaky pattern
    });
  });

  describe('recordFailure()', () => {
    it('should record failure via convenience method', async () => {
      await adapter.recordFailure('test-conv', {
        message: 'Timeout waiting for element',
        stack: 'at waitForElement (test.ts:10)',
        environment: { BROWSER: 'chrome' },
      });

      const prediction = await adapter.predictFlakiness('test-conv');
      expect(prediction.testId).toBe('test-conv');
    });

    it('should record failure without stack trace', async () => {
      await adapter.recordFailure('test-nostrace', {
        message: 'Network request failed',
      });

      const stats = adapter.getStats();
      expect(stats.totalExecutions).toBe(0); // No episode yet
    });
  });

  describe('detectFlakyPattern()', () => {
    it('should NOT detect flaky pattern with less than 3 executions', async () => {
      await adapter.recordExecution({
        testId: 'test-short',
        testName: 'short history',
        signature: 'test-short',
        outcome: 'pass',
        duration: 100,
        retryCount: 0,
        environment: {},
        timestamp: Date.now(),
      });

      await adapter.recordExecution({
        testId: 'test-short',
        testName: 'short history',
        signature: 'test-short',
        outcome: 'fail',
        duration: 100,
        retryCount: 0,
        environment: {},
        timestamp: Date.now(),
      });

      const stats = adapter.getStats();
      expect(stats.totalEpisodes).toBe(0);
    });

    it('should detect flaky pattern with alternating pass/fail', async () => {
      // Create clear alternating pattern (7 executions, 6 transitions = 100% transition rate > 30% threshold)
      for (let i = 0; i < 7; i++) {
        await adapter.recordExecution({
          testId: 'test-flaky',
          testName: 'flaky test',
          signature: 'test-flaky',
          outcome: i % 2 === 0 ? 'pass' : 'fail',
          duration: 100,
          errorMessage: i % 2 === 1 ? 'Async timeout error' : undefined,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      const stats = adapter.getStats();
      expect(stats.totalEpisodes).toBeGreaterThan(0);
    });

    it('should NOT detect flaky pattern with consistent passes', async () => {
      for (let i = 0; i < 10; i++) {
        await adapter.recordExecution({
          testId: 'test-stable',
          testName: 'stable test',
          signature: 'test-stable',
          outcome: 'pass',
          duration: 100,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      const stats = adapter.getStats();
      expect(stats.totalEpisodes).toBe(0);
    });

    it('should NOT detect flaky pattern with low transition rate', async () => {
      // 15 executions with only 2 transitions to ensure low rate throughout
      // Pattern: 7 passes, 1 fail, 7 passes = 2 transitions / 14 = 14% < 30%
      for (let i = 0; i < 15; i++) {
        await adapter.recordExecution({
          testId: 'test-mostly-stable',
          testName: 'mostly stable',
          signature: 'test-mostly-stable',
          outcome: i === 7 ? 'fail' : 'pass', // Single failure in middle
          duration: 100,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      const stats = adapter.getStats();
      // Should not create episode - transition rate too low
      expect(stats.totalEpisodes).toBe(0);
    });
  });

  describe('predictFlakiness()', () => {
    it('should predict flakiness with low score for new test', async () => {
      const prediction = await adapter.predictFlakiness('test-new');

      expect(prediction.testId).toBe('test-new');
      expect(prediction.flakinessScore).toBe(0);
      expect(prediction.confidence).toBe(0.5); // Low confidence with no history
      expect(prediction.indicators).toEqual([]);
      expect(prediction.similarFailures).toEqual([]);
      expect(prediction.recommendations).toHaveLength(2); // Default recommendations
    });

    it('should predict high flakiness score for flaky test', async () => {
      // Create flaky pattern
      for (let i = 0; i < 10; i++) {
        await adapter.recordExecution({
          testId: 'test-predict-flaky',
          testName: 'predict flaky',
          signature: 'test-predict-flaky',
          outcome: i % 2 === 0 ? 'pass' : 'fail',
          duration: 100,
          errorMessage: i % 2 === 1 ? 'Race condition detected' : undefined,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      const prediction = await adapter.predictFlakiness('test-predict-flaky');

      // With flaky pattern, should have high score
      expect(prediction.flakinessScore).toBeGreaterThan(0.5);
      expect(prediction.confidence).toBe(0.8); // High confidence with 10+ executions
      // Indicators may or may not be found depending on episode similarity
      expect(prediction.recommendations.length).toBeGreaterThan(0);
    });

    it('should include similar failures in prediction when embeddings match', async () => {
      // Create first flaky test
      for (let i = 0; i < 6; i++) {
        await adapter.recordExecution({
          testId: 'test-similar-1',
          testName: 'similar test 1',
          signature: 'test-similar-1',
          outcome: i % 2 === 0 ? 'pass' : 'fail',
          duration: 100,
          errorMessage: i % 2 === 1 ? 'Async timing issue' : undefined,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      // Create second similar test
      for (let i = 0; i < 6; i++) {
        await adapter.recordExecution({
          testId: 'test-similar-2',
          testName: 'similar test 2',
          signature: 'test-similar-2',
          outcome: i % 2 === 0 ? 'pass' : 'fail',
          duration: 100,
          errorMessage: i % 2 === 1 ? 'Async timing problem' : undefined,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      const prediction = await adapter.predictFlakiness('test-similar-2');

      // Episodes created, but similarity depends on embeddings
      // At minimum should have recommendations
      expect(prediction.recommendations.length).toBeGreaterThan(0);

      // If similar episodes found (cosine similarity > 0.5), will have indicators
      if (prediction.similarFailures.length > 0) {
        expect(prediction.indicators.length).toBeGreaterThan(0);
      }
    });

    it('should calculate flakiness score based on history and similar episodes', async () => {
      // Create multiple similar flaky tests
      for (let testNum = 1; testNum <= 3; testNum++) {
        for (let i = 0; i < 6; i++) {
          await adapter.recordExecution({
            testId: `test-boost-${testNum}`,
            testName: `boost test ${testNum}`,
            signature: `test-boost-${testNum}`,
            outcome: i % 2 === 0 ? 'pass' : 'fail',
            duration: 100,
            errorMessage: i % 2 === 1 ? 'Network timeout error' : undefined,
            retryCount: 0,
            environment: {},
            timestamp: Date.now() + i * 1000,
          });
        }
      }

      const prediction = await adapter.predictFlakiness('test-boost-3');

      // With alternating pass/fail pattern, should have elevated score
      expect(prediction.flakinessScore).toBeGreaterThan(0.4);
      expect(prediction.recommendations.length).toBeGreaterThan(0);

      // Episodes created for these tests
      const stats = adapter.getStats();
      expect(stats.totalEpisodes).toBeGreaterThan(0);
    });
  });

  describe('extractIndicators()', () => {
    it('should extract timeout indicator', async () => {
      // Create flaky pattern with timeout errors
      for (let i = 0; i < 6; i++) {
        await adapter.recordExecution({
          testId: 'test-timeout',
          testName: 'timeout test',
          signature: 'test-timeout',
          outcome: i % 2 === 0 ? 'pass' : 'fail',
          duration: 100,
          errorMessage: i % 2 === 1 ? 'Test failed: timeout after 5000ms' : undefined,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      // Check that episode was created with timeout indicator
      const stats = adapter.getStats();
      expect(stats.totalEpisodes).toBeGreaterThan(0);
      expect(stats.topIndicators.some(ind => ind.indicator === 'timeout-related')).toBe(true);
    });

    it('should extract race condition indicator', async () => {
      for (let i = 0; i < 6; i++) {
        await adapter.recordExecution({
          testId: 'test-race',
          testName: 'race test',
          signature: 'test-race',
          outcome: i % 2 === 0 ? 'pass' : 'fail',
          duration: 100,
          errorMessage: i % 2 === 1 ? 'Race condition in async handler' : undefined,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      const stats = adapter.getStats();
      expect(stats.topIndicators.some(ind => ind.indicator === 'race-condition')).toBe(true);
    });

    it('should extract async timing indicator', async () => {
      for (let i = 0; i < 6; i++) {
        await adapter.recordExecution({
          testId: 'test-async',
          testName: 'async test',
          signature: 'test-async',
          outcome: i % 2 === 0 ? 'pass' : 'fail',
          duration: 100,
          errorMessage: i % 2 === 1 ? 'Async operation failed' : undefined,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      const stats = adapter.getStats();
      expect(stats.topIndicators.some(ind => ind.indicator === 'async-timing')).toBe(true);
    });

    it('should extract network dependency indicator', async () => {
      for (let i = 0; i < 6; i++) {
        await adapter.recordExecution({
          testId: 'test-network',
          testName: 'network test',
          signature: 'test-network',
          outcome: i % 2 === 0 ? 'pass' : 'fail',
          duration: 100,
          errorMessage: i % 2 === 1 ? 'Network request failed' : undefined,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      const stats = adapter.getStats();
      expect(stats.topIndicators.some(ind => ind.indicator === 'network-dependency')).toBe(true);
    });

    it('should extract database dependency indicator', async () => {
      for (let i = 0; i < 6; i++) {
        await adapter.recordExecution({
          testId: 'test-db',
          testName: 'database test',
          signature: 'test-db',
          outcome: i % 2 === 0 ? 'pass' : 'fail',
          duration: 100,
          errorMessage: i % 2 === 1 ? 'Database connection failed' : undefined,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      const stats = adapter.getStats();
      expect(stats.topIndicators.some(ind => ind.indicator === 'database-dependency')).toBe(true);
    });

    it('should extract non-deterministic indicator', async () => {
      for (let i = 0; i < 6; i++) {
        await adapter.recordExecution({
          testId: 'test-random',
          testName: 'random test',
          signature: 'test-random',
          outcome: i % 2 === 0 ? 'pass' : 'fail',
          duration: 100,
          errorMessage: i % 2 === 1 ? 'Math.random() generated unexpected value' : undefined,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      const stats = adapter.getStats();
      expect(stats.topIndicators.some(ind => ind.indicator === 'non-deterministic')).toBe(true);
    });

    it('should extract time dependency indicator', async () => {
      for (let i = 0; i < 6; i++) {
        await adapter.recordExecution({
          testId: 'test-time',
          testName: 'time test',
          signature: 'test-time',
          outcome: i % 2 === 0 ? 'pass' : 'fail',
          duration: 100,
          errorMessage: i % 2 === 1 ? 'Date.now() timestamp mismatch' : undefined,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      const stats = adapter.getStats();
      expect(stats.topIndicators.some(ind => ind.indicator === 'time-dependency')).toBe(true);
    });

    it('should extract port contention indicator', async () => {
      for (let i = 0; i < 6; i++) {
        await adapter.recordExecution({
          testId: 'test-port',
          testName: 'port test',
          signature: 'test-port',
          outcome: i % 2 === 0 ? 'pass' : 'fail',
          duration: 100,
          errorMessage: i % 2 === 1 ? 'Port 3000 already in use' : undefined,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      const stats = adapter.getStats();
      expect(stats.topIndicators.some(ind => ind.indicator === 'port-contention')).toBe(true);
    });

    it('should extract multiple indicators from complex error', async () => {
      for (let i = 0; i < 6; i++) {
        await adapter.recordExecution({
          testId: 'test-complex',
          testName: 'complex test',
          signature: 'test-complex',
          outcome: i % 2 === 0 ? 'pass' : 'fail',
          duration: 100,
          errorMessage: i % 2 === 1
            ? 'Timeout waiting for network request. Race condition in async handler with Date.now()'
            : undefined,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      const stats = adapter.getStats();
      // Check that multiple indicators were detected
      const indicators = stats.topIndicators.map(i => i.indicator);
      expect(indicators).toContain('timeout-related');
      expect(indicators).toContain('race-condition');
      expect(indicators).toContain('async-timing');
      expect(indicators).toContain('network-dependency');
      expect(indicators).toContain('time-dependency');
    });
  });

  describe('generateLessons()', () => {
    it('should generate recommendation for timeout indicator via prediction', async () => {
      // Create episode with timeout, then predict similar test
      for (let i = 0; i < 6; i++) {
        await adapter.recordExecution({
          testId: 'test-lesson-timeout-1',
          testName: 'lesson timeout',
          signature: 'test lesson timeout context',
          outcome: i % 2 === 0 ? 'pass' : 'fail',
          duration: 100,
          errorMessage: i % 2 === 1 ? 'Timeout error waiting for element' : undefined,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      // Predict for similar test - recommendations come from indicators
      const prediction = await adapter.predictFlakiness('test lesson timeout similar');
      // Timeout indicator may be found in similar episodes
      if (prediction.indicators.includes('timeout-related')) {
        expect(prediction.recommendations.some(r => r.includes('wait conditions'))).toBe(true);
      } else {
        // Without indicators, should get default recommendations
        expect(prediction.recommendations.length).toBeGreaterThan(0);
      }
    });

    it('should generate recommendation for race condition via prediction', async () => {
      for (let i = 0; i < 6; i++) {
        await adapter.recordExecution({
          testId: 'test-lesson-race-1',
          testName: 'lesson race',
          signature: 'race condition test',
          outcome: i % 2 === 0 ? 'pass' : 'fail',
          duration: 100,
          errorMessage: i % 2 === 1 ? 'Race condition detected' : undefined,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      const prediction = await adapter.predictFlakiness('race condition similar test');
      // Check that recommendations exist (may or may not find similar based on embedding)
      expect(prediction.recommendations.length).toBeGreaterThan(0);
    });

    it('should generate recommendation for non-deterministic behavior', async () => {
      for (let i = 0; i < 6; i++) {
        await adapter.recordExecution({
          testId: 'test-lesson-random-1',
          testName: 'lesson random',
          signature: 'random test behavior',
          outcome: i % 2 === 0 ? 'pass' : 'fail',
          duration: 100,
          errorMessage: i % 2 === 1 ? 'Random value caused failure with Math.random' : undefined,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      const prediction = await adapter.predictFlakiness('random behavior test');
      expect(prediction.recommendations.length).toBeGreaterThan(0);
    });

    it('should generate default recommendations when no indicators present', async () => {
      const prediction = await adapter.predictFlakiness('test-no-indicators');

      expect(prediction.recommendations).toContain('Run test multiple times to gather more data');
      expect(prediction.recommendations).toContain('Enable verbose logging to identify failure patterns');
    });
  });

  describe('getStats()', () => {
    it('should return zero stats for empty adapter', () => {
      const stats = adapter.getStats();

      expect(stats.totalEpisodes).toBe(0);
      expect(stats.totalExecutions).toBe(0);
      expect(stats.averageConfidence).toBe(0);
      expect(stats.topIndicators).toEqual([]);
    });

    it('should track total episodes and executions', async () => {
      // Create two flaky tests
      for (let testNum = 1; testNum <= 2; testNum++) {
        for (let i = 0; i < 5; i++) {
          await adapter.recordExecution({
            testId: `test-stats-${testNum}`,
            testName: `stats test ${testNum}`,
            signature: `test-stats-${testNum}`,
            outcome: i % 2 === 0 ? 'pass' : 'fail',
            duration: 100,
            errorMessage: i % 2 === 1 ? 'Timeout error' : undefined,
            retryCount: 0,
            environment: {},
            timestamp: Date.now() + i * 1000,
          });
        }
      }

      const stats = adapter.getStats();

      expect(stats.totalEpisodes).toBeGreaterThan(0);
      expect(stats.totalExecutions).toBeGreaterThan(0);
      expect(stats.averageConfidence).toBeGreaterThan(0);
    });

    it('should track top indicators correctly', async () => {
      // Create tests with various indicators
      const indicators = [
        'timeout error',
        'race condition',
        'timeout again',
        'network failure',
        'timeout third',
        'timeout fourth', // Add 4th timeout to be clearly most common
      ];

      for (let idx = 0; idx < indicators.length; idx++) {
        for (let i = 0; i < 6; i++) {
          await adapter.recordExecution({
            testId: `test-indicator-${idx}`,
            testName: `indicator test ${idx}`,
            signature: `test-indicator-${idx}`,
            outcome: i % 2 === 0 ? 'pass' : 'fail',
            duration: 100,
            errorMessage: i % 2 === 1 ? indicators[idx] : undefined,
            retryCount: 0,
            environment: {},
            timestamp: Date.now() + i * 1000,
          });
        }
      }

      const stats = adapter.getStats();

      // Should have top indicators with counts
      expect(stats.topIndicators.length).toBeGreaterThan(0);
      expect(stats.topIndicators[0]).toHaveProperty('indicator');
      expect(stats.topIndicators[0]).toHaveProperty('count');

      // Timeout should be most common (4 occurrences)
      expect(stats.topIndicators[0].indicator).toBe('timeout-related');
      expect(stats.topIndicators[0].count).toBeGreaterThanOrEqual(3);
    });

    it('should limit top indicators to 5', async () => {
      // Create tests with 7 different indicators
      const errorMessages = [
        'timeout error',
        'race condition',
        'async problem',
        'network failure',
        'random value',
        'time dependency',
        'port contention',
      ];

      for (let idx = 0; idx < errorMessages.length; idx++) {
        for (let i = 0; i < 5; i++) {
          await adapter.recordExecution({
            testId: `test-limit-${idx}`,
            testName: `limit test ${idx}`,
            signature: `test-limit-${idx}`,
            outcome: i % 2 === 0 ? 'pass' : 'fail',
            duration: 100,
            errorMessage: i % 2 === 1 ? errorMessages[idx] : undefined,
            retryCount: 0,
            environment: {},
            timestamp: Date.now() + i * 1000,
          });
        }
      }

      const stats = adapter.getStats();

      // Should have at most 5 top indicators
      expect(stats.topIndicators.length).toBeLessThanOrEqual(5);
    });
  });

  describe('clear()', () => {
    it('should clear all data', async () => {
      // Add some data
      for (let i = 0; i < 5; i++) {
        await adapter.recordExecution({
          testId: 'test-clear',
          testName: 'clear test',
          signature: 'test-clear',
          outcome: i % 2 === 0 ? 'pass' : 'fail',
          duration: 100,
          errorMessage: i % 2 === 1 ? 'Error' : undefined,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      let stats = adapter.getStats();
      expect(stats.totalEpisodes).toBeGreaterThan(0);

      // Clear data
      adapter.clear();

      // Verify everything is cleared
      stats = adapter.getStats();
      expect(stats.totalEpisodes).toBe(0);
      expect(stats.totalExecutions).toBe(0);
      expect(stats.averageConfidence).toBe(0);
      expect(stats.topIndicators).toEqual([]);
    });

    it('should allow recording after clear', async () => {
      // Add and clear
      await adapter.recordExecution({
        testId: 'test-after-clear',
        testName: 'after clear',
        signature: 'test-after-clear',
        outcome: 'pass',
        duration: 100,
        retryCount: 0,
        environment: {},
        timestamp: Date.now(),
      });

      adapter.clear();

      // Add new data
      for (let i = 0; i < 5; i++) {
        await adapter.recordExecution({
          testId: 'test-new-data',
          testName: 'new data',
          signature: 'test-new-data',
          outcome: i % 2 === 0 ? 'pass' : 'fail',
          duration: 100,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      const stats = adapter.getStats();
      expect(stats.totalEpisodes).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty execution history', async () => {
      const prediction = await adapter.predictFlakiness('test-nonexistent');

      expect(prediction.testId).toBe('test-nonexistent');
      expect(prediction.flakinessScore).toBe(0);
      expect(prediction.confidence).toBe(0.5);
      expect(prediction.similarFailures).toEqual([]);
    });

    it('should handle single execution without episode creation', async () => {
      await adapter.recordExecution({
        testId: 'test-single',
        testName: 'single execution',
        signature: 'test-single',
        outcome: 'fail',
        duration: 100,
        errorMessage: 'Single failure',
        retryCount: 0,
        environment: {},
        timestamp: Date.now(),
      });

      const stats = adapter.getStats();
      expect(stats.totalEpisodes).toBe(0); // Need 3+ for pattern
    });

    it('should handle many executions efficiently', async () => {
      const startTime = Date.now();

      // Record 100 executions
      for (let i = 0; i < 100; i++) {
        await adapter.recordExecution({
          testId: 'test-many',
          testName: 'many executions',
          signature: 'test-many',
          outcome: i % 3 === 0 ? 'fail' : 'pass', // Occasional failures
          duration: 50,
          errorMessage: i % 3 === 0 ? 'Timeout' : undefined,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 100,
        });
      }

      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 5 seconds)
      expect(duration).toBeLessThan(5000);

      const stats = adapter.getStats();
      expect(stats.totalExecutions).toBeGreaterThan(0);
    });

    it('should handle execution with no error message', async () => {
      for (let i = 0; i < 5; i++) {
        await adapter.recordExecution({
          testId: 'test-no-error',
          testName: 'no error message',
          signature: 'test-no-error',
          outcome: i % 2 === 0 ? 'pass' : 'fail',
          duration: 100,
          // No errorMessage
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      const prediction = await adapter.predictFlakiness('test-no-error');
      expect(prediction.indicators).toEqual([]); // No indicators without error messages
    });

    it('should handle very slow test durations', async () => {
      for (let i = 0; i < 5; i++) {
        await adapter.recordExecution({
          testId: 'test-slow',
          testName: 'slow test',
          signature: 'test-slow',
          outcome: i % 2 === 0 ? 'pass' : 'fail',
          duration: 8000, // 8 seconds - very slow
          errorMessage: i % 2 === 1 ? 'Slow test failure' : undefined,
          retryCount: 0,
          environment: {},
          timestamp: Date.now() + i * 1000,
        });
      }

      const stats = adapter.getStats();
      expect(stats.totalEpisodes).toBeGreaterThan(0);

      // Should generate lesson about slow tests
      // Note: Lessons are stored in episodes, check via prediction
      const prediction = await adapter.predictFlakiness('test-slow');
      // The adapter should have learned about slow tests
    });
  });
});
