/**
 * Fleet Coordination Example using QUIC Transport
 *
 * Demonstrates real-world usage of QUICTransport for distributed
 * QE fleet coordination with multiple agents.
 *
 * @example
 * ```bash
 * ts-node examples/transport/fleet-coordination-example.ts
 * ```
 */

import { QUICTransport, createQUICTransport } from '../../src/transport/QUICTransport';

/**
 * Fleet Commander - Coordinates multiple QE agents
 */
class FleetCommander {
  private transport: QUICTransport;
  private agents: Map<string, AgentStatus> = new Map();

  async initialize() {
    console.log('[Fleet Commander] Initializing...');

    this.transport = await createQUICTransport({
      host: process.env.FLEET_HOST || 'localhost',
      port: parseInt(process.env.FLEET_PORT || '4433'),
      enable0RTT: true,
      enableTCPFallback: true,
      debug: true
    });

    console.log('[Fleet Commander] Connected via', this.transport.getMode());

    // Subscribe to agent status updates
    await this.transport.receive('agent:status', (data: AgentStatus) => {
      this.handleAgentStatus(data);
    });

    // Subscribe to task completion events
    await this.transport.receive('task:completed', (data: TaskCompletion) => {
      this.handleTaskCompletion(data);
    });

    // Monitor transport health
    this.startHealthMonitoring();

    console.log('[Fleet Commander] Ready to coordinate agents');
  }

  async assignTask(task: Task) {
    console.log('[Fleet Commander] Assigning task:', task.id);

    await this.transport.send('task:assigned', {
      taskId: task.id,
      agentType: task.agentType,
      priority: task.priority,
      payload: task.payload,
      timestamp: Date.now()
    });
  }

  private handleAgentStatus(data: AgentStatus) {
    console.log('[Fleet Commander] Agent status update:', {
      agentId: data.agentId,
      status: data.status,
      load: data.load
    });

    this.agents.set(data.agentId, data);
  }

  private handleTaskCompletion(data: TaskCompletion) {
    console.log('[Fleet Commander] Task completed:', {
      taskId: data.taskId,
      agentId: data.agentId,
      duration: Date.now() - data.startTime
    });
  }

  private startHealthMonitoring() {
    setInterval(() => {
      const metrics = this.transport.getMetrics();

      console.log('[Fleet Commander] Health Check:', {
        mode: metrics.mode,
        state: metrics.state,
        latency: `${metrics.averageLatency.toFixed(2)}ms`,
        activeAgents: this.agents.size,
        uptime: this.formatUptime(metrics.connectionUptime)
      });

      // Check for unhealthy agents
      const now = Date.now();
      for (const [agentId, status] of this.agents.entries()) {
        if (now - status.lastSeen > 60000) {
          console.warn('[Fleet Commander] Agent not responding:', agentId);
        }
      }
    }, 30000);
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }

  async shutdown() {
    console.log('[Fleet Commander] Shutting down...');
    await this.transport.close();
    console.log('[Fleet Commander] Shutdown complete');
  }
}

/**
 * QE Test Generator Agent
 */
class TestGeneratorAgent {
  private transport: QUICTransport;
  private agentId: string;
  private currentLoad = 0;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  async connect() {
    console.log(`[${this.agentId}] Connecting to fleet...`);

    this.transport = await createQUICTransport({
      host: process.env.FLEET_HOST || 'localhost',
      port: parseInt(process.env.FLEET_PORT || '4433'),
      enable0RTT: true,
      debug: false
    });

    console.log(`[${this.agentId}] Connected via`, this.transport.getMode());

    // Listen for task assignments
    await this.transport.receive('task:assigned', async (task: any) => {
      if (task.agentType === 'test-generator') {
        await this.handleTask(task);
      }
    });

    // Report status periodically
    setInterval(() => this.reportStatus(), 10000);

    // Initial status report
    await this.reportStatus();

    console.log(`[${this.agentId}] Ready for tasks`);
  }

  async handleTask(task: any) {
    console.log(`[${this.agentId}] Received task:`, task.taskId);

    const startTime = Date.now();
    this.currentLoad++;

    try {
      // Simulate test generation work
      await this.generateTests(task);

      // Report completion
      await this.transport.send('task:completed', {
        taskId: task.taskId,
        agentId: this.agentId,
        startTime,
        result: {
          testsGenerated: 50,
          coverageIncrease: 15,
          executionTime: Date.now() - startTime
        },
        timestamp: Date.now()
      });

      console.log(`[${this.agentId}] Task completed:`, task.taskId);
    } catch (error) {
      // Report failure
      await this.transport.send('task:failed', {
        taskId: task.taskId,
        agentId: this.agentId,
        error: (error as Error).message,
        timestamp: Date.now()
      });

      console.error(`[${this.agentId}] Task failed:`, task.taskId, error);
    } finally {
      this.currentLoad--;
    }
  }

  private async generateTests(task: any): Promise<void> {
    // Simulate test generation
    return new Promise(resolve => {
      setTimeout(resolve, Math.random() * 2000 + 1000);
    });
  }

