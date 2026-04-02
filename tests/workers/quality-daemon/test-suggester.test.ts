/**
 * Tests for the QE Quality Daemon Test Suggester (IMP-10).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TestSuggester } from '../../../src/workers/quality-daemon/test-suggester';
import type { CoverageGap } from '../../../src/workers/quality-daemon/coverage-delta';
import type { WorkerMemory } from '../../../src/workers/interfaces';

function createMockMemory(): WorkerMemory {
  const store = new Map<string, unknown>();
  return {
    async get<T>(key: string): Promise<T | undefined> {
      return store.get(key) as T | undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      store.set(key, value);
    },
    async search(pattern: string): Promise<string[]> {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return Array.from(store.keys()).filter((k) => regex.test(k));
    },
  };
}

describe('TestSuggester', () => {
  let suggester: TestSuggester;
  let memory: WorkerMemory;

  beforeEach(() => {
    suggester = new TestSuggester({ minRiskScore: 0.3 });
    memory = createMockMemory();
  });

  // -------------------------------------------------------------------------
  // suggest()
  // -------------------------------------------------------------------------

  it('generates suggestions for gaps above risk threshold', async () => {
    const gaps: CoverageGap[] = [
      { file: 'src/foo.ts', uncoveredLines: [1, 2, 3], currentCoverage: 40, riskScore: 0.8 },
      { file: 'src/bar.ts', uncoveredLines: [5], currentCoverage: 90, riskScore: 0.1 },
    ];

    const suggestions = await suggester.suggest(gaps, ['src/foo.ts'], memory);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].file).toBe('src/foo.ts');
  });

  it('sets high priority for high-risk gaps', async () => {
    const gaps: CoverageGap[] = [
      { file: 'src/critical.ts', uncoveredLines: Array.from({ length: 30 }, (_, i) => i), currentCoverage: 20, riskScore: 0.9 },
    ];

    const suggestions = await suggester.suggest(gaps, [], memory);
    expect(suggestions[0].priority).toBe('high');
  });

  it('sets medium priority for recently changed files', async () => {
    const gaps: CoverageGap[] = [
      { file: 'src/changed.ts', uncoveredLines: [1, 2], currentCoverage: 55, riskScore: 0.4 },
    ];

    const suggestions = await suggester.suggest(gaps, ['src/changed.ts'], memory);
    expect(suggestions[0].priority).toBe('medium');
  });

  it('sorts suggestions by priority (high first)', async () => {
    const gaps: CoverageGap[] = [
      { file: 'src/low.ts', uncoveredLines: [1], currentCoverage: 70, riskScore: 0.35 },
      { file: 'src/high.ts', uncoveredLines: Array.from({ length: 40 }, (_, i) => i), currentCoverage: 10, riskScore: 0.95 },
      { file: 'src/med.ts', uncoveredLines: [1, 2, 3], currentCoverage: 50, riskScore: 0.6 },
    ];

    const suggestions = await suggester.suggest(gaps, ['src/med.ts'], memory);
    expect(suggestions[0].priority).toBe('high');
    expect(suggestions[1].priority).toBe('medium');
    expect(suggestions[2].priority).toBe('low');
  });

  it('determines test type from file path', async () => {
    const gaps: CoverageGap[] = [
      { file: 'src/api/users.ts', uncoveredLines: [1], currentCoverage: 50, riskScore: 0.5 },
      { file: 'src/utils/calc.ts', uncoveredLines: [1], currentCoverage: 50, riskScore: 0.5 },
    ];

    const suggestions = await suggester.suggest(gaps, [], memory);
    expect(suggestions.find((s) => s.file.includes('api'))!.suggestedTestType).toBe('integration');
    expect(suggestions.find((s) => s.file.includes('utils'))!.suggestedTestType).toBe('unit');
  });

  // -------------------------------------------------------------------------
  // getPending()
  // -------------------------------------------------------------------------

  it('retrieves pending suggestions from memory', async () => {
    const gaps: CoverageGap[] = [
      { file: 'src/a.ts', uncoveredLines: [1], currentCoverage: 40, riskScore: 0.6 },
    ];
    await suggester.suggest(gaps, [], memory);

    const pending = await suggester.getPending(memory);
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe('pending');
  });

  it('returns empty array when no suggestions exist', async () => {
    const pending = await suggester.getPending(memory);
    expect(pending).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // updateStatus()
  // -------------------------------------------------------------------------

  it('updates suggestion status to accepted', async () => {
    const gaps: CoverageGap[] = [
      { file: 'src/a.ts', uncoveredLines: [1], currentCoverage: 40, riskScore: 0.6 },
    ];
    const suggestions = await suggester.suggest(gaps, [], memory);

    const updated = await suggester.updateStatus(suggestions[0].id, 'accepted', memory);
    expect(updated).toBe(true);

    const pending = await suggester.getPending(memory);
    expect(pending).toHaveLength(0);
  });

  it('returns false for non-existent suggestion id', async () => {
    const updated = await suggester.updateStatus('nonexistent', 'dismissed', memory);
    expect(updated).toBe(false);
  });

  // -------------------------------------------------------------------------
  // effort estimation
  // -------------------------------------------------------------------------

  it('estimates small effort for few uncovered lines', async () => {
    const gaps: CoverageGap[] = [
      { file: 'src/tiny.ts', uncoveredLines: [1, 2, 3], currentCoverage: 50, riskScore: 0.5 },
    ];
    const suggestions = await suggester.suggest(gaps, [], memory);
    expect(suggestions[0].estimatedEffort).toBe('small');
  });

  it('estimates large effort for many uncovered lines', async () => {
    const gaps: CoverageGap[] = [
      { file: 'src/big.ts', uncoveredLines: Array.from({ length: 60 }, (_, i) => i), currentCoverage: 20, riskScore: 0.9 },
    ];
    const suggestions = await suggester.suggest(gaps, [], memory);
    expect(suggestions[0].estimatedEffort).toBe('large');
  });
});
