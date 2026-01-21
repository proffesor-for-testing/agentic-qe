# AI-Friendly Output Format Specification

**Version:** 1.0.0
**Status:** Draft
**Created:** 2025-12-12
**Architecture Decision:** ADR-C1.1

## Executive Summary

This specification defines a structured JSON output format optimized for AI agent consumption, enabling 100x faster parsing compared to natural language terminal output. The format supports backward compatibility with human-readable output while providing deterministic, actionable data for autonomous AI workflows.

## Table of Contents

1. [Objectives](#objectives)
2. [Design Principles](#design-principles)
3. [Environment Detection](#environment-detection)
4. [Output Modes](#output-modes)
5. [Schema Definitions](#schema-definitions)
6. [Action Suggestion Framework](#action-suggestion-framework)
7. [Streaming Support](#streaming-support)
8. [Versioning Strategy](#versioning-strategy)
9. [Implementation Guidelines](#implementation-guidelines)
10. [Examples](#examples)

## Objectives

### Primary Goals

1. **100x Faster Parsing**: Eliminate regex/NLP overhead with structured JSON
2. **Deterministic Output**: Same input always produces identical JSON structure
3. **Actionable Intelligence**: Provide specific action suggestions for common scenarios
4. **Seamless Integration**: Auto-detect Claude Code and enable AI mode automatically
5. **Backward Compatible**: Maintain human-readable output when not in AI mode

### Non-Goals

- Replace existing human-readable formats entirely
- Support XML or other structured formats (JSON only)
- Provide real-time streaming for all operations (selected operations only)

## Design Principles

### 1. Determinism First

```json
{
  "version": "1.0.0",
  "timestamp": "2025-12-12T10:30:00.000Z",
  "executionId": "exec_abc123",
  "deterministic": true
}
```

- All fields must have consistent ordering
- Timestamps use ISO 8601 format
- IDs are deterministic (hash-based when possible)
- Floating-point numbers rounded to fixed precision (2 decimals for percentages)

### 2. Actionable by Default

Every output includes an `actionSuggestions` array with specific next steps:

```json
{
  "actionSuggestions": [
    {
      "action": "fix_test_failures",
      "priority": "critical",
      "reason": "3 test failures detected",
      "steps": [
        "Review test logs in /tmp/test-failures.log",
        "Run failed tests in isolation: npm test -- TestName",
        "Check for race conditions in async tests"
      ],
      "automation": {
        "command": "aqe fix failures --file=test-failures.json",
        "canAutoFix": true,
        "confidence": 0.85
      }
    }
  ]
}
```

### 3. Schema Evolution

- Every output includes `version` field for schema versioning
- Additive changes only (no breaking changes within major version)
- Graceful degradation for unknown fields
- Clear deprecation warnings for obsolete fields

### 4. Claude Code Integration

- Auto-detect `CLAUDECODE` environment variable
- Enable AI mode automatically in Claude Code sessions
- Provide human-readable fallback when AI parsing fails

## Environment Detection

### Detection Logic

```typescript
function isAIOutputEnabled(): boolean {
  // Explicit AI mode flag
  if (process.env.AQE_AI_OUTPUT === '1') return true;

  // Claude Code detection
  if (process.env.CLAUDECODE === '1') return true;

  // Other AI agents (future-proofing)
  if (process.env.CURSOR_AI === '1') return true;
  if (process.env.AIDER_AI === '1') return true;

  // Default: human mode
  return false;
}
```

### Environment Variables

| Variable | Purpose | Values |
|----------|---------|--------|
| `AQE_AI_OUTPUT` | Explicit AI mode control | `1` (enabled), `0` (disabled) |
| `CLAUDECODE` | Auto-detected by Claude Code | `1` (in Claude Code session) |
| `AQE_OUTPUT_VERSION` | Force specific schema version | `1.0.0`, `1.1.0`, etc. |
| `AQE_OUTPUT_PRETTY` | Pretty-print JSON for debugging | `1` (enabled), `0` (compact) |

## Output Modes

### Mode Selection

```typescript
enum OutputMode {
  HUMAN = 'human',      // Terminal-friendly, colored, human-readable
  AI = 'ai',            // Structured JSON, deterministic, actionable
  AUTO = 'auto'         // Auto-detect based on environment
}
```

### Mode Behavior

| Mode | Format | Colors | Actions | Use Case |
|------|--------|--------|---------|----------|
| `human` | Plain text | Yes | No | Terminal usage |
| `ai` | JSON | No | Yes | AI agent consumption |
| `auto` | Detected | Conditional | Conditional | Default mode |

## Schema Definitions

### Base Output Schema

All AI outputs must include these base fields:

```json
{
  "schemaVersion": "1.0.0",
  "outputType": "test_results | coverage_report | agent_status | quality_metrics",
  "timestamp": "2025-12-12T10:30:00.000Z",
  "executionId": "exec_abc123",
  "status": "success | failure | warning | error",
  "metadata": {
    "agentId": "qe-test-executor",
    "agentVersion": "2.3.5",
    "duration": 1234,
    "environment": "production | staging | development"
  },
  "data": {},
  "actionSuggestions": [],
  "errors": []
}
```

### 1. Test Results Output Schema

**Output Type:** `test_results`

```json
{
  "schemaVersion": "1.0.0",
  "outputType": "test_results",
  "timestamp": "2025-12-12T10:30:00.000Z",
  "executionId": "exec_test_20251212_103000",
  "status": "failure",
  "metadata": {
    "agentId": "qe-test-executor",
    "agentVersion": "2.3.5",
    "duration": 12543,
    "environment": "development",
    "framework": "jest",
    "parallel": true,
    "workers": 4
  },
  "data": {
    "summary": {
      "total": 150,
      "passed": 145,
      "failed": 3,
      "skipped": 2,
      "flaky": 1,
      "duration": 12543,
      "passRate": 96.67,
      "failureRate": 2.00,
      "flakyRate": 0.67
    },
    "suites": [
      {
        "name": "UserService",
        "file": "src/services/UserService.test.ts",
        "status": "passed",
        "total": 25,
        "passed": 25,
        "failed": 0,
        "skipped": 0,
        "duration": 1234
      }
    ],
    "failures": [
      {
        "testName": "should handle concurrent requests",
        "suiteName": "ApiController",
        "file": "src/controllers/ApiController.test.ts",
        "line": 45,
        "error": {
          "message": "Timeout: Expected response within 5000ms",
          "stack": "...",
          "type": "TimeoutError"
        },
        "duration": 5002,
        "retries": 0,
        "lastRun": "2025-12-12T10:30:00.000Z"
      }
    ],
    "flaky": [
      {
        "testName": "should retry on network failure",
        "suiteName": "NetworkService",
        "file": "src/services/NetworkService.test.ts",
        "line": 67,
        "flakinessScore": 0.42,
        "failureRate": 0.15,
        "totalRuns": 100,
        "recentFailures": 3,
        "pattern": "intermittent_timeout"
      }
    ],
    "coverage": {
      "overall": 87.5,
      "lines": {
        "total": 1000,
        "covered": 875,
        "uncovered": 125,
        "percentage": 87.5
      },
      "branches": {
        "total": 200,
        "covered": 170,
        "uncovered": 30,
        "percentage": 85.0
      },
      "functions": {
        "total": 150,
        "covered": 135,
        "uncovered": 15,
        "percentage": 90.0
      },
      "statements": {
        "total": 950,
        "covered": 830,
        "uncovered": 120,
        "percentage": 87.37
      }
    }
  },
  "actionSuggestions": [
    {
      "action": "fix_test_failures",
      "priority": "critical",
      "reason": "3 test failures blocking deployment",
      "affectedTests": [
        "ApiController: should handle concurrent requests",
        "DatabaseService: should rollback on error",
        "CacheService: should invalidate stale entries"
      ],
      "steps": [
        "Review failure logs: /tmp/aqe-failures-20251212.log",
        "Run in isolation: npm test -- --testNamePattern='should handle concurrent requests'",
        "Check for timing issues and race conditions",
        "Increase timeout if network-dependent: jest.setTimeout(10000)"
      ],
      "automation": {
        "command": "aqe fix failures --interactive",
        "canAutoFix": false,
        "confidence": 0.65,
        "estimatedTime": 15
      },
      "relatedDocs": [
        "https://jestjs.io/docs/troubleshooting#tests-are-failing-randomly",
        "/workspaces/agentic-qe-cf/docs/guides/debugging-flaky-tests.md"
      ]
    },
    {
      "action": "stabilize_flaky_tests",
      "priority": "high",
      "reason": "1 flaky test detected with 42% instability score",
      "affectedTests": [
        "NetworkService: should retry on network failure"
      ],
      "steps": [
        "Analyze flaky test patterns: aqe analyze flaky --test='should retry on network failure'",
        "Review recent failure logs for patterns",
        "Add deterministic mocking for network calls",
        "Consider using jest-retry for legitimate retry scenarios"
      ],
      "automation": {
        "command": "aqe stabilize flaky --test-id=test_network_retry",
        "canAutoFix": true,
        "confidence": 0.78,
        "estimatedTime": 5
      }
    }
  ],
  "warnings": [
    {
      "code": "SKIPPED_TESTS",
      "message": "2 tests are skipped",
      "severity": "warning",
      "details": "Skipped tests may hide regressions. Review and enable them."
    }
  ],
  "errors": []
}
```

### 2. Coverage Report Output Schema

**Output Type:** `coverage_report`

```json
{
  "schemaVersion": "1.0.0",
  "outputType": "coverage_report",
  "timestamp": "2025-12-12T10:30:00.000Z",
  "executionId": "exec_coverage_20251212_103000",
  "status": "warning",
  "metadata": {
    "agentId": "qe-coverage-analyzer",
    "agentVersion": "2.3.5",
    "duration": 3456,
    "environment": "development",
    "algorithm": "sublinear_O(log_n)",
    "threshold": {
      "lines": 80.0,
      "branches": 75.0,
      "functions": 80.0,
      "statements": 80.0
    }
  },
  "data": {
    "summary": {
      "overall": 87.5,
      "lines": {
        "total": 1000,
        "covered": 875,
        "uncovered": 125,
        "percentage": 87.5
      },
      "branches": {
        "total": 200,
        "covered": 170,
        "uncovered": 30,
        "percentage": 85.0
      },
      "functions": {
        "total": 150,
        "covered": 135,
        "uncovered": 15,
        "percentage": 90.0
      },
      "statements": {
        "total": 950,
        "covered": 830,
        "uncovered": 120,
        "percentage": 87.37
      }
    },
    "trend": {
      "direction": "improving",
      "change": 2.5,
      "previousCoverage": 85.0,
      "currentCoverage": 87.5
    },
    "gaps": [
      {
        "file": "src/services/PaymentService.ts",
        "type": "critical_path",
        "priority": "critical",
        "coverage": {
          "lines": 45.5,
          "branches": 30.0,
          "functions": 50.0
        },
        "uncoveredLines": [23, 24, 25, 45, 46, 67, 68, 89, 90],
        "uncoveredBranches": [
          {"line": 23, "branch": "else", "condition": "payment.amount > 1000"},
          {"line": 45, "branch": "catch", "condition": "error handling"}
        ],
        "impact": "high",
        "reason": "Payment processing is business-critical with financial impact"
      }
    ],
    "files": [
      {
        "path": "src/services/UserService.ts",
        "lines": {
          "total": 100,
          "covered": 95,
          "uncovered": 5,
          "percentage": 95.0
        },
        "branches": {
          "total": 20,
          "covered": 18,
          "uncovered": 2,
          "percentage": 90.0
        },
        "functions": {
          "total": 15,
          "covered": 15,
          "uncovered": 0,
          "percentage": 100.0
        },
        "uncoveredLines": [23, 45, 67, 89, 90],
        "uncoveredBranches": [
          {"line": 23, "branch": "else"},
          {"line": 45, "branch": "catch"}
        ]
      }
    ]
  },
  "actionSuggestions": [
    {
      "action": "increase_coverage",
      "priority": "critical",
      "reason": "Critical payment processing path has only 45.5% coverage",
      "targetFiles": [
        "src/services/PaymentService.ts"
      ],
      "steps": [
        "Generate tests for PaymentService: aqe generate tests --file=src/services/PaymentService.ts --focus=uncovered",
        "Focus on critical paths: payment validation, transaction processing, error handling",
        "Add edge case tests: negative amounts, currency conversion, timeout scenarios",
        "Target minimum 80% coverage for business-critical code"
      ],
      "automation": {
        "command": "aqe generate tests --file=src/services/PaymentService.ts --coverage-target=80",
        "canAutoFix": true,
        "confidence": 0.92,
        "estimatedTime": 3,
        "estimatedTests": 12
      },
      "impact": {
        "currentCoverage": 45.5,
        "targetCoverage": 80.0,
        "estimatedImprovement": 34.5,
        "businessValue": "high"
      }
    },
    {
      "action": "review_coverage_trend",
      "priority": "low",
      "reason": "Coverage improving by 2.5% - maintain momentum",
      "steps": [
        "Continue current testing practices",
        "Monitor coverage on each commit",
        "Set up coverage ratcheting in CI/CD"
      ],
      "automation": {
        "command": "aqe coverage trends --days=30",
        "canAutoFix": false,
        "confidence": 1.0
      }
    }
  ],
  "warnings": [
    {
      "code": "COVERAGE_BELOW_THRESHOLD",
      "message": "Coverage (87.5%) is below project target (90%)",
      "severity": "warning",
      "details": "Need 2.5% improvement to reach target"
    }
  ],
  "errors": []
}
```

### 3. Agent Status Output Schema

**Output Type:** `agent_status`

```json
{
  "schemaVersion": "1.0.0",
  "outputType": "agent_status",
  "timestamp": "2025-12-12T10:30:00.000Z",
  "executionId": "exec_status_20251212_103000",
  "status": "success",
  "metadata": {
    "requestedAgent": "qe-test-generator",
    "agentVersion": "2.3.5",
    "duration": 123
  },
  "data": {
    "agent": {
      "id": "qe-test-generator",
      "name": "Test Generator Agent",
      "version": "2.3.5",
      "status": "active",
      "health": "healthy",
      "capabilities": [
        "unit_test_generation",
        "integration_test_generation",
        "tdd_london_style",
        "tdd_chicago_style",
        "mock_generation"
      ],
      "stats": {
        "totalExecutions": 1523,
        "successRate": 97.5,
        "averageDuration": 2345,
        "testsGenerated": 12456,
        "lastExecution": "2025-12-12T09:15:00.000Z"
      },
      "learning": {
        "patternsLearned": 234,
        "confidenceScore": 0.89,
        "trainingIterations": 1523,
        "lastTraining": "2025-12-12T08:00:00.000Z"
      }
    },
    "dependencies": {
      "required": [
        {
          "service": "agentdb",
          "status": "healthy",
          "version": "1.2.3",
          "latency": 5
        },
        {
          "service": "vectordb",
          "status": "healthy",
          "version": "0.5.0",
          "latency": 12
        }
      ],
      "optional": [
        {
          "service": "llm_provider",
          "status": "healthy",
          "provider": "anthropic",
          "model": "claude-opus-4.5"
        }
      ]
    },
    "configuration": {
      "maxConcurrency": 4,
      "timeout": 30000,
      "retryAttempts": 3,
      "learningEnabled": true,
      "memoryPersistence": true
    }
  },
  "actionSuggestions": [
    {
      "action": "agent_ready",
      "priority": "info",
      "reason": "Agent is healthy and ready for tasks",
      "steps": [
        "Use agent: aqe generate tests --file=<target-file>",
        "Check capabilities: aqe agent info qe-test-generator",
        "View recent activity: aqe agent logs qe-test-generator"
      ]
    }
  ],
  "warnings": [],
  "errors": []
}
```

### 4. Quality Metrics Output Schema

**Output Type:** `quality_metrics`

```json
{
  "schemaVersion": "1.0.0",
  "outputType": "quality_metrics",
  "timestamp": "2025-12-12T10:30:00.000Z",
  "executionId": "exec_quality_20251212_103000",
  "status": "warning",
  "metadata": {
    "agentId": "qe-quality-assessor",
    "agentVersion": "2.3.5",
    "duration": 5678,
    "environment": "development"
  },
  "data": {
    "overallScore": 78.5,
    "grade": "B",
    "dimensions": {
      "testCoverage": {
        "score": 87.5,
        "weight": 0.25,
        "status": "good"
      },
      "codeQuality": {
        "score": 75.0,
        "weight": 0.25,
        "status": "fair"
      },
      "security": {
        "score": 92.0,
        "weight": 0.20,
        "status": "excellent"
      },
      "performance": {
        "score": 68.0,
        "weight": 0.15,
        "status": "needs_improvement"
      },
      "maintainability": {
        "score": 72.0,
        "weight": 0.15,
        "status": "fair"
      }
    },
    "qualityGates": {
      "passed": 7,
      "failed": 2,
      "total": 9,
      "gates": [
        {
          "name": "minimum_coverage",
          "status": "passed",
          "actualValue": 87.5,
          "threshold": 80.0,
          "operator": "gte"
        },
        {
          "name": "max_complexity",
          "status": "failed",
          "actualValue": 25,
          "threshold": 15,
          "operator": "lte",
          "message": "Cyclomatic complexity exceeds threshold in 3 files"
        },
        {
          "name": "no_critical_vulnerabilities",
          "status": "passed",
          "actualValue": 0,
          "threshold": 0,
          "operator": "eq"
        }
      ]
    },
    "codeSmells": {
      "total": 23,
      "byType": {
        "duplicate_code": 8,
        "long_method": 7,
        "large_class": 4,
        "long_parameter_list": 4
      },
      "criticalSmells": [
        {
          "type": "long_method",
          "file": "src/services/OrderProcessor.ts",
          "line": 45,
          "severity": "major",
          "message": "Method processOrder has 150 lines (threshold: 50)"
        }
      ]
    },
    "technicalDebt": {
      "total": 45,
      "unit": "hours",
      "byCategory": {
        "code_smells": 20,
        "complexity": 15,
        "duplications": 10
      }
    }
  },
  "actionSuggestions": [
    {
      "action": "reduce_complexity",
      "priority": "high",
      "reason": "Cyclomatic complexity exceeds threshold in 3 files",
      "affectedFiles": [
        "src/services/OrderProcessor.ts",
        "src/controllers/CheckoutController.ts",
        "src/utils/ValidationHelper.ts"
      ],
      "steps": [
        "Analyze complexity: aqe analyze complexity --file=src/services/OrderProcessor.ts",
        "Extract complex methods into smaller functions",
        "Apply Single Responsibility Principle",
        "Consider Strategy pattern for conditional logic"
      ],
      "automation": {
        "command": "aqe refactor complexity --file=src/services/OrderProcessor.ts --interactive",
        "canAutoFix": false,
        "confidence": 0.45,
        "estimatedTime": 60
      }
    },
    {
      "action": "fix_code_smells",
      "priority": "medium",
      "reason": "23 code smells detected, 8 are duplicate code",
      "steps": [
        "Review duplicate code: aqe analyze duplicates",
        "Extract common logic into shared utilities",
        "Refactor long methods (7 detected)",
        "Split large classes into focused components"
      ],
      "automation": {
        "command": "aqe analyze smells --fix-duplicates",
        "canAutoFix": true,
        "confidence": 0.82,
        "estimatedTime": 30
      }
    }
  ],
  "warnings": [
    {
      "code": "QUALITY_GATE_FAILURE",
      "message": "2 quality gates failed",
      "severity": "warning",
      "details": "max_complexity, max_technical_debt"
    }
  ],
  "errors": []
}
```

## Action Suggestion Framework

### Action Types

| Action Type | Priority Levels | Automation Support | Typical Use Case |
|-------------|-----------------|-------------------|------------------|
| `fix_test_failures` | critical, high | Limited (guidance only) | Test failures blocking deployment |
| `stabilize_flaky_tests` | high, medium | High (auto-stabilization) | Intermittent test failures |
| `increase_coverage` | critical, high, medium | High (test generation) | Coverage below threshold |
| `reduce_complexity` | high, medium | Limited (suggestions only) | Code complexity issues |
| `fix_vulnerabilities` | critical, high | Medium (auto-patching) | Security vulnerabilities |
| `optimize_performance` | high, medium, low | Medium (profiling + suggestions) | Performance degradation |
| `fix_code_smells` | medium, low | High (auto-refactoring) | Code quality issues |
| `update_dependencies` | medium, low | High (automated updates) | Outdated dependencies |
| `review_coverage_trend` | low, info | None (informational) | Coverage monitoring |
| `agent_ready` | info | None (informational) | Agent status confirmation |

### Action Suggestion Structure

```typescript
interface ActionSuggestion {
  // Action identifier
  action: string;

  // Priority level
  priority: 'critical' | 'high' | 'medium' | 'low' | 'info';

  // Human-readable reason
  reason: string;

  // Affected resources (tests, files, etc.)
  affectedTests?: string[];
  targetFiles?: string[];
  affectedComponents?: string[];

  // Step-by-step guidance
  steps: string[];

  // Automation support
  automation: {
    command: string;           // CLI command to execute
    canAutoFix: boolean;       // Can this be automated?
    confidence: number;        // Confidence score (0-1)
    estimatedTime?: number;    // Estimated time in minutes
    estimatedTests?: number;   // Estimated tests to generate
  };

  // Additional context
  impact?: {
    currentValue: number;
    targetValue: number;
    estimatedImprovement: number;
    businessValue: 'critical' | 'high' | 'medium' | 'low';
  };

  // Related documentation
  relatedDocs?: string[];
}
```

### Common Action Scenarios

#### 1. Test Failures

```json
{
  "action": "fix_test_failures",
  "priority": "critical",
  "reason": "3 test failures blocking deployment",
  "affectedTests": ["ApiController: should handle concurrent requests"],
  "steps": [
    "Review failure logs: /tmp/aqe-failures-20251212.log",
    "Run in isolation: npm test -- --testNamePattern='should handle concurrent requests'",
    "Check for timing issues and race conditions"
  ],
  "automation": {
    "command": "aqe fix failures --interactive",
    "canAutoFix": false,
    "confidence": 0.65,
    "estimatedTime": 15
  }
}
```

#### 2. Flaky Tests

```json
{
  "action": "stabilize_flaky_tests",
  "priority": "high",
  "reason": "1 flaky test with 42% instability score",
  "affectedTests": ["NetworkService: should retry on network failure"],
  "steps": [
    "Analyze flaky patterns: aqe analyze flaky --test='should retry'",
    "Add deterministic mocking for network calls",
    "Consider jest-retry for legitimate retry scenarios"
  ],
  "automation": {
    "command": "aqe stabilize flaky --test-id=test_network_retry",
    "canAutoFix": true,
    "confidence": 0.78,
    "estimatedTime": 5
  }
}
```

#### 3. Coverage Gaps

```json
{
  "action": "increase_coverage",
  "priority": "critical",
  "reason": "Critical payment path has only 45.5% coverage",
  "targetFiles": ["src/services/PaymentService.ts"],
  "steps": [
    "Generate tests: aqe generate tests --file=src/services/PaymentService.ts",
    "Focus on critical paths: payment validation, transaction processing",
    "Add edge case tests: negative amounts, currency conversion"
  ],
  "automation": {
    "command": "aqe generate tests --file=src/services/PaymentService.ts --coverage-target=80",
    "canAutoFix": true,
    "confidence": 0.92,
    "estimatedTime": 3,
    "estimatedTests": 12
  },
  "impact": {
    "currentValue": 45.5,
    "targetValue": 80.0,
    "estimatedImprovement": 34.5,
    "businessValue": "high"
  }
}
```

#### 4. Security Vulnerabilities

```json
{
  "action": "fix_vulnerabilities",
  "priority": "critical",
  "reason": "2 critical vulnerabilities detected in dependencies",
  "affectedComponents": ["express@4.17.1", "jsonwebtoken@8.5.1"],
  "steps": [
    "Review vulnerabilities: npm audit",
    "Update vulnerable packages: npm audit fix",
    "Test after updates: npm test",
    "Verify security scan: aqe scan security"
  ],
  "automation": {
    "command": "npm audit fix && npm test",
    "canAutoFix": true,
    "confidence": 0.95,
    "estimatedTime": 5
  }
}
```

#### 5. Performance Issues

```json
{
  "action": "optimize_performance",
  "priority": "high",
  "reason": "P95 response time increased by 45% vs baseline",
  "affectedComponents": ["OrderProcessor", "DatabaseQueries"],
  "steps": [
    "Profile slow endpoints: aqe profile --endpoint=/api/orders",
    "Analyze database queries for N+1 problems",
    "Add caching for frequently accessed data",
    "Consider database indexing for common queries"
  ],
  "automation": {
    "command": "aqe profile performance --interactive",
    "canAutoFix": false,
    "confidence": 0.55,
    "estimatedTime": 45
  }
}
```

## Streaming Support

### Streaming Protocol

For long-running operations (test execution, coverage analysis), support streaming JSON updates:

```json
// Initial message
{
  "schemaVersion": "1.0.0",
  "outputType": "test_results_stream",
  "executionId": "exec_test_20251212_103000",
  "streamType": "start",
  "timestamp": "2025-12-12T10:30:00.000Z",
  "metadata": {
    "totalTests": 150,
    "estimatedDuration": 12000
  }
}

// Progress updates (newline-delimited JSON)
{"streamType": "progress", "completed": 50, "total": 150, "passed": 48, "failed": 2}
{"streamType": "progress", "completed": 100, "total": 150, "passed": 96, "failed": 4}

// Final message (complete schema)
{
  "schemaVersion": "1.0.0",
  "outputType": "test_results",
  "streamType": "complete",
  "executionId": "exec_test_20251212_103000",
  "status": "failure",
  "data": {
    "summary": {
      "total": 150,
      "passed": 145,
      "failed": 3,
      "skipped": 2
    }
  },
  "actionSuggestions": []
}
```

### Stream Types

- `start`: Initial message with metadata
- `progress`: Incremental updates
- `complete`: Final result (full schema)
- `error`: Error occurred during streaming

## Versioning Strategy

### Version Format

Semantic versioning: `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking schema changes (incompatible with previous versions)
- **MINOR**: Additive changes (new fields, backward compatible)
- **PATCH**: Bug fixes, documentation updates (no schema changes)

### Version Compatibility

```typescript
function isCompatibleVersion(outputVersion: string, requiredVersion: string): boolean {
  const [outMajor] = outputVersion.split('.').map(Number);
  const [reqMajor] = requiredVersion.split('.').map(Number);

  // Only major version must match
  return outMajor === reqMajor;
}
```

### Graceful Degradation

```typescript
function parseAIOutput(json: string): AIOutput {
  try {
    const parsed = JSON.parse(json);

    // Check version compatibility
    if (!isCompatibleVersion(parsed.schemaVersion, CURRENT_VERSION)) {
      console.warn(`Schema version mismatch: ${parsed.schemaVersion} vs ${CURRENT_VERSION}`);
      // Fall back to human-readable output or best-effort parsing
    }

    return parsed;
  } catch (error) {
    // Graceful degradation: parse as human-readable
    console.error('Failed to parse AI output, falling back to human mode');
    return parseHumanOutput(json);
  }
}
```

## Implementation Guidelines

### 1. Output Generator

```typescript
class AIOutputGenerator {
  private version = '1.0.0';

  generateTestResults(results: TestResults): AIOutput {
    return {
      schemaVersion: this.version,
      outputType: 'test_results',
      timestamp: new Date().toISOString(),
      executionId: this.generateExecutionId(),
      status: this.determineStatus(results),
      metadata: this.gatherMetadata(),
      data: this.formatTestResults(results),
      actionSuggestions: this.generateActions(results),
      warnings: this.extractWarnings(results),
      errors: this.extractErrors(results)
    };
  }

  private generateActions(results: TestResults): ActionSuggestion[] {
    const actions: ActionSuggestion[] = [];

    // Test failures
    if (results.failures.length > 0) {
      actions.push(this.createFixFailuresAction(results.failures));
    }

    // Flaky tests
    if (results.flaky.length > 0) {
      actions.push(this.createStabilizeFlakyAction(results.flaky));
    }

    // Coverage gaps
    if (results.coverage && results.coverage.overall < 80) {
      actions.push(this.createIncreaseCoverageAction(results.coverage));
    }

    return actions.sort((a, b) => this.priorityWeight(a.priority) - this.priorityWeight(b.priority));
  }
}
```

### 2. Environment Detection

```typescript
class OutputModeDetector {
  static detectMode(): OutputMode {
    // Explicit override
    if (process.env.AQE_AI_OUTPUT === '1') return OutputMode.AI;
    if (process.env.AQE_AI_OUTPUT === '0') return OutputMode.HUMAN;

    // Auto-detect AI agents
    if (this.isClaudeCode()) return OutputMode.AI;
    if (this.isCursorAI()) return OutputMode.AI;

    // Default: human mode
    return OutputMode.HUMAN;
  }

  private static isClaudeCode(): boolean {
    return process.env.CLAUDECODE === '1';
  }

  private static isCursorAI(): boolean {
    return process.env.CURSOR_AI === '1';
  }
}
```

### 3. Dual Output Support

```typescript
class DualOutputFormatter {
  format(data: any, mode: OutputMode = OutputMode.AUTO): string {
    const actualMode = mode === OutputMode.AUTO
      ? OutputModeDetector.detectMode()
      : mode;

    if (actualMode === OutputMode.AI) {
      return this.formatAI(data);
    } else {
      return this.formatHuman(data);
    }
  }

  private formatAI(data: any): string {
    const aiOutput = this.generator.generate(data);

    // Pretty-print for debugging if requested
    if (process.env.AQE_OUTPUT_PRETTY === '1') {
      return JSON.stringify(aiOutput, null, 2);
    }

    // Compact JSON for production
    return JSON.stringify(aiOutput);
  }

  private formatHuman(data: any): string {
    // Terminal-friendly, colored output
    return this.humanFormatter.format(data);
  }
}
```

## Examples

### Example 1: Test Execution Output (AI Mode)

**Command:**
```bash
AQE_AI_OUTPUT=1 aqe execute tests --file=src/services/UserService.test.ts
```

**Output:**
```json
{
  "schemaVersion": "1.0.0",
  "outputType": "test_results",
  "timestamp": "2025-12-12T10:30:00.000Z",
  "executionId": "exec_test_20251212_103000",
  "status": "success",
  "metadata": {
    "agentId": "qe-test-executor",
    "agentVersion": "2.3.5",
    "duration": 1234,
    "environment": "development",
    "framework": "jest"
  },
  "data": {
    "summary": {
      "total": 25,
      "passed": 25,
      "failed": 0,
      "skipped": 0,
      "duration": 1234,
      "passRate": 100.0,
      "failureRate": 0.0
    },
    "coverage": {
      "overall": 95.0,
      "lines": {
        "total": 100,
        "covered": 95,
        "uncovered": 5,
        "percentage": 95.0
      }
    }
  },
  "actionSuggestions": [
    {
      "action": "review_coverage_trend",
      "priority": "info",
      "reason": "Excellent test coverage (95%)",
      "steps": ["Maintain current testing practices", "Continue test-driven development"]
    }
  ],
  "warnings": [],
  "errors": []
}
```

### Example 2: Coverage Analysis Output (Human Mode)

**Command:**
```bash
aqe analyze coverage --file=src/services/PaymentService.ts
```

**Output:**
```
================================================================================
Coverage Analysis Report - Payment Service
Generated: 2025-12-12T10:30:00.000Z
================================================================================

Summary:
  Overall Coverage: 45.5%
  Lines:      45.5% (50/110)
  Branches:   30.0% (6/20)
  Functions:  50.0% (5/10)

⚠️  WARNING: Critical coverage gaps detected!

Critical Gaps:
  📁 src/services/PaymentService.ts
     - Priority: CRITICAL
     - Coverage: 45.5% (well below 80% threshold)
     - Impact: Payment processing is business-critical

Uncovered Lines: 23, 24, 25, 45, 46, 67, 68, 89, 90

Uncovered Branches:
  Line 23: else branch (payment.amount > 1000)
  Line 45: catch block (error handling)

================================================================================
Recommended Actions:
================================================================================

1. [CRITICAL] Increase Coverage
   → Generate tests for critical payment path
   → Command: aqe generate tests --file=src/services/PaymentService.ts --coverage-target=80
   → Estimated: 12 tests, 3 minutes
   → This will improve coverage from 45.5% to ~80%

2. [HIGH] Focus on Error Handling
   → Add tests for payment validation failures
   → Test transaction rollback scenarios
   → Verify timeout handling

================================================================================
```

### Example 3: Streaming Test Execution

**Command:**
```bash
AQE_AI_OUTPUT=1 aqe execute tests --stream
```

**Output (newline-delimited JSON):**
```json
{"schemaVersion":"1.0.0","outputType":"test_results_stream","streamType":"start","executionId":"exec_test_20251212_103000","metadata":{"totalTests":150,"estimatedDuration":12000}}
{"streamType":"progress","completed":25,"total":150,"passed":24,"failed":1,"elapsed":3000}
{"streamType":"progress","completed":50,"total":150,"passed":48,"failed":2,"elapsed":6000}
{"streamType":"progress","completed":100,"total":150,"passed":96,"failed":4,"elapsed":9000}
{"streamType":"complete","schemaVersion":"1.0.0","outputType":"test_results","status":"failure","data":{"summary":{"total":150,"passed":145,"failed":3,"skipped":2}},"actionSuggestions":[{"action":"fix_test_failures","priority":"critical","reason":"3 test failures detected"}]}
```

## Migration Path

### Phase 1: Dual Output (Current)

- Support both human and AI modes simultaneously
- Default to human mode for backward compatibility
- Auto-detect AI agents (Claude Code, Cursor, etc.)

### Phase 2: AI Mode Promotion (Future)

- Make AI mode default when in CI/CD environments
- Provide `--human` flag to override
- Deprecation notice for human mode as default

### Phase 3: Unified Output (Long-term)

- Single output format with rendering adapters
- Terminal renderer for human consumption
- JSON renderer for AI consumption
- HTML renderer for web dashboards

## Appendix

### A. Environment Variables Reference

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `AQE_AI_OUTPUT` | `0`, `1` | `0` | Explicit AI mode control |
| `CLAUDECODE` | `0`, `1` | Auto-detected | Claude Code session indicator |
| `AQE_OUTPUT_VERSION` | `1.0.0`, etc. | Latest | Force specific schema version |
| `AQE_OUTPUT_PRETTY` | `0`, `1` | `0` | Pretty-print JSON output |
| `AQE_OUTPUT_STREAM` | `0`, `1` | `0` | Enable streaming for long operations |

### B. Schema Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-12 | Initial release |

### C. Related Documents

- [Architecture Decision Record: C1.1](../architecture/adr-c1.1-ai-output.md)
- [Implementation Guide: OutputFormatter](../../src/output/OutputFormatter.ts)
- [User Guide: AI Mode Usage](../guides/ai-mode-usage.md)

---

**Status:** Draft
**Next Review:** 2025-12-19
**Owner:** System Architecture Designer Agent
**Contributors:** Claude Code Integration Team
