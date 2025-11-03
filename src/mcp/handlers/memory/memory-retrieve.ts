/**
 * Memory Retrieve Handler
 *
 * Handles retrieval of QE data from memory with optional metadata inclusion.
 * Implements the memory_retrieve MCP tool for agent coordination.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { BaseHandler, HandlerResponse } from '../base-handler';
import { AgentRegistry } from '../../services/AgentRegistry';
import { HookExecutor } from '../../services/HookExecutor';

export interface MemoryRetrieveParams {
  key: string;
  namespace?: string;
  includeMetadata?: boolean;
  agentId?: string;
}

/**
 * Handles memory retrieval operations for QE agents
 */
export class MemoryRetrieveHandler extends BaseHandler {
  private memoryStore: Map<string, any>;

  constructor(
    private registry: AgentRegistry,
    private hookExecutor: HookExecutor,
    memoryStore: Map<string, any>
  ) {
    super();
    this.memoryStore = memoryStore;
  }

  /**
   * Handle memory retrieve request
   */
  async handle(args: MemoryRetrieveParams): Promise<HandlerResponse> {
    return this.safeHandle(async () => {
      const requestId = this.generateRequestId();

      // Validate required fields
      this.validateRequired(args, ['key']);

      const { key, namespace = 'default', includeMetadata = false, agentId } = args;

      // Create memory key with namespace
      const memoryKey = `${namespace}:${key}`;

      // Retrieve from memory
      const record = this.memoryStore.get(memoryKey);

      if (!record) {
        this.log('warn', `Memory not found: ${memoryKey}`);
        return this.createSuccessResponse({
          found: false,
          key: memoryKey,
          namespace,
          value: null
        }, requestId);
      }

      // Check if expired
      if (record.ttl > 0 && (Date.now() - record.timestamp) > (record.ttl * 1000)) {
        this.memoryStore.delete(memoryKey);
        this.log('info', `Memory expired on retrieval: ${memoryKey}`);
        return this.createSuccessResponse({
          found: false,
          key: memoryKey,
          namespace,
          value: null,
          expired: true
        }, requestId);
      }

      // Execute hook for memory access tracking
      if (agentId) {
        await this.hookExecutor.executePostEdit({
          file: `memory://${memoryKey}`,
          memoryKey: `qe/memory/${namespace}/${key}`,
          agentId
        });
      }

      this.log('info', `Memory retrieved: ${memoryKey}`, { includeMetadata });

      // Prepare response
      const response: any = {
        found: true,
        key: memoryKey,
        namespace,
        value: record.value
      };

      if (includeMetadata) {
        response.metadata = {
          timestamp: record.timestamp,
          ttl: record.ttl,
          persistent: record.persistent,
          ...record.metadata
        };
      }

      return this.createSuccessResponse(response, requestId);
    });
  }
}
