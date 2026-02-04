/**
 * Agentic QE v3 - Memory MCP Handlers
 * Memory storage, retrieval, and query handlers
 *
 * ADR-058: Integrated with MemoryWriteGate for contradiction detection
 * and ComplianceReporter for violation tracking.
 */

import { getFleetState, isFleetInitialized } from './core-handlers';
import {
  ToolResult,
  MemoryStoreParams,
  MemoryStoreResult,
  MemoryRetrieveParams,
  MemoryRetrieveResult,
  MemoryQueryParams,
} from '../types';

// ADR-058: Governance integration for memory writes
import {
  memoryWriteGateIntegration,
  createMemoryPattern,
  isMemoryWriteGateEnabled,
  isStrictMode,
  complianceReporter,
  isComplianceReporterEnabled,
} from '../../governance/index.js';

// ============================================================================
// Memory Store Handler
// ============================================================================

export async function handleMemoryStore(
  params: MemoryStoreParams
): Promise<ToolResult<MemoryStoreResult>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { kernel } = getFleetState();

  try {
    const namespace = params.namespace || 'default';
    // Build namespaced key ourselves since get/delete interface doesn't support namespace
    const fullKey = `${namespace}:${params.key}`;

    // ADR-058: MemoryWriteGate check for contradiction detection
    if (isMemoryWriteGateEnabled()) {
      const memoryPattern = createMemoryPattern(
        params.key,
        params.value,
        namespace as any, // Map namespace to domain
        { tags: params.metadata?.tags as string[] }
      );

      const decision = await memoryWriteGateIntegration.evaluateWrite(memoryPattern);

      if (!decision.allowed) {
        // Record violation with ComplianceReporter
        if (isComplianceReporterEnabled()) {
          complianceReporter.recordViolation({
            type: 'contradiction',
            severity: 'medium',
            gate: 'memoryWriteGate',
            description: `Memory write blocked for key ${params.key}: ${decision.reason}`,
            context: {
              key: params.key,
              namespace,
              reason: decision.reason,
              conflictingPatterns: decision.conflictingPatterns,
            },
          });
        }

        // In strict mode, block the write
        if (isStrictMode()) {
          return {
            success: false,
            error: `Memory write blocked by governance: ${decision.reason}`,
          };
        }

        // In non-strict mode, warn but continue
        console.warn(`[MemoryHandler] Write allowed with warning: ${decision.reason}`);
      }
    }

    await kernel!.memory.set(fullKey, params.value, {
      ttl: params.ttl,
    });

    // ADR-058: Register pattern after successful write for future contradiction detection
    if (isMemoryWriteGateEnabled()) {
      memoryWriteGateIntegration.registerPattern(
        createMemoryPattern(params.key, params.value, namespace as any)
      );
    }

    return {
      success: true,
      data: {
        stored: true,
        key: params.key,
        namespace,
        timestamp: new Date().toISOString(),
        persisted: params.persist || false,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to store memory: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Memory Retrieve Handler
// ============================================================================

export async function handleMemoryRetrieve(
  params: MemoryRetrieveParams
): Promise<ToolResult<MemoryRetrieveResult>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { kernel } = getFleetState();

  try {
    const namespace = params.namespace || 'default';
    const fullKey = `${namespace}:${params.key}`;

    const value = await kernel!.memory.get(fullKey);

    if (value === undefined) {
      return {
        success: true,
        data: {
          found: false,
          key: params.key,
        },
      };
    }

    const result: MemoryRetrieveResult = {
      found: true,
      key: params.key,
      value,
      timestamp: new Date().toISOString(),
    };

    // Add metadata if requested
    if (params.includeMetadata) {
      // Would need to store metadata separately to retrieve it
      result.metadata = {};
    }

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to retrieve memory: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Memory Query Handler
// ============================================================================

interface MemoryQueryResult {
  entries: Array<{
    key: string;
    namespace: string;
    timestamp?: string;
  }>;
  total: number;
  hasMore: boolean;
}

export async function handleMemoryQuery(
  params: MemoryQueryParams
): Promise<ToolResult<MemoryQueryResult>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { kernel } = getFleetState();

  try {
    const namespace = params.namespace || 'default';
    const limit = params.limit || 100;
    const offset = params.offset || 0;

    // Query memory with pattern using search
    const pattern = params.pattern
      ? `${namespace}:${params.pattern}`
      : `${namespace}:*`;
    const keys = await kernel!.memory.search(pattern, limit + offset);

    // Apply pagination
    const paginatedKeys = keys.slice(offset, offset + limit);

    const entries = paginatedKeys.map((key: string) => {
      const parts = key.split(':');
      return {
        key: parts.slice(1).join(':'), // Remove namespace prefix
        namespace: parts[0],
      };
    });

    return {
      success: true,
      data: {
        entries,
        total: keys.length,
        hasMore: offset + limit < keys.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to query memory: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Memory Delete Handler
// ============================================================================

interface MemoryDeleteParams {
  key: string;
  namespace?: string;
}

interface MemoryDeleteResult {
  deleted: boolean;
  key: string;
  namespace: string;
}

export async function handleMemoryDelete(
  params: MemoryDeleteParams
): Promise<ToolResult<MemoryDeleteResult>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { kernel } = getFleetState();

  try {
    const namespace = params.namespace || 'default';
    const fullKey = `${namespace}:${params.key}`;

    const deleted = await kernel!.memory.delete(fullKey);

    return {
      success: true,
      data: {
        deleted,
        key: params.key,
        namespace,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to delete memory: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Memory Usage Handler
// ============================================================================

interface MemoryUsageResult {
  entries: number;
  vectors: number;
  namespaces: number;
  size: {
    current: number;
    limit: number;
    unit: string;
  };
}

export async function handleMemoryUsage(): Promise<ToolResult<MemoryUsageResult>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { kernel } = getFleetState();

  try {
    // Estimate stats by searching for all keys
    const allKeys = await kernel!.memory.search('*', 10000);

    return {
      success: true,
      data: {
        entries: allKeys.length,
        vectors: 0, // Would need specific tracking
        namespaces: 1, // Would need namespace tracking
        size: {
          current: allKeys.length,
          limit: Number.MAX_SAFE_INTEGER,
          unit: 'entries',
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get memory usage: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Memory Share Handler (Agent-to-Agent)
// ============================================================================

interface MemoryShareParams {
  sourceAgentId: string;
  targetAgentIds: string[];
  knowledgeDomain: string;
  knowledgeContent: Record<string, unknown>;
}

interface MemoryShareResult {
  shared: boolean;
  sourceAgent: string;
  targetAgents: string[];
  domain: string;
}

export async function handleMemoryShare(
  params: MemoryShareParams
): Promise<ToolResult<MemoryShareResult>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { kernel } = getFleetState();

  try {
    // Store shared knowledge for each target agent
    const sharedKey = `shared:${params.knowledgeDomain}:${Date.now()}`;
    const sharedContent = {
      source: params.sourceAgentId,
      targets: params.targetAgentIds,
      domain: params.knowledgeDomain,
      content: params.knowledgeContent,
      timestamp: new Date().toISOString(),
    };

    // ADR-058: MemoryWriteGate check for shared knowledge
    if (isMemoryWriteGateEnabled()) {
      const memoryPattern = createMemoryPattern(
        sharedKey,
        sharedContent,
        params.knowledgeDomain as any,
        { agentId: params.sourceAgentId }
      );

      const decision = await memoryWriteGateIntegration.evaluateWrite(memoryPattern);

      if (!decision.allowed) {
        // Record violation
        if (isComplianceReporterEnabled()) {
          complianceReporter.recordViolation({
            type: 'contradiction',
            severity: 'medium',
            agentId: params.sourceAgentId,
            gate: 'memoryWriteGate',
            description: `Shared knowledge blocked for domain ${params.knowledgeDomain}: ${decision.reason}`,
            context: {
              sourceAgent: params.sourceAgentId,
              targetAgents: params.targetAgentIds,
              domain: params.knowledgeDomain,
              reason: decision.reason,
            },
          });
        }

        if (isStrictMode()) {
          return {
            success: false,
            error: `Knowledge sharing blocked by governance: ${decision.reason}`,
          };
        }
      }
    }

    await kernel!.memory.set(sharedKey, sharedContent, {
      namespace: 'agent-knowledge',
    });

    // ADR-058: Register pattern after successful share
    if (isMemoryWriteGateEnabled()) {
      memoryWriteGateIntegration.registerPattern(
        createMemoryPattern(sharedKey, sharedContent, params.knowledgeDomain as any)
      );
    }

    return {
      success: true,
      data: {
        shared: true,
        sourceAgent: params.sourceAgentId,
        targetAgents: params.targetAgentIds,
        domain: params.knowledgeDomain,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to share memory: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
