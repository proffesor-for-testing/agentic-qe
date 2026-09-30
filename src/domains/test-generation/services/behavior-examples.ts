import ts from 'typescript';
import type { BehaviorExample } from '../interfaces.js';

/** JSON-only data is emitted as a parsed string, never interpolated as source. */
function literal(value: unknown): string {
  const visit = (v: unknown, seen = new Set<unknown>()): void => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number' && Number.isFinite(v) && !Object.is(v, -0)) return;
    if (typeof v !== 'object' || seen.has(v)) throw new Error('Behavior examples require finite JSON values (no undefined, cycles, or negative zero)');
    seen.add(v);
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) throw new Error('Behavior examples require plain JSON objects');
    for (const item of Array.isArray(v) ? Array.from(v) : Object.values(v)) visit(item, seen);
    seen.delete(v);
  };
  visit(value);
  return `JSON.parse(${JSON.stringify(JSON.stringify(value))})`;
}

export function generateBehaviorExamples(source: string, sourceFile: string, importPath: string,
  framework: string, examples: BehaviorExample[] | undefined, testType: string) {
  const supported = ['vitest', 'jest', 'node-test'].includes(framework) && testType === 'unit';
  const ast = ts.createSourceFile(sourceFile, source, ts.ScriptTarget.Latest, true);
  const diagnostics = (ast as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
  if (diagnostics.length) throw new Error('Cannot generate behavior examples from syntactically invalid source');
  const exports = new Map<string, number>();
  for (const node of ast.statements) {
    if (!ts.canHaveModifiers(node) || !ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) continue;
    const add = (name: string, fn: ts.FunctionLikeDeclaration) => {
      if (fn.body && !fn.asteriskToken && fn.parameters.every(p => ts.isIdentifier(p.name) && p.name.text !== 'this' && !p.dotDotDotToken && !p.questionToken && !p.initializer)) exports.set(name, fn.parameters.length);
    };
    if (ts.isFunctionDeclaration(node) && node.name) add(node.name.text, node);
    if (ts.isVariableStatement(node)) for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) add(decl.name.text, decl.initializer);
    }
  }
  if (examples !== undefined && !Array.isArray(examples)) throw new Error('behaviorExamples must be an array');
  if (examples?.length && !supported) throw new Error('Behavior examples support unit tests with vitest, jest, or node-test only');
  const limits: string[] = [];
  if (importPath === './module-under-test') limits.push('Inline source: save the source and replace ./module-under-test with its real import path before running.');
  const lines = [framework === 'node-test' ? "import { test } from 'node:test';\nimport assert from 'node:assert/strict';" : framework === 'vitest' ? "import { test, expect } from 'vitest';" : "import { test, expect } from '@jest/globals';"];
  if (!examples?.length) {
    limits.push('Scaffolding only: supply behaviorExamples from a specification or trusted fixtures. No behavior or coverage has been verified.');
    lines.push(`test.skip('Scaffolding: behaviorExamples required for ${exports.size} supported named exports', () => {});`);
  } else {
    lines.push(`import * as subject from ${JSON.stringify(importPath)};`);
    for (const [index, example] of examples.entries()) {
      if (!example || typeof example.functionName !== 'string' || !exports.has(example.functionName)) throw new Error('Behavior example must target a named exported function with required simple parameters');
      if (!Array.isArray(example.args) || example.args.length !== exports.get(example.functionName)) throw new Error(`Behavior example argument count does not match ${example.functionName}`);
      if (!Object.prototype.hasOwnProperty.call(example, 'expected')) throw new Error('Behavior example requires an explicit expected value');
      const call = `await subject[${JSON.stringify(example.functionName)}](${Array.from(example.args).map(a => literal(a)).join(', ')})`;
      const assertion = framework === 'node-test' ? `assert.deepStrictEqual(${call}, ${literal(example.expected)});` : `expect(${call}).toStrictEqual(${literal(example.expected)});`;
      lines.push(`test(${JSON.stringify(`${example.functionName}: specification example ${index + 1}`)}, async () => { ${assertion} });`);
    }
    const uncovered = [...exports.keys()].filter(name => !examples.some(e => e.functionName === name));
    if (uncovered.length) limits.push(`No supplied behavior examples for: ${uncovered.join(', ')}`);
    limits.push('Only supplied examples are asserted; coverage is unmeasured. Re-exports, default exports, classes, rest/default/destructured/optional parameters and thrown-error specifications are unsupported.');
  }
  return { code: `// ${limits.join('\n// ')}\n${lines.join('\n')}\n`, limits, assertions: examples?.length ?? 0,
    mode: examples?.length ? 'behavior-examples' as const : 'scaffolding' as const };
}
