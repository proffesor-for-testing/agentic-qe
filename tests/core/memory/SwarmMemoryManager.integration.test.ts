import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { AccessLevel, Permission, AccessControlError } from '@core/memory/AccessControl';
import * as path from 'path';
import * as fs from 'fs-extra';

describe('SwarmMemoryManager with Access Control (Integration)', () => {
  let manager: SwarmMemoryManager;
  const testDbPath = path.join(__dirname, '../../.tmp/test-memory-ac.db');

  beforeEach(async () => {
    // Clean up test database
    await fs.remove(testDbPath);
    manager = new SwarmMemoryManager(testDbPath);
    await manager.initialize();
  });

  afterEach(async () => {
    await manager.close();
    await fs.remove(testDbPath);
  });

  describe('Basic Access Control', () => {
    it('should store memory with owner and access level', async () => {
      await manager.store('test-key', { data: 'value' }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE,
        partition: 'test'
      });

      const result = await manager.retrieve('test-key', {
        partition: 'test',
        agentId: 'agent-1'
      });

      expect(result).toEqual({ data: 'value' });
    });

    it('should deny access to private memory by non-owner', async () => {
      await manager.store('private-key', { secret: 'data' }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE,
        partition: 'test'
      });

      await expect(
        manager.retrieve('private-key', {
          partition: 'test',
          agentId: 'agent-2'
        })
      ).rejects.toThrow(AccessControlError);
    });

    it('should allow team members to read team memory', async () => {
      await manager.store('team-key', { shared: 'data' }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.TEAM,
        teamId: 'team-alpha',
        partition: 'test'
      });

      const result = await manager.retrieve('team-key', {
        partition: 'test',
        agentId: 'agent-2',
        teamId: 'team-alpha'
      });

      expect(result).toEqual({ shared: 'data' });
    });

    it('should deny team members from different teams', async () => {
      await manager.store('team-key', { shared: 'data' }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.TEAM,
        teamId: 'team-alpha',
        partition: 'test'
      });

      await expect(
        manager.retrieve('team-key', {
          partition: 'test',
          agentId: 'agent-2',
          teamId: 'team-beta'
        })
      ).rejects.toThrow(AccessControlError);
    });

    it('should allow swarm members to read swarm memory', async () => {
      await manager.store('swarm-key', { coordination: 'data' }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.SWARM,
        swarmId: 'swarm-1',
        partition: 'test'
      });

      const result = await manager.retrieve('swarm-key', {
        partition: 'test',
        agentId: 'agent-3',
        swarmId: 'swarm-1'
      });

      expect(result).toEqual({ coordination: 'data' });
    });

    it('should allow anyone to read public memory', async () => {
      await manager.store('public-key', { public: 'data' }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.PUBLIC,
        partition: 'test'
      });

      const result = await manager.retrieve('public-key', {
        partition: 'test',
        agentId: 'any-agent'
      });

      expect(result).toEqual({ public: 'data' });
    });

    it('should allow system agents to read system memory', async () => {
      await manager.store('system-key', { system: 'data' }, {
        owner: 'system',
        accessLevel: AccessLevel.SYSTEM,
        partition: 'test'
      });

      const result = await manager.retrieve('system-key', {
        partition: 'test',
        agentId: 'system-agent',
        isSystemAgent: true
      });

      expect(result).toEqual({ system: 'data' });
    });
  });

  describe('Write Permissions', () => {
    it('should allow owner to update their memory', async () => {
      await manager.store('key-1', { version: 1 }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE,
        partition: 'test'
      });

      await manager.store('key-1', { version: 2 }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE,
        partition: 'test'
      });

      const result = await manager.retrieve('key-1', {
        partition: 'test',
        agentId: 'agent-1'
      });

      expect(result).toEqual({ version: 2 });
    });

    it('should deny non-owner updating private memory', async () => {
      await manager.store('key-1', { version: 1 }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE,
        partition: 'test'
      });

      await expect(
        manager.store('key-1', { version: 2 }, {
          owner: 'agent-2',
          accessLevel: AccessLevel.PRIVATE,
          partition: 'test'
        })
      ).rejects.toThrow(AccessControlError);
    });

    it('should allow team members to write to team memory', async () => {
      await manager.store('team-doc', { content: 'v1' }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.TEAM,
        teamId: 'team-alpha',
        partition: 'test'
      });

      await manager.store('team-doc', { content: 'v2' }, {
        owner: 'agent-2',
        accessLevel: AccessLevel.TEAM,
        teamId: 'team-alpha',
        partition: 'test'
      });

      const result = await manager.retrieve('team-doc', {
        partition: 'test',
        agentId: 'agent-1',
        teamId: 'team-alpha'
      });

      expect(result).toEqual({ content: 'v2' });
    });
  });

  describe('Delete Permissions', () => {
    it('should allow owner to delete their memory', async () => {
      await manager.store('deletable', { data: 'test' }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE,
        partition: 'test'
      });

      await manager.delete('deletable', 'test', {
        agentId: 'agent-1'
      });

      const result = await manager.retrieve('deletable', {
        partition: 'test'
      });

      expect(result).toBeNull();
    });

    it('should deny non-owner deleting memory', async () => {
      await manager.store('protected', { data: 'test' }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.TEAM,
        teamId: 'team-alpha',
        partition: 'test'
      });

      await expect(
        manager.delete('protected', 'test', {
          agentId: 'agent-2',
          teamId: 'team-alpha'
        })
      ).rejects.toThrow(AccessControlError);
    });

    it('should allow owner to delete their own private memory', async () => {
      await manager.store('own-key', { data: 'test' }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE,
        partition: 'test'
      });

      await manager.delete('own-key', 'test', {
        agentId: 'agent-1'
      });

      const result = await manager.retrieve('own-key', {
        partition: 'test'
      });

      expect(result).toBeNull();
    });
  });

  describe('Query with Access Control', () => {
    beforeEach(async () => {
      // Create test data with various access levels
      await manager.store('private-1', { type: 'private' }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE,
        partition: 'test'
      });

      await manager.store('team-1', { type: 'team' }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.TEAM,
        teamId: 'team-alpha',
        partition: 'test'
      });

      await manager.store('swarm-1', { type: 'swarm' }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.SWARM,
        swarmId: 'swarm-1',
        partition: 'test'
      });

      await manager.store('public-1', { type: 'public' }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.PUBLIC,
        partition: 'test'
      });
    });

    it('should return only accessible entries for agent', async () => {
      const results = await manager.query('%', {
        partition: 'test',
        agentId: 'agent-2',
        teamId: 'team-alpha'
      });

      // Agent-2 should see: team-1 (same team) and public-1
      expect(results).toHaveLength(2);
      expect(results.map(r => r.key).sort()).toEqual(['public-1', 'team-1']);
    });

    it('should return all entries for owner', async () => {
      const results = await manager.query('%', {
        partition: 'test',
        agentId: 'agent-1',
        teamId: 'team-alpha',
        swarmId: 'swarm-1'
      });

      // Owner should see all their entries
      expect(results).toHaveLength(4);
    });

    it('should return filtered results based on swarm membership', async () => {
      const results = await manager.query('%', {
        partition: 'test',
        agentId: 'agent-3',
        swarmId: 'swarm-1'
      });

      // Agent-3 should see: swarm-1 (same swarm) and public-1
      expect(results).toHaveLength(2);
      expect(results.map(r => r.key).sort()).toEqual(['public-1', 'swarm-1']);
    });
  });

  describe('ACL Management', () => {
    it('should store and retrieve ACL', async () => {
      const acl = manager.getAccessControl().createACL({
        resourceId: 'test:resource-1',
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE
      });

      await manager.storeACL(acl);

      const retrieved = await manager.getACL('test:resource-1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.owner).toBe('agent-1');
      expect(retrieved!.accessLevel).toBe(AccessLevel.PRIVATE);
    });

    it('should grant and check permissions', async () => {
      await manager.store('restricted', { data: 'sensitive' }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE,
        partition: 'test'
      });

      const resourceId = 'test:restricted';
      const acl = manager.getAccessControl().createACL({
        resourceId,
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE
      });
      await manager.storeACL(acl);

      // Grant read permission to agent-2
      await manager.grantPermission(resourceId, 'agent-2', [Permission.READ]);

      // Verify grant is stored
      const updatedACL = await manager.getACL(resourceId);
      expect(updatedACL!.grantedPermissions).toBeDefined();
      expect(updatedACL!.grantedPermissions!['agent-2']).toContain(Permission.READ);
    });

    it('should block and unblock agents', async () => {
      await manager.store('public-doc', { data: 'open' }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.PUBLIC,
        partition: 'test'
      });

      const resourceId = 'test:public-doc';
      const acl = manager.getAccessControl().createACL({
        resourceId,
        owner: 'agent-1',
        accessLevel: AccessLevel.PUBLIC
      });
      await manager.storeACL(acl);

      // Block agent-2
      await manager.blockAgent(resourceId, 'agent-2');

      const blockedACL = await manager.getACL(resourceId);
      expect(blockedACL!.blockedAgents).toContain('agent-2');

      // Unblock agent-2
      await manager.unblockAgent(resourceId, 'agent-2');

      const unblockedACL = await manager.getACL(resourceId);
      expect(unblockedACL!.blockedAgents || []).not.toContain('agent-2');
    });

    it('should update ACL access level', async () => {
      const resourceId = 'test:changeable';
      const acl = manager.getAccessControl().createACL({
        resourceId,
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE
      });
      await manager.storeACL(acl);

      // Change to team level
      await manager.updateACL(resourceId, {
        accessLevel: AccessLevel.TEAM,
        teamId: 'team-alpha'
      });

      const updated = await manager.getACL(resourceId);
      expect(updated!.accessLevel).toBe(AccessLevel.TEAM);
      expect(updated!.teamId).toBe('team-alpha');
    });

    it('should revoke specific permissions', async () => {
      const resourceId = 'test:revokable';
      const acl = manager.getAccessControl().createACL({
        resourceId,
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE
      });
      await manager.storeACL(acl);

      // Grant multiple permissions
      await manager.grantPermission(resourceId, 'agent-2', [Permission.READ, Permission.WRITE]);

      // Revoke write permission
      await manager.revokePermission(resourceId, 'agent-2', [Permission.WRITE]);

      const updated = await manager.getACL(resourceId);
      expect(updated!.grantedPermissions!['agent-2']).toContain(Permission.READ);
      expect(updated!.grantedPermissions!['agent-2']).not.toContain(Permission.WRITE);
    });
  });

  describe('Stats with Access Levels', () => {
    it('should report access level distribution', async () => {
      await manager.store('private-1', { data: 1 }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE,
        partition: 'test'
      });

      await manager.store('team-1', { data: 2 }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.TEAM,
        teamId: 'team-alpha',
        partition: 'test'
      });

      await manager.store('team-2', { data: 3 }, {
        owner: 'agent-2',
        accessLevel: AccessLevel.TEAM,
        teamId: 'team-alpha',
        partition: 'test'
      });

      await manager.store('public-1', { data: 4 }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.PUBLIC,
        partition: 'test'
      });

      const stats = await manager.stats();

      expect(stats.totalEntries).toBe(4);
      expect(stats.accessLevels[AccessLevel.PRIVATE]).toBe(1);
      expect(stats.accessLevels[AccessLevel.TEAM]).toBe(2);
      expect(stats.accessLevels[AccessLevel.PUBLIC]).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing access control parameters gracefully', async () => {
      // Store without owner (defaults to system)
      await manager.store('default-key', { data: 'test' });

      const result = await manager.retrieve('default-key');
      expect(result).toEqual({ data: 'test' });
    });

    it('should clean up ACL when deleting memory entry', async () => {
      await manager.store('temp-key', { data: 'temporary' }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE,
        partition: 'test'
      });

      const resourceId = 'test:temp-key';
      const acl = manager.getAccessControl().createACL({
        resourceId,
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE
      });
      await manager.storeACL(acl);

      // Delete entry with ACL
      await manager.delete('temp-key', 'test', { agentId: 'agent-1' });

      // ACL should be cleaned up
      const retrievedACL = await manager.getACL(resourceId);
      expect(retrievedACL).toBeNull();
    });

    it('should handle concurrent access with ACL caching', async () => {
      const resourceId = 'test:cached';
      const acl = manager.getAccessControl().createACL({
        resourceId,
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE
      });
      await manager.storeACL(acl);

      // First retrieval (cache miss)
      const acl1 = await manager.getACL(resourceId);

      // Second retrieval (cache hit)
      const acl2 = await manager.getACL(resourceId);

      expect(acl1).toBe(acl2); // Should be same cached instance
    });
  });
});
