import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { RetryHandlerService, type TestRunner } from '../../../../src/domains/test-execution/services/retry-handler.js';

const fixtures: string[] = [];
afterEach(() => {
  for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true });
});

function handler() {
  return new RetryHandlerService({ get: vi.fn().mockResolvedValue(undefined), set: vi.fn() } as never);
}

type CommandBuilder = {
  buildTestCommand(runner: TestRunner, file: string, name?: string): {
    command: string; args: string[]; report?: { cleanup(): void };
  };
};

describe('literal retry names', () => {
  it.each(['vitest', 'jest', 'mocha'] as const)('treats names literally in the %s regex filter', runner => {
    const service = handler() as unknown as CommandBuilder;
    const name = 'case.[id] (a+b)? ^x$ {2}|\\';
    const command = service.buildTestCommand(runner, 'sample.test.ts', name);
    try {
      const flag = runner === 'mocha' ? '--grep' : '-t';
      const pattern = new RegExp(command.args[command.args.indexOf(flag) + 1]);
      expect(pattern.test(name)).toBe(true);
      expect(pattern.test(`suite ${name} suffix`)).toBe(true);
      expect(pattern.test('case.i aab x 2')).toBe(false);
      expect(pattern.test('another test')).toBe(false);
    } finally {
      command.report?.cleanup();
    }
  });

  it.each(['vitest', 'jest', 'mocha'] as const)('retains whole-file retries for %s', runner => {
    const service = handler() as unknown as CommandBuilder;
    for (const name of [undefined, '', 'sample.test.ts']) {
      const command = service.buildTestCommand(runner, 'sample.test.ts', name);
      try {
        expect(command.args).not.toContain('-t');
        expect(command.args).not.toContain('--grep');
      } finally {
        command.report?.cleanup();
      }
    }
  });

  it.each([
    { name: 'case.[id]', passesOnRetry: false },
    { name: 'case.[id]', passesOnRetry: true },
    { name: 'ordinary case', passesOnRetry: true },
  ])('reruns the actual assertion for $name (passesOnRetry=$passesOnRetry)', async ({ name, passesOnRetry }) => {
    const runner = resolve('node_modules/vitest/vitest.mjs');
    const fixture = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-retry-literal-')));
    fixtures.push(fixture);
    const file = join(fixture, 'sample.test.mjs');
    const count = join(fixture, 'count');
    const executed = join(fixture, 'executed');
    const config = join(fixture, 'vitest.config.mjs');
    writeFileSync(config, 'export default { test: { globals: true, include: ["*.test.mjs"] } };\n');
    writeFileSync(file, `
      import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
      it(${JSON.stringify(name)}, () => {
        const n = existsSync(${JSON.stringify(count)}) ? Number(readFileSync(${JSON.stringify(count)}, 'utf8')) + 1 : 1;
        writeFileSync(${JSON.stringify(count)}, String(n));
        appendFileSync(${JSON.stringify(executed)}, 'target\\n');
        expect(${passesOnRetry ? 'n > 1' : 'false'}).toBe(true);
      });
      it('case.i', () => { appendFileSync(${JSON.stringify(executed)}, 'decoy\\n'); expect(true).toBe(true); });
    `);
    const report = join(fixture, 'initial.json');
    const initial = spawnSync(process.execPath, [runner, 'run', '--root', fixture, '--config', config, '--bail=0', '--reporter=json', '--outputFile', report], {
      cwd: fixture, encoding: 'utf8', timeout: 10000,
    });
    expect(initial.status, initial.stderr).toBe(1);
    const initialReport = JSON.parse(readFileSync(report, 'utf8'));
    expect(initialReport.testResults[0].assertionResults.find((test: { title: string }) => test.title === name).status).toBe('failed');
    writeFileSync(executed, '');

    const service = handler();
    const internals = service as unknown as CommandBuilder;
    const original = internals.buildTestCommand.bind(internals);
    // Use the installed native runner without invoking an installer; retain
    // the production selection arguments and JSON report handling.
    internals.buildTestCommand = (testRunner, testFile, testName) => {
      const command = original(testRunner, testFile, testName);
      return { ...command, command: process.execPath,
        args: [runner, ...command.args.slice(1), '--config', config, '--root', fixture] };
    };
    const result = await service.executeWithRetry({
      runId: 'literal-name-proof',
      failedTests: [{ testId: 'actual-failure', testName: name, file,
        error: 'AssertionError from the initial native run', duration: 1 }],
      maxRetries: 1, backoff: 'constant', baseDelay: 0,
    });
    expect(result.success, result.success ? undefined : result.error.message).toBe(true);
    if (result.success) {
      expect(result.value.nowPassing).toBe(passesOnRetry ? 1 : 0);
      expect(result.value.stillFailing).toBe(passesOnRetry ? 0 : 1);
      expect(result.value.flakyDetected).toEqual(passesOnRetry ? ['actual-failure'] : []);
    }
    expect(readFileSync(executed, 'utf8')).toBe('target\n');
    expect(readFileSync(count, 'utf8')).toBe('2');
  });
});
