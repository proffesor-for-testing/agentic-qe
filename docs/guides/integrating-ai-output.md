# Integrating AI Output Module

**Version:** 1.0.0
**Target Audience:** Agent Developers, CLI Implementers
**Estimated Time:** 15 minutes

## Overview

This guide demonstrates how to integrate the AI Output Module into existing QE agents and CLI commands for 100x faster parsing and actionable intelligence.

## Prerequisites

- Agentic QE v2.3.5+
- Node.js 18+
- TypeScript 5+

## Quick Integration

### Step 1: Import Output Helpers

```typescript
import {
  outputTestResults,
  outputCoverageReport,
  isAIMode
} from '@agentic-qe/output';
```

### Step 2: Replace Console Output

**Before (Human-only output):**
```typescript
console.log('Test Results:');
console.log(`Total: ${summary.total}`);
console.log(`Passed: ${summary.passed}`);
console.log(`Failed: ${summary.failed}`);
```

**After (Dual-mode output):**
```typescript
outputTestResults({
  summary: {
    total: summary.total,
    passed: summary.passed,
    failed: summary.failed,
    skipped: summary.skipped,
    duration: summary.duration,
    passRate: (summary.passed / summary.total) * 100,
    failureRate: (summary.failed / summary.total) * 100
  },
  suites: testSuites,
  failures: failedTests,
  flaky: flakyTests
});
```

### Step 3: Test in Both Modes

```bash
# Human mode (default)
aqe execute tests

# AI mode (Claude Code auto-detects or set explicitly)
AQE_AI_OUTPUT=1 aqe execute tests

# Pretty-print for debugging
AQE_AI_OUTPUT=1 AQE_OUTPUT_PRETTY=1 aqe execute tests
```

## Integration Patterns

### Pattern 1: Agent Integration

**File:** `src/agents/qe-test-executor.ts`

```typescript
import { Agent } from '../core/Agent';
import { outputTestResults } from '../output';

export class TestExecutorAgent extends Agent {
  async execute(task: Task): Promise<void> {
    const startTime = Date.now();

    // Execute tests
    const results = await this.runTests(task.target);

    // Output with automatic mode detection
    outputTestResults(results, {
      agentVersion: this.version,
      framework: 'jest',
      environment: process.env.NODE_ENV as any,
      startTime
    });
  }

  private async runTests(target: string): Promise<TestResultsData> {
    // Your test execution logic
    return {
      summary: { /* ... */ },
      suites: [ /* ... */ ],
      failures: [ /* ... */ ],
      flaky: [ /* ... */ ]
    };
  }
}
```

### Pattern 2: CLI Command Integration

**File:** `src/cli/commands/execute.ts`

```typescript
import { Command } from 'commander';
import { outputTestResults, isAIMode } from '../../output';

export const executeCommand = new Command('execute')
  .description('Execute tests')
  .option('--ai', 'Force AI output mode')
  .action(async (options) => {
    // Set AI mode if requested
    if (options.ai) {
      process.env.AQE_AI_OUTPUT = '1';
    }

    const results = await runTests();

    // Dual-mode output
    outputTestResults(results);

    // Exit with appropriate code
    process.exit(results.summary.failed > 0 ? 1 : 0);
  });
```

### Pattern 3: Streaming Progress

**File:** `src/agents/qe-test-executor-streaming.ts`

```typescript
import { createStreamingOutput } from '../output';

export class StreamingTestExecutor {
  async executeWithProgress(tests: Test[]): Promise<void> {
    const executionId = `exec_${Date.now()}`;
    const stream = createStreamingOutput(executionId, 'test_results');

    // Start stream
    stream.emitStart({
      totalTests: tests.length,
      estimatedDuration: tests.length * 100 // 100ms per test
    });

    let passed = 0;
    let failed = 0;

    // Run tests with progress updates
    for (let i = 0; i < tests.length; i++) {
      const result = await this.runTest(tests[i]);

      if (result.passed) {
        passed++;
      } else {
        failed++;
      }

      // Emit progress every 10 tests
      if ((i + 1) % 10 === 0) {
        stream.emitProgress({
          completed: i + 1,
          total: tests.length,
          passed,
          failed,
          elapsed: Date.now() - startTime
        });
      }
    }

    // Complete stream
    stream.emitComplete({
      summary: { total: tests.length, passed, failed }
    });
  }
}
```

### Pattern 4: Coverage Integration

**File:** `src/agents/qe-coverage-analyzer.ts`

