import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { RetryHandlerService } from '../../../../src/domains/test-execution/services/retry-handler.js';

const fixtures: string[] = [];
afterEach(() => {
  for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('retry selection evidence', () => {
  it.each(['the renamed test', 'actual current test', 'skipped current test'])('requires a passed assertion for "%s"', async selected => {
    const runner = resolve('node_modules/vitest/vitest.mjs');
    const fixture = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-retry-selection-')));
    fixtures.push(fixture);
    const file = join(fixture, 'sample.test.mjs');
    writeFileSync(file, "it('actual current test', () => expect(2 + 2).toBe(4));\nit.skip('skipped current test', () => expect(false).toBe(true));\n");
    const config = join(fixture, 'vitest.config.mjs');
    writeFileSync(config, 'export default { test: { globals: true, include: ["*.test.mjs"] } };\n');
    const memory = { get: vi.fn().mockResolvedValue(undefined), set: vi.fn() };
    const handler = new RetryHandlerService(memory as never, {
      testRunner: 'vitest', cwd: fixture, testTimeout: 10000,
    });
    const internals = handler as unknown as {
      buildTestCommand(runner: string, file: string, name: string): { command: string; args: string[] };
    };
    const original = internals.buildTestCommand.bind(internals);
    internals.buildTestCommand = (testRunner, testFile, name) => {
      const command = original(testRunner, testFile, name);
      return { ...command, command: process.execPath,
        args: [runner, ...command.args.slice(1), '--config', config, '--root', fixture] };
    };

    const result = await handler.executeWithRetry({
      runId: 'selection-proof',
      failedTests: [{ testId: 'previously-failed', testName: selected, file,
        error: 'AssertionError from the earlier run', duration: 1 }],
      maxRetries: 1, backoff: 'constant', baseDelay: 0,
    });
    expect(result.success, result.success ? undefined : result.error.message).toBe(true);
    if (result.success) {
      const matched = selected === 'actual current test';
      expect(result.value.nowPassing).toBe(matched ? 1 : 0);
      expect(result.value.stillFailing).toBe(matched ? 0 : 1);
      expect(result.value.flakyDetected).toEqual(matched ? ['previously-failed'] : []);
    }
  });
});
