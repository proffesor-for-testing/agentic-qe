/**
 * Test runner script for comprehensive testing
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface TestSuite {
  name: string;
  pattern: string;
  timeout?: number;
  coverage?: boolean;
  description: string;
}

interface TestResults {
  suite: string;
  passed: boolean;
  duration: number;
  coverage?: number;
  error?: string;
}

class TestRunner {
  private suites: TestSuite[] = [
    {
      name: 'Unit Tests',
      pattern: 'tests/unit/**/*.test.ts',
      timeout: 30000,
      coverage: true,
      description: 'Core unit tests for individual components'
    },
    {
      name: 'Integration Tests',
      pattern: 'tests/integration/**/*.test.ts',
      timeout: 60000,
      coverage: true,
      description: 'Integration tests for agent collaboration'
    },
    {
      name: 'Performance Tests',
      pattern: 'tests/performance/**/*.test.ts',
      timeout: 120000,
      coverage: false,
      description: 'Performance and stress tests'
    }
  ];

  private results: TestResults[] = [];

  async runAllSuites(): Promise<void> {
    console.log('🚀 Starting Comprehensive Test Suite');
    console.log('=====================================\n');

    const startTime = Date.now();

    for (const suite of this.suites) {
      await this.runSuite(suite);
    }

    const totalTime = Date.now() - startTime;
    this.printSummary(totalTime);
  }

  private async runSuite(suite: TestSuite): Promise<void> {
    console.log(`📋 Running ${suite.name}`);
    console.log(`   ${suite.description}`);
    console.log(`   Pattern: ${suite.pattern}`);

    const startTime = Date.now();

    try {
      const jestArgs = [
        `--testPathPattern="${suite.pattern}"`,
        `--testTimeout=${suite.timeout || 30000}`,
        '--verbose',
        '--detectOpenHandles',
        '--forceExit'
      ];

      if (suite.coverage) {
        jestArgs.push('--coverage');
        jestArgs.push('--coverageDirectory=coverage');
      }

      const command = `npx jest ${jestArgs.join(' ')}`;

      console.log(`   Command: ${command}\n`);

      const output = execSync(command, {
        encoding: 'utf8',
        stdio: 'pipe'
      });

      const duration = Date.now() - startTime;
      const coverage = suite.coverage ? this.extractCoverage(output) : undefined;

      this.results.push({
        suite: suite.name,
        passed: true,
        duration,
        coverage
      });

      console.log(`✅ ${suite.name} completed successfully in ${duration}ms`);
      if (coverage) {
        console.log(`   Coverage: ${coverage.toFixed(1)}%`);
      }
      console.log();

    } catch (error: any) {
      const duration = Date.now() - startTime;

      this.results.push({
        suite: suite.name,
        passed: false,
        duration,
        error: error.message
      });

      console.error(`❌ ${suite.name} failed in ${duration}ms`);
      console.error(`   Error: ${error.message}`);
      console.log();
    }
  }

  private extractCoverage(output: string): number {
    // Extract coverage percentage from Jest output
    const coverageMatch = output.match(/All files\s+\|\s+([0-9.]+)/);
    return coverageMatch ? parseFloat(coverageMatch[1]) : 0;
  }

  private printSummary(totalTime: number): void {
    console.log('📊 Test Summary');
    console.log('===============\n');

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;

    console.log(`Total Suites: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total Time: ${(totalTime / 1000).toFixed(2)}s\n`);

    // Detailed results
    this.results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      const duration = (result.duration / 1000).toFixed(2);

      console.log(`${status} ${result.suite}: ${duration}s`);

      if (result.coverage) {
        console.log(`   Coverage: ${result.coverage.toFixed(1)}%`);
      }

      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    // Overall coverage
    const coverageResults = this.results.filter(r => r.coverage !== undefined);
    if (coverageResults.length > 0) {
      const avgCoverage = coverageResults.reduce((sum, r) => sum + (r.coverage || 0), 0) / coverageResults.length;
      console.log(`\nOverall Coverage: ${avgCoverage.toFixed(1)}%`);
    }

    // Exit code
    const exitCode = failed > 0 ? 1 : 0;
    console.log(`\nExit Code: ${exitCode}`);

    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  }

  async runSpecificSuite(suiteName: string): Promise<void> {
    const suite = this.suites.find(s => s.name.toLowerCase() === suiteName.toLowerCase());

    if (!suite) {
      console.error(`❌ Suite "${suiteName}" not found`);
      console.log('Available suites:');
      this.suites.forEach(s => console.log(`  - ${s.name}`));
      process.exit(1);
    }

    console.log(`🚀 Running ${suite.name} only\n`);
    await this.runSuite(suite);
    this.printSummary(this.results[0]?.duration || 0);
  }

  listSuites(): void {
    console.log('📋 Available Test Suites');
    console.log('========================\n');

    this.suites.forEach((suite, index) => {
      console.log(`${index + 1}. ${suite.name}`);
      console.log(`   Description: ${suite.description}`);
      console.log(`   Pattern: ${suite.pattern}`);
      console.log(`   Timeout: ${suite.timeout || 30000}ms`);
      console.log(`   Coverage: ${suite.coverage ? 'Yes' : 'No'}`);
      console.log();
    });
  }

  async checkTestEnvironment(): Promise<boolean> {
    console.log('🔍 Checking Test Environment');
    console.log('============================\n');

    const checks = [
      {
        name: 'Jest Installation',
        check: () => {
          try {
            execSync('npx jest --version', { stdio: 'pipe' });
            return true;
          } catch {
            return false;
          }
        }
      },
      {
        name: 'TypeScript Compilation',
        check: () => {
          try {
            execSync('npx tsc --noEmit', { stdio: 'pipe' });
            return true;
          } catch {
            return false;
          }
        }
      },
      {
        name: 'Test Files Exist',
        check: () => {
          return fs.existsSync(path.join(process.cwd(), 'tests'));
        }
      },
      {
        name: 'Jest Config',
        check: () => {
          return fs.existsSync(path.join(process.cwd(), 'jest.config.js'));
        }
      }
    ];

    let allPassed = true;

    for (const check of checks) {
      const passed = check.check();
      const status = passed ? '✅' : '❌';
      console.log(`${status} ${check.name}`);

      if (!passed) {
        allPassed = false;
      }
    }

    console.log(`\nEnvironment Ready: ${allPassed ? 'Yes' : 'No'}\n`);
    return allPassed;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const testRunner = new TestRunner();

  switch (command) {
    case 'all':
    case undefined:
      if (await testRunner.checkTestEnvironment()) {
        await testRunner.runAllSuites();
      } else {
        console.error('❌ Test environment not ready');
        process.exit(1);
      }
      break;

    case 'suite':
      const suiteName = args[1];
      if (!suiteName) {
        console.error('❌ Please specify a suite name');
        testRunner.listSuites();
        process.exit(1);
      }
      await testRunner.runSpecificSuite(suiteName);
      break;

    case 'list':
      testRunner.listSuites();
      break;

    case 'check':
      await testRunner.checkTestEnvironment();
      break;

    case 'help':
    default:
      console.log('🧪 Test Runner Help');
      console.log('===================\n');
      console.log('Usage: npm run test:runner [command] [options]\n');
      console.log('Commands:');
      console.log('  all, (default)     Run all test suites');
      console.log('  suite <name>       Run specific test suite');
      console.log('  list               List available test suites');
      console.log('  check              Check test environment');
      console.log('  help               Show this help message\n');
      console.log('Examples:');
      console.log('  npm run test:runner');
      console.log('  npm run test:runner suite "Unit Tests"');
      console.log('  npm run test:runner list');
      console.log('  npm run test:runner check');
      break;
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });
}

export { TestRunner };