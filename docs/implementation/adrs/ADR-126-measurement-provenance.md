# ADR-126: Measurement provenance — an estimate must never be reported as a measurement

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-126 |
| **Status** | Accepted |
| **Date** | 2026-07-23 |
| **Author** | AQE Core |
| **Review Cadence** | 6 months |
| **Supersedes** | — |
| **Related** | [ADR-121](./ADR-121-provenance-tiered-promotion.md) (provenance tiers: `oracle:test-exec > judge:llm > proxy:structural`), [ADR-113](./ADR-113-evals-are-oracles.md) (evals must actually run), [ADR-117](./ADR-117-frozen-oracle-anchor-set.md). Origin: issue [#569](https://github.com/proffesor-for-testing/agentic-qe/issues/569). |

---

## WH(Y) Decision Statement

**In the context of** AQE tools emitting numbers that developers act on — a
coverage percentage decides what tests get written next, a gap list decides where
someone spends an afternoon — and ADR-121 having already established that
evidence carries a provenance tier internally,

**facing** issue #569, where `coverage_analyze_sublinear` returned, for a real
Rust auth crate with 82 passing tests:

```
lineCoverage: 78.3   branchCoverage: 100   functionCoverage: 0
totalGaps: 11  (all severity "medium", riskScore 0.5, confidence 0.7)
```

None of which was a measurement. All of it came from a static regex heuristic
that (a) used a JS-shaped `/\b(function|=>)\b/` on Rust, so function counts fell
to a `Math.max(…, 1)` floor and every file reported 0% functions; (b) derived
branch coverage from a formula that saturates, producing a flat 100%; (c) had a
`split('\n')` off-by-one that emitted line 449 of a 448-line file; (d) pointed at
`#[cfg(test)]` blocks as "Missing test case" — sending a developer to write tests
for an `assert!` inside a passing test; and (e) analysed `tests/verifier_matrix.rs`
as a coverage target. Ground truth from `cargo llvm-cov` was 69.22% lines /
72.84% functions, with per-file spread from 20% to 96% — the actually useful
signal (security-critical verifier at 96.55%, network-dependent login
orchestration at 20%) entirely absent from a tool that reported a flat 74–84%
band. And crucially: **the caller had no way to tell.** The failure mode was
worse than returning nothing, because `confidence: 0.7` and a `riskScore` were
attached to fabricated gaps, and the top three "AI insights" were derived from
them,

**we decided for** making provenance a first-class, non-optional part of every
measurement-shaped result AQE emits, with three rules:

1. **Label the method.** Every coverage result carries `estimated: boolean`,
   `measured: boolean`, and `coverageMethod`
   (`instrumented-report` | `cargo-llvm-cov` | `static-estimation` | `none`).
   A collector returns `CoverageProvenance` alongside its data; the label is
   attached at the source, not reconstructed downstream.
2. **Never assert an uncollected metric.** `branchCoverage` and
   `functionCoverage` are `number | null`. `null` means "not collected" and
   renders as `_not collected_`, never as `0` and emphatically never as `100`.
   Collapsing "unknown" to a number is what produced the impossible
   100%-branch/0%-function pair.
3. **Propagate the caveat to everything derived.** A gap from an estimate carries
   `estimated: true` and confidence `0.2`, not the `|| 0.7` default. Risk
   assessment on an estimate is `unknown`, not `high`. Insight text leads with
   the caveat rather than restating the guess as a finding.

Plus the substantive fix that removes the need to estimate at all for Rust:
**delegate to real instrumentation where it exists.** A target with a `Cargo.toml`
is measured with `cargo llvm-cov --lcov`, parsed by the existing LCOV parser
(chosen over `--json` because `DA:` records give genuine uncovered line numbers
for gap detection, and it reuses a parser the JS path already exercises).
Test code — `tests/`, `benches/`, `_test.rs`, and brace-matched `#[cfg(test)]`
blocks — is excluded from the production-coverage view on both the measured and
the estimated path.

**and neglected**:

- **Deleting the estimator outright and failing when nothing can be measured.**
  Rejected — a rough signal is genuinely useful for triage on a codebase with no
  test harness at all, *provided it is labelled*. The bug was never that an
  estimate existed; it was that an estimate was indistinguishable from a
  measurement.
- **Keeping the estimate but lowering its confidence number.** Rejected — a
  confidence score is not a substitute for a type-level distinction. A caller
  filtering on `confidence > 0.5` would still have consumed fabricated gaps.
- **Adding a free-text `warning` only.** Rejected as insufficient on its own —
  programmatic callers (and agents) branch on fields, not prose. The `warning`
  stays, but `estimated` is the load-bearing signal.
- **Parsing `cargo llvm-cov --json` segments to derive uncovered lines.**
  Rejected — materially more code and more ways to be subtly wrong, for output
  the LCOV path already gives us exactly.

**to achieve** the standard #569 asked for in its own "Done looks like": either
the tool runs real instrumentation, or it detects that it cannot and says so —
rather than emitting numbers with a confidence score attached,

**accepting that** Rust measurement requires the user to have `cargo-llvm-cov`
installed (we detect its absence, say so, and name the install command rather
than silently degrading); that Rust branch coverage additionally needs a nightly
toolchain, so `branchCoverage` will often legitimately be `null` on measured Rust
runs too; that brace-matching `#[cfg(test)]` is naive about braces inside string
literals (over-excluding a few lines of test code is far cheaper than reporting
test code as a production gap); and that `branchCoverage`/`functionCoverage`
becoming nullable is a visible contract change for consumers of
`CoverageAnalyzeResult`.

---

## The general rule

> **Any tool that emits a number a human will act on must state how that number
> was obtained. If it was not measured, it must not be shaped like a
> measurement.**

Concretely, for new work:

- return provenance from the collector, not from the presentation layer;
- make "not collected" representable in the type (`| null`), not encoded as a
  sentinel value that reads as data;
- do not attach a default confidence to a derived finding whose input was a
  guess — inherit the input's confidence instead;
- when instrumentation exists for the target language, run it before estimating.

This complements ADR-121's provenance tiers, which grade *evidence quality*
(`oracle:test-exec > judge:llm > proxy:structural`). ADR-126 is the same idea
applied to *metrics*: a static estimate is `proxy:structural` and must be labelled
as such all the way to the caller.

---

## Companion decision: measuring coverage executes the analyzed repository

Raised by the adversarial review and worth stating explicitly, because it is easy
to miss: **collecting real coverage means running the project's own tests**, and
that means executing code from the analyzed repository.

- the JS/TS path runs `npx vitest|jest|nyc` with `cwd` = the target — the test
  suite plus any npm lifecycle scripts (pre-existing behavior);
- the Rust path added here runs `cargo llvm-cov`, which compiles and runs test
  binaries, executes `build.rs`, and honors any `runner`/linker directive in that
  repository's `.cargo/config.toml`.

For a trusted project — your own repo, CI on your own code — this is precisely
what the caller wants, and it is how coverage has always been collected. It is
nevertheless surprising for an operation that *reads* like a static query, and an
agent can be pointed at an untrusted checkout.

**Decision:** keep execution as the default (it is the only way to produce a
measurement, and refusing by default would push every result back to the
estimation path this ADR exists to discourage), but make it opt-out and disclosed:

- `AQE_COVERAGE_NO_EXEC=1` disables *all* build-tool execution. Coverage reports
  already on disk are still parsed; everything else degrades to clearly-labelled
  static estimation, and the guidance text says why.
- The result already discloses what ran, after the fact, via `coverageMethod`
  (`cargo-llvm-cov` / `instrumented-report` / `static-estimation` / `none`).

**Rejected:** requiring opt-*in* for execution — it would make measured coverage
the exceptional case and estimated coverage the norm, which inverts this ADR's
whole point. Also rejected: sandboxing the build tool, which is a much larger
change than this issue warrants and would not be reliable across toolchains.

**Watch:** the same reasoning applies to any future language delegation (Go,
Python, Java). Each must honor the same switch.

---

## Companion change: security scan honesty

The same issue noted that `security_scan_comprehensive` on the same crate
returned one informational finding and zero at every real severity — which,
combined with the coverage output, "reads as *this crate is clean and adequately
covered*", something neither tool had established. Full SAST is implemented for
JS/TS only; other languages get cross-language pattern matching. The scan result
now carries `deepAnalysisPerformed` and `analysisDepth`, and when no
language-specific analysis ran it says so explicitly: a zero-finding result means
"nothing matched a generic pattern", not "no vulnerabilities".

---

## Consequences

- **Positive:** Rust crates get real `cargo llvm-cov` measurements; no result can
  be mistaken for a measurement it isn't; gap lists no longer point at test code
  or past end-of-file; "clean scan" no longer reads as "verified clean".
- **Negative / watch:** `branchCoverage`/`functionCoverage` are now nullable, a
  contract change for downstream consumers; users must install `cargo-llvm-cov`
  to get measured Rust coverage; other languages (Go, Python, Java) still fall
  back to labelled estimation and are the obvious next delegation targets.
- **Reversible:** provenance fields are additive; the nullable metrics are the
  only breaking part, and they are breaking in the safe direction (a consumer
  that ignores `null` gets a visible error rather than a silent wrong number).

---

## Follow-ups

- Delegate to `go test -coverprofile`, `pytest --cov`, and JaCoCo the same way
  Rust is delegated here.
- Audit other AQE tools that emit metrics for the same pattern — anything
  computing a percentage from a regex heuristic is a candidate.
