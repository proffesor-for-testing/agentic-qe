/**
 * Agentic QE v3 - QE Kernel
 * Microkernel implementation coordinating all domains
 */

import { randomUUID } from 'crypto';
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
import { SemanticAntiDriftMiddleware, ToolCallSignatureTracker } from './anti-drift-middleware.js';
import type { LoopDetectionResult } from './anti-drift-middleware.js';
import { LOOP_EVENT_TYPES } from './event-bus.js';
import { AGENT_CONSTANTS, MEMORY_CONSTANTS } from './constants.js';
import { findProjectRoot } from './unified-memory.js';
import { initializeUnifiedPersistence } from './unified-persistence.js';
import * as path from 'path';
import * as fs from 'fs';
import { PluginLifecycleManager } from '../plugins/lifecycle';
import { PluginCache } from '../plugins/cache';
import { CapturedExperienceBridge } from '../bridge/captured-experience-bridge.js';
import { DreamScheduler } from '../learning/dream/dream-scheduler.js';
import { createDreamEngine } from '../learning/dream/dream-engine.js';
import {
  createLLMRouterService,
  type BuiltLLMRouter,
} from '../shared/llm/llm-router-service.js';
import type { HybridRouter } from '../shared/llm/router/hybrid-router.js';
import type { ProviderManager } from '../shared/llm/provider-manager.js';

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

// CQ-005: Import domain barrel exports to trigger DomainServiceRegistry.register() calls.
// Domain index.ts files register service factories as side effects.
// The kernel must import these so coordination/ can resolve services at runtime.
import '../domains/test-generation';
import '../domains/coverage-analysis';
import '../domains/security-compliance';
import '../domains/code-intelligence';
import '../domains/quality-assessment';
import { createEnterpriseIntegrationPlugin } from '../domains/enterprise-integration/plugin';

/**
 * Domain factory signature (ADR-043 wiring).
 *
 * `llmRouter` is forwarded to every domain factory so plugins can pass
 * it through to their coordinators and services. Phase 1 of the
 * wire-up just plumbs the parameter; Phase 2 updates each underlying
 * `createXxxPlugin` factory to actually accept and use it.
 */
type PluginFactoryFn = (
  eventBus: EventBus,
  memory: MemoryBackend,
  coordinator: AgentCoordinator,
  llmRouter?: HybridRouter
) => import('./interfaces').DomainPlugin;

// NOTE: underlying createXxxPlugin signatures are updated in Phase 2.
// For Phase 1, the wrappers accept llmRouter but discard it — this
// keeps the kernel boot path internally consistent without forcing
// 13 simultaneous domain-level changes.
const DOMAIN_FACTORIES: Record<DomainName, PluginFactoryFn> = {
  'test-generation': (eb, m, c, llmRouter) => createTestGenerationPlugin(eb, m, c, undefined, llmRouter),
  'test-execution': (eb, m, _c, llmRouter) => createTestExecutionPlugin(eb, m, llmRouter),
  'coverage-analysis': (eb, m, _c, llmRouter) => createCoverageAnalysisPlugin(eb, m, llmRouter),
  'quality-assessment': (eb, m, c, llmRouter) => createQualityAssessmentPlugin(eb, m, c, undefined, llmRouter),
  'defect-intelligence': (eb, m, c, llmRouter) => createDefectIntelligencePlugin(eb, m, c, undefined, llmRouter),
  'requirements-validation': (eb, m, c, llmRouter) => createRequirementsValidationPlugin(eb, m, c, undefined, llmRouter),
  'code-intelligence': (eb, m, c, llmRouter) => createCodeIntelligencePlugin(eb, m, c, undefined, llmRouter),
  'security-compliance': (eb, m, c, llmRouter) => createSecurityCompliancePlugin(eb, m, c, undefined, llmRouter),
  'contract-testing': (eb, m, c, llmRouter) => createContractTestingPlugin(eb, m, c, undefined, llmRouter),
  'visual-accessibility': (eb, m, c, llmRouter) => createVisualAccessibilityPlugin(eb, m, c, undefined, llmRouter),
  'chaos-resilience': (eb, m, c, llmRouter) => createChaosResiliencePlugin(eb, m, c, undefined, llmRouter),
  'learning-optimization': (eb, m, c, llmRouter) => createLearningOptimizationPlugin(eb, m, c, undefined, llmRouter),
  'enterprise-integration': (eb, m, c, _llmRouter) => createEnterpriseIntegrationPlugin(eb, m, c),
  'coordination': (eb, m, c, _llmRouter) => createCoordinationPlugin(eb, m, c),
};

