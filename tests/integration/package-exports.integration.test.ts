/**
 * Package Exports Contract Tests
 *
 * Guards against the regression fixed in PR #497: a shipped subpath
 * that is missing from the package.json `exports` map throws
 * ERR_PACKAGE_PATH_NOT_EXPORTED under Node ESM strict resolution,
 * even though the compiled file is present on disk.
 *
 * For each subpath the package publishes, this test verifies:
 *   1. The entry exists in package.json#exports with `import` and `types`.
 *   2. The referenced files exist in dist/ (only when dist/ is built).
 *   3. The module dynamically imports and the documented symbol is reachable.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const distBuilt = existsSync(resolve(repoRoot, 'dist', 'kernel', 'hnsw-adapter.js'));

describe('package.json#exports — declared subpaths', () => {
  it('declares ./kernel/hnsw-adapter with import + types', () => {
    const entry = pkg.exports?.['./kernel/hnsw-adapter'];
    expect(entry, '`./kernel/hnsw-adapter` missing from exports map (see PR #497)').toBeDefined();
    expect(entry.import).toBe('./dist/kernel/hnsw-adapter.js');
    expect(entry.types).toBe('./dist/kernel/hnsw-adapter.d.ts');
  });

  it.skipIf(!distBuilt)('resolves ./kernel/hnsw-adapter to files that exist on disk', () => {
    const entry = pkg.exports['./kernel/hnsw-adapter'];
    expect(existsSync(resolve(repoRoot, entry.import))).toBe(true);
    expect(existsSync(resolve(repoRoot, entry.types))).toBe(true);
  });

  it.skipIf(!distBuilt)('exposes HnswAdapter from the ./kernel/hnsw-adapter subpath', async () => {
    const entry = pkg.exports['./kernel/hnsw-adapter'];
    const mod = await import(resolve(repoRoot, entry.import));
    expect(typeof mod.HnswAdapter).toBe('function');
  });
});
