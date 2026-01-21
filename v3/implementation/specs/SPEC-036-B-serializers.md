# SPEC-036-B: Format-Specific Serializers

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-036-B |
| **Parent ADR** | [ADR-036](../adrs/ADR-036-result-persistence.md) |
| **Version** | 1.0 |
| **Status** | Implemented |
| **Last Updated** | 2026-01-10 |
| **Author** | Architecture Team |

---

## Overview

This specification defines the serializer implementations for converting task results into standard formats (SARIF, LCOV, JSON, Markdown).

---

## Result Saver Interface

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

---

## SARIF Serializer

```typescript
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

  private toSarifResult(vuln: Vulnerability): SarifResult {
    return {
      ruleId: vuln.ruleId,
      level: this.mapSeverity(vuln.severity),
      message: { text: vuln.message },
      locations: vuln.locations.map(loc => ({
        physicalLocation: {
          artifactLocation: { uri: loc.file },
          region: { startLine: loc.line, startColumn: loc.column }
        }
      }))
    };
  }
}
```

---

## LCOV Serializer

```typescript
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
```

---

## Test Code Generator

```typescript
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

---

## Result Index Schema

```typescript
// .agentic-qe/results/index.json
interface ResultIndex {
  version: '1.0';
  created: string;  // ISO timestamp
  updated: string;  // ISO timestamp
  results: ResultEntry[];
  trends: Record<string, TrendData>;
}

interface ResultEntry {
  id: string;
  type: TaskType;
  timestamp: string;
  files: string[];
  summary: Record<string, unknown>;
}

interface TrendData {
  improving: boolean;
  delta: number;
}
```

---

## Implementation Files

| File | LOC | Description |
|------|-----|-------------|
| `v3/src/coordination/result-saver.ts` | 780 | Main ResultSaver implementation |
| `v3/src/coordination/task-executor.ts` | - | Integration point |

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-036-B-001 | SARIF output must validate against 2.1.0 schema | Error |
| SPEC-036-B-002 | LCOV must include all required fields (SF, DA, LF, LH) | Error |
| SPEC-036-B-003 | Result index must be updated atomically | Warning |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-10 | Architecture Team | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-036-result-persistence.md)
- [SPEC-036-A: Output Formats](./SPEC-036-A-output-formats.md)
