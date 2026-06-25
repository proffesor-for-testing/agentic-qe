/**
 * @ruvector/adversarial-verify — types (plan 05 / A2).
 *
 * Host-agnostic blind-refuter verification, extracted from AQE's
 * qcsd-development-review workflow (ADR-074 Loki-mode, ADR-103 finding-verdict@1).
 * ZERO dependency on AQE/Claude-Code: the LLM call is injected as a `Judge`, so
 * this module is reusable by any host (and publishable as @ruvector/*).
 */

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingOutcome = 'upheld' | 'refuted' | 'uncertain';

/** A claim to be adversarially verified (input). */
export interface Finding {
  /** Stable id; the verdict carries it verbatim (callers compose any prefix). */
  id: string;
  title: string;
  file?: string;
  severity: FindingSeverity;
  /** Finder's self-reported confidence (0..1). NOT shown to refuters (blind). */
  confidence: number;
  evidence: string[];
}

/** One refuter's vote (the Judge's return). */
export interface RefuterVote {
  refuted: boolean;
  reasoning: string;
}

/**
 * The injected LLM refuter. Returns a vote, or `null`/throws on failure (failed
 * calls are excluded from the tally — they neither refute nor uphold).
 * Receives ONLY the blind refuter prompt — never the finder's confidence/dimension.
 */
export type Judge = (prompt: string) => Promise<RefuterVote | null>;

/** finding-verdict@1 envelope (mirrors schemas/finding-verdict.schema.json). */
export interface FindingVerdict {
  contract: 'finding-verdict@1';
  id: string;
  title: string;
  file?: string;
  severity: FindingSeverity;
  confidence: number;
  evidence: string[];
  verdict: FindingOutcome;
  /** One entry per refuter that voted to refute (empty when none). */
  refutations: string[];
}

export interface AdversarialVerifyOptions {
  /** The injected LLM refuter. Required. */
  judge: Judge;
  /** Refuters per finding (default 3). Capped at `lenses.length`. */
  refuters?: number;
  /** Refutation lenses (one per refuter). Default {@link DEFAULT_LENSES}. */
  lenses?: string[];
  /**
   * Kill threshold as a function of the number of CAST votes (default ⌈n/2⌉ —
   * majority). A finding is `refuted` when refute-votes ≥ killThreshold(castVotes).
   */
  killThreshold?: (castVotes: number) => number;
}
