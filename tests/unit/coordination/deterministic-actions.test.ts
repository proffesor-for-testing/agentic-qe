/**
 * Unit tests for deterministic actions (Imp-9)
 *
 * Verifies that each built-in action:
 * 1. Works with explicit inputs (source: 'input')
 * 2. Queries the database when inputs are omitted (source: 'database')
 * 3. Degrades gracefully when DB is unavailable
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  findDeterministicAction,
  getAllDeterministicActions,
} from '../../../src/coordination/deterministic-actions.js';
import type { WorkflowContext } from '../../../src/coordination/workflow-types.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeContext(overrides?: Partial<WorkflowContext>): WorkflowContext {
  return {
    input: {},
    results: {},
    metadata: {
      executionId: 'test-exec-1',
      workflowId: 'test-workflow-1',
      startedAt: new Date(),
    },
    ...overrides,
  };
}

// ============================================================================
// DB Mock Helpers
// ============================================================================

/**
 * Mock the unified memory module so deterministic actions see a fake DB.
 * Call restore() in afterEach.
 */
function mockUnifiedMemory(rows: Record<string, unknown>) {
  const mockPrepare = vi.fn().mockImplementation((sql: string) => ({
    get: vi.fn().mockImplementation(() => {
      // Return different rows based on the table being queried
      if (sql.includes('coverage_sessions')) return rows.coverage ?? undefined;
      if (sql.includes('test_outcomes') && sql.includes('SUM')) return rows.testOutcomes ?? undefined;
      if (sql.includes('test_outcomes') && sql.includes('bugs')) return rows.bugs ?? undefined;
      if (sql.includes('qe_patterns')) return rows.patterns ?? undefined;
      if (sql.includes('routing_outcomes')) return rows.routing ?? undefined;
      return undefined;
    }),
    all: vi.fn().mockReturnValue([]),
  }));

  const mockDb = { prepare: mockPrepare };
  const mockManager = {
    isInitialized: vi.fn().mockReturnValue(true),
    getDatabase: vi.fn().mockReturnValue(mockDb),
  };

  // Mock the require() call inside tryGetDb
  vi.doMock('../../../src/kernel/unified-memory.js', () => ({
    getUnifiedMemory: () => mockManager,
  }));

  return { mockDb, mockPrepare, mockManager };
}

// ============================================================================
// Registry Tests
// ============================================================================

describe('deterministic-actions registry', () => {
  it('should have all four built-in actions', () => {
    const actions = getAllDeterministicActions();
    expect(actions.length).toBe(4);

    const ids = actions.map((a) => a.id);
    expect(ids).toContain('quality-gate-check');
    expect(ids).toContain('coverage-threshold');
    expect(ids).toContain('pattern-health');
    expect(ids).toContain('routing-accuracy');
  });

  it('should find action by domain + action', () => {
    const action = findDeterministicAction('quality-assessment', 'gate-check');
    expect(action).toBeDefined();
    expect(action!.id).toBe('quality-gate-check');
  });

  it('should return undefined for unknown domain/action', () => {
    const action = findDeterministicAction('quality-assessment', 'nonexistent');
    expect(action).toBeUndefined();
  });
});

// ============================================================================
// Quality Gate Check
// ============================================================================

describe('quality-gate-check action', () => {
  it('should pass when all thresholds are met (explicit input)', async () => {
    const action = findDeterministicAction('quality-assessment', 'gate-check')!;
    const result = await action.execute(
      {
        coverageMin: 80,
        testsPassingMin: 90,
        maxBugs: 5,
        currentCoverage: 85,
        currentTestsPassingRate: 95,
        currentBugs: 2,
      },
      makeContext(),
    );

    expect(result.success).toBe(true);
    const data = result.value;
    expect(data.passed).toBe(true);
    expect(data.score).toBeGreaterThan(0);
    expect(data.source).toBe('input');
    expect(data.details).toBeDefined();
  });

  it('should fail when coverage is below threshold', async () => {
    const action = findDeterministicAction('quality-assessment', 'gate-check')!;
    const result = await action.execute(
      {
        coverageMin: 80,
        testsPassingMin: 90,
        maxBugs: 5,
        currentCoverage: 50,
        currentTestsPassingRate: 95,
        currentBugs: 2,
      },
      makeContext(),
    );

    expect(result.success).toBe(true);
    const data = result.value;
    expect(data.passed).toBe(false);
    expect((data.details as Record<string, unknown> & { coverage: { passed: boolean } }).coverage.passed).toBe(false);
  });

  it('should use defaults and report database source when no input provided', async () => {
    const action = findDeterministicAction('quality-assessment', 'gate-check')!;
    const result = await action.execute({}, makeContext());

    expect(result.success).toBe(true);
    const data = result.value;
    // With no DB available and no inputs, defaults to 0 → fails
    expect(data.passed).toBe(false);
    expect(typeof data.score).toBe('number');
    expect(data.source).toBe('database');
  });

  it('should handle maxBugs=0 edge case', async () => {
    const action = findDeterministicAction('quality-assessment', 'gate-check')!;
    const result = await action.execute(
      { maxBugs: 0, currentBugs: 0, currentCoverage: 100, currentTestsPassingRate: 100 },
      makeContext(),
    );
    expect(result.success).toBe(true);
    expect(result.value.passed).toBe(true);

    // maxBugs=0 with bugs>0 should fail
    const result2 = await action.execute(
      { maxBugs: 0, currentBugs: 1, currentCoverage: 100, currentTestsPassingRate: 100 },
      makeContext(),
    );
    expect(result2.success).toBe(true);
    expect(result2.value.passed).toBe(false);
  });
});

