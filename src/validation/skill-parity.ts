/**
 * Skill Tree Parity (ADR-113, P4)
 *
 * AQE skills are duplicated across trees (.claude/skills is canonical; assets/skills
 * is the npm-distributed mirror; plugins/ and .kiro/ are independent distributions
 * with their own frontmatter conventions). The mirror has silently drifted from
 * canonical before — this module detects that drift so CI can fail loud.
 *
 * Comparison is frontmatter-AGNOSTIC: only the markdown body (after the YAML block)
 * is compared, because legitimate per-tree frontmatter (allowed-tools, inclusion)
 * differs by design. Pure functions — fs walking lives in scripts/check-skill-parity.ts.
 */

export type ParityStatus = 'match' | 'drift' | 'absent';

export interface ParityEntry {
  skill: string;
  status: ParityStatus;
}

export interface ParityReport {
  /** Mirror tree compared against canonical, e.g. "assets/skills". */
  mirror: string;
  total: number;
  match: number;
  drift: number;
  absent: number;
  entries: ParityEntry[];
  /** True when no skill in the mirror has drifted (absent is allowed). */
  clean: boolean;
}

/**
 * Remove a leading YAML frontmatter block (between the first two `---` lines)
 * and normalize trailing whitespace. Body-only so frontmatter may differ per tree.
 */
export function stripFrontmatter(markdown: string): string {
  const lines = markdown.split('\n');
  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        return lines.slice(i + 1).join('\n').trim();
      }
    }
  }
  return markdown.trim();
}

/** True when two skill docs share the same body (ignoring frontmatter + edge whitespace). */
export function bodiesMatch(canonical: string, copy: string): boolean {
  return stripFrontmatter(canonical) === stripFrontmatter(copy);
}

/**
 * Build a parity report from already-read file contents.
 * `canonical` maps skill name → SKILL.md content (the source of truth).
 * `mirror` maps skill name → SKILL.md content (undefined when absent in the mirror).
 * Only skills present in canonical are evaluated.
 */
export function buildParityReport(
  mirror: string,
  canonical: Record<string, string>,
  mirrorContents: Record<string, string | undefined>,
): ParityReport {
  const entries: ParityEntry[] = [];
  for (const skill of Object.keys(canonical).sort()) {
    const copy = mirrorContents[skill];
    if (copy === undefined) {
      entries.push({ skill, status: 'absent' });
    } else if (bodiesMatch(canonical[skill], copy)) {
      entries.push({ skill, status: 'match' });
    } else {
      entries.push({ skill, status: 'drift' });
    }
  }
  const drift = entries.filter((e) => e.status === 'drift').length;
  return {
    mirror,
    total: entries.length,
    match: entries.filter((e) => e.status === 'match').length,
    drift,
    absent: entries.filter((e) => e.status === 'absent').length,
    entries,
    clean: drift === 0,
  };
}
