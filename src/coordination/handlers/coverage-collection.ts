/**
 * Coverage collection and provenance (issue #569).
 *
 * Two things live here, and the distinction between them is the whole point:
 *
 *   1. **Measurement** — run real instrumentation and parse what it reports.
 *   2. **Estimation** — a static guess from source shape, used only when no
 *      instrumentation could run.
 *
 * Before #569 these were indistinguishable in the output. `coverage_analyze_sublinear`
 * on a Rust crate reported `lineCoverage: 78.3 / branchCoverage: 100 /
 * functionCoverage: 0` with `confidence: 0.7` attached to gaps that pointed at
 * `#[cfg(test)]` blocks and at line numbers past end-of-file. Every one of those
 * numbers came from a JS-shaped regex heuristic; none was a measurement. A caller
 * had no way to tell.
 *
 * So: every collector returns a `CoverageProvenance` alongside the data, and
 * estimation is labelled as estimation, at the source, all the way out to the
 * caller.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { CoverageData, FileCoverage } from '../../domains/coverage-analysis/interfaces';
import { parseLcovInfo } from './handler-utils';

// ============================================================================
// Provenance
// ============================================================================

/** How a set of coverage numbers was obtained. */
export type CoverageMethod =
  /** Parsed from an instrumented coverage report already on disk. */
  | 'instrumented-report'
  /** Produced by running `cargo llvm-cov` for this analysis. */
  | 'cargo-llvm-cov'
  /** Static guess from source shape. NOT a measurement. */
  | 'static-estimation';

export interface CoverageProvenance {
  method: CoverageMethod;
  /**
   * True when the numbers are a static guess rather than a measurement.
   * Callers MUST NOT present an estimated result as measured coverage.
   */
  estimated: boolean;
  /**
   * True only when branch data was actually collected. When false, branch
   * coverage must be reported as `null`/`n-a` — never as a percentage, and
   * emphatically never as 100%.
   */
  branchDataCollected: boolean;
  /** True when function-level data was actually collected. */
  functionDataCollected: boolean;
  /** Human-readable notes for the caller to surface. */
  notes: string[];
}

export interface CollectedCoverage {
  data: CoverageData;
  provenance: CoverageProvenance;
}

// ============================================================================
// Shared file classification
// ============================================================================

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.rb',
]);

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'coverage', '.git', '.claude', '.agentic-qe',
  '__pycache__', '.venv', 'target', 'vendor',
]);

/** Directory names whose entire contents are test/bench/example code, not production code. */
const TEST_DIRS = new Set(['tests', 'test', '__tests__', 'benches', 'examples', 'spec']);

/**
 * Test-file naming conventions, as ANCHORED patterns.
 *
 * Anchoring matters: a bare `includes('test_')` also matches `latest_parser.rs`,
 * `contest_runner.ts`, and `fastest_path.rs`, silently dropping production files
 * from the analysis entirely. `test_` is a Python/Rust *prefix* convention, so it
 * only counts at the start of the basename.
 */
const TEST_FILENAME_PATTERNS: RegExp[] = [
  /\.test\./i,      // foo.test.ts
  /\.spec\./i,      // foo.spec.ts
  /_test\./i,       // foo_test.rs, foo_test.go
  /_spec\./i,       // foo_spec.rb
  /^test_/i,        // test_foo.py  (prefix only — NOT `latest_parser`)
  /^test\./i,       // test.ts
  /^conftest\./i,   // pytest fixture module — support code, not production
];

/**
 * Is this path test code rather than production code?
 *
 * #569 work item: "Exclude `tests/` files from 'uncovered production code'".
 * Coverage *of* a test file is not a meaningful metric — reporting
 * `tests/verifier_matrix.rs` at 79.2% with its own gap entry sends a developer
 * to write tests for their tests.
 *
 * Erring in either direction costs something: a false negative reports test code
 * as a production gap (the original bug), a false positive silently drops real
 * production code from the denominator. Hence anchored patterns, not substrings.
 */
export function isTestPath(filePath: string): boolean {
  const normalized = filePath.split(path.sep).join('/');
  const basename = path.basename(normalized);

  if (TEST_FILENAME_PATTERNS.some(p => p.test(basename))) return true;
  // Rust convention: `foo_test.rs` handled above; `tests/` dir handled here.
  return normalized.split('/').some(segment => TEST_DIRS.has(segment));
}