// ============================================================================
// Coverage Threshold Check
// ============================================================================

describe('coverage-threshold action', () => {
  it('should pass when coverage meets threshold (explicit input)', async () => {
    const action = findDeterministicAction('coverage-analysis', 'threshold-check')!;
    const result = await action.execute(
      { minCoverage: 80, currentCoverage: 90 },
      makeContext(),
    );

    expect(result.success).toBe(true);
    const data = result.value;
    expect(data.passed).toBe(true);
    expect(data.gap).toBe(0);
    expect(data.currentCoverage).toBe(90);
    expect(data.source).toBe('input');
  });

  it('should fail and report gap when below threshold', async () => {
    const action = findDeterministicAction('coverage-analysis', 'threshold-check')!;
    const result = await action.execute(
      { minCoverage: 80, currentCoverage: 65 },
      makeContext(),
    );

    expect(result.success).toBe(true);
    const data = result.value;
    expect(data.passed).toBe(false);
    expect(data.gap).toBe(15);
  });

  it('should report database source when inputs omitted', async () => {
    const action = findDeterministicAction('coverage-analysis', 'threshold-check')!;
    const result = await action.execute({}, makeContext());

    expect(result.success).toBe(true);
    const data = result.value;
    expect(data.currentCoverage).toBe(0); // no DB available → 0
    expect(data.passed).toBe(false);
    expect(data.source).toBe('database');
  });
});

// ============================================================================
// Pattern Health Check
// ============================================================================

describe('pattern-health action', () => {
  it('should compute a health score from explicit stats', async () => {
    const action = findDeterministicAction('learning-optimization', 'health-check')!;
    const result = await action.execute(
      { totalPatterns: 100, activePatterns: 80, avgConfidence: 0.9 },
      makeContext(),
    );

    expect(result.success).toBe(true);
    const data = result.value;
    expect(data.healthScore).toBeGreaterThan(0);
    expect(data.healthScore).toBeLessThanOrEqual(1);
    expect(data.totalPatterns).toBe(100);
    expect(data.activePatterns).toBe(80);
    expect(data.source).toBe('input');
  });

  it('should return zero health for empty state and database source', async () => {
    const action = findDeterministicAction('learning-optimization', 'health-check')!;
    const result = await action.execute({}, makeContext());

    expect(result.success).toBe(true);
    const data = result.value;
    expect(data.healthScore).toBe(0);
    expect(data.totalPatterns).toBe(0);
    expect(data.source).toBe('database');
  });
});

// ============================================================================
// Routing Accuracy Check
// ============================================================================

describe('routing-accuracy action', () => {
  it('should compute success rate from explicit outcomes', async () => {
    const action = findDeterministicAction('learning-optimization', 'routing-check')!;
    const result = await action.execute(
      { totalOutcomes: 200, successfulOutcomes: 180, confidenceCorrelation: 0.85 },
      makeContext(),
    );

    expect(result.success).toBe(true);
    const data = result.value;
    expect(data.successRate).toBe(90);
    expect(data.totalOutcomes).toBe(200);
    expect(data.confidenceCorrelation).toBe(0.85);
    expect(data.source).toBe('input');
  });

  it('should handle zero outcomes gracefully and report database source', async () => {
    const action = findDeterministicAction('learning-optimization', 'routing-check')!;
    const result = await action.execute({}, makeContext());

    expect(result.success).toBe(true);
    const data = result.value;
    expect(data.successRate).toBe(0);
    expect(data.totalOutcomes).toBe(0);
    expect(data.source).toBe('database');
  });
});
