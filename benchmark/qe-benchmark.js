#!/usr/bin/env node

/**
 * QE Framework Performance Benchmark
 * Based on Claude Flow's benchmarking patterns
 */

const fs = require('fs-extra');
const path = require('path');
const { performance } = require('perf_hooks');
const { spawn } = require('child_process');
const chalk = require('chalk');

// Benchmark configuration
const BENCHMARK_CONFIG = {
  iterations: 5,
  warmup: 2,
  agents: ['risk-oracle', 'test-architect', 'exploratory-tester', 'performance-tester'],
  scenarios: ['simple', 'complex', 'parallel', 'sequential'],
  outputDir: path.join(__dirname, 'reports'),
  metricsFile: 'benchmark-results.json'
};

// Benchmark metrics collector
class BenchmarkMetrics {
  constructor() {
    this.metrics = {
      timestamp: new Date().toISOString(),
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        memory: process.memoryUsage()
      },
      tests: [],
      summary: {}
    };
  }

  addTest(name, metrics) {
    this.metrics.tests.push({
      name,
      ...metrics,
      timestamp: Date.now()
    });
  }

  calculateSummary() {
    const times = this.metrics.tests.map(t => t.executionTime);
    this.metrics.summary = {
      totalTests: this.metrics.tests.length,
      averageTime: times.reduce((a, b) => a + b, 0) / times.length,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      standardDeviation: this.calculateStdDev(times)
    };
  }

  calculateStdDev(values) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquareDiff);
  }

  async save() {
    await fs.ensureDir(BENCHMARK_CONFIG.outputDir);
    const outputPath = path.join(
      BENCHMARK_CONFIG.outputDir,
      `benchmark_${Date.now()}.json`
    );
    await fs.writeJson(outputPath, this.metrics, { spaces: 2 });
    return outputPath;
  }
}

// Benchmark scenarios
class BenchmarkScenarios {
  constructor(metrics) {
    this.metrics = metrics;
  }

  // Simple agent execution
  async simpleAgentTest(agentName) {
    console.log(chalk.blue(`  Running simple test for ${agentName}...`));

    const startTime = performance.now();
    const result = await this.executeAgent(agentName, {
      task: 'Analyze simple function for issues',
      projectPath: process.cwd(),
      analysisDepth: 'shallow'
    });
    const endTime = performance.now();

    const executionTime = endTime - startTime;

    this.metrics.addTest(`simple_${agentName}`, {
      scenario: 'simple',
      agent: agentName,
      executionTime,
      success: !!result,
      memoryUsed: process.memoryUsage().heapUsed
    });

    return executionTime;
  }

  // Complex project analysis
  async complexAnalysisTest(agentName) {
    console.log(chalk.blue(`  Running complex test for ${agentName}...`));

    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;

    const result = await this.executeAgent(agentName, {
      task: 'Comprehensive security and quality analysis',
      projectPath: process.cwd(),
      analysisDepth: 'deep',
      includeTests: true
    });

    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;

    const executionTime = endTime - startTime;
    const memoryDelta = endMemory - startMemory;

    this.metrics.addTest(`complex_${agentName}`, {
      scenario: 'complex',
      agent: agentName,
      executionTime,
      memoryDelta,
      success: !!result
    });

    return executionTime;
  }

  // Parallel agent execution
  async parallelExecutionTest(agents) {
    console.log(chalk.blue(`  Running parallel test with ${agents.length} agents...`));

    const startTime = performance.now();

    const promises = agents.map(agent =>
      this.executeAgent(agent, {
        task: 'Parallel analysis task',
        projectPath: process.cwd(),
        analysisDepth: 'standard',
        enableCoordination: true
      })
    );

    const results = await Promise.all(promises);
    const endTime = performance.now();

    const executionTime = endTime - startTime;

    this.metrics.addTest('parallel_execution', {
      scenario: 'parallel',
      agents: agents.join(','),
      executionTime,
      agentCount: agents.length,
      successRate: results.filter(r => r).length / results.length
    });

    return executionTime;
  }

  // Sequential coordination test
  async sequentialCoordinationTest(agents) {
    console.log(chalk.blue(`  Running sequential test with ${agents.length} agents...`));

    const startTime = performance.now();
    const results = [];

    for (const agent of agents) {
      const result = await this.executeAgent(agent, {
        task: 'Sequential analysis with context',
        projectPath: process.cwd(),
        analysisDepth: 'standard',
        enableCoordination: true,
        sharedContext: results
      });
      results.push(result);
    }

    const endTime = performance.now();
    const executionTime = endTime - startTime;

    this.metrics.addTest('sequential_coordination', {
      scenario: 'sequential',
      agents: agents.join(','),
      executionTime,
      agentCount: agents.length,
      averagePerAgent: executionTime / agents.length
    });

    return executionTime;
  }

