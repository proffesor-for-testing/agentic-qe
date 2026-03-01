/**
 * Agentic QE v3 - Domain Team Manager Unit Tests
 * ADR-064 Phase 2A: Tests for domain-scoped agent team management
 *
 * Uses real AgentTeamsAdapter (not mocked) since DomainTeamManager
 * relies on its mailbox functionality for message delivery and
 * agent registration tracking.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DomainTeamManager,
  createDomainTeamManager,
  type DomainTeamManagerConfig,
} from '../../src/coordination/agent-teams/domain-team-manager.js';
import {
  AgentTeamsAdapter,
  createAgentTeamsAdapter,
} from '../../src/coordination/agent-teams/adapter.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeAdapter(): AgentTeamsAdapter {
  // Disable cleanup timer to avoid leaking timers in tests
  return createAgentTeamsAdapter({ cleanupIntervalMs: 0 });
}

function makeManager(
  adapter: AgentTeamsAdapter,
  config?: Partial<DomainTeamManagerConfig>
): DomainTeamManager {
  return createDomainTeamManager(adapter, config);
}

// ============================================================================
// Domain Team Manager Tests
// ============================================================================

describe('DomainTeamManager', () => {
  let adapter: AgentTeamsAdapter;
  let manager: DomainTeamManager;

  beforeEach(() => {
    adapter = makeAdapter();
    manager = makeManager(adapter);
  });

  afterEach(() => {
    manager.dispose();
    adapter.shutdown();
  });

  // --------------------------------------------------------------------------
  // Team Creation
  // --------------------------------------------------------------------------

  describe('createDomainTeam', () => {
    it('should create a domain team with lead and teammates', () => {
      const team = manager.createDomainTeam('security', 'lead-sec', ['tm-1', 'tm-2']);

      expect(team.domain).toBe('security');
      expect(team.leadAgentId).toBe('lead-sec');
      expect(team.teammateIds).toEqual(['tm-1', 'tm-2']);
      expect(team.taskCount).toBe(0);
      expect(team.completedCount).toBe(0);
      expect(team.createdAt).toBeGreaterThan(0);
    });

    it('should register all agents in the adapter on creation', () => {
      manager.createDomainTeam('testing', 'lead-t', ['tm-a', 'tm-b']);

      expect(adapter.isRegistered('lead-t')).toBe(true);
      expect(adapter.isRegistered('tm-a')).toBe(true);
      expect(adapter.isRegistered('tm-b')).toBe(true);
    });

    it('should prevent duplicate teams for the same domain', () => {
      manager.createDomainTeam('coverage', 'lead-cov', []);

      expect(() => {
        manager.createDomainTeam('coverage', 'lead-cov-2', []);
      }).toThrow(/already exists/);
    });

    it('should create a team with no initial teammates', () => {
      const team = manager.createDomainTeam('perf', 'lead-perf');

      expect(team.leadAgentId).toBe('lead-perf');
      expect(team.teammateIds).toEqual([]);
    });

    it('should enforce max active teams limit', () => {
      const mgr = makeManager(adapter, { maxActiveTeams: 2 });

      mgr.createDomainTeam('d1', 'lead-1', []);
      mgr.createDomainTeam('d2', 'lead-2', []);

      expect(() => {
        mgr.createDomainTeam('d3', 'lead-3', []);
      }).toThrow(/Maximum active teams/);

      mgr.dispose();
    });
  });

  // --------------------------------------------------------------------------
  // Team Removal
  // --------------------------------------------------------------------------

  describe('removeDomainTeam', () => {
    it('should remove a domain team and clean up agents', () => {
      manager.createDomainTeam('security', 'lead-sec', ['tm-1']);

      const removed = manager.removeDomainTeam('security');

      expect(removed).toBe(true);
      expect(manager.getDomainTeam('security')).toBeUndefined();
      expect(adapter.isRegistered('lead-sec')).toBe(false);
      expect(adapter.isRegistered('tm-1')).toBe(false);
    });

    it('should return false when removing a nonexistent team', () => {
      expect(manager.removeDomainTeam('ghost')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Team Queries
  // --------------------------------------------------------------------------

  describe('getDomainTeam', () => {
    it('should return undefined for an unknown domain', () => {
      expect(manager.getDomainTeam('nope')).toBeUndefined();
    });

    it('should return a snapshot of an existing team', () => {
      manager.createDomainTeam('qa', 'lead-qa', ['tm-qa']);

      const team = manager.getDomainTeam('qa');

      expect(team).toBeDefined();
      expect(team!.domain).toBe('qa');
      expect(team!.leadAgentId).toBe('lead-qa');
      expect(team!.teammateIds).toEqual(['tm-qa']);
    });
  });

  describe('listDomainTeams', () => {
    it('should list all active domain teams', () => {
      manager.createDomainTeam('d-alpha', 'lead-a', []);
      manager.createDomainTeam('d-beta', 'lead-b', ['tm-b1']);

      const teams = manager.listDomainTeams();

      expect(teams).toHaveLength(2);
      const domains = teams.map(t => t.domain).sort();
      expect(domains).toEqual(['d-alpha', 'd-beta']);
    });

    it('should return an empty list when no teams exist', () => {
      expect(manager.listDomainTeams()).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Task Assignment
  // --------------------------------------------------------------------------

  describe('assignTaskToTeam', () => {
    it('should send a task-assignment message to the team lead', () => {
      manager.createDomainTeam('testing', 'lead-t', ['tm-t']);

      const result = manager.assignTaskToTeam('testing', 'task-001', { file: 'foo.ts' });

      expect(result).toBe(true);

      // The lead should have a pending message
      const unread = adapter.getUnreadCount('lead-t');
      expect(unread).toBe(1);
    });

    it('should increment the task count on the team', () => {
      manager.createDomainTeam('testing', 'lead-t', []);
      manager.assignTaskToTeam('testing', 'task-1', {});
      manager.assignTaskToTeam('testing', 'task-2', {});

      const team = manager.getDomainTeam('testing');
      expect(team!.taskCount).toBe(2);
    });

    it('should return false for a nonexistent team', () => {
      expect(manager.assignTaskToTeam('ghost', 'task-x', {})).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Broadcasting
  // --------------------------------------------------------------------------

  describe('broadcastToDomain', () => {
    it('should broadcast a message to all team members', () => {
      manager.createDomainTeam('security', 'lead-s', ['tm-s1', 'tm-s2']);

      manager.broadcastToDomain('security', 'alert', { severity: 'high' });

      // All agents in the domain should get the broadcast
      // (the system sender '__system__' is not in the domain, so everyone gets it)
      expect(adapter.getUnreadCount('lead-s')).toBeGreaterThanOrEqual(1);
      expect(adapter.getUnreadCount('tm-s1')).toBeGreaterThanOrEqual(1);
      expect(adapter.getUnreadCount('tm-s2')).toBeGreaterThanOrEqual(1);
    });

    it('should throw when broadcasting to a nonexistent domain team', () => {
      expect(() => {
        manager.broadcastToDomain('nope', 'alert', {});
      }).toThrow(/No domain team found/);
    });
  });

  // --------------------------------------------------------------------------
  // Team Health
  // --------------------------------------------------------------------------

  describe('getTeamHealth', () => {
    it('should return health report with active, idle, and pending counts', () => {
      manager.createDomainTeam('testing', 'lead-t', ['tm-t1']);

      // All agents are idle initially (no pending messages)
      const health = manager.getTeamHealth('testing');

      expect(health).toBeDefined();
      expect(health!.domain).toBe('testing');
      expect(health!.teamSize).toBe(2); // lead + 1 teammate
      expect(health!.activeAgents).toBe(2);
      expect(health!.idleAgents).toBe(2);
      expect(health!.pendingMessages).toBe(0);
      expect(health!.tasksPending).toBe(0);
      expect(health!.tasksCompleted).toBe(0);
      expect(health!.healthy).toBe(true);
    });

    it('should reflect pending messages in the health report', () => {
      manager.createDomainTeam('testing', 'lead-t', []);

      // Assign a task so the lead has a pending message
      manager.assignTaskToTeam('testing', 'task-1', {});

      const health = manager.getTeamHealth('testing');

      expect(health!.pendingMessages).toBe(1);
      expect(health!.idleAgents).toBe(0);
      expect(health!.tasksPending).toBe(1);
    });

    it('should return undefined for an unknown domain', () => {
      expect(manager.getTeamHealth('unknown')).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Scaling
  // --------------------------------------------------------------------------

  describe('scaleTeam', () => {
    it('should scale up by adding new teammates', () => {
      manager.createDomainTeam('testing', 'lead-t', []);

      // Default team size is 3, so scale to 3 (lead + 2 teammates)
      const result = manager.scaleTeam('testing', 3);

      expect(result.previousSize).toBe(1);
      expect(result.newSize).toBe(3);
      expect(result.addedAgents).toHaveLength(2);
      expect(result.removedAgents).toHaveLength(0);

      // New agents should be registered
      for (const agentId of result.addedAgents) {
        expect(adapter.isRegistered(agentId)).toBe(true);
      }
    });

    it('should scale down by removing teammates (not the lead)', () => {
      manager.createDomainTeam('testing', 'lead-t', ['tm-1', 'tm-2']);

      const result = manager.scaleTeam('testing', 2);

      expect(result.previousSize).toBe(3);
      expect(result.newSize).toBe(2);
      expect(result.removedAgents).toHaveLength(1);
      // The lead should still be there
      const team = manager.getDomainTeam('testing');
      expect(team!.leadAgentId).toBe('lead-t');
    });

    it('should respect max team size when scaling up', () => {
      const mgr = makeManager(adapter, { defaultTeamSize: 3 });
      mgr.createDomainTeam('testing', 'lead-t', []);

      // Request more than max (3), should clamp
      const result = mgr.scaleTeam('testing', 10);

      expect(result.newSize).toBe(3);
      mgr.dispose();
    });

    it('should never scale below 1 (the lead)', () => {
      manager.createDomainTeam('testing', 'lead-t', ['tm-1']);

      const result = manager.scaleTeam('testing', 0);

      // Clamped to 1 (lead only)
      expect(result.newSize).toBe(1);
      const team = manager.getDomainTeam('testing');
      expect(team!.leadAgentId).toBe('lead-t');
      expect(team!.teammateIds).toHaveLength(0);
    });

    it('should throw when scaling a nonexistent team', () => {
      expect(() => {
        manager.scaleTeam('ghost', 5);
      }).toThrow(/No domain team found/);
    });
  });

  // --------------------------------------------------------------------------
  // Idle Teammates
  // --------------------------------------------------------------------------

  describe('getIdleTeammates', () => {
    it('should return idle teammates across all teams', () => {
      manager.createDomainTeam('d1', 'lead-1', ['tm-1a']);
      manager.createDomainTeam('d2', 'lead-2', ['tm-2a']);

      const idle = manager.getIdleTeammates();

      // All 4 agents should be idle (no messages pending)
      expect(idle).toHaveLength(4);
    });

    it('should return idle teammates for a specific domain', () => {
      manager.createDomainTeam('d1', 'lead-1', ['tm-1a']);
      manager.createDomainTeam('d2', 'lead-2', ['tm-2a']);

      const idle = manager.getIdleTeammates('d1');

      expect(idle).toHaveLength(2);
      expect(idle).toContain('lead-1');
      expect(idle).toContain('tm-1a');
    });

    it('should exclude agents with pending messages', () => {
      manager.createDomainTeam('testing', 'lead-t', ['tm-t1']);

      // Give the lead a pending message
      manager.assignTaskToTeam('testing', 'task-1', {});

      const idle = manager.getIdleTeammates('testing');

      // Only tm-t1 should be idle; lead-t has a pending message
      expect(idle).toContain('tm-t1');
      expect(idle).not.toContain('lead-t');
    });

    it('should return empty array for an unknown domain', () => {
      expect(manager.getIdleTeammates('nope')).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Rebalancing
  // --------------------------------------------------------------------------

  describe('rebalance', () => {
    it('should produce no moves when teams are at their target size', () => {
      // createDomainTeam caps teammates at maxSize, and target === max,
      // so all teams created through the API start at or below target.
      // Verify rebalance correctly returns zero moves when balanced.
      const freshAdapter = makeAdapter();
      const mgr = makeManager(freshAdapter, { defaultTeamSize: 3 });

      mgr.createDomainTeam('d1', 'lead-1', ['tm-1a', 'tm-1b']);
      mgr.createDomainTeam('d2', 'lead-2', ['tm-2a', 'tm-2b']);

      const result = mgr.rebalance();

      expect(result.moves).toEqual([]);
      expect(result.teamsAffected).toBe(0);

      mgr.dispose();
      freshAdapter.shutdown();
    });

    it('should not move agents when all teams are at target', () => {
      const freshAdapter = makeAdapter();
      const mgr = makeManager(freshAdapter, { defaultTeamSize: 2 });

      mgr.createDomainTeam('d1', 'lead-1', ['tm-1']);
      mgr.createDomainTeam('d2', 'lead-2', ['tm-2']);

      const result = mgr.rebalance();

      expect(result.moves).toHaveLength(0);
      expect(result.teamsAffected).toBe(0);

      mgr.dispose();
      freshAdapter.shutdown();
    });

    it('should return correct structure with moves and teamsAffected fields', () => {
      const freshAdapter = makeAdapter();
      const mgr = makeManager(freshAdapter, { defaultTeamSize: 3 });

      mgr.createDomainTeam('alpha', 'lead-a', ['tm-a']);
      mgr.createDomainTeam('beta', 'lead-b', ['tm-b']);

      const result = mgr.rebalance();

      expect(result).toHaveProperty('moves');
      expect(result).toHaveProperty('teamsAffected');
      expect(Array.isArray(result.moves)).toBe(true);
      expect(typeof result.teamsAffected).toBe('number');

      mgr.dispose();
      freshAdapter.shutdown();
    });
  });

  // --------------------------------------------------------------------------
  // Task Completion
  // --------------------------------------------------------------------------

  describe('markTaskCompleted', () => {
    it('should increment the completed counter', () => {
      manager.createDomainTeam('testing', 'lead-t', []);
      manager.assignTaskToTeam('testing', 'task-1', {});
      manager.assignTaskToTeam('testing', 'task-2', {});

      manager.markTaskCompleted('testing');

      const team = manager.getDomainTeam('testing');
      expect(team!.completedCount).toBe(1);
      expect(team!.taskCount).toBe(2);
    });

    it('should not exceed the task count', () => {
      manager.createDomainTeam('testing', 'lead-t', []);
      manager.assignTaskToTeam('testing', 'task-1', {});

      manager.markTaskCompleted('testing');
      manager.markTaskCompleted('testing'); // Should be capped

      const team = manager.getDomainTeam('testing');
      expect(team!.completedCount).toBe(1);
    });

    it('should return false for unknown domain', () => {
      expect(manager.markTaskCompleted('ghost')).toBe(false);
    });

    it('should return true for valid domain', () => {
      manager.createDomainTeam('testing', 'lead-t', []);
      manager.assignTaskToTeam('testing', 'task-1', {});

      expect(manager.markTaskCompleted('testing')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Dispose
  // --------------------------------------------------------------------------

  describe('dispose', () => {
    it('should clean up all teams and unregister all agents', () => {
      manager.createDomainTeam('d1', 'lead-1', ['tm-1']);
      manager.createDomainTeam('d2', 'lead-2', ['tm-2']);

      manager.dispose();

      expect(manager.listDomainTeams()).toEqual([]);
      expect(adapter.isRegistered('lead-1')).toBe(false);
      expect(adapter.isRegistered('tm-1')).toBe(false);
      expect(adapter.isRegistered('lead-2')).toBe(false);
      expect(adapter.isRegistered('tm-2')).toBe(false);
    });

    it('should be safe to call dispose multiple times', () => {
      manager.createDomainTeam('d1', 'lead-1', []);

      manager.dispose();
      manager.dispose(); // Should not throw

      expect(manager.listDomainTeams()).toEqual([]);
    });
  });
});
