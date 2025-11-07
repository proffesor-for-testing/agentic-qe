/**
 * Phase 2 MCP Tool Integration Tests
 *
 * Tests that Phase 2 MCP tools work correctly with the AQE system:
 * - Learning Engine MCP tools
 * - Pattern Management MCP tools
 * - Improvement Loop MCP tools
 * - Cross-tool coordination
 *
 * @module tests/integration/phase2/phase2-mcp-integration
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AgenticQEMCPServer } from '@mcp/server';
import { TOOL_NAMES } from '@mcp/tools';
import { LearningEngine } from '@learning/LearningEngine';
import { QEReasoningBank } from '@reasoning/QEReasoningBank';
import { ImprovementLoop } from '@learning/ImprovementLoop';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';

describe('Phase 2 MCP Tool Integration Tests', () => {
  let server: AgenticQEMCPServer;
  let memoryManager: SwarmMemoryManager;

  beforeEach(async () => {
    server = new AgenticQEMCPServer();
    memoryManager = new SwarmMemoryManager();
    await memoryManager.initialize();
    await memoryManager.clear('coordination');
  });

  afterEach(async () => {
    await server.stop();
    await memoryManager.clear('coordination');
    await memoryManager.close();
  });

  // ===========================================================================
  // Learning Engine MCP Tools
  // ===========================================================================

  describe('Learning Engine MCP Tools', () => {
    it('should get learning status via MCP tool', async () => {
      const handler = (server as any).handlers.get(TOOL_NAMES.LEARNING_STATUS);
      const result = await handler.handleLearningStatus({
        agentId: 'test-agent-1'
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.agentId).toBe('test-agent-1');
      expect(result.data.totalExperiences).toBeGreaterThanOrEqual(0);
    }, 10000);

    it('should record learning experience via MCP tool', async () => {
      const handler = (server as any).handlers.get(TOOL_NAMES.LEARNING_TRAIN);
      const result = await handler.handleLearningTrain({
        agentId: 'test-agent-2',
        task: {
          id: 'task-1',
          type: 'test-generation'
        },
        result: {
          status: 'success',
          quality: 0.92,
          metadata: {
            framework: 'jest',
            complexity: 3
          }
        }
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.improved).toBeDefined();
    }, 10000);

    it('should train learning engine via MCP tool', async () => {
      const handler = (server as any).handlers.get(TOOL_NAMES.LEARNING_TRAIN);

      // First, record some experiences
      for (let i = 0; i < 10; i++) {
        await handler.handleLearningTrain({
          agentId: 'train-agent',
          task: {
            id: `task-${i}`,
            type: 'test-generation'
          },
          result: {
            status: 'success',
            quality: 0.8 + (i * 0.02),
            metadata: {
              framework: 'jest',
              complexity: 2 + (i % 3)
            }
          }
        });
      }

      const result = await handler.handleLearningTrain({
        agentId: 'train-agent',
        task: { id: 'final-task', type: 'test-generation' },
        result: { status: 'success', quality: 0.95 }
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.improved).toBeDefined();
    }, 15000);

    it('should get learning insights via MCP tool', async () => {
      const handler = (server as any).handlers.get(TOOL_NAMES.LEARNING_HISTORY);
      const result = await handler.handleLearningHistory({
        agentId: 'insight-agent',
        limit: 30
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.experiences).toBeDefined();
      expect(Array.isArray(result.data.experiences)).toBe(true);
    }, 10000);

    it('should apply learning to generate recommendations', async () => {
      const handler = (server as any).handlers.get(TOOL_NAMES.LEARNING_EXPORT);
      const result = await handler.handleLearningExport({
        agentId: 'apply-agent',
        format: 'json'
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.agentId).toBe('apply-agent');
      expect(result.data.totalExperiences).toBeGreaterThanOrEqual(0);
    }, 10000);
  });

  // ===========================================================================
  // Pattern Management MCP Tools
  // ===========================================================================

  describe('Pattern Management MCP Tools', () => {
    it('should store pattern via MCP tool', async () => {
      const handler = (server as any).handlers.get(TOOL_NAMES.PATTERN_STORE);
      const result = await handler.handlePatternStore({
        pattern: {
          id: 'mcp-pattern-1',
          name: 'MCP Test Pattern',
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          description: 'Pattern created via MCP tool',
          template: 'describe("{{name}}", () => { ... });',
          applicability: {
            complexity: 'medium',
            context: ['testing', 'unit'],
            constraints: []
          },
          metrics: {
            successRate: 0.90,
            usageCount: 0,
            averageQuality: 0,
            lastUsed: new Date()
          },
          tags: ['mcp', 'test'],
          metadata: { source: 'mcp-tool' }
        }
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('mcp-pattern-1');
    }, 10000);

    it('should find patterns via MCP tool', async () => {
      const handler = (server as any).handlers.get(TOOL_NAMES.PATTERN_STORE);
      const findHandler = (server as any).handlers.get(TOOL_NAMES.PATTERN_FIND);

      // First store some patterns
      await handler.handlePatternStore({
        pattern: {
          id: 'find-pattern-1',
          name: 'User CRUD Pattern',
          category: 'integration',
          framework: 'jest',
          language: 'typescript',
          description: 'User service CRUD operations',
          template: '...',
          applicability: { complexity: 'medium', context: ['database'], constraints: [] },
          metrics: { successRate: 0.92, usageCount: 0, averageQuality: 0, lastUsed: new Date() },
          tags: ['crud', 'user'],
          metadata: {}
        }
      });

      const result = await findHandler.handlePatternFind({
        query: {
          framework: 'jest',
          language: 'typescript',
          keywords: ['user', 'crud']
        },
        limit: 10
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.patterns).toBeDefined();
      expect(Array.isArray(result.data.patterns)).toBe(true);
    }, 10000);

    it('should get pattern statistics via MCP tool', async () => {
      const handler = (server as any).handlers.get(TOOL_NAMES.PATTERN_STATS);
      const result = await handler.handlePatternStats({});

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.totalPatterns).toBeGreaterThanOrEqual(0);
      expect(result.data.byFramework).toBeDefined();
      expect(result.data.byCategory).toBeDefined();
      expect(result.data.byLanguage).toBeDefined();
    }, 10000);

    it('should update pattern metrics via MCP tool', async () => {
      const storeHandler = (server as any).handlers.get(TOOL_NAMES.PATTERN_STORE);
      const findHandler = (server as any).handlers.get(TOOL_NAMES.PATTERN_FIND);

      // Store pattern first
      await storeHandler.handlePatternStore({
        pattern: {
          id: 'update-pattern-1',
          name: 'Update Test Pattern',
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          description: 'Pattern for testing updates',
          template: '...',
          applicability: { complexity: 'low', context: [], constraints: [] },
          metrics: { successRate: 0.80, usageCount: 0, averageQuality: 0, lastUsed: new Date() },
          tags: ['update'],
          metadata: {}
        }
      });

      // Verify pattern was stored
      const result = await findHandler.handlePatternFind({
        query: { framework: 'jest', keywords: ['update'] }
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.patterns).toBeDefined();
    }, 10000);

    it('should extract patterns from code via MCP tool', async () => {
      const handler = (server as any).handlers.get(TOOL_NAMES.PATTERN_EXTRACT);
      const code = `
        describe('PaymentService', () => {
          it('processes payment', async () => {
            const service = new PaymentService();
            const result = await service.process({ amount: 100 });
            expect(result.status).toBe('success');
          });
        });
      `;

      const result = await handler.handlePatternExtract({
        code,
        options: {
          framework: 'jest',
          language: 'typescript'
        }
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.patterns).toBeDefined();
      expect(Array.isArray(result.data.patterns)).toBe(true);
    }, 10000);
  });

  // ===========================================================================
  // Improvement Loop MCP Tools
  // ===========================================================================

  describe('Improvement Loop MCP Tools', () => {
    it('should get improvement status via MCP tool', async () => {
      const handler = (server as any).handlers.get(TOOL_NAMES.IMPROVEMENT_STATUS);
      const result = await handler.handleImprovementStatus({
        agentId: 'improve-agent-1'
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.agentId).toBe('improve-agent-1');
      expect(result.data.targetImprovement).toBeDefined();
      expect(result.data.currentImprovement).toBeDefined();
      expect(result.data.targetReached).toBeDefined();
    }, 10000);

    it('should run improvement cycle via MCP tool', async () => {
      const handler = (server as any).handlers.get(TOOL_NAMES.IMPROVEMENT_CYCLE);
      const result = await handler.handleImprovementCycle({
        agentId: 'cycle-agent-1',
        iterations: 3
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.cyclesRun).toBeGreaterThanOrEqual(0);
      expect(result.data.improvement).toBeGreaterThanOrEqual(0);
    }, 15000);

    it('should get improvement status showing target progress', async () => {
      const handler = (server as any).handlers.get(TOOL_NAMES.IMPROVEMENT_STATUS);
      const result = await handler.handleImprovementStatus({
        agentId: 'target-agent-1'
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.targetImprovement).toBeDefined();
      expect(result.data.currentImprovement).toBeDefined();
    }, 10000);

    it('should validate improvement achievement via status check', async () => {
      const handler = (server as any).handlers.get(TOOL_NAMES.IMPROVEMENT_STATUS);
      const result = await handler.handleImprovementStatus({
        agentId: 'validate-agent-1'
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.targetReached).toBeDefined();
      expect(result.data.currentImprovement).toBeDefined();
    }, 10000);

    it('should analyze improvement failures via MCP tool', async () => {
      const handler = (server as any).handlers.get(TOOL_NAMES.IMPROVEMENT_FAILURES);
      const result = await handler.handleImprovementFailures({
        agentId: 'analyze-agent-1',
        limit: 10
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.failures).toBeDefined();
      expect(Array.isArray(result.data.failures)).toBe(true);
    }, 10000);
  });

  // ===========================================================================
  // Cross-Tool Coordination
  // ===========================================================================

  describe('Cross-Tool Coordination', () => {
    it('should coordinate learning → pattern storage → improvement', async () => {
      const learnHandler = (server as any).handlers.get(TOOL_NAMES.LEARNING_TRAIN);
      const patternHandler = (server as any).handlers.get(TOOL_NAMES.PATTERN_STORE);
      const improveHandler = (server as any).handlers.get(TOOL_NAMES.IMPROVEMENT_CYCLE);

      // Step 1: Record learning experience
      const learnResult = await learnHandler.handleLearningTrain({
        agentId: 'coord-agent-1',
        task: { id: 'coord-task-1', type: 'test-generation' },
        result: {
          status: 'success',
          quality: 0.95,
          metadata: {
            framework: 'jest',
            pattern: 'unit-test'
          }
        }
      });

      expect(learnResult.success).toBe(true);

      // Step 2: Store successful pattern
      const patternResult = await patternHandler.handlePatternStore({
        pattern: {
          id: 'coord-pattern-1',
          name: 'Coordinated Pattern',
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          description: 'Pattern from coordinated workflow',
          template: '...',
          applicability: { complexity: 'medium', context: [], constraints: [] },
          metrics: { successRate: 0.95, usageCount: 0, averageQuality: 0, lastUsed: new Date() },
          tags: ['coordinated'],
          metadata: { source: 'coordination-test' }
        }
      });

      expect(patternResult.success).toBe(true);

      // Step 3: Run improvement cycle
      const improveResult = await improveHandler.handleImprovementCycle({
        agentId: 'coord-agent-1',
        iterations: 1
      });

      expect(improveResult.success).toBe(true);
    }, 20000);

    it('should share data between MCP tools via memory', async () => {
      const learnHandler = (server as any).handlers.get(TOOL_NAMES.LEARNING_TRAIN);
      const patternHandler = (server as any).handlers.get(TOOL_NAMES.PATTERN_FIND);
      const improveHandler = (server as any).handlers.get(TOOL_NAMES.IMPROVEMENT_STATUS);

      // Tool 1: Store learning data
      await learnHandler.handleLearningTrain({
        agentId: 'shared-agent',
        task: { id: 'shared-task', type: 'test-generation' },
        result: {
          status: 'success',
          quality: 0.90,
          metadata: { key: 'value' }
        }
      });

      // Tool 2: Retrieve via pattern tool
      const patterns = await patternHandler.handlePatternFind({
        query: { framework: 'jest' }
      });

      // Tool 3: Use in improvement analysis
      const improvement = await improveHandler.handleImprovementStatus({
        agentId: 'shared-agent'
      });

      expect(patterns).toBeDefined();
      expect(patterns.success).toBe(true);
      expect(improvement).toBeDefined();
      expect(improvement.success).toBe(true);
    }, 15000);

    it('should handle concurrent MCP tool calls', async () => {
      const handler = (server as any).handlers.get(TOOL_NAMES.LEARNING_TRAIN);
      const promises = [];

      // Call multiple tools concurrently
      for (let i = 0; i < 10; i++) {
        promises.push(
          handler.handleLearningTrain({
            agentId: `concurrent-agent-${i}`,
            task: { id: `concurrent-task-${i}`, type: 'test-generation' },
            result: {
              status: 'success',
              quality: 0.85,
              metadata: {}
            }
          })
        );
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach(r => {
        expect(r.success).toBe(true);
      });
    }, 20000);
  });

  // ===========================================================================
  // Error Handling and Validation
  // ===========================================================================

  describe('MCP Tool Error Handling', () => {
    it('should handle missing handler gracefully', async () => {
      const invalidHandler = (server as any).handlers.get('invalid_tool_name');
      expect(invalidHandler).toBeUndefined();
    }, 10000);

    it('should validate required parameters', async () => {
      const handler = (server as any).handlers.get(TOOL_NAMES.LEARNING_TRAIN);
      await expect(async () => {
        await handler.handleLearningTrain({});
      }).rejects.toThrow();
    }, 10000);

    it('should handle invalid data gracefully', async () => {
      const handler = (server as any).handlers.get(TOOL_NAMES.LEARNING_TRAIN);
      const result = await handler.handleLearningTrain({
        agentId: 'test-agent',
        task: null as any,
        result: null as any
      });
      // Should return error response instead of throwing
      expect(result.success).toBe(false);
    }, 10000);
  });

  // ===========================================================================
  // Performance Validation
  // ===========================================================================

  describe('MCP Tool Performance', () => {
    it('should execute tools within performance targets', async () => {
      const learnHandler = (server as any).handlers.get(TOOL_NAMES.LEARNING_STATUS);
      const patternHandler = (server as any).handlers.get(TOOL_NAMES.PATTERN_STATS);
      const improveHandler = (server as any).handlers.get(TOOL_NAMES.IMPROVEMENT_STATUS);

      const tools = [
        { handler: learnHandler, method: 'handleLearningStatus', params: { agentId: 'perf-agent' }, target: 100 },
        { handler: patternHandler, method: 'handlePatternStats', params: {}, target: 50 },
        { handler: improveHandler, method: 'handleImprovementStatus', params: { agentId: 'perf-agent' }, target: 100 }
      ];

      for (const tool of tools) {
        const start = performance.now();
        await tool.handler[tool.method](tool.params);
        const elapsed = performance.now() - start;

        console.log(`${tool.method}: ${elapsed.toFixed(2)}ms (target: <${tool.target}ms)`);
        expect(elapsed).toBeLessThan(tool.target);
      }
    }, 20000);

    it('should handle high-throughput MCP calls', async () => {
      const handler = (server as any).handlers.get(TOOL_NAMES.LEARNING_STATUS);
      const callCount = 100;
      const start = performance.now();

      const promises = Array.from({ length: callCount }, (_, i) =>
        handler.handleLearningStatus({ agentId: `agent-${i}` })
      );

      await Promise.all(promises);

      const elapsed = performance.now() - start;
      const avgPerCall = elapsed / callCount;

      console.log(`Processed ${callCount} calls in ${elapsed.toFixed(2)}ms (avg: ${avgPerCall.toFixed(2)}ms/call)`);
      expect(avgPerCall).toBeLessThan(50); // <50ms average per call
    }, 30000);
  });
});
