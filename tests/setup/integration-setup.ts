/**
 * Integration Test Setup and Teardown Procedures
 * Manages test environment, database connections, mock services, and cleanup
 */

import { EventEmitter } from 'events';
import { QEMemory } from '../../src/memory/QEMemory';
import { TaskExecutor } from '../../src/advanced/task-executor';
import { createMockLogger, createMockMemory, createMockExecutionContext } from '../mocks';
import { Logger } from '../../src/utils/Logger';

export interface TestEnvironment {
  memory: QEMemory;
  taskExecutor: TaskExecutor;
  logger: Logger;
  cleanup: () => Promise<void>;
  resetState: () => Promise<void>;
  getMetrics: () => TestMetrics;
}

export interface TestMetrics {
  memoryUsage: {
    entries: number;
    totalSize: number;
    sessions: number;
  };
  taskExecution: {
    completed: number;
    failed: number;
    pending: number;
    totalDuration: number;
  };
  resources: {
    activeConnections: number;
    openFiles: number;
    memoryLeaks: any[];
  };
}

export interface TestConfiguration {
  environment: 'test' | 'integration' | 'e2e';
  isolation: boolean;
  cleanup: {
    memory: boolean;
    files: boolean;
    processes: boolean;
    network: boolean;
  };
  timeouts: {
    setup: number;
    teardown: number;
    test: number;
  };
  resources: {
    maxMemoryMB: number;
    maxConcurrentTasks: number;
    maxConnections: number;
  };
}

class IntegrationTestEnvironment extends EventEmitter implements TestEnvironment {
  public memory!: QEMemory;
  public taskExecutor!: TaskExecutor;
  public logger!: Logger;
  private config: TestConfiguration;
  private startTime: number;
  private metrics: TestMetrics;
  private cleanupTasks: (() => Promise<void>)[] = [];
  private tempDirectories: string[] = [];
  private activeProcesses: number[] = [];
  private networkMocks: any[] = [];

  constructor(config: TestConfiguration) {
    super();
    this.config = config;
    this.startTime = Date.now();
    this.metrics = this.initializeMetrics();
  }

  private initializeMetrics(): TestMetrics {
    return {
      memoryUsage: {
        entries: 0,
        totalSize: 0,
        sessions: 0
      },
      taskExecution: {
        completed: 0,
        failed: 0,
        pending: 0,
        totalDuration: 0
      },
      resources: {
        activeConnections: 0,
        openFiles: 0,
        memoryLeaks: []
      }
    };
  }

  async setup(): Promise<void> {
    const setupTimeout = setTimeout(() => {
      throw new Error(`Setup timeout after ${this.config.timeouts.setup}ms`);
    }, this.config.timeouts.setup);

    try {
      this.emit('setup:started');

      // Initialize logger with test configuration
      this.logger = createMockLogger();
      this.logger.info('Setting up integration test environment');

      // Setup memory system
      await this.setupMemory();
      
      // Setup task executor
      await this.setupTaskExecutor();
      
      // Setup network mocks if needed
      await this.setupNetworkMocks();
      
      // Setup file system isolation
      await this.setupFileSystemIsolation();
      
      // Register cleanup handlers
      this.registerCleanupHandlers();

      this.emit('setup:completed');
      this.logger.info('Integration test environment setup completed');
    } catch (error) {
      this.emit('setup:failed', error);
      this.logger.error('Failed to setup integration test environment', error);
      await this.cleanup();
      throw error;
    } finally {
      clearTimeout(setupTimeout);
    }
  }

  private async setupMemory(): Promise<void> {
    this.logger.debug('Setting up memory system');
    
    // Create isolated memory instance for testing
    this.memory = new QEMemory({
      persistenceEnabled: false, // Disable persistence in tests
      sessionTimeout: 30000,
      maxEntries: 1000,
      enableMetrics: true,
      storage: {
        type: 'memory',
        options: {
          maxSizeMB: this.config.resources.maxMemoryMB
        }
      }
    });

    // Monitor memory events
    this.memory.on('entry:created', () => {
      this.metrics.memoryUsage.entries++;
    });

    this.memory.on('entry:deleted', () => {
      this.metrics.memoryUsage.entries--;
    });

    this.memory.on('session:created', () => {
      this.metrics.memoryUsage.sessions++;
    });

    this.memory.on('session:ended', () => {
      this.metrics.memoryUsage.sessions--;
    });

    // Add memory cleanup task
    this.cleanupTasks.push(async () => {
      if (this.memory) {
        await this.memory.cleanup();
        this.memory.removeAllListeners();
      }
    });
  }

