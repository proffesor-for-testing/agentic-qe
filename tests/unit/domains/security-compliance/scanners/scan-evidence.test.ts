import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { FilePath } from '../../../../../src/shared/value-objects/index.js';
import { SASTScanner } from '../../../../../src/domains/security-compliance/services/scanners/sast-scanner.js';
import { DEFAULT_CONFIG } from '../../../../../src/domains/security-compliance/services/scanners/scanner-types.js';
import { ALL_SECURITY_PATTERNS, BUILT_IN_RULE_SETS } from '../../../../../src/domains/security-compliance/services/scanners/security-patterns.js';
import type { MemoryBackend } from '../../../../../src/kernel/interfaces.js';
import { isSemgrepAvailable, runSemgrepWithRules } from '../../../../../src/domains/security-compliance/services/semgrep-integration.js';

vi.mock('../../../../../src/domains/security-compliance/services/semgrep-integration.js', async (importOriginal) => ({
  ...await importOriginal<object>(),
  isSemgrepAvailable: vi.fn(),
  runSemgrepWithRules: vi.fn(),
}));

describe('SAST execution evidence', () => {
  let fixture: string;
  beforeEach(async () => {
    vi.clearAllMocks();
    fixture = await mkdtemp(join(tmpdir(), 'aqe-scan-evidence-'));
    vi.mocked(isSemgrepAvailable).mockResolvedValue(false);
    vi.mocked(runSemgrepWithRules).mockResolvedValue({ success: true, status: 'completed', findings: [], errors: [] });
  });
  afterEach(async () => { await rm(fixture, { recursive: true, force: true }); });

  const scanner = (enableSemgrep = false) => new SASTScanner(
    { ...DEFAULT_CONFIG, enableLLMAnalysis: false, enableSemgrep },
    { set: vi.fn().mockResolvedValue(undefined) } as unknown as MemoryBackend,
  );
  const scan = async (paths: string[], enableSemgrep = false) => {
    const result = await scanner(enableSemgrep).scanWithRules(paths.map(FilePath.create), ['owasp-top-10']);
    expect(result.success).toBe(true);
    if (!result.success) throw result.error;
    return result.value;
  };

  it('does not credit an unreadable requested file as analyzed coverage', async () => {
    const result = await scan([join(fixture, 'missing.ts')]);
    expect(result.coverage).toMatchObject({ filesScanned: 0, linesScanned: 0, rulesApplied: 0 });
    expect(result.summary.totalFiles).toBe(0);
    expect(result.evidence).toMatchObject({ completeness: 'none', requestedFiles: 1, files: [{ status: 'unreadable', readLines: 0, analyzedLines: 0 }] });
  });

  it('records readable unsupported input without analysis credit', async () => {
    const file = join(fixture, 'schema.sql');
    await writeFile(file, 'SELECT * FROM users;\n');
    const result = await scan([file]);
    expect(result.coverage).toMatchObject({ filesScanned: 0, linesScanned: 0, rulesApplied: 0 });
    expect(result.evidence?.files[0]).toMatchObject({ status: 'unsupported', readLines: 2, analyzedLines: 0 });
  });

  it('distinguishes unavailable Semgrep from completed pattern analysis', async () => {
    const file = join(fixture, 'clean.ts');
    await writeFile(file, 'const safe = true;\n');
    const result = await scan([file], true);
    expect(result.evidence).toMatchObject({ completeness: 'complete' });
    expect(result.evidence?.engines).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'patterns', status: 'completed', analyzedFiles: 1 }),
      expect.objectContaining({ id: 'semgrep', requested: true, status: 'unavailable' }),
    ]));
  });

  it('binds successful clean pattern analysis to exact source and executed rules', async () => {
    const file = join(fixture, 'clean.ts');
    const content = 'const safe = true;\n';
    await writeFile(file, content);
    const result = await scan([file]);
    const categories = new Set(BUILT_IN_RULE_SETS.find(rule => rule.id === 'owasp-top-10')!.categories);
    const ruleIds = ALL_SECURITY_PATTERNS.filter(pattern => categories.has(pattern.category)).map(pattern => pattern.id);
    expect(result.coverage.rulesApplied).toBe(new Set(ruleIds).size);
    expect(result.evidence).toMatchObject({ completeness: 'complete' });
    expect(result.evidence?.files[0]).toMatchObject({ path: file, status: 'analyzed', sourceDigest: createHash('sha256').update(content).digest('hex'), readLines: 2, analyzedLines: 2 });
    expect(result.evidence?.engines).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'semgrep', requested: false, status: 'disabled' })]));
  });

  it('retains a finding from a completed file alongside an unreadable input', async () => {
    const file = join(fixture, 'vulnerable.ts');
    await writeFile(file, 'db.query("SELECT * FROM users WHERE id = " + userId + "");');
    const result = await scan([file, join(fixture, 'missing.ts')]);
    expect(result.vulnerabilities.length).toBeGreaterThan(0);
    expect(result.coverage.filesScanned).toBe(1);
    expect(result.evidence).toMatchObject({ completeness: 'partial', requestedFiles: 2 });
    expect(result.evidence?.files.map(receipt => receipt.status)).toEqual(['analyzed', 'unreadable']);
  });

  it('deduplicates normalized paths without doubling findings or coverage', async () => {
    const file = join(fixture, 'vulnerable.ts');
    await writeFile(file, 'document.write(userInput);');
    const result = await scan([file, join(fixture, 'subdir', '..', 'vulnerable.ts')]);
    const single = await scan([file]);
    expect(result.coverage).toEqual(single.coverage);
    expect(result.vulnerabilities).toHaveLength(single.vulnerabilities.length);
    expect(result.evidence).toMatchObject({ requestedFiles: 1, requestedPaths: [file], duplicateInputs: 1 });
  });

  it('records a changed source digest when the same path changes', async () => {
    const file = join(fixture, 'changed.ts');
    await writeFile(file, 'const value = 1;');
    const first = await scan([file]);
    await writeFile(file, 'const value = 2;');
    const second = await scan([file]);
    expect(first.evidence?.files[0].sourceDigest).not.toBe(second.evidence?.files[0].sourceDigest);
    expect(first.evidence?.engines[0].rulesetDigest).toBe(second.evidence?.engines[0].rulesetDigest);
  });

  it('does not infer requested-file coverage from successful directory scanning', async () => {
    vi.mocked(isSemgrepAvailable).mockResolvedValue(true);
    const file = join(fixture, 'clean.ts');
    await writeFile(file, 'const safe = true;');
    const result = await scan([file], true);
    const semgrep = result.evidence?.engines.find(engine => engine.id === 'semgrep');
    expect(semgrep).toMatchObject({ status: 'completed', scope: 'parent-directory', required: false, ruleCoverage: 'unknown' });
    expect(semgrep?.analyzedFiles).toBeUndefined();
    expect(semgrep?.ruleIds).toBeUndefined();
    expect(semgrep?.limitations.length).toBeGreaterThan(0);
    expect(result.coverage.filesScanned).toBe(1);
  });

  it('retains partial Semgrep findings without counting findings as executed rules', async () => {
    vi.mocked(isSemgrepAvailable).mockResolvedValue(true);
    const file = join(fixture, 'clean.ts');
    await writeFile(file, 'const safe = true;');
    vi.mocked(runSemgrepWithRules).mockResolvedValue({
      success: false, status: 'partial', errors: ['fixture engine failure'],
      findings: [{ check_id: 'fixture.security', path: file, start: { line: 1, col: 1 }, end: { line: 1, col: 2 },
        extra: { message: 'Fixture finding', severity: 'WARNING', lines: '' } }],
    });
    const result = await scan([file], true);
    const control = await scan([file]);
    expect(result.vulnerabilities).toHaveLength(1);
    expect(result.coverage.rulesApplied).toBe(control.coverage.rulesApplied);
    expect(result.evidence?.engines.find(engine => engine.id === 'semgrep')).toMatchObject({ status: 'partial', required: false });
    expect(result.evidence?.engines.find(engine => engine.id === 'semgrep')?.errors).not.toContain('fixture engine failure');
  });

  it('preserves pattern findings after a thrown optional engine error', async () => {
    vi.mocked(isSemgrepAvailable).mockResolvedValue(true);
    vi.mocked(runSemgrepWithRules).mockRejectedValue(new Error('private source contents'));
    const file = join(fixture, 'vulnerable.ts');
    await writeFile(file, 'document.write(userInput);');
    const result = await scan([file], true);
    expect(result.vulnerabilities.length).toBeGreaterThan(0);
    expect(result.evidence?.engines.find(engine => engine.id === 'semgrep')).toMatchObject({ status: 'failed', errors: ['Semgrep execution failed.'] });
    expect(JSON.stringify(result.evidence)).not.toContain('private source contents');
  });

  it('keeps a shared parent directory instead of widening sibling-file scope', async () => {
    vi.mocked(isSemgrepAvailable).mockResolvedValue(true);
    const first = join(fixture, 'first.ts');
    const second = join(fixture, 'second.ts');
    await writeFile(first, 'const first = 1;');
    await writeFile(second, 'const second = 2;');
    await scan([first, second], true);
    expect(runSemgrepWithRules).toHaveBeenCalledWith(fixture, ['owasp-top-10']);
  });


  it('does not turn a legacy finding-only adapter result into completed engine evidence', async () => {
    vi.mocked(isSemgrepAvailable).mockResolvedValue(true);
    vi.mocked(runSemgrepWithRules).mockResolvedValue({ success: true, findings: [], errors: [] });
    const file = join(fixture, 'clean.ts');
    await writeFile(file, 'const safe = true;');
    const result = await scan([file], true);
    expect(result.evidence?.engines.find(engine => engine.id === 'semgrep')).toMatchObject({ status: 'unverified' });
    expect(result.evidence?.engines.find(engine => engine.id === 'semgrep')?.limitations).toContain('Legacy Semgrep adapter returned no execution disposition.');
  });


  it.each([['unknown'], ['owasp-top-10', 'unknown']])('rejects unknown requested rule sets without claiming a running scan: %j', async (...rules) => {
    const active = new Map();
    const instance = new SASTScanner({ ...DEFAULT_CONFIG, enableSemgrep: true },
      { set: vi.fn().mockResolvedValue(undefined) } as unknown as MemoryBackend, undefined, active);
    const result = await instance.scanWithRules([FilePath.create(join(fixture, 'unused.ts'))], rules);
    expect(result.success).toBe(false);
    expect(active.size).toBe(0);
    expect(isSemgrepAvailable).not.toHaveBeenCalled();
    expect(runSemgrepWithRules).not.toHaveBeenCalled();
  });

});
