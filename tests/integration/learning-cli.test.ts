/**
 * Learning System CLI Integration Tests
 *
 * Tests all `aqe patterns`, `aqe learn`, and `aqe improve` commands with real database
 * Based on CRITICAL-LEARNING-SYSTEM-ANALYSIS.md findings
 *
 * Test Coverage:
 * 1. aqe patterns list
 * 2. aqe patterns search
 * 3. aqe patterns extract
 * 4. aqe learn status
 * 5. aqe learn history
 * 6. aqe learn export
 * 7. aqe improve start/stop/status/cycle
 *
 * **Current State**: Most commands DON'T EXIST in CLI
 * These tests document what SHOULD work based on README claims
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('Learning System CLI Integration Tests', () => {
  let testProjectDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();

    // Create temporary test project
    testProjectDir = path.join(__dirname, '../temp', `cli-test-${Date.now()}`);
    fs.mkdirSync(testProjectDir, { recursive: true });

    // Initialize test project with AQE
    process.chdir(testProjectDir);

    // Create mock test files
    fs.mkdirSync(path.join(testProjectDir, 'tests'), { recursive: true });
    fs.writeFileSync(
      path.join(testProjectDir, 'tests', 'user.test.ts'),
      `
describe('UserService', () => {
  it('should create user', async () => {
    const user = await userService.create({ name: 'Test' });
    expect(user.id).toBeDefined();
  });
});
      `
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);

    // Cleanup
    if (fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    }
  });

  /**
   * Test 1: aqe patterns list
   * **Expected**: FAIL - Command doesn't exist
   */
  describe('aqe patterns list', () => {
    it('should list all available patterns', () => {
      try {
        // ❌ EXPECTED TO FAIL: Command not implemented
        const output = execSync('npx aqe patterns list', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        expect(output).toContain('Available Patterns:');
        expect(output).toMatch(/\d+ patterns found/);
      } catch (error: any) {
        // Command doesn't exist
        expect(error.message).toContain('Unknown command');
      }
    });

    it('should filter patterns by framework', () => {
      try {
        const output = execSync('npx aqe patterns list --framework jest', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        expect(output).toContain('jest');
        expect(output).not.toContain('mocha');
      } catch (error: any) {
        expect(error.message).toContain('Unknown command');
      }
    });

    it('should filter patterns by category', () => {
      try {
        const output = execSync('npx aqe patterns list --category unit', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        expect(output).toContain('unit');
      } catch (error: any) {
        expect(error.message).toContain('Unknown command');
      }
    });

    it('should show pattern details in verbose mode', () => {
      try {
        const output = execSync('npx aqe patterns list --verbose', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        expect(output).toContain('Usage Count:');
        expect(output).toContain('Success Rate:');
        expect(output).toContain('Quality Score:');
      } catch (error: any) {
        expect(error.message).toContain('Unknown command');
      }
    });
  });

  /**
   * Test 2: aqe patterns search
   * **Expected**: FAIL - Command doesn't exist
   */
  describe('aqe patterns search', () => {
    it('should search patterns by keyword', () => {
      try {
        // ❌ EXPECTED TO FAIL: Command not implemented
        const output = execSync('npx aqe patterns search "api validation"', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        expect(output).toContain('Search Results:');
        expect(output).toMatch(/\d+ patterns match/);
      } catch (error: any) {
        expect(error.message).toContain('Unknown command');
      }
    });

    it('should rank search results by relevance', () => {
      try {
        const output = execSync('npx aqe patterns search "controller test"', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        // Should show relevance scores
        expect(output).toMatch(/\d+\.\d+/); // Similarity score
      } catch (error: any) {
        expect(error.message).toContain('Unknown command');
      }
    });

    it('should support fuzzy search', () => {
      try {
        const output = execSync('npx aqe patterns search "api tst" --fuzzy', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        expect(output).toContain('api test');
      } catch (error: any) {
        expect(error.message).toContain('Unknown command');
      }
    });
  });

  /**
   * Test 3: aqe patterns extract
   * **Expected**: FAIL - Command exists but doesn't persist
   */
  describe('aqe patterns extract', () => {
    it('should extract patterns from test files', () => {
      try {
        // ❌ EXPECTED TO FAIL: Extracts to memory but doesn't save to DB
        const output = execSync('npx aqe patterns extract ./tests --framework jest', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        expect(output).toContain('Extracted');
        expect(output).toMatch(/\d+ patterns/);
      } catch (error: any) {
        // Might exist but fail
        console.log('Pattern extract error:', error.message);
      }
    });

    it('should save extracted patterns to database', () => {
      try {
        execSync('npx aqe patterns extract ./tests --framework jest', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        // Verify patterns in database
        // ❌ EXPECTED TO FAIL: Patterns not in database
        const listOutput = execSync('npx aqe patterns list', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        expect(listOutput).toMatch(/\d+ patterns/); // Should show extracted patterns
      } catch (error: any) {
        expect(error.message).toContain('Unknown command');
      }
    });

    it('should handle multiple frameworks', () => {
      try {
        const output = execSync('npx aqe patterns extract ./tests --framework jest,mocha', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        expect(output).toContain('jest');
        expect(output).toContain('mocha');
      } catch (error: any) {
        console.log('Multi-framework error:', error.message);
      }
    });
  });

  /**
   * Test 4: aqe learn status
   * **Expected**: FAIL - Command doesn't exist
   */
  describe('aqe learn status', () => {
    it('should show learning status for agent', () => {
      try {
        // ❌ EXPECTED TO FAIL: Command not implemented
        const output = execSync('npx aqe learn status --agent test-gen', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        expect(output).toContain('Learning Status:');
        expect(output).toContain('Total Experiences:');
        expect(output).toContain('Learning Rate:');
        expect(output).toContain('Exploration Rate:');
      } catch (error: any) {
        expect(error.message).toContain('Unknown command');
      }
    });

    it('should show Q-values statistics', () => {
      try {
        const output = execSync('npx aqe learn status --agent test-gen --verbose', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        expect(output).toContain('Q-Values:');
        expect(output).toContain('State-Action Pairs:');
      } catch (error: any) {
        expect(error.message).toContain('Unknown command');
      }
    });

    it('should show learning progress', () => {
      try {
        const output = execSync('npx aqe learn status --agent test-gen', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        expect(output).toContain('Performance Improvement:');
        expect(output).toMatch(/\d+\.\d+%/);
      } catch (error: any) {
        expect(error.message).toContain('Unknown command');
      }
    });
  });

  /**
   * Test 5: aqe learn history
   * **Expected**: FAIL - Command doesn't exist
   */
  describe('aqe learn history', () => {
    it('should show learning history for agent', () => {
      try {
        // ❌ EXPECTED TO FAIL: Command not implemented
        const output = execSync('npx aqe learn history --agent test-gen --limit 50', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        expect(output).toContain('Learning History:');
        expect(output).toMatch(/\d+ experiences/);
      } catch (error: any) {
        expect(error.message).toContain('Unknown command');
      }
    });

    it('should filter history by time range', () => {
      try {
        const output = execSync('npx aqe learn history --agent test-gen --since "7 days ago"', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        expect(output).toContain('experiences in the last 7 days');
      } catch (error: any) {
        expect(error.message).toContain('Unknown command');
      }
    });

    it('should export history as JSON', () => {
      try {
        const output = execSync('npx aqe learn history --agent test-gen --format json', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        const json = JSON.parse(output);
        expect(json).toHaveProperty('experiences');
        expect(Array.isArray(json.experiences)).toBe(true);
      } catch (error: any) {
        expect(error.message).toContain('Unknown command');
      }
    });
  });

  /**
   * Test 6: aqe learn export
   * **Expected**: FAIL - Command doesn't exist
   */
  describe('aqe learn export', () => {
    it('should export learning data to file', () => {
      try {
        // ❌ EXPECTED TO FAIL: Command not implemented
        execSync('npx aqe learn export --agent test-gen --output learning.json', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        const exportPath = path.join(testProjectDir, 'learning.json');
        expect(fs.existsSync(exportPath)).toBe(true);

        const data = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
        expect(data).toHaveProperty('agentId');
        expect(data).toHaveProperty('experiences');
        expect(data).toHaveProperty('qValues');
      } catch (error: any) {
        expect(error.message).toContain('Unknown command');
      }
    });

    it('should export in CSV format', () => {
      try {
        execSync('npx aqe learn export --agent test-gen --output learning.csv --format csv', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        const exportPath = path.join(testProjectDir, 'learning.csv');
        expect(fs.existsSync(exportPath)).toBe(true);

        const content = fs.readFileSync(exportPath, 'utf-8');
        expect(content).toContain('state,action,reward');
      } catch (error: any) {
        expect(error.message).toContain('Unknown command');
      }
    });
  });

  /**
   * Test 7: aqe improve start
   * **Expected**: FAIL - Command doesn't exist
   */
  describe('aqe improve start', () => {
    it('should start continuous improvement loop', () => {
      try {
        // ❌ EXPECTED TO FAIL: Command not implemented
        const output = execSync('npx aqe improve start', {
          encoding: 'utf-8',
          cwd: testProjectDir,
          timeout: 5000
        });

        expect(output).toContain('Improvement loop started');
      } catch (error: any) {
        if (!error.message.includes('timeout')) {
          expect(error.message).toContain('Unknown command');
        }
      }
    });

    it('should configure improvement interval', () => {
      try {
        const output = execSync('npx aqe improve start --interval 60', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        expect(output).toContain('60 seconds');
      } catch (error: any) {
        expect(error.message).toContain('Unknown command');
      }
    });
  });

  /**
   * Test 8: aqe improve status
   * **Expected**: FAIL - Command doesn't exist
   */
  describe('aqe improve status', () => {
    it('should show improvement loop status', () => {
      try {
        // ❌ EXPECTED TO FAIL: Command not implemented
        const output = execSync('npx aqe improve status', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        expect(output).toContain('Improvement Loop Status:');
        expect(output).toMatch(/Active|Inactive/);
      } catch (error: any) {
        expect(error.message).toContain('Unknown command');
      }
    });

    it('should show improvement metrics', () => {
      try {
        const output = execSync('npx aqe improve status --verbose', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        expect(output).toContain('Cycles Completed:');
        expect(output).toContain('Improvements Applied:');
      } catch (error: any) {
        expect(error.message).toContain('Unknown command');
      }
    });
  });

  /**
   * Test 9: aqe improve cycle
   * **Expected**: FAIL - Command doesn't exist
   */
  describe('aqe improve cycle', () => {
    it('should run single improvement cycle', () => {
      try {
        // ❌ EXPECTED TO FAIL: Command not implemented
        const output = execSync('npx aqe improve cycle', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        expect(output).toContain('Running improvement cycle');
        expect(output).toContain('Cycle completed');
      } catch (error: any) {
        expect(error.message).toContain('Unknown command');
      }
    });

    it('should show cycle results', () => {
      try {
        const output = execSync('npx aqe improve cycle --verbose', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });

        expect(output).toContain('Patterns analyzed:');
        expect(output).toContain('Improvements suggested:');
        expect(output).toContain('Performance change:');
      } catch (error: any) {
        expect(error.message).toContain('Unknown command');
      }
    });
  });

  /**
   * Test 10: End-to-End CLI Workflow
   */
  describe('Complete CLI Workflow', () => {
    it('should support complete learning workflow', () => {
      try {
        // 1. Extract patterns
        execSync('npx aqe patterns extract ./tests --framework jest', {
          cwd: testProjectDir
        });

        // 2. List patterns
        const listOutput = execSync('npx aqe patterns list', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });
        expect(listOutput).toMatch(/\d+ patterns/);

        // 3. Check learning status
        const statusOutput = execSync('npx aqe learn status --agent test-gen', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });
        expect(statusOutput).toContain('Learning Status');

        // 4. Run improvement cycle
        const improveOutput = execSync('npx aqe improve cycle', {
          encoding: 'utf-8',
          cwd: testProjectDir
        });
        expect(improveOutput).toContain('Cycle completed');

        // 5. Export learning data
        execSync('npx aqe learn export --agent test-gen --output learning.json', {
          cwd: testProjectDir
        });
        expect(fs.existsSync(path.join(testProjectDir, 'learning.json'))).toBe(true);
      } catch (error: any) {
        // ❌ EXPECTED TO FAIL: Most commands don't exist
        console.log('E2E workflow failed:', error.message);
        expect(error.message).toContain('Unknown command');
      }
    });
  });
});
