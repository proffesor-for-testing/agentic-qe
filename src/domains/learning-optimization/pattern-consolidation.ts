/**
 * Agentic QE v3 - Building a consolidated pattern (#1106)
 *
 * Pure: no reads or writes. `LearningCoordinatorService.consolidatePatterns`
 * stores what this returns, and the consolidation protocol's dry run uses it
 * to predict the merged pattern, so a dry run selects the same trims as a
 * real run.
 */

import type { LearnedPattern, PatternContext } from './interfaces.js';
import { patternEvidenceOf, type PatternEvidence } from './reward-source.js';

/** Usage-weighted mean of one score (equal weights when nothing was used). */
function usageWeighted(patterns: readonly LearnedPattern[], score: (p: LearnedPattern) => number): number {
  const totalUsage = patterns.reduce((sum, p) => sum + p.usageCount, 0);
  return patterns.reduce(
    (sum, p) => sum + score(p) * (totalUsage > 0 ? p.usageCount / totalUsage : 1 / patterns.length),
    0
  );
}

/**
 * #1147: a merge keeps the most conservative evidence of its sources:
 * `assigned` if any source is, else `pre-1120` if any source is, else
 * `measured`. `pre-1120` has no tag of its own; the merge is left untagged,
 * which `patternEvidenceOf` reads as `pre-1120` (the kept template is a
 * source's, so it is not read as assigned unless a source was).
 */
function mergedEvidence(patterns: readonly LearnedPattern[]): PatternEvidence {
  const evidence = new Set(patterns.map(patternEvidenceOf));
  if (evidence.has('assigned')) return 'assigned';
  if (evidence.has('pre-1120')) return 'pre-1120';
  return 'measured';
}

/** Merge similar patterns: best template, combined contexts, weighted scores. */
export function buildConsolidatedPattern(
  patterns: readonly LearnedPattern[],
  id: string,
  now: Date = new Date()
): LearnedPattern {
  const bestPattern = patterns.reduce((best, current) =>
    current.successRate > best.successRate ? current : best
  );

  const mergedContext: PatternContext = {
    language: bestPattern.context.language,
    framework: bestPattern.context.framework,
    testType: bestPattern.context.testType,
    codeContext: bestPattern.context.codeContext,
    tags: [...new Set(patterns.flatMap((p) => p.context.tags))],
  };

  const evidence = mergedEvidence(patterns);
  return {
    id,
    type: bestPattern.type,
    domain: bestPattern.domain,
    name: `consolidated-${bestPattern.name}`,
    description: `Consolidated from ${patterns.length} patterns`,
    confidence: usageWeighted(patterns, (p) => p.confidence),
    usageCount: patterns.reduce((sum, p) => sum + p.usageCount, 0),
    successRate: usageWeighted(patterns, (p) => p.successRate),
    context: mergedContext,
    template: bestPattern.template,
    createdAt: now,
    lastUsedAt: now,
    ...(evidence === 'pre-1120' ? {} : { rewardSource: evidence }),
  };
}