/**
 * Blank out Rust string literals, char literals, and comments so brace counting
 * sees only structural braces.
 *
 * Without this, a `#[cfg(test)]` module containing `assert_eq!("}", "}")` closes
 * its range early, and every test line after that point is reported as uncovered
 * *production* code — exactly the #569 failure this function exists to prevent.
 * Characters are replaced with spaces rather than removed so line and column
 * positions are preserved.
 */
function maskRustLiteralsAndComments(source: string): string {
  const out = source.split('');
  const n = source.length;
  let i = 0;

  const blank = (from: number, to: number): void => {
    for (let j = from; j < to && j < n; j++) {
      if (source[j] !== '\n') out[j] = ' ';
    }
  };

  while (i < n) {
    const ch = source[i];

    // Line comment
    if (ch === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    // Block comment (Rust allows nesting)
    if (ch === '/' && source[i + 1] === '*') {
      let depth = 0;
      const start = i;
      while (i < n) {
        if (source[i] === '/' && source[i + 1] === '*') { depth++; i += 2; continue; }
        if (source[i] === '*' && source[i + 1] === '/') { depth--; i += 2; if (depth === 0) break; continue; }
        i++;
      }
      blank(start, i);
      continue;
    }
    // Raw string: r"...", r#"..."#, br##"..."##.
    // The slice must be wide enough for the longest realistic hash run — a
    // 15-hash opener is 17 chars and would otherwise fall through to the normal
    // string branch, which stops at the first internal quote and re-exposes any
    // `}` after it.
    const raw = /^b?r(#*)"/.exec(source.slice(i, i + 300));
    if (raw) {
      const terminator = `"${raw[1]}`;
      const bodyStart = i + raw[0].length;
      const end = source.indexOf(terminator, bodyStart);
      const stop = end === -1 ? n : end + terminator.length;
      blank(i, stop);
      i = stop;
      continue;
    }
    // Normal string literal
    if (ch === '"') {
      const start = i;
      i++;
      while (i < n) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === '"') { i++; break; }
        i++;
      }
      blank(start, i);
      continue;
    }
    // Char literal. Must not swallow a lifetime (`&'a str`), so only treat it as
    // a literal when a closing quote lands where a char literal would put one.
    if (ch === "'") {
      let stop = -1;
      if (source[i + 1] === '\\') {
        const close = source.indexOf("'", i + 2);
        if (close !== -1 && close <= i + 5) stop = close + 1;
      } else if (source[i + 2] === "'") {
        stop = i + 3;
      }
      if (stop !== -1) {
        blank(i, stop);
        i = stop;
        continue;
      }
    }

    i++;
  }

  return out.join('');
}

/**
 * Line ranges occupied by inline test code, 1-indexed and inclusive.
 *
 * Rust puts unit tests in the same file as the code under test, inside a
 * `#[cfg(test)] mod tests { ... }` block. #569's first and worst symptom was
 * exactly this: gap `gap-…-0` flagged `src/jwks.rs` 335–449 as "Missing test
 * case", where line 335 is an `assert!` inside a *passing* test.
 *
 * Brace-matched rather than "assume the block runs to EOF", because a
 * `#[cfg(test)]` module is not always last in the file.
 */
