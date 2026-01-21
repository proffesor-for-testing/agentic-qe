/**
 * Integration Test Suite Runner
 * Orchestrates all integration tests and provides comprehensive reporting
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class IntegrationTestSuite {
  constructor() {
    this.suites = [
      {
        name: 'Agent Coordination',
        file: 'agent-coordination.test.js',
        tests: [
          'Test Generator and Executor coordination',
          'Coverage Analyzer and Quality Gate coordination',
          'Performance and Security agent coordination',
          'Sequential task handoff with state persistence',
          'Error handling in task handoff chain'
        ]
      },
      {
        name: 'Memory Persistence',
        file: 'memory-persistence.test.js',
        tests: [
          'Store and retrieve test execution state',
          'Agent coordination through shared memory',
          'Memory namespace isolation',
          'Session state preservation across restarts',
          'Memory-based agent recovery after failure',
          'High-volume memory operations',
          'Memory cleanup and garbage collection'
        ]
      },
      {
        name: 'Error Recovery',
        file: 'error-recovery.test.js',
        tests: [
          'Test generator agent failure and recovery',
          'Coverage analyzer timeout and fallback',
          'Quality gate circuit breaker pattern',
          'Memory corruption recovery',
          'Hook execution failure recovery',
          'Cascade failure isolation',
          'Test results recovery after partial execution',
          'Artifact recovery and validation'
        ]
      },
      {
        name: 'Concurrent Operations',
        file: 'concurrent-operations.test.js',
        tests: [
          'Concurrent test generation by multiple agents',
          'Parallel coverage analysis with resource sharing',
          'Concurrent quality gate validation',
          'Memory access synchronization',
          'File system contention handling',
          'Resource pool contention',
          'High concurrency agent spawning',
          'Memory stress test under concurrent load'
        ]
      },
      {
        name: 'Hook Integration',
        file: 'hook-integration.test.js',
        tests: [
          'Pre-task hook execution and validation',
          'Post-task hook with metrics and coordination',
          'Post-edit hook with file coordination',
          'Session management hooks',
          'Notification hook for agent coordination',
          'Hook-based workflow orchestration',
          'Error propagation through hooks',
          'Hook execution performance under load',
          'Hook reliability and retry mechanisms',
          'Hook integration with memory persistence'
        ]
      }
    ];

    this.results = {
      totalSuites: this.suites.length,
      totalTests: this.suites.reduce((sum, suite) => sum + suite.tests.length, 0),
      passedSuites: 0,
      failedSuites: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      executionTime: 0,
      timestamp: new Date().toISOString(),
      details: []
    };
  }

  async runAllSuites() {
    console.log('🚀 Starting AQE Integration Test Suite');
    console.log(`📊 Running ${this.results.totalTests} tests across ${this.results.totalSuites} suites\n`);

    const startTime = Date.now();

    for (const suite of this.suites) {
      await this.runSuite(suite);
    }

    this.results.executionTime = Date.now() - startTime;

    await this.generateReport();
    await this.storeResults();

    return this.results;
  }

  async runSuite(suite) {
    console.log(`📁 Running suite: ${suite.name}`);

    const suiteStartTime = Date.now();
    const suiteResult = {
      name: suite.name,
      file: suite.file,
      totalTests: suite.tests.length,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      executionTime: 0,
      tests: [],
      status: 'completed'
    };

    try {
      // Run Jest for the specific test file
      const testFilePath = path.join(__dirname, suite.file);
      const jestCommand = `npx jest "${testFilePath}" --verbose --json`;

      const jestOutput = execSync(jestCommand, {
        encoding: 'utf8',
        stdio: 'pipe'
      });

      const jestResults = JSON.parse(jestOutput);

      // Process Jest results
      if (jestResults.testResults && jestResults.testResults.length > 0) {
        const testFileResult = jestResults.testResults[0];

        testFileResult.assertionResults.forEach(test => {
          const testResult = {
            name: test.title,
            status: test.status, // 'passed', 'failed', 'skipped'
            duration: test.duration || 0,
            error: test.failureMessages.length > 0 ? test.failureMessages[0] : null
          };

          suiteResult.tests.push(testResult);

          switch (test.status) {
            case 'passed':
              suiteResult.passedTests++;
              this.results.passedTests++;
              break;
            case 'failed':
              suiteResult.failedTests++;
              this.results.failedTests++;
              break;
            case 'skipped':
            case 'pending':
              suiteResult.skippedTests++;
              this.results.skippedTests++;
              break;
          }
        });
      }

      if (suiteResult.failedTests === 0) {
        this.results.passedSuites++;
        console.log(`✅ ${suite.name}: ${suiteResult.passedTests}/${suiteResult.totalTests} tests passed`);
      } else {
        this.results.failedSuites++;
        console.log(`❌ ${suite.name}: ${suiteResult.failedTests}/${suiteResult.totalTests} tests failed`);
      }

    } catch (error) {
      suiteResult.status = 'error';
      suiteResult.error = error.message;
      this.results.failedSuites++;

      console.log(`💥 ${suite.name}: Suite execution failed - ${error.message}`);

      // Create placeholder test results for expected tests
      suite.tests.forEach(testName => {
        suiteResult.tests.push({
          name: testName,
          status: 'failed',
          duration: 0,
          error: 'Suite execution failed'
        });
        this.results.failedTests++;
      });
    }

    suiteResult.executionTime = Date.now() - suiteStartTime;
    this.results.details.push(suiteResult);

    console.log(`⏱️  Suite completed in ${suiteResult.executionTime}ms\n`);
  }

  async generateReport() {
    const reportPath = path.join(__dirname, '../../docs/integration-test-report.md');

    const report = `# AQE Integration Test Report

## Test Summary

- **Total Suites**: ${this.results.totalSuites}
- **Total Tests**: ${this.results.totalTests}
- **Passed Suites**: ${this.results.passedSuites}
- **Failed Suites**: ${this.results.failedSuites}
- **Passed Tests**: ${this.results.passedTests}
- **Failed Tests**: ${this.results.failedTests}
- **Skipped Tests**: ${this.results.skippedTests}
- **Success Rate**: ${((this.results.passedTests / this.results.totalTests) * 100).toFixed(2)}%
- **Execution Time**: ${this.results.executionTime}ms
- **Timestamp**: ${this.results.timestamp}

## Suite Details

${this.results.details.map(suite => this.generateSuiteReport(suite)).join('\n\n')}

## Test Categories Covered

### 1. Agent Coordination (Tests 1-5)
Tests multi-agent communication, task distribution, and coordination protocols.

### 2. Memory Persistence (Tests 6-12)
Tests Claude Flow memory operations, cross-session persistence, and state management.

### 3. Error Recovery (Tests 13-20)
Tests fault tolerance, graceful degradation, and automatic recovery systems.

### 4. Concurrent Operations (Tests 21-28)
Tests parallel agent execution, race condition handling, and resource contention.

### 5. Hook Integration (Tests 29-38)
Tests Claude Flow hooks, lifecycle management, and event-driven coordination.

## Recommendations

${this.generateRecommendations()}

---
*Report generated by AQE Integration Test Suite*
`;

    await fs.writeFile(reportPath, report);
    console.log(`📄 Report saved to: ${reportPath}`);
  }

  generateSuiteReport(suite) {
    const statusIcon = suite.status === 'completed' && suite.failedTests === 0 ? '✅' : '❌';

    return `### ${statusIcon} ${suite.name}

- **File**: ${suite.file}
- **Tests**: ${suite.passedTests}/${suite.totalTests} passed
- **Duration**: ${suite.executionTime}ms
- **Status**: ${suite.status}

${suite.tests.map(test => {
  const testStatusIcon = test.status === 'passed' ? '✅' : test.status === 'failed' ? '❌' : '⏭️';
  return `${testStatusIcon} ${test.name} (${test.duration}ms)`;
}).join('\n')}

${suite.failedTests > 0 ? `
**Failed Tests:**
${suite.tests.filter(test => test.status === 'failed').map(test => `- ${test.name}: ${test.error}`).join('\n')}
` : ''}`;
  }

  generateRecommendations() {
    const recommendations = [];

    if (this.results.failedTests > 0) {
      recommendations.push('- Review and fix failed tests to ensure system reliability');
    }

    if (this.results.passedTests / this.results.totalTests < 0.9) {
      recommendations.push('- Improve test success rate to above 90%');
    }

    if (this.results.executionTime > 300000) { // 5 minutes
      recommendations.push('- Optimize test execution time for faster feedback');
    }

    if (this.results.skippedTests > 5) {
      recommendations.push('- Investigate and resolve skipped tests');
    }

    if (recommendations.length === 0) {
      recommendations.push('- All integration tests are performing well! 🎉');
      recommendations.push('- Consider adding more edge case scenarios');
      recommendations.push('- Monitor performance metrics over time');
    }

    return recommendations.join('\n');
  }

  async storeResults() {
    try {
      // Store results in Claude Flow memory for hive mind coordination
      const memoryCommand = `npx claude-flow@alpha memory store "integration-test-results" '${JSON.stringify(this.results)}' --namespace "aqe-fix"`;
      execSync(memoryCommand);

      // Store individual suite results
      for (const suite of this.results.details) {
        const suiteMemoryCommand = `npx claude-flow@alpha memory store "suite-${suite.name.toLowerCase().replace(/\s+/g, '-')}" '${JSON.stringify(suite)}' --namespace "aqe-fix"`;
        execSync(suiteMemoryCommand);
      }

      console.log('💾 Results stored in Claude Flow memory');

      // Store completion notification
      const completionCommand = `npx claude-flow@alpha hooks notify --message "Integration test suite completed: ${this.results.passedTests}/${this.results.totalTests} tests passed"`;
      execSync(completionCommand);

    } catch (error) {
      console.log('⚠️  Failed to store results in memory:', error.message);
    }
  }

  async runIndividualTest(testNumber) {
    // Map test numbers to suites and specific tests
    const testMap = this.createTestMap();

    if (testNumber < 1 || testNumber > 38) {
      throw new Error(`Invalid test number. Must be between 1 and 38.`);
    }

    const testInfo = testMap[testNumber];
    console.log(`🎯 Running Test ${testNumber}: ${testInfo.description}`);

    const suite = this.suites.find(s => s.name === testInfo.suite);
    await this.runSuite(suite);

    return this.results.details[this.results.details.length - 1];
  }

  createTestMap() {
    const testMap = {};
    let testNumber = 1;

    this.suites.forEach(suite => {
      suite.tests.forEach(testName => {
        testMap[testNumber] = {
          suite: suite.name,
          description: testName,
          file: suite.file
        };
        testNumber++;
      });
    });

    return testMap;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const runner = new IntegrationTestSuite();

  if (args[0] === 'run') {
    if (args[1] && !isNaN(args[1])) {
      // Run specific test
      const testNumber = parseInt(args[1]);
      runner.runIndividualTest(testNumber)
        .then(result => {
          console.log(`Test ${testNumber} completed:`, result);
          process.exit(result.failedTests > 0 ? 1 : 0);
        })
        .catch(error => {
          console.error('Test execution failed:', error);
          process.exit(1);
        });
    } else {
      // Run all tests
      runner.runAllSuites()
        .then(results => {
          console.log('\n🏁 Integration Test Suite Completed');
          console.log(`✅ ${results.passedTests}/${results.totalTests} tests passed`);
          console.log(`⏱️  Total time: ${results.executionTime}ms`);

          process.exit(results.failedTests > 0 ? 1 : 0);
        })
        .catch(error => {
          console.error('Test suite execution failed:', error);
          process.exit(1);
        });
    }
  } else {
    console.log('Usage:');
    console.log('  node integration-test-suite.js run          # Run all tests');
    console.log('  node integration-test-suite.js run <number> # Run specific test');
  }
}

module.exports = IntegrationTestSuite;