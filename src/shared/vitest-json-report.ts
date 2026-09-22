/**
 * Vitest JSON report handling that works on Vitest 4 and 5.
 *
 * Vitest 5 no longer prints the `--reporter=json` document to stdout; it
 * writes `.vitest/json/output.json` and prints only
 * `JSON report written to <path>`. Vitest 4 prints the document to stdout
 * unless `--outputFile` is given, in which case it behaves like Vitest 5.
 *
 * Passing an explicit `--outputFile` therefore gives one contract on both
 * majors: the report is always in a file we own. Every runner integration
 * that spawns `vitest run --reporter=json` must go through this module
 * instead of parsing stdout directly.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface VitestJsonReport {
  /** Absolute path the report will be written to. */
  readonly path: string;
  /** CLI arguments to append to `vitest run --reporter=json`. */
  readonly args: readonly string[];
  /**
   * Return the text that carries the JSON document: the report file when the
   * runner wrote one, otherwise the captured stdout (older runners, or a run
   * that died before reporting).
   */
  read(stdout: string): string;
  /** Remove the temporary report directory. Safe to call more than once. */
  cleanup(): void;
}

/**
 * Resolve the JSON document text for a finished Vitest run.
 * Exported separately so the precedence rule is unit-testable without spawning.
 */
export function resolveVitestJsonOutput(stdout: string, reportPath: string | undefined): string {
  if (reportPath && existsSync(reportPath)) {
    try {
      const content = readFileSync(reportPath, 'utf-8');
      if (content.trim().length > 0) return content;
    } catch {
      // Unreadable report: fall back to stdout below.
    }
  }
  return stdout;
}

/**
 * Create a per-run report location. The directory is unique per call so
 * concurrent runs never read each other's output.
 */
export function createVitestJsonReport(): VitestJsonReport {
  const dir = mkdtempSync(join(tmpdir(), 'aqe-vitest-report-'));
  const path = join(dir, 'report.json');
  let cleaned = false;
  return {
    path,
    args: [`--outputFile=${path}`],
    read: (stdout: string) => resolveVitestJsonOutput(stdout, path),
    cleanup: () => {
      if (cleaned) return;
      cleaned = true;
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best effort: a leftover temp dir is not worth failing a test run over.
      }
    },
  };
}

/**
 * True when a command vector (runner command plus arguments) is a
 * `vitest ... --reporter=json` invocation that has not already been given an
 * output file. Pass the runner command as the first element when the caller
 * configures it separately (for example `testRunner: 'vitest'`).
 */
export function needsVitestJsonReportFile(args: readonly string[]): boolean {
  const isVitest = args.some(arg => /(^|[\\/])vitest(\.cmd|\.js|\.mjs)?$/i.test(arg));
  const jsonReporter = args.some((arg, i) =>
    arg === '--reporter=json' || (arg === '--reporter' && args[i + 1] === 'json'));
  const hasOutputFile = args.some(arg => arg.startsWith('--outputFile'));
  return isVitest && jsonReporter && !hasOutputFile;
}
