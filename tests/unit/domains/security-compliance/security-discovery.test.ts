import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { discoverSecurityFiles } from '../../../../src/domains/security-compliance/scan-discovery.js';

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
}));

describe('security discovery evidence', () => {
  let root: string;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'aqe-security-discovery-')); });
  afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }); });

  it('reports a missing target as failed discovery, not a clean empty scan', async () => {
    const result = await discoverSecurityFiles(path.join(root, 'missing'));
    expect(result.files).toEqual([]);
    expect(result.discovery).toMatchObject({ status: 'failed', issues: [{ reason: 'ENOENT' }] });
  });

  it('retains an explicit unsupported file for scanner classification', async () => {
    const file = path.join(root, 'README.txt');
    await fs.writeFile(file, 'No language-specific analysis is available.');
    expect(await discoverSecurityFiles(file)).toMatchObject({ files: [file], discovery: { status: 'complete' } });
  });

  it('distinguishes a complete empty inventory from failed discovery', async () => {
    expect(await discoverSecurityFiles(root)).toMatchObject({ files: [], discovery: { status: 'complete', issues: [] } });
  });

  it('preserves discovered siblings when a subtree is unreadable without exposing raw errors', async () => {
    await fs.mkdir(path.join(root, 'denied'));
    await fs.writeFile(path.join(root, 'safe.ts'), 'export const safe = true;');
    const original = fs.readdir;
    vi.spyOn(fs, 'readdir').mockImplementation(async (...args: Parameters<typeof fs.readdir>) => {
      if (String(args[0]) === path.join(root, 'denied')) {
        throw Object.assign(new Error('credential-shaped-value-that-must-not-escape'), { code: 'EACCES' });
      }
      return original(...args);
    });
    const result = await discoverSecurityFiles(root);
    expect(result.files).toEqual([path.join(root, 'safe.ts')]);
    expect(result.discovery).toMatchObject({ status: 'partial', issues: [{ path: path.join(root, 'denied'), reason: 'EACCES' }] });
    expect(JSON.stringify(result)).not.toContain('credential-shaped');
  });

  it('marks a file limit as partial instead of claiming a complete manifest', async () => {
    for (const name of ['c.ts', 'a.py', 'b.js']) await fs.writeFile(path.join(root, name), 'fixture');
    const result = await discoverSecurityFiles(root, { maxFiles: 2 });
    expect(result.files).toEqual([path.join(root, 'a.py'), path.join(root, 'b.js')]);
    expect(result.discovery).toMatchObject({ status: 'partial', issues: [{ reason: 'FILE_LIMIT' }] });
  });

  it('marks an omitted deep subtree as partial', async () => {
    await fs.mkdir(path.join(root, 'deep', 'deeper'), { recursive: true });
    await fs.writeFile(path.join(root, 'deep', 'deeper', 'hidden.ts'), 'fixture');
    const result = await discoverSecurityFiles(root, { maxDepth: 1 });
    expect(result.discovery).toMatchObject({ status: 'partial', issues: [{ reason: 'DEPTH_LIMIT' }] });
  });

  it('reports policy exclusions and does not traverse observed symbolic links', async () => {
    await fs.mkdir(path.join(root, 'node_modules'));
    await fs.writeFile(path.join(root, 'node_modules', 'dependency.ts'), 'fixture');
    await fs.writeFile(path.join(root, 'source.ts'), 'fixture');
    await fs.symlink(path.join(root, 'source.ts'), path.join(root, 'alias.ts'));
    const result = await discoverSecurityFiles(root);
    expect(result.files).toEqual([path.join(root, 'source.ts')]);
    expect(result.discovery.status).toBe('complete');
    expect(result.discovery.excludedPaths).toEqual([path.join(root, 'alias.ts'), path.join(root, 'node_modules')]);
    expect(await discoverSecurityFiles(path.join(root, 'alias.ts'))).toMatchObject({
      files: [], discovery: { status: 'failed', issues: [{ reason: 'SYMLINK_TARGET' }] },
    });
  });
});
