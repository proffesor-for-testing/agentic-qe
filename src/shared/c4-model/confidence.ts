/**
 * ADR-112 — Deterministic C4 confidence gate.
 *
 * Pure, code-only (NO LLM in the gate — same discipline as ADR-111's accept
 * gate). Turns the code-intelligence detector's known limits (the
 * qe-code-intelligence skill records ~18% success on complex queries and
 * degradation above ~50K LOC) into an explicit, surfaced signal so a
 * confident-but-wrong diagram is never presented as ground truth.
 */

export type C4Confidence = 'high' | 'medium' | 'low';

export interface C4ConfidenceInputs {
  /** Number of components the detector found. */
  componentsDetected: number;
  /** Number of component relationships (edges) detected. */
  relationshipsDetected: number;
  /** Number of external systems detected. */
  externalSystemsDetected: number;
  /** Number of source files analyzed. */
  filesAnalyzed: number;
  /** Total lines of code, if known (e.g. from MetricCollector). Optional. */
  totalLoc?: number;
}

export interface C4ConfidenceAssessment {
  /** Bucketed level for quick display. */
  level: C4Confidence;
  /** Continuous score in [0,1] the level is derived from. */
  score: number;
  /** Human-readable reasons (always populated). */
  reasons: string[];
}

/** Repo size (LOC) beyond which the skill records detection degradation. */
export const C4_LOC_DEGRADE_THRESHOLD = 50_000;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Assess how much to trust an auto-generated C4 diagram. Deterministic: the same
 * inputs always yield the same level + reasons.
 */
export function assessC4Confidence(inputs: C4ConfidenceInputs): C4ConfidenceAssessment {
  const { componentsDetected, relationshipsDetected, externalSystemsDetected, totalLoc } = inputs;
  const reasons: string[] = [];

  // Empty diagram — nothing to trust.
  if (componentsDetected === 0) {
    return {
      level: 'low',
      score: 0,
      reasons: ['No components detected — the diagram is effectively empty; verify against the source.'],
    };
  }

  let score = 0.5;

  // Relationships are the weakest link in heuristic detection. Their presence is
  // the strongest signal that the STRUCTURE (not just a node list) is real.
  const relDensity = relationshipsDetected / Math.max(1, componentsDetected);
  if (relationshipsDetected === 0 && componentsDetected > 1) {
    score -= 0.25;
    reasons.push('No relationships detected between components — edges are heuristic-only or missing; the structure is unverified.');
  } else if (relDensity >= 0.5) {
    score += 0.2;
    reasons.push(`${relationshipsDetected} relationship(s) detected across ${componentsDetected} components.`);
  } else {
    score += 0.05;
    reasons.push(`${relationshipsDetected} relationship(s) detected (sparse) across ${componentsDetected} components.`);
  }

  // External systems detected → the Platform/Interfaces picture is grounded.
  if (externalSystemsDetected > 0) {
    score += 0.1;
    reasons.push(`${externalSystemsDetected} external system(s) detected from dependencies.`);
  }

  // Repo size vs the known degradation threshold.
  if (totalLoc !== undefined && totalLoc > C4_LOC_DEGRADE_THRESHOLD) {
    score -= 0.3;
    reasons.push(
      `Repository is large (${totalLoc.toLocaleString()} LOC > ~${C4_LOC_DEGRADE_THRESHOLD / 1000}K) — detection accuracy degrades; treat the diagram as a draft.`,
    );
  }

  // A healthy component count adds confidence; a single component is thin.
  if (componentsDetected >= 5) {
    score += 0.1;
  } else if (componentsDetected === 1) {
    score -= 0.05;
    reasons.push('Only one component detected — likely an under-segmented view.');
  }

  score = clamp01(score);
  const level: C4Confidence = score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low';

  if (level !== 'high' && !reasons.some((r) => r.includes('draft') || r.includes('verify'))) {
    reasons.push('Auto-generated draft — verify against the source before relying on it.');
  }

  return { level, score: Math.round(score * 1000) / 1000, reasons };
}
