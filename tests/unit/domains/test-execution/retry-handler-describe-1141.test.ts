/**
 * #1141: the retry filter was the escaped full name the runner reported
 * ("<describe> <name>"), but Vitest 4+ matches "<describe> > <name>", so a
 * failed test inside a describe block was never rerun and its retries were
 * still counted. These cases use the installed Vitest on a real fixture.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { RetryHandlerService, type TestRunner } from '../../../../src/domains/test-execution/services/retry-handler.js';

const vitest = resolve('node_modules/vitest/vitest.mjs');
const fixtures: string[] = [];
afterEach(() => {
  for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true });
});

type CommandBuilder = {
  buildTestCommand(runner: TestRunner, file: string, name?: string): { command: string; args: string[] };
};

/** A fixture whose nested test fails on its first run and passes afterwards. */
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-retry-1141-')));
  fixtures.push(root);
  const file = join(root, 'auth.test.mjs');
  const executed = join(root, 'executed');
  const config = join(root, 'vitest.config.mjs');
  writeFileSync(config, 'export default { test: { globals: true, include: ["*.test.mjs"] } };\n');
  writeFileSync(file, `
    import { appendFileSync, existsSync, readFileSync } from 'node:fs';
    const run = (key) => {
      const before = existsSync(${JSON.stringify(executed)}) ? readFileSync(${JSON.stringify(executed)}, 'utf8') : '';
      appendFileSync(${JSON.stringify(executed)}, key + '\\n');
      return before.split('\\n').filter((line) => line === key).length + 1;
    };
    describe('auth flow', () => {
      describe('login (v2) [beta]', () => {
        it('rejects a bad password? maybe', () => { expect(run('nested')).toBeGreaterThan(1); });
      });
      it('keeps the session', () => { run('sibling'); });
    });
    it('rejects a bad password? maybe', () => { run('top-level twin'); });
  `);
  return { root, file, executed, config };
}

function handler(fx: { root: string; config: string }, memory = { get: vi.fn().mockResolvedValue(undefined), set: vi.fn() }) {
  const service = new RetryHandlerService(memory as never);
  const internals = service as unknown as CommandBuilder;
  const original = internals.buildTestCommand.bind(internals);
  // Run the installed Vitest directly, keeping the production filter arguments.
  internals.buildTestCommand = (runner, file, name) => {
    const command = original(runner, file, name);
    return { ...command, command: process.execPath, args: [vitest, ...command.args.slice(1), '--config', fx.config, '--root', fx.root] };
  };
  return service;
}

describe('retrying a test inside a describe block (#1141)', () => {
  it('reruns exactly the nested test named by the runner report', async () => {
    const fx = fixture();
    const report = join(fx.root, 'initial.json');
    spawnSync(process.execPath, [vitest, 'run', '--root', fx.root, '--config', fx.config, '--reporter=json', '--outputFile', report],
      { cwd: fx.root, encoding: 'utf8', timeout: 20000 });
    const failed = JSON.parse(readFileSync(report, 'utf8')).testResults[0].assertionResults
      .find((test: { status: string }) => test.status === 'failed');
    expect(failed.fullName).toBe('auth flow login (v2) [beta] rejects a bad password? maybe');
    writeFileSync(fx.executed, 'nested\n');

    const result = await handler(fx).executeWithRetry({
      runId: 'describe-retry',
      failedTests: [{ testId: 'nested', testName: failed.fullName, file: fx.file, error: 'initial failure', duration: 1 }],
      maxRetries: 3, backoff: 'constant', baseDelay: 0,
    });

    expect(result.success && result.value).toMatchObject({ retried: 1, nowPassing: 1, stillFailing: 0, unmatched: [] });
    // Only the nested test ran again: not its sibling, nor the top-level test with the same title.
    expect(readFileSync(fx.executed, 'utf8')).toBe('nested\nnested\n');
  }, 60000);

  it('reports a retry that matched no test as unmatched, not as retries that ran', async () => {
    const fx = fixture();
    writeFileSync(fx.executed, '');
    const memory = { get: vi.fn().mockResolvedValue(undefined), set: vi.fn() };
    const result = await handler(fx, memory).executeWithRetry({
      runId: 'unmatched-retry',
      failedTests: [{ testId: 'gone', testName: 'auth flow renamed test', file: fx.file, error: 'initial failure', duration: 1 }],
      maxRetries: 3, backoff: 'constant', baseDelay: 0,
    });

    expect(result.success && result.value).toMatchObject({ retried: 0, nowPassing: 0, stillFailing: 1, unmatched: ['gone'] });
    expect(readFileSync(fx.executed, 'utf8')).toBe('');
    const history = memory.set.mock.calls.find(([key]) => key === 'retry-history:gone')?.[1];
    expect(history).toEqual([expect.objectContaining({ attempts: 0, passed: false, unmatched: true, error: 'initial failure' })]);
  }, 60000);
});