  private async reportStatus() {
    await this.transport.send('agent:status', {
      agentId: this.agentId,
      status: this.currentLoad > 0 ? 'busy' : 'ready',
      load: this.currentLoad,
      lastSeen: Date.now(),
      timestamp: Date.now()
    });
  }

  async disconnect() {
    console.log(`[${this.agentId}] Disconnecting...`);
    await this.transport.close();
    console.log(`[${this.agentId}] Disconnected`);
  }
}

/**
 * Performance Monitor - Tracks fleet performance metrics
 */
class PerformanceMonitor {
  private transport: QUICTransport;
  private metrics: Map<string, any[]> = new Map();

  async initialize() {
    console.log('[Performance Monitor] Initializing...');

    this.transport = await createQUICTransport({
      host: process.env.FLEET_HOST || 'localhost',
      port: parseInt(process.env.FLEET_PORT || '4433'),
      enable0RTT: true,
      maxConcurrentStreams: 500
    });

    // Subscribe to all relevant channels
    const channels = [
      'agent:status',
      'task:assigned',
      'task:completed',
      'task:failed'
    ];

    for (const channel of channels) {
      await this.transport.receive(channel, (data: any) => {
        this.collectMetric(channel, data);
      });
    }

    // Report metrics periodically
    setInterval(() => this.reportMetrics(), 60000);

    console.log('[Performance Monitor] Monitoring', channels.length, 'channels');
  }

  private collectMetric(channel: string, data: any) {
    if (!this.metrics.has(channel)) {
      this.metrics.set(channel, []);
    }

    this.metrics.get(channel)!.push({
      data,
      timestamp: Date.now()
    });

    // Keep only last 1000 metrics per channel
    const channelMetrics = this.metrics.get(channel)!;
    if (channelMetrics.length > 1000) {
      channelMetrics.shift();
    }
  }

  private reportMetrics() {
    console.log('\n[Performance Monitor] Metrics Report');
    console.log('='.repeat(50));

    for (const [channel, metrics] of this.metrics.entries()) {
      console.log(`\n${channel}:`);
      console.log(`  Total events: ${metrics.length}`);

      if (metrics.length > 0) {
        const recent = metrics.slice(-60); // Last minute
        console.log(`  Last minute: ${recent.length} events`);
        console.log(`  Rate: ${(recent.length / 60).toFixed(2)} events/sec`);
      }
    }

    // Transport metrics
    const transportMetrics = this.transport.getMetrics();
    console.log('\nTransport Metrics:');
    console.log(`  Mode: ${transportMetrics.mode}`);
    console.log(`  Average Latency: ${transportMetrics.averageLatency.toFixed(2)}ms`);
    console.log(`  Messages Sent: ${transportMetrics.messagesReceived.toLocaleString()}`);
    console.log(`  Messages Received: ${transportMetrics.messagesReceived.toLocaleString()}`);
    console.log(`  Active Streams: ${transportMetrics.activeStreams}`);

    console.log('='.repeat(50) + '\n');
  }

  async shutdown() {
    console.log('[Performance Monitor] Shutting down...');
    await this.transport.close();
  }
}

// Type definitions
interface AgentStatus {
  agentId: string;
  status: 'ready' | 'busy' | 'offline';
  load: number;
  lastSeen: number;
  timestamp: number;
}

interface Task {
  id: string;
  agentType: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  payload: any;
}

interface TaskCompletion {
  taskId: string;
  agentId: string;
  startTime: number;
  result: any;
  timestamp: number;
}

/**
 * Main execution function
 */
async function main() {
  console.log('Starting Fleet Coordination Example...\n');

  // Initialize components
  const commander = new FleetCommander();
  const agent1 = new TestGeneratorAgent('qe-test-generator-01');
  const agent2 = new TestGeneratorAgent('qe-test-generator-02');
  const monitor = new PerformanceMonitor();

  try {
    // Start all components
    await Promise.all([
      commander.initialize(),
      agent1.connect(),
      agent2.connect(),
      monitor.initialize()
    ]);

    console.log('\n✅ All components initialized\n');

    // Assign some test tasks
    const tasks: Task[] = [
      {
        id: 'task-001',
        agentType: 'test-generator',
        priority: 'high',
        payload: { module: 'user-service', type: 'unit' }
      },
      {
        id: 'task-002',
        agentType: 'test-generator',
        priority: 'medium',
        payload: { module: 'api-gateway', type: 'integration' }
      },
      {
        id: 'task-003',
        agentType: 'test-generator',
        priority: 'high',
        payload: { module: 'auth-service', type: 'security' }
      }
    ];

    // Assign tasks with delays
    for (const task of tasks) {
      await commander.assignTask(task);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Run for 2 minutes
    console.log('\n⏱️  Running for 2 minutes...\n');
    await new Promise(resolve => setTimeout(resolve, 120000));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Cleanup
    console.log('\n🛑 Shutting down all components...\n');

    await Promise.all([
      commander.shutdown(),
      agent1.disconnect(),
      agent2.disconnect(),
      monitor.shutdown()
    ]);

    console.log('✅ Example completed\n');
  }
}

// Run example
if (require.main === module) {
  main().catch(console.error);
}

export { FleetCommander, TestGeneratorAgent, PerformanceMonitor };
