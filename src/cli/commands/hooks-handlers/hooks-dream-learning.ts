/**
 * Agentic QE v3 - Hooks Dream Scheduler & Learning Persistence
 *
 * Dream cycle scheduling, experience recording, and experience-to-pattern
 * consolidation. Extracted from hooks-shared.ts to keep files under 500 lines.
 */

import { randomUUID } from 'crypto';
import chalk from 'chalk';
import type { MemoryBackend } from '../../../kernel/interfaces.js';

// ============================================================================
// Dream Scheduler State (persisted in kv_store between hook invocations)
// ============================================================================

export const DREAM_STATE_KEY = 'dream-scheduler:hook-state';
export const DREAM_INTERVAL_MS = 3600000; // 1 hour between auto-dreams
export const DREAM_EXPERIENCE_THRESHOLD = 20; // experiences before triggering
export const DREAM_MIN_GAP_MS = 300000; // 5 minutes minimum between dreams

export interface DreamHookState {
  lastDreamTime: string | null;
  experienceCount: number;
  sessionStartTime: string;
  totalDreamsThisSession: number;
}

/**
 * Check if a dream cycle should be triggered and run it if so.
 * Called from post-task hook after recording each experience.
 *
 * Trigger conditions (any of):
 * 1. Time-based: >1hr since last dream
 * 2. Experience-based: >20 experiences since last dream
 *
 * Guard: minimum 5 minutes between dreams
 */
export async function checkAndTriggerDream(memoryBackend: MemoryBackend): Promise<{
  triggered: boolean;
  reason?: string;
  insightsGenerated?: number;
}> {
  try {
    // Load persisted dream state
    const dreamState = await memoryBackend.get<DreamHookState>(DREAM_STATE_KEY);
    if (!dreamState) {
      return { triggered: false, reason: 'no-state' };
    }

    const now = Date.now();
    const lastDreamTime = dreamState.lastDreamTime ? new Date(dreamState.lastDreamTime).getTime() : 0;
    const timeSinceLastDream = now - lastDreamTime;

    // Guard: minimum gap
    if (timeSinceLastDream < DREAM_MIN_GAP_MS) {
      return { triggered: false, reason: 'too-soon' };
    }

    // Check triggers
    const timeTriggered = timeSinceLastDream >= DREAM_INTERVAL_MS;
    const experienceTriggered = dreamState.experienceCount >= DREAM_EXPERIENCE_THRESHOLD;

    if (!timeTriggered && !experienceTriggered) {
      return { triggered: false, reason: 'conditions-not-met' };
    }

    const reason = timeTriggered ? 'time-interval' : 'experience-threshold';
    console.log(chalk.dim(`[hooks] Dream trigger: ${reason} (${dreamState.experienceCount} experiences, ${Math.round(timeSinceLastDream / 60000)}min since last dream)`));

    // Run a quick dream cycle
    const { createDreamEngine } = await import('../../../learning/dream/index.js');
    const { createQEReasoningBank: createRB } = await import('../../../learning/qe-reasoning-bank.js');

    const engine = createDreamEngine({
      maxDurationMs: 10000, // 10s for hook-triggered dreams
      minConceptsRequired: 3,
    });
    await engine.initialize();

    // Load patterns from ReasoningBank
    const rb = createRB(memoryBackend, undefined, {
      enableLearning: true,
      enableGuidance: false,
      enableRouting: false,
      embeddingDimension: 384,
      useONNXEmbeddings: true,
    });
    await rb.initialize();

    const patternsResult = await rb.searchPatterns('', { limit: 100, minConfidence: 0.3 });
    if (patternsResult.success && patternsResult.value.length > 0) {
      const importPatterns = patternsResult.value.map(r => ({
        id: r.pattern.id,
        name: r.pattern.name,
        description: r.pattern.description || `${r.pattern.patternType} pattern`,
        domain: r.pattern.qeDomain || 'learning-optimization',
        patternType: r.pattern.patternType,
        confidence: r.pattern.confidence,
        successRate: r.pattern.successRate || 0.5,
      }));
      await engine.loadPatternsAsConcepts(importPatterns);
    }

    const result = await engine.dream(10000);

    // Update state
    dreamState.lastDreamTime = new Date().toISOString();
    dreamState.experienceCount = 0;
    dreamState.totalDreamsThisSession++;
    await memoryBackend.set(DREAM_STATE_KEY, dreamState);

    await engine.close();

    return {
      triggered: true,
      reason,
      insightsGenerated: result.insights.length,
    };
  } catch (error) {
    console.error(chalk.dim(`[hooks] Dream trigger failed: ${error instanceof Error ? error.message : 'unknown'}`));
    return { triggered: false, reason: 'error' };
  }
}

