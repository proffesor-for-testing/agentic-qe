/**
 * AgentDependencies Unit Tests
 *
 * Tests for agent dependency configuration including:
 * - Dependency registration
 * - withDI mixin
 * - Agent container creation
 */

import {
  DIContainer,
  DependencyNames,
  AgentDependencyConfig,
  IDIAgent,
  registerAgentDependencies,
  createAgentContainer,
  withDI,
  resetGlobalContainer
} from '../../../src/core/di';

// Mock the providers module to avoid actual API calls
jest.mock('../../../src/providers', () => ({
  LLMProviderFactory: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    getProvider: jest.fn(),
    selectBestProvider: jest.fn().mockReturnValue({ name: 'mock' }),
    createHybridRouter: jest.fn().mockReturnValue({ name: 'hybrid' })
  })),
  ClaudeProvider: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined)
  })),
  RuvllmProvider: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined)
  }))
}));

// Mock learning modules
jest.mock('../../../src/learning/LearningEngine', () => ({
  LearningEngine: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined)
  }))
}));

jest.mock('../../../src/learning/ExperienceSharingProtocol', () => ({
  ExperienceSharingProtocol: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined)
  }))
}));

jest.mock('../../../src/learning/algorithms', () => ({
  createRLAlgorithm: jest.fn().mockReturnValue({ name: 'mockAlgorithm' })
}));

