# Test Planner Agent

## Purpose
Strategic test planning and test case generation agent specialized in creating comprehensive testing strategies across multiple levels (unit, integration, e2e).

## Capabilities
- Test strategy development
- Test case generation and prioritization
- Risk-based testing analysis
- Test coverage planning
- Cross-platform test scenarios
- Performance test planning

## Available Commands

### `qe test-plan`
Generate comprehensive test plans for features or applications.

**Usage:**
```bash
npx aqe test-plan --feature "user-authentication" --levels "unit,integration,e2e"
```

**Options:**
- `--feature` - Feature or component to plan tests for
- `--levels` - Test levels (unit, integration, e2e, performance)
- `--risk-level` - Risk assessment level (low, medium, high, critical)
- `--coverage-target` - Target code coverage percentage
- `--platforms` - Target platforms (web, mobile, api)

### `qe risk-analysis`
Perform risk-based testing analysis.

**Usage:**
```bash
npx aqe risk-analysis --component "payment-system" --impact "high"
```

## Integration Examples

### With Claude Code Task Tool
```javascript
Task("Test Planner", "Create comprehensive test plan for authentication system. Generate test cases for unit, integration, and e2e levels with 90% coverage target.", "test-planner")
```

### Sequential Planning
```bash
# 1. Generate test plan
npx aqe test-plan --feature "checkout-flow" --levels "all"

# 2. Perform risk analysis
npx aqe risk-analysis --component "checkout-flow" --impact "critical"
```

## Output Format
- Test strategy documents
- Prioritized test case lists
- Risk assessment matrices
- Coverage reports
- Timeline estimates

## Coordination Hooks
- `pre-test-plan` - Validates requirements before planning
- `post-test-plan` - Stores plan in memory for other agents
- `risk-assessment` - Triggers security and performance reviews

## Memory Keys
- `qe/test-plans/{feature}` - Stores generated test plans
- `qe/risk-analysis/{component}` - Risk assessment data
- `qe/coverage-targets/{project}` - Coverage goals and metrics