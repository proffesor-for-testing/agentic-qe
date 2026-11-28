/**
 * Issue #1494: `.opencode/skills/*.yaml` is generated from `.claude/skills` by
 * scripts/generate-opencode-skills.ts, and had drifted from it. The committed yaml must
 * equal the generator's output; regenerate with `npx tsx scripts/generate-opencode-skills.ts`.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildOpenCodeSkills,
  diffOpenCodeSkills,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_SKILLS_DIR,
} from '../../../scripts/generate-opencode-skills.js';

const scratchDirs: string[] = [];
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aqe-opencode-1494-'));
  scratchDirs.push(dir);
  return dir;
}

function writeSkill(skillsDir: string, dir: string, name = dir): void {
  mkdirSync(join(skillsDir, dir), { recursive: true });
  writeFileSync(
    join(skillsDir, dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${name} skill\ntrust_tier: 2\n---\n\n## Overview\n\nDoes ${name}.\n`,
  );
}

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('committed .opencode/skills matches the generator (#1494)', () => {
  it('has no missing, stale or drifted yaml', () => {
    const build = buildOpenCodeSkills(DEFAULT_SKILLS_DIR);
    expect(build.files.size).toBeGreaterThan(50);
    expect(diffOpenCodeSkills(build, DEFAULT_OUTPUT_DIR)).toEqual({ added: [], removed: [], changed: [] });
  });

  it('emits no Claude Flow platform skills', () => {
    const names = [...buildOpenCodeSkills(DEFAULT_SKILLS_DIR).files.keys()];
    const platform = /^qe-(v3-|flow-nexus-|agentdb-|reasoningbank-|swarm-|hive-mind-|hooks-)/;
    expect(names.filter((n) => platform.test(n))).toEqual([]);
  });

  it('reports a missing, a stale and a hand-edited yaml', () => {
    const build = buildOpenCodeSkills(DEFAULT_SKILLS_DIR);
    const out = scratch();
    for (const [file, yaml] of build.files) writeFileSync(join(out, file), yaml);
    const [first, second] = [...build.files.keys()].sort();
    rmSync(join(out, first));
    writeFileSync(join(out, second), `${readFileSync(join(out, second), 'utf8')}# hand edit\n`);
    writeFileSync(join(out, 'qe-removed-skill.yaml'), 'name: qe-removed-skill\n');

    expect(diffOpenCodeSkills(build, out)).toEqual({
      added: [first],
      removed: ['qe-removed-skill.yaml'],
      changed: [second],
    });
  });

  it('lets the dir already named like the output win a name clash, whatever the order', () => {
    const skills = scratch();
    writeSkill(skills, 'browser');
    writeSkill(skills, 'qe-browser');
    writeSkill(skills, 'iterative-loop');
    writeSkill(skills, 'qe-iterative-loop');
    const build = buildOpenCodeSkills(skills);

    expect([...build.files.keys()].sort()).toEqual(['qe-browser.yaml', 'qe-iterative-loop.yaml']);
    expect(build.files.get('qe-browser.yaml')).toContain('description: "qe-browser skill"');
    expect(build.files.get('qe-iterative-loop.yaml')).toContain('description: "qe-iterative-loop skill"');
  });

  it('fails on a clash neither dir owns', () => {
    const skills = scratch();
    writeSkill(skills, 'a-b');
    writeSkill(skills, 'a_b');
    expect(() => buildOpenCodeSkills(skills)).toThrow(/both map to qe-a-b\.yaml/);
  });
});
