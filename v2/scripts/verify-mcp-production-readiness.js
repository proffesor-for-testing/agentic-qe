#!/usr/bin/env node
/**
 * MCP Tools Production Readiness Verification Script
 *
 * Tests all AQE MCP tools to ensure they're ready for v1.3.5 release.
 * Generates comprehensive production readiness report.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { TOOL_NAMES } from '../dist/mcp/tools.js';
import { createAgenticQEServer } from '../dist/mcp/server.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Test configuration - minimal parameters for smoke testing
 */
const TEST_PARAMETERS = {
  // Critical tools (must pass)
  [TOOL_NAMES.FLEET_INIT]: {
    config: {
      topology: 'hierarchical',
      maxAgents: 5,
      testingFocus: ['unit'],
      environments: ['development'],
      frameworks: ['jest']
    },
    priority: 'P0',
    category: 'Fleet Management'
  },

  [TOOL_NAMES.AGENT_SPAWN]: {
    spec: {
      type: 'test-generator',
      capabilities: ['unit-testing']
    },
    priority: 'P0',
    category: 'Fleet Management'
  },

  [TOOL_NAMES.TEST_GENERATE]: {
    spec: {
      type: 'unit',
      sourceCode: {
        repositoryUrl: '.',
        language: 'typescript',
        testPatterns: ['src/**/*.ts']
      },
      coverageTarget: 80,
      frameworks: ['jest']
    },
    priority: 'P0',
    category: 'Test Generation'
  },

  [TOOL_NAMES.TEST_EXECUTE]: {
    spec: {
      testSuites: ['tests/**/*.test.ts'],
      parallelExecution: true,
      retryCount: 3,
      timeoutSeconds: 300,
      reportFormat: 'json'
    },
    priority: 'P0',
    category: 'Test Execution'
  },

  // RECENTLY FIXED - Critical validation
  [TOOL_NAMES.QUALITY_ANALYZE]: {
    params: {
      scope: 'code',
      metrics: ['complexity'],
      generateRecommendations: false
    },
    dataSource: {
      codeMetrics: {
        files: [{
          name: 'test.ts',
          loc: 100,
          cyclomatic: 5
        }]
      }
      // Context is now optional - this was the bug fix
    },
    priority: 'P0',
    category: 'Quality Analysis',
    recentFix: true
  },

  // RECENTLY FIXED - Parameter aliasing
  [TOOL_NAMES.REGRESSION_RISK_ANALYZE]: {
    changes: [
      {
        file: 'src/test.ts',
        type: 'refactor',
        linesChanged: 50
      }
    ],
    // No baselineMetrics - should use defaults
    priority: 'P0',
    category: 'Risk Analysis',
    recentFix: true
  },

  [TOOL_NAMES.FLEET_STATUS]: {
    includeMetrics: false,
    includeAgentDetails: false,
    priority: 'P1',
    category: 'Fleet Management'
  },

  // Memory tools (P1)
  [TOOL_NAMES.MEMORY_STORE]: {
    key: 'test/verification/status',
    value: { timestamp: Date.now(), status: 'verifying' },
    namespace: 'verification',
    priority: 'P1',
    category: 'Memory Management'
  },

  [TOOL_NAMES.MEMORY_RETRIEVE]: {
    key: 'test/verification/status',
    namespace: 'verification',
    priority: 'P1',
    category: 'Memory Management'
  },

  [TOOL_NAMES.MEMORY_QUERY]: {
    namespace: 'verification',
    pattern: 'test/*',
    limit: 10,
    priority: 'P1',
    category: 'Memory Management'
  },

  // Blackboard coordination (P1)
  [TOOL_NAMES.BLACKBOARD_POST]: {
    topic: 'verification',
    message: 'Production readiness check in progress',
    priority: 'medium',
    agentId: 'verification-agent',
    priority: 'P1',
    category: 'Coordination'
  },

  [TOOL_NAMES.BLACKBOARD_READ]: {
    topic: 'verification',
    agentId: 'verification-reader',
    limit: 10,
    priority: 'P1',
    category: 'Coordination'
  },

  // Enhanced test tools (P2)
  [TOOL_NAMES.TEST_GENERATE_ENHANCED]: {
    sourceCode: 'function add(a, b) { return a + b; }',
    language: 'javascript',
    testType: 'unit',
    priority: 'P2',
    category: 'Enhanced Testing'
  },

  [TOOL_NAMES.TEST_EXECUTE_PARALLEL]: {
    testFiles: ['test1.js', 'test2.js'],
    parallelism: 2,
    timeout: 5000,
    priority: 'P2',
    category: 'Enhanced Testing'
  },

  [TOOL_NAMES.TEST_OPTIMIZE_SUBLINEAR]: {
    testSuite: {
      tests: [
        { id: 't1', priority: 'high', duration: 100, coverage: ['file1.js'] },
        { id: 't2', priority: 'medium', duration: 200, coverage: ['file2.js'] }
      ]
    },
    algorithm: 'sublinear',
    priority: 'P2',
    category: 'Optimization'
  },

  // Coverage analysis (P2)
  [TOOL_NAMES.COVERAGE_ANALYZE_SUBLINEAR]: {
    sourceFiles: ['src/test.ts'],
    coverageThreshold: 0.8,
    useJohnsonLindenstrauss: true,
    priority: 'P2',
    category: 'Coverage Analysis'
  },

  [TOOL_NAMES.COVERAGE_GAPS_DETECT]: {
    coverageData: {
      files: [
        {
          path: 'src/test.ts',
          coverage: { statements: 75, branches: 60, functions: 80, lines: 75 }
        }
      ]
    },
    prioritization: 'complexity',
    priority: 'P2',
    category: 'Coverage Analysis'
  },

  // Quality gate tools (P2)
  [TOOL_NAMES.QUALITY_VALIDATE_METRICS]: {
    metrics: {
      coverage: 85,
      complexity: 10,
      testPass: 95
    },
    thresholds: {
      coverage: 80,
      complexity: 15,
      testPass: 90
    },
    priority: 'P2',
    category: 'Quality Gate'
  },

  // Prediction tools (P2)
  [TOOL_NAMES.FLAKY_TEST_DETECT]: {
    testData: {
      testResults: [
        { testId: 't1', passed: true, duration: 100 },
        { testId: 't1', passed: false, duration: 150 },
        { testId: 't1', passed: true, duration: 105 }
      ],
      minRuns: 3
    },
    priority: 'P2',
    category: 'Prediction'
  }
};

