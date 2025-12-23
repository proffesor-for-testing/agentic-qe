/**
 * RuVector GNN Self-Learning Integration - Usage Example
 *
 * This example shows how to configure QE agents to use the RuVector
 * GNN cache for sub-ms pattern matching with LoRA + EWC++ learning.
 *
 * Prerequisites:
 * 1. Start RuVector Docker: ./scripts/start-ruvector.sh --dev --wait
 * 2. Run this example: npx tsx examples/ruvector-agent-usage.ts
 */

import { EventEmitter } from 'events';
import { TestGeneratorAgent } from '../src/agents/TestGeneratorAgent';
import { SecurityScannerAgent } from '../src/agents/SecurityScannerAgent';
import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import { RoutingStrategy } from '../src/providers/HybridRouter';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     RuVector GNN Self-Learning - Agent Usage Example           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Setup shared infrastructure
  const eventBus = new EventEmitter();
  const memoryStore = new SwarmMemoryManager();
  await memoryStore.initialize();

  // ─────────────────────────────────────────────────────────────────────────
  // Example 1: Basic RuVector Configuration
  // ─────────────────────────────────────────────────────────────────────────
  console.log('📌 Example 1: Basic RuVector Configuration\n');

  const testGenAgent = new TestGeneratorAgent({
    type: 'test-generator',
    capabilities: [
      { name: 'unit-test-generation', description: 'Generate unit tests', enabled: true },
      { name: 'integration-test-generation', description: 'Generate integration tests', enabled: true },
    ],
    context: {
      environment: 'development',
      project: 'my-project',
      timestamp: new Date(),
    },
    memoryStore,
    eventBus,

    // Enable RuVector GNN cache
    llm: {
      enabled: true,
      enableHybridRouter: true,  // <-- This enables RuVector + HybridRouter

      // RuVector cache configuration
      ruvectorCache: {
        baseUrl: 'http://localhost:8080',   // RuVector Docker URL
        cacheThreshold: 0.85,               // Cache hit confidence threshold
        learningEnabled: true,              // Enable LoRA learning
        loraRank: 8,                        // LoRA rank (higher = more capacity)
        ewcEnabled: true,                   // EWC++ anti-forgetting
      },

      // Routing strategy
      hybridRouterConfig: {
        defaultStrategy: RoutingStrategy.BALANCED,  // Balance cost/quality/latency
      },
    },
  });

  console.log('✅ TestGeneratorAgent created with RuVector config');
  console.log(`   hasRuVectorCache: ${testGenAgent.hasRuVectorCache()}`);
  console.log(`   getLLMStats: ${JSON.stringify(testGenAgent.getLLMStats())}`);

  // ─────────────────────────────────────────────────────────────────────────
  // Example 2: Checking Cache Metrics
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n📌 Example 2: Checking Cache Metrics\n');

  // Get cache hit rate
  const hitRate = testGenAgent.getCacheHitRate();
  console.log(`   Cache hit rate: ${(hitRate * 100).toFixed(1)}%`);

  // Get routing statistics
  const routingStats = testGenAgent.getRoutingStats();
  console.log('   Routing stats:', JSON.stringify(routingStats, null, 2));

  // Get cost savings
  const costSavings = testGenAgent.getCostSavingsReport();
  console.log('   Cost savings:', JSON.stringify(costSavings, null, 2));

  // ─────────────────────────────────────────────────────────────────────────
  // Example 3: Force Learning Consolidation
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n📌 Example 3: Force Learning Consolidation\n');

  // Trigger LoRA learning with EWC++ protection
  const learnResult = await testGenAgent.forceRuVectorLearn();
  console.log(`   Learning result: ${JSON.stringify(learnResult)}`);

  // ─────────────────────────────────────────────────────────────────────────
  // Example 4: Multiple Agents with Shared Learning
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n📌 Example 4: Multiple Agents with Shared RuVector\n');

  const securityAgent = new SecurityScannerAgent({
    type: 'security-scanner',
    capabilities: [
      { name: 'vulnerability-scanning', description: 'Scan for vulnerabilities', enabled: true },
    ],
    context: {
      environment: 'development',
      project: 'my-project',
      timestamp: new Date(),
    },
    memoryStore,
    eventBus,
    llm: {
      enabled: true,
      enableHybridRouter: true,
      ruvectorCache: {
        baseUrl: 'http://localhost:8080',  // Same RuVector instance
        cacheThreshold: 0.9,               // Higher threshold for security
        learningEnabled: true,
      },
    },
  });

  console.log('✅ SecurityScannerAgent created with shared RuVector');
  console.log(`   hasRuVectorCache: ${securityAgent.hasRuVectorCache()}`);

  // ─────────────────────────────────────────────────────────────────────────
  // Example 5: Alternative Configuration Style
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n📌 Example 5: Alternative Configuration (preferredProvider: hybrid)\n');

  // You can also use preferredProvider: 'hybrid' instead of enableHybridRouter
  const alternativeConfig = {
    llm: {
      enabled: true,
      preferredProvider: 'hybrid' as const,  // Alternative way to enable
      ruvectorCache: {
        cacheThreshold: 0.85,
      },
    },
  };

  console.log('   Alternative config:', JSON.stringify(alternativeConfig, null, 2));

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  Available RuVector Methods on All QE Agents:');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  console.log('  📊 Metrics & Status:');
  console.log('     • hasRuVectorCache()      - Check if RuVector is enabled');
  console.log('     • getRuVectorMetrics()    - Get GNN/LoRA/cache metrics');
  console.log('     • getCacheHitRate()       - Get cache hit rate (0-1)');
  console.log('     • getRoutingStats()       - Get routing decisions & latencies');
  console.log('     • getCostSavingsReport()  - Get cost savings from caching');
  console.log('     • getLLMStats()           - Get LLM provider status\n');

  console.log('  🎓 Learning:');
  console.log('     • forceRuVectorLearn()    - Trigger LoRA consolidation\n');

  console.log('  📡 MCP Tools (for Claude/MCP clients):');
  console.log('     • mcp__agentic_qe__ruvector_health');
  console.log('     • mcp__agentic_qe__ruvector_metrics');
  console.log('     • mcp__agentic_qe__ruvector_force_learn');
  console.log('     • mcp__agentic_qe__ruvector_store_pattern');
  console.log('     • mcp__agentic_qe__ruvector_search');
  console.log('     • mcp__agentic_qe__ruvector_cost_savings\n');

  // Cleanup
  memoryStore.close();
  console.log('✅ Example complete!\n');
}

main().catch(console.error);
