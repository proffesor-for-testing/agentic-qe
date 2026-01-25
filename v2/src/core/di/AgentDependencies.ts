/**
 * AgentDependencies - Pre-configured dependencies for QE agents
 *
 * Provides factory functions and registration helpers for common
 * agent dependencies including LLM providers, learning engines,
 * and memory stores.
 *
 * @module core/di/AgentDependencies
 * @version 1.0.0
 */

import { DIContainer, DependencyConfig } from './DIContainer';
import { ILLMProvider, LLMProviderFactory, ClaudeProvider, RuvllmProvider } from '../../providers';
import { LearningEngine } from '../../learning/LearningEngine';
import { ExperienceSharingProtocol, ExperienceSharingConfig } from '../../learning/ExperienceSharingProtocol';
import { AbstractRLLearner, createRLAlgorithm, RLAlgorithmType } from '../../learning/algorithms';
import { SwarmMemoryManager } from '../memory/SwarmMemoryManager';
import { Logger } from '../../utils/Logger';

/**
 * Well-known dependency names
 */
export const DependencyNames = {
  // LLM Providers
  LLM_PROVIDER: 'llmProvider',
  LLM_FACTORY: 'llmProviderFactory',
  CLAUDE_PROVIDER: 'claudeProvider',
  RUVLLM_PROVIDER: 'ruvllmProvider',

  // Learning
  LEARNING_ENGINE: 'learningEngine',
  RL_ALGORITHM: 'rlAlgorithm',
  EXPERIENCE_SHARING: 'experienceSharing',

  // Memory
  MEMORY_STORE: 'memoryStore',
  SWARM_MEMORY: 'swarmMemory',

  // Utilities
  LOGGER: 'logger',
  EVENT_BUS: 'eventBus'
} as const;

/**
 * Configuration for agent dependency setup
 */
export interface AgentDependencyConfig {
  /** Agent ID for scoped dependencies */
  agentId: string;
  /** Enable LLM provider (default: true) */
  enableLLM?: boolean;
  /** Preferred LLM provider type */
  llmProvider?: 'claude' | 'ruvllm' | 'hybrid';
  /** Enable learning system (default: true) */
  enableLearning?: boolean;
  /** RL algorithm to use */
  rlAlgorithm?: RLAlgorithmType;
  /** Enable experience sharing (default: false) */
  enableExperienceSharing?: boolean;
  /** Experience sharing config */
  experienceSharingConfig?: Partial<ExperienceSharingConfig>;
  /** Custom memory store */
  memoryStore?: SwarmMemoryManager;
}

/**
 * Register standard agent dependencies in a container
 */
export async function registerAgentDependencies(
  container: DIContainer,
  config: AgentDependencyConfig
): Promise<void> {
  const logger = Logger.getInstance();

  // Register logger
  container.registerInstance(DependencyNames.LOGGER, logger);

  // Register LLM providers if enabled
  if (config.enableLLM !== false) {
    await registerLLMDependencies(container, config);
  }

  // Register learning dependencies if enabled
  if (config.enableLearning !== false) {
    await registerLearningDependencies(container, config);
  }

  // Register experience sharing if enabled
  if (config.enableExperienceSharing) {
    registerExperienceSharingDependency(container, config);
  }

  logger.info(`Agent dependencies registered for ${config.agentId}`, {
    llm: config.enableLLM !== false,
    learning: config.enableLearning !== false,
    experienceSharing: config.enableExperienceSharing
  });
}

/**
 * Register LLM provider dependencies
 */
async function registerLLMDependencies(
  container: DIContainer,
  config: AgentDependencyConfig
): Promise<void> {
  // Register LLM Provider Factory
  container.register(DependencyNames.LLM_FACTORY, {
    factory: () => new LLMProviderFactory({
      defaultProvider: config.llmProvider === 'ruvllm' ? 'ruvllm' : 'claude',
      enableFallback: true
    }),
    lifecycle: 'singleton',
    initialize: async (factory) => factory.initialize(),
    dispose: async (factory) => factory.shutdown()
  });

  // Register main LLM provider based on preference
  container.register<ILLMProvider>(DependencyNames.LLM_PROVIDER, {
    factory: async (c) => {
      const factory = await c.resolve<LLMProviderFactory>(DependencyNames.LLM_FACTORY);

      switch (config.llmProvider) {
        case 'ruvllm':
          return factory.getProvider('ruvllm') ?? factory.selectBestProvider({ preferLocal: true })!;
        case 'hybrid':
          return factory.createHybridRouter();
        case 'claude':
        default:
          return factory.getProvider('claude') ?? factory.selectBestProvider()!;
      }
    },
    lifecycle: 'singleton',
    dependencies: [DependencyNames.LLM_FACTORY]
  });

  // Register individual providers for direct access
  container.register(DependencyNames.CLAUDE_PROVIDER, {
    factory: () => new ClaudeProvider(),
    lifecycle: 'singleton',
    initialize: async (p) => p.initialize(),
    dispose: async (p) => p.shutdown()
  });

  container.register(DependencyNames.RUVLLM_PROVIDER, {
    factory: () => new RuvllmProvider(),
    lifecycle: 'singleton',
    initialize: async (p) => {
      try {
        await p.initialize();
      } catch {
        // ruvllm may not be available - that's OK
      }
    },
    dispose: async (p) => p.shutdown()
  });
}

