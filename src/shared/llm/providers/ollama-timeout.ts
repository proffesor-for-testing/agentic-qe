/**
 * Adaptive request-timeout sizing for local Ollama generations (#3).
 *
 * Local models vary ~6× in speed (a dense 27B ≈ 15 tok/s vs a 30B MoE ≈ 90
 * tok/s on the same Mac) and thinking models can spend thousands of tokens
 * before answering, so one fixed timeout either strands fast models or times
 * out slow ones mid-generation. We size the timeout from the output cap
 * (num_predict) and the model's observed throughput, with generous headroom.
 *
 * Pure + dependency-free so it is unit-testable in isolation.
 */
export const OLLAMA_TIMEOUT = {
  /** Conservative throughput assumed before a model has been observed (dense floor). */
  DEFAULT_TOK_PER_SEC: 15,
  /** Multiplier over ideal generation time to absorb variance. */
  SAFETY_FACTOR: 2.5,
  /** Fixed overhead for cold model load / prompt eval (~6–9s measured). */
  LOAD_OVERHEAD_MS: 15_000,
  /** Never time out faster than this. */
  FLOOR_MS: 30_000,
  /** Never wait longer than this. */
  CEIL_MS: 600_000,
} as const;

/** Size a timeout (ms) from the output token cap and observed tok/s. */
export function computeAdaptiveTimeoutMs(
  numPredict: number,
  tokPerSec: number = OLLAMA_TIMEOUT.DEFAULT_TOK_PER_SEC,
): number {
  const tps = tokPerSec > 0 ? tokPerSec : OLLAMA_TIMEOUT.DEFAULT_TOK_PER_SEC;
  const genMs = (Math.max(0, numPredict) / tps) * 1000;
  const computed = genMs * OLLAMA_TIMEOUT.SAFETY_FACTOR + OLLAMA_TIMEOUT.LOAD_OVERHEAD_MS;
  return Math.min(OLLAMA_TIMEOUT.CEIL_MS, Math.max(OLLAMA_TIMEOUT.FLOOR_MS, Math.round(computed)));
}
