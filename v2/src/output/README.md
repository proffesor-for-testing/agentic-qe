# AI-Friendly Output Module

**Version:** 1.0.0
**Architecture Decision:** ADR-C1.1
**Specification:** [AI Output Format Spec](../../docs/design/ai-output-format-spec.md)

## Overview

This module provides structured JSON output optimized for AI agent consumption, enabling **100x faster parsing** compared to natural language terminal output. The format is deterministic, actionable, and backward compatible with human-readable output.

## Quick Start

### Basic Usage

```typescript
import { OutputModeDetector, OutputFormatter, OutputMode } from './output';

// Auto-detect mode (AI or Human)
const mode = OutputModeDetector.detectMode();

// Format output based on mode
const formatter: OutputFormatter = new MyFormatter();
const output = formatter.format(data, 'test_results', mode);

console.log(output);
```

### Environment Variables

Set these environment variables to control output behavior:

```bash
# Enable AI mode explicitly
export AQE_AI_OUTPUT=1

# Claude Code auto-detects (sets CLAUDECODE=1)
# Cursor AI auto-detects (sets CURSOR_AI=1)

# Force specific schema version
export AQE_OUTPUT_VERSION=1.0.0

# Pretty-print JSON for debugging
export AQE_OUTPUT_PRETTY=1

# Enable streaming for long operations
export AQE_OUTPUT_STREAM=1
```

### Example: Test Results Output

```typescript
import { TestResultsOutput, SCHEMA_VERSION } from './output';

const output: TestResultsOutput = {
  schemaVersion: SCHEMA_VERSION,
  outputType: 'test_results',
  timestamp: new Date().toISOString(),
  executionId: 'exec_test_20251212_103000',
  status: 'failure',
  metadata: {
    agentId: 'qe-test-executor',
    agentVersion: '2.3.5',
    duration: 12543,
    environment: 'development',
    framework: 'jest'
  },
  data: {
    summary: {
      total: 150,
      passed: 145,
      failed: 3,
      skipped: 2,
      duration: 12543,
      passRate: 96.67,
      failureRate: 2.00
    },
    suites: [],
    failures: [],
    flaky: []
  },
  actionSuggestions: [
    {
      action: 'fix_test_failures',
      priority: 'critical',
      reason: '3 test failures blocking deployment',
      affectedTests: ['ApiController: should handle concurrent requests'],
      steps: [
        'Review failure logs',
        'Run in isolation',
        'Check for race conditions'
      ],
      automation: {
        command: 'aqe fix failures --interactive',
        canAutoFix: false,
        confidence: 0.65,
        estimatedTime: 15
      }
    }
  ],
  warnings: [],
  errors: []
};

console.log(JSON.stringify(output, null, 2));
```

## Output Types

### 1. Test Results (`test_results`)

**Schema:** `TestResultsOutput`

Test execution results with failures, flaky tests, and coverage information.

**Key Fields:**
- `summary`: Overall test statistics
- `suites`: Test suite results
- `failures`: Failed tests with error details
- `flaky`: Flaky tests detected with patterns
- `coverage`: Code coverage metrics

**Actions:**
- `fix_test_failures`: Guide to fix failing tests
- `stabilize_flaky_tests`: Auto-stabilize flaky tests
- `increase_coverage`: Generate tests for coverage gaps

### 2. Coverage Report (`coverage_report`)

**Schema:** `CoverageReportOutput`

Code coverage analysis with gaps, trends, and file-level details.

**Key Fields:**
- `summary`: Overall coverage percentages
- `trend`: Coverage trend (improving/stable/degrading)
- `gaps`: Critical coverage gaps with priorities
- `files`: File-level coverage breakdown

**Actions:**
- `increase_coverage`: Target critical uncovered paths
- `review_coverage_trend`: Monitor coverage trajectory

### 3. Agent Status (`agent_status`)

**Schema:** `AgentStatusOutput`

Agent health, capabilities, dependencies, and configuration.

**Key Fields:**
- `agent`: Agent info, stats, and learning metrics
- `dependencies`: Required and optional service dependencies
- `configuration`: Agent configuration settings

**Actions:**
- `agent_ready`: Confirmation agent is operational

### 4. Quality Metrics (`quality_metrics`)

**Schema:** `QualityMetricsOutput`

Overall quality assessment with dimensions, gates, and technical debt.

**Key Fields:**
- `overallScore`: Quality score (0-100)
- `grade`: Letter grade (A+ to F)
- `dimensions`: Test coverage, code quality, security, performance, maintainability
- `qualityGates`: Gate pass/fail status
- `codeSmells`: Detected code smells by type
- `technicalDebt`: Estimated technical debt

**Actions:**
- `reduce_complexity`: Refactor complex code
- `fix_code_smells`: Auto-refactor duplications
- `fix_vulnerabilities`: Patch security issues

## Action Suggestion Framework

All outputs include `actionSuggestions` with specific next steps:

