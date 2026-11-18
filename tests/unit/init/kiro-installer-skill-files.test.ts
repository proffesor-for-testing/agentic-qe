/**
 * Test: KiroInstaller skill supporting files (#1414)
 *
 * `aqe init --with-kiro` converts each Claude skill to .kiro/skills/<name>/SKILL.md.
 * Skills keep instructions in sibling files (steps/, schemas/, scripts/, ...);
 * the converted skill must ship them so no reference dangles.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
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

    it('does not ship evals/ and no generated skill references it', () => {
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
      writeFileSync(join(src, 'evals', 'qcsd-cicd-swarm.yaml'), 'skill: x\n');
      symlinkSync(join(root, 'outside-secret.txt'), join(src, 'steps', 'leak.md'));
      symlinkSync(root, join(src, 'outside-dir'));
    });

    afterEach(() => {
      vi.restoreAllMocks();
      rmSync(root, { recursive: true, force: true });
    });

    it('skips symlinks and evals/, keeps CRLF, rewrites own paths in copied markdown', async () => {
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
  });
});
