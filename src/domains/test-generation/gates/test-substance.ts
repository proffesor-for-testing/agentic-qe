/**
 * #1355: does a generated test file contain at least one test that can fail?
 *
 * Deliberately conservative: a file is reported as unexecutable only when it
 * plainly has no real test. When in doubt the test is kept, because a false
 * "nothing testable" is as bad as a fabricated count.
 *
 * - JS/TS (TypeScript AST): every test is skipped, has an empty body, or
 *   asserts only tautologies such as expect(true).toBe(true).
 * - Other languages (token scan): no assertion-like token for the language, or
 *   every test is skipped. Unknown languages are always kept.
 */
import ts from 'typescript';
import { isJavaScriptFamily } from './test-quality-gate.js';

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

/** expect(A).toBe(A) with A a literal or identifier; assert(true); assert.equal(1, 1). */
function isTautology(call: ts.CallExpression, root: string): boolean {
  if (root === 'expect') {
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

/** A test that can fail: not skipped, and a real assertion or (with none) a non-empty body. */
function isSubstantiveTest(body: ts.Node): boolean {
  let assertions = 0;
  let real = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const root = calleeChain(node.expression)[0];
      const direct = ts.isIdentifier(node.expression) || ts.isPropertyAccessExpression(node.expression);
      if (direct && (root === 'expect' || root === 'assert') && !ts.isCallExpression(node.expression)) {
        // Count expect(x) once (not again for its .toBe call).
        if (root === 'assert' || ts.isIdentifier(node.expression)) {
          assertions++;
          if (!isTautology(node, root)) real++;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  if (assertions > 0) return real > 0;
  return ts.isBlock(body) ? body.statements.length > 0 : true;
}

function javascriptReason(testCode: string, file: string): string | undefined {
  const source = ts.createSourceFile(`generated.test${file.match(/\.\w+$/)?.[0] ?? '.ts'}`, testCode, ts.ScriptTarget.Latest, true);
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
        else if (body && isSubstantiveTest(body.body)) substantive++;
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

interface LanguageRule { name: string; assertion: RegExp; example: string; allSkipped?: (code: string) => boolean }

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
    name: 'Python', example: 'assert, self.assert*, pytest.raises',
    assertion: /\bassert\b|\bself\.assert\w*|\bself\.fail\s*\(|\bpytest\.(?:raises|fail)\b/,
    allSkipped: code => {
      if (/^\s*pytestmark\s*=.*\bpytest\.mark\.skip\b/m.test(code)) return true;
      const tests = countAll(code, /^\s*(?:async\s+)?def\s+test\w*/gm);
      const skipped = countAll(code, /^\s*@(?:pytest\.mark\.skip|unittest\.skip)\b[^\n]*\n(?:\s*@[^\n]*\n)*\s*(?:async\s+)?def\s+test\w*/gm);
      return tests > 0 && skipped === tests;
    },
  }],
  [/\.go$/i, {
    name: 'Go', example: 't.Error, t.Fatal, require., assert.',
    assertion: /\bt\.(?:Error|Errorf|Fatal|Fatalf|Fail|FailNow)\b|\brequire\.\w|\bassert\.\w/,
    allSkipped: code => {
      const tests = countAll(code, /\bfunc\s+Test\w*\s*\(/g);
      const skipped = countAll(code, /\bfunc\s+Test\w*\s*\([^)]*\)\s*\{\s*\w+\.Skip(?:f|Now)?\s*\(/g);
      return tests > 0 && skipped === tests;
    },
  }],
  [/\.(?:java|kt|kts)$/i, {
    name: 'Java/Kotlin', example: 'assert*, assertThat, verify(, should*',
    assertion: /\bassert\w*\b|\bverify\s*\(|\bfail\s*\(|\bshould\w*\b|\bexpect\w*\s*\(/,
    allSkipped: annotatedTestsAllSkipped,
  }],
  [/\.cs$/i, { name: 'C#', example: 'Assert., .Should()', assertion: /\bAssert\.\w|\.Should\w*\s*\(|\bVerify\s*\(/ }],
  [/\.rs$/i, { name: 'Rust', example: 'assert!, assert_eq!, panic!', assertion: /\b(?:debug_)?assert(?:_eq|_ne)?!|\bpanic!|#\[should_panic|\.unwrap\(\)|\.expect\(/ }],
  [/\.swift$/i, { name: 'Swift', example: 'XCTAssert*, #expect', assertion: /\bXCTAssert\w*|\bXCTFail\b|#expect\b|#require\b/ }],
  [/\.dart$/i, { name: 'Dart', example: 'expect(, fail(', assertion: /\bexpect(?:Later|Async)?\s*\(|\bfail\s*\(/ }],
];

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
  if (!rule.assertion.test(testCode)) return `No ${rule.name} assertion found (looked for ${rule.example}).`;
  if (rule.allSkipped?.(testCode)) return 'Every test is skipped.';
  return undefined;
}
