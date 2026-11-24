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
  every uncommitted path `git status` reports (tracked changes and untracked,
  non-ignored files). `.agentic-qe/` and `.aqe-ci-output/` are excluded;
- `id`: a SHA-256 over the scheme version, project, HEAD and fingerprint.

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
| `mismatched` | the latest receipt is bound to a different candidate (another commit, other uncommitted content, or another project) |
| `stale` / `future-dated` / `malformed` | this candidate's receipt is older than 24 hours, dated in the future, or invalid |
| `candidate-unavailable` | the project is not a Git work tree, or `git` is unavailable, so no candidate can be identified |
| `unpaired-failed-run` | coverage from a run with failing tests lacks that run's `testsPassing` |

Independent measurements of the same candidate combine; they need not come
from one run. A measured verdict records the `candidate`, the `receipts` it used
(receipt id, key, time, source and run per metric) and the effective
`thresholds`, on the CLI JSON output, the CI phase artifact, the MCP result and
the worker's stored `quality-gate:current` verdict. Changing a threshold
re-evaluates the same receipts into a new verdict.

### Migration

Evidence recorded before this contract has no candidate and is reported as
`legacy-unbound`: it can no longer pass the gate. Re-run the measurements on
the checkout you want to gate (for example `aqe test execute`, the coverage
run and the security scan, plus your own producers for the other metrics),
then run the gate on that same checkout without changing it in between. Keep
generated output that is not part of the candidate (reports, coverage
directories, a non-default CI output directory) in `.gitignore`; any other
untracked or modified file changes the candidate. Outside a Git work tree the
gate cannot identify a candidate and always reports insufficient evidence.

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
