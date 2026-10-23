/**
 * #1145: accessibility_test must not present an audit nobody ran as a
 * failing verdict (`passed: false`, `score: 0`) without saying so. An
 * unmeasured score is -1, as elsewhere in AQE, never a 0/100 grade.
 */
import { describe, expect, it } from 'vitest';
// Side-effect import: domain-handler-configs participates in a circular import
// with domain-handlers, so the barrel must be initialized first.
import '../../../../src/mcp/handlers/domain-handlers';
import { accessibilityTestConfig } from '../../../../src/mcp/handlers/domain-handler-configs.js';

const map = (data: Record<string, unknown>) => accessibilityTestConfig.mapToResult('task-1', data, 5);

describe('accessibilityTestConfig.mapToResult (#1145)', () => {
  it('reports not-measured with the reason when no page was audited', () => {
    const result = map({
      url: 'https://example.invalid/', passed: false, score: -1, violations: [], warnings: [],
      measured: false, note: 'Accessibility NOT MEASURED: this is not a failing result.',
    });

    expect(result).toMatchObject({
      status: 'not-measured', measured: false, score: -1, violations: [],
      note: 'Accessibility NOT MEASURED: this is not a failing result.',
    });
  });

  it('fails closed when the producer does not say it measured anything', () => {
    const result = map({ passed: false, score: 0, violations: [] });

    expect(result.status).toBe('not-measured');
    expect(result.measured).toBe(false);
    expect(result.score).toBe(-1);
  });

  it('keeps a measured result completed', () => {
    const result = map({ passed: true, score: 100, violations: [], measured: true });

    expect(result).toMatchObject({ status: 'completed', measured: true, passed: true, score: 100 });
  });
});
