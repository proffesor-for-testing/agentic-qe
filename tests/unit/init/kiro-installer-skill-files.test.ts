/**
 * Test: KiroInstaller skill supporting files (#1414)
 *
 * `aqe init --with-kiro` converts each Claude skill to .kiro/skills/<name>/SKILL.md.
 * Skills keep instructions in sibling files (steps/, schemas/, scripts/, ...);
 * the converted skill must ship them so no reference dangles.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative } from 'path';
import { createSkillsInstaller } from '../../../src/init/skills-installer.js';
import { KiroInstaller } from '../../../src/init/kiro-installer.js';
import {
  rewriteOwnSkillPaths,
  rewriteSiblingSkillLinks,
} from '../../../src/init/skill-support-files.js';

const IS_WIN = process.platform === 'win32';
const IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;

function listMarkdown(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listMarkdown(full));
    else if (entry.endsWith('.md')) out.push(full);
  }
  return out;
}

/** Same lookup the installer uses: <name>, then <name> without the qe- prefix. */
function claudeSourceFor(claudeSkillsDir: string, kiroName: string): string | null {
  for (const name of [kiroName, kiroName.replace(/^qe-/, '')]) {
    if (existsSync(join(claudeSkillsDir, name, 'SKILL.md'))) return name;
  }
  return null;
}

const MD_LINK = /\]\(([^)\s]+)\)/g;
const PATH_TOKEN = /(?<![\w./-])((?:\.\.?\/)?[\w.-]+(?:\/[\w.-]+)+\/?)/g;

function clean(ref: string): string {
  return ref.split('#')[0].replace(/[.,:;]+$/, '');
}

interface RefCheck {
  checked: number;
  violations: string[];
  brokenInSource: string[];
}

/**
 * Check every relative path a generated Kiro skill references:
 * - markdown link targets must resolve from the referencing file (unless the
 *   link is already broken in the Claude source skill);
 * - `.kiro/skills/...` paths must resolve from the project root;
 * - no path may still point into the skill's own `.claude/skills/<source>/` dir;
 * - any path that resolves inside the Claude source skill must resolve in Kiro.
 */
function checkSkillReferences(projectRoot: string): RefCheck {
  const kiroSkillsDir = join(projectRoot, '.kiro', 'skills');
  const claudeSkillsDir = join(projectRoot, '.claude', 'skills');
  const result: RefCheck = { checked: 0, violations: [], brokenInSource: [] };

  for (const kiroName of readdirSync(kiroSkillsDir)) {
    const kiroDir = join(kiroSkillsDir, kiroName);
    const sourceName = claudeSourceFor(claudeSkillsDir, kiroName);
    if (!sourceName) continue;
    const sourceDir = join(claudeSkillsDir, sourceName);

    for (const file of listMarkdown(kiroDir)) {
      const text = readFileSync(file, 'utf-8');
      const where = relative(kiroSkillsDir, file);
      const relFromSkill = relative(kiroDir, dirname(file));

      for (const m of text.matchAll(MD_LINK)) {
        const ref = clean(m[1]);
        if (!ref || /^[a-z]+:/i.test(ref) || ref.startsWith('/')) continue;
        result.checked++;
        if (existsSync(join(dirname(file), ref))) continue;
        // A link already broken in the Claude source is an upstream content bug,
        // not a conversion gap; record it separately.
        if (existsSync(join(sourceDir, relFromSkill, ref))) {
          result.violations.push(`${where}: link target ${ref} missing`);
        } else {
          result.brokenInSource.push(`${where}: ${ref}`);
        }
      }

      for (const m of text.matchAll(PATH_TOKEN)) {
        const ref = clean(m[1]);
        if (ref.startsWith(`.claude/skills/${sourceName}/`)) {
          result.checked++;
          result.violations.push(`${where}: ${ref} still points at the Claude skill dir`);
        } else if (ref.startsWith('.kiro/skills/')) {
          result.checked++;
          if (!existsSync(join(projectRoot, ref))) {
            result.violations.push(`${where}: ${ref} missing`);
          }
        } else if (!ref.startsWith('.claude/') && existsSync(join(sourceDir, relFromSkill, ref))) {
          result.checked++;
          if (!existsSync(join(dirname(file), ref))) {
            result.violations.push(`${where}: ${ref} exists in the Claude skill but not in Kiro`);
          }
        }
      }
    }
  }
  return result;
}

