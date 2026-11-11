/**
 * #1350 (remaining reads): over MCP, the dependency check behind
 * `scan-security` must not send names and versions read through a hardlink
 * to OSV, a scan that read an exempt node_modules hardlink is not
 * `complete`, and `predict-defects` reports such a scan as partial. Real
 * hardlinks, the real scanners; OSV points at a closed local port.
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

const CANARY = 'canary-1350-outside-dep';

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

describe('MCP scan-security / predict-defects remaining hardlink reads (#1350)', () => {
  let base: string;
  let root: string;
  let deps: string;
  let pkgDir: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1350-rem-')));
    root = path.join(base, 'proj');
    deps = path.join(root, 'deps');
    pkgDir = path.join(root, 'node_modules', '.pnpm', 'pkg@1.0.0', 'node_modules', 'pkg');
    fs.mkdirSync(deps, { recursive: true });
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.mkdirSync(path.join(base, 'outside'));
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fx"}');
    fs.mkdirSync(path.join(root, '.git'));
    fs.writeFileSync(path.join(base, 'outside', 'package.json'),
      JSON.stringify({ name: 'outside', version: '1.0.0', dependencies: { [CANARY]: '1.2.3' } }));
    fs.writeFileSync(path.join(base, 'outside', 'store-index.js'), 'const token = "PNPM_STORE_1350_abcdefghij";\n');
    fs.linkSync(path.join(base, 'outside', 'store-index.js'), path.join(pkgDir, 'index.js'));
    vi.stubEnv('AQE_PROJECT_ROOT', root);
    // Any OSV lookup fails fast and lists the package it would have sent.
    vi.stubEnv('AQE_OSV_API_URL', 'https://127.0.0.1:9');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(base, { recursive: true, force: true });
  });

  describe('scan-security dependencies: true', () => {
    it('refuses a hardlinked package.json: nothing is sent to OSV, it is listed in refused, and the scan fails', async () => {
      const manifest = path.join(deps, 'package.json');
      fs.linkSync(path.join(base, 'outside', 'package.json'), manifest);
      const result = await run('scan-security', { target: deps, sast: false, dast: false, compliance: [], dependencies: true });
      expect(result.success, result.error?.message).toBe(true);
      const value = result.value!;
      expect(JSON.stringify(value)).not.toContain(CANARY);
      expect(value.dependencyScan).toMatchObject({ status: 'not-run', measured: false, packagesRequested: 0 });
      expect(value.dependencyScan.message).toMatch(/hardlinked/);
      expect(value.refused).toEqual([{ path: manifest, reason: 'hardlinked' }]);
      expect(value.evidence.completeness).not.toBe('complete');
      expect(securityScanConfig.mapToResult('t', value, 1, [])).toMatchObject({ refused: [{ path: manifest, reason: 'hardlinked' }] });
    });

    it('refuses a hardlinked lockfile: its versions are not used and the scan is not complete', async () => {
      fs.writeFileSync(path.join(deps, 'package.json'), JSON.stringify({ name: 'deps', dependencies: { 'left-pad': '^1.3.0' } }));
      const lock = path.join(deps, 'package-lock.json');
      fs.writeFileSync(path.join(base, 'outside', 'lock.json'), JSON.stringify({
        name: 'deps', lockfileVersion: 3,
        packages: { '': { dependencies: { 'left-pad': '^1.3.0' } }, 'node_modules/left-pad': { version: '1.3.0' } },
      }));
      fs.linkSync(path.join(base, 'outside', 'lock.json'), lock);
      // The lockfile governs only up to the project root or .git.
      fs.mkdirSync(path.join(deps, '.git'));
      const result = await run('scan-security', { target: deps, sast: false, dast: false, compliance: [], dependencies: true });
      const value = result.value!;
      expect(value.dependencyScan.lockfile).toBeNull();
      expect(value.dependencyScan.resolutionErrors.join('\n')).toMatch(/hardlinked/);
      expect(value.dependencyScan.status).not.toBe('complete');
      expect(value.refused).toEqual([{ path: lock, reason: 'hardlinked' }]);
    });

    it('still reads a regular package.json (the canary reaches the OSV request)', async () => {
      fs.copyFileSync(path.join(base, 'outside', 'package.json'), path.join(deps, 'package.json'));
      const result = await run('scan-security', { target: deps, sast: false, dast: false, compliance: [], dependencies: true });
      const value = result.value!;
      expect(value.refused).toBeUndefined();
      expect(value.dependencyScan.packagesRequested).toBe(1);
      expect(JSON.stringify(value.dependencyScan.uncheckedPackages)).toContain(CANARY);
    });
  });

  describe('exempt node_modules hardlinks are disclosed and never complete', () => {
    it('scan-security over a pnpm store file is partial, not complete', async () => {
      const result = await run('scan-security', { target: pkgDir, sast: true, dast: false, compliance: [] });
      const value = result.value!;
      expect(value.filesScanned).toBe(1);
      expect(value.exemptHardlinks).toEqual([path.join(pkgDir, 'index.js')]);
      expect(value.evidence.completeness).toBe('partial');
      expect(value.status).toBe('partial');
      expect(securityScanConfig.mapToResult('t', value, 1, [])).toMatchObject({ status: 'partial' });
    });

    it('predict-defects over a pnpm store file is partial, not complete', async () => {
      const result = await run('predict-defects', { target: pkgDir, minConfidence: 0.5 });
      expect(result.value).toMatchObject({ filesAnalyzed: 1, scanStatus: 'partial', exemptHardlinks: [path.join(pkgDir, 'index.js')] });
      expect(defectPredictConfig.mapToResult('t', result.value!, 1, [])).toMatchObject({ scanStatus: 'partial' });
    });
  });
});
