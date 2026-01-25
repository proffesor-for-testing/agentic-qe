import { AccessControlDAO } from '../dao/AccessControlDAO';
import { AccessLevel, Permission, AccessControlError } from '../AccessControl';

/**
 * Permission check request
 */
export interface PermissionCheckRequest {
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
 * Permission check result
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * AccessControlService - Business logic for access control and permissions
 *
 * Handles:
 * - Permission checking across private/team/swarm/public access levels
 * - ACL management (grant, revoke, check)
 * - System agent special permissions
 * - Team and swarm membership validation
 *
 * Implements the access control rules from the original SwarmMemoryManager
 */
export class AccessControlService {
  private accessControlDAO: AccessControlDAO;

  constructor(accessControlDAO: AccessControlDAO) {
    this.accessControlDAO = accessControlDAO;
  }

  /**
   * Check if an agent has permission to access a resource
   */
  checkPermission(request: PermissionCheckRequest): PermissionCheckResult {
    // System agents have full access
    if (request.isSystemAgent) {
      return { allowed: true, reason: 'System agent' };
    }

    // Owner always has full access
    if (request.agentId === request.resourceOwner) {
      return { allowed: true, reason: 'Resource owner' };
    }

    // Check access level rules
    switch (request.accessLevel) {
      case AccessLevel.PRIVATE:
        return this.checkPrivateAccess(request);

      case AccessLevel.TEAM:
        return this.checkTeamAccess(request);

      case AccessLevel.SWARM:
        return this.checkSwarmAccess(request);

      case AccessLevel.PUBLIC:
        return this.checkPublicAccess(request);

      default:
        return { allowed: false, reason: 'Unknown access level' };
    }
  }

  /**
   * Grant a permission to an agent for a resource
   */
  async grant(
    resourceKey: string,
    resourcePartition: string,
    agentId: string,
    permission: Permission,
    grantedBy: string,
    ttl?: number
  ): Promise<void> {
    await this.accessControlDAO.grant({
      resourceKey,
      resourcePartition,
      agentId,
      permission,
      grantedBy,
      ttl
    });
  }

  /**
   * Revoke a permission from an agent for a resource
   */
  async revoke(
    resourceKey: string,
    resourcePartition: string,
    agentId: string,
    permission: Permission
  ): Promise<void> {
    await this.accessControlDAO.revoke(
      resourceKey,
      resourcePartition,
      agentId,
      permission
    );
  }

  /**
   * Check if an agent has explicit ACL permission for a resource
   */
  async hasExplicitPermission(
    resourceKey: string,
    resourcePartition: string,
    agentId: string,
    permission: Permission
  ): Promise<boolean> {
    return this.accessControlDAO.hasPermission(
      resourceKey,
      resourcePartition,
      agentId,
      permission
    );
  }

  /**
   * Get all permissions for a resource
   */
  async getResourcePermissions(
    resourceKey: string,
    resourcePartition: string
  ) {
    return this.accessControlDAO.findByResource(resourceKey, resourcePartition);
  }

  /**
   * Get all permissions for an agent
   */
  async getAgentPermissions(agentId: string) {
    return this.accessControlDAO.findByAgent(agentId);
  }

  /**
   * Delete all permissions for a resource
   */
  async deleteResourcePermissions(
    resourceKey: string,
    resourcePartition: string
  ): Promise<void> {
    await this.accessControlDAO.deleteByResource(resourceKey, resourcePartition);
  }

  /**
   * Delete all permissions for an agent
   */
  async deleteAgentPermissions(agentId: string): Promise<void> {
    await this.accessControlDAO.deleteByAgent(agentId);
  }

  /**
   * Clean up expired ACL entries
   */
  async cleanupExpired(): Promise<void> {
    await this.accessControlDAO.deleteExpired();
  }

  /**
   * Get ACL statistics
   */
  async getStatistics() {
    const [totalCount, permissionCounts] = await Promise.all([
      this.accessControlDAO.count(),
      this.accessControlDAO.getPermissionCounts()
    ]);

    return {
      total: totalCount,
      byPermission: permissionCounts
    };
  }

  // ============================================================================
  // Private Access Level Checkers
  // ============================================================================

  /**
   * Check PRIVATE access level
   * Only owner can access
   */
  private checkPrivateAccess(request: PermissionCheckRequest): PermissionCheckResult {
    // Already checked owner above, so deny all others
    return {
      allowed: false,
      reason: 'Private access level - only owner allowed'
    };
  }

