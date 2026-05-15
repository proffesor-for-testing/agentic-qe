/**
 * ADR-094: Hooks-as-Producers / Kernel-as-Consumers boundary contract.
 *
 * Hook subprocesses (`npx aqe hooks ...`) are short-lived processes invoked
 * by Claude Code on every Edit/Write/Task tool use. They MUST NOT do work
 * that exceeds ~100ms, because:
 *   - they exit before any in-process state can be reused;
 *   - they hold SQLite write transactions for the duration of any heavy
 *     work, blocking the kernel and other hooks;
 *   - their stderr is consumed by Claude Code's hook reader, so any error
 *     emitted to stderr from heavy work is invisible to operators.
 *
 * Acceptable hook-side work:
 *   - producer SQLite writes (`captured_experiences`, `kv_store` cursor bumps)
 *   - counter increments (`incrementDreamExperience`)
 *   - routing lookups against the in-memory ReasoningBank
 *
 * Unacceptable hook-side work (must be moved kernel-side via the bridge
 * pattern, ADR-094 dream cycles being the first formalized case):
 *   - dream cycles (DreamEngine.initialize, engine.dream, applyInsight loop)
 *   - any operation that holds a write transaction > 100ms
 *
 * This test fails the build if any file under `src/cli/commands/hooks-handlers/`
 * imports from a forbidden module. It catches accidental regressions where a
 * contributor re-introduces heavy hook-side work without realizing the cost.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const HOOKS_HANDLERS_DIR = path.resolve(
  __dirname,
  '../../../src/cli/commands/hooks-handlers',
);

/**
 * Forbidden import patterns. Each entry is:
 *   - `pattern`: regex tested against the full source line (including the
 *     trailing `from '...'` so we match real imports, not unrelated mentions)
 *   - `reason`: human-readable rationale shown when the test fails
 *   - `allowedFiles`: files that may keep the import (typically the module
 *     that DEFINES the heavy thing, kept for backwards-compat with external
 *     callers but NOT used by the actual hook handlers)
 */
const FORBIDDEN_IMPORTS: Array<{
  pattern: RegExp;
  reason: string;
  allowedFiles: string[];
}> = [
  {
    pattern: /from\s+['"].*\/learning\/dream\/(?!index)/,
    reason:
      'ADR-094: dream cycles run kernel-side. Hook handlers must not import from src/learning/dream/.',
    allowedFiles: [],
  },
  {
    pattern: /\bcheckAndTriggerDream\b/,
    reason:
      'ADR-094: checkAndTriggerDream runs a 10-second SQLite write transaction. Hook handlers must let the kernel-side DreamScheduler trigger dreams.',
    // hooks-dream-learning.ts DEFINES the function (kept for backwards-compat
    // with non-handler callers). The handlers themselves must not reference it.
    allowedFiles: ['hooks-dream-learning.ts'],
  },
];

function listHookHandlerFiles(): string[] {
  const entries = readdirSync(HOOKS_HANDLERS_DIR);
  return entries
    .filter((name) => {
      const full = path.join(HOOKS_HANDLERS_DIR, name);
      return statSync(full).isFile() && name.endsWith('.ts');
    })
    .map((name) => path.join(HOOKS_HANDLERS_DIR, name));
}

describe('hooks-handlers boundary contract (ADR-094)', () => {
  const files = listHookHandlerFiles();

  it('discovers hook handler files (sanity check)', () => {
    expect(files.length).toBeGreaterThan(0);
    // The two handlers that fire on every Claude Code tool use must be present.
    const names = files.map((f) => path.basename(f));
    expect(names).toContain('editing-hooks.ts');
    expect(names).toContain('task-hooks.ts');
  });

  for (const { pattern, reason, allowedFiles } of FORBIDDEN_IMPORTS) {
    it(`no handler imports/references match: ${pattern}`, () => {
      const violations: Array<{ file: string; line: number; text: string }> = [];

      for (const file of files) {
        const basename = path.basename(file);
        if (allowedFiles.includes(basename)) continue;

        const lines = readFileSync(file, 'utf-8').split('\n');
        lines.forEach((line, idx) => {
          // Skip pure comment lines so an explanatory mention doesn't
          // false-positive (e.g. "// ADR-094: checkAndTriggerDream runs ...").
          const trimmed = line.trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
          if (pattern.test(line)) {
            violations.push({ file: basename, line: idx + 1, text: line.trim() });
          }
        });
      }

      if (violations.length > 0) {
        const detail = violations
          .map((v) => `  ${v.file}:${v.line} — ${v.text}`)
          .join('\n');
        throw new Error(
          `${reason}\n\nViolating references:\n${detail}\n\n` +
            `If you genuinely need heavy work in a hook subprocess, ` +
            `read ADR-094 first — the right solution is almost always to ` +
            `move the work kernel-side via the CapturedExperienceBridge / ` +
            `DreamScheduler pattern.`,
        );
      }

      expect(violations).toHaveLength(0);
    });
  }
});
