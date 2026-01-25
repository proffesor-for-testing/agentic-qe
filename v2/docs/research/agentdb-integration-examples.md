# AgentDB Integration Examples for Agentic QE Fleet

**Date**: 2025-10-22
**Status**: Ready for implementation
**Package**: agentic-flow@1.7.3

---

## Quick Reference

### Enabling AgentDB in an Agent

```typescript
import { BaseAgent, BaseAgentConfig } from '../agents/BaseAgent';
import { AgentType } from '../types';

// Option 1: Full configuration
const agent = new TestGeneratorAgent({
  id: 'test-gen-001',
  type: AgentType.TEST_GENERATOR,
  capabilities: [...],
  context: { ... },
  memoryStore: memoryStore,
  eventBus: eventBus,

  // AgentDB configuration
  agentDBConfig: {
    dbPath: '.agentdb/test-generator.db',
    enableLearning: true,
    enableReasoning: true,
    quantizationType: 'scalar',
    cacheSize: 1000,
  },
});

// Option 2: Shorthand properties
const agent = new TestGeneratorAgent({
  // ... base config ...
  agentDBPath: '.agentdb/test-generator.db',
  enableQUICSync: true,
  syncPort: 4433,
  syncPeers: ['192.168.1.10:4433'],
  quantizationType: 'scalar',
});

await agent.initialize();

// Check if AgentDB is available
if (agent.hasAgentDB()) {
  const status = await agent.getAgentDBStatus();
  console.log('AgentDB enabled:', status.enabled);
  console.log('Total patterns:', status.stats.totalPatterns);
}
```

---

## Example 1: Test Pattern Learning

**Use Case**: Learn from successful test generation patterns

```typescript
import { createAgentDBManager } from '@/core/memory/AgentDBManager';

class IntelligentTestGenerator {
  private agentDB: AgentDBManager;

  async initialize() {
    this.agentDB = createAgentDBManager({
      dbPath: '.agentdb/test-patterns.db',
      enableLearning: true,
      enableReasoning: true,
      quantizationType: 'scalar',
    });

    await this.agentDB.initialize();
  }

  async storeTestPattern(testCode: string, success: boolean, metadata: any) {
    const embedding = await this.computeEmbedding(testCode);

    await this.agentDB.store({
      id: '',
      type: 'test-pattern',
      domain: 'unit-testing',
      pattern_data: JSON.stringify({
        embedding,
        pattern: {
          code: testCode,
          framework: metadata.framework,
          testType: metadata.testType,
          complexity: metadata.complexity,
        },
      }),
      confidence: success ? 0.95 : 0.3,
      usage_count: 1,
      success_count: success ? 1 : 0,
      created_at: Date.now(),
      last_used: Date.now(),
    });
  }

  async findSimilarPatterns(description: string): Promise<string[]> {
    const queryEmbedding = await this.computeEmbedding(description);

    const result = await this.agentDB.retrieve(queryEmbedding, {
      domain: 'unit-testing',
      k: 5,
      useMMR: true,
      synthesizeContext: true,
      minConfidence: 0.7,
    });

    return result.memories.map(m => {
      const data = JSON.parse(m.pattern_data);
      return data.pattern.code;
    });
  }

  async trainFromExperiences() {
    const metrics = await this.agentDB.train({
      epochs: 50,
      batchSize: 32,
      learningRate: 0.001,
      validationSplit: 0.2,
    });

    console.log('Training complete:', metrics);
    return metrics;
  }

  private async computeEmbedding(text: string): Promise<number[]> {
    // Use your embedding service (e.g., OpenAI, Anthropic, etc.)
    // For now, return mock embedding
    return Array(768).fill(0).map(() => Math.random());
  }
}
```

---

## Example 2: Distributed Fleet Coordination with QUIC

**Use Case**: Synchronize test execution across multiple nodes

