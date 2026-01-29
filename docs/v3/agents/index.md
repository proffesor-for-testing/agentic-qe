# Agent Index

Agentic QE v3 includes 47+ specialized agents organized hierarchically across 12 domains.

## Agent Hierarchy

```
QUEEN COORDINATOR (1)
│
├── TEST GENERATION GROUP (5)
│   ├── v3-qe-test-architect
│   ├── v3-qe-tdd-specialist
│   ├── v3-qe-integration-tester
│   ├── v3-qe-property-tester
│   └── v3-qe-test-data-architect
│
├── TEST EXECUTION GROUP (4)
│   ├── v3-qe-parallel-executor
│   ├── v3-qe-flaky-hunter
│   ├── v3-qe-retry-handler
│   └── v3-qe-execution-optimizer
│
├── COVERAGE ANALYSIS GROUP (4)
│   ├── v3-qe-coverage-specialist
│   ├── v3-qe-gap-detector
│   ├── v3-qe-risk-scorer
│   └── v3-qe-mutation-tester
│
├── QUALITY ASSESSMENT GROUP (4)
│   ├── v3-qe-quality-gate
│   ├── v3-qe-quality-analyzer
│   ├── v3-qe-deployment-advisor
│   └── v3-qe-code-complexity
│
├── DEFECT INTELLIGENCE GROUP (4)
│   ├── v3-qe-defect-predictor
│   ├── v3-qe-pattern-learner
│   ├── v3-qe-root-cause-analyzer
│   └── v3-qe-regression-analyzer
│
├── REQUIREMENTS VALIDATION GROUP (4)
│   ├── v3-qe-requirements-validator
│   ├── v3-qe-bdd-scenario-writer
│   ├── v3-qe-testability-scorer
│   └── v3-qe-acceptance-criteria
│
├── CODE INTELLIGENCE GROUP (4)
│   ├── v3-qe-code-intelligence
│   ├── v3-qe-semantic-analyzer
│   ├── v3-qe-dependency-mapper
│   └── v3-qe-impact-analyzer
│
├── SECURITY COMPLIANCE GROUP (4)
│   ├── v3-qe-security-scanner
│   ├── v3-qe-security-auditor
│   ├── v3-qe-compliance-validator
│   └── v3-qe-vulnerability-tracker
│
├── CONTRACT TESTING GROUP (4)
│   ├── v3-qe-contract-validator
│   ├── v3-qe-api-compatibility
│   ├── v3-qe-schema-validator
│   └── v3-qe-graphql-tester
│
├── VISUAL ACCESSIBILITY GROUP (4)
│   ├── v3-qe-visual-tester
│   ├── v3-qe-a11y-specialist
│   ├── v3-qe-responsive-tester
│   └── v3-qe-screenshot-differ
│
├── CHAOS RESILIENCE GROUP (4)
│   ├── v3-qe-chaos-engineer
│   ├── v3-qe-resilience-tester
│   ├── v3-qe-load-tester
│   └── v3-qe-performance-profiler
│
├── LEARNING OPTIMIZATION GROUP (5)
│   ├── v3-qe-learning-coordinator
│   ├── v3-qe-transfer-specialist
│   ├── v3-qe-metrics-optimizer
│   ├── v3-qe-production-intel
│   └── v3-qe-knowledge-manager
│
├── CROSS-DOMAIN SPECIALISTS (2)
│   ├── v3-qe-qx-partner
│   └── v3-qe-fleet-commander
│
├── QCSD IDEATION GROUP (4)
│   ├── v3-qe-quality-criteria-recommender
│   ├── v3-qe-product-factors-assessor
│   ├── v3-qe-risk-assessor
│   └── v3-qe-test-idea-rewriter
│
└── SUBAGENTS (7)
    ├── v3-qe-code-reviewer
    ├── v3-qe-test-writer
    ├── v3-qe-test-implementer
    ├── v3-qe-test-refactorer
    ├── v3-qe-data-generator
    ├── v3-qe-flaky-investigator
    └── v3-qe-coverage-gap-analyzer
```

## Agent Categories

### Coordinator (1)

| Agent | Purpose |
|-------|---------|
| `v3-qe-queen-coordinator` | Fleet orchestration, cross-domain coordination |

### Domain Agents (46)

See individual domain pages for detailed agent information.

### Cross-Domain Specialists (2)

| Agent | Purpose |
|-------|---------|
| `v3-qe-qx-partner` | Quality Experience analysis |
| `v3-qe-fleet-commander` | Fleet management, autoscaling |

### QCSD Ideation Agents (4)

Specialized agents for the QCSD Ideation phase using HTSM v6.3 and SFDIPOT frameworks:

| Agent | Purpose |
|-------|---------|
| `v3-qe-quality-criteria-recommender` | HTSM v6.3 quality criteria analysis with 10 categories |
| `v3-qe-product-factors-assessor` | SFDIPOT product factors assessment with 37 subcategories |
| `v3-qe-risk-assessor` | Multi-factor risk scoring with cross-phase learning |
| `v3-qe-test-idea-rewriter` | Transform passive "Verify" tests to active action verbs |

These agents integrate with the cross-phase memory system for automated QCSD feedback loops.

### Subagents (7)

Task-specific workers that can be spawned by domain agents:

| Agent | Purpose |
|-------|---------|
| `v3-qe-code-reviewer` | Code review |
| `v3-qe-test-writer` | TDD RED phase |
| `v3-qe-test-implementer` | TDD GREEN phase |
| `v3-qe-test-refactorer` | TDD REFACTOR phase |
| `v3-qe-data-generator` | Test data generation |
| `v3-qe-flaky-investigator` | Flaky test investigation |
| `v3-qe-coverage-gap-analyzer` | Gap analysis |

## Agent Statistics

| Category | Count |
|----------|-------|
| Coordinator | 1 |
| Domain Agents | 46 |
| Cross-Domain | 2 |
| QCSD Ideation | 4 |
| Subagents | 7 |
| **Total** | **60** |

*Note: Agent definitions in `.claude/agents/v3/` exceed this count due to additional specialized variants.*

## Using Agents

### Via Claude Code Task Tool

```typescript
// Spawn a specific agent
Task("Generate unit tests", `
  Analyze src/services/UserService.ts
  Generate comprehensive Jest tests
`, "v3-qe-test-generator")
```

### Via CLI

```bash
# Agent-specific commands
aqe-v3 test generate --agent v3-qe-test-architect
```

### Via MCP

```typescript
mcp__agentic_qe__agent_spawn({
  type: 'v3-qe-test-generator',
  capabilities: ['jest', 'typescript']
})
```

## Agent Capabilities

Each agent has defined capabilities:

```yaml
# Example: v3-qe-test-generator
capabilities:
  - jest
  - vitest
  - mocha
  - typescript
  - javascript
  - react
  - node

tools:
  - file_read
  - file_write
  - code_analysis
  - pattern_matching
```

## Related Documentation

- [Hierarchy Details](hierarchy.md)
- [Coordination Protocols](protocols.md)
- [Domain Index](../domains/index.md)
