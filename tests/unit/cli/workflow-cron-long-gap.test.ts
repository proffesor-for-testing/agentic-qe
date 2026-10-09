import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateNextRun, isValidCronExpression } from '../../../src/cli/utils/workflow-parser.js';

describe('workflow cron Gregorian-cycle and Date boundaries', () => {
  beforeEach(() => { vi.stubEnv('TZ', 'UTC'); });
  afterEach(() => { vi.unstubAllEnvs(); });

  // The leading star in DOW requires DOM AND DOW. February 29 on Sunday
  // follows a longer cycle than leap days alone; 2100 is not a leap year.
  it.each([
    ['forty-year Sunday leap-day gap', '2088-02-29T00:00:00Z'],
    ['century-crossing thirty-two-year gap', '2096-03-01T00:00:00Z'],
  ])('finds the next match across the %s', (_name, from) => {
    const cron = '0 0 29 2 */7';
    const start = new Date(from);
    expect(isValidCronExpression(cron)).toBe(true);
    expect(calculateNextRun(cron, start).toISOString()).toBe('2128-02-29T00:00:00.000Z');
    expect(start.toISOString()).toBe(new Date(from).toISOString());
  });

  it('bounds an impossible calendar search over a complete Gregorian cycle', () => {
    expect(() => calculateNextRun('0 0 31 2 *', new Date('2026-10-09T10:01:00Z'))).toThrow(/No matching cron date/);
  });

  it('reports no representable future minute at the Date maximum', () => {
    const start = new Date(8_640_000_000_000_000);
    expect(() => calculateNextRun('* * * * *', start)).toThrow(/Date range/);
    expect(start.getTime()).toBe(8_640_000_000_000_000);
  });

  it('bounds an impossible date when the complete cycle exceeds the Date range', () => {
    expect(() => calculateNextRun('0 0 31 2 *', new Date(8_640_000_000_000_000 - 60000))).toThrow(/Date range/);
  });

  it('retains the last representable minute as a valid next match', () => {
    const start = new Date(8_640_000_000_000_000 - 60000);
    expect(calculateNextRun('* * * * *', start).getTime()).toBe(8_640_000_000_000_000);
    expect(start.getTime()).toBe(8_640_000_000_000_000 - 60000);
  });
});
