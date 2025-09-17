# Test Analyzer Agent

## Purpose
Advanced test analysis and optimization agent that provides deep insights into test performance, coverage gaps, quality metrics, and actionable recommendations for test suite improvement.

## Capabilities
- Test coverage analysis and gap identification
- Performance trend analysis
- Quality metrics calculation
- Flaky test detection and root cause analysis
- Test redundancy detection
- Risk assessment and prioritization
- Test suite optimization recommendations

## Available Commands

### `qe analyze-coverage`
Comprehensive coverage analysis with gap identification.

**Usage:**
```bash
npx aqe analyze-coverage --project "webapp" --threshold 90 --report-gaps --suggest-tests
```

**Options:**
- `--project` - Project or component to analyze
- `--threshold` - Coverage threshold percentage
- `--report-gaps` - Generate detailed gap reports
- `--suggest-tests` - AI-powered test suggestions
- `--exclude` - Exclude files/directories from analysis
- `--format` - Report format (html, json, text, pdf)

### `qe analyze-performance`
Test execution performance and trend analysis.

**Usage:**
```bash
npx aqe analyze-performance --suite "regression" --period "30d" --trends --bottlenecks
```

**Options:**
- `--suite` - Test suite to analyze
- `--period` - Analysis time period (7d, 30d, 90d)
- `--trends` - Generate trend analysis
- `--bottlenecks` - Identify performance bottlenecks
- `--compare` - Compare with baseline performance

### `qe analyze-quality`
Test suite quality and health metrics.

**Usage:**
```bash
npx aqe analyze-quality --comprehensive --flaky-detection --redundancy-check
```

**Options:**
- `--comprehensive` - Full quality analysis
- `--flaky-detection` - Detect and analyze flaky tests
- `--redundancy-check` - Find redundant test cases
- `--maintainability` - Assess test maintainability
- `--effectiveness` - Measure test effectiveness

### `qe analyze-risks`
Risk-based analysis and prioritization.

**Usage:**
```bash
npx aqe analyze-risks --component "payment" --impact-analysis --recommendations
```

## Integration Examples

### With Claude Code Task Tool
```javascript
Task("Test Analyzer", "Perform comprehensive analysis of test suite quality. Identify coverage gaps, flaky tests, and optimization opportunities. Generate actionable recommendations.", "test-analyzer")
```

### Coverage Gap Analysis
```bash
# Identify critical coverage gaps
npx aqe analyze-coverage --threshold 95 --report-gaps --suggest-tests
```

### Performance Optimization
```bash
# Find performance bottlenecks
npx aqe analyze-performance --trends --bottlenecks --period "30d"
```

### Quality Assessment
```bash
# Comprehensive quality analysis
npx aqe analyze-quality --comprehensive --flaky-detection --maintainability
```

## Analysis Categories

### Coverage Analysis
- Line coverage gaps
- Branch coverage analysis
- Function coverage assessment
- Statement coverage review
- Path coverage evaluation
- Conditional coverage checks

### Performance Analysis
- Execution time trends
- Resource utilization
- Parallel execution efficiency
- Environment-specific performance
- Regression detection
- Optimization opportunities

### Quality Metrics
- Test maintainability index
- Code complexity in tests
- Test readability scores
- Assertion quality
- Test isolation
- Dependency analysis

### Flaky Test Analysis
- Failure pattern detection
- Environment correlation
- Timing-related issues
- Resource contention
- External dependency failures
- Root cause identification

## Output Format

### Reports
- Executive summary dashboards
- Detailed technical reports
- Trend analysis charts
- Coverage heat maps
- Performance benchmark comparisons
- Quality scorecards

### Recommendations
- Prioritized improvement actions
- Test case suggestions
- Performance optimization tips
- Architecture improvements
- Tool and framework recommendations

### Data Exports
- JSON metrics data
- CSV performance data
- XML JUnit reports
- HTML interactive reports
- PDF executive summaries

## Coordination Hooks
- `pre-analysis` - Gathers required data and metrics
- `analysis-started` - Notifies beginning of analysis
- `insights-generated` - Shares key findings with team
- `post-analysis` - Stores results and triggers improvements

## Memory Keys
- `qe/analysis-results/{project}` - Analysis results and metrics
- `qe/coverage-gaps/{component}` - Identified coverage gaps
- `qe/performance-trends/{suite}` - Performance trend data
- `qe/quality-metrics/{project}` - Quality assessment results
- `qe/recommendations/{analysis-id}` - Generated recommendations

## Integration with Other Agents
- **Test Planner**: Provides insights for better test planning
- **Test Generator**: Suggests specific tests to generate
- **Test Runner**: Optimizes execution strategies
- **QE Coordinator**: Feeds analysis into overall QE strategy