```typescript
import { createAgentDBManager } from '@/core/memory/AgentDBManager';

class DistributedFleetCoordinator {
  private agentDB: AgentDBManager;
  private nodeId: string;

  constructor(nodeId: string, peers: string[]) {
    this.nodeId = nodeId;

    this.agentDB = createAgentDBManager({
      dbPath: `.agentdb/fleet-${nodeId}.db`,
      enableQUICSync: true,
      syncPort: 4433,
      syncPeers: peers,
      syncInterval: 1000,
      syncBatchSize: 100,
      compression: true,
      enableLearning: false,  // Focus on coordination
      enableReasoning: true,
    });
  }

  async initialize() {
    await this.agentDB.initialize();
    console.log(`Node ${this.nodeId} joined fleet with QUIC sync`);
  }

  async announceTask(task: any) {
    const embedding = Array(768).fill(0);

    await this.agentDB.store({
      id: '',
      type: 'task-announcement',
      domain: 'fleet-coordination',
      pattern_data: JSON.stringify({
        embedding,
        pattern: {
          nodeId: this.nodeId,
          task,
          timestamp: Date.now(),
        },
      }),
      confidence: 1.0,
      usage_count: 1,
      success_count: 1,
      created_at: Date.now(),
      last_used: Date.now(),
    });

    // Syncs to all peers within ~1ms
    console.log('Task announced to fleet');
  }

  async getFleetStatus(): Promise<any[]> {
    const queryEmbedding = Array(768).fill(0);

    const result = await this.agentDB.retrieve(queryEmbedding, {
      domain: 'fleet-coordination',
      k: 100,
    });

    return result.memories.map(m => JSON.parse(m.pattern_data).pattern);
  }

  async reportCompletion(taskId: string, result: any) {
    await this.agentDB.store({
      id: '',
      type: 'task-completion',
      domain: 'fleet-coordination',
      pattern_data: JSON.stringify({
        embedding: Array(768).fill(0),
        pattern: {
          nodeId: this.nodeId,
          taskId,
          result,
          completedAt: Date.now(),
        },
      }),
      confidence: 1.0,
      usage_count: 1,
      success_count: 1,
      created_at: Date.now(),
      last_used: Date.now(),
    });
  }
}

// Usage
const coordinator = new DistributedFleetCoordinator('node-1', [
  '192.168.1.11:4433',
  '192.168.1.12:4433',
]);

await coordinator.initialize();
await coordinator.announceTask({ type: 'test-execution', suite: 'integration' });
const status = await coordinator.getFleetStatus();
console.log('Fleet status:', status);
```

---

## Example 3: Coverage Gap Detection with Hybrid Search

**Use Case**: Find untested areas using vector + metadata search

```typescript
import { createAgentDBManager } from '@/core/memory/AgentDBManager';

class CoverageIntelligence {
  private agentDB: AgentDBManager;

  async initialize() {
    this.agentDB = createAgentDBManager({
      dbPath: '.agentdb/coverage.db',
      enableLearning: true,
      enableReasoning: true,
      quantizationType: 'binary',  // 32x memory reduction
      cacheSize: 5000,
    });

    await this.agentDB.initialize();
  }

  async storeCodeCoverage(file: string, coverage: any) {
    const embedding = await this.computeEmbedding(file);

    await this.agentDB.store({
      id: '',
      type: 'coverage-data',
      domain: 'code-analysis',
      pattern_data: JSON.stringify({
        embedding,
        metadata: {
          file,
          linesCovered: coverage.linesCovered,
          linesTotal: coverage.linesTotal,
          branchesCovered: coverage.branchesCovered,
          branchesTotal: coverage.branchesTotal,
          coveragePercent: coverage.percent,
          lastUpdated: Date.now(),
        },
      }),
      confidence: coverage.percent / 100,
      usage_count: 1,
      success_count: coverage.percent >= 80 ? 1 : 0,
      created_at: Date.now(),
      last_used: Date.now(),
    });
  }

  async findGaps(threshold: number = 80): Promise<any[]> {
    const queryEmbedding = Array(768).fill(0);

    const result = await this.agentDB.retrieve(queryEmbedding, {
      domain: 'code-analysis',
      k: 100,
      filters: {
        'metadata.coveragePercent': { $lt: threshold },
      },
      metric: 'cosine',
    });

    return result.memories.map(m => {
      const data = JSON.parse(m.pattern_data);
      return {
        file: data.metadata.file,
        coverage: data.metadata.coveragePercent,
        gap: threshold - data.metadata.coveragePercent,
      };
    });
  }

  async trainGapPredictor() {
    // Train model to predict coverage gaps
    const metrics = await this.agentDB.train({
      epochs: 100,
      batchSize: 64,
      learningRate: 0.0005,
      validationSplit: 0.3,
    });

    console.log('Gap predictor trained:', metrics);
    return metrics;
  }

  private async computeEmbedding(text: string): Promise<number[]> {
    return Array(768).fill(0).map(() => Math.random());
  }
}
```

