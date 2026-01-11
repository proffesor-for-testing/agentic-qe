# ADR-036: Language-Aware Result Persistence

**Status:** Accepted
**Date:** 2026-01-10
**Decision Makers:** Architecture Team
**Source:** MCP v3 Task Execution Pipeline

---

## Context

The MCP v3 task executor now returns real results from domain services, but these results are only returned in the API response and not persisted for later analysis. Users need to:

1. Review results after task completion
2. Compare results across multiple runs
3. Track quality trends over time
4. Generate reports for stakeholders
5. Use generated tests directly in their codebase

Current limitations:
- Results lost after API response
- No historical tracking
- Cannot diff between runs
- Generated tests not saved as usable files

---

## Decision

**Implement language/framework-aware result persistence that saves outputs in appropriate formats based on task type and target stack.**

### Output Format Matrix

| Task Type | Primary Format | Secondary Format | Extension Pattern |
|-----------|---------------|------------------|-------------------|
| Test Generation | Source Code | JSON manifest | Language-specific |
| Coverage Analysis | LCOV | JSON + HTML | `.lcov`, `.json`, `.html` |
| Security Scan | SARIF | JSON + MD report | `.sarif`, `.json`, `.md` |
| Quality Assessment | JSON | MD report | `.json`, `.md` |
| Code Indexing | JSON graph | GraphML | `.json`, `.graphml` |
| Defect Prediction | JSON | MD report | `.json`, `.md` |
| Contract Testing | JSON | OpenAPI diff | `.json`, `.yaml` |
| Accessibility | JSON | HTML report | `.json`, `.html` |
| Chaos/Load Test | JSON | HTML dashboard | `.json`, `.html` |

### Test File Extensions by Language/Framework

```typescript
const TEST_FILE_PATTERNS: Record<string, Record<string, string>> = {
  typescript: {
    jest: '.test.ts',
    vitest: '.test.ts',
    mocha: '.spec.ts',
    default: '.test.ts',
  },
  javascript: {
    jest: '.test.js',
    vitest: '.test.js',
    mocha: '.spec.js',
    default: '.test.js',
  },
  python: {
    pytest: 'test_*.py',
    unittest: '*_test.py',
    default: 'test_*.py',
  },
  java: {
    junit: '*Test.java',
    testng: '*Test.java',
    default: '*Test.java',
  },
  go: {
    testing: '*_test.go',
    default: '*_test.go',
  },
  rust: {
    cargo: '*_test.rs',
    default: '*_test.rs',
  },
  ruby: {
    rspec: '*_spec.rb',
    minitest: '*_test.rb',
    default: '*_spec.rb',
  },
  php: {
    phpunit: '*Test.php',
    pest: '*.test.php',
    default: '*Test.php',
  },
  csharp: {
    xunit: '*Tests.cs',
    nunit: '*Tests.cs',
    mstest: '*Tests.cs',
    default: '*Tests.cs',
  },
  kotlin: {
    junit: '*Test.kt',
    kotest: '*Spec.kt',
    default: '*Test.kt',
  },
  swift: {
    xctest: '*Tests.swift',
    default: '*Tests.swift',
  },
};
```

### Directory Structure

```
.agentic-qe/
├── results/
│   ├── security/
│   │   ├── 2026-01-10T15-30-00_scan.sarif
│   │   ├── 2026-01-10T15-30-00_scan.json
│   │   └── 2026-01-10T15-30-00_report.md
│   ├── coverage/
│   │   ├── 2026-01-10T15-30-00_coverage.lcov
│   │   ├── 2026-01-10T15-30-00_coverage.json
│   │   └── 2026-01-10T15-30-00_gaps.md
│   ├── quality/
│   │   ├── 2026-01-10T15-30-00_assessment.json
│   │   └── 2026-01-10T15-30-00_report.md
│   ├── tests/
│   │   ├── generated/
│   │   │   ├── user-service.test.ts
│   │   │   ├── test_auth_module.py
│   │   │   └── PaymentTest.java
│   │   └── manifest.json
│   └── index.json  # Index of all results
```

### Core Components

#### 1. Result Saver Interface