  private async setupTaskExecutor(): Promise<void> {
    this.logger.debug('Setting up task executor');
    
    this.taskExecutor = new TaskExecutor({
      maxConcurrentTasks: this.config.resources.maxConcurrentTasks,
      defaultTimeout: this.config.timeouts.test,
      retryPolicy: {
        maxRetries: 2,
        backoffMultiplier: 1.5,
        initialDelay: 100
      },
      resourceLimits: {
        maxMemoryMB: this.config.resources.maxMemoryMB,
        maxExecutionTime: this.config.timeouts.test
      }
    });

    // Monitor task execution events
    this.taskExecutor.on('task:completed', () => {
      this.metrics.taskExecution.completed++;
    });

    this.taskExecutor.on('task:failed', () => {
      this.metrics.taskExecution.failed++;
    });

    this.taskExecutor.on('task:started', () => {
      this.metrics.taskExecution.pending++;
    });

    // Add task executor cleanup
    this.cleanupTasks.push(async () => {
      if (this.taskExecutor) {
        await this.taskExecutor.shutdown();
        this.taskExecutor.removeAllListeners();
      }
    });
  }

  private async setupNetworkMocks(): Promise<void> {
    this.logger.debug('Setting up network mocks');
    
    // Mock external API calls for isolation
    const originalFetch = global.fetch;
    
    global.fetch = jest.fn().mockImplementation(async (url: string, options?: any) => {
      this.metrics.resources.activeConnections++;
      
      // Return mock responses for known endpoints
      if (url.includes('/api/test')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: 'test' })
        });
      }
      
      // Fallback to original fetch for unknown URLs
      return originalFetch(url, options);
    });

    // Add network cleanup
    this.cleanupTasks.push(async () => {
      global.fetch = originalFetch;
      this.metrics.resources.activeConnections = 0;
    });
  }

  private async setupFileSystemIsolation(): Promise<void> {
    if (!this.config.isolation) return;
    
    this.logger.debug('Setting up file system isolation');
    
    // Create temporary directories for test isolation
    const tempDir = `/tmp/qe-integration-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    await require('fs').promises.mkdir(tempDir, { recursive: true });
    this.tempDirectories.push(tempDir);
    
    // Set environment variable for isolated storage
    process.env.QE_TEST_STORAGE_PATH = tempDir;
    
    this.logger.debug(`Created isolated storage directory: ${tempDir}`);
  }

  private registerCleanupHandlers(): void {
    // Register process exit handlers
    const cleanup = () => {
      this.cleanup().catch(console.error);
    };

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception during test', error);
      cleanup();
    });
  }

  async resetState(): Promise<void> {
    this.logger.debug('Resetting test state');
    
    if (this.memory) {
      await this.memory.clear();
    }
    
    if (this.taskExecutor) {
      await this.taskExecutor.reset();
    }
    
    // Reset metrics
    this.metrics = this.initializeMetrics();
    
    this.emit('state:reset');
  }

  async cleanup(): Promise<void> {
    const cleanupTimeout = setTimeout(() => {
      console.error(`Cleanup timeout after ${this.config.timeouts.teardown}ms`);
    }, this.config.timeouts.teardown);

    try {
      this.emit('cleanup:started');
      this.logger.info('Starting integration test environment cleanup');

      // Execute all registered cleanup tasks
      for (const cleanupTask of this.cleanupTasks) {
        try {
          await cleanupTask();
        } catch (error) {
          this.logger.error('Error during cleanup task', error);
        }
      }

      // Clean up temporary directories
      if (this.config.cleanup.files) {
        await this.cleanupTempDirectories();
      }

      // Clean up processes
      if (this.config.cleanup.processes) {
        await this.cleanupProcesses();
      }

      // Check for memory leaks
      await this.checkMemoryLeaks();

      this.emit('cleanup:completed');
      this.logger.info('Integration test environment cleanup completed');
    } catch (error) {
      this.emit('cleanup:failed', error);
      this.logger.error('Failed to cleanup integration test environment', error);
      throw error;
    } finally {
      clearTimeout(cleanupTimeout);
      this.removeAllListeners();
    }
  }

  private async cleanupTempDirectories(): Promise<void> {
    for (const tempDir of this.tempDirectories) {
      try {
        await require('fs').promises.rmdir(tempDir, { recursive: true });
        this.logger.debug(`Cleaned up temp directory: ${tempDir}`);
      } catch (error) {
        this.logger.warn(`Failed to cleanup temp directory ${tempDir}:`, error);
      }
    }
    this.tempDirectories = [];
  }

  private async cleanupProcesses(): Promise<void> {
    for (const pid of this.activeProcesses) {
      try {
        process.kill(pid, 'SIGTERM');
        this.logger.debug(`Terminated process: ${pid}`);
      } catch (error) {
        this.logger.warn(`Failed to terminate process ${pid}:`, error);
      }
    }
    this.activeProcesses = [];
  }

  private async checkMemoryLeaks(): Promise<void> {
    if (global.gc) {
      global.gc();
    }
    
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    
    if (heapUsedMB > this.config.resources.maxMemoryMB) {
      const leak = {
        heapUsed: heapUsedMB,
        threshold: this.config.resources.maxMemoryMB,
        timestamp: new Date(),
        testDuration: Date.now() - this.startTime
      };
      
      this.metrics.resources.memoryLeaks.push(leak);
      this.logger.warn('Potential memory leak detected', leak);
    }
  }

  getMetrics(): TestMetrics {
    return {
      ...this.metrics,
      taskExecution: {
        ...this.metrics.taskExecution,
        totalDuration: Date.now() - this.startTime
      }
    };
  }
}

// Default test configurations
export const TEST_CONFIGS = {
  unit: {
    environment: 'test' as const,
    isolation: false,
    cleanup: {
      memory: true,
      files: false,
      processes: false,
      network: false
    },
    timeouts: {
      setup: 5000,
      teardown: 3000,
      test: 10000
    },
    resources: {
      maxMemoryMB: 100,
      maxConcurrentTasks: 5,
      maxConnections: 10
    }
  },
  
  integration: {
    environment: 'integration' as const,
    isolation: true,
    cleanup: {
      memory: true,
      files: true,
      processes: true,
      network: true
    },
    timeouts: {
      setup: 15000,
      teardown: 10000,
      test: 30000
    },
    resources: {
      maxMemoryMB: 256,
      maxConcurrentTasks: 10,
      maxConnections: 25
    }
  },
  
  e2e: {
    environment: 'e2e' as const,
    isolation: true,
    cleanup: {
      memory: true,
      files: true,
      processes: true,
      network: true
    },
    timeouts: {
      setup: 30000,
      teardown: 20000,
      test: 60000
    },
    resources: {
      maxMemoryMB: 512,
      maxConcurrentTasks: 20,
      maxConnections: 50
    }
  }
};

// Global test environment instance
let globalTestEnvironment: IntegrationTestEnvironment | null = null;

/**
 * Setup integration test environment
 */
export async function setupIntegrationTests(config: TestConfiguration = TEST_CONFIGS.integration): Promise<TestEnvironment> {
  if (globalTestEnvironment) {
    await globalTestEnvironment.cleanup();
  }
  
  globalTestEnvironment = new IntegrationTestEnvironment(config);
  await globalTestEnvironment.setup();
  
  return globalTestEnvironment;
}

/**
 * Teardown integration test environment
 */
export async function teardownIntegrationTests(): Promise<void> {
  if (globalTestEnvironment) {
    await globalTestEnvironment.cleanup();
    globalTestEnvironment = null;
  }
}

/**
 * Get current test environment
 */
export function getCurrentTestEnvironment(): TestEnvironment | null {
  return globalTestEnvironment;
}

/**
 * Create isolated test environment for specific test
 */
export async function createIsolatedTestEnvironment(config: Partial<TestConfiguration> = {}): Promise<TestEnvironment> {
  const mergedConfig = {
    ...TEST_CONFIGS.integration,
    ...config
  };
  
  const isolatedEnv = new IntegrationTestEnvironment(mergedConfig);
  await isolatedEnv.setup();
  
  return isolatedEnv;
}

/**
 * Jest setup hooks for integration tests
 */
export const integrationTestHooks = {
  beforeAll: async (config?: TestConfiguration) => {
    await setupIntegrationTests(config);
  },
  
  afterAll: async () => {
    await teardownIntegrationTests();
  },
  
  beforeEach: async () => {
    if (globalTestEnvironment) {
      await globalTestEnvironment.resetState();
    }
  },
  
  afterEach: async () => {
    if (globalTestEnvironment) {
      const metrics = globalTestEnvironment.getMetrics();
      
      // Log any concerning metrics
      if (metrics.resources.memoryLeaks.length > 0) {
        console.warn('Memory leaks detected:', metrics.resources.memoryLeaks);
      }
      
      if (metrics.taskExecution.failed > 0) {
        console.warn('Task execution failures:', metrics.taskExecution.failed);
      }
    }
  }
};

// Export environment factory for custom configurations
export { IntegrationTestEnvironment };