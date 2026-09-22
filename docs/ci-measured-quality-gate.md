# Measured quality gates in CI

`aqe ci run --phase quality-gate` evaluates the same seven timestamped evidence
records and shared thresholds as `aqe quality --gate` and MCP
`quality_assess({ runGate: true })`. It does not call a separate domain
`evaluate()` API or derive approval from a static score.

All seven records must be present, valid, and no more than 24 hours old. Missing,
partial, malformed, future-dated, or stale evidence fails the phase. Failed
checks retain their measured values and thresholds in the reports. CI uses
exit 0 for a passing pipeline and 1 for a failing pipeline; the standalone
`quality` command retains its separate near-threshold exit-2 convention.

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
It does not change CI YAML parsing, the other CI phase implementations, or
bind independent metric records to a common revision/run. Evidence production
and those contracts remain separate work; running test generation alone does
not supply all seven required measurements.