```typescript
export interface ResultSaver {
  /** Save task result in appropriate format(s) */
  save(taskId: string, taskType: TaskType, result: unknown, options: SaveOptions): Promise<SavedResult>;

  /** Get saved results by task type */
  getResults(taskType: TaskType, options?: QueryOptions): Promise<SavedResult[]>;

  /** Compare two result sets */
  diff(resultA: string, resultB: string): Promise<ResultDiff>;

  /** Generate aggregate report */
  generateReport(taskTypes: TaskType[], dateRange: DateRange): Promise<Report>;
}

export interface SaveOptions {
  /** Target language for test generation */
  language?: string;

  /** Target framework */
  framework?: string;

  /** Output directory override */
  outputDir?: string;

  /** Include secondary formats */
  includeSecondary?: boolean;

  /** Custom filename prefix */
  filenamePrefix?: string;
}

export interface SavedResult {
  taskId: string;
  taskType: TaskType;
  timestamp: Date;
  files: SavedFile[];
  summary: ResultSummary;
}

export interface SavedFile {
  path: string;
  format: OutputFormat;
  size: number;
  checksum: string;
}
```

#### 2. Format-Specific Serializers

```typescript
// SARIF serializer for security results
export class SarifSerializer implements ResultSerializer {
  serialize(result: SecurityScanResult): string {
    return JSON.stringify({
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs: [{
        tool: { driver: { name: 'agentic-qe-v3', version: '3.0.0' } },
        results: result.vulnerabilities.map(v => this.toSarifResult(v)),
      }],
    }, null, 2);
  }
}

// LCOV serializer for coverage results
export class LcovSerializer implements ResultSerializer {
  serialize(result: CoverageResult): string {
    return result.files.map(f => this.toSection(f)).join('\n');
  }

  private toSection(file: FileCoverage): string {
    return `TN:
SF:${file.path}
${file.lines.map((hit, i) => `DA:${i + 1},${hit}`).join('\n')}
LF:${file.lines.length}
LH:${file.lines.filter(h => h > 0).length}
end_of_record`;
  }
}

// Test code generator
export class TestCodeGenerator implements ResultSerializer {
  constructor(private language: string, private framework: string) {}

  serialize(result: TestGenerationResult): Map<string, string> {
    const files = new Map<string, string>();
    for (const test of result.tests) {
      const filename = this.getFilename(test);
      const code = this.generateTestCode(test);
      files.set(filename, code);
    }
    return files;
  }

  private getFilename(test: GeneratedTest): string {
    const pattern = TEST_FILE_PATTERNS[this.language]?.[this.framework]
      || TEST_FILE_PATTERNS[this.language]?.default
      || '.test.ts';
    return test.targetFile.replace(/\.\w+$/, pattern);
  }
}
```

#### 3. Result Index

```typescript
// .agentic-qe/results/index.json
{
  "version": "1.0",
  "created": "2026-01-10T15:30:00Z",
  "updated": "2026-01-10T16:45:00Z",
  "results": [
    {
      "id": "task_abc123",
      "type": "security-scan",
      "timestamp": "2026-01-10T15:30:00Z",
      "files": [
        "security/2026-01-10T15-30-00_scan.sarif",
        "security/2026-01-10T15-30-00_scan.json",
        "security/2026-01-10T15-30-00_report.md"
      ],
      "summary": {
        "vulnerabilities": 15,
        "critical": 0,
        "high": 2
      }
    }
  ],
  "trends": {
    "security": { "improving": true, "delta": -3 },
    "coverage": { "improving": true, "delta": 2.5 }
  }
}
```

---

## Consequences

### Positive
- Results persist for historical analysis
- Tests saved as ready-to-use source files
- Standard formats (SARIF, LCOV) integrate with existing tools
- Language-aware output matches project conventions
- Trend tracking enables quality monitoring

### Negative
- Disk space usage for result storage
- Need to manage result retention/cleanup
- Additional I/O overhead per task

### Mitigation
- Configurable retention policy (default: 30 days)
- Compression for older results
- Optional result saving (can be disabled)

---

## Implementation ✅ COMPLETE (2026-01-10)

### Phase 1: Core Saver ✅
- [x] Create ResultSaver class (780 LOC)
- [x] Implement format serializers (JSON, MD, SARIF, LCOV)
- [x] Add to task executor pipeline
- [x] Create result directory structure

### Phase 2: Test Code Generation ✅
- [x] Language-aware test file generation (11 languages)
- [x] Framework-specific test templates (11+ frameworks)
- [x] Integration with TaskExecutor

### Phase 3: Reporting & Trends (Partial)
- [x] Result index maintenance (`updateIndex()`)
- [x] Trend tracking in index
- [ ] Aggregate report generation (future)
- [ ] Result diff/comparison (future)

### Files Created
- `v3/src/coordination/result-saver.ts` (780 LOC)
- `v3/src/coordination/task-executor.ts` (integrated)

---

## References

- SARIF Spec: https://sarifweb.azurewebsites.net/
- LCOV Format: https://github.com/linux-test-project/lcov
- ADR-020: Real Test Runner Integration
- MCP v3 Task Executor Implementation