const DEFAULT_CONFIG: KernelConfig = {
  maxConcurrentAgents: AGENT_CONSTANTS.MAX_CONCURRENT_AGENTS,
  memoryBackend: 'hybrid',
  hnswEnabled: true,
  lazyLoading: true,
  enabledDomains: [...ALL_DOMAINS],
  dataDir: undefined, // Will use project root + .agentic-qe
  // Default ON: long-lived processes (MCP server, daemon) need the bridge
  // working out of the box. CLI commands that don't need event-driven
  // domain reactions opt out by passing `enableExperienceBridge: false`.
  enableExperienceBridge: true,
  // ADR-094: kernel-side dream cycles. Defaults match the bridge — long-lived
  // processes start the scheduler so dream cycles run in the kernel rather
  // than inside hook subprocesses. Short-lived CLIs opt out.
  enableDreamScheduler: true,
};

export class QEKernelImpl implements QEKernel {
  private _eventBus: EventBus;
  private _coordinator: AgentCoordinator;
  private _plugins: PluginLoader;
  private _memory: MemoryBackend;
  private _config: KernelConfig;
  private _startTime: Date;
  private _initialized = false;

  // ADR-062: Loop detection tracker
  private _loopTracker: ToolCallSignatureTracker;

  // Issue #479: drains captured_experiences into the eventBus so hook-driven
  // activity reaches the 13 domain plugins' subscribeToEvents() handlers.
  private _experienceBridge?: CapturedExperienceBridge;

  // ADR-094: kernel-side dream cycles. Replaces the in-hook
  // checkAndTriggerDream path so 10-second SQLite write transactions move
  // out of short-lived hook subprocesses into the long-lived kernel.
  private _dreamScheduler?: DreamScheduler;

  // ADR-043: kernel singleton HybridRouter. Built during initialize() iff
  // a provider key is in env or the project explicitly enables one.
  private _llmRouter?: HybridRouter;
  private _llmRouterBuild?: BuiltLLMRouter;

