import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

describe('packed package native ESM contracts', () => {
  const packageRoot = process.cwd();
  const tempRoot = path.join(packageRoot, 'node_modules', '.cache', `aqe-pack-esm-${process.pid}`);
  const unpackedRoot = path.join(tempRoot, 'package');
  let packageJson: {
    exports: Record<string, { import?: string }>;
  };

  beforeAll(() => {
    // Arrange a real packed artifact under this checkout so its dependencies
    // resolve from the existing node_modules tree without network access.
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.mkdirSync(tempRoot, { recursive: true });
    const packOutput = execFileSync(
      'npm',
      ['pack', '--json', '--ignore-scripts', '--pack-destination', tempRoot],
      { cwd: packageRoot, encoding: 'utf8' },
    );
    const [{ filename }] = JSON.parse(packOutput) as Array<{ filename: string }>;
    execFileSync('tar', ['-xzf', path.join(tempRoot, filename), '-C', tempRoot]);
    packageJson = JSON.parse(fs.readFileSync(path.join(unpackedRoot, 'package.json'), 'utf8'));
  }, 30_000);

  afterAll(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('should_importEveryDeclaredExport_when_loadedByNativeNodeESM', () => {
    for (const [exportName, target] of Object.entries(packageJson.exports)) {
      if (!target.import) continue;
      expectNativeImport(target.import, `package export ${exportName}`, exportName === './cli');
    }
  }, 120_000);

  it('should_importRuVectorBarrel_when_loadedByNativeNodeESM', () => {
    expectNativeImport('./dist/integrations/ruvector/index.js', 'RuVector barrel');
  });

  it('should_importCoordinatorGNN_when_loadedByNativeNodeESM', () => {
    expectNativeImport(
      './dist/domains/code-intelligence/coordinator-gnn.js',
      'code-intelligence coordinator GNN',
    );
  });

  function expectNativeImport(
    relativeTarget: string,
    label: string,
    executableEntry = false,
  ): void {
    const url = pathToFileURL(path.resolve(unpackedRoot, relativeTarget)).href;
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `await import(${JSON.stringify(url)});`,
        ...(executableEntry ? ['--', '--version'] : []),
      ],
      { cwd: unpackedRoot, encoding: 'utf8', timeout: 30_000 },
    );
    expect(result.status, `${label}: ${result.stderr || result.stdout}`).toBe(0);
  }
});