/**
 * Increment the experience counter in dream state.
 * Called from post-task hook.
 */
export async function incrementDreamExperience(memoryBackend: MemoryBackend): Promise<number> {
  try {
    let dreamState = await memoryBackend.get<DreamHookState>(DREAM_STATE_KEY);
    if (!dreamState) {
      dreamState = {
        lastDreamTime: null,
        experienceCount: 0,
        sessionStartTime: new Date().toISOString(),
        totalDreamsThisSession: 0,
      };
    }
    dreamState.experienceCount++;
    await memoryBackend.set(DREAM_STATE_KEY, dreamState);
    return dreamState.experienceCount;
  } catch {
    return 0;
  }
}

/**
 * Persist a command/edit experience directly to the captured_experiences table.
 * CLI hooks cannot use the MCP middleware wrapper, so they write directly.
 */
export async function persistCommandExperience(opts: {
  task: string;
  agent: string;
  domain: string;
  success: boolean;
  durationMs?: number;
  source: string;
}): Promise<void> {
  try {
    const { getUnifiedMemory } = await import('../../../kernel/unified-memory.js');
    const um = getUnifiedMemory();
    if (!um.isInitialized()) {
      await um.initialize();
    }
    // Ensure captured_experiences and consolidation columns exist. Without
    // this, CLI-only projects (`aqe init` with no MCP server ever started)
    // silently lose every hook-fired experience because the table is only
    // created during MCP startup. Idempotent — guarded by an internal lock.
    const { initializeExperienceCapture } = await import('../../../learning/experience-capture-middleware.js');
    await initializeExperienceCapture();
    const db = um.getDatabase();
    try { db.pragma('busy_timeout = 60000'); } catch { /* hook-side patient timeout (ADR-001 / patch 260) */ }
    const id = `cli-${Date.now()}-${randomUUID().slice(0, 8)}`;

    // Compute quality based on context rather than binary success/fail.
    // Duration-aware: fast successful ops get higher quality.
    // Source-aware: post-task and post-edit are higher signal than post-command.
    const durationMs = opts.durationMs || 0;
    let quality: number;
    if (opts.success) {
      // Successful: base 0.7, bonus for fast execution (< 5s), bonus for high-signal sources
      const speedBonus = durationMs > 0 && durationMs < 5000 ? 0.1 : 0;
      const sourceBonus = opts.source.includes('post-task') ? 0.1 : opts.source.includes('post-edit') ? 0.05 : 0;
      quality = Math.min(0.95, 0.7 + speedBonus + sourceBonus);
    } else {
      // Failed: base 0.3, but higher for post-task (still learned something)
      const sourceBonus = opts.source.includes('post-task') ? 0.15 : opts.source.includes('post-edit') ? 0.1 : 0;
      quality = Math.min(0.6, 0.3 + sourceBonus);
    }

    db.prepare(`
      INSERT OR REPLACE INTO captured_experiences
        (id, task, agent, domain, success, quality, duration_ms,
         started_at, completed_at, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)
    `).run(
      id,
      opts.task.slice(0, 500),
      opts.agent,
      opts.domain,
      opts.success ? 1 : 0,
      quality,
      durationMs,
      opts.source
    );

    // Fire-and-forget embedding write so HNSW C is searchable from the next
    // boot's loadEmbeddingIndex() without waiting for the patch-350 backfill.
    // Without this, hook-side writes accumulate as "ghosts" until the next
    // restart catches them.
    void (async () => {
      try {
        const { computeRealEmbedding } = await import('../../../learning/real-embeddings.js');
        const text = `${opts.domain}: ${opts.task}`.slice(0, 512);
        const embedding = await computeRealEmbedding(text);
        db.prepare(`UPDATE captured_experiences SET embedding = ?, embedding_dimension = ? WHERE id = ?`)
          .run(Buffer.from(new Float32Array(embedding).buffer), embedding.length, id);
      } catch { /* fail-soft */ }
    })();
  } catch (error) {
    // Best-effort — don't fail the hook
    console.error(chalk.dim(`[hooks] persistCommandExperience: ${error instanceof Error ? error.message : 'unknown'}`));
  }
}

