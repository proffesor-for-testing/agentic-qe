/**
 * Agentic QE v3 - Task Hooks (pre-task, post-task)
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Handles task lifecycle hooks for pattern learning.
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
  checkAndTriggerDream,
  printJson,
  printSuccess,
} from './hooks-shared.js';

/**
 * Register pre-task and post-task subcommands on the hooks command.
 */
export function registerTaskHooks(hooks: Command): void {
  // -------------------------------------------------------------------------
  // pre-task: Get guidance before spawning a Task (called by PreToolUse hook)
  // -------------------------------------------------------------------------
  hooks
    .command('pre-task')
    .description('Get context and guidance before spawning a Task agent')
    .option('--task-id <id>', 'Task identifier')
    .option('-d, --description <desc>', 'Task description')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const { reasoningBank } = await getHooksSystem();

        // Route the task to get agent recommendation
        let routing = null;
        if (options.description) {
          const result = await reasoningBank.routeTask({
            task: options.description,
          });
          if (result.success) {
            routing = result.value;
          }
        }

        if (options.json) {
          printJson({
            success: true,
            taskId: options.taskId,
            description: options.description,
            recommendedAgent: routing?.recommendedAgent,
            confidence: routing?.confidence,
            guidance: routing?.guidance || [],
          });
        } else {
          console.log(chalk.bold('\n🚀 Pre-Task Analysis'));
          console.log(chalk.dim(`  Task ID: ${options.taskId || 'N/A'}`));
          if (routing) {
            console.log(chalk.bold('\n🎯 Recommended:'), chalk.cyan(routing.recommendedAgent));
            console.log(chalk.dim(`  Confidence: ${(routing.confidence * 100).toFixed(1)}%`));
          }
        }

        return;
      } catch (error) {
        if (options.json) {
          printJson({ success: false, error: error instanceof Error ? error.message : 'unknown' });
        }
        return;
      }
    });

  // -------------------------------------------------------------------------
  // post-task: Record task outcome for learning (called by PostToolUse hook)
  // -------------------------------------------------------------------------
  hooks
    .command('post-task')
    .description('Record task outcome for pattern learning')
    .option('--task-id <id>', 'Task identifier')
    .option('--success <bool>', 'Whether task succeeded', 'true')
    .option('--agent <name>', 'Agent that executed the task')
    .option('--duration <ms>', 'Task duration in milliseconds')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const success = options.success === 'true' || options.success === true;

        // Initialize hooks system and record learning outcome
        // BUG FIX: Must call getHooksSystem() FIRST to initialize, not check state.initialized
        let patternsLearned = 0;
        let dreamResult: { triggered: boolean; reason?: string; insightsGenerated?: number } = { triggered: false };

        try {
          // Initialize system (creates ReasoningBank and HookRegistry)
          const { hookRegistry, reasoningBank } = await getHooksSystem();

          // Emit learning event for task completion
          const results = await hookRegistry.emit(QE_HOOK_EVENTS.QEAgentCompletion, {
            taskId: options.taskId,
            success,
            agent: options.agent,
            duration: options.duration ? parseInt(options.duration, 10) : undefined,
            timestamp: Date.now(),
          });
          patternsLearned = results.reduce((sum, r) => sum + (r.patternsLearned || 0), 0);

          // Record as learning experience for every post-task invocation
          if (options.taskId) {
            const agent = options.agent || 'unknown';
            await reasoningBank.recordOutcome({
              patternId: `task:${agent}:${options.taskId}`,
              success,
              metrics: {
                executionTimeMs: options.duration ? parseInt(options.duration, 10) : 0,
              },
              feedback: `Agent: ${agent}, Task: ${options.taskId}`,
            });
          }

          // Record experience for dream scheduler and check if dream should trigger
          const projectRoot = findProjectRoot();
          const dataDir = path.join(projectRoot, '.agentic-qe');
          const memoryBackend = await createHybridBackendWithTimeout(dataDir);
          const expCount = await incrementDreamExperience(memoryBackend);

          // Check if dream cycle should be triggered
          // Always check — time-based triggers need every invocation, and the
          // check itself is lightweight (just reads state + compares timestamps)
          dreamResult = await checkAndTriggerDream(memoryBackend);
        } catch (initError) {
          // Log but don't fail - learning is best-effort
          console.error(chalk.dim(`[hooks] Learning init: ${initError instanceof Error ? initError.message : 'unknown'}`));
        }

        if (options.json) {
          printJson({
            success: true,
            taskId: options.taskId,
            taskSuccess: success,
            patternsLearned,
            dreamTriggered: dreamResult.triggered,
            dreamReason: dreamResult.reason,
            dreamInsights: dreamResult.insightsGenerated,
          });
        } else {
          printSuccess(`Task completed: ${options.taskId || 'unknown'}`);
          console.log(chalk.dim(`  Success: ${success}`));
          if (patternsLearned > 0) {
            console.log(chalk.green(`  Patterns learned: ${patternsLearned}`));
          }
          if (dreamResult.triggered) {
            console.log(chalk.blue(`  🌙 Dream cycle triggered (${dreamResult.reason}): ${dreamResult.insightsGenerated} insights`));
          }
        }

        return;
      } catch (error) {
        if (options.json) {
          printJson({ success: false, error: error instanceof Error ? error.message : 'unknown' });
        }
        return;
      }
    });
}