function quietConsole(): void {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
}

function kiroSkillsOnly(projectRoot: string, overwrite = false): KiroInstaller {
  return new KiroInstaller({
    projectRoot,
    installAgents: false,
    installHooks: false,
    installSteering: false,
    overwrite,
  });
}

describe('KiroInstaller skill supporting files (#1414)', () => {
  describe('real packaged skills', () => {
    let projectRoot: string;

    beforeAll(async () => {
      quietConsole();
      projectRoot = mkdtempSync(join(tmpdir(), 'aqe-kiro-1414-'));
      writeFileSync(join(projectRoot, 'package.json'), '{"name":"fx"}\n');
      await createSkillsInstaller({ projectRoot }).install();
      const result = await kiroSkillsOnly(projectRoot).install();
      expect(result.errors).toEqual([]);
      expect(result.skillsInstalled.length).toBeGreaterThan(50);
    }, 120_000);

    afterAll(() => {
      vi.restoreAllMocks();
      rmSync(projectRoot, { recursive: true, force: true });
    });

    it('ships the QCSD step files next to the converted SKILL.md', () => {
      const skillDir = join(projectRoot, '.kiro', 'skills', 'qcsd-cicd-swarm');
      const skillMd = readFileSync(join(skillDir, 'SKILL.md'), 'utf-8');
      const stepRefs = [...skillMd.matchAll(/`(steps\/[\w.-]+\.md)`/g)].map((m) => m[1]);

      expect(stepRefs.length).toBeGreaterThanOrEqual(9);
      for (const ref of stepRefs) {
        expect(existsSync(join(skillDir, ref)), ref).toBe(true);
      }
      expect(existsSync(join(skillDir, 'schemas', 'output.json'))).toBe(true);
      expect(existsSync(join(skillDir, 'scripts', 'validate-config.json'))).toBe(true);
    });

    it('rewrites the skill-own .claude/skills path to the Kiro location', () => {
      const skillMd = readFileSync(
        join(projectRoot, '.kiro', 'skills', 'qcsd-cicd-swarm', 'SKILL.md'),
        'utf-8',
      );
      expect(skillMd).toContain('.kiro/skills/qcsd-cicd-swarm/steps/01-flag-detection.md');
      expect(skillMd).not.toContain('.claude/skills/qcsd-cicd-swarm/');
    });

    it('does not ship an evals/ directory for any skill', () => {
      const kiroSkillsDir = join(projectRoot, '.kiro', 'skills');
      for (const name of readdirSync(kiroSkillsDir)) {
        expect(existsSync(join(kiroSkillsDir, name, 'evals')), name).toBe(false);
      }
    });

    it('every relative path referenced by every generated Kiro skill exists', () => {
      const { checked, violations } = checkSkillReferences(projectRoot);
      expect(checked).toBeGreaterThan(50);
      expect(violations).toEqual([]);
    });
  });

  describe('copy safety and re-init', () => {
    let root: string;
    let projectRoot: string;

    beforeEach(() => {
      quietConsole();
      root = mkdtempSync(join(tmpdir(), 'aqe-kiro-1414-safety-'));
      projectRoot = join(root, 'project');
      const src = join(projectRoot, '.claude', 'skills', 'qcsd-cicd-swarm');
      mkdirSync(join(src, 'steps'), { recursive: true });
      mkdirSync(join(src, 'evals'), { recursive: true });
      writeFileSync(join(root, 'outside-secret.txt'), 'secret\n');
      writeFileSync(
        join(src, 'SKILL.md'),
        '---\nname: qcsd-cicd-swarm\ndescription: "x"\n---\nRead `steps/01-a.md`.\r\n',
      );
      writeFileSync(join(src, 'steps', '01-a.md'), 'Step one\r\nsee `.claude/skills/qcsd-cicd-swarm/steps/01-a.md`\r\n');
      writeFileSync(join(src, 'steps', '02-b.md'), 'Step two\n');
      writeFileSync(join(src, 'evals', 'qcsd-cicd-swarm.yaml'), 'skill: x\n');
    });

    afterEach(() => {
      vi.restoreAllMocks();
      rmSync(root, { recursive: true, force: true });
    });

    it.skipIf(IS_WIN)('skips symlinks and evals/, keeps CRLF, rewrites own paths in copied markdown', async () => {
      const src = join(projectRoot, '.claude', 'skills', 'qcsd-cicd-swarm');
      symlinkSync(join(root, 'outside-secret.txt'), join(src, 'steps', 'leak.md'));
      symlinkSync(root, join(src, 'outside-dir'));

      await kiroSkillsOnly(projectRoot).install();
      const kiroDir = join(projectRoot, '.kiro', 'skills', 'qcsd-cicd-swarm');

      expect(readFileSync(join(kiroDir, 'steps', '01-a.md'), 'utf-8')).toBe(
        'Step one\r\nsee `.kiro/skills/qcsd-cicd-swarm/steps/01-a.md`\r\n',
      );
      expect(existsSync(join(kiroDir, 'steps', 'leak.md'))).toBe(false);
      expect(existsSync(join(kiroDir, 'outside-dir'))).toBe(false);
      expect(existsSync(join(kiroDir, 'evals'))).toBe(false);
    });

    it('fills in missing supporting files on re-init without touching an existing SKILL.md', async () => {
      const kiroDir = join(projectRoot, '.kiro', 'skills', 'qcsd-cicd-swarm');
      mkdirSync(kiroDir, { recursive: true });
      writeFileSync(join(kiroDir, 'SKILL.md'), 'user-edited\n');

      const result = await kiroSkillsOnly(projectRoot).install();

      expect(result.skillsInstalled).not.toContain('qcsd-cicd-swarm');
      expect(readFileSync(join(kiroDir, 'SKILL.md'), 'utf-8')).toBe('user-edited\n');
      expect(existsSync(join(kiroDir, 'steps', '01-a.md'))).toBe(true);
    });

    it.skipIf(IS_WIN || IS_ROOT)('keeps copying past an unreadable file and names it in errors', async () => {
      const unreadable = join(projectRoot, '.claude', 'skills', 'qcsd-cicd-swarm', 'steps', '01-a.md');
      chmodSync(unreadable, 0o000);
      try {
        const result = await kiroSkillsOnly(projectRoot).install();
        const kiroDir = join(projectRoot, '.kiro', 'skills', 'qcsd-cicd-swarm');

        expect(result.skillsInstalled).toContain('qcsd-cicd-swarm');
        expect(existsSync(join(kiroDir, 'SKILL.md'))).toBe(true);
        expect(existsSync(join(kiroDir, 'steps', '02-b.md'))).toBe(true);
        const skillErrors = result.errors.filter((e) => e.includes('qcsd-cicd-swarm'));
        expect(skillErrors).toHaveLength(1);
        expect(skillErrors[0]).toContain('failed to copy supporting files: steps/01-a.md');
        expect(skillErrors[0]).not.toContain('Failed to convert skill');
      } finally {
        chmodSync(unreadable, 0o644);
      }
    });

    it('on overwrite, a directory in the way of one file does not stop the others', async () => {
      const kiroDir = join(projectRoot, '.kiro', 'skills', 'qcsd-cicd-swarm');
      mkdirSync(join(kiroDir, 'steps', '01-a.md'), { recursive: true });

      const result = await kiroSkillsOnly(projectRoot, true).install();

      expect(result.skillsInstalled).toContain('qcsd-cicd-swarm');
      expect(readFileSync(join(kiroDir, 'steps', '02-b.md'), 'utf-8')).toBe('Step two\n');
      const skillErrors = result.errors.filter((e) => e.includes('qcsd-cicd-swarm'));
      expect(skillErrors).toHaveLength(1);
      expect(skillErrors[0]).toContain('steps/01-a.md');
    });

    it('on overwrite (--upgrade), replaces supporting files and never prunes extra ones', async () => {
      const kiroDir = join(projectRoot, '.kiro', 'skills', 'qcsd-cicd-swarm');
      mkdirSync(join(kiroDir, 'steps'), { recursive: true });
      writeFileSync(join(kiroDir, 'steps', '02-b.md'), 'stale\n');
      writeFileSync(join(kiroDir, 'steps', '99-removed.md'), 'left over\n');

      await kiroSkillsOnly(projectRoot, true).install();

      expect(readFileSync(join(kiroDir, 'steps', '02-b.md'), 'utf-8')).toBe('Step two\n');
      expect(readFileSync(join(kiroDir, 'steps', '99-removed.md'), 'utf-8')).toBe('left over\n');
    });
  });
});

