/**
 * Skills shipped for repository-scoped Codex installs.
 *
 * Keep this list explicit: discovering skills by directory prefix makes the
 * public package surface depend on unrelated files in a development checkout.
 * Ruflo remains an opt-in, development-time integration and only its skill
 * instructions are packaged; no Ruflo runtime code or dependency is shipped.
 */

export interface CodexSkillManifestEntry {
  /** Directory name below `.agents/skills`. */
  readonly name: string;
  /** Install in every Codex configuration. */
  readonly default: boolean;
  /** Optional file allowlist relative to the skill directory. */
  readonly files?: readonly string[];
}

export const CODEX_SKILL_MANIFEST = [
  { name: 'aqe-plan-quality', default: true },
  { name: 'aqe-plan-work', default: true },
  { name: 'aqe-research', default: true },
  { name: 'aqe-review-quality', default: true },
  { name: 'aqe-test-change', default: true },
  { name: 'aqe-ruflo', default: false, files: ['SKILL.md'] },
] as const satisfies readonly CodexSkillManifestEntry[];

export interface SelectCodexSkillsOptions {
  /** Include the Ruflo orchestration guidance without installing Ruflo itself. */
  includeRuflo?: boolean;
}

/** Return the deterministic install set for a Codex project. */
export function selectCodexSkills(
  options: SelectCodexSkillsOptions = {},
): readonly CodexSkillManifestEntry[] {
  return CODEX_SKILL_MANIFEST.filter(
    (skill) => skill.default || (skill.name === 'aqe-ruflo' && options.includeRuflo === true),
  );
}
