/**
 * Owned-section merge helpers for AGENTS.md behavioral guidance.
 *
 * AQE owns exactly one marked section of a project's AGENTS.md per platform.
 * Sentinels let a re-install replace previous AQE guidance without touching
 * user-written content, and let `--codex-guidance none` remove it cleanly.
 *
 * Extracted from CodexInstaller (ADR-025) so the Prime Agent installer shares
 * the same merge semantics instead of duplicating them.
 */

export interface OwnedSectionOptions {
  /** Sentinel id, e.g. `CODEX` produces `<!-- BEGIN AGENTIC-QE CODEX -->`. */
  readonly id: string;
}

export function ownedSectionStart(id: string): string {
  return `<!-- BEGIN AGENTIC-QE ${id} -->`;
}

export function ownedSectionEnd(id: string): string {
  return `<!-- END AGENTIC-QE ${id} -->`;
}

/** Assert the file's AQE sentinels are balanced; throws (preserving the file) if not. */
export function assertOwnedSectionsWellFormed(content: string, id: string, label = id): void {
  const starts = content.match(new RegExp(escaped(ownedSectionStart(id)), 'g'))?.length ?? 0;
  const ends = content.match(new RegExp(escaped(ownedSectionEnd(id)), 'g'))?.length ?? 0;
  const complete = content.match(ownedSectionPattern(id))?.length ?? 0;
  if (starts !== ends || complete !== starts) {
    throw new Error(`Malformed Agentic QE ${label} sentinel in AGENTS.md; file was preserved`);
  }
}

/** Mark content as the owned AQE section, normalizing line endings. */
export function markOwnedSection(content: string, id: string, eol = '\n'): string {
  const normalized = content.trim().replace(/\r?\n/g, eol);
  return `${ownedSectionStart(id)}${eol}${normalized}${eol}${ownedSectionEnd(id)}${eol}`;
}

/** Merge new content into an existing AGENTS.md: replace the owned section or append. */
export function mergeOwnedSection(existing: string, newContent: string, id: string, label = id): string {
  assertOwnedSectionsWellFormed(existing, id, label);
  const eol = existing.includes('\r\n') ? '\r\n' : '\n';
  const marked = markOwnedSection(newContent, id, eol);
  let replaced = false;
  const merged = existing.replace(ownedSectionPattern(id), () => {
    if (replaced) return '';
    replaced = true;
    return marked;
  });
  if (replaced) return merged;
  if (existing.length === 0) return marked;
  return existing.trimEnd() + `${eol}${eol}---${eol}${eol}` + marked;
}

/** Remove the owned AQE section (for `--guidance none` policy). */
export function removeOwnedSections(existing: string, id: string, label = id): string {
  assertOwnedSectionsWellFormed(existing, id, label);
  return existing.replace(ownedSectionPattern(id), '');
}

/** Byte length of the owned AQE section, 0 when absent. */
export function measureOwnedSection(content: string, id: string, label = id): number {
  assertOwnedSectionsWellFormed(content, id, label);
  const match = content.match(ownedSectionPattern(id));
  return match ? Buffer.byteLength(match[0]) : 0;
}

function ownedSectionPattern(id: string): RegExp {
  return new RegExp(
    `${escaped(ownedSectionStart(id))}[\\s\\S]*?${escaped(ownedSectionEnd(id))}(?:\r?\n)?`,
    'g',
  );
}

function escaped(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