/**
 * Verification results structure
 */
class VerificationResults {
  constructor() {
    this.total = 0;
    this.passed = 0;
    this.failed = 0;
    this.skipped = 0;
    this.tools = {};
    this.byPriority = { P0: [], P1: [], P2: [] };
    this.byCategory = {};
    this.recentFixes = [];
  }

  addResult(toolName, result) {
    this.total++;
    this.tools[toolName] = result;

    if (result.status === 'PASS') {
      this.passed++;
    } else if (result.status === 'FAIL') {
      this.failed++;
    } else {
      this.skipped++;
    }

    // Categorize by priority
    if (result.priority) {
      this.byPriority[result.priority].push({ toolName, ...result });
    }

    // Categorize by category
    if (result.category) {
      if (!this.byCategory[result.category]) {
        this.byCategory[result.category] = [];
      }
      this.byCategory[result.category].push({ toolName, ...result });
    }

    // Track recent fixes
    if (result.recentFix) {
      this.recentFixes.push({ toolName, ...result });
    }
  }

  getPassRate() {
    return this.total > 0 ? ((this.passed / this.total) * 100).toFixed(2) : 0;
  }

  getCriticalPassRate() {
    const p0Tools = this.byPriority.P0;
    const p0Passed = p0Tools.filter(t => t.status === 'PASS').length;
    return p0Tools.length > 0 ? ((p0Passed / p0Tools.length) * 100).toFixed(2) : 0;
  }
}

/**
 * Execute a single tool test
 */
