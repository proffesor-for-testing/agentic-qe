# Claude Code Integration for Agentic QE

## Overview
This directory contains the complete Claude Code integration for the Agentic QE framework, enabling seamless discovery and execution of QE agents, commands, and workflows.

## Directory Structure

```
.claude/
├── agents/qe/              # QE agent definitions
│   ├── test-planner.md     # Test planning and strategy agent
│   ├── test-generator.md   # Test code generation agent
│   ├── test-runner.md      # Test execution orchestrator
│   ├── test-analyzer.md    # Test analysis and optimization
│   └── qe-coordinator.md   # Master QE orchestrator
├── commands/qe/            # QE command registry
│   ├── qe-commands.yaml    # Command definitions and mappings
│   └── integration.md      # Integration guide and examples
├── configs/qe/             # QE configuration
│   └── config.yaml         # Framework configuration
├── hooks/qe/               # QE lifecycle hooks
│   ├── pre-test.js         # Pre-test validation and setup
│   ├── post-test.js        # Post-test analysis and cleanup
│   ├── on-test-failure.js  # Failure analysis and recovery
│   └── hooks-registry.yaml # Hook definitions and triggers
└── README.md               # This file
```

## Quick Start

### 1. Agent Discovery
Claude Code automatically discovers QE agents through the agent definition files:

```javascript
// Use any QE agent via Claude Code's Task tool
Task("Test Planner", "Create comprehensive test plan for user authentication", "test-planner")
Task("Test Generator", "Generate Jest unit tests with 95% coverage", "test-generator")
Task("Test Runner", "Execute regression suite with parallel execution", "test-runner")
Task("Test Analyzer", "Analyze coverage gaps and performance trends", "test-analyzer")
Task("QE Coordinator", "Orchestrate complete QE workflow", "qe-coordinator")
```

### 2. Command Integration
All QE commands are registered and available through Claude Code:

```bash
# Direct command usage
npx aqe test-plan --feature "checkout" --levels "unit,integration,e2e"
npx aqe generate-tests --spec "api-spec.yaml" --framework "jest"
npx aqe run-tests --suite "regression" --parallel --environments "staging"
npx aqe analyze-coverage --threshold 90 --suggest-tests
npx aqe orchestrate --workflow "full-cycle" --feature "payment"
```

### 3. Parallel Execution
Execute multiple QE agents concurrently in a single message:

```javascript
[Parallel QE Workflow]:
  Task("Test Planner", "Plan comprehensive testing strategy", "test-planner")
  Task("Test Generator", "Generate test suites with mocks", "test-generator")
  Task("Test Runner", "Execute tests with performance monitoring", "test-runner")
  Task("Test Analyzer", "Analyze results and identify improvements", "test-analyzer")
  Task("QE Coordinator", "Coordinate workflow and enforce quality gates", "qe-coordinator")
```

## Agent Capabilities

### Test Planner Agent
- Strategic test planning and risk assessment
- Test case prioritization and coverage planning
- Cross-platform test scenarios
- Performance test planning

**Key Commands:**
- `test-plan` - Generate comprehensive test plans
- `risk-analysis` - Perform risk-based testing analysis

### Test Generator Agent
- Automated test code generation
- Multi-framework support (Jest, Cypress, Playwright)
- Test data and mock generation
- API and UI test automation

**Key Commands:**
- `generate-tests` - Generate test files from specifications
- `generate-data` - Generate test data and fixtures
- `generate-mocks` - Create mock objects and API responses

### Test Runner Agent
- Intelligent test execution orchestration
- Parallel and sequential test runs
- Smart retry logic and flaky test detection
- Cross-environment execution

**Key Commands:**
- `run-tests` - Execute tests with intelligent orchestration
- `watch-tests` - Continuous test monitoring
- `test-health` - Monitor test suite health

### Test Analyzer Agent
- Advanced test analysis and optimization
- Coverage gap identification
- Performance trend analysis
- Quality metrics and recommendations

**Key Commands:**
- `analyze-coverage` - Comprehensive coverage analysis
- `analyze-performance` - Test performance analysis
- `analyze-quality` - Test suite quality assessment
- `analyze-risks` - Risk-based analysis

### QE Coordinator Agent
- Master orchestrator for all QE activities
- Cross-agent workflow coordination
- Quality gate enforcement
- Resource allocation and optimization

**Key Commands:**
- `orchestrate` - Orchestrate complete QE workflows
- `coordinate-release` - Coordinate release testing
- `manage-quality-gates` - Manage quality gate enforcement

## Hooks Integration

