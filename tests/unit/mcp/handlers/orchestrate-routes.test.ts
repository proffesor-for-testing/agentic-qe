/**
 * #1125: task_orchestrate inferred types that have no handler of their own run
 * the domain's concrete handler with input from the request, or are refused
 * with the input they need. Nothing is filled in that the request lacks.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { routeInferredTask } from '../../../../src/mcp/handlers/orchestrate-routes.js';
import type { TaskType } from '../../../../src/coordination/queen-types.js';

describe('routeInferredTask (#1125)', () => {
  let root: string;
  let file: string;
  const previousRoot = process.env.AQE_PROJECT_ROOT;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'aqe-1125-routes-'));
    mkdirSync(join(root, 'src'));
    file = join(root, 'src/a.js');
    writeFileSync(file, 'export const a = 1;\n');
    process.env.AQE_PROJECT_ROOT = root;
  });

  afterAll(() => {
    if (previousRoot === undefined) delete process.env.AQE_PROJECT_ROOT;
    else process.env.AQE_PROJECT_ROOT = previousRoot;
    rmSync(root, { recursive: true, force: true });
  });

  it('routes a security scan with files to sast-scan', async () => {
    expect(await routeInferredTask('scan-security', { task: 'scan', filePaths: [file] })).toEqual({
      kind: 'route', type: 'sast-scan', domain: 'security-compliance', payload: { files: [file] },
    });
  });

  it('routes a quality assessment with files to analyze-quality', async () => {
    expect(await routeInferredTask('assess-quality', { task: 'assess quality', filePaths: [file] })).toEqual({
      kind: 'route', type: 'analyze-quality', domain: 'quality-assessment', payload: { sourceFiles: [file] },
    });
  });

  it.each([
    ['scan-security', 'Pass filePaths with the source files to scan'],
    ['assess-quality', 'Pass filePaths with the source files to assess'],
  ] as const)('refuses %s without files, saying what to pass', async (type, hint) => {
    const route = await routeInferredTask(type, { task: 'x' });
    expect(route).toEqual({ kind: 'needs-input', error: expect.stringContaining(hint) });
  });

  it('refuses files outside the project or missing, naming each', async () => {
    const route = await routeInferredTask('scan-security', {
      task: 'scan', filePaths: [file, join(root, 'src/missing.js'), join(root, '..', 'outside.js')],
    });
    expect(route.kind).toBe('needs-input');
    if (route.kind !== 'needs-input') return;
    expect(route.error).toContain('missing.js (');
    expect(route.error).toContain('outside.js (outside-project-root)');
    expect(route.error).not.toContain(`${file} (`);
  });

  it.each([
    ['run-chaos', 'Use chaos_test'],
    ['validate-contracts', 'Use contract_validate'],
    ['validate-requirements', 'Use requirements_validate'],
    ['test-accessibility', 'Use accessibility_test'],
    ['optimize-learning', 'Use task_submit with type optimize-strategies'],
  ] as const)('refuses %s, whose input a description cannot supply', async (type, hint) => {
    const route = await routeInferredTask(type, { task: 'test https://example.com', filePaths: [file] });
    expect(route).toEqual({
      kind: 'needs-input',
      error: expect.stringMatching(new RegExp(`^task_orchestrate inferred '${type}' from the description, but .*${hint}`)),
    });
  });

  it.each(['generate-tests', 'execute-tests', 'analyze-coverage', 'predict-defects', 'index-code'] as TaskType[])(
    'leaves %s, which has a handler of its own, as inferred', async (type) => {
      expect(await routeInferredTask(type, { task: 'x', filePaths: [file] })).toEqual({ kind: 'as-inferred' });
    });
});
