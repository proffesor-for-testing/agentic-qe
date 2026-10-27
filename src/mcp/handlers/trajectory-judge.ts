/**
 * Trajectory Judge — opt-in LLM scoring of unscored qe_trajectories rows.
 *
 * Picks ≤5 rows where feedback IS NULL AND ended_at IS NOT NULL, asks Claude
 * Haiku to score them, and writes a structured feedback JSON back into
 * qe_trajectories.feedback. Quality is embedded in the feedback JSON since
 * the canonical schema has no `quality` column.
 *
 * Uses the proxy-aware path from patch 380 (ANTHROPIC_BASE_URL) so this honors
 * any local proxy in front of api.anthropic.com.
 */

import { getUnifiedMemory } from '../../kernel/unified-memory.js';

const MODEL_ID = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 200;
const BATCH_SIZE = 5;

interface UnscoredRow {
  id: string;
  task: string;
  agent: string | null;
  domain: string | null;
  success: number;
}

interface JudgeVerdict {
  quality: number;
  reasoning: string;
  improvement?: string;
}

export async function scoreUnjudgedTrajectories(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return;
  const baseUrl = (process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').replace(/\/$/, '');

  const um = getUnifiedMemory();
  if (!um.isInitialized()) return;
  const db = um.getDatabase();

  // Verify the feedback column exists (TrajectoryTracker.ensureSchema() adds it
  // lazily — it may not have run yet on a fresh install).
  const cols = db.prepare('PRAGMA table_info(qe_trajectories)').all() as Array<{ name: string }>;
  if (!cols.some(c => c.name === 'feedback')) return;

  const rows = db.prepare(`
    SELECT id, task, agent, domain, success
    FROM qe_trajectories
    WHERE feedback IS NULL AND ended_at IS NOT NULL
    ORDER BY ended_at DESC
    LIMIT ?
  `).all(BATCH_SIZE) as UnscoredRow[];

  if (rows.length === 0) return;

  const updateStmt = db.prepare(`UPDATE qe_trajectories SET feedback = ? WHERE id = ?`);

  for (const row of rows) {
    try {
      const verdict = await scoreTrajectory(row, apiKey, baseUrl);
      if (verdict) {
        await um.writeWhenUnlocked(() => updateStmt.run(JSON.stringify(verdict), row.id));
      }
    } catch {
      // Skip this row; another task_orchestrate call will retry it
    }
  }
}

async function scoreTrajectory(
  row: UnscoredRow,
  apiKey: string,
  baseUrl: string,
): Promise<JudgeVerdict | null> {
  const prompt = [
    `You are a quality engineering judge scoring a completed task trajectory.`,
    ``,
    `Task: ${row.task.slice(0, 400)}`,
    `Agent: ${row.agent ?? 'unknown'}`,
    `Domain: ${row.domain ?? 'general'}`,
    `Outcome: ${row.success ? 'success' : 'failure'}`,
    ``,
    `Respond ONLY with JSON: {"quality": 0..1, "reasoning": "≤120 chars", "improvement": "≤120 chars or omit"}.`,
  ].join('\n');

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL_ID,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) return null;
  const body = await response.json() as { content?: Array<{ text?: string }> };
  const text = body.content?.[0]?.text;
  if (!text) return null;

  // Tolerate fenced code blocks
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as JudgeVerdict;
    if (typeof parsed.quality !== 'number' || typeof parsed.reasoning !== 'string') return null;
    return {
      quality: Math.max(0, Math.min(1, parsed.quality)),
      reasoning: parsed.reasoning.slice(0, 200),
      improvement: typeof parsed.improvement === 'string' ? parsed.improvement.slice(0, 200) : undefined,
    };
  } catch {
    return null;
  }
}