/**
 * Bridge payload written by pre-task into kv_store namespace='task-bridge'.
 * Read by persistTaskOutcome to fan out per-pattern apps + derive q-learning state.
 */
export interface TaskBridgePayload {
  selectedPatternIds: string[];
  agent: string | null;
  description: string;
  taskType: string;
  priority: string;
  domain: string;
  complexityBucket: number;
  estimatedTokenSavings: number;
  ts: number;
}

/**
 * Result of persistTaskOutcome — surfaces fields the q-learning post-task
 * integration needs (patch 280 / Stream F).
 */
export interface TaskOutcomeResult {
  /** captured_experiences row id (FK target for experience_applications) */
  experienceId: string;
  /** Outcome quality computed via the 6-dim formula */
  qualityScore: number;
  /** Bridge payload that was consumed (null if no bridge entry found) */
  bridge: TaskBridgePayload | null;
  /** Number of multi-step siblings stitched into the trajectory (0 if single-step) */
  stitchedSiblings: number;
  /** Number of dream_insights rows whose applied counter was incremented */
  insightsApplied: number;
}

/**
 * Persist a Task() outcome through the full experience pipeline.
 *
 * Pipeline rolled into one helper that:
 *
 *   1. Writes captured_experiences (source='cli-hook-post-task')
 *   2. Reads kv_store task-bridge (selectedPatternIds + estimatedTokenSavings)
 *   3. Writes experience_applications: 1 base row + 1 per pattern_id (160/300)
 *   4. Deletes the bridge entry to prevent double-consumption
 *   5. Writes a single-step qe_trajectories row (120)
 *   6. Looks for sibling captured_experiences with task LIKE '%:taskId' in the
 *      last hour; if ≥2, creates a multi-step traj-multi-... row and marks
 *      siblings consolidated_into = traj-multi-id (180)
 *   7. Increments dream_insights.applied for top-3 most-recent actionable rows
 *      when the task succeeded (110)
 *
 * All steps run inside a single transaction so partial failures don't leave
 * inconsistent state. Returns the experience_id and derived fields for the
 * q-learning post-task integration (Stream F / patch 280).
 */
