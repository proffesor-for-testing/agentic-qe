# AQE CLI - Quick Command Reference

## Overview

`aqe` is the simplified command-line interface for the Agentic Quality Engineering Fleet. It provides quick, user-friendly access to all QE functionality with minimal typing.

## Installation

```bash
# Install globally
npm install -g agentic-qe

# Or use locally
./bin/aqe
```

Once installed, the `aqe` command is available globally.

## Core Commands

### Initialize AQE Fleet

```bash
# Initialize in current directory
aqe init

# Initialize in specific directory
aqe init /path/to/project
```

**What it does:**
- Creates 6 QE agents in `.claude/agents/`
- Updates/creates `CLAUDE.md` with AQE rules
- Sets up Claude Flow integration
- Configures fleet topology

### Check Status

```bash
aqe status
```

Shows:
- Fleet ID and configuration
- Active agents and their status
- Fleet topology
- Memory usage

### Setup MCP Server

```bash
aqe mcp
```

Configures MCP server for Claude Code integration.

## Quick Actions

### Generate Tests

```bash
aqe test user-service
aqe test auth-module
aqe test "complex module name"
```

Uses the `qe-test-generator` agent to create:
- Unit tests
- Integration tests
- Property-based tests
- Performance tests

### Analyze Coverage

```bash
aqe coverage
```

Uses the `qe-coverage-analyzer` agent to:
- Identify coverage gaps
- Find critical paths
- Optimize test selection
- Generate coverage reports

### Run Quality Gate

```bash
aqe quality
```

Uses the `qe-quality-gate` agent to:
- Evaluate quality thresholds
- Make go/no-go decisions
- Assess risks
- Validate policies

## Agent Management

### Spawn Agent

```bash
aqe agent spawn --name qe-test-generator --type test-generator
```

### Execute Agent Task

```bash
aqe agent execute --name qe-test-executor --task "run parallel tests"
```

### Check Agent Status

```bash
aqe agent status --name qe-coverage-analyzer
```

## Available Agents

| Agent | Purpose | Key Features |
|-------|---------|--------------|
| `qe-test-generator` | AI test creation | Property-based, boundary analysis |
| `qe-test-executor` | Parallel execution | Retry logic, real-time reporting |
| `qe-coverage-analyzer` | Coverage optimization | O(log n) algorithms, gap detection |
| `qe-quality-gate` | Quality decisions | Risk assessment, policy validation |
| `qe-performance-tester` | Load testing | Bottleneck detection, SLA validation |
| `qe-security-scanner` | Security scanning | SAST/DAST, CVE monitoring |

## Examples

### Complete Test Workflow

```bash
# Initialize AQE in your project
aqe init

# Generate tests for a module
aqe test user-service

# Execute tests
aqe agent execute --name qe-test-executor --task "run all tests"

# Analyze coverage
aqe coverage

# Check quality gate
aqe quality
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Initialize AQE
  run: aqe init

- name: Generate Tests
  run: aqe test src/

- name: Run Tests
  run: aqe agent execute --name qe-test-executor --task "CI test run"

- name: Quality Gate
  run: aqe quality
```

### Quick Test Generation for Multiple Modules

```bash
# Generate tests for multiple modules
for module in auth user payment; do
  aqe test $module
done

# Or use parallel execution
aqe test auth & aqe test user & aqe test payment & wait
```

## Advanced Usage

### Custom Agent Configuration

```bash
# Spawn with custom capabilities
aqe agent spawn --name custom-tester \
  --type test-generator \
  --capabilities "integration,e2e,performance"

# Execute with parameters
aqe agent execute --name qe-performance-tester \
  --task "load test with 1000 users" \
  --duration "5m" \
  --ramp-up "30s"
```

### Memory Coordination

```bash
# Store test results in memory
aqe agent execute --name qe-test-executor \
  --task "run tests and store results" \
  --memory-key "aqe/test-results/latest"

# Retrieve and analyze
aqe agent execute --name qe-coverage-analyzer \
  --task "analyze from memory" \
  --memory-key "aqe/test-results/latest"
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AQE_TOPOLOGY` | Fleet topology | `hierarchical` |
| `AQE_MAX_AGENTS` | Max concurrent agents | `8` |
| `AQE_MEMORY_NS` | Memory namespace | `aqe` |
| `AQE_LOG_LEVEL` | Logging verbosity | `info` |

## Troubleshooting

### Command Not Found

If `aqe: command not found`:
```bash
# Ensure it's installed globally
npm install -g agentic-qe

# Or use npx
npx aqe init

# Or use local path
./node_modules/.bin/aqe init
```

### CLAUDE.md Not Updated

If CLAUDE.md isn't created/updated:
```bash
# Check permissions
ls -la CLAUDE.md

# Run with explicit path
aqe init .

# Check for errors
aqe init --verbose
```

### Agents Not Working

If agents aren't functioning:
```bash
# Check status
aqe status

# Reinitialize
aqe init --force

# Check Claude Flow
npx claude-flow@alpha status
```

## Best Practices

1. **Always Initialize First**: Run `aqe init` before using any agents
2. **Use Shorthand Commands**: `aqe test` is faster than full agent commands
3. **Check Status Regularly**: `aqe status` shows system health
4. **Leverage Quick Actions**: Built-in commands for common tasks
5. **Update CLAUDE.md**: Let `aqe init` manage your CLAUDE.md file

## Comparison with Full Commands

| Short (`aqe`) | Full (`agentic-qe`) | Benefit |
|---------------|---------------------|---------|
| `aqe init` | `agentic-qe init` | 50% fewer keystrokes |
| `aqe test module` | `agentic-qe agent execute --name qe-test-generator --task "generate tests for module"` | 80% faster |
| `aqe coverage` | `agentic-qe agent execute --name qe-coverage-analyzer --task "analyze coverage"` | 75% faster |
| `aqe quality` | `agentic-qe agent execute --name qe-quality-gate --task "evaluate quality gate"` | 75% faster |

## Migration from `agentic-qe`

If you're migrating from the full `agentic-qe` commands:

```bash
# Old way
agentic-qe init
agentic-qe agent spawn --name qe-test-generator
agentic-qe agent execute --name qe-test-generator --task "generate tests"

# New way
aqe init
aqe test
```

## Support

- Documentation: [AQE Docs](../README.md)
- Issues: [GitHub Issues](https://github.com/agentic-qe/issues)
- Updates: Run `npm update -g agentic-qe` to get latest

---

*AQE - Making quality engineering as simple as three letters.*