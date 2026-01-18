/**
 * Agentic QE v3 - Worker Manager Implementation
 * ADR-014: Background Workers for QE Monitoring
 *
 * Manages the lifecycle and scheduling of all background workers.
 * Provides centralized control for starting, stopping, and monitoring workers.
 */

import {
  Worker,
  WorkerManager as IWorkerManager,
  WorkerManagerHealth,
  WorkerResult,
  WorkerContext,
  WorkerEventBus,
  WorkerMemory,
  WorkerLogger,
  WorkerDomainAccess,
  WorkerEvent,
} from './interfaces';
import { DomainName } from '../shared/types';

/**
 * In-memory implementation of Worker Event Bus
 */
class InMemoryWorkerEventBus implements WorkerEventBus {
  private handlers: Array<(event: WorkerEvent) => void> = [];

  async publish(event: WorkerEvent): Promise<void> {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }

  subscribe(handler: (event: WorkerEvent) => void): () => void {
    this.handlers.push(handler);
    return () => {
      const index = this.handlers.indexOf(handler);
      if (index >= 0) {
        this.handlers.splice(index, 1);
      }
    };
  }

  /**
   * Clear all event handlers
   */
  dispose(): void {
    this.handlers = [];
  }

  /**
   * Get handler count (for debugging)
   */
  get handlerCount(): number {
    return this.handlers.length;
  }
}

/**
 * In-memory implementation of Worker Memory
 */
class InMemoryWorkerMemory implements WorkerMemory {
  private store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async search(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(this.store.keys()).filter((key) => regex.test(key));
  }

  /**
   * Clear all stored data
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get entry count (for debugging)
   */
  get size(): number {
    return this.store.size;
  }
}

/**
 * Console-based Worker Logger
 */
class ConsoleWorkerLogger implements WorkerLogger {
  constructor(private workerId: string) {}

