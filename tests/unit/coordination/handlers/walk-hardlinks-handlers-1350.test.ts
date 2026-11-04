/**
 * #1350: the MCP/task directory walks (`scan-security`, `predict-defects`)
 * refuse a hardlink found under the caller's target, list it in `refused`,
 * and never report the scan as complete; a pnpm store hardlink under
 * node_modules is still read. Real hardlinks and the real SAST scanner.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { registerSecurityHandlers } from '../../../../src/coordination/handlers/security-handlers';
import { registerCodeIntelligenceHandlers } from '../../../../src/coordination/handlers/code-intelligence-handlers';
import type { InstanceTaskHandler, TaskHandlerContext } from '../../../../src/coordination/handlers/handler-types';
import { SecurityScannerService } from '../../../../src/domains/security-compliance/services/scanners/scanner-orchestrator';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';
// Load the handlers first, as the MCP server does (domain-handler-configs has an import cycle).
import '../../../../src/mcp/handlers/domain-handlers';
import { defectPredictConfig, securityScanConfig } from '../../../../src/mcp/handlers/domain-handler-configs';

const SECRET = 'OUTSIDE_SECRET_1350';

const memory = (): MemoryBackend => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(true),
  exists: vi.fn().mockResolvedValue(false),
  search: vi.fn().mockResolvedValue([]),
  clear: vi.fn().mockResolvedValue(undefined),
  keys: vi.fn().mockResolvedValue([]),
  getStats: vi.fn().mockResolvedValue({ entries: 0, memoryUsage: 0 }),
}) as unknown as MemoryBackend;

function handlerFor(type: string): InstanceTaskHandler {
  let handler: InstanceTaskHandler | undefined;
  const scanner = new SecurityScannerService({ memory: memory() }, {
    defaultRuleSets: ['owasp-top-10'], enableLLMAnalysis: false, enableSemgrep: false,
  });
  const ctx = {
    memory: memory(),
    registerHandler: (t: string, fn: InstanceTaskHandler) => { if (t === type) handler = fn; },
    getSecurityScanner: () => scanner,
  } as unknown as TaskHandlerContext;
  registerSecurityHandlers(ctx);
  registerCodeIntelligenceHandlers(ctx);
  return handler!;
}

type Value = Record<string, any>;
async function run(type: string, payload: Record<string, unknown>): Promise<{ success: boolean; value?: Value; error?: Error }> {
  return await handlerFor(type)({ payload } as never) as { success: boolean; value?: Value; error?: Error };
}

describe('MCP directory walks refuse hardlinks outside node_modules (#1350)', () => {
  let base: string;
  let root: string;
  let leak: string;
  let pkgDir: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1350-hdl-')));
    root = path.join(base, 'proj');
    pkgDir = path.join(root, 'node_modules', '.pnpm', 'pkg@1.0.0', 'node_modules', 'pkg');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.mkdirSync(path.join(base, 'outside'));
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fx"}');
    fs.writeFileSync(path.join(base, 'outside', 'secret.ts'),
      `const api_key = "${SECRET}_abcdefghijkl";\nconst password = "${SECRET}_pw";\neval(input);\n`);
    leak = path.join(root, 'src', 'leak.ts');
    fs.linkSync(path.join(base, 'outside', 'secret.ts'), leak);
    fs.writeFileSync(path.join(root, 'src', 'app.ts'), 'export function add(a: number, b: number) { return a + b; }\n');
    fs.writeFileSync(path.join(base, 'outside', 'store-index.js'), 'const token = "PNPM_STORE_1350_abcdefghij";\neval(x);\n');
    fs.linkSync(path.join(base, 'outside', 'store-index.js'), path.join(pkgDir, 'index.js'));
    vi.stubEnv('AQE_PROJECT_ROOT', root);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(base, { recursive: true, force: true });
  });

  describe('scan-security', () => {
    it('lists the hardlink as refused, does not quote it, and is partial', async () => {
      const result = await run('scan-security', { target: path.join(root, 'src'), sast: true, dast: false, compliance: [] });
      expect(result.success, result.error?.message).toBe(true);
      const value = result.value!;
      expect(JSON.stringify(value)).not.toContain(SECRET);
      expect(value.refused).toEqual([{ path: leak, reason: 'hardlinked' }]);
      expect(value.status).toBe('partial');
      expect(value.evidence.completeness).toBe('partial');
      expect(value.limitations.join('\n')).toMatch(/1 file\(s\) were refused unread because they have more than one hardlink/);
      expect(value.filesScanned).toBe(1);
      // The MCP tool result (security_scan_comprehensive) keeps the list.
      const mcp = securityScanConfig.mapToResult('t', value, 1, []);
      expect(mcp).toMatchObject({ status: 'partial', refused: [{ path: leak, reason: 'hardlinked' }] });
    });

    it('is not a clean pass when every file is refused', async () => {
      fs.rmSync(path.join(root, 'src', 'app.ts'));
      const result = await run('scan-security', { target: path.join(root, 'src'), sast: true, dast: false, compliance: [] });
      const value = result.value!;
      expect(value.status).not.toBe('completed');
      expect(value.evidence.completeness).toBe('none');
      expect(value.filesScanned).toBe(0);
      expect(value.refused).toHaveLength(1);
    });

    it('still scans a pnpm store hardlink under node_modules, and says it used the exemption', async () => {
      const result = await run('scan-security', { target: pkgDir, sast: true, dast: false, compliance: [] });
      const value = result.value!;
      expect(value.refused).toBeUndefined();
      expect(value.filesScanned).toBe(1);
      expect(JSON.stringify(value.findings)).toContain('index.js');
      expect(value.exemptHardlinks).toEqual([path.join(pkgDir, 'index.js')]);
      expect(value.limitations.join('\n')).toMatch(/1 hardlinked file\(s\) were read under the node_modules exemption/);
      expect(securityScanConfig.mapToResult('t', value, 1, [])).toMatchObject({ exemptHardlinks: [path.join(pkgDir, 'index.js')] });
    });

    it('refuses a hardlink in src/node_modules (not the project or a workspace package node_modules)', async () => {
      const nested = path.join(root, 'src', 'node_modules', 'evil.ts');
      fs.mkdirSync(path.dirname(nested), { recursive: true });
      fs.linkSync(path.join(base, 'outside', 'secret.ts'), nested);
      const result = await run('scan-security', { target: path.dirname(nested), sast: true, dast: false, compliance: [] });
      expect(JSON.stringify(result)).not.toContain(SECRET);
      expect(result.value!.refused).toEqual([{ path: nested, reason: 'hardlinked' }]);
      expect(result.value!.evidence.completeness).toBe('none');
    });
  });

  describe('predict-defects', () => {
    it('lists the hardlink as refused and is partial', async () => {
      const result = await run('predict-defects', { target: path.join(root, 'src'), minConfidence: 0.5 });
      expect(result.success, result.error?.message).toBe(true);
      expect(result.value).toMatchObject({
        filesAnalyzed: 1, filesSkipped: 1, scanStatus: 'partial',
        refused: [{ path: leak, reason: 'hardlinked' }],
      });
      // The MCP tool result (defect_predict) keeps the list.
      expect(defectPredictConfig.mapToResult('t', result.value!, 1, [])).toMatchObject({
        scanStatus: 'partial', refused: [{ path: leak, reason: 'hardlinked' }],
      });
    });

    it('discloses a store hardlink read under the node_modules exemption', async () => {
      const result = await run('predict-defects', { target: pkgDir, minConfidence: 0.5 });
      expect(result.value).toMatchObject({
        scanStatus: 'complete', exemptHardlinks: [path.join(pkgDir, 'index.js')],
        limitations: [expect.stringMatching(/read under the node_modules exemption/)],
      });
      expect(defectPredictConfig.mapToResult('t', result.value!, 1, [])).toMatchObject({
        exemptHardlinks: [path.join(pkgDir, 'index.js')],
      });
    });

    it('says why when every file is refused', async () => {
      fs.rmSync(path.join(root, 'src', 'app.ts'));
      const result = await run('predict-defects', { target: path.join(root, 'src'), minConfidence: 0.5 });
      expect(result.success).toBe(false);
      expect(result.error?.message).toMatch(/could not read any of 1 source files \(1 refused: more than one hardlink\)/);
    });
  });
});
