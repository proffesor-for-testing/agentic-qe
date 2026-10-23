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
    // #1134: indexing reads exactly the files it is given.
    ['index-code', 'Pass filePaths with the files to index, or use code_index with a target'],
  ] as const)('refuses %s without files, saying what to pass', async (type, hint) => {
    const route = await routeInferredTask(type, { task: 'x' });
    expect(route).toEqual({ kind: 'needs-input', error: expect.stringContaining(hint) });
  });

  // #1146: a search description used to be refused for lacking files to index.
  it.each([true, false])('refuses a code search description as a search, not an index (with filePaths: %s)', async (withFiles) => {
    const route = await routeInferredTask('index-code', { task: 'semantic search for auth code', ...(withFiles ? { filePaths: [file] } : {}) });
    expect(route).toEqual({ kind: 'needs-input', error: expect.stringContaining('the description asks for a code search') });
    expect(route.kind === 'needs-input' && route.error).not.toContain('no files to index');
  });

  // #1225: generate-tests without source files used to be accepted and then
  // fail with "missing sourceFiles"; it is refused up front.
  describe('generate-tests (#1225)', () => {
    it('refuses a fallback description without files, saying no task type was inferred', async () => {
      const route = await routeInferredTask('generate-tests', { task: 'improve the login page performance' });
      expect(route).toEqual({ kind: 'needs-input', error: expect.stringContaining('no task type could be inferred from the description') });
      expect(route.kind === 'needs-input' && route.error).toContain('Pass filePaths with the source files to generate tests for');
    });

    it('refuses a test generation request without files, without claiming nothing was inferred', async () => {
      const route = await routeInferredTask('generate-tests', { task: 'generate tests for the user service', filePaths: [] });
      expect(route).toEqual({ kind: 'needs-input', error: expect.stringContaining('no source files were given and the description names none') });
      expect(route.kind === 'needs-input' && route.error).not.toContain('could be inferred');
    });

    it('uses the source files the description names', async () => {
      expect(await routeInferredTask('generate-tests', { task: `generate tests for ${file}` })).toEqual({
        kind: 'route', type: 'generate-tests', domain: 'test-generation', payload: { sourceFiles: [file] },
      });
    });

    it('refuses named files that cannot be read, naming them', async () => {
      const route = await routeInferredTask('generate-tests', { task: `generate tests for ${join(root, 'src/missing.ts')}` });
      expect(route).toEqual({ kind: 'needs-input', error: expect.stringContaining('missing.ts (not-found)') });
    });

    it('leaves a request with filePaths as inferred, as before', async () => {
      expect(await routeInferredTask('generate-tests', { task: 'anything', filePaths: [file] })).toEqual({ kind: 'as-inferred' });
    });
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

  it.each(['generate-tests', 'execute-tests', 'predict-defects', 'index-code'] as TaskType[])(
    'leaves %s, which has a handler of its own, as inferred', async (type) => {
      expect(await routeInferredTask(type, { task: 'x', filePaths: [file] })).toEqual({ kind: 'as-inferred' });
    });

  // #1200: the coverage-analysis plugin needs coverageData, which a description
  // never carries. The task runs the coverage tool's handler on one target.
  describe('analyze-coverage (#1200)', () => {
    const previousCwd = process.cwd();
    const coverageRoute = (target: string) => ({
      kind: 'route', type: 'analyze-coverage', domain: 'coverage-analysis', executionOwner: 'caller',
      payload: { target, detectGaps: true },
    });

    beforeAll(() => {
      mkdirSync(join(root, 'coverage'), { recursive: true });
      process.chdir(root);
    });

    afterAll(() => {
      process.chdir(previousCwd);
    });

    it('measures the single filePath', async () => {
      expect(await routeInferredTask('analyze-coverage', { task: 'analyze coverage', filePaths: [file] }))
        .toEqual(coverageRoute(file));
    });

    it('measures the path the description names when no filePaths are given', async () => {
      expect(await routeInferredTask('analyze-coverage', { task: 'analyze coverage of src/a.js.' }))
        .toEqual(coverageRoute('src/a.js'));
      expect(await routeInferredTask('analyze-coverage', { task: 'analyze coverage for src' }))
        .toEqual(coverageRoute('src'));
    });

    it('measures the project when neither names a path', async () => {
      // "coverage" is a directory here, but it is the activity, not the target.
      expect(await routeInferredTask('analyze-coverage', { task: 'analyze coverage for the project' }))
        .toEqual(coverageRoute('.'));
    });

    it('prefers filePaths over a path in the description', async () => {
      expect(await routeInferredTask('analyze-coverage', { task: 'analyze coverage for lib/b.ts', filePaths: [file] }))
        .toEqual(coverageRoute(file));
    });

    it('keeps a named path that does not exist, so the handler reports it missing', async () => {
      expect(await routeInferredTask('analyze-coverage', { task: 'analyze coverage of src/missing.ts' }))
        .toEqual(coverageRoute('src/missing.ts'));
    });

    it('refuses more than one target, naming them', async () => {
      const route = await routeInferredTask('analyze-coverage', { task: 'coverage', filePaths: [file, 'src'] });
      expect(route).toEqual({ kind: 'needs-input', error: expect.stringContaining(`filePaths names 2 (${file}, src)`) });
      expect(await routeInferredTask('analyze-coverage', { task: 'coverage of src/a.js and lib/b.ts' }))
        .toEqual({ kind: 'needs-input', error: expect.stringContaining('the description names 2') });
    });

    it('refuses a target outside the project', async () => {
      const route = await routeInferredTask('analyze-coverage', {
        task: 'coverage', filePaths: [join(root, '..', 'outside.ts')],
      });
      expect(route).toEqual({ kind: 'needs-input', error: expect.stringContaining('outside') });
    });
  });
});
