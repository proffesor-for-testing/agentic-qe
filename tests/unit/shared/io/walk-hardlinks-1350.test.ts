/**
 * #1350: files found by walking a caller-named directory refuse a hardlink
 * (which no path check can confine) unless it lies under the project's
 * node_modules, where pnpm and bun install every package file as a hardlink
 * to a store outside the project. Real hardlinks in a temporary project.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  isUnderProjectNodeModules, readConfinedText, readConfinedTextSync,
} from '../../../../src/shared/io/confined-read';
import { FileReader } from '../../../../src/shared/io/file-reader';
import { SecurityScannerService } from '../../../../src/domains/security-compliance/services/scanners/scanner-orchestrator';
import { SecurityAuditorService } from '../../../../src/domains/security-compliance/services/security-auditor';
import { FilePath } from '../../../../src/shared/value-objects/index.js';
import { detectAntiPatternsInSource } from '../../../../src/mcp/tools/test-generation/generate';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';

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

describe('walk hardlink policy (#1350)', () => {
  let base: string;
  let root: string;
  let leak: string;
  let store: string;
  let plain: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1350-walk-')));
    root = path.join(base, 'proj');
    const pkgDir = path.join(root, 'node_modules', '.pnpm', 'pkg@1.0.0', 'node_modules', 'pkg');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.mkdirSync(path.join(base, 'outside'));
    fs.writeFileSync(path.join(base, 'outside', 'secret.ts'),
      `const api_key = "${SECRET}_abcdefghijkl";\nconst password = "${SECRET}_pw";\neval(input);\nconst n = 42;\n`);
    leak = path.join(root, 'src', 'leak.ts');
    fs.linkSync(path.join(base, 'outside', 'secret.ts'), leak);
    fs.writeFileSync(path.join(base, 'outside', 'store-index.js'), 'module.exports = function pkg() { return 7; };\n');
    store = path.join(pkgDir, 'index.js');
    fs.linkSync(path.join(base, 'outside', 'store-index.js'), store);
    plain = path.join(root, 'src', 'plain.ts');
    fs.writeFileSync(plain, 'export const plain = 1;\n');
    vi.stubEnv('AQE_PROJECT_ROOT', root);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(base, { recursive: true, force: true });
  });

  describe('confined read', () => {
    const policy = { hardlinks: 'refuse-outside-node-modules' as const };

    it('refuses a hardlink outside node_modules, async and sync', async () => {
      await expect(readConfinedText(leak, policy)).rejects.toMatchObject({ reason: 'hardlinked', code: 'HARDLINKED' });
      expect(() => readConfinedTextSync(leak, policy)).toThrow(/hardlinked/);
    });

    it('reads a pnpm store hardlink under the project node_modules, and plain files', async () => {
      expect(fs.statSync(store).nlink).toBe(2);
      await expect(readConfinedText(store, policy)).resolves.toContain('function pkg');
      expect(readConfinedTextSync(store, policy)).toContain('function pkg');
      await expect(readConfinedText(plain, policy)).resolves.toContain('plain');
    });

    it('still refuses a store hardlink with the strict policy, and reads both with the default', async () => {
      await expect(readConfinedText(store, { hardlinks: 'refuse' })).rejects.toMatchObject({ reason: 'hardlinked' });
      await expect(readConfinedText(leak)).resolves.toContain(SECRET);
    });

    it('counts node_modules only below the project root', () => {
      expect(isUnderProjectNodeModules(root, store)).toBe(true);
      expect(isUnderProjectNodeModules(root, leak)).toBe(false);
      expect(isUnderProjectNodeModules(path.join(root, 'node_modules'), path.join(root, 'node_modules', 'x.js'))).toBe(false);
      expect(isUnderProjectNodeModules(root, path.join(base, 'node_modules', 'x.js'))).toBe(false);
      // A file merely named node_modules is not a directory of that name.
      expect(isUnderProjectNodeModules(root, path.join(root, 'src', 'node_modules'))).toBe(false);
    });
  });

  describe('FileReader in-root reads', () => {
    it('refuses a hardlink outside node_modules as HARDLINKED by default', async () => {
      const result = await new FileReader({ projectRoot: root }).readFile(leak);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toMatchObject({ code: 'HARDLINKED' });
      expect(result.error.message).not.toContain(SECRET);
    });

    it('reads a pnpm store hardlink and plain files by default', async () => {
      const reader = new FileReader({ projectRoot: root });
      expect(await reader.readFile(store)).toMatchObject({ success: true });
      expect(await reader.readFile(plain)).toMatchObject({ success: true, value: 'export const plain = 1;\n' });
    });

    it("reads the hardlink when the caller opts into 'allow'", async () => {
      const result = await new FileReader({ projectRoot: root, hardlinks: 'allow' }).readFile(leak);
      expect(result).toMatchObject({ success: true });
    });
  });

  describe('SAST scanner', () => {
    const scanner = () => new SecurityScannerService({ memory: memory() }, {
      defaultRuleSets: ['owasp-top-10'], enableLLMAnalysis: false, enableSemgrep: false,
    });

    it('reports a refused hardlink as unreadable and never quotes it', async () => {
      const result = await scanner().scanFiles([FilePath.create(leak), FilePath.create(plain)],
        { hardlinks: 'refuse-outside-node-modules' });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(JSON.stringify(result.value)).not.toContain(SECRET);
      expect(result.value.evidence?.files).toContainEqual(expect.objectContaining({
        path: leak, status: 'unreadable', reason: 'HARDLINKED',
      }));
      expect(result.value.evidence?.files).toContainEqual(expect.objectContaining({ path: plain, status: 'analyzed' }));
    });

    it('scans a pnpm store hardlink with the walk policy', async () => {
      const result = await scanner().scanFiles([FilePath.create(store)], { hardlinks: 'refuse-outside-node-modules' });
      expect(result.success && result.value.evidence?.files[0]).toMatchObject({ path: store, status: 'analyzed' });
    });

    it('keeps reading hardlinks when the caller names no policy (CLI)', async () => {
      const result = await scanner().scanFiles([FilePath.create(leak)]);
      expect(result.success && result.value.evidence?.files[0]).toMatchObject({ path: leak, status: 'analyzed' });
    });
  });

  describe('secrets scanner', () => {
    it('lists a refused hardlink instead of counting it as scanned clean', async () => {
      const auditor = new SecurityAuditorService(memory());
      const result = await auditor.scanSecrets([FilePath.create(leak), FilePath.create(plain)]);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.filesScanned).toBe(1);
      expect(result.value.refused).toEqual([{ path: leak, reason: 'hardlinked' }]);
      expect(JSON.stringify(result.value)).not.toContain(SECRET);
    });
  });

  describe('qe/tests/generate anti-pattern detection (dormant)', () => {
    it('does not read a hardlinked source file', () => {
      const found = detectAntiPatternsInSource([leak]);
      expect(found).toEqual([]);
      expect(JSON.stringify(found)).not.toContain(SECRET);
    });

    it('does not read a file outside the project', () => {
      expect(detectAntiPatternsInSource([path.join(base, 'outside', 'secret.ts')])).toEqual([]);
    });

    it('still analyses a plain project file', () => {
      fs.writeFileSync(plain, 'export const timeout = 4321;\n');
      expect(detectAntiPatternsInSource([plain])).toContainEqual(expect.objectContaining({ name: 'magic-number' }));
    });
  });
});
