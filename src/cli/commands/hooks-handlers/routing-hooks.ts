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
 * Read piped stdin with a short timeout. Claude Code delivers
 * UserPromptSubmit / PostToolUse / etc. events as JSON on stdin —
 * `$PROMPT` is NOT exposed as an env var, so reading stdin is the
 * only reliable way to recover the prompt body for routing.
 *
 * Returns '' when stdin is a TTY (interactive run) or no data arrives
 * before the timeout. Never throws — a hook must never crash the host.
 */
async function readStdinJsonEvent(timeoutMs = 500): Promise<string> {
  if (process.stdin.isTTY) return '';
  return new Promise<string>((resolve) => {
    let data = '';
    const timer = setTimeout(() => {
      process.stdin.removeAllListeners();
      process.stdin.pause();
      resolve(data);
    }, timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(data);
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      resolve(data);
    });
    process.stdin.resume();
  });
}

/**
 * Extract a routable task description from a Claude Code hook event JSON
 * payload. Different hook surfaces use different field names — try the
 * documented ones in priority order. Exported for unit testing.
 */
export function extractPromptFromEvent(raw: string): string {
  if (!raw.trim()) return '';
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw);
  } catch {
    // Not JSON — treat the whole stdin as the prompt body
    return raw.trim();
  }
  const candidates = [
    event.prompt,
    event.user_prompt,
    event.command,
    (event.tool_input as Record<string, unknown> | undefined)?.prompt,
    (event.tool_input as Record<string, unknown> | undefined)?.description,
    (event.toolInput as Record<string, unknown> | undefined)?.prompt,
    (event.toolInput as Record<string, unknown> | undefined)?.description,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  return '';
}

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
    .option('-t, --task <description>', 'Task description (falls back to stdin event JSON)')
    .option('-d, --domain <domain>', 'Target QE domain hint')
    .option('-c, --capabilities <caps...>', 'Required capabilities')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        // Resolve task: explicit --task wins, otherwise read the Claude Code
        // hook event from stdin (UserPromptSubmit ships {prompt: "..."} on stdin
        // and exposes nothing useful in env vars).
        let task = (options.task as string | undefined) ?? '';
        if (!task.trim()) {
          const stdin = await readStdinJsonEvent();
          task = extractPromptFromEvent(stdin);
        }
        if (!task.trim()) {
          throw new Error(
            'No task provided. Pass --task <description> or pipe a Claude Code hook event JSON to stdin.'
          );
        }

        const { reasoningBank } = await getHooksSystem();

        const request: QERoutingRequest = {
          task,
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
          console.log(chalk.dim(`  Task: "${task}"`));

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
            JSON.stringify({ description: task, domain: options.domain }),
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