/**
 * Register learning system dependencies
 */
async function registerLearningDependencies(
  container: DIContainer,
  config: AgentDependencyConfig
): Promise<void> {
  // Register RL algorithm
  const algorithmType = config.rlAlgorithm ?? 'sarsa';
  container.register(DependencyNames.RL_ALGORITHM, {
    factory: () => createRLAlgorithm(algorithmType, {
      learningRate: 0.1,
      discountFactor: 0.95,
      explorationRate: 0.3,
      explorationDecay: 0.995,
      minExplorationRate: 0.01,
      useExperienceReplay: true,
      replayBufferSize: 10000,
      batchSize: 32
    }),
    lifecycle: 'scoped' // Each agent gets its own RL algorithm
  });

  // Register Learning Engine (requires memory store)
  container.register(DependencyNames.LEARNING_ENGINE, {
    factory: async (c) => {
      const memoryStore = config.memoryStore ?? await c.tryResolve<SwarmMemoryManager>(DependencyNames.SWARM_MEMORY);

      if (!memoryStore) {
        throw new Error('Memory store required for learning engine');
      }

      return new LearningEngine(config.agentId, memoryStore, {
        enabled: true,
        learningRate: 0.1,
        discountFactor: 0.95,
        explorationRate: 0.3,
        algorithm: algorithmType
      });
    },
    lifecycle: 'scoped',
    initialize: async (engine) => engine.initialize()
  });
}

/**
 * Register experience sharing dependency
 */
function registerExperienceSharingDependency(
  container: DIContainer,
  config: AgentDependencyConfig
): void {
  container.register(DependencyNames.EXPERIENCE_SHARING, {
    factory: () => new ExperienceSharingProtocol({
      agentId: config.agentId,
      ...config.experienceSharingConfig
    }),
    lifecycle: 'scoped',
    initialize: async (protocol) => protocol.start(),
    dispose: async (protocol) => protocol.stop()
  });
}

/**
 * Create a pre-configured container for an agent
 */
export async function createAgentContainer(
  config: AgentDependencyConfig,
  parent?: DIContainer
): Promise<DIContainer> {
  const container = new DIContainer(parent);
  await registerAgentDependencies(container, config);
  return container;
}

/**
 * Interface for DI-enabled agents
 */
export interface IDIAgent {
  /** Get the DI container */
  getDIContainer(): DIContainer;
  /** Set the DI container */
  setDIContainer(container: DIContainer): void;
  /** Resolve a dependency */
  resolveDependency<D>(name: string): Promise<D>;
  /** Try to resolve a dependency */
  tryResolveDependency<D>(name: string): Promise<D | undefined>;
  /** Register a dependency */
  registerDependency<D>(name: string, config: DependencyConfig<D>): void;
  /** Register an instance */
  registerDependencyInstance<D>(name: string, instance: D): void;
}

/**
 * Dependency injection mixin for BaseAgent
 *
 * Adds DI capabilities to BaseAgent without modifying the class directly.
 *
 * Usage:
 * ```typescript
 * class MyAgent extends withDI(BaseAgent) {
 *   async initialize() {
 *     await super.initialize();
 *     const llm = await this.resolveDependency<ILLMProvider>('llmProvider');
 *   }
 * }
 * ```
 */
export function withDI<T extends new (...args: any[]) => any>(Base: T) {
  return class DIAgent extends Base implements IDIAgent {
    /** @internal DI container - use getDIContainer() instead */
    __diContainer?: DIContainer;

    /**
     * Get or create the DI container for this agent
     */
    getDIContainer(): DIContainer {
      if (!this.__diContainer) {
        this.__diContainer = new DIContainer();
      }
      return this.__diContainer;
    }

    /**
     * Set the DI container (for external configuration)
     */
    setDIContainer(container: DIContainer): void {
      this.__diContainer = container;
    }

    /**
     * Resolve a dependency from the container
     */
    async resolveDependency<D>(name: string): Promise<D> {
      return this.getDIContainer().resolve<D>(name);
    }

    /**
     * Try to resolve a dependency (returns undefined if not found)
     */
    async tryResolveDependency<D>(name: string): Promise<D | undefined> {
      return this.getDIContainer().tryResolve<D>(name);
    }

    /**
     * Register a dependency in the container
     */
    registerDependency<D>(name: string, config: DependencyConfig<D>): void {
      this.getDIContainer().register(name, config);
    }

    /**
     * Register an instance directly
     */
    registerDependencyInstance<D>(name: string, instance: D): void {
      this.getDIContainer().registerInstance(name, instance);
    }

    /**
     * Dispose the container on agent termination
     */
    async terminate(): Promise<void> {
      if (this.__diContainer) {
        await this.__diContainer.dispose();
        this.__diContainer = undefined;
      }
      // Call parent terminate if it exists
      if (super.terminate) {
        await super.terminate();
      }
    }
  };
}
