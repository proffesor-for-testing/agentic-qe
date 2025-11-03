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
import { MCPToolRegistry } from '@mcp/MCPToolRegistry';
import { LearningEngine } from '@learning/LearningEngine';
import { QEReasoningBank } from '@reasoning/QEReasoningBank';
import { ImprovementLoop } from '@learning/ImprovementLoop';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';

describe('Phase 2 MCP Tool Integration Tests', () => {
  let toolRegistry: MCPToolRegistry;
  let memoryManager: SwarmMemoryManager;

  beforeEach(async () => {
    toolRegistry = new MCPToolRegistry();
    memoryManager = new SwarmMemoryManager();
    await memoryManager.initialize();
    await memoryManager.clear('coordination');
  });

  afterEach(async () => {
    await memoryManager.clear('coordination');
    await memoryManager.close();
  });

  // ===========================================================================
  // Learning Engine MCP Tools
  // ===========================================================================

  describe('Learning Engine MCP Tools', () => {
    it('should get learning status via MCP tool', async () => {
      const result = await toolRegistry.callTool('learning_status', {
        agentId: 'test-agent-1'
      });

      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.agentId).toBe('test-agent-1');
      expect(result.totalExperiences).toBeGreaterThanOrEqual(0);
    }, 10000);

    it('should record learning experience via MCP tool', async () => {
      const result = await toolRegistry.callTool('learning_record', {
        agentId: 'test-agent-2',
        experience: {
          taskId: 'task-1',
          outcome: 'success',
          quality: 0.92,
          metadata: {
            framework: 'jest',
            complexity: 3
          }
        }
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.experienceId).toBeDefined();
    }, 10000);

    it('should train learning engine via MCP tool', async () => {
      // First, record some experiences
      for (let i = 0; i < 10; i++) {
        await toolRegistry.callTool('learning_record', {
          agentId: 'train-agent',
          experience: {
            taskId: `task-${i}`,
            outcome: 'success',
            quality: 0.8 + (i * 0.02),
            metadata: {
              framework: 'jest',
              complexity: 2 + (i % 3)
            }
          }
        });
      }

      const result = await toolRegistry.callTool('learning_train', {
        agentId: 'train-agent',
        iterations: 5
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.improved).toBe(true);
      expect(result.newQuality).toBeGreaterThan(0.8);
    }, 15000);

    it('should get learning insights via MCP tool', async () => {
      const result = await toolRegistry.callTool('learning_insights', {
        agentId: 'insight-agent',
        timeframe: 30 // days
      });

      expect(result).toBeDefined();
      expect(result.trends).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
    }, 10000);

    it('should apply learning to generate recommendations', async () => {
      const result = await toolRegistry.callTool('learning_apply', {
        agentId: 'apply-agent',
        context: {
          framework: 'jest',
          language: 'typescript',
          complexity: 3
        }
      });

      expect(result).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.expectedQuality).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
    }, 10000);
  });

  // ===========================================================================
  // Pattern Management MCP Tools
  // ===========================================================================

  describe('Pattern Management MCP Tools', () => {
    it('should store pattern via MCP tool', async () => {
      const result = await toolRegistry.callTool('pattern_store', {
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
      expect(result.patternId).toBe('mcp-pattern-1');
    }, 10000);

    it('should find patterns via MCP tool', async () => {
      // First store some patterns
      await toolRegistry.callTool('pattern_store', {
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

      const result = await toolRegistry.callTool('pattern_find', {
        query: {
          framework: 'jest',
          language: 'typescript',
          keywords: ['user', 'crud']
        },
        limit: 10
      });

      expect(result).toBeDefined();
      expect(result.patterns).toBeDefined();
      expect(result.patterns.length).toBeGreaterThan(0);
      expect(result.patterns[0].pattern.name).toContain('User');
    }, 10000);

    it('should get pattern statistics via MCP tool', async () => {
      const result = await toolRegistry.callTool('pattern_stats', {});

      expect(result).toBeDefined();
      expect(result.totalPatterns).toBeGreaterThanOrEqual(0);
      expect(result.byFramework).toBeDefined();
      expect(result.byCategory).toBeDefined();
      expect(result.byLanguage).toBeDefined();
    }, 10000);

    it('should update pattern metrics via MCP tool', async () => {
      // Store pattern first
      await toolRegistry.callTool('pattern_store', {
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

      const result = await toolRegistry.callTool('pattern_update_metrics', {
        patternId: 'update-pattern-1',
        success: true,
        quality: 0.95
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.newMetrics.usageCount).toBe(1);
      expect(result.newMetrics.averageQuality).toBeGreaterThan(0);
    }, 10000);

    it('should extract patterns from code via MCP tool', async () => {
      const code = `
        describe('PaymentService', () => {
          it('processes payment', async () => {
            const service = new PaymentService();
            const result = await service.process({ amount: 100 });
            expect(result.status).toBe('success');
          });
        });
      `;

      const result = await toolRegistry.callTool('pattern_extract', {
        code,
        options: {
          framework: 'jest',
          language: 'typescript'
        }
      });

      expect(result).toBeDefined();
      expect(result.patterns).toBeDefined();
      expect(result.patterns.length).toBeGreaterThan(0);
      expect(result.patterns[0].name).toBeDefined();
    }, 10000);
  });

  // ===========================================================================
  // Improvement Loop MCP Tools
  // ===========================================================================

  describe('Improvement Loop MCP Tools', () => {
    it('should get improvement status via MCP tool', async () => {
      const result = await toolRegistry.callTool('improvement_status', {
        agentId: 'improve-agent-1'
      });

      expect(result).toBeDefined();
      expect(result.agentId).toBe('improve-agent-1');
      expect(result.targetImprovement).toBeDefined();
      expect(result.currentImprovement).toBeDefined();
      expect(result.targetReached).toBeDefined();
    }, 10000);

    it('should run improvement cycle via MCP tool', async () => {
      const result = await toolRegistry.callTool('improvement_cycle', {
        agentId: 'cycle-agent-1',
        iterations: 3
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.cyclesRun).toBe(3);
      expect(result.improvement).toBeGreaterThanOrEqual(0);
    }, 15000);

    it('should set improvement target via MCP tool', async () => {
      const result = await toolRegistry.callTool('improvement_set_target', {
        agentId: 'target-agent-1',
        target: 0.25 // 25% improvement
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.targetImprovement).toBe(0.25);
    }, 10000);

    it('should validate improvement achievement via MCP tool', async () => {
      const result = await toolRegistry.callTool('improvement_validate', {
        agentId: 'validate-agent-1'
      });

      expect(result).toBeDefined();
      expect(result.targetReached).toBeDefined();
      expect(result.improvementRate).toBeDefined();
      expect(result.cyclesRequired).toBeDefined();
    }, 10000);

    it('should analyze improvement opportunities via MCP tool', async () => {
      const result = await toolRegistry.callTool('improvement_analyze', {
        agentId: 'analyze-agent-1',
        timeframe: 30
      });

      expect(result).toBeDefined();
      expect(result.opportunities).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.estimatedImpact).toBeDefined();
    }, 10000);
  });

  // ===========================================================================
  // Cross-Tool Coordination
  // ===========================================================================

  describe('Cross-Tool Coordination', () => {
    it('should coordinate learning → pattern storage → improvement', async () => {
      // Step 1: Record learning experience
      const learnResult = await toolRegistry.callTool('learning_record', {
        agentId: 'coord-agent-1',
        experience: {
          taskId: 'coord-task-1',
          outcome: 'success',
          quality: 0.95,
          metadata: {
            framework: 'jest',
            pattern: 'unit-test'
          }
        }
      });

      expect(learnResult.success).toBe(true);

      // Step 2: Store successful pattern
      const patternResult = await toolRegistry.callTool('pattern_store', {
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
          metadata: { experienceId: learnResult.experienceId }
        }
      });

      expect(patternResult.success).toBe(true);

      // Step 3: Run improvement cycle
      const improveResult = await toolRegistry.callTool('improvement_cycle', {
        agentId: 'coord-agent-1',
        iterations: 1
      });

      expect(improveResult.success).toBe(true);
    }, 20000);

    it('should share data between MCP tools via memory', async () => {
      // Tool 1: Store learning data
      await toolRegistry.callTool('learning_record', {
        agentId: 'shared-agent',
        experience: {
          taskId: 'shared-task',
          outcome: 'success',
          quality: 0.90,
          metadata: { key: 'value' }
        }
      });

      // Tool 2: Retrieve via pattern tool
      const patterns = await toolRegistry.callTool('pattern_find', {
        query: { framework: 'jest' }
      });

      // Tool 3: Use in improvement analysis
      const improvement = await toolRegistry.callTool('improvement_analyze', {
        agentId: 'shared-agent'
      });

      expect(patterns).toBeDefined();
      expect(improvement).toBeDefined();
    }, 15000);

    it('should handle concurrent MCP tool calls', async () => {
      const promises = [];

      // Call multiple tools concurrently
      for (let i = 0; i < 10; i++) {
        promises.push(
          toolRegistry.callTool('learning_record', {
            agentId: `concurrent-agent-${i}`,
            experience: {
              taskId: `concurrent-task-${i}`,
              outcome: 'success',
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
    it('should handle invalid tool name gracefully', async () => {
      await expect(async () => {
        await toolRegistry.callTool('invalid_tool_name', {});
      }).rejects.toThrow(/not found|invalid/i);
    }, 10000);

    it('should validate required parameters', async () => {
      await expect(async () => {
        await toolRegistry.callTool('learning_record', {});
      }).rejects.toThrow(/required|missing/i);
    }, 10000);

    it('should handle invalid data types', async () => {
      await expect(async () => {
        await toolRegistry.callTool('learning_record', {
          agentId: 123, // Should be string
          experience: 'invalid'
        });
      }).rejects.toThrow(/type|invalid/i);
    }, 10000);
  });

  // ===========================================================================
  // Performance Validation
  // ===========================================================================

  describe('MCP Tool Performance', () => {
    it('should execute tools within performance targets', async () => {
      const tools = [
        { name: 'learning_status', params: { agentId: 'perf-agent' }, target: 100 },
        { name: 'pattern_stats', params: {}, target: 50 },
        { name: 'improvement_status', params: { agentId: 'perf-agent' }, target: 100 }
      ];

      for (const tool of tools) {
        const start = performance.now();
        await toolRegistry.callTool(tool.name, tool.params);
        const elapsed = performance.now() - start;

        console.log(`${tool.name}: ${elapsed.toFixed(2)}ms (target: <${tool.target}ms)`);
        expect(elapsed).toBeLessThan(tool.target);
      }
    }, 20000);

    it('should handle high-throughput MCP calls', async () => {
      const callCount = 100;
      const start = performance.now();

      const promises = Array.from({ length: callCount }, (_, i) =>
        toolRegistry.callTool('learning_status', { agentId: `agent-${i}` })
      );

      await Promise.all(promises);

      const elapsed = performance.now() - start;
      const avgPerCall = elapsed / callCount;

      console.log(`Processed ${callCount} calls in ${elapsed.toFixed(2)}ms (avg: ${avgPerCall.toFixed(2)}ms/call)`);
      expect(avgPerCall).toBeLessThan(50); // <50ms average per call
    }, 30000);
  });
});
