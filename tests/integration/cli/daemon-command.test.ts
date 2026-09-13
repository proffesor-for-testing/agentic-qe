/**
 * Integration regression for #678: `aqe daemon start` must remain in the
 * foreground after Commander finishes dispatching the start action.
 *
 * This drives the built CLI because the defect sits at the boundary between
 * command dispatch and the top-level process cleanup path.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const CLI_BUNDLE = join(ROOT, 'dist', 'cli', 'bundle.js');
const BUILT = existsSync(CLI_BUNDLE);
const SKIP = !BUILT && !process.env.CI;

function waitForStartupOrExit(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for daemon startup. Output:\n${output}`));
    }, 15_000);

    const finish = () => {
      clearTimeout(timeout);
      resolve();
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes('QE Quality Daemon started')) finish();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.once('exit', finish);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();

  return new Promise((resolve) => {
    const forceKill = setTimeout(() => child.kill('SIGKILL'), 5_000);
    // `close` fires after the stdio streams flush; `exit` can precede the
    // daemon's final shutdown message reaching this process.
    child.once('close', () => {
      clearTimeout(forceKill);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

describe.skipIf(SKIP)('#678 — foreground quality daemon lifetime', () => {
  it('should_remainAlive_when_startCommandReportsSuccess', async () => {
    // Arrange
    const projectRoot = mkdtempSync(join(tmpdir(), 'aqe-daemon-678-'));
    const child = spawn(
      process.execPath,
      [CLI_BUNDLE, 'daemon', 'start', '--tick-interval', '100', '--ci-interval', '200'],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          AQE_PROJECT_ROOT: projectRoot,
          AQE_MEMORY_PATH: join(projectRoot, '.agentic-qe'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    try {
      // Act
      await waitForStartupOrExit(child);
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Assert
      expect(child.exitCode).toBeNull();
    } finally {
      await stopChild(child);
      rmSync(projectRoot, { recursive: true, force: true });
    }
  }, 25_000);
});
