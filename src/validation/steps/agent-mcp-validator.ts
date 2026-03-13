/**
 * Agent MCP Dependency Validator (Issue #342, Item 1)
 *
 * Scans agent .md definitions for mcp__* tool references and validates
 * them against currently available MCP servers.
 *
 * Inspired by Skillsmith's dependency intelligence:
 * - Regex scanner for mcp__server__tool references
 * - Context-aware confidence: prose refs = 0.9, code block refs = 0.5
 * - 100KB input cap for ReDoS prevention
 * - Advisory warnings only (never blocks spawn)
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Types
// ============================================================================

/** An MCP tool reference found in an agent definition */
export interface McpToolReference {
  /** Full tool name: mcp__server__tool */
  readonly toolName: string;
  /** MCP server name extracted from the reference */
  readonly serverName: string;
  /** Tool action name */
  readonly actionName: string;
  /** Confidence: 0.9 for prose, 0.5 for code blocks */
  readonly confidence: number;
  /** Whether found in a code block or prose */
  readonly context: 'prose' | 'code-block';
  /** Line number where found (1-based) */
  readonly lineNumber: number;
}

/** Result of validating a single agent's MCP dependencies */
export interface AgentMcpValidationResult {
  /** Agent name */
  readonly agentName: string;
  /** All MCP tool references found */
  readonly references: McpToolReference[];
  /** Unique MCP servers referenced */
  readonly requiredServers: string[];
  /** Servers that are currently available */
  readonly availableServers: string[];
  /** Servers that are missing (required but not available) */
  readonly missingServers: string[];
  /** Advisory warnings */
  readonly warnings: string[];
  /** Whether all dependencies are satisfied */
  readonly allSatisfied: boolean;
}

