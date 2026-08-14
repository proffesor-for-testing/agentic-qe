import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

describe('packed package native ESM contracts', () => {
  const packageRoot = process.cwd();
  const tempRoot = path.join(packageRoot, 'node_modules', '.cache', `aqe-pack-esm-${process.pid}`);
  const installedRoot = path.join(tempRoot, 'node_modules', 'agentic-qe');
  let packageJson: {
    exports: Record<string, { import?: string }>;
  };

  beforeAll(() => {
    // Install the real packed artifact in isolation. Keeping the unpacked
    // package beneath this checkout can accidentally resolve undeclared
    // dependencies from the repository's node_modules tree.
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.mkdirSync(tempRoot, { recursive: true });
    const packOutput = execFileSync(
      'npm',
      ['pack', '--json', '--ignore-scripts', '--pack-destination', tempRoot],
      { cwd: packageRoot, encoding: 'utf8' },
    );
    const [{ filename }] = JSON.parse(packOutput) as Array<{ filename: string }>;
    execFileSync(
      'npm',
      ['install', '--ignore-scripts', '--omit=dev', '--prefix', tempRoot, path.join(tempRoot, filename)],
      { cwd: tempRoot, encoding: 'utf8' },
    );
    packageJson = JSON.parse(fs.readFileSync(path.join(installedRoot, 'package.json'), 'utf8'));
  }, 60_000);

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
    const url = pathToFileURL(path.resolve(installedRoot, relativeTarget)).href;
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `await import(${JSON.stringify(url)});`,
        ...(executableEntry ? ['--', '--version'] : []),
      ],
      { cwd: installedRoot, encoding: 'utf8', timeout: 30_000 },
    );
    expect(result.status, `${label}: ${result.stderr || result.stdout}`).toBe(0);
  }
});