  // Session management test
  async sessionManagementTest() {
    console.log(chalk.blue('  Running session management test...'));

    const sessionId = `benchmark_session_${Date.now()}`;
    const startTime = performance.now();

    // Create session
    await this.executeAgent('risk-oracle', {
      task: 'Session test - initial analysis',
      sessionId,
      enableCoordination: true
    });

    // Add more agents to session
    await this.executeAgent('test-architect', {
      task: 'Session test - architecture review',
      sessionId,
      enableCoordination: true
    });

    // Retrieve session metrics
    const sessionMetrics = await this.getSessionMetrics(sessionId);

    const endTime = performance.now();
    const executionTime = endTime - startTime;

    this.metrics.addTest('session_management', {
      scenario: 'session',
      executionTime,
      sessionId,
      agentsInSession: 2,
      memoryShared: sessionMetrics?.memorySize || 0
    });

    return executionTime;
  }

  // Memory and coordination test
  async memoryCoordinationTest() {
    console.log(chalk.blue('  Running memory coordination test...'));

    const iterations = 10;
    const startTime = performance.now();
    const memoryKeys = [];

    for (let i = 0; i < iterations; i++) {
      const key = `benchmark_memory_${i}`;
      memoryKeys.push(key);

      // Store in memory
      await this.storeMemory(key, {
        iteration: i,
        timestamp: Date.now(),
        data: 'x'.repeat(1000) // 1KB of data
      });
    }

    // Retrieve all keys
    for (const key of memoryKeys) {
      await this.retrieveMemory(key);
    }

    const endTime = performance.now();
    const executionTime = endTime - startTime;

    this.metrics.addTest('memory_coordination', {
      scenario: 'memory',
      executionTime,
      iterations,
      averagePerOperation: executionTime / (iterations * 2)
    });

    return executionTime;
  }

  // Helper: Execute agent (mock or real)
  async executeAgent(agentName, options) {
    // In real implementation, this would call the actual MCP server
    // For benchmarking, we simulate with realistic delays

    const baseDelay = 100; // Base delay in ms
    const complexityFactor = {
      shallow: 1,
      standard: 2,
      deep: 3
    };

    const delay = baseDelay * (complexityFactor[options.analysisDepth] || 2);

    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          agent: agentName,
          task: options.task,
          timestamp: Date.now(),
          result: 'mock analysis result'
        });
      }, delay + Math.random() * 50); // Add some variance
    });
  }

  async storeMemory(key, value) {
    // Mock memory storage
    return new Promise(resolve => {
      setTimeout(() => resolve({ stored: true }), 10);
    });
  }

  async retrieveMemory(key) {
    // Mock memory retrieval
    return new Promise(resolve => {
      setTimeout(() => resolve({ value: {} }), 5);
    });
  }

  async getSessionMetrics(sessionId) {
    // Mock session metrics
    return {
      sessionId,
      memorySize: Math.floor(Math.random() * 1000),
      agentCount: 2
    };
  }
}

// Benchmark runner
class BenchmarkRunner {
  constructor() {
    this.metrics = new BenchmarkMetrics();
    this.scenarios = new BenchmarkScenarios(this.metrics);
  }

  async run() {
    console.log(chalk.green('\n🚀 QE Framework Performance Benchmark\n'));
    console.log(chalk.gray('Configuration:'));
    console.log(chalk.gray(`  • Iterations: ${BENCHMARK_CONFIG.iterations}`));
    console.log(chalk.gray(`  • Warmup runs: ${BENCHMARK_CONFIG.warmup}`));
    console.log(chalk.gray(`  • Agents: ${BENCHMARK_CONFIG.agents.join(', ')}\n`));

    // Warmup
    console.log(chalk.yellow('⏳ Running warmup...'));
    for (let i = 0; i < BENCHMARK_CONFIG.warmup; i++) {
      await this.scenarios.simpleAgentTest(BENCHMARK_CONFIG.agents[0]);
    }
    console.log(chalk.green('✅ Warmup complete\n'));

    // Run benchmarks
    const results = {
      simple: [],
      complex: [],
      parallel: [],
      sequential: [],
      session: [],
      memory: []
    };

    console.log(chalk.yellow('🏃 Running benchmarks...\n'));

    // Simple tests
    console.log(chalk.bold('Simple Agent Tests:'));
    for (const agent of BENCHMARK_CONFIG.agents) {
      for (let i = 0; i < BENCHMARK_CONFIG.iterations; i++) {
        const time = await this.scenarios.simpleAgentTest(agent);
        results.simple.push(time);
      }
    }

    // Complex tests
    console.log(chalk.bold('\nComplex Analysis Tests:'));
    for (const agent of BENCHMARK_CONFIG.agents.slice(0, 2)) { // Limit to 2 agents
      for (let i = 0; i < BENCHMARK_CONFIG.iterations; i++) {
        const time = await this.scenarios.complexAnalysisTest(agent);
        results.complex.push(time);
      }
    }

    // Parallel tests
    console.log(chalk.bold('\nParallel Execution Tests:'));
    for (let i = 0; i < BENCHMARK_CONFIG.iterations; i++) {
      const time = await this.scenarios.parallelExecutionTest(BENCHMARK_CONFIG.agents);
      results.parallel.push(time);
    }

    // Sequential tests
    console.log(chalk.bold('\nSequential Coordination Tests:'));
    for (let i = 0; i < BENCHMARK_CONFIG.iterations; i++) {
      const time = await this.scenarios.sequentialCoordinationTest(BENCHMARK_CONFIG.agents);
      results.sequential.push(time);
    }

    // Session management tests
    console.log(chalk.bold('\nSession Management Tests:'));
    for (let i = 0; i < BENCHMARK_CONFIG.iterations; i++) {
      const time = await this.scenarios.sessionManagementTest();
      results.session.push(time);
    }

    // Memory coordination tests
    console.log(chalk.bold('\nMemory Coordination Tests:'));
    for (let i = 0; i < BENCHMARK_CONFIG.iterations; i++) {
      const time = await this.scenarios.memoryCoordinationTest();
      results.memory.push(time);
    }

    // Calculate and display results
    this.metrics.calculateSummary();
    await this.displayResults(results);

    // Save results
    const outputPath = await this.metrics.save();
    console.log(chalk.green(`\n📊 Results saved to: ${outputPath}`));

    return this.metrics;
  }

