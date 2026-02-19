# How AQE's Regression Testing Actually Works

The system lives in `v3/src/test-scheduling/` and is composed of 5 real components wired together by a pipeline.

## The Pipeline (`pipeline.ts:204-260`)

The `TestSchedulingPipeline.run()` method is the entry point. It executes these steps in order:

```
1. GitAwareTestSelector.selectAffectedTests()  ->  which tests?
2. PhaseScheduler.run() or runWithSelectedTests()  ->  execute them
3. FlakyTestTracker.analyze()  ->  track flakiness
4. saveFlakyTracker()  ->  persist history to disk
5. GitHubActionsReporter.writeOutput()  ->  report to CI
```

## Step 1: Deciding Which Tests to Run

**`GitAwareTestSelector`** (`git-aware/test-selector.ts`) does this:

1. **Runs `git diff --name-status <baseRef> HEAD`** (line 212-256) to get every file that changed, classifying each as `added`, `modified`, `deleted`, or `renamed`.

2. **Checks for config file changes first** (line 288-296). If `vitest.config`, `jest.config`, `tsconfig`, or `package.json` changed, it **immediately returns `runAllTests: true`** -- no further analysis needed, the entire suite runs.

3. **Delegates to `ImpactAnalyzerService.getImpactedTests()`** (line 309) for the actual test selection. This is **mandatory** -- the constructor throws if no `impactAnalyzer` is provided (line 133-138). There is no fallback to pattern matching.

4. **If impact analysis fails**, it returns `runAllTests: true` as a safety net (line 311-321).

5. **Deduplicates results** with `[...new Set(selectedTests)]` (line 171).

## Step 2: How Impact Analysis Actually Works

**`ImpactAnalyzerService`** (`domains/code-intelligence/services/impact-analyzer.ts`) does the real work:

### `getImpactedTests()` (line 170-224)

For each changed file:

1. If the file **is itself a test file** (matches `.test.ts`, `.spec.ts`, `_test.py`, etc.), it adds it directly.

2. Queries the **KnowledgeGraphService** for `incoming` dependencies at depth 3 (line 182-186) -- "what files import/depend on this changed file?" For every node returned that is a test file, it's added to the set.

3. **Searches by naming convention** (line 197-217) -- constructs patterns like `baseName.test`, `baseName.spec`, `test_baseName` and searches the memory backend for matching knowledge graph nodes.

### `analyzeDirectImpact()` (line 347-387)

Queries the knowledge graph with `direction: 'incoming', depth: 1` to find files that directly import the changed file.

### `analyzeTransitiveImpact()` (line 389-442)

**BFS traversal** starting from direct dependents, expanding `incoming` edges level by level up to `maxDepth` (default 5). Uses a `visited` set to avoid cycles and a queue for breadth-first processing.

### Risk Scoring Per File (`calculateFileRiskScore`, line 444-472)

- `inDegree / 20` capped at 0.3 -- many dependents = higher risk
- `outDegree / 30` capped at 0.2 -- many dependencies = more complex
- `+0.3` if on a critical path (`**/auth/**`, `**/security/**`, `**/payment/**`, `**/api/**`, `**/core/**`)
- `+0.2` if it's an entry point (`index.ts`, `main.ts`, `app.ts`, `server.ts`)
- **Distance decay**: `score * 0.8^(distance-1)` -- closer files are higher risk

### Overall Risk Level (`calculateRiskLevel`, line 229-272)

Weighted composite:

| Factor | Weight | How measured |
|--------|--------|-------------|
| Direct impact | 40% | `min(1, directImpactCount / 10)` |
| Transitive impact | 20% | `min(1, transitiveImpactCount / 20)` |
| Test coverage gaps | 20% | Inverse -- fewer tests per impacted file = higher risk |
| Critical path files | 15% | `min(1, criticalFileCount / 5)` |
| Avg dependency risk | 5% | Mean `riskScore` across all impacted files |

Maps to severity: `>=0.8` critical, `>=0.6` high, `>=0.4` medium, `>=0.2` low, else info.

## Step 3: Phased Execution

**`PhaseScheduler`** (`phase-scheduler.ts`) runs phases sequentially with these defaults:

| Phase | Patterns | Parallelism | Timeout | Pass gate | Coverage gate |
|-------|----------|-------------|---------|-----------|---------------|
| Unit | `**/*.test.ts` excluding integration/e2e | 8 workers | 60s | 99% | 80% |
| Integration | `**/*.integration.test.ts` | 4 workers | 300s | 95% | 70% |
| E2E | `**/*.e2e.test.ts` | 2 workers | 600s | 90% | 50% |

When running with selected tests (not all), the pipeline filters selected files against each phase's glob patterns (line 301-324) -- so a selected integration test only runs during the integration phase.

`failFast` is `true` by default -- if a phase fails its quality gate, subsequent phases don't run.

## Step 4: Flaky Test Tracking

**`FlakyTestTracker`** (`flaky-tracking/flaky-tracker.ts`) records every test result and calculates per-test flakiness:

### Flakiness Formula (line 282-303)

```
flakyRatio = flakyCount / totalRuns
inconsistencyScore = min(passRatio, 1 - passRatio) * 2
flakinessScore = min(1, flakyRatio * 3 + inconsistencyScore)
```

A test that passes on retry (`retries > 0 && passed`) is recorded as a flaky event. A test needs at least 5 runs before it can be classified. Threshold is 10% -- above that, it's flaky.

History is persisted to a JSON file on disk and loaded on next run.

## Step 5: Background Regression Monitoring

**`RegressionMonitorWorker`** (`workers/regression-monitor.ts`) runs every 10 minutes and compares current metrics against the previous baseline:

| Metric | Threshold to trigger | Severity |
|--------|---------------------|----------|
| Test pass rate drop | >1% | >5% = critical, >2% = high, else medium |
| Line coverage drop | >2% | >5% = high, else medium |
| Branch coverage drop | >3% | >5% = high, else medium |
| Test duration increase | >20% | >50% = high, else medium |
| Quality score drop | >5 points | >10 = critical, else high |
| New test failures | any | >5 = critical, >2 = high, else medium |

Health score starts at 100, deducts per regression: critical -25, high -15, medium -8, low -3.

**Note:** The `collectCurrentSnapshot()` method (line 120-136) currently returns hardcoded values -- this is a placeholder for integration with the actual test runner metrics. The detection logic in `detectRegressions()` is fully implemented.

## What's Real vs Placeholder

| Component | Status |
|-----------|--------|
| `GitAwareTestSelector` -- git diff, file mapping | Fully implemented |
| `ImpactAnalyzerService` -- graph traversal, risk scoring | Fully implemented |
| `KnowledgeGraphService` -- dependency graph | Implemented (separate service) |
| `PhaseScheduler` -- sequential phase execution with quality gates | Fully implemented |
| `FlakyTestTracker` -- flakiness scoring, history, quarantine | Fully implemented |
| `RegressionMonitorWorker.collectCurrentSnapshot()` -- metric collection | Placeholder (hardcoded values) |
| `GitHubActionsReporter` -- CI output | Implemented (separate module) |
