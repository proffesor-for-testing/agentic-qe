# Quality Engineering Agents

Advanced quality engineering agents for comprehensive testing, risk assessment, and production monitoring in the Claude-Flow ecosystem.

## Overview

This collection of specialized QE agents brings modern quality engineering practices to your development workflow, implementing context-driven testing, predictive risk assessment, and continuous production observation.

## Agent Roster

### 🔍 Requirements Explorer
**Purpose**: Analyzes requirements for testability, ambiguity, and risk using RST heuristics
**Specialty**: Context-driven requirement analysis
**Key Features**:
- SFDIPOT and FEW HICCUPPS heuristic application
- Ambiguity detection and clarification
- Risk-based test charter generation
- Testability assessment scoring

### 🗺️ Exploratory Testing Navigator
**Purpose**: Autonomous exploration to discover unknown unknowns
**Specialty**: Session-based test management
**Key Features**:
- Seven testing tours (Money, Landmark, Garbage Collector, etc.)
- PROOF documentation methodology
- Pattern recognition and anomaly detection
- Session-based test reporting

### 🔴🟢 TDD Pair Programmer
**Purpose**: Intelligent pair programming for test-first development
**Specialty**: Both London and Chicago school TDD
**Key Features**:
- Red-Green-Refactor cycle management
- Test generation and coverage analysis
- Refactoring suggestions
- Mock vs classical testing approaches

### 🛡️ Deployment Guardian
**Purpose**: Ensures safe deployments through progressive validation
**Specialty**: Zero-downtime deployment strategies
**Key Features**:
- Blue-green, canary, and feature flag deployments
- Statistical canary analysis
- Automated rollback triggers
- Smoke test generation

### 🔮 Risk Oracle
**Purpose**: Predictive risk assessment and test prioritization
**Specialty**: Data-driven risk analysis
**Key Features**:
- Multi-factor risk scoring (Technical, Business, Context)
- ML-based failure prediction
- Risk-based test prioritization
- Mitigation strategy generation

### 👁️ Production Observer
**Purpose**: Continuous production monitoring and anomaly detection
**Specialty**: Real-world quality insights
**Key Features**:
- Four golden signals monitoring
- Synthetic user journey validation
- Test gap identification from production
- Root cause analysis automation

## Quick Start

### Spawning QE Agents

```bash
# Spawn individual QE agents
npx claude-flow@alpha agent spawn requirements-explorer --name "Req-Analyzer"
npx claude-flow@alpha agent spawn tdd-pair-programmer --name "TDD-Partner"
npx claude-flow@alpha agent spawn deployment-guardian --name "Deploy-Guard"

# Create a QE swarm for comprehensive quality
npx claude-flow@alpha swarm init --agents requirements-explorer,tdd-pair-programmer,exploratory-testing-navigator,risk-oracle
```

### Common Use Cases

#### 1. Requirement Analysis Session
```bash
npx claude-flow@alpha task assign requirements-explorer "Analyze user authentication requirements for testability and risks"
```

#### 2. TDD Development Session
```bash
npx claude-flow@alpha sparc tdd "shopping cart feature" --agent tdd-pair-programmer
```

#### 3. Pre-Deployment Risk Assessment
```bash
npx claude-flow@alpha task orchestrate \
  --agents risk-oracle,deployment-guardian \
  --task "Assess deployment risk for v2.0.0 and create deployment plan"
```

#### 4. Production Monitoring Setup
```bash
npx claude-flow@alpha agent spawn production-observer --auto-start \
  --config "monitor=api,synthetic=enabled,anomaly=ml"
```

## Integration Patterns

### Quality Gate Pipeline
```yaml
quality_pipeline:
  stages:
    - requirements:
        agent: requirements-explorer
        output: test_charters, risk_areas

    - development:
        agent: tdd-pair-programmer
        input: test_charters
        output: tested_code

    - exploration:
        agent: exploratory-testing-navigator
        input: risk_areas
        output: bug_reports, observations

    - risk_assessment:
        agent: risk-oracle
        input: all_changes
        output: risk_score, test_priorities

    - deployment:
        agent: deployment-guardian
        input: risk_score
        output: deployment_strategy

    - production:
        agent: production-observer
        continuous: true
        output: anomalies, test_gaps
```

### Collaborative Patterns

#### Risk-Driven Testing
```bash
# Risk Oracle identifies high-risk areas
# Exploratory Navigator focuses testing on those areas
npx claude-flow@alpha task chain \
  --step1 "risk-oracle: assess feature risks" \
  --step2 "exploratory-testing-navigator: explore high-risk areas" \
  --step3 "tdd-pair-programmer: create regression tests"
```

#### Shift-Left Quality
```bash
# Requirements Explorer analyzes early
# TDD Programmer implements with tests
# Deployment Guardian ensures safe release
npx claude-flow@alpha workflow create shift-left \
  --agents requirements-explorer,tdd-pair-programmer,deployment-guardian \
  --trigger "on:requirements:created"
```

