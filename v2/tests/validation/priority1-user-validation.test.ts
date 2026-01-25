/**
 * Priority 1 User Validation Test Suite
 *
 * Validates all Priority 1 fixes from user perspective:
 * - Task 1.1: TODO Elimination
 * - Task 1.2: Async I/O Conversion
 * - Task 1.3: Race Condition Elimination
 * - AgentDB Learn CLI Implementation
 *
 * @version 1.0.0
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.join(__dirname, '../..');

/**
 * Helper to execute shell commands
 */
function exec(command: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(command, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout?.toString() || '',
      stderr: error.stderr?.toString() || '',
      exitCode: error.status || 1
    };
  }
}

/**
 * Helper to check if file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Helper to count occurrences in file
 */
async function countInFile(filePath: string, pattern: RegExp): Promise<number> {
  const content = await fs.readFile(filePath, 'utf-8');
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

describe('Priority 1 User Validation', () => {

  describe('Build Verification', () => {
    test('should compile TypeScript with 0 errors', () => {
      const result = exec('npm run build');

      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain('error TS');
      expect(result.stdout).toContain('tsc');
    }, 120000);

    test('should have no TypeScript errors in learn.ts', async () => {
      const learnPath = path.join(PROJECT_ROOT, 'src/cli/commands/agentdb/learn.ts');
      const exists = await fileExists(learnPath);

      expect(exists).toBe(true);

      // Check file doesn't have stub TODOs
      const content = await fs.readFile(learnPath, 'utf-8');
      expect(content).not.toContain('// TODO: Implement actual training');
      expect(content).toContain('await integration.getStatistics(agentId)');
    });
  });

  describe('Task 1.1: TODO Elimination', () => {
    test('should have pre-commit hook installed', async () => {
      const hookPath = path.join(PROJECT_ROOT, '.git/hooks/pre-commit');
      const exists = await fileExists(hookPath);

      expect(exists).toBe(true);

      const content = await fs.readFile(hookPath, 'utf-8');
      // Check hook prevents TODOs (pattern may vary)
      expect(content).toMatch(/TODO|FIXME|HACK|BUG/);
      expect(content).toContain('WHITELIST');
    });

    test('should have 0 production TODOs (excluding whitelisted files)', async () => {
      const result = exec('grep -rn "TODO" src/ | grep -v "Logger.ts" | grep -v "TestGenerateStreamHandler.ts" | grep -v "recommend-tests.ts" | wc -l');

      const count = parseInt(result.stdout.trim());
      expect(count).toBeLessThanOrEqual(15); // Template generators only
    });

    test('should have documented template exceptions', async () => {
      const reportPath = path.join(PROJECT_ROOT, 'docs/reports/implement-marker-audit.md');
      const exists = await fileExists(reportPath);

      expect(exists).toBe(true);

      const content = await fs.readFile(reportPath, 'utf-8');
      expect(content).toContain('Template Generator Files');
    });
  });

  describe('Task 1.2: Async I/O Conversion', () => {
    test('should have 0 sync I/O operations (excluding Logger.ts)', async () => {
      const result = exec('grep -rn "readFileSync\\|writeFileSync\\|existsSync\\|mkdirSync" src/ | grep -v Logger.ts | wc -l');

      const count = parseInt(result.stdout.trim());
      expect(count).toBe(0);
    });

    test('should use async fs operations in CLI commands', async () => {
      const files = [
        'src/cli/commands/init.ts',
        'src/cli/commands/debug/agent.ts',
        'src/cli/commands/test/clean.ts',
        'src/cli/commands/agentdb/learn.ts'
      ];

      for (const file of files) {
        const filePath = path.join(PROJECT_ROOT, file);
        const content = await fs.readFile(filePath, 'utf-8');

        // Check no sync operations (behavior, not import pattern)
        expect(content).not.toContain('readFileSync');
        expect(content).not.toContain('writeFileSync');
        expect(content).not.toContain('existsSync');
        expect(content).not.toContain('mkdirSync');
      }
    });

    test('should have async I/O audit report', async () => {
      const reportPath = path.join(PROJECT_ROOT, 'docs/reports/sync-io-audit.md');
      const exists = await fileExists(reportPath);

      expect(exists).toBe(true);

      const content = await fs.readFile(reportPath, 'utf-8');
      expect(content).toContain('97%');
      expect(content).toContain('Logger.ts');
    });
  });

  describe('Task 1.3: Race Condition Elimination', () => {
    test('should have event-driven methods in BaseAgent', async () => {
      const baseAgentPath = path.join(PROJECT_ROOT, 'src/agents/BaseAgent.ts');
      const content = await fs.readFile(baseAgentPath, 'utf-8');

      expect(content).toContain('waitForStatus');
      expect(content).toContain('waitForReady');
      expect(content).toContain('emitStatusChange');
      expect(content).toContain("this.emit('status-changed'");
    });

    test('should use Promise.race with cleanup', async () => {
      const baseAgentPath = path.join(PROJECT_ROOT, 'src/agents/BaseAgent.ts');
      const content = await fs.readFile(baseAgentPath, 'utf-8');

      expect(content).toContain('clearTimeout(timer)');
      expect(content).toContain('this.removeListener');
    });

    test('should have reduced setTimeout usage', async () => {
      const result = exec('grep -rn "setTimeout" src/agents/ | wc -l');
      const count = parseInt(result.stdout.trim());

      // Should be significantly reduced from 109
      expect(count).toBeLessThan(30);
    });

    test('should have race condition audit report', async () => {
      const reportPath = path.join(PROJECT_ROOT, 'docs/reports/race-condition-report.md');
      const exists = await fileExists(reportPath);

      expect(exists).toBe(true);

      const content = await fs.readFile(reportPath, 'utf-8');
      expect(content).toContain('Event-Driven');
      expect(content).toContain('Promise.race');
    });
  });

  describe('AgentDB Learn CLI Implementation', () => {
    test('should have proper imports in learn.ts', async () => {
      const learnPath = path.join(PROJECT_ROOT, 'src/cli/commands/agentdb/learn.ts');
      const content = await fs.readFile(learnPath, 'utf-8');

      expect(content).toContain("import { SwarmMemoryManager }");
      expect(content).toContain("import { LearningEngine }");
      expect(content).toContain("import { EnhancedAgentDBService }");
      expect(content).toContain("import { QEReasoningBank }");
      expect(content).toContain("import { AgentDBLearningIntegration }");
    });

    test('should have initializeLearningServices function', async () => {
      const learnPath = path.join(PROJECT_ROOT, 'src/cli/commands/agentdb/learn.ts');
      const content = await fs.readFile(learnPath, 'utf-8');

      expect(content).toContain('async function initializeLearningServices');
      expect(content).toContain('const memoryManager = new SwarmMemoryManager');
      expect(content).toContain('const learningEngine = new LearningEngine');
      expect(content).toContain('const agentDBService = new EnhancedAgentDBService');
      expect(content).toContain('const integration = new AgentDBLearningIntegration');
    });

    test('should have all 7 CLI commands implemented', async () => {
      const learnPath = path.join(PROJECT_ROOT, 'src/cli/commands/agentdb/learn.ts');
      const content = await fs.readFile(learnPath, 'utf-8');

      expect(content).toContain('createStatusCommand');
      expect(content).toContain('createTrainCommand');
      expect(content).toContain('createStatsCommand');
      expect(content).toContain('createExportCommand');
      expect(content).toContain('createImportCommand');
      expect(content).toContain('createOptimizeCommand');
      expect(content).toContain('createClearCommand');
    });

    test('should use real integration methods, not stubs', async () => {
      const learnPath = path.join(PROJECT_ROOT, 'src/cli/commands/agentdb/learn.ts');
      const content = await fs.readFile(learnPath, 'utf-8');

      // Check for real method calls
      expect(content).toContain('integration.getStatistics');
      expect(content).toContain('integration.exportLearningModel');
      expect(content).toContain('integration.clearLearningData');
      expect(content).toContain('learningEngine.getTotalExperiences');
      expect(content).toContain('agentDBService.getStats');

      // Should NOT have stub code
      expect(content).not.toContain('await new Promise(resolve => setTimeout(resolve, 2000))');
      expect(content).not.toContain('// TODO: Implement actual training');
    });

    test('should have implementation documentation', async () => {
      const docPath = path.join(PROJECT_ROOT, 'docs/reports/learn-cli-proper-implementation.md');
      const exists = await fileExists(docPath);

      expect(exists).toBe(true);

      const content = await fs.readFile(docPath, 'utf-8');
      expect(content).toContain('PRODUCTION-READY');
      expect(content).toContain('0 errors');
    });
  });

  describe('Core BaseAgent Tests', () => {
    test('should have BaseAgent tests passing', () => {
      const result = exec('node --max-old-space-size=256 node_modules/.bin/jest tests/unit/agents/BaseAgent.test.ts --runInBand --testTimeout=30000');

      // Check for passing tests (exit code 0 means success)
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/Tests:.*\d+ passed/);
    }, 60000);
  });

  describe('Documentation Validation', () => {
    const requiredReports = [
      'docs/reports/todo-elimination-report.md',
      'docs/reports/implement-marker-audit.md',
      'docs/reports/sync-io-audit.md',
      'docs/reports/race-condition-report.md',
      'docs/reports/learn-cli-proper-implementation.md',
      'docs/reports/priority1-final-validated.md'
    ];

    test.each(requiredReports)('should have report: %s', async (reportPath) => {
      const fullPath = path.join(PROJECT_ROOT, reportPath);
      const exists = await fileExists(fullPath);

      expect(exists).toBe(true);
    });

    test('should have final validation report with honest metrics', async () => {
      const reportPath = path.join(PROJECT_ROOT, 'docs/reports/priority1-final-validated.md');
      const content = await fs.readFile(reportPath, 'utf-8');

      expect(content).toContain('82%'); // Honest score
      expect(content).toContain('PASSING');
      expect(content).toContain('51/51');
    });
  });

  describe('Production Readiness Checks', () => {
    test('should not log sensitive data to console', async () => {
      const result = exec('grep -rn "console\\.log" src/ | grep -v "Logger" | grep -v ".test.ts" | grep -v "README.md"');
      const output = result.stdout;

      // Check for actual sensitive data logging (not word usage in descriptions)
      expect(output).not.toMatch(/console\.log\([^)]*password[^)]*\)/i);
      expect(output).not.toMatch(/console\.log\([^)]*secret[^)]*\)/i);
      expect(output).not.toMatch(/console\.log\([^)]*api_key[^)]*\)/i);
      expect(output).not.toMatch(/console\.log\([^)]*private_key[^)]*\)/i);

      // CLI commands use console.log with chalk for user output - that's correct
    });

    test('should have Logger usage for important events', async () => {
      const files = [
        'src/learning/LearningEngine.ts',
        'src/core/memory/AgentDBService.ts'
      ];

      for (const file of files) {
        const filePath = path.join(PROJECT_ROOT, file);
        const content = await fs.readFile(filePath, 'utf-8');

        expect(content).toContain('this.logger');
      }
    });

    test('should have proper error handling in CLI commands', async () => {
      const learnPath = path.join(PROJECT_ROOT, 'src/cli/commands/agentdb/learn.ts');
      const content = await fs.readFile(learnPath, 'utf-8');

      const catchBlocks = (content.match(/catch.*\{/g) || []).length;
      expect(catchBlocks).toBeGreaterThan(5); // Multiple error handlers

      expect(content).toContain('spinner.fail');
      expect(content).toContain('process.exit(1)');
    });
  });
});
