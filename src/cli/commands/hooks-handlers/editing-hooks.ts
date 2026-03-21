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
} from './hooks-shared.js';

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
    .option('--success', 'Edit was successful')
    .option('--failure', 'Edit failed')
    .option('--pattern-id <id>', 'Pattern ID that was applied')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const { hookRegistry } = await getHooksSystem();

        const success = options.success || !options.failure;

        // Generate synthetic patternId from file path if none provided
        const filePath = options.file || '';
        const fileName = filePath.split('/').pop() || 'unknown';
        const isTestFile = /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(fileName);
        const domain = isTestFile ? 'test-generation' : 'code-intelligence';
        const syntheticPatternId = options.patternId || `edit:${domain}:${fileName}`;

        const results = await hookRegistry.emit(QE_HOOK_EVENTS.PostTestGeneration, {
          targetFile: options.file,
          success,
          patternId: syntheticPatternId,
          generatedTests: null,
          testCount: 0,
        });

        const result = results[0] || { success: true, patternsLearned: 0 };

        // Also explicitly call recordOutcome so qe_pattern_usage gets a row
        try {
          const { reasoningBank } = await getHooksSystem();
          await reasoningBank.recordOutcome({
            patternId: syntheticPatternId,
            success,
            metrics: { executionTimeMs: 0 },
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
            source: 'cli-hook-post-edit',
          });
        } catch {
          // best-effort
        }

        // Record experience for dream scheduler
        let dreamTriggered = false;
        try {
          const projectRoot = findProjectRoot();
          const dataDir = path.join(projectRoot, '.agentic-qe');
          const memoryBackend = await createHybridBackendWithTimeout(dataDir);
          await incrementDreamExperience(memoryBackend);
        } catch {
          // best-effort
        }

        if (options.json) {
          printJson({
            success: true,
            file: options.file,
            editSuccess: success,
            patternsLearned: result.patternsLearned || 0,
            dreamTriggered,
          });
        } else {
          printSuccess(`Recorded edit outcome for ${options.file}`);
          if (result.patternsLearned) {
            console.log(chalk.green(`  Patterns learned: ${result.patternsLearned}`));
          }
        }
        return;
      } catch (error) {
        printError(`post-edit failed: ${error instanceof Error ? error.message : 'unknown'}`);
        throw error;
      }
    });
}
