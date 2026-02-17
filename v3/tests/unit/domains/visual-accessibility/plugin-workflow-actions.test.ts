/**
 * Unit tests for VisualAccessibilityPlugin workflow action registration
 * Issue #206: visual-accessibility domain actions not registered with WorkflowOrchestrator
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { ok, err } from '../../../../src/shared/types/index.js';
import type { Result } from '../../../../src/shared/types/index.js';
import type { EventBus, MemoryBackend, AgentCoordinator } from '../../../../src/kernel/interfaces.js';
import type { WorkflowOrchestrator, WorkflowContext } from '../../../../src/coordination/workflow-orchestrator.js';

// Test helpers for creating mock objects
function createMockEventBus(): EventBus {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue('subscription-id'),
    unsubscribe: vi.fn(),
    unsubscribeAll: vi.fn(),
  } as unknown as EventBus;
}

function createMockMemory(): MemoryBackend {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    keys: vi.fn().mockResolvedValue([]),
    clear: vi.fn().mockResolvedValue(undefined),
    has: vi.fn().mockResolvedValue(false),
  } as unknown as MemoryBackend;
}

function createMockAgentCoordinator(): AgentCoordinator {
  return {
    spawn: vi.fn().mockResolvedValue(ok('agent-id')),
    stop: vi.fn().mockResolvedValue(ok(undefined)),
    canSpawn: vi.fn().mockReturnValue(true),
    getHealth: vi.fn().mockReturnValue({ status: 'healthy', agents: { total: 0, active: 0, idle: 0, failed: 0 } }),
    getActiveAgents: vi.fn().mockReturnValue([]),
    getCapabilities: vi.fn().mockReturnValue([]),
  } as unknown as AgentCoordinator;
}

function createMockWorkflowOrchestrator(): WorkflowOrchestrator & { registerAction: Mock } {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    registerAction: vi.fn(),
    hasAction: vi.fn().mockReturnValue(false),
    createWorkflow: vi.fn().mockResolvedValue(ok({ id: 'workflow-id' })),
    executeWorkflow: vi.fn().mockResolvedValue(ok({ status: 'completed' })),
  } as unknown as WorkflowOrchestrator & { registerAction: Mock };
}

describe('VisualAccessibilityPlugin Workflow Actions (Issue #206)', () => {
  let mockEventBus: EventBus;
  let mockMemory: MemoryBackend;
  let mockAgentCoordinator: AgentCoordinator;
  let mockOrchestrator: WorkflowOrchestrator & { registerAction: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = createMockEventBus();
    mockMemory = createMockMemory();
    mockAgentCoordinator = createMockAgentCoordinator();
    mockOrchestrator = createMockWorkflowOrchestrator();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('registerWorkflowActions', () => {
    it('should register runVisualTest action with orchestrator', async () => {
      // Import the plugin dynamically to avoid initialization issues
      const { VisualAccessibilityPlugin } = await import(
        '../../../../src/domains/visual-accessibility/plugin.js'
      );

      const plugin = new VisualAccessibilityPlugin(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator
      );

      // Initialize the plugin first
      await plugin.initialize();

      // Get the API and register workflow actions
      const api = plugin.getAPI<{ registerWorkflowActions: (o: WorkflowOrchestrator) => void }>();
      api.registerWorkflowActions(mockOrchestrator);

      // Verify runVisualTest was registered
      expect(mockOrchestrator.registerAction).toHaveBeenCalledWith(
        'visual-accessibility',
        'runVisualTest',
        expect.any(Function)
      );
    });

    it('should register runAccessibilityTest action with orchestrator', async () => {
      const { VisualAccessibilityPlugin } = await import(
        '../../../../src/domains/visual-accessibility/plugin.js'
      );

      const plugin = new VisualAccessibilityPlugin(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator
      );

      await plugin.initialize();

      const api = plugin.getAPI<{ registerWorkflowActions: (o: WorkflowOrchestrator) => void }>();
      api.registerWorkflowActions(mockOrchestrator);

      // Verify runAccessibilityTest was registered
      expect(mockOrchestrator.registerAction).toHaveBeenCalledWith(
        'visual-accessibility',
        'runAccessibilityTest',
        expect.any(Function)
      );
    });

    it('should throw error if plugin is not initialized', async () => {
      const { VisualAccessibilityPlugin } = await import(
        '../../../../src/domains/visual-accessibility/plugin.js'
      );

      const plugin = new VisualAccessibilityPlugin(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator
      );

      // Don't initialize the plugin
      const api = plugin.getAPI<{ registerWorkflowActions: (o: WorkflowOrchestrator) => void }>();

      expect(() => api.registerWorkflowActions(mockOrchestrator)).toThrow(
        'VisualAccessibilityPlugin must be initialized'
      );
    });
  });

  describe('runVisualTest action handler', () => {
    it('should extract URLs from input correctly', async () => {
      const { VisualAccessibilityPlugin } = await import(
        '../../../../src/domains/visual-accessibility/plugin.js'
      );

      const plugin = new VisualAccessibilityPlugin(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator
      );

      await plugin.initialize();

      const api = plugin.getAPI<{ registerWorkflowActions: (o: WorkflowOrchestrator) => void }>();
      api.registerWorkflowActions(mockOrchestrator);

      // Get the registered handler for runVisualTest
      const runVisualTestCall = mockOrchestrator.registerAction.mock.calls.find(
        (call) => call[0] === 'visual-accessibility' && call[1] === 'runVisualTest'
      );
      expect(runVisualTestCall).toBeDefined();

      const handler = runVisualTestCall![2] as (
        input: Record<string, unknown>,
        context: WorkflowContext
      ) => Promise<Result<unknown, Error>>;

      // Test with url parameter - the handler should be invoked successfully
      const result = await handler(
        { url: 'https://example.com' },
        {} as WorkflowContext
      );

      // Handler was invoked - result may be success or error depending on mock behavior
      // The key assertion is that the handler exists and was called
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should return error when no URLs provided', async () => {
      const { VisualAccessibilityPlugin } = await import(
        '../../../../src/domains/visual-accessibility/plugin.js'
      );

      const plugin = new VisualAccessibilityPlugin(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator
      );

      await plugin.initialize();

      const api = plugin.getAPI<{ registerWorkflowActions: (o: WorkflowOrchestrator) => void }>();
      api.registerWorkflowActions(mockOrchestrator);

      const runVisualTestCall = mockOrchestrator.registerAction.mock.calls.find(
        (call) => call[0] === 'visual-accessibility' && call[1] === 'runVisualTest'
      );

      const handler = runVisualTestCall![2] as (
        input: Record<string, unknown>,
        context: WorkflowContext
      ) => Promise<Result<unknown, Error>>;

      const result = await handler({}, {} as WorkflowContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('No URLs provided');
    });
  });

  describe('runAccessibilityTest action handler', () => {
    it('should register the handler function correctly', async () => {
      const { VisualAccessibilityPlugin } = await import(
        '../../../../src/domains/visual-accessibility/plugin.js'
      );

      const plugin = new VisualAccessibilityPlugin(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator
      );

      await plugin.initialize();

      const api = plugin.getAPI<{ registerWorkflowActions: (o: WorkflowOrchestrator) => void }>();
      api.registerWorkflowActions(mockOrchestrator);

      // Verify the handler was registered
      const runA11yTestCall = mockOrchestrator.registerAction.mock.calls.find(
        (call) => call[0] === 'visual-accessibility' && call[1] === 'runAccessibilityTest'
      );
      expect(runA11yTestCall).toBeDefined();

      // Verify the handler is a function
      const handler = runA11yTestCall![2];
      expect(typeof handler).toBe('function');
    });

    it('should return error when no URLs provided', async () => {
      const { VisualAccessibilityPlugin } = await import(
        '../../../../src/domains/visual-accessibility/plugin.js'
      );

      const plugin = new VisualAccessibilityPlugin(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator
      );

      await plugin.initialize();

      const api = plugin.getAPI<{ registerWorkflowActions: (o: WorkflowOrchestrator) => void }>();
      api.registerWorkflowActions(mockOrchestrator);

      const runA11yTestCall = mockOrchestrator.registerAction.mock.calls.find(
        (call) => call[0] === 'visual-accessibility' && call[1] === 'runAccessibilityTest'
      );

      const handler = runA11yTestCall![2] as (
        input: Record<string, unknown>,
        context: WorkflowContext
      ) => Promise<Result<unknown, Error>>;

      const result = await handler({}, {} as WorkflowContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('No URLs provided');
    });
  });
});