## Best Practices

### 1. Context-Driven Approach
- Let Requirements Explorer analyze context first
- Adapt testing strategy based on project needs
- Remember: best practices are contextual

### 2. Continuous Learning
- Production Observer feeds insights back
- Risk Oracle learns from production incidents
- Test gaps discovered become new test cases

### 3. Progressive Quality
- Start with Requirements Explorer
- Use TDD Pair Programmer during development
- Deploy with Deployment Guardian
- Monitor with Production Observer

### 4. Risk-Based Focus
- Use Risk Oracle to prioritize efforts
- Focus testing where it matters most
- Balance coverage with time constraints

## Configuration

### Agent-Specific Settings

#### Requirements Explorer
```yaml
requirements-explorer:
  heuristics:
    - SFDIPOT
    - FEW_HICCUPPS
  output_format: markdown
  risk_threshold: medium
```

#### TDD Pair Programmer
```yaml
tdd-pair-programmer:
  style: chicago  # or london
  coverage_target: 80
  test_framework: jest
  refactoring_aggressive: false
```

#### Deployment Guardian
```yaml
deployment-guardian:
  strategy: canary
  rollback_threshold:
    error_rate: 0.02
    latency_p99: 1.5x
  stages:
    - 1%: 10m
    - 5%: 20m
    - 25%: 30m
    - 50%: 30m
    - 100%: null
```

## Metrics and Reporting

### Quality Metrics Dashboard
```bash
# View QE agent metrics
npx claude-flow@alpha metrics qe --dashboard

# Generate quality report
npx claude-flow@alpha report quality --period 7d
```

### Key Performance Indicators
- **Test Coverage**: Code, branch, mutation coverage
- **Defect Detection**: Bugs found in testing vs production
- **Risk Accuracy**: Predicted vs actual failure rates
- **Deployment Success**: Successful deployments without rollback
- **MTTR**: Mean time to recovery from production issues

## Advanced Usage

### Custom Testing Tours
```javascript
// Define custom exploratory tour
const customTour = {
  name: "Security Tour",
  focus: ["authentication", "authorization", "data_protection"],
  techniques: ["injection", "privilege_escalation", "data_exposure"],
  duration: 90, // minutes
  oracle: "security_standards"
};

// Execute tour
await exploratoryNavigator.executeTour(customTour);
```

### Risk Model Customization
```python
# Customize risk calculation weights
risk_config = {
    'technical_weight': 0.4,
    'business_weight': 0.4,
    'context_weight': 0.2,
    'custom_factors': [
        {'name': 'regulatory_compliance', 'weight': 0.1},
        {'name': 'customer_impact', 'weight': 0.15}
    ]
}
```

## Troubleshooting

### Common Issues

#### Agent Not Finding Tests
```bash
# Ensure test framework is configured
npx claude-flow@alpha config set test.framework jest
npx claude-flow@alpha config set test.pattern "**/*.test.js"
```

#### Risk Score Too Conservative
```bash
# Adjust risk sensitivity
npx claude-flow@alpha agent config risk-oracle --sensitivity high
```

#### Production Observer Alert Fatigue
```bash
# Tune alert thresholds
npx claude-flow@alpha agent config production-observer \
  --anomaly-threshold 3.5 \
  --alert-cooldown 300
```

## Integration with CI/CD

### GitHub Actions Example
```yaml
name: Quality Engineering Pipeline

on: [push, pull_request]

jobs:
  quality-checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Requirement Analysis
        run: npx claude-flow@alpha agent run requirements-explorer

      - name: Risk Assessment
        run: npx claude-flow@alpha agent run risk-oracle

      - name: Generate Deployment Plan
        run: npx claude-flow@alpha agent run deployment-guardian --dry-run

      - name: Quality Report
        run: npx claude-flow@alpha report generate --format markdown > quality-report.md
```

## Contributing

We welcome contributions to enhance QE agents! Areas of interest:
- Additional testing heuristics
- New anomaly detection algorithms
- Enhanced risk prediction models
- Integration with testing frameworks
- Improved production insights

## Resources

### Documentation
- [RST Heuristics Guide](https://www.satisfice.com/rst)
- [Context-Driven Testing](https://context-driven-testing.com)
- [TDD Patterns](https://www.tddpatterns.com)

### Related Agents
- `tester`: Core testing agent
- `reviewer`: Code review specialist
- `performance-benchmarker`: Performance testing
- `security-analyzer`: Security testing

## License

Part of Claude-Flow project. See main LICENSE file.

## Author

Created by Dragan Spiridonov (@dragan-spiridonov)
Quality Engineering Expert | Context-Driven Testing Advocate

---

*"Testing is not about confirmation, it's about investigation. These agents help you ask better questions."*