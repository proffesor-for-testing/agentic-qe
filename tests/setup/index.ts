/**
 * Test Setup and Teardown Utilities - Main Export
 * Centralized access to all test setup configurations and utilities
 */

// Core setup modules
export {
  setupIntegrationTests,
  teardownIntegrationTests,
  getCurrentTestEnvironment,
  createIsolatedTestEnvironment,
  integrationTestHooks,
  IntegrationTestEnvironment,
  TEST_CONFIGS,
  type TestEnvironment,
  type TestConfiguration,
  type TestMetrics
} from './integration-setup';

export {
  setupPerformanceMonitoring,
  getPerformanceReport,
  createPerformanceMonitor,
  performanceTestHooks,
  PerformanceTestManager,
  PERFORMANCE_THRESHOLDS,
  type PerformanceTestEnvironment,
  type PerformanceMetrics,
  type PerformanceReport,
  type PerformanceThresholds
} from './performance-setup';

export {
  setupE2ETests,
  teardownE2ETests,
  e2eTestHooks,
  E2ETestManager,
  type E2ETestEnvironment,
  type ExternalServiceManager,
  type ScenarioManager,
  type ValidationManager,
  type TestScenario,
  type ScenarioResult,
  type ValidationResult
} from './e2e-setup';

export {
  globalTeardown,
  setupTestType,
  teardownTestType,
  jestHelpers
} from './global-setup';

// Enhanced setup utilities
import {
  setupIntegrationTests,
  teardownIntegrationTests,
  TEST_CONFIGS,
  type TestConfiguration
} from './integration-setup';

import {
  setupPerformanceMonitoring,
  PERFORMANCE_THRESHOLDS,
  type PerformanceThresholds
} from './performance-setup';

import {
  setupE2ETests,
  teardownE2ETests
} from './e2e-setup';

/**
 * Test setup configuration options
 */
export interface TestSetupOptions {
  type: 'unit' | 'integration' | 'e2e' | 'performance';
  isolation?: boolean;
  monitoring?: boolean;
  cleanup?: {
    memory?: boolean;
    files?: boolean;
    processes?: boolean;
    network?: boolean;
  };
  thresholds?: Partial<PerformanceThresholds>;
  timeout?: number;
}

/**
 * Universal test environment interface
 */
export interface UniversalTestEnvironment {
  type: string;
  setup: () => Promise<void>;
  teardown: () => Promise<void>;
  reset: () => Promise<void>;
  getMetrics: () => any;
  isReady: () => boolean;
}

/**
 * Factory function to create appropriate test environment
 */
export async function createTestEnvironment(options: TestSetupOptions): Promise<UniversalTestEnvironment> {
  switch (options.type) {
    case 'unit':
      return createUnitTestEnvironment(options);
    
    case 'integration':
      return createIntegrationTestEnvironment(options);
    
    case 'e2e':
      return createE2ETestEnvironment(options);
    
    case 'performance':
      return createPerformanceTestEnvironment(options);
    
    default:
      throw new Error(`Unknown test type: ${options.type}`);
  }
}

/**
 * Create unit test environment (minimal setup)
 */
async function createUnitTestEnvironment(options: TestSetupOptions): Promise<UniversalTestEnvironment> {
  let ready = false;
  
  return {
    type: 'unit',
    
    async setup() {
      // Minimal setup for unit tests
      process.env.NODE_ENV = 'test';
      process.env.QE_TEST_TYPE = 'unit';
      
      // Clear any existing timers/intervals
      jest.clearAllTimers();
      
      ready = true;
    },
    
    async teardown() {
      // Minimal cleanup
      jest.clearAllMocks();
      ready = false;
    },
    
    async reset() {
      jest.clearAllMocks();
    },
    
    getMetrics() {
      return {
        type: 'unit',
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
      };
    },
    
    isReady() {
      return ready;
    }
  };
}

/**
 * Create integration test environment
 */
async function createIntegrationTestEnvironment(options: TestSetupOptions): Promise<UniversalTestEnvironment> {
  let testEnv: any = null;
  let performanceMonitor: any = null;
  
  return {
    type: 'integration',
    
    async setup() {
      const config = {
        ...TEST_CONFIGS.integration,
        isolation: options.isolation ?? true,
        cleanup: {
          ...TEST_CONFIGS.integration.cleanup,
          ...options.cleanup
        },
        timeouts: {
          ...TEST_CONFIGS.integration.timeouts,
          test: options.timeout ?? TEST_CONFIGS.integration.timeouts.test
        }
      };
      
      testEnv = await setupIntegrationTests(config);
      
      if (options.monitoring) {
        performanceMonitor = await setupPerformanceMonitoring(
          'Integration Test',
          {
            ...PERFORMANCE_THRESHOLDS.integration,
            ...options.thresholds
          }
        );
      }
    },
    
    async teardown() {
      if (performanceMonitor) {
        await performanceMonitor.stopMonitoring();
        await performanceMonitor.cleanup();
      }
      
      await teardownIntegrationTests();
    },
    
    async reset() {
      if (testEnv) {
        await testEnv.resetState();
      }
    },
    
    getMetrics() {
      const baseMetrics = testEnv ? testEnv.getMetrics() : {};
      const perfMetrics = performanceMonitor ? performanceMonitor.getMetrics() : {};
      
      return {
        type: 'integration',
        ...baseMetrics,
        performance: perfMetrics
      };
    },
    
    isReady() {
      return testEnv !== null;
    }
  };
}

