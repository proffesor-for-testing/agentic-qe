/**
 * Agentic QE v3 - Task Hooks (pre-task, post-task)
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Handles task lifecycle hooks for pattern learning.
 */

import { Command } from 'commander';
import { createHash, randomUUID } from 'node:crypto';
import chalk from 'chalk';
import path from 'node:path';
import { QE_HOOK_EVENTS } from '../../../learning/qe-hooks.js';
import { findProjectRoot, getUnifiedMemory } from '../../../kernel/unified-memory.js';
import {
  applyHookBusyTimeout,
  getHooksSystem,
  createHybridBackendWithTimeout,
  incrementDreamExperience,
  checkAndTriggerDream,
  persistTaskOutcome,
  updateHookRouterQValue,
  updateRoutingOutcomeQuality,
  printJson,
  printSuccess,
} from './hooks-shared.js';

// ============================================================================
// Constants — task-bridge / routing-quality / q-learning
// ============================================================================

/** kv_store namespace key for cross-subprocess pre-task → post-task bridge */
const TASK_BRIDGE_NAMESPACE = 'task-bridge';
/** Bridge TTL: a Task() invocation rarely exceeds this — older entries are stale */
const TASK_BRIDGE_TTL_MS = 600_000; // 10 minutes
/** Confidence floor below which we flag the route as low-confidence (patch 320) */
const LOW_CONFIDENCE_THRESHOLD = 0.5;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Derive a structural taskType from a free-form task description.
 * Mirrors the categories the q-learning router cares about (ADR-061/087).
 */
function deriveTaskType(description: string): string {
  const d = description.toLowerCase();
  if (/\bgenerate[- ]?test|\btest[- ]?gen|\bgenerate.+spec/.test(d)) return 'test-generation';
  if (/\bcoverage|\banalyze.+cover/.test(d)) return 'coverage-analysis';
  if (/\bquality|\bassess|\baudit/.test(d)) return 'quality-assessment';
  if (/\bsecurity|\bvulnerab|\bcompliance/.test(d)) return 'security-compliance';
  if (/\bdefect|\bbug|\bdiagnos/.test(d)) return 'defect-intelligence';
  if (/\brequirement|\bspec\b/.test(d)) return 'requirements-validation';
  if (/\brefactor|\brewrite|\boptim/.test(d)) return 'refactoring';
  if (/\btest|\brun.+test/.test(d)) return 'test-execution';
  return 'unknown';
}

