#!/usr/bin/env node

/**
 * QE Session Manager Hook
 * Manages QE test sessions, coordination, and state persistence
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class QESessionManagerHook {
  constructor() {
    this.sessions = new Map();
    this.config = {
      maxSessions: 10,
      sessionTimeout: 3600000, // 1 hour
      persistenceEnabled: true,
      cleanupInterval: 300000, // 5 minutes
      memoryNamespace: 'qe/sessions'
    };
    this.cleanupTimer = null;
  }

  async execute(args = {}) {
    try {
      console.log('🎯 QE Session Manager: Starting session management...');

      // Parse arguments
      this.parseArguments(args);

      // Load configuration
      await this.loadConfiguration();

      // Restore persistent sessions
      await this.restoreSessions();

      // Setup cleanup timer
      this.setupCleanupTimer();

      // Process command
      const result = await this.processCommand();

      console.log('✅ QE Session Manager: Session management completed successfully');

      return {
        success: true,
        result,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ QE Session Manager failed:', error.message);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  parseArguments(args) {
    this.command = args.command || 'status';
    this.sessionId = args.sessionId || null;
    this.sessionData = args.sessionData || {};
    this.config = { ...this.config, ...args.config };
  }

  async loadConfiguration() {
    try {
      const configPath = '.claude/hooks/qe/session-manager.config.json';
      const configExists = await fs.access(configPath).then(() => true).catch(() => false);

      if (configExists) {
        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
        this.config = { ...this.config, ...config };
      } else {
        await this.createDefaultConfiguration(configPath);
      }

    } catch (error) {
      console.warn('⚠️ Could not load session manager configuration:', error.message);
    }
  }

  async createDefaultConfiguration(configPath) {
    const defaultConfig = {
      maxSessions: 10,
      sessionTimeout: 3600000,
      persistenceEnabled: true,
      cleanupInterval: 300000,
      memoryNamespace: 'qe/sessions',
      retention: {
        maxAge: 86400000, // 24 hours
        maxCount: 100
      },
      notifications: {
        enabled: true,
        events: ['session-start', 'session-end', 'session-timeout', 'session-error']
      },
      agents: {
        autoSpawn: true,
        defaultAgents: ['tester', 'reviewer', 'analyst']
      }
    };

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
    this.config = { ...this.config, ...defaultConfig };
  }

  async restoreSessions() {
    if (!this.config.persistenceEnabled) return;

    try {
      console.log('🔄 Restoring persistent sessions...');

      // Load sessions from file system
      await this.loadSessionsFromFile();

      // Load sessions from Claude-Flow memory
      await this.loadSessionsFromMemory();

      console.log(`📊 Restored ${this.sessions.size} session(s)`);

    } catch (error) {
      console.warn('⚠️ Could not restore sessions:', error.message);
    }
  }

  async loadSessionsFromFile() {
    try {
      const sessionsDir = 'tests/sessions';
      const files = await fs.readdir(sessionsDir).catch(() => []);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const sessionPath = path.join(sessionsDir, file);
          const sessionData = JSON.parse(await fs.readFile(sessionPath, 'utf8'));

          if (this.isSessionValid(sessionData)) {
            this.sessions.set(sessionData.sessionId, sessionData);
          }
        }
      }

    } catch (error) {
      console.warn('⚠️ Could not load sessions from file:', error.message);
    }
  }

  async loadSessionsFromMemory() {
    try {
      // Get all session keys from Claude-Flow memory
      const { stdout } = await execAsync(`npx claude-flow@alpha hooks memory-list --namespace "${this.config.memoryNamespace}"`);
      const keys = stdout.split('\n').filter(key => key.trim());

      for (const key of keys) {
        try {
          const { stdout: sessionData } = await execAsync(`npx claude-flow@alpha hooks memory-get --key "${key}"`);
          const session = JSON.parse(sessionData);

          if (this.isSessionValid(session)) {
            this.sessions.set(session.sessionId, session);
          }

        } catch (error) {
          console.warn(`⚠️ Could not load session from memory key ${key}:`, error.message);
        }
      }

    } catch (error) {
      console.warn('⚠️ Could not load sessions from memory:', error.message);
    }
  }

  isSessionValid(session) {
    if (!session || !session.sessionId || !session.createdAt) {
      return false;
    }

    const sessionAge = Date.now() - new Date(session.createdAt).getTime();
    const maxAge = this.config.retention?.maxAge || 86400000;

    return sessionAge < maxAge;
  }

  setupCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.config.cleanupInterval);
  }

  async processCommand() {
    switch (this.command) {
      case 'create':
        return await this.createSession();
      case 'get':
        return await this.getSession();
      case 'update':
        return await this.updateSession();
      case 'delete':
        return await this.deleteSession();
      case 'list':
        return await this.listSessions();
      case 'status':
        return await this.getStatus();
      case 'cleanup':
        return await this.cleanupExpiredSessions();
      case 'export':
        return await this.exportSessions();
      case 'import':
        return await this.importSessions();
      case 'coordinate':
        return await this.coordinateAgents();
      default:
        throw new Error(`Unknown command: ${this.command}`);
    }
  }

  async createSession() {
    console.log('🆕 Creating new QE session...');

    // Check session limit
    if (this.sessions.size >= this.config.maxSessions) {
      await this.cleanupExpiredSessions();

      if (this.sessions.size >= this.config.maxSessions) {
        throw new Error(`Maximum number of sessions reached: ${this.config.maxSessions}`);
      }
    }

    const sessionId = this.sessionId || `qe-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const session = {
      sessionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      type: this.sessionData.type || 'test',
      suite: this.sessionData.suite || 'default',
      environment: this.sessionData.environment || 'test',
      agents: [],
      metrics: {
        testsRun: 0,
        testsPassed: 0,
        testsFailed: 0,
        coverage: 0,
        duration: 0
      },
      hooks: {
        preTest: [],
        postTest: [],
        qualityGates: []
      },
      coordination: {
        swarmId: null,
        topology: 'mesh',
        agentCount: 0
      },
      data: { ...this.sessionData },
      events: []
    };

    // Add session to memory
    this.sessions.set(sessionId, session);

    // Persist session
    await this.persistSession(session);

    // Spawn default agents if configured
    if (this.config.agents?.autoSpawn) {
      await this.spawnDefaultAgents(session);
    }

    // Notify about session creation
    await this.notifyEvent('session-start', session);

    // Record event
    this.addEvent(session, 'session-created', { sessionId });

    console.log(`✅ QE session created: ${sessionId}`);

    return {
      sessionId,
      session,
      message: 'Session created successfully'
    };
  }

  async getSession() {
    if (!this.sessionId) {
      throw new Error('Session ID is required');
    }

    const session = this.sessions.get(this.sessionId);

    if (!session) {
      throw new Error(`Session not found: ${this.sessionId}`);
    }

    return {
      sessionId: this.sessionId,
      session,
      message: 'Session retrieved successfully'
    };
  }

  async updateSession() {
    if (!this.sessionId) {
      throw new Error('Session ID is required');
    }

    const session = this.sessions.get(this.sessionId);

    if (!session) {
      throw new Error(`Session not found: ${this.sessionId}`);
    }

    // Update session data
    Object.assign(session, this.sessionData);
    session.updatedAt = new Date().toISOString();

    // Persist updated session
    await this.persistSession(session);

    // Record event
    this.addEvent(session, 'session-updated', this.sessionData);

    return {
      sessionId: this.sessionId,
      session,
      message: 'Session updated successfully'
    };
  }

  async deleteSession() {
    if (!this.sessionId) {
      throw new Error('Session ID is required');
    }

    const session = this.sessions.get(this.sessionId);

    if (!session) {
      throw new Error(`Session not found: ${this.sessionId}`);
    }

    // Remove session from memory
    this.sessions.delete(this.sessionId);

    // Remove persistence
    await this.removeSessionPersistence(this.sessionId);

    // Notify about session deletion
    await this.notifyEvent('session-end', session);

    return {
      sessionId: this.sessionId,
      message: 'Session deleted successfully'
    };
  }

  async listSessions() {
    const sessionList = Array.from(this.sessions.values()).map(session => ({
      sessionId: session.sessionId,
      status: session.status,
      type: session.type,
      suite: session.suite,
      environment: session.environment,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      agentCount: session.agents.length,
      metrics: session.metrics
    }));

    return {
      sessions: sessionList,
      count: sessionList.length,
      message: `Found ${sessionList.length} session(s)`
    };
  }

  async getStatus() {
    const activeSessions = Array.from(this.sessions.values()).filter(s => s.status === 'active');
    const completedSessions = Array.from(this.sessions.values()).filter(s => s.status === 'completed');
    const errorSessions = Array.from(this.sessions.values()).filter(s => s.status === 'error');

    const totalTests = Array.from(this.sessions.values())
      .reduce((sum, session) => sum + session.metrics.testsRun, 0);

    const totalPassed = Array.from(this.sessions.values())
      .reduce((sum, session) => sum + session.metrics.testsPassed, 0);

    const status = {
      totalSessions: this.sessions.size,
      activeSessions: activeSessions.length,
      completedSessions: completedSessions.length,
      errorSessions: errorSessions.length,
      totalTests,
      totalPassed,
      passRate: totalTests > 0 ? (totalPassed / totalTests) * 100 : 0,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      config: this.config
    };

    return {
      status,
      message: 'Session manager status retrieved successfully'
    };
  }

  async cleanupExpiredSessions() {
    console.log('🧹 Cleaning up expired sessions...');

    let cleanedCount = 0;
    const now = Date.now();

    for (const [sessionId, session] of this.sessions.entries()) {
      const sessionAge = now - new Date(session.createdAt).getTime();

      // Check if session is expired
      if (sessionAge > this.config.sessionTimeout ||
          (this.config.retention?.maxAge && sessionAge > this.config.retention.maxAge)) {

        // Notify about session timeout
        await this.notifyEvent('session-timeout', session);

        // Remove session
        this.sessions.delete(sessionId);
        await this.removeSessionPersistence(sessionId);

        cleanedCount++;
      }
    }

    // Enforce maximum count limit
    if (this.config.retention?.maxCount && this.sessions.size > this.config.retention.maxCount) {
      const sessionArray = Array.from(this.sessions.entries());
      sessionArray.sort(([, a], [, b]) => new Date(a.createdAt) - new Date(b.createdAt));

      const excessCount = this.sessions.size - this.config.retention.maxCount;
      for (let i = 0; i < excessCount; i++) {
        const [sessionId] = sessionArray[i];
        this.sessions.delete(sessionId);
        await this.removeSessionPersistence(sessionId);
        cleanedCount++;
      }
    }

    console.log(`🗑️ Cleaned up ${cleanedCount} expired session(s)`);

    return {
      cleanedCount,
      remainingSessions: this.sessions.size,
      message: `Cleaned up ${cleanedCount} expired sessions`
    };
  }

  async exportSessions() {
    const exportData = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      sessionCount: this.sessions.size,
      sessions: Array.from(this.sessions.values())
    };

    const exportPath = `tests/sessions/export-${Date.now()}.json`;
    await fs.mkdir(path.dirname(exportPath), { recursive: true });
    await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2));

    return {
      exportPath,
      sessionCount: this.sessions.size,
      message: `Exported ${this.sessions.size} sessions to ${exportPath}`
    };
  }

  async importSessions() {
    const importPath = this.sessionData.importPath;

    if (!importPath) {
      throw new Error('Import path is required');
    }

    const importData = JSON.parse(await fs.readFile(importPath, 'utf8'));

    if (!importData.sessions || !Array.isArray(importData.sessions)) {
      throw new Error('Invalid import data format');
    }

    let importedCount = 0;

    for (const session of importData.sessions) {
      if (this.isSessionValid(session) && !this.sessions.has(session.sessionId)) {
        this.sessions.set(session.sessionId, session);
        await this.persistSession(session);
        importedCount++;
      }
    }

    return {
      importedCount,
      totalSessions: this.sessions.size,
      message: `Imported ${importedCount} sessions from ${importPath}`
    };
  }

  async coordinateAgents() {
    console.log('🤝 Coordinating QE agents across sessions...');

    if (!this.sessionId) {
      throw new Error('Session ID is required for agent coordination');
    }

    const session = this.sessions.get(this.sessionId);

    if (!session) {
      throw new Error(`Session not found: ${this.sessionId}`);
    }

    // Initialize Claude-Flow swarm if not already done
    if (!session.coordination.swarmId) {
      await this.initializeSwarm(session);
    }

    // Coordinate agents based on session requirements
    const coordinationResult = await this.orchestrateAgents(session);

    // Update session with coordination results
    session.coordination = { ...session.coordination, ...coordinationResult };
    session.updatedAt = new Date().toISOString();

    await this.persistSession(session);

    this.addEvent(session, 'agents-coordinated', coordinationResult);

    return {
      sessionId: this.sessionId,
      coordination: session.coordination,
      message: 'Agent coordination completed successfully'
    };
  }

  async initializeSwarm(session) {
    try {
      // Initialize Claude-Flow swarm
      const { stdout } = await execAsync(`npx claude-flow@alpha swarm init --topology ${session.coordination.topology} --maxAgents 8`);

      const swarmResult = JSON.parse(stdout);
      session.coordination.swarmId = swarmResult.swarmId;

      console.log(`🕸️ Initialized swarm: ${session.coordination.swarmId}`);

    } catch (error) {
      console.warn('⚠️ Could not initialize swarm:', error.message);
    }
  }

  async orchestrateAgents(session) {
    try {
      const agentTypes = this.determineRequiredAgents(session);
      const spawnedAgents = [];

      // Spawn required agents
      for (const agentType of agentTypes) {
        try {
          const { stdout } = await execAsync(`npx claude-flow@alpha agent spawn --type ${agentType} --swarmId ${session.coordination.swarmId}`);
          const agentResult = JSON.parse(stdout);

          spawnedAgents.push({
            type: agentType,
            agentId: agentResult.agentId,
            status: 'active'
          });

        } catch (error) {
          console.warn(`⚠️ Could not spawn ${agentType} agent:`, error.message);
        }
      }

      session.agents = spawnedAgents;

      // Orchestrate tasks across agents
      const orchestrationResult = await this.orchestrateTasks(session);

      return {
        agentCount: spawnedAgents.length,
        agents: spawnedAgents,
        orchestration: orchestrationResult
      };

    } catch (error) {
      console.warn('⚠️ Could not orchestrate agents:', error.message);
      return {
        agentCount: 0,
        agents: [],
        orchestration: null
      };
    }
  }

  determineRequiredAgents(session) {
    const baseAgents = ['tester', 'reviewer'];
    const agentTypes = [...baseAgents];

    // Add agents based on session type
    switch (session.type) {
      case 'unit':
        agentTypes.push('code-analyzer');
        break;
      case 'integration':
        agentTypes.push('system-architect', 'performance-benchmarker');
        break;
      case 'e2e':
        agentTypes.push('coordinator', 'monitor');
        break;
      case 'performance':
        agentTypes.push('perf-analyzer', 'performance-benchmarker');
        break;
    }

    // Add custom agents from session data
    if (session.data.requiredAgents) {
      agentTypes.push(...session.data.requiredAgents);
    }

    return [...new Set(agentTypes)]; // Remove duplicates
  }

  async orchestrateTasks(session) {
    try {
      const taskDescription = this.generateTaskDescription(session);

      const { stdout } = await execAsync(`npx claude-flow@alpha task orchestrate --task "${taskDescription}" --strategy adaptive --priority medium`);

      return JSON.parse(stdout);

    } catch (error) {
      console.warn('⚠️ Could not orchestrate tasks:', error.message);
      return null;
    }
  }

  generateTaskDescription(session) {
    return `Execute ${session.type} tests for ${session.suite} test suite in ${session.environment} environment.
    Session: ${session.sessionId}.
    Requirements: ${JSON.stringify(session.data)}`;
  }

  async spawnDefaultAgents(session) {
    if (!this.config.agents?.defaultAgents) return;

    console.log('🤖 Spawning default agents...');

    const defaultAgents = this.config.agents.defaultAgents;

    for (const agentType of defaultAgents) {
      try {
        const agent = {
          type: agentType,
          agentId: `${agentType}-${session.sessionId}`,
          status: 'active',
          spawnedAt: new Date().toISOString()
        };

        session.agents.push(agent);

      } catch (error) {
        console.warn(`⚠️ Could not spawn default agent ${agentType}:`, error.message);
      }
    }

    await this.persistSession(session);
  }

  async persistSession(session) {
    if (!this.config.persistenceEnabled) return;

    try {
      // Save to file system
      const sessionsDir = 'tests/sessions';
      await fs.mkdir(sessionsDir, { recursive: true });

      const sessionPath = path.join(sessionsDir, `${session.sessionId}.json`);
      await fs.writeFile(sessionPath, JSON.stringify(session, null, 2));

      // Save to Claude-Flow memory
      const memoryKey = `${this.config.memoryNamespace}/${session.sessionId}`;
      await execAsync(`npx claude-flow@alpha hooks memory-store --key "${memoryKey}" --value '${JSON.stringify(session)}'`);

    } catch (error) {
      console.warn('⚠️ Could not persist session:', error.message);
    }
  }

  async removeSessionPersistence(sessionId) {
    try {
      // Remove from file system
      const sessionPath = `tests/sessions/${sessionId}.json`;
      await fs.unlink(sessionPath).catch(() => {});

      // Remove from Claude-Flow memory
      const memoryKey = `${this.config.memoryNamespace}/${sessionId}`;
      await execAsync(`npx claude-flow@alpha hooks memory-delete --key "${memoryKey}"`);

    } catch (error) {
      console.warn('⚠️ Could not remove session persistence:', error.message);
    }
  }

  addEvent(session, eventType, data = {}) {
    const event = {
      type: eventType,
      timestamp: new Date().toISOString(),
      data
    };

    session.events.push(event);

    // Keep only last 100 events
    if (session.events.length > 100) {
      session.events = session.events.slice(-100);
    }
  }

  async notifyEvent(eventType, sessionData) {
    if (!this.config.notifications?.enabled ||
        !this.config.notifications?.events.includes(eventType)) {
      return;
    }

    try {
      const notification = {
        event: eventType,
        sessionId: sessionData.sessionId,
        timestamp: new Date().toISOString(),
        data: sessionData
      };

      await execAsync(`npx claude-flow@alpha hooks notify --event "${eventType}" --data '${JSON.stringify(notification)}'`);

    } catch (error) {
      console.warn('⚠️ Could not send event notification:', error.message);
    }
  }

  // Cleanup on process exit
  cleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const hookArgs = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace('--', '');
    const value = args[i + 1];
    if (key && value) {
      try {
        hookArgs[key] = JSON.parse(value);
      } catch {
        hookArgs[key] = value;
      }
    }
  }

  const hook = new QESessionManagerHook();

  // Setup cleanup on process exit
  process.on('SIGINT', () => hook.cleanup());
  process.on('SIGTERM', () => hook.cleanup());

  hook.execute(hookArgs)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Hook execution failed:', error);
      process.exit(1);
    });
}

module.exports = QESessionManagerHook;