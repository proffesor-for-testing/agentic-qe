/**
 * Access Control System for Memory Management
 * Implements 5-level access control with permission validation
 * Based on AQE Improvement Plan Phase 1
 */

/**
 * Five access levels for memory entries
 */
export enum AccessLevel {
  PRIVATE = 'private',   // Only owner can access
  TEAM = 'team',         // Team members can access
  SWARM = 'swarm',       // All swarm members can access
  PUBLIC = 'public',     // Anyone can read
  SYSTEM = 'system'      // Only system agents can access
}

/**
 * Four permission types for memory operations
 */
export enum Permission {
  READ = 'read',
  WRITE = 'write',
  DELETE = 'delete',
  SHARE = 'share'
}

/**
 * Access Control List entry for a memory resource
 */
export interface ACL {
  resourceId: string;
  owner: string;
  accessLevel: AccessLevel;
  teamId?: string;
  swarmId?: string;
  grantedPermissions?: Record<string, Permission[]>;
  blockedAgents?: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Parameters for permission check
 */
export interface PermissionCheckParams {
  agentId: string;
  resourceOwner: string;
  accessLevel: AccessLevel;
  permission: Permission;
  teamId?: string;
  resourceTeamId?: string;
  swarmId?: string;
  resourceSwarmId?: string;
  isSystemAgent?: boolean;
}

/**
 * Parameters for ACL-based permission check
 */
export interface ACLPermissionCheckParams {
  agentId: string;
  permission: Permission;
  acl: ACL;
  teamId?: string;
  swarmId?: string;
  isSystemAgent?: boolean;
}

/**
 * Result of permission check
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason: string;
}

/**
 * Parameters for creating ACL
 */
export interface CreateACLParams {
  resourceId: string;
  owner: string;
  accessLevel: AccessLevel;
  teamId?: string;
  swarmId?: string;
}

/**
 * Parameters for updating ACL
 */
export interface UpdateACLParams {
  accessLevel?: AccessLevel;
  teamId?: string;
  swarmId?: string;
}

/**
 * Custom error for access control violations
 */
export class AccessControlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessControlError';
  }
}

/**
 * Access Control Manager
 * Handles permission validation and ACL management
 */
export class AccessControl {
  private readonly accessLevelRanks: Map<AccessLevel, number>;

  constructor() {
    this.accessLevelRanks = new Map([
      [AccessLevel.PRIVATE, 1],
      [AccessLevel.TEAM, 2],
      [AccessLevel.SWARM, 3],
      [AccessLevel.PUBLIC, 4],
      [AccessLevel.SYSTEM, 5]
    ]);
  }

  /**
   * Get numeric rank of access level (for comparison)
   */
  rankAccessLevel(level: AccessLevel): number {
    const rank = this.accessLevelRanks.get(level);
    if (rank === undefined) {
      throw new AccessControlError(`Invalid access level: ${level}`);
    }
    return rank;
  }

  /**
   * Check if agent has permission to perform operation
   */
  checkPermission(params: PermissionCheckParams): PermissionCheckResult {
    // Validate parameters
    if (!params.agentId) {
      throw new AccessControlError('Agent ID is required');
    }
    if (!params.resourceOwner) {
      throw new AccessControlError('Resource owner is required');
    }

    const {
      agentId,
      resourceOwner,
      accessLevel,
      permission,
      teamId,
      resourceTeamId,
      swarmId,
      resourceSwarmId,
      isSystemAgent = false
    } = params;

    // System agents have full access to system-level resources
    if (accessLevel === AccessLevel.SYSTEM) {
      if (isSystemAgent) {
        return { allowed: true, reason: 'System agent has full access' };
      }
      return { allowed: false, reason: 'Only system agents can access system-level resources' };
    }

    // Owner always has full access to their resources
    if (agentId === resourceOwner) {
      return { allowed: true, reason: 'Owner has full access to their resources' };
    }

    // Check access based on level and permission
    switch (accessLevel) {
      case AccessLevel.PRIVATE:
        return { allowed: false, reason: 'Private resources can only be accessed by owner' };

      case AccessLevel.TEAM:
        if (!teamId || !resourceTeamId) {
          return { allowed: false, reason: 'Team ID required for team-level access' };
        }
        if (teamId !== resourceTeamId) {
          return { allowed: false, reason: 'Agent not in resource team' };
        }
        // Team members can read, write, and share, but not delete
        if (permission === Permission.DELETE) {
          return { allowed: false, reason: 'Only owner can delete team resources' };
        }
        return { allowed: true, reason: 'Team member has access' };

      case AccessLevel.SWARM:
        if (!swarmId || !resourceSwarmId) {
          return { allowed: false, reason: 'Swarm ID required for swarm-level access' };
        }
        if (swarmId !== resourceSwarmId) {
          return { allowed: false, reason: 'Agent not in resource swarm' };
        }
        // Swarm members can read, write, and share, but not delete
        if (permission === Permission.DELETE) {
          return { allowed: false, reason: 'Only owner can delete swarm resources' };
        }
        return { allowed: true, reason: 'Swarm member has access' };

      case AccessLevel.PUBLIC:
        // Public resources: anyone can read and share
        if (permission === Permission.READ || permission === Permission.SHARE) {
          return { allowed: true, reason: 'Public resource allows read and share' };
        }
        // Only owner can write or delete
        return { allowed: false, reason: 'Only owner can write or delete public resources' };

      default:
        throw new AccessControlError(`Unknown access level: ${accessLevel}`);
    }
  }

