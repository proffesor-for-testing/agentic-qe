/**
 * E2E Test: MCP Tool Invocation
 * TQ-004: Tests tool registration -> invocation -> result handling
 *
 * Exercises the ToolRegistry directly:
 * - Registration and discovery
 * - Parameter validation (SEC-001 security)
 * - Invocation and result handling
 * - Error handling for invalid tools and params
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToolRegistry, createToolRegistry } from '../../src/mcp/tool-registry';
import type { ToolDefinition, ToolCategory } from '../../src/mcp/types';
import type { DomainName } from '../../src/shared/types';

// ============================================================================
// Helpers
// ============================================================================

function createTestToolDefinition(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: overrides.name ?? 'test_tool',
    description: overrides.description ?? 'A test tool for E2E testing',
    parameters: overrides.parameters ?? [
      { name: 'query', type: 'string', description: 'Search query', required: true },
      { name: 'limit', type: 'number', description: 'Max results', required: false },
    ],
    category: overrides.category ?? ('core' as ToolCategory),
    domain: overrides.domain,
    lazyLoad: overrides.lazyLoad,
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('MCP Tool Invocation E2E - Register -> Invoke -> Handle Results', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = createToolRegistry();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. Tool registration and discovery
  // --------------------------------------------------------------------------
  it('should register a tool and discover it by name', () => {
    // Arrange
    const definition = createTestToolDefinition({ name: 'memory_store' });
    const handler = vi.fn(async () => ({ success: true, data: { stored: true } }));

    // Act
    registry.register(definition, handler);

    // Assert
    expect(registry.has('memory_store')).toBe(true);
    const tool = registry.get('memory_store');
    expect(tool).toBeDefined();
    expect(tool!.definition.name).toBe('memory_store');
  });

  // --------------------------------------------------------------------------
  // 2. Successful tool invocation returns data
  // --------------------------------------------------------------------------
  it('should invoke a tool and return its result', async () => {
    // Arrange
    const definition = createTestToolDefinition({ name: 'memory_query' });
    const handler = vi.fn(async (params: { query: string }) => ({
      success: true,
      data: { results: [`Match for: ${params.query}`], count: 1 },
    }));
    registry.register(definition, handler);

    // Act
    const result = await registry.invoke('memory_query', { query: 'auth patterns' });

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      results: ['Match for: auth patterns'],
      count: 1,
    });
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.executionTime).toBeGreaterThanOrEqual(0);
  });

  // --------------------------------------------------------------------------
  // 3. Invoking a non-existent tool returns error
  // --------------------------------------------------------------------------
  it('should return error when invoking a non-existent tool', async () => {
    // Act
    const result = await registry.invoke('non_existent_tool', {});

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  // --------------------------------------------------------------------------
  // 4. Parameter validation rejects missing required params
  // --------------------------------------------------------------------------
  it('should reject invocation with missing required parameters', async () => {
    // Arrange
    const definition = createTestToolDefinition({
      name: 'task_submit',
      parameters: [
        { name: 'taskType', type: 'string', description: 'Task type', required: true },
        { name: 'payload', type: 'object', description: 'Task data', required: true },
      ],
    });
    const handler = vi.fn(async () => ({ success: true, data: {} }));
    registry.register(definition, handler);

    // Act: invoke without required "payload" parameter
    const result = await registry.invoke('task_submit', { taskType: 'test' });

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toContain('payload');
  });

  // --------------------------------------------------------------------------
  // 5. Parameter type validation
  // --------------------------------------------------------------------------
  it('should reject invocation with wrong parameter types', async () => {
    // Arrange
    const definition = createTestToolDefinition({
      name: 'agent_spawn',
      parameters: [
        { name: 'name', type: 'string', description: 'Agent name', required: true },
        { name: 'maxRetries', type: 'number', description: 'Max retries', required: true },
      ],
    });
    const handler = vi.fn(async () => ({ success: true, data: {} }));
    registry.register(definition, handler);

    // Act: pass a string where a number is expected
    const result = await registry.invoke('agent_spawn', {
      name: 'my-agent',
      maxRetries: 'not-a-number' as unknown as number,
    });

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toContain('maxRetries');
  });

  // --------------------------------------------------------------------------
  // 6. Unknown parameters are rejected (SEC-001 injection prevention)
  // --------------------------------------------------------------------------
  it('should reject unknown parameters to prevent injection', async () => {
    // Arrange
    const definition = createTestToolDefinition({
      name: 'safe_tool',
      parameters: [
        { name: 'input', type: 'string', description: 'Safe input', required: true },
      ],
    });
    const handler = vi.fn(async () => ({ success: true, data: {} }));
    registry.register(definition, handler);

    // Act: pass an extra unknown parameter
    const result = await registry.invoke('safe_tool', {
      input: 'hello',
      malicious_extra: 'injected',
    });

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown parameter');
  });

  // --------------------------------------------------------------------------
  // 7. Tool categorization and domain filtering
  // --------------------------------------------------------------------------
  it('should retrieve tools by category and domain', () => {
    // Arrange
    registry.register(
      createTestToolDefinition({
        name: 'mem_store',
        category: 'memory' as ToolCategory,
        domain: 'learning-optimization' as DomainName,
      }),
      vi.fn(async () => ({ success: true })),
    );
    registry.register(
      createTestToolDefinition({
        name: 'mem_query',
        category: 'memory' as ToolCategory,
        domain: 'learning-optimization' as DomainName,
      }),
      vi.fn(async () => ({ success: true })),
    );
    registry.register(
      createTestToolDefinition({
        name: 'task_create',
        category: 'task' as ToolCategory,
      }),
      vi.fn(async () => ({ success: true })),
    );

    // Act
    const memoryTools = registry.getByCategory('memory' as ToolCategory);
    const domainTools = registry.getByDomain('learning-optimization' as DomainName);
    const taskTools = registry.getByCategory('task' as ToolCategory);

    // Assert
    expect(memoryTools.length).toBe(2);
    expect(domainTools.length).toBe(2);
    expect(taskTools.length).toBe(1);
  });

  // --------------------------------------------------------------------------
  // 8. Tool handler errors are caught and reported
  // --------------------------------------------------------------------------
  it('should catch and report handler execution errors', async () => {
    // Arrange
    const definition = createTestToolDefinition({
      name: 'failing_tool',
      parameters: [],
    });
    const handler = vi.fn(async () => {
      throw new Error('Internal tool failure');
    });
    registry.register(definition, handler);

    // Act
    const result = await registry.invoke('failing_tool', {});

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toContain('Internal tool failure');
  });

  // --------------------------------------------------------------------------
  // 9. Invalid tool name format is rejected (SEC-001)
  // --------------------------------------------------------------------------
  it('should reject tool names with invalid characters', async () => {
    // Act: attempt to invoke a tool with special characters
    const result = await registry.invoke('../../etc/passwd', {});

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid tool name');
  });

  // --------------------------------------------------------------------------
  // 10. Batch registration and stats tracking
  // --------------------------------------------------------------------------
  it('should register multiple tools and track statistics', () => {
    // Arrange
    const tools = [
      {
        definition: createTestToolDefinition({ name: 'tool_a', category: 'core' as ToolCategory }),
        handler: vi.fn(async () => ({ success: true })),
      },
      {
        definition: createTestToolDefinition({ name: 'tool_b', category: 'core' as ToolCategory }),
        handler: vi.fn(async () => ({ success: true })),
      },
      {
        definition: createTestToolDefinition({ name: 'tool_c', category: 'memory' as ToolCategory }),
        handler: vi.fn(async () => ({ success: true })),
      },
    ];

    // Act
    registry.registerAll(tools);

    // Assert
    const definitions = registry.getDefinitions();
    expect(definitions.length).toBe(3);
    expect(registry.has('tool_a')).toBe(true);
    expect(registry.has('tool_b')).toBe(true);
    expect(registry.has('tool_c')).toBe(true);
  });
});
