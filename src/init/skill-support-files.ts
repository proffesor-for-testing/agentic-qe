/**
 * Skill supporting-file copier for platform installers that convert a Claude
 * Code skill (SKILL.md + sibling files) into another platform's layout.
 *
 * Skills such as the QCSD swarms keep their instructions in sibling files
 * (steps/, schemas/, scripts/, references/, ...) that SKILL.md points at.
 * Converting only SKILL.md leaves those references dangling (#1414).
 */

import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'fs';
import { join, relative, isAbsolute, sep } from 'path';

/**
 * Top-level skill entries that are never copied:
 * - SKILL.md: written by the platform converter itself.
 * - evals/: AQE's own skill-evaluation suites. They are read only by the
 *   Claude-side eval runner (src/validation/parallel-eval-runner.ts loads
 *   `<skills>/<name>/evals/<name>.yaml` from .claude/skills), target Claude
 *   models, and are referenced only from the Claude frontmatter
 *   (`validation.eval_path`), which the conversion replaces.
 */
export const SKIPPED_SKILL_ENTRIES: ReadonlySet<string> = new Set(['SKILL.md', 'evals']);

export interface CopySkillSupportOptions {
  /**
   * Overwrite files that already exist in the target (default: false).
   * Like SKILL.md, an upgrade/overwrite run replaces supporting files with the
   * packaged version; files removed from the package are never pruned.
   */
  overwrite?: boolean;
  /**
   * Applied to the text of every copied .md file (e.g. path rewriting).
   * `relPath` is the file's POSIX path relative to the skill dir.
   */
  transformMarkdown?: (content: string, relPath: string) => string;
}

export interface CopySkillSupportResult {
  copied: string[];
  skipped: string[];
  /** Entries that could not be read or written; copying continues past them. */
  failed: Array<{ path: string; error: string }>;
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

/**
 * Copy every supporting file of a skill directory (everything except
 * SKIPPED_SKILL_ENTRIES and dotfiles) into targetDir, preserving layout.
 * Symlinks are never followed or copied, so nothing outside sourceDir can be
 * pulled in; every resolved source path is re-checked against sourceDir.
 * A file that cannot be copied (unreadable source, a directory in the way at
 * the target, ...) is recorded in `failed` and the rest are still copied.
 */
export function copySkillSupportFiles(
  sourceDir: string,
  targetDir: string,
  options: CopySkillSupportOptions = {},
): CopySkillSupportResult {
  const result: CopySkillSupportResult = { copied: [], skipped: [], failed: [] };
  if (!existsSync(sourceDir) || !lstatSync(sourceDir).isDirectory()) return result;
  const sourceRoot = realpathSync(sourceDir);
  const fail = (relPath: string, error: unknown): void => {
    result.failed.push({
      path: toPosix(relPath),
      error: error instanceof Error ? error.message : String(error),
    });
  };

  const copyEntry = (relDir: string, entry: string): void => {
    const relPath = relDir ? join(relDir, entry) : entry;
    if (entry.startsWith('.') || (!relDir && SKIPPED_SKILL_ENTRIES.has(entry))) {
      result.skipped.push(toPosix(relPath));
      return;
    }
    const from = join(sourceRoot, relPath);
    const stat = lstatSync(from);
    if (stat.isSymbolicLink() || !isInside(sourceRoot, realpathSync(from))) {
      result.skipped.push(toPosix(relPath));
      return;
    }
    const to = join(targetDir, relPath);
    if (stat.isDirectory()) {
      mkdirSync(to, { recursive: true });
      walk(relPath);
    } else if (stat.isFile()) {
      if (existsSync(to) && !options.overwrite) {
        result.skipped.push(toPosix(relPath));
        return;
      }
      if (options.transformMarkdown && entry.endsWith('.md')) {
        const text = options.transformMarkdown(readFileSync(from, 'utf-8'), toPosix(relPath));
        writeFileSync(to, text, { mode: stat.mode & 0o777 });
      } else {
        copyFileSync(from, to);
      }
      result.copied.push(toPosix(relPath));
    } else {
      result.skipped.push(toPosix(relPath));
    }
  };

  const walk = (relDir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(join(sourceRoot, relDir));
    } catch (error) {
      fail(relDir || '.', error);
      return;
    }
    for (const entry of entries) {
      try {
        copyEntry(relDir, entry);
      } catch (error) {
        fail(relDir ? join(relDir, entry) : entry, error);
      }
    }
  };

  try {
    mkdirSync(targetDir, { recursive: true });
  } catch (error) {
    fail('.', error);
    return result;
  }
  walk('');
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrite project-root paths into the skill's own Claude directory
 * (`.claude/skills/<source>/…`) to the converted location
 * (`<targetPrefix>/<target>/…`). Only project-relative paths match: the
 * `.claude` segment must not follow a path, home (`~/`) or URL character.
 * Paths into skipped entries (evals/) are left alone because they are not
 * copied; references to other skills are untouched.
 */
export function rewriteOwnSkillPaths(
  content: string,
  sourceSkillName: string,
  targetSkillPrefix: string,
  targetSkillName: string,
): string {
  const pattern = new RegExp(
    `(?<![\\w./~:-])\\.claude/skills/${escapeRegExp(sourceSkillName)}/(?!evals(?![\\w.-]))`,
    'g',
  );
  return content.replace(pattern, `${targetSkillPrefix}/${targetSkillName}/`);
}

/**
 * Rewrite markdown links to sibling skills whose converted location differs.
 *
 * `targets` maps a source skill name to its new location relative to the
 * converted skills root, e.g. `api-testing-patterns` → `qe-api-testing-patterns`
 * (renamed) or `contract-testing` → `../../.claude/skills/contract-testing`
 * (not converted; keep pointing at the Claude copy rather than a missing dir).
 *
 * Only markdown link targets (`](…)`) are touched, and only when they climb
 * exactly to the skills root from `relPath` (SKILL.md: `../<skill>`,
 * steps/x.md: `../../<skill>`). Prose, code spans, URLs and skill-local
 * `../<dir>` links in nested files are left as written.
 */
export function rewriteSiblingSkillLinks(
  content: string,
  targets: ReadonlyMap<string, string>,
  relPath = 'SKILL.md',
): string {
  if (targets.size === 0) return content;
  const up = '../'.repeat(relPath.split('/').length);
  const names = [...targets.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const pattern = new RegExp(
    `\\]\\(${escapeRegExp(up)}(${names.join('|')})(?=[/)#\\s]|$)`,
    'gm',
  );
  return content.replace(pattern, (match, name: string) => {
    const target = targets.get(name);
    return target === undefined ? match : `](${up}${target}`;
  });
}
