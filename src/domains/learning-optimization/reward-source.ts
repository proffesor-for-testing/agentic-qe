/**
 * Agentic QE v3 - Experience reward provenance (#1109)
 *
 * Some event handlers record an experience before any outcome has been
 * observed: a generated test, a defect prediction, an impact analysis or a
 * detected coverage gap is stored with a fixed `success: true` and a reward
 * the handler chose. Those experiences are kept, but they are tagged
 * `rewardSource: 'assigned'` and excluded from every reported success rate,
 * confidence, ranking, milestone, average reward and anomaly baseline.
 *
 * Reading rule for rows written before the tag existed:
 * - `rewardSource` present: it is authoritative.
 * - absent, and the row was written by one of the event handlers that always
 *   assigned its reward (matched on agent + action below): `assigned`.
 * - absent otherwise: `measured`. Every other writer derived success and
 *   reward from an observed outcome (test-run pass rate, quality-gate verdict,
 *   captured task quality).
 *
 * Patterns learned before the tag existed are read the same way: a pattern
 * whose template lists only actions from those handlers, in the handler's own
 * domain, was mined from assigned rewards (its 100% rate came from them).
 */

import type { Experience, LearnedPattern } from './interfaces.js';

export type RewardSource = 'measured' | 'assigned';

/** `agentId.value:action` pairs whose untagged rows carry an assigned reward. */
const LEGACY_ASSIGNED = new Set([
  'test-generation:test-generated',
  'coverage-analysis:gap-detection',
  'defect-intelligence:defect-prediction',
  'code-intelligence:impact-analysis',
]);

type ProvenanceFields = Pick<Experience, 'agentId' | 'action' | 'rewardSource'>;

export function rewardSourceOf(experience: ProvenanceFields): RewardSource {
  if (experience.rewardSource) return experience.rewardSource;
  return LEGACY_ASSIGNED.has(`${experience.agentId?.value}:${experience.action}`)
    ? 'assigned'
    : 'measured';
}

export function isMeasuredExperience(experience: ProvenanceFields): boolean {
  return rewardSourceOf(experience) === 'measured';
}

/** Split experiences into those with a measured outcome and a count of the rest. */
export function partitionByRewardSource<T extends ProvenanceFields>(
  experiences: readonly T[]
): { measured: T[]; assignedExcluded: number } {
  const measured = experiences.filter(isMeasuredExperience);
  return { measured, assignedExcluded: experiences.length - measured.length };
}

const COMMON_ACTIONS_LINE = /^\/\/ Common actions: (.*)$/m;

type PatternProvenanceFields = Pick<LearnedPattern, 'domain' | 'template' | 'rewardSource'>;

export function patternRewardSourceOf(pattern: PatternProvenanceFields): RewardSource {
  if (pattern.rewardSource) return pattern.rewardSource;
  const line = COMMON_ACTIONS_LINE.exec(pattern.template?.content ?? '');
  const actions = line ? line[1].split(',').map((a) => a.trim()).filter(Boolean) : [];
  const allAssigned = actions.length > 0
    && actions.every((action) => LEGACY_ASSIGNED.has(`${pattern.domain}:${action}`));
  return allAssigned ? 'assigned' : 'measured';
}

export function isMeasuredPattern(pattern: PatternProvenanceFields): boolean {
  return patternRewardSourceOf(pattern) === 'measured';
}
