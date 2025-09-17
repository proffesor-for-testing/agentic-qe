/**
 * Global Test Setup and Teardown Configuration
 * Manages Jest global setup, configuration, and cross-cutting test concerns
 */

import { setupIntegrationTests, teardownIntegrationTests, TEST_CONFIGS } from './integration-setup';
import { setupPerformanceMonitoring, getPerformanceReport } from './performance-setup';
import { setupE2ETests, teardownE2ETests } from './e2e-setup';
import { configureLogger } from '../../src/utils/Logger';

/**
 * Global setup function for Jest
 * Runs once before all test suites
 */
export default async function globalSetup(): Promise<void> {
  console.log('🚀 Starting global test setup...');
  
  // Configure logger for tests
  configureLogger({
    level: 'error', // Reduce noise during tests
    console: false,
    file: { enabled: false }
  });
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.QE_TEST_MODE = 'true';
  process.env.QE_LOG_LEVEL = 'error';
  
  // Ensure required directories exist
  await ensureTestDirectories();
  
  // Validate test environment
  await validateTestEnvironment();
  
  // Pre-warm test resources
  await prewarmTestResources();
  
  console.log('✅ Global test setup completed');
}

/**
 * Global teardown function for Jest
 * Runs once after all test suites
 */
export async function globalTeardown(): Promise<void> {
  console.log('🧹 Starting global test teardown...');
  
  try {
    // Cleanup any remaining test environments
    await teardownIntegrationTests();
    await teardownE2ETests();
    
    // Generate final test reports
    await generateTestReports();
    
    // Cleanup test artifacts
    await cleanupTestArtifacts();
    
    // Validate no resource leaks
    await validateResourceCleanup();
    
    console.log('✅ Global test teardown completed');
  } catch (error) {
    console.error('❌ Error during global teardown:', error);
    throw error;
  }
}

/**
 * Ensure required test directories exist
 */
async function ensureTestDirectories(): Promise<void> {
  const fs = require('fs').promises;
  const path = require('path');
  
  const directories = [
    'tmp/test-artifacts',
    'tmp/test-data',
    'tmp/performance-reports',
    'tmp/coverage-reports'
  ];
  
  for (const dir of directories) {
    const fullPath = path.resolve(process.cwd(), dir);
    try {
      await fs.mkdir(fullPath, { recursive: true });
    } catch (error) {
      console.warn(`Failed to create directory ${fullPath}:`, error);
    }
  }
}

/**
 * Validate test environment requirements
 */
async function validateTestEnvironment(): Promise<void> {
  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  
  if (majorVersion < 16) {
    throw new Error(`Node.js ${majorVersion} is not supported. Please use Node.js 16 or later.`);
  }
  
  // Check available memory
  const memUsage = process.memoryUsage();
  const availableMemoryMB = (memUsage.heapTotal + memUsage.external) / 1024 / 1024;
  
  if (availableMemoryMB < 256) {
    console.warn(`Low available memory: ${availableMemoryMB.toFixed(1)}MB. Tests may be slower.`);
  }
  
  // Check if required environment variables are set for certain tests
  const requiredEnvVars = ['NODE_ENV'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.warn(`Missing environment variables: ${missingVars.join(', ')}`);
  }
}

/**
 * Pre-warm test resources to improve performance
 */
async function prewarmTestResources(): Promise<void> {
  // Pre-load heavy modules to avoid first-test penalty
  try {
    require('../../src/memory/QEMemory');
    require('../../src/advanced/task-executor');
    require('../mocks');
    
    // Pre-warm Jest matchers
    expect.extend({});
    
    // Initialize global test utilities if needed
    global.testStartTime = Date.now();
    
  } catch (error) {
    console.warn('Failed to pre-warm some test resources:', error);
  }
}

/**
 * Generate comprehensive test reports
 */
async function generateTestReports(): Promise<void> {
  const fs = require('fs').promises;
  const path = require('path');
  
  try {
    // Get performance report if available
    const performanceReport = await getPerformanceReport();
    
    if (performanceReport) {
      const reportPath = path.resolve(process.cwd(), 'tmp/performance-reports/final-report.json');
      await fs.writeFile(reportPath, JSON.stringify(performanceReport, null, 2));
      console.log(`📊 Performance report saved to: ${reportPath}`);
    }
    
    // Generate test summary
    const testSummary = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      memoryUsage: process.memoryUsage(),
      testDuration: global.testStartTime ? Date.now() - global.testStartTime : 0,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        QE_TEST_MODE: process.env.QE_TEST_MODE,
        QE_LOG_LEVEL: process.env.QE_LOG_LEVEL
      }
    };
    
    const summaryPath = path.resolve(process.cwd(), 'tmp/test-artifacts/test-summary.json');
    await fs.writeFile(summaryPath, JSON.stringify(testSummary, null, 2));
    console.log(`📋 Test summary saved to: ${summaryPath}`);
    
  } catch (error) {
    console.warn('Failed to generate test reports:', error);
  }
}

/**
 * Cleanup test artifacts and temporary files
 */
