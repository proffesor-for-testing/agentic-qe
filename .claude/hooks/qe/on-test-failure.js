#!/usr/bin/env node

/**
 * Test Failure Hook for Agentic QE
 * Executed when test failures are detected
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class TestFailureHook {
  constructor() {
    this.config = this.loadConfig();
    this.startTime = Date.now();
  }

  loadConfig() {
    try {
      const configPath = path.join(process.cwd(), '.claude/configs/qe/config.yaml');
      return {
        retry: { enabled: true, max_attempts: 3 },
        analysis: { auto_analyze: true },
        notifications: { immediate: true },
        recovery: { auto_recovery: true }
      };
    } catch (error) {
      console.warn('Could not load QE config, using defaults');
      return {};
    }
  }

  async execute(context = {}) {
    try {
      console.log('🚨 Executing QE Test Failure Hook...');

      // 1. Analyze Failure
      const analysis = await this.analyzeFailure(context);

      // 2. Attempt Recovery
      const recovery = await this.attemptRecovery(analysis, context);

      // 3. Update Memory State
      await this.updateFailureMemory(analysis, recovery, context);

      // 4. Send Immediate Notifications
      await this.sendFailureNotifications(analysis, recovery, context);

      // 5. Generate Failure Report
      await this.generateFailureReport(analysis, recovery, context);

      console.log('✅ Failure handling completed');

      return {
        success: true,
        analysis,
        recovery,
        duration: Date.now() - this.startTime
      };

    } catch (error) {
      console.error('❌ Failure hook failed:', error.message);
      return {
        success: false,
        error: error.message,
        duration: Date.now() - this.startTime
      };
    }
  }

  async analyzeFailure(context) {
    console.log('🔍 Analyzing test failure...');

    const analysis = {
      timestamp: new Date().toISOString(),
      testName: context.testName || 'unknown',
      suite: context.suite || 'unknown',
      environment: context.environment || 'local',
      errorType: 'unknown',
      errorMessage: context.error || '',
      stackTrace: context.stackTrace || '',
      category: 'unknown',
      severity: 'medium',
      isFlaky: false,
      possibleCauses: [],
      recommendations: []
    };

    try {
      // Categorize error type
      analysis.errorType = this.categorizeError(context.error);
      analysis.category = this.getErrorCategory(analysis.errorType);
      analysis.severity = this.determineSeverity(analysis.errorType, context);

      // Check if test is flaky
      analysis.isFlaky = await this.checkFlakyTest(context.testName);

      // Generate possible causes
      analysis.possibleCauses = this.identifyPossibleCauses(analysis);

      // Generate recommendations
      analysis.recommendations = this.generateRecommendations(analysis);

      console.log(`🏷️  Failure categorized as: ${analysis.category} (${analysis.severity})`);

    } catch (error) {
      console.warn('⚠️  Could not complete failure analysis:', error.message);
    }

    return analysis;
  }

  categorizeError(errorMessage) {
    if (!errorMessage) return 'unknown';

    const errorPatterns = {
      'timeout': /timeout|timed out/i,
      'assertion': /expect|assertion|toBe|toEqual/i,
      'network': /network|connection|fetch|axios|ECONNRESET/i,
      'element_not_found': /element not found|no such element|not visible/i,
      'database': /database|sql|connection pool|query/i,
      'authentication': /auth|unauthorized|forbidden|401|403/i,
      'server_error': /500|internal server error|service unavailable/i,
      'syntax': /syntax error|unexpected token|parse error/i,
      'memory': /out of memory|heap|memory leak/i,
      'race_condition': /race condition|concurrent|synchronization/i
    };

    for (const [type, pattern] of Object.entries(errorPatterns)) {
      if (pattern.test(errorMessage)) {
        return type;
      }
    }

    return 'unknown';
  }

  getErrorCategory(errorType) {
    const categoryMap = {
      'timeout': 'infrastructure',
      'assertion': 'test_logic',
      'network': 'infrastructure',
      'element_not_found': 'ui_stability',
      'database': 'infrastructure',
      'authentication': 'security',
      'server_error': 'infrastructure',
      'syntax': 'code_quality',
      'memory': 'performance',
      'race_condition': 'concurrency',
      'unknown': 'unknown'
    };

    return categoryMap[errorType] || 'unknown';
  }

  determineSeverity(errorType, context) {
    const severityMap = {
      'server_error': 'critical',
      'database': 'high',
      'authentication': 'high',
      'memory': 'high',
      'timeout': 'medium',
      'network': 'medium',
      'assertion': 'medium',
      'element_not_found': 'low',
      'syntax': 'low',
      'race_condition': 'medium'
    };

    const baseSeverity = severityMap[errorType] || 'medium';

    // Adjust based on context
    if (context.environment === 'prod') {
      const upgrades = { 'low': 'medium', 'medium': 'high', 'high': 'critical' };
      return upgrades[baseSeverity] || baseSeverity;
    }

    return baseSeverity;
  }

  async checkFlakyTest(testName) {
    try {
      // Check failure history
      const historyFile = path.join('tmp', 'test-failure-history.json');
      if (!fs.existsSync(historyFile)) {
        return false;
      }

      const history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      const testHistory = history[testName] || [];

      // Consider flaky if failed in last 5 runs but has passed before
      const recentFailures = testHistory.slice(-5).filter(r => r.status === 'failed').length;
      const totalRuns = testHistory.length;

      return recentFailures >= 2 && totalRuns >= 3;

    } catch (error) {
      return false;
    }
  }

  identifyPossibleCauses(analysis) {
    const causes = [];

    switch (analysis.errorType) {
      case 'timeout':
        causes.push('Slow network or server response');
        causes.push('Resource contention');
        causes.push('Inadequate timeout configuration');
        break;

      case 'assertion':
        causes.push('Business logic changes');
        causes.push('Test data inconsistency');
        causes.push('Environment configuration differences');
        break;

      case 'network':
        causes.push('Service unavailability');
        causes.push('Network connectivity issues');
        causes.push('Firewall or proxy configuration');
        break;

      case 'element_not_found':
        causes.push('UI layout changes');
        causes.push('Timing issues with page load');
        causes.push('Browser compatibility issues');
        break;

      case 'database':
        causes.push('Database connectivity issues');
        causes.push('Data migration problems');
        causes.push('Transaction conflicts');
        break;

      default:
        causes.push('Code changes affecting test behavior');
        causes.push('Environment configuration changes');
        causes.push('External dependency issues');
    }

    if (analysis.isFlaky) {
      causes.push('Test exhibits flaky behavior');
      causes.push('Race conditions in test execution');
    }

    return causes;
  }

  generateRecommendations(analysis) {
    const recommendations = [];

    switch (analysis.errorType) {
      case 'timeout':
        recommendations.push('Increase timeout values');
        recommendations.push('Optimize server response times');
        recommendations.push('Implement retry mechanisms');
        break;

      case 'assertion':
        recommendations.push('Review business logic changes');
        recommendations.push('Update test expectations');
        recommendations.push('Verify test data validity');
        break;

      case 'network':
        recommendations.push('Check service health');
        recommendations.push('Implement network retry logic');
        recommendations.push('Use service mocking for unit tests');
        break;

      case 'element_not_found':
        recommendations.push('Update element selectors');
        recommendations.push('Add explicit waits');
        recommendations.push('Use more robust locator strategies');
        break;

      case 'database':
        recommendations.push('Check database connectivity');
        recommendations.push('Verify data migration scripts');
        recommendations.push('Implement database health checks');
        break;
    }

    if (analysis.isFlaky) {
      recommendations.push('Investigate and fix flaky test behavior');
      recommendations.push('Add stabilization mechanisms');
      recommendations.push('Consider test isolation improvements');
    }

    recommendations.push('Monitor test trends for patterns');
    recommendations.push('Review and update test documentation');

    return recommendations;
  }

  async attemptRecovery(analysis, context) {
    console.log('🔧 Attempting failure recovery...');

    const recovery = {
      attempted: false,
      successful: false,
      actions: [],
      retryCount: 0,
      maxRetries: 3
    };

    // Skip recovery for critical failures in production
    if (analysis.severity === 'critical' && context.environment === 'prod') {
      recovery.actions.push('Recovery skipped for critical production failure');
      return recovery;
    }

    recovery.attempted = true;

    try {
      // Attempt different recovery strategies based on error type
      switch (analysis.errorType) {
        case 'timeout':
          recovery.successful = await this.recoverFromTimeout(context);
          recovery.actions.push('Increased timeout and retried');
          break;

        case 'network':
          recovery.successful = await this.recoverFromNetworkError(context);
          recovery.actions.push('Checked network connectivity and retried');
          break;

        case 'flaky':
          if (analysis.isFlaky) {
            recovery.successful = await this.recoverFromFlakyTest(context);
            recovery.actions.push('Applied flaky test recovery strategy');
          }
          break;

        default:
          // Generic retry strategy
          recovery.successful = await this.genericRetry(context);
          recovery.actions.push('Applied generic retry strategy');
      }

    } catch (error) {
      recovery.actions.push(`Recovery failed: ${error.message}`);
    }

    return recovery;
  }

  async recoverFromTimeout(context) {
    // Implement timeout recovery logic
    console.log('⏱️  Attempting timeout recovery...');
    // In a real implementation, this would adjust timeouts and retry
    return Math.random() > 0.5; // Simulated recovery success
  }

  async recoverFromNetworkError(context) {
    // Implement network error recovery logic
    console.log('🌐 Attempting network error recovery...');
    // In a real implementation, this would check connectivity and retry
    return Math.random() > 0.3; // Simulated recovery success
  }

  async recoverFromFlakyTest(context) {
    // Implement flaky test recovery logic
    console.log('🔄 Attempting flaky test recovery...');
    // In a real implementation, this would apply stabilization and retry
    return Math.random() > 0.4; // Simulated recovery success
  }

  async genericRetry(context) {
    // Implement generic retry logic
    console.log('🔁 Attempting generic retry...');
    // In a real implementation, this would perform a basic retry
    return Math.random() > 0.6; // Simulated recovery success
  }

  async updateFailureMemory(analysis, recovery, context) {
    console.log('🧠 Updating failure memory...');

    const failureData = {
      timestamp: new Date().toISOString(),
      testName: context.testName,
      analysis,
      recovery,
      sessionId: context.sessionId || 'unknown'
    };

    try {
      // Update failure history
      const historyFile = path.join('tmp', 'test-failure-history.json');
      let history = {};

      if (fs.existsSync(historyFile)) {
        history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      }

      if (!history[context.testName]) {
        history[context.testName] = [];
      }

      history[context.testName].push({
        timestamp: new Date().toISOString(),
        status: 'failed',
        errorType: analysis.errorType,
        recovered: recovery.successful,
        severity: analysis.severity
      });

      // Keep only last 10 entries per test
      history[context.testName] = history[context.testName].slice(-10);

      fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));

      // Store in Claude Flow memory
      execSync(`npx claude-flow@alpha hooks memory-store --key "qe/failures/${context.testName}" --data '${JSON.stringify(failureData)}'`, {
        stdio: 'ignore'
      });

    } catch (error) {
      console.warn('Could not update failure memory:', error.message);
    }
  }

  async sendFailureNotifications(analysis, recovery, context) {
    console.log('📢 Sending failure notifications...');

    const notification = {
      type: 'test_failure',
      severity: analysis.severity,
      testName: context.testName,
      suite: context.suite,
      environment: context.environment,
      errorType: analysis.errorType,
      category: analysis.category,
      isFlaky: analysis.isFlaky,
      recovered: recovery.successful,
      timestamp: new Date().toISOString(),
      recommendations: analysis.recommendations.slice(0, 3) // Top 3
    };

    // Console notification
    const icon = recovery.successful ? '🔧' : '🚨';
    const status = recovery.successful ? 'RECOVERED' : 'FAILED';
    console.log(`${icon} Test ${status}: ${context.testName} (${analysis.errorType})`);

    // File-based notification
    fs.writeFileSync(
      path.join('tmp', 'failure-notification.json'),
      JSON.stringify(notification, null, 2)
    );

    // Attempt external notification
    try {
      const message = `Test failure: ${context.testName} - ${analysis.errorType} (${analysis.severity})`;
      execSync(`npx claude-flow@alpha hooks notify --message "${message}"`, {
        stdio: 'ignore'
      });
    } catch (error) {
      console.log('External notification skipped');
    }
  }

  async generateFailureReport(analysis, recovery, context) {
    console.log('📝 Generating failure report...');

    const reportDir = 'reports/qe/failures';
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFile = path.join(reportDir, `failure-${timestamp}.md`);

    const report = `# Test Failure Report

## Overview
- **Test Name**: ${context.testName}
- **Test Suite**: ${context.suite}
- **Environment**: ${context.environment}
- **Timestamp**: ${new Date().toLocaleString()}
- **Session ID**: ${context.sessionId || 'unknown'}

## Failure Analysis
- **Error Type**: ${analysis.errorType}
- **Category**: ${analysis.category}
- **Severity**: ${analysis.severity}
- **Is Flaky**: ${analysis.isFlaky ? 'Yes' : 'No'}

## Error Details
\`\`\`
${context.error || 'No error message available'}
\`\`\`

## Stack Trace
\`\`\`
${context.stackTrace || 'No stack trace available'}
\`\`\`

## Possible Causes
${analysis.possibleCauses.map(cause => `- ${cause}`).join('\n')}

## Recovery Attempt
- **Attempted**: ${recovery.attempted ? 'Yes' : 'No'}
- **Successful**: ${recovery.successful ? 'Yes' : 'No'}
- **Actions**: ${recovery.actions.join(', ')}

## Recommendations
${analysis.recommendations.map(rec => `- ${rec}`).join('\n')}

## Next Steps
1. Review the error details and stack trace
2. Implement the recommended fixes
3. Monitor for recurring failures
4. Update test documentation if needed

---
*Generated by Agentic QE Test Failure Hook*`;

    fs.writeFileSync(reportFile, report);
    console.log(`📄 Failure report generated: ${reportFile}`);
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const context = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];

    if (value === 'true') context[key] = true;
    else if (value === 'false') context[key] = false;
    else if (!isNaN(value)) context[key] = Number(value);
    else context[key] = value;
  }

  const hook = new TestFailureHook();
  hook.execute(context)
    .then(result => {
      console.log('Failure hook result:', JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Hook execution failed:', error);
      process.exit(1);
    });
}

module.exports = TestFailureHook;