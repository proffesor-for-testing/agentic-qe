/**
 * Agentic QE v3 - Routing Hooks (route)
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Handles task routing to optimal QE agent.
 */

import { randomUUID } from 'crypto';
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import type { QERoutingRequest } from '../../../learning/qe-reasoning-bank.js';
import type { QEDomain } from '../../../learning/qe-patterns.js';
import { findProjectRoot } from '../../../kernel/unified-memory.js';
import {
  getHooksSystem,
  createHybridBackendWithTimeout,
  incrementDreamExperience,
  printJson,
  printError,
  printGuidance,
} from './hooks-shared.js';

/**
 * Register route subcommand on the hooks command.
 */
export function registerRoutingHooks(hooks: Command): void {
  // -------------------------------------------------------------------------
  // route: Route task to optimal agent
  // -------------------------------------------------------------------------
  hooks
    .command('route')
    .description('Route a task to the optimal QE agent')
    .requiredOption('-t, --task <description>', 'Task description')
    .option('-d, --domain <domain>', 'Target QE domain hint')
    .option('-c, --capabilities <caps...>', 'Required capabilities')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const { reasoningBank } = await getHooksSystem();

        const request: QERoutingRequest = {
          task: options.task,
          domain: options.domain as QEDomain,
          capabilities: options.capabilities,
        };

        const result = await reasoningBank.routeTask(request);

        if (!result.success) {
          throw new Error(result.error.message);
        }

        const routing = result.value;

        if (options.json) {
          printJson({
            recommendedAgent: routing.recommendedAgent,
            confidence: routing.confidence,
            alternatives: routing.alternatives,
            domains: routing.domains,
            patternCount: routing.patterns.length,
            guidance: routing.guidance,
            reasoning: routing.reasoning,
          });
        } else {
          console.log(chalk.bold('\n🎯 Task Routing Result'));
          console.log(chalk.dim(`  Task: "${options.task}"`));

          console.log(chalk.bold('\n👤 Recommended Agent:'), chalk.cyan(routing.recommendedAgent));
          console.log(chalk.dim(`  Confidence: ${(routing.confidence * 100).toFixed(1)}%`));

          if (routing.alternatives.length > 0) {
            console.log(chalk.bold('\n🔄 Alternatives:'));
            routing.alternatives.forEach((alt) => {
              console.log(
                chalk.dim(`  - ${alt.agent}: ${(alt.score * 100).toFixed(1)}%`)
              );
            });
          }

          console.log(chalk.bold('\n📂 Detected Domains:'), routing.domains.join(', '));

          console.log(chalk.bold('\n💡 Guidance:'));
          printGuidance(routing.guidance);

          console.log(chalk.bold('\n📖 Reasoning:'), chalk.dim(routing.reasoning));
        }

        // Persist routing decision for learning
        try {
          const { getUnifiedMemory } = await import('../../../kernel/unified-memory.js');
          const um = getUnifiedMemory();
          if (!um.isInitialized()) {
            await um.initialize();
          }
          const db = um.getDatabase();
          const outcomeId = `route-${Date.now()}-${randomUUID().slice(0, 8)}`;
          db.prepare(`
            INSERT OR REPLACE INTO routing_outcomes (
              id, task_json, decision_json, used_agent,
              followed_recommendation, success, quality_score,
              duration_ms, error
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            outcomeId,
            JSON.stringify({ description: options.task, domain: options.domain }),
            JSON.stringify({
              recommended: routing.recommendedAgent,
              confidence: routing.confidence,
              alternatives: routing.alternatives,
            }),
            routing.recommendedAgent,
            1, // followed_recommendation = true (recommendation stage)
            1, // success = true (routing itself succeeded)
            routing.confidence,
            0, // duration not tracked at routing stage
            null
          );

          // Increment dream experience counter
          const projectRoot = findProjectRoot();
          const dataDir = path.join(projectRoot, '.agentic-qe');
          const memoryBackend = await createHybridBackendWithTimeout(dataDir);
          await incrementDreamExperience(memoryBackend);
        } catch (persistError) {
          // Best-effort — don't fail the hook
          console.error(chalk.dim(`[hooks] route persist: ${persistError instanceof Error ? persistError.message : 'unknown'}`));
        }

        return;
      } catch (error) {
        printError(`route failed: ${error instanceof Error ? error.message : 'unknown'}`);
        throw error;
      }
    });
}
