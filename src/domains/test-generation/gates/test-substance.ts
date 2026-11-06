/**
 * #1355: does a generated test file contain at least one test that can fail?
 *
 * Deliberately conservative: a file is reported as unexecutable only when it
 * plainly has no real test. When in doubt the test is kept, because a false
 * "nothing testable" is as bad as a fabricated count.
 *
 * - JS/TS (TypeScript AST): every test is skipped, has an empty body, or
 *   asserts only tautologies such as expect(true).toBe(true).
 * - Other languages (token scan after stripping comments and docstrings): no
 *   assertion-like token, only tautologies (assert True), or every test
 *   skipped. Unknown languages are always kept.
 */
import ts from 'typescript';
import { codeLanguageOf, stripCode } from './code-text.js';

/** #1355: the files whose generated tests the gate parses (TypeScript AST). */
export function isJavaScriptFamily(filePath: string): boolean {
  return /\.(?:tsx?|jsx?|mjs|cjs|mts|cts)$/i.test(filePath);
}

const TEST_FNS = new Set(['it', 'test', 'xit', 'xtest', 'fit']);
const SUITE_FNS = new Set(['describe', 'xdescribe', 'fdescribe', 'suite', 'context']);
const EQUALITY_MATCHERS = new Set(['toBe', 'toEqual', 'toStrictEqual']);

/** Names along a callee: `it.skip.each(t)` -> ['it', 'skip', 'each']. */
function calleeChain(expression: ts.Expression): string[] {
  if (ts.isIdentifier(expression)) return [expression.text];
  if (ts.isPropertyAccessExpression(expression)) return [...calleeChain(expression.expression), expression.name.text];
  if (ts.isCallExpression(expression)) return calleeChain(expression.expression);
  return [];
}

const isSkipped = (chain: string[]) => chain[0].startsWith('x') || chain.includes('skip') || chain.includes('todo');

function isPlainValue(node: ts.Expression): boolean {
  return ts.isIdentifier(node) || ts.isLiteralExpression(node)
    || node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword
    || node.kind === ts.SyntaxKind.NullKeyword;
}

const ASSERT_MODULES = new Set(['assert', 'assert/strict', 'node:assert', 'node:assert/strict']);

/** `expect`, `assert`, and every name bound by an import from node's assert module. */
function assertionRoots(source: ts.SourceFile): Set<string> {
  const roots = new Set(['expect', 'assert']);
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!ASSERT_MODULES.has(statement.moduleSpecifier.text)) continue;
    const clause = statement.importClause;
    if (clause?.name) roots.add(clause.name.text);
    const bindings = clause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) roots.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) for (const el of bindings.elements) roots.add(el.name.text);
  }
  return roots;
}

/**
 * 'expect' for expect(x) (its .toBe is not counted again); 'assert' for
 * assert(x), assert.equal(), an assert-module import, or node:test's
 * t.assert.strictEqual() (any `<ident>.assert...` call).
 */
function assertionKind(call: ts.CallExpression, roots: Set<string>): 'expect' | 'assert' | undefined {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) {
    if (callee.text === 'expect') return 'expect';
    return roots.has(callee.text) ? 'assert' : undefined;
  }
  if (!ts.isPropertyAccessExpression(callee)) return undefined;
  const chain = calleeChain(callee);
  let root: ts.Expression = callee;
  while (ts.isPropertyAccessExpression(root)) root = root.expression;
  if (!ts.isIdentifier(root)) return undefined;
  if (chain[0] !== 'expect' && roots.has(chain[0])) return 'assert';
  return chain.slice(1).includes('assert') ? 'assert' : undefined;
}

/** expect(A).toBe(A) with A a literal or identifier; assert(true); assert.equal(1, 1). */
function isTautology(call: ts.CallExpression, kind: 'expect' | 'assert'): boolean {
  if (kind === 'expect') {
    const access = call.parent;
    const matcherCall = access?.parent;
    if (!access || !ts.isPropertyAccessExpression(access) || !EQUALITY_MATCHERS.has(access.name.text)) return false;
    if (!matcherCall || !ts.isCallExpression(matcherCall) || matcherCall.arguments.length !== 1) return false;
    const [actual] = call.arguments;
    const [expected] = matcherCall.arguments;
    return !!actual && isPlainValue(actual) && actual.getText() === expected.getText();
  }
  const args = call.arguments;
  if (args.length === 0 || !args.every(a => isPlainValue(a) && !ts.isIdentifier(a))) return false;
  return args.length === 1 ? args[0].kind === ts.SyntaxKind.TrueKeyword : args.every(a => a.getText() === args[0].getText());
}