---

## Example 4: Flaky Test Detection with Learning

**Use Case**: Learn patterns of flaky tests and predict new ones

```typescript
import { createAgentDBManager } from '@/core/memory/AgentDBManager';

class FlakyTestDetector {
  private agentDB: AgentDBManager;

  async initialize() {
    this.agentDB = createAgentDBManager({
      dbPath: '.agentdb/flaky-detection.db',
      enableLearning: true,
      enableReasoning: true,
      quantizationType: 'scalar',
    });

    await this.agentDB.initialize();
  }

  async recordTestExecution(testName: string, result: 'pass' | 'fail', executionTime: number) {
    const embedding = await this.computeEmbedding(testName);

    await this.agentDB.store({
      id: '',
      type: 'test-execution',
      domain: 'flaky-detection',
      pattern_data: JSON.stringify({
        embedding,
        pattern: {
          testName,
          result,
          executionTime,
          timestamp: Date.now(),
        },
      }),
      confidence: result === 'pass' ? 0.9 : 0.1,
      usage_count: 1,
      success_count: result === 'pass' ? 1 : 0,
      created_at: Date.now(),
      last_used: Date.now(),
    });
  }

  async detectFlakyTests(): Promise<string[]> {
    const queryEmbedding = Array(768).fill(0);

    const result = await this.agentDB.retrieve(queryEmbedding, {
      domain: 'flaky-detection',
      k: 1000,
      synthesizeContext: true,
      optimizeMemory: true,
    });

    // Analyze patterns for flakiness
    const testResults = new Map<string, { passes: number; fails: number }>();

    result.memories.forEach(m => {
      const data = JSON.parse(m.pattern_data);
      const testName = data.pattern.testName;
      const result = data.pattern.result;

      if (!testResults.has(testName)) {
        testResults.set(testName, { passes: 0, fails: 0 });
      }

      const stats = testResults.get(testName)!;
      if (result === 'pass') stats.passes++;
      else stats.fails++;
    });

    // Find flaky tests (both passes and fails)
    const flakyTests: string[] = [];
    testResults.forEach((stats, testName) => {
      const total = stats.passes + stats.fails;
      const passRate = stats.passes / total;

      if (passRate > 0.1 && passRate < 0.9 && total >= 5) {
        flakyTests.push(testName);
      }
    });

    return flakyTests;
  }

  async trainFlakyPredictor() {
    const metrics = await this.agentDB.train({
      epochs: 75,
      batchSize: 48,
      learningRate: 0.001,
    });

    console.log('Flaky predictor trained:', metrics);
    return metrics;
  }

  private async computeEmbedding(text: string): Promise<number[]> {
    return Array(768).fill(0).map(() => Math.random());
  }
}
```

---

## Example 5: Multi-Node Deployment

**Use Case**: Deploy AgentDB across 3 nodes for distributed testing

### Node Configuration Files

**node1.config.ts**
```typescript
export const node1Config = {
  dbPath: '.agentdb/node1.db',
  enableQUICSync: true,
  syncPort: 4433,
  syncPeers: ['192.168.1.11:4433', '192.168.1.12:4433'],
  enableLearning: true,
  enableReasoning: true,
  quantizationType: 'scalar' as const,
  syncInterval: 1000,
  syncBatchSize: 100,
  maxRetries: 3,
  compression: true,
};
```

**node2.config.ts**
```typescript
export const node2Config = {
  dbPath: '.agentdb/node2.db',
  enableQUICSync: true,
  syncPort: 4433,
  syncPeers: ['192.168.1.10:4433', '192.168.1.12:4433'],
  enableLearning: true,
  enableReasoning: true,
  quantizationType: 'scalar' as const,
  syncInterval: 1000,
  syncBatchSize: 100,
  maxRetries: 3,
  compression: true,
};
```

