/**
 * Agentic QE v3 - Command Hooks (guard, pre-command, post-command)
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Handles file guardian and Bash command lifecycle hooks.
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import chalk from 'chalk';
import path from 'node:path';
import { QE_HOOK_EVENTS } from '../../../learning/qe-hooks.js';
import { findProjectRoot, getUnifiedMemory } from '../../../kernel/unified-memory.js';
import {
  applyHookBusyTimeout,
  getHooksSystem,
  createHybridBackendWithTimeout,
  incrementDreamExperience,
  persistCommandExperience,
  printJson,
  printSuccess,
  printError,
} from './hooks-shared.js';
import {
  ToolLoopGuardrail,
  createProjectToolLoopGuardrail,
  type ToolLoopCheck,
} from './tool-loop-guardrail.js';

/**
 * Detect test framework from a Bash command. Returns null when no recognized
 * framework is invoked.
 */
function detectTestFramework(command: string): string | null {
  if (/\bjest\b/i.test(command)) return 'jest';
  if (/\bvitest\b/i.test(command)) return 'vitest';
  if (/\bpytest\b/i.test(command)) return 'pytest';
  if (/\bmocha\b/i.test(command)) return 'mocha';
  return null;
}

/**
 * Persist test_outcomes (patch 070) and coverage_sessions (patch 170) for a
 * test-framework command. Best-effort — failures are logged at debug level.
 */
async function persistTestAndCoverage(opts: {
  command: string;
  framework: string;
  success: boolean;
  durationMs: number;
}): Promise<void> {
  try {
    const um = getUnifiedMemory();
    if (!um.isInitialized()) {
      await um.initialize();
    }
    const db = um.getDatabase();
    applyHookBusyTimeout(db);

    const language = opts.framework === 'pytest' ? 'python' : 'javascript';
    const cmdSlug = opts.command.split(/\s+/).slice(0, 3).join('-').slice(0, 80);

    db.prepare(`
      INSERT INTO test_outcomes (
        id, test_id, test_name, generated_by, framework, language, domain,
        passed, execution_time_ms, maintainability_score, created_at
      ) VALUES (?, ?, ?, 'cli-hook-post-command', ?, ?, 'test-execution',
                ?, ?, 0.5, datetime('now'))
    `).run(
      `to-${Date.now()}-${randomUUID().slice(0, 8)}`,
      `cmd:${cmdSlug}`,
      opts.command.slice(0, 200),
      opts.framework,
      language,
      opts.success ? 1 : 0,
      opts.durationMs,
    );

    // Patch 170: parse Istanbul coverage summary if it exists. Reuses the
    // previous after_* values as before_* so coverage delta is calculable.
    try {
      const summaryPath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
      if (existsSync(summaryPath)) {
        const summary = JSON.parse(readFileSync(summaryPath, 'utf-8')) as {
          total?: {
            lines?: { pct?: number };
            branches?: { pct?: number };
            functions?: { pct?: number };
          };
        };
        const total = summary.total ?? {};
        const afterLines = Number(total.lines?.pct ?? 0);
        const afterBranches = Number(total.branches?.pct ?? 0);
        const afterFunctions = Number(total.functions?.pct ?? 0);

        const prev = db.prepare(`
          SELECT after_lines, after_branches, after_functions
          FROM coverage_sessions
          WHERE target_path = ?
          ORDER BY created_at DESC
          LIMIT 1
        `).get(process.cwd()) as
          | { after_lines: number; after_branches: number; after_functions: number }
          | undefined;

        const nowIso = new Date().toISOString();
        db.prepare(`
          INSERT INTO coverage_sessions (
            id, target_path, agent_id, technique,
            before_lines, before_branches, before_functions,
            after_lines, after_branches, after_functions,
            tests_generated, tests_passed, duration_ms,
            started_at, completed_at
          ) VALUES (?, ?, 'cli-hook-post-command', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
        `).run(
          `cs-${Date.now()}-${randomUUID().slice(0, 8)}`,
          process.cwd(),
          opts.framework,
          prev?.after_lines ?? 0,
          prev?.after_branches ?? 0,
          prev?.after_functions ?? 0,
          afterLines,
          afterBranches,
          afterFunctions,
          opts.success ? 1 : 0,
          opts.durationMs,
          nowIso,
          nowIso,
        );
      }
    } catch (covErr) {
      console.error(chalk.dim(`[hooks] coverage_sessions: ${covErr instanceof Error ? covErr.message : 'unknown'}`));
    }
  } catch (error) {
    console.error(chalk.dim(`[hooks] test_outcomes: ${error instanceof Error ? error.message : 'unknown'}`));
  }
}

