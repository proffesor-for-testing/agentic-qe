import ts from 'typescript';
import type { BehaviorExample } from '../interfaces.js';
import { CallerInputError } from '../../../shared/error-utils.js';
import { assertBehaviorJsonValue, validateBehaviorExamples } from './behavior-example-validation.js';

/** JSON-only data is emitted as a parsed string, never interpolated as source. */
function literal(value: unknown): string {
  assertBehaviorJsonValue(value);
  return `JSON.parse(${JSON.stringify(JSON.stringify(value))})`;
}

export function generateBehaviorExamples(source: string, sourceFile: string, importPath: string,
  framework: string, examples: BehaviorExample[] | undefined, testType: string) {
  const supported = ['vitest', 'jest', 'node-test'].includes(framework) && testType === 'unit';
  const ast = ts.createSourceFile(sourceFile, source, ts.ScriptTarget.Latest, true);
  const diagnostics = (ast as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
  if (diagnostics.length) throw new CallerInputError('Cannot generate behavior examples from syntactically invalid source');
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
  validateBehaviorExamples(examples);
  if (examples?.length && !supported) throw new CallerInputError('Behavior examples support unit tests with vitest, jest, or node-test only');
  const limits: string[] = [];
  if (importPath === './module-under-test') limits.push('Inline source: save the source and replace ./module-under-test with its real import path before running.');
  const lines = [framework === 'node-test' ? "import { test } from 'node:test';\nimport assert from 'node:assert/strict';" : framework === 'vitest' ? "import { test, expect } from 'vitest';" : "import { test, expect } from '@jest/globals';"];
  if (!examples?.length) {
    limits.push('Scaffolding only: supply behaviorExamples from a specification or trusted fixtures. No behavior or coverage has been verified.');
    lines.push(`test.skip('Scaffolding: behaviorExamples required for ${exports.size} supported named exports', () => {});`);
  } else {
    lines.push(`import * as subject from ${JSON.stringify(importPath)};`);
    for (const [index, example] of examples.entries()) {
      if (!example || typeof example.functionName !== 'string' || !exports.has(example.functionName)) throw new CallerInputError(`Behavior example ${index + 1} must target a named exported function with required simple parameters; '${String(example?.functionName)}' is not one (supported: ${[...exports.keys()].join(', ') || 'none'})`);
      if (!Array.isArray(example.args) || example.args.length !== exports.get(example.functionName)) throw new CallerInputError(`Behavior example argument count does not match ${example.functionName}`);
      if (!Object.prototype.hasOwnProperty.call(example, 'expected')) throw new CallerInputError('Behavior example requires an explicit expected value');
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
