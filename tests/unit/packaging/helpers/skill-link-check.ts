/**
 * Broken-reference checker for content `aqe init` installs (#1457).
 * Used by tests/unit/packaging/shipped-skill-links-1457.test.ts; see that file for
 * what it checks. Also runnable against a real install:
 *   npx tsx tests/unit/packaging/helpers/skill-link-check.ts <projectRoot> [tree...]
 * or against a plugin directory (plugin-only install, #1494):
 *   npx tsx tests/unit/packaging/helpers/skill-link-check.ts --no-project-paths <pluginDir> skills agents commands
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Package whose `files` list and tree back `node_modules/agentic-qe/...` paths. */
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const PKG_FILES = (JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')) as { files: string[] }).files;

/** Directories (relative to the project) whose files are checked: everything init writes for agents to read. */
export const INSTALLED_TREES = ['.claude/skills', '.claude/agents', '.claude/guidance', '.kiro', '.opencode', '.agents/skills'];
const TEXT = /\.(md|ya?ml|js|cjs|mjs|ts|json|sh)$/;
/** Files whose prose can carry Markdown links (OpenCode/Kiro configs embed prompts as yaml/json strings). */
const PROSE = /\.(md|ya?ml|json)$/;

/** Inline link or image: `[x](target)`, `[x](<target>)`, `[x](target "title")`. */
const MD_INLINE = /\]\(\s*(<[^>\n]*>|[^)\s]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*\)/g;
/** Reference definition: `[label]: target` / `[label]: <target> "title"`. */
const MD_REFDEF = /^\s{0,3}\[[^\]\n]+\]:\s*(<[^>\n]*>|\S+)/;
const LOCAL = /`((?:steps|schemas|scripts|templates|resources|references)\/[\w./-]+\.[a-z]+)`/g;
/** Project-relative paths into the trees `aqe init` writes. */
const PROJECT_PATH = /(?<![\w~/$.-])(?:\.claude\/(?:skills|agents|helpers|guidance)|\.kiro|\.opencode)\/[\w.-]+(?:\/[\w.-]+)*/g;
const SCRIPT = /(?<![\w./-])scripts\/[\w.-]+\.(?:js|cjs|mjs|ts|sh|py)(?!\w)/g;
const PKG_PATH = /node_modules\/agentic-qe\/([\w./-]+[\w])/g;
/** Files skills write at run time (their absence after install is expected). */
const RUNTIME_OUTPUT = /\/run-history\.json$/;

const clean = (ref: string): string => ref.split('#')[0].replace(/[.,:;]+$/, '');
const unwrap = (target: string): string => (target.startsWith('<') ? target.slice(1, -1).trim() : target);

