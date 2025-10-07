/**
 * Agent Detach Command
 *
 * Detaches from an active agent console session, cleaning up resources
 * and saving session data. Supports graceful detachment with statistics.
 *
 * @module cli/commands/agent/detach
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { AgentAttachCommand, AttachSession } from './attach';
import { Logger } from '../../../utils/Logger';

const logger = Logger.getInstance();

export interface DetachOptions {
  agentId: string;
  saveSession?: boolean;
  showStats?: boolean;
  force?: boolean;
}

export interface DetachResult {
  agentId: string;
  sessionId: string;
  detachedAt: Date;
  duration: number;
  stats: {
    logsReceived: number;
    eventsReceived: number;
    metricsReceived: number;
  };
  sessionSaved: boolean;
}

/**
 * Agent Detach Command Implementation
 */
export class AgentDetachCommand {
  private static readonly SESSIONS_DIR = path.join(process.cwd(), '.aqe', 'sessions');
  private static readonly ARCHIVE_DIR = path.join(this.SESSIONS_DIR, 'archive');

  /**
   * Execute agent detach
   *
   * @param options - Detach options
   * @returns Detach result
   */
  static async execute(options: DetachOptions): Promise<DetachResult> {
    const {
      agentId,
      saveSession = true,
      showStats = true,
      force = false
    } = options;

    logger.info(`Detaching from agent: ${agentId}`, { saveSession, force });

    try {
      // Get active session
      const session = AgentAttachCommand.getActiveSession(agentId);

      if (!session) {
        if (force) {
          logger.warn(`No active session found for agent: ${agentId}, force detaching`);
          return this.createForceDetachResult(agentId);
        }
        throw new Error(`Not attached to agent: ${agentId}`);
      }

      // Calculate session duration
      const duration = Date.now() - session.attachedAt.getTime();

      // Stop monitoring
      await this.stopMonitoring(session);

      // Update session status
      session.status = 'detached';

      // Display stats if requested
      if (showStats) {
        this.displaySessionStats(session, duration);
      }

      // Save session data
      let sessionSaved = false;
      if (saveSession) {
        await this.archiveSession(session, duration);
        sessionSaved = true;
      }

      // Clean up session metadata
      await this.cleanupSession(session);

      const result: DetachResult = {
        agentId,
        sessionId: session.sessionId,
        detachedAt: new Date(),
        duration,
        stats: { ...session.stats },
        sessionSaved
      };

      logger.info(`Detached from agent: ${agentId}`, {
        sessionId: session.sessionId,
        duration: `${(duration / 1000).toFixed(2)}s`
      });

      return result;

    } catch (error) {
      logger.error(`Failed to detach from agent ${agentId}:`, error);

      if (force) {
        logger.warn('Force detaching despite error');
        return this.createForceDetachResult(agentId);
      }

      throw new Error(`Agent detach failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Stop monitoring activities
   */
  private static async stopMonitoring(session: AttachSession): Promise<void> {
    // Clear all intervals
    const intervals = ['logInterval', 'metricsInterval', 'eventsInterval'];

    for (const intervalName of intervals) {
      const interval = (session as any)[intervalName];
      if (interval) {
        clearInterval(interval);
        delete (session as any)[intervalName];
      }
    }

    // Remove all event listeners
    session.events.removeAllListeners();

    logger.debug(`Stopped monitoring for session: ${session.sessionId}`);
  }

  /**
   * Display session statistics
   */
  private static displaySessionStats(session: AttachSession, duration: number): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 Session Statistics');
    console.log('='.repeat(60));
    console.log(`Agent ID: ${session.agentId}`);
    console.log(`Session ID: ${session.sessionId}`);
    console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`Logs Received: ${session.stats.logsReceived}`);
    console.log(`Events Received: ${session.stats.eventsReceived}`);
    console.log(`Metrics Received: ${session.stats.metricsReceived}`);
    console.log('='.repeat(60) + '\n');
  }

  /**
   * Archive session data
   */
  private static async archiveSession(session: AttachSession, duration: number): Promise<void> {
    await fs.ensureDir(this.ARCHIVE_DIR);

    const archivePath = path.join(this.ARCHIVE_DIR, `${session.sessionId}.json`);

    const archiveData = {
      sessionId: session.sessionId,
      agentId: session.agentId,
      attachedAt: session.attachedAt.toISOString(),
      detachedAt: new Date().toISOString(),
      duration,
      stats: session.stats,
      status: 'completed'
    };

    await fs.writeJson(archivePath, archiveData, { spaces: 2 });

    logger.debug(`Session archived: ${archivePath}`);
  }

  /**
   * Cleanup session metadata
   */
  private static async cleanupSession(session: AttachSession): Promise<void> {
    const sessionPath = path.join(this.SESSIONS_DIR, `${session.sessionId}.json`);

    if (await fs.pathExists(sessionPath)) {
      await fs.remove(sessionPath);
      logger.debug(`Session metadata cleaned: ${sessionPath}`);
    }

    // Remove from active sessions
    // This assumes access to the private activeSessions map
    // In production, would need proper API access
  }

  /**
   * Create force detach result
   */
  private static createForceDetachResult(agentId: string): DetachResult {
    return {
      agentId,
      sessionId: 'unknown',
      detachedAt: new Date(),
      duration: 0,
      stats: {
        logsReceived: 0,
        eventsReceived: 0,
        metricsReceived: 0
      },
      sessionSaved: false
    };
  }

  /**
   * Detach all active sessions
   */
  static async detachAll(options: { saveSession?: boolean; showStats?: boolean }): Promise<DetachResult[]> {
    const activeSessions = AgentAttachCommand.getAllActiveSessions();

    logger.info(`Detaching from all active sessions (${activeSessions.length})`);

    const results: DetachResult[] = [];

    for (const session of activeSessions) {
      try {
        const result = await this.execute({
          agentId: session.agentId,
          saveSession: options.saveSession,
          showStats: options.showStats,
          force: false
        });
        results.push(result);
      } catch (error) {
        logger.error(`Failed to detach from agent ${session.agentId}:`, error);
      }
    }

    return results;
  }

  /**
   * Get archived sessions
   */
  static async getArchivedSessions(limit?: number): Promise<any[]> {
    await fs.ensureDir(this.ARCHIVE_DIR);

    const files = await fs.readdir(this.ARCHIVE_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const sessions = await Promise.all(
      jsonFiles.map(async (file) => {
        const filePath = path.join(this.ARCHIVE_DIR, file);
        return await fs.readJson(filePath);
      })
    );

    // Sort by detached time descending
    sessions.sort((a, b) =>
      new Date(b.detachedAt).getTime() - new Date(a.detachedAt).getTime()
    );

    return limit ? sessions.slice(0, limit) : sessions;
  }

  /**
   * Clean up old archived sessions
   */
  static async cleanupOldSessions(olderThanDays: number): Promise<number> {
    await fs.ensureDir(this.ARCHIVE_DIR);

    const files = await fs.readdir(this.ARCHIVE_DIR);
    const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);

    let cleaned = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(this.ARCHIVE_DIR, file);
      const session = await fs.readJson(filePath);

      const detachedAt = new Date(session.detachedAt).getTime();

      if (detachedAt < cutoffTime) {
        await fs.remove(filePath);
        cleaned++;
      }
    }

    logger.info(`Cleaned up ${cleaned} old archived sessions`);

    return cleaned;
  }
}
