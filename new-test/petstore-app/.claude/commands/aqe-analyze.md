---
name: aqe-analyze
description: Analyze test coverage, identify gaps, and optimize coverage strategy using sublinear algorithms
---

# AQE Analyze Coverage

Analyze test coverage, identify gaps, and use sublinear algorithms to optimize coverage strategy.

## Usage

```bash
aqe analyze [target] [options]
# or
/aqe-analyze [target] [options]
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `target` | string | `coverage` | Analysis type: coverage, quality, gaps, trends, risk |
| `--path` | path | `./src` | Source code path to analyze |
| `--baseline` | path | - | Baseline coverage file for comparison |
| `--threshold` | number | `95` | Minimum coverage threshold |
| `--sublinear` | boolean | `true` | Use sublinear optimization algorithms |
| `--format` | string | `text` | Output format: text, json, html, markdown |
| `--output` | path | `stdout` | Output file path |
| `--diff` | boolean | `false` | Show coverage diff from baseline |

## Examples

### Basic Coverage Analysis

```bash
aqe analyze coverage
```

Analyzes current test coverage for the entire codebase.

### Gap Identification

```bash
aqe analyze gaps --path src/services --threshold 98
```

Identifies coverage gaps in the services directory with high threshold.

### Trend Analysis

```bash
aqe analyze trends --baseline coverage-baseline.json --diff
```

Compares current coverage against baseline and shows changes.

### Risk Assessment

```bash
aqe analyze risk --sublinear --format html --output risk-report.html
```

Generates HTML risk assessment report using sublinear algorithms.

### Quality Analysis

```bash
aqe analyze quality --path tests/ --format json
```

Analyzes test quality metrics including flakiness and reliability.

## Integration with Claude Code

### Spawning Coverage Analyzer Agent

```javascript
// Use Claude Code's Task tool to spawn the coverage analyzer agent
Task("Analyze coverage gaps", `
  Perform comprehensive coverage analysis:
  - Use sublinear algorithms for O(log n) performance
  - Identify critical coverage gaps
  - Prioritize gaps by risk and impact
  - Generate optimization recommendations

  Store analysis results in memory: aqe/coverage-analysis/results
  Coordinate with test generator to fill gaps.
`, "qe-coverage-analyzer")
```

### Coordinated Analysis Workflow

```javascript
// Analyze coverage and generate missing tests
[Single Message]:
  Task("Analyze coverage gaps", "Find critical gaps using sublinear algorithms", "qe-coverage-analyzer")
  Task("Generate missing tests", "Create tests for identified gaps", "qe-test-generator")

  TodoWrite({ todos: [
    {content: "Analyze coverage data", status: "in_progress", activeForm: "Analyzing coverage"},
    {content: "Identify critical gaps", status: "in_progress", activeForm: "Identifying gaps"},
    {content: "Generate tests for gaps", status: "pending", activeForm: "Generating tests"},
    {content: "Validate coverage improvement", status: "pending", activeForm: "Validating improvement"}
  ]})
```

## Agent Coordination

### Primary Agent
- **qe-coverage-analyzer**: Main agent responsible for coverage analysis

### Supporting Agents
- **qe-test-generator**: Generates tests for identified gaps
- **qe-quality-gate**: Validates coverage against thresholds

### Coordination Flow

```
1. Pre-Task Hook
   ├─> Retrieve current coverage data
   ├─> Retrieve historical baseline
   └─> Load source code analysis

2. Coverage Analysis
   ├─> Parse coverage data using sublinear algorithms
   ├─> Identify coverage gaps with priority ranking
   ├─> Calculate coverage metrics and trends
   ├─> Generate optimization recommendations
   └─> Perform risk assessment

3. Post-Task Hook
   ├─> Store analysis results
   ├─> Update coverage gaps list
   ├─> Store recommendations
   ├─> Train neural patterns
   └─> Notify fleet of findings
```

## Memory Operations

### Input Memory Keys

```bash
# Retrieve current coverage data
npx claude-flow@alpha memory retrieve --key "aqe/coverage/current"

# Retrieve coverage baseline
npx claude-flow@alpha memory retrieve --key "aqe/coverage/baseline"

# Retrieve source code analysis
npx claude-flow@alpha memory retrieve --key "aqe/source-code"
```

### Output Memory Keys

```bash
# Store analysis results
npx claude-flow@alpha memory store \
  --key "aqe/coverage-analysis/results" \
  --value '{"coverage": 93.5, "gaps": 12, "critical": 3}'

