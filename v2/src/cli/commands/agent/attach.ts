/**
 * Agent Attach Command
 *
 * Attaches to an agent's console for real-time monitoring of logs,
 * metrics, and status updates. Provides interactive debugging capabilities.
 *
 * @module cli/commands/agent/attach
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { getAgentRegistry } from '../../../mcp/services/AgentRegistry';
import { Logger } from '../../../utils/Logger';
import { EventEmitter } from 'events';

const logger = Logger.getInstance();

export interface AttachOptions {
  agentId: string;
  follow?: boolean;
  showMetrics?: boolean;
  showLogs?: boolean;
  showEvents?: boolean;
  refreshRate?: number;
  filter?: string;
}

export interface AttachSession {
  sessionId: string;
  agentId: string;
  attachedAt: Date;
  events: EventEmitter;
  status: 'attached' | 'detached';
  stats: {
    logsReceived: number;
    eventsReceived: number;
    metricsReceived: number;
  };
}

/**
 * Agent Attach Command Implementation
 */
export class AgentAttachCommand {
  private static readonly LOGS_DIR = path.join(process.cwd(), '.aqe', 'logs');
  private static readonly SESSIONS_DIR = path.join(process.cwd(), '.aqe', 'sessions');
  private static activeSessions: Map<string, AttachSession> = new Map();

