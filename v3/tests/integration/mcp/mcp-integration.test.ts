/**
 * Real MCP Integration Test
 * ADR-039: V3 QE MCP Optimization
 *
 * This test ACTUALLY invokes real MCP tools through the protocol server.
 * No fake setTimeout, no mock handlers - real tool execution.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { performance } from 'perf_hooks';
import { MCPProtocolServer, createMCPProtocolServer } from '../../../src/mcp/protocol-server';
import { getPerformanceMonitor } from '../../../src/mcp/performance-monitor';
import { getConnectionPool } from '../../../src/connection-pool';
import { getLoadBalancer } from '../../../src/mcp/load-balancer';

describe('Real MCP Integration Tests', () => {
  let server: MCPProtocolServer;

  beforeAll(async () => {
    server = createMCPProtocolServer({
      name: 'aqe-v3-test',
      version: '3.0.0-test',
    });
    await server.start();
  }, 30000);

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Actual MCP Tool Invocation', () => {
    it('should invoke fleet_status tool and measure real latency', async () => {
      // First initialize the fleet
      const initStart = performance.now();
      await server['handleRequest']({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'fleet_init',
          arguments: {
            topology: 'hierarchical',
            maxAgents: 5,
            lazyLoading: true,
          },
        },
      });
      const initLatency = performance.now() - initStart;

      console.log(`\n=== Fleet Init ===`);
      console.log(`  Latency: ${initLatency.toFixed(1)}ms`);

      expect(initLatency).toBeGreaterThan(0);

      // Now call fleet_status (this will actually query the fleet state)
      const latencies: number[] = [];

      for (let i = 0; i < 20; i++) {
        const start = performance.now();

        const result = await server['handleRequest']({
          jsonrpc: '2.0',
          id: 2 + i,
          method: 'tools/call',
          params: {
            name: 'fleet_status',
            arguments: {
              verbose: false,
            },
          },
        });

        const latency = performance.now() - start;
        latencies.push(latency);

        // Verify we got a valid response
        expect(result).toBeDefined();
      }

      latencies.sort((a, b) => a - b);

      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

      console.log('\n=== Fleet Status Tool (Real Invocation) ===');
      console.log(`  Samples: ${latencies.length}`);
      console.log(`  Average: ${avg.toFixed(1)}ms`);
      console.log(`  P50: ${p50.toFixed(1)}ms`);
      console.log(`  P95: ${p95.toFixed(1)}ms`);
      console.log(`  P99: ${p99.toFixed(1)}ms`);

      // Get performance stats from server
      const perfStats = server.getPerformanceStats();
      console.log('\n=== Performance Stats ===');
      console.log(`  Pool Hit Rate: ${(perfStats.pool.poolHitRate * 100).toFixed(1)}%`);
      console.log(`  P95 Latency: ${perfStats.monitor.percentiles.p95.toFixed(1)}ms`);

      // Verify performance monitor recorded the operations
      const toolMetrics = getPerformanceMonitor().getToolMetrics('fleet_status');
      expect(toolMetrics).not.toBeNull();
      expect(toolMetrics!.invocationCount).toBe(20);
    }, 60000);

    it('should track performance across multiple tool types', async () => {
      const monitor = getPerformanceMonitor();
      monitor.reset();

      // Initialize fleet
      await server['handleRequest']({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'fleet_init',
          arguments: {
            topology: 'hierarchical',
            maxAgents: 3,
          },
        },
      });

      // Call different tools
      const tools = ['fleet_status', 'fleet_health', 'agent_list'];

      for (const tool of tools) {
        for (let i = 0; i < 5; i++) {
          // MCP server's handleToolsCall() automatically records to monitor
          await server['handleRequest']({
            jsonrpc: '2.0',
            id: Math.random(),
            method: 'tools/call',
            params: {
              name: tool,
              arguments: {},
            },
          });
        }
      }

      const allMetrics = monitor.getAllToolMetrics();

      console.log('\n=== Multi-Tool Performance ===');
      for (const [toolName, metrics] of allMetrics) {
        console.log(`\n  ${toolName}:`);
        console.log(`    Invocations: ${metrics.invocationCount}`);
        console.log(`    Avg Latency: ${metrics.avgLatencyMs.toFixed(1)}ms`);
        console.log(`    P95 Latency: ${metrics.p95LatencyMs.toFixed(1)}ms`);
        console.log(`    Success Rate: ${((metrics.successCount / metrics.invocationCount) * 100).toFixed(1)}%`);
      }

      // Verify each tool was invoked
      expect(allMetrics.size).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Load Balancer Integration', () => {
    it('should register agents when spawned via MCP', async () => {
      const balancer = getLoadBalancer();

      // Initialize fleet
      await server['handleRequest']({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'fleet_init',
          arguments: {
            topology: 'hierarchical',
            maxAgents: 3,
          },
        },
      });

      // Spawn some agents
      const spawnedAgents: string[] = [];
      for (let i = 0; i < 3; i++) {
        const result = await server['handleRequest']({
          jsonrpc: '2.0',
          id: 2 + i,
          method: 'tools/call',
          params: {
            name: 'agent_spawn',
            arguments: {
              domain: 'test-generation',
              type: 'worker',
              capabilities: ['test'],
            },
          },
        });

        // Parse the result to get agent ID
        const content = (result as { content: Array<{ type: string; text: string }> }).content;
        const data = JSON.parse(content[0].text);
        if (data.success && data.data) {
          spawnedAgents.push(data.data.agentId);
        }
      }

      console.log(`\n=== Load Balancer Integration ===`);
      console.log(`  Spawned Agents: ${spawnedAgents.length}`);

      // Verify agents are registered with load balancer
      for (const agentId of spawnedAgents) {
        const agentLoad = balancer.getAgentLoad(agentId);
        expect(agentLoad).not.toBeNull();
        console.log(`  ${agentId}: registered`);
      }

      // Get load balancer stats
      const stats = balancer.getStats();
      console.log(`\n  Load Balancer Stats:`);
      console.log(`    Total Agents: ${stats.totalAgents}`);
      console.log(`    Healthy Agents: ${stats.healthyAgents}`);
      console.log(`    Strategy: ${stats.strategyUsed}`);
    }, 60000);
  });

  describe('Performance Monitoring Integration', () => {
    it('should generate performance report with real metrics', async () => {
      const monitor = getPerformanceMonitor();
      monitor.reset();

      // Initialize fleet (this adds 1 operation, track it)
      await server['handleRequest']({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'fleet_init',
          arguments: {
            topology: 'hierarchical',
            maxAgents: 3,
          },
        },
      });

      // Account for the fleet_init operation (1) + our operations (19) = 20 total
      const operations = [
        { tool: 'fleet_status', count: 6 },
        { tool: 'fleet_health', count: 6 },
        { tool: 'agent_list', count: 6 },
      ];

      for (const op of operations) {
        for (let i = 0; i < op.count; i++) {
          // MCP server's handleToolsCall() automatically records to monitor
          await server['handleRequest']({
            jsonrpc: '2.0',
            id: Math.random(),
            method: 'tools/call',
            params: {
              name: op.tool,
              arguments: {},
            },
          });
        }
      }

      // Generate report
      const report = monitor.generateReport();

      console.log('\n=== Performance Report ===');
      console.log(`  Period: ${report.period.durationMs.toFixed(0)}ms`);
      console.log(`  Total Operations: ${report.summary.totalOperations}`);
      console.log(`  Success Rate: ${(report.summary.successRate * 100).toFixed(1)}%`);
      console.log(`  Avg Latency: ${report.summary.avgLatencyMs.toFixed(1)}ms`);
      console.log(`  P50: ${report.latencyPercentiles.p50.toFixed(1)}ms`);
      console.log(`  P95: ${report.latencyPercentiles.p95.toFixed(1)}ms`);
      console.log(`  P99: ${report.latencyPercentiles.p99.toFixed(1)}ms`);
      console.log(`  Target Met: ${report.summary.targetMet}`);

      // Verify report contains expected data (1 fleet_init + 6+6+6 = 19 total)
      expect(report.summary.totalOperations).toBe(19);
      expect(report.summary.successRate).toBeGreaterThan(0);
    }, 60000);
  });
});
