/**
 * #1125: `aqe fleet run` builds each operation's domain task from the target.
 * `analyze` used to send only { target } and always failed with "missing
 * coverageData"; `scan` submitted a type no handler runs; `test` sent no
 * sourceFiles. Without the input a handler needs, the operation is refused.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planFleetOperation } from '../../../src/cli/utils/fleet-operation.js';

describe('planFleetOperation (#1125)', () => {
  let root: string;
  const write = (rel: string, content: string) => writeFileSync(join(root, rel), content);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'aqe-1125-fleet-'));
    mkdirSync(join(root, 'src'));
    write('package.json', '{"name":"fx","version":"1.0.0"}');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('refuses a target that does not exist', async () => {
    expect(await planFleetOperation('scan', join(root, 'nope'))).toEqual({
      success: false, error: `Target does not exist: ${join(root, 'nope')}`,
    });
  });

  it('test: generates for the source files under the target, not its tests', async () => {
    write('src/a.ts', 'export const a = 1;');
    write('src/a.test.ts', 'it("a", () => {});');
    expect(await planFleetOperation('test', join(root, 'src'))).toEqual({
      success: true,
      task: { domain: 'test-generation', type: 'generate-tests', payload: { sourceFiles: [join(root, 'src/a.ts')] } },
    });
  });

  it('test: refuses a target without source files', async () => {
    const plan = await planFleetOperation('test', join(root, 'src'));
    expect(plan).toEqual({ success: false, error: expect.stringContaining('No source files under') });
  });

  it('scan: runs sast-scan on the JS/TS files under the target', async () => {
    write('src/a.js', 'eval(x);');
    write('src/b.test.ts', 'eval(y);');
    write('src/c.py', 'eval(z)');
    const plan = await planFleetOperation('scan', join(root, 'src'));
    expect(plan.success).toBe(true);
    if (!plan.success) return;
    expect(plan.task).toMatchObject({ domain: 'security-compliance', type: 'sast-scan' });
    expect([...(plan.task.payload.files as string[])].sort()).toEqual([join(root, 'src/a.js'), join(root, 'src/b.test.ts')]);
  });

  it('scan: refuses a target with no file the SAST scanner covers', async () => {
    write('src/c.py', 'eval(z)');
    const plan = await planFleetOperation('scan', join(root, 'src'));
    expect(plan).toEqual({ success: false, error: expect.stringContaining('that the SAST scanner covers (.ts .tsx .js .jsx .mjs .cjs)') });
  });

  it('analyze: refuses a project without a coverage report instead of estimating one', async () => {
    write('src/math.js', 'export const add = (a, b) => a + b;');
    const plan = await planFleetOperation('analyze', join(root, 'src'));
    expect(plan).toEqual({ success: false, error: expect.stringContaining(`No coverage report for project ${root}`) });
  });

  it('analyze: sends the measured coverage for the target from the project report', async () => {
    write('src/math.js', 'export function add(a, b) {\n  return a + b;\n}\n');
    mkdirSync(join(root, 'coverage'));
    write('coverage/lcov.info',
      `TN:\nSF:${join(root, 'src/math.js')}\nDA:1,1\nDA:2,1\nDA:3,0\nDA:4,1\nLF:4\nLH:3\nend_of_record\n`);

    const plan = await planFleetOperation('analyze', join(root, 'src'));

    expect(plan.success, JSON.stringify(plan)).toBe(true);
    if (!plan.success) return;
    expect(plan.task).toMatchObject({ domain: 'coverage-analysis', type: 'analyze-coverage' });
    const coverageData = plan.task.payload.coverageData as { files: Array<{ path: string }>; summary: { line: number } };
    expect(coverageData.files.map(f => f.path)).toEqual([join(root, 'src/math.js')]);
    expect(coverageData.summary.line).toBe(75);
  });

  it('analyze: refuses a report that does not cover the target', async () => {
    write('src/math.js', 'export const add = 1;');
    mkdirSync(join(root, 'other'));
    write('other/x.js', 'export const x = 1;');
    mkdirSync(join(root, 'coverage'));
    write('coverage/lcov.info', `TN:\nSF:${join(root, 'other/x.js')}\nDA:1,1\nLF:1\nLH:1\nend_of_record\n`);

    const plan = await planFleetOperation('analyze', join(root, 'src'));

    expect(plan).toEqual({ success: false, error: expect.stringContaining('Target is UNMEASURED') });
  });
});
