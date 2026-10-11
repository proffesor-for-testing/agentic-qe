import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { RetryHandlerService, type TestRunner } from '../../../../src/domains/test-execution/services/retry-handler.js';

const fixtures: string[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});
const jestRunners = [process.env.AQE_TEST_JEST29, process.env.AQE_TEST_JEST30].filter(Boolean) as string[];
type Builder = { buildTestCommand(runner: TestRunner, file: string, name?: string): { command: string; args: string[] } };

describe.skipIf(jestRunners.length === 0)('native Jest literal retry selection', () => {
  for (const runnerPath of jestRunners) {
    it.each([
      { path: 'cases/[id]/target.test.cjs', name: 'ordinary case' },
      { path: 'cases/(group)/target.test.cjs', name: 'ordinary case' },
      { path: 'plain.test.cjs', name: '--literal-case' },
      { path: '--target.test.cjs', name: 'ordinary case' },
      { path: 'plain.test.cjs', name: 'ordinary case' },
    ])(`selects $path and $name with ${runnerPath}`, async ({ path, name }) => {
      const runner = resolve(runnerPath);
      const fixture = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-jest-literal-')));
      fixtures.push(fixture);
      const file = join(fixture, path);
      mkdirSync(dirname(file), { recursive: true });
      const count = join(fixture, 'count');
      const executed = join(fixture, 'executed');
      const config = join(fixture, 'jest.config.cjs');
      writeFileSync(config, 'module.exports = { testMatch: ["**/*.test.cjs"], testEnvironment: "node" };');
      writeFileSync(file, `
        const fs = require('node:fs');
        test(${JSON.stringify(name)}, () => {
          const n = fs.existsSync(${JSON.stringify(count)}) ? Number(fs.readFileSync(${JSON.stringify(count)}, 'utf8')) + 1 : 1;
          fs.writeFileSync(${JSON.stringify(count)}, String(n));
          fs.appendFileSync(${JSON.stringify(executed)}, 'target\\n');
          expect(n).toBeGreaterThan(1);
        });
      `);
      const decoy = join(fixture, path.includes('[id]') ? 'cases/i/target.test.cjs' : 'decoy.test.cjs');
      mkdirSync(dirname(decoy), { recursive: true });
      writeFileSync(decoy, `test(${JSON.stringify(name)}, () => { require('node:fs').appendFileSync(${JSON.stringify(executed)}, 'decoy\\n'); expect(true).toBe(true); });`);
      const initial = spawnSync(process.execPath, [runner, '--config', config, '--runInBand', '--json', '--runTestsByPath', file], {
        cwd: fixture, encoding: 'utf8', timeout: 10000,
      });
      expect(initial.status, initial.stderr).toBe(1);
      const report = JSON.parse(initial.stdout);
      expect(report.numTotalTests).toBe(1);
      expect(report.numFailedTests).toBe(1);
      writeFileSync(executed, '');
      const service = new RetryHandlerService({ get: vi.fn(), set: vi.fn() } as never, { testRunner: 'jest', cwd: fixture });
      const internals = service as unknown as Builder;
      const original = internals.buildTestCommand.bind(internals);
      internals.buildTestCommand = (framework, testFile, testName) => {
        const command = original(framework, testFile, testName);
        return { command: process.execPath, args: [runner, '--config', config, '--runInBand', ...command.args.slice(1)] };
      };
      const originalCwd = process.cwd();
      const result = await (async () => {
        process.chdir(fixture);
        try { return await service.executeWithRetry({ runId: 'literal-path', failedTests: [{ testId: 'target', testName: name, file: path.startsWith('--') ? path : file,
        error: 'original failure', duration: 1 }], maxRetries: 1, backoff: 'constant', baseDelay: 0 });
        } finally { process.chdir(originalCwd); }
      })();
      expect(result.success, result.success ? undefined : result.error.message).toBe(true);
      if (result.success) expect(result.value.nowPassing).toBe(1);
      expect(readFileSync(executed, 'utf8')).toBe('target\n');
      expect(readFileSync(count, 'utf8')).toBe('2');
    });
  }
});

const mochaRunner = process.env.AQE_TEST_MOCHA;
describe.skipIf(!mochaRunner)('native Mocha literal retry selection', () => {
  it.each([
    { fileName: 'plain.test.cjs', name: 'ordinary case' },
    { fileName: 'plain.test.cjs', name: '--literal-case' },
    { fileName: '--target.test.cjs', name: 'ordinary case' },
  ])('selects $fileName and $name', async ({ fileName, name }) => {
    const runner = resolve(mochaRunner!);
    const fixture = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-mocha-literal-')));
    fixtures.push(fixture);
    const file = join(fixture, fileName);
    const count = join(fixture, 'count');
    const executed = join(fixture, 'executed');
    writeFileSync(file, `
      const fs = require('node:fs');
      const assert = require('node:assert/strict');
      it(${JSON.stringify(name)}, () => {
        const n = fs.existsSync(${JSON.stringify(count)}) ? Number(fs.readFileSync(${JSON.stringify(count)}, 'utf8')) + 1 : 1;
        fs.writeFileSync(${JSON.stringify(count)}, String(n));
        fs.appendFileSync(${JSON.stringify(executed)}, 'target\\n');
        assert.ok(n > 1);
      });
      it('decoy case', () => { fs.appendFileSync(${JSON.stringify(executed)}, 'decoy\\n'); });
    `);
    const initial = spawnSync(process.execPath, [runner, '--reporter', 'json', file], {
      cwd: fixture, encoding: 'utf8', timeout: 10000,
    });
    expect(initial.status, initial.stderr).toBe(1);
    const report = JSON.parse(initial.stdout);
    expect(report.stats.failures).toBe(1);
    writeFileSync(executed, '');
    const service = new RetryHandlerService({ get: vi.fn(), set: vi.fn() } as never, { testRunner: 'mocha', cwd: fixture });
    const internals = service as unknown as Builder;
    const original = internals.buildTestCommand.bind(internals);
    internals.buildTestCommand = (framework, testFile, testName) => {
      const command = original(framework, testFile, testName);
      return { command: process.execPath, args: [runner, ...command.args.slice(1)] };
    };
    const originalCwd = process.cwd();
    const result = await (async () => {
      process.chdir(fixture);
      try {
        return await service.executeWithRetry({ runId: 'literal-mocha', failedTests: [{ testId: 'target', testName: name,
          file: fileName.startsWith('--') ? fileName : file, error: 'initial failure', duration: 1 }], maxRetries: 1,
          backoff: 'constant', baseDelay: 0 });
      } finally { process.chdir(originalCwd); }
    })();
    expect(result.success, result.success ? undefined : result.error.message).toBe(true);
    if (result.success) expect(result.value.nowPassing).toBe(1);
    expect(readFileSync(executed, 'utf8')).toBe('target\n');
    expect(readFileSync(count, 'utf8')).toBe('2');
  });
});