describe('AgentDependencies', () => {
  beforeEach(async () => {
    await resetGlobalContainer();
    jest.clearAllMocks();
  });

  describe('DependencyNames', () => {
    it('should define LLM provider names', () => {
      expect(DependencyNames.LLM_PROVIDER).toBe('llmProvider');
      expect(DependencyNames.LLM_FACTORY).toBe('llmProviderFactory');
      expect(DependencyNames.CLAUDE_PROVIDER).toBe('claudeProvider');
      expect(DependencyNames.RUVLLM_PROVIDER).toBe('ruvllmProvider');
    });

    it('should define learning names', () => {
      expect(DependencyNames.LEARNING_ENGINE).toBe('learningEngine');
      expect(DependencyNames.RL_ALGORITHM).toBe('rlAlgorithm');
      expect(DependencyNames.EXPERIENCE_SHARING).toBe('experienceSharing');
    });

    it('should define memory names', () => {
      expect(DependencyNames.MEMORY_STORE).toBe('memoryStore');
      expect(DependencyNames.SWARM_MEMORY).toBe('swarmMemory');
    });

    it('should define utility names', () => {
      expect(DependencyNames.LOGGER).toBe('logger');
      expect(DependencyNames.EVENT_BUS).toBe('eventBus');
    });
  });

  describe('registerAgentDependencies', () => {
    it('should register logger dependency', async () => {
      const container = new DIContainer();
      const config: AgentDependencyConfig = {
        agentId: 'test-agent',
        enableLLM: false,
        enableLearning: false
      };

      await registerAgentDependencies(container, config);

      expect(container.has(DependencyNames.LOGGER)).toBe(true);
      await container.dispose();
    });

    it('should register LLM dependencies when enabled', async () => {
      const container = new DIContainer();
      const config: AgentDependencyConfig = {
        agentId: 'test-agent',
        enableLLM: true,
        enableLearning: false
      };

      await registerAgentDependencies(container, config);

      expect(container.has(DependencyNames.LLM_FACTORY)).toBe(true);
      expect(container.has(DependencyNames.LLM_PROVIDER)).toBe(true);
      expect(container.has(DependencyNames.CLAUDE_PROVIDER)).toBe(true);
      expect(container.has(DependencyNames.RUVLLM_PROVIDER)).toBe(true);
      await container.dispose();
    });

    it('should skip LLM dependencies when disabled', async () => {
      const container = new DIContainer();
      const config: AgentDependencyConfig = {
        agentId: 'test-agent',
        enableLLM: false,
        enableLearning: false
      };

      await registerAgentDependencies(container, config);

      expect(container.has(DependencyNames.LLM_FACTORY)).toBe(false);
      expect(container.has(DependencyNames.LLM_PROVIDER)).toBe(false);
      await container.dispose();
    });

    it('should register learning dependencies when enabled', async () => {
      const container = new DIContainer();
      const config: AgentDependencyConfig = {
        agentId: 'test-agent',
        enableLLM: false,
        enableLearning: true
      };

      await registerAgentDependencies(container, config);

      expect(container.has(DependencyNames.RL_ALGORITHM)).toBe(true);
      expect(container.has(DependencyNames.LEARNING_ENGINE)).toBe(true);
      await container.dispose();
    });

    it('should register experience sharing when enabled', async () => {
      const container = new DIContainer();
      const config: AgentDependencyConfig = {
        agentId: 'test-agent',
        enableLLM: false,
        enableLearning: false,
        enableExperienceSharing: true
      };

      await registerAgentDependencies(container, config);

      expect(container.has(DependencyNames.EXPERIENCE_SHARING)).toBe(true);
      await container.dispose();
    });
  });

  describe('createAgentContainer', () => {
    it('should create container with registered dependencies', async () => {
      const config: AgentDependencyConfig = {
        agentId: 'test-agent',
        enableLLM: false,
        enableLearning: false
      };

      const container = await createAgentContainer(config);

      expect(container.has(DependencyNames.LOGGER)).toBe(true);
      await container.dispose();
    });

    it('should create child container when parent provided', async () => {
      const parent = new DIContainer();
      parent.registerInstance('parentDep', { from: 'parent' });

      const config: AgentDependencyConfig = {
        agentId: 'test-agent',
        enableLLM: false,
        enableLearning: false
      };

      const child = await createAgentContainer(config, parent);

      expect(child.has('parentDep')).toBe(true);
      const resolved = await child.resolve<{ from: string }>('parentDep');
      expect(resolved.from).toBe('parent');

      await child.dispose();
      await parent.dispose();
    });
  });

  describe('withDI mixin', () => {
    class MockBaseAgent {
      public id: string;

      constructor(id: string) {
        this.id = id;
      }

      async terminate(): Promise<void> {
        // Base terminate
      }
    }

    const DIEnabledAgent = withDI(MockBaseAgent);

    it('should add DI methods to base class', () => {
      const agent = new DIEnabledAgent('test-id');

      expect(typeof agent.getDIContainer).toBe('function');
      expect(typeof agent.setDIContainer).toBe('function');
      expect(typeof agent.resolveDependency).toBe('function');
      expect(typeof agent.tryResolveDependency).toBe('function');
      expect(typeof agent.registerDependency).toBe('function');
      expect(typeof agent.registerDependencyInstance).toBe('function');
    });

    it('should preserve base class properties', () => {
      const agent = new DIEnabledAgent('test-id');
      expect(agent.id).toBe('test-id');
    });

    it('should create container on first access', () => {
      const agent = new DIEnabledAgent('test-id');
      const container1 = agent.getDIContainer();
      const container2 = agent.getDIContainer();

      expect(container1).toBe(container2);
      expect(container1).toBeInstanceOf(DIContainer);
    });

    it('should allow setting external container', () => {
      const agent = new DIEnabledAgent('test-id');
      const externalContainer = new DIContainer();
      externalContainer.registerInstance('testDep', { value: 42 });

      agent.setDIContainer(externalContainer);

      expect(agent.getDIContainer()).toBe(externalContainer);
    });

    it('should resolve dependencies', async () => {
      const agent = new DIEnabledAgent('test-id');
      agent.registerDependencyInstance('myDep', { value: 'test' });

      const resolved = await agent.resolveDependency<{ value: string }>('myDep');
      expect(resolved.value).toBe('test');
    });

    it('should try resolve and return undefined for missing', async () => {
      const agent = new DIEnabledAgent('test-id');

      const resolved = await agent.tryResolveDependency('nonexistent');
      expect(resolved).toBeUndefined();
    });

    it('should register dependencies', async () => {
      const agent = new DIEnabledAgent('test-id');
      agent.registerDependency('factoryDep', {
        factory: () => ({ created: true }),
        lifecycle: 'singleton'
      });

      const resolved = await agent.resolveDependency<{ created: boolean }>('factoryDep');
      expect(resolved.created).toBe(true);
    });

    it('should dispose container on terminate', async () => {
      const agent = new DIEnabledAgent('test-id');
      let disposed = false;

      agent.registerDependency('disposable', {
        factory: () => ({ value: 1 }),
        lifecycle: 'singleton',
        dispose: async () => {
          disposed = true;
        }
      });

      await agent.resolveDependency('disposable');
      await agent.terminate();

      expect(disposed).toBe(true);
    });

    it('should implement IDIAgent interface', () => {
      const agent = new DIEnabledAgent('test-id');

      // TypeScript compile-time check via interface assertion
      const diAgent: IDIAgent = agent;
      expect(diAgent).toBeDefined();
    });
  });
});
