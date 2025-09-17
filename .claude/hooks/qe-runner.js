#!/usr/bin/env node

/**
 * QE Hooks Runner
 * Convenient CLI wrapper for executing QE hooks
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

class QEHooksRunner {
  constructor() {
    this.hooksDir = path.join(__dirname, 'qe');
    this.registryPath = path.join(this.hooksDir, 'index.yaml');
    this.registry = null;
  }

  async loadRegistry() {
    try {
      const registryContent = await fs.readFile(this.registryPath, 'utf8');
      this.registry = yaml.load(registryContent);
    } catch (error) {
      throw new Error(`Failed to load QE hooks registry: ${error.message}`);
    }
  }

  async execute(args) {
    try {
      await this.loadRegistry();

      const command = args[0];
      const hookName = args[1];
      const hookArgs = this.parseArguments(args.slice(2));

      switch (command) {
        case 'list':
          return this.listHooks();
        case 'info':
          return this.getHookInfo(hookName);
        case 'run':
          return this.runHook(hookName, hookArgs);
        case 'workflow':
          return this.runWorkflow(hookName, hookArgs);
        case 'status':
          return this.getStatus();
        case 'test':
          return this.testHooks();
        default:
          return this.showHelp();
      }
    } catch (error) {
      console.error('❌ QE Hooks Runner failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  parseArguments(args) {
    const parsed = {};

    for (let i = 0; i < args.length; i += 2) {
      const key = args[i]?.replace('--', '');
      const value = args[i + 1];

      if (key && value !== undefined) {
        try {
          parsed[key] = JSON.parse(value);
        } catch {
          parsed[key] = value;
        }
      }
    }

    return parsed;
  }

  async listHooks() {
    console.log('📋 Available QE Hooks:\n');

    for (const [hookId, hook] of Object.entries(this.registry.hooks)) {
      console.log(`🔧 ${hookId}`);
      console.log(`   Name: ${hook.name}`);
      console.log(`   Type: ${hook.type}`);
      console.log(`   Category: ${hook.category}`);
      console.log(`   Description: ${hook.description}`);
      console.log(`   File: ${hook.file}`);
      console.log('');
    }

    console.log('📋 Available Workflows:\n');

    for (const [workflowId, workflow] of Object.entries(this.registry.workflows)) {
      console.log(`🔄 ${workflowId}`);
      console.log(`   Name: ${workflow.name}`);
      console.log(`   Description: ${workflow.description}`);
      console.log(`   Hooks: ${workflow.hooks.length}`);
      console.log('');
    }

    return { success: true, hooks: this.registry.hooks, workflows: this.registry.workflows };
  }

  async getHookInfo(hookName) {
    if (!hookName) {
      throw new Error('Hook name is required');
    }

    const hook = this.registry.hooks[hookName];
    if (!hook) {
      throw new Error(`Hook not found: ${hookName}`);
    }

    console.log(`🔧 Hook Information: ${hookName}\n`);
    console.log(`Name: ${hook.name}`);
    console.log(`Description: ${hook.description}`);
    console.log(`Type: ${hook.type}`);
    console.log(`Category: ${hook.category}`);
    console.log(`File: ${hook.file}`);
    console.log('');

    if (hook.triggers) {
      console.log('Triggers:');
      hook.triggers.forEach(trigger => console.log(`  - ${trigger}`));
      console.log('');
    }

    if (hook.capabilities) {
      console.log('Capabilities:');
      hook.capabilities.forEach(capability => console.log(`  - ${capability}`));
      console.log('');
    }

    if (hook.parameters) {
      console.log('Parameters:');
      for (const [paramName, param] of Object.entries(hook.parameters)) {
        console.log(`  ${paramName}:`);
        console.log(`    Type: ${param.type}`);
        if (param.default) console.log(`    Default: ${param.default}`);
        if (param.description) console.log(`    Description: ${param.description}`);
        if (param.enum) console.log(`    Values: ${param.enum.join(', ')}`);
        console.log('');
      }
    }

    if (hook.dependencies && hook.dependencies.length > 0) {
      console.log('Dependencies:');
      hook.dependencies.forEach(dep => console.log(`  - ${dep}`));
      console.log('');
    }

    return { success: true, hook };
  }

  async runHook(hookName, hookArgs) {
    if (!hookName) {
      throw new Error('Hook name is required');
    }

    const hook = this.registry.hooks[hookName];
    if (!hook) {
      throw new Error(`Hook not found: ${hookName}`);
    }

    const hookPath = path.join(this.hooksDir, hook.file);

    console.log(`🚀 Running QE Hook: ${hookName}`);
    console.log(`📁 File: ${hookPath}`);
    console.log(`📋 Arguments:`, hookArgs);
    console.log('');

    return new Promise((resolve, reject) => {
      const args = [];

      for (const [key, value] of Object.entries(hookArgs)) {
        args.push(`--${key}`);
        args.push(typeof value === 'object' ? JSON.stringify(value) : String(value));
      }

      const child = spawn('node', [hookPath, ...args], {
        stdio: 'inherit',
        env: { ...process.env }
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ Hook ${hookName} completed successfully`);
          resolve({ success: true, exitCode: code });
        } else {
          console.log(`❌ Hook ${hookName} failed with exit code ${code}`);
          resolve({ success: false, exitCode: code });
        }
      });

      child.on('error', (error) => {
        console.error(`❌ Failed to spawn hook ${hookName}:`, error.message);
        reject(error);
      });
    });
  }

  async runWorkflow(workflowName, workflowArgs) {
    if (!workflowName) {
      throw new Error('Workflow name is required');
    }

    const workflow = this.registry.workflows[workflowName];
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowName}`);
    }

    console.log(`🔄 Running QE Workflow: ${workflowName}`);
    console.log(`📋 Description: ${workflow.description}`);
    console.log(`🔧 Hooks: ${workflow.hooks.length}`);
    console.log('');

    const results = [];
    const context = { ...workflowArgs };

    for (let i = 0; i < workflow.hooks.length; i++) {
      const hookConfig = workflow.hooks[i];
      const hookName = hookConfig.name;
      const stage = hookConfig.stage || `step-${i + 1}`;

      console.log(`📍 Stage: ${stage} - Hook: ${hookName}`);

      try {
        // Resolve parameters with context
        const resolvedParams = this.resolveParameters(hookConfig.parameters || {}, context);

        const result = await this.runHook(hookName, resolvedParams);

        results.push({
          hook: hookName,
          stage,
          result,
          timestamp: new Date().toISOString()
        });

        // Update context with hook results
        if (result.success && result.sessionId) {
          context.sessionId = result.sessionId;
        }

        if (!result.success) {
          console.log(`⚠️ Workflow ${workflowName} stopped due to hook failure: ${hookName}`);
          break;
        }

      } catch (error) {
        console.error(`❌ Hook ${hookName} in workflow ${workflowName} failed:`, error.message);
        results.push({
          hook: hookName,
          stage,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        break;
      }
    }

    const success = results.every(r => r.result?.success);

    console.log('');
    console.log(`${success ? '✅' : '❌'} Workflow ${workflowName} ${success ? 'completed successfully' : 'failed'}`);

    return {
      success,
      workflow: workflowName,
      results,
      timestamp: new Date().toISOString()
    };
  }

  resolveParameters(parameters, context) {
    const resolved = {};

    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string' && value.includes('{{')) {
        // Simple template resolution
        resolved[key] = value.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
          const keys = path.trim().split('.');
          let current = context;

          for (const k of keys) {
            current = current?.[k];
          }

          return current !== undefined ? current : match;
        });
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  async getStatus() {
    console.log('📊 QE Hooks Status\n');

    // Check hook files exist
    console.log('🔧 Hook Files:');
    for (const [hookId, hook] of Object.entries(this.registry.hooks)) {
      const hookPath = path.join(this.hooksDir, hook.file);
      try {
        await fs.access(hookPath);
        console.log(`  ✅ ${hookId} (${hook.file})`);
      } catch {
        console.log(`  ❌ ${hookId} (${hook.file}) - File not found`);
      }
    }

    console.log('');

    // Check Claude-Flow integration
    console.log('🌊 Claude-Flow Integration:');
    try {
      const { spawn } = require('child_process');

      const checkClaudeFlow = () => new Promise((resolve) => {
        const child = spawn('npx', ['claude-flow@alpha', '--version'], {
          stdio: 'pipe'
        });

        child.on('close', (code) => {
          resolve(code === 0);
        });

        child.on('error', () => {
          resolve(false);
        });
      });

      const claudeFlowAvailable = await checkClaudeFlow();
      console.log(`  ${claudeFlowAvailable ? '✅' : '❌'} Claude-Flow CLI`);

    } catch (error) {
      console.log('  ❌ Claude-Flow CLI - Not available');
    }

    console.log('');

    // Registry info
    console.log('📋 Registry Information:');
    console.log(`  Version: ${this.registry.meta.version}`);
    console.log(`  Hooks: ${Object.keys(this.registry.hooks).length}`);
    console.log(`  Workflows: ${Object.keys(this.registry.workflows).length}`);
    console.log(`  Templates: ${Object.keys(this.registry.templates).length}`);

    return {
      success: true,
      registry: this.registry.meta,
      hooksCount: Object.keys(this.registry.hooks).length,
      workflowsCount: Object.keys(this.registry.workflows).length
    };
  }

  async testHooks() {
    console.log('🧪 Testing QE Hooks\n');

    const testResults = [];

    // Test each hook with minimal parameters
    for (const [hookId, hook] of Object.entries(this.registry.hooks)) {
      console.log(`🧪 Testing hook: ${hookId}`);

      try {
        const testParams = this.generateTestParameters(hook);
        const result = await this.runHook(hookId, testParams);

        testResults.push({
          hook: hookId,
          success: result.success,
          exitCode: result.exitCode
        });

      } catch (error) {
        console.error(`❌ Test failed for hook ${hookId}:`, error.message);
        testResults.push({
          hook: hookId,
          success: false,
          error: error.message
        });
      }

      console.log('');
    }

    const successCount = testResults.filter(r => r.success).length;
    const totalCount = testResults.length;

    console.log(`📊 Test Results: ${successCount}/${totalCount} hooks passed`);

    return {
      success: successCount === totalCount,
      results: testResults,
      summary: {
        total: totalCount,
        passed: successCount,
        failed: totalCount - successCount
      }
    };
  }

  generateTestParameters(hook) {
    const params = {};

    if (hook.parameters) {
      for (const [paramName, param] of Object.entries(hook.parameters)) {
        if (param.default !== undefined) {
          params[paramName] = param.default;
        } else {
          // Generate sensible test values
          switch (param.type) {
            case 'string':
              params[paramName] = param.enum ? param.enum[0] : 'test-value';
              break;
            case 'number':
              params[paramName] = 42;
              break;
            case 'boolean':
              params[paramName] = true;
              break;
            case 'object':
              params[paramName] = {};
              break;
          }
        }
      }
    }

    return params;
  }

  showHelp() {
    console.log(`
🔧 QE Hooks Runner - Claude-Flow Integration

Usage:
  node qe-runner.js <command> [arguments]

Commands:
  list                     List all available hooks and workflows
  info <hook-name>         Show detailed information about a hook
  run <hook-name> [args]   Run a specific hook with arguments
  workflow <workflow-name> Run a complete workflow
  status                   Check QE hooks system status
  test                     Test all hooks with sample data

Examples:
  # List all hooks
  node qe-runner.js list

  # Get hook information
  node qe-runner.js info pre-test

  # Run a hook
  node qe-runner.js run pre-test --testType unit --testSuite core

  # Run a workflow
  node qe-runner.js workflow complete-test-cycle --testType integration

  # Check status
  node qe-runner.js status

  # Test all hooks
  node qe-runner.js test

Hook Arguments:
  All hook arguments should be passed as --key value pairs.
  Objects should be passed as JSON strings.

  Example:
  --testType unit --config '{"coverage": true}'

Available Hooks:
  pre-test        - Test environment setup and validation
  post-test       - Test result analysis and reporting
  quality-gates   - Quality standards enforcement
  session-manager - Session management and coordination

Available Workflows:
  complete-test-cycle - Full test execution with quality gates
  tdd-workflow        - Test-driven development workflow
  ci-cd-integration   - CI/CD pipeline integration

For more information, visit: https://github.com/ruvnet/claude-flow
`);

    return { success: true, help: true };
  }
}

// CLI execution
if (require.main === module) {
  const runner = new QEHooksRunner();
  const args = process.argv.slice(2);

  if (args.length === 0) {
    runner.showHelp();
    process.exit(0);
  }

  runner.execute(args)
    .then(result => {
      if (!result.success && !result.help) {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ QE Hooks Runner failed:', error);
      process.exit(1);
    });
}

module.exports = QEHooksRunner;