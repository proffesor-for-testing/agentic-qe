import { describe, expect, it } from 'vitest';
import { sanitizeJudgeMeasurementReceipt } from '../../../../src/verification/adversarial-verify/measurement-receipt.js';

describe('sanitizeJudgeMeasurementReceipt', () => {
  it.each([
    ['requestId', 'req:sk'],
    ['fingerprint', 'fp:ghp'],
    ['windowId', 'window:eyJhbGciOiJIUzI1NiJ9.e30.sig'],
    ['requestId', `req:${'A'.repeat(48)}`],
  ] as const)('should redact a wrapped secret in %s without copying it elsewhere', (field, value) => {
    const sanitized = sanitizeJudgeMeasurementReceipt({ [field]: value });

    expect(sanitized[field]).toBe('UNKNOWN');
    expect(Object.values(sanitized)).not.toContain(value);
  });

  it.each([
    '2026-02-30T00:00:00Z',
    '2025-02-29T00:00:00Z',
    '2026-13-01T00:00:00Z',
    '2026-01-01T24:00:00Z',
  ])('should redact impossible timestamp %s', (timestamp) => {
    expect(sanitizeJudgeMeasurementReceipt({ timestamp }).timestamp).toBe('UNKNOWN');
  });

  it('should preserve a valid leap-day UTC timestamp', () => {
    const timestamp = '2024-02-29T23:59:59.123456789Z';

    expect(sanitizeJudgeMeasurementReceipt({ timestamp }).timestamp).toBe(timestamp);
  });
});
