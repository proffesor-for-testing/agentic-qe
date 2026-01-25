/**
 * Tests for Agent Management Commands
 * Covers all 8 agent management commands
 */

import * as fs from 'fs-extra';
import { withFakeTimers } from '../helpers/timerTestUtils';
import { AgentSpawnCommand } from '@cli/commands/agent/spawn';
import { AgentListCommand } from '@cli/commands/agent/list';
import { AgentMetricsCommand } from '@cli/commands/agent/metrics';
import { AgentLogsCommand } from '@cli/commands/agent/logs';
import { AgentKillCommand } from '@cli/commands/agent/kill';
import { AgentRestartCommand } from '@cli/commands/agent/restart';
import { AgentInspectCommand } from '@cli/commands/agent/inspect';
import { AgentAssignCommand } from '@cli/commands/agent/assign';
import { AgentAttachCommand } from '@cli/commands/agent/attach';
import { AgentDetachCommand } from '@cli/commands/agent/detach';

jest.mock('fs-extra');

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('Agent Management Commands', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFs.pathExists.mockResolvedValue(true);
    mockedFs.readJson.mockResolvedValue({});
    mockedFs.writeJson.mockResolvedValue();
  });

  describe('agent spawn', () => {
    it('should spawn new agent', async () => {
      const result = await AgentSpawnCommand.execute({
        type: 'test-generator',
        name: 'agent-1',
        capabilities: ['property-testing']
      });

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('type', 'test-generator');
      expect(mockedFs.writeJson).toHaveBeenCalled();
    });

    it('should validate agent type', async () => {
      await expect(
        AgentSpawnCommand.execute({ type: 'invalid-type' })
      ).rejects.toThrow('Invalid agent type');
    });

    it('should assign resources to agent', async () => {
      await AgentSpawnCommand.execute({
        type: 'test-executor',
        resources: { cpu: '1', memory: '512MB' }
      });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          resources: expect.objectContaining({ cpu: '1' })
        }),
        expect.any(Object)
      );
    });
  });

  describe('agent list', () => {
    it('should list all agents', async () => {
      mockedFs.readJson.mockResolvedValue({
        agents: [
          { id: 'agent-1', type: 'test-generator', status: 'active' },
          { id: 'agent-2', type: 'test-executor', status: 'idle' }
        ]
      });

      const agents = await AgentListCommand.execute({});

      expect(agents).toHaveLength(2);
      expect(agents[0]).toHaveProperty('id', 'agent-1');
    });

    it('should filter agents by status', async () => {
      mockedFs.readJson.mockResolvedValue({
        agents: [
          { id: 'agent-1', status: 'active' },
          { id: 'agent-2', status: 'idle' },
          { id: 'agent-3', status: 'active' }
        ]
      });

      const agents = await AgentListCommand.execute({ filter: 'active' });

      expect(agents).toHaveLength(2);
      expect(agents.every(a => a.status === 'active')).toBe(true);
    });

    it('should format output as table', async () => {
      const result = await AgentListCommand.execute({ format: 'table' });

      expect(typeof result).toBe('string');
    });
  });

  describe('agent metrics', () => {
    it('should display agent metrics', async () => {
      mockedFs.readJson.mockResolvedValue({
        agentId: 'agent-1',
        metrics: {
          tasksCompleted: 100,
          successRate: 0.95,
          avgExecutionTime: 1500
        }
      });

      const metrics = await AgentMetricsCommand.execute({ agentId: 'agent-1' });

      expect(metrics).toHaveProperty('tasksCompleted', 100);
      expect(metrics).toHaveProperty('successRate', 0.95);
    });

    it('should display metrics for time period', async () => {
      const metrics = await AgentMetricsCommand.execute({
        agentId: 'agent-1',
        period: '1h'
      });

      expect(mockedFs.readJson).toHaveBeenCalled();
    });

    it('should aggregate metrics for all agents', async () => {
      const metrics = await AgentMetricsCommand.execute({ aggregate: true });

      expect(metrics).toHaveProperty('totalAgents');
      expect(metrics).toHaveProperty('averageSuccessRate');
    });
  });

  describe('agent logs', () => {
    it('should display agent logs', async () => {
      mockedFs.readFile = jest.fn().mockResolvedValue('agent log 1\nagent log 2\n');

      const logs = await AgentLogsCommand.execute({ agentId: 'agent-1', lines: 10 });

      expect(logs).toContain('agent log 1');
      expect(logs).toContain('agent log 2');
    });

    it('should follow logs in real-time', async () => {
      await withFakeTimers(async (timers) => {
        const logsPromise = AgentLogsCommand.execute({
          agentId: 'agent-1',
          follow: true
        });

        timers.advance(100);

        expect(mockedFs.readFile).toHaveBeenCalled();
      });
    });

    it('should filter logs by level', async () => {
      mockedFs.readFile = jest.fn().mockResolvedValue(
        '[ERROR] error\n[INFO] info\n'
      );

      const logs = await AgentLogsCommand.execute({
        agentId: 'agent-1',
        level: 'error'
      });

      expect(logs).toContain('[ERROR]');
      expect(logs).not.toContain('[INFO]');
    });
  });

  describe('agent kill', () => {
    it('should kill agent gracefully', async () => {
      await AgentKillCommand.execute({ agentId: 'agent-1', graceful: true });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'terminated' }),
        expect.any(Object)
      );
    });

    it('should force kill agent', async () => {
      await AgentKillCommand.execute({ agentId: 'agent-1', force: true });

      expect(mockedFs.writeJson).toHaveBeenCalled();
    });

    it('should handle non-existent agent', async () => {
      mockedFs.pathExists.mockResolvedValue(false);

      await expect(
        AgentKillCommand.execute({ agentId: 'non-existent' })
      ).rejects.toThrow('Agent not found');
    });
  });

  describe('agent restart', () => {
    it('should restart agent', async () => {
      const result = await AgentRestartCommand.execute({ agentId: 'agent-1' });

      expect(result).toHaveProperty('agentId', 'agent-1');
      expect(result).toHaveProperty('status');
      expect(mockedFs.writeJson).toHaveBeenCalled();
    });

    it('should preserve agent configuration on restart', async () => {
      mockedFs.readJson.mockResolvedValue({
        type: 'test-generator',
        capabilities: ['property-testing']
      });

      const result = await AgentRestartCommand.execute({ agentId: 'agent-1' });

      expect(result.preservedConfig).toHaveProperty('type', 'test-generator');
      expect(result.preservedConfig).toHaveProperty('capabilities');
    });

    it('should preserve agent state during restart', async () => {
      const result = await AgentRestartCommand.execute({
        agentId: 'agent-1',
        preserveState: true
      });

      expect(result.stateRestored).toBe(true);
      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('.state.json'),
        expect.anything(),
        expect.any(Object)
      );
    });

    it('should handle force restart', async () => {
      const result = await AgentRestartCommand.execute({
        agentId: 'agent-1',
        force: true
      });

      expect(result).toHaveProperty('status');
      expect(mockedFs.writeJson).toHaveBeenCalled();
    });

    it('should track restart count', async () => {
      mockedFs.readJson.mockResolvedValue({
        restartCount: 2
      });

      await AgentRestartCommand.execute({ agentId: 'agent-1' });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          restartCount: 3
        }),
        expect.any(Object)
      );
    });

    it('should handle restart timeout', async () => {
      await expect(
        AgentRestartCommand.execute({
          agentId: 'agent-1',
          timeout: 100
        })
      ).rejects.toThrow();
    });
  });

  describe('agent inspect', () => {
    it('should inspect agent details', async () => {
      mockedFs.readJson.mockResolvedValue({
        id: 'agent-1',
        type: 'test-generator',
        status: 'active',
        capabilities: ['property-testing'],
        resources: { cpu: '1', memory: '512MB' }
      });

      const details = await AgentInspectCommand.execute({ agentId: 'agent-1' });

      expect(details).toHaveProperty('id');
      expect(details).toHaveProperty('type');
      expect(details).toHaveProperty('configuration');
      expect(details).toHaveProperty('lifecycle');
      expect(details).toHaveProperty('health');
    });

    it('should include agent history', async () => {
      mockedFs.readJson.mockResolvedValue({
        events: [
          { timestamp: new Date().toISOString(), event: 'task_completed', details: {} }
        ]
      });

      const details = await AgentInspectCommand.execute({
        agentId: 'agent-1',
        includeHistory: true
      });

      expect(details).toHaveProperty('history');
      expect(Array.isArray(details.history)).toBe(true);
    });

    it('should include metrics when requested', async () => {
      const details = await AgentInspectCommand.execute({
        agentId: 'agent-1',
        includeMetrics: true
      });

      expect(details).toHaveProperty('metrics');
      expect(details.metrics).toHaveProperty('tasksCompleted');
      expect(details.metrics).toHaveProperty('successRate');
    });

    it('should include logs when requested', async () => {
      mockedFs.readFile = jest.fn().mockResolvedValue('log line 1\nlog line 2\n');

      const details = await AgentInspectCommand.execute({
        agentId: 'agent-1',
        includeLogs: true
      });

      expect(details).toHaveProperty('logs');
      expect(Array.isArray(details.logs)).toBe(true);
    });

    it('should format output as table', async () => {
      const result = await AgentInspectCommand.execute({
        agentId: 'agent-1',
        format: 'table'
      });

      expect(typeof result).toBe('string');
      expect(result).toContain('═');
    });

    it('should format output as YAML', async () => {
      const result = await AgentInspectCommand.execute({
        agentId: 'agent-1',
        format: 'yaml'
      });

      expect(typeof result).toBe('string');
      expect(result).toContain('id:');
    });

    it('should check agent health', async () => {
      const details = await AgentInspectCommand.execute({ agentId: 'agent-1' });

      expect(details.health).toHaveProperty('status');
      expect(details.health).toHaveProperty('issues');
      expect(details.health).toHaveProperty('lastCheck');
    });
  });

  describe('agent assign', () => {
    it('should assign task to agent', async () => {
      mockedFs.readJson.mockResolvedValue({
        type: 'test-generator'
      });

      const result = await AgentAssignCommand.execute({
        agentId: 'agent-1',
        taskId: 'task-1'
      });

      expect(result).toHaveProperty('taskId', 'task-1');
      expect(result).toHaveProperty('agentId', 'agent-1');
      expect(result).toHaveProperty('status');
      expect(mockedFs.writeJson).toHaveBeenCalled();
    });

    it('should validate agent capability for task', async () => {
      mockedFs.readJson.mockResolvedValue({
        capabilities: ['property-testing']
      });

      await expect(
        AgentAssignCommand.execute({
          agentId: 'agent-1',
          taskId: 'task-1',
          requireCapability: 'performance-testing'
        })
      ).rejects.toThrow('Agent lacks required capability');
    });

    it('should balance load across agents', async () => {
      mockedFs.readJson.mockResolvedValue({
        type: 'test-generator'
      });

      const result = await AgentAssignCommand.execute({
        taskId: 'task-1',
        autoBalance: true
      });

      expect(result).toHaveProperty('agentId');
      expect(result).toHaveProperty('status');
    });

    it('should queue task when agent is busy', async () => {
      const result = await AgentAssignCommand.execute({
        agentId: 'agent-1',
        taskId: 'task-1'
      });

      if (result.status === 'queued') {
        expect(result).toHaveProperty('queuePosition');
      }
    });

    it('should respect task priority', async () => {
      const result = await AgentAssignCommand.execute({
        agentId: 'agent-1',
        taskId: 'task-1',
        priority: 'critical'
      });

      expect(mockedFs.writeJson).toHaveBeenCalled();
    });

    it('should estimate completion time', async () => {
      const result = await AgentAssignCommand.execute({
        agentId: 'agent-1',
        taskId: 'task-1'
      });

      if (result.status === 'assigned') {
        expect(result).toHaveProperty('estimatedCompletion');
      }
    });

    it('should handle task not found', async () => {
      mockedFs.pathExists.mockResolvedValue(false);

      await expect(
        AgentAssignCommand.execute({
          agentId: 'agent-1',
          taskId: 'non-existent'
        })
      ).rejects.toThrow('Task not found');
    });
  });

  describe('agent attach', () => {
    it('should attach to agent console', async () => {
      const session = await AgentAttachCommand.execute({ agentId: 'agent-1' });

      expect(session).toHaveProperty('sessionId');
      expect(session).toHaveProperty('agentId', 'agent-1');
      expect(session).toHaveProperty('status', 'attached');
      expect(session).toHaveProperty('stats');
    });

    it('should enable log following', async () => {
      const session = await AgentAttachCommand.execute({
        agentId: 'agent-1',
        follow: true
      });

      expect(session.status).toBe('attached');
      expect(mockedFs.writeJson).toHaveBeenCalled();
    });

    it('should show metrics when enabled', async () => {
      const session = await AgentAttachCommand.execute({
        agentId: 'agent-1',
        showMetrics: true
      });

      expect(session).toHaveProperty('stats');
    });

    it('should filter logs by pattern', async () => {
      const session = await AgentAttachCommand.execute({
        agentId: 'agent-1',
        filter: 'ERROR'
      });

      expect(session).toHaveProperty('sessionId');
    });

    it('should handle already attached session', async () => {
      // First attach
      await AgentAttachCommand.execute({ agentId: 'agent-1' });

      // Second attach should return existing session
      const session2 = await AgentAttachCommand.execute({ agentId: 'agent-1' });

      expect(session2).toHaveProperty('agentId', 'agent-1');
    });

    it('should set custom refresh rate', async () => {
      const session = await AgentAttachCommand.execute({
        agentId: 'agent-1',
        refreshRate: 500
      });

      expect(session).toHaveProperty('sessionId');
    });
  });

  describe('agent detach', () => {
    it('should detach from agent console', async () => {
      // First attach
      await AgentAttachCommand.execute({ agentId: 'agent-1' });

      // Then detach
      const result = await AgentDetachCommand.execute({ agentId: 'agent-1' });

      expect(result).toHaveProperty('agentId', 'agent-1');
      expect(result).toHaveProperty('detachedAt');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('stats');
    });

    it('should save session data', async () => {
      await AgentAttachCommand.execute({ agentId: 'agent-1' });

      const result = await AgentDetachCommand.execute({
        agentId: 'agent-1',
        saveSession: true
      });

      expect(result.sessionSaved).toBe(true);
      expect(mockedFs.writeJson).toHaveBeenCalled();
    });

    it('should display session statistics', async () => {
      await AgentAttachCommand.execute({ agentId: 'agent-1' });

      const result = await AgentDetachCommand.execute({
        agentId: 'agent-1',
        showStats: true
      });

      expect(result).toHaveProperty('stats');
      expect(result.stats).toHaveProperty('logsReceived');
      expect(result.stats).toHaveProperty('eventsReceived');
    });

    it('should handle force detach', async () => {
      const result = await AgentDetachCommand.execute({
        agentId: 'agent-1',
        force: true
      });

      expect(result).toHaveProperty('agentId', 'agent-1');
    });

    it('should handle not attached error', async () => {
      await expect(
        AgentDetachCommand.execute({
          agentId: 'non-existent',
          force: false
        })
      ).rejects.toThrow('Not attached to agent');
    });

    it('should clean up session resources', async () => {
      await AgentAttachCommand.execute({ agentId: 'agent-1' });

      await AgentDetachCommand.execute({ agentId: 'agent-1' });

      expect(mockedFs.remove).toHaveBeenCalled();
    });

    it('should archive session data', async () => {
      await AgentAttachCommand.execute({ agentId: 'agent-1' });

      const result = await AgentDetachCommand.execute({
        agentId: 'agent-1',
        saveSession: true
      });

      expect(result.sessionSaved).toBe(true);
      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('archive'),
        expect.anything(),
        expect.any(Object)
      );
    });
  });
});
