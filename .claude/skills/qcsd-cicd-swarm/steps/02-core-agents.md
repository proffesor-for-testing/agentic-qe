# Step 2: Spawn Core Agents (Parallel Batch 1)

## Prerequisites
- Step 1 completed with flags

## Instructions

### Spawn ALL THREE core agents in ONE message

| Agent | Domain | Role |
|-------|--------|------|
| qe-quality-gate | quality-assessment | Quality gate enforcement and threshold validation |
| qe-regression-analyzer | test-execution | Regression detection from test results |
| qe-flaky-hunter | test-execution | Flaky test identification and stability analysis |

### Agent 1: Quality Gate
Evaluate all quality gates (coverage thresholds, lint rules, build status, test pass rates). Save to: `${OUTPUT_FOLDER}/02-quality-gates.md`

### Agent 2: Regression Analyzer
Analyze test results for regressions between baseline and current. Save to: `${OUTPUT_FOLDER}/03-regression-analysis.md`

### Agent 3: Flaky Hunter
Identify flaky tests, quarantine recommendations, and stability metrics. Save to: `${OUTPUT_FOLDER}/04-flaky-analysis.md`

## Success Criteria
- [ ] All THREE agents spawned in ONE message
- [ ] Post-spawn confirmation sent

## Output
Confirmation of 3 agents running.

## Navigation
- On success: proceed to Step 3 by reading `steps/03-batch1-results.md`