async function cleanupTestArtifacts(): Promise<void> {
  const fs = require('fs').promises;
  const path = require('path');
  
  // Define cleanup patterns
  const cleanupPatterns = [
    'tmp/test-data/**/temp-*',
    'tmp/**/*.tmp',
    'tmp/**/session-*'
  ];
  
  // Note: In a real implementation, you'd use a library like 'glob' to match patterns
  // For now, we'll just clean known temporary directories
  const tempDirs = [
    'tmp/test-data',
    // Don't clean reports and artifacts as they might be useful
  ];
  
  for (const tempDir of tempDirs) {
    try {
      const fullPath = path.resolve(process.cwd(), tempDir);
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.name.startsWith('temp-') || entry.name.startsWith('session-')) {
          const itemPath = path.join(fullPath, entry.name);
          
          if (entry.isDirectory()) {
            await fs.rmdir(itemPath, { recursive: true });
          } else {
            await fs.unlink(itemPath);
          }
          
          console.log(`🗑️  Cleaned up: ${itemPath}`);
        }
      }
    } catch (error) {
      // Directory might not exist, which is fine
      if (error.code !== 'ENOENT') {
        console.warn(`Failed to cleanup ${tempDir}:`, error);
      }
    }
  }
}

/**
 * Validate that no resources are leaked after tests
 */
async function validateResourceCleanup(): Promise<void> {
  // Check memory usage
  if (global.gc) {
    global.gc();
    
    // Wait a bit for GC to complete
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  const finalMemUsage = process.memoryUsage();
  const heapUsedMB = finalMemUsage.heapUsed / 1024 / 1024;
  
  // Log final memory usage
  console.log(`🔍 Final memory usage: ${heapUsedMB.toFixed(1)}MB heap`);
  
  // Check for potential memory leaks
  if (heapUsedMB > 512) {
    console.warn(`⚠️  High memory usage detected: ${heapUsedMB.toFixed(1)}MB. Possible memory leak.`);
  }
  
  // Check for hanging handles (timers, network connections, etc.)
  const activeHandles = (process as any)._getActiveHandles?.();
  const activeRequests = (process as any)._getActiveRequests?.();
  
  if (activeHandles && activeHandles.length > 0) {
    console.warn(`⚠️  ${activeHandles.length} active handles remaining. May prevent clean exit.`);
  }
  
  if (activeRequests && activeRequests.length > 0) {
    console.warn(`⚠️  ${activeRequests.length} active requests remaining. May prevent clean exit.`);
  }
  
  // Log test completion time
  if (global.testStartTime) {
    const totalDuration = Date.now() - global.testStartTime;
    console.log(`⏱️  Total test suite duration: ${(totalDuration / 1000).toFixed(2)}s`);
  }
}

/**
 * Setup function for specific test types
 */
export const setupTestType = {
  unit: async () => {
    // Minimal setup for unit tests
    process.env.QE_TEST_TYPE = 'unit';
  },
  
  integration: async () => {
    process.env.QE_TEST_TYPE = 'integration';
    await setupIntegrationTests(TEST_CONFIGS.integration);
  },
  
  e2e: async () => {
    process.env.QE_TEST_TYPE = 'e2e';
    await setupE2ETests();
  },
  
  performance: async () => {
    process.env.QE_TEST_TYPE = 'performance';
    await setupPerformanceMonitoring('Performance Test Suite');
  }
};

/**
 * Teardown function for specific test types
 */
export const teardownTestType = {
  unit: async () => {
    // Minimal teardown for unit tests
    delete process.env.QE_TEST_TYPE;
  },
  
  integration: async () => {
    await teardownIntegrationTests();
    delete process.env.QE_TEST_TYPE;
  },
  
  e2e: async () => {
    await teardownE2ETests();
    delete process.env.QE_TEST_TYPE;
  },
  
  performance: async () => {
    await getPerformanceReport();
    delete process.env.QE_TEST_TYPE;
  }
};

/**
 * Enhanced Jest configuration helpers
 */
export const jestHelpers = {
  // Custom test environment detection
  isUnitTest: () => process.env.QE_TEST_TYPE === 'unit',
  isIntegrationTest: () => process.env.QE_TEST_TYPE === 'integration',
  isE2ETest: () => process.env.QE_TEST_TYPE === 'e2e',
  isPerformanceTest: () => process.env.QE_TEST_TYPE === 'performance',
  
  // Test timing utilities
  startTimer: (label: string) => {
    global[`timer_${label}`] = Date.now();
  },
  
  endTimer: (label: string) => {
    const startTime = global[`timer_${label}`];
    if (startTime) {
      const duration = Date.now() - startTime;
      delete global[`timer_${label}`];
      return duration;
    }
    return 0;
  },
  
  // Memory tracking utilities
  captureMemorySnapshot: (label: string) => {
    const memUsage = process.memoryUsage();
    global[`memory_${label}`] = {
      timestamp: Date.now(),
      ...memUsage
    };
    return memUsage;
  },
  
  compareMemorySnapshots: (labelBefore: string, labelAfter: string) => {
    const before = global[`memory_${labelBefore}`];
    const after = global[`memory_${labelAfter}`];
    
    if (!before || !after) {
      throw new Error(`Memory snapshots not found: ${labelBefore}, ${labelAfter}`);
    }
    
    return {
      heapUsedDiff: after.heapUsed - before.heapUsed,
      heapTotalDiff: after.heapTotal - before.heapTotal,
      externalDiff: after.external - before.external,
      rssDiff: after.rss - before.rss,
      timeDiff: after.timestamp - before.timestamp
    };
  }
};

// Export global teardown for Jest configuration
export { globalTeardown };