  constructor(config: Partial<KernelConfig> = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._startTime = new Date();

    // PERF-005: Constructor only stores config — no sync I/O.
    // Memory backend, directory creation, and plugin registration
    // are deferred to initialize() to avoid blocking the event loop.
    this._memory = new InMemoryBackend(); // Placeholder until initialize()
    this._eventBus = new InMemoryEventBus();
    this._coordinator = new DefaultAgentCoordinator(this._config.maxConcurrentAgents);
    this._plugins = new DefaultPluginLoader(
      this._eventBus,
      this._memory,
      this._config.lazyLoading
    );

    // ADR-062: Instantiate loop detection tracker alongside anti-drift middleware
    this._loopTracker = new ToolCallSignatureTracker();
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

  /**
   * ADR-043: Get the LLM router built during initialize(). Returns
   * undefined when llmRouter.enabled is false or no provider was
   * available. Domain plugins receive this as their factory's 4th arg
   * via DOMAIN_FACTORIES.
   */
  get llmRouter(): HybridRouter | undefined {
    return this._llmRouter;
  }

  async initialize(): Promise<void> {
    if (this._initialized) {
      return;
    }

    // PERF-005: Sync I/O moved here from constructor — directory creation
    // and memory backend setup now happen in async initialize().
    const projectRoot = findProjectRoot();
    const dataDir = this._config.dataDir || path.join(projectRoot, '.agentic-qe');

    // Ensure data directory exists. Skipped in database-free mode so the
    // project's .agentic-qe/ is never created (the memory branch below uses a
    // throwaway temp DB outside the project).
    if (this._config.memoryBackend !== 'memory' && !fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Initialize memory backend based on config
    if (this._config.memoryBackend === 'memory') {
      // Use in-memory backend only when explicitly requested (for testing)
      // this._memory is already InMemoryBackend from constructor

      // Initialize UnifiedPersistenceManager with a temp DB so subsystems
      // (PersistentSONAEngine, MinCut, etc.) that call
      // getUnifiedPersistence() / getUnifiedMemory() don't crash.
      const tmpDbPath = path.join(
        require('os').tmpdir(),
        `aqe-test-${Date.now()}-${randomUUID().slice(0, 12)}.db`
      );
      await initializeUnifiedPersistence({ dbPath: tmpDbPath });
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

      // Re-create plugins with the real memory backend
      this._plugins = new DefaultPluginLoader(
        this._eventBus,
        this._memory,
        this._config.lazyLoading
      );
    }

    // ADR-043: Build the kernel-singleton LLM router before plugin
    // factories are registered, so the closure on the next loop can
    // capture it. Builds iff configured/auto-detected; null otherwise.
    await this._initializeLLMRouter(projectRoot);

    // Register domain factories for enabled domains
    for (const domain of this._config.enabledDomains) {
      const factory = DOMAIN_FACTORIES[domain];
      if (factory) {
        // Wrap factory to match PluginLoader signature (async)
        (this._plugins as DefaultPluginLoader).registerFactory(
          domain,
          async (eventBus: EventBus, memory: MemoryBackend) => {
            // Create plugin synchronously, return as Promise.
            // ADR-043: pass the kernel singleton llmRouter as 4th arg —
            // domain factories forward it to coordinators/services.
            return Promise.resolve(
              factory(eventBus, memory, this._coordinator, this._llmRouter)
            );
          }
        );
      }
    }

    // Initialize memory backend
    await this._memory.initialize();

    // ADR-060: Register semantic anti-drift middleware for event integrity
    const antiDriftMiddleware = new SemanticAntiDriftMiddleware({
      agentId: 'qe-kernel',
    });
    (this._eventBus as InMemoryEventBus).registerMiddleware(antiDriftMiddleware);

    // IMP-09: Discover and register external plugins from cache
    try {
      const pluginCacheDir = path.join(dataDir, 'plugins');
      const pluginCache = new PluginCache({ cacheDir: pluginCacheDir });
      const pluginLifecycle = new PluginLifecycleManager({ cache: pluginCache });

      const resolution = pluginLifecycle.resolveLoadOrder();
      for (const resolved of resolution.ordered) {
        const manifest = resolved.manifest;
        const cachedPlugin = pluginCache.get(manifest.name, manifest.version);
        if (!cachedPlugin) continue;

        const entryPointPath = path.join(cachedPlugin.path, manifest.entryPoint);

        // Register a factory for each domain the plugin provides
        for (const domain of manifest.domains) {
          const domainName = domain as DomainName;
          if (DOMAIN_FACTORIES[domainName]) continue; // don't override built-in domains

          const loader = this._plugins as DefaultPluginLoader;
          loader.registerFactory(
            domainName,
            async (eventBus: EventBus, memory: MemoryBackend) => {
              // Dynamically import the plugin entry point at load time
              const pluginModule = await import(entryPointPath);
              const createPlugin = pluginModule.default ?? pluginModule.createPlugin;
              if (typeof createPlugin !== 'function') {
                throw new Error(
                  `Plugin "${manifest.name}" entry point must export a default function or "createPlugin" function`,
                );
              }
              // ADR-043: forward llmRouter so external plugins can
              // opt into LLM enhancement on the same terms as built-ins.
              return createPlugin(eventBus, memory, this._coordinator, this._llmRouter);
            },
          );
        }
      }
    } catch {
      // External plugin loading is best-effort — don't block kernel startup
    }

    // Load plugins based on configuration
    if (!this._config.lazyLoading) {
      await this._plugins.loadAll();
    }

    // ADR-067: Wire agent memory branching when RVF PatternStore is enabled
    // Uses shared adapter singleton to avoid duplicate file handles (M4 fix)
    try {
      const { isAgentMemoryBranchingEnabled, isRVFPatternStoreEnabled } =
        await import('../integrations/ruvector/feature-flags.js');
      if (isAgentMemoryBranchingEnabled() && isRVFPatternStoreEnabled()) {
        const { getSharedRvfAdapter } = await import('../integrations/ruvector/shared-rvf-adapter.js');
        const { AgentMemoryBranch } = await import('../coordination/agent-memory-branch.js');
        const rvfAdapter = getSharedRvfAdapter(dataDir, 384);
        if (rvfAdapter) {
          const branch = new AgentMemoryBranch(rvfAdapter, {
            branchDir: path.join(dataDir, 'branches'),
          });
          (this._coordinator as DefaultAgentCoordinator).setMemoryBranch(branch);
        }
      }
    } catch {
      // Agent memory branching is best-effort — don't block kernel startup
    }

    // ADR-072 Phase 3: Initialize RVF migration coordinator
    try {
      const { getRvfMigrationStage } = await import('../integrations/ruvector/feature-flags.js');
      const stage = getRvfMigrationStage();
      if (stage >= 2) {
        const { RvfMigrationCoordinator } = await import('../persistence/rvf-migration-coordinator.js');
        const coordinator = RvfMigrationCoordinator.getInstance({ stage });
        await coordinator.initialize();
      }
    } catch {
      // Migration coordinator is best-effort — don't block kernel startup
    }

    // Issue #479 + #482: start the captured-experience bridge so hook-driven
    // activity (written to captured_experiences SQLite by short-lived hook
    // subprocesses) reaches the domain plugins' eventBus handlers.
    //
    // Critical ordering: domain plugins MUST be loaded before the bridge
    // starts. A plugin's subscribeToEvents() runs inside its initialize(),
    // which is invoked by pluginLoader.load(). Until that happens, the
    // plugin's handlers aren't wired as eventBus subscribers. The bridge's
    // start() does an immediate drain, so if plugins are still lazy-pending
    // at that point, the drained events publish to a kernel with zero
    // subscribers and are silently lost (issue #482).
    //
    // Best-effort throughout: never block kernel startup on either step.
    if (this._config.enableExperienceBridge !== false) {
      try {
        await (this._plugins as DefaultPluginLoader).loadAll();
      } catch (err) {
        console.warn(
          '[QEKernel] domain plugin pre-load (for bridge subscribers) failed:',
          err instanceof Error ? err.message : err
        );
      }

      try {
        this._experienceBridge = new CapturedExperienceBridge(
          this._eventBus,
          this._memory
        );
        await this._experienceBridge.start();
      } catch (err) {
        console.warn(
          '[QEKernel] CapturedExperienceBridge failed to start:',
          err instanceof Error ? err.message : err
        );
        this._experienceBridge = undefined;
      }
    }

    // ADR-094: Start the kernel-side DreamScheduler so dream cycles run in
    // the long-lived process. Hook subprocesses no longer trigger dreams —
    // they only bump the experience counter (incrementDreamExperience).
    // The scheduler subscribes to its own event triggers (quality-gate
    // failure, domain milestones) and runs time-based dreams on its own
    // cadence (default 1h). DreamEngine.ensureConceptsLoaded() auto-loads
    // patterns from qe_patterns, so no separate ReasoningBank is needed here.
    if (this._config.enableDreamScheduler !== false) {
      try {
        const dreamEngine = createDreamEngine({
          maxDurationMs: 10_000,
          minConceptsRequired: 3,
        });
        await dreamEngine.initialize();
        this._dreamScheduler = new DreamScheduler({
          dreamEngine,
          eventBus: this._eventBus,
          memoryBackend: this._memory,
        });
        await this._dreamScheduler.initialize();
        this._dreamScheduler.start();
      } catch (err) {
        console.warn(
          '[QEKernel] DreamScheduler failed to start:',
          err instanceof Error ? err.message : err
        );
        // Tear down anything we partially constructed so we don't leak a
        // half-initialized scheduler (e.g., engine init succeeded but
        // scheduler.start threw).
        if (this._dreamScheduler) {
          try {
            await this._dreamScheduler.dispose();
          } catch { /* swallow during cleanup */ }
        }
        this._dreamScheduler = undefined;
      }
    }

    this._initialized = true;
  }

  /**
   * ADR-043: Build the kernel-singleton HybridRouter.
   *
   * Behavior is gated, in order:
   *   1. AQE_LLM_ROUTER_DISABLED env var (kill-switch): if set to a truthy
   *      value, ALWAYS skip — even when config.llmRouter.enabled === true.
   *      This is the env-only opt-out for users who upgrade with a
   *      provider key already in env and don't want billing surprises.
   *   2. config.llmRouter.enabled:
   *      'auto' (default): build iff at least one provider key is in env,
   *                        or the project's llm-config.json enables a provider
   *      true:             attempt to build; emit error event if no provider
   *      false:            skip entirely (sets _llmRouter to undefined)
   *
   * On any error we publish a structured kernel.llm-router.init-failed
   * event so monitoring catches misconfiguration. We also keep the
   * console.warn for direct visibility in dev. The kernel still boots —
   * a kernel that boots without LLMs is strictly better than a kernel
   * that won't boot — but the failure is now observable.
   */
  private async _initializeLLMRouter(projectRoot: string): Promise<void> {
    // (1) Hard env kill-switch. Truthy values disable; falsy/empty pass.
    // Same parse rule as src/mcp/tools/base.ts:isRouterKillSwitchSet
    // so both code paths agree on what "disabled" means.
    const killSwitch = (process.env.AQE_LLM_ROUTER_DISABLED ?? '').trim().toLowerCase();
    if (
      killSwitch &&
      killSwitch !== 'false' &&
      killSwitch !== '0' &&
      killSwitch !== 'no' &&
      killSwitch !== 'off'
    ) {
      this._llmRouter = undefined;
      return;
    }

    const llmCfg = this._config.llmRouter ?? {};
    const enabled = llmCfg.enabled ?? 'auto';

    if (enabled === false) {
      this._llmRouter = undefined;
      return;
    }

    try {
      const built = await createLLMRouterService({
        projectRoot,
        override: llmCfg.configOverride,
        providerManager: llmCfg.providerManager as ProviderManager | undefined,
      });

      if (!built) {
        if (enabled === true) {
          console.warn(
            '[QEKernel] llmRouter.enabled=true but no provider available — ' +
              'continuing without LLM router (domain services will skip LLM enhancement)'
          );
          await this._publishLLMRouterEvent('init-no-provider', {
            reason: 'no provider available in env or disk config',
          });
        }
        this._llmRouter = undefined;
        return;
      }

      this._llmRouterBuild = built;
      this._llmRouter = built.router;

      // Phase 5 wiring: register as shared singleton so MCP standalone
      // tools see the same router instance (one cost tracker, one cache,
      // one metric collector, one circuit breaker per provider).
      try {
        const { setSharedLLMRouter } = await import('../mcp/tools/base.js');
        setSharedLLMRouter(built.router);
      } catch {
        // MCP module not loaded — fine in CLI-only contexts.
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[QEKernel] LLM router init failed; continuing without LLM enhancement:', msg);
      await this._publishLLMRouterEvent('init-failed', {
        error: msg,
        stack: err instanceof Error ? err.stack : undefined,
      });
      this._llmRouter = undefined;
    }
  }

  /**
   * ADR-043: emit a structured event on the kernel event bus when the
   * LLM router can't be built. Observability hook for monitoring and
   * alerting — a silent warn is not enough for production systems where
   * "tests run without LLM analysis" is a quality regression worth
   * paging on.
   */
  private async _publishLLMRouterEvent(
    type: 'init-failed' | 'init-no-provider',
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      await this._eventBus.publish({
        id: randomUUID(),
        type: `kernel.llm-router.${type}`,
        timestamp: new Date(),
        source: 'qe-kernel' as DomainName,
        payload,
      });
    } catch {
      // Event bus publish failures during boot must not crash the kernel.
    }
  }

  async dispose(): Promise<void> {
    // ADR-094: Stop the dream scheduler first so a dream-in-progress doesn't
    // try to write to a disposed memory backend.
    if (this._dreamScheduler) {
      try {
        await this._dreamScheduler.dispose();
      } catch (err) {
        console.warn(
          '[QEKernel] DreamScheduler dispose failed:',
          err instanceof Error ? err.message : err,
        );
      }
      this._dreamScheduler = undefined;
    }

    // Stop the bridge first so it doesn't try to publish to a disposed bus.
    if (this._experienceBridge) {
      await this._experienceBridge.stop();
      this._experienceBridge = undefined;
    }

    // Dispose in reverse order of initialization
    await (this._plugins as DefaultPluginLoader).disposeAll();
    await this._coordinator.dispose();
    await this._eventBus.dispose();
    await this._memory.dispose();

    // ADR-043: clear the shared LLM router singleton if we registered
    // one. Prevents test isolation problems where a stale router from
    // a previous kernel boot leaks into the next.
    if (this._llmRouter) {
      try {
        const { resetSharedLLMRouter } = await import('../mcp/tools/base.js');
        resetSharedLLMRouter();
      } catch {
        // MCP module not loaded — fine.
      }
      this._llmRouter = undefined;
      this._llmRouterBuild = undefined;
    }

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
    const memAvailable = Number.MAX_SAFE_INTEGER;
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

  // ==========================================================================
  // ADR-062: Loop Detection
  // ==========================================================================

  /**
   * Check a tool call for loop detection (ADR-062).
   *
   * Delegates to {@link ToolCallSignatureTracker.trackCall} and publishes
   * `loop.warning` or `loop.detected` events to the EventBus when the
   * tracker returns `warn` or `steer` respectively.
   *
   * Feature-flagged: returns `allow` immediately when
   * `process.env.AQE_LOOP_DETECTION_ENABLED === 'false'`.
   *
   * @param agentId  - The agent making the tool call
   * @param toolName - Name of the tool being called
   * @param args     - Arguments to the tool call
   * @returns The loop detection result
   */
  checkToolCall(agentId: string, toolName: string, args: unknown): LoopDetectionResult {
    // Feature flag gate — tracker checks internally too, but we skip event
    // publishing entirely when disabled to avoid unnecessary async work.
    if (process.env.AQE_LOOP_DETECTION_ENABLED === 'false') {
      return this._loopTracker.trackCall(agentId, toolName, args);
    }

    const result = this._loopTracker.trackCall(agentId, toolName, args);

    if (result.action === 'warn') {
      // Fire-and-forget: publish warning event
      const warningEvent: import('../shared/types/index.js').DomainEvent = {
        id: `loop-warn-${agentId}-${Date.now()}`,
        type: LOOP_EVENT_TYPES.LOOP_WARNING,
        timestamp: new Date(),
        source: 'coordination',
        correlationId: agentId,
        payload: {
          agentId,
          toolName,
          callCount: result.callCount,
          signature: result.signature,
        },
      };
      void this._eventBus.publish(warningEvent);
    } else if (result.action === 'steer') {
      // Fire-and-forget: publish loop-detected event
      const detectedEvent: import('../shared/types/index.js').DomainEvent = {
        id: `loop-detected-${agentId}-${Date.now()}`,
        type: LOOP_EVENT_TYPES.LOOP_DETECTED,
        timestamp: new Date(),
        source: 'coordination',
        correlationId: agentId,
        payload: {
          agentId,
          toolName,
          callCount: result.callCount,
          signature: result.signature,
          steeringMessage: result.steeringMessage,
        },
      };
      void this._eventBus.publish(detectedEvent);
    }

    return result;
  }

  /**
   * Get the internal ToolCallSignatureTracker for metrics / testing.
   */
  get loopTracker(): ToolCallSignatureTracker {
    return this._loopTracker;
  }
}

// Factory function
export function createKernel(config?: Partial<KernelConfig>): QEKernel {
  return new QEKernelImpl(config);
}
