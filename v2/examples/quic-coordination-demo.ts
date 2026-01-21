/**
 * QUIC Coordination Demo
 *
 * Demonstrates distributed agent coordination using QUIC protocol.
 * Run with: npx ts-node examples/quic-coordination-demo.ts
 */

import { BaseAgent } from '../src/agents/BaseAgent';
import { EventBus } from '../src/core/EventBus';
import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import { QUICConfig, QUICMessage } from '../src/types/quic';
import {
  BaseAgentConfig,
  AgentCapability,
  AgentContext,
  AgentStatus,
  QETask
} from '../src/types';

// ============================================================================
// Example Agent Implementations
// ============================================================================

class CoordinatorAgent extends BaseAgent {
  private taskQueue: QETask[] = [];

  protected async initializeComponents(): Promise<void> {
    console.log(`[${this.agentId.id}] Coordinator initialized`);
  }

  protected async performTask(task: QETask): Promise<any> {
    console.log(`[${this.agentId.id}] Coordinating task: ${task.type}`);

    // Discover worker agents
    if (this.quicTransport) {
      const peers = await this.quicTransport.discoverPeers({
        filter: (peer) => peer.agentType === 'worker',
        maxPeers: 10
      });

      console.log(`[${this.agentId.id}] Found ${peers.length} workers`);

      // Distribute work to workers via QUIC
      for (let i = 0; i < peers.length; i++) {
        await this.sendToAgent(peers[i].agentId, {
          action: 'execute-task',
          task: {
            id: `task-${i}`,
            type: 'test',
            description: `Test task ${i}`
          }
        });
      }
    }

    return { status: 'distributed', workers: this.quicTransport?.getPeers().length };
  }

  protected async loadKnowledge(): Promise<void> {
    // Load coordinator knowledge
  }

  protected async cleanup(): Promise<void> {
    console.log(`[${this.agentId.id}] Coordinator cleanup`);
  }
}

class WorkerAgent extends BaseAgent {
  private tasksCompleted: number = 0;

  protected async initializeComponents(): Promise<void> {
    console.log(`[${this.agentId.id}] Worker initialized`);
  }

  protected async performTask(task: QETask): Promise<any> {
    console.log(`[${this.agentId.id}] Executing task: ${task.type}`);

    // Simulate work
    await this.delay(100 + Math.random() * 400);

    this.tasksCompleted++;

    // Send results back via QUIC
    const result = {
      taskId: task.id,
      status: 'completed',
      executionTime: Date.now(),
      workerId: this.agentId.id
    };

    // Broadcast results to fleet
    await this.broadcastToFleet({
      action: 'task-completed',
      result: result
    }, 'results');

    return result;
  }

  protected onQUICMessage(message: QUICMessage): void {
    console.log(`[${this.agentId.id}] Received QUIC message:`, message.payload.action);

    if (message.payload.action === 'execute-task') {
      const task = message.payload.task;
      this.performTask(task).catch(error => {
        console.error(`[${this.agentId.id}] Task execution failed:`, error);
      });
    }
  }

  protected async loadKnowledge(): Promise<void> {
    // Load worker knowledge
  }

