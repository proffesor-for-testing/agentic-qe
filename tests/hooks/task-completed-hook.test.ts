/**
 * Unit tests for QualityGateEnforcer and TaskCompletedHook
 * ADR-064, Phase 1C: Quality gate validation and pattern training
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  QualityGateEnforcer,
  DEFAULT_QUALITY_GATE_CONFIG,
  type TaskResult,
  type TaskMetrics,
  type QualityGateConfig,
} from '../../src/hooks/quality-gate-enforcer.js';
import {
  TaskCompletedHook,
  createTaskCompletedHook,
  type PatternStore,
  type ExtractedPattern,
  type CompletionAction,
  type TaskCompletedHookConfig,
} from '../../src/hooks/task-completed-hook.js';

// ============================================================================
// Helpers
// ============================================================================

/** Build a TaskResult for testing */
function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: overrides.taskId ?? 'task-1',
    agentId: overrides.agentId ?? 'agent-1',
    domain: overrides.domain ?? 'test-generation',
    type: overrides.type ?? 'generate',
    status: overrides.status ?? 'completed',
    output: overrides.output ?? {},
    metrics: overrides.metrics ?? {
      testsPassed: 10,
      testsFailed: 0,
      coverageChange: 0.05,
      securityIssues: 0,
      performanceMs: 1000,
    },
    duration: overrides.duration ?? 2000,
    timestamp: overrides.timestamp ?? Date.now(),
    artifacts: overrides.artifacts,
  };
}

/** Create a mock PatternStore */
function mockPatternStore(): PatternStore & {
  store: ReturnType<typeof vi.fn>;
  recordOutcome: ReturnType<typeof vi.fn>;
} {
  let counter = 0;
  return {
    store: vi.fn().mockImplementation(async () => `pattern-${++counter}`),
    recordOutcome: vi.fn().mockResolvedValue(undefined),
  };
}

// ============================================================================
// QualityGateEnforcer Tests
// ============================================================================