  /**
   * Check TEAM access level
   * Owner + same team members can access
   */
  private checkTeamAccess(request: PermissionCheckRequest): PermissionCheckResult {
    // Check if both are in the same team
    if (!request.teamId || !request.resourceTeamId) {
      return {
        allowed: false,
        reason: 'Team access level - team ID missing'
      };
    }

    if (request.teamId === request.resourceTeamId) {
      return { allowed: true, reason: 'Same team member' };
    }

    return {
      allowed: false,
      reason: 'Team access level - different teams'
    };
  }

  /**
   * Check SWARM access level
   * Owner + same swarm members can access
   */
  private checkSwarmAccess(request: PermissionCheckRequest): PermissionCheckResult {
    // Check if both are in the same swarm
    if (!request.swarmId || !request.resourceSwarmId) {
      return {
        allowed: false,
        reason: 'Swarm access level - swarm ID missing'
      };
    }

    if (request.swarmId === request.resourceSwarmId) {
      return { allowed: true, reason: 'Same swarm member' };
    }

    return {
      allowed: false,
      reason: 'Swarm access level - different swarms'
    };
  }

  /**
   * Check PUBLIC access level
   * Everyone has read access, only owner/team can write
   */
  private checkPublicAccess(request: PermissionCheckRequest): PermissionCheckResult {
    // Read is always allowed for public
    if (request.permission === Permission.READ) {
      return { allowed: true, reason: 'Public read access' };
    }

    // Write/Delete requires ownership or team membership
    if (request.permission === Permission.WRITE || request.permission === Permission.DELETE) {
      // Check team membership for write/delete
      if (request.teamId && request.resourceTeamId && request.teamId === request.resourceTeamId) {
        return { allowed: true, reason: 'Same team member with write access' };
      }

      return {
        allowed: false,
        reason: 'Public write/delete requires team membership'
      };
    }

    return { allowed: false, reason: 'Unknown permission type' };
  }

  /**
   * Validate permission grant request
   * Ensures grantor has authority to grant permissions
   */
  async validateGrant(
    resourceKey: string,
    resourcePartition: string,
    grantedBy: string,
    resourceOwner: string
  ): Promise<PermissionCheckResult> {
    // Only owner can grant permissions
    if (grantedBy === resourceOwner) {
      return { allowed: true, reason: 'Resource owner' };
    }

    // Check if grantor has explicit write permission (closest to admin)
    // Note: Permission.ADMIN doesn't exist in the Permission enum
    const hasAdminPerm = await this.accessControlDAO.hasPermission(
      resourceKey,
      resourcePartition,
      grantedBy,
      Permission.WRITE
    );

    if (hasAdminPerm) {
      return { allowed: true, reason: 'Explicit admin permission' };
    }

    return {
      allowed: false,
      reason: 'Only owner or admin can grant permissions'
    };
  }

  /**
   * Bulk grant permissions to multiple agents
   */
  async grantBulk(
    resourceKey: string,
    resourcePartition: string,
    agentIds: string[],
    permission: Permission,
    grantedBy: string,
    ttl?: number
  ): Promise<void> {
    const promises = agentIds.map(agentId =>
      this.accessControlDAO.grant({
        resourceKey,
        resourcePartition,
        agentId,
        permission,
        grantedBy,
        ttl
      })
    );

    await Promise.all(promises);
  }

  /**
   * Bulk revoke permissions from multiple agents
   */
  async revokeBulk(
    resourceKey: string,
    resourcePartition: string,
    agentIds: string[],
    permission: Permission
  ): Promise<void> {
    const promises = agentIds.map(agentId =>
      this.accessControlDAO.revoke(
        resourceKey,
        resourcePartition,
        agentId,
        permission
      )
    );

    await Promise.all(promises);
  }

  /**
   * Check if agent has any permission for a resource
   */
  async hasAnyPermission(
    resourceKey: string,
    resourcePartition: string,
    agentId: string
  ): Promise<boolean> {
    const permissions = await this.accessControlDAO.findByResource(
      resourceKey,
      resourcePartition
    );

    return permissions.some(acl => acl.owner === agentId);
  }

  /**
   * Get all agents with a specific permission for a resource
   */
  async getAgentsWithPermission(
    resourceKey: string,
    resourcePartition: string,
    permission: Permission
  ): Promise<string[]> {
    const permissions = await this.accessControlDAO.findByResource(
      resourceKey,
      resourcePartition
    );

    return permissions
      .filter(acl => acl.grantedPermissions?.[permission])
      .map(acl => acl.owner);
  }
}
