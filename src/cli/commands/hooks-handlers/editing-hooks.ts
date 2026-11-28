/**
 * Agentic QE v3 - Editing Hooks (pre-edit, post-edit)
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Handles file editing lifecycle hooks for pattern learning.
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
  printGuidance,
  readStdinJsonEvent,
  extractFilePathFromEvent,
} from './hooks-shared.js';
import { resolveObservedHookOutcome } from '../../../routing/routing-outcomes-migration.js';
import {
  HOOK_OBSERVED_OUTCOME_BASIS,
  OBSERVED_HOOK_EDIT_SOURCE,
} from '../../../learning/hook-outcome-provenance.js';

/**
 * Register pre-edit and post-edit subcommands on the hooks command.
 */
export function registerEditingHooks(hooks: Command): void {
  // -------------------------------------------------------------------------
  // pre-edit: Get guidance before editing a file
  // -------------------------------------------------------------------------
  hooks
    .command('pre-edit')
    .description('Get context and guidance before editing a file')
    .requiredOption('-f, --file <path>', 'File path to edit')
    .option('-o, --operation <type>', 'Operation type: create, update, delete, refactor', 'update')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const { hookRegistry } = await getHooksSystem();

        const results = await hookRegistry.emit(QE_HOOK_EVENTS.PreTestGeneration, {
          targetFile: options.file,
          testType: 'unit',
          operation: options.operation,
        });

        const result = results[0] || { success: true, guidance: [], routing: null };

        if (options.json) {
          // Build additionalContext for Claude from guidance
          const guidanceLines = result.guidance || [];
          const agentHint = result.routing?.recommendedAgent
            ? `Recommended agent: ${result.routing.recommendedAgent} (${(result.routing.confidence * 100).toFixed(0)}% confidence).`
            : '';
          const contextStr = [
            agentHint,
            ...guidanceLines.map((g: string) => g),
          ].filter(Boolean).join(' ');

          printJson({
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              additionalContext: contextStr || undefined,
            },
            file: options.file,
            operation: options.operation,
            patterns: result.routing?.patterns?.length || 0,
          });
        } else {
          console.log(chalk.bold('\n📝 Pre-Edit Analysis'));
          console.log(chalk.dim(`  File: ${options.file}`));
          console.log(chalk.dim(`  Operation: ${options.operation}`));

          if (result.routing) {
            console.log(chalk.bold('\n🎯 Recommended Agent:'), chalk.cyan(result.routing.recommendedAgent));
            console.log(chalk.dim(`  Confidence: ${(result.routing.confidence * 100).toFixed(1)}%`));
          }

          console.log(chalk.bold('\n💡 Guidance:'));
          printGuidance(result.guidance || []);
        }
        return;
      } catch (error) {
        printError(`pre-edit failed: ${error instanceof Error ? error.message : 'unknown'}`);
        throw error;
      }
    });

  // -------------------------------------------------------------------------
  // post-edit: Record editing outcome for learning
  // -------------------------------------------------------------------------
  hooks
    .command('post-edit')
    .description('Record editing outcome for pattern learning')
    .requiredOption('-f, --file <path>', 'File path that was edited')
    .option('--outcome <result>', 'Observed edit result: success | failure. Only this records an edit outcome for learning (#1501)')
    .option('--success', 'Deprecated and ignored: installed hooks passed it after every edit. Use --outcome (#1501)')
    .option('--failure', 'Deprecated and ignored: use --outcome failure (#1501)')
    .option('--pattern-id <id>', 'Pattern ID that was applied')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        // #1501 (as #1481/#1493 for post-task): the installed PostToolUse
        // hook ran `post-edit ... --success` after every edit, whatever
        // happened, so neither --success nor --failure is an observed result.
        // Only --outcome is; without it no learning stream records anything.
        const observed = resolveObservedHookOutcome(options);
        const success: boolean | null = observed === null ? null : observed === 'success';

        // Generate synthetic patternId from file path if none provided.
        //
        // `--file` falls back to the Claude Code hook event JSON on stdin.
        // PostToolUse events carry `tool_input.file_path` (and older shapes use
        // `toolInput.file_path`) — without this fallback, $TOOL_INPUT_file_path
        // expansion silently produces `--file ""` and every captured experience
        // ends up tagged `edit: ` with no file path (#453).
        let filePath = options.file || '';
        if (!filePath.trim()) {
          try {
            const rawEvent = await readStdinJsonEvent();
            filePath = extractFilePathFromEvent(rawEvent);
          } catch {
            // best-effort — never crash the hook host
          }
        }
        const fileName = filePath.split('/').pop() || 'unknown';
        const isTestFile = /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(fileName);
        const domain = isTestFile ? 'test-generation' : 'code-intelligence';
        const syntheticPatternId = options.patternId || `edit:${domain}:${fileName}`;

        let patternsLearned = 0;
        if (success !== null) {
          patternsLearned = await recordObservedEdit({ filePath, domain, syntheticPatternId, success });
        }

        if (options.json) {
          printJson({
            success: true,
            file: filePath,
            // null when no result was observed (#1501)
            editSuccess: success,
            outcomeObserved: success !== null,
            patternsLearned,
            dreamTriggered: false,
            dreamReason: 'deferred-to-kernel',
          });
        } else if (success === null) {
          printSuccess(`Edit outcome not observed for ${filePath || '(unknown file)'}: nothing recorded`);
          console.log(chalk.dim('  Pass --outcome success|failure to record one'));
        } else {
          printSuccess(`Recorded edit outcome for ${filePath || '(unknown file)'}`);
          if (patternsLearned) {
            console.log(chalk.green(`  Patterns learned: ${patternsLearned}`));
          }
        }
        return;
      } catch (error) {
        printError(`post-edit failed: ${error instanceof Error ? error.message : 'unknown'}`);
        throw error;
      }
    });
}

