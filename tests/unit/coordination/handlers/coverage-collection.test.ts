/**
 * Regression tests for issue #569 — `coverage_analyze_sublinear` reported
 * fabricated data for Rust crates.
 *
 * The reported symptoms, each covered below:
 *   1. `#[cfg(test)]` blocks flagged as uncovered production code
 *   2. gap line numbers past end-of-file (449 in a 448-line file)
 *   3. `tests/*.rs` analysed as a coverage target
 *   4. 100% branch coverage next to 0% function coverage, on every file
 *   5. every file in a narrow 74–84% band
 * plus the underlying cause: no signal that no instrumentation ran.
 *
 * The fixture below mirrors the reported crate's shape (a `jwks.rs` with a
 * trailing `#[cfg(test)] mod tests`, a `tests/` integration file) so the
 * assertions are about the real failure, not a synthetic one.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { vi } from 'vitest';
import {
  buildEstimatedCoverage,
  collectRustCoverage,
  countLines,
  isCoverageExecDisabled,
  findCargoRoot,
  findInlineTestRanges,
  isRustProject,
  isTestPath,
} from '../../../../src/coordination/handlers/coverage-collection';
import { createTaskExecutor } from '../../../../src/coordination/task-executor';
import type { QueenTask } from '../../../../src/coordination/queen-coordinator';

// Side-effect import: registers the coverage-analysis domain service factory.
import '../../../../src/domains/coverage-analysis';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const JWKS_RS = `use std::collections::HashMap;

pub struct Jwks { keys: HashMap<String, String> }

impl Jwks {
    pub fn new() -> Self { Jwks { keys: HashMap::new() } }

    pub fn get(&self, kid: &str) -> Option<&String> {
        if kid.is_empty() {
            return None;
        }
        self.keys.get(kid)
    }

    pub fn insert(&mut self, kid: String, key: String) {
        self.keys.insert(kid, key);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_kid_returns_none() {
        let jwks = Jwks::new();
        assert!(jwks.get("").is_none());
    }

    #[test]
    fn inserted_key_is_retrievable() {
        let mut jwks = Jwks::new();
        jwks.insert("a".into(), "k".into());
        assert!(jwks.get("a").is_some());
    }
}
`;

const VERIFY_RS = `pub fn verify(token: &str) -> bool {
    if token.is_empty() { return false; }
    match token.len() {
        0 => false,
        _ => true,
    }
}
`;

function makeRustCrate(root: string): void {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Cargo.toml'), '[package]\nname = "ruview-auth"\nversion = "0.1.0"\n');
  fs.writeFileSync(path.join(root, 'src', 'jwks.rs'), JWKS_RS);
  fs.writeFileSync(path.join(root, 'src', 'verify.rs'), VERIFY_RS);
  fs.writeFileSync(
    path.join(root, 'tests', 'verifier_matrix.rs'),
    '#[test]\nfn matrix() { assert!(true); }\n'
  );
}

describe('#569 — coverage collection provenance and correctness', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-569-'));
    makeRustCrate(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('countLines — contradiction 2, line numbers past EOF', () => {
    it('does not count the phantom line a trailing newline creates', () => {
      // `"a\nb\n".split('\n')` is ['a','b',''] — length 3 for a 2-line file.
      // That single off-by-one is how a 448-line jwks.rs produced a gap
      // ending at line 449.
      expect(countLines('a\nb\n')).toBe(2);
      expect(countLines('a\nb')).toBe(2);
      expect(countLines('')).toBe(0);
      expect(countLines('one\n')).toBe(1);
    });
  });

  describe('isTestPath — contradiction 3, test files as coverage targets', () => {
    it('recognizes Rust integration tests under tests/', () => {
      expect(isTestPath('/crate/tests/verifier_matrix.rs')).toBe(true);
    });

    it('recognizes conventional test filenames across languages', () => {
      expect(isTestPath('/p/src/auth_test.rs')).toBe(true);
      expect(isTestPath('/p/src/auth.test.ts')).toBe(true);
      expect(isTestPath('/p/src/auth.spec.ts')).toBe(true);
      expect(isTestPath('/p/__tests__/auth.ts')).toBe(true);
      expect(isTestPath('/p/benches/bench.rs')).toBe(true);
    });

    it('does not misclassify production code', () => {
      expect(isTestPath('/crate/src/jwks.rs')).toBe(false);
      expect(isTestPath('/crate/src/latest.rs')).toBe(false);
      expect(isTestPath('/crate/src/contest.ts')).toBe(false);
    });

    it('does not treat an embedded "test_" substring as a test prefix', () => {
      // Court charge (codex prosecutor, CONFIRMED): a bare
      // `basename.includes('test_')` also matches `latest_parser.rs`, silently
      // dropping real production files from the analysis. `test_` is a PREFIX
      // convention and must be anchored.
      expect(isTestPath('/crate/src/latest_parser.rs')).toBe(false);
      expect(isTestPath('/crate/src/contest_runner.ts')).toBe(false);
      expect(isTestPath('/crate/src/fastest_path.rs')).toBe(false);
      expect(isTestPath('/crate/src/protest_handler.go')).toBe(false);
      // ...while the genuine prefix convention still matches.
      expect(isTestPath('/pkg/test_parser.py')).toBe(true);
    });
  });

  describe('findInlineTestRanges — contradiction 1, #[cfg(test)] as production gap', () => {
    it('brace-matches the #[cfg(test)] module', () => {
      const ranges = findInlineTestRanges(JWKS_RS, '.rs');
      expect(ranges).toHaveLength(1);

      const [start, end] = ranges[0];
      const lines = JWKS_RS.split('\n');
      expect(lines[start - 1]).toContain('#[cfg(test)]');
      // The range must actually cover the asserts inside the tests.
      const assertLine = lines.findIndex(l => l.includes('assert!(jwks.get("")')) + 1;
      expect(assertLine).toBeGreaterThan(0);
      expect(assertLine).toBeGreaterThanOrEqual(start);
      expect(assertLine).toBeLessThanOrEqual(end);
    });

    it('handles a #[cfg(test)] module that is not last in the file', () => {
      const src = [
        '#[cfg(test)]',
        'mod tests {',
        '    #[test]',
        '    fn t() { assert!(true); }',
        '}',
        '',
        'pub fn after() -> u8 { 7 }',
      ].join('\n');

      const ranges = findInlineTestRanges(src, '.rs');
      expect(ranges).toEqual([[1, 5]]);
      // Crucially: `pub fn after` (line 7) is NOT swallowed.
      expect(ranges[0][1]).toBeLessThan(7);
    });

    it('returns nothing for languages without inline test modules', () => {
      expect(findInlineTestRanges('function f() {}', '.ts')).toEqual([]);
    });
  });

  describe('isRustProject', () => {
    it('detects a crate by its Cargo.toml', () => {
      expect(isRustProject(root)).toBe(true);
      // A subdirectory of the crate still belongs to the crate — see the
      // findCargoRoot tests below. Asserting `false` here would enshrine the
      // bug where `analyze(target: "src/")` silently skipped instrumentation.
      expect(isRustProject(path.join(root, 'src'))).toBe(true);
    });
  });

  describe('buildEstimatedCoverage', () => {
    it('labels itself an estimate rather than a measurement', () => {
      // The core of #569: "A caller has no signal that no instrumentation ran."
      const result = buildEstimatedCoverage(root)!;
      expect(result).not.toBeNull();
      expect(result.provenance.estimated).toBe(true);
      expect(result.provenance.method).toBe('static-estimation');
      expect(result.provenance.notes.join(' ')).toMatch(/STATIC ESTIMATE/);
    });

    it('reports branch and function data as uncollected — contradiction 4', () => {
      // 100% branch coverage alongside 0% function coverage cannot both be
      // true. Neither was collected, so neither may be asserted.
      const result = buildEstimatedCoverage(root)!;
      expect(result.provenance.branchDataCollected).toBe(false);
      expect(result.provenance.functionDataCollected).toBe(false);
      for (const file of result.data.files) {
        expect(file.branches.total).toBe(0);
        expect(file.branches.covered).toBe(0);
      }
    });

    it('excludes tests/ files from the analysed set — contradiction 3', () => {
      const result = buildEstimatedCoverage(root)!;
      const paths = result.data.files.map(f => f.path);
      expect(paths.some(p => p.includes('verifier_matrix'))).toBe(false);
      expect(paths.some(p => p.endsWith('jwks.rs'))).toBe(true);
    });

    it('never emits a line number beyond the file length — contradiction 2', () => {
      const result = buildEstimatedCoverage(root)!;
      for (const file of result.data.files) {
        const realLineCount = countLines(fs.readFileSync(file.path, 'utf-8'));
        for (const line of file.uncoveredLines) {
          expect(line).toBeGreaterThanOrEqual(1);
          expect(line).toBeLessThanOrEqual(realLineCount);
        }
      }
    });

    it('never flags a line inside a #[cfg(test)] block — contradiction 1', () => {
      const result = buildEstimatedCoverage(root)!;
      const jwks = result.data.files.find(f => f.path.endsWith('jwks.rs'))!;
      const ranges = findInlineTestRanges(JWKS_RS, '.rs');

      for (const line of jwks.uncoveredLines) {
        for (const [lo, hi] of ranges) {
          expect(
            line >= lo && line <= hi,
            `line ${line} is inside the #[cfg(test)] block ${lo}-${hi}`
          ).toBe(false);
        }
      }
    });

    it('excludes inline test lines from the production line total', () => {
      const result = buildEstimatedCoverage(root)!;
      const jwks = result.data.files.find(f => f.path.endsWith('jwks.rs'))!;
      const allLines = countLines(JWKS_RS);
      const testLines = findInlineTestRanges(JWKS_RS, '.rs')
        .reduce((s, [lo, hi]) => s + (hi - lo + 1), 0);

      expect(testLines).toBeGreaterThan(0);
      expect(jwks.lines.total).toBe(allLines - testLines);
    });

    it('counts Rust functions with a Rust pattern, not a JS one', () => {
      // `/\b(function|=>)\b/` matches nothing in Rust, so functionCount fell
      // to its `Math.max(..., 1)` floor and every file reported 0% functions.
      const result = buildEstimatedCoverage(root)!;
      const jwks = result.data.files.find(f => f.path.endsWith('jwks.rs'))!;
      // new, get, insert (+ the two test fns, which live in the excluded block
      // but are still counted by the whole-file regex — the point is simply
      // that the count is real, not the 1-function floor).
      expect(jwks.functions.total).toBeGreaterThanOrEqual(3);
    });

    it('returns null for a directory with no source files', () => {
      const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-569-empty-'));
      try {
        expect(buildEstimatedCoverage(empty)).toBeNull();
      } finally {
        fs.rmSync(empty, { recursive: true, force: true });
      }
    });

    it('returns null for a non-existent target', () => {
      expect(buildEstimatedCoverage(path.join(root, 'does-not-exist'))).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// End-to-end through the analyze-coverage handler — the actual tool output
// ---------------------------------------------------------------------------

function createMemory() {
  const store = new Map<string, unknown>();
  return {
    initialize: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
    store: vi.fn(async (k: string, v: unknown) => { store.set(k, v); }),
    set: vi.fn(async (k: string, v: unknown) => { store.set(k, v); }),
    retrieve: vi.fn(async (k: string) => store.get(k) ?? null),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    delete: vi.fn(async (k: string) => { store.delete(k); }),
    list: vi.fn(async () => [...store.keys()]),
    search: vi.fn(async () => []),
    vectorSearch: vi.fn(async () => []),
    query: vi.fn(async () => []),
  };
}

function createKernel() {
  return {
    memory: createMemory(),
    eventBus: {
      publish: vi.fn(async () => {}),
      subscribe: vi.fn(() => ({ unsubscribe: () => {}, active: true })),
      subscribeToChannel: vi.fn(() => ({ unsubscribe: () => {}, active: true })),
      getHistory: vi.fn(async () => []),
      dispose: vi.fn(async () => {}),
    },
    agentCoordinator: { spawn: vi.fn(), list: vi.fn(async () => []), dispose: vi.fn(async () => {}) },
    initialize: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  };
}

describe('#569 — analyze-coverage handler output', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-569-e2e-'));
    makeRustCrate(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function analyze() {
    const executor = createTaskExecutor(createKernel() as never, {
      saveResults: false,
      resultsDir: root,
      defaultLanguage: 'rust',
      defaultFramework: 'rust-test',
    });
    const task = {
      id: 'task-569',
      type: 'analyze-coverage',
      priority: 'p1',
      targetDomains: [],
      payload: { target: root, detectGaps: true },
      timeout: 60000,
      createdAt: new Date(),
    } as unknown as QueenTask;

    const result = await executor.execute(task);
    expect(result.success).toBe(true);
    return result.data as Record<string, unknown>;
  }

  it('marks a result with no instrumentation as estimated', async () => {
    // cargo-llvm-cov is not installed in CI, so this exercises the fallback —
    // which is exactly the path that used to lie.
    const data = await analyze();
    expect(data.estimated).toBe(true);
    expect(data.measured).toBe(false);
    expect(data.coverageMethod).toBe('static-estimation');
    expect(String(data.warning)).toMatch(/STATIC ESTIMATE|not measured/i);
  }, 120000);

  it('reports branch coverage as null rather than 100% — contradiction 4', async () => {
    const data = await analyze();
    expect(data.branchCoverage).toBeNull();
    expect(data.functionCoverage).toBeNull();
    expect(data.branchDataCollected).toBe(false);
  }, 120000);

  it('tells the caller how to get a real measurement for a Rust crate', async () => {
    const data = await analyze();
    expect(String(data.warning)).toMatch(/cargo-llvm-cov/);
  }, 120000);

  it('marks every emitted gap as estimated with low confidence', async () => {
    const data = await analyze();
    const gaps = data.gaps as Array<Record<string, unknown>>;
    for (const gap of gaps) {
      expect(gap.estimated).toBe(true);
      expect(gap.confidence as number).toBeLessThan(0.5);
    }
  }, 120000);

  it('does not list the integration test file as a coverage target', async () => {
    const data = await analyze();
    const byFile = data.coverageByFile as Array<{ file: string }>;
    expect(byFile.some(f => f.file.includes('verifier_matrix'))).toBe(false);
  }, 120000);
});

describe('#569 — recommendations derived from uncollected metrics', () => {
  let root2: string;

  beforeEach(() => {
    root2 = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-569-rec-'));
    makeRustCrate(root2);
  });

  afterEach(() => {
    fs.rmSync(root2, { recursive: true, force: true });
  });

  it('drops branch/function advice when that data was never collected', async () => {
    // "Branch coverage is significantly lower than line coverage" is a claim
    // about a metric nobody measured — it only appeared because the summary
    // defaults to 0. Sending a developer to fix it is the same class of harm
    // as the fabricated gap list.
    const executor = createTaskExecutor(createKernel() as never, {
      saveResults: false,
      resultsDir: root2,
      defaultLanguage: 'rust',
      defaultFramework: 'rust-test',
    });
    const result = await executor.execute({
      id: 'task-569-rec',
      type: 'analyze-coverage',
      priority: 'p1',
      targetDomains: [],
      payload: { target: root2, detectGaps: true },
      timeout: 60000,
      createdAt: new Date(),
    } as unknown as QueenTask);

    expect(result.success).toBe(true);
    const data = result.data as { recommendations: string[]; branchDataCollected: boolean };
    expect(data.branchDataCollected).toBe(false);
    expect(data.recommendations.join(' ')).not.toMatch(/branch coverage/i);
    expect(data.recommendations.join(' ')).not.toMatch(/function coverage/i);
  }, 120000);
});

// ---------------------------------------------------------------------------
// Charges filed by the qe-court cross-vendor prosecutor, confirmed and fixed
// ---------------------------------------------------------------------------

describe('#569 — court charges (confirmed by reproduction)', () => {
  describe('brace matching must ignore braces inside literals and comments', () => {
    it('does not close the test range on a brace inside a string literal', () => {
      // CONFIRMED CHARGE: this returned [[1,4]], leaving lines 5-8 (test code)
      // classified as uncovered PRODUCTION code — precisely the #569 bug.
      const src = [
        '#[cfg(test)]',
        'mod tests {',
        '  #[test]',
        '  fn one() { assert_eq!("}", "}"); }',
        '',
        '  #[test]',
        '  fn two() { assert!(false); }',
        '}',
      ].join('\n');
      expect(findInlineTestRanges(src, '.rs')).toEqual([[1, 8]]);
    });

    it('does not close the test range on a brace inside a comment', () => {
      const src = [
        '#[cfg(test)]',
        'mod tests {',
        '  // closing brace } in a comment',
        '  /* and } in a block comment */',
        '  #[test]',
        '  fn t() { assert!(true); }',
        '}',
      ].join('\n');
      expect(findInlineTestRanges(src, '.rs')).toEqual([[1, 7]]);
    });

    it('does not close the test range on a brace inside a raw string', () => {
      const src = [
        '#[cfg(test)]',
        'mod tests {',
        '  #[test]',
        '  fn t() { let s = r#"a } b"#; assert!(!s.is_empty()); }',
        '}',
      ].join('\n');
      expect(findInlineTestRanges(src, '.rs')).toEqual([[1, 5]]);
    });

    it('does not mistake a lifetime for a char literal', () => {
      const src = [
        '#[cfg(test)]',
        "mod tests {",
        "  fn borrow<'a>(s: &'a str) -> &'a str { s }",
        '  #[test]',
        '  fn t() { assert_eq!(borrow("x"), "x"); }',
        '}',
      ].join('\n');
      expect(findInlineTestRanges(src, '.rs')).toEqual([[1, 6]]);
    });
  });

  describe('findCargoRoot — instrumentation must not be skipped for subdirectories', () => {
    let crate: string;

    beforeEach(() => {
      crate = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-569-cargo-'));
      makeRustCrate(crate);
    });

    afterEach(() => {
      fs.rmSync(crate, { recursive: true, force: true });
    });

    it('finds the crate root when the target is a subdirectory', () => {
      // CONFIRMED CHARGE: `analyze(target: "src/")` on a Rust crate reported
      // isRustProject === false, silently skipping cargo llvm-cov and
      // downgrading a measurement to an estimate.
      expect(findCargoRoot(path.join(crate, 'src'))).toBe(fs.realpathSync(crate));
      expect(isRustProject(path.join(crate, 'src'))).toBe(true);
    });

    it('finds the crate root when the target is the crate itself', () => {
      expect(isRustProject(crate)).toBe(true);
    });

    it('returns null outside any crate', () => {
      const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-569-plain-'));
      try {
        expect(findCargoRoot(plain, 1)).toBeNull();
        expect(isRustProject(plain)).toBe(false);
      } finally {
        fs.rmSync(plain, { recursive: true, force: true });
      }
    });
  });
});

