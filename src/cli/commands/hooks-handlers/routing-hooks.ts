/**
 * Agentic QE v3 - Routing Hooks (route)
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Handles task routing to optimal QE agent.
 */

import { randomUUID } from 'crypto';
import { ensureRoutingOutcomesAdr095Columns } from '../../../routing/routing-outcomes-migration.js';
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
  updateHookRouterQValue,
} from './hooks-shared.js';
import { deriveTaskType, deriveComplexityBucket } from '../../../learning/agent-routing.js';
import { detectQEDomains } from '../../../learning/qe-patterns.js';

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
            // ADR-095 telemetry passed through to operators / scripts
            exploration: (routing as { exploration?: boolean }).exploration ?? false,
            criticality: (routing as { criticality?: number }).criticality ?? null,
            qWeight: (routing as { qWeight?: number }).qWeight ?? null,
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
          // ADR-095: ensure new columns exist before INSERTing them. Idempotent.
          ensureRoutingOutcomesAdr095Columns(db);

          const outcomeId = `route-${Date.now()}-${randomUUID().slice(0, 8)}`;
          // Split-write semantics: quality_score means "outcome quality after
          // task ran" (6-dim formula), NOT routing confidence. Routing-
          // confidence stays in decision_json. We write a sentinel
          // (success=0, quality_score=-1) so post-task UPDATE fills the actual
          // quality. lowConfidence is surfaced via decision_json + the error
          // column so it's visible in queries that don't parse JSON.
          const lowConfidence = routing.confidence < 0.5;
          const routingTelemetry = routing as typeof routing & {
            exploration?: boolean;
            criticality?: number;
            qWeight?: number;
          };
          db.prepare(`
            INSERT OR REPLACE INTO routing_outcomes (
              id, task_json, decision_json, used_agent,
              followed_recommendation, success, quality_score,
              duration_ms, error,
              exploration, criticality, q_weight
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            outcomeId,
            JSON.stringify({ description: task, domain: options.domain }),
            JSON.stringify({
              recommended: routing.recommendedAgent,
              confidence: routing.confidence,
              alternatives: routing.alternatives,
              lowConfidence,
              exploration: routingTelemetry.exploration ?? false,
              criticality: routingTelemetry.criticality ?? null,
              qWeight: routingTelemetry.qWeight ?? null,
            }),
            routing.recommendedAgent,
            1,    // followed_recommendation = true
            0,    // success = 0 (sentinel — post-task UPDATEs)
            -1,   // quality_score = -1 sentinel
            0,    // duration not yet tracked
            lowConfidence ? 'low-confidence' : null,
            routingTelemetry.exploration ? 1 : 0,
            routingTelemetry.criticality ?? null,
            routingTelemetry.qWeight ?? null,
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

        // Issue #499: we need the sentinel's task_json + used_agent to train
        // rl_q_values from this resolved outcome. SELECT first, then UPDATE
        // by id — so the row we close is the same row we read for state-key
        // derivation, even if a concurrent insert happens between statements.
        const sentinel = db.prepare(`
          SELECT id, task_json, used_agent FROM routing_outcomes
          WHERE quality_score = -1
            AND task_json NOT LIKE '%"taskId"%'
          ORDER BY created_at DESC
          LIMIT 1
        `).get() as { id: string; task_json: string; used_agent: string } | undefined;

        const result = sentinel
          ? db.prepare(`
              UPDATE routing_outcomes
              SET success = ?, quality_score = ?, duration_ms = 0, error = NULL
              WHERE id = ?
            `).run(success ? 1 : 0, qualityScore, sentinel.id)
          : { changes: 0 };

        // Issue #499 fix #1: train rl_q_values from the resolved route
        // sentinel. The route hook computed a state_key for this same task
        // (qe-reasoning-bank.ts:530-535) and never wrote it anywhere, so we
        // re-derive from task_json.description using the same exported
        // helpers. Writer and reader use identical state_key construction,
        // so the row this trains is the row the next `route` hook reads.
        // Best-effort: Stop hooks must never crash the host on a learning
        // failure.
        if (sentinel) {
          try {
            const tj = JSON.parse(sentinel.task_json) as { description?: string };
            const description = String(tj.description ?? '');
            if (description) {
              await updateHookRouterQValue({
                taskType: deriveTaskType(description),
                priority: 'normal',
                domain: detectQEDomains(description)[0] ?? 'any',
                complexityBucket: deriveComplexityBucket(description),
                agent: sentinel.used_agent,
                success,
              });
            }
          } catch {
            /* swallow — Stop-hook must not crash the host on learning errors */
          }
        }

        // Issue #465: orphan-sentinel sweep. Sessions that terminate without
        // firing Stop (context compact, process kill, IDE crash) leave their
        // sentinels at quality_score=-1 forever — every subsequent post-route
        // call only closes the most-recent one (LIMIT 1) and newer rows keep
        // pre-empting old ones in the ORDER BY DESC. Reporter saw 122/149
        // rows stuck at -1, inverting AVG(quality_score) to -0.717.
        //
        // We use the conservative base score (0.325 = no success/duration
        // bonus) rather than the current turn's qualityScore: those orphans
        // belong to UNKNOWN historical turns and shouldn't inherit the
        // current turn's outcome. Tag with error='stale-sentinel' so
        // precision-sensitive queries can filter them out.
        // Discriminator mirrors the LIMIT-1 close above and #451's symmetric
        // design: route sentinels are owned by post-route, pre-task sentinels
        // (task_json carries "taskId") are owned by post-task. Sweeping a
        // pre-task sentinel here would race with updateRoutingOutcomeQuality
        // and break the ownership split. If pre-task sentinels orphan, that
        // belongs in a separate fix.
        const staleResult = db.prepare(`
          UPDATE routing_outcomes
          SET success = 0,
              quality_score = 0.325,
              duration_ms = 0,
              error = 'stale-sentinel'
          WHERE quality_score = -1
            AND task_json NOT LIKE '%"taskId"%'
            AND created_at < datetime('now', '-300 seconds')
        `).run();

        if (options.json) {
          printJson({
            success: true,
            resolved: result.changes > 0,
            staleSwept: staleResult.changes,
            qualityScore,
            turnSuccess: success,
          });
        } else if (staleResult.changes > 0) {
          console.log(
            chalk.dim(`[hooks] post-route: swept ${staleResult.changes} stale sentinel(s)`),
          );
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
