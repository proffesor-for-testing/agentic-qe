# Agentic QE v3 Quick Reference

## CLI Commands

### Test Generation
```bash
aqe-v3 test generate --file <file> --framework <jest|vitest|mocha>
aqe-v3 test generate --scope <dir> --coverage <percent>
aqe-v3 test generate --pattern <pattern> --type <unit|integration|e2e>
```

### Test Execution
```bash
aqe-v3 test run --parallel --workers <n>
aqe-v3 test run --affected --since <commit>
aqe-v3 test run --retry <n> --retry-delay <ms>
aqe-v3 test run --shard <current>/<total>
```

### Coverage Analysis
```bash
aqe-v3 coverage analyze --source <dir> --tests <dir>
aqe-v3 coverage gaps --risk-weighted --threshold <percent>
aqe-v3 coverage report --format <html|json|markdown>
aqe-v3 coverage diff --base <branch> --head <branch>
```

### Quality Assessment
```bash
aqe-v3 quality assess --scope <dir> --gates all
aqe-v3 quality deploy-ready --environment <env>
aqe-v3 quality report --format dashboard --period <days>
```

### Defect Intelligence
```bash
aqe-v3 defect predict --changes <commit-range>
aqe-v3 defect patterns --period <days> --min-occurrences <n>
aqe-v3 defect rca --failure <test-id>
```

### Code Intelligence
```bash
aqe-v3 kg index --source <dir> --incremental
aqe-v3 kg search "<query>" --limit <n>
aqe-v3 kg deps --file <file> --depth <n>
aqe-v3 kg stats
```

### Requirements Validation
```bash
aqe-v3 requirements parse --source <jira|github>
aqe-v3 requirements trace --requirements <dir> --tests <dir>
aqe-v3 requirements bdd --story <id> --output <dir>
```

### Security Compliance
```bash
aqe-v3 security scan --scope <dir> --checks all
aqe-v3 security vulns --dependencies --severity <level>
aqe-v3 security compliance --standard <soc2|gdpr|hipaa>
```

### Contract Testing
```bash
aqe-v3 contract generate --api <openapi.yaml>
aqe-v3 contract verify --provider <url> --contracts <dir>
aqe-v3 contract breaking --old <v1> --new <v2>
```

### Visual & Accessibility
```bash
aqe-v3 visual test --baseline <env> --current <env>
aqe-v3 visual responsive --url <url> --viewports all
aqe-v3 a11y audit --url <url> --standard wcag22-aa
```

### Chaos & Resilience
```bash
aqe-v3 chaos run --experiment <name> --target <service>
aqe-v3 chaos load --scenario <name> --duration <time>
aqe-v3 chaos stress --endpoint <path> --max-users <n>
```

### Learning & Optimization
```bash
aqe-v3 learn status --agent <name>
aqe-v3 learn transfer --from <agent> --to <agent>
aqe-v3 learn tune --agent <name> --metric <metric>
```

## Agent Types (47+)

### Core Testing (9)
- `v3-qe-test-architect` - Test planning
- `v3-qe-tdd-specialist` - TDD workflow
- `v3-qe-integration-tester` - Integration tests
- `v3-qe-property-tester` - Property-based
- `v3-qe-parallel-executor` - Parallel execution
- `v3-qe-flaky-hunter` - Flaky detection
- `v3-qe-retry-handler` - Retry logic
- `v3-qe-execution-optimizer` - Optimization
- `v3-qe-test-data-architect` - Test data

### Analysis (8)
- `v3-qe-coverage-specialist` - Coverage metrics
- `v3-qe-gap-detector` - Gap detection
- `v3-qe-risk-scorer` - Risk scoring
- `v3-qe-mutation-tester` - Mutation testing
- `v3-qe-quality-gate` - Quality gates
- `v3-qe-quality-analyzer` - Metrics
- `v3-qe-deployment-advisor` - Deploy readiness
- `v3-qe-code-complexity` - Complexity

### Intelligence (8)
- `v3-qe-defect-predictor` - Prediction
- `v3-qe-pattern-learner` - Patterns
- `v3-qe-root-cause-analyzer` - RCA
- `v3-qe-regression-analyzer` - Regression
- `v3-qe-code-intelligence` - Knowledge graph
- `v3-qe-semantic-analyzer` - Semantic
- `v3-qe-dependency-mapper` - Dependencies
- `v3-qe-impact-analyzer` - Impact

### Specialized (22+)
See [Agent Index](../agents/index.md) for complete list.

## Coordination Protocols

| Protocol | Trigger | Purpose |
|----------|---------|---------|
| Morning Sync | 9am daily | Prioritization |
| Quality Gate | Release candidate | Deployment decision |
| Learning Consolidation | Friday 6pm | Pattern consolidation |
| Defect Investigation | Test failure | Root cause analysis |
| Code Intelligence Index | Code change | KG update |
| Security Audit | 2am daily | Security scan |

## Configuration Keys

```yaml
v3:
  maxConcurrentAgents: 15
  memoryBackend: hybrid
  hnswEnabled: true
  neuralLearning: true
  backgroundWorkers: 12
  hooks: 17
```

## Domain Events

| Domain | Key Events |
|--------|------------|
| test-generation | TestCaseGenerated, PatternLearned |
| test-execution | TestRunCompleted, FlakyDetected |
| coverage-analysis | CoverageGapDetected, RiskIdentified |
| quality-assessment | QualityGateEvaluated, DeployApproved |
| defect-intelligence | DefectPredicted, RootCauseFound |
| code-intelligence | KnowledgeGraphUpdated, ImpactAnalyzed |
