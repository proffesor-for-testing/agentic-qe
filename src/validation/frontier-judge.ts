/**
 * Frontier-tier spec judge for the ADR-119 two-gate quality verdict.
 *
 * This is the real spec-gate `Judge` consumed by `computeQualityVerdict`
 * (quality-verdict.ts). It grades an artifact against a pinned,
 * constant-denominator ADR-117 checklist using a FRONTIER model — never the
 * cheap local writer lane (ADR-111: the oracle is the one place you never
 * economize). Two design guarantees flow from the verdict logic:
 *
 *   - `preflight()` does a cheap live round-trip to prove the provider and
 *     credentials actually respond. On any failure it returns `false`, which the
 *     verdict maps to `inconclusive` — a dead provider can never masquerade as a
 *     silent pass.
 *   - `grade()` returns `ran: false` on ANY tooling failure (timeout,
 *     usage-limit, unparseable response). A non-real opinion can never
 *     contribute to a `fail`; too few real opinions ⇒ `inconclusive`.
 *
 * The single provider call is isolated behind an injectable `complete(prompt)`
 * seam so the judge is unit-testable with a fake and zero network. Wire the real
 * frontier model with `routerComplete()` / `createRouterFrontierJudge()`.
 */

import type { Judge, JudgeOpinion, RequirementChecklist } from './quality-verdict.js';
import type { HybridRouter } from '../shared/llm/router/hybrid-router.js';
import type { ExtendedProviderType } from '../shared/llm/router/types.js';
import { DEFAULT_OPUS_MODEL } from '../shared/llm/model-registry.js';

/** The model call seam. Returns the raw model text for one prompt. */
export type CompleteFn = (prompt: string) => Promise<string>;