export function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name !== 'node_modules') out.push(...walk(full));
    } else if (TEXT.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** Skill dir that owns `file`: `<...>/skills/<name>`, or the first directory below the tree root. */
function ownerDir(treeRoot: string, file: string): string | null {
  const parts = relative(treeRoot, file).split(sep);
  const at = parts.indexOf('skills');
  if (at >= 0 && parts.length > at + 2) return join(treeRoot, ...parts.slice(0, at + 2));
  return parts.length > 1 ? join(treeRoot, parts[0]) : null;
}

function coveredByFiles(path: string): boolean {
  return PKG_FILES.some((entry) => {
    if (entry === path) return true;
    if (entry.endsWith('/**')) return path.startsWith(entry.slice(0, -2));
    return !/[*?]/.test(entry) && path.startsWith(`${entry}/`);
  });
}

/** Undo the JSON string escapes that matter for paths: `\n`, `\"` and `\\`. */
function unescapeJsonString(raw: string): string {
  return raw.replace(/\\(["\\n])/g, (_, c: string) => (c === 'n' ? '\n' : c));
}

/**
 * CommonMark fenced code blocks: an opening fence is 3+ backticks or tildes (up to 3
 * spaces of indent; a backtick fence's info string may not contain a backtick). It
 * closes only on a line of the same character, at least as long, with nothing after it.
 */
export class FenceTracker {
  private open: { char: string; len: number } | null = null;

  /** Feed one line; returns true if the line is part of a code block (fences included). */
  step(line: string): boolean {
    if (this.open) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (close && close[1][0] === this.open.char && close[1].length >= this.open.len) this.open = null;
      return true;
    }
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (opening && !(opening[1][0] === '`' && opening[2].includes('`'))) {
      this.open = { char: opening[1][0], len: opening[1].length };
      return true;
    }
    return false;
  }
}

/**
 * Check one link target. URLs, in-page anchors and placeholder targets (`{x}`, `$X`,
 * `<skill>`-style names) are not paths. An absolute path never resolves inside a
 * user's project, so it is always reported.
 */
function checkLinkTarget(raw: string, file: string, at: string, broken: string[]): void {
  const target = unwrap(raw);
  const ref = clean(target);
  // A backslash never appears in these paths; it marks a regex or escape inside a quoted string.
  if (!ref || /^[a-z][\w+.-]*:/i.test(ref) || /[{}$<>\\]/.test(ref)) return;
  if (ref.startsWith('/')) {
    broken.push(`${at}: absolute link ${ref}`);
    return;
  }
  if (!existsSync(join(dirname(file), ref))) broken.push(`${at}: link ${ref}`);
}

/**
 * Inside a fenced code block Markdown does not parse link syntax (CommonMark), so
 * `[role="button"]:focus` in a CSS sample is not a link; link syntax is checked only
 * outside fences. Paths are checked everywhere: fenced commands and configs are what
 * the agent copies, so a dead path there is still a dead end.
 */
export interface CheckOptions {
  /**
   * Check `.claude/...`, `.kiro/...` and `.opencode/...` paths, and let `scripts/...`
   * resolve from `projectRoot`. Default true. Turn it off when `projectRoot` is not the
   * user's project, e.g. a Claude Code plugin's own directory (#1494).
   */
  projectPaths?: boolean;
}

export function findBrokenReferences(
  projectRoot: string,
  trees = INSTALLED_TREES,
  { projectPaths = true }: CheckOptions = {},
): string[] {
  const broken: string[] = [];
  for (const tree of trees) {
    const treeRoot = join(projectRoot, tree);
    for (const file of walk(treeRoot)) {
      const where = relative(projectRoot, file);
      const owner = ownerDir(treeRoot, file);
      const prose = PROSE.test(file);
      // JSON prompts escape newlines, quotes and backslashes; unescape them so the
      // prompt is checked line by line like any other file.
      const raw = readFileSync(file, 'utf8');
      const text = file.endsWith('.json') ? unescapeJsonString(raw) : raw;
      const fences = file.endsWith('.md') ? new FenceTracker() : null;
      text.split(/\r?\n/).forEach((line, i) => {
        const at = `${where}:${i + 1}`;
        const inCode = fences ? fences.step(line) : false;
        if (prose && !inCode) {
          for (const m of line.matchAll(MD_INLINE)) checkLinkTarget(m[1], file, at, broken);
          const def = MD_REFDEF.exec(line);
          if (def) checkLinkTarget(def[1], file, at, broken);
          for (const m of line.matchAll(LOCAL)) {
            const ref = clean(m[1]);
            if (!owner) continue;
            if (!existsSync(join(owner, ref)) && !existsSync(join(dirname(file), ref))) {
              broken.push(`${at}: path ${ref}`);
            }
          }
        }
        for (const m of projectPaths ? line.matchAll(PROJECT_PATH) : []) {
          const ref = clean(m[0]);
          // `qe-*.md`, `{name}/` and `<skill>/` are patterns, not paths.
          if (/^[*{<]/.test(line.slice(m.index! + m[0].length))) continue;
          // A run-history file appears at run time, but the skill dir it lives in must exist.
          const target = RUNTIME_OUTPUT.test(ref) ? dirname(ref) : ref;
          if (!existsSync(join(projectRoot, target))) broken.push(`${at}: path ${target}`);
        }
        for (const m of line.matchAll(SCRIPT)) {
          const ref = m[0];
          const ok = (owner && existsSync(join(owner, ref))) || existsSync(join(dirname(file), ref))
            || (projectPaths && existsSync(join(projectRoot, ref)));
          if (!ok) broken.push(`${at}: script ${ref}`);
        }
        for (const m of line.matchAll(PKG_PATH)) {
          const ref = m[1];
          if (!existsSync(join(PKG_ROOT, ref)) || !coveredByFiles(ref)) {
            broken.push(`${at}: package path ${ref}`);
          }
        }
      });
    }
  }
  return [...new Set(broken)];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const projectPaths = !args.includes('--no-project-paths');
  const [root, ...trees] = args.filter((a) => a !== '--no-project-paths');
  const broken = findBrokenReferences(resolve(root), trees.length ? trees : INSTALLED_TREES, { projectPaths });
  for (const b of broken) console.log(b);
  console.log(`${broken.length} broken reference(s)`);
  process.exitCode = broken.length ? 1 : 0;
}
