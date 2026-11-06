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
    const verdict = sourceImportVerdict('package calc_test\n\nimport "example.com/fx/pkg/calc"\n',
      { sourceFilePath: '/tmp/aqe-temp-2.go', importTarget: 'example.com/fx/pkg/calc', sourceCode: GO_SRC });
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
