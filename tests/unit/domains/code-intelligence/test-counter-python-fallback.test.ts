import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { countTests, detectTestRunner } from '../../../../src/domains/code-intelligence/services/metric-collector/test-counter.js';

const located = spawnSync('which', ['pytest'], { encoding: 'utf-8', timeout: 5000 });
const pytest = located.status === 0 ? located.stdout.trim() : undefined;
const fixtures: string[] = [];
afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe.skipIf(process.platform === 'win32' || !pytest || !existsSync(pytest))('Python fallback declaration counts', () => {
  for (const [name, declarations] of [
    ['sync-only', ['def test_sync_case()']],
    ['async-only', ['async def test_async_case()']],
    ['mixed', ['def test_sync_case()', 'async def test_async_case()']],
  ] as const) {
    it(`counts ${name} declarations once, matching native collection`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'aqe-python-fallback-'));
      fixtures.push(root);
      for (const directory of ['tests', 'home', 'tmp']) mkdirSync(join(root, directory));
      // No runner config: this is the supported file-pattern fallback path.
      writeFileSync(join(root, 'tests', 'test_declarations.py'), declarations.map(declaration =>
        declaration + ':\n    open("executed", "w").write("bad")\n    raise RuntimeError("must not execute")\n'
      ).join('\n'));
      expect(detectTestRunner(root)).toBe('fallback');
      const collection = spawnSync(pytest!, ['--collect-only', '-q', 'tests/test_declarations.py'], {
        cwd: root, encoding: 'utf-8', timeout: 10000,
        env: { HOME: join(root, 'home'), TMPDIR: join(root, 'tmp'), PATH: '/usr/bin:/bin', PYTEST_DISABLE_PLUGIN_AUTOLOAD: '1' },
      });
      expect(collection.status, collection.stderr).toBe(0);
      const collected = collection.stdout.split('\n').filter(line => line.includes('::test_')).length;
      expect(collected).toBe(declarations.length);
      const metrics = await countTests(root);
      expect(metrics).toMatchObject({ source: 'fallback', total: collected, unit: collected, integration: 0, e2e: 0 });
      expect(existsSync(join(root, 'executed'))).toBe(false);
    });
  }
});