  async displayResults(results) {
    console.log(chalk.green('\n═══════════════════════════════════════'));
    console.log(chalk.green.bold('           BENCHMARK RESULTS           '));
    console.log(chalk.green('═══════════════════════════════════════\n'));

    const formatTime = (ms) => {
      if (ms < 1000) return `${ms.toFixed(2)}ms`;
      return `${(ms / 1000).toFixed(2)}s`;
    };

    const calculateStats = (times) => ({
      avg: times.reduce((a, b) => a + b, 0) / times.length,
      min: Math.min(...times),
      max: Math.max(...times)
    });

    for (const [scenario, times] of Object.entries(results)) {
      if (times.length === 0) continue;

      const stats = calculateStats(times);
      console.log(chalk.bold(`${scenario.toUpperCase()} Tests:`));
      console.log(`  Average: ${chalk.yellow(formatTime(stats.avg))}`);
      console.log(`  Min: ${chalk.green(formatTime(stats.min))}`);
      console.log(`  Max: ${chalk.red(formatTime(stats.max))}`);
      console.log('');
    }

    // Performance comparison
    const parallelStats = calculateStats(results.parallel);
    const sequentialStats = calculateStats(results.sequential);
    const speedup = sequentialStats.avg / parallelStats.avg;

    console.log(chalk.bold('Performance Analysis:'));
    console.log(`  Parallel Speedup: ${chalk.cyan(speedup.toFixed(2) + 'x')}`);
    console.log(`  Memory Operations: ${chalk.cyan(formatTime(calculateStats(results.memory).avg / 20))} per op`);

    // System metrics
    const memory = process.memoryUsage();
    console.log(chalk.bold('\nSystem Metrics:'));
    console.log(`  Heap Used: ${chalk.yellow((memory.heapUsed / 1024 / 1024).toFixed(2))} MB`);
    console.log(`  Total Tests: ${chalk.yellow(this.metrics.metrics.tests.length)}`);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log(`
QE Framework Benchmark

Usage: node benchmark.js [options]

Options:
  --iterations <n>  Number of test iterations (default: 5)
  --warmup <n>     Number of warmup runs (default: 2)
  --agents <list>  Comma-separated list of agents to test
  --help          Show this help message

Examples:
  node benchmark.js
  node benchmark.js --iterations 10
  node benchmark.js --agents risk-oracle,test-architect
    `);
    return;
  }

  // Parse arguments
  const iterationsIndex = args.indexOf('--iterations');
  if (iterationsIndex !== -1 && args[iterationsIndex + 1]) {
    BENCHMARK_CONFIG.iterations = parseInt(args[iterationsIndex + 1]);
  }

  const warmupIndex = args.indexOf('--warmup');
  if (warmupIndex !== -1 && args[warmupIndex + 1]) {
    BENCHMARK_CONFIG.warmup = parseInt(args[warmupIndex + 1]);
  }

  const agentsIndex = args.indexOf('--agents');
  if (agentsIndex !== -1 && args[agentsIndex + 1]) {
    BENCHMARK_CONFIG.agents = args[agentsIndex + 1].split(',');
  }

  // Run benchmark
  const runner = new BenchmarkRunner();
  try {
    await runner.run();
    console.log(chalk.green('\n✨ Benchmark completed successfully!'));
  } catch (error) {
    console.error(chalk.red('\n❌ Benchmark failed:'), error);
    process.exit(1);
  }
}

// Export for testing
module.exports = {
  BenchmarkRunner,
  BenchmarkMetrics,
  BenchmarkScenarios
};

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}