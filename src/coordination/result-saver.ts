/**
 * Agentic QE v3 - Result Saver
 * Language/framework-aware result persistence (ADR-036)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { TaskType } from './queen-coordinator';
import { safeJsonParse } from '../shared/safe-json.js';

// ============================================================================
// Types
// ============================================================================

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

export interface SavedFile {
  path: string;
  format: string;
  size: number;
  checksum: string;
}

export interface SavedResult {
  taskId: string;
  taskType: TaskType;
  timestamp: Date;
  files: SavedFile[];
  summary: Record<string, unknown>;
}

export interface ResultIndex {
  version: string;
  created: string;
  updated: string;
  results: IndexEntry[];
  trends: Record<string, TrendData>;
}

export interface IndexEntry {
  id: string;
  type: string;
  timestamp: string;
  files: string[];
  summary: Record<string, unknown>;
}

export interface TrendData {
  improving: boolean;
  delta: number;
}

// ============================================================================
// Test File Patterns by Language/Framework
// ============================================================================

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
    pytest: 'test_',
    unittest: '_test',
    default: 'test_',
  },
  java: {
    junit: 'Test.java',
    testng: 'Test.java',
    default: 'Test.java',
  },
  go: {
    testing: '_test.go',
    default: '_test.go',
  },
  rust: {
    cargo: '_test.rs',
    default: '_test.rs',
  },
  ruby: {
    rspec: '_spec.rb',
    minitest: '_test.rb',
    default: '_spec.rb',
  },
  php: {
    phpunit: 'Test.php',
    pest: '.test.php',
    default: 'Test.php',
  },
  csharp: {
    xunit: 'Tests.cs',
    nunit: 'Tests.cs',
    mstest: 'Tests.cs',
    default: 'Tests.cs',
  },
  kotlin: {
    junit: 'Test.kt',
    kotest: 'Spec.kt',
    default: 'Test.kt',
  },
  swift: {
    xctest: 'Tests.swift',
    default: 'Tests.swift',
  },
};

// ============================================================================
// Result Saver Implementation
// ============================================================================

export class ResultSaver {
  private readonly baseDir: string;
  private readonly resultsDir: string;

  constructor(baseDir: string = '.agentic-qe') {
    this.baseDir = baseDir;
    this.resultsDir = path.join(baseDir, 'results');
  }

  /**
   * Save task result in appropriate format(s)
   */
  async save(
    taskId: string,
    taskType: TaskType,
    result: unknown,
    options: SaveOptions = {}
  ): Promise<SavedResult> {
    const timestamp = new Date();
    const files: SavedFile[] = [];

    // Ensure directories exist
    await this.ensureDirectories(taskType);

    // Get timestamp string for filenames
    const tsStr = this.formatTimestamp(timestamp);
    const prefix = options.filenamePrefix || tsStr;

    // Save based on task type
    switch (taskType) {
      case 'generate-tests':
        files.push(...await this.saveTestGeneration(result, prefix, options));
        break;
      case 'analyze-coverage':
        files.push(...await this.saveCoverage(result, prefix, options));
        break;
      case 'scan-security':
        files.push(...await this.saveSecurityScan(result, prefix, options));
        break;
      case 'assess-quality':
        files.push(...await this.saveQualityAssessment(result, prefix, options));
        break;
      case 'index-code':
        files.push(...await this.saveCodeIndex(result, prefix, options));
        break;
      case 'predict-defects':
        files.push(...await this.saveDefectPrediction(result, prefix, options));
        break;
      case 'validate-contracts':
        files.push(...await this.saveContractValidation(result, prefix, options));
        break;
      case 'test-accessibility':
        files.push(...await this.saveAccessibilityTest(result, prefix, options));
        break;
      case 'run-chaos':
        files.push(...await this.saveChaosTest(result, prefix, options));
        break;
      default:
        // Generic JSON save for unknown types
        files.push(...await this.saveGeneric(taskType, result, prefix));
    }

    // Update index
    const summary = this.extractSummary(taskType, result);
    await this.updateIndex(taskId, taskType, timestamp, files, summary);

    return {
      taskId,
      taskType,
      timestamp,
      files,
      summary,
    };
  }

  // ==========================================================================
  // Task-Specific Savers
  // ==========================================================================

  private async saveTestGeneration(
    result: unknown,
    prefix: string,
    options: SaveOptions
  ): Promise<SavedFile[]> {
    const files: SavedFile[] = [];
    const data = result as {
      testsGenerated: number;
      tests: Array<{ name: string; file: string; type: string; code?: string }>;
      coverageEstimate: number;
      patternsUsed: string[];
    };

    const testDir = path.join(this.resultsDir, 'tests', 'generated');
    await fs.mkdir(testDir, { recursive: true });

    // Save manifest
    const manifestPath = path.join(this.resultsDir, 'tests', `${prefix}_manifest.json`);
    const manifestContent = JSON.stringify({
      generated: new Date().toISOString(),
      testsGenerated: data.testsGenerated,
      coverageEstimate: data.coverageEstimate,
      patternsUsed: data.patternsUsed,
      language: options.language || 'typescript',
      framework: options.framework || 'vitest',
      tests: data.tests,
    }, null, 2);
    await fs.writeFile(manifestPath, manifestContent);
    files.push(await this.createFileEntry(manifestPath, 'json'));

    // Save individual test files if code is provided
    if (data.tests) {
      for (const test of data.tests) {
        if (test.code) {
          const ext = this.getTestExtension(options.language || 'typescript', options.framework || 'vitest');
          const testFilename = this.sanitizeFilename(test.name) + ext;
          const testPath = path.join(testDir, testFilename);
          await fs.writeFile(testPath, test.code);
          files.push(await this.createFileEntry(testPath, 'source'));
        }
      }
    }

    // Save markdown report
    const reportPath = path.join(this.resultsDir, 'tests', `${prefix}_report.md`);
    const reportContent = this.generateTestReport(data, options);
    await fs.writeFile(reportPath, reportContent);
    files.push(await this.createFileEntry(reportPath, 'markdown'));

    return files;
  }

  private async saveCoverage(
    result: unknown,
    prefix: string,
    options: SaveOptions
  ): Promise<SavedFile[]> {
    const files: SavedFile[] = [];
    const data = result as {
      lineCoverage: number;
      branchCoverage: number;
      functionCoverage: number;
      statementCoverage: number;
      totalFiles: number;
      gaps: Array<{ file: string; lines: number[]; risk: string }>;
    };

    const coverageDir = path.join(this.resultsDir, 'coverage');

    // Save JSON
    const jsonPath = path.join(coverageDir, `${prefix}_coverage.json`);
    await fs.writeFile(jsonPath, JSON.stringify(data, null, 2));
    files.push(await this.createFileEntry(jsonPath, 'json'));

    // Save LCOV format
    if (options.includeSecondary !== false) {
      const lcovPath = path.join(coverageDir, `${prefix}_coverage.lcov`);
      const lcovContent = this.generateLcov(data);
      await fs.writeFile(lcovPath, lcovContent);
      files.push(await this.createFileEntry(lcovPath, 'lcov'));
    }

    // Save markdown report
    const reportPath = path.join(coverageDir, `${prefix}_report.md`);
    const reportContent = this.generateCoverageReport(data);
    await fs.writeFile(reportPath, reportContent);
    files.push(await this.createFileEntry(reportPath, 'markdown'));

    return files;
  }

  private async saveSecurityScan(
    result: unknown,
    prefix: string,
    options: SaveOptions
  ): Promise<SavedFile[]> {
    const files: SavedFile[] = [];
    const data = result as {
      vulnerabilities: number;
      critical: number;
      high: number;
      medium: number;
      low: number;
      topVulnerabilities: Array<{ type: string; severity: string; file: string; line: number }>;
      recommendations: string[];
    };

    const securityDir = path.join(this.resultsDir, 'security');

    // Save JSON
    const jsonPath = path.join(securityDir, `${prefix}_scan.json`);
    await fs.writeFile(jsonPath, JSON.stringify(data, null, 2));
    files.push(await this.createFileEntry(jsonPath, 'json'));

    // Save SARIF format
    if (options.includeSecondary !== false) {
      const sarifPath = path.join(securityDir, `${prefix}_scan.sarif`);
      const sarifContent = this.generateSarif(data);
      await fs.writeFile(sarifPath, sarifContent);
      files.push(await this.createFileEntry(sarifPath, 'sarif'));
    }

    // Save markdown report
    const reportPath = path.join(securityDir, `${prefix}_report.md`);
    const reportContent = this.generateSecurityReport(data);
    await fs.writeFile(reportPath, reportContent);
    files.push(await this.createFileEntry(reportPath, 'markdown'));

    return files;
  }

  private async saveQualityAssessment(
    result: unknown,
    prefix: string,
    _options: SaveOptions
  ): Promise<SavedFile[]> {
    const files: SavedFile[] = [];
    const data = result as {
      qualityScore: number;
      passed: boolean;
      metrics: Record<string, number>;
      recommendations: string[];
    };

    const qualityDir = path.join(this.resultsDir, 'quality');

    // Save JSON
    const jsonPath = path.join(qualityDir, `${prefix}_assessment.json`);
    await fs.writeFile(jsonPath, JSON.stringify(data, null, 2));
    files.push(await this.createFileEntry(jsonPath, 'json'));

    // Save markdown report
    const reportPath = path.join(qualityDir, `${prefix}_report.md`);
    const reportContent = this.generateQualityReport(data);
    await fs.writeFile(reportPath, reportContent);
    files.push(await this.createFileEntry(reportPath, 'markdown'));

    return files;
  }

  private async saveCodeIndex(
    result: unknown,
    prefix: string,
    _options: SaveOptions
  ): Promise<SavedFile[]> {
    const files: SavedFile[] = [];
    const data = result as {
      filesIndexed: number;
      nodesCreated: number;
      edgesCreated: number;
      duration: number;
    };

    const indexDir = path.join(this.resultsDir, 'code-index');
    await fs.mkdir(indexDir, { recursive: true });

    // Save JSON
    const jsonPath = path.join(indexDir, `${prefix}_index.json`);
    await fs.writeFile(jsonPath, JSON.stringify(data, null, 2));
    files.push(await this.createFileEntry(jsonPath, 'json'));

    return files;
  }

  private async saveDefectPrediction(
    result: unknown,
    prefix: string,
    _options: SaveOptions
  ): Promise<SavedFile[]> {
    const files: SavedFile[] = [];
    const defectDir = path.join(this.resultsDir, 'defects');
    await fs.mkdir(defectDir, { recursive: true });

    // Save JSON
    const jsonPath = path.join(defectDir, `${prefix}_prediction.json`);
    await fs.writeFile(jsonPath, JSON.stringify(result, null, 2));
    files.push(await this.createFileEntry(jsonPath, 'json'));

    return files;
  }

  private async saveContractValidation(
    result: unknown,
    prefix: string,
    _options: SaveOptions
  ): Promise<SavedFile[]> {
    const files: SavedFile[] = [];
    const contractDir = path.join(this.resultsDir, 'contracts');
    await fs.mkdir(contractDir, { recursive: true });

    // Save JSON
    const jsonPath = path.join(contractDir, `${prefix}_validation.json`);
    await fs.writeFile(jsonPath, JSON.stringify(result, null, 2));
    files.push(await this.createFileEntry(jsonPath, 'json'));

    return files;
  }

  private async saveAccessibilityTest(
    result: unknown,
    prefix: string,
    _options: SaveOptions
  ): Promise<SavedFile[]> {
    const files: SavedFile[] = [];
    const a11yDir = path.join(this.resultsDir, 'accessibility');
    await fs.mkdir(a11yDir, { recursive: true });

    // Save JSON
    const jsonPath = path.join(a11yDir, `${prefix}_test.json`);
    await fs.writeFile(jsonPath, JSON.stringify(result, null, 2));
    files.push(await this.createFileEntry(jsonPath, 'json'));

    return files;
  }

  private async saveChaosTest(
    result: unknown,
    prefix: string,
    _options: SaveOptions
  ): Promise<SavedFile[]> {
    const files: SavedFile[] = [];
    const chaosDir = path.join(this.resultsDir, 'chaos');
    await fs.mkdir(chaosDir, { recursive: true });

    // Save JSON
    const jsonPath = path.join(chaosDir, `${prefix}_chaos.json`);
    await fs.writeFile(jsonPath, JSON.stringify(result, null, 2));
    files.push(await this.createFileEntry(jsonPath, 'json'));

    return files;
  }

  private async saveGeneric(
    taskType: string,
    result: unknown,
    prefix: string
  ): Promise<SavedFile[]> {
    const files: SavedFile[] = [];
    const genericDir = path.join(this.resultsDir, 'other');
    await fs.mkdir(genericDir, { recursive: true });

    const jsonPath = path.join(genericDir, `${prefix}_${taskType}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(result, null, 2));
    files.push(await this.createFileEntry(jsonPath, 'json'));

    return files;
  }

  // ==========================================================================
  // Format Generators
  // ==========================================================================

  private generateLcov(data: {
    lineCoverage: number;
    totalFiles: number;
  }): string {
    // Simplified LCOV - real implementation would have per-file data
    return `TN:agentic-qe-coverage
SF:summary
DA:1,${Math.round(data.lineCoverage)}
LF:100
LH:${Math.round(data.lineCoverage)}
end_of_record
`;
  }

  private generateSarif(data: {
    vulnerabilities: number;
    topVulnerabilities: Array<{ type: string; severity: string; file: string; line: number }>;
  }): string {
    return JSON.stringify({
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs: [{
        tool: {
          driver: {
            name: 'agentic-qe-v3',
            version: '3.0.0',
            informationUri: 'https://github.com/ruvnet/agentic-qe',
          },
        },
        results: data.topVulnerabilities.map((v, i) => ({
          ruleId: `VULN-${String(i + 1).padStart(3, '0')}`,
          level: v.severity === 'critical' ? 'error' : v.severity === 'high' ? 'error' : 'warning',
          message: { text: v.type },
          locations: [{
            physicalLocation: {
              artifactLocation: { uri: v.file },
              region: { startLine: v.line },
            },
          }],
        })),
      }],
    }, null, 2);
  }

  private generateTestReport(
    data: {
      testsGenerated: number;
      coverageEstimate: number;
      patternsUsed: string[];
      tests: Array<{ name: string; file: string; type: string }>;
    },
    options: SaveOptions
  ): string {
    return `# Test Generation Report

**Generated:** ${new Date().toISOString()}
**Language:** ${options.language || 'typescript'}
**Framework:** ${options.framework || 'vitest'}

## Summary

| Metric | Value |
|--------|-------|
| Tests Generated | ${data.testsGenerated} |
| Coverage Estimate | ${data.coverageEstimate}% |
| Patterns Used | ${data.patternsUsed.length} |

## Patterns Applied

${data.patternsUsed.map(p => `- ${p}`).join('\n')}

## Generated Tests

${data.tests.map(t => `### ${t.name}
- **File:** ${t.file}
- **Type:** ${t.type}
`).join('\n')}
`;
  }

  private generateCoverageReport(data: {
    lineCoverage: number;
    branchCoverage: number;
    functionCoverage: number;
    statementCoverage: number;
    totalFiles: number;
    gaps: Array<{ file: string; lines: number[]; risk: string }>;
  }): string {
    return `# Coverage Analysis Report

**Generated:** ${new Date().toISOString()}
**Algorithm:** Sublinear O(log n)

## Summary

| Metric | Coverage |
|--------|----------|
| Line Coverage | ${data.lineCoverage.toFixed(1)}% |
| Branch Coverage | ${data.branchCoverage.toFixed(1)}% |
| Function Coverage | ${data.functionCoverage.toFixed(1)}% |
| Statement Coverage | ${data.statementCoverage.toFixed(1)}% |
| Total Files | ${data.totalFiles} |

## Coverage Gaps

${data.gaps.length === 0 ? 'No significant gaps detected.' : data.gaps.map(g => `### ${g.file}
- **Risk:** ${g.risk}
- **Uncovered Lines:** ${g.lines.join(', ')}
`).join('\n')}
`;
  }

  private generateSecurityReport(data: {
    vulnerabilities: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    topVulnerabilities: Array<{ type: string; severity: string; file: string; line: number }>;
    recommendations: string[];
  }): string {
    return `# Security Scan Report

**Generated:** ${new Date().toISOString()}
**Scanner:** Agentic QE v3 Security

## Summary

| Severity | Count |
|----------|-------|
| Critical | ${data.critical} |
| High | ${data.high} |
| Medium | ${data.medium} |
| Low | ${data.low} |
| **Total** | **${data.vulnerabilities}** |

## Top Vulnerabilities

${data.topVulnerabilities.map(v => `### ${v.type}
- **Severity:** ${v.severity.toUpperCase()}
- **File:** ${v.file}
- **Line:** ${v.line}
`).join('\n')}

## Recommendations

${data.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}
`;
  }

  private generateQualityReport(data: {
    qualityScore: number;
    passed: boolean;
    metrics: Record<string, number>;
    recommendations: string[];
  }): string {
    return `# Quality Assessment Report

**Generated:** ${new Date().toISOString()}
**Status:** ${data.passed ? 'PASSED' : 'FAILED'}

## Quality Score

**${data.qualityScore.toFixed(1)}** / 100

## Metrics

| Metric | Score |
|--------|-------|
${Object.entries(data.metrics).map(([k, v]) => `| ${k} | ${v.toFixed(1)} |`).join('\n')}

## Recommendations

${data.recommendations.length === 0 ? 'No recommendations - all quality gates passed.' : data.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}
`;
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private async ensureDirectories(taskType: TaskType): Promise<void> {
    const dirs = [
      this.resultsDir,
      path.join(this.resultsDir, 'security'),
      path.join(this.resultsDir, 'coverage'),
      path.join(this.resultsDir, 'quality'),
      path.join(this.resultsDir, 'tests'),
      path.join(this.resultsDir, 'tests', 'generated'),
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  private formatTimestamp(date: Date): string {
    return date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  }

  private getTestExtension(language: string, framework: string): string {
    const langPatterns = TEST_FILE_PATTERNS[language.toLowerCase()];
    if (!langPatterns) return '.test.ts';
    return langPatterns[framework.toLowerCase()] || langPatterns.default || '.test.ts';
  }

  private async createFileEntry(filePath: string, format: string): Promise<SavedFile> {
    const content = await fs.readFile(filePath);
    const stats = await fs.stat(filePath);
    const checksum = createHash('sha256').update(content).digest('hex').slice(0, 16);

    return {
      path: filePath,
      format,
      size: stats.size,
      checksum,
    };
  }

  private extractSummary(taskType: TaskType, result: unknown): Record<string, unknown> {
    const data = result as Record<string, unknown>;
    switch (taskType) {
      case 'scan-security':
        return {
          vulnerabilities: data.vulnerabilities,
          critical: data.critical,
          high: data.high,
        };
      case 'analyze-coverage':
        return {
          lineCoverage: data.lineCoverage,
          branchCoverage: data.branchCoverage,
        };
      case 'assess-quality':
        return {
          qualityScore: data.qualityScore,
          passed: data.passed,
        };
      case 'generate-tests':
        return {
          testsGenerated: data.testsGenerated,
          coverageEstimate: data.coverageEstimate,
        };
      default:
        return {};
    }
  }

  private async updateIndex(
    taskId: string,
    taskType: TaskType,
    timestamp: Date,
    files: SavedFile[],
    summary: Record<string, unknown>
  ): Promise<void> {
    const indexPath = path.join(this.resultsDir, 'index.json');
    let index: ResultIndex;

    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      index = safeJsonParse<ResultIndex>(content);
    } catch {
      index = {
        version: '1.0',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        results: [],
        trends: {},
      };
    }

    // Add new result
    index.results.push({
      id: taskId,
      type: taskType,
      timestamp: timestamp.toISOString(),
      files: files.map(f => path.relative(this.resultsDir, f.path)),
      summary,
    });

    // Update timestamp
    index.updated = new Date().toISOString();

    // Keep last 100 results
    if (index.results.length > 100) {
      index.results = index.results.slice(-100);
    }

    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  }
}

// Factory function
export function createResultSaver(baseDir?: string): ResultSaver {
  return new ResultSaver(baseDir);
}
