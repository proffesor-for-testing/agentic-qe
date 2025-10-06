/**
 * Meta-Tests: Verify No Mocks in Production Code
 *
 * These tests verify that production code (src/) does not contain
 * mock implementations, fake data, or stubs. Only test files should use mocks.
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

describe('Meta-Test: No Mocks in Production Code', () => {
  const srcDir = path.join(__dirname, '../../src');
  const excludePatterns = [
    '**/node_modules/**',
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/test/**',
    '**/tests/**'
  ];

  let srcFiles: string[] = [];

  beforeAll(async () => {
    // Get all TypeScript files in src directory
    srcFiles = await glob('**/*.ts', {
      cwd: srcDir,
      absolute: true,
      ignore: excludePatterns
    });
  });

  describe('1. Coverage System Should Use Real Implementations', () => {
    test('should not have stub implementations in coverage-reporter.ts', () => {
      const filePath = path.join(srcDir, 'coverage/coverage-reporter.ts');
      if (!fs.existsSync(filePath)) {
        return; // File doesn't exist, skip
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      // Check for stub markers
      expect(content).not.toContain('Stub Implementation');
      expect(content).not.toContain('stub implementation');
      expect(content).not.toMatch(/\/\/\s*Stub/i);

      // Check for empty implementations
      const emptyStubPattern = /async\s+\w+\([^)]*\):\s*Promise<[^>]+>\s*{\s*\/\/\s*Stub\s+implementation\s*}/;
      expect(content).not.toMatch(emptyStubPattern);
    });

    test('should not have stub implementations in coverage-collector.ts', () => {
      const filePath = path.join(srcDir, 'coverage/coverage-collector.ts');
      if (!fs.existsSync(filePath)) {
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).not.toContain('Stub Implementation');
      expect(content).not.toContain('stub implementation');
      expect(content).not.toMatch(/\/\/\s*Stub/i);
    });
  });

  describe('2. Test Execution Should Not Use Mock Results', () => {
    test('should not generate mock test results in TestExecutorAgent', () => {
      const filePath = path.join(srcDir, 'agents/TestExecutorAgent.ts');
      if (!fs.existsSync(filePath)) {
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      // Check for mock results generation
      expect(content).not.toMatch(/const\s+mockResults\s*=/);
      expect(content).not.toMatch(/generateMockTestResults/);
      expect(content).not.toContain('Simulate framework-specific test execution');

      // Check for fake random data
      expect(content).not.toMatch(/Math\.floor\(Math\.random\(\)\s*\*\s*\d+\)\s*\+\s*\d+/);
    });

    test('should not generate mock test results in MCP handler', () => {
      const filePath = path.join(srcDir, 'mcp/handlers/test-execute.ts');
      if (!fs.existsSync(filePath)) {
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).not.toMatch(/generateMockTestResults/);
      expect(content).not.toMatch(/generateMockAssertions/);
      expect(content).not.toContain('// Generate mock test results');
    });
  });

  describe('3. Test Generation Should Not Use Mock Code Analysis', () => {
    test('should not have mock function generation in test-generate.ts', () => {
      const filePath = path.join(srcDir, 'mcp/handlers/test-generate.ts');
      if (!fs.existsSync(filePath)) {
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).not.toMatch(/generateMockFunctions/);
      expect(content).not.toMatch(/generateMockClasses/);
      expect(content).not.toMatch(/generateMockDependencies/);
      expect(content).not.toContain('// Helper methods for mock data generation');
    });
  });

  describe('4. Security Scanner Should Use Real Tools', () => {
    test('should not have mock SAST scan in SecurityScannerAgent', () => {
      const filePath = path.join(srcDir, 'agents/SecurityScannerAgent.ts');
      if (!fs.existsSync(filePath)) {
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).not.toContain('// Mock SAST scan implementation');
      expect(content).not.toContain('// Mock: Find random vulnerabilities');
      expect(content).not.toMatch(/\/\/\s*Mock\s+DAST\s+scan/i);
      expect(content).not.toMatch(/\/\/\s*Mock\s+dependency\s+scan/i);
      expect(content).not.toMatch(/\/\/\s*Mock\s+container\s+scan/i);
      expect(content).not.toMatch(/\/\/\s*Mock\s+CVE\s+database/i);
    });
  });

  describe('5. Regression Risk Should Use Real Dependency Analysis', () => {
    test('should not have mock dependency methods in RegressionRiskAnalyzerAgent', () => {
      const filePath = path.join(srcDir, 'agents/RegressionRiskAnalyzerAgent.ts');
      if (!fs.existsSync(filePath)) {
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).not.toMatch(/mockDirectDependencies/);
      expect(content).not.toMatch(/generateMockChangedFiles/);
      expect(content).not.toContain('// Mock implementation');
    });
  });

  describe('6. Test Data Architect Should Use Real Faker.js', () => {
    test('should not have mock Faker initialization in TestDataArchitectAgent', () => {
      const filePath = path.join(srcDir, 'agents/TestDataArchitectAgent.ts');
      if (!fs.existsSync(filePath)) {
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      // Should import real Faker
      expect(content).toMatch(/import.*faker.*from.*@faker-js\/faker/i);

      // Should not have mock Faker object
      expect(content).not.toContain('// Mock Faker.js initialization');
      expect(content).not.toMatch(/this\.faker\s*=\s*{\s*locale:/);
    });
  });

  describe('7. Deployment Readiness Should Use Real Monitoring', () => {
    test('should not have mock monitoring initialization in DeploymentReadinessAgent', () => {
      const filePath = path.join(srcDir, 'agents/DeploymentReadinessAgent.ts');
      if (!fs.existsSync(filePath)) {
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).not.toContain('// Mock initialization - in production');
      expect(content).not.toMatch(/\/\/\s*Mock\s+monitoring\s+implementation/i);
    });
  });

  describe('8. Flaky Test Hunter Should Use Real Test History', () => {
    test('should not return mock data in FlakyTestHunterAgent', () => {
      const filePath = path.join(srcDir, 'agents/FlakyTestHunterAgent.ts');
      if (!fs.existsSync(filePath)) {
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).not.toContain('// For now, return mock data');
    });
  });

  describe('9. Global Pattern Check: No Mock Keywords in Production', () => {
    test('should not have "mockResults" variables in any src file', () => {
      const violations: string[] = [];

      srcFiles.forEach(file => {
        const content = fs.readFileSync(file, 'utf-8');
        if (content.match(/\bmockResults\b/)) {
          violations.push(path.relative(srcDir, file));
        }
      });

      if (violations.length > 0) {
        console.warn('Files with mockResults:', violations);
      }

      expect(violations).toHaveLength(0);
    });

    test('should not have "generateMock" function names in any src file', () => {
      const violations: string[] = [];

      srcFiles.forEach(file => {
        const content = fs.readFileSync(file, 'utf-8');
        if (content.match(/\bgenerateMock\w+\s*\(/)) {
          violations.push(path.relative(srcDir, file));
        }
      });

      if (violations.length > 0) {
        console.warn('Files with generateMock functions:', violations);
      }

      expect(violations).toHaveLength(0);
    });

    test('should not have "// Mock implementation" comments in any src file', () => {
      const violations: string[] = [];
      const allowedFiles = [
        'cli/commands', // CLI demo commands are acceptable
        'types/index.ts' // Config option naming is acceptable
      ];

      srcFiles.forEach(file => {
        // Skip allowed directories
        if (allowedFiles.some(allowed => file.includes(allowed))) {
          return;
        }

        const content = fs.readFileSync(file, 'utf-8');
        if (content.match(/\/\/\s*Mock\s+implementation/i)) {
          violations.push(path.relative(srcDir, file));
        }
      });

      if (violations.length > 0) {
        console.warn('Files with "Mock implementation" comments:', violations);
      }

      expect(violations).toHaveLength(0);
    });
  });

  describe('10. Verify Real Implementations Exist', () => {
    test('should use real Database implementation', () => {
      const filePath = path.join(srcDir, 'utils/Database.ts');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');

      // Should import real SQLite
      expect(content).toMatch(/import.*better-sqlite3/);
      expect(content).toMatch(/class\s+Database/);
    });

    test('should use real Logger implementation', () => {
      const filePath = path.join(srcDir, 'utils/Logger.ts');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');

      // Should import real Winston
      expect(content).toMatch(/import.*winston/);
    });

    test('should use real EventBus implementation', () => {
      const filePath = path.join(srcDir, 'core/EventBus.ts');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');

      // Should extend real EventEmitter
      expect(content).toMatch(/extends\s+EventEmitter/);
    });

    test('should use real Memory implementation', () => {
      const filePath = path.join(srcDir, 'core/memory/SwarmMemoryManager.ts');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');

      // Should use real database
      expect(content).toMatch(/import.*Database/);
      expect(content).not.toContain('// Mock');
    });

    test('should use real fs operations throughout codebase', () => {
      const fileOpsPattern = /\bfs\.(readFileSync|writeFileSync|existsSync|mkdirSync|readFile|writeFile)\b/;

      let foundRealFileOps = false;

      srcFiles.forEach(file => {
        const content = fs.readFileSync(file, 'utf-8');
        if (fileOpsPattern.test(content)) {
          foundRealFileOps = true;
        }
      });

      expect(foundRealFileOps).toBe(true);
    });
  });
});