describe('QualityGateEnforcer', () => {

  it('should have sensible default config', () => {
    const enforcer = new QualityGateEnforcer();
    const config = enforcer.getConfig();
    expect(config.enabled).toBe(true);
    expect(config.minQualityScore).toBe(0.6);
    expect(config.rejectOnFailure).toBe(true);
    expect(config.gates).toHaveLength(4);
  });

  it('should pass when all gates are satisfied', () => {
    const enforcer = new QualityGateEnforcer();
    const result = makeResult({
      metrics: {
        testsPassed: 10,
        testsFailed: 0,
        coverageChange: 0.1,
        securityIssues: 0,
        performanceMs: 1000,
      },
    });

    const gate = enforcer.evaluate(result);
    expect(gate.passed).toBe(true);
    expect(gate.exitCode).toBe(0);
    expect(gate.score).toBeGreaterThan(0);
  });

  it('should fail when required gate fails with exit code 2', () => {
    const enforcer = new QualityGateEnforcer();
    // test-pass-rate gate is required with threshold 0.8
    const result = makeResult({
      metrics: {
        testsPassed: 2,
        testsFailed: 8, // 20% pass rate - fails required gate
        coverageChange: 0.1,
        securityIssues: 0,
        performanceMs: 1000,
      },
    });

    const gate = enforcer.evaluate(result);
    expect(gate.passed).toBe(false);
    expect(gate.exitCode).toBe(2);
    expect(gate.reason).toContain('test-pass-rate');
  });

  it('should compute weighted score correctly', () => {
    const enforcer = new QualityGateEnforcer({
      gates: [
        { name: 'coverage', type: 'coverage', threshold: 0.0, weight: 0.5, required: false },
        { name: 'security', type: 'security', threshold: 0.0, weight: 0.5, required: false },
      ],
      minQualityScore: 0.0,
    });

    const result = makeResult({
      metrics: { coverageChange: 0.5, securityIssues: 0 },
    });

    const gate = enforcer.evaluate(result);
    expect(gate.passed).toBe(true);
    // Both gates pass -> score should be 1.0
    expect(gate.score).toBeCloseTo(1.0, 1);
  });

  it('should auto-fail a task with failed status', () => {
    const enforcer = new QualityGateEnforcer();
    const result = makeResult({ status: 'failed' });

    const gate = enforcer.evaluate(result);
    expect(gate.passed).toBe(false);
    expect(gate.exitCode).toBe(2);
    expect(gate.reason).toContain('failed status');
  });

  it('should compute partial credit for near-threshold values', () => {
    const enforcer = new QualityGateEnforcer({
      gates: [
        { name: 'test-pass-rate', type: 'test-pass-rate', threshold: 0.8, weight: 1.0, required: false },
      ],
      minQualityScore: 0.0,
    });

    // 70% pass rate is below 80% threshold but close
    const result = makeResult({
      metrics: { testsPassed: 7, testsFailed: 3 },
    });

    const gate = enforcer.evaluate(result);
    // Gate fails but partial credit: 0.7/0.8 = 0.875
    expect(gate.passed).toBe(true); // score above minQualityScore 0.0 and not required
    expect(gate.score).toBeGreaterThan(0);
    expect(gate.score).toBeLessThan(1.0);
  });

  it('should auto-pass when gates are disabled', () => {
    const enforcer = new QualityGateEnforcer({ enabled: false });
    const result = makeResult({ status: 'completed' });

    const gate = enforcer.evaluate(result);
    expect(gate.passed).toBe(true);
    expect(gate.score).toBe(1.0);
    expect(gate.reason).toContain('disabled');
  });

  it('should handle security gate with issues above threshold', () => {
    const enforcer = new QualityGateEnforcer({
      gates: [
        { name: 'security', type: 'security', threshold: 0, weight: 1.0, required: true },
      ],
    });

    const result = makeResult({
      metrics: { securityIssues: 3 },
    });

    const gate = enforcer.evaluate(result);
    expect(gate.passed).toBe(false);
    expect(gate.reason).toContain('security');
  });

  it('should handle performance gate exceeding threshold', () => {
    const enforcer = new QualityGateEnforcer({
      gates: [
        { name: 'performance', type: 'performance', threshold: 5000, weight: 1.0, required: true },
      ],
    });

    const result = makeResult({
      metrics: { performanceMs: 10000 },
    });

    const gate = enforcer.evaluate(result);
    expect(gate.passed).toBe(false);
    expect(gate.reason).toContain('performance');
  });
});

// ============================================================================
// TaskCompletedHook Tests
// ============================================================================