/**
 * Feed an OBSERVED edit outcome (`post-edit --outcome`) into the learning
 * streams (#1501): PostTestGeneration handlers, ReasoningBank pattern
 * outcomes, captured_experiences and the dream counter. Every step is
 * best-effort. Returns the patterns learned.
 */
async function recordObservedEdit(opts: {
  filePath: string;
  domain: string;
  syntheticPatternId: string;
  success: boolean;
}): Promise<number> {
  const { filePath, domain, syntheticPatternId, success } = opts;
  const { hookRegistry, reasoningBank } = await getHooksSystem();

  const results = await hookRegistry.emit(QE_HOOK_EVENTS.PostTestGeneration, {
    targetFile: filePath,
    success,
    patternId: syntheticPatternId,
    generatedTests: null,
    testCount: 0,
  });
  const result = results[0] || { success: true, patternsLearned: 0 };

  // Also explicitly call recordOutcome so qe_pattern_usage gets a row
  try {
    await reasoningBank.recordOutcome({
      patternId: syntheticPatternId,
      success,
      // #1129 / #1501: the hook caller observed this result
      metrics: { executionTimeMs: 0, outcome: 'measured', outcomeBasis: HOOK_OBSERVED_OUTCOME_BASIS },
      feedback: `Edit ${success ? 'succeeded' : 'failed'}: ${filePath}`,
    });
  } catch {
    // best-effort
  }

  // Persist as captured experience
  try {
    await persistCommandExperience({
      task: `edit: ${filePath}`,
      agent: 'cli-hook',
      domain,
      success,
      source: OBSERVED_HOOK_EDIT_SOURCE,
    });
  } catch {
    // best-effort
  }

  // ADR-094: post-edit bumps the experience counter but DOES NOT
  // trigger dream cycles inline. Dream cycles run in the long-lived
  // kernel (see QEKernelImpl._dreamScheduler) so the 10-second SQLite
  // write transaction doesn't block other writers from this short-lived
  // hook subprocess. The JSON output retains dreamTriggered/dreamReason
  // so existing operator scripts don't break — dreamReason now reads
  // 'deferred-to-kernel' to signal where the actual cycle runs.
  try {
    const projectRoot = findProjectRoot();
    const dataDir = path.join(projectRoot, '.agentic-qe');
    const memoryBackend = await createHybridBackendWithTimeout(dataDir);
    await incrementDreamExperience(memoryBackend);
  } catch {
    // best-effort
  }

  return result.patternsLearned || 0;
}
