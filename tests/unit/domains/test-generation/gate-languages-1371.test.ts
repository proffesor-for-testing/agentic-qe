/**
 * #1371: the test quality gate (used by `aqe test generate`, and shown as
 * `qualityGate` by test_generate_enhanced) must understand each language's
 * assertion and import forms. It rejected valid Python, Go, Java/Kotlin and
 * TS alias/index-import tests with no-assertions / no-source-import, while it
 * must still reject scaffolds and tests that never reference the source.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TestQualityGate } from '../../../../src/domains/test-generation/gates/test-quality-gate';
import { sourceImportVerdict } from '../../../../src/domains/test-generation/gates/source-import-check';
import { unexecutableTestReason } from '../../../../src/domains/test-generation/gates/test-substance';

let root: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1371-')));
  vi.stubEnv('AQE_PROJECT_ROOT', root);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

const gate = new TestQualityGate();
const issueTypes = (testCode: string, file: string, source?: string, importTarget?: string) =>
  gate.validate(testCode, join(root, file), source, importTarget).issues.map(i => i.type);

const PY_SRC = 'def add(a, b):\n    return a + b\n';
const GO_SRC = 'package calc\n\nfunc Add(a int, b int) int { return a + b }\n';
const JAVA_SRC = 'package com.example;\n\npublic class Calc { public static int add(int a, int b) { return a + b; } }\n';
const KT_SRC = 'package com.ex\n\nfun add(a: Int, b: Int): Int = a + b\n';

describe('#1371 the gate accepts valid tests in each language', () => {
  it.each([
    ['pytest from-import', 'src/calc.py', PY_SRC, 'from src.calc import add\n\n\ndef test_add():\n    assert add(2, 3) == 5\n'],
    ['pytest import-as', 'src/calc.py', PY_SRC, 'import src.calc as calc\n\n\ndef test_add():\n    assert calc.add(2, 3) == 5\n'],
    ['pytest relative import', 'pkg/calc.py', PY_SRC, 'from .calc import add\n\ndef test_add():\n    assert add(2, 3) == 5\n'],
    ['pytest from-package import', 'src/calc.py', PY_SRC, 'from src import calc\n\ndef test_add():\n    assert calc.add(2, 3) == 5\n'],
    ['pytest sys.path / conftest', 'src/calc.py', PY_SRC,
      'import sys\nsys.path.insert(0, "src")\nfrom calc import add\n\ndef test_add():\n    assert add(2, 3) == 5\n'],
    ['pytest package __init__', 'src/shapes/__init__.py', 'def area(r):\n    return 3 * r * r\n',
      'from src.shapes import area\n\ndef test_area():\n    assert area(1) == 3\n'],
    ['Go same package', 'pkg/calc/calc.go', GO_SRC,
      'package calc\n\nimport "testing"\n\nfunc TestAdd(t *testing.T) {\n\tif got := Add(2, 3); got != 5 {\n\t\tt.Fatalf("got %d", got)\n\t}\n}\n'],
    ['Go external test package', 'pkg/calc/calc.go', GO_SRC,
      'package calc_test\n\nimport (\n\t"testing"\n\n\t"example.com/fx/pkg/calc"\n)\n\nfunc TestAdd(t *testing.T) {\n\tif calc.Add(2, 3) != 5 {\n\t\tt.Error("bad")\n\t}\n}\n'],
    ['JUnit same package', 'src/main/java/com/example/Calc.java', JAVA_SRC,
      'package com.example;\n\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\n\nclass CalcTest {\n  @Test void adds() { assertEquals(5, Calc.add(2, 3)); }\n}\n'],
    ['JUnit other package with import', 'src/main/java/com/example/Calc.java', JAVA_SRC,
      'package com.example.tests;\n\nimport com.example.Calc;\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\n\nclass CalcTest {\n  @Test void adds() { assertEquals(5, Calc.add(2, 3)); }\n}\n'],
    ['JUnit static import', 'src/main/java/com/example/Calc.java', JAVA_SRC,
      'package org.other;\n\nimport static com.example.Calc.add;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\nimport org.junit.jupiter.api.Test;\n\nclass AddTest {\n  @Test void adds() { assertEquals(5, add(2, 3)); }\n}\n'],
    ['Kotlin same package, top-level fun', 'src/calc.kt', KT_SRC,
      'package com.ex\n\nimport kotlin.test.Test\nimport kotlin.test.assertEquals\n\nclass CalcTest {\n  @Test fun adds() { assertEquals(5, add(2, 3)) }\n}\n'],
    ['Kotlin import of top-level fun', 'src/calc.kt', KT_SRC,
      'package com.other\n\nimport com.ex.add\nimport kotlin.test.Test\nimport kotlin.test.assertEquals\n\nclass CalcTest {\n  @Test fun adds() { assertEquals(5, add(2, 3)) }\n}\n'],
  ])('%s', (_label, file, source, testCode) => {
    expect(issueTypes(testCode, file, source)).toEqual([]);
    expect(gate.validate(testCode, join(root, file), source).passed).toBe(true);
  });

  describe('TypeScript', () => {
    const vitest = (spec: string) =>
      `import { describe, it, expect } from 'vitest';\nimport { fn } from '${spec}';\n\ndescribe('fn', () => {\n  it('works', () => {\n    expect(fn(2)).toBe(4);\n  });\n});\n`;

    it.each([
      ['extension-less relative', 'src/math.ts', '../src/math'],
      ['.js specifier for a .ts file', 'src/math.ts', './math.js'],
      ['directory-index import', 'src/utils/index.ts', '../src/utils'],
      ['explicit index import', 'src/utils/index.ts', '../src/utils/index.js'],
    ])('%s', (_label, file, spec) => {
      expect(issueTypes(vitest(spec), file)).toEqual([]);
    });

    it('resolves tsconfig paths aliases (comments allowed)', () => {
      writeFileSync(join(root, 'tsconfig.json'),
        '{\n  // aliases\n  "compilerOptions": { "baseUrl": ".", "paths": { "@math": ["src/lib/math.ts"], "~/*": ["src/*"] } }\n}\n');
      expect(issueTypes(vitest('@math'), 'src/lib/math.ts')).toEqual([]);
      expect(issueTypes(vitest('~/lib/math'), 'src/lib/math.ts')).toEqual([]);
      mkdirSync(join(root, 'src', 'utils'), { recursive: true });
      expect(issueTypes(vitest('~/utils'), 'src/utils/index.ts')).toEqual([]);
    });

    it('follows tsconfig extends to the base config that declares paths', () => {
      writeFileSync(join(root, 'tsconfig.base.json'), '{ "compilerOptions": { "paths": { "#calc": ["./src/lib/math.ts"], "#other": ["./src/other.ts"] } } }');
      writeFileSync(join(root, 'tsconfig.json'), '{ "extends": "./tsconfig.base.json", "compilerOptions": { "strict": true } }');
      expect(issueTypes(vitest('#calc'), 'src/lib/math.ts')).toEqual([]);
      expect(issueTypes(vitest('#other'), 'src/lib/math.ts')).toContain('no-source-import');
    });

    it('does not accept an alias that resolves elsewhere', () => {
      writeFileSync(join(root, 'tsconfig.json'), '{ "compilerOptions": { "paths": { "@helpers": ["src/helpers.ts"] } } }');
      expect(issueTypes(vitest('@helpers'), 'src/lib/math.ts')).toContain('no-source-import');
    });
  });
});

describe('#1371 the gate still rejects what it should', () => {
  it.each([
    ['pytest importing another module', 'src/ops.py', 'def sub(a, b):\n    return a - b\n',
      'from other import sub\n\ndef test_sub():\n    assert sub(5, 3) == 2\n', 'no-source-import'],
    ['pytest with no assertion', 'src/calc.py', PY_SRC, 'from src.calc import add\n\ndef test_add():\n    add(2, 3)\n', 'no-assertions'],
    ['Go same package calling nothing from the source', 'pkg/calc/calc.go', GO_SRC,
      'package calc\n\nimport "testing"\n\nfunc TestX(t *testing.T) {\n\tif 1+1 != 2 {\n\t\tt.Fatal("math")\n\t}\n}\n', 'no-source-import'],
    ['Go external package without the import', 'pkg/calc/calc.go', GO_SRC,
      'package calc_test\n\nimport "testing"\n\nfunc TestAdd(t *testing.T) {\n\tt.Fatal("x")\n}\n', 'no-source-import'],
    ['Go with no assertion', 'pkg/calc/calc.go', GO_SRC,
      'package calc\n\nimport "testing"\n\nfunc TestAdd(t *testing.T) {\n\t_ = Add(2, 3)\n}\n', 'no-assertions'],
    ['JUnit in another package without an import', 'src/main/java/com/example/Calc.java', JAVA_SRC,
      'package org.other;\n\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\n\nclass CalcTest {\n  @Test void adds() { assertEquals(5, Calc.add(2, 3)); }\n}\n', 'no-source-import'],
    ['JUnit importing an unrelated class of the package', 'src/main/java/com/example/Calc.java', JAVA_SRC,
      'package org.other;\n\nimport com.example.Other;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\n\nclass CalcTest {\n  void adds() { assertEquals(5, Other.x()); }\n}\n', 'no-source-import'],
    ['Kotlin same package not using the source', 'src/calc.kt', KT_SRC,
      'package com.ex\n\nimport kotlin.test.assertEquals\n\nclass CalcTest {\n  fun adds() { assertEquals(5, 2 + 3) }\n}\n', 'no-source-import'],
    ['TS importing another module', 'src/math.ts', '',
      "import { expect, it } from 'vitest';\nimport { x } from './other';\nit('x', () => { expect(x()).toBe(1); });\n", 'no-source-import'],
  ])('%s', (_label, file, source, testCode, issue) => {
    const result = gate.validate(testCode, join(root, file), source || undefined);
    expect(result.issues.map(i => i.type)).toContain(issue);
    expect(result.passed).toBe(false);
  });

  it('still rejects the pytest template scaffold (placeholder assertion, wrong import)', () => {
    const scaffold = 'import pytest\nfrom src.calc.py import add\n\n\nclass TestCalc:\n    def test_add_valid_input(self):\n        result = add(None, None)\n';
    expect(gate.validate(scaffold, join(root, 'src/calc.py'), PY_SRC).passed).toBe(false);
  });
});

describe('#1371 inline sourceCode (MCP) is judged by its logical import path', () => {
  it('uses a dotted Python import target', () => {
    const verdict = sourceImportVerdict('from src.calc import add\n\ndef test_add():\n    assert add(2, 3) == 5\n',
      { sourceFilePath: '/tmp/aqe-temp-1.py', importTarget: 'src.calc', sourceCode: PY_SRC });
    expect(verdict).toBe('found');
  });

  it('uses the Go module import target', () => {
    // The import's last segment (mathx) matches neither the package (calc) nor the temp dir.
    const verdict = sourceImportVerdict('package calc_test\n\nimport "example.com/fx/pkg/mathx"\n',
      { sourceFilePath: '/tmp/aqe-temp-2.go', importTarget: 'example.com/fx/pkg/mathx', sourceCode: GO_SRC });
    expect(verdict).toBe('found');
  });
});

describe('#1371 languages the gate cannot judge get no import finding', () => {
  it.each([
    ['src/Calc.cs', 'using Example;\nusing Xunit;\npublic class CalcTests { [Fact] public void Adds() { Assert.Equal(5, Calc.Add(2, 3)); } }\n'],
    ['src/calc.rs', '#[cfg(test)]\nmod tests {\n    use super::*;\n    #[test]\n    fn adds() { assert_eq!(add(2, 3), 5); }\n}\n'],
    ['src/Calc.swift', '@testable import Calc\nimport Testing\n\n@Test func adds() { #expect(add(2, 3) == 5) }\n'],
  ])('%s', (file, testCode) => {
    expect(issueTypes(testCode, file)).not.toContain('no-source-import');
  });

  it('does not judge Java without the source text', () => {
    expect(sourceImportVerdict('class T {}', { sourceFilePath: 'src/Calc.java' })).toBe('unjudged');
  });
});

// ---------------------------------------------------------------------------
// PR #1389 review
// ---------------------------------------------------------------------------

describe('#1371 review: tautologies fail the gate as they fail MCP', () => {
  it.each([
    ['Python assert True', 'src/calc.py', PY_SRC, 'from src.calc import add\n\ndef test_x():\n    add(1, 2)\n    assert True\n'],
    ['Java assertTrue(true)', 'src/main/java/com/example/Calc.java', JAVA_SRC,
      'package com.example;\n\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.*;\n\nclass CalcTest {\n  @Test void x() { Calc.add(1, 2); assertTrue(true); }\n}\n'],
    ['Go assert.True(t, true)', 'pkg/calc/calc.go', GO_SRC,
      'package calc\n\nimport (\n\t"testing"\n\t"github.com/stretchr/testify/assert"\n)\n\nfunc TestX(t *testing.T) {\n\t_ = Add(1, 2)\n\tassert.True(t, true)\n}\n'],
    ['every pytest test skipped', 'src/calc.py', PY_SRC,
      'import pytest\nfrom src.calc import add\n\n@pytest.mark.skip(reason="later")\ndef test_add():\n    assert add(2, 3) == 5\n'],
  ])('%s', (_label, file, source, testCode) => {
    const result = gate.validate(testCode, join(root, file), source);
    expect(result.issues.map(i => i.type)).toContain('no-testable-assertion');
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    // The reason is test_generate_enhanced's scaffold reason, so CLI and MCP agree.
    expect(result.issues.find(i => i.type === 'no-testable-assertion')!.description).toBe(unexecutableTestReason(testCode, file));
  });

  it('keeps a real assertion next to a tautology', () => {
    const testCode = 'from src.calc import add\n\ndef test_x():\n    assert True\n    assert add(2, 3) == 5\n';
    expect(gate.validate(testCode, join(root, 'src/calc.py'), PY_SRC).passed).toBe(true);
  });
});

describe("#1371 review: only top-level source declarations, not the test's own names", () => {
  const GO_LOCALS = 'package calc\n\nimport "errors"\n\nfunc Add(a, b int) (int, error) {\n\tvar err error\n\tresult := a + b\n'
    + '\tif result < 0 { err = errors.New("neg") }\n\treturn result, err\n}\n';
  const KT_LOCALS = 'package com.ex\n\nfun add(a: Int, b: Int): Int { val total = a + b; return total }\n';

  it('a Go test using only a local name of the source (var err) is rejected', () => {
    const testCode = 'package calc\n\nimport "testing"\n\nfunc TestX(t *testing.T) {\n\tvar err error\n\tif err != nil {\n\t\tt.Fatal(err)\n\t}\n}\n';
    expect(issueTypes(testCode, 'pkg/calc/calc.go', GO_LOCALS)).toContain('no-source-import');
  });

  it('a Kotlin test using only a local name of the source (val total) is rejected', () => {
    const testCode = 'package com.ex\n\nimport kotlin.test.assertEquals\n\nclass CalcTest {\n  fun x() { val total = 3; assertEquals(3, total) }\n}\n';
    expect(issueTypes(testCode, 'src/calc.kt', KT_LOCALS)).toContain('no-source-import');
  });

  it('a local of the source does not count even when the test does not declare it', () => {
    const goSource = 'package calc\n\nfunc Add(a, b int) int {\n\tvar scale = 1\n\treturn (a + b) * scale\n}\n';
    const goTest = 'package calc\n\nimport "testing"\n\nfunc TestX(t *testing.T) {\n\tif cfg.scale != 1 {\n\t\tt.Fatal("x")\n\t}\n}\n';
    expect(issueTypes(goTest, 'pkg/calc/calc.go', goSource)).toContain('no-source-import');
    const ktTest = 'package com.ex\n\nimport kotlin.test.assertEquals\n\nclass CalcTest {\n  fun x() { assertEquals(3, result.total) }\n}\n';
    expect(issueTypes(ktTest, 'src/calc.kt', KT_LOCALS)).toContain('no-source-import');
  });

  it('a name the test declares itself does not count, though the source declares it at top level', () => {
    const source = 'package calc\n\nvar Limit = 3\n\nfunc Add(a, b int) int { return a + b }\n';
    const testCode = 'package calc\n\nimport "testing"\n\nfunc TestX(t *testing.T) {\n\tLimit := 5\n\tif Limit != 5 {\n\t\tt.Fatal("x")\n\t}\n}\n';
    expect(issueTypes(testCode, 'pkg/calc/calc.go', source)).toContain('no-source-import');
  });

  it('reads Go grouped declarations and methods', () => {
    const source = 'package calc\n\nvar (\n\tLimit = 3\n)\n\ntype C struct{}\n\nfunc (c *C) Sum(a, b int) int { return a + b }\n';
    const call = (expr: string) => `package calc\n\nimport "testing"\n\nfunc TestX(t *testing.T) {\n\tif ${expr} {\n\t\tt.Fatal("x")\n\t}\n}\n`;
    expect(issueTypes(call('Limit != 3'), 'pkg/calc/calc.go', source)).toEqual([]);
    expect(issueTypes(call('(&C{}).Sum(1, 2) != 3'), 'pkg/calc/calc.go', source)).toEqual([]);
  });
});

describe('#1371 review: comments and strings are neither assertions nor calls', () => {
  it.each([
    ['Go: Add only in a comment', 'pkg/calc/calc.go', GO_SRC,
      'package calc\n\nimport "testing"\n\n// Add is tested here\nfunc TestX(t *testing.T) {\n\tif 1 != 1 { t.Fatal("x") }\n}\n', 'no-source-import'],
    ['Go: Add only in a string', 'pkg/calc/calc.go', GO_SRC,
      'package calc\n\nimport "testing"\n\nfunc TestX(t *testing.T) {\n\tif 1 != 1 { t.Fatal("Add failed") }\n}\n', 'no-source-import'],
    ['Go: Add only in a raw string', 'pkg/calc/calc.go', GO_SRC,
      'package calc\n\nimport "testing"\n\nfunc TestX(t *testing.T) {\n\tif 1 != 1 { t.Fatal(`Add failed`) }\n}\n', 'no-source-import'],
    ['Go: t.Error only in a string', 'pkg/calc/calc.go', GO_SRC,
      'package calc\n\nimport "testing"\n\nfunc TestX(t *testing.T) {\n\t_ = Add(1, 2)\n\tt.Log("t.Error(x)")\n}\n', 'no-assertions'],
    ['Python: assertion only in a string', 'src/calc.py', PY_SRC,
      'from src.calc import add\n\ndef test_x():\n    print("assert add(1,2) == 3")\n', 'no-assertions'],
    ['Python: assertion only in a triple-quoted string', 'src/calc.py', PY_SRC,
      "from src.calc import add\n\ndef test_x():\n    s = '''\n    assert add(1, 2) == 3\n    '''\n", 'no-assertions'],
    ['Python: import only in a comment', 'src/calc.py', PY_SRC,
      '# from src.calc import add\n\ndef test_x():\n    assert 1 + 1 == 2\n', 'no-source-import'],
    ['Python: import on its own line inside a triple-quoted string', 'src/calc.py', PY_SRC,
      'CODE = """\nfrom src.calc import add\n"""\n\ndef test_x():\n    assert 1 + 1 == 2\n', 'no-source-import'],
    ['Python: import only in a string', 'src/calc.py', PY_SRC,
      'code = """from src.calc import add"""\n\ndef test_x():\n    assert 1 + 1 == 2\n', 'no-source-import'],
    ['Java: assertion only in a string', 'src/main/java/com/example/Calc.java', JAVA_SRC,
      'package com.example;\n\nclass CalcTest {\n  void x() { System.out.println("assertEquals " + Calc.add(2, 3)); }\n}\n', 'no-assertions'],
    ['Kotlin: add only in a string', 'src/calc.kt', KT_SRC,
      'package com.ex\n\nimport kotlin.test.assertEquals\n\nclass CalcTest {\n  fun x() { assertEquals("add", "a" + "dd") }\n}\n', 'no-source-import'],
  ])('%s', (_label, file, source, testCode, issue) => {
    expect(issueTypes(testCode, file, source)).toContain(issue);
  });

  it('a # or // inside a string does not hide the rest of the line', () => {
    const py = 'from src.calc import add\n\ndef test_x():\n    assert add("#", "a") == "#a"\n';
    expect(issueTypes(py, 'src/calc.py', PY_SRC)).toEqual([]);
    const go = 'package calc\n\nimport "testing"\n\nfunc TestX(t *testing.T) {\n\tif s := "//"; Add(1, 2) != 3 { t.Fatal(s) }\n}\n';
    expect(issueTypes(go, 'pkg/calc/calc.go', GO_SRC)).toEqual([]);
  });

  it("MCP's scaffold check agrees: a string-only assertion is not a test, a real one is", () => {
    expect(unexecutableTestReason('def test_x():\n    print("assert 1 == 1")\n', 'src/calc.py')).toMatch(/No Python assertion/);
    expect(unexecutableTestReason('def test_x():\n    assert add("#", 1) == "#1"\n', 'src/calc.py')).toBeUndefined();
    expect(unexecutableTestReason('func TestX(t *testing.T) {\n\tt.Log(`t.Fatal`)\n}\n', 'pkg/calc.go')).toMatch(/No Go assertion/);
    expect(unexecutableTestReason('class T { void x() { assertEquals("a", "a"); } }', 'src/T.java')).toMatch(/tautology/);
    expect(unexecutableTestReason('class T { void x() { assertEquals("a", c.name()); } }', 'src/T.java')).toBeUndefined();
  });

  it('keeps importlib.import_module("...") imports', () => {
    const testCode = 'import importlib\ncalc = importlib.import_module("src.calc")\n\ndef test_x():\n    assert calc.add(2, 3) == 5\n';
    expect(issueTypes(testCode, 'src/calc.py', PY_SRC)).toEqual([]);
  });
});

describe('#1371 review: imports the first version mishandled', () => {
  it('accepts a wildcard import of the source package when the test uses it', () => {
    const testCode = 'package com.other;\n\nimport com.example.*;\nimport static org.junit.jupiter.api.Assertions.*;\n\nclass CalcTest {\n  void x() { assertEquals(5, Calc.add(2, 3)); }\n}\n';
    expect(issueTypes(testCode, 'src/main/java/com/example/Calc.java', JAVA_SRC)).toEqual([]);
  });

  it('rejects a wildcard import of the source package that the test never uses', () => {
    const testCode = 'package com.other;\n\nimport com.example.*;\nimport static org.junit.jupiter.api.Assertions.*;\n\nclass CalcTest {\n  void x() { assertEquals(5, 2 + 3); }\n}\n';
    expect(issueTypes(testCode, 'src/main/java/com/example/Calc.java', JAVA_SRC)).toContain('no-source-import');
  });

  it('rejects a test in a named package for a default-package source (it cannot import it)', () => {
    const source = 'public class Calc { public static int add(int a, int b) { return a + b; } }\n';
    const testCode = 'package org.tests;\n\nimport static org.junit.jupiter.api.Assertions.assertEquals;\n\nclass CalcTest {\n  void x() { assertEquals(5, Calc.add(2, 3)); }\n}\n';
    expect(issueTypes(testCode, 'nopkg/Calc.java', source)).toContain('no-source-import');
    // In the default package too, it may use the class directly.
    expect(issueTypes(testCode.replace('package org.tests;\n', ''), 'nopkg/Calc.java', source)).toEqual([]);
  });

  it('accepts `from . import add` in a test inside the package of an __init__.py, not of a module', () => {
    const testCode = 'from . import add\n\ndef test_x():\n    assert add(2, 3) == 5\n';
    expect(issueTypes(testCode, 'src/mypkg/__init__.py', PY_SRC)).toEqual([]);
    expect(issueTypes(testCode, 'src/mypkg/calc.py', PY_SRC)).toContain('no-source-import');
  });

  it('checks Dart quoted imports by file name', () => {
    const dart = (spec: string) => `import 'package:test/test.dart';\nimport '${spec}';\n\nvoid main() {\n  test('adds', () {\n    expect(add(2, 3), 5);\n  });\n}\n`;
    expect(issueTypes(dart('package:app/calc.dart'), 'lib/calc.dart')).toEqual([]);
    expect(issueTypes(dart('package:app/other.dart'), 'lib/calc.dart')).toContain('no-source-import');
  });

  it('resolves paths from a base config in another directory against that config (pathsBasePath)', () => {
    mkdirSync(join(root, 'config'), { recursive: true });
    writeFileSync(join(root, 'config', 'tsconfig.base.json'), '{ "compilerOptions": { "paths": { "#calc": ["../src/lib/math.ts"] } } }');
    writeFileSync(join(root, 'tsconfig.json'), '{ "extends": "./config/tsconfig.base.json" }');
    const testCode = "import { expect, it } from 'vitest';\nimport { fn } from '#calc';\nit('x', () => { expect(fn(2)).toBe(4); });\n";
    expect(issueTypes(testCode, 'src/lib/math.ts')).toEqual([]);
  });
});

describe('#1371 CodeQL: hostile input', () => {
  it('a path of many slashes is handled in linear time (js/polynomial-redos)', () => {
    const slashes = '/'.repeat(200_000);
    const start = performance.now();
    // Dart takes the import target unresolved, the path the old `/\/+$/` scanned.
    sourceImportVerdict("import 'package:app/calc.dart';\n", { sourceFilePath: 'lib/calc.dart', importTarget: `lib${slashes}x` });
    sourceImportVerdict(`import { a } from 'x${'/'.repeat(4000)}!';\n`, { sourceFilePath: join(root, 'src/math.ts') });
    expect(performance.now() - start).toBeLessThan(500);
  });

  it('ignores tsconfig paths entries with more than one * (tsc rejects them)', () => {
    writeFileSync(join(root, 'tsconfig.json'),
      '{ "compilerOptions": { "baseUrl": ".", "paths": { "@*/*": ["src/lib/math.ts"], "#m/*": ["src/*/*"], "#ok/*": ["src/lib/*"] } } }');
    const vitest = (spec: string) => `import { it, expect } from 'vitest';\nimport { fn } from '${spec}';\nit('x', () => { expect(fn(2)).toBe(4); });\n`;
    // A two-star pattern and a two-star substitution never match.
    expect(issueTypes(vitest('@a/b'), 'src/lib/math.ts')).toContain('no-source-import');
    // The old first-'*' handling matched '@*/*' against a specifier ending in a literal '/*'.
    expect(issueTypes(vitest('@a/*'), 'src/lib/math.ts')).toContain('no-source-import');
    expect(issueTypes(vitest('#m/lib'), 'src/lib/math.ts')).toContain('no-source-import');
    // A valid single-star entry still resolves.
    expect(issueTypes(vitest('#ok/math'), 'src/lib/math.ts')).toEqual([]);
  });
});
