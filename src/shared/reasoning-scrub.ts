/**
 * Agentic QE v3 - Reasoning-Tag Scrubber (ADR-099)
 *
 * Strips extended-thinking blocks (<think>, <thinking>, <reasoning>,
 * <REASONING_SCRATCHPAD>) from text before it enters the learning pipeline —
 * pattern distillation, trajectory persistence, and embedding generation.
 *
 * Why: reasoning-capable models (Fable 5 era) emit large scratchpad blocks
 * inside task results and step actions. Embedding them verbatim contaminates
 * the 384-dim pattern vectors in memory.db, degrading HNSW retrieval quality
 * (the scratchpad dominates the signal of what the step actually did).
 *
 * Boundary-gated: only well-formed `<tag ...> ... </tag>` pairs are removed.
 * Prose that merely *mentions* a tag name (e.g. documentation about
 * "<thinking> blocks") without a closing tag is left intact.
 */

/**
 * Tag names treated as reasoning scratchpads. Matched case-insensitively
 * as whole tag names (open tag may carry attributes).
 */
const REASONING_TAG_NAMES = ['think', 'thinking', 'reasoning', 'reasoning_scratchpad'] as const;

/**
 * One alternation per tag, each backreference-paired so an open tag is only
 * consumed when its own matching close tag exists. Non-greedy body keeps
 * adjacent blocks separate. The `\s*` before `>` tolerates `</thinking >`.
 */
const REASONING_BLOCK_RE = new RegExp(
  `<(${REASONING_TAG_NAMES.join('|')})(?:\\s[^>]*)?>[\\s\\S]*?</\\1\\s*>`,
  'gi'
);

/**
 * Remove reasoning scratchpad blocks from text destined for the learning
 * pipeline. Collapses the whitespace gap a removed block leaves behind so
 * surrounding prose re-joins cleanly. Non-string / empty input returns as-is.
 */
export function scrubReasoningBlocks(text: string): string {
  if (!text || typeof text !== 'string' || !text.includes('<')) {
    return text;
  }

  let out = text;
  // Repeat until stable: removing an inner block can expose an outer pair
  // (e.g. <thinking><thinking>…</thinking></thinking>).
  for (let i = 0; i < 5; i++) {
    const next = out.replace(REASONING_BLOCK_RE, ' ');
    if (next === out) break;
    out = next;
  }

  // If nothing was removed, return the original text untouched (don't
  // re-format whitespace of clean input).
  if (out === text) {
    return text;
  }

  // Collapse the space runs left where blocks were removed; preserve newlines.
  return out.replace(/[ \t]{2,}/g, ' ').trim();
}

/**
 * Scrub a value that may be a string or a JSON-serializable structure whose
 * string leaves may contain reasoning blocks. Non-objects pass through.
 * Used for trajectory step `result.data` payloads serialized into memory.db.
 */
export function scrubReasoningDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return scrubReasoningBlocks(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => scrubReasoningDeep(v)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubReasoningDeep(v);
    }
    return out as unknown as T;
  }
  return value;
}
