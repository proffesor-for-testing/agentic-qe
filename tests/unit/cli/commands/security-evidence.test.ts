import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CLIContext } from '../../../../src/cli/handlers/interfaces.js';

vi.mock('../../../../src/mcp/tools/security-compliance/visual-security.js', () => ({
  VisualSecurityTool: class {
    async invoke() {
      return { success: true, data: { urlSecurity: { valid: true, issues: [] }, piiExposure: { scanned: true, found: false }, summary: 'URL control' } };
    }
  },
}));

describe('security command execution evidence', () => {
  let createSecurityCommand: typeof import('../../../../src/cli/commands/security.js').createSecurityCommand;
  let root: string;
  let file: string;
  let stdout: string[];
  let runSASTScan: ReturnType<typeof vi.fn>;
  let runComplianceCheck: ReturnType<typeof vi.fn>;
  let cleanupAndExit: ReturnType<typeof vi.fn>;
  const originalRoot = process.env.AQE_PROJECT_ROOT;
  const originalBackend = process.env.AQE_MEMORY_BACKEND;

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'aqe-security-cli-'));
    process.env.AQE_PROJECT_ROOT = root;
    process.env.AQE_MEMORY_BACKEND = 'memory';
    file = path.join(root, 'clean.ts');
    writeFileSync(file, 'export const safe = 1;\n');
    ({ createSecurityCommand } = await import('../../../../src/cli/commands/security.js'));
  });

  afterAll(() => {
    if (originalRoot === undefined) delete process.env.AQE_PROJECT_ROOT;
    else process.env.AQE_PROJECT_ROOT = originalRoot;
    if (originalBackend === undefined) delete process.env.AQE_MEMORY_BACKEND;
    else process.env.AQE_MEMORY_BACKEND = originalBackend;
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    stdout = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => stdout.push(args.join(' ')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    runSASTScan = vi.fn().mockResolvedValue({ success: true, value: completeScan() });
    runComplianceCheck = vi.fn();
    cleanupAndExit = vi.fn(async () => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  function evidence(completeness: 'complete' | 'partial' | 'none' = 'complete') {
    return {
      schemaVersion: 1, completeness, requestedFiles: 1, requestedPaths: [file], duplicateInputs: 0,
      files: [{ path: file, status: 'analyzed', sourceDigest: 'a'.repeat(64), readLines: 2, analyzedLines: 2, engineId: 'patterns' }],
      engines: [{ id: 'patterns', requested: true, required: true, status: 'completed', scope: 'requested-files', analyzedFiles: 1, ruleIds: ['injection'], ruleCoverage: 'known', errors: [], limitations: [] }],
      limitations: completeness === 'complete' ? [] : ['An intended engine did not complete.'],
    };
  }

  function completeScan() {
    return { vulnerabilities: [], coverage: { filesScanned: 1, linesScanned: 2, rulesApplied: 1 }, evidence: evidence() };
  }

  async function execute(args: string[] = ['--sast', '--format', 'json'], domainAvailable = true) {
    const context = { kernel: { getDomainAPIAsync: vi.fn(async () => domainAvailable ? { runSASTScan, runComplianceCheck } : undefined) } } as unknown as CLIContext;
    const command = createSecurityCommand(context, cleanupAndExit as unknown as (code: number) => Promise<never>, async () => true);
    await command.parseAsync(['--target', root, ...args], { from: 'user' });
    return stdout.join('\n');
  }

  it('returns a nonzero exit and structured failure when SAST fails', async () => {
    runSASTScan.mockResolvedValue({ success: false, error: new Error('scanner unavailable') });
    const output = JSON.parse(await execute());
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(1);
    expect(output).toMatchObject({ status: 'failed', checks: [{ name: 'SAST', status: 'failed' }] });
    expect(JSON.stringify(output)).toContain('SAST scan failed.');
  });

  it.each(['json', 'markdown', 'sarif', 'text'])('does not leak provider exception content into %s', async format => {
    runSASTScan.mockRejectedValue(new Error('PRIVATE_SOURCE_AND_CREDENTIAL_SENTINEL'));
    const output = await execute(['--sast', '--format', format]);
    expect(output).not.toContain('PRIVATE_SOURCE_AND_CREDENTIAL_SENTINEL');
    expect(output).toContain('SAST scan failed.');
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('retains a bounded errno without exposing the returned error message', async () => {
    runSASTScan.mockResolvedValue({ success: false, error: Object.assign(new Error('PRIVATE_ERROR_SENTINEL'), { code: 'EACCES' }) });
    const output = JSON.parse(await execute());
    expect(output.checks[0].reason).toBe('SAST scan failed (EACCES).');
    expect(JSON.stringify(output)).not.toContain('PRIVATE_ERROR_SENTINEL');
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('actually runs the advertised default SAST scan', async () => {
    await execute(['--format', 'json']);
    expect(runSASTScan).toHaveBeenCalledOnce();
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('passes FilePath values to the real domain API contract', async () => {
    await execute();
    const files = runSASTScan.mock.calls[0][0];
    expect(files).toHaveLength(1);
    expect(files[0].value).toBe(file);
    expect(files[0].extension).toBe('ts');
  });

  it('preserves complete producer evidence and measured coverage in JSON', async () => {
    const output = JSON.parse(await execute());
    expect(output).toMatchObject({ status: 'complete', coverage: completeScan().coverage, evidence: evidence() });
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('does not call a legacy result without receipts verified or clean', async () => {
    runSASTScan.mockResolvedValue({ success: true, value: { vulnerabilities: [], coverage: { filesScanned: 999, linesScanned: 9999, rulesApplied: 99 } } });
    const output = JSON.parse(await execute());
    expect(output.status).toBe('unverified');
    expect(output).not.toHaveProperty('coverage');
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it.each(['text', 'markdown'])('does not render legacy counts as analyzed evidence in %s', async format => {
    runSASTScan.mockResolvedValue({ success: true, value: { vulnerabilities: [], coverage: { filesScanned: 999, linesScanned: 9999, rulesApplied: 99 } } });
    const output = await execute(['--sast', '--format', format]);
    expect(output).toContain('unverified');
    expect(output).not.toContain('999');
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('retains findings and incomplete evidence from a partial scan', async () => {
    const finding = { severity: 'low', type: 'Information exposure', file, line: 1, message: 'Partial evidence finding' };
    runSASTScan.mockResolvedValue({ success: true, value: { ...completeScan(), vulnerabilities: [finding], evidence: evidence('partial') } });
    const output = JSON.parse(await execute());
    expect(output).toMatchObject({ status: 'partial', evidence: { completeness: 'partial' }, vulnerabilities: [finding] });
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('reports the unimplemented DAST command as not run in JSON', async () => {
    const output = JSON.parse(await execute(['--dast', '--format', 'json']));
    expect(output).toMatchObject({ status: 'not-run', checks: [{ name: 'DAST', status: 'not-run' }] });
    expect(runSASTScan).not.toHaveBeenCalled();
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('keeps an executed clean scan at exit zero', async () => {
    await execute();
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('records an unavailable domain as a structured failed scan', async () => {
    const output = JSON.parse(await execute(undefined, false));
    expect(output.status).toBe('failed');
    expect(runSASTScan).not.toHaveBeenCalled();
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('does not turn failed source discovery into an empty clean scan', async () => {
    const output = JSON.parse(await execute(['--sast', '--format', 'json', '--target', path.join(root, 'missing')]));
    expect(output).toMatchObject({ status: 'failed', discovery: { status: 'failed' } });
    expect(output.discovery.issues).not.toHaveLength(0);
    expect(runSASTScan).not.toHaveBeenCalled();
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('reports an empty discovered scope as not run', async () => {
    const empty = path.join(root, 'empty');
    mkdirSync(empty);
    const output = JSON.parse(await execute(['--sast', '--format', 'json', '--target', empty]));
    expect(output).toMatchObject({ status: 'not-run', discovery: { status: 'complete' } });
    expect(runSASTScan).not.toHaveBeenCalled();
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('keeps optional unavailable engine evidence without failing completed required analysis', async () => {
    const receipt = evidence();
    const optionalEngine = { id: 'semgrep', requested: true, required: false, status: 'unavailable', scope: 'parent-directory', ruleCoverage: 'unknown', errors: ['NOT_INSTALLED'], limitations: ['Optional engine unavailable'] };
    runSASTScan.mockResolvedValue({ success: true, value: { ...completeScan(), evidence: { ...receipt, engines: [...receipt.engines, optionalEngine] } } });
    const output = JSON.parse(await execute());
    expect(output.status).toBe('complete');
    expect(output.evidence.engines[1]).toEqual(optionalEngine);
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it.each([['high', 1], ['medium', 2], ['low', 0]] as const)('preserves the %s severity exit code after a complete scan', async (severity, code) => {
    runSASTScan.mockResolvedValue({ success: true, value: { ...completeScan(), vulnerabilities: [{ severity, type: 'Injection', file, line: 1, message: 'Control finding' }] } });
    await execute();
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(code);
  });

  it('converts actual domain vulnerability locations and messages into SARIF', async () => {
    runSASTScan.mockResolvedValue({ success: true, value: { ...completeScan(), vulnerabilities: [{ id: 'finding-1', severity: 'high', title: 'SQL injection', category: 'injection', description: 'Unsanitized query', location: { file, line: 12 } }] } });
    const output = JSON.parse(await execute(['--sast', '--format', 'sarif']));
    expect(output.runs[0].results[0]).toMatchObject({ level: 'error', message: { text: 'Unsanitized query' }, locations: [{ physicalLocation: { artifactLocation: { uri: file }, region: { startLine: 12 } } }] });
    expect(output.runs[0].invocations[0].executionSuccessful).toBe(true);
    expect(output.runs[0].properties.securityScan.evidence).toEqual(evidence());
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('preserves incomplete execution receipts in Markdown', async () => {
    runSASTScan.mockResolvedValue({ success: true, value: { ...completeScan(), evidence: evidence('partial') } });
    const output = await execute(['--sast', '--format', 'markdown']);
    expect(output).toContain('**Execution:** partial');
    expect(output).toContain('"sourceDigest": "' + 'a'.repeat(64) + '"');
    expect(output).toContain('An intended engine did not complete.');
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('does not print a clean completion after incomplete SAST', async () => {
    runSASTScan.mockResolvedValue({ success: true, value: { ...completeScan(), evidence: evidence('partial') } });
    const output = await execute(['--sast']);
    expect(output).toContain('Security analysis: partial');
    expect(output).toContain('requested analysis is incomplete or unverified');
    expect(output).not.toContain('No vulnerabilities found');
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('retains a later failed compliance framework instead of reporting the first pass as all compliant', async () => {
    runComplianceCheck
      .mockResolvedValueOnce({ success: true, value: { standardId: 'gdpr', violations: [], passedRules: ['privacy-policy'], skippedRules: [] } })
      .mockResolvedValueOnce({ success: false, error: new Error('SOC2 unavailable') });
    const output = JSON.parse(await execute(['--compliance', 'gdpr,soc2', '--format', 'json']));
    expect(runSASTScan).not.toHaveBeenCalled();
    expect(output).toMatchObject({ status: 'partial', compliance: { compliant: false }, checks: [{ name: 'Compliance:gdpr', status: 'complete' }, { name: 'Compliance:soc2', status: 'failed' }] });
    expect(JSON.stringify(output)).toContain('Compliance check failed.');
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('keeps the separate URL validation path unchanged', async () => {
    const output = JSON.parse(await execute(['--url-validate', 'https://example.test', '--format', 'json']));
    expect(output.summary).toBe('URL control');
    expect(runSASTScan).not.toHaveBeenCalled();
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(0);
  });
});
