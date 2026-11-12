/**
 * #1350 (review of #1425): two reads that must refuse every hardlink over
 * MCP, with no node_modules exemption, because they cannot disclose one:
 * the security audit's package.json (its contents go to OSV) and the
 * coverage handler's source reads (the static estimate). Each target sits in
 * an exempt location (the project's node_modules), so the weaker
 * 'refuse-outside-node-modules' policy would read the file. Real hardlinks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { registerCoverageHandlers } from '../../../../src/coordination/handlers/coverage-handlers';
import type { InstanceTaskHandler } from '../../../../src/coordination/handlers/handler-types';
import { SecurityAuditorService } from '../../../../src/domains/security-compliance/services/security-auditor';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';

const CANARY = 'canary-1350-outside-dep';

const memory = (): MemoryBackend => ({
  get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(true), exists: vi.fn().mockResolvedValue(false),
  search: vi.fn().mockResolvedValue([]), clear: vi.fn().mockResolvedValue(undefined),
  keys: vi.fn().mockResolvedValue([]), getStats: vi.fn().mockResolvedValue({ entries: 0, memoryUsage: 0 }),
}) as unknown as MemoryBackend;

describe('strict hardlink refusal with no node_modules exemption (#1350, #1425 review)', () => {
  let base: string;
  let root: string;
  let pkg: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1350-strict-')));
    root = path.join(base, 'proj');
    pkg = path.join(root, 'node_modules', 'x');
    fs.mkdirSync(pkg, { recursive: true });
    fs.mkdirSync(path.join(root, '.git'));
    fs.mkdirSync(path.join(base, 'outside'));
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fx"}');
    vi.stubEnv('AQE_PROJECT_ROOT', root);
    vi.stubEnv('AQE_OSV_API_URL', 'https://127.0.0.1:9');
    vi.stubEnv('AQE_COVERAGE_NO_EXEC', '1');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('security-audit refuses a hardlinked package.json in its root, under node_modules too, before any OSV call', async () => {
    fs.writeFileSync(path.join(base, 'outside', 'package.json'),
      JSON.stringify({ name: 'outside', dependencies: { [CANARY]: '1.2.3' } }));
    const manifest = path.join(pkg, 'package.json');
    fs.linkSync(path.join(base, 'outside', 'package.json'), manifest);
    vi.spyOn(process, 'cwd').mockReturnValue(pkg);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const osv = { lookupBatch: vi.fn(), queryPackage: vi.fn(), queryBatch: vi.fn() };

    const auditor = new SecurityAuditorService(memory(), {}, osv as never);
    const result = await auditor.runAudit({
      includeSAST: false, includeDAST: false, includeDependencies: true, includeSecrets: false,
      sourceHardlinks: 'refuse-outside-node-modules',
    } as never);

    expect(result.success).toBe(true);
    const report = result.success ? result.value : undefined;
    expect(osv.lookupBatch).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(report)).not.toContain(CANARY);
    expect(report!.dependencyResults).toMatchObject({ status: 'failed', measured: false });
    expect(report!.incompleteChecks!.join('\n')).toMatch(/hardlinked/);
    expect(report!.incompleteChecks!.join('\n')).toContain(manifest);
  });

  it('coverage over MCP refuses a hardlinked source under node_modules and estimates only the regular file', async () => {
    fs.writeFileSync(path.join(base, 'outside', 'store.js'), 'function storeOnly() {\n  return 1;\n}\n');
    const linked = path.join(pkg, 'index.js');
    fs.linkSync(path.join(base, 'outside', 'store.js'), linked);
    const regular = path.join(pkg, 'other.js');
    fs.writeFileSync(regular, 'function other() {\n  return 2;\n}\n');

    const analyze = vi.fn(async (req: { coverageData: { summary: Record<string, number> } }) => ({
      success: true, value: { summary: req.coverageData.summary, meetsThreshold: false, recommendations: [] },
    }));
    let handler!: InstanceTaskHandler;
    registerCoverageHandlers({
      registerHandler: (_type: string, fn: InstanceTaskHandler) => { handler = fn; },
      getCoverageAnalyzer: () => ({ analyze, findGaps: async () => ({ success: true, value: { gaps: [] } }) }),
    } as never);
    await handler({ payload: { target: pkg, detectGaps: false } } as never);

    expect(analyze).toHaveBeenCalled();
    const files = (analyze.mock.calls[0][0] as unknown as { coverageData: { files: Array<{ path: string }> } })
      .coverageData.files.map((f) => f.path);
    expect(files).toEqual([regular]);
  });
});
