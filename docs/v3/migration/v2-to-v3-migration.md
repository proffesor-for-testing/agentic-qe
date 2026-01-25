# Migration Guide: v2 to v3

This guide helps you migrate from Agentic QE v2.x to v3.0.

## Overview

v3 is a complete architectural reimagining with:
- 12 DDD bounded contexts (vs flat structure)
- 47+ specialized agents (vs 22)
- Event-driven communication (vs direct calls)
- O(log n) performance (vs O(n))

## Migration Strategy

### Phase 1: Dual Operation (Recommended)

Both v2 and v3 APIs remain active during migration:

```bash
# v2 commands still work
aqe generate tests --file src/app.ts

# v3 commands available
aqe-v3 test generate --file src/app.ts
```

### Phase 2: Gradual Migration

Migrate feature by feature, domain by domain.

### Phase 3: v2 Sunset

Once fully migrated, deprecate v2 usage.

## Agent Migration Map

| v2 Agent | v3 Agent | Domain |
|----------|----------|--------|
| `qe-test-generator` | `v3-qe-test-architect` | test-generation |
| `qe-coverage-analyzer` | `v3-qe-coverage-specialist` | coverage-analysis |
| `qe-quality-gate` | `v3-qe-quality-gate` | quality-assessment |
| `qe-quality-analyzer` | `v3-qe-quality-analyzer` | quality-assessment |
| `qe-flaky-test-hunter` | `v3-qe-flaky-hunter` | test-execution |
| `qe-test-executor` | `v3-qe-parallel-executor` | test-execution |
| `qe-deployment-readiness` | `v3-qe-deployment-advisor` | quality-assessment |
| `qe-code-intelligence` | `v3-qe-code-intelligence` | code-intelligence |
| `qe-requirements-validator` | `v3-qe-requirements-validator` | requirements-validation |
| `qe-regression-risk-analyzer` | `v3-qe-regression-analyzer` | defect-intelligence |
| `qe-api-contract-validator` | `v3-qe-contract-validator` | contract-testing |
| `qe-visual-tester` | `v3-qe-visual-tester` | visual-accessibility |
| `qe-a11y-ally` | `v3-qe-a11y-specialist` | visual-accessibility |
| `qe-chaos-engineer` | `v3-qe-chaos-engineer` | chaos-resilience |
| `qe-security-scanner` | `v3-qe-security-scanner` | security-compliance |
| `qe-performance-tester` | `v3-qe-performance-profiler` | chaos-resilience |
| `qe-production-intelligence` | `v3-qe-production-intel` | learning-optimization |
| `qe-code-complexity` | `v3-qe-code-complexity` | quality-assessment |
| `qe-test-data-architect` | `v3-qe-test-data-architect` | test-generation |
| `qx-partner` | `v3-qe-qx-partner` | cross-domain |
| `qe-fleet-commander` | `v3-qe-fleet-commander` | cross-domain |

## Command Migration

### Test Generation

```bash
# v2
aqe generate tests --file src/app.ts --coverage 80

# v3
aqe-v3 test generate --file src/app.ts --coverage 80
```

### Coverage Analysis

```bash
# v2
aqe analyze coverage --source src/

# v3
aqe-v3 coverage analyze --source src/
```

### Quality Gates

```bash
# v2
aqe check quality --gates all

# v3
aqe-v3 quality assess --gates all
```

### Test Execution

```bash
# v2
aqe run tests --parallel

# v3
aqe-v3 test run --parallel --workers 4
```

## API Changes

### MCP Tools

v2 MCP tools are preserved with compatibility layer:

```typescript
// v2 tool call (still works)
mcp__agentic-qe__test_generate_enhanced({...})

// v3 preferred
mcp__agentic-qe__v3_test_generate({...})
```

### Agent Spawning

```typescript
// v2
Task("Generate tests", "...", "qe-test-generator")

// v3
Task("Generate tests", "...", "v3-qe-test-generator")
```

## Configuration Migration

### v2 Configuration

```yaml
# .agentic-qe/config.yaml (v2)
version: "2.x"
agents:
  - qe-test-generator
  - qe-coverage-analyzer
memory:
  backend: sqlite
```

### v3 Configuration

```yaml
# .agentic-qe/config.yaml (v3)
v3:
  version: "3.0.0"

  domains:
    - test-generation
    - test-execution
    - coverage-analysis
    - quality-assessment
    - defect-intelligence
    - code-intelligence
    - requirements-validation
    - security-compliance
    - contract-testing
    - visual-accessibility
    - chaos-resilience
    - learning-optimization

  maxConcurrentAgents: 15
  memoryBackend: hybrid
  hnswEnabled: true
  neuralLearning: true
```

## New Features in v3

### 1. Domain Events

Cross-domain communication via events:

```typescript
// Subscribe to events
eventBus.subscribe('TestCaseGenerated', async (event) => {
  // Trigger coverage analysis
});
```

### 2. Coordination Protocols

Automated multi-agent workflows:

```bash
# Trigger quality gate protocol
aqe-v3 orchestrate --protocol quality-gate
```

### 3. O(log n) Coverage

HNSW-based sublinear coverage analysis:

```bash
# 100x faster on large codebases
aqe-v3 coverage analyze --algorithm sublinear
```

### 4. Knowledge Graph

Semantic code search:

```bash
aqe-v3 kg search "authentication middleware"
```

### 5. Cross-Domain Learning

Transfer patterns between agents:

```bash
aqe-v3 learn transfer --from jest-generator --to vitest-generator
```

## Breaking Changes

### 1. Agent Names

All v3 agents use `v3-qe-` prefix:
- ❌ `qe-test-generator`
- ✅ `v3-qe-test-generator`

### 2. CLI Command Structure

Commands are now domain-scoped:
- ❌ `aqe generate tests`
- ✅ `aqe-v3 test generate`

### 3. Configuration Format

New YAML structure with domain configuration.

### 4. Memory Backend

Default changed from SQLite to hybrid (SQLite + AgentDB).

## Rollback Plan

If issues arise, rollback to v2:

```bash
# Use v2 commands
aqe --version  # Still available

# Disable v3 in config
v3:
  enabled: false
```

## Support

- [v3 Documentation](../README.md)
- [Architecture Overview](../architecture/overview.md)
- [GitHub Issues](https://github.com/anthropics/agentic-qe/issues)
