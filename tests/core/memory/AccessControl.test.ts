import { AccessControl, AccessLevel, Permission, AccessControlError } from '@core/memory/AccessControl';

describe('AccessControl', () => {
  let accessControl: AccessControl;

  beforeEach(() => {
    accessControl = new AccessControl();
  });

  describe('Access Levels', () => {
    it('should have 5 access levels defined', () => {
      expect(AccessLevel.PRIVATE).toBe('private');
      expect(AccessLevel.TEAM).toBe('team');
      expect(AccessLevel.SWARM).toBe('swarm');
      expect(AccessLevel.PUBLIC).toBe('public');
      expect(AccessLevel.SYSTEM).toBe('system');
    });

    it('should rank access levels correctly', () => {
      expect(accessControl.rankAccessLevel(AccessLevel.PRIVATE)).toBe(1);
      expect(accessControl.rankAccessLevel(AccessLevel.TEAM)).toBe(2);
      expect(accessControl.rankAccessLevel(AccessLevel.SWARM)).toBe(3);
      expect(accessControl.rankAccessLevel(AccessLevel.PUBLIC)).toBe(4);
      expect(accessControl.rankAccessLevel(AccessLevel.SYSTEM)).toBe(5);
    });
  });

  describe('Permission Checks', () => {
    describe('READ permissions', () => {
      it('should allow owner to read private memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-1',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.PRIVATE,
          permission: Permission.READ,
          teamId: 'team-a',
          resourceTeamId: 'team-a'
        });

        expect(result.allowed).toBe(true);
      });

      it('should deny non-owner reading private memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-2',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.PRIVATE,
          permission: Permission.READ,
          teamId: 'team-a',
          resourceTeamId: 'team-a'
        });

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Private');
      });

      it('should allow team members to read team memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-2',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.TEAM,
          permission: Permission.READ,
          teamId: 'team-a',
          resourceTeamId: 'team-a'
        });

        expect(result.allowed).toBe(true);
      });

      it('should deny non-team members reading team memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-3',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.TEAM,
          permission: Permission.READ,
          teamId: 'team-b',
          resourceTeamId: 'team-a'
        });

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('team');
      });

      it('should allow any swarm member to read swarm memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-5',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.SWARM,
          permission: Permission.READ,
          teamId: 'team-b',
          resourceTeamId: 'team-a',
          swarmId: 'swarm-1',
          resourceSwarmId: 'swarm-1'
        });

        expect(result.allowed).toBe(true);
      });

      it('should deny non-swarm members reading swarm memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-5',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.SWARM,
          permission: Permission.READ,
          teamId: 'team-b',
          resourceTeamId: 'team-a',
          swarmId: 'swarm-2',
          resourceSwarmId: 'swarm-1'
        });

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('swarm');
      });

      it('should allow anyone to read public memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-any',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.PUBLIC,
          permission: Permission.READ
        });

        expect(result.allowed).toBe(true);
      });

      it('should allow system agents to read system memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'system-agent',
          resourceOwner: 'system',
          accessLevel: AccessLevel.SYSTEM,
          permission: Permission.READ,
          isSystemAgent: true
        });

        expect(result.allowed).toBe(true);
      });

      it('should deny non-system agents reading system memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-1',
          resourceOwner: 'system',
          accessLevel: AccessLevel.SYSTEM,
          permission: Permission.READ,
          isSystemAgent: false
        });

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('system');
      });
    });

    describe('WRITE permissions', () => {
      it('should allow owner to write to their private memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-1',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.PRIVATE,
          permission: Permission.WRITE,
          teamId: 'team-a',
          resourceTeamId: 'team-a'
        });

        expect(result.allowed).toBe(true);
      });

      it('should deny non-owner writing to private memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-2',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.PRIVATE,
          permission: Permission.WRITE,
          teamId: 'team-a',
          resourceTeamId: 'team-a'
        });

        expect(result.allowed).toBe(false);
      });

      it('should allow team members to write to team memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-2',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.TEAM,
          permission: Permission.WRITE,
          teamId: 'team-a',
          resourceTeamId: 'team-a'
        });

        expect(result.allowed).toBe(true);
      });

      it('should allow swarm members to write to swarm memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-3',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.SWARM,
          permission: Permission.WRITE,
          swarmId: 'swarm-1',
          resourceSwarmId: 'swarm-1'
        });

        expect(result.allowed).toBe(true);
      });

      it('should deny writing to public memory by non-owners', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-2',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.PUBLIC,
          permission: Permission.WRITE
        });

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('owner');
      });

      it('should allow owner to write to public memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-1',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.PUBLIC,
          permission: Permission.WRITE
        });

        expect(result.allowed).toBe(true);
      });

      it('should only allow system agents to write system memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'system-agent',
          resourceOwner: 'system',
          accessLevel: AccessLevel.SYSTEM,
          permission: Permission.WRITE,
          isSystemAgent: true
        });

        expect(result.allowed).toBe(true);
      });
    });

    describe('DELETE permissions', () => {
      it('should allow owner to delete their memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-1',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.PRIVATE,
          permission: Permission.DELETE
        });

        expect(result.allowed).toBe(true);
      });

      it('should deny non-owner deleting memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-2',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.TEAM,
          permission: Permission.DELETE,
          teamId: 'team-a',
          resourceTeamId: 'team-a'
        });

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('owner');
      });

      it('should allow owner to delete private memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-1',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.PRIVATE,
          permission: Permission.DELETE,
          isSystemAgent: false
        });

        expect(result.allowed).toBe(true);
      });
    });

    describe('SHARE permissions', () => {
      it('should allow owner to share their private memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-1',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.PRIVATE,
          permission: Permission.SHARE
        });

        expect(result.allowed).toBe(true);
      });

      it('should deny non-owner sharing private memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-2',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.PRIVATE,
          permission: Permission.SHARE
        });

        expect(result.allowed).toBe(false);
      });

      it('should allow team members to share team memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-2',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.TEAM,
          permission: Permission.SHARE,
          teamId: 'team-a',
          resourceTeamId: 'team-a'
        });

        expect(result.allowed).toBe(true);
      });

      it('should allow swarm members to share swarm memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-3',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.SWARM,
          permission: Permission.SHARE,
          swarmId: 'swarm-1',
          resourceSwarmId: 'swarm-1'
        });

        expect(result.allowed).toBe(true);
      });

      it('should allow anyone to share public memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-any',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.PUBLIC,
          permission: Permission.SHARE
        });

        expect(result.allowed).toBe(true);
      });

      it('should only allow system agents to share system memory', () => {
        const result = accessControl.checkPermission({
          agentId: 'agent-1',
          resourceOwner: 'system',
          accessLevel: AccessLevel.SYSTEM,
          permission: Permission.SHARE,
          isSystemAgent: false
        });

        expect(result.allowed).toBe(false);
      });
    });
  });

  describe('ACL Management', () => {
    it('should create ACL entry for a resource', () => {
      const acl = accessControl.createACL({
        resourceId: 'memory-1',
        owner: 'agent-1',
        accessLevel: AccessLevel.TEAM,
        teamId: 'team-a',
        swarmId: 'swarm-1'
      });

      expect(acl.resourceId).toBe('memory-1');
      expect(acl.owner).toBe('agent-1');
      expect(acl.accessLevel).toBe(AccessLevel.TEAM);
      expect(acl.teamId).toBe('team-a');
      expect(acl.swarmId).toBe('swarm-1');
      expect(acl.createdAt).toBeDefined();
      expect(acl.updatedAt).toBeDefined();
    });

    it('should update ACL access level', () => {
      const acl = accessControl.createACL({
        resourceId: 'memory-1',
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE
      });

      // Add small delay to ensure timestamp difference
      const updated = accessControl.updateACL(acl, {
        accessLevel: AccessLevel.PUBLIC
      });

      expect(updated.accessLevel).toBe(AccessLevel.PUBLIC);
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(acl.updatedAt.getTime());
    });

    it('should grant additional permissions to specific agent', () => {
      const acl = accessControl.createACL({
        resourceId: 'memory-1',
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE
      });

      const updated = accessControl.grantPermission(acl, 'agent-2', [Permission.READ]);

      expect(updated.grantedPermissions).toBeDefined();
      expect(updated.grantedPermissions!['agent-2']).toContain(Permission.READ);
    });

    it('should revoke permissions from specific agent', () => {
      const acl = accessControl.createACL({
        resourceId: 'memory-1',
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE
      });

      let updated = accessControl.grantPermission(acl, 'agent-2', [Permission.READ, Permission.WRITE]);
      updated = accessControl.revokePermission(updated, 'agent-2', [Permission.WRITE]);

      expect(updated.grantedPermissions!['agent-2']).toContain(Permission.READ);
      expect(updated.grantedPermissions!['agent-2']).not.toContain(Permission.WRITE);
    });

    it('should check granted permissions override default rules', () => {
      const acl = accessControl.createACL({
        resourceId: 'memory-1',
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE
      });

      const updatedACL = accessControl.grantPermission(acl, 'agent-2', [Permission.READ]);

      const result = accessControl.checkPermissionWithACL({
        agentId: 'agent-2',
        permission: Permission.READ,
        acl: updatedACL
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('granted');
    });

    it('should deny if specifically blocked', () => {
      const acl = accessControl.createACL({
        resourceId: 'memory-1',
        owner: 'agent-1',
        accessLevel: AccessLevel.PUBLIC
      });

      const blockedACL = accessControl.blockAgent(acl, 'agent-2');

      const result = accessControl.checkPermissionWithACL({
        agentId: 'agent-2',
        permission: Permission.READ,
        acl: blockedACL
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blocked');
    });

    it('should unblock agent', () => {
      const acl = accessControl.createACL({
        resourceId: 'memory-1',
        owner: 'agent-1',
        accessLevel: AccessLevel.PUBLIC
      });

      let blockedACL = accessControl.blockAgent(acl, 'agent-2');
      blockedACL = accessControl.unblockAgent(blockedACL, 'agent-2');

      const result = accessControl.checkPermissionWithACL({
        agentId: 'agent-2',
        permission: Permission.READ,
        acl: blockedACL
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('Validation', () => {
    it('should throw error for invalid access level', () => {
      expect(() => {
        accessControl.rankAccessLevel('invalid' as AccessLevel);
      }).toThrow(AccessControlError);
    });

    it('should validate permission check parameters', () => {
      expect(() => {
        accessControl.checkPermission({
          agentId: '',
          resourceOwner: 'agent-1',
          accessLevel: AccessLevel.PRIVATE,
          permission: Permission.READ
        });
      }).toThrow(AccessControlError);
    });

    it('should validate ACL creation parameters', () => {
      expect(() => {
        accessControl.createACL({
          resourceId: '',
          owner: 'agent-1',
          accessLevel: AccessLevel.PRIVATE
        });
      }).toThrow(AccessControlError);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing team ID for team-level access', () => {
      const result = accessControl.checkPermission({
        agentId: 'agent-1',
        resourceOwner: 'agent-2',
        accessLevel: AccessLevel.TEAM,
        permission: Permission.READ,
        // Missing teamId and resourceTeamId
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('team');
    });

    it('should handle missing swarm ID for swarm-level access', () => {
      const result = accessControl.checkPermission({
        agentId: 'agent-1',
        resourceOwner: 'agent-2',
        accessLevel: AccessLevel.SWARM,
        permission: Permission.READ,
        // Missing swarmId and resourceSwarmId
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('swarm');
    });

    it('should prioritize granted permissions over blocked status', () => {
      const acl = accessControl.createACL({
        resourceId: 'memory-1',
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE
      });

      let updated = accessControl.blockAgent(acl, 'agent-2');
      updated = accessControl.grantPermission(updated, 'agent-2', [Permission.READ]);

      const result = accessControl.checkPermissionWithACL({
        agentId: 'agent-2',
        permission: Permission.READ,
        acl: updated
      });

      // Granted permissions should override block
      expect(result.allowed).toBe(true);
    });

    it('should handle owner checking themselves', () => {
      const result = accessControl.checkPermission({
        agentId: 'agent-1',
        resourceOwner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE,
        permission: Permission.READ
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('Owner');
    });
  });
});
