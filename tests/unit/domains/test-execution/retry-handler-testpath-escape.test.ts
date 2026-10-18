/**
 * Issue #909: retry runner arguments must select exactly the failed file and
 * test, even when the path holds regex metacharacters and the name or path
 * starts with '-'.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { RetryHandlerService, type TestRunner } from '../../../../src/domains/test-execution/services/retry-handler.js';

const fixtures: string[] = [];
afterEach(() => {
  for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true });
});

type CommandBuilder = {
  buildTestCommand(runner: TestRunner, file: string, name?: string, cwd?: string): {
    command: string; args: string[]; report?: { cleanup(): void };
  };
};

function handler(config: Record<string, unknown> = {}) {
  return new RetryHandlerService({ get: vi.fn().mockResolvedValue(undefined), set: vi.fn() } as never, config as never);
}

function fixtureDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-909-')));
  fixtures.push(dir);
  return dir;
}

const TARGET = 'app/route[id](group)+v1.test.ts';
const DECOY = 'app/routeigroupv1xtest.ts'; // matches the UNescaped path as a regex

describe('retry runner argv (#909)', () => {
  it('passes Jest an escaped, anchored path pattern instead of --testPathPattern', () => {
    const cwd = fixtureDir();
    const { args } = (handler() as unknown as CommandBuilder).buildTestCommand('jest', TARGET, '-x', cwd);
    expect(args).not.toContain('--testPathPattern');
    const patterns = args.filter(a => a.startsWith('^'));
    expect(patterns).toHaveLength(1);
    const re = new RegExp(patterns[0]);
    expect(re.test(join(cwd, TARGET))).toBe(true);
    expect(re.test(join(cwd, DECOY))).toBe(false);
    expect(re.test(join(cwd, `${TARGET}x`))).toBe(false);
    expect(re.test(join(cwd, 'other', TARGET))).toBe(false);
  });

  it.each(['vitest', 'jest', 'mocha'] as const)('never lets a %s value that starts with "-" be read as a flag', runner => {
    const cwd = fixtureDir();
    const command = (handler() as unknown as CommandBuilder).buildTestCommand(runner, '-dash.test.ts', '-x', cwd);
    try {
      const flag = runner === 'mocha' ? '--grep=' : '--testNamePattern=';
      expect(command.args).toContain(`${flag}^-x$`);
      expect(command.args).not.toContain('-t');
      expect(command.args).not.toContain('--grep');
      // Every value we supply is either a --flag=value or does not start with '-'.
      const supplied = command.args.filter(a => a.includes('dash') || a.includes('-x'));
      for (const arg of supplied) expect(arg.startsWith('-') ? arg.startsWith('--') && arg.includes('=') : true).toBe(true);
      const fileArg = command.args.find(a => a.includes('dash') && !a.startsWith('--'));
      expect(fileArg).toBeDefined();
      expect(fileArg!.startsWith('-')).toBe(false);
    } finally {
      command.report?.cleanup();
    }
  });

  it('retries exactly the failed test in a native Vitest run with a metacharacter path and a "-x" name', async () => {
    const vitest = resolve('node_modules/vitest/vitest.mjs');
    const cwd = fixtureDir();
    mkdirSync(join(cwd, 'app'));
    const executed = join(cwd, 'executed');
    const count = join(cwd, 'count');
    const config = join(cwd, 'vitest.config.mjs');
    writeFileSync(config, 'export default { test: { globals: true, include: ["app/**/*.ts"] } };\n');
    writeFileSync(join(cwd, TARGET), `
      import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
      it('-x', () => {
        const n = existsSync(${JSON.stringify(count)}) ? Number(readFileSync(${JSON.stringify(count)}, 'utf8')) + 1 : 1;
        writeFileSync(${JSON.stringify(count)}, String(n));
        appendFileSync(${JSON.stringify(executed)}, 'target -x\\n');
        expect(n > 1).toBe(true);
      });
      it('other', () => { appendFileSync(${JSON.stringify(executed)}, 'target other\\n'); });
    `);
    writeFileSync(join(cwd, DECOY), `
      import { appendFileSync } from 'node:fs';
      it('-x', () => { appendFileSync(${JSON.stringify(executed)}, 'decoy -x\\n'); });
    `);
    // Initial native run: the target's '-x' fails once.
    const initial = spawnSync(process.execPath, [vitest, 'run', '--root', cwd, '--config', config, `${cwd}/${TARGET}`],
      { cwd, encoding: 'utf8', timeout: 20000 });
    expect(initial.status, initial.stderr).toBe(1);
    writeFileSync(executed, '');

    const service = handler({ cwd, testRunner: 'vitest' });
    const internals = service as unknown as CommandBuilder;
    const original = internals.buildTestCommand.bind(internals);
    internals.buildTestCommand = (runner, file, name, dir) => {
      const command = original(runner, file, name, dir);
      return { ...command, command: process.execPath,
        args: [vitest, ...command.args.slice(1), '--config', config, '--root', cwd] };
    };
    const result = await service.executeWithRetry({
      runId: 'issue-909', maxRetries: 1, backoff: 'constant', baseDelay: 0,
      failedTests: [{ testId: 't1', testName: '-x', file: join(cwd, TARGET), error: 'initial failure', duration: 1 }],
    });

    expect(result.success, result.success ? undefined : result.error.message).toBe(true);
    if (result.success) {
      expect(result.value.nowPassing).toBe(1);
      expect(result.value.flakyDetected).toEqual(['t1']);
    }
    expect(readFileSync(executed, 'utf8')).toBe('target -x\n');
  });
});
