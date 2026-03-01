/**
 * agent-browser Session Manager
 * Manages multiple isolated browser sessions for parallel testing
 */

import { execSync } from 'child_process';
import { AgentBrowserCommandExecutor, CommandResult } from './command-executor';

// Session information
export interface BrowserSessionInfo {
  name: string;
  createdAt: Date;
  lastActivity: Date;
  currentUrl?: string;
  status: 'active' | 'idle' | 'closed';
  executor: AgentBrowserCommandExecutor;
}

// Session creation options
export interface CreateSessionOptions {
  name?: string;
  headed?: boolean;
  timeout?: number;
  initialUrl?: string;
}

/**
 * Manage multiple isolated browser sessions
 */
export class AgentBrowserSessionManager {
  private sessions: Map<string, BrowserSessionInfo> = new Map();
  private activeSession: string | null = null;
  private sessionCounter = 0;

  constructor(private readonly defaultConfig?: { headed?: boolean; timeout?: number }) {}

  // ========================================================================
  // Session lifecycle
  // ========================================================================

  /**
   * Create a new isolated session
   */
  async createSession(options?: CreateSessionOptions): Promise<BrowserSessionInfo> {
    const name = options?.name ?? this.generateSessionName();

    // Check if session already exists
    if (this.sessions.has(name)) {
      throw new Error(`Session "${name}" already exists`);
    }

    // Create executor for this session
    const executor = new AgentBrowserCommandExecutor({
      sessionName: name,
      headed: options?.headed ?? this.defaultConfig?.headed ?? false,
      timeout: options?.timeout ?? this.defaultConfig?.timeout ?? 30000,
    });

    const session: BrowserSessionInfo = {
      name,
      createdAt: new Date(),
      lastActivity: new Date(),
      status: 'idle',
      executor,
    };

    this.sessions.set(name, session);

    // Navigate to initial URL if provided
    if (options?.initialUrl) {
      const result = executor.open(options.initialUrl);
      if (result.success) {
        session.currentUrl = options.initialUrl;
        session.status = 'active';
      }
    }

    // Set as active if first session
    if (!this.activeSession) {
      this.activeSession = name;
    }

    return session;
  }

  /**
   * Get or create a session by name
   */
  async getOrCreateSession(name: string, options?: Omit<CreateSessionOptions, 'name'>): Promise<BrowserSessionInfo> {
    const existing = this.sessions.get(name);
    if (existing) {
      return existing;
    }
    return this.createSession({ ...options, name });
  }

  /**
   * Get session by name
   */
  getSession(name: string): BrowserSessionInfo | undefined {
    return this.sessions.get(name);
  }

  /**
   * Get currently active session
   */
  getActiveSession(): BrowserSessionInfo | undefined {
    if (!this.activeSession) return undefined;
    return this.sessions.get(this.activeSession);
  }

  /**
   * Switch to a different session
   */
  switchSession(name: string): void {
    if (!this.sessions.has(name)) {
      throw new Error(`Session "${name}" not found`);
    }
    this.activeSession = name;
  }

  /**
   * List all sessions
   */
  listSessions(): BrowserSessionInfo[] {
    return Array.from(this.sessions.values());
  }

  /**
   * List active session names from CLI
   */
  listCliSessions(): string[] {
    try {
      const output = execSync('npx agent-browser session list', {
        encoding: 'utf-8',
        timeout: 5000,
      });

      // Parse output like:
      // Active sessions:
      // -> default
      //    test1
      const lines = output.split('\n');
      const sessions: string[] = [];

      for (const line of lines) {
        const match = line.match(/^\s*(?:->)?\s*(\w+)\s*$/);
        if (match) {
          sessions.push(match[1]);
        }
      }

      return sessions;
    } catch {
      return [];
    }
  }

  // ========================================================================
  // Session control
  // ========================================================================

  /**
   * Close a specific session
   */
  async closeSession(name: string): Promise<CommandResult<void>> {
    const session = this.sessions.get(name);
    if (!session) {
      return { success: false, error: `Session "${name}" not found` };
    }

    // Terminate the daemon entirely (not just close browser)
    // This is CRITICAL to prevent memory leaks - the daemon persists otherwise!
    const result = session.executor.terminateDaemon();

    if (result.success) {
      session.status = 'closed';
      this.sessions.delete(name);

      // Switch active session if needed
      if (this.activeSession === name) {
        const remaining = Array.from(this.sessions.keys());
        this.activeSession = remaining.length > 0 ? remaining[0] : null;
      }
    }

    return result;
  }

  /**
   * Close all sessions
   */
  async closeAllSessions(): Promise<void> {
    const names = Array.from(this.sessions.keys());

    for (const name of names) {
      await this.closeSession(name);
    }

    this.sessions.clear();
    this.activeSession = null;
  }

  /**
   * Clean up idle sessions older than maxAge
   */
  async cleanupIdleSessions(maxAgeMs: number = 5 * 60 * 1000): Promise<number> {
    const now = Date.now();
    let closedCount = 0;

    for (const [name, session] of this.sessions) {
      if (session.status === 'idle') {
        const age = now - session.lastActivity.getTime();
        if (age > maxAgeMs) {
          await this.closeSession(name);
          closedCount++;
        }
      }
    }

    return closedCount;
  }

  // ========================================================================
  // Session operations via active session
  // ========================================================================

  /**
   * Get executor for active session
   */
  getExecutor(): AgentBrowserCommandExecutor {
    const session = this.getActiveSession();
    if (!session) {
      throw new Error('No active session. Create one first.');
    }
    return session.executor;
  }

  /**
   * Get executor for specific session
   */
  getSessionExecutor(name: string): AgentBrowserCommandExecutor {
    const session = this.sessions.get(name);
    if (!session) {
      throw new Error(`Session "${name}" not found`);
    }
    return session.executor;
  }

  /**
   * Update session activity timestamp
   */
  touchSession(name: string): void {
    const session = this.sessions.get(name);
    if (session) {
      session.lastActivity = new Date();
    }
  }

  /**
   * Update session URL
   */
  updateSessionUrl(name: string, url: string): void {
    const session = this.sessions.get(name);
    if (session) {
      session.currentUrl = url;
      session.lastActivity = new Date();
      session.status = 'active';
    }
  }

  // ========================================================================
  // Private helpers
  // ========================================================================

  private generateSessionName(): string {
    return `session-${++this.sessionCounter}-${Date.now().toString(36)}`;
  }

  // ========================================================================
  // Stats
  // ========================================================================

  /**
   * Get session statistics
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    idleSessions: number;
    closedSessions: number;
    activeSessionName: string | null;
  } {
    let active = 0;
    let idle = 0;
    let closed = 0;

    for (const session of this.sessions.values()) {
      switch (session.status) {
        case 'active': active++; break;
        case 'idle': idle++; break;
        case 'closed': closed++; break;
      }
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions: active,
      idleSessions: idle,
      closedSessions: closed,
      activeSessionName: this.activeSession,
    };
  }
}

// Singleton instance
let sessionManagerInstance: AgentBrowserSessionManager | null = null;

export function getSessionManager(config?: { headed?: boolean; timeout?: number }): AgentBrowserSessionManager {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new AgentBrowserSessionManager(config);
  }
  return sessionManagerInstance;
}

export function resetSessionManager(): void {
  if (sessionManagerInstance) {
    sessionManagerInstance.closeAllSessions();
    sessionManagerInstance = null;
  }
}