  protected async cleanup(): Promise<void> {
    console.log(`[${this.agentId.id}] Worker completed ${this.tasksCompleted} tasks`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class MonitorAgent extends BaseAgent {
  private metrics: Map<string, any> = new Map();

  protected async initializeComponents(): Promise<void> {
    console.log(`[${this.agentId.id}] Monitor initialized`);
  }

  protected async performTask(task: QETask): Promise<any> {
    console.log(`[${this.agentId.id}] Monitoring fleet`);

    // Start collecting metrics from all agents
    if (this.quicTransport) {
      const peers = await this.quicTransport.discoverPeers();

      for (const peer of peers) {
        try {
          const metrics = await this.requestFromAgent(peer.agentId, {
            action: 'get-metrics'
          }, 2000);

          this.metrics.set(peer.agentId, metrics);
        } catch (error) {
          console.warn(`[${this.agentId.id}] Failed to get metrics from ${peer.agentId}`);
        }
      }
    }

    return {
      totalAgents: this.metrics.size,
      metrics: Array.from(this.metrics.entries())
    };
  }

  protected onQUICMessage(message: QUICMessage): void {
    if (message.payload.action === 'task-completed') {
      console.log(`[${this.agentId.id}] Task completed by ${message.from}`);
      this.metrics.set(message.from, message.payload.result);
    }
  }

  protected async loadKnowledge(): Promise<void> {
    // Load monitor knowledge
  }

  protected async cleanup(): Promise<void> {
    console.log(`[${this.agentId.id}] Monitor cleanup`);
  }
}

// ============================================================================
// Demo Setup
// ============================================================================

async function runQUICDemo() {
  console.log('=== QUIC Coordination Demo ===\n');

  // Setup shared infrastructure
  const eventBus = EventBus.getInstance();
  await eventBus.initialize();

  const memoryStore = new SwarmMemoryManager(':memory:');
  await memoryStore.initialize();

  // QUIC configuration
  const quicConfig: QUICConfig = {
    enabled: true,
    host: 'localhost',
    port: 9000,
    channels: [
      {
        name: 'coordination',
        id: 'coord-1',
        type: 'broadcast',
        priority: 5,
        ordered: true,
        reliable: true
      },
      {
        name: 'results',
        id: 'results-1',
        type: 'broadcast',
        priority: 7,
        ordered: false,
        reliable: true
      },
      {
        name: 'metrics',
        id: 'metrics-1',
        type: 'broadcast',
        priority: 3,
        ordered: false,
        reliable: false
      }
    ],
    connectionTimeout: 5000,
    enable0RTT: true,
    maxConcurrentStreams: 100
  };

  // Base agent configuration
  const createAgentConfig = (
    type: string,
    capabilities: AgentCapability[]
  ): BaseAgentConfig => ({
    type: type as any,
    capabilities,
    context: {
      id: type,
      type: type,
      status: AgentStatus.INITIALIZING,
      metadata: {}
    },
    memoryStore,
    eventBus,
    quicConfig // Enable QUIC
  });

  // Create coordinator
  const coordinator = new CoordinatorAgent(
    createAgentConfig('coordinator', [
      {
        name: 'task-distribution',
        version: '1.0.0',
        description: 'Distribute tasks to workers'
      }
    ])
  );

  // Create workers
  const workers: WorkerAgent[] = [];
  for (let i = 0; i < 3; i++) {
    const worker = new WorkerAgent(
      createAgentConfig(`worker-${i}`, [
        {
          name: 'task-execution',
          version: '1.0.0',
          description: 'Execute assigned tasks'
        }
      ])
    );
    workers.push(worker);
  }

  // Create monitor
  const monitor = new MonitorAgent(
    createAgentConfig('monitor', [
      {
        name: 'fleet-monitoring',
        version: '1.0.0',
        description: 'Monitor fleet health and performance'
      }
    ])
  );

  // Initialize all agents
  console.log('Initializing agents...\n');
  await coordinator.initialize();
  await Promise.all(workers.map(w => w.initialize()));
  await monitor.initialize();

  // Wait for QUIC connections
  await delay(1000);

  // Check QUIC health
  console.log('\n=== QUIC Health Status ===\n');
  const coordinatorHealth = coordinator.getQUICHealth();
  console.log('Coordinator:', coordinatorHealth);

  const workerHealth = workers[0].getQUICHealth();
  console.log('Worker 0:', workerHealth);

  const monitorHealth = monitor.getQUICHealth();
  console.log('Monitor:', monitorHealth);

  // Distribute work via coordinator
  console.log('\n=== Distributing Work ===\n');
  await coordinator.assignTask({
    id: 'demo-task-1',
    type: 'distribute',
    description: 'Distribute work to fleet',
    priority: 5,
    status: 'assigned',
    assignedAt: new Date()
  });

  // Wait for work completion
  await delay(2000);

  // Collect metrics
  console.log('\n=== Collecting Metrics ===\n');
  const metrics = await monitor.assignTask({
    id: 'metrics-collection',
    type: 'monitor',
    description: 'Collect fleet metrics',
    priority: 3,
    status: 'assigned',
    assignedAt: new Date()
  });

  console.log('Metrics collected:', JSON.stringify(metrics, null, 2));

  // Get QUIC statistics
  console.log('\n=== QUIC Statistics ===\n');
  const coordinatorStats = coordinator.getQUICStats();
  console.log('Coordinator Stats:', coordinatorStats);

  // Cleanup
  console.log('\n=== Cleanup ===\n');
  await coordinator.terminate();
  await Promise.all(workers.map(w => w.terminate()));
  await monitor.terminate();

  await memoryStore.close();
  await eventBus.close();

  console.log('\n=== Demo Complete ===');
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run demo
if (require.main === module) {
  runQUICDemo()
    .then(() => {
      console.log('\nDemo completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('\nDemo failed:', error);
      process.exit(1);
    });
}

export { runQUICDemo };
