import { mkdtempSync, writeFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { countTests } from '../../../../src/domains/code-intelligence/services/metric-collector/test-counter.js';

const projects: string[] = [];

afterEach(() => {
  for (const project of projects.splice(0)) rmSync(project, { recursive: true, force: true });
});

describe('Vitest test counting', () => {
  it('counts discovered tests from the real JSON list without executing them', async () => {
    const project = mkdtempSync(join(tmpdir(), 'aqe-vitest-count-'));
    projects.push(project);
    const marker = join(project, 'test-executed');
    writeFileSync(join(project, 'package.json'), JSON.stringify({
      name: 'aqe-vitest-count-fixture', private: true, type: 'module',
      devDependencies: { vitest: '*' },
    }));
    symlinkSync(join(process.cwd(), 'node_modules'), join(project, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir');
    writeFileSync(join(project, 'sample.test.ts'), [
      "import { it } from 'vitest';",
      "import { writeFileSync } from 'node:fs';",
      'it(`first',
      ' > continuation`, () => {',
      `  writeFileSync(${JSON.stringify(marker)}, 'ran');`,
      '});',
      "it('second', () => {});",
    ].join('\n'));

    const metrics = await countTests(project);

    expect(metrics).toMatchObject({ source: 'vitest', total: 2 });
    expect(existsSync(marker)).toBe(false);
  });
});
