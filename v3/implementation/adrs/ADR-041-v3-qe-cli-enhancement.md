# ADR-041: V3 QE CLI Enhancement

**Status**: Proposed
**Date**: 2026-01-11
**Author**: Claude Code

## Context

The existing `v3-qe-cli` skill provides basic CLI commands for QE operations but lacks the modern CLI features from `v3-cli-modernization`. Current issues:

1. No interactive wizard for complex QE operations
2. Missing progress indicators for long-running fleet operations
3. No workflow automation for QE pipelines
4. Basic command completion without intelligence
5. No streaming output for test execution

## Decision

Enhance `v3-qe-cli` with modern CLI features:

1. **Interactive Test Generation Wizard**
   - Step-by-step test configuration
   - AI-powered test suggestions
   - Coverage goal setting

2. **Progress Bars for Fleet Operations**
   - Real-time agent progress tracking
   - Test execution progress
   - Coverage analysis progress

3. **Workflow Automation**
   - QE pipeline definitions
   - Scheduled test runs
   - CI/CD integration hooks

4. **Intelligent Command Completion**
   - Context-aware suggestions
   - Test file completion
   - Agent name completion

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    V3 QE CLI Enhanced                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Interactive Wizards                     │    │
│  │  • test-generate-wizard                             │    │
│  │  • coverage-analyze-wizard                          │    │
│  │  • fleet-init-wizard                                │    │
│  │  • security-scan-wizard                             │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Progress Indicators                     │    │
│  │  • Multi-bar for parallel agents                    │    │
│  │  • Spinner for async operations                     │    │
│  │  • ETA estimation                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Workflow Engine                         │    │
│  │  • Pipeline definitions (YAML)                      │    │
│  │  • Scheduled execution                              │    │
│  │  • Event triggers                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Smart Completion                        │    │
│  │  • Context-aware suggestions                        │    │
│  │  • History-based ranking                            │    │
│  │  • Agent/test file completion                       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Enhanced Commands

### Interactive Wizards

```bash
# Test generation wizard
aqe test generate --wizard
# Prompts for:
# - Source file(s) to test
# - Test type (unit/integration/e2e)
# - Coverage target (%)
# - Framework preference
# - AI enhancement level

# Coverage analysis wizard
aqe coverage analyze --wizard
# Prompts for:
# - Target directory
# - Gap detection sensitivity
# - Report format
# - Priority focus areas

# Fleet initialization wizard
aqe fleet init --wizard
# Prompts for:
# - Topology type
# - Agent count
# - Domain focus
# - Memory allocation
```

### Progress Indicators

```bash
# Fleet operation with multi-bar progress
$ aqe fleet execute --task "comprehensive-testing"

Fleet Progress ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100%

Agent Progress:
  v3-qe-test-architect     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100% ✓
  v3-qe-coverage-specialist ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100% ✓
  v3-qe-quality-gate        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100% ✓
  v3-qe-security-scanner    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 78% ⋯
  v3-qe-defect-predictor    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 65% ⋯

ETA: 12s | Tests: 847/1171 | Coverage: 87.3%
```

### Workflow Automation

```yaml
# qe-pipeline.yaml
name: daily-qe-pipeline
schedule: "0 2 * * *"  # 2 AM daily

stages:
  - name: test-generation
    command: aqe test generate
    params:
      target: src/
      coverage-goal: 90
      ai-enhanced: true

  - name: parallel-execution
    command: aqe test execute
    params:
      parallel: 8
      retry: 3
      timeout: 300

  - name: coverage-analysis
    command: aqe coverage analyze
    params:
      gap-detection: true
      report-format: html

  - name: quality-gate
    command: aqe quality gate
    params:
      fail-threshold: 80
      coverage-min: 85

triggers:
  - event: push
    branches: [main, develop]
  - event: pull_request
    types: [opened, synchronize]
```

```bash
# Run workflow
aqe workflow run qe-pipeline.yaml

# Schedule workflow
aqe workflow schedule qe-pipeline.yaml

# List scheduled workflows
aqe workflow list --scheduled
```

### Smart Completion

```bash
# Bash completion
$ aqe test gen<TAB>
generate  generate-wizard

$ aqe agent spawn --type v3-qe-<TAB>
v3-qe-test-architect       v3-qe-coverage-specialist
v3-qe-quality-gate         v3-qe-defect-predictor
v3-qe-tdd-specialist       v3-qe-security-scanner
...

$ aqe test execute --file src/<TAB>
src/services/auth.test.ts     src/utils/date.test.ts
src/components/Button.test.tsx src/api/users.test.ts
...
```

## Streaming Output

```bash
# Streaming test results
$ aqe test execute --stream

✓ UserService.test.ts
  ✓ should create user (12ms)
  ✓ should validate email (3ms)
  ✓ should hash password (8ms)

✓ AuthService.test.ts
  ✓ should authenticate user (15ms)
  ✓ should refresh token (5ms)
  ○ should handle MFA (skipped)

✗ PaymentService.test.ts
  ✓ should process payment (23ms)
  ✗ should handle declined card (45ms)
    Expected: "DECLINED"
    Received: undefined

Tests: 8 passed, 1 failed, 1 skipped
Time:  1.234s
```

## Performance Targets

| Metric | Current | Target |
|--------|---------|--------|
| Startup time | ~1.2s | <400ms |
| Completion response | ~300ms | <50ms |
| Progress update rate | 1/s | 10/s |
| Wizard navigation | ~200ms/step | <50ms/step |

## Configuration

```typescript
const QE_CLI_CONFIG = {
  // Interactive mode
  wizards: {
    enabled: true,
    themes: ['default', 'minimal', 'detailed'],
    defaultTheme: 'default'
  },

  // Progress indicators
  progress: {
    style: 'multi-bar',
    updateIntervalMs: 100,
    showETA: true,
    colors: true
  },

  // Completion
  completion: {
    maxSuggestions: 10,
    historyWeight: 0.3,
    contextWeight: 0.7,
    fuzzyMatch: true
  },

  // Streaming
  streaming: {
    enabled: true,
    bufferSize: 100,
    updateIntervalMs: 50
  }
};
```

## Consequences

### Positive
- Improved developer experience
- Faster command discovery
- Visual feedback for long operations
- Automated QE pipelines
- CI/CD integration ready

### Negative
- Additional CLI dependencies (prompts, progress bars)
- Learning curve for workflow YAML
- Increased CLI binary size

### Mitigation
- Optional interactive mode (--no-interactive)
- Workflow examples and templates
- Tree-shaking for minimal builds

## Related ADRs

- ADR-037: V3 QE Agent Naming
- ADR-038: V3 QE Memory Unification
- ADR-039: V3 QE MCP Optimization
- ADR-040: V3 QE Agentic-Flow Integration
- v3-cli-modernization (claude-flow)
