import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CODEX_SKILL_MANIFEST,
  selectCodexSkills,
} from '../../../src/init/codex-skill-manifest.js';

describe('Codex skill manifest', () => {
  it('should select the complete curated AQE workflow by default', () => {
    expect(selectCodexSkills().map((skill) => skill.name)).toEqual([
      'aqe-plan-quality',
      'aqe-plan-work',
      'aqe-research',
      'aqe-review-quality',
      'aqe-test-change',
    ]);
  });

  it('should include only Ruflo guidance when explicitly enabled', () => {
    const selected = selectCodexSkills({ includeRuflo: true });
    const ruflo = selected.find((skill) => skill.name === 'aqe-ruflo');

    expect(ruflo).toEqual({
      name: 'aqe-ruflo',
      default: false,
      files: ['SKILL.md'],
    });
  });

  it('should keep names unique and every optional skill file-scoped', () => {
    const names = CODEX_SKILL_MANIFEST.map((skill) => skill.name);
    const optional = CODEX_SKILL_MANIFEST.filter((skill) => !skill.default);

    expect(new Set(names).size).toBe(names.length);
    expect(optional.every((skill) => 'files' in skill && skill.files.length > 0)).toBe(true);
  });

  it('should package every manifest skill without packaging the Ruflo runtime tree', () => {
    const projectRoot = join(import.meta.dirname, '..', '..', '..');
    const packageJson = JSON.parse(
      readFileSync(join(projectRoot, 'package.json'), 'utf8'),
    ) as { files: string[]; dependencies: Record<string, string> };

    for (const skill of CODEX_SKILL_MANIFEST) {
      const source = join(projectRoot, '.agents', 'skills', skill.name, 'SKILL.md');
      expect(existsSync(source), `${skill.name} must contain SKILL.md`).toBe(true);

      const packagedPath = skill.files
        ? `.agents/skills/${skill.name}/SKILL.md`
        : `.agents/skills/${skill.name}`;
      expect(packageJson.files).toContain(packagedPath);
    }

    expect(packageJson.files).not.toContain('.agents/skills/ruflo');
    expect(packageJson.dependencies).not.toHaveProperty('ruflo');
    expect(packageJson.dependencies).not.toHaveProperty('claude-flow');
    expect(packageJson.dependencies).not.toHaveProperty('@claude-flow/cli');
  });
});
