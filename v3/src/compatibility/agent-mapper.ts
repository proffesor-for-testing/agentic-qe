/**
 * Agent Mapper - Maps V2 agent names to V3 equivalents
 *
 * This module delegates to migration/agent-compat.ts as the single source of truth
 * for agent name mappings. It provides a class-based API for compatibility with
 * existing code that uses the AgentMapper class.
 *
 * @see migration/agent-compat.ts for the canonical mapping
 * @see ADR-048 for the V2-to-V3 migration strategy
 */

import { AgentMapping, AgentResolution } from './types';
import {
  v2AgentMappingWithDomain,
  v2AgentMapping,
  resolveAgentName,
  isDeprecatedAgent,
  getAgentDomain,
  getAllDomains,
  getV2Names,
  generateMigrationReport as generateReport,
  type MigrationReport,
} from '../migration/agent-compat';

/**
 * Convert internal mapping format to AgentMapping format for compatibility
 */
function toAgentMappings(): AgentMapping[] {
  return Object.entries(v2AgentMappingWithDomain).map(([v2Name, entry]) => ({
    v2Name,
    v3Name: entry.v3Name,
    domain: entry.domain,
    deprecated: true,
    notes: entry.notes,
  }));
}

/**
 * Agent Mapper class for V2 to V3 agent name resolution
 *
 * This class provides backward compatibility with code that expects the
 * AgentMapper class API. It delegates to migration/agent-compat.ts for
 * the actual mappings.
 */
export class AgentMapper {
  private mappings: Map<string, AgentMapping>;
  private v3ToV2: Map<string, string[]>;

  constructor() {
    this.mappings = new Map();
    this.v3ToV2 = new Map();

    // Build lookup maps from the canonical source
    for (const [v2Name, entry] of Object.entries(v2AgentMappingWithDomain)) {
      this.mappings.set(v2Name.toLowerCase(), {
        v2Name,
        v3Name: entry.v3Name,
        domain: entry.domain,
        deprecated: true,
        notes: entry.notes,
      });

      // Build reverse mapping (v3 -> v2[])
      const v3Key = entry.v3Name.toLowerCase();
      const existing = this.v3ToV2.get(v3Key) || [];
      existing.push(v2Name);
      this.v3ToV2.set(v3Key, existing);
    }
  }

  /**
   * Resolve an agent name (v2 or v3) to v3 format
   */
  resolve(agentName: string): AgentResolution {
    const normalized = agentName.toLowerCase().trim();

    // Check if it's already a known V3 agent
    if (this.v3ToV2.has(normalized)) {
      return {
        resolved: true,
        v3Agent: agentName,
        wasV2: false,
        domain: getAgentDomain(agentName),
      };
    }

    // Try to map from v2
    const mapping = this.mappings.get(normalized);
    if (mapping) {
      return {
        resolved: true,
        v3Agent: mapping.v3Name,
        wasV2: true,
        domain: mapping.domain,
        deprecationWarning: `Agent "${agentName}" is deprecated. Use "${mapping.v3Name}" instead.`,
      };
    }

    // Unknown agent
    return {
      resolved: false,
      v3Agent: null,
      wasV2: false,
      domain: null,
    };
  }

  /**
   * Get the v2 name(s) for a v3 agent (for documentation/migration)
   */
  getV2Name(v3Agent: string): string | null {
    const v2Names = getV2Names(v3Agent);
    return v2Names.length > 0 ? v2Names[0] : null;
  }

  /**
   * Get all v2 names for a v3 agent (some v3 agents have multiple v2 predecessors)
   */
  getV2Names(v3Agent: string): string[] {
    return getV2Names(v3Agent);
  }

  /**
   * Check if an agent name is a v2 format
   */
  isV2Agent(agentName: string): boolean {
    return isDeprecatedAgent(agentName);
  }

  /**
   * Get all agent mappings
   */
  getAllMappings(): AgentMapping[] {
    return toAgentMappings();
  }

  /**
   * Get mappings by domain
   */
  getMappingsByDomain(domain: string): AgentMapping[] {
    return toAgentMappings().filter((m) => m.domain === domain);
  }

  /**
   * Get all domains
   */
  getAllDomains(): string[] {
    return getAllDomains();
  }

  /**
   * Get domain for a v3 agent
   */
  getDomainForAgent(agentName: string): string | null {
    return getAgentDomain(agentName);
  }

  /**
   * Generate migration report
   */
  generateMigrationReport(usedAgents: string[]): {
    needsMigration: string[];
    alreadyV3: string[];
    unknown: string[];
  } {
    const report = generateReport(usedAgents);
    return {
      needsMigration: report.needsMigration.map(
        (m) => `${m.v2Name} → ${m.v3Name}`
      ),
      alreadyV3: report.alreadyV3,
      unknown: report.unknown,
    };
  }

  /**
   * Generate detailed migration report with domain info
   */
  generateDetailedMigrationReport(usedAgents: string[]): MigrationReport {
    return generateReport(usedAgents);
  }
}

// Re-export functions for direct use
export {
  resolveAgentName,
  isDeprecatedAgent,
  getAgentDomain,
  getAllDomains,
  getV2Names,
  v2AgentMapping,
  v2AgentMappingWithDomain,
};
