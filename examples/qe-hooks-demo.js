#!/usr/bin/env node

/**
 * QE Hooks Integration Demo
 * Demonstrates how to use Claude-Flow QE hooks for automated testing workflows
 */

const { execSync } = require('child_process');
const path = require('path');

class QEHooksDemo {
  constructor() {
    this.hooksPath = path.join(__dirname, '..', '.claude', 'hooks', 'qe-runner.js');
  }

  async runDemo() {
    console.log('🎯 QE Hooks Integration Demo');
    console.log('============================\n');

    try {
      // Demo 1: Session Management
      await this.demoSessionManagement();

      // Demo 2: Pre-test Hook
      await this.demoPreTestHook();

      // Demo 3: Post-test Hook
      await this.demoPostTestHook();

      // Demo 4: Quality Gates
      await this.demoQualityGates();

      // Demo 5: Complete Workflow
      await this.demoCompleteWorkflow();

      console.log('✅ QE Hooks Demo completed successfully!\n');

    } catch (error) {
      console.error('❌ Demo failed:', error.message);
      process.exit(1);
    }
  }

  async demoSessionManagement() {
    console.log('📋 Demo 1: Session Management');
    console.log('------------------------------');

    // Create a new session
    console.log('🆕 Creating new QE session...');
    this.runHook('session-manager', {
      command: 'create',
      sessionData: JSON.stringify({
        type: 'unit',
        suite: 'demo-suite',
        environment: 'test',
        description: 'Demo session for QE hooks'
      })
    });

    // Get session status
    console.log('📊 Getting session manager status...');
    this.runHook('session-manager', {
      command: 'status'
    });

    console.log('✅ Session management demo completed\n');
  }

  async demoPreTestHook() {
    console.log('📋 Demo 2: Pre-test Hook');
    console.log('-------------------------');

    console.log('🔧 Running pre-test setup...');
    this.runHook('pre-test', {
      testType: 'unit',
      testSuite: 'demo-suite',
      environment: 'test',
      sessionId: 'demo-session-123',
      config: JSON.stringify({
        coverage: { enabled: true },
        validation: { strict: true }
      })
    });

    console.log('✅ Pre-test hook demo completed\n');
  }

  async demoPostTestHook() {
    console.log('📋 Demo 3: Post-test Hook');
    console.log('--------------------------');

    console.log('📊 Running post-test analysis...');
    this.runHook('post-test', {
      sessionId: 'demo-session-123',
      testType: 'unit',
      testResults: JSON.stringify({
        summary: {
          total: 50,
          passed: 47,
          failed: 3,
          skipped: 0,
          duration: 5000
        }
      }),
      config: JSON.stringify({
        generateReports: true,
        analyzeTriends: true
      })
    });

    console.log('✅ Post-test hook demo completed\n');
  }

  async demoQualityGates() {
    console.log('📋 Demo 4: Quality Gates');
    console.log('-------------------------');

    console.log('🚪 Running quality gates validation...');
    this.runHook('quality-gates', {
      sessionId: 'demo-session-123',
      environment: 'test',
      pipeline: 'demo-pipeline',
      config: JSON.stringify({
        enforceAll: true,
        failOnWarnings: false,
        thresholds: {
          testCoverage: {
            statements: 80,
            branches: 75
          },
          testReliability: {
            passRate: 95
          }
        }
      })
    });

    console.log('✅ Quality gates demo completed\n');
  }

  async demoCompleteWorkflow() {
    console.log('📋 Demo 5: Complete Workflow');
    console.log('-----------------------------');

    console.log('🔄 Running complete test cycle workflow...');
    this.runWorkflow('complete-test-cycle', {
      testType: 'unit',
      testSuite: 'integration-demo'
    });

    console.log('✅ Complete workflow demo completed\n');
  }

  runHook(hookName, args) {
    try {
      const argString = Object.entries(args)
        .map(([key, value]) => `--${key} "${value}"`)
        .join(' ');

      const command = `node "${this.hooksPath}" run ${hookName} ${argString}`;

      console.log(`🚀 Executing: ${hookName}`);
      console.log(`📝 Command: node qe-runner.js run ${hookName} ${argString}`);

      const output = execSync(command, {
        encoding: 'utf8',
        stdio: 'pipe',
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      console.log('📤 Output:');
      console.log(output);

    } catch (error) {
      console.log('⚠️ Hook execution completed with warnings/errors');
      console.log('📤 Output:', error.stdout || error.message);

      // Don't throw for demo purposes - just show the output
    }
  }

  runWorkflow(workflowName, args) {
    try {
      const argString = Object.entries(args)
        .map(([key, value]) => `--${key} "${value}"`)
        .join(' ');

      const command = `node "${this.hooksPath}" workflow ${workflowName} ${argString}`;

      console.log(`🔄 Executing workflow: ${workflowName}`);
      console.log(`📝 Command: node qe-runner.js workflow ${workflowName} ${argString}`);

      const output = execSync(command, {
        encoding: 'utf8',
        stdio: 'pipe',
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      console.log('📤 Output:');
      console.log(output);

    } catch (error) {
      console.log('⚠️ Workflow execution completed with warnings/errors');
      console.log('📤 Output:', error.stdout || error.message);

      // Don't throw for demo purposes - just show the output
    }
  }
}

// Run demo if called directly
if (require.main === module) {
  const demo = new QEHooksDemo();
  demo.runDemo();
}

module.exports = QEHooksDemo;