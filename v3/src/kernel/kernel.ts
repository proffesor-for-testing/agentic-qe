/**
 * Agentic QE v3 - QE Kernel
 * Microkernel implementation coordinating all domains
 */

import { DomainName, ALL_DOMAINS } from '../shared/types';
import {
  QEKernel,
  EventBus,
  AgentCoordinator,
  PluginLoader,
  MemoryBackend,
  KernelHealth,
  KernelConfig,
  DomainHealth,
} from './interfaces';
import { InMemoryEventBus } from './event-bus';
import { DefaultAgentCoordinator } from './agent-coordinator';
import { DefaultPluginLoader } from './plugin-loader';
import { InMemoryBackend } from './memory-backend';
import { HybridMemoryBackend } from './hybrid-backend';
import { SemanticAntiDriftMiddleware } from './anti-drift-middleware.js';
import { AGENT_CONSTANTS, MEMORY_CONSTANTS } from './constants.js';
import { findProjectRoot } from './unified-memory.js';
import { initializeUnifiedPersistence } from './unified-persistence.js';
import * as path from 'path';
import * as fs from 'fs';

// Import domain plugin factories
import { createTestGenerationPlugin } from '../domains/test-generation/plugin';
import { createTestExecutionPlugin } from '../domains/test-execution/plugin';
import { createCoverageAnalysisPlugin } from '../domains/coverage-analysis/plugin';
import { createQualityAssessmentPlugin } from '../domains/quality-assessment/plugin';
import { createDefectIntelligencePlugin } from '../domains/defect-intelligence/plugin';
import { createRequirementsValidationPlugin } from '../domains/requirements-validation/plugin';
import { createCodeIntelligencePlugin } from '../domains/code-intelligence/plugin';
import { createSecurityCompliancePlugin } from '../domains/security-compliance/plugin';
import { createContractTestingPlugin } from '../domains/contract-testing/plugin';
import { createVisualAccessibilityPlugin } from '../domains/visual-accessibility/plugin';
import { createChaosResiliencePlugin } from '../domains/chaos-resilience/plugin';
import { createLearningOptimizationPlugin } from '../domains/learning-optimization/plugin';
import { createCoordinationPlugin } from '../coordination/plugin';
import { createEnterpriseIntegrationPlugin } from '../domains/enterprise-integration/plugin';

// Domain factory map - returns plugin instances (not Promises)
type PluginFactoryFn = (eventBus: EventBus, memory: MemoryBackend, coordinator: AgentCoordinator) => import('./interfaces').DomainPlugin;

const DOMAIN_FACTORIES: Record<DomainName, PluginFactoryFn> = {
  'test-generation': (eb, m, c) => createTestGenerationPlugin(eb, m, c),
  'test-execution': (eb, m) => createTestExecutionPlugin(eb, m),
  'coverage-analysis': (eb, m) => createCoverageAnalysisPlugin(eb, m),
  'quality-assessment': (eb, m, c) => createQualityAssessmentPlugin(eb, m, c),
  'defect-intelligence': (eb, m, c) => createDefectIntelligencePlugin(eb, m, c),
  'requirements-validation': (eb, m, c) => createRequirementsValidationPlugin(eb, m, c),
  'code-intelligence': (eb, m, c) => createCodeIntelligencePlugin(eb, m, c),
  'security-compliance': (eb, m, c) => createSecurityCompliancePlugin(eb, m, c),
  'contract-testing': (eb, m, c) => createContractTestingPlugin(eb, m, c),
  'visual-accessibility': (eb, m, c) => createVisualAccessibilityPlugin(eb, m, c),
  'chaos-resilience': (eb, m, c) => createChaosResiliencePlugin(eb, m, c),
  'learning-optimization': (eb, m, c) => createLearningOptimizationPlugin(eb, m, c),
  'enterprise-integration': (eb, m, c) => createEnterpriseIntegrationPlugin(eb, m, c),
  'coordination': (eb, m, c) => createCoordinationPlugin(eb, m, c),
};

const DEFAULT_CONFIG: KernelConfig = {
  maxConcurrentAgents: AGENT_CONSTANTS.MAX_CONCURRENT_AGENTS,
  memoryBackend: 'hybrid',
  hnswEnabled: true,
  lazyLoading: true,
  enabledDomains: [...ALL_DOMAINS],
  dataDir: undefined, // Will use project root + .agentic-qe
};

