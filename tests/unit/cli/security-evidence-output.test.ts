import { describe, expect, it } from 'vitest';
import { securityToMarkdown, toSARIF, type SecurityScanResult } from '../../../src/cli/utils/ci-output.js';

describe('security output execution dispositions', () => {
  const finding = { severity: 'high', type: 'Injection', file: 'source.ts', line: 4, message: 'Actual finding' };

  it.each(['partial', 'none', 'failed', 'not-run', 'unverified'] as const)('retains %s in SARIF without discarding findings', status => {
    const result: SecurityScanResult = { vulnerabilities: [finding], target: '.', scanType: 'SAST', status, checks: [{ name: 'SAST', status }] };
    const run = JSON.parse(toSARIF(result)).runs[0];
    expect(run.invocations[0].executionSuccessful).toBe(false);
    expect(run.invocations[0].toolExecutionNotifications[0].message.text).toContain(status);
    expect(run.properties.securityScan).toMatchObject({ status, checks: result.checks });
    expect(run.results[0].message.text).toBe(finding.message);
    expect(securityToMarkdown(result)).toContain(`**Execution:** ${status}`);
  });

  it('preserves declared complete execution independently from high-severity findings', () => {
    const result: SecurityScanResult = { vulnerabilities: [finding], target: '.', scanType: 'SAST', status: 'complete', checks: [{ name: 'SAST', status: 'complete' }] };
    const run = JSON.parse(toSARIF(result)).runs[0];
    expect(run.invocations[0].executionSuccessful).toBe(true);
    expect(run.results[0].level).toBe('error');
  });

  it('leaves receipt-less legacy reports explicitly unverified', () => {
    const result: SecurityScanResult = { vulnerabilities: [], target: '.', scanType: 'SAST', coverage: { filesScanned: 999, linesScanned: 9999, rulesApplied: 99 } };
    const run = JSON.parse(toSARIF(result)).runs[0];
    expect(run.invocations[0].executionSuccessful).toBe(false);
    expect(run.properties.securityScan).not.toHaveProperty('coverage');
    expect(securityToMarkdown(result)).toContain('**Execution:** unverified');
    expect(securityToMarkdown(result)).not.toContain('999');
  });
});