describe('#569 — overturn-round charges (confirmed by reproduction)', () => {
  it('does not swallow production code when #[cfg(test)] decorates a non-module item', () => {
    // CONFIRMED CHARGE: "next { within 10 lines" grabbed the FOLLOWING
    // production function's body, excluding real code from the analysis.
    const src = [
      '#[cfg(test)]',
      'const FIXTURE: &str = "only compiled in tests";',
      '',
      'pub fn production() {',
      '    do_real_work();',
      '}',
    ].join('\n');
    expect(findInlineTestRanges(src, '.rs')).toEqual([]);
  });

  it('ignores a #[cfg(test)] that appears inside a comment', () => {
    const src = [
      '/* #[cfg(test)] */',
      'pub fn production() {',
      '    do_real_work();',
      '}',
    ].join('\n');
    expect(findInlineTestRanges(src, '.rs')).toEqual([]);
  });

  it('handles a raw string with a long hash run', () => {
    const hashes = '#'.repeat(15);
    const src = [
      '#[cfg(test)]',
      'mod tests {',
      '    #[test]',
      `    fn one() { let _s = r${hashes}"quote: " brace } still string"${hashes}; }`,
      '',
      '    #[test]',
      '    fn two() { assert!(true); }',
      '}',
    ].join('\n');
    expect(findInlineTestRanges(src, '.rs')).toEqual([[1, 8]]);
  });

  it('still finds a normal #[cfg(test)] mod after these guards', () => {
    // Guard against over-tightening: the common case must keep working.
    expect(findInlineTestRanges(JWKS_RS, '.rs')).toHaveLength(1);
  });

  it('treats conftest.py as test support code', () => {
    expect(isTestPath('/pkg/conftest.py')).toBe(true);
  });

  it('matches test filename conventions case-insensitively', () => {
    expect(isTestPath('/pkg/Foo.Test.ts')).toBe(true);
  });
});