```typescript
import { outputCoverageReport } from '../output';
import { CoverageReportData } from '../output/OutputFormatter';

export class CoverageAnalyzerAgent {
  async analyzeCoverage(): Promise<void> {
    const coverage = await this.collectCoverage();
    const gaps = await this.identifyCriticalGaps(coverage);

    const report: CoverageReportData = {
      summary: coverage.summary,
      gaps: gaps,
      files: coverage.files,
      trend: this.calculateTrend(coverage)
    };

    // Output with auto-detection
    outputCoverageReport(report, {
      agentVersion: '2.3.5',
      environment: 'development'
    });
  }

  private async identifyCriticalGaps(coverage: any): Promise<CoverageGap[]> {
    return coverage.files
      .filter(file => file.lines.percentage < 60)
      .map(file => ({
        file: file.path,
        type: this.classifyGapType(file),
        priority: this.calculatePriority(file),
        coverage: {
          lines: file.lines.percentage,
          branches: file.branches.percentage,
          functions: file.functions.percentage
        },
        uncoveredLines: file.uncoveredLines,
        uncoveredBranches: file.uncoveredBranches,
        impact: this.assessImpact(file),
        reason: this.explainGap(file)
      }));
  }
}
```

## Real-World Example: Test Generator Agent

**File:** `src/agents/qe-test-generator.ts`

```typescript
import { Agent } from '../core/Agent';
import {
  outputAgentStatus,
  outputTestResults,
  AgentStatusData,
  TestResultsData
} from '../output';

export class TestGeneratorAgent extends Agent {
  constructor() {
    super('qe-test-generator', '2.3.5');
  }

  /**
   * Report agent status
   */
  async reportStatus(): Promise<void> {
    const status: AgentStatusData = {
      agent: {
        id: this.id,
        name: 'Test Generator Agent',
        version: this.version,
        status: 'active',
        health: this.checkHealth(),
        capabilities: [
          'unit_test_generation',
          'integration_test_generation',
          'tdd_london_style',
          'tdd_chicago_style'
        ],
        stats: {
          totalExecutions: await this.getExecutionCount(),
          successRate: await this.getSuccessRate(),
          averageDuration: await this.getAverageDuration(),
          testsGenerated: await this.getTotalTestsGenerated(),
          lastExecution: this.lastExecutionTime
        },
        learning: {
          patternsLearned: await this.getPatternCount(),
          confidenceScore: await this.getConfidenceScore(),
          trainingIterations: await this.getTrainingIterations(),
          lastTraining: this.lastTrainingTime
        }
      },
      dependencies: await this.checkDependencies(),
      configuration: this.getConfiguration()
    };

    outputAgentStatus(status);
  }

  /**
   * Generate and execute tests
   */
  async generateTests(target: string): Promise<void> {
    const startTime = Date.now();

    // Generate tests
    const tests = await this.generate(target);

    // Run generated tests
    const results = await this.runTests(tests);

    // Output results with agent info
    outputTestResults(results, {
      agentVersion: this.version,
      framework: 'jest',
      environment: process.env.NODE_ENV as any,
      startTime
    });
  }

  private checkHealth(): 'healthy' | 'degraded' | 'unhealthy' {
    // Health check logic
    return 'healthy';
  }
}
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Test with AI Output

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install Dependencies
        run: npm install

      - name: Run Tests (AI Mode)
        run: |
          export AQE_AI_OUTPUT=1
          npm run test:all > test-results.json

      - name: Parse Test Results
        run: |
          # Extract action suggestions
          cat test-results.json | jq '.actionSuggestions'

          # Check for failures
          FAILED=$(cat test-results.json | jq '.data.summary.failed')
          if [ "$FAILED" -gt 0 ]; then
            echo "::error::$FAILED test(s) failed"
            exit 1
          fi

      - name: Upload Test Results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: test-results
          path: test-results.json
```

### GitLab CI

```yaml
test:
  stage: test
  script:
    - export AQE_AI_OUTPUT=1
    - npm run test:all > test-results.json
    - cat test-results.json | jq '.data.summary'
  artifacts:
    when: always
    paths:
      - test-results.json
    reports:
      junit: test-results.json
```

## Parsing AI Output

### JavaScript/TypeScript

```typescript
import { TestResultsOutput } from '@agentic-qe/output';

async function parseTestResults(jsonOutput: string): Promise<void> {
  const results: TestResultsOutput = JSON.parse(jsonOutput);

  // Check schema version
  if (results.schemaVersion !== '1.0.0') {
    console.warn('Schema version mismatch');
  }

  // Process results
  console.log(`Total: ${results.data.summary.total}`);
  console.log(`Passed: ${results.data.summary.passed}`);
  console.log(`Failed: ${results.data.summary.failed}`);

  // Process action suggestions
  for (const action of results.actionSuggestions) {
    console.log(`\n${action.priority.toUpperCase()}: ${action.reason}`);

    if (action.automation.canAutoFix) {
      console.log(`  Auto-fix command: ${action.automation.command}`);
      console.log(`  Confidence: ${action.automation.confidence * 100}%`);
    }

    console.log('  Steps:');
    action.steps.forEach((step, i) => {
      console.log(`    ${i + 1}. ${step}`);
    });
  }
}
```

### Python