export class QEKernelImpl implements QEKernel {
  private _eventBus: EventBus;
  private _coordinator: AgentCoordinator;
  private _plugins: PluginLoader;
  private _memory: MemoryBackend;
  private _config: KernelConfig;
  private _startTime: Date;
  private _initialized = false;

  constructor(config: Partial<KernelConfig> = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._startTime = new Date();

    // Determine data directory
    const projectRoot = findProjectRoot();
    const dataDir = this._config.dataDir || path.join(projectRoot, '.agentic-qe');

    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Initialize memory backend based on config
    if (this._config.memoryBackend === 'memory') {
      // Use in-memory backend only when explicitly requested (for testing)
      this._memory = new InMemoryBackend();
    } else {
      // Use hybrid backend for persistent storage (default)
      // All data goes to unified memory.db via UnifiedMemoryManager
      this._memory = new HybridMemoryBackend({
        sqlite: {
          path: path.join(dataDir, 'memory.db'),
          walMode: true,
          poolSize: 3,
          busyTimeout: MEMORY_CONSTANTS.BUSY_TIMEOUT_MS,
        },
        enableFallback: true,
        defaultNamespace: 'qe-kernel',
      });
    }

    this._eventBus = new InMemoryEventBus();
    this._coordinator = new DefaultAgentCoordinator(this._config.maxConcurrentAgents);
    this._plugins = new DefaultPluginLoader(
      this._eventBus,
      this._memory,
      this._config.lazyLoading
    );

    // Register domain factories for enabled domains
    for (const domain of this._config.enabledDomains) {
      const factory = DOMAIN_FACTORIES[domain];
      if (factory) {
        // Wrap factory to match PluginLoader signature (async)
        (this._plugins as DefaultPluginLoader).registerFactory(
          domain,
          async (eventBus: EventBus, memory: MemoryBackend) => {
            // Create plugin synchronously, return as Promise
            return Promise.resolve(factory(eventBus, memory, this._coordinator));
          }
        );
      }
    }
  }

  get eventBus(): EventBus {
    return this._eventBus;
  }

  get coordinator(): AgentCoordinator {
    return this._coordinator;
  }

  get plugins(): PluginLoader {
    return this._plugins;
  }

  get memory(): MemoryBackend {
    return this._memory;
  }