/** Result of validating all agents' MCP dependencies */
export interface FleetMcpValidationResult {
  /** Per-agent results */
  readonly agents: AgentMcpValidationResult[];
  /** Total unique MCP servers referenced across all agents */
  readonly totalServersReferenced: number;
  /** Servers missing across any agent */
  readonly globalMissingServers: string[];
  /** Agents with unsatisfied dependencies */
  readonly agentsWithMissingDeps: string[];
  /** Summary warnings */
  readonly warnings: string[];
  /** Scan duration in ms */
  readonly durationMs: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Max input size to scan (100KB, ReDoS prevention per Skillsmith) */
const MAX_SCAN_SIZE_BYTES = 100 * 1024;

/**
 * Regex to detect MCP tool references.
 * Matches: mcp__server-name__tool_action
 * Per Skillsmith pattern: mcp__([a-z][a-z0-9-]*)__([a-z][a-z0-9_]*)
 */
const MCP_TOOL_REGEX = /mcp__([a-z][a-z0-9-]*)__([a-z][a-z0-9_]*)/g;

/** Regex to detect fenced code block boundaries (``` ... ```) */
const CODE_BLOCK_REGEX = /^```/;

// ============================================================================
// Scanner
// ============================================================================

/**
 * Scan agent markdown content for MCP tool references.
 * Returns references with context-aware confidence scoring.
 *
 * @param content - Agent .md file content
 * @param _agentName - Agent name for reporting (reserved for future use)
 * @returns Array of MCP tool references found
 */
export function scanMcpReferences(content: string, _agentName: string): McpToolReference[] {
  // ReDoS prevention: cap input size
  const safeContent = content.length > MAX_SCAN_SIZE_BYTES
    ? content.slice(0, MAX_SCAN_SIZE_BYTES)
    : content;

  const references: McpToolReference[] = [];
  const lines = safeContent.split('\n');
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track code block boundaries
    if (CODE_BLOCK_REGEX.test(line.trim())) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    // Find all MCP references on this line
    let match: RegExpExecArray | null;
    const lineRegex = new RegExp(MCP_TOOL_REGEX.source, 'g');
    while ((match = lineRegex.exec(line)) !== null) {
      const serverName = match[1];
      const actionName = match[2];
      const toolName = match[0];
      const context: 'prose' | 'code-block' = inCodeBlock ? 'code-block' : 'prose';
      // Skillsmith confidence: prose = 0.9, code block = 0.5
      const confidence = context === 'prose' ? 0.9 : 0.5;

      references.push({
        toolName,
        serverName,
        actionName,
        confidence,
        context,
        lineNumber: i + 1,
      });
    }
  }

  return references;
}

/**
 * Deduplicate MCP references by server, keeping all refs grouped per server.
 */
export function deduplicateByServer(references: McpToolReference[]): Map<string, McpToolReference[]> {
  const byServer = new Map<string, McpToolReference[]>();
  for (const ref of references) {
    if (!byServer.has(ref.serverName)) {
      byServer.set(ref.serverName, []);
    }
    byServer.get(ref.serverName)!.push(ref);
  }
  return byServer;
}

/**
 * Get the list of currently available MCP servers.
 * Checks Claude Code's MCP configuration files.
 */
export function getAvailableMcpServers(projectRoot: string): string[] {
  const servers: string[] = [];

  // Check project-level and common MCP config paths
  const mcpConfigPaths = [
    join(projectRoot, '.claude', 'mcp.json'),
    join(projectRoot, '.mcp.json'),
  ];

  // Also check home directory for user-level config
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (homeDir) {
    mcpConfigPaths.push(join(homeDir, '.claude', 'mcp.json'));
  }

  for (const configPath of mcpConfigPaths) {
    if (!existsSync(configPath)) continue;

    try {
      const content = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);

      // MCP config format: { "mcpServers": { "server-name": { ... } } }
      if (config.mcpServers && typeof config.mcpServers === 'object') {
        servers.push(...Object.keys(config.mcpServers));
      }
    } catch {
      // Non-critical: skip malformed config
    }
  }

  return [...new Set(servers)];
}

/**
 * Validate a single agent's MCP dependencies.
 * ADVISORY ONLY -- returns warnings, never blocks.
 */
export function validateAgentMcpDeps(
  agentFilePath: string,
  agentName: string,
  availableServers: string[],
): AgentMcpValidationResult {
  if (!existsSync(agentFilePath)) {
    return {
      agentName,
      references: [],
      requiredServers: [],
      availableServers,
      missingServers: [],
      warnings: [`Agent file not found: ${agentFilePath}`],
      allSatisfied: true,
    };
  }

  let content: string;
  try {
    content = readFileSync(agentFilePath, 'utf-8');
  } catch {
    return {
      agentName,
      references: [],
      requiredServers: [],
      availableServers,
      missingServers: [],
      warnings: [`Failed to read agent file: ${agentFilePath}`],
      allSatisfied: true,
    };
  }

  // Scan for MCP references
  const references = scanMcpReferences(content, agentName);

  // Deduplicate by server
  const byServer = deduplicateByServer(references);
  const requiredServers = [...byServer.keys()];

  // Check which servers are available
  const availableSet = new Set(availableServers);
  const missingServers = requiredServers.filter(s => !availableSet.has(s));

  // Generate advisory warnings for missing servers
  const warnings: string[] = [];
  for (const missing of missingServers) {
    const refs = byServer.get(missing) || [];
    const maxConfidence = Math.max(...refs.map(r => r.confidence));
    const refCount = refs.length;
    const contexts = [...new Set(refs.map(r => r.context))].join(', ');

    warnings.push(
      `[advisory] Agent "${agentName}" references MCP server "${missing}" ` +
      `(${refCount} tool ref${refCount > 1 ? 's' : ''}, confidence: ${maxConfidence}, ` +
      `context: ${contexts}) but server is not configured. ` +
      `Agent may have reduced capabilities.`,
    );
  }

  return {
    agentName,
    references,
    requiredServers,
    availableServers,
    missingServers,
    warnings,
    allSatisfied: missingServers.length === 0,
  };
}

/**
 * Validate MCP dependencies across all agents in a directory.
 * Returns advisory warnings only -- never blocks installation or spawn.
 */
export function validateFleetMcpDeps(
  agentsDir: string,
  projectRoot: string,
): FleetMcpValidationResult {
  const startTime = Date.now();
  const agentResults: AgentMcpValidationResult[] = [];
  const allWarnings: string[] = [];

  // Get available MCP servers
  const availableServers = getAvailableMcpServers(projectRoot);

  if (!existsSync(agentsDir)) {
    return {
      agents: [],
      totalServersReferenced: 0,
      globalMissingServers: [],
      agentsWithMissingDeps: [],
      warnings: [`Agents directory not found: ${agentsDir}`],
      durationMs: Date.now() - startTime,
    };
  }

  // Scan all .md files in the agents directory
  try {
    const entries = readdirSync(agentsDir);
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;

      const agentName = entry.replace('.md', '');
      const agentPath = join(agentsDir, entry);
      const result = validateAgentMcpDeps(agentPath, agentName, availableServers);
      agentResults.push(result);
      allWarnings.push(...result.warnings);
    }

    // Also scan subagents directory
    const subagentsDir = join(agentsDir, 'subagents');
    if (existsSync(subagentsDir)) {
      const subentries = readdirSync(subagentsDir);
      for (const entry of subentries) {
        if (!entry.endsWith('.md')) continue;

        const agentName = entry.replace('.md', '');
        const agentPath = join(subagentsDir, entry);
        const result = validateAgentMcpDeps(agentPath, agentName, availableServers);
        agentResults.push(result);
        allWarnings.push(...result.warnings);
      }
    }
  } catch (err) {
    allWarnings.push(`Error scanning agents directory: ${(err as Error).message}`);
  }

  // Aggregate results
  const allServers = new Set<string>();
  const allMissing = new Set<string>();
  const agentsWithMissing: string[] = [];

  for (const result of agentResults) {
    for (const server of result.requiredServers) allServers.add(server);
    for (const missing of result.missingServers) allMissing.add(missing);
    if (result.missingServers.length > 0) agentsWithMissing.push(result.agentName);
  }

  return {
    agents: agentResults,
    totalServersReferenced: allServers.size,
    globalMissingServers: [...allMissing],
    agentsWithMissingDeps: agentsWithMissing,
    warnings: allWarnings,
    durationMs: Date.now() - startTime,
  };
}