describe('Kiro skill reference rewriting (#1414)', () => {
  describe('rewriteOwnSkillPaths', () => {
    const rewrite = (s: string): string =>
      rewriteOwnSkillPaths(s, 'foo', '.kiro/skills', 'qe-foo');

    it('rewrites project-relative paths into the skill dir', () => {
      expect(rewrite('Read `.claude/skills/foo/steps/x.md`')).toBe('Read `.kiro/skills/qe-foo/steps/x.md`');
      expect(rewrite('file_path: ".claude/skills/foo/a.md"')).toBe('file_path: ".kiro/skills/qe-foo/a.md"');
      expect(rewrite('at .claude/skills/foo/x\n')).toBe('at .kiro/skills/qe-foo/x\n');
    });

    it('leaves home, absolute, nested and URL paths alone', () => {
      for (const probe of [
        '~/.claude/skills/foo/steps/x',
        'https://h/.claude/skills/foo/x',
        '/abs/.claude/skills/foo/x',
        'pkg/.claude/skills/foo/x',
        '$HOME-.claude/skills/foo/x',
      ]) {
        expect(rewrite(probe), probe).toBe(probe);
      }
    });

    it('skips evals/ but not lookalike directories', () => {
      expect(rewrite('.claude/skills/foo/evals/foo.yaml')).toBe('.claude/skills/foo/evals/foo.yaml');
      expect(rewrite('`.claude/skills/foo/evals`')).toBe('`.claude/skills/foo/evals`');
      expect(rewrite('.claude/skills/foo/evals-extra/x')).toBe('.kiro/skills/qe-foo/evals-extra/x');
    });

    it('does not touch other skills with a shared prefix', () => {
      expect(rewrite('.claude/skills/foobar/x')).toBe('.claude/skills/foobar/x');
    });
  });

  describe('rewriteSiblingSkillLinks', () => {
    const targets = new Map([
      ['api-testing-patterns', 'qe-api-testing-patterns'],
      ['contract-testing', '../../.claude/skills/contract-testing'],
      ['release', 'qe-release'],
    ]);

    it('rewrites SKILL.md-level markdown links to renamed or unconverted siblings', () => {
      expect(rewriteSiblingSkillLinks('[a](../api-testing-patterns/)', targets, 'SKILL.md')).toBe(
        '[a](../qe-api-testing-patterns/)',
      );
      expect(rewriteSiblingSkillLinks('[c](../contract-testing/SKILL.md)', targets, 'SKILL.md')).toBe(
        '[c](../../../.claude/skills/contract-testing/SKILL.md)',
      );
      expect(rewriteSiblingSkillLinks('[r](../release)', targets, 'SKILL.md')).toBe('[r](../qe-release)');
    });

    it('computes the climb from the file depth', () => {
      expect(rewriteSiblingSkillLinks('[c](../../contract-testing/)', targets, 'resources/x.md')).toBe(
        '[c](../../../../.claude/skills/contract-testing/)',
      );
      expect(rewriteSiblingSkillLinks('[a](../../api-testing-patterns/)', targets, 'steps/01.md')).toBe(
        '[a](../../qe-api-testing-patterns/)',
      );
    });

    it('leaves skill-local, prose, code and URL occurrences alone', () => {
      for (const [probe, relPath] of [
        ['[local](../contract-testing/)', 'resources/x.md'],
        ['`cd ../release && npm test`', 'SKILL.md'],
        ['see ../api-testing-patterns/ for more', 'SKILL.md'],
        ['[u](https://example.com/a/../api-testing-patterns/x)', 'SKILL.md'],
        ['[x](../api-testing-patterns-extra/)', 'SKILL.md'],
        ['[y](./../api-testing-patterns/)', 'SKILL.md'],
      ] as const) {
        expect(rewriteSiblingSkillLinks(probe, targets, relPath), probe).toBe(probe);
      }
    });
  });
});
