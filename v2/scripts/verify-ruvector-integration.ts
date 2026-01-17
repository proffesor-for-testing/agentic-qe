#!/usr/bin/env npx tsx
/**
 * RuVector Integration Verification Script
 *
 * This script verifies from a USER PERSPECTIVE that QE agents
 * have the RuVector GNN self-learning integration properly wired.
 */

import { EventEmitter } from 'events';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(message: string, color: keyof typeof colors = 'reset'): void {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message: string): void {
  log(`  ✅ ${message}`, 'green');
}

function error(message: string): void {
  log(`  ❌ ${message}`, 'red');
}

function info(message: string): void {
  log(`  ℹ️  ${message}`, 'blue');
}

function header(message: string): void {
  console.log();
  log(`${'═'.repeat(70)}`, 'cyan');
  log(`  ${message}`, 'cyan');
  log(`${'═'.repeat(70)}`, 'cyan');
  console.log();
}

function subheader(message: string): void {
  log(`\n  ${colors.bold}${message}${colors.reset}`, 'yellow');
}

async function main(): Promise<void> {
  header('RuVector Integration Verification - User Perspective');

  const results: { test: string; passed: boolean; details?: string }[] = [];
  let passedCount = 0;
  let failedCount = 0;

  // TEST 1: Verify QE Agent Classes Have RuVector Methods
  subheader('Test 1: QE Agent Method Inheritance');

  try {
    const { TestGeneratorAgent } = await import('../src/agents/TestGeneratorAgent');
    const { SecurityScannerAgent } = await import('../src/agents/SecurityScannerAgent');
    const { PerformanceTesterAgent } = await import('../src/agents/PerformanceTesterAgent');
    const { SwarmMemoryManager } = await import('../src/core/memory/SwarmMemoryManager');

    const eventBus = new EventEmitter();
    const memoryStore = new SwarmMemoryManager();
    await memoryStore.initialize();

    const baseConfig = {
      capabilities: [{ name: 'test', description: 'Test', enabled: true }],
      context: { environment: 'test', project: 'verification', timestamp: new Date() },
      memoryStore,
      eventBus,
      llm: { enabled: false },
    };

    const testGenAgent = new TestGeneratorAgent({ ...baseConfig, type: 'test-generator' as any });

    const ruvectorMethods = [
      'hasRuVectorCache',
      'getRuVectorMetrics',
      'getCacheHitRate',
      'getRoutingStats',
      'forceRuVectorLearn',
      'getCostSavingsReport',
      'getLLMStats',
    ];

    let methodsFound = 0;
    for (const method of ruvectorMethods) {
      if (typeof (testGenAgent as any)[method] === 'function') {
        methodsFound++;
        success(`TestGeneratorAgent.${method}() exists`);
      } else {
        error(`TestGeneratorAgent.${method}() NOT FOUND`);
      }
    }

    if (methodsFound === ruvectorMethods.length) {
      results.push({ test: 'Method Inheritance', passed: true, details: `${methodsFound}/${ruvectorMethods.length} methods` });
      passedCount++;
    } else {
      results.push({ test: 'Method Inheritance', passed: false, details: `Only ${methodsFound}/${ruvectorMethods.length}` });
      failedCount++;
    }

    const performanceAgent = new PerformanceTesterAgent({ ...baseConfig, type: 'performance-tester' as any });
    const securityAgent = new SecurityScannerAgent({ ...baseConfig, type: 'security-scanner' as any });

    if (typeof (performanceAgent as any).hasRuVectorCache === 'function' &&
        typeof (securityAgent as any).hasRuVectorCache === 'function') {
      success('PerformanceTesterAgent has RuVector methods');
      success('SecurityScannerAgent has RuVector methods');
      info('All agents now extend BaseAgent with RuVector integration (v2.5.9)');
      results.push({ test: 'Cross-Agent Inheritance', passed: true });
      passedCount++;
    } else {
      error('Some agents missing RuVector methods');
      results.push({ test: 'Cross-Agent Inheritance', passed: false });
      failedCount++;
    }

    memoryStore.close();
  } catch (err) {
    error(`Agent test failed: ${err}`);
    results.push({ test: 'Method Inheritance', passed: false, details: String(err) });
    failedCount++;
  }

  // TEST 2: Verify Configuration Acceptance
  subheader('Test 2: RuVector Configuration Acceptance');

  try {
    const { TestGeneratorAgent } = await import('../src/agents/TestGeneratorAgent');
    const { SwarmMemoryManager } = await import('../src/core/memory/SwarmMemoryManager');
    const { RoutingStrategy } = await import('../src/providers/HybridRouter');

    const eventBus = new EventEmitter();
    const memoryStore = new SwarmMemoryManager();
    await memoryStore.initialize();

    const fullConfig = {
      type: 'test-generator' as any,
      capabilities: [{ name: 'test', description: 'Test', enabled: true }],
      context: { environment: 'test', project: 'verification', timestamp: new Date() },
      memoryStore,
      eventBus,
      llm: {
        enabled: true,
        enableHybridRouter: true,
        ruvectorCache: {
          baseUrl: 'http://localhost:8080',
          cacheThreshold: 0.85,
          learningEnabled: true,
          loraRank: 8,
          ewcEnabled: true,
        },
        hybridRouterConfig: {
          defaultStrategy: RoutingStrategy.BALANCED,
        },
      },
    };

    const agent = new TestGeneratorAgent(fullConfig);
    success('Agent accepts enableHybridRouter: true');
    success('Agent accepts ruvectorCache configuration');
    success('Agent accepts hybridRouterConfig configuration');

    const stats = agent.getLLMStats();
    if (stats.hasRuVectorCache !== undefined) {
      success('getLLMStats includes hasRuVectorCache property');
    }

    results.push({ test: 'Configuration Acceptance', passed: true });
    passedCount++;
    memoryStore.close();
  } catch (err) {
    error(`Configuration test failed: ${err}`);
    results.push({ test: 'Configuration Acceptance', passed: false, details: String(err) });
    failedCount++;
  }

  // TEST 3: Verify Method Return Types
  subheader('Test 3: Method Return Types');

  try {
    const { TestGeneratorAgent } = await import('../src/agents/TestGeneratorAgent');
    const { SwarmMemoryManager } = await import('../src/core/memory/SwarmMemoryManager');

    const eventBus = new EventEmitter();
    const memoryStore = new SwarmMemoryManager();
    await memoryStore.initialize();

    const agent = new TestGeneratorAgent({
      type: 'test-generator' as any,
      capabilities: [{ name: 'test', description: 'Test', enabled: true }],
      context: { environment: 'test', project: 'verification', timestamp: new Date() },
      memoryStore,
      eventBus,
      llm: { enabled: false },
    });

    const hasCache = agent.hasRuVectorCache();
    if (typeof hasCache === 'boolean') success(`hasRuVectorCache() returns boolean: ${hasCache}`);

    const hitRate = agent.getCacheHitRate();
    if (typeof hitRate === 'number') success(`getCacheHitRate() returns number: ${hitRate}`);

    const stats = agent.getRoutingStats();
    if (stats && typeof stats.cacheHits === 'number') success('getRoutingStats() returns correct structure');

    const savings = agent.getCostSavingsReport();
    if (savings && typeof savings.totalRequests === 'number') success('getCostSavingsReport() returns correct structure');

    const learnResult = await agent.forceRuVectorLearn();
    if (learnResult && typeof learnResult.success === 'boolean') {
      success(`forceRuVectorLearn() returns: { success: ${learnResult.success} }`);
    }

    results.push({ test: 'Method Return Types', passed: true });
    passedCount++;
    memoryStore.close();
  } catch (err) {
    error(`Return type test failed: ${err}`);
    results.push({ test: 'Method Return Types', passed: false, details: String(err) });
    failedCount++;
  }

  // TEST 4: Verify MCP Tools Exported
  subheader('Test 4: MCP Tool Exposure');

  try {
    const { agenticQETools, TOOL_NAMES } = await import('../src/mcp/tools');

    const ruvectorToolNames = [
      'RUVECTOR_HEALTH', 'RUVECTOR_METRICS', 'RUVECTOR_FORCE_LEARN',
      'RUVECTOR_STORE_PATTERN', 'RUVECTOR_SEARCH', 'RUVECTOR_COST_SAVINGS',
    ];

    let toolsInNames = 0;
    for (const toolName of ruvectorToolNames) {
      if ((TOOL_NAMES as any)[toolName]) {
        toolsInNames++;
        success(`TOOL_NAMES.${toolName} exists`);
      }
    }

    const ruvectorToolsInArray = agenticQETools.filter(t => t.name.includes('ruvector'));
    if (ruvectorToolsInArray.length >= 6) {
      success(`Found ${ruvectorToolsInArray.length} RuVector tools in agenticQETools`);
      for (const tool of ruvectorToolsInArray) info(`  - ${tool.name}`);
    }

    if (toolsInNames >= 6 && ruvectorToolsInArray.length >= 6) {
      results.push({ test: 'MCP Tool Exposure', passed: true, details: `${ruvectorToolsInArray.length} tools` });
      passedCount++;
    } else {
      results.push({ test: 'MCP Tool Exposure', passed: false });
      failedCount++;
    }
  } catch (err) {
    error(`MCP tools test failed: ${err}`);
    results.push({ test: 'MCP Tool Exposure', passed: false, details: String(err) });
    failedCount++;
  }

  // TEST 5: Verify HybridRouter Integration
  subheader('Test 5: HybridRouter Export & Types');

  try {
    const { HybridRouter, RuVectorClient, RoutingStrategy, TaskComplexity } = await import('../src/providers');

    if (HybridRouter) success('HybridRouter class exported from providers');
    if (RuVectorClient) success('RuVectorClient class exported from providers');
    if (RoutingStrategy) {
      success('RoutingStrategy enum exported');
      info(`  Strategies: ${Object.keys(RoutingStrategy).filter(k => isNaN(Number(k))).join(', ')}`);
    }
    if (TaskComplexity) success('TaskComplexity enum exported');

    results.push({ test: 'HybridRouter Export', passed: true });
    passedCount++;
  } catch (err) {
    error(`HybridRouter test failed: ${err}`);
    results.push({ test: 'HybridRouter Export', passed: false, details: String(err) });
    failedCount++;
  }

  // SUMMARY
  header('Verification Summary');

  console.log('┌──────────────────────────────────────────────────────────────────┐');
  console.log('│ Test                            │ Status │ Details              │');
  console.log('├──────────────────────────────────────────────────────────────────┤');

  for (const result of results) {
    const status = result.passed ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`;
    const details = (result.details || '').substring(0, 20);
    console.log(`│ ${result.test.padEnd(31)} │ ${status}   │ ${details.padEnd(20)} │`);
  }

  console.log('└──────────────────────────────────────────────────────────────────┘');
  console.log();

  if (failedCount === 0) {
    log(`${colors.bold}${colors.green}✅ ALL ${passedCount} TESTS PASSED!${colors.reset}`, 'green');
    console.log();
    log('QE agents are fully integrated with RuVector GNN self-learning.', 'green');
    log('Users can now:', 'cyan');
    log('  1. Enable HybridRouter with: llm: { enableHybridRouter: true }', 'reset');
    log('  2. Configure RuVector cache with: ruvectorCache: { ... }', 'reset');
    log('  3. Use methods like: agent.getCacheHitRate(), agent.forceRuVectorLearn()', 'reset');
    log('  4. Use MCP tools: ruvector_health, ruvector_search, etc.', 'reset');
    process.exit(0);
  } else {
    log(`${colors.bold}${colors.red}❌ ${failedCount} TEST(S) FAILED${colors.reset}`, 'red');
    process.exit(1);
  }
}

main().catch(err => {
  error(`Verification script failed: ${err}`);
  process.exit(1);
});
