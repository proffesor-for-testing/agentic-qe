/**
 * #1115: the metric collector behind MCP `code_index` (project metrics, #999)
 * ran cloc/tokei and the native test listings (`cargo test -- --list`,
 * `pytest --collect-only`, `go test -list`) through spawnSync/execSync, so a
 * slow tool froze the MCP server. Stub executables on PATH stand in for them.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { countLOC } from '../../../../src/domains/code-intelligence/services/metric-collector/loc-counter.js';
import { countTests } from '../../../../src/domains/code-intelligence/services/metric-collector/test-counter.js';

const STUB_OUTPUT: Record<string, string> = {
  cloc: JSON.stringify({ header: {}, TypeScript: { nFiles: 1, blank: 0, comment: 0, code: 42 }, SUM: {} }),
  cargo: 'tests::unit_add: test\ntests::integration_db: test\n',
  pytest: 'tests/test_a.py::test_one\ntests/integration/test_b.py::test_two\n',
  go: 'TestAdd\nTestIntegrationDB\nBenchmarkAdd\nok  \tmod\t0.01s\n',
};

async function measure<T>(work: () => Promise<T>): Promise<{ result: T; maxGap: number }> {
  let maxGap = 0;
  let last = Date.now();
  const ticker = setInterval(() => { const now = Date.now(); maxGap = Math.max(maxGap, now - last); last = now; }, 25);
  let result: T;
  try {
    result = await work();
  } finally {
    // A blocked loop resumes with the result already settled, so the final gap counts too.
    maxGap = Math.max(maxGap, Date.now() - last);
    clearInterval(ticker);
  }
  return { result, maxGap };
}

describe.skipIf(process.platform === 'win32')('metric collector does not block the event loop (#1115)', () => {
  let root: string;
  let argsLog: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'aqe-1115-metrics-'));
    const bin = join(root, 'bin');
    mkdirSync(bin);
    argsLog = join(root, 'args.log');
    for (const [name, output] of Object.entries(STUB_OUTPUT)) {
      const stub = join(bin, name);
      writeFileSync(stub, `#!${process.execPath}
require('node:fs').appendFileSync(${JSON.stringify(argsLog)}, JSON.stringify([${JSON.stringify(name)}, ...process.argv.slice(2)]) + '\\n');
setTimeout(() => process.stdout.write(${JSON.stringify(output)}), 1500);
`);
      chmodSync(stub, 0o755);
    }
    vi.stubEnv('PATH', `${bin}${delimiter}${process.env.PATH ?? ''}`);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  const project = (marker: string): string => {
    const dir = mkdtempSync(join(root, 'project-'));
    writeFileSync(join(dir, marker), '');
    return dir;
  };
  const loggedArgs = (name: string): string[][] => readFileSync(argsLog, 'utf8').trim().split('\n')
    .map((line) => JSON.parse(line) as string[]).filter(([tool]) => tool === name).map(([, ...args]) => args);

  it('counts LOC with a slow cloc while timers keep firing', async () => {
    const { result, maxGap } = await measure(() => countLOC(project('README')));
    expect(result).toMatchObject({ source: 'cloc', total: 42, byLanguage: { TypeScript: 42 } });
    expect(maxGap).toBeLessThan(500);
  }, 30000);

  it.each([
    ['cargo', 'Cargo.toml', ['test', '--', '--list'], { total: 2, unit: 1, integration: 1 }],
    ['pytest', 'pytest.ini', ['--collect-only', '-q'], { total: 2, unit: 1, integration: 1 }],
    ['go', 'go.mod', ['test', '-list', '.*', './...'], { total: 2, unit: 1, integration: 1 }],
  ] as const)('lists %s tests without a shell while timers keep firing', async (runner, marker, argv, counts) => {
    const { result, maxGap } = await measure(() => countTests(project(marker)));
    expect(result).toMatchObject({ source: runner, e2e: 0, ...counts });
    expect(loggedArgs(runner)).toContainEqual([...argv]);
    expect(maxGap).toBeLessThan(500);
  }, 30000);
});