  /**
   * Execute agent attach
   *
   * @param options - Attach options
   * @returns Attach session
   */
  static async execute(options: AttachOptions): Promise<AttachSession> {
    const {
      agentId,
      follow = true,
      showMetrics = true,
      showLogs = true,
      showEvents = true,
      refreshRate = 1000,
      filter
    } = options;

    logger.info(`Attaching to agent: ${agentId}`, { follow, showMetrics, showLogs });

    try {
      // Get agent registry
      const registry = getAgentRegistry();

      // Verify agent exists
      const agent = registry.getRegisteredAgent(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      // Check if already attached
      const existing = this.activeSessions.get(agentId);
      if (existing && existing.status === 'attached') {
        logger.warn(`Already attached to agent: ${agentId}`);
        return existing;
      }

      // Create attach session
      const session = await this.createAttachSession(
        agentId,
        agent,
        {
          follow,
          showMetrics,
          showLogs,
          showEvents,
          refreshRate,
          filter
        }
      );

      // Store active session
      this.activeSessions.set(agentId, session);

      // Start monitoring
      if (follow) {
        this.startMonitoring(session, options);
      }

      logger.info(`Attached to agent: ${agentId}`, { sessionId: session.sessionId });

      return session;

    } catch (error) {
      logger.error(`Failed to attach to agent ${agentId}:`, error);
      throw new Error(`Agent attach failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create attach session
   */
  private static async createAttachSession(
    agentId: string,
    agent: any,
    options: any
  ): Promise<AttachSession> {
    const sessionId = `attach-${agentId}-${Date.now()}`;

    const session: AttachSession = {
      sessionId,
      agentId,
      attachedAt: new Date(),
      events: new EventEmitter(),
      status: 'attached',
      stats: {
        logsReceived: 0,
        eventsReceived: 0,
        metricsReceived: 0
      }
    };

    // Save session metadata
    await this.saveSessionMetadata(session, options);

    // Display initial status
    this.displayInitialStatus(agent);

    return session;
  }

  /**
   * Save session metadata
   */
  private static async saveSessionMetadata(session: AttachSession, options: any): Promise<void> {
    await fs.ensureDir(this.SESSIONS_DIR);

    const sessionPath = path.join(this.SESSIONS_DIR, `${session.sessionId}.json`);

    const metadata = {
      sessionId: session.sessionId,
      agentId: session.agentId,
      attachedAt: session.attachedAt.toISOString(),
      status: session.status,
      options
    };

    await fs.writeJson(sessionPath, metadata, { spaces: 2 });
  }

  /**
   * Display initial agent status
   */
  private static displayInitialStatus(agent: any): void {
    console.log('\n' + '='.repeat(60));
    console.log(`📎 Attached to Agent: ${agent.id}`);
    console.log('='.repeat(60));
    console.log(`Type: ${agent.mcpType}`);
    console.log(`Status: ${agent.status}`);
    console.log(`Tasks Completed: ${agent.tasksCompleted}`);
    console.log(`Last Activity: ${new Date(agent.lastActivity).toLocaleString()}`);
    console.log('='.repeat(60) + '\n');
  }

  /**
   * Start monitoring agent activity
   */
  private static startMonitoring(session: AttachSession, options: AttachOptions): void {
    const { agentId, showMetrics, showLogs, showEvents, refreshRate, filter } = options;

    // Monitor logs
    if (showLogs) {
      this.monitorLogs(session, filter);
    }

    // Monitor metrics
    if (showMetrics) {
      this.monitorMetrics(session, refreshRate!);
    }

    // Monitor events
    if (showEvents) {
      this.monitorEvents(session);
    }

    // Setup event handlers
    session.events.on('log', (log) => {
      console.log(`[LOG] ${log}`);
      session.stats.logsReceived++;
    });

    session.events.on('metric', (metric) => {
      console.log(`[METRIC] ${JSON.stringify(metric)}`);
      session.stats.metricsReceived++;
    });

    session.events.on('event', (event) => {
      console.log(`[EVENT] ${event.type}: ${event.message}`);
      session.stats.eventsReceived++;
    });
  }

  /**
   * Monitor agent logs
   */
  private static monitorLogs(session: AttachSession, filter?: string): void {
    const logPath = path.join(this.LOGS_DIR, `${session.agentId}.log`);

    let lastPosition = 0;

    const checkLogs = async () => {
      try {
        if (!await fs.pathExists(logPath)) {
          return;
        }

        const stats = await fs.stat(logPath);

        if (stats.size > lastPosition) {
          const stream = fs.createReadStream(logPath, {
            start: lastPosition,
            encoding: 'utf-8'
          });

          stream.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            lines.forEach((line: string) => {
              if (line.trim() && (!filter || line.includes(filter))) {
                session.events.emit('log', line);
              }
            });
          });

          lastPosition = stats.size;
        }
      } catch (error) {
        logger.error('Error monitoring logs:', error);
      }
    };

    // Check logs every second
    const interval = setInterval(checkLogs, 1000);

    // Store interval for cleanup
    (session as any).logInterval = interval;
  }

  /**
   * Monitor agent metrics
   */
  private static monitorMetrics(session: AttachSession, refreshRate: number): void {
    const registry = getAgentRegistry();

    const checkMetrics = () => {
      try {
        const metrics = registry.getAgentMetrics(session.agentId);
        if (metrics) {
          session.events.emit('metric', metrics);
        }
      } catch (error) {
        logger.error('Error monitoring metrics:', error);
      }
    };

    const interval = setInterval(checkMetrics, refreshRate);

    // Store interval for cleanup
    (session as any).metricsInterval = interval;
  }

  /**
   * Monitor agent events
   */
  private static monitorEvents(session: AttachSession): void {
    // This would connect to the agent's event bus
    // For now, simulate with periodic checks

    const checkEvents = () => {
      // Placeholder for event monitoring
      // In real implementation, would subscribe to agent's EventBus
    };

    const interval = setInterval(checkEvents, 2000);

    // Store interval for cleanup
    (session as any).eventsInterval = interval;
  }

  /**
   * Get active session
   */
  static getActiveSession(agentId: string): AttachSession | undefined {
    return this.activeSessions.get(agentId);
  }

  /**
   * Get all active sessions
   */
  static getAllActiveSessions(): AttachSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Check if attached to agent
   */
  static isAttached(agentId: string): boolean {
    const session = this.activeSessions.get(agentId);
    return session !== undefined && session.status === 'attached';
  }
}
