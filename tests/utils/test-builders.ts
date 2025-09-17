/**
 * Test Builder Patterns for Agentic QE Framework
 * Provides fluent builders for creating test data
 */

import { QEAgentConfig, AgentState, AgentType } from '../../src/types';

/**
 * Agent Test Builder using Builder pattern for complex test data
 */
export class AgentTestBuilder {
  private config: Partial<QEAgentConfig> = {
    name: 'test-agent',
    type: 'test-executor' as AgentType,
    description: 'Test agent for testing',
    category: 'testing',
    version: '1.0.0',
    capabilities: [],
    config: {},
    enabled: true
  };

  withName(name: string): this {
    this.config.name = name;
    return this;
  }

  withType(type: AgentType): this {
    this.config.type = type;
    return this;
  }

  withCapabilities(capabilities: string[]): this {
    this.config.capabilities = capabilities;
    return this;
  }

  withDescription(description: string): this {
    this.config.description = description;
    return this;
  }

  withCategory(category: string): this {
    this.config.category = category;
    return this;
  }

  withConfig(config: any): this {
    this.config.config = config;
    return this;
  }

  disabled(): this {
    this.config.enabled = false;
    return this;
  }

  build(): QEAgentConfig {
    return this.config as QEAgentConfig;
  }
}

/**
 * Test Context Builder for agent execution
 */
export class TestContextBuilder {
  private context: any = {
    task: 'default test task',
    projectPath: '/test/project',
    sessionId: 'test-session-123',
    options: {}
  };

  withTask(task: string): this {
    this.context.task = task;
    return this;
  }

  withProjectPath(path: string): this {
    this.context.projectPath = path;
    return this;
  }

  withSessionId(id: string): this {
    this.context.sessionId = id;
    return this;
  }

  withOptions(options: any): this {
    this.context.options = { ...this.context.options, ...options };
    return this;
  }

  withAnalysisDepth(depth: 'shallow' | 'deep'): this {
    this.context.analysisDepth = depth;
    return this;
  }

  build(): any {
    return { ...this.context };
  }
}

/**
 * Test Memory Builder for mocking memory operations
 */
export class TestMemoryBuilder {
  private entries: Map<string, any> = new Map();

  withEntry(key: string, value: any): this {
    this.entries.set(key, {
      key,
      value,
      timestamp: new Date(),
      type: 'test-data',
      sessionId: 'test-session',
      agentId: 'test-agent'
    });
    return this;
  }

  withAgentState(agentId: string, state: any): this {
    const key = `agent:${agentId}:state`;
    this.entries.set(key, {
      key,
      value: state,
      timestamp: new Date(),
      type: 'agent-state',
      sessionId: 'test-session',
      agentId
    });
    return this;
  }

  withTestResults(results: any[]): this {
    const key = 'test:results';
    this.entries.set(key, {
      key,
      value: results,
      timestamp: new Date(),
      type: 'test-results',
      sessionId: 'test-session'
    });
    return this;
  }

  build(): Map<string, any> {
    return new Map(this.entries);
  }
}

/**
 * Test Session Builder
 */
export class TestSessionBuilder {
  private session: any = {
    id: 'session-123',
    name: 'Test Session',
    status: 'active',
    startTime: new Date(),
    agents: [],
    configuration: {
      environment: {
        name: 'test',
        baseUrl: 'http://localhost:3000',
        variables: {}
      }
    }
  };

  withId(id: string): this {
    this.session.id = id;
    return this;
  }

  withName(name: string): this {
    this.session.name = name;
    return this;
  }

  withStatus(status: string): this {
    this.session.status = status;
    return this;
  }

  withAgents(agents: string[]): this {
    this.session.agents = agents;
    return this;
  }

  withEnvironment(env: any): this {
    this.session.configuration.environment = {
      ...this.session.configuration.environment,
      ...env
    };
    return this;
  }

  build(): any {
    return { ...this.session };
  }
}

/**
 * Test Result Builder
 */
export class TestResultBuilder {
  private result: any = {
    id: 'result-123',
    testName: 'Test Case',
    status: 'passed',
    duration: 100,
    assertions: [],
    errors: [],
    timestamp: new Date()
  };

  withId(id: string): this {
    this.result.id = id;
    return this;
  }

  withName(name: string): this {
    this.result.testName = name;
    return this;
  }

  withStatus(status: 'passed' | 'failed' | 'skipped'): this {
    this.result.status = status;
    return this;
  }

  withDuration(duration: number): this {
    this.result.duration = duration;
    return this;
  }

  withAssertion(assertion: any): this {
    this.result.assertions.push(assertion);
    return this;
  }

  withError(error: any): this {
    this.result.errors.push(error);
    this.result.status = 'failed';
    return this;
  }

  build(): any {
    return { ...this.result };
  }
}

// Export factory functions for convenience
export const createTestAgent = () => new AgentTestBuilder();
export const createTestContext = () => new TestContextBuilder();
export const createTestMemory = () => new TestMemoryBuilder();
export const createTestSession = () => new TestSessionBuilder();
export const createTestResult = () => new TestResultBuilder();