/**
 * Run git without blocking the event loop (#1115).
 *
 * Git runs in its own process group, so a timeout stops it together with any
 * wrapper, credential helper or fsmonitor child it started.
 */

import { runProcessText } from '../test-runner-process.js';

/** Git did not finish before its deadline; its result is unknown, not empty. */
export class GitTimeoutError extends Error {
  constructor(args: readonly string[], timeoutMs: number) {
    super(`git ${args.join(' ')} timed out after ${Math.max(0, timeoutMs)}ms`);
    this.name = 'GitTimeoutError';
  }
}

export interface RunGitOptions {
  cwd: string;
  /** Milliseconds before the git process group is stopped. */
  timeout: number;
  maxBuffer?: number;
}

/**
 * Resolve with git's stdout. Rejects with GitTimeoutError when the deadline
 * passes, and with a plain Error when git cannot start or exits non-zero.
 */
export async function runGit(args: readonly string[], options: RunGitOptions): Promise<string> {
  if (options.timeout <= 0) throw new GitTimeoutError(args, options.timeout);
  try {
    return await runProcessText('git', args, {
      cwd: options.cwd,
      timeout: options.timeout,
      maxBuffer: options.maxBuffer,
      // Never wait for a credential prompt that no one can answer.
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ETIMEDOUT') throw new GitTimeoutError(args, options.timeout);
    throw error;
  }
}