```typescript
interface ActionSuggestion {
  action: string;                    // Action identifier
  priority: ActionPriority;          // critical | high | medium | low | info
  reason: string;                    // Human-readable reason
  affectedTests?: string[];          // Affected test names
  targetFiles?: string[];            // Target file paths
  steps: string[];                   // Step-by-step guidance
  automation: {
    command: string;                 // CLI command to execute
    canAutoFix: boolean;             // Can be automated?
    confidence: number;              // Confidence (0-1)
    estimatedTime?: number;          // Est. time in minutes
  };
  impact?: {
    currentValue: number;
    targetValue: number;
    estimatedImprovement: number;
    businessValue: string;
  };
  relatedDocs?: string[];            // Related documentation
}
```

### Action Types

| Action | Priority | Automation | Description |
|--------|----------|------------|-------------|
| `fix_test_failures` | critical, high | Limited | Guide to fix failing tests |
| `stabilize_flaky_tests` | high, medium | High | Auto-stabilize flaky tests |
| `increase_coverage` | critical, high | High | Generate tests for gaps |
| `reduce_complexity` | high, medium | Limited | Suggest refactoring |
| `fix_vulnerabilities` | critical, high | Medium | Auto-patch vulnerabilities |
| `optimize_performance` | high, medium | Medium | Performance optimizations |
| `fix_code_smells` | medium, low | High | Auto-refactor code smells |
| `update_dependencies` | medium, low | High | Automated updates |

## Environment Detection

The module auto-detects AI agents and enables structured output:

```typescript
class OutputModeDetector {
  static detectMode(): OutputMode {
    // Explicit override
    if (process.env.AQE_AI_OUTPUT === '1') return OutputMode.AI;
    if (process.env.AQE_AI_OUTPUT === '0') return OutputMode.HUMAN;

    // Auto-detect AI agents
    if (process.env.CLAUDECODE === '1') return OutputMode.AI;
    if (process.env.CURSOR_AI === '1') return OutputMode.AI;
    if (process.env.AIDER_AI === '1') return OutputMode.AI;

    // Default: human mode
    return OutputMode.HUMAN;
  }
}
```

## Streaming Support

For long-running operations, the module supports streaming JSON updates:

```typescript
// Start message
{
  "streamType": "start",
  "executionId": "exec_test_123",
  "metadata": { "totalTests": 150 }
}

// Progress updates (newline-delimited)
{"streamType": "progress", "completed": 50, "total": 150}
{"streamType": "progress", "completed": 100, "total": 150}

// Final result (complete schema)
{
  "streamType": "complete",
  "schemaVersion": "1.0.0",
  "outputType": "test_results",
  "data": { ... }
}
```

Enable streaming:

```bash
export AQE_OUTPUT_STREAM=1
aqe execute tests --stream
```

## Schema Versioning

**Current Version:** 1.0.0

**Compatibility Rules:**
- Major version must match for compatibility
- Minor versions are backward compatible (additive changes only)
- Patch versions are bug fixes (no schema changes)

**Version Check:**

```typescript
function isCompatibleVersion(outputVersion: string, requiredVersion: string): boolean {
  const [outMajor] = outputVersion.split('.').map(Number);
  const [reqMajor] = requiredVersion.split('.').map(Number);

  return outMajor === reqMajor;
}
```

## Performance Targets

- **Parsing Speed:** 100x faster than natural language (regex/NLP)
- **Determinism:** Same input produces identical JSON structure
- **Overhead:** < 5ms for schema generation
- **Size:** Compact JSON (< 50KB for typical test results)

## Files

| File | Purpose |
|------|---------|
| `OutputFormatter.ts` | Core types and interfaces |
| `index.ts` | Module exports |
| `README.md` | This documentation |
| `../../docs/design/ai-output-format-spec.md` | Complete specification |
| `../../docs/design/ai-output-schema-summary.json` | Schema summary for memory storage |

## Integration Examples

### Claude Code

Claude Code auto-detects and enables AI mode:

```bash
# No configuration needed - auto-detected
aqe execute tests
# Output: Structured JSON
```

### CI/CD

Recommended for structured logs in CI/CD pipelines:

```yaml
# GitHub Actions
- name: Run Tests
  run: |
    export AQE_AI_OUTPUT=1
    aqe execute tests > test-results.json
    cat test-results.json | jq '.actionSuggestions'
```

### Human Mode (Terminal)

Default behavior for terminal usage:

```bash
# Human-readable output with colors
aqe execute tests

# Output:
# ================================================================================
# Test Results - 150 tests
# ================================================================================
# ✓ Passed: 145 (96.67%)
# ✗ Failed: 3 (2.00%)
# ...
```

## Contributing

When adding new output types:

1. Define schema in `OutputFormatter.ts`
2. Add action suggestions for common scenarios
3. Update `OutputFormatter` interface
4. Add examples to specification
5. Update this README

## Related Documentation

- [Complete Specification](../../docs/design/ai-output-format-spec.md)
- [Architecture Decision Record: C1.1](../../docs/architecture/adr-c1.1-ai-output.md)
- [User Guide: AI Mode Usage](../../docs/guides/ai-mode-usage.md)

---

**Generated by:** System Architecture Designer Agent
**Date:** 2025-12-12
**Version:** 1.0.0
