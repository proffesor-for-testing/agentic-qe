/**
 * Unit tests for ReasoningBankPatternStore
 * ADR-064 Phase 3: Learning & Observability
 *
 * Tests the adapter that bridges TaskCompletedHook's PatternStore
 * to QEReasoningBank's learning pipeline.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ReasoningBankPatternStore,
  createReasoningBankPatternStore,
} from '../../src/hooks/reasoning-bank-pattern-store.js';
import type { ExtractedPattern } from '../../src/hooks/task-completed-hook.js';
import type { IQEReasoningBank } from '../../src/learning/qe-reasoning-bank.js';
import { TaskCompletedHook, createTaskCompletedHook } from '../../src/hooks/task-completed-hook.js';
import type { TaskResult } from '../../src/hooks/quality-gate-enforcer.js';

// ============================================================================
// Mock Factory
// ============================================================================

function createMockReasoningBank(): IQEReasoningBank & {
  storePattern: ReturnType<typeof vi.fn>;
  recordOutcome: ReturnType<typeof vi.fn>;
} {
  let counter = 0;
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    storePattern: vi.fn().mockImplementation(async (options) => ({
      success: true,
      value: {
        id: `qe-pattern-${++counter}`,
        patternType: options.patternType,
        name: options.name,
        qeDomain: 'test-generation',
        domain: 'test-generation',
        description: options.description,
        confidence: 0.5,
        usageCount: 0,
        successRate: 0,
        qualityScore: 0.5,
        context: options.context || { tags: [] },
        template: options.template,
        tier: 'short-term' as const,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        successfulUses: 0,
        reusable: false,
        reuseCount: 0,
        averageTokenSavings: 0,
      },
    })),
    searchPatterns: vi.fn().mockResolvedValue({ success: true, value: [] }),
    getPattern: vi.fn().mockResolvedValue(null),
    recordOutcome: vi.fn().mockResolvedValue({ success: true, value: undefined }),
    routeTask: vi.fn().mockResolvedValue({ success: true, value: {} }),
    getGuidance: vi.fn().mockReturnValue({}),
    generateContext: vi.fn().mockReturnValue(''),
    checkAntiPatterns: vi.fn().mockReturnValue([]),
    embed: vi.fn().mockResolvedValue(new Array(128).fill(0)),
    getStats: vi.fn().mockResolvedValue({}),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

function makePattern(overrides: Partial<ExtractedPattern> = {}): ExtractedPattern {
  return {
    domain: overrides.domain ?? 'test-generation',
    type: overrides.type ?? 'test-template',
    content: overrides.content ?? 'describe("suite", () => { it("should work", () => expect(true)); });',
    confidence: overrides.confidence ?? 0.7,
    metadata: overrides.metadata ?? {
      sourceTaskId: 'task-1',
      sourceAgent: 'agent-1',
      taskType: 'generate',
      duration: 2000,
      extractedFrom: 'testCode',
      timestamp: Date.now(),
    },
  };
}

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
  };
}

// ============================================================================
// ReasoningBankPatternStore Tests
// ============================================================================

describe('ReasoningBankPatternStore', () => {
  let bank: ReturnType<typeof createMockReasoningBank>;
  let adapter: ReasoningBankPatternStore;

  beforeEach(() => {
    bank = createMockReasoningBank();
    adapter = new ReasoningBankPatternStore(bank);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------- store() ----------

  describe('store()', () => {
    it('should delegate to reasoningBank.storePattern()', async () => {
      const pattern = makePattern();
      const id = await adapter.store(pattern);

      expect(bank.storePattern).toHaveBeenCalledTimes(1);
      expect(id).toMatch(/^qe-pattern-/);
    });

    it('should map ExtractedPattern.type to QEPatternType', async () => {
      const pattern = makePattern({ type: 'assertion-pattern' });
      await adapter.store(pattern);

      const call = bank.storePattern.mock.calls[0][0];
      expect(call.patternType).toBe('assertion-pattern');
    });

    it('should fall back to test-template for unknown types', async () => {
      const pattern = makePattern({ type: 'some-unknown-type' });
      await adapter.store(pattern);

      const call = bank.storePattern.mock.calls[0][0];
      expect(call.patternType).toBe('test-template');
    });

    it('should map security-pattern to error-handling', async () => {
      const pattern = makePattern({ type: 'security-pattern' });
      await adapter.store(pattern);

      const call = bank.storePattern.mock.calls[0][0];
      expect(call.patternType).toBe('error-handling');
    });

    it('should map api-contract type correctly', async () => {
      const pattern = makePattern({ type: 'api-contract' });
      await adapter.store(pattern);

      const call = bank.storePattern.mock.calls[0][0];
      expect(call.patternType).toBe('api-contract');
    });

    it('should map flaky-fix type correctly', async () => {
      const pattern = makePattern({ type: 'flaky-fix' });
      await adapter.store(pattern);

      const call = bank.storePattern.mock.calls[0][0];
      expect(call.patternType).toBe('flaky-fix');
    });

    it('should detect QE domain from ExtractedPattern.domain', async () => {
      const pattern = makePattern({ domain: 'security-compliance' });
      await adapter.store(pattern);

      const call = bank.storePattern.mock.calls[0][0];
      expect(call.context.tags).toContain('security-compliance');
    });

    it('should generate name from domain + type + content hash', async () => {
      const pattern = makePattern();
      await adapter.store(pattern);

      const call = bank.storePattern.mock.calls[0][0];
      expect(call.name).toMatch(/^test-generation-test-template-/);
    });

    it('should wrap content as a prompt template', async () => {
      const content = 'describe("test", () => { it("works", () => {}); });';
      const pattern = makePattern({ content });
      await adapter.store(pattern);

      const call = bank.storePattern.mock.calls[0][0];
      expect(call.template.type).toBe('prompt');
      expect(call.template.content).toBe(content);
      expect(call.template.variables).toEqual([]);
    });

    it('should pass confidence from ExtractedPattern to CreateQEPatternOptions', async () => {
      const pattern = makePattern({ confidence: 0.85 });
      await adapter.store(pattern);

      const call = bank.storePattern.mock.calls[0][0];
      expect(call.confidence).toBe(0.85);
    });

    it('should include sourceTaskId in tags', async () => {
      const pattern = makePattern({
        metadata: { sourceTaskId: 'task-42', sourceAgent: 'a' },
      });
      await adapter.store(pattern);

      const call = bank.storePattern.mock.calls[0][0];
      expect(call.context.tags).toContain('task:task-42');
    });

    it('should throw when reasoningBank.storePattern fails', async () => {
      bank.storePattern.mockResolvedValueOnce({
        success: false,
        error: new Error('Storage full'),
      });

      const pattern = makePattern();
      await expect(adapter.store(pattern)).rejects.toThrow('Storage full');
    });

    it('should throw when reasoningBank.storePattern throws', async () => {
      bank.storePattern.mockRejectedValueOnce(new Error('Connection lost'));

      const pattern = makePattern();
      await expect(adapter.store(pattern)).rejects.toThrow('Connection lost');
    });
  });

  // ---------- recordOutcome() ----------

  describe('recordOutcome()', () => {
    it('should delegate to reasoningBank.recordOutcome()', async () => {
      await adapter.recordOutcome('pattern-1', true);

      expect(bank.recordOutcome).toHaveBeenCalledWith({
        patternId: 'pattern-1',
        success: true,
      });
    });

    it('should pass success=false correctly', async () => {
      await adapter.recordOutcome('pattern-2', false);

      expect(bank.recordOutcome).toHaveBeenCalledWith({
        patternId: 'pattern-2',
        success: false,
      });
    });

    it('should not throw when recordOutcome fails (fire-and-forget)', async () => {
      bank.recordOutcome.mockResolvedValueOnce({
        success: false,
        error: new Error('Pattern not found'),
      });

      // Should not throw
      await expect(adapter.recordOutcome('bad-id', true)).resolves.toBeUndefined();
    });

    it('should not throw when recordOutcome throws (fire-and-forget)', async () => {
      bank.recordOutcome.mockRejectedValueOnce(new Error('DB error'));

      // Should not throw
      await expect(adapter.recordOutcome('bad-id', true)).resolves.toBeUndefined();
    });
  });

  // ---------- Factory ----------

  describe('createReasoningBankPatternStore()', () => {
    it('should create a ReasoningBankPatternStore instance', () => {
      const store = createReasoningBankPatternStore(bank);
      expect(store).toBeInstanceOf(ReasoningBankPatternStore);
    });
  });
});

// ============================================================================
// Integration: TaskCompletedHook + ReasoningBankPatternStore
// ============================================================================

describe('TaskCompletedHook + ReasoningBankPatternStore integration', () => {
  let bank: ReturnType<typeof createMockReasoningBank>;

  beforeEach(() => {
    bank = createMockReasoningBank();
  });

  it('should flow patterns from completed tasks to ReasoningBank', async () => {
    const adapter = new ReasoningBankPatternStore(bank);
    const hook = createTaskCompletedHook({}, adapter);

    const result = makeResult({
      domain: 'test-generation',
      output: {
        testCode: 'describe("suite", () => { it("should work", () => expect(true)); });',
      },
      metrics: { testsPassed: 10, testsFailed: 0, securityIssues: 0, performanceMs: 1000 },
    });

    const action = await hook.onTaskCompleted(result);
    expect(action.action).toBe('accept');
    expect((action as { patternsExtracted: number }).patternsExtracted).toBeGreaterThan(0);

    // Verify the bank received the pattern
    expect(bank.storePattern).toHaveBeenCalled();
    expect(bank.recordOutcome).toHaveBeenCalled();

    // Verify outcome was recorded as successful
    const outcomeCall = bank.recordOutcome.mock.calls[0][0];
    expect(outcomeCall.success).toBe(true);
  });

  it('should not train patterns when task is rejected', async () => {
    const adapter = new ReasoningBankPatternStore(bank);
    const hook = createTaskCompletedHook({}, adapter);

    const result = makeResult({ status: 'failed' });

    const action = await hook.onTaskCompleted(result);
    expect(action.action).toBe('reject');
    expect(bank.storePattern).not.toHaveBeenCalled();
  });

  it('should handle bank errors gracefully without crashing the hook', async () => {
    bank.storePattern.mockRejectedValue(new Error('Bank unavailable'));
    const adapter = new ReasoningBankPatternStore(bank);
    const hook = createTaskCompletedHook({}, adapter);

    const result = makeResult({
      domain: 'test-generation',
      output: {
        testCode: 'describe("suite", () => { it("should work", () => expect(true)); });',
      },
      metrics: { testsPassed: 10, testsFailed: 0, securityIssues: 0, performanceMs: 1000 },
    });

    // Should not throw — hook catches errors from pattern storage
    const action = await hook.onTaskCompleted(result);
    expect(action.action).toBe('accept');
    // No patterns stored since bank errored
    expect((action as { patternsExtracted: number }).patternsExtracted).toBe(0);
  });

  it('should extract multiple patterns from rich output', async () => {
    const adapter = new ReasoningBankPatternStore(bank);
    const hook = createTaskCompletedHook({}, adapter);

    const result = makeResult({
      domain: 'test-generation',
      output: {
        testCode: 'describe("UserService", () => { it("creates user", () => {}); });',
        template: 'AAA template with arrange-act-assert pattern content here',
        assertions: 'expect(user.name).toBe("test") - assertion patterns for validation',
      },
      metrics: { testsPassed: 10, testsFailed: 0, securityIssues: 0, performanceMs: 500 },
    });

    const action = await hook.onTaskCompleted(result);
    expect(action.action).toBe('accept');
    expect(bank.storePattern.mock.calls.length).toBeGreaterThan(1);
  });
});
