/**
 * Agentic QE v3 - Command Hooks (guard, pre-command, post-command)
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Handles file guardian and Bash command lifecycle hooks.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { QE_HOOK_EVENTS } from '../../../learning/qe-hooks.js';
import { findProjectRoot } from '../../../kernel/unified-memory.js';
import {
  getHooksSystem,
  createHybridBackendWithTimeout,
  incrementDreamExperience,
  persistCommandExperience,
  printJson,
  printSuccess,
  printError,
} from './hooks-shared.js';

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
      } catch (error) {
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
      } catch (error) {
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
    .option('--success <bool>', 'Whether command succeeded', 'true')
    .option('--exit-code <code>', 'Command exit code')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const success = options.success === 'true' || options.success === true;
        const exitCode = options.exitCode ? parseInt(options.exitCode, 10) : (success ? 0 : 1);
        const command = (options.command || '').substring(0, 200);

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

          // Persist as captured experience
          await persistCommandExperience({
            task: `bash: ${command}`,
            agent: 'cli-hook',
            domain,
            success,
            source: 'cli-hook-post-command',
          });
          experienceRecorded = true;

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
