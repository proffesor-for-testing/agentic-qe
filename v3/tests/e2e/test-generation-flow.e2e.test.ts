/**
 * E2E Test: Test Generation Flow
 * TQ-004: Tests analyze source -> generate test -> validate output
 *
 * Mocks: LLM calls, external services
 * Real: full test generation pipeline through coordinator
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockEventBus,
  createMockMemory,
  createMockAgentCoordinator,
} from '../mocks';
import type { EventBus, MemoryBackend, AgentCoordinator } from '../../src/kernel/interfaces';
import type { DomainName, DomainEvent } from '../../src/shared/types';
import {
  TestGenerationCoordinator,
  ITestGenerationCoordinator,
} from '../../src/domains/test-generation/coordinator';

// ============================================================================
// Test Suite
// ============================================================================

describe('Test Generation Flow E2E - Analyze -> Generate -> Validate', () => {
  let coordinator: ITestGenerationCoordinator;
  let eventBus: EventBus;
  let memory: MemoryBackend;
  let agentCoordinator: AgentCoordinator;

  beforeEach(async () => {
    eventBus = createMockEventBus();
    memory = createMockMemory();
    agentCoordinator = createMockAgentCoordinator();

    coordinator = new TestGenerationCoordinator(
      eventBus,
      memory,
      agentCoordinator,
      {
        enableQESONA: false,
        enableFlashAttention: false,
        enableDecisionTransformer: false,
        enableCoherenceGate: false,
        enableMinCutAwareness: false,
        enableConsensus: false,
      },
    );
    await coordinator.initialize();
  });

  afterEach(async () => {
    await coordinator.dispose();
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. Generate unit tests for a source file
  // --------------------------------------------------------------------------
  it('should generate unit tests for source files', async () => {
    // Arrange
    const request = {
      sourceFiles: ['src/utils/calculator.ts'],
      testType: 'unit' as const,
      framework: 'vitest' as const,
      coverageTarget: 80,
    };

    // Act
    const result = await coordinator.generateTests(request);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.tests).toBeDefined();
      expect(Array.isArray(result.value.tests)).toBe(true);
      expect(result.value.coverageEstimate).toBeGreaterThanOrEqual(0);
    }
  });

  // --------------------------------------------------------------------------
  // 2. Generate integration tests
  // --------------------------------------------------------------------------
  it('should generate integration tests', async () => {
    // Arrange
    const request = {
      sourceFiles: ['src/services/user-service.ts'],
      testType: 'integration' as const,
      framework: 'vitest' as const,
    };

    // Act
    const result = await coordinator.generateTests(request);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.tests).toBeDefined();
    }
  });

  // --------------------------------------------------------------------------
  // 3. Handle empty source files gracefully
  // --------------------------------------------------------------------------
  it('should handle empty source files array', async () => {
    // Arrange
    const request = {
      sourceFiles: [],
      testType: 'unit' as const,
      framework: 'vitest' as const,
    };

    // Act
    const result = await coordinator.generateTests(request);

    // Assert: should succeed with empty results or return a controlled error
    if (result.success) {
      expect(result.value.tests).toEqual([]);
    } else {
      expect(result.error).toBeDefined();
    }
  });

  // --------------------------------------------------------------------------
  // 4. TDD workflow generates test code for red phase
  // --------------------------------------------------------------------------
  it('should generate TDD red-phase test code', async () => {
    // Arrange
    const request = {
      feature: 'user authentication',
      behavior: 'should validate JWT tokens',
      framework: 'vitest',
      phase: 'red' as const,
    };

    // Act
    const result = await coordinator.generateTDDTests(request);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.phase).toBe('red');
      expect(result.value.nextStep).toBeDefined();
    }
  });

  // --------------------------------------------------------------------------
  // 5. Events are emitted during test generation
  // --------------------------------------------------------------------------
  it('should emit events during the generation workflow', async () => {
    // Arrange
    const publishedEvents: DomainEvent[] = [];
    vi.mocked(eventBus.publish).mockImplementation(async (event: DomainEvent) => {
      publishedEvents.push(event);
    });

    // Act
    await coordinator.generateTests({
      sourceFiles: ['src/models/user.ts'],
      testType: 'unit' as const,
      framework: 'vitest' as const,
    });

    // Assert: at least one event should have been published
    // The coordinator emits workflow events via the event bus
    expect(eventBus.publish).toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // 6. Multiple source files in a single request
  // --------------------------------------------------------------------------
  it('should handle multiple source files in one request', async () => {
    // Arrange
    const request = {
      sourceFiles: [
        'src/utils/math.ts',
        'src/utils/string.ts',
        'src/utils/date.ts',
      ],
      testType: 'unit' as const,
      framework: 'vitest' as const,
      coverageTarget: 90,
    };

    // Act
    const result = await coordinator.generateTests(request);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.tests).toBeDefined();
      expect(result.value.coverageEstimate).toBeGreaterThanOrEqual(0);
    }
  });

  // --------------------------------------------------------------------------
  // 7. Workflow status tracking
  // --------------------------------------------------------------------------
  it('should track active workflows', async () => {
    // Act: get current workflow status
    const workflows = coordinator.getActiveWorkflows();

    // Assert: no workflows active initially
    expect(Array.isArray(workflows)).toBe(true);
    expect(workflows.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // 8. Pattern learning from existing tests
  // --------------------------------------------------------------------------
  it('should learn patterns from existing test code', async () => {
    // Arrange
    const request = {
      testFiles: ['tests/unit/utils.test.ts'],
      framework: 'vitest',
      scope: 'project' as const,
    };

    // Act
    const result = await coordinator.learnPatterns(request);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.patterns).toBeDefined();
      expect(Array.isArray(result.value.patterns)).toBe(true);
    }
  });

  // --------------------------------------------------------------------------
  // 9. Generated test follows AAA pattern structure
  // --------------------------------------------------------------------------
  it('should produce tests with identifiable structure', async () => {
    // Arrange
    const request = {
      sourceFiles: ['src/services/payment.ts'],
      testType: 'unit' as const,
      framework: 'vitest' as const,
    };

    // Act
    const result = await coordinator.generateTests(request);

    // Assert: verify the generated test structure
    expect(result.success).toBe(true);
    if (result.success && result.value.tests.length > 0) {
      const test = result.value.tests[0];
      expect(test).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        sourceFile: expect.any(String),
        testFile: expect.any(String),
        testCode: expect.any(String),
        type: 'unit',
        assertions: expect.any(Number),
      });
    }
  });

  // --------------------------------------------------------------------------
  // 10. Coordinator reports correct topology and consensus status
  // --------------------------------------------------------------------------
  it('should report topology health and consensus availability', () => {
    // Act & Assert: with integrations disabled these should return safe defaults
    expect(coordinator.isTopologyHealthy()).toBe(true);
    expect(coordinator.isConsensusAvailable()).toBe(false);
    expect(coordinator.isCoherenceGateAvailable()).toBe(false);
  });
});
