# Test Runner Agent

## Purpose
Intelligent test execution orchestrator that manages test runs across multiple environments, frameworks, and test types with parallel execution and smart retry logic.

## Capabilities
- Multi-framework test execution
- Parallel and sequential test runs
- Smart test selection and prioritization
- Flaky test detection and retry logic
- Cross-environment test execution
- Real-time progress monitoring
- Detailed result reporting

## Available Commands

### `qe run-tests`
Execute tests with intelligent selection and orchestration.

**Usage:**
```bash
npx aqe run-tests --suite "regression" --parallel --retry-flaky --environments "dev,staging"
```

**Options:**
- `--suite` - Test suite to run (unit, integration, e2e, regression, smoke)
- `--parallel` - Enable parallel execution
- `--retry-flaky` - Auto-retry flaky tests
- `--environments` - Target environments
- `--coverage` - Generate coverage reports
- `--tags` - Run tests with specific tags
- `--changed-only` - Run only tests for changed files
- `--performance` - Include performance benchmarks

### `qe watch-tests`
Continuous test monitoring and execution.

**Usage:**
```bash
npx aqe watch-tests --mode "development" --auto-retry --notify
```

**Options:**
- `--mode` - Watch mode (development, ci, debug)
- `--auto-retry` - Automatically retry failed tests
- `--notify` - Send notifications on test status changes
- `--debounce` - Debounce time for file changes

### `qe test-health`
Monitor test suite health and performance.

**Usage:**
```bash
npx aqe test-health --analyze-flaky --performance-trends --coverage-drift
```

## Integration Examples

### With Claude Code Task Tool
```javascript
Task("Test Runner", "Execute full regression suite with parallel execution. Auto-retry flaky tests and generate comprehensive coverage report.", "test-runner")
```

### Smart Test Selection
```bash
# Run only tests affected by recent changes
npx aqe run-tests --changed-only --parallel --coverage
```

### Multi-Environment Testing
```bash
# Run across multiple environments
npx aqe run-tests --suite "smoke" --environments "dev,staging,prod" --parallel
```

### Performance Monitoring
```bash
# Include performance benchmarks
npx aqe run-tests --suite "performance" --performance --environments "staging"
```

## Execution Strategies

### Parallel Execution
- Worker-based parallel test runs
- Smart test distribution
- Resource-aware scheduling
- Load balancing across environments

### Smart Selection
- Changed file analysis
- Test dependency mapping
- Risk-based prioritization
- Tag-based filtering

### Retry Logic
- Flaky test detection
- Exponential backoff
- Environment-specific retries
- Failure pattern analysis

## Supported Frameworks
- Jest (JavaScript/TypeScript)
- Cypress (E2E)
- Playwright (E2E/API)
- pytest (Python)
- Mocha + Chai
- Vitest
- WebDriver
- Artillery (Performance)

## Reporting Features
- Real-time progress dashboards
- Coverage reports (HTML, JSON, LCOV)
- Performance metrics
- Flaky test analysis
- Trend analysis
- CI/CD integration reports

## Output Format
- JUnit XML reports
- JSON test results
- Coverage reports
- Performance metrics
- Failure screenshots/videos
- Execution logs

## Coordination Hooks
- `pre-run` - Prepares test environment and dependencies
- `test-started` - Notifies start of test execution
- `test-completed` - Processes results and generates reports
- `post-run` - Cleanup and result distribution

## Memory Keys
- `qe/test-results/{run-id}` - Test execution results
- `qe/coverage/{project}` - Coverage metrics and trends
- `qe/flaky-tests/{suite}` - Flaky test detection data
- `qe/performance/{environment}` - Performance benchmark results