import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { countTests } from '../../../../src/domains/code-intelligence/services/metric-collector/test-counter.js';

const fixtures: string[] = [];
// Reuse only this owner's private compiler cache; never the operator's Go cache.
const goCache = mkdtempSync(join(tmpdir(), 'aqe-native-go-cache-'));
afterAll(() => rmSync(goCache, { recursive: true, force: true }));
const initialPath = process.env.PATH;
function installedTool(name: string): string | undefined {
  const result = spawnSync('which', [name], { encoding: 'utf-8', timeout: 5000 });
  const path = result.stdout?.trim();
  if (result.status === 0 && path && existsSync(path)) return path;
  return undefined;
}
const pytest = installedTool('pytest');
const go = installedTool('go');

function fixture(runner: 'pytest' | 'go'): string {
  const root = mkdtempSync(join(tmpdir(), 'aqe-native-partitions-'));
  fixtures.push(root);
  for (const directory of ['bin', 'home', 'tmp', 'cache']) mkdirSync(join(root, directory));
  const quote = (value: string) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
  const environment = {
    HOME: join(root, 'home'), TMPDIR: join(root, 'tmp'), PATH: '/usr/bin:/bin',
    PYTEST_DISABLE_PLUGIN_AUTOLOAD: '1', GOTOOLCHAIN: 'local', GOCACHE: goCache,
    GOPATH: join(root, 'home', 'go'), GOPROXY: 'off',
  };
  writeFileSync(join(root, 'bin', runner), '#!/bin/sh\nexec /usr/bin/env -i ' +
    Object.entries(environment).map(([key, value]) => key + '=' + quote(value)).join(' ') +
    ' ' + quote(runner === 'pytest' ? pytest! : go!) + ' "$@"\n', { mode: 0o755 });
  if (runner === 'pytest') writeFileSync(join(root, 'pyproject.toml'), '[tool.pytest.ini_options]\n');
  else writeFileSync(join(root, 'go.mod'), 'module aqe-native-partitions\n\ngo 1.20\n');
  process.env.PATH = join(root, 'bin') + ':' + (initialPath || '');
  return root;
}
function pythonTest(root: string, path: string): void {
  const file = join(root, path);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, 'def test_case():\n    open("executed", "w").write("bad")\n    raise RuntimeError("must not execute")\n');
}
function expectPartition(metrics: Awaited<ReturnType<typeof countTests>>): void {
  expect(metrics.unit).toBeGreaterThanOrEqual(0);
  expect(metrics.integration).toBeGreaterThanOrEqual(0);
  expect(metrics.e2e).toBeGreaterThanOrEqual(0);
  expect(metrics.unit + metrics.integration + metrics.e2e).toBe(metrics.total);
}

afterEach(() => {
  if (initialPath === undefined) delete process.env.PATH;
  else process.env.PATH = initialPath;
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe.skipIf(process.platform === 'win32' || !pytest)('native pytest count partitions', () => {
  it('counts mixed suites once without subtracting disjoint tests twice', async () => {
    const root = fixture('pytest');
    for (const group of ['unit', 'integration', 'e2e']) pythonTest(root, `tests/${group}/test_${group}.py`);
    const metrics = await countTests(root);
    expect(metrics).toMatchObject({ source: 'pytest', total: 3, unit: 1, integration: 1, e2e: 1 });
    expectPartition(metrics);
    expect(existsSync(join(root, 'executed'))).toBe(false);
  });

  it('gives e2e precedence over integration and unit for an ambiguous collected path', async () => {
    const root = fixture('pytest');
    pythonTest(root, 'tests/unit/integration/e2e/test_overlap.py');
    const metrics = await countTests(root);
    expect(metrics).toMatchObject({ source: 'pytest', total: 1, unit: 0, integration: 0, e2e: 1 });
    expectPartition(metrics);
  });
});

describe.skipIf(process.platform === 'win32' || !go)('native Go count partitions', () => {
  it('excludes benchmark names from all test categories', async () => {
    const root = fixture('go');
    writeFileSync(join(root, 'metrics_test.go'), `package metrics
      import "testing"
      func TestUnit(t *testing.T) { panic("must not execute") }
      func TestIntegration(t *testing.T) { panic("must not execute") }
      func TestE2E(t *testing.T) { panic("must not execute") }
      func BenchmarkIntegration(b *testing.B) { panic("must not execute") }
      func BenchmarkE2E(b *testing.B) { panic("must not execute") }`);
    const metrics = await countTests(root);
    expect(metrics).toMatchObject({ source: 'go', total: 3, unit: 1, integration: 1, e2e: 1 });
    expectPartition(metrics);
  }, 30000);

  it('gives e2e precedence over integration for an ambiguous collected test name', async () => {
    const root = fixture('go');
    writeFileSync(join(root, 'metrics_test.go'), `package metrics
      import "testing"
      func TestIntegrationE2E(t *testing.T) { panic("must not execute") }`);
    const metrics = await countTests(root);
    expect(metrics).toMatchObject({ source: 'go', total: 1, unit: 0, integration: 0, e2e: 1 });
    expectPartition(metrics);
  }, 30000);
});
