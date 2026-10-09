import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateNextRun, isValidCronExpression } from '../../../src/cli/utils/workflow-parser.js';

describe('workflow cron mixed day-list leading character', () => {
  beforeEach(() => { vi.stubEnv('TZ', 'UTC'); });
  afterEach(() => { vi.unstubAllEnvs(); });

  // Cronie entry.c records DOM_STAR before get_list, using only the first
  // character. These forms expand to identical DOM sets but differ in how
  // the day-of-month and Monday fields combine.
  it.each([
    ['numeric first uses either day field', '0 0 1,*/2 * 1', '2026-10-11T00:00:00.000Z'],
    ['star first requires both day fields', '0 0 */2,1 * 1', '2026-10-19T00:00:00.000Z'],
  ])('%s', (_name, cron, expected) => {
    const start = new Date('2026-10-09T10:01:00Z');
    expect(isValidCronExpression(cron)).toBe(true);
    expect(calculateNextRun(cron, start).toISOString()).toBe(expected);
    expect(start.toISOString()).toBe('2026-10-09T10:01:00.000Z');
  });
});
