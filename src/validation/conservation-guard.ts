/**
 * Conservation Guard (Phoenix essay 14 "UI Is a Conservation Layer", ADR-114)
 *
 * AQE's human/agent-facing surfaces — CLI commands, output schemas, MCP tools,
 * the dashboard — are its conservation layer: users and CI pipelines build muscle
 * memory and scripts around them. Internals may regenerate freely; these surfaces
 * must change slowly and ADDITIVELY. This module diffs a captured baseline against
 * the current surface and flags breaking removals/renames that are not in the
 * deprecation registry.
 *
 * Pure functions only — extraction + I/O live in scripts/conservation-guard.ts.
 */

export interface SurfaceDiff {
  surface: string;
  /** Entries present now but not in the baseline — additive, always allowed. */
  added: string[];
  /** Entries removed from the baseline and NOT in the deprecation registry — breaking. */
  removedBreaking: string[];
  /** Entries removed but listed as deprecated — an allowed, deliberate removal. */
  removedDeprecated: string[];
  /** True when there are no breaking removals. */
  clean: boolean;
}

/**
 * Diff one surface. Additive changes pass; a removal/rename is breaking unless the
 * removed entry appears in `deprecated` (the deprecation window has been honored).
 */
export function diffSurface(
  surface: string,
  baseline: string[],
  current: string[],
  deprecated: string[] = [],
): SurfaceDiff {
  const cur = new Set(current);
  const dep = new Set(deprecated);
  const added = current.filter((e) => !baseline.includes(e)).sort();
  const removed = baseline.filter((e) => !cur.has(e));
  const removedBreaking = removed.filter((e) => !dep.has(e)).sort();
  const removedDeprecated = removed.filter((e) => dep.has(e)).sort();
  return {
    surface,
    added,
    removedBreaking,
    removedDeprecated,
    clean: removedBreaking.length === 0,
  };
}

export interface ConservationReport {
  diffs: SurfaceDiff[];
  clean: boolean;
  /** Total breaking removals across all surfaces. */
  breakingCount: number;
}

/** Aggregate per-surface diffs into an overall verdict. */
export function aggregate(diffs: SurfaceDiff[]): ConservationReport {
  const breakingCount = diffs.reduce((n, d) => n + d.removedBreaking.length, 0);
  return { diffs, clean: breakingCount === 0, breakingCount };
}

/** Human-readable report (used by the CLI guard and CI logs). */
export function formatReport(report: ConservationReport): string {
  const lines: string[] = [];
  for (const d of report.diffs) {
    const status = d.clean ? '✓' : '✗ BREAKING';
    lines.push(`${status} ${d.surface}: +${d.added.length} added, -${d.removedBreaking.length} breaking, -${d.removedDeprecated.length} deprecated`);
    for (const r of d.removedBreaking) lines.push(`    REMOVED (breaking): ${r}`);
    for (const r of d.removedDeprecated) lines.push(`    removed (deprecated, ok): ${r}`);
  }
  lines.push('');
  lines.push(
    report.clean
      ? '✓ conservation guard: no breaking surface changes'
      : `✗ conservation guard: ${report.breakingCount} breaking surface change(s) — add to the deprecation registry (with a deprecation window) or restore them. To intentionally rebaseline: --update.`,
  );
  return lines.join('\n');
}