  async initialize(): Promise<void> {
    if (this._initialized) {
      return;
    }

    // When using in-memory backend (testing), initialize UnifiedPersistenceManager
    // with a temp DB so subsystems (PersistentSONAEngine, MinCut, etc.) that call
    // getUnifiedPersistence() / getUnifiedMemory() don't crash.
    if (this._config.memoryBackend === 'memory') {
      const tmpDbPath = path.join(
        require('os').tmpdir(),
        `aqe-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
      );
      await initializeUnifiedPersistence({ dbPath: tmpDbPath });
    }

    // Initialize memory backend
    await this._memory.initialize();

    // ADR-060: Register semantic anti-drift middleware for event integrity
    const antiDriftMiddleware = new SemanticAntiDriftMiddleware({
      agentId: 'qe-kernel',
    });
    (this._eventBus as InMemoryEventBus).registerMiddleware(antiDriftMiddleware);

    // Load plugins based on configuration
    if (!this._config.lazyLoading) {
      await this._plugins.loadAll();
    }

    this._initialized = true;
  }

  async dispose(): Promise<void> {
    // Dispose in reverse order of initialization
    await (this._plugins as DefaultPluginLoader).disposeAll();
    await this._coordinator.dispose();
    await this._eventBus.dispose();
    await this._memory.dispose();

    this._initialized = false;
  }

  getDomainAPI<T>(domain: DomainName): T | undefined {
    const plugin = (this._plugins as DefaultPluginLoader).getPlugin(domain);
    return plugin?.getAPI<T>();
  }

  /**
   * Get domain API with lazy loading support
   * Will load the domain if not already loaded and lazy loading is enabled
   */
  async getDomainAPIAsync<T>(domain: DomainName): Promise<T | undefined> {
    // Check if already loaded
    let plugin = (this._plugins as DefaultPluginLoader).getPlugin(domain);

    // Lazy load if enabled and domain not yet loaded
    if (!plugin && this._config.lazyLoading && this._config.enabledDomains.includes(domain)) {
      try {
        plugin = await this._plugins.load(domain);
      } catch (error) {
        console.error(`[QEKernel] Failed to lazy load domain ${domain}:`, error);
        return undefined;
      }
    }

    return plugin?.getAPI<T>();
  }

  /**
   * Ensure a domain is loaded (for lazy loading scenarios)
   * Returns true if the domain is now loaded, false otherwise
   */
  async ensureDomainLoaded(domain: DomainName): Promise<boolean> {
    if (this._plugins.isLoaded(domain)) {
      return true;
    }

    if (!this._config.enabledDomains.includes(domain)) {
      console.warn(`[QEKernel] Domain ${domain} is not enabled`);
      return false;
    }

    try {
      await this._plugins.load(domain);
      return true;
    } catch (error) {
      console.error(`[QEKernel] Failed to load domain ${domain}:`, error);
      return false;
    }
  }

  /**
   * Check if a domain is currently loaded
   */
  isDomainLoaded(domain: DomainName): boolean {
    return this._plugins.isLoaded(domain);
  }

  /**
   * Get list of loaded domains
   */
  getLoadedDomains(): DomainName[] {
    return this._plugins.getLoaded();
  }

  /**
   * Get list of enabled but not yet loaded domains
   */
  getPendingDomains(): DomainName[] {
    const loaded = new Set(this._plugins.getLoaded());
    return this._config.enabledDomains.filter(d => !loaded.has(d));
  }

  getHealth(): KernelHealth {
    const agentList = this._coordinator.listAgents();
    const domains: Record<string, DomainHealth> = {};

    // Get health for loaded domains
    for (const domain of this._plugins.getLoaded()) {
      const plugin = (this._plugins as DefaultPluginLoader).getPlugin(domain);
      if (plugin) {
        domains[domain] = plugin.getHealth();
      }
    }

    // Add status for unloaded domains (lazy loading aware)
    for (const domain of ALL_DOMAINS) {
      if (!domains[domain]) {
        const isEnabled = this._config.enabledDomains.includes(domain);
        const canLazyLoad = this._config.lazyLoading && isEnabled;

        domains[domain] = {
          status: canLazyLoad ? 'healthy' : (isEnabled ? 'degraded' : 'healthy'),
          agents: { total: 0, active: 0, idle: 0, failed: 0 },
          errors: canLazyLoad
            ? []
            : (isEnabled ? ['Domain not yet loaded'] : []),
          // Mark as not loaded for lazy loading awareness
          ...({ loaded: false, lazyLoadable: canLazyLoad } as Partial<DomainHealth>),
        };
      }
    }

    const activeCount = this._coordinator.getActiveCount();

    // Get memory stats - handle both backend types
    let memUsed = 0;
    let memAvailable = Number.MAX_SAFE_INTEGER;
    if (this._memory instanceof InMemoryBackend) {
      const memStats = this._memory.getStats();
      memUsed = memStats.entries + memStats.vectors;
    } else {
      // For HybridMemoryBackend, we don't track in-memory usage
      // but it has persistent storage
      memUsed = 0; // Could query DB size if needed
    }

    // ADR-060: Anti-drift middleware stats
    const middlewares = (this._eventBus as InMemoryEventBus).getMiddlewares();
    const antiDrift = middlewares.find(m => m.name === 'semantic-anti-drift') as SemanticAntiDriftMiddleware | undefined;
    const antiDriftStats = antiDrift ? antiDrift.getStats() : undefined;

    return {
      status: this.determineOverallStatus(domains),
      uptime: Date.now() - this._startTime.getTime(),
      domains: domains as Record<DomainName, DomainHealth>,
      agents: {
        total: agentList.length,
        active: activeCount,
        maxAllowed: this._config.maxConcurrentAgents,
      },
      memory: {
        used: memUsed,
        available: memAvailable,
      },
      ...(antiDriftStats ? { antiDrift: antiDriftStats } : {}),
    };
  }

  private determineOverallStatus(
    domains: Record<string, DomainHealth>
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const statuses = Object.values(domains).map((d) => d.status);

    if (statuses.some((s) => s === 'unhealthy')) {
      return 'unhealthy';
    }
    if (statuses.some((s) => s === 'degraded')) {
      return 'degraded';
    }
    return 'healthy';
  }

  getConfig(): KernelConfig {
    return { ...this._config };
  }
}

// Factory function
export function createKernel(config?: Partial<KernelConfig>): QEKernel {
  return new QEKernelImpl(config);
}
