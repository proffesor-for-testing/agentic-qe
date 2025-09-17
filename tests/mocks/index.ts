/**
 * Comprehensive Mocking Utilities for Claude Flow Integration Tests
 * Provides mock implementations for agents, memory, task execution,
 * and external services with realistic behavior simulation
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { QEAgent, QEMemoryEntry, MemoryType, TestResult, TestCase, AgentType, AgentMetrics } from '../../src/types';
import { TaskDefinition, ExecutionResult, ResourceMetrics } from '../../src/advanced/task-executor';
import { QEMemoryConfig, MemoryQueryOptions } from '../../src/memory/QEMemory';
import { Logger } from '../../src/utils/Logger';

/**
 * Create a mocked QEMemory instance
 */
export const createMockMemory = () => ({
  store: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  get: jest.fn<() => Promise<any>>().mockResolvedValue(null),
  search: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  delete: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  clear: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  listKeys: jest.fn<() => Promise<string[]>>().mockResolvedValue([]),
  getByPattern: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  getStats: jest.fn<() => Promise<any>>().mockResolvedValue({
    totalEntries: 0,
    totalSize: 0,
    oldestEntry: null,
    newestEntry: null
  })
});

/**
 * Create a mocked HookManager instance
 */
export const createMockHooks = () => ({
  emitHook: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  addListener: jest.fn<() => void>().mockReturnValue(undefined),
  removeListener: jest.fn<() => boolean>().mockReturnValue(true),
  clearListeners: jest.fn<() => void>().mockReturnValue(undefined),
  getListeners: jest.fn<() => any[]>().mockReturnValue([]),
  hasListener: jest.fn<() => boolean>().mockReturnValue(false),
  executeHook: jest.fn<() => Promise<any>>().mockResolvedValue({ success: true })
});

/**
 * Create a mocked Logger instance
 */
export const createMockLogger = () => ({
  debug: jest.fn<() => void>(),
  info: jest.fn<() => void>(),
  warn: jest.fn<() => void>(),
  error: jest.fn<() => void>(),
  fatal: jest.fn<() => void>(),
  trace: jest.fn<() => void>(),
  child: jest.fn<() => any>().mockReturnThis(),
  setLevel: jest.fn<() => void>(),
  getLevel: jest.fn<() => string>().mockReturnValue('info')
});

/**
 * Create a mocked Agent Spawner
 */
export const createMockAgentSpawner = () => ({
  spawn: jest.fn<() => Promise<any>>().mockResolvedValue({
    id: 'spawned-agent-123',
    name: 'Spawned Agent',
    status: 'active'
  }),
  destroy: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  getAgent: jest.fn<() => Promise<any>>().mockResolvedValue(null),
  listAgents: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  isAvailable: jest.fn<() => boolean>().mockReturnValue(true)
});

/**
 * Create a mocked Agent Registry
 */
export const createMockAgentRegistry = () => ({
  getAgentByName: jest.fn<() => Promise<any>>().mockResolvedValue(null),
  getAgentsByCategory: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  getAllAgents: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  registerAgent: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  unregisterAgent: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  hasAgent: jest.fn<() => boolean>().mockReturnValue(false),
  getCategories: jest.fn<() => Promise<string[]>>().mockResolvedValue([]),
  scanAndLoadAgents: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  getStatistics: jest.fn<() => Promise<any>>().mockResolvedValue({
    totalAgents: 0,
    byCategory: {},
    errors: 0
  })
});

/**
 * Create a mocked File System operations
 */
export const createMockFileSystem = () => ({
  readFile: jest.fn<() => Promise<string>>().mockResolvedValue(''),
  writeFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  appendFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  exists: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
  mkdir: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  readdir: jest.fn<() => Promise<string[]>>().mockResolvedValue([]),
  stat: jest.fn<() => Promise<any>>().mockResolvedValue({
    isFile: () => true,
    isDirectory: () => false,
    size: 0,
    mtime: new Date()
  }),
  unlink: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  rmdir: jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
});

/**
 * Create a mocked HTTP Client
 */
export const createMockHttpClient = () => ({
  get: jest.fn<() => Promise<any>>().mockResolvedValue({ data: {}, status: 200 }),
  post: jest.fn<() => Promise<any>>().mockResolvedValue({ data: {}, status: 201 }),
  put: jest.fn<() => Promise<any>>().mockResolvedValue({ data: {}, status: 200 }),
  delete: jest.fn<() => Promise<any>>().mockResolvedValue({ status: 204 }),
  patch: jest.fn<() => Promise<any>>().mockResolvedValue({ data: {}, status: 200 }),
  head: jest.fn<() => Promise<any>>().mockResolvedValue({ status: 200 })
});

/**
 * Create a mocked Process Manager
 */
