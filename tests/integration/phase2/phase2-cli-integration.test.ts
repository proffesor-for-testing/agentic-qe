/**
 * Phase 2 CLI Integration Tests
 *
 * Tests that Phase 2 CLI commands work correctly:
 * - aqe learn commands (status, enable, disable, train)
 * - aqe patterns commands (list, extract, find, stats)
 * - aqe improve commands (status, analyze, optimize)
 *
 * @module tests/integration/phase2/phase2-cli-integration
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs-extra';
import * as path from 'path';

const execAsync = promisify(exec);
const TEST_OUTPUT_DIR = path.join(__dirname, '../../.tmp/cli-test-output');

// Helper to execute CLI commands
async function execCommand(cmd: string): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execAsync(cmd, {
      cwd: path.join(__dirname, '../../..'),
      env: { ...process.env, NODE_ENV: 'test' }
    });
  } catch (error: any) {
    return { stdout: error.stdout || '', stderr: error.stderr || error.message };
  }
}

describe('Phase 2 CLI Integration Tests', () => {
  beforeEach(async () => {
    await fs.ensureDir(TEST_OUTPUT_DIR);
  });

  afterEach(async () => {
    // Clean up test output
    await fs.remove(TEST_OUTPUT_DIR);
  });

  // ===========================================================================
  // aqe learn commands
  // ===========================================================================

  describe('aqe learn commands', () => {
    it('should show learning status', async () => {
      const { stdout, stderr } = await execCommand('npm run dev -- learn status');

      expect(stderr).toBe('');
      expect(stdout).toContain('Learning Engine Status');
      expect(stdout).toContain('Experiences:');
      expect(stdout).toContain('Average Quality:');
    }, 15000);

    it('should enable learning for specific agents', async () => {
      const { stdout } = await execCommand('npm run dev -- learn enable --agent test-generator');

      expect(stdout).toContain('Learning enabled');
      expect(stdout).toContain('test-generator');
    }, 10000);

    it('should enable learning for all agents', async () => {
      const { stdout } = await execCommand('npm run dev -- learn enable --all');

      expect(stdout).toContain('Learning enabled');
      expect(stdout).toMatch(/all\s+agents/i);
    }, 10000);

    it('should disable learning', async () => {
      const { stdout } = await execCommand('npm run dev -- learn disable --agent coverage-analyzer');

      expect(stdout).toContain('Learning disabled');
    }, 10000);

    it('should train learning engine with historical data', async () => {
      // Create mock historical data file
      const historyFile = path.join(TEST_OUTPUT_DIR, 'test-history.json');
      await fs.writeJSON(historyFile, {
        tests: [
          { id: 'test-1', outcome: 'success', quality: 0.9, coverage: 0.85 },
          { id: 'test-2', outcome: 'success', quality: 0.88, coverage: 0.82 }
        ]
      });

      const { stdout } = await execCommand(`npm run dev -- learn train --file ${historyFile}`);

      expect(stdout).toContain('Training completed');
      expect(stdout).toMatch(/experiences?\s+recorded/i);
    }, 15000);

    it('should display learning insights', async () => {
      const { stdout } = await execCommand('npm run dev -- learn insights --days 30');

      expect(stdout).toContain('Learning Insights');
      expect(stdout).toMatch(/trends|recommendations|quality/i);
    }, 10000);
  });

  // ===========================================================================
  // aqe patterns commands
  // ===========================================================================

  describe('aqe patterns commands', () => {
    it('should list available patterns', async () => {
      const { stdout } = await execCommand('npm run dev -- patterns list');

      expect(stdout).toContain('Test Patterns');
      expect(stdout).toMatch(/total|count|patterns/i);
    }, 10000);

    it('should list patterns filtered by framework', async () => {
      const { stdout } = await execCommand('npm run dev -- patterns list --framework jest');

      expect(stdout).toContain('jest');
      expect(stdout).toMatch(/patterns?/i);
    }, 10000);

    it('should extract patterns from test files', async () => {
      // Create mock test file
      const testFile = path.join(TEST_OUTPUT_DIR, 'sample.test.ts');
      await fs.writeFile(testFile, `
        describe('SampleService', () => {
          it('should create entity', () => {
            const service = new SampleService();
            const result = service.create({ name: 'Test' });
            expect(result.id).toBeDefined();
          });
        });
      `);

      const { stdout } = await execCommand(`npm run dev -- patterns extract ${TEST_OUTPUT_DIR}`);

      expect(stdout).toContain('patterns extracted');
      expect(stdout).toMatch(/\d+\s+patterns?/i);
    }, 15000);

    it('should find matching patterns by query', async () => {
      const { stdout } = await execCommand('npm run dev -- patterns find --query "user create" --framework jest');

      expect(stdout).toMatch(/patterns?|matches?/i);
    }, 10000);

    it('should show pattern statistics', async () => {
      const { stdout } = await execCommand('npm run dev -- patterns stats');

      expect(stdout).toContain('Pattern Statistics');
      expect(stdout).toMatch(/total|usage|success rate/i);
    }, 10000);

    it('should export patterns to file', async () => {
      const exportFile = path.join(TEST_OUTPUT_DIR, 'patterns.json');
      const { stdout } = await execCommand(`npm run dev -- patterns export --output ${exportFile}`);

      expect(stdout).toContain('exported');
      expect(await fs.pathExists(exportFile)).toBe(true);

      const exported = await fs.readJSON(exportFile);
      expect(exported.patterns).toBeDefined();
    }, 15000);

    it('should import patterns from file', async () => {
      // Create mock patterns file
      const importFile = path.join(TEST_OUTPUT_DIR, 'import-patterns.json');
      await fs.writeJSON(importFile, {
        patterns: [
          {
            id: 'pattern-1',
            name: 'CRUD Test Pattern',
            category: 'integration',
            framework: 'jest',
            template: 'describe("CRUD", () => { ... });'
          }
        ]
      });

      const { stdout } = await execCommand(`npm run dev -- patterns import --file ${importFile}`);

      expect(stdout).toContain('imported');
      expect(stdout).toMatch(/\d+\s+patterns?/i);
    }, 15000);
  });

  // ===========================================================================
  // aqe improve commands
  // ===========================================================================

  describe('aqe improve commands', () => {
    it('should show improvement loop status', async () => {
      const { stdout } = await execCommand('npm run dev -- improve status');

      expect(stdout).toContain('Improvement Loop Status');
      expect(stdout).toMatch(/baseline|current|target/i);
    }, 10000);

    it('should analyze improvement opportunities', async () => {
      const { stdout } = await execCommand('npm run dev -- improve analyze --agent coverage-analyzer');

      expect(stdout).toContain('Improvement Analysis');
      expect(stdout).toMatch(/opportunities|recommendations/i);
    }, 15000);

    it('should run improvement cycle', async () => {
      const { stdout } = await execCommand('npm run dev -- improve cycle --iterations 3');

      expect(stdout).toContain('Improvement Cycle');
      expect(stdout).toMatch(/iteration|improvement|baseline/i);
    }, 20000);

    it('should set improvement target', async () => {
      const { stdout } = await execCommand('npm run dev -- improve target --value 0.25 --agent test-generator');

      expect(stdout).toContain('Target set');
      expect(stdout).toContain('25%');
    }, 10000);

    it('should validate improvement target achievement', async () => {
      const { stdout } = await execCommand('npm run dev -- improve validate --agent coverage-analyzer');

      expect(stdout).toMatch(/target\s+(reached|not\s+reached)/i);
      expect(stdout).toMatch(/improvement\s+rate/i);
    }, 10000);
  });

  // ===========================================================================
  // Integration with other commands
  // ===========================================================================

  describe('Command Integration', () => {
    it('should chain pattern extraction → learning → improvement', async () => {
      // Step 1: Extract patterns
      const testDir = path.join(TEST_OUTPUT_DIR, 'tests');
      await fs.ensureDir(testDir);
      await fs.writeFile(path.join(testDir, 'test.ts'), `
        describe('Test', () => {
          it('works', () => { expect(true).toBe(true); });
        });
      `);

      const { stdout: extractOut } = await execCommand(`npm run dev -- patterns extract ${testDir}`);
      expect(extractOut).toContain('extracted');

      // Step 2: Enable learning
      const { stdout: learnOut } = await execCommand('npm run dev -- learn enable --all');
      expect(learnOut).toContain('enabled');

      // Step 3: Check improvement status
      const { stdout: improveOut } = await execCommand('npm run dev -- improve status');
      expect(improveOut).toContain('Status');
    }, 30000);

    it('should display comprehensive system status', async () => {
      const { stdout } = await execCommand('npm run dev -- status --verbose');

      expect(stdout).toContain('System Status');
      expect(stdout).toMatch(/learning|patterns|improvement/i);
    }, 10000);
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('CLI Error Handling', () => {
    it('should handle invalid command gracefully', async () => {
      const { stderr } = await execCommand('npm run dev -- invalid-command');

      expect(stderr).toMatch(/unknown|invalid|not found/i);
    }, 10000);

    it('should validate required parameters', async () => {
      const { stderr } = await execCommand('npm run dev -- patterns extract');

      expect(stderr).toMatch(/required|missing|path/i);
    }, 10000);

    it('should handle non-existent file paths', async () => {
      const { stderr } = await execCommand('npm run dev -- patterns extract /non/existent/path');

      expect(stderr).toMatch(/not found|does not exist/i);
    }, 10000);
  });

  // ===========================================================================
  // Output Format Tests
  // ===========================================================================

  describe('Output Format', () => {
    it('should support JSON output format', async () => {
      const { stdout } = await execCommand('npm run dev -- learn status --format json');

      const parsed = JSON.parse(stdout);
      expect(parsed).toBeDefined();
      expect(parsed.status).toBeDefined();
    }, 10000);

    it('should support table output format', async () => {
      const { stdout } = await execCommand('npm run dev -- patterns list --format table');

      expect(stdout).toMatch(/\||\u2502|\u2500/); // Table border characters
    }, 10000);

    it('should support compact output format', async () => {
      const { stdout } = await execCommand('npm run dev -- improve status --format compact');

      expect(stdout.split('\n').length).toBeLessThan(10); // Concise output
    }, 10000);
  });
});