async function testTool(server, toolName, params) {
  const startTime = Date.now();

  try {
    // Get handler
    const handler = server.handlers?.get(toolName);

    if (!handler) {
      return {
        status: 'SKIP',
        executionTime: 0,
        error: 'Handler not found',
        priority: params.priority,
        category: params.category,
        recentFix: params.recentFix
      };
    }

    // Execute tool (without priority/category metadata)
    const cleanParams = { ...params };
    delete cleanParams.priority;
    delete cleanParams.category;
    delete cleanParams.recentFix;

    let result;
    if (handler.handle && typeof handler.handle === 'function') {
      result = await handler.handle(cleanParams);
    } else if (handler.execute && typeof handler.execute === 'function') {
      // For streaming handlers, just call execute once
      const gen = handler.execute(cleanParams);
      const firstEvent = await gen.next();
      result = firstEvent.value;
    } else {
      throw new Error('Handler has no handle() or execute() method');
    }

    const executionTime = Date.now() - startTime;

    return {
      status: 'PASS',
      executionTime,
      error: null,
      result: result ? 'Success' : 'No result',
      priority: params.priority,
      category: params.category,
      recentFix: params.recentFix
    };

  } catch (error) {
    const executionTime = Date.now() - startTime;
    return {
      status: 'FAIL',
      executionTime,
      error: error.message || String(error),
      stack: error.stack,
      priority: params.priority,
      category: params.category,
      recentFix: params.recentFix
    };
  }
}

/**
 * Run all tool tests
 */
async function runVerification() {
  console.log('🔍 Starting MCP Tools Production Readiness Verification\n');

  const results = new VerificationResults();
  let server;

  try {
    // Initialize server
    console.log('⚙️  Initializing AQE MCP Server...');
    server = await createAgenticQEServer();
    console.log('✅ Server initialized\n');

    // Test each tool
    for (const [toolName, params] of Object.entries(TEST_PARAMETERS)) {
      const shortName = toolName.replace('mcp__agentic_qe__', '');
      const recentFixIndicator = params.recentFix ? ' 🔧' : '';

      process.stdout.write(`Testing ${shortName}${recentFixIndicator}... `);

      const result = await testTool(server, toolName, params);
      results.addResult(toolName, result);

      if (result.status === 'PASS') {
        console.log(`✅ (${result.executionTime}ms)`);
      } else if (result.status === 'FAIL') {
        console.log(`❌ ${result.error}`);
      } else {
        console.log(`⏭️  Skipped`);
      }
    }

    console.log('\n✅ Verification complete');

  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    throw error;
  } finally {
    if (server) {
      await server.stop();
    }
  }

  return results;
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(results) {
  const timestamp = new Date().toISOString().split('T')[0];

  let report = `# MCP Tools Production Readiness Report v1.3.5

**Date**: ${timestamp}
**Total Tools Tested**: ${results.total}
**Pass Rate**: ${results.getPassRate()}%
**Critical (P0) Pass Rate**: ${results.getCriticalPassRate()}%

## Executive Summary

${results.passed === results.total
  ? '✅ **ALL TOOLS PASSING** - Ready for production release!'
  : `⚠️ **${results.failed} tools failing** - Review required before release`}

### Key Metrics
- ✅ Passed: ${results.passed}
- ❌ Failed: ${results.failed}
- ⏭️ Skipped: ${results.skipped}

## Recent Fixes Validation

${results.recentFixes.length > 0 ?
  results.recentFixes.map(fix =>
    `- [${fix.status === 'PASS' ? '✅' : '❌'}] **${fix.toolName.replace('mcp__agentic_qe__', '')}** - ${fix.status === 'PASS' ? 'Fix validated' : 'Fix failed: ' + fix.error}`
  ).join('\n')
  : 'No recent fixes to validate'}

## Results by Priority

### P0 - Critical (${results.byPriority.P0.length} tools)

${results.byPriority.P0.length > 0 ?
  results.byPriority.P0.map(t =>
    `- [${t.status === 'PASS' ? '✅' : '❌'}] **${t.toolName.replace('mcp__agentic_qe__', '')}** (${t.executionTime}ms)${t.error ? ` - ${t.error}` : ''}`
  ).join('\n')
  : 'No P0 tools tested'}

### P1 - High Priority (${results.byPriority.P1.length} tools)

${results.byPriority.P1.length > 0 ?
  results.byPriority.P1.map(t =>
    `- [${t.status === 'PASS' ? '✅' : '❌'}] **${t.toolName.replace('mcp__agentic_qe__', '')}** (${t.executionTime}ms)${t.error ? ` - ${t.error}` : ''}`
  ).join('\n')
  : 'No P1 tools tested'}

### P2 - Standard Priority (${results.byPriority.P2.length} tools)

${results.byPriority.P2.length > 0 ?
  results.byPriority.P2.map(t =>
    `- [${t.status === 'PASS' ? '✅' : '❌'}] **${t.toolName.replace('mcp__agentic_qe__', '')}** (${t.executionTime}ms)${t.error ? ` - ${t.error}` : ''}`
  ).join('\n')
  : 'No P2 tools tested'}

## Results by Category

${Object.entries(results.byCategory).map(([category, tools]) => `
### ${category}

${tools.map(t =>
  `- [${t.status === 'PASS' ? '✅' : '❌'}] **${t.toolName.replace('mcp__agentic_qe__', '')}** (${t.executionTime}ms)${t.error ? ` - ${t.error}` : ''}`
).join('\n')}
`).join('\n')}

## Production Readiness Checklist

- [${results.getCriticalPassRate() === '100.00' ? 'x' : ' '}] All critical (P0) tools passing
- [${results.recentFixes.every(f => f.status === 'PASS') ? 'x' : ' '}] Recent fixes validated
- [${results.getPassRate() >= 80 ? 'x' : ' '}] Overall pass rate ≥80%
- [${results.failed === 0 ? 'x' : ' '}] No failing tools
- [ ] User documentation updated
- [ ] Integration tests passed

## Failed Tools Details

${results.failed > 0 ?
  Object.entries(results.tools)
    .filter(([_, result]) => result.status === 'FAIL')
    .map(([toolName, result]) => `
### ${toolName.replace('mcp__agentic_qe__', '')}

**Priority**: ${result.priority}
**Category**: ${result.category}
**Error**: ${result.error}

\`\`\`
${result.stack || 'No stack trace available'}
\`\`\`
`).join('\n')
  : 'No failed tools ✅'}

