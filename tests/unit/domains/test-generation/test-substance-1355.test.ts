/**
 * #1355: unexecutableTestReason flags generated test files with no test that
 * can fail, conservatively (a false "nothing testable" is as bad as a false
 * count).
 */
import { describe, it, expect } from 'vitest';
import { unexecutableTestReason as reason } from '../../../../src/domains/test-generation/gates/index';

const vt = "import { describe, it, expect } from 'vitest';\nimport { add } from './math';\n";

describe('unexecutableTestReason: JS/TS (#1355)', () => {
  it.each([
    ['a literal tautology', "it('works', () => { expect(true).toBe(true); });"],
    ['a numeric tautology', "it('works', () => { expect(1).toEqual(1); });"],
    ['an identifier compared to itself', "it('works', () => { const r = add(1, 2); expect(r).toBe(r); });"],
    ['assert(true)', "import assert from 'node:assert';\ntest('works', () => { assert(true); });"],
    ['an empty body', "it('works', () => {});"],
    ['a comment-only body', "it('works', () => {\n  // TODO\n});"],
    ['it.skip / xit / test.skip', "it.skip('a', () => { expect(add(1, 2)).toBe(3); });\nxit('b', () => { expect(add(1, 2)).toBe(3); });\ntest.skip('c', () => {});"],
    ['describe.skip', "describe.skip('add', () => { it('a', () => { expect(add(1, 2)).toBe(3); }); });"],
  ])('flags %s', (_label, body) => {
    expect(reason(vt + body, 'src/math.ts')).toBeDefined();
  });

  it('says when every test is skipped', () => {
    expect(reason(vt + "describe.skip('x', () => { it('a', () => { expect(add(1, 2)).toBe(3); }); });", 'src/math.ts'))
      .toBe('Every test is skipped.');
  });

  it.each([
    ['a real assertion', "it('adds', () => { expect(add(2, 3)).toBe(5); });"],
    ['one real test beside a tautological one', "it('a', () => { expect(true).toBe(true); });\nit('b', () => { expect(add(2, 3)).toBe(5); });"],
    ['one active test beside a skipped one', "it.skip('a', () => {});\nit('b', () => { expect(add(2, 3)).toBe(5); });"],
    ['a negated self-comparison', "it('a', () => { expect(add(1, 2)).not.toBe(4); });"],
    ['a toThrow assertion', "it('a', () => { expect(() => add()).toThrow(); });"],
    ['a body without assertions (smoke test)', "it('runs', () => { add(1, 2); });"],
    ['test.each', "test.each([[1, 2, 3]])('adds %i', (a, b, c) => { expect(add(a, b)).toBe(c); });"],
    ['node:test with assert.strictEqual', "import assert from 'node:assert';\ntest('adds', () => { assert.strictEqual(add(2, 3), 5); });"],
    ['no test calls at all (left to the gate)', "expect(add(2, 3)).toBe(5);"],
  ])('keeps %s', (_label, body) => {
    expect(reason(vt + body, 'src/math.ts')).toBeUndefined();
  });
});

describe('unexecutableTestReason: other languages (#1355)', () => {
  it.each([
    ['Python pass-only', 'calc.py', 'from calc import add\n\ndef test_add():\n    pass\n'],
    ['Python all skipped', 'calc.py', 'import pytest\n\n@pytest.mark.skip(reason="x")\ndef test_add():\n    assert add(2, 3) == 5\n'],
    ['Python pytestmark skip', 'calc.py', 'import pytest\npytestmark = pytest.mark.skip\n\ndef test_add():\n    assert add(2, 3) == 5\n'],
    ['Go without t.Error/Fatal', 'calc.go', 'package calc\n\nimport "testing"\n\nfunc TestAdd(t *testing.T) {\n\tAdd(2, 3)\n}\n'],
    ['Go all t.Skip', 'calc.go', 'package calc\n\nimport "testing"\n\nfunc TestAdd(t *testing.T) {\n\tt.Skip("later")\n\tif Add(2, 3) != 5 { t.Fatal("bad") }\n}\n'],
    ['Java @Disabled', 'Calc.java', 'class CalcTest {\n  @Disabled\n  @Test\n  void add() { assertEquals(5, Calc.add(2, 3)); }\n}\n'],
    ['Java class-level @Disabled', 'Calc.java', '@Disabled\nclass CalcTest {\n  @Test void add() { assertEquals(5, Calc.add(2, 3)); }\n}\n'],
    ['Java no assertion', 'Calc.java', 'class CalcTest {\n  @Test void add() { Calc.add(2, 3); }\n}\n'],
    ['Rust no assertion', 'lib.rs', '#[test]\nfn adds() { add(2, 3); }\n'],
  ])('flags %s', (_label, file, code) => {
    expect(reason(code, file)).toBeDefined();
  });

  it.each([
    ['Python assert', 'calc.py', 'from calc import add\n\ndef test_add():\n    assert add(2, 3) == 5\n'],
    ['Python skipif stays (conditional)', 'calc.py', 'import pytest\n\n@pytest.mark.skipif(True, reason="x")\ndef test_add():\n    assert add(2, 3) == 5\n'],
    ['Python one skipped, one active', 'calc.py', '@pytest.mark.skip\ndef test_a():\n    assert 1\n\ndef test_b():\n    assert add(2, 3) == 5\n'],
    ['unittest self.assertEqual', 'calc.py', 'class T(unittest.TestCase):\n    def test_add(self):\n        self.assertEqual(add(2, 3), 5)\n'],
    ['pytest.raises', 'calc.py', 'def test_bad():\n    with pytest.raises(TypeError):\n        add(None)\n'],
    ['Go t.Errorf', 'calc.go', 'package calc\n\nimport "testing"\n\nfunc TestAdd(t *testing.T) {\n\tif got := Add(2, 3); got != 5 {\n\t\tt.Errorf("got %d", got)\n\t}\n}\n'],
    ['Go testify', 'calc.go', 'func TestAdd(t *testing.T) {\n\tassert.Equal(t, 5, Add(2, 3))\n}\n'],
    ['JUnit assertEquals', 'Calc.java', 'class CalcTest {\n  @Test void add() { assertEquals(5, Calc.add(2, 3)); }\n}\n'],
    ['Java one disabled, one active', 'Calc.java', 'class CalcTest {\n  @Disabled @Test void a() { assertEquals(1, 1); }\n  @Test void b() { assertEquals(5, Calc.add(2, 3)); }\n}\n'],
    ['Kotlin shouldBe', 'Calc.kt', 'class CalcTest : StringSpec({ "adds" { add(2, 3) shouldBe 5 } })\n'],
    ['C# Assert', 'Calc.cs', '[Fact] public void Adds() { Assert.Equal(5, Calc.Add(2, 3)); }\n'],
    ['Rust assert_eq!', 'lib.rs', '#[test]\nfn adds() { assert_eq!(add(2, 3), 5); }\n'],
    ['Swift XCTAssertEqual', 'Calc.swift', 'func testAdd() { XCTAssertEqual(add(2, 3), 5) }\n'],
    ['Dart expect', 'calc.dart', "test('adds', () { expect(add(2, 3), 5); });\n"],
    ['an unknown language', 'calc.rb', 'def test_add; end\n'],
  ])('keeps %s', (_label, file, code) => {
    expect(reason(code, file)).toBeUndefined();
  });
});
