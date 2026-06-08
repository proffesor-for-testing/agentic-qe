/**
 * Agentic QE v3 - Local LLM Judge Client
 *
 * Scores QE patterns for coherence, specificity, and reusability using a
 * locally running Ollama-compatible LLM (OpenAI chat completions API).
 *
 * Reward blending: final_reward = 0.7 * outcome_reward + 0.3 * judge_score
 * Escalation: score in [0.4, 0.6] → logged for human review (ambiguous zone)
 *
 * Env vars (all optional — client is disabled if none set):
 *   NAGUAL_JUDGE_URL    — base URL of Ollama server (default: http://localhost:11434)
 *   NAGUAL_JUDGE_MODEL  — model to use (default: qwen3:8b)
 *
 * Supported models (in preference order for M-series Macs):
 *   gemma4:12b-mlx  — 10GB, MLX-optimised, best quality on Apple Silicon
 *   qwen3:8b        — 5.2GB, strong reasoning, already installed
 *   qwen3:30b-a3b   — 18GB, highest quality, use only if RAM permits
 */

import { LoggerFactory } from '../logging/index.js';

const logger = LoggerFactory.create('local-judge');

const DEFAULT_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'qwen3:8b';
const JUDGE_TIMEOUT_MS = 30_000;
const MAX_TEXT_LENGTH = 600;
// Thinking models (gemma4, qwen3) need extra tokens to finish reasoning before output
const MAX_TOKENS = 600;

/** Score in this range is ambiguous — flagged for human review. */
const AMBIGUOUS_LOW = 0.4;
const AMBIGUOUS_HIGH = 0.6;

/** Output of a judge evaluation. */
export interface JudgeResult {
  /** Quality score in [0, 1]. */
  score: number;
  /** One-sentence reasoning from the model. */
  reason: string;
  /** Model that produced the score. */
  model: string;
  /** True if score falls in the ambiguous zone [0.4, 0.6]. */
  needsReview: boolean;
}

/**
 * Blend an outcome reward with a judge score.
 * final = 0.7 * outcomeReward + 0.3 * judgeScore
 * Falls back to outcomeReward if judgeResult is null (judge unavailable).
 */
export function blendReward(outcomeReward: number, judgeResult: JudgeResult | null): number {
  if (judgeResult === null) return outcomeReward;
  return 0.7 * outcomeReward + 0.3 * judgeResult.score;
}

/**
 * Local LLM judge using OpenAI-compatible chat completions.
 * Disabled automatically when NAGUAL_JUDGE_URL and NAGUAL_JUDGE_MODEL are both unset.
 */
export class LocalJudgeClient {
  readonly baseUrl: string;
  readonly model: string;
  readonly enabled: boolean;

  constructor(opts?: { url?: string; model?: string }) {
    this.baseUrl = opts?.url ?? process.env['NAGUAL_JUDGE_URL'] ?? DEFAULT_URL;
    this.model = opts?.model ?? process.env['NAGUAL_JUDGE_MODEL'] ?? DEFAULT_MODEL;
    // Only active when explicitly configured via env or constructor options
    this.enabled = Boolean(
      opts?.url ?? opts?.model ??
      process.env['NAGUAL_JUDGE_URL'] ??
      process.env['NAGUAL_JUDGE_MODEL'],
    );
  }

  /**
   * Score a piece of text (pattern problem+solution) for QE quality.
   * Returns null if judge is disabled or unavailable — callers use outcomeReward as-is.
   */
  async score(text: string): Promise<JudgeResult | null> {
    if (!this.enabled) return null;

    const truncated = text.slice(0, MAX_TEXT_LENGTH);
    const prompt = [
      'You are a QE pattern quality judge.',
      'Rate the following pattern for: coherence, specificity, and reusability in a software quality engineering context.',
      'Reply with valid JSON only, no other text: {"score": <float 0.0-1.0>, "reason": "<one sentence>"}',
      '',
      `Pattern:\n${truncated}`,
    ].join('\n');

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: MAX_TOKENS,
        }),
        signal: AbortSignal.timeout(JUDGE_TIMEOUT_MS),
      });

      if (!response.ok) {
        logger.debug('judge request failed', { status: response.status, model: this.model });
        return null;
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string; reasoning?: string } }>;
      };
      const msg = data.choices?.[0]?.message;
      // Thinking models (gemma4, qwen3) emit final answer in content; reasoning
      // holds the internal chain-of-thought. Fall back to reasoning if content empty.
      const rawText = (msg?.content ?? '') || (msg?.reasoning ?? '');

      // Strip markdown code fences before parsing
      const cleaned = rawText.replace(/```[\w]*\n?/g, '').replace(/```/g, '');

      // Extract first JSON object — handles multiline values via [\s\S] inside quotes
      const jsonMatch = cleaned.match(/\{[\s\S]*?"score"[\s\S]*?\}/);
      if (!jsonMatch) {
        logger.debug('judge response had no JSON', { rawText: rawText.slice(0, 150) });
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]) as { score?: unknown; reason?: unknown };
      if (typeof parsed.score !== 'number') return null;

      const score = Math.max(0, Math.min(1, parsed.score));
      const reason = typeof parsed.reason === 'string' ? parsed.reason : '';
      const needsReview = score >= AMBIGUOUS_LOW && score <= AMBIGUOUS_HIGH;

      if (needsReview) {
        logger.info('[SurpriseReview] ambiguous judge score — flag for human review', {
          score,
          reason,
          model: this.model,
        });
      }

      return { score, reason, model: this.model, needsReview };
    } catch (err) {
      logger.debug('judge unavailable (non-fatal)', { err, model: this.model });
      return null;
    }
  }
}

let _instance: LocalJudgeClient | undefined;

export function getLocalJudgeClient(): LocalJudgeClient {
  if (!_instance) _instance = new LocalJudgeClient();
  return _instance;
}
