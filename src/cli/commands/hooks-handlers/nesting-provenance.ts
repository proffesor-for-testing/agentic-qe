/**
 * Agentic QE v3 - Nested-Subagent Provenance Validation (ADR-101)
 *
 * Parses and validates the `--parent-agent-id` / `--depth` flags on
 * `aqe hooks post-task`. Anthropic announced nested subagent support
 * (depth=5) on 2026-06-09; recording which agent spawned a task and at
 * what depth lets ReasoningBank segment patterns per hierarchy level —
 * useful today for flat depth-1 spawns, and ready for deep chains the
 * day the upstream `Task` denylist lifts.
 */

/** Agent identifiers: alphanum start, then alphanum / _ . : - , max 128 chars */
const AGENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

/** Defensive bound — well above Anthropic's announced depth=5 cap */
export const MAX_NESTING_DEPTH = 32;

export interface NestingProvenance {
  parentAgentId?: string;
  depth?: number;
}

export interface NestingProvenanceResult extends NestingProvenance {
  /** Set when validation failed; the caller should reject the invocation */
  error?: string;
}

/**
 * Validate raw flag values. Both flags are optional and independent;
 * depth=0 is a valid value (top-level) and must survive as 0, not be
 * coerced to undefined.
 */
export function parseNestingProvenance(
  parentAgentIdRaw?: string,
  depthRaw?: string | number
): NestingProvenanceResult {
  const result: NestingProvenanceResult = {};

  if (parentAgentIdRaw !== undefined) {
    if (!AGENT_ID_RE.test(parentAgentIdRaw)) {
      return {
        error:
          `Invalid --parent-agent-id "${parentAgentIdRaw}": must start with a letter or digit ` +
          `and contain only letters, digits, "_", ".", ":", "-" (max 128 chars)`,
      };
    }
    result.parentAgentId = parentAgentIdRaw;
  }

  if (depthRaw !== undefined) {
    const depth = typeof depthRaw === 'number' ? depthRaw : Number(depthRaw);
    if (!Number.isInteger(depth)) {
      return { error: `Invalid --depth "${depthRaw}": must be an integer` };
    }
    if (depth < 0) {
      return { error: `Invalid --depth ${depth}: must be >= 0` };
    }
    if (depth > MAX_NESTING_DEPTH) {
      return { error: `Invalid --depth ${depth}: must be <= ${MAX_NESTING_DEPTH}` };
    }
    result.depth = depth;
  }

  return result;
}
