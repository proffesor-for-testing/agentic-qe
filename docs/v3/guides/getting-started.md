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
aqe test generate --file src/services/UserService.ts --framework jest

# Generate with coverage target
aqe test generate --scope src/api/ --coverage 90
```

### 2. Analyze Coverage

```bash
# O(log n) coverage gap detection
aqe coverage analyze --source src/ --tests tests/

# Risk-weighted analysis
aqe coverage gaps --risk-weighted --threshold 80
```

### 3. Run Quality Gate

```bash
# Evaluate deployment readiness
aqe quality assess --gates all

# Check specific gates
aqe quality check --coverage 80 --no-critical-vulns
```

### 4. Execute Tests

```bash
# Parallel execution with retry
aqe test run --parallel --workers 4 --retry 3

# Run affected tests only
aqe test run --affected --since HEAD~1
```

## Using Agents

### Spawn Individual Agents

```typescript
// Via Claude Code Task tool
Task("Generate tests", `
  Analyze src/services/PaymentService.ts and generate comprehensive tests.
  Include happy paths, edge cases, and error handling.
`, "qe-test-generator")
```

### Multi-Agent Workflows

```typescript
// Parallel agent execution
Task("Coverage analysis", "Analyze coverage gaps", "qe-coverage-specialist")
Task("Quality check", "Evaluate quality gates", "qe-quality-gate")
Task("Security scan", "Run security audit", "qe-security-scanner")
```

## Domain Commands

Each of the 12 domains has dedicated CLI commands:

| Domain | Command Prefix | Example |
|--------|---------------|---------|
| Test Generation | `aqe test` | `aqe test generate` |
| Test Execution | `aqe test run` | `aqe test run --parallel` |
| Coverage | `aqe coverage` | `aqe coverage analyze` |
| Quality | `aqe quality` | `aqe quality assess` |
| Defects | `aqe defect` | `aqe defect predict` |
| Code Intelligence | `aqe kg` | `aqe kg index` |
| Requirements | `aqe requirements` | `aqe requirements trace` |
| Security | `aqe security` | `aqe security scan` |
| Contracts | `aqe contract` | `aqe contract verify` |
| Visual | `aqe visual` | `aqe visual test` |
| Chaos | `aqe chaos` | `aqe chaos run` |
| Learning | `aqe learn` | `aqe learn status` |

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
