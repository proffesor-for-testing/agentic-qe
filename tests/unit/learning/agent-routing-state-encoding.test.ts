/**
 * Regression guard for the routing state encoder (audit of ruflo #2239 —
 * "state-encoder feature truncation").
 *
 * ruflo's bug folded a feature vector with `(hash << 4) ^ q[i] & 0x7fffffff`,
 * shifting an entire feature block past the 31-bit mask so every
 * keyword-distinct task collapsed into ONE state.
 *
 * AQE does NOT fold a quantized feature vector. `buildRoutingStateKey`
 * concatenates `taskType|priority|domain` as plain strings, and `taskType`
 * is derived from description keywords by `deriveTaskType`. These tests lock
 * in that distinct task semantics produce distinct state keys, so a future
 * refactor toward a bit-folding encoder would fail here.
 */

import { describe, it, expect } from 'vitest';
import { deriveTaskType, buildRoutingStateKey } from '../../../src/learning/agent-routing.js';

describe('routing state encoder — no feature collapse (ruflo #2239 guard)', () => {
  it('maps keyword-distinct tasks to distinct taskTypes', () => {
    expect(deriveTaskType('write code for the parser')).not.toBe(
      deriveTaskType('fix bug in the parser'),
    );
    expect(deriveTaskType('generate tests for the parser')).toBe('test-generation');
    expect(deriveTaskType('fix bug in the parser')).toBe('defect-intelligence');
    expect(deriveTaskType('analyze coverage gaps')).toBe('coverage-analysis');
    expect(deriveTaskType('audit security vulnerabilities')).toBe('quality-assessment');
  });

  it('produces distinct state keys for tasks differing only in keyword content', () => {
    const keys = new Set(
      [
        'generate tests for the parser',
        'fix bug in the parser',
        'analyze coverage gaps',
        'validate requirements spec',
        'refactor the module',
      ].map((task) =>
        buildRoutingStateKey({
          taskType: deriveTaskType(task),
          priority: 'normal',
          domain: 'test-generation',
        }),
      ),
    );
    // 5 keyword-distinct tasks must yield 5 distinct keys — never collapse to 1.
    expect(keys.size).toBe(5);
  });

  it('preserves the full state key (taskType + priority + domain), no truncation/mask', () => {
    const key = buildRoutingStateKey({
      taskType: 'security-compliance',
      priority: 'high',
      domain: 'security-compliance',
    });
    // All three segments survive — nothing is shifted past a bit mask.
    expect(key).toBe('security-compliance|high|security-compliance');
    expect(key.split('|')).toHaveLength(3);
  });

  it('distinguishes states that differ only in a later segment (domain)', () => {
    const a = buildRoutingStateKey({ taskType: 'test-generation', priority: 'normal', domain: 'test-generation' });
    const b = buildRoutingStateKey({ taskType: 'test-generation', priority: 'normal', domain: 'coverage-analysis' });
    expect(a).not.toBe(b);
  });
});