```python
import json
from typing import Dict, Any

def parse_test_results(json_output: str) -> None:
    results: Dict[str, Any] = json.loads(json_output)

    # Check schema version
    if results['schemaVersion'] != '1.0.0':
        print('Warning: Schema version mismatch')

    # Process summary
    summary = results['data']['summary']
    print(f"Total: {summary['total']}")
    print(f"Passed: {summary['passed']}")
    print(f"Failed: {summary['failed']}")

    # Process action suggestions
    for action in results['actionSuggestions']:
        print(f"\n{action['priority'].upper()}: {action['reason']}")

        if action['automation']['canAutoFix']:
            print(f"  Auto-fix: {action['automation']['command']}")
            print(f"  Confidence: {action['automation']['confidence'] * 100}%")

        print("  Steps:")
        for i, step in enumerate(action['steps'], 1):
            print(f"    {i}. {step}")
```

## Best Practices

### 1. Always Provide Complete Metadata

```typescript
// Good
outputTestResults(results, {
  agentVersion: '2.3.5',
  framework: 'jest',
  environment: 'production',
  startTime: startTime,
  ci: detectCI()
});

// Bad - Missing metadata
outputTestResults(results);
```

### 2. Handle Both Output Modes

```typescript
import { isAIMode } from '@agentic-qe/output';

if (isAIMode()) {
  // AI agents get structured JSON
  outputTestResults(results);
} else {
  // Humans get colored terminal output
  console.log(chalk.green('✓ All tests passed!'));
}
```

### 3. Use Streaming for Long Operations

```typescript
// For operations > 10 seconds, use streaming
if (estimatedDuration > 10000) {
  const stream = createStreamingOutput(executionId, 'test_results');
  stream.emitStart({ totalTests, estimatedDuration });

  // ... emit progress ...

  stream.emitComplete(finalResults);
}
```

### 4. Validate Action Suggestions

```typescript
// Generate meaningful action suggestions
const actions = generateActionSuggestions(results);

// Ensure suggestions are specific and actionable
actions.forEach(action => {
  assert(action.steps.length > 0, 'Actions must have steps');
  assert(action.automation.confidence >= 0 && action.automation.confidence <= 1);
  assert(action.priority in ['critical', 'high', 'medium', 'low', 'info']);
});
```

## Troubleshooting

### Issue: Output not in AI mode

```bash
# Check environment
echo $CLAUDECODE
echo $AQE_AI_OUTPUT

# Enable explicitly
export AQE_AI_OUTPUT=1
```

### Issue: JSON parsing errors

```typescript
// Enable pretty-print for debugging
process.env.AQE_OUTPUT_PRETTY = '1';

// Validate JSON
try {
  const output = JSON.parse(jsonString);
  console.log('Valid JSON');
} catch (error) {
  console.error('Invalid JSON:', error);
}
```

### Issue: Missing action suggestions

```typescript
// Ensure complete data structures
const results: TestResultsData = {
  summary: { /* complete */ },
  suites: [ /* all suites */ ],
  failures: [ /* all failures */ ],  // Required for failure actions
  flaky: [ /* all flaky */ ]         // Required for flaky actions
};
```

## Performance Optimization

### 1. Minimize Output Size

```typescript
// Only include necessary data
const minimalResults = {
  summary: results.summary,
  failures: results.failures.slice(0, 10), // Top 10 failures
  actionSuggestions: results.actionSuggestions.slice(0, 3) // Top 3 actions
};
```

### 2. Cache Action Suggestions

```typescript
class ActionCache {
  private cache = new Map<string, ActionSuggestion[]>();

  getActions(key: string, generator: () => ActionSuggestion[]): ActionSuggestion[] {
    if (!this.cache.has(key)) {
      this.cache.set(key, generator());
    }
    return this.cache.get(key)!;
  }
}
```

### 3. Use Streaming for Large Outputs

```typescript
// For large test suites (>1000 tests), use streaming
if (tests.length > 1000) {
  useStreamingOutput();
}
```

## Migration Checklist

- [ ] Import output helpers
- [ ] Replace console.log with outputTestResults/outputCoverageReport
- [ ] Add metadata (agentVersion, framework, environment)
- [ ] Test in both AI and human modes
- [ ] Update CI/CD pipelines
- [ ] Update documentation
- [ ] Add streaming support for long operations
- [ ] Implement action suggestion handlers

## Next Steps

1. **Integrate into CLI commands** - See `/src/cli/commands/`
2. **Add to agents** - See `/src/agents/`
3. **Update CI/CD** - See `.github/workflows/`
4. **Write tests** - See `/src/output/__tests__/`

## Related Documentation

- [AI Output Format Spec](/workspaces/agentic-qe-cf/docs/design/ai-output-format-spec.md)
- [Output Module README](/workspaces/agentic-qe-cf/src/output/README.md)
- [CLI Integration Guide](/workspaces/agentic-qe-cf/docs/guides/cli-integration.md)

---

**Generated by:** Agentic QE Fleet v2.3.5
**Last Updated:** 2025-12-12
**Version:** 1.0.0