/** Assertion calls under `node`: how many, and how many are not tautologies. */
function countAssertions(node: ts.Node, roots: Set<string>): { assertions: number; real: number } {
  let assertions = 0;
  let real = 0;
  const visit = (child: ts.Node): void => {
    if (ts.isCallExpression(child)) {
      const kind = assertionKind(child, roots);
      if (kind) { assertions++; if (!isTautology(child, kind)) real++; }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return { assertions, real };
}

/** A test that can fail: not skipped, and a real assertion or (with none) a non-empty body. */
function isSubstantiveTest(body: ts.Node, roots: Set<string>): boolean {
  const { assertions, real } = countAssertions(body, roots);
  if (assertions > 0) return real > 0;
  return ts.isBlock(body) ? body.statements.length > 0 : true;
}

function javascriptReason(testCode: string, file: string): string | undefined {
  const source = ts.createSourceFile(`generated.test${file.match(/\.\w+$/)?.[0] ?? '.ts'}`, testCode, ts.ScriptTarget.Latest, true);
  const roots = assertionRoots(source);
  if (countAssertions(source, roots).assertions === 0) return 'Generated test contains no executable assertions.';
  let tests = 0;
  let skipped = 0;
  let substantive = 0;
  const visit = (node: ts.Node, inSkippedSuite: boolean): void => {
    if (ts.isCallExpression(node)) {
      const chain = calleeChain(node.expression);
      if (chain.length > 0 && SUITE_FNS.has(chain[0])) {
        ts.forEachChild(node, child => visit(child, inSkippedSuite || isSkipped(chain)));
        return;
      }
      if (chain.length > 0 && TEST_FNS.has(chain[0])) {
        tests++;
        const body = [...node.arguments].reverse().find(a => ts.isArrowFunction(a) || ts.isFunctionExpression(a)) as
          ts.ArrowFunction | ts.FunctionExpression | undefined;
        if (inSkippedSuite || isSkipped(chain)) skipped++;
        else if (body && isSubstantiveTest(body.body, roots)) substantive++;
        return;
      }
    }
    ts.forEachChild(node, child => visit(child, inSkippedSuite));
  };
  visit(source, false);
  if (tests === 0 || substantive > 0) return undefined;
  return skipped === tests
    ? 'Every test is skipped.'
    : 'Every test is skipped, empty, or asserts only a tautology such as expect(true).toBe(true).';
}

interface LanguageRule {
  name: string;
  example: string;
  /** Global: every assertion-like token (one match per assertion). */
  assertion: RegExp;
  /** Global: assertions that cannot fail, e.g. `assert True`. */
  tautology: RegExp;
  /** Comment (and, for some languages, string) removal; `file` selects a dialect. */
  comments: (code: string, file: string) => string;
  allSkipped?: (code: string) => boolean;
}

const stripSlashComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Blank Java/Kotlin `import` lines (`[ \t]*`, not `\s*`, so the scan stays linear). */
function dropImportLines(code: string): string {
  return code.replace(/^[ \t]*import[ \t][^\n]*/gm, '');
}

function countAll(code: string, re: RegExp): number {
  return [...code.matchAll(re)].length;
}

function annotatedTestsAllSkipped(code: string): boolean {
  let tests = 0;
  let skipped = 0;
  let group: string[] = [];
  for (const line of code.split('\n')) {
    const annotations = line.trim().match(/^(?:@\w+(?:\([^)]*\))?\s*)+/)?.[0];
    if (annotations) group.push(...(annotations.match(/@\w+/g) ?? []));
    const rest = annotations ? line.trim().slice(annotations.length).trim() : line.trim();
    if (rest === '' && annotations) continue;
    if (group.length > 0) {
      const disabled = group.some(a => a === '@Disabled' || a === '@Ignore');
      if (/\bclass\b/.test(rest) && disabled) return /@Test\b/.test(code);
      if (group.includes('@Test')) { tests++; if (disabled) skipped++; }
    }
    group = [];
  }
  return tests > 0 && skipped === tests;
}

const RULES: Array<[RegExp, LanguageRule]> = [
  [/\.py$/i, {
    name: 'Python', example: 'assert*, self.assert*, pytest.raises',
    // #1371: strings too, so `print("assert x")` is not an assertion.
    comments: code => stripCode(code, 'python'),
    assertion: /\bassert\w*|\bself\.fail\s*\(|\bpytest\.(?:raises|warns|fail)\b/g,
    tautology: /\bassert\s+(?:True|1)\s*(?=$|[#,;)])|\bassertTrue\s*\(\s*True\s*\)|\bassertEqual\s*\(\s*([\w.'"]+)\s*,\s*\1\s*\)/gm,
    allSkipped: code => {
      if (/^[ \t]*pytestmark[ \t]*=.*\bpytest\.mark\.skip\b/m.test(code)) return true;
      const tests = countAll(code, /^[ \t]*(?:async[ \t]+)?def[ \t]+test\w*/gm);
      const skipped = countAll(code, /^[ \t]*@(?:pytest\.mark\.skip|unittest\.skip)\b[^\n]*\n(?:[ \t]*@[^\n]*\n)*[ \t]*(?:async[ \t]+)?def[ \t]+test\w*/gm);
      return tests > 0 && skipped === tests;
    },
  }],
  [/\.go$/i, {
    name: 'Go', example: '<t>.Error/Fatal/Fail, require., assert., Expect(',
    comments: code => stripCode(code, 'go'),
    assertion: /\b\w+\.(?:Error|Errorf|Fatal|Fatalf|Fail|FailNow)\s*\(|\b(?:require|assert)\.\w|\.(?:Assert|Require)\(\)\.\w|\bExpect\s*\(/g,
    tautology: /\b(?:assert|require)\.True\s*\(\s*\w+\s*,\s*true\s*[,)]/g,
    allSkipped: code => {
      const tests = countAll(code, /\bfunc\s+Test\w*\s*\(/g);
      const skipped = countAll(code, /\bfunc\s+Test\w*\s*\([^)]*\)\s*\{\s*\w+\.Skip(?:f|Now)?\s*\(/g);
      return tests > 0 && skipped === tests;
    },
  }],
  [/\.(?:java|kt|kts)$/i, {
    name: 'Java/Kotlin', example: 'assert*, assertThat, verify(, should*',
    // #1371: an `import ...assertTrue` line names an assertion, it does not make one.
    comments: (code, file) => dropImportLines(stripCode(code, codeLanguageOf(file) === 'kotlin' ? 'kotlin' : 'java')),
    assertion: /\bassert\w*|\bverify\s*\(|\bfail\s*\(|\bshould\w*|\bexpect\w*\s*\(/g,
    tautology: /\bassertTrue\s*\(\s*true\s*\)|\bassertThat\s*\(\s*true\s*\)\s*\.\s*isTrue\s*\(\s*\)|\bassertEquals\s*\(\s*([\w.'"]+)\s*,\s*\1\s*\)|\bassert\s+true\b/g,
    allSkipped: annotatedTestsAllSkipped,
  }],
  [/\.cs$/i, {
    name: 'C#', example: '*Assert., .Should()', comments: stripSlashComments,
    assertion: /\w*Assert\w*\.\w|\.Should\w*\s*\(|\bVerify\s*\(/g,
    tautology: /\bAssert\.(?:True|IsTrue)\s*\(\s*true\s*\)/g,
  }],
  [/\.rs$/i, {
    name: 'Rust', example: 'assert*!, panic!, should_panic', comments: stripSlashComments,
    assertion: /\w*assert\w*!|\bpanic!|#\[should_panic|\.unwrap\(\)|\.expect\(/g,
    tautology: /\b(?:debug_)?assert!\s*\(\s*true\s*\)|\b(?:debug_)?assert_eq!\s*\(\s*([\w.]+)\s*,\s*\1\s*\)/g,
  }],
  [/\.swift$/i, {
    name: 'Swift', example: 'XCTAssert*, #expect', comments: stripSlashComments,
    assertion: /\bXCTAssert\w*|\bXCTFail\b|\bXCTUnwrap\b|#expect\b|#require\b|\bexpect\s*\(/g,
    tautology: /\bXCTAssert(?:True)?\s*\(\s*true\s*\)|#expect\s*\(\s*true\s*\)/g,
  }],
  [/\.dart$/i, {
    name: 'Dart', example: 'expect(, fail(', comments: stripSlashComments,
    assertion: /\bexpect\w*\s*\(|\bfail\s*\(/g,
    tautology: /\bexpect\s*\(\s*true\s*,\s*(?:true|isTrue)\s*\)/g,
  }],
];

/**
 * #1371: whether non-JS test code has an assertion in its language's forms
 * (Python `assert x == y`, Go `t.Fatal`, JUnit `assertEquals`), or undefined
 * for a language without a rule here.
 */
export function hasLanguageAssertion(testCode: string, analysedFile: string): boolean | undefined {
  const rule = RULES.find(([ext]) => ext.test(analysedFile))?.[1];
  return rule ? countAll(rule.comments(testCode, analysedFile), rule.assertion) > 0 : undefined;
}

/**
 * Why a generated test file has no test that can fail, or undefined when it
 * may have one. `analysedFile` is the source file the test was generated
 * from, with its real extension; it selects the language.
 */
export function unexecutableTestReason(testCode: string | undefined, analysedFile: string | undefined): string | undefined {
  if (!testCode || !analysedFile) return undefined;
  if (isJavaScriptFamily(analysedFile)) return javascriptReason(testCode, analysedFile);
  const rule = RULES.find(([ext]) => ext.test(analysedFile))?.[1];
  if (!rule) return undefined;
  const code = rule.comments(testCode, analysedFile);
  const assertions = countAll(code, rule.assertion);
  if (assertions === 0) return `No ${rule.name} assertion found (looked for ${rule.example}).`;
  // Same rule as JS/TS: one assertion that can fail keeps the file.
  if (countAll(code, rule.tautology) >= assertions) return 'Every assertion is a tautology such as assert True.';
  if (rule.allSkipped?.(code)) return 'Every test is skipped.';
  return undefined;
}
