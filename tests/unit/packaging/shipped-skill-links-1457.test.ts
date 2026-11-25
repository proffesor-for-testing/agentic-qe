/**
 * Issue #1457: skills, agents and OpenCode configs that `aqe init` installs must not
 * point at files that are not there.
 *
 * Installs the real packaged content (Claude Code skills and agents, Kiro, OpenCode,
 * Codex) into a scratch project, then checks every text
 * file it wrote for:
 * - relative markdown links (`[x](../other-skill/)`, `[x](steps/a.md)`);
 * - backticked skill-local paths (`steps/...`, `schemas/...`, `scripts/...`,
 *   `templates/...`, `resources/...`, `references/...`);
 * - `.claude/skills/<name>/...` paths, resolved from the project root;
 * - bare `scripts/<file>.<ext>` paths, which must resolve in the skill or the project;
 * - `node_modules/agentic-qe/<path>` paths, which must exist in this package and be
 *   covered by package.json `files`.
 *
 * There is no allowlist: a new broken link fails this test.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSkillsInstaller } from '../../../src/init/skills-installer.js';
import { createAgentsInstaller } from '../../../src/init/agents-installer.js';
import { createKiroInstaller } from '../../../src/init/kiro-installer.js';
import { createOpenCodeInstaller } from '../../../src/init/opencode-installer.js';
import { createCodexInstaller } from '../../../src/init/codex-installer.js';

const PKG_ROOT = process.cwd();
const PKG_FILES = (JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')) as { files: string[] }).files;

/** Directories (relative to the project) whose files are checked. */
const INSTALLED_TREES = ['.claude/skills', '.claude/agents', '.kiro/skills', '.opencode', '.agents/skills'];
const TEXT = /\.(md|ya?ml|js|cjs|mjs|ts|json|sh)$/;

const MD_LINK = /\]\(([^)\s]+)\)/g;
const LOCAL = /`((?:steps|schemas|scripts|templates|resources|references)\/[\w./-]+\.[a-z]+)`/g;
const CLAUDE_SKILL = /(?<![\w~/$.-])\.claude\/skills\/[\w.-]+(?:\/[\w.-]+)*/g;
const SCRIPT = /(?<![\w./-])scripts\/[\w.-]+\.(?:js|cjs|mjs|ts|sh|py)(?!\w)/g;
const PKG_PATH = /node_modules\/agentic-qe\/([\w./-]+[\w])/g;

const clean = (ref: string): string => ref.split('#')[0].replace(/[.,:;]+$/, '');

function walk(dir: string): string[] {
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

/** Skill (or agent) dir that owns `file`: the first directory below the tree root. */
function ownerDir(treeRoot: string, file: string): string | null {
  const parts = relative(treeRoot, file).split(sep);
  return parts.length > 1 ? join(treeRoot, parts[0]) : null;
}

function coveredByFiles(path: string): boolean {
  return PKG_FILES.some((entry) => {
    if (entry === path) return true;
    if (entry.endsWith('/**')) return path.startsWith(entry.slice(0, -2));
    return !/[*?]/.test(entry) && path.startsWith(`${entry}/`);
  });
}

function findBrokenReferences(projectRoot: string, trees = INSTALLED_TREES): string[] {
  const broken: string[] = [];
  for (const tree of trees) {
    const treeRoot = join(projectRoot, tree);
    for (const file of walk(treeRoot)) {
      const where = relative(projectRoot, file);
      const owner = ownerDir(treeRoot, file);
      const isMarkdown = file.endsWith('.md');
      readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
        const at = `${where}:${i + 1}`;
        if (isMarkdown) {
          for (const m of line.matchAll(MD_LINK)) {
            const ref = clean(m[1]);
            if (!ref || /^[a-z][\w+.-]*:/i.test(ref) || ref.startsWith('/') || /[{}$<>]/.test(ref)) continue;
            if (!existsSync(join(dirname(file), ref))) broken.push(`${at}: link ${ref}`);
          }
          for (const m of line.matchAll(LOCAL)) {
            const ref = clean(m[1]);
            if (!owner) continue;
            if (!existsSync(join(owner, ref)) && !existsSync(join(dirname(file), ref))) {
              broken.push(`${at}: path ${ref}`);
            }
          }
        }
        for (const m of line.matchAll(CLAUDE_SKILL)) {
          const ref = clean(m[0]);
          if (!existsSync(join(projectRoot, ref))) broken.push(`${at}: path ${ref}`);
        }
        for (const m of line.matchAll(SCRIPT)) {
          const ref = m[0];
          const ok = (owner && existsSync(join(owner, ref))) || existsSync(join(dirname(file), ref))
            || existsSync(join(projectRoot, ref));
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
  return broken;
}

describe('installed skills, agents and OpenCode configs have no broken references (#1457)', () => {
  let projectRoot: string;

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    projectRoot = mkdtempSync(join(tmpdir(), 'aqe-links-1457-'));
    writeFileSync(join(projectRoot, 'package.json'), '{"name":"fx"}\n');
    await createSkillsInstaller({ projectRoot, installV2Skills: true, installV3Skills: true }).install();
    await createAgentsInstaller({ projectRoot, installQEAgents: true, installSubagents: true }).install();
    await createKiroInstaller({ projectRoot, installHooks: false, installSteering: false }).install();
    await createOpenCodeInstaller({ projectRoot }).install();
    await createCodexInstaller({ projectRoot, includeRuflo: true }).install();
  }, 180_000);

  afterAll(() => {
    vi.restoreAllMocks();
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('installs the trees it checks', () => {
    for (const tree of ['.claude/skills', '.claude/agents', '.kiro/skills', '.opencode/skills', '.opencode/agent', '.agents/skills']) {
      expect(walk(join(projectRoot, tree)).length, tree).toBeGreaterThan(10);
    }
  });

  it('every relative link and path in installed content resolves', () => {
    expect(findBrokenReferences(projectRoot)).toEqual([]);
  });

  it('the checker reports each kind of broken reference', () => {
    const skill = join(projectRoot, '.claude', 'skills', 'qe-test-generation');
    const probe = join(skill, 'probe-1457.md');
    writeFileSync(
      probe,
      [
        '[gone](../continuous-testing-shift-left/)',
        'Read `steps/01a-url-fetch.md`.',
        'node .claude/skills/testability-scorer/scripts/x.js',
        'via scripts/fetch-content.js',
        'node node_modules/agentic-qe/scripts/does-not-exist.cjs',
        '[ok](../qe-test-execution/) [url](https://example.com/a.md) `node_modules/agentic-qe/schemas/finding-verdict.schema.json`',
      ].join('\n'),
    );
    try {
      const found = findBrokenReferences(projectRoot, ['.claude/skills']).filter((f) => f.includes('probe-1457'));
      expect(found).toEqual([
        '.claude/skills/qe-test-generation/probe-1457.md:1: link ../continuous-testing-shift-left/',
        '.claude/skills/qe-test-generation/probe-1457.md:2: path steps/01a-url-fetch.md',
        '.claude/skills/qe-test-generation/probe-1457.md:3: path .claude/skills/testability-scorer/scripts/x.js',
        '.claude/skills/qe-test-generation/probe-1457.md:4: script scripts/fetch-content.js',
        '.claude/skills/qe-test-generation/probe-1457.md:5: package path scripts/does-not-exist.cjs',
      ]);
    } finally {
      rmSync(probe, { force: true });
    }
  });
});