/**
 * Create E2E test environment
 */
async function createE2ETestEnvironment(options: TestSetupOptions): Promise<UniversalTestEnvironment> {
  let e2eEnv: any = null;
  
  return {
    type: 'e2e',
    
    async setup() {
      e2eEnv = await setupE2ETests();
    },
    
    async teardown() {
      await teardownE2ETests();
    },
    
    async reset() {
      if (e2eEnv) {
        await e2eEnv.externalServices.resetServices();
        await e2eEnv.resetState();
      }
    },
    
    getMetrics() {
      const baseMetrics = e2eEnv ? e2eEnv.getMetrics() : {};
      const perfMetrics = e2eEnv?.performanceMonitor ? e2eEnv.performanceMonitor.getMetrics() : {};
      
      return {
        type: 'e2e',
        ...baseMetrics,
        performance: perfMetrics,
        services: e2eEnv?.externalServices.getServiceStatus() || []
      };
    },
    
    isReady() {
      return e2eEnv !== null;
    }
  };
}

/**
 * Create performance test environment
 */
async function createPerformanceTestEnvironment(options: TestSetupOptions): Promise<UniversalTestEnvironment> {
  let perfMonitor: any = null;
  
  return {
    type: 'performance',
    
    async setup() {
      perfMonitor = await setupPerformanceMonitoring(
        'Performance Test',
        {
          ...PERFORMANCE_THRESHOLDS.integration,
          ...options.thresholds
        }
      );
    },
    
    async teardown() {
      if (perfMonitor) {
        await perfMonitor.stopMonitoring();
        await perfMonitor.cleanup();
      }
    },
    
    async reset() {
      // Performance monitors typically don't need reset
      // but we can clear marks and measures
      if (typeof performance !== 'undefined') {
        performance.clearMarks();
        performance.clearMeasures();
      }
    },
    
    getMetrics() {
      return perfMonitor ? perfMonitor.getMetrics() : {
        type: 'performance',
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      };
    },
    
    isReady() {
      return perfMonitor !== null;
    }
  };
}

/**
 * Simplified setup functions for common use cases
 */
export const quickSetup = {
  /**
   * Quick unit test setup with sensible defaults
   */
  unit: () => createTestEnvironment({ type: 'unit' }),
  
  /**
   * Quick integration test setup with monitoring
   */
  integration: (isolation = true) => createTestEnvironment({
    type: 'integration',
    isolation,
    monitoring: true,
    cleanup: {
      memory: true,
      files: true,
      processes: true,
      network: true
    }
  }),
  
  /**
   * Quick E2E test setup
   */
  e2e: () => createTestEnvironment({ type: 'e2e' }),
  
  /**
   * Quick performance test setup with custom thresholds
   */
  performance: (thresholds?: Partial<PerformanceThresholds>) => createTestEnvironment({
    type: 'performance',
    monitoring: true,
    thresholds
  })
};

/**
 * Jest test hooks factory
 */
export function createTestHooks(options: TestSetupOptions) {
  let testEnv: UniversalTestEnvironment | null = null;
  
  return {
    beforeAll: async () => {
      testEnv = await createTestEnvironment(options);
      await testEnv.setup();
    },
    
    afterAll: async () => {
      if (testEnv) {
        await testEnv.teardown();
        testEnv = null;
      }
    },
    
    beforeEach: async () => {
      if (testEnv) {
        await testEnv.reset();
      }
    },
    
    afterEach: async () => {
      if (testEnv && options.monitoring) {
        const metrics = testEnv.getMetrics();
        
        // Log warnings for concerning metrics
        if (metrics.performance?.memory?.heapUsed > 256 * 1024 * 1024) {
          console.warn('⚠️  High memory usage detected:', metrics.performance.memory.heapUsed);
        }
      }
    },
    
    getEnvironment: () => testEnv
  };
}

/**
 * Default export: factory function
 */
export default createTestEnvironment;