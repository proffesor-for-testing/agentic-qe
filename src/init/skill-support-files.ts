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
  /** Overwrite files that already exist in the target (default: false) */
  overwrite?: boolean;
  /** Applied to the text of every copied .md file (e.g. path rewriting) */
  transformMarkdown?: (content: string) => string;
}

export interface CopySkillSupportResult {
  copied: string[];
  skipped: string[];
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Copy every supporting file of a skill directory (everything except
 * SKIPPED_SKILL_ENTRIES and dotfiles) into targetDir, preserving layout.
 * Symlinks are never followed or copied, so nothing outside sourceDir can be
 * pulled in; every resolved source path is re-checked against sourceDir.
 */
export function copySkillSupportFiles(
  sourceDir: string,
  targetDir: string,
  options: CopySkillSupportOptions = {},
): CopySkillSupportResult {
  const result: CopySkillSupportResult = { copied: [], skipped: [] };
  if (!existsSync(sourceDir) || !lstatSync(sourceDir).isDirectory()) return result;
  const sourceRoot = realpathSync(sourceDir);

  const walk = (relDir: string): void => {
    for (const entry of readdirSync(join(sourceRoot, relDir))) {
      const relPath = relDir ? join(relDir, entry) : entry;
      if (entry.startsWith('.') || (!relDir && SKIPPED_SKILL_ENTRIES.has(entry))) {
        result.skipped.push(relPath);
        continue;
      }
      const from = join(sourceRoot, relPath);
      const stat = lstatSync(from);
      if (stat.isSymbolicLink() || !isInside(sourceRoot, realpathSync(from))) {
        result.skipped.push(relPath);
        continue;
      }
      const to = join(targetDir, relPath);
      if (stat.isDirectory()) {
        mkdirSync(to, { recursive: true });
        walk(relPath);
      } else if (stat.isFile()) {
        if (existsSync(to) && !options.overwrite) {
          result.skipped.push(relPath);
          continue;
        }
        if (options.transformMarkdown && entry.endsWith('.md')) {
          writeFileSync(to, options.transformMarkdown(readFileSync(from, 'utf-8')), { mode: stat.mode & 0o777 });
        } else {
          copyFileSync(from, to);
        }
        result.copied.push(relPath.split(sep).join('/'));
      } else {
        result.skipped.push(relPath);
      }
    }
  };

  mkdirSync(targetDir, { recursive: true });
  walk('');
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrite project-root paths into the skill's own Claude directory
 * (`.claude/skills/<source>/…`) to the converted location
 * (`<targetPrefix>/<target>/…`). Paths into skipped entries (evals/) are left
 * alone because they are not copied; references to other skills are untouched.
 */
export function rewriteOwnSkillPaths(
  content: string,
  sourceSkillName: string,
  targetSkillPrefix: string,
  targetSkillName: string,
): string {
  const pattern = new RegExp(
    `\\.claude/skills/${escapeRegExp(sourceSkillName)}/(?!evals(?:/|\\b))`,
    'g',
  );
  return content.replace(pattern, `${targetSkillPrefix}/${targetSkillName}/`);
}

/**
 * Rewrite relative links to sibling skills (`../<source>/…`) whose converted
 * location differs. `targets` maps a source skill name to the relative path
 * that replaces `../<source>`, e.g. `api-testing-patterns` →
 * `../qe-api-testing-patterns` (renamed), or `contract-testing` →
 * `../../../.claude/skills/contract-testing` (not converted; keep the link
 * pointing at the Claude copy instead of a directory that does not exist).
 */
export function rewriteSiblingSkillLinks(
  content: string,
  targets: ReadonlyMap<string, string>,
): string {
  if (targets.size === 0) return content;
  const names = [...targets.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const pattern = new RegExp(`(?<![\\w.-])\\.\\./(${names.join('|')})(?=[/)#\\s\`'"]|$)`, 'gm');
  return content.replace(pattern, (match, name: string) => targets.get(name) ?? match);
}
