/**
 * Jest Setup File
 *
 * Provides global test configuration and mocks for the AQE Fleet test suite.
 * CRITICAL: Initializes EventBus and SwarmMemoryManager BEFORE all tests run.
 * This prevents "Database not initialized" and "EventBus getInstance before initialize" errors.
 */

import 'jest-extended';
import { EventBus } from './src/core/EventBus';
import { SwarmMemoryManager } from './src/core/memory/SwarmMemoryManager';
import * as path from 'path';

const WORKSPACE_PATH = '/workspaces/agentic-qe-cf';
const originalCwd = process.cwd.bind(process);

// CRITICAL: Mock process.cwd() BEFORE any other modules load
// This prevents stack-utils and graceful-fs from failing during module resolution
process.cwd = jest.fn(() => {
  try {
    const cwd = originalCwd();
    return cwd && cwd !== '' ? cwd : WORKSPACE_PATH;
  } catch (error) {
    // Fallback to known workspace path if cwd() fails
    return WORKSPACE_PATH;
  }
});

// Mock stack-utils globally to prevent cwd errors during expect() initialization
jest.mock('stack-utils', () => {
  return jest.fn().mockImplementation(() => ({
    clean: jest.fn((stack) => stack),
    capture: jest.fn(() => []),
    captureString: jest.fn(() => ''),
    at: jest.fn(() => null),
    parseLine: jest.fn(() => null)
  }));
});

// Mock path module to prevent Logger initialization errors
jest.mock('path', () => {
  const actualPath = jest.requireActual('path');
  return {
    ...actualPath,
    join: (...args: string[]) => {
      // Handle undefined/null arguments safely
      const sanitizedArgs = args.map(arg => {
        if (arg === undefined || arg === null || arg === '') {
          return WORKSPACE_PATH;
        }
        return arg;
      });
      return actualPath.join(...sanitizedArgs);
    }
  };
});

// Logger is mocked via manual mock in src/utils/__mocks__/Logger.ts
// Jest will automatically use the manual mock when jest.mock() is called in test files

// Mock Database to use the test mock in tests/__mocks__/Database.ts
// This prevents "this.database.initialize is not a function" errors in AgentRegistry
jest.mock('./src/utils/Database');

// Mock createAgent globally with proper implementation
// IMPORTANT: Use jest.requireActual to preserve QEAgentFactory and other exports
jest.mock('./src/agents', () => {
  const actual = jest.requireActual('./src/agents');
  return {
    ...actual, // Preserve all actual exports including QEAgentFactory
    createAgent: jest.fn().mockImplementation((type, config, services) => ({
      id: `agent-${Math.random().toString(36).substring(7)}`,
      type,
      config,
      status: 'idle',
      initialize: jest.fn().mockResolvedValue(undefined),
      assignTask: jest.fn().mockResolvedValue(undefined),
      terminate: jest.fn().mockResolvedValue(undefined),
      getStatus: jest.fn().mockReturnValue({ status: 'idle' }),
      execute: jest.fn().mockResolvedValue({ success: true })
    }))
  };
});

// Global test timeout (30 seconds)
jest.setTimeout(30000);

// Global instances that will be initialized once
let globalEventBus: EventBus;
let globalMemoryManager: SwarmMemoryManager;

/**
 * CRITICAL: Initialize infrastructure BEFORE all tests
 * This ensures EventBus and SwarmMemoryManager are ready when tests start
 */
beforeAll(async () => {
  try {
    // Initialize EventBus singleton
    globalEventBus = EventBus.getInstance();
    await globalEventBus.initialize();

    // Initialize SwarmMemoryManager with in-memory database for tests
    globalMemoryManager = new SwarmMemoryManager(':memory:');
    await globalMemoryManager.initialize();

    console.log('✓ Global test infrastructure initialized (EventBus + SwarmMemoryManager)');
  } catch (error) {
    console.error('✗ Failed to initialize test infrastructure:', error);
    throw error;
  }
}, 30000);

// Cleanup after each test
afterEach(async () => {
  // Clear all timers
  jest.clearAllTimers();

  // DO NOT reset EventBus here - it needs to persist across tests
  // Individual tests should handle their own cleanup if needed
});

// Final cleanup after all tests
afterAll(async () => {
  try {
    // Wait for pending promises
    await new Promise(resolve => setImmediate(resolve));

    // Close EventBus
    if (globalEventBus) {
      await globalEventBus.close();
    }

    // Close SwarmMemoryManager
    if (globalMemoryManager) {
      await globalMemoryManager.close();
    }

    // Reset EventBus singleton
    if ((EventBus as any).resetInstance) {
      (EventBus as any).resetInstance();
    }

    // Clear all timers
    jest.clearAllTimers();

    // Restore original process.cwd()
    process.cwd = originalCwd;

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    console.log('✓ Global test infrastructure cleanup completed');
  } catch (error) {
    console.error('✗ Error during test cleanup:', error);
  }
}, 30000);
