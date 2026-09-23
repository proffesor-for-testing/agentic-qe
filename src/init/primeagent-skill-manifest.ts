/**
 * Skills and subagent roles shipped for repository-scoped Prime Agent installs.
 *
 * Mirrors codex-skill-manifest.ts: keep the list explicit so the public
 * package surface never depends on unrelated files in a development
 * checkout. Prime Agent discovers skills under `.prime/agent/skills/` and
 * `.agents/skills/` (Agent Skills standard); we install into the dedicated
 * `.prime/agent/skills/` tree so installs never collide with other harnesses.
 */

export interface PrimeAgentSkillManifestEntry {
  /** Directory name below the packaged `.agents/skills`. */
  readonly name: string;
  /** Install in every Prime Agent configuration. */
  readonly default: boolean;
  /** Optional file allowlist relative to the skill directory. */
  readonly files?: readonly string[];
}

export const PRIME_AGENT_SKILL_MANIFEST = [
  { name: 'aqe-plan-quality', default: true },
  { name: 'aqe-plan-work', default: true },
  { name: 'aqe-research', default: true },
  { name: 'aqe-review-quality', default: true },
  { name: 'aqe-test-change', default: true },
  { name: 'aqe-ruflo', default: false, files: ['SKILL.md'] },
] as const satisfies readonly PrimeAgentSkillManifestEntry[];

/**
 * Curated QE agent roles seeded into the `aqe-fleet` subagent skill.
 * Prime Agent has no file-based agents; each role is copied from
 * `.claude/agents/v3/` into `.prime/agent/skills/aqe-fleet/agents/` and the
 * generated SKILL.md explains how to spawn it as a subagent.
 */
export const PRIME_AGENT_SUBAGENT_ROLES = [
  'qe-test-architect',
  'qe-coverage-specialist',
  'qe-flaky-hunter',
  'qe-quality-gate',
  'qe-security-scanner',
  'qe-defect-predictor',
  'qe-root-cause-analyzer',
  'qe-impact-analyzer',
] as const;

export interface SelectPrimeAgentSkillsOptions {
  /** Include the Ruflo orchestration guidance without installing Ruflo itself. */
  includeRuflo?: boolean;
}

/** Return the deterministic install set for a Prime Agent project. */
export function selectPrimeAgentSkills(
  options: SelectPrimeAgentSkillsOptions = {},
): readonly PrimeAgentSkillManifestEntry[] {
  return PRIME_AGENT_SKILL_MANIFEST.filter(
    (skill) => skill.default || (skill.name === 'aqe-ruflo' && options.includeRuflo === true),
  );
}