export async function persistTaskOutcome(opts: {
  taskId: string;
  agent: string;
  domain?: string;
  success: boolean;
  durationMs?: number;
}): Promise<TaskOutcomeResult> {
  const { getUnifiedMemory } = await import('../../../kernel/unified-memory.js');
  const um = getUnifiedMemory();
  if (!um.isInitialized()) {
    await um.initialize();
  }
  const db = um.getDatabase();
  try { db.pragma('busy_timeout = 60000'); } catch { /* hook-side patient timeout (ADR-001 / patch 260) */ }

  const experienceId = `exp-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const taskField = `${opts.agent}:${opts.taskId}`;
  const durationMs = opts.durationMs ?? 0;

  // 6-dim outcome quality (patch 080/150 canonical formula)
  // 0.25 * effectiveness + 0.325 baseline + 0.10 * duration_tier
  // Other 4 dims default-0.5 weighted contribute via the 0.325 baseline term.
  const successScore = opts.success ? 1 : 0;
  const durationTier =
    durationMs < 100 ? 1.0 :
    durationMs < 500 ? 0.8 :
    durationMs < 2000 ? 0.6 :
    durationMs < 5000 ? 0.4 :
    durationMs < 10000 ? 0.2 : 0.1;
  const qualityScore = 0.25 * successScore + 0.325 + 0.10 * durationTier;

  let bridge: TaskBridgePayload | null = null;
  let stitchedSiblings = 0;
  let insightsApplied = 0;

  const txn = db.transaction(() => {
    // 1. captured_experiences row
    db.prepare(`
      INSERT INTO captured_experiences
        (id, task, agent, domain, success, quality, duration_ms,
         model_tier, started_at, completed_at, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'), datetime('now'), ?)
    `).run(
      experienceId,
      taskField.slice(0, 500),
      opts.agent,
      opts.domain ?? 'general',
      opts.success ? 1 : 0,
      qualityScore,
      durationMs,
      'cli-hook-post-task',
    );

    // 2. Base experience_applications row
    db.prepare(`
      INSERT INTO experience_applications
        (id, experience_id, task, success, tokens_saved, feedback, applied_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      `app-${Date.now()}-${randomUUID().slice(0, 8)}`,
      experienceId,
      taskField,
      opts.success ? 1 : 0,
      0,
      `[Patch 060] post-task outcome: ${opts.success ? 'success' : 'failure'}`,
    );

    // 3. Read bridge → fan out per-pattern application rows + delete bridge
    try {
      const bridgeRow = db.prepare(`
        SELECT key, value FROM kv_store
        WHERE namespace = 'task-bridge'
          AND (expires_at IS NULL OR expires_at > strftime('%s','now') * 1000)
        ORDER BY created_at DESC
        LIMIT 1
      `).get() as { key: string; value: string } | undefined;

      if (bridgeRow?.value) {
        try {
          bridge = JSON.parse(bridgeRow.value) as TaskBridgePayload;
        } catch {
          bridge = null;
        }
      }

      if (bridge && Array.isArray(bridge.selectedPatternIds) && bridge.selectedPatternIds.length > 0) {
        const perPatternTokens = bridge.estimatedTokenSavings && bridge.selectedPatternIds.length
          ? Math.round(bridge.estimatedTokenSavings / bridge.selectedPatternIds.length)
          : 0;
        const insertApp = db.prepare(`
          INSERT INTO experience_applications
            (id, experience_id, task, success, tokens_saved, feedback, applied_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `);
        // Mirror SQLitePatternStore.recordUsage() so the hook flow updates
        // qe_patterns.{usage_count, successful_uses, success_rate, quality_score}.
        // recordUsage() is otherwise only reachable via HandleTaskOutcomeRecord
        // — never from this hook path — so 88/89 patterns stayed pinned at the
        // bootstrap quality_score floor (~0.30) and never promoted to long-term.
        // Quality formula: confidence*0.3 + min(usage_count/100,1)*0.2 + success_rate*0.5
        const updatePatternUsage = db.prepare(`
          UPDATE qe_patterns SET
            usage_count = usage_count + 1,
            successful_uses = successful_uses + ?,
            success_rate = CAST(successful_uses + ? AS REAL) / CAST(usage_count + 1 AS REAL),
            quality_score = ? * 0.3
              + MIN(CAST(usage_count + 1 AS REAL) / 100.0, 1.0) * 0.2
              + (CAST(successful_uses + ? AS REAL) / CAST(usage_count + 1 AS REAL)) * 0.5,
            last_used_at = datetime('now'),
            updated_at = datetime('now')
          WHERE id = ?
        `);
        const getPatternConfidence = db.prepare(`SELECT confidence FROM qe_patterns WHERE id = ?`);
        // Issue #455: recordOutcome() is called with a synthetic
        // `task:agent:taskId` patternId that never matches qe_patterns.id, so
        // checkPatternPromotionWithCoherence() is skipped for the real UUIDs
        // updated here. Without an inline promotion check, short-term patterns
        // that cross the thresholds (successful_uses ≥ 3, success_rate ≥ 0.7,
        // confidence ≥ 0.6) stay short-term forever — qe_patterns.long-term
        // count never grows past zero.
        const promotionSelectStmt = db.prepare(`
          SELECT tier, successful_uses, success_rate, confidence
          FROM qe_patterns
          WHERE id = ?
        `);
        const promotionUpdateStmt = db.prepare(`
          UPDATE qe_patterns
          SET tier = 'long-term', updated_at = datetime('now')
          WHERE id = ?
            AND tier = 'short-term'
            AND successful_uses >= 3
            AND success_rate >= 0.7
            AND confidence >= 0.6
        `);
        for (const patternId of bridge.selectedPatternIds) {
          insertApp.run(
            `app-${Date.now()}-${randomUUID().slice(0, 8)}`,
            experienceId,
            `${taskField}:pattern:${patternId}`,
            opts.success ? 1 : 0,
            perPatternTokens,
            `[Patch 160+300] task-bridge pattern_id=${patternId} ts=${perPatternTokens}`,
          );
          try {
            const row = getPatternConfidence.get(patternId) as { confidence: number } | undefined;
            if (row) {
              const successInc = opts.success ? 1 : 0;
              updatePatternUsage.run(successInc, successInc, row.confidence, successInc, patternId);
            }
          } catch { /* fail-soft per pattern */ }
          // Issue #455: re-read post-UPDATE state and promote if thresholds met.
          // Guarded WHERE clause makes the UPDATE idempotent and no-op for
          // already-long-term rows or rows below threshold.
          try {
            const pm = promotionSelectStmt.get(patternId) as
              | { tier: string; successful_uses: number; success_rate: number; confidence: number }
              | undefined;
            if (
              pm?.tier === 'short-term' &&
              pm.successful_uses >= 3 &&
              pm.success_rate >= 0.7 &&
              pm.confidence >= 0.6
            ) {
              promotionUpdateStmt.run(patternId);
            }
          } catch { /* fail-soft per pattern */ }
        }
        // 4. Delete bridge entry (one-shot consumption)
        if (bridgeRow) {
          db.prepare(`DELETE FROM kv_store WHERE namespace='task-bridge' AND key = ?`).run(bridgeRow.key);
        }
      }
    } catch (bridgeErr) {
      console.error(chalk.dim(`[hooks] post-task bridge: ${bridgeErr instanceof Error ? bridgeErr.message : 'unknown'}`));
    }

    // 5. Single-step qe_trajectories row
    const trajId = `traj-${Date.now()}-${randomUUID().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO qe_trajectories (id, task, agent, domain, started_at, ended_at, success, steps_json)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?)
    `).run(
      trajId,
      taskField,
      opts.agent,
      opts.domain ?? 'general',
      opts.success ? 1 : 0,
      JSON.stringify([{ step: 1, task: opts.taskId, success: opts.success }]),
    );

    // 6. Multi-step stitch — siblings sharing the same suffix taskId in the
    // last hour. Only fires when ≥2 unconsolidated siblings exist.
    try {
      const siblings = db.prepare(`
        SELECT id, task, agent, success, started_at, completed_at
        FROM captured_experiences
        WHERE consolidated_into IS NULL
          AND task LIKE ?
          AND started_at > datetime('now', '-1 hour')
        ORDER BY started_at ASC
      `).all(`%:${opts.taskId}`) as Array<{
        id: string; task: string; agent: string; success: number;
        started_at: string; completed_at: string;
      }>;

      if (siblings.length >= 2) {
        const multiTrajId = `traj-multi-${Date.now()}-${randomUUID().slice(0, 8)}`;
        const stepsJson = JSON.stringify(
          siblings.map((s, i) => ({
            step: i + 1,
            task: s.task,
            agent: s.agent,
            success: !!s.success,
            started_at: s.started_at,
            completed_at: s.completed_at,
          })),
        );
        const allSuccess = siblings.every((s) => !!s.success);
        db.prepare(`
          INSERT INTO qe_trajectories (id, task, agent, domain, started_at, ended_at, success, steps_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          multiTrajId,
          `multi:${opts.taskId}`,
          opts.agent,
          opts.domain ?? 'general',
          siblings[0].started_at,
          siblings[siblings.length - 1].completed_at,
          allSuccess ? 1 : 0,
          stepsJson,
        );
        const placeholders = siblings.map(() => '?').join(',');
        db.prepare(
          `UPDATE captured_experiences SET consolidated_into = ? WHERE id IN (${placeholders})`,
        ).run(multiTrajId, ...siblings.map((s) => s.id));
        stitchedSiblings = siblings.length;
      }
    } catch (stitchErr) {
      console.error(chalk.dim(`[hooks] post-task stitch: ${stitchErr instanceof Error ? stitchErr.message : 'unknown'}`));
    }

    // 7. dream_insights.applied counter — only on success
    if (opts.success) {
      try {
        const result = db.prepare(`
          UPDATE dream_insights
          SET applied = COALESCE(applied, 0) + 1
          WHERE id IN (
            SELECT id FROM dream_insights
            WHERE actionable = 1
            ORDER BY created_at DESC
            LIMIT 3
          )
        `).run();
        insightsApplied = result.changes ?? 0;
      } catch {
        // dream_insights may not exist on minimal schemas
      }
    }
  });

  try {
    txn();
  } catch (error) {
    console.error(chalk.dim(`[hooks] persistTaskOutcome txn: ${error instanceof Error ? error.message : 'unknown'}`));
  }

  // Fire-and-forget embedding write for the captured_experiences row inserted
  // inside the transaction above. Same rationale as the persistCommandExperience
  // site — without this, post-task writes are ghosts until next-boot backfill.
  void (async () => {
    try {
      const { computeRealEmbedding } = await import('../../../learning/real-embeddings.js');
      const text = `${opts.domain ?? 'general'}: ${taskField}`.slice(0, 512);
      const embedding = await computeRealEmbedding(text);
      db.prepare(`UPDATE captured_experiences SET embedding = ?, embedding_dimension = ? WHERE id = ?`)
        .run(Buffer.from(new Float32Array(embedding).buffer), embedding.length, experienceId);
    } catch { /* fail-soft */ }
  })();

  return {
    experienceId,
    qualityScore,
    bridge,
    stitchedSiblings,
    insightsApplied,
  };
}

/**
 * Q-learning Bellman update for the hook-router state-action pair.
 *
 * Aligned to ADR-061/087:
 *   - algorithm='q-learning' (not 'asymmetric-hebbian'; that label is for
 *     ReasoningBank confidence updates, not Q-learning)
 *   - agent_id='aqe-hook-router' (per-instance partition; persistent-q-router
 *     convention so we don't collide with canonical RuVector q-router writes
 *     at agent_id='q-router')
 *   - state_key='${taskType}|${priority}|${domain}|${complexityBucket}'
 *     (structural; see q-learning-router.ts:591)
 *   - action_key=agent name chosen
 *   - id='q-learning:aqe-hook-router:${stateKey}:${actionKey}'
 *
 * Update: Q ← Q + α(r + γ·max_a' Q(s',a') − Q) with α=0.1, γ=0.9.
 * Reward: success +0.1, failure −1.0 (asymmetric per ADR-061).
 *
 * Best-effort — failures swallowed to keep post-task hook responsive.
 */
export async function updateHookRouterQValue(opts: {
  taskType: string;
  priority: string;
  domain: string;
  complexityBucket: number;
  agent: string;
  success: boolean;
}): Promise<void> {
  try {
    const { getUnifiedMemory } = await import('../../../kernel/unified-memory.js');
    const um = getUnifiedMemory();
    if (!um.isInitialized()) {
      await um.initialize();
    }
    const db = um.getDatabase();
    try { db.pragma('busy_timeout = 60000'); } catch { /* hook-side patient timeout (ADR-001 / patch 260) */ }

    const stateKey = `${opts.taskType}|${opts.priority}|${opts.domain || 'any'}|${opts.complexityBucket}`;
    const actionKey = opts.agent;
    const id = `q-learning:aqe-hook-router:${stateKey}:${actionKey}`;
    const reward = opts.success ? 0.1 : -1.0;
    const alpha = 0.1;
    const gamma = 0.9;

    const existing = db.prepare(`
      SELECT q_value FROM rl_q_values WHERE id = ?
    `).get(id) as { q_value: number } | undefined;
    const oldQ = (existing && typeof existing.q_value === 'number') ? existing.q_value : 0;

    const futureRow = db.prepare(`
      SELECT MAX(q_value) AS m FROM rl_q_values WHERE state_key = ?
    `).get(stateKey) as { m: number | null } | undefined;
    const futureMaxQ = (futureRow && typeof futureRow.m === 'number') ? futureRow.m : 0;

    // Bellman update
    const newQ = oldQ + alpha * (reward + gamma * futureMaxQ - oldQ);

    db.prepare(`
      INSERT INTO rl_q_values
        (id, algorithm, agent_id, state_key, action_key, q_value, visits, last_reward, domain, created_at, updated_at)
      VALUES (?, 'q-learning', 'aqe-hook-router', ?, ?, ?, 1, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(algorithm, agent_id, state_key, action_key) DO UPDATE SET
        q_value = excluded.q_value,
        visits = visits + 1,
        last_reward = excluded.last_reward,
        updated_at = datetime('now')
    `).run(id, stateKey, actionKey, newQ, reward, opts.domain || 'any');
  } catch (error) {
    console.error(chalk.dim(`[hooks] q-learning update: ${error instanceof Error ? error.message : 'unknown'}`));
  }
}

/**
 * Update the routing_outcomes sentinel row that pre-task wrote with
 * quality=-1, success=0. Patch 150: applies the 6-dim outcome quality and
 * success bit to the most-recent pending sentinel matching the agent.
 *
 * Best-effort — no-op when no sentinel found.
 */
export async function updateRoutingOutcomeQuality(opts: {
  agent: string;
  success: boolean;
  durationMs: number;
  qualityScore: number;
}): Promise<void> {
  try {
    const { getUnifiedMemory } = await import('../../../kernel/unified-memory.js');
    const um = getUnifiedMemory();
    if (!um.isInitialized()) {
      await um.initialize();
    }
    const db = um.getDatabase();
    try { db.pragma('busy_timeout = 60000'); } catch { /* hook-side patient timeout (ADR-001 / patch 260) */ }
    // #451: explicit discriminator — only close PRE-TASK sentinels here.
    // The route hook (UserPromptSubmit) writes sentinels with no taskId field
    // in task_json. pre-task writes them with `"taskId"` in task_json. Without
    // this filter, post-task could accidentally grab a stale route sentinel
    // sitting from earlier in the session. Symmetric counterpart in
    // routing-hooks.ts's `post-route` command, which has the inverse filter.
    db.prepare(`
      UPDATE routing_outcomes
      SET success = ?, quality_score = ?, duration_ms = ?
      WHERE id IN (
        SELECT id FROM routing_outcomes
        WHERE quality_score = -1
          AND task_json LIKE '%"taskId"%'
          AND created_at > datetime('now', '-30 minutes')
        ORDER BY (CASE WHEN used_agent = ? THEN 0 ELSE 1 END), created_at DESC
        LIMIT 1
      )
    `).run(
      opts.success ? 1 : 0,
      opts.qualityScore,
      opts.durationMs,
      opts.agent,
    );
  } catch (error) {
    console.error(chalk.dim(`[hooks] routing UPDATE: ${error instanceof Error ? error.message : 'unknown'}`));
  }
}

/**
 * Lightweight experience-to-pattern consolidation.
 * Aggregates captured_experiences by domain+agent, and for clusters that meet
 * quality thresholds, creates new qe_patterns entries.
 * Called at session-end so patterns grow with each session.
 */
export async function consolidateExperiencesToPatterns(): Promise<number> {
  const { getUnifiedMemory } = await import('../../../kernel/unified-memory.js');
  const um = getUnifiedMemory();
  if (!um.isInitialized()) {
    await um.initialize();
  }
  const db = um.getDatabase();
  try { db.pragma('busy_timeout = 60000'); } catch { /* hook-side patient timeout (ADR-001 / patch 260) */ }

  // Ensure consolidation columns exist (may be missing on older DBs)
  const existingCols = new Set(
    (db.prepare('PRAGMA table_info(captured_experiences)').all() as Array<{ name: string }>).map(c => c.name)
  );
  const migrations: Array<[string, string]> = [
    ['consolidated_into', 'TEXT DEFAULT NULL'],
    ['consolidation_count', 'INTEGER DEFAULT 1'],
    ['quality_updated_at', 'TEXT DEFAULT NULL'],
    ['reuse_success_count', 'INTEGER DEFAULT 0'],
    ['reuse_failure_count', 'INTEGER DEFAULT 0'],
  ];
  for (const [col, def] of migrations) {
    if (!existingCols.has(col)) {
      db.exec(`ALTER TABLE captured_experiences ADD COLUMN ${col} ${def}`);
    }
  }

  // Aggregate unprocessed experiences by domain+agent with quality thresholds.
  // Exclude 'cli-hook' agent — these are low-quality hook telemetry events
  // (quality ~0.40, success_rate ~0.24) that flood the pipeline and block
  // real pattern creation. See issue #348.
  const aggregates = db.prepare(`
    SELECT
      domain,
      agent,
      COUNT(*) as cnt,
      AVG(quality) as avg_quality,
      SUM(success) as successes,
      CAST(SUM(success) AS REAL) / COUNT(*) as success_rate,
      AVG(duration_ms) as avg_duration,
      GROUP_CONCAT(DISTINCT source) as sources
    FROM captured_experiences
    WHERE application_count = 0
      AND agent != 'cli-hook'
    GROUP BY domain, agent
    HAVING cnt >= 3 AND avg_quality >= 0.5 AND success_rate >= 0.6
    ORDER BY avg_quality DESC
    LIMIT 50
  `).all() as Array<{
    domain: string;
    agent: string;
    cnt: number;
    avg_quality: number;
    successes: number;
    success_rate: number;
    avg_duration: number;
    sources: string | null;
  }>;

  if (aggregates.length === 0) return 0;

  const { v4: uuidv4 } = await import('uuid');
  let created = 0;

  for (const agg of aggregates) {
    try {
      // Use date-bucketed names so new patterns emerge as usage evolves,
      // instead of silently reinforcing one static pattern forever.
      const dateBucket = new Date().toISOString().slice(0, 7); // YYYY-MM
      const patternName = `${agg.agent}-${agg.domain}-${dateBucket}`;

      // Check for existing pattern with same name this month
      const existing = db.prepare(`
        SELECT id FROM qe_patterns
        WHERE qe_domain = ? AND name = ?
        LIMIT 1
      `).get(agg.domain, patternName) as { id: string } | undefined;

      if (existing) {
        // Reinforce existing monthly pattern
        db.prepare(`
          UPDATE qe_patterns
          SET usage_count = usage_count + ?,
              successful_uses = successful_uses + ?,
              confidence = MIN(0.99, confidence + 0.01),
              quality_score = MIN(0.99, quality_score + 0.005),
              updated_at = datetime('now')
          WHERE id = ?
        `).run(agg.cnt, agg.successes, existing.id);
      } else {
        const patternId = uuidv4();
        const confidence = Math.min(0.95, agg.avg_quality * 0.8 + agg.success_rate * 0.2);
        const qualityScore = confidence * 0.3 + (Math.min(agg.cnt, 100) / 100) * 0.2 + agg.success_rate * 0.5;
        const description = `Auto-consolidated from ${agg.cnt} experiences. Agent: ${agg.agent}, success rate: ${(agg.success_rate * 100).toFixed(0)}%`;
        const tags = (agg.sources || '').split(',').filter(Boolean);

        db.prepare(`
          INSERT INTO qe_patterns (
            id, pattern_type, qe_domain, domain, name, description,
            confidence, usage_count, success_rate, quality_score, tier,
            template_json, context_json, created_at, successful_uses
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
        `).run(
          patternId,
          'workflow',
          agg.domain,
          agg.domain,
          patternName,
          description,
          confidence,
          agg.cnt,
          agg.success_rate,
          qualityScore,
          'short-term',
          JSON.stringify({ type: 'workflow', content: `${agg.agent} pattern for ${agg.domain}`, variables: [] }),
          JSON.stringify({ tags, sourceType: 'session-consolidation', extractedAt: new Date().toISOString() }),
          agg.successes
        );

        // Pair the qe_patterns row with an embedding so HNSW pattern recall
        // doesn't see this as a "ghost" (ADR-058 embedding-locality). Fail-soft.
        const { ensurePatternEmbedding } = await import('../../../learning/embed-and-insert-pattern.js');
        await ensurePatternEmbedding(db, patternId, patternName, description, tags);

        created++;
      }

      // Mark experiences as processed
      db.prepare(`
        UPDATE captured_experiences
        SET application_count = application_count + 1
        WHERE domain = ? AND agent = ? AND application_count = 0
      `).run(agg.domain, agg.agent);
    } catch {
      // Skip on error (e.g. constraint violations)
    }
  }

  return created;
}