/**
 * Register guard, pre-command, and post-command subcommands on the hooks command.
 */
export function registerCommandHooks(hooks: Command): void {
  // -------------------------------------------------------------------------
  // guard: File guardian - block edits to protected files (PreToolUse)
  // -------------------------------------------------------------------------
  hooks
    .command('guard')
    .description('File guardian - block edits to protected files')
    .requiredOption('-f, --file <path>', 'File path to check')
    .option('--json', 'Output as JSON (required for hook API)')
    .action(async (options) => {
      try {
        const filePath = options.file || '';
        const normalizedPath = filePath.replace(/\\/g, '/');

        // Protected file patterns
        const protectedPatterns: Array<{ pattern: RegExp; reason: string }> = [
          { pattern: /^\.env($|\.)/, reason: 'Environment file contains secrets' },
          { pattern: /\.env\.[a-zA-Z]+$/, reason: 'Environment file contains secrets' },
          { pattern: /\.lock$/, reason: 'Lock files are auto-generated' },
          { pattern: /(^|\/)node_modules\//, reason: 'node_modules is managed by package manager' },
          { pattern: /(^|\/)\.agentic-qe\/memory\.db/, reason: 'AQE memory database must not be directly edited' },
          { pattern: /(^|\/)\.agentic-qe\/memory\.db-wal$/, reason: 'AQE WAL file must not be directly edited' },
          { pattern: /(^|\/)\.agentic-qe\/memory\.db-shm$/, reason: 'AQE shared memory file must not be directly edited' },
        ];

        const match = protectedPatterns.find(p => p.pattern.test(normalizedPath));

        if (match) {
          // Deny - use Claude Code hookSpecificOutput API format
          if (options.json) {
            printJson({
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason: `Protected file: ${match.reason} (${filePath})`,
              },
            });
          } else {
            printError(`Blocked: ${match.reason} (${filePath})`);
          }
        } else {
          // Allow
          if (options.json) {
            printJson({
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'allow',
              },
            });
          } else {
            printSuccess(`Allowed: ${filePath}`);
          }
        }

        return;
      } catch {
        // On error, allow (fail-open for non-critical guard)
        if (options.json) {
          printJson({
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'allow',
            },
          });
        }
        return;
      }
    });

  // -------------------------------------------------------------------------
  // pre-command: Get guidance before Bash command (called by PreToolUse hook)
  // -------------------------------------------------------------------------
  hooks
    .command('pre-command')
    .description('Get context before executing a Bash command')
    .option('-c, --command <cmd>', 'Command to be executed')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const command = options.command || '';

        // Dangerous command patterns that should be BLOCKED
        const dangerousPatterns: Array<{ pattern: RegExp; reason: string }> = [
          { pattern: /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?-[a-zA-Z]*r[a-zA-Z]*\s+\/(?!\w)/, reason: 'Recursive delete of root filesystem' },
          { pattern: /rm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+)?-[a-zA-Z]*f[a-zA-Z]*\s+\/(?!\w)/, reason: 'Recursive delete of root filesystem' },
          { pattern: /rm\s+-rf\s+~/, reason: 'Recursive delete of home directory' },
          { pattern: /DROP\s+(TABLE|DATABASE|SCHEMA)/i, reason: 'Destructive SQL operation' },
          { pattern: /git\s+push\s+.*--force(?!-)/, reason: 'Force push can overwrite remote history' },
          { pattern: /git\s+reset\s+--hard/, reason: 'Hard reset discards uncommitted changes' },
          { pattern: />\s*\/dev\/sd[a-z]/, reason: 'Direct write to block device' },
          { pattern: /dd\s+if=.*of=\/dev\/sd/, reason: 'Direct disk write via dd' },
          { pattern: /chmod\s+777\s/, reason: 'World-writable permissions are a security risk' },
          { pattern: /:\(\)\s*\{\s*:\|\s*:&\s*\}\s*;?\s*:/, reason: 'Fork bomb detected' },
          { pattern: /mkfs\./, reason: 'Filesystem format operation' },
          { pattern: />\s*\/dev\/null\s*2>&1\s*&\s*disown/, reason: 'Stealth background process' },
        ];

        // Warning patterns (inform but don't block)
        const warningPatterns: Array<{ pattern: RegExp; reason: string }> = [
          { pattern: /\.agentic-qe.*rm/, reason: 'Deleting AQE data files' },
          { pattern: /rm\s+-rf\s/, reason: 'Recursive force delete' },
          { pattern: /git\s+clean\s+-[a-zA-Z]*f/, reason: 'Force cleaning untracked files' },
        ];

        const dangerMatch = dangerousPatterns.find(p => p.pattern.test(command));
        const warnings = warningPatterns
          .filter(p => p.pattern.test(command))
          .map(p => p.reason);

        // ADR-100: tool-loop circuit breaker — flag commands that keep
        // failing consecutively (state recorded by post-command). Fail-open.
        let loopCheck: ToolLoopCheck | null = null;
        try {
          loopCheck = createProjectToolLoopGuardrail(findProjectRoot()).check(command);
        } catch { /* guardrail must never break the hook */ }

        if (loopCheck && loopCheck.verdict === 'block' && ToolLoopGuardrail.isStrict()) {
          // Strict mode: deny like a dangerous command
          if (options.json) {
            printJson({
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason: `Tool-loop breaker (AQE_STRICT_TOOL_LOOP): ${loopCheck.hint}`,
              },
            });
          } else {
            printError(`Blocked by tool-loop breaker: ${loopCheck.hint}`);
          }
          return;
        }
        if (loopCheck && loopCheck.verdict === 'block') {
          warnings.push(`🛑 TOOL-LOOP BREAKER: ${loopCheck.hint}`);
        } else if (loopCheck && loopCheck.verdict === 'warn') {
          warnings.push(`Tool-loop breaker: ${loopCheck.hint}`);
        }

        if (dangerMatch) {
          // BLOCK the command
          if (options.json) {
            printJson({
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason: `Dangerous command blocked: ${dangerMatch.reason}`,
              },
            });
          } else {
            printError(`Blocked: ${dangerMatch.reason}`);
          }
        } else {
          // Allow (with optional warnings as context)
          if (options.json) {
            const result: Record<string, unknown> = {
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'allow',
              },
            };
            if (warnings.length > 0) {
              (result.hookSpecificOutput as Record<string, unknown>).additionalContext =
                `Warnings: ${warnings.join('; ')}`;
            }
            printJson(result);
          } else if (warnings.length > 0) {
            console.log(chalk.yellow('\n⚠️  Command Warnings:'));
            warnings.forEach(w => console.log(chalk.yellow(`  - ${w}`)));
          }
        }

        return;
      } catch {
        // Fail-open on error
        if (options.json) {
          printJson({
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'allow',
            },
          });
        }
        return;
      }
    });

  // -------------------------------------------------------------------------
  // post-command: Record command outcome (called by PostToolUse hook)
  // -------------------------------------------------------------------------
  hooks
    .command('post-command')
    .description('Record Bash command outcome')
    .option('-c, --command <cmd>', 'Command that was executed')
    .option('--success [bool]', 'Whether command succeeded', 'true')
    .option('--exit-code <code>', 'Command exit code')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const success = options.success === 'true' || options.success === true;
        const exitCode = options.exitCode ? parseInt(options.exitCode, 10) : (success ? 0 : 1);
        const command = (options.command || '').substring(0, 200);

        // ADR-100: feed the tool-loop breaker — success resets, failure
        // increments. Synchronous sidecar write; fail-open.
        try {
          createProjectToolLoopGuardrail(findProjectRoot()).record(command, success);
        } catch { /* guardrail must never break the hook */ }

        // Determine if this is a test/build/lint command for richer learning
        const isTestCmd = /\b(test|vitest|jest|pytest|mocha)\b/i.test(command);
        const isBuildCmd = /\b(build|compile|tsc)\b/i.test(command);
        const isLintCmd = /\b(lint|eslint|prettier)\b/i.test(command);

        let patternsLearned = 0;
        let experienceRecorded = false;

        try {
          const { reasoningBank } = await getHooksSystem();

          // For test commands, emit TestExecutionResult for pattern learning
          if (isTestCmd) {
            const { hookRegistry } = await getHooksSystem();
            await hookRegistry.emit(QE_HOOK_EVENTS.TestExecutionResult, {
              runId: `cmd-${Date.now()}`,
              patternId: `cmd:test:${command.split(/\s+/).slice(0, 3).join('-')}`,
              passed: success ? 1 : 0,
              failed: success ? 0 : 1,
              duration: 0,
              flaky: false,
            });
          }

          // Record outcome for all commands
          const cmdSlug = command.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 80);
          const domain = isTestCmd ? 'test-execution' : isBuildCmd ? 'code-intelligence' : isLintCmd ? 'quality-assessment' : 'code-intelligence';
          await reasoningBank.recordOutcome({
            patternId: `cmd:${cmdSlug}`,
            success,
            metrics: { executionTimeMs: 0 },
            feedback: `Command: ${command}, exit: ${exitCode}`,
          });
          patternsLearned = 1;

          // Persist as captured experience — gated to test/build/lint commands
          // so non-test Bash (git, ls, etc.) doesn't flood captured_experiences
          // with low-success-rate noise that dilutes pattern signal.
          // reasoningBank.recordOutcome above is the broader metric path and
          // stays unconditional.
          if (isTestCmd || isBuildCmd || isLintCmd) {
            await persistCommandExperience({
              task: `bash: ${command}`,
              agent: 'cli-hook',
              domain,
              success,
              source: 'cli-hook-post-command',
            });
            experienceRecorded = true;
          }

          // Patches 070 + 170: when a recognized test framework ran, write
          // test_outcomes and (if Istanbul coverage summary is present) a
          // coverage_sessions row. Best-effort.
          const framework = detectTestFramework(command);
          if (framework) {
            await persistTestAndCoverage({
              command,
              framework,
              success,
              durationMs: 0, // post-command does not currently track exec time
            });
          }

          // Increment dream experience counter
          const projectRoot = findProjectRoot();
          const dataDir = path.join(projectRoot, '.agentic-qe');
          const memoryBackend = await createHybridBackendWithTimeout(dataDir);
          await incrementDreamExperience(memoryBackend);
        } catch (initError) {
          console.error(chalk.dim(`[hooks] post-command learning: ${initError instanceof Error ? initError.message : 'unknown'}`));
        }

        if (options.json) {
          printJson({
            success: true,
            command: command.substring(0, 100),
            commandSuccess: success,
            exitCode,
            patternsLearned,
            experienceRecorded,
          });
        }
        // Silent in non-JSON mode to avoid cluttering output

        return;
      } catch (error) {
        if (options.json) {
          printJson({ success: false, error: error instanceof Error ? error.message : 'unknown' });
        }
        return;
      }
    });
}
