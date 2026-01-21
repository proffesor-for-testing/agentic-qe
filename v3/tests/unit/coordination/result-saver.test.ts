/**
 * Unit tests for ResultSaver (ADR-036)
 * Tests language-aware result persistence with format adapters
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import {
  ResultSaver,
  createResultSaver,
  SaveOptions,
  SavedResult,
  SavedFile,
} from '../../../src/coordination/result-saver';
import { TaskType } from '../../../src/coordination/queen-coordinator';

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_BASE_DIR = '/tmp/agentic-qe-test-' + Date.now();

const TEST_GENERATION_RESULT = {
  testsGenerated: 5,
  coverageEstimate: 85.5,
  tests: [
    { name: 'should validate user input', file: 'src/user-service.ts', type: 'unit', code: 'describe("UserService", () => {\n  it("should validate user input", () => {\n    expect(true).toBe(true);\n  });\n});' },
    { name: 'should handle authentication', file: 'src/auth-service.ts', type: 'unit', code: 'describe("AuthService", () => {\n  it("should handle authentication", () => {\n    expect(true).toBe(true);\n  });\n});' },
  ],
  patternsUsed: ['assertion-patterns', 'mock-generation', 'edge-case-detection'],
};

const COVERAGE_RESULT = {
  lineCoverage: 78.5,
  branchCoverage: 65.2,
  functionCoverage: 82.1,
  statementCoverage: 76.3,
  totalFiles: 42,
  gaps: [
    { file: 'src/complex-module.ts', lines: [15, 22, 45, 67], risk: 'high' },
    { file: 'src/edge-cases.ts', lines: [8, 12], risk: 'medium' },
  ],
};

const SECURITY_RESULT = {
  vulnerabilities: 12,
  critical: 1,
  high: 3,
  medium: 5,
  low: 3,
  topVulnerabilities: [
    { type: 'SQL Injection', severity: 'critical', file: 'src/db/query.ts', line: 45 },
    { type: 'XSS', severity: 'high', file: 'src/api/handlers.ts', line: 112 },
    { type: 'Insecure Deserialization', severity: 'high', file: 'src/utils/parser.ts', line: 78 },
  ],
  recommendations: [
    'Update dependencies to latest secure versions',
    'Enable CSP headers for XSS protection',
    'Implement parameterized queries',
  ],
};

const QUALITY_RESULT = {
  qualityScore: 87.5,
  passed: true,
  metrics: {
    coverage: 78.5,
    complexity: 15.2,
    maintainability: 82.1,
    reliability: 88.3,
    security: 92.0,
  },
  recommendations: [],
};

const CODE_INDEX_RESULT = {
  filesIndexed: 156,
  nodesCreated: 2340,
  edgesCreated: 7890,
  duration: 1523,
};

const DEFECT_PREDICTION_RESULT = {
  predictedDefects: [
    { file: 'src/complex-module.ts', probability: 0.78, reason: 'High cyclomatic complexity' },
    { file: 'src/legacy-handler.ts', probability: 0.65, reason: 'Frequent changes' },
  ],
  riskScore: 42,
};

const CONTRACT_VALIDATION_RESULT = {
  valid: true,
  breakingChanges: [],
  warnings: ['Deprecated field should be removed'],
  coverage: 95,
};

const ACCESSIBILITY_RESULT = {
  url: 'http://localhost:3000',
  standard: 'wcag21-aa',
  passed: true,
  violations: [],
  warnings: [{ rule: 'color-contrast', impact: 'minor', element: 'nav > a' }],
  score: 94,
};

const CHAOS_RESULT = {
  faultType: 'network-latency',
  target: 'api-gateway',
  dryRun: false,
  duration: 60000,
  systemBehavior: 'tested',
  resilience: { recovered: true, recoveryTime: 2500, dataLoss: false },
};

// ============================================================================
// Tests
// ============================================================================

describe('ResultSaver', () => {
  let saver: ResultSaver;

  beforeEach(async () => {
    saver = new ResultSaver(TEST_BASE_DIR);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
    } catch {
      // Directory may not exist
    }
  });

  describe('initialization', () => {
    it('should create result saver with default base directory', () => {
      const defaultSaver = createResultSaver();
      expect(defaultSaver).toBeInstanceOf(ResultSaver);
    });

    it('should create result saver with custom base directory', () => {
      const customSaver = createResultSaver('/custom/path');
      expect(customSaver).toBeInstanceOf(ResultSaver);
    });
  });

  describe('test generation results', () => {
    it('should save test generation result with manifest', async () => {
      const result = await saver.save('task_001', 'generate-tests', TEST_GENERATION_RESULT, {
        language: 'typescript',
        framework: 'vitest',
      });

      expect(result.taskId).toBe('task_001');
      expect(result.taskType).toBe('generate-tests');
      expect(result.files.length).toBeGreaterThan(0);
      expect(result.summary.testsGenerated).toBe(5);
      expect(result.summary.coverageEstimate).toBe(85.5);

      // Verify manifest file exists
      const manifestFile = result.files.find(f => f.format === 'json');
      expect(manifestFile).toBeDefined();
      expect(existsSync(manifestFile!.path)).toBe(true);

      // Verify markdown report
      const reportFile = result.files.find(f => f.format === 'markdown');
      expect(reportFile).toBeDefined();
      expect(existsSync(reportFile!.path)).toBe(true);
    });

    it('should save individual test files when code is provided', async () => {
      const result = await saver.save('task_002', 'generate-tests', TEST_GENERATION_RESULT, {
        language: 'typescript',
        framework: 'vitest',
      });

      const sourceFiles = result.files.filter(f => f.format === 'source');
      expect(sourceFiles.length).toBe(2); // Two tests with code

      // Verify test file extension
      sourceFiles.forEach(f => {
        expect(f.path).toMatch(/\.test\.ts$/);
      });
    });

    it('should use correct test extension for different languages/frameworks', async () => {
      const testCases: Array<{ language: string; framework: string; expectedExt: string }> = [
        { language: 'typescript', framework: 'jest', expectedExt: '.test.ts' },
        { language: 'typescript', framework: 'mocha', expectedExt: '.spec.ts' },
        { language: 'javascript', framework: 'jest', expectedExt: '.test.js' },
        { language: 'python', framework: 'pytest', expectedExt: 'test_' },
        { language: 'java', framework: 'junit', expectedExt: 'Test.java' },
        { language: 'go', framework: 'testing', expectedExt: '_test.go' },
        { language: 'ruby', framework: 'rspec', expectedExt: '_spec.rb' },
        { language: 'php', framework: 'phpunit', expectedExt: 'Test.php' },
        { language: 'csharp', framework: 'xunit', expectedExt: 'Tests.cs' },
        { language: 'kotlin', framework: 'kotest', expectedExt: 'Spec.kt' },
        { language: 'swift', framework: 'xctest', expectedExt: 'Tests.swift' },
      ];

      for (const tc of testCases) {
        const result = await saver.save(`task_lang_${tc.language}`, 'generate-tests', TEST_GENERATION_RESULT, {
          language: tc.language,
          framework: tc.framework,
        });

        const sourceFiles = result.files.filter(f => f.format === 'source');
        if (sourceFiles.length > 0) {
          // Check that extension pattern is in the filename
          expect(sourceFiles[0].path).toContain(tc.expectedExt.replace(/^test_/, ''));
        }
      }
    });

    it('should generate markdown test report', async () => {
      const result = await saver.save('task_003', 'generate-tests', TEST_GENERATION_RESULT, {
        language: 'typescript',
        framework: 'vitest',
      });

      const reportFile = result.files.find(f => f.format === 'markdown');
      expect(reportFile).toBeDefined();

      const content = await fs.readFile(reportFile!.path, 'utf-8');
      expect(content).toContain('# Test Generation Report');
      expect(content).toContain('Language:** typescript');
      expect(content).toContain('Framework:** vitest');
      expect(content).toContain('Tests Generated | 5');
      expect(content).toContain('assertion-patterns');
    });
  });

  describe('coverage analysis results', () => {
    it('should save coverage result in multiple formats', async () => {
      const result = await saver.save('task_cov_001', 'analyze-coverage', COVERAGE_RESULT, {
        includeSecondary: true,
      });

      expect(result.taskId).toBe('task_cov_001');
      expect(result.taskType).toBe('analyze-coverage');
      expect(result.summary.lineCoverage).toBe(78.5);
      expect(result.summary.branchCoverage).toBe(65.2);

      // Should have JSON, LCOV, and markdown
      expect(result.files.find(f => f.format === 'json')).toBeDefined();
      expect(result.files.find(f => f.format === 'lcov')).toBeDefined();
      expect(result.files.find(f => f.format === 'markdown')).toBeDefined();
    });

    it('should generate valid LCOV format', async () => {
      const result = await saver.save('task_cov_002', 'analyze-coverage', COVERAGE_RESULT);

      const lcovFile = result.files.find(f => f.format === 'lcov');
      expect(lcovFile).toBeDefined();

      const content = await fs.readFile(lcovFile!.path, 'utf-8');
      expect(content).toContain('TN:');
      expect(content).toContain('SF:');
      expect(content).toContain('DA:');
      expect(content).toContain('LF:');
      expect(content).toContain('LH:');
      expect(content).toContain('end_of_record');
    });

    it('should generate coverage report with gaps', async () => {
      const result = await saver.save('task_cov_003', 'analyze-coverage', COVERAGE_RESULT);

      const reportFile = result.files.find(f => f.format === 'markdown');
      const content = await fs.readFile(reportFile!.path, 'utf-8');

      expect(content).toContain('# Coverage Analysis Report');
      expect(content).toContain('Line Coverage | 78.5%');
      expect(content).toContain('Branch Coverage | 65.2%');
      expect(content).toContain('Coverage Gaps');
      expect(content).toContain('src/complex-module.ts');
      expect(content).toContain('Risk:** high');
    });

    it('should skip secondary formats when disabled', async () => {
      const result = await saver.save('task_cov_004', 'analyze-coverage', COVERAGE_RESULT, {
        includeSecondary: false,
      });

      expect(result.files.find(f => f.format === 'lcov')).toBeUndefined();
    });
  });

  describe('security scan results', () => {
    it('should save security scan in SARIF format', async () => {
      const result = await saver.save('task_sec_001', 'scan-security', SECURITY_RESULT, {
        includeSecondary: true,
      });

      expect(result.taskId).toBe('task_sec_001');
      expect(result.summary.vulnerabilities).toBe(12);
      expect(result.summary.critical).toBe(1);
      expect(result.summary.high).toBe(3);

      // Should have JSON, SARIF, and markdown
      expect(result.files.find(f => f.format === 'json')).toBeDefined();
      expect(result.files.find(f => f.format === 'sarif')).toBeDefined();
      expect(result.files.find(f => f.format === 'markdown')).toBeDefined();
    });

    it('should generate valid SARIF format', async () => {
      const result = await saver.save('task_sec_002', 'scan-security', SECURITY_RESULT);

      const sarifFile = result.files.find(f => f.format === 'sarif');
      expect(sarifFile).toBeDefined();

      const content = await fs.readFile(sarifFile!.path, 'utf-8');
      const sarif = JSON.parse(content);

      expect(sarif.$schema).toContain('sarif-schema-2.1.0.json');
      expect(sarif.version).toBe('2.1.0');
      expect(sarif.runs).toHaveLength(1);
      expect(sarif.runs[0].tool.driver.name).toBe('agentic-qe-v3');
      expect(sarif.runs[0].results.length).toBeGreaterThan(0);
    });

    it('should generate security report with recommendations', async () => {
      const result = await saver.save('task_sec_003', 'scan-security', SECURITY_RESULT);

      const reportFile = result.files.find(f => f.format === 'markdown');
      const content = await fs.readFile(reportFile!.path, 'utf-8');

      expect(content).toContain('# Security Scan Report');
      expect(content).toContain('Critical | 1');
      expect(content).toContain('High | 3');
      expect(content).toContain('SQL Injection');
      expect(content).toContain('Update dependencies');
    });
  });

  describe('quality assessment results', () => {
    it('should save quality assessment with metrics', async () => {
      const result = await saver.save('task_qual_001', 'assess-quality', QUALITY_RESULT);

      expect(result.taskId).toBe('task_qual_001');
      expect(result.summary.qualityScore).toBe(87.5);
      expect(result.summary.passed).toBe(true);

      expect(result.files.find(f => f.format === 'json')).toBeDefined();
      expect(result.files.find(f => f.format === 'markdown')).toBeDefined();
    });

    it('should generate quality report with all metrics', async () => {
      const result = await saver.save('task_qual_002', 'assess-quality', QUALITY_RESULT);

      const reportFile = result.files.find(f => f.format === 'markdown');
      const content = await fs.readFile(reportFile!.path, 'utf-8');

      expect(content).toContain('# Quality Assessment Report');
      expect(content).toContain('Status:** PASSED');
      expect(content).toContain('87.5** / 100');
      expect(content).toContain('coverage | 78.5');
      expect(content).toContain('maintainability | 82.1');
    });

    it('should show recommendations for failed quality gate', async () => {
      const failedResult = {
        ...QUALITY_RESULT,
        passed: false,
        qualityScore: 65.0,
        recommendations: ['Increase test coverage', 'Reduce complexity'],
      };

      const result = await saver.save('task_qual_003', 'assess-quality', failedResult);
      const reportFile = result.files.find(f => f.format === 'markdown');
      const content = await fs.readFile(reportFile!.path, 'utf-8');

      expect(content).toContain('Status:** FAILED');
      expect(content).toContain('Increase test coverage');
      expect(content).toContain('Reduce complexity');
    });
  });

  describe('code indexing results', () => {
    it('should save code index as JSON', async () => {
      const result = await saver.save('task_idx_001', 'index-code', CODE_INDEX_RESULT);

      expect(result.taskId).toBe('task_idx_001');
      expect(result.files.find(f => f.format === 'json')).toBeDefined();

      const jsonFile = result.files.find(f => f.format === 'json');
      const content = await fs.readFile(jsonFile!.path, 'utf-8');
      const data = JSON.parse(content);

      expect(data.filesIndexed).toBe(156);
      expect(data.nodesCreated).toBe(2340);
      expect(data.edgesCreated).toBe(7890);
    });
  });

  describe('defect prediction results', () => {
    it('should save defect predictions as JSON', async () => {
      const result = await saver.save('task_def_001', 'predict-defects', DEFECT_PREDICTION_RESULT);

      expect(result.taskId).toBe('task_def_001');
      const jsonFile = result.files.find(f => f.format === 'json');
      expect(jsonFile).toBeDefined();

      const content = await fs.readFile(jsonFile!.path, 'utf-8');
      const data = JSON.parse(content);

      expect(data.predictedDefects).toHaveLength(2);
      expect(data.riskScore).toBe(42);
    });
  });

  describe('contract validation results', () => {
    it('should save contract validation as JSON', async () => {
      const result = await saver.save('task_cont_001', 'validate-contracts', CONTRACT_VALIDATION_RESULT);

      expect(result.taskId).toBe('task_cont_001');
      const jsonFile = result.files.find(f => f.format === 'json');
      const content = await fs.readFile(jsonFile!.path, 'utf-8');
      const data = JSON.parse(content);

      expect(data.valid).toBe(true);
      expect(data.coverage).toBe(95);
    });
  });

  describe('accessibility test results', () => {
    it('should save accessibility results as JSON', async () => {
      const result = await saver.save('task_a11y_001', 'test-accessibility', ACCESSIBILITY_RESULT);

      expect(result.taskId).toBe('task_a11y_001');
      const jsonFile = result.files.find(f => f.format === 'json');
      const content = await fs.readFile(jsonFile!.path, 'utf-8');
      const data = JSON.parse(content);

      expect(data.standard).toBe('wcag21-aa');
      expect(data.score).toBe(94);
    });
  });

  describe('chaos test results', () => {
    it('should save chaos test results as JSON', async () => {
      const result = await saver.save('task_chaos_001', 'run-chaos', CHAOS_RESULT);

      expect(result.taskId).toBe('task_chaos_001');
      const jsonFile = result.files.find(f => f.format === 'json');
      const content = await fs.readFile(jsonFile!.path, 'utf-8');
      const data = JSON.parse(content);

      expect(data.faultType).toBe('network-latency');
      expect(data.resilience.recovered).toBe(true);
    });
  });

  describe('generic results', () => {
    it('should save unknown task types as generic JSON', async () => {
      const genericResult = { custom: 'data', value: 123 };
      // Cast to any to simulate unknown task type
      const result = await saver.save('task_gen_001', 'unknown-task' as TaskType, genericResult);

      expect(result.taskId).toBe('task_gen_001');
      const jsonFile = result.files.find(f => f.format === 'json');
      expect(jsonFile).toBeDefined();
      expect(jsonFile!.path).toContain('other');
    });
  });

  describe('file checksums', () => {
    it('should include checksums for all saved files', async () => {
      const result = await saver.save('task_chk_001', 'analyze-coverage', COVERAGE_RESULT);

      result.files.forEach(file => {
        expect(file.checksum).toBeDefined();
        expect(file.checksum.length).toBe(16); // SHA256 truncated to 16 chars
      });
    });

    it('should include file sizes', async () => {
      const result = await saver.save('task_size_001', 'scan-security', SECURITY_RESULT);

      result.files.forEach(file => {
        expect(file.size).toBeGreaterThan(0);
      });
    });
  });

  describe('result index', () => {
    it('should create and update result index', async () => {
      await saver.save('task_idx_1', 'generate-tests', TEST_GENERATION_RESULT);
      await saver.save('task_idx_2', 'analyze-coverage', COVERAGE_RESULT);
      await saver.save('task_idx_3', 'scan-security', SECURITY_RESULT);

      const indexPath = path.join(TEST_BASE_DIR, 'results', 'index.json');
      expect(existsSync(indexPath)).toBe(true);

      const content = await fs.readFile(indexPath, 'utf-8');
      const index = JSON.parse(content);

      expect(index.version).toBe('1.0');
      expect(index.results).toHaveLength(3);
      expect(index.results[0].id).toBe('task_idx_1');
      expect(index.results[1].id).toBe('task_idx_2');
      expect(index.results[2].id).toBe('task_idx_3');
    });

    it('should track trends in index', async () => {
      await saver.save('task_trend_1', 'analyze-coverage', COVERAGE_RESULT);

      const indexPath = path.join(TEST_BASE_DIR, 'results', 'index.json');
      const content = await fs.readFile(indexPath, 'utf-8');
      const index = JSON.parse(content);

      expect(index.trends).toBeDefined();
    });

    it('should limit index to last 100 results', async () => {
      // Create 105 results
      for (let i = 0; i < 105; i++) {
        await saver.save(`task_limit_${i}`, 'generate-tests', TEST_GENERATION_RESULT);
      }

      const indexPath = path.join(TEST_BASE_DIR, 'results', 'index.json');
      const content = await fs.readFile(indexPath, 'utf-8');
      const index = JSON.parse(content);

      expect(index.results.length).toBeLessThanOrEqual(100);
    });
  });

  describe('timestamp formatting', () => {
    it('should format timestamps correctly in filenames', async () => {
      const result = await saver.save('task_ts_001', 'analyze-coverage', COVERAGE_RESULT);

      const jsonFile = result.files.find(f => f.format === 'json');
      // Timestamp format: YYYY-MM-DDTHH-MM-SS
      expect(jsonFile!.path).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
    });
  });

  describe('filename sanitization', () => {
    it('should sanitize test names for filenames', async () => {
      const resultWithSpecialChars = {
        ...TEST_GENERATION_RESULT,
        tests: [
          {
            name: 'should handle special chars: @#$%^&*()',
            file: 'src/test.ts',
            type: 'unit',
            code: 'test code',
          },
        ],
      };

      const result = await saver.save('task_san_001', 'generate-tests', resultWithSpecialChars);
      const sourceFile = result.files.find(f => f.format === 'source');

      // Should not contain special characters
      expect(sourceFile!.path).not.toMatch(/[@#$%^&*()]/);
    });
  });

  describe('custom filename prefix', () => {
    it('should use custom filename prefix when provided', async () => {
      const result = await saver.save('task_prefix_001', 'analyze-coverage', COVERAGE_RESULT, {
        filenamePrefix: 'custom-prefix',
      });

      const jsonFile = result.files.find(f => f.format === 'json');
      expect(jsonFile!.path).toContain('custom-prefix');
    });
  });

  describe('directory creation', () => {
    it('should create necessary directories', async () => {
      await saver.save('task_dir_001', 'generate-tests', TEST_GENERATION_RESULT);

      const expectedDirs = [
        path.join(TEST_BASE_DIR, 'results'),
        path.join(TEST_BASE_DIR, 'results', 'tests'),
        path.join(TEST_BASE_DIR, 'results', 'tests', 'generated'),
      ];

      for (const dir of expectedDirs) {
        expect(existsSync(dir)).toBe(true);
      }
    });
  });

  describe('error handling', () => {
    it('should handle missing result fields gracefully', async () => {
      const incompleteResult = {
        testsGenerated: 0,
        tests: [],
        patternsUsed: [],
      };

      const result = await saver.save('task_err_001', 'generate-tests', incompleteResult);
      expect(result.files.length).toBeGreaterThan(0); // Should still save something
    });
  });
});

describe('ResultSaver integration', () => {
  const TEST_DIR = '/tmp/agentic-qe-integration-' + Date.now();
  let saver: ResultSaver;

  beforeEach(() => {
    saver = createResultSaver(TEST_DIR);
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should handle full QE workflow with multiple result types', async () => {
    // Generate tests
    const genResult = await saver.save('workflow_001', 'generate-tests', TEST_GENERATION_RESULT, {
      language: 'typescript',
      framework: 'vitest',
    });
    expect(genResult.success !== false).toBe(true);

    // Analyze coverage
    const covResult = await saver.save('workflow_002', 'analyze-coverage', COVERAGE_RESULT);
    expect(covResult.files.length).toBeGreaterThan(0);

    // Security scan
    const secResult = await saver.save('workflow_003', 'scan-security', SECURITY_RESULT);
    expect(secResult.files.length).toBeGreaterThan(0);

    // Quality assessment
    const qualResult = await saver.save('workflow_004', 'assess-quality', QUALITY_RESULT);
    expect(qualResult.files.length).toBeGreaterThan(0);

    // Verify index contains all results
    const indexPath = path.join(TEST_DIR, 'results', 'index.json');
    const content = await fs.readFile(indexPath, 'utf-8');
    const index = JSON.parse(content);

    expect(index.results.length).toBe(4);
    expect(index.results.map((r: { id: string }) => r.id)).toEqual([
      'workflow_001',
      'workflow_002',
      'workflow_003',
      'workflow_004',
    ]);
  });
});