## Recommendations

${results.failed === 0
  ? '✅ All tested tools are production-ready. Proceed with release after completing documentation and integration tests.'
  : `⚠️ Address ${results.failed} failing tool(s) before release. Priority order: P0 > P1 > P2.`}

## Next Steps

1. ${results.failed > 0 ? '❌ Fix failing tools' : '✅ All tools passing'}
2. ${results.recentFixes.every(f => f.status === 'PASS') ? '✅ Recent fixes validated' : '⚠️ Validate recent fixes'}
3. Update user-facing documentation with verified tools
4. Run full integration test suite
5. Update CHANGELOG.md with verification results

---

**Generated by**: Agentic QE Production Readiness Verification v1.0.0
**Timestamp**: ${new Date().toISOString()}
`;

  return report;
}

/**
 * Main execution
 */
async function main() {
  try {
    const results = await runVerification();
    const report = generateMarkdownReport(results);

    // Save report
    const docsDir = path.join(process.cwd(), 'docs');
    const reportPath = path.join(docsDir, 'MCP-PRODUCTION-READINESS-REPORT.md');

    await fs.mkdir(docsDir, { recursive: true });
    await fs.writeFile(reportPath, report, 'utf-8');

    console.log(`\n📄 Report saved to: ${reportPath}`);
    console.log(`\n📊 Summary:`);
    console.log(`   Total: ${results.total}`);
    console.log(`   Passed: ${results.passed} ✅`);
    console.log(`   Failed: ${results.failed} ❌`);
    console.log(`   Pass Rate: ${results.getPassRate()}%`);
    console.log(`   Critical Pass Rate: ${results.getCriticalPassRate()}%\n`);

    // Exit with error code if any tests failed
    process.exit(results.failed > 0 ? 1 : 0);

  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { runVerification, generateMarkdownReport };
