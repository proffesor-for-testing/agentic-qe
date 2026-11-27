# Measured quality gates in CI

`aqe ci run --phase quality-gate` evaluates the same seven timestamped evidence
records and shared thresholds as `aqe quality --gate` and MCP
`quality_assess({ runGate: true })`. It does not call a separate domain
`evaluate()` API or derive approval from a static score.

All seven records must be present, valid, no more than 24 hours old, and bound
to the candidate being gated (see below). Missing, partial, malformed,
future-dated, stale, legacy-unbound or mismatched evidence fails the phase. Failed
checks retain their measured values and thresholds in the reports. CI uses
exit 0 for a passing pipeline and 1 for a failing pipeline; the standalone
`quality` command retains its separate near-threshold exit-2 convention, and
exits 3 when evidence is insufficient (a metric is absent, stale or malformed,
so the gate was not evaluated).

When evidence is insufficient, every surface reports the same shape:
`status`/`evidenceStatus` `insufficient-evidence`, `passed: false`,
`gateEvaluated: false`, `unmeasured` naming each unusable metric, `problems`
giving each metric's reason code, and the `candidate` that was judged. MCP
`quality_assess({ runGate: true })` returns this as `data` alongside
`success: false` and the loader's error message; the CI phase artifact carries
the same fields.

## Candidate-bound evidence

Each evidence record is a versioned measurement receipt (`schemaVersion: 2`)
with an immutable `receiptId`. When a producer records a measurement it binds
the receipt to the **candidate** it observed:

- `project`: the real path of the AQE project root;
- `head`: the Git HEAD commit (`unborn` before the first commit);
- `fingerprint`: `clean`, or a SHA-256 over the status and current content of
  every uncommitted path: tracked changes, untracked non-ignored files,
  submodules and nested repositories (recursively), and assume-unchanged or
  skip-worktree files that differ from the index. Unreadable or vanished files
  are folded in as a marker. `.agentic-qe/` and `.aqe-ci-output/` at the AQE
  project root, and paths AQE commands register as their own output (see
  below), are excluded;
- `id`: a SHA-256 over the scheme version, project, HEAD and fingerprint;
- `dirtyDigests`, `dirtyGroups`, `dirtyCount`: per-path and per-first-segment
  digests of the uncommitted paths, so a mismatch reason can name what was
  added, removed or changed since the measurement;
- `ignored` / `rejectedIgnores`: recorded AQE outputs that were left out (with
  their hashes; not part of the id) or not.

Git runs with `core.fsmonitor` and the untracked cache disabled, so no user
fsmonitor hook runs.

The gate resolves the candidate to judge independently, from the checkout at
gate time, and reads only that candidate's keys
(`quality-evidence:v2:<candidate-id>:<metric>:latest`). Another candidate's
writes never land there, so an interleaved or partial publication for one
candidate cannot produce a mixed set for another. Every enforced metric must
have fresh, well-formed evidence bound to that candidate before any threshold
is applied. Otherwise the gate reports insufficient evidence, with one
`problems` entry per metric:

| `code` | Meaning |
|---|---|
| `missing` | nothing was ever recorded for the metric |
| `legacy-unbound` | only a pre-candidate (`schemaVersion: 1`) record exists |
| `mismatched` | the latest receipt is bound to a different candidate (another commit, other uncommitted content, or another project); the reason names the commits or the uncommitted paths |
| `stale` / `future-dated` / `malformed` | this candidate's receipt is older than 24 hours, dated in the future, or invalid |
| `candidate-unavailable` | the project is not a Git work tree, or `git` cannot read it, so no candidate can be identified; the reason carries git's own error |
| `unpaired-failed-run` | coverage from a run with failing tests lacks that run's `testsPassing` |

Independent measurements of the same candidate combine; they need not come
from one run. A measured verdict records the `candidate`, the `receipts` it used
(receipt id, key, time, source and run per metric) and the effective
`thresholds`, on the CLI JSON output, the CI phase artifact, the MCP result and
the worker's stored `quality-gate:current` verdict. Changing a threshold
re-evaluates the same receipts into a new verdict.
When the worker finds the evidence insufficient it replaces an earlier
`quality-gate:current` verdict with an `insufficient-evidence` status for the
current candidate, so another candidate's pass does not linger; it reports a
regression or improvement only between verdicts of the same candidate.

### Producers

Shipped producers that record bound receipts today:

- `testsPassing`: `aqe test execute` and MCP `test_execute_parallel`;
- `coverage`: the coverage run of those test executions, MCP
  `coverage_analyze_sublinear`, `aqe coverage` and the CI coverage phase. An
  existing report is recorded only when it is complete for the target and not
  older than its sources: a STALE or partial report is shown, but its figure is
  never bound to the current checkout. Recording is fail-closed: a caller that
  does not state the report is complete records no coverage receipt (the
  internal `qe/coverage/analyze` tool, which does not check freshness, never
  does).

