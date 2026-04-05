/**
 * Agentic QE v3 - Progressive Context Loader Unit Tests
 * ADR-062 Action 5: HNSW-predicted context loading on agent spawn
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProgressiveContextLoader } from '../../../src/kernel/agent-coordinator';
import type { FileRequestRecord } from '../../../src/kernel/interfaces';

// Sample file list used across tests
const SAMPLE_FILES = [
  'src/auth/auth-service.ts',
  'src/auth/auth-controller.ts',
  'src/auth/auth-middleware.ts',
  'src/user/user-service.ts',
  'src/user/user-repository.ts',
  'src/payment/payment-service.ts',
  'src/payment/stripe-adapter.ts',
  'src/kernel/kernel.ts',
  'src/kernel/event-bus.ts',
  'src/shared/types.ts',
  'src/shared/utils.ts',
  'src/config/database.ts',
  'tests/auth/auth-service.test.ts',
  'tests/user/user-service.test.ts',
  'tests/payment/payment-service.test.ts',
];

describe('ProgressiveContextLoader', () => {
  const originalEnv = process.env.AQE_PROGRESSIVE_CONTEXT_ENABLED;

  beforeEach(() => {
    // Enable feature flag for most tests
    process.env.AQE_PROGRESSIVE_CONTEXT_ENABLED = 'true';
  });

  afterEach(() => {
    // Restore original env
    if (originalEnv === undefined) {
      delete process.env.AQE_PROGRESSIVE_CONTEXT_ENABLED;
    } else {
      process.env.AQE_PROGRESSIVE_CONTEXT_ENABLED = originalEnv;
    }
  });

  describe('predictFilesForTask', () => {
    it('should return at most maxInitialFiles files', () => {
      const loader = new ProgressiveContextLoader({
        strategy: 'predictive',
        maxInitialFiles: 5,
        predictionThreshold: 0.7,
        trackFileRequests: true,
      });

      const result = loader.predictFilesForTask(
        'Fix authentication token validation in the auth service',
        SAMPLE_FILES,
      );

      expect(result.length).toBeLessThanOrEqual(5);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should rank relevant files higher based on task keywords', () => {
      const loader = new ProgressiveContextLoader({
        strategy: 'predictive',
        maxInitialFiles: 5,
        predictionThreshold: 0.7,
        trackFileRequests: true,
      });

      const result = loader.predictFilesForTask(
        'Fix authentication service and auth middleware',
        SAMPLE_FILES,
      );

      // Auth-related files should be ranked first
      const authFiles = result.filter(f => f.includes('auth'));
      expect(authFiles.length).toBeGreaterThan(0);

      // The first result should be auth-related
      expect(result[0]).toContain('auth');
    });

    it('should return all files when feature flag is disabled', () => {
      process.env.AQE_PROGRESSIVE_CONTEXT_ENABLED = 'false';

      const loader = new ProgressiveContextLoader({
        strategy: 'predictive',
        maxInitialFiles: 3,
        predictionThreshold: 0.7,
        trackFileRequests: true,
      });

      const result = loader.predictFilesForTask(
        'Fix authentication service',
        SAMPLE_FILES,
      );

      // Should return ALL files, not limited by maxInitialFiles
      expect(result).toHaveLength(SAMPLE_FILES.length);
      expect(result).toEqual(SAMPLE_FILES);
    });

    it('should return all files when strategy is full', () => {
      const loader = new ProgressiveContextLoader({
        strategy: 'full',
        maxInitialFiles: 3,
        predictionThreshold: 0.7,
        trackFileRequests: true,
      });

      const result = loader.predictFilesForTask(
        'Fix authentication service',
        SAMPLE_FILES,
      );

      expect(result).toHaveLength(SAMPLE_FILES.length);
    });

    it('should return first N files when task description is empty', () => {
      const loader = new ProgressiveContextLoader({
        strategy: 'predictive',
        maxInitialFiles: 4,
        predictionThreshold: 0.7,
        trackFileRequests: true,
      });

      const result = loader.predictFilesForTask('', SAMPLE_FILES);

      expect(result).toHaveLength(4);
      expect(result).toEqual(SAMPLE_FILES.slice(0, 4));
    });

    it('should return empty array when file list is empty', () => {
      const loader = new ProgressiveContextLoader({
        strategy: 'predictive',
        maxInitialFiles: 10,
        predictionThreshold: 0.7,
        trackFileRequests: true,
      });

      const result = loader.predictFilesForTask(
        'Fix authentication service',
        [],
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('recordFileRequest', () => {
    it('should record file requests correctly', () => {
      const loader = new ProgressiveContextLoader({
        strategy: 'predictive',
        maxInitialFiles: 5,
        predictionThreshold: 0.7,
        trackFileRequests: true,
      });

      const record: FileRequestRecord = {
        filePath: 'src/auth/auth-service.ts',
        requestedAt: Date.now(),
        wasPreloaded: true,
        agentId: 'agent-1',
        taskDescription: 'Fix auth service',
      };

      loader.recordFileRequest(record);

      const history = loader.getFileRequestHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(record);
    });

    it('should not record when trackFileRequests is false', () => {
      const loader = new ProgressiveContextLoader({
        strategy: 'predictive',
        maxInitialFiles: 5,
        predictionThreshold: 0.7,
        trackFileRequests: false,
      });

      const record: FileRequestRecord = {
        filePath: 'src/auth/auth-service.ts',
        requestedAt: Date.now(),
        wasPreloaded: true,
        agentId: 'agent-1',
        taskDescription: 'Fix auth service',
      };

      loader.recordFileRequest(record);

      const history = loader.getFileRequestHistory();
      expect(history).toHaveLength(0);
    });
  });

  describe('getPredictionAccuracy', () => {
    it('should calculate prediction accuracy correctly', () => {
      const loader = new ProgressiveContextLoader({
        strategy: 'predictive',
        maxInitialFiles: 5,
        predictionThreshold: 0.7,
        trackFileRequests: true,
      });

      // First, predict files to populate preloadedFiles set
      loader.predictFilesForTask(
        'Fix authentication service and auth middleware',
        SAMPLE_FILES,
      );

      // Record requests for files that were preloaded (hits)
      loader.recordFileRequest({
        filePath: 'src/auth/auth-service.ts',
        requestedAt: Date.now(),
        wasPreloaded: true,
        agentId: 'agent-1',
        taskDescription: 'Fix auth',
      });

      // Record a request for a file that was NOT preloaded (miss)
      loader.recordFileRequest({
        filePath: 'src/config/database.ts',
        requestedAt: Date.now(),
        wasPreloaded: false,
        agentId: 'agent-1',
        taskDescription: 'Fix auth',
      });

      const accuracy = loader.getPredictionAccuracy();
      expect(accuracy.predicted).toBeGreaterThan(0);
      expect(accuracy.actuallyUsed).toBe(1); // one wasPreloaded=true
      expect(accuracy.hitRate).toBeGreaterThan(0);
      expect(accuracy.hitRate).toBeLessThanOrEqual(1);
    });

    it('should return hit rate 0 when no predictions match', () => {
      const loader = new ProgressiveContextLoader({
        strategy: 'predictive',
        maxInitialFiles: 2,
        predictionThreshold: 0.7,
        trackFileRequests: true,
      });

      // Predict auth files
      loader.predictFilesForTask('Fix authentication', SAMPLE_FILES);

      // But agent only requests payment files
      loader.recordFileRequest({
        filePath: 'src/payment/payment-service.ts',
        requestedAt: Date.now(),
        wasPreloaded: false,
        agentId: 'agent-1',
        taskDescription: 'Fix payment',
      });

      loader.recordFileRequest({
        filePath: 'src/payment/stripe-adapter.ts',
        requestedAt: Date.now(),
        wasPreloaded: false,
        agentId: 'agent-1',
        taskDescription: 'Fix payment',
      });

      const accuracy = loader.getPredictionAccuracy();
      // The preloaded set has auth files; requests are for payment files → no overlap
      expect(accuracy.hitRate).toBe(0);
    });
  });

  describe('getFileRequestHistory', () => {
    it('should track multiple agents separately', () => {
      const loader = new ProgressiveContextLoader({
        strategy: 'predictive',
        maxInitialFiles: 5,
        predictionThreshold: 0.7,
        trackFileRequests: true,
      });

      loader.recordFileRequest({
        filePath: 'src/auth/auth-service.ts',
        requestedAt: Date.now(),
        wasPreloaded: true,
        agentId: 'agent-1',
        taskDescription: 'Fix auth',
      });

      loader.recordFileRequest({
        filePath: 'src/payment/payment-service.ts',
        requestedAt: Date.now(),
        wasPreloaded: false,
        agentId: 'agent-2',
        taskDescription: 'Fix payment',
      });

      loader.recordFileRequest({
        filePath: 'src/auth/auth-middleware.ts',
        requestedAt: Date.now(),
        wasPreloaded: true,
        agentId: 'agent-1',
        taskDescription: 'Fix auth',
      });

      // Filter by agent-1
      const agent1History = loader.getFileRequestHistory('agent-1');
      expect(agent1History).toHaveLength(2);
      expect(agent1History.every(r => r.agentId === 'agent-1')).toBe(true);

      // Filter by agent-2
      const agent2History = loader.getFileRequestHistory('agent-2');
      expect(agent2History).toHaveLength(1);
      expect(agent2History[0].agentId).toBe('agent-2');

      // No filter → all records
      const allHistory = loader.getFileRequestHistory();
      expect(allHistory).toHaveLength(3);
    });
  });

  describe('defaults', () => {
    it('should use default config when constructed without arguments', () => {
      const loader = new ProgressiveContextLoader();

      // Default strategy is 'full', so even when enabled, full returns all files
      const result = loader.predictFilesForTask('Fix auth', SAMPLE_FILES);
      expect(result).toHaveLength(SAMPLE_FILES.length);
    });
  });
});