export function findInlineTestRanges(content: string, ext: string): Array<[number, number]> {
  if (ext !== '.rs') return [];

  // Brace-match against a copy with strings/chars/comments masked out. Counting
  // a `}` inside `assert_eq!("}", "}")` closes the range early and re-exposes
  // the rest of the test module as "uncovered production code". Attribute
  // detection also runs on the MASKED text, so a `/* #[cfg(test)] */` in a
  // comment doesn't cause real production code to be excluded.
  const maskedLines = maskRustLiteralsAndComments(content).split('\n');
  const ranges: Array<[number, number]> = [];

  for (let i = 0; i < maskedLines.length; i++) {
    if (!/#\s*\[\s*cfg\s*\(\s*test\s*\)\s*\]/.test(maskedLines[i])) continue;

    // The attribute must actually be attached to a `mod` — `#[cfg(test)]` also
    // decorates consts, `use` statements, and single functions, and blindly
    // taking "the next `{` within 10 lines" would then swallow the *following*
    // production item's body and drop real code from the analysis.
    let openLine = -1;
    for (let j = i; j < Math.min(maskedLines.length, i + 10); j++) {
      const line = maskedLines[j];
      // Stop at a terminator before any `{`: that means this attribute applied
      // to a non-block item (`#[cfg(test)] const X: &str = "...";`).
      const braceAt = line.indexOf('{');
      const semiAt = line.indexOf(';');
      if (semiAt !== -1 && (braceAt === -1 || semiAt < braceAt)) break;
      if (braceAt !== -1) {
        // Only a module body counts. Look for `mod` between the attribute and
        // the brace.
        const headers = maskedLines.slice(i, j + 1).join(' ');
        if (/\bmod\s+\w+/.test(headers)) openLine = j;
        break;
      }
    }
    if (openLine === -1) continue;

    let depth = 0;
    let closeLine = -1;
    for (let j = openLine; j < maskedLines.length; j++) {
      for (const ch of maskedLines[j]) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      if (depth <= 0) { closeLine = j; break; }
    }

    ranges.push([i + 1, (closeLine === -1 ? maskedLines.length - 1 : closeLine) + 1]);
    i = closeLine === -1 ? maskedLines.length : closeLine;
  }

  return ranges;
}

/**
 * Effective line count for a file.
 *
 * #569 work item: "Never emit a line number beyond the file's length."
 * `content.split('\n')` on a file with a trailing newline yields one extra
 * empty element — which is how a 448-line `jwks.rs` produced a gap ending at
 * line 449, and a 292-line `verify.rs` one ending at 293.
 */
export function countLines(content: string): number {
  if (content.length === 0) return 0;
  const parts = content.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts.length;
}

// ============================================================================
// Rust: real instrumentation
// ============================================================================

/**
 * Find the Rust crate/workspace root for a target, or null if there isn't one.
 *
 * Walks UP from the target rather than only checking the target itself: the
 * common invocation is `analyze(target: "src/")` or a package subdirectory, and
 * `Cargo.toml` lives at the crate root. Checking only the target meant every
 * such call silently skipped real instrumentation and fell through to labelled
 * estimation — a measurement quietly downgraded to a guess.
 *
 * Bounded to `maxDepth` ancestors so a stray target can't walk to `/`.
 */
export function findCargoRoot(targetPath: string, maxDepth = 6): string | null {
  let dir = path.resolve(targetPath);
  try {
    // A target that doesn't exist must NOT resolve to its nearest crate — that
    // would run a full-crate `cargo llvm-cov` for a typo'd path and report the
    // whole crate's coverage as if it were the requested target's.
    if (!fs.existsSync(dir)) return null;
    if (!fs.statSync(dir).isDirectory()) dir = path.dirname(dir);
  } catch {
    return null;
  }

  for (let i = 0; i <= maxDepth; i++) {
    if (fs.existsSync(path.join(dir, 'Cargo.toml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return null;
}

/** Is there at least one `.rs` file in this subtree? Bounded, early-exit. */
function containsRustSources(dir: string, depth = 0): boolean {
  if (depth > 4) return false;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return false; }

  for (const entry of entries) {
    if (entry.isFile() && path.extname(entry.name) === '.rs') return true;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
      if (containsRustSources(path.join(dir, entry.name), depth + 1)) return true;
    }
  }
  return false;
}

/**
 * Does this target belong to a Rust crate/workspace *and* actually contain Rust
 * code?
 *
 * Both halves are load-bearing. Without the upward walk, `analyze(target:"src/")`
 * on a crate skips instrumentation. Without the `.rs` check, a polyglot monorepo
 * with a `Cargo.toml` at its root would route `analyze(target:"frontend/")`
 * through `cargo llvm-cov` and return whole-crate Rust coverage for a
 * TypeScript directory.
 */
export function isRustProject(targetPath: string): boolean {
  const root = findCargoRoot(targetPath);
  if (root === null) return false;
  const resolved = path.resolve(targetPath);
  // The crate root itself always qualifies; a subdirectory must hold Rust code.
  return resolved === root || containsRustSources(resolved);
}

/**
 * Run `cargo llvm-cov` and parse its LCOV output.
 *
 * #569 work item: "Detect language and delegate to real instrumentation where
 * available." LCOV rather than `--json`: it carries per-line `DA:` records (so
 * we get genuine uncovered line numbers for gap detection) plus `BRF:`/`BRH:`
 * and `FNF:`/`FNH:`, and it reuses `parseLcovInfo`, which is already exercised
 * by the JS path.
 *
 * Returns `null` — never throws, never guesses — when cargo or the
 * `cargo-llvm-cov` subcommand is unavailable or the run fails. The caller then
 * decides whether to estimate (and label it) or report nothing.
 */
export async function collectRustCoverage(
  targetPath: string,
  options: { timeoutMs?: number } = {}
): Promise<CollectedCoverage | null> {
  const { execSync } = await import('child_process');
  const timeout = options.timeoutMs ?? 300000;

  // cargo must run from the crate root, not from whatever subdirectory the
  // caller happened to point at.
  const crateRoot = findCargoRoot(targetPath);
  if (!crateRoot) return null;

  try {
    execSync('cargo llvm-cov --version', {
      cwd: crateRoot, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return null; // cargo-llvm-cov not installed — not an error, just unavailable.
  }

  const outPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-rust-cov-')),
    'lcov.info'
  );

  try {
    execSync(`cargo llvm-cov --lcov --output-path ${JSON.stringify(outPath)}`, {
      cwd: crateRoot, timeout, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (!fs.existsSync(outPath)) return null;
    const parsed = parseLcovInfo(fs.readFileSync(outPath, 'utf-8'));

    // Drop test targets from the production-coverage view (#569 contradiction 3).
    const productionFiles = parsed.files.filter(f => !isTestPath(f.path));
    if (productionFiles.length === 0) return null;

    const data = withRecomputedSummary(productionFiles);
    const branchDataCollected = productionFiles.some(f => f.branches.total > 0);

    return {
      data,
      provenance: {
        method: 'cargo-llvm-cov',
        estimated: false,
        branchDataCollected,
        functionDataCollected: productionFiles.some(f => f.functions.total > 0),
        notes: branchDataCollected
          ? []
          : [
              'cargo-llvm-cov reported no branch data (Rust branch coverage requires a ' +
              'nightly toolchain with -Z coverage-options=branch). Branch coverage is ' +
              'reported as null rather than assumed.',
            ],
      },
    };
  } catch {
    return null;
  } finally {
    try { fs.rmSync(path.dirname(outPath), { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

// ============================================================================
// Static estimation (clearly labelled as such)
// ============================================================================

/**
 * Per-language patterns for counting declarations.
 *
 * #569 contradictions 4 and 5 both trace to a single JS-shaped regex,
 * `/\b(function|=>)\b/`, applied to every language. On Rust it matched nothing,
 * so `functionCount` fell to its `Math.max(..., 1)` floor and every file
 * reported 0% function coverage — right next to a 100% branch figure derived
 * from a formula that saturates. Language-specific patterns at least count the
 * right things; the result is still an estimate and still labelled one.
 */
const LANGUAGE_PATTERNS: Record<string, { fn: RegExp; branch: RegExp }> = {
  '.rs': { fn: /\bfn\s+\w+/g, branch: /\b(if|match|while|for)\b|\?\?|\|\||&&/g },
  '.go': { fn: /\bfunc\s+\w*/g, branch: /\b(if|switch|case|for|select)\b|\|\||&&/g },
  '.py': { fn: /\b(def|lambda)\b/g, branch: /\b(if|elif|for|while|except)\b|\band\b|\bor\b/g },
  '.java': { fn: /\b(public|private|protected|static)[\w<>,\s[\]]+\w+\s*\(/g, branch: /\b(if|switch|case|for|while|catch)\b|\|\||&&/g },
  '.rb': { fn: /\bdef\s+\w+/g, branch: /\b(if|elsif|unless|case|when|while)\b|\|\||&&/g },
  default: { fn: /\bfunction\b|=>|\b\w+\s*\([^)]*\)\s*\{/g, branch: /\b(if|switch|case|for|while|catch)\b|\?\?|\|\||&&/g },
};

function patternsFor(ext: string): { fn: RegExp; branch: RegExp } {
  return LANGUAGE_PATTERNS[ext] ?? LANGUAGE_PATTERNS.default;
}

function countMatches(content: string, pattern: RegExp): number {
  return (content.match(new RegExp(pattern.source, pattern.flags)) || []).length;
}

/** Recompute the aggregate summary from a file list. */
function withRecomputedSummary(files: FileCoverage[]): CoverageData {
  const sum = (pick: (f: FileCoverage) => number) => files.reduce((s, f) => s + pick(f), 0);
  const safeDiv = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

  const totalLines = sum(f => f.lines.total);
  const coveredLines = sum(f => f.lines.covered);

  return {
    files,
    summary: {
      line: safeDiv(coveredLines, totalLines),
      branch: safeDiv(sum(f => f.branches.covered), sum(f => f.branches.total)),
      function: safeDiv(sum(f => f.functions.covered), sum(f => f.functions.total)),
      statement: safeDiv(coveredLines, totalLines),
      files: files.length,
    },
  };
}

function walkSourceFiles(targetPath: string): string[] {
  const found: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > 6) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || TEST_DIRS.has(entry.name)) continue;
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
        if (isTestPath(full)) continue;
        found.push(full);
      }
    }
  }

  walk(targetPath, 0);
  return found;
}

/**
 * Static coverage estimate from source shape, for when no instrumentation could
 * be run.
 *
 * This is a *guess*. It is returned with `estimated: true` and
 * `branchDataCollected: false` so no caller can mistake it for a measurement —
 * which is the core of #569, where a caller had "no signal that no
 * instrumentation ran".
 *
 * Fixed here relative to the pre-#569 version:
 *   - trailing-newline off-by-one no longer emits line numbers past EOF
 *   - `#[cfg(test)]` blocks and `tests/` files are excluded from both the
 *     denominator and the gap list
 *   - declaration counting is language-aware instead of JS-shaped
 *   - branch counts are reported as uncollected rather than invented
 */
export function buildEstimatedCoverage(targetPath: string): CollectedCoverage | null {
  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) return null;

  const sourceFiles = walkSourceFiles(targetPath);
  if (sourceFiles.length === 0) return null;

  const files: FileCoverage[] = sourceFiles.map(filePath => {
    let content = '';
    try { content = fs.readFileSync(filePath, 'utf-8'); } catch { /* unreadable — treat as empty */ }

    const ext = path.extname(filePath);
    const totalLines = countLines(content);

    // Lines belonging to inline test modules are not production code and must
    // never be reported as an uncovered production gap.
    const testRanges = findInlineTestRanges(content, ext);
    const isTestLine = (line: number) => testRanges.some(([lo, hi]) => line >= lo && line <= hi);
    const testLineCount = testRanges.reduce((s, [lo, hi]) => s + (hi - lo + 1), 0);
    const productionLines = Math.max(totalLines - testLineCount, 0);

    const patterns = patternsFor(ext);
    const functionCount = countMatches(content, patterns.fn);

    // Presence of *any* test signal for this file: a co-located test module, or
    // a sibling/mirrored test file.
    const hasInlineTests = testRanges.length > 0;
    const hasTestFile = hasSiblingTestFile(filePath);
    const hasTest = hasInlineTests || hasTestFile;

    const branchCount = countMatches(content, patterns.branch);
    const complexityPenalty = Math.min(branchCount * 0.005, 0.15);
    const sizePenalty = Math.min(productionLines * 0.0001, 0.1);
    const coverageRate = Math.max(0.05, Math.min(0.95,
      hasTest ? 0.85 - complexityPenalty - sizePenalty : 0.20
    ));

    const coveredLines = Math.floor(productionLines * coverageRate);

    // Uncovered lines are drawn from real production line numbers only:
    // within [1, totalLines] and never inside a test block.
    const candidates: number[] = [];
    for (let line = 1; line <= totalLines; line++) {
      if (!isTestLine(line)) candidates.push(line);
    }
    const uncoveredLines = candidates.slice(coveredLines);

    return {
      path: filePath,
      lines: { covered: coveredLines, total: productionLines },
      // Branch and function data were NOT collected. Reporting 0/0 keeps the
      // aggregate honest; the provenance flags tell the caller to render null.
      branches: { covered: 0, total: 0 },
      functions: { covered: 0, total: functionCount },
      statements: { covered: coveredLines, total: productionLines },
      uncoveredLines,
      uncoveredBranches: [],
    };
  });

  return {
    data: withRecomputedSummary(files),
    provenance: {
      method: 'static-estimation',
      estimated: true,
      branchDataCollected: false,
      functionDataCollected: false,
      notes: [
        'No instrumentation ran. These numbers are a STATIC ESTIMATE derived from ' +
        'source shape (file size, declaration counts, presence of a test file) — ' +
        'they are not measured coverage and must not be reported as such.',
        'Branch and function coverage were not collected and are reported as null.',
      ],
    },
  };
}

/** Does a sibling or mirrored test file exist for this source file? */
function hasSiblingTestFile(filePath: string): boolean {
  const ext = path.extname(filePath);
  const stem = filePath.slice(0, -ext.length);
  const candidates = [
    `${stem}.test${ext}`,
    `${stem}.spec${ext}`,
    `${stem}_test${ext}`,
    `${stem}.test${ext}`.replace('/src/', '/tests/'),
    `${stem}.spec${ext}`.replace('/src/', '/tests/'),
    `${stem}${ext}`.replace('/src/', '/tests/'),
  ];
  return candidates.some(c => {
    try { return fs.existsSync(c); } catch { return false; }
  });
}
