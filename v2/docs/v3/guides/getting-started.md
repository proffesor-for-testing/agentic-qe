# Getting Started with Agentic QE v3

This guide walks you through setting up and using Agentic QE v3's DDD-based quality engineering system.

## Prerequisites

- Node.js 18+
- TypeScript 5.0+
- Claude Code CLI
- (Optional) PostgreSQL for RuVector code intelligence

## Installation

```bash
# Install Agentic QE
npm install -g agentic-qe

# Verify installation
aqe --version
# v3.0.0

# Initialize in your project
aqe init
```

## Quick Start

### 1. Generate Tests

```bash
# Generate unit tests for a file
aqe-v3 test generate --file src/services/UserService.ts --framework jest

# Generate with coverage target
aqe-v3 test generate --scope src/api/ --coverage 90
```

### 2. Analyze Coverage

```bash
# O(log n) coverage gap detection
aqe-v3 coverage analyze --source src/ --tests tests/

# Risk-weighted analysis
aqe-v3 coverage gaps --risk-weighted --threshold 80
```

### 3. Run Quality Gate

```bash
# Evaluate deployment readiness
aqe-v3 quality assess --gates all

# Check specific gates
aqe-v3 quality check --coverage 80 --no-critical-vulns
```

### 4. Execute Tests

```bash
# Parallel execution with retry
aqe-v3 test run --parallel --workers 4 --retry 3

# Run affected tests only
aqe-v3 test run --affected --since HEAD~1
```

## Using Agents

### Spawn Individual Agents

```typescript
// Via Claude Code Task tool
Task("Generate tests", `
  Analyze src/services/PaymentService.ts and generate comprehensive tests.
  Include happy paths, edge cases, and error handling.
`, "v3-qe-test-generator")
```

### Multi-Agent Workflows

```typescript
// Parallel agent execution
Task("Coverage analysis", "Analyze coverage gaps", "v3-qe-coverage-specialist")
Task("Quality check", "Evaluate quality gates", "v3-qe-quality-gate")
Task("Security scan", "Run security audit", "v3-qe-security-scanner")
```

## Domain Commands

Each of the 12 domains has dedicated CLI commands:

| Domain | Command Prefix | Example |
|--------|---------------|---------|
| Test Generation | `aqe-v3 test` | `aqe-v3 test generate` |
| Test Execution | `aqe-v3 test run` | `aqe-v3 test run --parallel` |
| Coverage | `aqe-v3 coverage` | `aqe-v3 coverage analyze` |
| Quality | `aqe-v3 quality` | `aqe-v3 quality assess` |
| Defects | `aqe-v3 defect` | `aqe-v3 defect predict` |
| Code Intelligence | `aqe-v3 kg` | `aqe-v3 kg index` |
| Requirements | `aqe-v3 requirements` | `aqe-v3 requirements trace` |
| Security | `aqe-v3 security` | `aqe-v3 security scan` |
| Contracts | `aqe-v3 contract` | `aqe-v3 contract verify` |
| Visual | `aqe-v3 visual` | `aqe-v3 visual test` |
| Chaos | `aqe-v3 chaos` | `aqe-v3 chaos run` |
| Learning | `aqe-v3 learn` | `aqe-v3 learn status` |

## Configuration

Create `.agentic-qe/config.yaml`:

```yaml
v3:
  version: "3.0.0"

  # Enable all 12 domains
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

  # Agent limits
  maxConcurrentAgents: 15

  # Memory backend
  memoryBackend: hybrid  # SQLite + AgentDB
  hnswEnabled: true

  # Learning
  neuralLearning: true
```

## Next Steps

- [Migration from v2](../migration/v2-to-v3-migration.md)
- [Architecture Overview](../architecture/overview.md)
- [Domain Reference](../domains/index.md)
- [Agent Reference](../agents/index.md)