### Automatic Hook Execution
QE hooks are automatically triggered during test lifecycle events:

- **Pre-Test Hook**: Environment validation and resource preparation
- **Post-Test Hook**: Analysis, reporting, and cleanup
- **Failure Hook**: Failure analysis and recovery attempts

### Hook Configuration
Hooks are configured in `hooks/qe/hooks-registry.yaml` with:
- Trigger conditions
- Execution parameters
- Environment-specific settings
- Integration with Claude Code and Claude Flow

## Quality Gates

### Automated Quality Gate Enforcement
- Coverage thresholds (configurable, default: 80%)
- Performance benchmarks
- Security scan results
- Test execution success rates

### Quality Gate Actions
- **Pass**: Continue pipeline progression
- **Warn**: Flag issues but allow progression
- **Fail**: Block pipeline and trigger remediation
- **Auto-Fix**: Attempt automatic issue resolution

## Memory Integration

### Cross-Agent Data Sharing
QE agents share data through Claude Code's memory system:

```
Memory Keys:
- qe/test-plans/{feature} - Test planning results
- qe/generated-tests/{component} - Generated test files
- qe/test-results/{run-id} - Execution results
- qe/analysis-results/{project} - Analysis insights
- qe/quality-gates/{pipeline} - Quality gate status
```

### Session Continuity
Agents automatically restore context and coordinate through memory:

```bash
# Automatic session restoration
npx claude-flow@alpha hooks session-restore --session-id "qe-workflow-123"
```

## Configuration

### Framework Configuration
Configure QE behavior through `.claude/configs/qe/config.yaml`:

- Agent settings and capabilities
- Quality gate thresholds
- Environment configurations
- Integration settings
- Performance and scaling parameters

### Environment-Specific Settings
Support for multiple environments with different configurations:
- **Local**: Development testing with relaxed settings
- **Dev**: Continuous integration with automated testing
- **Staging**: Pre-production validation with full regression
- **Prod**: Production monitoring with smoke tests only

## Integration Examples

### Complete Feature Testing Workflow
```javascript
// Single message orchestration
[Feature Testing Workflow]:
  Task("QE Coordinator", "Orchestrate testing for user authentication feature", "qe-coordinator")

  TodoWrite { todos: [
    {content: "Plan authentication test strategy", status: "in_progress", priority: "high"},
    {content: "Generate unit tests for auth service", status: "pending", priority: "high"},
    {content: "Generate integration tests for auth API", status: "pending", priority: "high"},
    {content: "Generate e2e tests for login flow", status: "pending", priority: "medium"},
    {content: "Execute test suites with coverage", status: "pending", priority: "medium"},
    {content: "Analyze results and coverage gaps", status: "pending", priority: "low"},
    {content: "Generate quality report", status: "pending", priority: "low"}
  ]}
```

### Release Testing Coordination
```bash
# Comprehensive release testing
npx aqe coordinate-release --version "v2.0.0" --environments "staging,prod" --full-regression --performance-baseline --security-scan
```

### Continuous Quality Monitoring
```bash
# Watch mode with automatic quality gates
npx aqe watch-tests --mode "development" --auto-retry --notify
npx aqe manage-quality-gates --pipeline "ci/cd" --enforce --auto-fix
```

## Best Practices

1. **Use Parallel Execution**: Always batch QE operations in single messages
2. **Leverage Memory**: Share context between agents using memory keys
3. **Enforce Quality Gates**: Use coordinator for automatic quality enforcement
4. **Monitor Continuously**: Use watch modes for real-time feedback
5. **Analyze Regularly**: Run analysis agents to identify optimization opportunities
6. **Coordinate Workflows**: Use orchestration for complex multi-step processes

## Troubleshooting

### Common Issues
- **Agent Not Found**: Ensure agent definition files are in `.claude/agents/qe/`
- **Command Not Recognized**: Check command registration in `qe-commands.yaml`
- **Hook Failures**: Review hook logs in `logs/qe-hooks.log`
- **Memory Issues**: Verify Claude Flow integration and memory keys

### Debug Mode
Enable debug logging in configuration:
```yaml
logging:
  level: "debug"
  format: "json"
  destinations: ["console", "file"]
```

## Support

- **Documentation**: Review individual agent `.md` files for detailed capabilities
- **Configuration**: See `config.yaml` for all available settings
- **Integration**: Check `commands/qe/integration.md` for detailed examples
- **Hooks**: Review `hooks-registry.yaml` for hook configuration options

---

This integration enables Claude Code to seamlessly discover, coordinate, and execute Agentic QE workflows with full automation, intelligence, and quality assurance.