# Store identified gaps
npx claude-flow@alpha memory store \
  --key "aqe/coverage-gaps" \
  --value '[{"file": "auth.ts", "line": 45, "priority": "critical"}]'

# Store recommendations
npx claude-flow@alpha memory store \
  --key "aqe/coverage-recommendations" \
  --value '{"action": "generate", "targets": ["auth.ts:45-60"]}'
```

## Hooks and Coordination

### Pre-Task Hook

```bash
npx claude-flow@alpha hooks pre-task \
  --description "Analyze coverage for ${target}" \
  --agent "qe-coverage-analyzer"
```

### Post-Task Hook

```bash
npx claude-flow@alpha hooks post-task \
  --task-id "${ANALYSIS_ID}" \
  --results "${ANALYSIS_RESULTS}"
```

### Notify Fleet

```bash
npx claude-flow@alpha hooks notify \
  --message "Coverage analysis: ${COVERAGE_PCT}% with ${GAPS_COUNT} gaps"
```

## Expected Outputs

### Success Output

```
📊 Analyzing coverage...
🔍 Running sublinear coverage analysis...

📈 Coverage Analysis Results:
   Current Coverage: 93.5%
   Threshold: 95%
   Total Gaps: 12
   Critical Gaps: 3

🎯 Top Coverage Gaps:
   - src/services/auth.ts:45-60 (authentication flow)
   - src/utils/validators.ts:23-35 (input validation)
   - src/api/users.ts:102-115 (error handling)

💡 Recommendations:
   1. Generate 5 tests for authentication flow
   2. Add boundary tests for validators
   3. Improve error handling coverage

✅ Coverage analysis completed successfully!
```

### Gap Analysis Output

```json
{
  "analysisId": "qe-analyze-1727683200-12345",
  "coverage": {
    "total": {
      "pct": 93.5,
      "lines": 1250,
      "covered": 1169
    }
  },
  "gaps": [
    {
      "file": "src/services/auth.ts",
      "lines": "45-60",
      "type": "branch",
      "priority": "critical",
      "impact": "high",
      "complexity": 5
    },
    {
      "file": "src/utils/validators.ts",
      "lines": "23-35",
      "type": "function",
      "priority": "high",
      "impact": "medium",
      "complexity": 3
    }
  ],
  "recommendations": [
    {
      "action": "generate-tests",
      "target": "src/services/auth.ts",
      "testCount": 5,
      "projectedCoverage": 96.2
    }
  ],
  "timestamp": "2025-09-30T10:10:00Z"
}
```

### Trend Analysis Output

```
📊 Coverage Trends (Last 7 Days):

   Day       Coverage   Change
   ────────────────────────────
   Sep 24    91.2%      +0.0%
   Sep 25    92.1%      +0.9%
   Sep 26    92.5%      +0.4%
   Sep 27    93.0%      +0.5%
   Sep 28    93.2%      +0.2%
   Sep 29    93.5%      +0.3%
   Sep 30    93.5%      +0.0%

📈 Trend: Improving (+2.3% over 7 days)
🎯 Projected: 95% coverage in 4 days
```

## Error Handling

### Coverage Below Threshold

```bash
❌ Coverage below threshold: 93.5% < 95%

💡 Suggestions:
   - Run: /aqe-generate src/services/auth.ts
   - Focus on critical gaps first
   - Expected improvement: +1.8%
```

**Solution:** Generate tests for identified gaps.

### No Coverage Data

```bash
❌ Error: No coverage data found

💡 Run tests with coverage first:
   aqe run --coverage
```

**Solution:** Execute tests with coverage collection enabled.

### Invalid Baseline

```bash
⚠️  Warning: Baseline file not found or invalid
   Proceeding without comparison
```

**Solution:** Provide a valid baseline file or omit --baseline.

## Performance Characteristics

- **Time Complexity**: O(log n) using sublinear algorithms
- **Target Time**: <5s for 1000 LOC
- **Memory Usage**: ~256MB peak
- **Sublinear Optimization**: Yes (enabled by default)

## Sublinear Algorithm Details

The coverage analyzer uses O(log n) algorithms for:

1. **Gap Detection**: Logarithmic search through coverage data
2. **Priority Ranking**: Sublinear sorting by impact and risk
3. **Optimization**: Minimal set cover algorithm for test generation
4. **Trend Analysis**: Efficient time-series analysis

This enables analysis of large codebases (>100K LOC) in seconds rather than minutes.

## See Also

- `/aqe-generate` - Generate tests for gaps
- `/aqe-execute` - Run tests with coverage
- `/aqe-optimize` - Optimize test suite
- `/aqe-report` - Generate coverage reports