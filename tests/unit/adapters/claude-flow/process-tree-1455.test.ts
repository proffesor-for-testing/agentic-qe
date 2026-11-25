/**
 * Issue #1455 (round-2 review of PR #1489): a timeout must end every process the
 * command started. `npx --no-install ruflo` runs `node .../ruflo` as a child of npx;
 * execFile's timeout signalled npx only, and the orphaned ruflo kept running and wrote
 * an open trajectory. These tests run real processes: a parent (like npx) that starts
 * a child (like ruflo) which writes a file later.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { liveGroupCount, runCommandTree, type RunCommandTreeError } from '../../../../src/adapters/claude-flow/process-tree.js';

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(process.platform === 'win32')('runCommandTree (#1455)', () => {
  let dir: string;
  const node = process.execPath;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'aqe-1455-tree-'));
    // The "ruflo" child: records its pid, writes late.txt after 1.5 s, keeps running.
    writeFileSync(
      join(dir, 'child.cjs'),
      [
        "const fs = require('fs'); const path = require('path');",
        "const [, , out, ignoreTerm] = process.argv;",
        "if (ignoreTerm === 'ignore-term') process.on('SIGTERM', () => {});",
        "fs.writeFileSync(path.join(out, 'child.pid'), String(process.pid));",
        "setTimeout(() => fs.writeFileSync(path.join(out, 'late.txt'), 'written'), 1500);",
        'setInterval(() => {}, 1000);',
      ].join('\n'),
    );
    // The "npx" parent: starts the child and waits for it.
    writeFileSync(
      join(dir, 'parent.cjs'),
      [
        "const { spawn } = require('child_process'); const path = require('path');",
        "const [, , out, mode] = process.argv;",
        "const c = spawn(process.execPath, [path.join(__dirname, 'child.cjs'), out, mode ?? ''], { stdio: 'inherit' });",
        "c.on('exit', (code) => process.exit(code ?? 1));",
      ].join('\n'),
    );
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function timeOut(out: string, mode: string) {
    const error = (await runCommandTree(node, [join(dir, 'parent.cjs'), out, mode], {
      timeoutMs: 400,
      killGraceMs: 300,
    }).catch((e: unknown) => e)) as RunCommandTreeError;
    for (let i = 0; i < 20 && !existsSync(join(out, 'child.pid')); i++) await sleep(50);
    return { error, childPid: Number(readFileSync(join(out, 'child.pid'), 'utf8')) };
  }

  it('should_killTheGrandchild_when_theCommandTimesOut', async () => {
    const out = mkdtempSync(join(dir, 'term-'));
    const { error, childPid } = await timeOut(out, '');

    expect(error).toMatchObject({ message: 'timed out after 400 ms', killed: true });
    expect(alive(childPid)).toBe(false);
    await sleep(1600); // past the child's write
    expect(existsSync(join(out, 'late.txt'))).toBe(false);
  });

  it('should_sigkillTheGroup_when_theGrandchildIgnoresSigterm', async () => {
    const out = mkdtempSync(join(dir, 'kill-'));
    const { error, childPid } = await timeOut(out, 'ignore-term');

    expect(error.killed).toBe(true);
    await sleep(100);
    expect(alive(childPid)).toBe(false);
    await sleep(1600);
    expect(existsSync(join(out, 'late.txt'))).toBe(false);
  });

  it('should_returnStdout_when_theCommandExitsZero', async () => {
    await expect(runCommandTree(node, ['-e', "process.stdout.write('Result:\\n{}')"], { timeoutMs: 10_000 })).resolves.toBe(
      'Result:\n{}',
    );
  });

  it('should_rejectWithOutput_when_theCommandExitsNonZero', async () => {
    const error = (await runCommandTree(node, ['-e', "console.error('[ERROR] Tool not found: x'); process.exit(1)"], {
      timeoutMs: 10_000,
    }).catch((e: unknown) => e)) as RunCommandTreeError;
    expect(error).toMatchObject({ code: 1, killed: false });
    expect(error.stderr).toContain('[ERROR] Tool not found: x');
  });

  it('should_killTheTree_when_outputExceedsMaxBuffer', async () => {
    const error = (await runCommandTree(node, ['-e', "setInterval(() => process.stdout.write('x'.repeat(4096)), 1)"], {
      timeoutMs: 10_000,
      maxBuffer: 64 * 1024,
    }).catch((e: unknown) => e)) as RunCommandTreeError;
    expect(error).toMatchObject({ message: 'output exceeded 65536 bytes', killed: true });
  });

  // Round-3 review: a character split across two pipe chunks became U+FFFD.
  it('should_keepMultiByteCharacters_when_theySpanChunks', async () => {
    const out = await runCommandTree(node, ['-e', "process.stdout.write('é€🙂'.repeat(200000))"], { timeoutMs: 20_000 });
    expect(Buffer.byteLength(out)).toBeGreaterThan(64 * 1024);
    expect(out).toBe('é€🙂'.repeat(200000));
    expect(out.includes('\uFFFD')).toBe(false);
  });

  it('should_countBytes_when_limitingMultiByteOutput', async () => {
    // 20 000 × 9 bytes = 180 000 bytes, but only 80 000 characters.
    const error = (await runCommandTree(node, ['-e', "process.stdout.write('é€🙂'.repeat(20000))"], {
      timeoutMs: 20_000,
      maxBuffer: 100_000,
    }).catch((e: unknown) => e)) as RunCommandTreeError;
    expect(error.message).toBe('output exceeded 100000 bytes');
  });

  it('should_removeItsSignalHandlers_when_noCommandIsRunning', async () => {
    const before = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM'), process.listenerCount('exit')];
    const pending = runCommandTree(node, ['-e', 'setTimeout(() => {}, 200)'], { timeoutMs: 10_000 });
    expect(liveGroupCount()).toBe(1);
    expect(process.listenerCount('SIGINT')).toBe(before[0] + 1);
    await pending;
    expect(liveGroupCount()).toBe(0);
    expect([process.listenerCount('SIGINT'), process.listenerCount('SIGTERM'), process.listenerCount('exit')]).toEqual(before);
  });

  // Round-3 review (r3hang): a detached group no longer gets Ctrl-C or dies with AQE.
  describe('when the AQE process ends', () => {
    const tsx = join(process.cwd(), 'node_modules/.bin/tsx');
    const hostScript = (out: string, ending: string) =>
      [
        `import { runCommandTree } from ${JSON.stringify(join(process.cwd(), 'src/adapters/claude-flow/process-tree.ts'))};`,
        `const pidFile = ${JSON.stringify(join(out, 'hung.pid'))};`,
        // A "ruflo" that ignores SIGTERM, never writes, and would run for 60 s.
        `void runCommandTree('sh', ['-c', 'echo $$ > ' + pidFile + '; trap "" TERM; sleep 60'], { timeoutMs: 120000 }).catch(() => {});`,
        ending,
      ].join('\n');

    async function host(out: string, ending: string) {
      writeFileSync(join(out, 'host.mts'), hostScript(out, ending));
      const child = spawn(tsx, [join(out, 'host.mts')], { stdio: 'ignore' });
      for (let i = 0; i < 100 && !existsSync(join(out, 'hung.pid')); i++) await sleep(100);
      const hungPid = Number(readFileSync(join(out, 'hung.pid'), 'utf8'));
      expect(alive(hungPid)).toBe(true);
      return { child, hungPid };
    }

    const exited = (child: ReturnType<typeof spawn>) =>
      new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
        child.once('exit', (code, signal) => resolve({ code, signal })),
      );

    it('should_killTheGroupAndKeepDefaultCtrlC_when_sigintArrives', async () => {
      const out = mkdtempSync(join(dir, 'sigint-'));
      const { child, hungPid } = await host(out, 'setInterval(() => {}, 1000);');
      const done = exited(child);
      // tsx forwards the signal to the node process running the script.
      child.kill('SIGINT');
      const { code, signal } = await done;
      expect(signal === 'SIGINT' || code === 130).toBe(true); // default Ctrl-C: killed by SIGINT
      await sleep(200);
      expect(alive(hungPid)).toBe(false);
    }, 30_000);

    it('should_killTheGroup_when_theProcessExits', async () => {
      const out = mkdtempSync(join(dir, 'exit-'));
      const pidFile = JSON.stringify(join(out, 'hung.pid'));
      const { child, hungPid } = await host(
        out,
        `const fs = await import('node:fs'); const t = setInterval(() => { if (fs.existsSync(${pidFile})) { clearInterval(t); setTimeout(() => process.exit(3), 1000); } }, 50);`,
      );
      const { code } = await exited(child);
      expect(code).toBe(3);
      await sleep(200);
      expect(alive(hungPid)).toBe(false);
    }, 30_000);
  });

  it('should_notUseAShell_when_argumentsHaveShellCharacters', async () => {
    const out = await runCommandTree(node, ['-e', 'process.stdout.write(process.argv[1])', '$(echo hi); `id` | x'], {
      timeoutMs: 10_000,
    });
    expect(out).toBe('$(echo hi); `id` | x');
  });
});
