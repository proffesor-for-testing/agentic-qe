/**
 * Issue #1494: scripts/validate-skill.cjs ships in the npm package, but it looked for
 * skills under its own package root, so `node node_modules/agentic-qe/scripts/validate-skill.cjs
 * <name>` printed "Skill not found" for the user's `.claude/skills/<name>`.
 *
 * Installs the script the way npm does (node_modules/agentic-qe/scripts/ with its
 * validator-lib.cjs) into a scratch project and runs it as a user would.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '..', '..', '..');

function run(script: string, args: string[], cwd: string): { code: number | null; out: string } {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', timeout: 30_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

/** A skill with a validator that needs no external tools. */
function writeSkill(skillsDir: string, name: string): void {
  const dir = join(skillsDir, name);
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'schemas'), { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: test\n---\n`);
  writeFileSync(join(dir, 'schemas', 'output.json'), JSON.stringify({ type: 'object', required: ['skillName'] }));
  writeFileSync(
    join(dir, 'scripts', 'validate-config.json'),
    JSON.stringify({
      skillName: name,
      requiredTools: [],
      optionalTools: [],
      schemaPath: 'schemas/output.json',
      requiredFields: ['skillName', 'status'],
      mustContainTerms: ['coverage'],
      enumValidations: { '.status': ['success', 'failed'] },
    }),
  );
}

describe('validate-skill.cjs validates the user project skills (#1494)', () => {
  let root: string;
  let project: string;
  let script: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'aqe-validate-skill-1494-'));
    project = join(root, 'project');
    const pkgScripts = join(project, 'node_modules', 'agentic-qe', 'scripts');
    mkdirSync(pkgScripts, { recursive: true });
    for (const f of ['validate-skill.cjs', 'validator-lib.cjs']) {
      copyFileSync(join(REPO, 'scripts', f), join(pkgScripts, f));
    }
    copyFileSync(join(REPO, 'package.json'), join(project, 'node_modules', 'agentic-qe', 'package.json'));
    script = join(pkgScripts, 'validate-skill.cjs');
    writeSkill(join(project, '.claude', 'skills'), 'my-skill');
    writeFileSync(join(project, 'good.json'), JSON.stringify({ skillName: 'my-skill', status: 'success', note: 'coverage' }));
    writeFileSync(join(project, 'bad.json'), JSON.stringify({ skillName: 'my-skill', status: 'weird' }));
    writeSkill(join(root, 'elsewhere'), 'other-skill');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('finds the skill in the current project and passes its self-test', () => {
    const r = run('node_modules/agentic-qe/scripts/validate-skill.cjs', ['my-skill', '--self-test'], project);
    expect(r.out).not.toContain('Skill not found');
    expect(r.out).toContain('Self-test PASSED');
    expect(r.code).toBe(0);
  });

  it('validates an output file against the project skill, and fails a bad one', () => {
    expect(run(script, ['my-skill', 'good.json'], project).code).toBe(0);
    const bad = run(script, ['my-skill', 'bad.json'], project);
    expect(bad.code).not.toBe(0);
    expect(bad.out).toContain("Invalid value for .status: 'weird'");
    expect(bad.out).toContain('Output missing required terms: coverage');
  });

  it('lists the project skills', () => {
    const r = run(script, ['--list-skills'], project);
    expect(r.out).toContain(join(project, '.claude', 'skills'));
    expect(r.out).toContain('- my-skill');
  });

  it('takes --project, --skills-dir or a skill directory path', () => {
    expect(run(script, ['my-skill', '--self-test', '--project', project], root).code).toBe(0);
    expect(run(script, ['other-skill', '--self-test', '--skills-dir', join(root, 'elsewhere')], project).code).toBe(0);
    expect(run(script, ['../elsewhere/other-skill', '--self-test'], project).code).toBe(0);
  });

  it('says where it looked when the skill is missing', () => {
    const r = run(script, ['no-such-skill', '--self-test'], project);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`Skill not found: no-such-skill (looked in: ${join(project, '.claude', 'skills')}`);
    const explicit = run(script, ['other-skill', '--self-test', '--project', project], root);
    expect(explicit.code).toBe(1);
    expect(explicit.out).toContain(`(looked in: ${join(project, '.claude', 'skills')})`);
  });

  it('still validates the repo skills when run from the repo, or from another directory', () => {
    const inRepo = run(join(REPO, 'scripts', 'validate-skill.cjs'), ['--list-skills'], REPO);
    expect(inRepo.out).toContain('- api-testing-patterns');
    const fromElsewhere = run(join(REPO, 'scripts', 'validate-skill.cjs'), ['--list-skills'], root);
    expect(fromElsewhere.out).toContain(join(REPO, '.claude', 'skills'));
    expect(fromElsewhere.out).toContain('- api-testing-patterns');
  });
});
