/**
 * #1355: test_generate_enhanced reports only the tests the domain generated.
 * Zero generated tests used to become 6 (`|| 6`), filled with placeholder
 * entries such as `integration_ComponentA_0` marked `aiGenerated: true`, and a
 * `sourceFiles` argument was dropped before it reached the domain.
 */
import { describe, it, expect } from 'vitest';
// handler-factory first: loading the configs first trips a circular import.
import * as handlerFactory from '../../../../src/mcp/handlers/handler-factory';
import { testGenerateConfig } from '../../../../src/mcp/handlers/domain-handler-configs';

type MapToResult = NonNullable<typeof testGenerateConfig.mapToResult>;
const mapToResult = (data: Record<string, unknown>, params: Record<string, unknown> = {}) =>
  (testGenerateConfig.mapToResult as MapToResult)('task-1', data, 12, [], params as never) as unknown as {
    tests: Array<{ name: string; aiGenerated?: boolean; assertions: string[]; testCode?: string }>;
    testsGenerated: number;
    reason?: string;
    patternsUsed: string[];
    aiInsights: { recommendations: string[]; confidence?: number };
    coverage: { confidence: number };
  };
const mapToPayload = (params: Record<string, unknown>) =>
  testGenerateConfig.mapToPayload(params as never, undefined) as Record<string, unknown>;

const PLACEHOLDER = /ComponentA|edge_case_|^test_\w+_\d+$/;

describe('test_generate_enhanced result mapping (#1355)', () => {
  it('reports zero tests and the domain warning when no source was given', () => {
    const warning = 'No source files or code provided for test generation. Provide sourceCode, filePath, or sourceFiles in the payload.';
    const result = mapToResult({ testsGenerated: 0, tests: [], patternsUsed: [], coverageEstimate: null, warning });

    expect(result.testsGenerated).toBe(0);
    expect(result.tests).toEqual([]);
    expect(result.reason).toBe(warning);
    expect(result.aiInsights).not.toHaveProperty('confidence');
    expect(result.aiInsights.recommendations).toEqual([]);
  });

  it('reports zero tests with a reason when the domain generated nothing', () => {
    const result = mapToResult({}, { sourceCode: 'export interface P { x: number }' });

    expect(result.testsGenerated).toBe(0);
    expect(result.tests).toEqual([]);
    expect(result.reason).toMatch(/no tests/i);
    expect(result.patternsUsed).toEqual([]);
  });

  it('never invents placeholder tests, whatever testsGenerated claims', () => {
    for (const testType of ['unit', 'integration']) {
      const result = mapToResult({ testsGenerated: 3 }, { sourceCode: 'function add(a, b) { return a + b; }', testType });
      expect(result.tests).toEqual([]);
      expect(result.testsGenerated).toBe(0);
      expect(result.tests.some(t => PLACEHOLDER.test(t.name) || t.aiGenerated === true)).toBe(false);
    }
  });

  it('maps real domain tests without marking template output aiGenerated', () => {
    const testCode = "it('adds', () => {\n  expect(add(1, 2)).toBe(3);\n});";
    const result = mapToResult({
      testsGenerated: 1,
      tests: [{ name: 'math tests', type: 'unit', testCode, sourceFile: 'src/math.ts' }],
      llmEnhanced: false,
    });

    expect(result.testsGenerated).toBe(1);
    expect(result.reason).toBeUndefined();
    expect(result.tests[0]).toMatchObject({ name: 'math tests', aiGenerated: false, testCode });
    expect(result.tests[0].assertions).toContain('expect(add(1, 2)).toBe(3)');
  });

  it('keeps nested calls in assertion descriptions (#1365)', () => {
    const testCode = 'it(\'parses a value\', () => { expect(add(2, 3)).toStrictEqual(JSON.parse("5")); });';
    const result = mapToResult({
      testsGenerated: 1,
      tests: [{ name: 'nested calls', type: 'unit', testCode }],
      llmEnhanced: false,
    });

    expect(result.tests[0].assertions).toContain('expect(add(2, 3)).toStrictEqual(JSON.parse("5"))');
  });

  it('reports no invented confidence for LLM output (#1369)', () => {
    const testCode = "it('adds', () => {\n  expect(add(1, 2)).toBe(3);\n});";
    const result = mapToResult({ tests: [{ name: 'math tests', type: 'unit', testCode }], llmEnhanced: true, coverageEstimate: 80 },
      { sourceCode: 'export const add = (a, b) => a + b;' });

    expect(result.aiInsights.recommendations.length).toBeGreaterThan(0);
    expect(result.aiInsights).not.toHaveProperty('confidence');
    expect(result.coverage.confidence).toBe(0);
  });

  it('does not invent assertion text when none can be extracted', () => {
    const result = mapToResult({ tests: [{ name: 'empty', type: 'unit', testCode: '// nothing here' }] });
    expect(result.tests[0].assertions).toEqual([]);
  });

  it('returns gate-rejected scaffolds separately, never as tests', () => {
    const scaffold = { name: 'math tests', scaffold: true, testCode: "test.skip('Scaffolding', () => {});", rejectedBecause: 'Generated test contains no executable assertions.' };
    const warning = 'Nothing testable in src/math.ts: Generated test contains no executable assertions.';
    const result = mapToResult({ testsGenerated: 0, tests: [], scaffolds: [scaffold], warning }) as ReturnType<typeof mapToResult> & { scaffolds?: unknown[] };

    expect(result.testsGenerated).toBe(0);
    expect(result.tests).toEqual([]);
    expect(result.reason).toBe(warning);
    expect(result.scaffolds).toEqual([scaffold]);
  });

  it('no longer exports the placeholder test builder', () => {
    expect('generateV2Tests' in handlerFactory).toBe(false);
  });
});

describe('test_generate_enhanced sourceFiles (#1355)', () => {
  it('passes sourceFiles through to the domain payload', () => {
    const payload = mapToPayload({ sourceFiles: ['src/math.ts'] });
    expect(payload.sourceFiles).toEqual(['src/math.ts']);
  });

  it('omits sourceFiles from the payload when the caller did not send it', () => {
    expect('sourceFiles' in mapToPayload({ sourceCode: 'const a = 1;' })).toBe(false);
  });

  it.each([
    ['an empty array', []],
    ['a string', 'src/math.ts'],
    ['a blank entry', ['src/math.ts', ' ']],
  ])('rejects %s', (_label, sourceFiles) => {
    expect(() => mapToPayload({ sourceFiles })).toThrow('sourceFiles must be a non-empty array of file paths.');
  });
});
