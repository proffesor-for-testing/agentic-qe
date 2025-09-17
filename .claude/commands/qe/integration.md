# QE Command Integration Guide

## Overview
This guide explains how to integrate Agentic QE commands with Claude Code for seamless quality engineering workflows.

## Command Discovery
Claude Code automatically discovers QE commands through the `.claude/commands/qe/qe-commands.yaml` configuration file. All commands are registered with their respective agents and can be used directly through Claude Code's task system.

## Agent-Command Mapping

### Test Planner Agent
```bash
# Direct command usage
npx aqe test-plan --feature "user-auth" --levels "unit,integration,e2e"
npx aqe risk-analysis --component "payment-gateway" --impact "critical"

# Claude Code Task integration
Task("Test Planner", "Create comprehensive test plan for authentication system", "test-planner")
```

### Test Generator Agent
```bash
# Direct command usage
npx aqe generate-tests --spec "auth-spec.yaml" --framework "jest" --type "unit"
npx aqe generate-data --schema "user-schema.json" --count 100 --realistic

# Claude Code Task integration
Task("Test Generator", "Generate Jest unit tests with mocks for UserService", "test-generator")
```

### Test Runner Agent
```bash
# Direct command usage
npx aqe run-tests --suite "regression" --parallel --environments "staging,prod"
npx aqe watch-tests --mode "development" --auto-retry

# Claude Code Task integration
Task("Test Runner", "Execute full regression suite with parallel execution", "test-runner")
```

### Test Analyzer Agent
```bash
# Direct command usage
npx aqe analyze-coverage --project "webapp" --threshold 90 --suggest-tests
npx aqe analyze-performance --suite "api" --trends --bottlenecks

# Claude Code Task integration
Task("Test Analyzer", "Analyze test coverage and identify optimization opportunities", "test-analyzer")
```

### QE Coordinator Agent
```bash
# Direct command usage
npx aqe orchestrate --workflow "full-cycle" --feature "checkout" --parallel
npx aqe coordinate-release --version "v2.0.0" --full-regression

# Claude Code Task integration
Task("QE Coordinator", "Orchestrate complete QE workflow for new feature", "qe-coordinator")
```

## Parallel Execution Examples

### Single Message Multi-Agent Coordination
```javascript
// Orchestrate complete QE workflow in one message
[Parallel Agent Execution]:
  Task("Test Planner", "Create test strategy for payment system with risk analysis", "test-planner")
  Task("Test Generator", "Generate comprehensive test suite with 95% coverage target", "test-generator")
  Task("Test Runner", "Execute tests across dev/staging environments with parallel execution", "test-runner")
  Task("Test Analyzer", "Analyze results and provide optimization recommendations", "test-analyzer")
  Task("QE Coordinator", "Coordinate overall workflow and enforce quality gates", "qe-coordinator")

  TodoWrite { todos: [
    {content: "Plan test strategy", status: "in_progress", priority: "high"},
    {content: "Generate unit tests", status: "pending", priority: "high"},
    {content: "Generate integration tests", status: "pending", priority: "high"},
    {content: "Execute test suites", status: "pending", priority: "medium"},
    {content: "Analyze coverage gaps", status: "pending", priority: "medium"},
    {content: "Generate quality report", status: "pending", priority: "low"}
  ]}
```

### Feature Development Workflow
```javascript
// Complete feature testing workflow
[Feature Testing Workflow]:
  Task("QE Coordinator", "Orchestrate testing for login feature across all levels", "qe-coordinator")

  // Coordination automatically triggers:
  // 1. Test planning with risk assessment
  // 2. Test generation for unit/integration/e2e
  // 3. Parallel test execution
  // 4. Comprehensive analysis and reporting
```

## Quality Gates Integration

### CI/CD Pipeline Integration
```yaml
# Example CI/CD integration
quality_gates:
  - name: "Unit Test Coverage"
    command: "npx aqe analyze-coverage --threshold 90"
    required: true

  - name: "Performance Baseline"
    command: "npx aqe analyze-performance --compare"
    required: true

  - name: "Security Testing"
    command: "npx aqe run-tests --suite security"
    required: true
```

### Automated Quality Enforcement
```bash
# Enforce quality gates automatically
npx aqe manage-quality-gates --pipeline "ci/cd" --enforce --thresholds "coverage:90,performance:95"
```

## Memory Integration

### Cross-Agent Data Sharing
QE agents share data through Claude Code's memory system:

```javascript
// Memory keys used by QE agents
memory_keys = {
  "qe/test-plans/{feature}": "Test planning results",
  "qe/generated-tests/{component}": "Generated test files",
  "qe/test-results/{run-id}": "Execution results",
  "qe/analysis-results/{project}": "Analysis insights",
  "qe/quality-gates/{pipeline}": "Quality gate status"
}
```

### Session Continuity
```bash
# Agents automatically restore session context
npx claude-flow@alpha hooks session-restore --session-id "qe-workflow-123"
```

## Hook Integration

### Pre/Post Operation Hooks
```bash
# Automatic hook execution
npx claude-flow@alpha hooks pre-task --description "QE workflow execution"
npx claude-flow@alpha hooks post-task --task-id "qe-analysis-456"
```

### Event-Driven Coordination
```bash
# Hooks trigger coordinated responses
npx claude-flow@alpha hooks notify --message "Test coverage below threshold"
# Automatically triggers test generation and execution
```

## Command Chaining

### Sequential Execution
```bash
# Chain QE commands for complete workflow
npx aqe test-plan --feature "api" && \
npx aqe generate-tests --spec "api-spec.yaml" && \
npx aqe run-tests --suite "api" && \
npx aqe analyze-coverage --project "api"
```

### Conditional Execution
```bash
# Execute based on previous results
npx aqe run-tests --suite "unit" && \
(npx aqe analyze-coverage --threshold 90 || npx aqe generate-tests --coverage)
```

## Error Handling and Recovery

### Automatic Retry Logic
```bash
# Test runner automatically retries flaky tests
npx aqe run-tests --retry-flaky --environments "staging"
```

### Fallback Strategies
```bash
# Coordinator implements fallback workflows
npx aqe orchestrate --workflow "full-cycle" --feature "checkout" --fallback-on-failure
```

## Reporting Integration

### Unified Reporting
```bash
# Generate comprehensive QE reports
npx aqe orchestrate --workflow "full-cycle" --generate-report --format "html,json"
```

### Real-time Monitoring
```bash
# Watch mode for continuous feedback
npx aqe watch-tests --notify --dashboard-url "http://localhost:3000/qe-dashboard"
```

## Best Practices

1. **Use Parallel Execution**: Always batch QE operations in single messages for optimal performance
2. **Leverage Memory**: Share context between agents using memory keys
3. **Enforce Quality Gates**: Use coordinator for automatic quality gate enforcement
4. **Monitor Continuously**: Use watch modes for real-time feedback
5. **Analyze Regularly**: Run analysis agents to identify optimization opportunities
6. **Coordinate Workflows**: Use orchestration for complex multi-step QE processes