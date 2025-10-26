/**
 * Memory Share Handler
 *
 * Handles sharing of memory between agents with access control.
 * Implements the memory_share MCP tool for agent coordination.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { BaseHandler, HandlerResponse } from '../base-handler';
import { AgentRegistry } from '../../services/AgentRegistry';
import { HookExecutor } from '../../services/HookExecutor';

export interface MemoryShareParams {
  sourceKey: string;
  sourceNamespace: string;
  targetAgents: string[];
  targetNamespace?: string;
  permissions?: string[];
  ttl?: number;
}

/**
 * Handles memory sharing operations between QE agents
 */
export class MemoryShareHandler extends BaseHandler {
  private memoryStore: Map<string, any>;
  private sharePermissions: Map<string, Set<string>>;

  constructor(
    private registry: AgentRegistry,
    private hookExecutor: HookExecutor,
    memoryStore: Map<string, any>
  ) {
    super();
    this.memoryStore = memoryStore;
    this.sharePermissions = new Map();
  }

  /**
   * Handle memory share request
   */
  async handle(args: MemoryShareParams): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      // Validate required fields
      this.validateRequired(args, ['sourceKey', 'sourceNamespace', 'targetAgents']);

      const {
        sourceKey,
        sourceNamespace,
        targetAgents,
        targetNamespace = 'shared',
        permissions = ['read'],
        ttl
      } = args;

      // Get source memory
      const sourceMemoryKey = `${sourceNamespace}:${sourceKey}`;
      const sourceRecord = this.memoryStore.get(sourceMemoryKey);

      if (!sourceRecord) {
        throw new Error(`Source memory not found: ${sourceMemoryKey}`);
      }

      // Share with target agents
      const sharedKeys: string[] = [];
      for (const targetAgent of targetAgents) {
        const targetKey = `${targetNamespace}:${targetAgent}:${sourceKey}`;

        // Create shared record
        const sharedRecord = {
          key: targetKey,
          value: sourceRecord.value,
          namespace: targetNamespace,
          timestamp: Date.now(),
          ttl: ttl || sourceRecord.ttl,
          metadata: {
            ...sourceRecord.metadata,
            sourceKey: sourceMemoryKey,
            sharedWith: targetAgent,
            sharedAt: Date.now()
          },
          persistent: false
        };

        this.memoryStore.set(targetKey, sharedRecord);
        sharedKeys.push(targetKey);

        // Set permissions
        const permSet = new Set(permissions);
        this.sharePermissions.set(targetKey, permSet);

        // Execute hook for sharing notification
        await this.hookExecutor.notify({
          message: `Memory shared: ${sourceKey} to ${targetAgent}`,
          level: 'info'
        });
      }

      this.log('info', `Memory shared from ${sourceMemoryKey}`, {
        targetAgents,
        permissions
      });

      return this.createSuccessResponse({
        shared: true,
        sourceKey: sourceMemoryKey,
        targetKeys: sharedKeys,
        targetAgents,
        permissions
      }, requestId);

    } catch (error) {
      this.log('error', 'Failed to share memory', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  /**
   * Check if agent has permission to access shared memory
   */
  hasPermission(memoryKey: string, permission: string): boolean {
    const perms = this.sharePermissions.get(memoryKey);
    return perms ? perms.has(permission) : false;
  }
}
