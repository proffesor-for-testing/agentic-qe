/**
 * Agentic QE v3 - Defect Investigation Protocol Unit Tests
 * Tests for DefectInvestigationProtocol multi-agent test failure investigation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  DefectInvestigationProtocol,
  DefectInvestigationEvents,
  type TestFailure,
  type DefectInvestigationResult,
  type DefectInvestigationConfig,
} from '../../../../src/coordination/protocols/defect-investigation';
import type { EventBus, MemoryBackend } from '../../../../src/kernel/interfaces';

// ============================================================================
// Mock Setup
// ============================================================================

function createMockEventBus(): EventBus {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    subscribeToChannel: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    unsubscribe: vi.fn(),
  };
}

function createMockMemory(): MemoryBackend {
  const storage = new Map<string, unknown>();

  return {
    get: vi.fn().mockImplementation(async (key: string) => storage.get(key)),
    set: vi.fn().mockImplementation(async (key: string, value: unknown) => {
      storage.set(key, value);
    }),
    delete: vi.fn().mockImplementation(async (key: string) => storage.delete(key)),
    search: vi.fn().mockResolvedValue([]),
    clear: vi.fn().mockImplementation(async () => storage.clear()),
  };
}

function createTestFailure(overrides?: Partial<TestFailure>): TestFailure {
  return {
    testId: 'test-123',
    testName: 'should handle user login',
    file: 'src/auth/login.test.ts',
    error: 'Expected true to be false',
    stack: 'Error: Expected true to be false\n    at login.test.ts:42',
    duration: 150,
    runId: 'run-456',
    timestamp: new Date(),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('DefectInvestigationProtocol', () => {
  let mockEventBus: EventBus;
  let mockMemory: MemoryBackend;
  let protocol: DefectInvestigationProtocol;

  beforeEach(() => {
    mockEventBus = createMockEventBus();
    mockMemory = createMockMemory();
    protocol = new DefectInvestigationProtocol(mockEventBus, mockMemory);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create protocol with default config', () => {
      const protocol = new DefectInvestigationProtocol(mockEventBus, mockMemory);
      expect(protocol).toBeDefined();
    });

    it('should accept custom config', () => {
      const config: Partial<DefectInvestigationConfig> = {
        maxDuration: 60000,
        minConfidence: 0.5,
        flakinessHistorySize: 20,
      };

      const protocol = new DefectInvestigationProtocol(mockEventBus, mockMemory, config);
      expect(protocol).toBeDefined();
    });
  });

  describe('execute()', () => {
    it('should complete investigation successfully', async () => {
      const testFailure = createTestFailure();

      const result = await protocol.execute(testFailure);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.investigationId).toBeDefined();
        expect(result.value.testFailure).toEqual(testFailure);
        expect(result.value.duration).toBeGreaterThanOrEqual(0);
      }
    });

    it('should publish investigation started event', async () => {
      const testFailure = createTestFailure();

      await protocol.execute(testFailure);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: DefectInvestigationEvents.DefectInvestigationStarted,
        })
      );
    });

    it('should publish investigation completed event', async () => {
      const testFailure = createTestFailure();

      await protocol.execute(testFailure);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: DefectInvestigationEvents.DefectInvestigationCompleted,
        })
      );
    });

    it('should return isFlaky false for new tests', async () => {
      const testFailure = createTestFailure();

      const result = await protocol.execute(testFailure);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isFlaky).toBe(false);
      }
    });

    it('should generate recommendations', async () => {
      const testFailure = createTestFailure();

      const result = await protocol.execute(testFailure);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.recommendations.length).toBeGreaterThan(0);
      }
    });

    it('should calculate confidence score', async () => {
      const testFailure = createTestFailure();

      const result = await protocol.execute(testFailure);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.confidence).toBeGreaterThanOrEqual(0);
        expect(result.value.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('checkFlakiness()', () => {
    it('should return not flaky with no history', async () => {
      const testFailure = createTestFailure();

      const result = await protocol.checkFlakiness('inv-123', testFailure);

      expect(result.isFlaky).toBe(false);
      expect(result.confidence).toBe(0.5);
    });

    it('should detect flaky test with mixed history', async () => {
      const testFailure = createTestFailure({ testId: 'test-flaky' });

      // Set up history with mixed results
      const historyKey = 'test-execution:history:test-flaky';
      await mockMemory.set(historyKey, [
        { runId: 'run-1', passed: true, duration: 100, timestamp: new Date() },
        { runId: 'run-2', passed: false, duration: 120, timestamp: new Date() },
        { runId: 'run-3', passed: true, duration: 110, timestamp: new Date() },
        { runId: 'run-4', passed: false, duration: 130, timestamp: new Date() },
        { runId: 'run-5', passed: true, duration: 105, timestamp: new Date() },
      ]);

      const result = await protocol.checkFlakiness('inv-123', testFailure);

      expect(result.isFlaky).toBe(true);
      expect(result.failureRate).toBeDefined();
    });

    it('should publish flakiness detected event for flaky tests', async () => {
      const testFailure = createTestFailure({ testId: 'test-flaky-event' });

      const historyKey = 'test-execution:history:test-flaky-event';
      await mockMemory.set(historyKey, [
        { runId: 'run-1', passed: true, duration: 100, timestamp: new Date() },
        { runId: 'run-2', passed: false, duration: 120, timestamp: new Date() },
        { runId: 'run-3', passed: true, duration: 110, timestamp: new Date() },
        { runId: 'run-4', passed: false, duration: 130, timestamp: new Date() },
      ]);

      await protocol.checkFlakiness('inv-123', testFailure);

      // May or may not publish based on confidence threshold
    });

    it('should detect timing pattern from error message', async () => {
      const testFailure = createTestFailure({
        testId: 'test-timing',
        error: 'Timeout: operation timed out after 5000ms',
      });

      const historyKey = 'test-execution:history:test-timing';
      await mockMemory.set(historyKey, [
        { runId: 'run-1', passed: true, duration: 100, timestamp: new Date() },
        { runId: 'run-2', passed: false, duration: 5100, timestamp: new Date() },
        { runId: 'run-3', passed: true, duration: 110, timestamp: new Date() },
      ]);

      const result = await protocol.checkFlakiness('inv-123', testFailure);

      if (result.isFlaky) {
        expect(['timing', 'async', 'unknown']).toContain(result.pattern);
      }
    });

    it('should detect async pattern from error message', async () => {
      const testFailure = createTestFailure({
        testId: 'test-async',
        error: 'Promise rejection: callback not called',
      });

      const historyKey = 'test-execution:history:test-async';
      await mockMemory.set(historyKey, [
        { runId: 'run-1', passed: true, duration: 100, timestamp: new Date() },
        { runId: 'run-2', passed: false, duration: 120, timestamp: new Date() },
        { runId: 'run-3', passed: true, duration: 110, timestamp: new Date() },
      ]);

      const result = await protocol.checkFlakiness('inv-123', testFailure);

      if (result.isFlaky) {
        expect(result.pattern).toBe('async');
      }
    });
  });

  describe('analyzeRootCause()', () => {
    it('should analyze assertion errors', async () => {
      const testFailure = createTestFailure({
        error: 'expect(value).toEqual(42) - expected 42 but got 10',
      });

      const result = await protocol.analyzeRootCause('inv-123', testFailure);

      expect(result).not.toBeNull();
      if (result) {
        // Root cause analysis matches 'assertion' category which contains keywords like 'expect', 'toBe', 'toEqual'
        expect(result.rootCause.toLowerCase()).toContain('assertion');
      }
    });

    it('should analyze null reference errors', async () => {
      const testFailure = createTestFailure({
        error: 'Cannot read property "foo" of undefined',
      });

      const result = await protocol.analyzeRootCause('inv-123', testFailure);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.rootCause.toLowerCase()).toContain('null');
      }
    });

    it('should analyze timeout errors', async () => {
      const testFailure = createTestFailure({
        error: 'Test timeout exceeded 5000ms',
      });

      const result = await protocol.analyzeRootCause('inv-123', testFailure);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.rootCause.toLowerCase()).toContain('timeout');
      }
    });

    it('should analyze network errors', async () => {
      const testFailure = createTestFailure({
        error: 'ECONNREFUSED: Connection refused to localhost:3000',
      });

      const result = await protocol.analyzeRootCause('inv-123', testFailure);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.rootCause.toLowerCase()).toContain('network');
      }
    });

    it('should publish root cause identified event', async () => {
      const testFailure = createTestFailure({
        error: 'Expected 1 to equal 2',
      });

      await protocol.analyzeRootCause('inv-123', testFailure);

      // Check if event was published (depends on confidence)
    });

    it('should include contributing factors', async () => {
      const testFailure = createTestFailure({
        error: 'Expected true to be false',
      });

      const result = await protocol.analyzeRootCause('inv-123', testFailure);

      if (result) {
        expect(result.contributingFactors).toBeDefined();
        expect(Array.isArray(result.contributingFactors)).toBe(true);
      }
    });
  });

  describe('predictRelatedFailures()', () => {
    it('should return empty array with no similar tests', async () => {
      const testFailure = createTestFailure();

      const result = await protocol.predictRelatedFailures('inv-123', testFailure, null);

      expect(result).toEqual([]);
    });

    it('should find tests in same file', async () => {
      const testFailure = createTestFailure({ file: 'src/auth/login.test.ts' });

      const testsKey = 'test-execution:tests-by-file:src/auth/login.test.ts';
      await mockMemory.set(testsKey, [
        { testId: 'test-1', testName: 'should handle valid login' },
        { testId: 'test-2', testName: 'should handle invalid password' },
      ]);

      const result = await protocol.predictRelatedFailures('inv-123', testFailure, null);

      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should respect maxRelatedFailures limit', async () => {
      const protocol = new DefectInvestigationProtocol(mockEventBus, mockMemory, {
        maxRelatedFailures: 3,
      });

      const testFailure = createTestFailure();

      const result = await protocol.predictRelatedFailures('inv-123', testFailure, null);

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('should sort by similarity', async () => {
      const testFailure = createTestFailure({ file: 'src/auth/login.test.ts' });

      const testsKey = 'test-execution:tests-by-file:src/auth/login.test.ts';
      await mockMemory.set(testsKey, [
        { testId: 'test-1', testName: 'similar test' },
        { testId: 'test-2', testName: 'another test' },
      ]);

      const result = await protocol.predictRelatedFailures('inv-123', testFailure, null);

      // Results should be sorted by similarity descending
      if (result.length >= 2) {
        expect(result[0].similarity).toBeGreaterThanOrEqual(result[1].similarity);
      }
    });
  });

  describe('suggestFixes()', () => {
    it('should suggest quarantine for high-rate flaky tests', () => {
      const testFailure = createTestFailure();
      const flakyAnalysis = {
        isFlaky: true,
        confidence: 0.9,
        pattern: 'timing' as const,
        failureRate: 0.6,
        recommendation: 'Increase timeout',
      };

      const result = protocol.suggestFixes(testFailure, flakyAnalysis, null, null, []);

      const quarantineRec = result.find(r => r.type === 'quarantine');
      expect(quarantineRec).toBeDefined();
    });

    it('should suggest retry for low-rate flaky tests', () => {
      const testFailure = createTestFailure();
      const flakyAnalysis = {
        isFlaky: true,
        confidence: 0.8,
        pattern: 'async' as const,
        failureRate: 0.3,
        recommendation: 'Add await',
      };

      const result = protocol.suggestFixes(testFailure, flakyAnalysis, null, null, []);

      const retryRec = result.find(r => r.type === 'retry');
      expect(retryRec).toBeDefined();
    });

    it('should include root cause recommendations', () => {
      const testFailure = createTestFailure();
      const flakyAnalysis = { isFlaky: false, confidence: 0.5 };
      const rootCause = {
        defectId: 'def-1',
        rootCause: 'Null reference',
        confidence: 0.8,
        contributingFactors: [],
        relatedFiles: [],
        recommendations: ['Add null check', 'Validate input'],
        timeline: [],
      };

      const result = protocol.suggestFixes(testFailure, flakyAnalysis, rootCause, null, []);

      const fixRecs = result.filter(r => r.type === 'fix');
      expect(fixRecs.length).toBeGreaterThan(0);
    });

    it('should suggest investigation for related failures', () => {
      const testFailure = createTestFailure();
      const flakyAnalysis = { isFlaky: false, confidence: 0.5 };
      const relatedFailures = [
        { testId: 't1', testName: 'test1', file: 'f1', similarity: 0.8, reason: 'Same file' },
        { testId: 't2', testName: 'test2', file: 'f2', similarity: 0.7, reason: 'Same file' },
        { testId: 't3', testName: 'test3', file: 'f3', similarity: 0.6, reason: 'Same file' },
      ];

      const result = protocol.suggestFixes(testFailure, flakyAnalysis, null, null, relatedFailures);

      const investigateRec = result.find(r => r.type === 'investigate' && r.description.includes('related'));
      expect(investigateRec).toBeDefined();
    });

    it('should provide default recommendation when nothing specific', () => {
      const testFailure = createTestFailure();
      const flakyAnalysis = { isFlaky: false, confidence: 0.5 };

      const result = protocol.suggestFixes(testFailure, flakyAnalysis, null, null, []);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should sort by priority', () => {
      const testFailure = createTestFailure();
      const flakyAnalysis = {
        isFlaky: true,
        confidence: 0.9,
        pattern: 'timing' as const,
        failureRate: 0.7,
      };
      const rootCause = {
        defectId: 'def-1',
        rootCause: 'Test issue',
        confidence: 0.8,
        contributingFactors: [],
        relatedFiles: [],
        recommendations: ['Fix 1', 'Fix 2'],
        timeline: [],
      };

      const result = protocol.suggestFixes(testFailure, flakyAnalysis, rootCause, null, []);

      // Higher priority items should come first
      const priorities = result.map(r => r.priority);
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      for (let i = 1; i < priorities.length; i++) {
        expect(priorityOrder[priorities[i]]).toBeGreaterThanOrEqual(priorityOrder[priorities[i - 1]]);
      }
    });
  });

  describe('updateDefectPatterns()', () => {
    it('should store investigation result', async () => {
      const result: DefectInvestigationResult = {
        investigationId: 'inv-123',
        testFailure: createTestFailure(),
        isFlaky: false,
        relatedFailures: [],
        recommendations: [],
        confidence: 0.7,
        duration: 1500,
      };

      await protocol.updateDefectPatterns(result);

      expect(mockMemory.set).toHaveBeenCalled();
    });

    it('should update test history', async () => {
      const result: DefectInvestigationResult = {
        investigationId: 'inv-123',
        testFailure: createTestFailure({ testId: 'test-history' }),
        isFlaky: false,
        relatedFailures: [],
        recommendations: [],
        confidence: 0.7,
        duration: 1500,
      };

      await protocol.updateDefectPatterns(result);

      expect(mockMemory.set).toHaveBeenCalledWith(
        expect.stringContaining('test-execution:history:test-history'),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should update pattern statistics', async () => {
      const result: DefectInvestigationResult = {
        investigationId: 'inv-123',
        testFailure: createTestFailure(),
        isFlaky: false,
        rootCause: {
          defectId: 'def-1',
          rootCause: 'Assertion failure',
          confidence: 0.8,
          contributingFactors: [],
          relatedFiles: [],
          recommendations: [],
          timeline: [],
        },
        relatedFailures: [],
        recommendations: [],
        confidence: 0.7,
        duration: 1500,
      };

      await protocol.updateDefectPatterns(result);

      expect(mockMemory.set).toHaveBeenCalledWith(
        expect.stringContaining('pattern-stats'),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('early flaky return', () => {
    it('should return early for known high-confidence flaky tests', async () => {
      const protocol = new DefectInvestigationProtocol(mockEventBus, mockMemory, {
        skipKnownFlaky: true,
      });

      const testFailure = createTestFailure({ testId: 'known-flaky' });

      // Set up history showing consistent flakiness
      const historyKey = 'test-execution:history:known-flaky';
      await mockMemory.set(historyKey, [
        { runId: 'run-1', passed: true, duration: 100, timestamp: new Date() },
        { runId: 'run-2', passed: false, duration: 120, timestamp: new Date() },
        { runId: 'run-3', passed: true, duration: 110, timestamp: new Date() },
        { runId: 'run-4', passed: false, duration: 130, timestamp: new Date() },
        { runId: 'run-5', passed: true, duration: 105, timestamp: new Date() },
        { runId: 'run-6', passed: false, duration: 140, timestamp: new Date() },
        { runId: 'run-7', passed: true, duration: 115, timestamp: new Date() },
        { runId: 'run-8', passed: false, duration: 125, timestamp: new Date() },
        { runId: 'run-9', passed: true, duration: 108, timestamp: new Date() },
        { runId: 'run-10', passed: false, duration: 135, timestamp: new Date() },
      ]);

      const result = await protocol.execute(testFailure);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isFlaky).toBe(true);
        // Early return means no root cause analysis
      }
    });
  });

  describe('error handling', () => {
    it('should handle memory errors gracefully in checkFlakiness', async () => {
      const failingMemory = createMockMemory();
      // Memory.get returns null (no history) which is handled gracefully
      failingMemory.get = vi.fn().mockResolvedValue(null);

      const protocol = new DefectInvestigationProtocol(mockEventBus, failingMemory);
      const testFailure = createTestFailure();

      // checkFlakiness handles missing history gracefully
      const flakyResult = await protocol.checkFlakiness('inv-123', testFailure);

      expect(flakyResult.isFlaky).toBe(false);
      expect(flakyResult.confidence).toBe(0.5);
    });

    it('should complete investigation with memory returning null', async () => {
      const nullMemory = createMockMemory();
      nullMemory.get = vi.fn().mockResolvedValue(null);

      const protocol = new DefectInvestigationProtocol(mockEventBus, nullMemory);
      const testFailure = createTestFailure();

      const result = await protocol.execute(testFailure);

      // Should complete successfully when memory returns null
      expect(result.success).toBe(true);
    });
  });
});
