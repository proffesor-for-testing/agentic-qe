/**
 * Unit tests for ADR-064 Team MCP Handlers
 * Tests: team_list, team_health, team_message, team_broadcast, team_scale, team_rebalance
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We need to mock core-handlers before importing team-handlers
const mockFleetState = {
  queen: null as any,
};
let mockInitialized = false;

vi.mock('../../../../src/mcp/handlers/core-handlers', () => ({
  getFleetState: () => mockFleetState,
  isFleetInitialized: () => mockInitialized,
}));

vi.mock('../../../../src/shared/error-utils.js', () => ({
  toErrorMessage: (err: unknown) => err instanceof Error ? err.message : String(err),
}));

import {
  handleTeamList,
  handleTeamHealth,
  handleTeamMessage,
  handleTeamBroadcast,
  handleTeamScale,
  handleTeamRebalance,
} from '../../../../src/mcp/handlers/team-handlers';

// ============================================================================
// Mock DomainTeamManager & AgentTeamsAdapter
// ============================================================================

function createMockDomainTeamManager() {
  return {
    listDomainTeams: vi.fn(() => [
      {
        domain: 'test-generation',
        leadAgentId: 'lead-1',
        teammateIds: ['worker-1', 'worker-2'],
        createdAt: 1700000000000,
        taskCount: 5,
        completedCount: 3,
      },
      {
        domain: 'coverage-analysis',
        leadAgentId: 'lead-2',
        teammateIds: ['worker-3'],
        createdAt: 1700000001000,
        taskCount: 2,
        completedCount: 2,
      },
    ]),
    getDomainTeam: vi.fn((domain: string) => {
      if (domain === 'test-generation') {
        return {
          domain: 'test-generation',
          leadAgentId: 'lead-1',
          teammateIds: ['worker-1', 'worker-2'],
          createdAt: 1700000000000,
          taskCount: 5,
          completedCount: 3,
        };
      }
      return undefined;
    }),
    getTeamHealth: vi.fn((domain: string) => {
      if (domain === 'test-generation') {
        return {
          domain: 'test-generation',
          teamSize: 3,
          activeAgents: 3,
          idleAgents: 1,
          pendingMessages: 2,
          tasksPending: 2,
          tasksCompleted: 3,
          healthy: true,
        };
      }
      return undefined;
    }),
    broadcastToDomain: vi.fn(),
    scaleTeam: vi.fn((domain: string, targetSize: number) => ({
      domain,
      previousSize: 3,
      newSize: targetSize,
      addedAgents: targetSize > 3 ? ['new-agent-1'] : [],
      removedAgents: targetSize < 3 ? ['worker-2'] : [],
    })),
    rebalance: vi.fn(() => ({
      moves: [
        { agentId: 'worker-2', fromDomain: 'test-generation', toDomain: 'coverage-analysis' },
      ],
      teamsAffected: 2,
    })),
  };
}

function createMockAgentTeamsAdapter() {
  return {
    sendMessage: vi.fn((from: string, to: string, type: string, payload: unknown, options?: any) => ({
      id: 'msg-uuid-1234',
      from,
      to,
      domain: options?.domain ?? 'test-generation',
      type,
      payload,
      timestamp: 1700000000000,
    })),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Team MCP Handlers (ADR-064)', () => {
  let mockTeamManager: ReturnType<typeof createMockDomainTeamManager>;
  let mockAdapter: ReturnType<typeof createMockAgentTeamsAdapter>;

  beforeEach(() => {
    mockTeamManager = createMockDomainTeamManager();
    mockAdapter = createMockAgentTeamsAdapter();

    mockInitialized = true;
    mockFleetState.queen = {
      getDomainTeamManager: () => mockTeamManager,
      getAgentTeamsAdapter: () => mockAdapter,
    };
  });

  afterEach(() => {
    mockInitialized = false;
    mockFleetState.queen = null;
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Fleet not initialized guard
  // --------------------------------------------------------------------------

  describe('fleet not initialized', () => {
    beforeEach(() => {
      mockInitialized = false;
    });

    it('team_list returns error when fleet not initialized', async () => {
      const result = await handleTeamList({});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Fleet not initialized');
    });

    it('team_health returns error when fleet not initialized', async () => {
      const result = await handleTeamHealth({ domain: 'test-generation' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Fleet not initialized');
    });

    it('team_message returns error when fleet not initialized', async () => {
      const result = await handleTeamMessage({ from: 'a', to: 'b', type: 'finding', payload: {} });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Fleet not initialized');
    });

    it('team_broadcast returns error when fleet not initialized', async () => {
      const result = await handleTeamBroadcast({ domain: 'test-generation', type: 'alert', payload: {} });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Fleet not initialized');
    });

    it('team_scale returns error when fleet not initialized', async () => {
      const result = await handleTeamScale({ domain: 'test-generation', targetSize: 4 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Fleet not initialized');
    });

    it('team_rebalance returns error when fleet not initialized', async () => {
      const result = await handleTeamRebalance({} as any);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Fleet not initialized');
    });
  });

  // --------------------------------------------------------------------------
  // DomainTeamManager not available guard
  // --------------------------------------------------------------------------

  describe('teams not initialized', () => {
    beforeEach(() => {
      mockFleetState.queen = {
        getDomainTeamManager: () => null,
        getAgentTeamsAdapter: () => null,
      };
    });

    it('team_list returns error when team manager is null', async () => {
      const result = await handleTeamList({});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Agent Teams not initialized');
    });

    it('team_health returns error when team manager is null', async () => {
      const result = await handleTeamHealth({ domain: 'test-generation' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Agent Teams not initialized');
    });

    it('team_message returns error when adapter is null', async () => {
      const result = await handleTeamMessage({ from: 'a', to: 'b', type: 'finding', payload: {} });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Agent Teams not initialized');
    });
  });

  // --------------------------------------------------------------------------
  // team_list
  // --------------------------------------------------------------------------

  describe('handleTeamList', () => {
    it('lists all domain teams', async () => {
      const result = await handleTeamList({});
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0].domain).toBe('test-generation');
      expect(result.data![0].leadAgentId).toBe('lead-1');
      expect(result.data![0].teammateIds).toEqual(['worker-1', 'worker-2']);
      expect(result.data![0].teamSize).toBe(3);
      expect(result.data![0].taskCount).toBe(5);
      expect(result.data![0].completedCount).toBe(3);
      expect(result.data![0].createdAt).toBeTruthy();
    });

    it('filters by domain', async () => {
      const result = await handleTeamList({ domain: 'coverage-analysis' });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].domain).toBe('coverage-analysis');
    });

    it('returns empty array when domain filter matches nothing', async () => {
      const result = await handleTeamList({ domain: 'nonexistent' });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // team_health
  // --------------------------------------------------------------------------

  describe('handleTeamHealth', () => {
    it('returns health for existing domain', async () => {
      const result = await handleTeamHealth({ domain: 'test-generation' });
      expect(result.success).toBe(true);
      expect(result.data!.domain).toBe('test-generation');
      expect(result.data!.teamSize).toBe(3);
      expect(result.data!.activeAgents).toBe(3);
      expect(result.data!.healthy).toBe(true);
    });

    it('returns error for non-existent domain', async () => {
      const result = await handleTeamHealth({ domain: 'nonexistent' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('No team found');
    });
  });

  // --------------------------------------------------------------------------
  // team_message
  // --------------------------------------------------------------------------

  describe('handleTeamMessage', () => {
    it('sends a message between agents', async () => {
      const result = await handleTeamMessage({
        from: 'lead-1',
        to: 'worker-1',
        type: 'finding',
        payload: { severity: 'high', detail: 'test' },
      });
      expect(result.success).toBe(true);
      expect(result.data!.messageId).toBe('msg-uuid-1234');
      expect(result.data!.from).toBe('lead-1');
      expect(result.data!.to).toBe('worker-1');
      expect(result.data!.type).toBe('finding');
      expect(result.data!.timestamp).toBeTruthy();
      expect(mockAdapter.sendMessage).toHaveBeenCalledWith(
        'lead-1', 'worker-1', 'finding',
        { severity: 'high', detail: 'test' },
        undefined
      );
    });

    it('passes domain option when provided', async () => {
      await handleTeamMessage({
        from: 'lead-1',
        to: 'worker-1',
        type: 'alert',
        payload: {},
        domain: 'coverage-analysis',
      });
      expect(mockAdapter.sendMessage).toHaveBeenCalledWith(
        'lead-1', 'worker-1', 'alert', {},
        { domain: 'coverage-analysis' }
      );
    });

    it('returns error when adapter throws', async () => {
      mockAdapter.sendMessage.mockImplementation(() => {
        throw new Error("Unknown sender 'bad-agent'");
      });
      const result = await handleTeamMessage({
        from: 'bad-agent',
        to: 'worker-1',
        type: 'finding',
        payload: {},
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown sender');
    });
  });

  // --------------------------------------------------------------------------
  // team_broadcast
  // --------------------------------------------------------------------------

  describe('handleTeamBroadcast', () => {
    it('broadcasts to all agents in a domain', async () => {
      const result = await handleTeamBroadcast({
        domain: 'test-generation',
        type: 'alert',
        payload: { message: 'scale up' },
      });
      expect(result.success).toBe(true);
      expect(result.data!.domain).toBe('test-generation');
      expect(result.data!.type).toBe('alert');
      expect(result.data!.recipientCount).toBe(3);
      expect(result.data!.timestamp).toBeTruthy();
      expect(mockTeamManager.broadcastToDomain).toHaveBeenCalledWith(
        'test-generation', 'alert', { message: 'scale up' }
      );
    });

    it('returns error for non-existent domain', async () => {
      const result = await handleTeamBroadcast({
        domain: 'nonexistent',
        type: 'alert',
        payload: {},
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('No team found');
    });
  });

  // --------------------------------------------------------------------------
  // team_scale
  // --------------------------------------------------------------------------

  describe('handleTeamScale', () => {
    it('scales a team up', async () => {
      const result = await handleTeamScale({ domain: 'test-generation', targetSize: 4 });
      expect(result.success).toBe(true);
      expect(result.data!.domain).toBe('test-generation');
      expect(result.data!.previousSize).toBe(3);
      expect(result.data!.newSize).toBe(4);
      expect(result.data!.addedAgents).toHaveLength(1);
      expect(mockTeamManager.scaleTeam).toHaveBeenCalledWith('test-generation', 4);
    });

    it('scales a team down', async () => {
      const result = await handleTeamScale({ domain: 'test-generation', targetSize: 2 });
      expect(result.success).toBe(true);
      expect(result.data!.newSize).toBe(2);
      expect(result.data!.removedAgents).toHaveLength(1);
    });

    it('returns error for non-existent domain', async () => {
      mockTeamManager.scaleTeam.mockImplementation(() => {
        throw new Error("No domain team found for 'nonexistent'");
      });
      const result = await handleTeamScale({ domain: 'nonexistent', targetSize: 4 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('No domain team found');
    });
  });

  // --------------------------------------------------------------------------
  // team_rebalance
  // --------------------------------------------------------------------------

  describe('handleTeamRebalance', () => {
    it('rebalances agents across teams', async () => {
      const result = await handleTeamRebalance({} as any);
      expect(result.success).toBe(true);
      expect(result.data!.moves).toHaveLength(1);
      expect(result.data!.moves[0].agentId).toBe('worker-2');
      expect(result.data!.moves[0].fromDomain).toBe('test-generation');
      expect(result.data!.moves[0].toDomain).toBe('coverage-analysis');
      expect(result.data!.teamsAffected).toBe(2);
    });

    it('returns empty moves when teams are balanced', async () => {
      mockTeamManager.rebalance.mockReturnValue({ moves: [], teamsAffected: 0 });
      const result = await handleTeamRebalance({} as any);
      expect(result.success).toBe(true);
      expect(result.data!.moves).toHaveLength(0);
      expect(result.data!.teamsAffected).toBe(0);
    });
  });
});
