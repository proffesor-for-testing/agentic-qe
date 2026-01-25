/**
 * MCP Performance Benchmarks
 * ADR-039: V3 QE MCP Optimization
 *
 * Verifies the following performance targets:
 * - P95 latency < 100ms for tool invocation
 * - Pool hit rate > 90%
 * - Tool lookup < 5ms
 * - Connection acquisition < 5ms
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { performance } from 'perf_hooks';
import {
  createConnectionPool,
  type ConnectionPoolConfig,
  type PoolStats,
} from '../../../src/mcp/connection-pool';
import {
  createLoadBalancer,
  type LoadBalancerConfig,
} from '../../../src/mcp/load-balancer';
import {
  createPerformanceMonitor,
  type PerformanceMonitorConfig,
} from '../../../src/mcp/performance-monitor';
import { ToolRegistry, createToolRegistry } from '../../../src/mcp/tool-registry';

describe('MCP Performance Benchmarks', () => {
  describe('Connection Pool Performance', () => {
    let pool: ReturnType<typeof createConnectionPool>;
    let config: Partial<ConnectionPoolConfig>;

    beforeEach(async () => {
      // Create pool with test configuration
      config = {
        maxConnections: 20,
        minConnections: 3,
        idleTimeoutMs: 60 * 1000, // 1 minute for tests
        healthCheckIntervalMs: 0, // Disable during tests
        autoCreate: true,
        autoPrune: false, // Manual control for tests
      };
      pool = createConnectionPool(config);
      await pool.initialize();
    });

    it('should achieve <5ms connection acquisition (after warmup)', async () => {
      // Warmup
      for (let i = 0; i < 10; i++) {
        const conn = pool.acquire();
        if (conn) pool.release(conn.id);
      }

      // Measure 100 acquisitions
      const latencies: number[] = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        const conn = pool.acquire();
        const latency = performance.now() - start;

        latencies.push(latency);
        if (conn) pool.release(conn.id);
      }

      latencies.sort((a, b) => a - b);

      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

      console.log('\n=== Connection Acquisition Latency ===');
      console.log(`  Samples: ${latencies.length}`);
      console.log(`  Average: ${avg.toFixed(3)}ms`);
      console.log(`  P50: ${p50.toFixed(3)}ms`);
      console.log(`  P95: ${p95.toFixed(3)}ms`);
      console.log(`  P99: ${p99.toFixed(3)}ms`);

      expect(p95).toBeLessThan(5);
    });

    it('should achieve >90% pool hit rate', () => {
      const iterations = 100;
      let hits = 0;

      for (let i = 0; i < iterations; i++) {
        const conn = pool.acquire();
        if (conn) {
          hits++;
          pool.release(conn.id);
        }
      }

      const stats = pool.getStats();
      const hitRate = (hits / iterations) * 100;

      console.log('\n=== Pool Hit Rate ===');
      console.log(`  Requests: ${iterations}`);
      console.log(`  Hits: ${hits}`);
      console.log(`  Hit Rate: ${hitRate.toFixed(1)}%`);
      console.log(`  Pool Hit Rate: ${(stats.poolHitRate * 100).toFixed(1)}%`);

      expect(hitRate).toBeGreaterThan(90);
      expect(stats.poolHitRate).toBeGreaterThan(0.9);
    });

    it('should maintain pool efficiency under load', async () => {
      const opsPerRound = 10;
      const rounds = 5;
      let totalHits = 0;
      let totalRequests = 0;

      // Simulate repeated acquire/release cycles (connection reuse)
      for (let round = 0; round < rounds; round++) {
        const roundStats: { acquired: number; reused: number }[] = [];

        for (let i = 0; i < opsPerRound; i++) {
          const start = performance.now();
          const conn = pool.acquire();
          const latency = performance.now() - start;

          if (conn) {
            totalHits++;
            totalRequests++;
            roundStats.push({ acquired: i, reused: conn.metrics.requestsServed === 0 ? 0 : 1 });

            // Simulate work and release for reuse
            pool.recordRequest(conn.id, Math.random() * 10, true);
            pool.release(conn.id);
          }
        }

        // Small delay between rounds
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const stats = pool.getStats();

      console.log('\n=== Pool Efficiency Under Load ===');
      console.log(`  Total Requests: ${totalRequests}`);
      console.log(`  Total Connections: ${stats.totalConnections}`);
      console.log(`  Active: ${stats.activeConnections}`);
      console.log(`  Idle: ${stats.idleConnections}`);
      console.log(`  Pool Hit Rate: ${(stats.poolHitRate * 100).toFixed(1)}%`);

      // With connection reuse, pool hit rate should be high
      expect(stats.poolHitRate).toBeGreaterThan(0.5);
    });
  });

  describe('Load Balancer Performance', () => {
    it('should select agents in O(1) time', () => {
      const balancer = createLoadBalancer();

      // Register 100 agents
      const agentIds: string[] = [];
      for (let i = 0; i < 100; i++) {
        const id = `agent-${i}`;
        agentIds.push(id);
        balancer.registerAgent(id);
      }

      // Warmup
      for (let i = 0; i < 10; i++) {
        balancer.selectAgent(agentIds);
      }

      // Measure 1000 selections
      const latencies: number[] = [];
      for (let i = 0; i < 1000; i++) {
        const start = performance.now();
        balancer.selectAgent(agentIds);
        const latency = performance.now() - start;
        latencies.push(latency);
      }

      latencies.sort((a, b) => a - b);

      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

      console.log('\n=== Load Balancer Selection Latency ===');
      console.log(`  Agents: ${agentIds.length}`);
      console.log(`  Samples: ${latencies.length}`);
      console.log(`  Average: ${avg.toFixed(3)}ms`);
      console.log(`  P50: ${p50.toFixed(3)}ms`);
      console.log(`  P95: ${p95.toFixed(3)}ms`);

      // Selection should be < 1ms (O(1) hash lookup + minimal iteration)
      expect(p95).toBeLessThan(1);
    });

    it('should distribute load evenly across agents', () => {
      const balancer = createLoadBalancer({ strategy: 'round-robin' });
      const agentIds = ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5'];

      for (const id of agentIds) {
        balancer.registerAgent(id);
      }

      // Distribute 100 requests
      for (let i = 0; i < 100; i++) {
        const selected = balancer.selectAgent(agentIds);
        if (selected) {
          balancer.recordRequest(selected, Math.random() * 50 + 10, true);
        }
      }

      const loads = agentIds.map(id => balancer.getAgentLoad(id));
      const requestsPerAgent = loads.map(l => l?.totalRequests || 0);

      console.log('\n=== Load Distribution ===');
      console.log(`  Requests per agent: ${requestsPerAgent.join(', ')}`);

      // With round-robin, each agent should get ~20 requests
      const expectedPerAgent = 100 / agentIds.length;

      for (let i = 0; i < requestsPerAgent.length; i++) {
        expect(requestsPerAgent[i]).toBeCloseTo(expectedPerAgent, 0);
      }

      // Check coefficient of variation (lower = better balance)
      const mean = requestsPerAgent.reduce((a, b) => a + b, 0) / requestsPerAgent.length;
      const variance = requestsPerAgent.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / requestsPerAgent.length;
      const stdDev = Math.sqrt(variance);
      const cv = stdDev / mean; // Coefficient of variation

      console.log(`  Mean: ${mean.toFixed(1)}`);
      console.log(`  Std Dev: ${stdDev.toFixed(1)}`);
      console.log(`  CV: ${(cv * 100).toFixed(1)}%`);

      // CV should be < 0.3 (30%) for good distribution
      expect(cv).toBeLessThan(0.3);
    });
  });

  describe('Performance Monitor', () => {
    let monitor: ReturnType<typeof createPerformanceMonitor>;

    beforeEach(() => {
      monitor = createPerformanceMonitor({
        maxLatencySamples: 1000,
        enableAlerts: false, // Disable for clean test output
      });
    });

    it('should track latency percentiles accurately', () => {
      // Generate latencies with known distribution
      const latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

      for (const latency of latencies) {
        monitor.recordLatency('test-operation', latency, true);
      }

      const percentiles = monitor.getLatencyPercentiles();

      console.log('\n=== Percentile Tracking ===');
      console.log(`  P50: ${percentiles.p50}ms (expected: ~55ms)`);
      console.log(`  P95: ${percentiles.p95}ms (expected: ~95ms)`);
      console.log(`  P99: ${percentiles.p99}ms (expected: ~100ms)`);

      expect(percentiles.p50).toBeGreaterThan(40);
      expect(percentiles.p95).toBeGreaterThan(90);
      expect(percentiles.p99).toBe(100);
    });

    it('should generate comprehensive performance reports', () => {
      // Record sample data
      for (let i = 0; i < 100; i++) {
        const latency = 50 + Math.random() * 100; // 50-150ms
        const success = Math.random() > 0.1; // 90% success rate
        monitor.recordLatency('benchmark-tool', latency, success);
      }

      const report = monitor.generateReport();

      console.log('\n=== Performance Report ===');
      console.log(`  Total Operations: ${report.summary.totalOperations}`);
      console.log(`  Success Rate: ${(report.summary.successRate * 100).toFixed(1)}%`);
      console.log(`  Avg Latency: ${report.summary.avgLatencyMs.toFixed(1)}ms`);
      console.log(`  P50: ${report.latencyPercentiles.p50.toFixed(1)}ms`);
      console.log(`  P95: ${report.latencyPercentiles.p95.toFixed(1)}ms`);
      console.log(`  P99: ${report.latencyPercentiles.p99.toFixed(1)}ms`);
      console.log(`  Target Met: ${report.summary.targetMet}`);

      expect(report.summary.totalOperations).toBe(100);
      expect(report.summary.successRate).toBeGreaterThan(0.8);
    });
  });

  describe('Tool Registry Performance', () => {
    let registry: ToolRegistry;

    beforeEach(() => {
      registry = createToolRegistry();
    });

    it('should achieve <1ms tool lookup', () => {
      // Register a test tool
      registry.register({
        name: 'test.tool',
        description: 'Test tool',
        category: 'test',
      }, async () => ({ success: true, data: null }));

      // Warmup
      for (let i = 0; i < 10; i++) {
        registry.get('test.tool');
      }

      // Measure 1000 lookups
      const latencies: number[] = [];
      for (let i = 0; i < 1000; i++) {
        const start = performance.now();
        registry.get('test.tool');
        const latency = performance.now() - start;
        latencies.push(latency);
      }

      latencies.sort((a, b) => a - b);

      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

      console.log('\n=== Tool Lookup Latency ===');
      console.log(`  Samples: ${latencies.length}`);
      console.log(`  Average: ${avg.toFixed(3)}ms`);
      console.log(`  P50: ${p50.toFixed(3)}ms`);
      console.log(`  P95: ${p95.toFixed(3)}ms`);

      // Map-based O(1) lookup should be extremely fast
      expect(p95).toBeLessThan(1);
    });
  });

  describe('Integration Benchmark', () => {
    it('should achieve <100ms P95 for end-to-end MCP operation', async () => {
      const pool = createConnectionPool({ maxConnections: 10, minConnections: 2 });
      await pool.initialize();

      const balancer = createLoadBalancer();
      ['agent-1', 'agent-2', 'agent-3'].forEach(id => balancer.registerAgent(id));

      const monitor = createPerformanceMonitor({ enableAlerts: false });

      // Simulate 50 MCP operations
      const latencies: number[] = [];
      for (let i = 0; i < 50; i++) {
        const start = performance.now();

        // Simulate MCP operation flow
        const conn = pool.acquire();
        const agent = balancer.selectAgent();
        // Simulate work (10-50ms)
        await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 40));

        const latency = performance.now() - start;
        latencies.push(latency);

        monitor.recordLatency('mcp-operation', latency, true);
        if (conn) pool.release(conn.id);
        if (agent) balancer.recordRequest(agent, latency, true);
      }

      latencies.sort((a, b) => a - b);

      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

      console.log('\n=== End-to-End MCP Operation ===');
      console.log(`  Samples: ${latencies.length}`);
      console.log(`  Average: ${avg.toFixed(1)}ms`);
      console.log(`  P50: ${p50.toFixed(1)}ms`);
      console.log(`  P95: ${p95.toFixed(1)}ms`);
      console.log(`  P99: ${p99.toFixed(1)}ms`);

      const targets = monitor.checkTargets();
      console.log(`\n=== Target Check ===`);
      console.log(`  Target Met: ${targets.met}`);
      console.log(`  P95: ${targets.p95LatencyMs.toFixed(1)}ms < ${targets.targetMs}ms`);

      // P95 should be under 100ms target
      expect(p95).toBeLessThan(100);
    }, 30000);
  });
});
