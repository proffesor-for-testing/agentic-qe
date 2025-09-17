/**
 * Agentic QE Framework - Main entry point
 * AI-powered Quality Engineering framework with autonomous testing agents
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  QEAgentConfig,
  TestSession,
  TestSuite,
  TestCase,
  TestResult,
  SessionStatus,
  AgentType,
  AgentCapability,
  TestConfiguration,
  DEFAULT_TEST_CONFIG
} from './types';
import { QEAgent, AgentRegistry } from './agents/base/QEAgent';
import { QEMemory } from './memory/QEMemory';
import { HookManager } from './hooks';
import { Logger } from './utils/Logger';

/**
 * Framework configuration options
 */
export interface QEFrameworkConfig {
  maxConcurrentAgents?: number;
  defaultTimeout?: number;
  memoryConfig?: {
    persistPath?: string;
    maxEntries?: number;
    defaultTTL?: number;
  };
  loggerConfig?: {
    level?: string;
    console?: boolean;
    file?: boolean;
  };
  hooksEnabled?: boolean;
  autoCleanup?: boolean;
}

/**
 * Session creation options
 */
export interface SessionOptions {
  name: string;
  environment: string;
  parallel?: number;
  configuration?: Partial<TestConfiguration>;
  metadata?: Record<string, unknown>;
}

/**
 * Main QE Framework class
 * Orchestrates agents, manages sessions, and provides the primary API
 */
export class QEFramework extends EventEmitter {
  private readonly config: Required<QEFrameworkConfig>;
  private readonly logger: Logger;
  private readonly memory: QEMemory;
  private readonly hooks: HookManager;
  private readonly sessions: Map<string, TestSession> = new Map();
  private readonly agents: Map<string, QEAgent> = new Map();
  private readonly agentPool: Map<AgentType, QEAgent[]> = new Map();

  private initialized = false;
  private destroying = false;

  constructor(config: QEFrameworkConfig = {}) {
    super();

    this.config = {
      maxConcurrentAgents: config.maxConcurrentAgents || 10,
      defaultTimeout: config.defaultTimeout || 30000,
      memoryConfig: {
        persistPath: config.memoryConfig?.persistPath || '.qe-memory/framework.json',
        maxEntries: config.memoryConfig?.maxEntries || 10000,
        defaultTTL: config.memoryConfig?.defaultTTL || 3600000
      },
      loggerConfig: {
        level: config.loggerConfig?.level || 'info',
        console: config.loggerConfig?.console ?? true,
        file: config.loggerConfig?.file ?? false
      },
      hooksEnabled: config.hooksEnabled ?? true,
      autoCleanup: config.autoCleanup ?? true
    };

    this.logger = new Logger('QEFramework');
    this.memory = new QEMemory(this.config.memoryConfig, this.logger.child('memory'));
    this.hooks = new HookManager(this.logger.child('hooks'));

    this.setupEventHandlers();
  }

  // ============================================================================
  // Lifecycle Management
  // ============================================================================

  /**
   * Initialize the framework
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.logger.info('Initializing Agentic QE Framework', { config: this.config });

    try {
      // Initialize memory system
      await this.memory.load();

      // Register built-in agent types
      this.registerBuiltinAgents();

      // Initialize agent pools
      this.initializeAgentPools();

      this.initialized = true;
      this.logger.info('QE Framework initialized successfully');

      this.emit('framework-initialized', {
        timestamp: new Date(),
        config: this.config
      });

    } catch (error) {
      this.logger.error('Failed to initialize QE Framework', { error });
      throw error;
    }
  }

  /**
   * Destroy framework and cleanup resources
   */
  public async destroy(): Promise<void> {
    if (this.destroying) {
      return;
    }

    this.destroying = true;
    this.logger.info('Destroying QE Framework');

    try {
      // Stop all active sessions
      for (const session of this.sessions.values()) {
        if (session.status === 'active') {
          await this.endSession(session.id);
        }
      }

      // Destroy all agents
      for (const agent of this.agents.values()) {
        await agent.destroy();
      }

      // Cleanup resources
      await this.memory.destroy();
      this.hooks.destroy();

      // Clear collections
      this.sessions.clear();
      this.agents.clear();
      this.agentPool.clear();

      this.removeAllListeners();
      this.logger.info('QE Framework destroyed');

    } catch (error) {
      this.logger.error('Error during framework destruction', { error });
      throw error;
    }
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Create a new test session
   */
  public async createSession(options: SessionOptions): Promise<string> {
    this.ensureInitialized();

    const sessionId = uuidv4();
    const session: TestSession = {
      id: sessionId,
      name: options.name,
      status: 'active',
      startTime: new Date(),
      testSuites: [],
      agents: [],
      configuration: {
        ...DEFAULT_TEST_CONFIG,
        ...options.configuration,
        environment: {
          name: options.environment,
          baseUrl: options.configuration?.environment?.baseUrl || 'http://localhost:3000',
          variables: options.configuration?.environment?.variables || {}
        }
      },
      results: {
        summary: {
          total: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          blocked: 0,
          passRate: 0,
          duration: 0,
          startTime: new Date(),
          endTime: new Date()
        },
        suites: [],
        artifacts: [],
        metrics: {
          assertions: 0,
          passed: 0,
          failed: 0,
          skipped: 0
        },
        reports: []
      },
      metadata: options.metadata
    };

    this.sessions.set(sessionId, session);

    // Store in memory
    await this.memory.store({
      key: `session:${sessionId}`,
      value: session,
      type: 'session',
      sessionId,
      timestamp: new Date(),
      tags: ['session', options.environment]
    });

    // Emit hook event
    if (this.config.hooksEnabled) {
      await this.hooks.emitHook({
        type: 'session-start',
        timestamp: new Date(),
        sessionId,
        data: { session, options }
      });
    }

    this.logger.info(`Created test session: ${sessionId}`, {
      name: options.name,
      environment: options.environment
    });

    this.emit('session-created', { sessionId, session });
    return sessionId;
  }

  /**
   * Get session by ID
   */
  public getSession(sessionId: string): TestSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * List all sessions
   */
  public getSessions(): TestSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * End a test session
   */
  public async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== 'active') {
      return;
    }

