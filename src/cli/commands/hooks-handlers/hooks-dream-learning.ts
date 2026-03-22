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
    const db = um.getDatabase();
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
  } catch (error) {
    // Best-effort — don't fail the hook
    console.error(chalk.dim(`[hooks] persistCommandExperience: ${error instanceof Error ? error.message : 'unknown'}`));
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
          `Auto-consolidated from ${agg.cnt} experiences. Agent: ${agg.agent}, success rate: ${(agg.success_rate * 100).toFixed(0)}%`,
          confidence,
          agg.cnt,
          agg.success_rate,
          qualityScore,
          'short-term',
          JSON.stringify({ type: 'workflow', content: `${agg.agent} pattern for ${agg.domain}`, variables: [] }),
          JSON.stringify({ tags: (agg.sources || '').split(','), sourceType: 'session-consolidation', extractedAt: new Date().toISOString() }),
          agg.successes
        );
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