`criticalBugs`, `codeSmells`, `securityVulnerabilities`, `technicalDebt` and
`duplications` have no shipped CLI or MCP producer (#1009);
`security_scan_comprehensive` reports findings but records no
`securityVulnerabilities` evidence. There is no public command for an external
tool to write a bound receipt yet; programmatic callers use
`writeQualityEvidence` from the quality-assessment domain, which binds the
receipt to the checkout of the AQE project root at the time of the call.

### Keeping the candidate stable

- Measure and gate the **same** checkout. Any commit, any edit, and any new
  untracked file that Git does not ignore changes the candidate.
- Keep generated output out of the candidate: add coverage directories, test
  reports and similar files to `.gitignore`.
- AQE's own output is left out by content. Every file `aqe ci run` writes into
  its output directory and every report any `aqe` command writes with `-o`
  (for example `aqe test execute -F junit -o junit.xml`,
  `aqe coverage -F json -o cov.json`, `aqe quality --gate -o gate.json`) are
  recorded after the write succeeds in
  `.agentic-qe/candidate-ignore.json` as path → SHA-256 of what AQE wrote
  (never a directory, never tracked content, never a path outside the project).
  An uncommitted path is left out only while it is in that manifest, is still
  untracked, and still holds exactly that content; it then counts as if it were
  absent, so the exclusion does not change the candidate id: a measurement
  taken before AQE wrote its outputs matches a gate run after it. Anything else
  is fingerprinted normally: files AQE did not write (even inside its output
  directory), a report the user later overwrote, and tracked files. Recorded
  files that no longer exist are pruned; recorded files that are not left out
  are listed in the candidate's `rejectedIgnores`, and the ones that are left
  out in `ignored` (path and hash), so both are visible in every verdict.
- A shell redirect into the checkout (`aqe quality --gate -F json > gate.json`)
  creates the file before the gate runs, so the gate reports `mismatched` and
  names `gate.json`. Use `-o <file>`, or redirect outside the checkout.
- The same applies to `aqe prove`, which attests the receipts of the current
  checkout and reports the gate's verdict for it: `aqe prove -o proof.json`
  keeps the candidate stable, while `aqe prove > proof.json` inside the
  checkout creates the file before `prove` runs: that attestation and every
  later `aqe prove` or `aqe quality --gate` find only `mismatched` evidence
  (all flags false, gate exit 3) while the file is there.
- In a CI container whose checkout is owned by another user, Git refuses the
  repository ("detected dubious ownership") and the candidate is unavailable.
  Run `git config --global --add safe.directory <checkout>` before AQE.

### Limits

- The candidate is the **whole Git repository** at the AQE project root's work
  tree: in a monorepo, a change in any package changes every package's
  candidate.
- Git-ignored inputs (for example a local `.env` or a generated file the tests
  read) are not part of the candidate.
- A receipt describes the checkout as it is when the producer records it; an
  edit made while a measurement runs is not detected.
- The environment and tool configuration are not part of the candidate.
- The manifest of recorded AQE outputs holds at most 500 files; outputs beyond
  that are not recorded, so they count as uncommitted content (stricter only).
- Two cases are only ever stricter than necessary: an unchanged symlink under
  skip-worktree always counts as uncommitted, and the content of an unreadable
  file is not hashed (it is folded in as an `unreadable:<code>` marker, so a
  content change in a file that stays unreadable is not seen, but the file's
  presence is).

### Migration

Evidence recorded before this contract has no candidate and is reported as
`legacy-unbound`: it can no longer pass the gate. Re-run the measurements on
the checkout you want to gate (see Producers), then run the gate on that same
checkout without changing it in between. Outside a Git work tree the gate
cannot identify a candidate and always reports insufficient evidence.

## Enforcement and partial runs

With enforcement enabled, at least one selected quality gate must run and every
selected gate must pass. Filtering out the gate with `--phase`, disabling it,
or stopping before it executes cannot report a passed gate.

Use `--no-quality-gate` for an explicitly advisory run, including a partial
pipeline that does not select a gate. A gate that does run still evaluates the
evidence and reports its actual result. A failed advisory gate produces a
pipeline warning and does not stop later phases. Failures in other phases
still fail the pipeline.

JSON reports expose `qualityGatePassed` as the actual evaluation result,
`qualityGateStatus` as `passed`, `failed`, or `not-run`, and
`qualityGateEnforced` separately. Text and Markdown also distinguish “Not run”
and advisory operation from a passed gate.

## Artifacts and scope

`quality-gate.json` contains the aggregate gate result and is reset to not-run
before phase execution. Individual executed gates write
`quality-gate-<phase-number>.json`, so a later passing gate cannot overwrite an
earlier failure. A failed evidence load also writes a failed artifact, replacing
any previous result for that phase number. The aggregate artifact and current
run's referenced phase artifacts are authoritative; unreferenced files from
older runs are historical.

This uses the canonical evidence contract and fixed shared thresholds. The
legacy CI `quality_gate.thresholds` fields do not configure that evaluator.
It does not change CI YAML parsing or the other CI phase implementations.
Evidence production remains separate work; running test generation alone does
not supply all seven required measurements.
