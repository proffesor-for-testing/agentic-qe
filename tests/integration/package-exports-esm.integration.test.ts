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
    version: string;
    exports: Record<string, { import?: string }>;
    bin?: Record<string, string>;
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

  it('reports the package version from the public CLI export', () => {
    const cliEntry = packageJson.exports['./cli']?.import;
    expect(cliEntry).toBeDefined();
    const url = pathToFileURL(path.resolve(installedRoot, cliEntry!)).href;
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', `await import(${JSON.stringify(url)});`, '--', '--version'],
      { cwd: installedRoot, encoding: 'utf8', timeout: 30_000 },
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout.trim()).toBe(packageJson.version);
  });

  it('exposes pattern mutation outcomes from the package root', () => {
    const packageEntry = packageJson.exports['.']?.import;
    expect(packageEntry).toBeDefined();
    const url = pathToFileURL(path.resolve(installedRoot, packageEntry!)).href;
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `const m = await import(${JSON.stringify(url)}); if (typeof m.PatternMutationError !== 'function') process.exit(1);`,
      ],
      { cwd: installedRoot, encoding: 'utf8', timeout: 30_000 },
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('includes the published verdict schemas', () => {
    for (const schema of [
      'coverage-gap.schema.json',
      'finding-verdict.schema.json',
      'risk-decision.schema.json',
    ]) {
      expect(fs.existsSync(path.join(installedRoot, 'schemas', schema)), schema).toBe(true);
    }
  });

  it('should_importCoordinatorGNN_when_loadedByNativeNodeESM', () => {
    expectNativeImport(
      './dist/domains/code-intelligence/coordinator-gnn.js',
      'code-intelligence coordinator GNN',
    );
  });

  it('runs the installed QE Court executable from the packed artifact', () => {
    const binTarget = packageJson.bin?.['aqe-court-referee'];
    expect(binTarget).toBeDefined();
    const result = spawnSync(
      process.execPath,
      [path.resolve(installedRoot, binTarget!), 'self-test', 'writer-not-juror'],
      { cwd: tempRoot, encoding: 'utf8', timeout: 30_000 },
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
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
