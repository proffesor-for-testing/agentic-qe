/**
 * #1350 (remaining reads): FileReader follows a process hardlink policy that
 * the MCP server sets at startup, so the shared domain services (code index,
 * code metrics, compliance patterns, contract testing, defect prediction)
 * refuse a hardlink outside node_modules for MCP callers and keep reading
 * them for the CLI. Compliance patterns report what they did not read; the
 * coverage scope and estimate reads take the same policy. Real hardlinks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  FileReader, getDefaultFileReaderHardlinks, setDefaultFileReaderHardlinks,
} from '../../../../src/shared/io/file-reader';
import { CompliancePatternAnalyzer } from '../../../../src/shared/security/compliance-patterns';
import { readCoverageScope } from '../../../../src/coordination/handlers/coverage-scope';
import { buildEstimatedCoverage } from '../../../../src/coordination/handlers/coverage-collection';
import { KnowledgeGraphService } from '../../../../src/domains/code-intelligence/services/knowledge-graph';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';

const CANARY = 'CANARY_1350_OUTSIDE';

describe('remaining hardlink reads (#1350)', () => {
  let base: string;
  let root: string;
  let leak: string;
  let storeFile: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1350-rdr-')));
    root = path.join(base, 'proj');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(base, 'outside'));
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fx"}');
    fs.writeFileSync(path.join(base, 'outside', 'secret.ts'),
      `// ${CANARY}\nconst password = "${CANARY}"; // md5 plaintext\nexport function f(x: number) { if (x) { return 1; } return 2; }\n`);
    leak = path.join(root, 'src', 'leak.ts');
    fs.linkSync(path.join(base, 'outside', 'secret.ts'), leak);
    fs.writeFileSync(path.join(root, 'src', 'app.ts'), 'export function add(a: number, b: number) { return a + b; }\n');
    const pkgDir = path.join(root, 'node_modules', 'pkg');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(base, 'outside', 'store.js'), 'module.exports = 1;\n');
    storeFile = path.join(pkgDir, 'index.js');
    fs.linkSync(path.join(base, 'outside', 'store.js'), storeFile);
    vi.stubEnv('AQE_PROJECT_ROOT', root);
  });

  afterEach(() => {
    setDefaultFileReaderHardlinks('allow');
    vi.unstubAllEnvs();
    fs.rmSync(base, { recursive: true, force: true });
  });

  describe('FileReader process default', () => {
    it("is 'allow' unless the process sets it (the CLI reads the operator's own hardlinks)", async () => {
      expect(getDefaultFileReaderHardlinks()).toBe('allow');
      const result = await new FileReader({ projectRoot: root }).readFile(leak);
      expect(result.success && result.value).toContain(CANARY);
    });

    it('refuses a hardlink outside node_modules once the MCP server sets the default', async () => {
      const reader = new FileReader({ projectRoot: root });
      // Set after construction: the policy is read at read time.
      setDefaultFileReaderHardlinks('refuse-outside-node-modules');
      const result = await reader.readFile(leak);
      expect(result.success).toBe(false);
      expect(!result.success && result.error).toMatchObject({ code: 'HARDLINKED' });
      expect(JSON.stringify(result)).not.toContain(CANARY);
    });

    it('still reads a store hardlink under node_modules and a regular file', async () => {
      setDefaultFileReaderHardlinks('refuse-outside-node-modules');
      const reader = new FileReader({ projectRoot: root });
      expect((await reader.readFile(storeFile)).success).toBe(true);
      expect((await reader.readFile(path.join(root, 'src', 'app.ts'))).success).toBe(true);
    });

    it('an explicit reader option wins over the process default', async () => {
      setDefaultFileReaderHardlinks('refuse-outside-node-modules');
      const result = await new FileReader({ projectRoot: root, hardlinks: 'allow' }).readFile(leak);
      expect(result.success).toBe(true);
    });
  });

  describe('code index', () => {
    const memory = (): MemoryBackend => ({
      get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true), exists: vi.fn().mockResolvedValue(false),
      search: vi.fn().mockResolvedValue([]), clear: vi.fn().mockResolvedValue(undefined),
      keys: vi.fn().mockResolvedValue([]), getStats: vi.fn().mockResolvedValue({ entries: 0, memoryUsage: 0 }),
      storeVector: vi.fn().mockResolvedValue(undefined), vectorSearch: vi.fn().mockResolvedValue([]),
    }) as unknown as MemoryBackend;

    it('skips a refused hardlink as hardlinked (not indexed, not an error) under the MCP default', async () => {
      setDefaultFileReaderHardlinks('refuse-outside-node-modules');
      const kg = new KnowledgeGraphService(memory(), { projectRoot: root, basePath: root } as never);
      const result = await kg.index({ paths: [leak, path.join(root, 'src', 'app.ts')] });
      expect(result.success).toBe(true);
      const value = result.success ? result.value : undefined;
      expect(value!.filesIndexed, JSON.stringify(value)).toBe(1);
      expect(value!.skipped).toContainEqual({ path: leak, reason: 'hardlinked' });
      expect(value!.errors).toEqual([]);
    });
  });

  describe('compliance patterns report files they did not read', () => {
    it('lists a refused hardlink and a missing file, and analyses the rest', async () => {
      setDefaultFileReaderHardlinks('refuse-outside-node-modules');
      const analyzer = new CompliancePatternAnalyzer();
      const missing = path.join(root, 'src', 'missing.ts');
      const analysis = await analyzer.analyzeEncryption([leak, missing, path.join(root, 'src', 'app.ts')]);
      expect(analysis.unreadFiles).toEqual([
        { path: leak, code: 'HARDLINKED' },
        { path: missing, code: 'ENOENT' },
      ]);
      expect(JSON.stringify(analysis)).not.toContain(CANARY);

      const unread: Array<{ path: string; code: string }> = [];
      const found = await analyzer.scanForDataTypes([leak], ['credentials'], unread);
      expect(found.get('credentials')).toEqual([]);
      expect(unread).toEqual([{ path: leak, code: 'HARDLINKED' }]);
    });

    it('has no unreadFiles field when every file was read', async () => {
      const analysis = await new CompliancePatternAnalyzer().analyzeLogging([path.join(root, 'src', 'app.ts')]);
      expect(analysis.unreadFiles).toBeUndefined();
    });
  });

  describe('coverage scope and estimate', () => {
    it('reports a refused coverage config as unreadable, never as no config', () => {
      fs.writeFileSync(path.join(base, 'outside', 'vitest.config.ts'),
        "export default { test: { coverage: { include: ['src/app.ts'] } } };\n");
      fs.linkSync(path.join(base, 'outside', 'vitest.config.ts'), path.join(root, 'vitest.config.ts'));
      expect(readCoverageScope(root)).toMatchObject({ source: 'vitest.config.ts', readable: true, include: ['src/app.ts'] });
      expect(readCoverageScope(root, { hardlinks: 'refuse-outside-node-modules' }))
        .toMatchObject({ source: 'vitest.config.ts', readable: false, include: [] });
    });

    it('leaves a refused source out of the estimate and names it', () => {
      const allowed = buildEstimatedCoverage(path.join(root, 'src'))!;
      expect(allowed.data.files.map(f => f.path).sort()).toEqual([path.join(root, 'src', 'app.ts'), leak]);

      const refused = buildEstimatedCoverage(path.join(root, 'src'), { hardlinks: 'refuse-outside-node-modules' })!;
      expect(refused.data.files.map(f => f.path)).toEqual([path.join(root, 'src', 'app.ts')]);
      expect(refused.provenance.notes.join('\n')).toMatch(/1 source file\(s\) were refused unread.*more than one hardlink/);
      expect(refused.provenance.notes.join('\n')).toContain(leak);
    });
  });
});
