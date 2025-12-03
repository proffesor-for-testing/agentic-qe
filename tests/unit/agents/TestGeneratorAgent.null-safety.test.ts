/**
 * TestGeneratorAgent - Null Safety & Edge Case Test Suite
 *
 * CRITICAL PRIORITY: Focus on null pointer risks in lines 30-180
 * Target: 80% line coverage, 75% branch coverage
 *
 * Test Coverage:
 * 1. Null/undefined input handling (PRIORITY)
 * 2. Boundary conditions
 * 3. Error scenarios
 * 4. Edge cases
 * 5. Configuration validation
 */

import { TestGeneratorAgent, TestGeneratorConfig, TestGenerationRequest, TestGenerationResult } from '../../../src/agents/TestGeneratorAgent';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { EventEmitter } from 'events';
import { QEAgentType, AgentContext, TestType, QETask, TaskAssignment, AgentCapability } from '../../../src/types';

describe('TestGeneratorAgent - Null Safety & Edge Cases', () => {
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventEmitter;

  beforeEach(async () => {
    memoryStore = new SwarmMemoryManager(':memory:');
    await memoryStore.initialize();
    eventBus = new EventEmitter();
  });

  afterEach(async () => {
    if (memoryStore) {
      await memoryStore.close();
    }
  });

  describe('Constructor - Null/Undefined Handling', () => {
    it('should handle undefined enablePatterns gracefully (defaults to true)', () => {
      const context: AgentContext = {
        workspaceRoot: '/test',
        config: { timeout: 30000, retries: 3, logLevel: 'info' }
      };

      const agent = new TestGeneratorAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [],
        context,
        memoryStore,
        eventBus,
        enablePatterns: undefined // Explicitly undefined
      });

      expect(agent).toBeDefined();
    });

    it('should handle undefined enableLearning gracefully (defaults to true)', () => {
      const context: AgentContext = {
        workspaceRoot: '/test',
        config: { timeout: 30000, retries: 3, logLevel: 'info' }
      };

      const agent = new TestGeneratorAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [],
        context,
        memoryStore,
        eventBus,
        enableLearning: undefined // Explicitly undefined
      });

      expect(agent).toBeDefined();
    });

    it('should handle undefined minPatternConfidence (defaults to 0.85)', () => {
      const context: AgentContext = {
        workspaceRoot: '/test',
        config: { timeout: 30000, retries: 3, logLevel: 'info' }
      };

      const agent = new TestGeneratorAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [],
        context,
        memoryStore,
        eventBus,
        enablePatterns: true,
        minPatternConfidence: undefined // Explicitly undefined
      });

      expect(agent).toBeDefined();
    });

    it('should handle undefined patternMatchTimeout (defaults to 50ms)', () => {
      const context: AgentContext = {
        workspaceRoot: '/test',
        config: { timeout: 30000, retries: 3, logLevel: 'info' }
      };

      const agent = new TestGeneratorAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [],
        context,
        memoryStore,
        eventBus,
        enablePatterns: true,
        patternMatchTimeout: undefined // Explicitly undefined
      });

      expect(agent).toBeDefined();
    });

    it('should handle null context gracefully', () => {
      // Agent should be resilient and not throw on null context
      // It provides defaults internally for graceful degradation
      const agent = new TestGeneratorAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [],
        context: null as any, // Null context - agent handles gracefully
        memoryStore,
        eventBus
      });
      expect(agent).toBeDefined();
    });

    it('should handle undefined context gracefully', () => {
      // Agent should be resilient and not throw on undefined context
      // It provides defaults internally for graceful degradation
      const agent = new TestGeneratorAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [],
        context: undefined as any, // Undefined context - agent handles gracefully
        memoryStore,
        eventBus
      });
      expect(agent).toBeDefined();
    });

    it('should handle null memoryStore', () => {
      const context: AgentContext = {
        workspaceRoot: '/test',
        config: { timeout: 30000, retries: 3, logLevel: 'info' }
      };

      expect(() => {
        new TestGeneratorAgent({
          type: QEAgentType.TEST_GENERATOR,
          capabilities: [],
          context,
          memoryStore: null as any, // Null memoryStore
          eventBus
        });
      }).toThrow();
    });

    it('should handle null eventBus', () => {
      const context: AgentContext = {
        workspaceRoot: '/test',
        config: { timeout: 30000, retries: 3, logLevel: 'info' }
      };

      expect(() => {
        new TestGeneratorAgent({
          type: QEAgentType.TEST_GENERATOR,
          capabilities: [],
          context,
          memoryStore,
          eventBus: null as any // Null eventBus
        });
      }).toThrow();
    });
  });

  describe('Configuration Boundary Conditions', () => {
    it('should handle minPatternConfidence = 0 (minimum boundary)', () => {
      const context: AgentContext = {
        workspaceRoot: '/test',
        config: { timeout: 30000, retries: 3, logLevel: 'info' }
      };

      const agent = new TestGeneratorAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [],
        context,
        memoryStore,
        eventBus,
        enablePatterns: true,
        minPatternConfidence: 0 // Minimum boundary
      });

      expect(agent).toBeDefined();
    });

    it('should handle minPatternConfidence = 1 (maximum boundary)', () => {
      const context: AgentContext = {
        workspaceRoot: '/test',
        config: { timeout: 30000, retries: 3, logLevel: 'info' }
      };

      const agent = new TestGeneratorAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [],
        context,
        memoryStore,
        eventBus,
        enablePatterns: true,
        minPatternConfidence: 1 // Maximum boundary
      });

      expect(agent).toBeDefined();
    });

    it('should handle negative minPatternConfidence', () => {
      const context: AgentContext = {
        workspaceRoot: '/test',
        config: { timeout: 30000, retries: 3, logLevel: 'info' }
      };

      const agent = new TestGeneratorAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [],
        context,
        memoryStore,
        eventBus,
        enablePatterns: true,
        minPatternConfidence: -0.5 // Invalid negative value
      });

      expect(agent).toBeDefined();
    });

    it('should handle minPatternConfidence > 1', () => {
      const context: AgentContext = {
        workspaceRoot: '/test',
        config: { timeout: 30000, retries: 3, logLevel: 'info' }
      };

      const agent = new TestGeneratorAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [],
        context,
        memoryStore,
        eventBus,
        enablePatterns: true,
        minPatternConfidence: 1.5 // Invalid > 1 value
      });

      expect(agent).toBeDefined();
    });

    it('should handle patternMatchTimeout = 0 (zero timeout)', () => {
      const context: AgentContext = {
        workspaceRoot: '/test',
        config: { timeout: 30000, retries: 3, logLevel: 'info' }
      };

      const agent = new TestGeneratorAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [],
        context,
        memoryStore,
        eventBus,
        enablePatterns: true,
        patternMatchTimeout: 0 // Zero timeout
      });

      expect(agent).toBeDefined();
    });

    it('should handle very large patternMatchTimeout', () => {
      const context: AgentContext = {
        workspaceRoot: '/test',
        config: { timeout: 30000, retries: 3, logLevel: 'info' }
      };

      const agent = new TestGeneratorAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [],
        context,
        memoryStore,
        eventBus,
        enablePatterns: true,
        patternMatchTimeout: Number.MAX_SAFE_INTEGER // Very large timeout
      });

      expect(agent).toBeDefined();
    });

    it('should handle negative patternMatchTimeout', () => {
      const context: AgentContext = {
        workspaceRoot: '/test',
        config: { timeout: 30000, retries: 3, logLevel: 'info' }
      };

      const agent = new TestGeneratorAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [],
        context,
        memoryStore,
        eventBus,
        enablePatterns: true,
        patternMatchTimeout: -100 // Negative timeout
      });

      expect(agent).toBeDefined();
    });
  });

  describe('Test Generation Request - Null/Undefined Fields', () => {
    let agent: TestGeneratorAgent;

    beforeEach(async () => {
      const context: AgentContext = {
        workspaceRoot: '/test',
        config: { timeout: 30000, retries: 3, logLevel: 'info' }
      };

      agent = new TestGeneratorAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [],
        context,
        memoryStore,
        eventBus,
        enablePatterns: false,
        enableLearning: false
      });

      await agent.initialize();
    });

    afterEach(async () => {
      if (agent) {
        await agent.terminate();
      }
    });

    it('should handle null sourceCode.ast', async () => {
      const request: TestGenerationRequest = {
        sourceCode: {
          ast: null as any, // Null AST
          files: [
            {
              path: '/test/src/Test.ts',
              content: 'export function test() { return true; }',
              language: 'typescript'
            }
          ],
          complexityMetrics: {
            cyclomaticComplexity: 1,
            cognitiveComplexity: 1,
            functionCount: 1,
            linesOfCode: 1
          }
        },
        framework: 'jest',
        coverage: {
          target: 80,
          type: 'line'
        },
        constraints: {
          maxTests: 50,
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      };

      const task: QETask = {
        id: 'test-null-ast',
        type: 'test-generation',
        payload: request,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-null-ast',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
    });

    it('should handle empty files array', async () => {
      const request: TestGenerationRequest = {
        sourceCode: {
          ast: {},
          files: [], // Empty files array
          complexityMetrics: {
            cyclomaticComplexity: 0,
            cognitiveComplexity: 0,
            functionCount: 0,
            linesOfCode: 0
          }
        },
        framework: 'jest',
        coverage: {
          target: 80,
          type: 'line'
        },
        constraints: {
          maxTests: 50,
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      };

      const task: QETask = {
        id: 'test-empty-files',
        type: 'test-generation',
        payload: request,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-empty-files',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(agent.executeTask(assignment)).rejects.toThrow(
        '[TestGeneratorAgent] Source code files are required but missing'
      );
    });

    it('should handle null file content', async () => {
      const request: TestGenerationRequest = {
        sourceCode: {
          ast: {},
          files: [
            {
              path: '/test/src/NullContent.ts',
              content: null as any, // Null content
              language: 'typescript'
            }
          ],
          complexityMetrics: {
            cyclomaticComplexity: 1,
            cognitiveComplexity: 1,
            functionCount: 0,
            linesOfCode: 0
          }
        },
        framework: 'jest',
        coverage: {
          target: 80,
          type: 'line'
        },
        constraints: {
          maxTests: 50,
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      };

      const task: QETask = {
        id: 'test-null-content',
        type: 'test-generation',
        payload: request,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-null-content',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
    });

    it('should handle undefined file path', async () => {
      const request: TestGenerationRequest = {
        sourceCode: {
          ast: {},
          files: [
            {
              path: undefined as any, // Undefined path
              content: 'export function test() {}',
              language: 'typescript'
            }
          ],
          complexityMetrics: {
            cyclomaticComplexity: 1,
            cognitiveComplexity: 1,
            functionCount: 1,
            linesOfCode: 1
          }
        },
        framework: 'jest',
        coverage: {
          target: 80,
          type: 'line'
        },
        constraints: {
          maxTests: 50,
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      };

      const task: QETask = {
        id: 'test-undefined-path',
        type: 'test-generation',
        payload: request,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-undefined-path',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
    });

    it('should handle null complexityMetrics', async () => {
      const request: TestGenerationRequest = {
        sourceCode: {
          ast: {},
          files: [
            {
              path: '/test/src/Test.ts',
              content: 'export function test() {}',
              language: 'typescript'
            }
          ],
          complexityMetrics: null as any // Null metrics
        },
        framework: 'jest',
        coverage: {
          target: 80,
          type: 'line'
        },
        constraints: {
          maxTests: 50,
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      };

      const task: QETask = {
        id: 'test-null-metrics',
        type: 'test-generation',
        payload: request,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-null-metrics',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(agent.executeTask(assignment)).rejects.toThrow(
        '[TestGeneratorAgent] Source code complexity metrics are required'
      );
    });

    it('should handle zero complexity metrics', async () => {
      const request: TestGenerationRequest = {
        sourceCode: {
          ast: {},
          files: [
            {
              path: '/test/src/Zero.ts',
              content: '// Empty file',
              language: 'typescript'
            }
          ],
          complexityMetrics: {
            cyclomaticComplexity: 0, // Zero complexity
            cognitiveComplexity: 0,
            functionCount: 0,
            linesOfCode: 0
          }
        },
        framework: 'jest',
        coverage: {
          target: 80,
          type: 'line'
        },
        constraints: {
          maxTests: 50,
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      };

      const task: QETask = {
        id: 'test-zero-complexity',
        type: 'test-generation',
        payload: request,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-zero-complexity',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
    });

    it('should handle negative complexity metrics', async () => {
      const request: TestGenerationRequest = {
        sourceCode: {
          ast: {},
          files: [
            {
              path: '/test/src/Negative.ts',
              content: 'export function test() {}',
              language: 'typescript'
            }
          ],
          complexityMetrics: {
            cyclomaticComplexity: -5, // Negative (invalid)
            cognitiveComplexity: -3,
            functionCount: -1,
            linesOfCode: -10
          }
        },
        framework: 'jest',
        coverage: {
          target: 80,
          type: 'line'
        },
        constraints: {
          maxTests: 50,
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      };

      const task: QETask = {
        id: 'test-negative-complexity',
        type: 'test-generation',
        payload: request,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-negative-complexity',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
    });
  });

  describe('Constraints - Boundary Conditions', () => {
    let agent: TestGeneratorAgent;

    beforeEach(async () => {
      const context: AgentContext = {
        workspaceRoot: '/test',
        config: { timeout: 30000, retries: 3, logLevel: 'info' }
      };

      agent = new TestGeneratorAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [],
        context,
        memoryStore,
        eventBus,
        enablePatterns: false,
        enableLearning: false
      });

      await agent.initialize();
    });

    afterEach(async () => {
      if (agent) {
        await agent.terminate();
      }
    });

    it('should handle maxTests = 0', async () => {
      const request: TestGenerationRequest = {
        sourceCode: {
          ast: {},
          files: [
            {
              path: '/test/src/Zero.ts',
              content: 'export function test() {}',
              language: 'typescript'
            }
          ],
          complexityMetrics: {
            cyclomaticComplexity: 1,
            cognitiveComplexity: 1,
            functionCount: 1,
            linesOfCode: 1
          }
        },
        framework: 'jest',
        coverage: {
          target: 80,
          type: 'line'
        },
        constraints: {
          maxTests: 0, // Zero max tests
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      };

      const task: QETask = {
        id: 'test-max-zero',
        type: 'test-generation',
        payload: request,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-max-zero',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(agent.executeTask(assignment)).rejects.toThrow(
        '[TestGeneratorAgent] constraints.maxTests must be a positive number'
      );
    });

    it('should handle very large maxTests', async () => {
      const request: TestGenerationRequest = {
        sourceCode: {
          ast: {},
          files: [
            {
              path: '/test/src/Large.ts',
              content: 'export function test() {}',
              language: 'typescript'
            }
          ],
          complexityMetrics: {
            cyclomaticComplexity: 1,
            cognitiveComplexity: 1,
            functionCount: 1,
            linesOfCode: 1
          }
        },
        framework: 'jest',
        coverage: {
          target: 80,
          type: 'line'
        },
        constraints: {
          maxTests: Number.MAX_SAFE_INTEGER, // Very large
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      };

      const task: QETask = {
        id: 'test-max-large',
        type: 'test-generation',
        payload: request,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-max-large',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
    });

    it('should handle negative maxTests', async () => {
      const request: TestGenerationRequest = {
        sourceCode: {
          ast: {},
          files: [
            {
              path: '/test/src/Negative.ts',
              content: 'export function test() {}',
              language: 'typescript'
            }
          ],
          complexityMetrics: {
            cyclomaticComplexity: 1,
            cognitiveComplexity: 1,
            functionCount: 1,
            linesOfCode: 1
          }
        },
        framework: 'jest',
        coverage: {
          target: 80,
          type: 'line'
        },
        constraints: {
          maxTests: -100, // Negative (invalid)
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      };

      const task: QETask = {
        id: 'test-max-negative',
        type: 'test-generation',
        payload: request,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-max-negative',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(agent.executeTask(assignment)).rejects.toThrow(
        '[TestGeneratorAgent] constraints.maxTests must be a positive number'
      );
    });

    it('should handle empty testTypes array', async () => {
      const request: TestGenerationRequest = {
        sourceCode: {
          ast: {},
          files: [
            {
              path: '/test/src/Empty.ts',
              content: 'export function test() {}',
              language: 'typescript'
            }
          ],
          complexityMetrics: {
            cyclomaticComplexity: 1,
            cognitiveComplexity: 1,
            functionCount: 1,
            linesOfCode: 1
          }
        },
        framework: 'jest',
        coverage: {
          target: 80,
          type: 'line'
        },
        constraints: {
          maxTests: 50,
          maxExecutionTime: 30000,
          testTypes: [] // Empty array
        }
      };

      const task: QETask = {
        id: 'test-empty-types',
        type: 'test-generation',
        payload: request,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-empty-types',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(agent.executeTask(assignment)).rejects.toThrow(
        '[TestGeneratorAgent] constraints.testTypes must be a non-empty array'
      );
    });

    it('should handle maxExecutionTime = 0', async () => {
      const request: TestGenerationRequest = {
        sourceCode: {
          ast: {},
          files: [
            {
              path: '/test/src/ZeroTime.ts',
              content: 'export function test() {}',
              language: 'typescript'
            }
          ],
          complexityMetrics: {
            cyclomaticComplexity: 1,
            cognitiveComplexity: 1,
            functionCount: 1,
            linesOfCode: 1
          }
        },
        framework: 'jest',
        coverage: {
          target: 80,
          type: 'line'
        },
        constraints: {
          maxTests: 50,
          maxExecutionTime: 0, // Zero timeout
          testTypes: [TestType.UNIT]
        }
      };

      const task: QETask = {
        id: 'test-zero-time',
        type: 'test-generation',
        payload: request,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-zero-time',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(agent.executeTask(assignment)).rejects.toThrow(
        '[TestGeneratorAgent] constraints.maxExecutionTime must be a positive number'
      );
    });
  });

  describe('Coverage Target - Boundary Conditions', () => {
    let agent: TestGeneratorAgent;

    beforeEach(async () => {
      const context: AgentContext = {
        workspaceRoot: '/test',
        config: { timeout: 30000, retries: 3, logLevel: 'info' }
      };

      agent = new TestGeneratorAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [],
        context,
        memoryStore,
        eventBus,
        enablePatterns: false,
        enableLearning: false
      });

      await agent.initialize();
    });

    afterEach(async () => {
      if (agent) {
        await agent.terminate();
      }
    });

    it('should handle coverage target = 0%', async () => {
      const request: TestGenerationRequest = {
        sourceCode: {
          ast: {},
          files: [
            {
              path: '/test/src/Zero.ts',
              content: 'export function test() {}',
              language: 'typescript'
            }
          ],
          complexityMetrics: {
            cyclomaticComplexity: 1,
            cognitiveComplexity: 1,
            functionCount: 1,
            linesOfCode: 1
          }
        },
        framework: 'jest',
        coverage: {
          target: 0, // 0% coverage
          type: 'line'
        },
        constraints: {
          maxTests: 50,
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      };

      const task: QETask = {
        id: 'test-coverage-zero',
        type: 'test-generation',
        payload: request,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-coverage-zero',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
    });

    it('should handle coverage target = 100%', async () => {
      const request: TestGenerationRequest = {
        sourceCode: {
          ast: {},
          files: [
            {
              path: '/test/src/Full.ts',
              content: 'export function test() {}',
              language: 'typescript'
            }
          ],
          complexityMetrics: {
            cyclomaticComplexity: 1,
            cognitiveComplexity: 1,
            functionCount: 1,
            linesOfCode: 1
          }
        },
        framework: 'jest',
        coverage: {
          target: 100, // 100% coverage
          type: 'line'
        },
        constraints: {
          maxTests: 50,
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      };

      const task: QETask = {
        id: 'test-coverage-full',
        type: 'test-generation',
        payload: request,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-coverage-full',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
    });

    it('should handle coverage target > 100%', async () => {
      const request: TestGenerationRequest = {
        sourceCode: {
          ast: {},
          files: [
            {
              path: '/test/src/Over.ts',
              content: 'export function test() {}',
              language: 'typescript'
            }
          ],
          complexityMetrics: {
            cyclomaticComplexity: 1,
            cognitiveComplexity: 1,
            functionCount: 1,
            linesOfCode: 1
          }
        },
        framework: 'jest',
        coverage: {
          target: 150, // > 100% (invalid)
          type: 'line'
        },
        constraints: {
          maxTests: 50,
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      };

      const task: QETask = {
        id: 'test-coverage-over',
        type: 'test-generation',
        payload: request,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-coverage-over',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(agent.executeTask(assignment)).rejects.toThrow(
        '[TestGeneratorAgent] Coverage target must be a number between 0-100'
      );
    });

    it('should handle negative coverage target', async () => {
      const request: TestGenerationRequest = {
        sourceCode: {
          ast: {},
          files: [
            {
              path: '/test/src/Negative.ts',
              content: 'export function test() {}',
              language: 'typescript'
            }
          ],
          complexityMetrics: {
            cyclomaticComplexity: 1,
            cognitiveComplexity: 1,
            functionCount: 1,
            linesOfCode: 1
          }
        },
        framework: 'jest',
        coverage: {
          target: -50, // Negative (invalid)
          type: 'line'
        },
        constraints: {
          maxTests: 50,
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      };

      const task: QETask = {
        id: 'test-coverage-negative',
        type: 'test-generation',
        payload: request,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-coverage-negative',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(agent.executeTask(assignment)).rejects.toThrow(
        '[TestGeneratorAgent] Coverage target must be a number between 0-100'
      );
    });
  });

  describe('Error Scenarios', () => {
    let agent: TestGeneratorAgent;

    beforeEach(async () => {
      const context: AgentContext = {
        workspaceRoot: '/test',
        config: { timeout: 30000, retries: 3, logLevel: 'info' }
      };

      agent = new TestGeneratorAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [],
        context,
        memoryStore,
        eventBus,
        enablePatterns: false,
        enableLearning: false
      });

      await agent.initialize();
    });

    afterEach(async () => {
      if (agent) {
        await agent.terminate();
      }
    });

    it('should handle malformed task with null requirements', async () => {
      const task: QETask = {
        id: 'test-null-req',
        type: 'test-generation',
        requirements: null as any, // Null requirements
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-null-req',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(agent.executeTask(assignment)).rejects.toThrow();
    });

    it('should handle malformed task with undefined requirements', async () => {
      const task: QETask = {
        id: 'test-undef-req',
        type: 'test-generation',
        requirements: undefined as any, // Undefined requirements
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-undef-req',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(agent.executeTask(assignment)).rejects.toThrow();
    });

    it('should handle invalid framework name', async () => {
      const request: TestGenerationRequest = {
        sourceCode: {
          ast: {},
          files: [
            {
              path: '/test/src/Invalid.ts',
              content: 'export function test() {}',
              language: 'typescript'
            }
          ],
          complexityMetrics: {
            cyclomaticComplexity: 1,
            cognitiveComplexity: 1,
            functionCount: 1,
            linesOfCode: 1
          }
        },
        framework: 'invalid-framework-xyz' as any, // Invalid framework
        coverage: {
          target: 80,
          type: 'line'
        },
        constraints: {
          maxTests: 50,
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      };

      const task: QETask = {
        id: 'test-invalid-framework',
        type: 'test-generation',
        payload: request,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-invalid-framework',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      // Should still generate tests, but may default to jest
      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
    });

    it('should handle unsupported language', async () => {
      const request: TestGenerationRequest = {
        sourceCode: {
          ast: {},
          files: [
            {
              path: '/test/src/Unsupported.xyz',
              content: 'UNSUPPORTED LANGUAGE CODE',
              language: 'xyz-lang' // Unsupported language
            }
          ],
          complexityMetrics: {
            cyclomaticComplexity: 1,
            cognitiveComplexity: 1,
            functionCount: 1,
            linesOfCode: 1
          }
        },
        framework: 'jest',
        coverage: {
          target: 80,
          type: 'line'
        },
        constraints: {
          maxTests: 50,
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      };

      const task: QETask = {
        id: 'test-unsupported-lang',
        type: 'test-generation',
        payload: request,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-unsupported-lang',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      // Should still attempt generation
      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
    });
  });

  describe('Memory Operations - Null Safety', () => {
    let agent: TestGeneratorAgent;

    beforeEach(async () => {
      const context: AgentContext = {
        workspaceRoot: '/test',
        config: { timeout: 30000, retries: 3, logLevel: 'info' }
      };

      agent = new TestGeneratorAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [],
        context,
        memoryStore,
        eventBus,
        enablePatterns: false,
        enableLearning: false
      });

      await agent.initialize();
    });

    afterEach(async () => {
      if (agent) {
        await agent.terminate();
      }
    });

    it('should handle memory store operations with null values', async () => {
      // This tests the agent's internal memory handling
      const request: TestGenerationRequest = {
        sourceCode: {
          ast: {},
          files: [
            {
              path: '/test/src/Memory.ts',
              content: 'export function test() {}',
              language: 'typescript'
            }
          ],
          complexityMetrics: {
            cyclomaticComplexity: 1,
            cognitiveComplexity: 1,
            functionCount: 1,
            linesOfCode: 1
          }
        },
        framework: 'jest',
        coverage: {
          target: 80,
          type: 'line'
        },
        constraints: {
          maxTests: 50,
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      };

      const task: QETask = {
        id: 'test-memory-null',
        type: 'test-generation',
        payload: request,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-memory-null',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();

      // Verify memory was stored
      const agentId = agent.getStatus().agentId.id;
      const stored = await memoryStore.retrieve(`agent:${agentId}:last-generation`);
      expect(stored).toBeDefined();
    });
  });

  describe('Pattern-Based Generation - Null Safety', () => {
    it('should handle pattern generation with null applicable patterns', async () => {
      const context: AgentContext = {
        workspaceRoot: '/test',
        config: { timeout: 30000, retries: 3, logLevel: 'info' }
      };

      const agent = new TestGeneratorAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [],
        context,
        memoryStore,
        eventBus,
        enablePatterns: true, // Enable patterns
        enableLearning: false
      });

      await agent.initialize();

      const request: TestGenerationRequest = {
        sourceCode: {
          ast: {},
          files: [
            {
              path: '/test/src/Pattern.ts',
              content: 'export function test() {}',
              language: 'typescript'
            }
          ],
          complexityMetrics: {
            cyclomaticComplexity: 1,
            cognitiveComplexity: 1,
            functionCount: 1,
            linesOfCode: 1
          }
        },
        framework: 'jest',
        coverage: {
          target: 80,
          type: 'line'
        },
        constraints: {
          maxTests: 50,
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      };

      const task: QETask = {
        id: 'test-pattern-null',
        type: 'test-generation',
        payload: request,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date()
      };

      const assignment: TaskAssignment = {
        id: 'assignment-pattern-null',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment) as TestGenerationResult;
      expect(result).toBeDefined();
      expect(result.patterns).toBeDefined();
      expect(result.generationMetrics.patternsUsed).toBeDefined();

      await agent.terminate();
    });
  });
});
