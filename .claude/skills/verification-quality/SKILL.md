---
name: "Verification & Quality Assurance"
description: "Verify agent-written changes before they are kept: run the tests, measure coverage, scan for vulnerabilities, apply AQE's fail-closed quality gate, and revert with git when the verdict is a failure. Use when an agent's output needs a measured pass/fail decision rather than a self-reported one."
---

# Verification & Quality Assurance Skill

## What This Skill Does

This skill turns "the agent says it works" into a measured verdict:

- **Evidence first**: run the tests and coverage so the gate has real measurements.
- **Fail-closed gate**: `aqe quality --gate` passes only on measured evidence; a missing metric is *insufficient evidence*, never a pass.
- **Security check**: SAST and dependency advisories before a change is kept.
- **Rollback with git**: when the verdict fails, revert the change with ordinary git commands.

Every command below exists in the AQE CLI (`aqe`) or in git. The skill does not depend on Ruflo.

## Prerequisites

- AQE initialized in the project (`aqe init --auto`)
- A git repository (for review and rollback)
- `jq` for reading JSON verdicts in scripts

## Quick Start

```bash
# 1. Produce evidence: run the tests (records testsPassing for the gate)
aqe test execute tests/ --format json --output .agentic-qe/results/tests.json

#    Measure coverage with your runner's instrumentation, then analyze it
npx vitest run --coverage            # or: npx jest --coverage
aqe coverage src/ --gaps --threshold 80 --format json --output .agentic-qe/results/coverage.json

# 2. Scan the change
aqe security --sast --target src/ --format json --output .agentic-qe/results/security.json

# 3. Ask for a verdict
aqe quality --gate --format json --output .agentic-qe/results/gate.json
echo "gate exit code: $?"
```

## The Quality Gate

`aqe quality --gate` evaluates the measured evidence and reports a verdict with one of four exit codes:

| Exit code | Meaning | What to do |
|---|---|---|
| `0` | Passed, every check has more than five points of headroom | Keep the change |
| `1` | One or more measured checks failed | Fix or revert (see Rollback) |
| `2` | Passed, but at least one check is within five points of its threshold | Keep, and flag the narrow margin |
| `3` | Insufficient evidence: a metric is missing, stale or malformed, so the gate was not evaluated | Produce the missing evidence and run again. This is **not** a pass |

The JSON output names what was not measured and how to measure it:

```bash
aqe quality --gate --format json | jq '{status, passed, unmeasured, recommendations}'
```

```json
{
  "status": "insufficient-evidence",
  "passed": false,
  "unmeasured": ["coverage", "testsPassing"],
  "recommendations": [
    "Insufficient evidence: testsPassing not measured — run the test suite (test_execute_parallel, or `aqe test execute`)."
  ]
}
```

Never report exit code `3` as a pass: say which metrics are missing instead of giving a score.

**Current limit.** The gate also requires `criticalBugs`, `codeSmells`, `securityVulnerabilities`, `technicalDebt` and `duplications`, and no AQE CLI command or MCP tool records those yet. Until they are supplied from your own measurement, expect exit code `3` even when tests and coverage are measured. Until then, decide on the evidence you did measure: the test run's exit code, `aqe coverage` against its threshold, and the security findings. Say plainly which gate metrics were not measured. The CI example below works this way.

### Pinned-checklist verdicts