export const createMockProcessManager = () => ({
  spawn: jest.fn<() => any>().mockReturnValue({
    pid: 12345,
    kill: jest.fn<() => boolean>().mockReturnValue(true),
    on: jest.fn<() => void>(),
    stdout: {
      on: jest.fn<() => void>(),
      pipe: jest.fn<() => void>()
    },
    stderr: {
      on: jest.fn<() => void>(),
      pipe: jest.fn<() => void>()
    }
  }),
  exec: jest.fn<() => Promise<any>>().mockResolvedValue({ stdout: '', stderr: '' }),
  kill: jest.fn<() => boolean>().mockReturnValue(true),
  isRunning: jest.fn<() => boolean>().mockReturnValue(false)
});

/**
 * Create a mocked MCP Server
 */
export const createMockMCPServer = () => ({
  getTools: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  handleToolCall: jest.fn<() => Promise<any>>().mockResolvedValue({
    content: [],
    isError: false
  }),
  getResources: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  handleResourceRead: jest.fn<() => Promise<any>>().mockResolvedValue({
    contents: []
  }),
  initialize: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  shutdown: jest.fn<() => Promise<boolean>>().mockResolvedValue(true)
});

/**
 * Create a mocked CLI Command
 */
export const createMockCommand = () => ({
  name: 'test-command',
  description: 'Test command',
  options: [],
  arguments: [],
  execute: jest.fn<() => Promise<any>>().mockResolvedValue({
    success: true,
    message: 'Command executed successfully'
  }),
  validate: jest.fn<() => any>().mockReturnValue({ valid: true }),
  help: jest.fn<() => string>().mockReturnValue('Test command help')
});

/**
 * Create a mocked Test Runner
 */
export const createMockTestRunner = () => ({
  run: jest.fn<() => Promise<any>>().mockResolvedValue({
    passed: 10,
    failed: 0,
    skipped: 0,
    total: 10,
    duration: 1000,
    results: []
  }),
  runSuite: jest.fn<() => Promise<any>>().mockResolvedValue({
    suiteName: 'Test Suite',
    passed: 5,
    failed: 0,
    results: []
  }),
  runTest: jest.fn<() => Promise<any>>().mockResolvedValue({
    testName: 'Test Case',
    passed: true,
    duration: 100,
    assertions: []
  }),
  stop: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  getStatus: jest.fn<() => string>().mockReturnValue('idle')
});

/**
 * Create a mocked Configuration Manager
 */
export const createMockConfigManager = () => ({
  get: jest.fn<() => any>().mockReturnValue(null),
  set: jest.fn<() => boolean>().mockReturnValue(true),
  has: jest.fn<() => boolean>().mockReturnValue(false),
  delete: jest.fn<() => boolean>().mockReturnValue(true),
  clear: jest.fn<() => boolean>().mockReturnValue(true),
  getAll: jest.fn<() => any>().mockReturnValue({}),
  load: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  save: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  validate: jest.fn<() => any>().mockReturnValue({ valid: true })
});

/**
 * Create a mocked Event Emitter
 */
export const createMockEventEmitter = () => {
  const emitter = {
    on: jest.fn<() => any>(),
    once: jest.fn<() => any>(),
    off: jest.fn<() => any>(),
    emit: jest.fn<() => boolean>().mockReturnValue(true),
    removeAllListeners: jest.fn<() => any>(),
    listenerCount: jest.fn<() => number>().mockReturnValue(0),
    listeners: jest.fn<() => any[]>().mockReturnValue([])
  };
  emitter.on.mockReturnValue(emitter);
  emitter.once.mockReturnValue(emitter);
  emitter.off.mockReturnValue(emitter);
  emitter.removeAllListeners.mockReturnValue(emitter);
  return emitter;
};

/**
 * Create a mocked Metrics Collector
 */
export const createMockMetricsCollector = () => ({
  record: jest.fn<() => void>().mockReturnValue(undefined),
  increment: jest.fn<() => void>().mockReturnValue(undefined),
  decrement: jest.fn<() => void>().mockReturnValue(undefined),
  gauge: jest.fn<() => void>().mockReturnValue(undefined),
  histogram: jest.fn<() => void>().mockReturnValue(undefined),
  timer: jest.fn<() => any>().mockReturnValue({
    end: jest.fn<() => number>().mockReturnValue(100)
  }),
  getMetrics: jest.fn<() => any>().mockReturnValue({}),
  reset: jest.fn<() => void>().mockReturnValue(undefined)
});

/**
 * Create a complete mock context for agent execution
 */
export const createMockExecutionContext = () => ({
  memory: createMockMemory(),
  hooks: createMockHooks(),
  logger: createMockLogger(),
  metrics: createMockMetricsCollector(),
  config: createMockConfigManager(),
  events: createMockEventEmitter(),
  task: 'Mock test task',
  projectPath: '/mock/project',
  sessionId: 'mock-session-123',
  options: {}
});