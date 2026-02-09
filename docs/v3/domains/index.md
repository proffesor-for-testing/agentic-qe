# Domain Index

Agentic QE v3 organizes quality engineering into 13 DDD bounded contexts.

## Domain Overview

| # | Domain | Agents | Priority | Description |
|---|--------|--------|----------|-------------|
| 1 | [Test Generation](test-generation.md) | 5 | P0 | AI-powered test creation |
| 2 | [Test Execution](test-execution.md) | 4 | P0 | Parallel execution, retry |
| 3 | [Coverage Analysis](coverage-analysis.md) | 4 | P0 | O(log n) gap detection |
| 4 | [Quality Assessment](quality-assessment.md) | 5 | P0 | Quality gates, metrics, adversarial review |
| 5 | [Defect Intelligence](defect-intelligence.md) | 4 | P0 | Prediction, RCA |
| 6 | [Code Intelligence](code-intelligence.md) | 4 | P0 | Knowledge graph, semantic |
| 7 | [Requirements Validation](requirements-validation.md) | 4 | P1 | BDD, testability |
| 8 | [Security Compliance](security-compliance.md) | 4 | P1 | SAST/DAST, compliance |
| 9 | [Contract Testing](contract-testing.md) | 4 | P2 | API contracts, GraphQL |
| 10 | [Visual Accessibility](visual-accessibility.md) | 4 | P2 | Visual, a11y |
| 11 | [Chaos Resilience](chaos-resilience.md) | 4 | P2 | Chaos, load testing |
| 12 | [Learning Optimization](learning-optimization.md) | 5 | P0 | Transfer learning |
| 13 | Enterprise Integration | 7 | P1 | SOAP, SAP, OData, ESB, MQ, SoD |

**Total**: 51 domain agents + 2 cross-domain + 7 subagents = **60 agents**

## Domain Categories

### Core Testing (17 agents)

The foundation of quality engineering:

- **Test Generation**: Creates tests using AI and patterns
- **Test Execution**: Runs tests with parallelization
- **Coverage Analysis**: Identifies gaps efficiently
- **Quality Assessment**: Makes deployment decisions

### Intelligence (16 agents)

AI-powered insights and analysis:

- **Defect Intelligence**: Predicts and analyzes defects
- **Code Intelligence**: Understands code semantically
- **Requirements Validation**: Validates testability
- **Security Compliance**: Scans and validates security

### Specialized (17 agents)

Domain-specific testing:

- **Contract Testing**: API contracts and schemas
- **Visual Accessibility**: Visual and a11y testing
- **Chaos Resilience**: Resilience and load testing
- **Learning Optimization**: Cross-domain learning

## Domain Structure

Each domain follows this standard structure:

```
v3/src/domains/<domain>/
├── index.ts              # Public exports
├── coordinator.ts        # Domain coordinator
├── plugin.ts             # Plugin registration
├── interfaces.ts         # Domain types
├── events.ts             # Domain events
├── services/
│   └── *.ts             # Domain services
└── __tests__/
    └── *.test.ts        # Domain tests
```

## Domain Communication

Domains communicate via events:

```
┌────────────────┐     Events      ┌────────────────┐
│ Test Generation│ ──────────────▶ │ Coverage       │
│ TestCreated    │                 │ GapDetected    │
└────────────────┘                 └────────────────┘
        │                                  │
        ▼                                  ▼
┌────────────────┐                 ┌────────────────┐
│ Code Intel     │ ◀───────────── │ Quality        │
│ ImpactAnalyzed │                 │ GateEvaluated  │
└────────────────┘                 └────────────────┘
```

## Quick Links

### Core Testing
- [Test Generation](test-generation.md) - AI test synthesis
- [Test Execution](test-execution.md) - Parallel execution
- [Coverage Analysis](coverage-analysis.md) - Gap detection
- [Quality Assessment](quality-assessment.md) - Quality gates

### Intelligence
- [Defect Intelligence](defect-intelligence.md) - Prediction
- [Code Intelligence](code-intelligence.md) - Knowledge graph
- [Requirements Validation](requirements-validation.md) - BDD
- [Security Compliance](security-compliance.md) - SAST/DAST

### Specialized
- [Contract Testing](contract-testing.md) - API contracts
- [Visual Accessibility](visual-accessibility.md) - Visual/a11y
- [Chaos Resilience](chaos-resilience.md) - Chaos engineering
- [Learning Optimization](learning-optimization.md) - Transfer learning

## Domain Metrics

| Domain | Coverage Target | Priority |
|--------|-----------------|----------|
| test-generation | 100% | P0 |
| test-execution | 100% | P0 |
| coverage-analysis | 100% | P0 |
| quality-assessment | 100% | P0 |
| defect-intelligence | 100% | P0 |
| code-intelligence | 100% | P0 |
| requirements-validation | 90% | P1 |
| security-compliance | 90% | P1 |
| contract-testing | 80% | P2 |
| visual-accessibility | 80% | P2 |
| chaos-resilience | 70% | P2 |
| learning-optimization | 100% | P0 |