For a two-gate, three-valued verdict on one artifact against a frozen checklist (the anchor ships with agentic-qe, so this works in any project from the release after 3.15.22; #1454):

```bash
# List the pinned checklists
aqe quality-gate --list

# Judge an artifact, with the mutation-oracle result
aqe quality-gate --checklist <id> --artifact-file path/to/artifact.ts --oracle-file oracle.json --format json
```

Exit codes: `0` pass, `1` fail, `3` inconclusive. Without `--oracle-file` (or `--oracle-passed`) the mechanical gate fails closed, and without a frontier LLM provider the judge is unavailable, so the verdict is never a pass.

## Verification Checks

### Tests

```bash
# Run one directory or file; the framework is read from each project's jest/vitest config
aqe test execute tests/unit/ --format json

# A monorepo package
aqe test execute src/ --project-root packages/api --format junit --output junit.xml
```

### Coverage

```bash
# Gaps below the threshold, with risk scoring
aqe coverage src/ --gaps --risk --threshold 80

# Machine-readable
aqe coverage src/ --format json --output coverage.json
```

### Security

```bash
# Static analysis of the source tree
aqe security --sast --target src/

# Known advisories for package.json dependencies (sends package names and versions to OSV)
aqe security --dependencies

# SARIF for code-scanning upload
aqe security --sast --format sarif --output security.sarif
```

### Audit trail

```bash
# Verify the integrity of AQE's witness chain of recorded decisions
aqe audit verify
```

## Rollback

AQE does not rewrite your history. When the gate fails (exit `1`), revert with git:

```bash
# See what the agent changed
git status
git diff

# Discard uncommitted changes to specific files
git restore src/broken-file.ts

# Undo the last commit but keep its changes in the working tree for repair
git reset --soft HEAD~1

# Revert a pushed commit with a new commit
git revert <commit>
```

Before discarding work, save it on a branch (`git switch -c wip/rejected-change && git add -A && git commit -m "rejected by gate"`) so it can be inspected later; `git add -A` also keeps new files the agent created.

## CI/CD Integration

### GitHub Actions

```yaml
name: Quality Verification

on: [push, pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx agentic-qe init --auto
      # Fails the job when a test fails; also writes the coverage report
      - run: npx vitest run --coverage
      # Records testsPassing for the gate
      - run: npx agentic-qe test execute tests/ --format junit --output junit.xml
      - name: Coverage threshold
        run: |
          set +e
          npx agentic-qe coverage src/ --threshold 80 --format json --output coverage.json
          code=$?
          # 0 = meets, 2 = within 5 points; 1 = below threshold or error; 3 = no coverage measured
          if [ "$code" -eq 1 ] || [ "$code" -eq 3 ]; then exit 1; fi
      - name: Quality gate (report only until every gate metric is measured)
        run: |
          set +e
          npx agentic-qe quality --gate --format json --output gate.json
          code=$?
          jq '{status, passed, unmeasured}' gate.json
          # 1 = a measured check failed. 3 = not evaluated: listed as unmeasured, not a pass.
          if [ "$code" -eq 1 ]; then exit 1; fi
          if [ "$code" -eq 3 ]; then echo "::warning::Quality gate not evaluated: $(jq -r '.unmeasured | join(", ")' gate.json) not measured"; fi
      - uses: actions/upload-artifact@v4
        with:
          name: verification-report
          path: |
            gate.json
            coverage.json
            junit.xml
```

### Pre-commit hook

```bash
#!/bin/bash
# .git/hooks/pre-commit: block on a measured failure, warn on missing evidence.
# Until every gate metric can be recorded (see Current limit), the gate exits 3 and this hook only warns;
# add your test command here to block on failing tests.
gate=$(mktemp)
trap 'rm -f "$gate"' EXIT
npx agentic-qe quality --gate --format json --output "$gate"
code=$?
if [ "$code" -eq 1 ]; then
  echo "❌ Quality gate failed:"
  jq -r '.checks[] | select(.passed == false) | "  \(.name): \(.value) (threshold \(.threshold))"' "$gate"
  exit 1
fi
if [ "$code" -eq 3 ]; then
  echo "⚠️  Quality gate not evaluated; not measured: $(jq -r '.unmeasured | join(", ")' "$gate")"
fi
```

## Verifying Ruflo itself (optional)

If the project also uses Ruflo, `ruflo verify` checks the **installed Ruflo package** against Ruflo's signed witness manifest. It does not verify your code:

```bash
npx ruflo@3.76.0 verify --json
```

## Best Practices

1. **Measure before you judge**: run the tests and coverage before the gate; an unmeasured metric is a missing verdict, not a pass.
2. **Respect exit code 3**: report the missing evidence instead of inventing a score.
3. **Keep thresholds in config, not prompts**: an agent should not lower a threshold to pass.
4. **Attach evidence**: link the test results, coverage report and gate JSON to the PR.
5. **Revert with git**: keep rejected work on a branch so the failure can be studied.

## Related Skills

- `qe-quality-assessment`: quality gates and deployment readiness
- `qe-test-execution`: running and retrying test suites
- `qe-coverage-analysis`: coverage gaps and risk
- `security-testing`: security scanning practice
