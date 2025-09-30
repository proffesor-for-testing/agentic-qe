# AQE Slash Commands

This directory contains 8 slash command definitions for the Agentic Quality Engineering (AQE) Fleet.

## Available Commands

| Command | File | Purpose |
|---------|------|---------|
| `/aqe-generate` | `aqe-generate.md` | Generate comprehensive test suites using AI |
| `/aqe-execute` | `aqe-execute.md` | Execute tests with parallel orchestration |
| `/aqe-analyze` | `aqe-analyze.md` | Analyze coverage and identify gaps |
| `/aqe-optimize` | `aqe-optimize.md` | Optimize test suites using sublinear algorithms |
| `/aqe-report` | `aqe-report.md` | Generate quality engineering reports |
| `/aqe-fleet-status` | `aqe-fleet-status.md` | Display fleet health and agent status |
| `/aqe-chaos` | `aqe-chaos.md` | Run chaos testing scenarios |
| `/aqe-benchmark` | `aqe-benchmark.md` | Run performance benchmarks |

## Command Structure

Each command file follows this structure:

```markdown
---
name: command-name
description: Brief description
---

# Command Name

## Usage
## Options
## Examples
## Integration with Claude Code
## Agent Coordination
## Memory Operations
## Expected Outputs
## Error Handling
## Performance Characteristics
## See Also
```

## Quick Start

### Using Commands in Claude Code

```javascript
// Spawn agent using Claude Code's Task tool
Task("Generate tests", "Create test suite for auth module", "qe-test-generator")

// Execute command directly
/aqe-generate src/services/auth-service.ts --coverage 95
```

### Command Chaining

```bash
# Complete QE workflow
/aqe-generate src/services/user-service.ts
/aqe-execute tests/unit/user-service.test.ts
/aqe-analyze coverage --threshold 95
/aqe-report summary
```

## Integration Features

### Claude Flow Hooks
All commands integrate with Claude Flow for coordination:
- Pre-task hooks for initialization
- Post-task hooks for results storage
- Memory operations for state sharing
- Neural pattern training from outcomes

### Agent Coordination
Commands spawn specialized QE agents:
- **qe-test-generator**: Test generation
- **qe-test-executor**: Test execution
- **qe-coverage-analyzer**: Coverage analysis
- **qe-quality-gate**: Quality validation
- **qe-performance-tester**: Performance testing
- **qe-security-scanner**: Security scanning

### Memory Keys
Commands use structured memory keys:
- `aqe/test-generation/*` - Test generation results
- `aqe/execution/*` - Test execution data
- `aqe/coverage/*` - Coverage metrics
- `aqe/optimization/*` - Optimization results
- `aqe/coordination/*` - Fleet coordination

## Documentation

- **Specification**: `/docs/QE-SLASH-COMMANDS-SPECIFICATION.md`
- **Implementation Guide**: `/docs/QE-COMMANDS-IMPLEMENTATION-GUIDE.md`
- **Quick Reference**: `/docs/QE-COMMANDS-QUICK-REFERENCE.md`

## Status

✅ All 8 commands implemented and documented
✅ Claude Code integration patterns defined
✅ Agent coordination protocols specified
✅ Memory operations documented
✅ Example workflows provided

**Version:** 2.0.0
**Date:** 2025-09-30
**Maintainer:** AQE Fleet Team
