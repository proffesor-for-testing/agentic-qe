/**
 * Agentic QE v3 - Parameterized Plugin Test Generator
 *
 * Consolidates common test patterns for all 12 domain plugins into a single
 * reusable test generator. Reduces code duplication while maintaining
 * comprehensive test coverage.
 *
 * @example
 * ```typescript
 * generatePluginTests('code-intelligence', CodeIntelligencePlugin, {
 *   expectedVersion: '1.0.0',
 *   expectedDependencies: [],
 *   taskHandlers: ['index', 'search', 'analyze-impact', 'query-dependencies'],
 *   factoryFunction: createCodeIntelligencePlugin,
 *   requiresAgentCoordinator: true,
 *   apiMethods: ['index', 'search', 'analyzeImpact', 'getDependencies'],
 *   customTests: () => {
 *     it('should handle knowledge graph operations', () => { ... });
 *   },
 * });
 * ```
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DomainName } from '../../../src/shared/types';
import type { BaseDomainPlugin, DomainConsensusConfig } from '../../../src/domains/domain-interface';
import type { EventBus, MemoryBackend, AgentCoordinator } from '../../../src/kernel/interfaces';
import {
  MockEventBus,
  MockMemoryBackend,
  MockAgentCoordinator,
  createMockTaskRequest,
  createMockCallback,
  createMockEvent,
  verifyIdleHealth,
  expectSuccess,
  expectError,
  sampleTasks,
} from './plugin-test-utils';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for plugin test generation
 */
export interface PluginTestConfig<T extends BaseDomainPlugin> {
  /**
   * Expected plugin version (e.g., '1.0.0')
   */
  expectedVersion: string;

  /**
   * Expected domain dependencies (e.g., ['test-generation'])
   */
  expectedDependencies: DomainName[];

  /**
   * List of task types the plugin should handle
   */
  taskHandlers: string[];

  /**
   * Factory function to create the plugin
   */
  factoryFunction: PluginFactory<T>;

  /**
   * Whether the plugin requires an AgentCoordinator dependency
   * @default true
   */
  requiresAgentCoordinator?: boolean;

  /**
   * Expected API method names (for getAPI tests)
   */
  apiMethods?: string[];

  /**
   * Expected internal accessor methods (e.g., getCoordinator, getKnowledgeGraph)
   */
  internalAccessors?: string[];

  /**
   * Sample tasks from the sampleTasks object for this domain
   * Key should be the domain's key in sampleTasks
   */
  sampleTasksKey?: keyof typeof sampleTasks;

  /**
   * Task validation tests: taskType -> missing field -> expected error
   */
  taskValidationTests?: TaskValidationConfig[];

  /**
   * Custom event handling tests
   */
  eventTests?: EventTestConfig[];

  /**
   * Whether the plugin has custom health behavior (different from verifyIdleHealth)
   */
  customHealthBehavior?: {
    /** Initial total agents (default: 0) */
    initialTotalAgents?: number;
    /** Initial idle agents (default: 0) */
    initialIdleAgents?: number;
  };

  /**
   * Optional configuration for factory function tests
   */
  factoryConfig?: Record<string, unknown>;

  /**
   * Additional custom tests to run
   */
  customTests?: () => void;
}

/**
 * Configuration for task validation tests
 */
export interface TaskValidationConfig {
  taskType: string;
  missingField: string;
  partialPayload?: Record<string, unknown>;
  expectedErrorContains: string;
}

/**
 * Configuration for event handling tests
 */
export interface EventTestConfig {
  eventType: string;
  source: DomainName;
  payload: Record<string, unknown>;
  expectation: 'activity-updated' | 'memory-stored';
  memoryKey?: string;
}

/**
 * Plugin factory function type
 */
export type PluginFactory<T extends BaseDomainPlugin> = (
  eventBus: EventBus,
  memory: MemoryBackend,
  agentCoordinator?: AgentCoordinator,
  config?: Record<string, unknown>
) => T;

/**
 * Plugin constructor type - with agent coordinator
 */
export type PluginConstructorWithCoordinator<T extends BaseDomainPlugin> = new (
  eventBus: EventBus,
  memory: MemoryBackend,
  agentCoordinator: AgentCoordinator
) => T;

/**
 * Plugin constructor type - without agent coordinator
 */
export type PluginConstructorWithoutCoordinator<T extends BaseDomainPlugin> = new (
  eventBus: EventBus,
  memory: MemoryBackend
) => T;

/**
 * Union of plugin constructor types
 */
export type PluginConstructor<T extends BaseDomainPlugin> =
  | PluginConstructorWithCoordinator<T>
  | PluginConstructorWithoutCoordinator<T>;

// ============================================================================
// Test Generator
// ============================================================================

/**
 * Generates comprehensive tests for a domain plugin
 *
 * This generator creates standardized tests for:
 * - Metadata (name, version, dependencies)
 * - Lifecycle (initialize, dispose, ready state)
 * - Health tracking (idle status, agent counts)
 * - Task handler registration
 * - API exposure
 * - Integration configuration (MinCut, Consensus defaults)
 *
 * @param pluginName - Domain name (e.g., 'code-intelligence')
 * @param PluginClass - Plugin constructor class
 * @param config - Test configuration
 */
