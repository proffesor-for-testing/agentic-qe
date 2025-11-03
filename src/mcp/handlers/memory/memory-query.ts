/**
 * Memory Query Handler
 *
 * Handles querying of memory system with pattern matching, time filtering, and pagination.
 * Implements the memory_query MCP tool for agent coordination.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { BaseHandler, HandlerResponse } from '../base-handler';
import { AgentRegistry } from '../../services/AgentRegistry';
import { HookExecutor } from '../../services/HookExecutor';

export interface MemoryQueryParams {
  namespace?: string;
  pattern?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
  includeExpired?: boolean;
}

/**
 * Handles memory query operations for QE agents
 */
export class MemoryQueryHandler extends BaseHandler {
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
   * Handle memory query request
   */
  async handle(args: MemoryQueryParams): Promise<HandlerResponse> {
    return this.safeHandle(async () => {
      const requestId = this.generateRequestId();

      const {
        namespace,
        pattern,
        startTime,
        endTime,
        limit = 100,
        offset = 0,
        includeExpired = false
      } = args;

      // Get all records
      let records = Array.from(this.memoryStore.entries()).map(([key, record]) => ({
        key,
        ...record
      }));

      // Filter by namespace
      if (namespace) {
        records = records.filter(r => r.namespace === namespace);
      }

      // Filter by pattern
      if (pattern) {
        // Security Fix (Alert #29): Use global replace to sanitize all occurrences of '*'
        // Previous: pattern.replace('*', '.*') - only replaced first occurrence
        // New: pattern.replace(/\*/g, '.*') - replaces all occurrences using global regex
        const sanitizedPattern = pattern.replace(/\*/g, '.*');
        const regex = new RegExp(sanitizedPattern);
        records = records.filter(r => regex.test(r.key));
      }

      // Filter by time range
      if (startTime) {
        records = records.filter(r => r.timestamp >= startTime);
      }
      if (endTime) {
        records = records.filter(r => r.timestamp <= endTime);
      }

      // Filter expired records
      if (!includeExpired) {
        const now = Date.now();
        records = records.filter(r => {
          if (r.ttl === 0) return true;
          return (now - r.timestamp) <= (r.ttl * 1000);
        });
      }

      // Sort by timestamp (newest first)
      records.sort((a, b) => b.timestamp - a.timestamp);

      // Apply pagination
      const total = records.length;
      records = records.slice(offset, offset + limit);

      this.log('info', `Memory query executed`, {
        namespace,
        pattern,
        total,
        returned: records.length
      });

      return this.createSuccessResponse({
        records: records.map(r => ({
          key: r.key,
          value: r.value,
          namespace: r.namespace,
          timestamp: r.timestamp,
          ttl: r.ttl,
          metadata: r.metadata
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      }, requestId);
    });
  }
}
