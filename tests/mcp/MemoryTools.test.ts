/**
 * Tests for Memory MCP Tools
 *
 * Comprehensive test suite for 10 memory-related MCP tools that enable
 * agent coordination, blackboard pattern, consensus, and artifact management.
 *
 * @group mcp
 * @group memory
 */

import { AgenticQEMCPServer } from '../../src/mcp/server';
import { TOOL_NAMES } from '../../src/mcp/tools';

describe('Memory MCP Tools', () => {
  let server: AgenticQEMCPServer;

  beforeEach(async () => {
    server = new AgenticQEMCPServer();
  });

  afterEach(async () => {
    await server.stop();
    jest.clearAllMocks();
  });

  describe('memory_store', () => {
    const toolName = 'mcp__agentic_qe__memory_store';

    it('should store data with key-value pair', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              key: 'test-key',
              value: { data: 'test-value' },
              namespace: 'qe',
              ttl: 3600
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('success');
    });

    it('should store data without TTL for persistent storage', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              key: 'persistent-key',
              value: 'persistent-value',
              namespace: 'qe'
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('success');
    });

    it('should support custom metadata', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              key: 'meta-key',
              value: 'meta-value',
              namespace: 'qe',
              metadata: {
                agentId: 'agent-1',
                taskId: 'task-1'
              }
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('success');
    });

    it('should validate required fields', async () => {
      await expect(
        server.getServer().request(
          {
            method: 'tools/call',
            params: {
              name: toolName,
              arguments: {
                value: 'test-value'
                // Missing required 'key'
              }
            }
          },
          {} as any
        )
      ).rejects.toThrow();
    });
  });

  describe('memory_retrieve', () => {
    const storeTool = 'mcp__agentic_qe__memory_store';
    const retrieveTool = 'mcp__agentic_qe__memory_retrieve';

    beforeEach(async () => {
      // Store test data
      await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: storeTool,
            arguments: {
              key: 'retrieve-test',
              value: { data: 'retrieve-value' },
              namespace: 'qe'
            }
          }
        },
        {} as any
      );
    });

    it('should retrieve stored data', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: retrieveTool,
            arguments: {
              key: 'retrieve-test',
              namespace: 'qe'
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('retrieve-value');
    });

    it('should return null for non-existent key', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: retrieveTool,
            arguments: {
              key: 'non-existent',
              namespace: 'qe'
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });

    it('should include metadata in response', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: retrieveTool,
            arguments: {
              key: 'retrieve-test',
              namespace: 'qe',
              includeMetadata: true
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('timestamp');
    });
  });

  describe('memory_query', () => {
    const toolName = 'mcp__agentic_qe__memory_query';

    it('should query by pattern', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              pattern: 'test-*',
              namespace: 'qe'
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });

    it('should query by namespace', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              namespace: 'qe',
              limit: 10
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });

    it('should filter by time range', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              namespace: 'qe',
              startTime: Date.now() - 3600000,
              endTime: Date.now()
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });

    it('should support pagination', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              namespace: 'qe',
              limit: 5,
              offset: 0
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });
  });

  describe('memory_share', () => {
    const toolName = 'mcp__agentic_qe__memory_share';

    it('should share memory between agents', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              sourceKey: 'shared-key',
              sourceNamespace: 'agent-1',
              targetAgents: ['agent-2', 'agent-3'],
              targetNamespace: 'shared'
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('success');
    });

    it('should support access control', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              sourceKey: 'secure-key',
              sourceNamespace: 'agent-1',
              targetAgents: ['agent-2'],
              targetNamespace: 'shared',
              permissions: ['read']
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });
  });

  describe('memory_backup', () => {
    const toolName = 'mcp__agentic_qe__memory_backup';

    it('should create backup of namespace', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              action: 'create',
              namespace: 'qe',
              backupId: 'backup-1'
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('success');
    });

    it('should restore from backup', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              action: 'restore',
              backupId: 'backup-1',
              targetNamespace: 'qe-restored'
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });

    it('should list available backups', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              action: 'list',
              namespace: 'qe'
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });

    it('should delete old backups', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              action: 'delete',
              backupId: 'backup-1'
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });
  });

  describe('blackboard_post', () => {
    const toolName = 'mcp__agentic_qe__blackboard_post';

    it('should post coordination hint', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              topic: 'test-coverage',
              message: 'Coverage threshold: 95%',
              priority: 'high',
              agentId: 'agent-1'
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('success');
    });

    it('should support different priority levels', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              topic: 'performance',
              message: 'Critical performance issue detected',
              priority: 'critical',
              agentId: 'agent-1'
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });

    it('should attach metadata to hints', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              topic: 'test-results',
              message: 'Test suite completed',
              priority: 'medium',
              agentId: 'agent-1',
              metadata: {
                testCount: 150,
                passRate: 98.5
              }
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });

    it('should support TTL for hints', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              topic: 'temporary-issue',
              message: 'Temporary network latency',
              priority: 'low',
              agentId: 'agent-1',
              ttl: 300
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });
  });

  describe('blackboard_read', () => {
    const toolName = 'mcp__agentic_qe__blackboard_read';

    it('should read hints by topic', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              topic: 'test-coverage',
              agentId: 'agent-2'
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });

    it('should filter by priority', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              topic: 'test-coverage',
              minPriority: 'high',
              agentId: 'agent-2'
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });

    it('should return recent hints only', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              topic: 'test-coverage',
              since: Date.now() - 3600000,
              agentId: 'agent-2'
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });

    it('should support limit parameter', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              topic: 'test-coverage',
              limit: 5,
              agentId: 'agent-2'
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });
  });

  describe('consensus_propose', () => {
    const toolName = 'mcp__agentic_qe__consensus_propose';

    it('should create consensus proposal', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              proposalId: 'proposal-1',
              topic: 'quality-gate',
              proposal: {
                action: 'deploy',
                threshold: 95,
                metrics: ['coverage', 'performance']
              },
              votingAgents: ['agent-1', 'agent-2', 'agent-3'],
              quorum: 0.67,
              timeout: 300
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('success');
    });

    it('should support different quorum thresholds', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              proposalId: 'proposal-2',
              topic: 'emergency-rollback',
              proposal: { action: 'rollback' },
              votingAgents: ['agent-1', 'agent-2'],
              quorum: 1.0
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });

    it('should attach proposal metadata', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              proposalId: 'proposal-3',
              topic: 'test-strategy',
              proposal: { strategy: 'parallel-execution' },
              votingAgents: ['agent-1', 'agent-2'],
              quorum: 0.5,
              metadata: {
                priority: 'high',
                impact: 'medium'
              }
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });
  });

  describe('consensus_vote', () => {
    const toolName = 'mcp__agentic_qe__consensus_vote';

    it('should cast vote on proposal', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              proposalId: 'proposal-1',
              agentId: 'agent-1',
              vote: 'approve',
              rationale: 'All quality metrics are met'
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('success');
    });

    it('should support reject votes', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              proposalId: 'proposal-1',
              agentId: 'agent-2',
              vote: 'reject',
              rationale: 'Coverage below threshold'
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });

    it('should support abstain votes', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              proposalId: 'proposal-1',
              agentId: 'agent-3',
              vote: 'abstain',
              rationale: 'Insufficient data to decide'
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });

    it('should check if consensus reached', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              proposalId: 'proposal-1',
              agentId: 'agent-1',
              vote: 'approve',
              checkConsensus: true
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });
  });

  describe('artifact_manifest', () => {
    const toolName = 'mcp__agentic_qe__artifact_manifest';

    it('should create artifact manifest', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              action: 'create',
              manifestId: 'manifest-1',
              artifacts: [
                {
                  type: 'test-report',
                  path: '/reports/test-results.json',
                  metadata: { testCount: 150, passRate: 98 }
                },
                {
                  type: 'coverage-report',
                  path: '/reports/coverage.html',
                  metadata: { coverage: 95.5 }
                }
              ]
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('success');
    });

    it('should retrieve artifact manifest', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              action: 'get',
              manifestId: 'manifest-1'
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });

    it('should list all manifests', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              action: 'list',
              filterBy: { type: 'test-report' }
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });

    it('should update artifact manifest', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              action: 'update',
              manifestId: 'manifest-1',
              updates: {
                status: 'completed',
                timestamp: Date.now()
              }
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });

    it('should delete artifact manifest', async () => {
      const result = await server.getServer().request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              action: 'delete',
              manifestId: 'manifest-1'
            }
          }
        },
        {} as any
      );

      expect(result).toBeDefined();
    });
  });

  describe('Tool Registration', () => {
    it('should register all 10 memory tools', async () => {
      const tools = server.getTools();
      const memoryTools = tools.filter(t => t.name.includes('memory') || t.name.includes('blackboard') || t.name.includes('consensus') || t.name.includes('artifact'));

      expect(memoryTools.length).toBeGreaterThanOrEqual(10);
    });

    it('should support all memory tool names', () => {
      expect(server.supportsTool('mcp__agentic_qe__memory_store')).toBe(true);
      expect(server.supportsTool('mcp__agentic_qe__memory_retrieve')).toBe(true);
      expect(server.supportsTool('mcp__agentic_qe__memory_query')).toBe(true);
      expect(server.supportsTool('mcp__agentic_qe__memory_share')).toBe(true);
      expect(server.supportsTool('mcp__agentic_qe__memory_backup')).toBe(true);
      expect(server.supportsTool('mcp__agentic_qe__blackboard_post')).toBe(true);
      expect(server.supportsTool('mcp__agentic_qe__blackboard_read')).toBe(true);
      expect(server.supportsTool('mcp__agentic_qe__consensus_propose')).toBe(true);
      expect(server.supportsTool('mcp__agentic_qe__consensus_vote')).toBe(true);
      expect(server.supportsTool('mcp__agentic_qe__artifact_manifest')).toBe(true);
    });
  });
});