export function generatePluginTests<T extends BaseDomainPlugin>(
  pluginName: DomainName,
  PluginClass: PluginConstructor<T>,
  config: PluginTestConfig<T>
): void {
  const {
    expectedVersion,
    expectedDependencies,
    taskHandlers,
    factoryFunction,
    requiresAgentCoordinator = true,
    apiMethods = [],
    internalAccessors = [],
    sampleTasksKey,
    taskValidationTests = [],
    eventTests = [],
    customHealthBehavior,
    factoryConfig,
    customTests,
  } = config;

  describe(`${pluginName}Plugin`, () => {
    let plugin: T;
    let eventBus: MockEventBus;
    let memory: MockMemoryBackend;
    let agentCoordinator: MockAgentCoordinator;

    beforeEach(() => {
      eventBus = new MockEventBus();
      memory = new MockMemoryBackend();
      agentCoordinator = new MockAgentCoordinator();

      if (requiresAgentCoordinator) {
        plugin = new (PluginClass as PluginConstructorWithCoordinator<T>)(
          eventBus,
          memory,
          agentCoordinator
        );
      } else {
        plugin = new (PluginClass as PluginConstructorWithoutCoordinator<T>)(eventBus, memory);
      }
    });

    afterEach(async () => {
      if (plugin.isReady()) {
        await plugin.dispose();
      }
      await eventBus.dispose();
      await memory.dispose();
      await agentCoordinator.dispose();
    });

    // ========================================================================
    // Metadata Tests
    // ========================================================================

    describe('metadata', () => {
      it('should have correct domain name', () => {
        expect(plugin.name).toBe(pluginName);
      });

      it('should have correct version', () => {
        expect(plugin.version).toBe(expectedVersion);
      });

      if (expectedDependencies.length === 0) {
        it('should have no required dependencies', () => {
          expect(plugin.dependencies).toEqual([]);
        });
      } else {
        it('should have correct dependencies', () => {
          for (const dep of expectedDependencies) {
            expect(plugin.dependencies).toContain(dep);
          }
        });
      }
    });

    // ========================================================================
    // Lifecycle Tests
    // ========================================================================

    describe('lifecycle', () => {
      it('should not be ready before initialization', () => {
        expect(plugin.isReady()).toBe(false);
      });

      it('should be ready after initialization', async () => {
        await plugin.initialize();
        expect(plugin.isReady()).toBe(true);
      });

      it('should have idle health status after initialization', async () => {
        await plugin.initialize();
        const health = plugin.getHealth();

        if (customHealthBehavior) {
          expect(health.status).toBe('idle');
          if (customHealthBehavior.initialTotalAgents !== undefined) {
            expect(health.agents.total).toBe(customHealthBehavior.initialTotalAgents);
          }
          if (customHealthBehavior.initialIdleAgents !== undefined) {
            expect(health.agents.idle).toBe(customHealthBehavior.initialIdleAgents);
          }
        } else {
          verifyIdleHealth(health);
        }
      });

      it('should not be ready after disposal', async () => {
        await plugin.initialize();
        await plugin.dispose();
        expect(plugin.isReady()).toBe(false);
      });
    });

    // ========================================================================
    // Factory Function Tests
    // ========================================================================

    describe('factory function', () => {
      it('should create plugin via factory function', () => {
        let createdPlugin: T;
        if (requiresAgentCoordinator) {
          createdPlugin = factoryFunction(eventBus, memory, agentCoordinator);
        } else {
          createdPlugin = factoryFunction(eventBus, memory);
        }
        expect(createdPlugin).toBeInstanceOf(PluginClass);
        expect(createdPlugin.name).toBe(pluginName);
      });

      if (factoryConfig) {
        it('should accept optional configuration', () => {
          let createdPlugin: T;
          if (requiresAgentCoordinator) {
            createdPlugin = factoryFunction(eventBus, memory, agentCoordinator, factoryConfig);
          } else {
            createdPlugin = factoryFunction(eventBus, memory, undefined, factoryConfig);
          }
          expect(createdPlugin).toBeInstanceOf(PluginClass);
        });
      }
    });

    // ========================================================================
    // API Tests
    // ========================================================================

    if (apiMethods.length > 0 || internalAccessors.length > 0) {
      describe('getAPI', () => {
        beforeEach(async () => {
          await plugin.initialize();
        });

        if (apiMethods.length > 0) {
          it('should return API with all expected methods', () => {
            const api = plugin.getAPI<Record<string, unknown>>();
            for (const method of apiMethods) {
              expect(api).toHaveProperty(method);
            }
          });
        }

        if (internalAccessors.length > 0) {
          it('should return API with internal accessor methods', () => {
            const api = plugin.getAPI<Record<string, unknown>>();
            for (const accessor of internalAccessors) {
              expect(api).toHaveProperty(accessor);
            }
          });
        }
      });
    }

    // ========================================================================
    // canHandleTask Tests
    // ========================================================================

    describe('canHandleTask', () => {
      beforeEach(async () => {
        await plugin.initialize();
      });

      for (const taskType of taskHandlers) {
        it(`should handle ${taskType} task type`, () => {
          expect(plugin.canHandleTask(taskType)).toBe(true);
        });
      }

      it('should not handle unknown task types', () => {
        expect(plugin.canHandleTask('unknown-task')).toBe(false);
        expect(plugin.canHandleTask('')).toBe(false);
        // Use a task type that no domain handles
        expect(plugin.canHandleTask('completely-nonexistent-task-xyz')).toBe(false);
      });
    });

    // ========================================================================
    // executeTask Tests
    // ========================================================================

    describe('executeTask', () => {
      beforeEach(async () => {
        await plugin.initialize();
      });

      // Test with sample task if available
      if (sampleTasksKey && taskHandlers.length > 0) {
        const domainTasks = sampleTasks[sampleTasksKey];
        if (domainTasks) {
          const firstTaskKey = Object.keys(domainTasks)[0] as keyof typeof domainTasks;
          if (firstTaskKey) {
            it('should accept valid task', async () => {
              const request = domainTasks[firstTaskKey];
              const { callback } = createMockCallback();

              const acceptResult = await plugin.executeTask(request, callback);
              expectSuccess(acceptResult);
            });
          }
        }
      }

      it('should return error for unknown task type', async () => {
        const request = createMockTaskRequest('unknown-task', {});
        const { callback } = createMockCallback();

        const result = await plugin.executeTask(request, callback);
        expectError(result);
        expect(result.error.message).toContain('no handler');
      });

      // Task validation tests
      for (const validation of taskValidationTests) {
        it(`should return error for ${validation.taskType} with missing ${validation.missingField}`, async () => {
          const request = createMockTaskRequest(
            validation.taskType,
            validation.partialPayload ?? {}
          );
          const { callback, waitForResult } = createMockCallback();

          const acceptResult = await plugin.executeTask(request, callback);
          expectSuccess(acceptResult);

          const result = await waitForResult();
          expect(result.success).toBe(false);
          expect(result.error).toContain(validation.expectedErrorContains);
        });
      }
    });

    // ========================================================================
    // Event Handling Tests
    // ========================================================================

    if (eventTests.length > 0) {
      describe('event handling', () => {
        beforeEach(async () => {
          await plugin.initialize();
        });

        for (const eventTest of eventTests) {
          it(`should handle ${eventTest.eventType} events`, async () => {
            const event = createMockEvent(
              eventTest.eventType,
              eventTest.source,
              eventTest.payload
            );

            await plugin.handleEvent(event);

            if (eventTest.expectation === 'activity-updated') {
              const health = plugin.getHealth();
              expect(health.lastActivity).toBeInstanceOf(Date);
            } else if (eventTest.expectation === 'memory-stored' && eventTest.memoryKey) {
              const stored = await memory.get(eventTest.memoryKey);
              expect(stored).toBeDefined();
            }
          });
        }
      });
    }

    // ========================================================================
    // Health Tracking Tests
    // ========================================================================

    describe('health tracking', () => {
      beforeEach(async () => {
        await plugin.initialize();
      });

      it('should start with idle status', () => {
        const health = plugin.getHealth();
        expect(health.status).toBe('idle');
      });
    });

    // ========================================================================
    // Integration Configuration Tests
    // ========================================================================

    describe('integration configuration', () => {
      beforeEach(async () => {
        await plugin.initialize();
      });

      it('should not have MinCut integration by default', () => {
        expect(plugin.hasMinCutIntegration()).toBe(false);
      });

      it('should not have consensus enabled by default', () => {
        expect(plugin.hasConsensusEnabled()).toBe(false);
      });
    });

    // ========================================================================
    // Custom Tests
    // ========================================================================

    if (customTests) {
      describe('domain-specific tests', () => {
        customTests();
      });
    }
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate standard task validation tests for common patterns
 */
export function createTaskValidationTests(
  tests: Array<{
    taskType: string;
    missingField: string;
    partialPayload?: Record<string, unknown>;
  }>
): TaskValidationConfig[] {
  return tests.map((test) => ({
    taskType: test.taskType,
    missingField: test.missingField,
    partialPayload: test.partialPayload,
    expectedErrorContains: `missing ${test.missingField}`,
  }));
}

/**
 * Generate standard event handling tests
 */
export function createEventTests(
  tests: Array<{
    eventType: string;
    source: DomainName;
    payload: Record<string, unknown>;
    memoryKey?: string;
  }>
): EventTestConfig[] {
  return tests.map((test) => ({
    eventType: test.eventType,
    source: test.source,
    payload: test.payload,
    expectation: test.memoryKey ? 'memory-stored' : 'activity-updated',
    memoryKey: test.memoryKey,
  }));
}

// Re-export utilities for convenience
export {
  MockEventBus,
  MockMemoryBackend,
  MockAgentCoordinator,
  createMockTaskRequest,
  createMockCallback,
  createMockEvent,
  verifyIdleHealth,
  expectSuccess,
  expectError,
  sampleTasks,
};