**node3.config.ts**
```typescript
export const node3Config = {
  dbPath: '.agentdb/node3.db',
  enableQUICSync: true,
  syncPort: 4433,
  syncPeers: ['192.168.1.10:4433', '192.168.1.11:4433'],
  enableLearning: true,
  enableReasoning: true,
  quantizationType: 'scalar' as const,
  syncInterval: 1000,
  syncBatchSize: 100,
  maxRetries: 3,
  compression: true,
};
```

### Deployment Scripts

**deploy-node.sh**
```bash
#!/bin/bash

NODE_ID=$1
NODE_IP=$2
PEER1=$3
PEER2=$4

# Set environment variables
export AGENTDB_QUIC_SYNC=true
export AGENTDB_QUIC_PORT=4433
export AGENTDB_QUIC_PEERS="${PEER1}:4433,${PEER2}:4433"
export AGENTDB_PATH=".agentdb/node${NODE_ID}.db"
export AGENTDB_LEARNING=true
export AGENTDB_REASONING=true

# Allow QUIC port in firewall
sudo ufw allow 4433/udp

# Start node
echo "Starting node ${NODE_ID} on ${NODE_IP}"
echo "Peers: ${PEER1}:4433, ${PEER2}:4433"

node dist/cli/index.js start \
  --node-id "${NODE_ID}" \
  --bind-addr "${NODE_IP}:4433"
```

**Usage**:
```bash
# Node 1 (192.168.1.10)
./deploy-node.sh 1 192.168.1.10 192.168.1.11 192.168.1.12

# Node 2 (192.168.1.11)
./deploy-node.sh 2 192.168.1.11 192.168.1.10 192.168.1.12

# Node 3 (192.168.1.12)
./deploy-node.sh 3 192.168.1.12 192.168.1.10 192.168.1.11
```

---

## Performance Monitoring

```typescript
import { createAgentDBManager } from '@/core/memory/AgentDBManager';

class PerformanceMonitor {
  private agentDB: AgentDBManager;

  async initialize() {
    this.agentDB = createAgentDBManager({
      quantizationType: 'binary',
      cacheSize: 10000,
    });

    await this.agentDB.initialize();
  }

  async getStats() {
    const stats = await this.agentDB.getStats();

    console.log('AgentDB Performance Stats:');
    console.log('  Total Patterns:', stats.totalPatterns);
    console.log('  Database Size:', (stats.dbSize / 1024 / 1024).toFixed(2), 'MB');
    console.log('  Cache Hit Rate:', (stats.cacheHitRate * 100).toFixed(2), '%');
    console.log('  Avg Search Latency:', stats.avgSearchLatency.toFixed(2), 'ms');

    return stats;
  }

  async benchmark() {
    const iterations = 1000;
    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      await this.agentDB.store({
        id: '',
        type: 'benchmark',
        domain: 'performance',
        pattern_data: JSON.stringify({
          embedding: Array(768).fill(0).map(() => Math.random()),
          data: { iteration: i },
        }),
        confidence: 1.0,
        usage_count: 1,
        success_count: 1,
        created_at: Date.now(),
        last_used: Date.now(),
      });
    }

    const duration = Date.now() - startTime;

    console.log('Benchmark Results:');
    console.log('  Iterations:', iterations);
    console.log('  Total Time:', duration, 'ms');
    console.log('  Avg Time per Operation:', (duration / iterations).toFixed(2), 'ms');
    console.log('  Operations per Second:', Math.round(iterations / (duration / 1000)));

    return { iterations, duration, opsPerSec: iterations / (duration / 1000) };
  }
}
```

---

## Next Steps

1. **Integrate AgentDB** in TestGeneratorAgent for pattern learning
2. **Enable QUIC sync** for multi-node test execution
3. **Create learning plugins** for agent-specific behaviors
4. **Implement hybrid search** for coverage gap detection
5. **Deploy multi-node cluster** for distributed testing

---

**Generated**: 2025-10-22
**Version**: 1.0.0
**Package**: agentic-flow@1.7.3
