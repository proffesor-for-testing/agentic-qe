import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runSemgrep, convertSemgrepFindings } from '../../../../src/domains/security-compliance/services/semgrep-integration.js';

const boundary = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('child_process', () => ({
  execFile: Object.assign(vi.fn(), { [Symbol.for('nodejs.util.promisify.custom')]: boundary.execute }),
}));

describe('Semgrep execution outcome evidence', () => {
  beforeEach(() => {
    boundary.execute.mockReset();
    boundary.execute.mockImplementation(async (_command: string, args: string[]) => {
      if (args[0] === '--version') return { stdout: '1.99.0\n', stderr: '' };
      return { stdout: JSON.stringify({ results: [], errors: [] }), stderr: '' };
    });
  });

  const output = (stdout: string) => boundary.execute.mockImplementation(async (_command: string, args: string[]) => (
    args[0] === '--version' ? { stdout: '1.99.0\n', stderr: '' } : { stdout, stderr: '' }
  ));

  it('rejects syntactically valid output without a findings collection', async () => {
    output('{}');
    const result = await runSemgrep({ target: '/isolated-fixture' });
    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
  });

  it('does not call a scan complete when Semgrep reports execution errors', async () => {
    output(JSON.stringify({ results: [], errors: [{ message: 'fixture parse failure' }] }));
    const result = await runSemgrep({ target: '/isolated-fixture' });
    expect(result.success).toBe(false);
    expect(result.status).toBe('partial');
    expect(result.errors).toHaveLength(1);
  });

  it('preserves a nonzero execution failure even with parseable output', async () => {
    boundary.execute.mockImplementation(async (_command: string, args: string[]) => {
      if (args[0] === '--version') return { stdout: '1.99.0\n', stderr: '' };
      throw Object.assign(new Error('fixture process failed'), { code: 2, stdout: JSON.stringify({ results: [], errors: [] }) });
    });
    const result = await runSemgrep({ target: '/isolated-fixture' });
    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
  });

  it('records a legitimate zero-finding run as completed', async () => {
    const result = await runSemgrep({ target: '/isolated-fixture' });
    expect(result).toMatchObject({ success: true, status: 'completed', findings: [], errors: [], version: '1.99.0' });
  });

  it('reports absence separately from malformed output or clean execution', async () => {
    boundary.execute.mockRejectedValue(Object.assign(new Error('not installed'), { code: 'ENOENT' }));
    const result = await runSemgrep({ target: '/isolated-fixture' });
    expect(result).toMatchObject({ success: false, status: 'unavailable', findings: [] });
    expect(boundary.execute).toHaveBeenCalledTimes(1);
  });

  it.each(['not json', 'null', '[]', '{"results":{}}'])('rejects malformed output %s', async (stdout) => {
    output(stdout);
    const result = await runSemgrep({ target: '/isolated-fixture' });
    expect(result).toMatchObject({ success: false, status: 'failed', findings: [] });
  });

  it('retains valid findings when other results or engine work fail', async () => {
    output(JSON.stringify({ results: [
      { check_id: 'fixture.rule', path: '/isolated-fixture/a.ts', start: { line: 1, col: 1 }, extra: { message: 'Fixture finding' } },
      { check_id: 'missing.path' },
    ], errors: [{ message: 'private source contents' }] }));
    const result = await runSemgrep({ target: '/isolated-fixture' });
    expect(result).toMatchObject({ success: false, status: 'partial' });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].check_id).toBe('fixture.rule');
    expect(result.errors.join(' ')).not.toContain('private source contents');
  });

  it('retains findings but rejects a killed process as completed analysis', async () => {
    boundary.execute.mockImplementation(async (_command: string, args: string[]) => {
      if (args[0] === '--version') return { stdout: '1.99.0\n', stderr: '' };
      throw Object.assign(new Error('timeout'), { code: 1, killed: true,
        stdout: JSON.stringify({ results: [{ check_id: 'fixture.rule', path: '/isolated-fixture/a.ts' }], errors: [] }) });
    });
    const result = await runSemgrep({ target: '/isolated-fixture' });
    expect(result).toMatchObject({ success: false, status: 'failed' });
    expect(result.findings).toHaveLength(1);
  });

  it('preserves an exit-one findings result without treating exit two as equivalent', async () => {
    boundary.execute.mockImplementation(async (_command: string, args: string[]) => {
      if (args[0] === '--version') return { stdout: '1.99.0\n', stderr: '' };
      throw Object.assign(new Error('findings'), { code: 1,
        stdout: JSON.stringify({ results: [{ check_id: 'fixture.rule', path: '/isolated-fixture/a.ts' }], errors: [] }) });
    });
    expect(await runSemgrep({ target: '/isolated-fixture' })).toMatchObject({ success: true, status: 'completed' });
  });


  it.each([
    { check_id: '' },
    { start: { line: 'not-a-number' } },
    { start: { line: 0 } },
    { extra: { message: {} } },
    { extra: { metadata: { owasp: [123] } } },
    { extra: { metadata: { references: 'not-an-array' } } },
    { metadata: { category: 123 } },
    { extra: { severity: 'NOT_A_SEVERITY' } },
  ])('isolates malformed finding fields without losing valid findings: %j', async (malformed) => {
    output(JSON.stringify({ results: [
      { check_id: 'valid.rule', path: '/isolated-fixture/a.ts', extra: { message: 'Valid finding' } },
      { check_id: 'bad.rule', path: '/isolated-fixture/b.ts', ...malformed },
    ], errors: [] }));
    const result = await runSemgrep({ target: '/isolated-fixture' });
    expect(result).toMatchObject({ success: false, status: 'partial' });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].check_id).toBe('valid.rule');
    expect(() => convertSemgrepFindings(result.findings)).not.toThrow();
  });


  it('keeps verbose diagnostics separate from successful analysis status', async () => {
    boundary.execute.mockImplementation(async (_command: string, args: string[]) => {
      if (args[0] === '--version') return { stdout: '1.99.0\n', stderr: '' };
      return { stdout: JSON.stringify({ results: [], errors: [] }), stderr: 'private diagnostic contents' };
    });
    const result = await runSemgrep({ target: '/isolated-fixture', verbose: true });
    expect(result).toMatchObject({ success: true, status: 'completed', errors: [],
      diagnostics: ['Semgrep emitted diagnostic output.'] });
    expect(JSON.stringify(result)).not.toContain('private diagnostic contents');
  });


  it.each([
    ['ERROR', 'high'], ['WARNING', 'medium'], ['INFO', 'low'],
    ['CRITICAL', 'critical'], ['HIGH', 'high'], ['MEDIUM', 'medium'], ['LOW', 'low'],
    ['EXPERIMENT', 'low'], ['INVENTORY', 'low'],
  ])('preserves supported Semgrep severity %s as %s', async (severity, expected) => {
    output(JSON.stringify({ results: [{ check_id: 'valid.rule', path: '/isolated-fixture/a.ts',
      extra: { severity, message: 'A supported severity' } }], errors: [] }));
    const result = await runSemgrep({ target: '/isolated-fixture' });
    expect(result).toMatchObject({ success: true, status: 'completed' });
    expect(convertSemgrepFindings(result.findings)[0].severity).toBe(expected);
  });

});