describe('TaskCompletedHook', () => {
  let store: ReturnType<typeof mockPatternStore>;

  beforeEach(() => {
    store = mockPatternStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------- Accept / Reject ----------

  it('should accept when quality gates pass', async () => {
    const hook = createTaskCompletedHook({}, store);
    const result = makeResult({
      metrics: {
        testsPassed: 10,
        testsFailed: 0,
        coverageChange: 0.1,
        securityIssues: 0,
        performanceMs: 1000,
      },
    });

    const action = await hook.onTaskCompleted(result);
    expect(action.action).toBe('accept');
  });

  it('should reject when quality gates fail', async () => {
    const hook = createTaskCompletedHook({}, store);
    const result = makeResult({
      status: 'failed',
    });

    const action = await hook.onTaskCompleted(result);
    expect(action.action).toBe('reject');
    expect((action as { exitCode: number }).exitCode).toBe(2);
  });

  it('should reject when required gate fails', async () => {
    const hook = createTaskCompletedHook({}, store);
    // Pass rate below threshold and required
    const result = makeResult({
      metrics: {
        testsPassed: 1,
        testsFailed: 9,
        securityIssues: 0,
        coverageChange: 0,
        performanceMs: 1000,
      },
    });

    const action = await hook.onTaskCompleted(result);
    expect(action.action).toBe('reject');
  });

  // ---------- Pattern extraction ----------

  it('should extract patterns from test-generation domain', async () => {
    const hook = createTaskCompletedHook({}, store);
    const result = makeResult({
      domain: 'test-generation',
      output: {
        testCode: 'describe("suite", () => { it("works", () => expect(true)); });',
        template: 'vitest template content here with enough chars',
      },
      metrics: { testsPassed: 10, testsFailed: 0, securityIssues: 0 },
    });

    const action = await hook.onTaskCompleted(result);
    expect(action.action).toBe('accept');
    expect((action as { patternsExtracted: number }).patternsExtracted).toBeGreaterThan(0);
    expect(store.store).toHaveBeenCalled();
  });

  it('should extract patterns from security-compliance domain', async () => {
    const hook = createTaskCompletedHook({}, store);
    const result = makeResult({
      domain: 'security-compliance',
      output: {
        findings: 'Found XSS vulnerability in input handling component',
        fixes: 'Applied sanitization using DOMPurify library throughout',
      },
      metrics: { testsPassed: 5, testsFailed: 0, securityIssues: 0 },
    });

    const action = await hook.onTaskCompleted(result);
    expect(action.action).toBe('accept');
    expect((action as { patternsExtracted: number }).patternsExtracted).toBeGreaterThan(0);

    const storedPattern = store.store.mock.calls[0][0] as ExtractedPattern;
    expect(storedPattern.domain).toBe('security-compliance');
  });

  it('should use generic fallback for unconfigured but listed domains', async () => {
    // A domain in patternDomains but not in EXTRACTION_STRATEGIES would
    // require custom patternDomains config. We'll test extractPatterns directly.
    const hook = new TaskCompletedHook(
      { patternDomains: ['custom-domain'] },
      store,
    );
    const result = makeResult({
      domain: 'custom-domain',
      output: {
        analysis: 'Some detailed analysis content that is long enough to extract',
      },
      metrics: { testsPassed: 5, testsFailed: 0, securityIssues: 0 },
    });

    const patterns = hook.extractPatterns(result);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].type).toBe('generic');
    expect(patterns[0].domain).toBe('custom-domain');
  });

  it('should call patternStore.store with extracted patterns', async () => {
    const hook = createTaskCompletedHook({}, store);
    const result = makeResult({
      domain: 'test-generation',
      output: {
        testCode: 'describe("test", () => { it("should work", () => {}); });',
      },
      metrics: { testsPassed: 10, testsFailed: 0, securityIssues: 0 },
    });

    await hook.onTaskCompleted(result);
    expect(store.store).toHaveBeenCalled();
    expect(store.recordOutcome).toHaveBeenCalled();

    // Verify recordOutcome was called with success=true for completed tasks
    const outcomeCall = store.recordOutcome.mock.calls[0];
    expect(outcomeCall[1]).toBe(true); // success = true because status is 'completed'
  });

  // ---------- Completion callbacks ----------

  it('should fire completion callbacks on accept', async () => {
    const handler = vi.fn();
    const hook = createTaskCompletedHook({}, store);
    hook.onCompletion(handler);

    const result = makeResult({
      metrics: { testsPassed: 10, testsFailed: 0, securityIssues: 0, performanceMs: 1000 },
    });
    await hook.onTaskCompleted(result);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('task-1', expect.objectContaining({ action: 'accept' }));
  });

  it('should fire completion callbacks on reject', async () => {
    const handler = vi.fn();
    const hook = createTaskCompletedHook({}, store);
    hook.onCompletion(handler);

    const result = makeResult({ status: 'failed' });
    await hook.onTaskCompleted(result);

    expect(handler).toHaveBeenCalledWith('task-1', expect.objectContaining({ action: 'reject' }));
  });

  it('should allow removing a completion handler', async () => {
    const handler = vi.fn();
    const hook = createTaskCompletedHook({}, store);
    hook.onCompletion(handler);
    hook.offCompletion(handler);

    await hook.onTaskCompleted(makeResult());
    expect(handler).not.toHaveBeenCalled();
  });

  it('should not fire callbacks when emitEvents is false', async () => {
    const handler = vi.fn();
    const hook = createTaskCompletedHook({ emitEvents: false }, store);
    hook.onCompletion(handler);

    await hook.onTaskCompleted(makeResult({
      metrics: { testsPassed: 10, testsFailed: 0, securityIssues: 0, performanceMs: 1000 },
    }));
    expect(handler).not.toHaveBeenCalled();
  });

  // ---------- Stats tracking ----------

  it('should track accepted/rejected/patternsExtracted stats', async () => {
    const hook = createTaskCompletedHook({}, store);

    // Accepted task
    await hook.onTaskCompleted(makeResult({
      metrics: { testsPassed: 10, testsFailed: 0, securityIssues: 0, performanceMs: 1000 },
    }));

    // Rejected task
    await hook.onTaskCompleted(makeResult({ status: 'failed', taskId: 'task-fail' }));

    const stats = hook.getStats();
    expect(stats.totalProcessed).toBe(2);
    expect(stats.accepted).toBe(1);
    expect(stats.rejected).toBe(1);
  });

  it('should reset stats correctly', async () => {
    const hook = createTaskCompletedHook({}, store);
    await hook.onTaskCompleted(makeResult({
      metrics: { testsPassed: 10, testsFailed: 0, securityIssues: 0, performanceMs: 1000 },
    }));
    hook.resetStats();

    const stats = hook.getStats();
    expect(stats.totalProcessed).toBe(0);
    expect(stats.accepted).toBe(0);
    expect(stats.rejected).toBe(0);
    expect(stats.patternsExtracted).toBe(0);
  });

  // ---------- Config: trainPatterns ----------

  it('should skip pattern extraction when trainPatterns is false', async () => {
    const hook = createTaskCompletedHook({ trainPatterns: false }, store);
    const result = makeResult({
      domain: 'test-generation',
      output: { testCode: 'describe("suite", () => { it("works", () => {}); });' },
      metrics: { testsPassed: 10, testsFailed: 0, securityIssues: 0, performanceMs: 1000 },
    });

    const action = await hook.onTaskCompleted(result);
    expect(action.action).toBe('accept');
    expect((action as { patternsExtracted: number }).patternsExtracted).toBe(0);
    expect(store.store).not.toHaveBeenCalled();
  });

  // ---------- maxPatternsPerTask ----------

  it('should limit extraction count by maxPatternsPerTask', () => {
    const hook = new TaskCompletedHook({ maxPatternsPerTask: 2 }, store);
    const result = makeResult({
      domain: 'test-generation',
      output: {
        testCode: 'describe("a", () => { it("aaa", () => {}); });',
        template: 'template content with enough chars for extraction',
        assertions: 'assertion pattern content with enough characters',
        mocks: 'mock pattern content that is long enough to extract',
      },
      metrics: { testsPassed: 10, testsFailed: 0, securityIssues: 0 },
    });

    const patterns = hook.extractPatterns(result);
    expect(patterns.length).toBeLessThanOrEqual(2);
  });

  it('should not extract patterns from domains not in patternDomains', () => {
    const hook = new TaskCompletedHook(
      { patternDomains: ['test-generation'] },
      store,
    );
    const result = makeResult({
      domain: 'unknown-domain',
      output: { data: 'plenty of content that is long enough to extract from' },
    });

    const patterns = hook.extractPatterns(result);
    expect(patterns).toHaveLength(0);
  });

  it('should skip content shorter than 10 characters', () => {
    const hook = new TaskCompletedHook({}, store);
    const result = makeResult({
      domain: 'test-generation',
      output: {
        testCode: 'short', // too short
        template: null,    // null
      },
    });

    const patterns = hook.extractPatterns(result);
    expect(patterns).toHaveLength(0);
  });
});
