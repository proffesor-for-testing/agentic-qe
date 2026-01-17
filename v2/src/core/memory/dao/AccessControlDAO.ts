import { BaseDAO } from './BaseDAO';
import { ACL, AccessLevel, Permission } from '../AccessControl';

/**
 * AccessControlDAO - Data Access Object for access control lists (Table 2)
 *
 * Handles all database operations for the access_control table
 * Manages ACL permissions for memory entries
 */
export class AccessControlDAO extends BaseDAO {
  async createTable(): Promise<void> {
    await this.run(`
      CREATE TABLE IF NOT EXISTS access_control (
        resource_key TEXT NOT NULL,
        resource_partition TEXT NOT NULL DEFAULT 'default',
        agent_id TEXT NOT NULL,
        permission TEXT NOT NULL,
        granted_by TEXT,
        granted_at INTEGER NOT NULL,
        expires_at INTEGER,
        PRIMARY KEY (resource_key, resource_partition, agent_id, permission)
      )
    `);
  }

  async createIndexes(): Promise<void> {
    await this.run(`CREATE INDEX IF NOT EXISTS idx_acl_resource ON access_control(resource_key, resource_partition)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_acl_agent ON access_control(agent_id)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_acl_permission ON access_control(permission)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_acl_expires ON access_control(expires_at)`);
  }

  /**
   * Grant a permission to an agent for a resource
   */
  async grant(acl: {
    resourceKey: string;
    resourcePartition: string;
    agentId: string;
    permission: Permission;
    grantedBy?: string;
    ttl?: number;
  }): Promise<void> {
    const grantedAt = Date.now();
    const expiresAt = acl.ttl ? grantedAt + (acl.ttl * 1000) : null;

    await this.run(
      `INSERT OR REPLACE INTO access_control
       (resource_key, resource_partition, agent_id, permission, granted_by, granted_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        acl.resourceKey,
        acl.resourcePartition || 'default',
        acl.agentId,
        acl.permission,
        acl.grantedBy || 'system',
        grantedAt,
        expiresAt
      ]
    );
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
    await this.run(
      `DELETE FROM access_control
       WHERE resource_key = ? AND resource_partition = ? AND agent_id = ? AND permission = ?`,
      [resourceKey, resourcePartition, agentId, permission]
    );
  }

  /**
   * Check if an agent has a specific permission for a resource
   */
  async hasPermission(
    resourceKey: string,
    resourcePartition: string,
    agentId: string,
    permission: Permission
  ): Promise<boolean> {
    const now = Date.now();
    const row = await this.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM access_control
       WHERE resource_key = ? AND resource_partition = ? AND agent_id = ? AND permission = ?
       AND (expires_at IS NULL OR expires_at > ?)`,
      [resourceKey, resourcePartition, agentId, permission, now]
    );
    return (row?.count || 0) > 0;
  }

  /**
   * Get all permissions for a resource
   */
  async findByResource(
    resourceKey: string,
    resourcePartition: string
  ): Promise<ACL[]> {
    const now = Date.now();
    const rows = await this.queryAll<any>(
      `SELECT * FROM access_control
       WHERE resource_key = ? AND resource_partition = ?
       AND (expires_at IS NULL OR expires_at > ?)`,
      [resourceKey, resourcePartition, now]
    );
    return rows.map(row => this.mapToACL(row));
  }

  /**
   * Get all permissions for an agent
   */
  async findByAgent(agentId: string): Promise<ACL[]> {
    const now = Date.now();
    const rows = await this.queryAll<any>(
      `SELECT * FROM access_control
       WHERE agent_id = ?
       AND (expires_at IS NULL OR expires_at > ?)`,
      [agentId, now]
    );
    return rows.map(row => this.mapToACL(row));
  }

  /**
   * Delete all permissions for a resource
   */
  async deleteByResource(resourceKey: string, resourcePartition: string): Promise<void> {
    await this.run(
      `DELETE FROM access_control WHERE resource_key = ? AND resource_partition = ?`,
      [resourceKey, resourcePartition]
    );
  }

  /**
   * Delete all permissions for an agent
   */
  async deleteByAgent(agentId: string): Promise<void> {
    await this.run(`DELETE FROM access_control WHERE agent_id = ?`, [agentId]);
  }

  /**
   * Delete expired ACL entries
   */
  async deleteExpired(): Promise<void> {
    const now = Date.now();
    await this.run(
      `DELETE FROM access_control WHERE expires_at IS NOT NULL AND expires_at <= ?`,
      [now]
    );
  }

  /**
   * Count total ACL entries
   */
  async count(): Promise<number> {
    const result = await this.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM access_control`
    );
    return result?.count || 0;
  }

  /**
   * Get ACL statistics by permission type
   */
  async getPermissionCounts(): Promise<Record<string, number>> {
    const rows = await this.queryAll<{ permission: string; count: number }>(
      `SELECT permission, COUNT(*) as count FROM access_control GROUP BY permission`
    );

    const counts: Record<string, number> = {};
    rows.forEach(row => {
      counts[row.permission] = row.count;
    });
    return counts;
  }

  /**
   * Map database row to ACL object
   * Note: The ACL interface uses 'resourceId' but database uses 'resource_key'
   * This maps the database schema to the interface contract
   */
  private mapToACL(row: any): ACL {
    return {
      resourceId: row.resource_key, // Map resource_key to resourceId
      owner: row.agent_id, // Map agent_id to owner
      accessLevel: 'private' as any, // Default access level (not stored in ACL table)
      createdAt: new Date(row.granted_at),
      updatedAt: new Date(row.granted_at)
    };
  }
}