describe('#569 — findCargoRoot must not over-claim', () => {
  let crate: string;

  beforeEach(() => {
    crate = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-569-claim-'));
    makeRustCrate(crate);
  });

  afterEach(() => {
    fs.rmSync(crate, { recursive: true, force: true });
  });

  it('returns null for a target that does not exist', () => {
    // CONFIRMED CHARGE: a typo'd path resolved to the enclosing crate and would
    // have run a full-crate cargo llvm-cov, reporting the whole crate's
    // coverage as if it were the requested target's.
    expect(findCargoRoot(path.join(crate, 'src', 'does-not-exist'))).toBeNull();
    expect(isRustProject(path.join(crate, 'src', 'does-not-exist'))).toBe(false);
  });

  it('does not claim a polyglot subdirectory that holds no Rust code', () => {
    // CONFIRMED CHARGE: with a Cargo.toml at the monorepo root, analyzing
    // `frontend/` routed through cargo llvm-cov and returned Rust coverage for
    // a TypeScript directory.
    const frontend = path.join(crate, 'frontend');
    fs.mkdirSync(frontend, { recursive: true });
    fs.writeFileSync(path.join(frontend, 'app.ts'), 'export const a = 1;\n');

    expect(isRustProject(frontend)).toBe(false);
  });

  it('still claims a Rust subdirectory of the crate', () => {
    expect(isRustProject(path.join(crate, 'src'))).toBe(true);
  });
});