    session.status = 'completed';
    session.endTime = new Date();

    // Stop all session agents
    for (const agentId of session.agents) {
      const agent = this.agents.get(agentId);
      if (agent) {
        await agent.stop();
      }
    }

    // Update memory
    await this.memory.update(`session:${sessionId}`, { value: session });

    // Emit hook event
    if (this.config.hooksEnabled) {
      await this.hooks.emitHook({
        type: 'session-end',
        timestamp: new Date(),
        sessionId,
        data: { session }
      });
    }

    this.logger.info(`Ended test session: ${sessionId}`, {
      duration: session.endTime.getTime() - session.startTime.getTime(),
      status: session.status
    });

    this.emit('session-ended', { sessionId, session });
  }

  // ============================================================================
  // Agent Management
  // ============================================================================

  /**
   * Create and spawn an agent
   */
  public async spawnAgent(
    type: AgentType,
    sessionId: string,
    config?: Partial<QEAgentConfig>
  ): Promise<string> {
    this.ensureInitialized();

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (this.agents.size >= this.config.maxConcurrentAgents) {
      throw new Error(`Maximum concurrent agents limit reached: ${this.config.maxConcurrentAgents}`);
    }

    const agentConfig: QEAgentConfig = {
      id: uuidv4(),
      name: `${type}-${Date.now()}`,
      type,
      capabilities: this.getDefaultCapabilities(type),
      priority: 5,
      timeout: this.config.defaultTimeout,
      retryCount: 3,
      ...config
    };

    const agent = AgentRegistry.create(agentConfig, this.memory, this.hooks);

    this.agents.set(agent.id, agent);
    session.agents.push(agent.id);

    // Add to agent pool
    if (!this.agentPool.has(type)) {
      this.agentPool.set(type, []);
    }
    this.agentPool.get(type)!.push(agent);

    this.logger.info(`Spawned agent: ${agent.id}`, {
      type,
      sessionId,
      name: agent.name
    });

    this.emit('agent-spawned', { agentId: agent.id, agent, sessionId });
    return agent.id;
  }

  /**
   * Get agent by ID
   */
  public getAgent(agentId: string): QEAgent | null {
    return this.agents.get(agentId) || null;
  }

  /**
   * List agents by type or session
   */
  public getAgents(filter?: { type?: AgentType; sessionId?: string; status?: string }): QEAgent[] {
    let agents = Array.from(this.agents.values());

    if (filter?.type) {
      agents = agents.filter(agent => agent.type === filter.type);
    }

    if (filter?.sessionId) {
      const session = this.sessions.get(filter.sessionId);
      if (session) {
        agents = agents.filter(agent => session.agents.includes(agent.id));
      } else {
        return [];
      }
    }

    if (filter?.status) {
      agents = agents.filter(agent => agent.state === filter.status);
    }

    return agents;
  }

  /**
   * Destroy an agent
   */
  public async destroyAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return;
    }

    await agent.destroy();
    this.agents.delete(agentId);

    // Remove from agent pool
    const pool = this.agentPool.get(agent.type);
    if (pool) {
      const index = pool.indexOf(agent);
      if (index >= 0) {
        pool.splice(index, 1);
      }
    }

    // Remove from sessions
    for (const session of this.sessions.values()) {
      const index = session.agents.indexOf(agentId);
      if (index >= 0) {
        session.agents.splice(index, 1);
      }
    }

    this.logger.info(`Destroyed agent: ${agentId}`, { type: agent.type });
    this.emit('agent-destroyed', { agentId, agent });
  }

  // ============================================================================
  // Test Execution
  // ============================================================================

  /**
   * Execute a test suite
   */
  public async executeTestSuite(
    sessionId: string,
    testSuite: TestSuite,
    options?: { agentTypes?: AgentType[]; parallel?: number }
  ): Promise<void> {
    this.ensureInitialized();

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    this.logger.info(`Executing test suite: ${testSuite.id}`, {
      sessionId,
      testCount: testSuite.tests.length
    });

    session.testSuites.push(testSuite.id);

    try {
      const agentTypes = options?.agentTypes || ['test-executor'];
      const parallel = options?.parallel || 1;

      // Spawn required agents
      const agentIds: string[] = [];
      for (const agentType of agentTypes) {
        for (let i = 0; i < parallel; i++) {
          const agentId = await this.spawnAgent(agentType, sessionId);
          agentIds.push(agentId);
        }
      }

      // Execute tests
      const results = await this.executeTests(sessionId, testSuite.tests, agentIds);

      // Update session results
      this.updateSessionResults(session, results);

      this.logger.info(`Completed test suite: ${testSuite.id}`, {
        sessionId,
        results: results.length
      });

    } catch (error) {
      this.logger.error(`Failed to execute test suite: ${testSuite.id}`, {
        sessionId,
        error
      });
      throw error;
    }
  }

  /**
   * Execute tests with agents
   */
  private async executeTests(
    sessionId: string,
    tests: TestCase[],
    agentIds: string[]
  ): Promise<TestResult[]> {
    const results: TestResult[] = [];
    const promises: Promise<TestResult>[] = [];

    for (let i = 0; i < tests.length; i++) {
      const test = tests[i];
      const agentId = agentIds[i % agentIds.length];
      const agent = this.agents.get(agentId);

      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      const promise = this.executeTestWithAgent(sessionId, test, agent);
      promises.push(promise);
    }

    const testResults = await Promise.allSettled(promises);

    for (const result of testResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        // Create failed result for rejected promises
        results.push({
          id: uuidv4(),
          testCaseId: 'unknown',
          status: 'failed',
          startTime: new Date(),
          duration: 0,
          error: {
            type: 'execution-error',
            message: result.reason?.message || 'Unknown error'
          },
          // assertions: []
        });
      }
    }

    return results;
  }

  /**
   * Execute a single test with an agent
   */
  private async executeTestWithAgent(
    sessionId: string,
    test: TestCase,
    agent: QEAgent
  ): Promise<TestResult> {
    const context = {
      sessionId,
      testCaseId: test.id,
      environment: 'test',
      configuration: {},
      startTime: new Date(),
      metadata: { testName: test.name, testType: test.type }
    };

    try {
      const executionResult = await agent.execute(context);

      const testResult: TestResult = {
        id: uuidv4(),
        testCaseId: test.id,
        status: executionResult.status,
        startTime: context.startTime,
        endTime: new Date(),
        duration: executionResult.duration,
        message: executionResult.message,
        error: executionResult.error ? {
          type: 'execution-error',
          message: executionResult.error.message,
          stack: executionResult.error.stack
        } : undefined,
        artifacts: executionResult.artifacts.map(path => ({
          id: uuidv4(),
          type: 'log',
          name: path,
          path,
          size: 0,
          mimeType: 'text/plain'
        })),
        metrics: {
          assertions: 1,
          passed: executionResult.success ? 1 : 0,
          failed: executionResult.success ? 0 : 1,
          skipped: 0
        },
        // assertions: []
      };

      return testResult;

    } catch (error) {
      return {
        id: uuidv4(),
        testCaseId: test.id,
        status: 'failed',
        startTime: context.startTime,
        endTime: new Date(),
        duration: Date.now() - context.startTime.getTime(),
        error: {
          type: 'execution-error',
          message: error instanceof Error ? error.message : String(error)
        },
        // assertions: []
      };
    }
  }

  // ============================================================================
  // Framework Status and Health
  // ============================================================================

  /**
   * Get framework status
   */
  public getStatus(): {
    initialized: boolean;
    sessions: number;
    agents: number;
    memory: any;
    uptime: number;
  } {
    return {
      initialized: this.initialized,
      sessions: this.sessions.size,
      agents: this.agents.size,
      memory: this.memory.getStats(),
      uptime: process.uptime() * 1000
    };
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Array<{ name: string; status: string; message: string }>;
  }> {
    const checks = [];

    // Check initialization
    checks.push({
      name: 'Framework Initialization',
      status: this.initialized ? 'pass' : 'fail',
      message: this.initialized ? 'Framework is initialized' : 'Framework not initialized'
    });

    // Check memory system
    try {
      const memStats = this.memory.getStats();
      checks.push({
        name: 'Memory System',
        status: 'pass',
        message: `${memStats.totalEntries} entries in memory`
      });
    } catch (error) {
      checks.push({
        name: 'Memory System',
        status: 'fail',
        message: error instanceof Error ? error.message : 'Memory system error'
      });
    }

    // Check hook system
    checks.push({
      name: 'Hook System',
      status: 'pass',
      message: `${this.hooks.getHandlers().length} handlers registered`
    });

    // Check agent health
    const healthyAgents = Array.from(this.agents.values())
      .filter(agent => agent.state === 'idle' || agent.state === 'running').length;

    checks.push({
      name: 'Agent Health',
      status: healthyAgents === this.agents.size ? 'pass' : 'warn',
      message: `${healthyAgents}/${this.agents.size} agents healthy`
    });

    const failedChecks = checks.filter(check => check.status === 'fail').length;
    const warnChecks = checks.filter(check => check.status === 'warn').length;

    const status = failedChecks > 0 ? 'unhealthy' :
                  warnChecks > 0 ? 'degraded' : 'healthy';

    return { status, checks };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Framework not initialized. Call initialize() first.');
    }
  }

  private setupEventHandlers(): void {
    // Handle uncaught errors
    this.on('error', (error) => {
      this.logger.error('Framework error', { error });
    });

    // Cleanup on process exit
    process.on('SIGINT', () => {
      this.destroy().catch(error => {
        this.logger.error('Error during cleanup', { error });
      });
    });
  }

  private registerBuiltinAgents(): void {
    // Register built-in agent factories
    // This would be expanded with actual agent implementations
    this.logger.debug('Registering built-in agent types');
  }

  private initializeAgentPools(): void {
    // Initialize empty pools for each agent type
    const agentTypes: AgentType[] = [
      'test-planner', 'test-executor', 'test-analyzer',
      'performance-tester', 'security-tester', 'accessibility-tester',
      'api-tester', 'ui-tester', 'integration-tester'
    ];

    for (const type of agentTypes) {
      this.agentPool.set(type, []);
    }
  }

  private getDefaultCapabilities(type: AgentType): AgentCapability[] {
    const capabilityMap: Partial<Record<AgentType, AgentCapability[]>> = {
      'test-planner': ['test-generation', 'risk-assessment'],
      'test-executor': ['test-execution', 'bug-detection'],
      'test-analyzer': ['test-analysis', 'metrics-collection'],
      'performance-tester': ['performance-monitoring', 'load-simulation'],
      'security-tester': ['security-scanning', 'risk-assessment'],
      'accessibility-tester': ['accessibility-validation'],
      'api-tester': ['api-validation', 'data-validation'],
      'ui-tester': ['ui-automation', 'visual-comparison'],
      'integration-tester': ['test-execution'],
      'load-tester': ['load-simulation'],
      'chaos-tester': ['chaos-engineering'],
      'visual-tester': ['visual-comparison'],
      'mobile-tester': ['cross-platform-testing'],
      'cross-browser-tester': ['cross-platform-testing'],
      'data-validator': ['data-validation'],
      'regression-tester': ['regression-analysis'],
      'smoke-tester': ['test-execution'],
      'e2e-tester': ['test-execution'],
      'unit-tester': ['test-execution'],
      'contract-tester': ['data-validation']
    };

    return capabilityMap[type] || ['test-execution'];
  }

  private updateSessionResults(session: TestSession, results: TestResult[]): void {
    const summary = session.results.summary;

    summary.total += results.length;
    summary.passed += results.filter(r => r.status === 'passed').length;
    summary.failed += results.filter(r => r.status === 'failed').length;
    summary.skipped += results.filter(r => r.status === 'skipped').length;
    summary.blocked += results.filter(r => r.status === 'blocked').length;

    summary.passRate = summary.total > 0 ? (summary.passed / summary.total) * 100 : 0;
    summary.endTime = new Date();
    summary.duration = summary.endTime.getTime() - summary.startTime.getTime();

    // Update metrics
    session.results.metrics.assertions += results.reduce((sum, r) => sum + (r.metrics?.assertions || 0), 0);
    session.results.metrics.passed += results.filter(r => r.status === 'passed').length;
    session.results.metrics.failed += results.filter(r => r.status === 'failed').length;
    session.results.metrics.skipped += results.filter(r => r.status === 'skipped').length;
  }
}

// ============================================================================
// Exports
// ============================================================================

// Re-export core types and classes
export { QEAgent, AgentRegistry } from './agents/base/QEAgent';
export { QEMemory } from './memory/QEMemory';
export { HookManager } from './hooks';
export { Logger } from './utils/Logger';

export * from './types';
export * from './agents/base/QEAgent';
export * from './memory/QEMemory';
export * from './hooks';
export * from './utils/Logger';

// Export main framework class as default
export default QEFramework;