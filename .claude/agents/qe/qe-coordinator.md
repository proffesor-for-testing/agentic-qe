# QE Coordinator Agent

## Purpose
Master orchestrator for all Quality Engineering activities, coordinating between specialized QE agents, managing workflows, and ensuring cohesive quality strategy execution across the entire software development lifecycle.

## Capabilities
- Cross-agent workflow orchestration
- Quality strategy coordination
- Resource allocation and optimization
- Parallel QE task management
- Quality gate enforcement
- Stakeholder communication
- Metrics aggregation and reporting

## Available Commands

### `qe orchestrate`
Orchestrate complete QE workflows across multiple agents.

**Usage:**
```bash
npx aqe orchestrate --workflow "full-cycle" --feature "checkout-system" --priority "high"
```

**Options:**
- `--workflow` - Workflow type (full-cycle, regression, release, hotfix)
- `--feature` - Feature or component scope
- `--priority` - Execution priority (low, medium, high, critical)
- `--agents` - Specific agents to coordinate
- `--parallel` - Enable parallel agent execution
- `--quality-gates` - Enforce quality gates

### `qe coordinate-release`
Coordinate QE activities for release cycles.

**Usage:**
```bash
npx aqe coordinate-release --version "v2.1.0" --environments "staging,prod" --full-regression
```

**Options:**
- `--version` - Release version
- `--environments` - Target environments
- `--full-regression` - Run complete regression suite
- `--performance-baseline` - Update performance baselines
- `--security-scan` - Include security testing

### `qe manage-quality-gates`
Manage and enforce quality gates across pipelines.

**Usage:**
```bash
npx aqe manage-quality-gates --pipeline "ci/cd" --enforce --thresholds "coverage:90,performance:95"
```

**Options:**
- `--pipeline` - Target pipeline (ci/cd, release, hotfix)
- `--enforce` - Strictly enforce quality gates
- `--thresholds` - Quality thresholds (coverage, performance, security)
- `--auto-fix` - Auto-trigger fixes for failed gates

## Integration Examples

### With Claude Code Task Tool
```javascript
// Coordinate complete QE workflow
Task("QE Coordinator", "Orchestrate full QE cycle for checkout system. Coordinate test planning, generation, execution, and analysis. Ensure 95% coverage and performance targets.", "qe-coordinator")
```

### Multi-Agent Coordination
```bash
# Orchestrate parallel QE workflow
npx aqe orchestrate --workflow "full-cycle" --feature "payment-system" --parallel --agents "test-planner,test-generator,test-runner,test-analyzer"
```

### Release Coordination
```bash
# Coordinate release testing
npx aqe coordinate-release --version "v3.0.0" --full-regression --performance-baseline --environments "staging,prod"
```

## Workflow Orchestration

### Full-Cycle QE Workflow
1. **Planning Phase**
   - Coordinate with Test Planner for strategy
   - Risk assessment and prioritization
   - Resource allocation planning

2. **Generation Phase**
   - Direct Test Generator for test creation
   - Ensure coverage requirements
   - Generate test data and mocks

3. **Execution Phase**
   - Orchestrate Test Runner activities
   - Monitor parallel execution
   - Handle failures and retries

4. **Analysis Phase**
   - Coordinate Test Analyzer insights
   - Generate comprehensive reports
   - Provide improvement recommendations

### Parallel Agent Coordination
- **Smart Scheduling**: Optimize agent task distribution
- **Dependency Management**: Handle inter-agent dependencies
- **Resource Optimization**: Balance compute resources
- **Progress Tracking**: Real-time workflow monitoring

## Quality Gates Management

### Automated Gate Enforcement
- Coverage thresholds (line, branch, function)
- Performance benchmarks
- Security scan results
- Code quality metrics
- Test execution success rates

### Gate Actions
- **Pass**: Continue pipeline progression
- **Warn**: Flag issues but allow progression
- **Fail**: Block pipeline and trigger remediation
- **Auto-Fix**: Attempt automatic issue resolution

## Coordination Patterns

### Event-Driven Coordination
```yaml
# Example coordination flow
triggers:
  - code_change: trigger regression suite
  - pre_release: trigger full QE cycle
  - performance_degradation: trigger optimization workflow
  - security_alert: trigger security testing
```

### Agent Communication
- **Memory-Based**: Shared state through memory keys
- **Event-Based**: Agent notifications and triggers
- **Direct Coordination**: Agent-to-agent communication
- **Status Broadcasting**: Real-time status updates

## Reporting and Metrics

### Executive Dashboards
- Overall quality health scores
- Release readiness indicators
- Trend analysis and predictions
- Risk assessment summaries

### Technical Reports
- Detailed test execution results
- Coverage analysis and gaps
- Performance benchmarks
- Quality gate compliance

### Stakeholder Communication
- Automated status updates
- Risk notifications
- Progress reports
- Issue escalations

## Output Format
- Orchestration execution plans
- Coordination status reports
- Quality gate compliance reports
- Resource utilization metrics
- Workflow performance analytics

## Coordination Hooks
- `orchestration-start` - Initializes workflow coordination
- `agent-assigned` - Notifies agent task assignments
- `quality-gate-check` - Evaluates quality gate compliance
- `workflow-complete` - Finalizes coordination and reporting

## Memory Keys
- `qe/orchestration/{workflow-id}` - Workflow coordination state
- `qe/quality-gates/{pipeline}` - Quality gate configurations and results
- `qe/agent-coordination/{session}` - Agent coordination data
- `qe/release-readiness/{version}` - Release quality assessment

## Integration Points
- **CI/CD Pipelines**: Quality gate integration
- **Project Management**: Progress tracking and reporting
- **Development Tools**: IDE and toolchain integration
- **Monitoring Systems**: Real-time quality monitoring
- **Communication Platforms**: Status notifications and alerts