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
import { findProjectRoot, getUnifiedMemory } from '../../../kernel/unified-memory.js';
import {
  applyHookBusyTimeout,
  getHooksSystem,
  createHybridBackendWithTimeout,
  incrementDreamExperience,
  printJson,
  printError,
  printGuidance,
  readStdinJsonEvent,
} from './hooks-shared.js';

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
          applyHookBusyTimeout(db);
          const outcomeId = `route-${Date.now()}-${randomUUID().slice(0, 8)}`;
          // Split-write semantics: quality_score means "outcome quality after
          // task ran" (6-dim formula), NOT routing confidence. Routing-
          // confidence stays in decision_json. We write a sentinel
          // (success=0, quality_score=-1) so post-task UPDATE fills the actual
          // quality. lowConfidence is surfaced via decision_json + the error
          // column so it's visible in queries that don't parse JSON.
          const lowConfidence = routing.confidence < 0.5;
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
              lowConfidence,
            }),
            routing.recommendedAgent,
            1,    // followed_recommendation = true
            0,    // success = 0 (sentinel — post-task UPDATEs)
            -1,   // quality_score = -1 sentinel
            0,    // duration not yet tracked
            lowConfidence ? 'low-confidence' : null,
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

  // -------------------------------------------------------------------------
  // post-route: Close routing_outcomes sentinel from Stop hook (#451)
  //
  // The `route` hook fires on UserPromptSubmit and writes a sentinel row with
  // quality_score=-1. That sentinel is only closed by post-task's
  // updateRoutingOutcomeQuality, which fires on PostToolUse ^(Task|Agent)$ —
  // so in any direct-work session (Bash/Edit/Read without spawning sub-agents)
  // route sentinels accumulate forever and Stream D never converges.
  //
  // This subcommand is wired into the Stop hook (one invocation per turn) and
  // closes the most-recent route sentinel 1:1. Discriminator
  // `task_json NOT LIKE '%"taskId"%'` isolates route sentinels from the
  // pre-task sentinels that carry taskId in their task_json.
  // -------------------------------------------------------------------------
  hooks
    .command('post-route')
    .description('Close the most-recent route sentinel from a Stop hook (#451)')
    .option('--success <bool>', 'Whether the turn completed successfully', 'true')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const success = options.success === 'true' || options.success === true;
        // 6-dim outcome quality, durationTier defaulted to favorable (1.0):
        //   qualityScore = 0.25*success + 0.325 + 0.10*durationTier
        // Stop hook doesn't measure turn duration, so we pick the most
        // favorable bucket — same shape as the post-task formula but with the
        // duration term collapsed to a constant.
        const qualityScore = 0.325 + (success ? 0.25 : 0) + 0.10;

        const um = getUnifiedMemory();
        if (!um.isInitialized()) {
          await um.initialize();
        }
        const db = um.getDatabase();
        applyHookBusyTimeout(db);

        const result = db.prepare(`
          UPDATE routing_outcomes
          SET success = ?, quality_score = ?, duration_ms = 0, error = NULL
          WHERE id = (
            SELECT id FROM routing_outcomes
            WHERE quality_score = -1
              AND task_json NOT LIKE '%"taskId"%'
            ORDER BY created_at DESC
            LIMIT 1
          )
        `).run(success ? 1 : 0, qualityScore);

        if (options.json) {
          printJson({
            success: true,
            resolved: result.changes > 0,
            qualityScore,
            turnSuccess: success,
          });
        }
        return;
      } catch (error) {
        // Best-effort: Stop hooks must never crash the host. Swallow + log.
        if (options.json) {
          printJson({
            success: false,
            error: error instanceof Error ? error.message : 'unknown',
          });
        } else {
          console.error(chalk.dim(`[hooks] post-route: ${error instanceof Error ? error.message : 'unknown'}`));
        }
        return;
      }
    });
}