describe('#569 — classification must be relative to the analysis root', () => {
  let base: string;
  let proj: string;

  beforeEach(() => {
    // A perfectly ordinary project that happens to live under an ancestor
    // directory named "tests" — a CI workspace, ~/examples/myapp, or a monorepo
    // packages/test-utils/ subtree.
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-569-root-'));
    proj = path.join(base, 'tests', 'myapp');
    fs.mkdirSync(path.join(proj, 'src'), { recursive: true });
    fs.writeFileSync(path.join(proj, 'Cargo.toml'), '[package]\nname = "myapp"\n');
    fs.writeFileSync(
      path.join(proj, 'src', 'lib.rs'),
      'pub fn f(x: u8) -> u8 {\n    if x > 0 { x } else { 0 }\n}\n'
    );
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('does not classify production code as test code because of an ancestor directory', () => {
    // Court charge (CONFIRMED): against the ABSOLUTE path, every file in this
    // project matched the `tests` segment, so the whole project was dropped and
    // coverage analysis returned null.
    const lib = path.join(proj, 'src', 'lib.rs');
    expect(isTestPath(lib, proj)).toBe(false);
  });

  it('still classifies a tests/ directory INSIDE the analyzed tree', () => {
    const inner = path.join(proj, 'tests', 'it.rs');
    expect(isTestPath(inner, proj)).toBe(true);
  });

  it('analyzes a project living under an ancestor "tests" directory', () => {
    const result = buildEstimatedCoverage(proj);
    expect(result).not.toBeNull();
    expect(result!.data.files.length).toBeGreaterThan(0);
    expect(result!.data.files.some(f => f.path.endsWith('lib.rs'))).toBe(true);
  });
});

describe('#569 — AQE_COVERAGE_NO_EXEC opt-out', () => {
  afterEach(() => {
    delete process.env.AQE_COVERAGE_NO_EXEC;
  });

  it('is off by default', () => {
    delete process.env.AQE_COVERAGE_NO_EXEC;
    expect(isCoverageExecDisabled({})).toBe(false);
  });

  it('parses truthy and falsy forms like the other AQE kill-switches', () => {
    for (const on of ['1', 'true', 'yes', 'on', 'TRUE']) {
      expect(isCoverageExecDisabled({ AQE_COVERAGE_NO_EXEC: on }), on).toBe(true);
    }
    for (const off of ['', '0', 'false', 'no', 'off']) {
      expect(isCoverageExecDisabled({ AQE_COVERAGE_NO_EXEC: off }), off).toBe(false);
    }
  });

  it('prevents collectRustCoverage from invoking cargo at all', async () => {
    // Measuring Rust coverage compiles and runs code from the analyzed repo —
    // test binaries, build.rs, and any `runner` directive in its
    // .cargo/config.toml. With the switch on, nothing may be executed.
    //
    // Proven behaviorally with a fake `cargo` earlier on PATH that leaves a
    // marker file when invoked. This works whether or not real cargo is
    // installed, and (unlike a spy) exercises the actual execSync path.
    const crate = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-569-noexec-'));
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-569-bin-'));
    const marker = path.join(binDir, 'cargo-was-invoked');
    const originalPath = process.env.PATH;

    try {
      makeRustCrate(crate);
      fs.writeFileSync(
        path.join(binDir, 'cargo'),
        `#!/bin/sh\necho invoked >> ${JSON.stringify(marker)}\nexit 1\n`
      );
      fs.chmodSync(path.join(binDir, 'cargo'), 0o755);
      process.env.PATH = `${binDir}:${originalPath}`;

      // Control: with the switch OFF the shim IS reached, proving the test
      // itself can detect execution.
      delete process.env.AQE_COVERAGE_NO_EXEC;
      await collectRustCoverage(crate);
      expect(fs.existsSync(marker), 'control: cargo should have been invoked').toBe(true);

      fs.rmSync(marker);

      // With the switch ON, nothing is executed.
      process.env.AQE_COVERAGE_NO_EXEC = '1';
      const result = await collectRustCoverage(crate);

      expect(result).toBeNull();
      expect(fs.existsSync(marker), 'cargo was executed despite AQE_COVERAGE_NO_EXEC').toBe(false);
    } finally {
      process.env.PATH = originalPath;
      fs.rmSync(crate, { recursive: true, force: true });
      fs.rmSync(binDir, { recursive: true, force: true });
    }
  });
});