export interface FrontierJudgeOptions {
  /**
   * Injectable frontier-model call. In production this is `routerComplete()`
   * bound to a frontier model; in tests it is a fake — NO network either way.
   */
  complete: CompleteFn;
  /**
   * Cheap liveness ping used by `preflight()`. Defaults to a minimal
   * `complete()` round-trip. Should resolve truthy only when the provider and
   * credentials actually respond.
   */
  ping?: () => Promise<boolean>;
  /** Frontier model id, for reporting/telemetry only (the seam owns the call). */
  model?: string;
  /** Per-call timeout in ms (grade + default ping). Default 60s. */
  timeoutMs?: number;
  /** Optional diagnostic logger. */
  logger?: (message: string) => void;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_PING_TIMEOUT_MS = 15_000;

/**
 * Create the ADR-119 frontier spec judge.
 *
 * The returned object satisfies the `Judge` contract consumed by
 * `computeQualityVerdict`. All provider interaction is behind `opts.complete`.
 */
export function createFrontierJudge(opts: FrontierJudgeOptions): Judge {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const log = opts.logger ?? (() => {});
  const model = opts.model ?? 'frontier';

  const ping =
    opts.ping ??
    (async (): Promise<boolean> => {
      const text = await withTimeout(
        opts.complete('Reply with exactly: OK'),
        Math.min(DEFAULT_PING_TIMEOUT_MS, timeoutMs),
        'judge preflight ping',
      );
      return typeof text === 'string' && text.trim().length > 0;
    });

  return {
    async preflight(): Promise<boolean> {
      try {
        const ok = await ping();
        if (!ok) log(`frontier-judge preflight: provider (${model}) returned empty — not ready`);
        return ok;
      } catch (err) {
        // A dead/unauthenticated provider MUST NOT read as "ready" — that is
        // exactly how an infra hiccup would masquerade as a silent pass.
        log(`frontier-judge preflight failed (${model}): ${errText(err)}`);
        return false;
      }
    },

    async grade(artifact: string, checklist: RequirementChecklist): Promise<JudgeOpinion> {
      const total = checklist.requirements.length;
      try {
        const prompt = buildGradePrompt(artifact, checklist);
        const raw = await withTimeout(opts.complete(prompt), timeoutMs, 'judge grade');
        const unmetIdx = parseUnmetIndices(raw, total);
        if (unmetIdx == null) {
          // Unparseable — a real model ran but we cannot trust the grade, so it
          // is NOT a real opinion (cannot contribute to a fail).
          log(`frontier-judge grade: could not parse response for ${checklist.id}`);
          return { ran: false, coverage: 0, unmet: [] };
        }
        const unmet = [...unmetIdx].sort((a, b) => a - b).map((i) => checklist.requirements[i]);
        // Coverage over the CONSTANT denominator (ADR-117) — comparable across runs.
        const coverage = (total - unmet.length) / total;
        return { ran: true, coverage, unmet };
      } catch (err) {
        // Timeout / usage-limit / network — not a real opinion.
        log(`frontier-judge grade failed for ${checklist.id} (${model}): ${errText(err)}`);
        return { ran: false, coverage: 0, unmet: [] };
      }
    },
  };
}

/**
 * Build a `complete()` seam backed by the shared HybridRouter, pinned to a
 * frontier model. This is where the ADR-111 "never economize the oracle" rule is
 * enforced: `model` defaults to a frontier Opus and `preferredProvider` lets the
 * caller route to a frontier provider explicitly.
 */
export function routerComplete(
  router: HybridRouter,
  opts: {
    model?: string;
    preferredProvider?: ExtendedProviderType;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  } = {},
): CompleteFn {
  const model = opts.model ?? DEFAULT_OPUS_MODEL;
  return async (prompt: string): Promise<string> => {
    const res = await router.chat({
      messages: [{ role: 'user', content: prompt }],
      model,
      preferredProvider: opts.preferredProvider,
      temperature: opts.temperature ?? 0,
      maxTokens: opts.maxTokens ?? 1024,
      timeoutMs: opts.timeoutMs,
      skipCache: true,
    });
    return res.content ?? '';
  };
}

/**
 * Convenience: a frontier judge wired to the shared HybridRouter. The judge is
 * ALWAYS frontier-tier — `model` defaults to a frontier Opus.
 */
export function createRouterFrontierJudge(
  router: HybridRouter,
  opts: {
    model?: string;
    preferredProvider?: ExtendedProviderType;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    logger?: (message: string) => void;
  } = {},
): Judge {
  const model = opts.model ?? DEFAULT_OPUS_MODEL;
  return createFrontierJudge({
    complete: routerComplete(router, { ...opts, model }),
    model,
    timeoutMs: opts.timeoutMs,
    logger: opts.logger,
  });
}

/**
 * A judge for when no frontier provider is available (no LLM router / no
 * credentials). `preflight()` returns false so the verdict is `inconclusive` —
 * NEVER a silent pass. Both CLI and MCP use this fallback so they stay in parity.
 */
export function createUnavailableJudge(_reason: string): Judge {
  return {
    preflight: () => false,
    grade: () => ({ ran: false, coverage: 0, unmet: [] }),
  };
}

// ============================================================================
// Prompt + parsing
// ============================================================================

/**
 * Build the grading prompt. Requirements are numbered 1..N and the model is
 * asked for the numbers of the UNMET ones as strict JSON. Reporting unmet (not
 * satisfied) keeps the denominator constant and the contract unambiguous.
 */
export function buildGradePrompt(artifact: string, checklist: RequirementChecklist): string {
  const numbered = checklist.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n');
  return [
    'You are a rigorous, frontier-tier quality oracle grading a software artifact',
    'against a FIXED requirement checklist. Judge only what the artifact actually',
    'verifies — do not give credit for requirements it merely mentions or leaves',
    'implicit. A requirement is "met" only if the artifact demonstrably covers it.',
    '',
    `Checklist id: ${checklist.id}`,
    'Requirements (the denominator is fixed — grade ALL of them):',
    numbered,
    '',
    '--- ARTIFACT UNDER JUDGEMENT ---',
    artifact,
    '--- END ARTIFACT ---',
    '',
    'Return ONLY a single JSON object, no prose, no markdown fences, of the form:',
    '{"unmet": [<numbers of requirements NOT met>]}',
    'Use the requirement numbers above. If every requirement is met, return {"unmet": []}.',
  ].join('\n');
}

/**
 * Parse the model response into a set of 0-based unmet requirement indices.
 * Returns `null` when the response cannot be parsed into the strict contract
 * (so the caller treats it as a non-real opinion). Out-of-range and duplicate
 * numbers are ignored — a garbled index list never inflates the unmet count.
 */
export function parseUnmetIndices(raw: string, total: number): Set<number> | null {
  const obj = extractJsonObject(raw);
  if (obj == null || !Array.isArray((obj as { unmet?: unknown }).unmet)) {
    return null;
  }
  const out = new Set<number>();
  for (const v of (obj as { unmet: unknown[] }).unmet) {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN;
    if (!Number.isInteger(n)) continue;
    const idx = n - 1; // 1-based prompt -> 0-based index
    if (idx >= 0 && idx < total) out.add(idx);
  }
  return out;
}

/** Extract the first balanced top-level JSON object from arbitrary model text. */
function extractJsonObject(raw: string): unknown | null {
  if (typeof raw !== 'string') return null;
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(raw.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// ============================================================================
// Helpers
// ============================================================================

/** Reject with a timeout error if `p` does not settle within `ms`. */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