  /**
   * Check permission using ACL (includes granted permissions and blocks)
   */
  checkPermissionWithACL(params: ACLPermissionCheckParams): PermissionCheckResult {
    const { agentId, permission, acl, teamId, swarmId, isSystemAgent } = params;

    if (!agentId) {
      throw new AccessControlError('Agent ID is required');
    }

    // Check if agent is blocked
    if (acl.blockedAgents?.includes(agentId)) {
      // Check if there are granted permissions that override the block
      const grantedPerms = acl.grantedPermissions?.[agentId];
      if (grantedPerms?.includes(permission)) {
        return { allowed: true, reason: 'Permission explicitly granted (overrides block)' };
      }
      return { allowed: false, reason: 'Agent is blocked from accessing this resource' };
    }

    // Check granted permissions first (highest priority)
    if (acl.grantedPermissions?.[agentId]?.includes(permission)) {
      return { allowed: true, reason: 'Permission explicitly granted' };
    }

    // Fall back to standard access level check
    return this.checkPermission({
      agentId,
      resourceOwner: acl.owner,
      accessLevel: acl.accessLevel,
      permission,
      teamId,
      resourceTeamId: acl.teamId,
      swarmId,
      resourceSwarmId: acl.swarmId,
      isSystemAgent
    });
  }

  /**
   * Create ACL for a resource
   */
  createACL(params: CreateACLParams): ACL {
    if (!params.resourceId) {
      throw new AccessControlError('Resource ID is required');
    }
    if (!params.owner) {
      throw new AccessControlError('Owner is required');
    }

    const now = new Date();
    return {
      resourceId: params.resourceId,
      owner: params.owner,
      accessLevel: params.accessLevel,
      teamId: params.teamId,
      swarmId: params.swarmId,
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Update ACL
   */
  updateACL(acl: ACL, updates: UpdateACLParams): ACL {
    return {
      ...acl,
      ...updates,
      updatedAt: new Date()
    };
  }

  /**
   * Grant specific permissions to an agent
   */
  grantPermission(acl: ACL, agentId: string, permissions: Permission[]): ACL {
    if (!agentId) {
      throw new AccessControlError('Agent ID is required');
    }

    const grantedPermissions = acl.grantedPermissions || {};
    const existingPerms = grantedPermissions[agentId] || [];
    const newPerms = Array.from(new Set([...existingPerms, ...permissions]));

    return {
      ...acl,
      grantedPermissions: {
        ...grantedPermissions,
        [agentId]: newPerms
      },
      updatedAt: new Date()
    };
  }

  /**
   * Revoke specific permissions from an agent
   */
  revokePermission(acl: ACL, agentId: string, permissions: Permission[]): ACL {
    if (!agentId) {
      throw new AccessControlError('Agent ID is required');
    }

    const grantedPermissions = acl.grantedPermissions || {};
    const existingPerms = grantedPermissions[agentId] || [];
    const newPerms = existingPerms.filter(p => !permissions.includes(p));

    const updated = {
      ...acl,
      grantedPermissions: {
        ...grantedPermissions
      },
      updatedAt: new Date()
    };

    if (newPerms.length > 0) {
      updated.grantedPermissions[agentId] = newPerms;
    } else {
      delete updated.grantedPermissions[agentId];
    }

    return updated;
  }

  /**
   * Block an agent from accessing resource
   */
  blockAgent(acl: ACL, agentId: string): ACL {
    if (!agentId) {
      throw new AccessControlError('Agent ID is required');
    }

    const blockedAgents = acl.blockedAgents || [];
    if (blockedAgents.includes(agentId)) {
      return acl; // Already blocked
    }

    return {
      ...acl,
      blockedAgents: [...blockedAgents, agentId],
      updatedAt: new Date()
    };
  }

  /**
   * Unblock an agent
   */
  unblockAgent(acl: ACL, agentId: string): ACL {
    if (!agentId) {
      throw new AccessControlError('Agent ID is required');
    }

    const blockedAgents = acl.blockedAgents || [];
    const newBlocked = blockedAgents.filter(id => id !== agentId);

    return {
      ...acl,
      blockedAgents: newBlocked.length > 0 ? newBlocked : undefined,
      updatedAt: new Date()
    };
  }
}