/** Hash a description to a stable short bridge key. */
function hashDescription(description: string): string {
  return createHash('sha256').update(description).digest('hex').slice(0, 16);
}

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

        // Patch 050: top-5 selectedPatternIds for downstream per-pattern feedback
        const selectedPatternIds = (routing?.patterns ?? [])
          .slice(0, 5)
          .map((p) => p?.id)
          .filter((id): id is string => typeof id === 'string');

        // Patches 090/100/160/300/320: signals derived from memory.db.
        // All best-effort: failures fall through to empty/default values.
        let historicalBest: { agent: string; avgQuality: number; n: number } | null = null;
        let priorVerdicts: Array<{ key: string; summary: string }> = [];
        let estimatedTokenSavings = 0;
        let bridgeKey: string | null = null;

        try {
          const um = getUnifiedMemory();
          if (!um.isInitialized()) {
            await um.initialize();
          }
          const db = um.getDatabase();
          applyHookBusyTimeout(db);

          // Patch 090: best-historical-agent across past successful routes
          try {
            const row = db.prepare(`
              SELECT used_agent AS agent,
                     ROUND(AVG(quality_score), 3) AS avgQuality,
                     COUNT(*) AS n
              FROM routing_outcomes
              WHERE success = 1 AND quality_score >= 0
              GROUP BY used_agent
              ORDER BY avgQuality DESC, n DESC
              LIMIT 1
            `).get() as { agent: string; avgQuality: number; n: number } | undefined;
            if (row) historicalBest = row;
          } catch { /* table may be empty */ }

          // Patch 100: surface recent verdicts namespace for context reuse
          try {
            const rows = db.prepare(`
              SELECT key, value
              FROM kv_store
              WHERE namespace = 'verdicts'
                AND created_at > datetime('now', '-7 days')
              ORDER BY created_at DESC
              LIMIT 3
            `).all() as Array<{ key: string; value: string }>;
            priorVerdicts = rows.map((r) => ({
              key: r.key,
              summary: String(r.value).slice(0, 200),
            }));
          } catch { /* table may be empty */ }

          // Patch 300: bootstrap estimatedTokenSavings from selected patterns
          if (selectedPatternIds.length > 0) {
            try {
              const placeholders = selectedPatternIds.map(() => '?').join(',');
              const tokRow = db.prepare(`
                SELECT COALESCE(SUM(average_token_savings), 0) AS sum
                FROM qe_patterns
                WHERE id IN (${placeholders})
              `).get(...selectedPatternIds) as { sum: number } | undefined;
              estimatedTokenSavings = Math.max(0, Math.round(tokRow?.sum ?? 0));
            } catch { /* column may not exist on older schemas */ }
          }

          // Patch 160 + 280-bridge: write the task-bridge entry that post-task
          // will consume to fan out experience_applications per pattern_id and
          // derive a structural q-learning state_key.
          //
          // The bridge MUST write even when selectedPatternIds is empty: the
          // Q-learning Bellman update at task-hooks.ts post-task site uses a
          // state_key derived from (taskType|priority|domain|complexityBucket)
          // and an action_key from routing.recommendedAgent — neither requires
          // non-empty patterns. Gating on patterns starves rl_q_values for
          // low-confidence prompts. (#487)
          if (options.description) {
            try {
              const description = String(options.description);
              const taskType = deriveTaskType(description);
              const priority = 'normal';
              const domain = routing?.domains?.[0] ?? 'any';
              const complexityBucket = Math.max(
                0,
                Math.min(10, Math.round(Math.min(description.length / 200, 1) * 10)),
              );
              bridgeKey = `task:${hashDescription(description)}`;
              const payload = JSON.stringify({
                selectedPatternIds,
                agent: routing?.recommendedAgent ?? null,
                description: description.slice(0, 200),
                taskType,
                priority,
                domain,
                complexityBucket,
                estimatedTokenSavings,
                ts: Date.now(),
              });
              const expiresAt = Date.now() + TASK_BRIDGE_TTL_MS;
              db.prepare(`
                INSERT OR REPLACE INTO kv_store (key, namespace, value, expires_at, created_at)
                VALUES (?, ?, ?, ?, strftime('%s','now')*1000)
              `).run(bridgeKey, TASK_BRIDGE_NAMESPACE, payload, expiresAt);
            } catch (bridgeErr) {
              console.error(chalk.dim(`[hooks] pre-task bridge: ${bridgeErr instanceof Error ? bridgeErr.message : 'unknown'}`));
            }
          }

          // Patch 150: write a routing_outcomes sentinel that post-task UPDATEs
          // with the 6-dim outcome quality. Pre-task cannot know quality yet.
          // success=0/quality=-1 sentinel pair makes the row easy to find later.
          //
          // Issue #449: PreToolUse hook command sends --description but no
          // --task-id, so the original `&& options.taskId` clause prevented
          // the sentinel from ever being written. Without the sentinel the
          // post-task UPDATE has no row to fill, breaking Stream D. Use the
          // same `hook-${ts}` fallback as post-task.
          if (routing?.recommendedAgent) {
            try {
              const effectivePreTaskId = (options.taskId as string | undefined) || `hook-${Date.now()}`;
              const outcomeId = `route-${Date.now()}-${randomUUID().slice(0, 8)}`;
              const lowConfidence = routing.confidence < LOW_CONFIDENCE_THRESHOLD;
              db.prepare(`
                INSERT INTO routing_outcomes (
                  id, task_json, decision_json, used_agent,
                  followed_recommendation, success, quality_score,
                  duration_ms, error
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                outcomeId,
                JSON.stringify({ description: options.description, taskId: effectivePreTaskId }),
                JSON.stringify({
                  recommended: routing.recommendedAgent,
                  confidence: routing.confidence,
                  alternatives: routing.alternatives,
                  lowConfidence,
                }),
                routing.recommendedAgent,
                1,
                0,    // success = 0 (sentinel — post-task UPDATEs to actual)
                -1,   // quality_score = -1 sentinel
                0,
                lowConfidence ? 'low-confidence' : null,
              );
            } catch (sentinelErr) {
              console.error(chalk.dim(`[hooks] pre-task sentinel: ${sentinelErr instanceof Error ? sentinelErr.message : 'unknown'}`));
            }
          }
        } catch (memErr) {
          console.error(chalk.dim(`[hooks] pre-task memory: ${memErr instanceof Error ? memErr.message : 'unknown'}`));
        }

        const lowConfidence = routing ? routing.confidence < LOW_CONFIDENCE_THRESHOLD : false;

        if (options.json) {
          printJson({
            success: true,
            taskId: options.taskId,
            description: options.description,
            recommendedAgent: routing?.recommendedAgent,
            confidence: routing?.confidence,
            guidance: routing?.guidance || [],
            // Patch 050
            selectedPatternIds,
            // Patch 090
            historicalBest,
            // Patch 100
            priorVerdicts,
            // Patch 300
            estimatedTokenSavings,
            // Patch 320
            lowConfidence,
            // Bridge identifier so post-task can correlate (debug aid)
            bridgeKey,
          });
        } else {
          console.log(chalk.bold('\n🚀 Pre-Task Analysis'));
          console.log(chalk.dim(`  Task ID: ${options.taskId || 'N/A'}`));
          if (routing) {
            console.log(chalk.bold('\n🎯 Recommended:'), chalk.cyan(routing.recommendedAgent));
            console.log(chalk.dim(`  Confidence: ${(routing.confidence * 100).toFixed(1)}%`));
            if (lowConfidence) {
              console.log(chalk.yellow('  ⚠  Low confidence — consider providing more context'));
            }
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
        let dreamResult: {
          triggered: boolean;
          reason?: string;
          insightsGenerated?: number;
          insightsApplied?: number;
        } = { triggered: false };

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

          // Record as learning experience for every post-task invocation.
          //
          // Issue #449 / patch 030 (reintroduced in v3.9.23): the PostToolUse
          // hook context for Task/Agent does NOT populate $TOOL_RESULT_agent_id,
          // so the shipped `--task-id "$TOOL_RESULT_agent_id"` arrives empty
          // and `options.taskId` is falsy. The original `if (options.taskId)`
          // gate therefore killed the entire Stream B/D/F learning chain on
          // every real hook invocation (rl_q_values stayed empty forever).
          // Use a synthetic `hook-${ts}` fallback so the pipeline always runs.
          // DO NOT REINTRODUCE the if(options.taskId) gate — see #449.
          {
            const effectiveTaskId = (options.taskId as string | undefined) || `hook-${Date.now()}`;
            const agent = options.agent || 'unknown';
            const durationMs = options.duration ? parseInt(options.duration, 10) : 0;

            await reasoningBank.recordOutcome({
              patternId: `task:${agent}:${effectiveTaskId}`,
              success,
              metrics: { executionTimeMs: durationMs },
              feedback: `Agent: ${agent}, Task: ${effectiveTaskId}`,
            });

            // Stream B: full experience pipeline (captured_experiences,
            // experience_applications + per-pattern fan-out, qe_trajectories
            // single-step + multi-step stitch, dream_insights.applied bump).
            // Patches 060/110/120/160/180/300.
            const outcome = await persistTaskOutcome({
              taskId: effectiveTaskId,
              agent,
              durationMs,
              success,
            });

            // Issue #460: when --agent arrives empty (Claude Code does not
            // expose $TOOL_RESULT_agent_id in PostToolUse context), `agent`
            // resolves to 'unknown' and every Q-value lands in the same
            // bucket — the router can never learn per-agent differentiation.
            // The pre-task bridge already carries `agent: routing.recommendedAgent`
            // which is the correct action key, so prefer that over 'unknown'.
            const effectiveAgent =
              agent === 'unknown' && outcome.bridge?.agent
                ? outcome.bridge.agent
                : agent;

            // Stream D (patch 150): apply 6-dim outcome quality to the
            // routing_outcomes sentinel that pre-task wrote with quality=-1.
            await updateRoutingOutcomeQuality({
              agent: effectiveAgent,
              success,
              durationMs,
              qualityScore: outcome.qualityScore,
            });

            // Stream F (patch 280): Bellman Q-update for the hook-router state.
            // Bridge payload carries the structural state derivation.
            if (outcome.bridge) {
              await updateHookRouterQValue({
                taskType: outcome.bridge.taskType,
                priority: outcome.bridge.priority,
                domain: outcome.bridge.domain,
                complexityBucket: outcome.bridge.complexityBucket,
                agent: effectiveAgent,
                success,
              });
            }
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
            dreamInsightsApplied: dreamResult.insightsApplied,
          });
        } else {
          printSuccess(`Task completed: ${options.taskId || 'unknown'}`);
          console.log(chalk.dim(`  Success: ${success}`));
          if (patternsLearned > 0) {
            console.log(chalk.green(`  Patterns learned: ${patternsLearned}`));
          }
          if (dreamResult.triggered) {
            const appliedSuffix =
              typeof dreamResult.insightsApplied === 'number'
                ? `, ${dreamResult.insightsApplied} applied`
                : '';
            console.log(chalk.blue(`  🌙 Dream cycle triggered (${dreamResult.reason}): ${dreamResult.insightsGenerated} insights${appliedSuffix}`));
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