  private format(level: string, message: string, meta?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}] [${this.workerId}] ${message}${metaStr}`;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.DEBUG) {
      console.debug(this.format('DEBUG', message, meta));
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    console.info(this.format('INFO', message, meta));
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(this.format('WARN', message, meta));
  }

  error(message: string, meta?: Record<string, unknown>): void {
    console.error(this.format('ERROR', message, meta));
  }
}

/**
 * Kernel-integrated Domain Access
 * Provides workers access to domain services via the kernel
 */
class KernelWorkerDomainAccess implements WorkerDomainAccess {
  constructor(
    private readonly kernelGetter: () => KernelReference | undefined
  ) {}

  getDomainAPI<T>(domain: DomainName): T | undefined {
    const kernel = this.kernelGetter();
    if (!kernel) {
      return undefined;
    }
    return kernel.getDomainAPI<T>(domain);
  }

  getDomainHealth(domain: DomainName): { status: string; errors: string[] } {
    const kernel = this.kernelGetter();
    if (!kernel) {
      return { status: 'unknown', errors: ['Kernel not available'] };
    }

    const health = kernel.getHealth();
    const domainHealth = health.domains[domain];

    if (!domainHealth) {
      return { status: 'unknown', errors: [`Domain ${domain} not found`] };
    }

    return {
      status: domainHealth.status,
      errors: domainHealth.errors || [],
    };
  }
}

/**
 * Reference interface for kernel (to avoid circular dependency)
 */
interface KernelReference {
  getDomainAPI<T>(domain: DomainName): T | undefined;
  getHealth(): {
    domains: Record<string, { status: string; errors?: string[] }>;
  };
}

/**
 * Stub Domain Access (fallback when kernel not available)
 */
class StubWorkerDomainAccess implements WorkerDomainAccess {
  getDomainAPI<T>(_domain: DomainName): T | undefined {
    return undefined;
  }

  getDomainHealth(_domain: DomainName): { status: string; errors: string[] } {
    return { status: 'healthy', errors: [] };
  }
}

/**
 * Worker Manager implementation
 */
export class WorkerManagerImpl implements IWorkerManager {
  private workers = new Map<string, Worker>();
  private timers = new Map<string, NodeJS.Timeout>();
  private abortControllers = new Map<string, AbortController>();
  private eventBus: InMemoryWorkerEventBus;
  private memory: InMemoryWorkerMemory;
  private domainAccess: WorkerDomainAccess;
  private running = false;
  private kernelRef: KernelReference | undefined;

  constructor(options?: {
    eventBus?: WorkerEventBus;
    memory?: WorkerMemory;
    domainAccess?: WorkerDomainAccess;
    kernel?: KernelReference;
  }) {
    this.eventBus = (options?.eventBus as InMemoryWorkerEventBus) ?? new InMemoryWorkerEventBus();
    this.memory = (options?.memory as InMemoryWorkerMemory) ?? new InMemoryWorkerMemory();
    this.kernelRef = options?.kernel;

    // Use kernel-based domain access if kernel is provided, otherwise fall back
    if (options?.domainAccess) {
      this.domainAccess = options.domainAccess;
    } else if (options?.kernel) {
      this.domainAccess = new KernelWorkerDomainAccess(() => this.kernelRef);
    } else {
      this.domainAccess = new StubWorkerDomainAccess();
    }
  }

  /**
   * Set or update the kernel reference
   * Allows late binding of kernel after construction
   */
  setKernel(kernel: KernelReference): void {
    this.kernelRef = kernel;
    // Update domain access to use kernel if not already custom
    if (this.domainAccess instanceof StubWorkerDomainAccess) {
      this.domainAccess = new KernelWorkerDomainAccess(() => this.kernelRef);
    }
  }

  /**
   * Register a worker
   */
  register(worker: Worker): void {
    if (this.workers.has(worker.config.id)) {
      throw new Error(`Worker ${worker.config.id} is already registered`);
    }
    this.workers.set(worker.config.id, worker);
  }

  /**
   * Unregister a worker
   */
  unregister(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      this.stopWorker(workerId);
      this.workers.delete(workerId);
    }
  }

  /**
   * Get a worker by ID
   */
  get(workerId: string): Worker | undefined {
    return this.workers.get(workerId);
  }

  /**
   * List all registered workers
   */
  list(): Worker[] {
    return Array.from(this.workers.values());
  }

  /**
   * Start all enabled workers
   */
  async startAll(): Promise<void> {
    this.running = true;

    for (const worker of Array.from(this.workers.values())) {
      if (worker.config.enabled) {
        await this.startWorker(worker);
      }
    }
  }

  /**
   * Stop all workers
   */
  async stopAll(): Promise<void> {
    this.running = false;

    const stopPromises: Promise<void>[] = [];
    for (const workerId of Array.from(this.workers.keys())) {
      stopPromises.push(this.stopWorker(workerId));
    }
    await Promise.all(stopPromises);
  }

  /**
   * Run a specific worker immediately
   */
  async runNow(workerId: string): Promise<WorkerResult> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new Error(`Worker ${workerId} not found`);
    }

    // Cancel existing timer if any
    const existingTimer = this.timers.get(workerId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Create a new abort controller for this execution
    const abortController = new AbortController();
    this.abortControllers.set(workerId, abortController);

    const context = this.createContext(workerId, abortController.signal);
    const result = await worker.execute(context);

    // Reschedule if still running
    if (this.running && worker.config.enabled && worker.status !== 'stopped') {
      this.scheduleNextRun(worker);
    }

    return result;
  }

  /**
   * Get manager health status
   */
  getHealth(): WorkerManagerHealth {
    const workerHealths: Record<string, ReturnType<Worker['getHealth']>> = {};
    let runningCount = 0;
    let pausedCount = 0;
    let errorCount = 0;
    let totalHealthScore = 0;

    for (const [id, worker] of Array.from(this.workers.entries())) {
      const health = worker.getHealth();
      workerHealths[id] = health;
      totalHealthScore += health.healthScore;

      switch (worker.status) {
        case 'running':
          runningCount++;
          break;
        case 'paused':
          pausedCount++;
          break;
        case 'error':
          errorCount++;
          break;
      }
    }

    const avgHealthScore =
      this.workers.size > 0 ? Math.round(totalHealthScore / this.workers.size) : 100;

    return {
      totalWorkers: this.workers.size,
      runningWorkers: runningCount,
      pausedWorkers: pausedCount,
      errorWorkers: errorCount,
      healthScore: avgHealthScore,
      workers: workerHealths,
    };
  }

  /**
   * Subscribe to worker events
   */
  onWorkerEvent(handler: (event: WorkerEvent) => void): () => void {
    return this.eventBus.subscribe(handler);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async startWorker(worker: Worker): Promise<void> {
    await worker.initialize();

    // Create abort controller
    const abortController = new AbortController();
    this.abortControllers.set(worker.config.id, abortController);

    // Run immediately
    const context = this.createContext(worker.config.id, abortController.signal);
    try {
      await worker.execute(context);
    } catch (error) {
      console.error(`Worker ${worker.config.id} initial execution failed:`, error);
    }

    // Schedule next run
    this.scheduleNextRun(worker);
  }

  private async stopWorker(workerId: string): Promise<void> {
    // Clear timer
    const timer = this.timers.get(workerId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(workerId);
    }

    // Abort any running execution
    const abortController = this.abortControllers.get(workerId);
    if (abortController) {
      abortController.abort();
      this.abortControllers.delete(workerId);
    }

    // Stop the worker
    const worker = this.workers.get(workerId);
    if (worker) {
      await worker.stop();
    }
  }

  private scheduleNextRun(worker: Worker): void {
    const timer = setTimeout(async () => {
      if (!this.running || worker.status === 'stopped' || worker.status === 'paused') {
        return;
      }

      const abortController = new AbortController();
      this.abortControllers.set(worker.config.id, abortController);

      const context = this.createContext(worker.config.id, abortController.signal);
      try {
        await worker.execute(context);
      } catch (error) {
        console.error(`Worker ${worker.config.id} execution failed:`, error);
      }

      // Schedule next run (worker status is 'idle' | 'running' | 'error', not 'stopped')
      if (this.running && worker.config.enabled && worker.status !== 'error') {
        this.scheduleNextRun(worker);
      }
    }, worker.config.intervalMs);

    this.timers.set(worker.config.id, timer);
  }

  private createContext(workerId: string, signal: AbortSignal): WorkerContext {
    return {
      eventBus: this.eventBus,
      memory: this.memory,
      logger: new ConsoleWorkerLogger(workerId),
      domains: this.domainAccess,
      signal,
    };
  }
}
