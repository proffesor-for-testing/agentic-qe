/**
 * Agent Dependency Graph (Issue #342, Item 2)
 *
 * Parses agent .md frontmatter for structured dependency declarations
 * and builds a dependency graph for spawn ordering and validation.
 *
 * Dependency types (from Skillsmith pattern):
 * - hard: Required. Warn if missing but don't block (advisory philosophy).
 * - soft: Nice-to-have. Advisory warning only.
 * - peer: Works alongside. Informational.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';

// ============================================================================
// Types
// ============================================================================

export type DependencyType = 'hard' | 'soft' | 'peer';

export interface AgentDependency {
  readonly name: string;
  readonly type: DependencyType;
  readonly reason: string;
}

export interface McpServerDependency {
  readonly name: string;
  readonly required: boolean;
}

export interface ModelRequirement {
  readonly minimum?: string;
  readonly capabilities?: string[];
}

export interface AgentDependencies {
  readonly agents?: AgentDependency[];
  readonly mcpServers?: McpServerDependency[];
  readonly models?: ModelRequirement;
}

export interface DependencyNode {
  readonly agentName: string;
  readonly hardDeps: string[];
  readonly softDeps: string[];
  readonly peerDeps: string[];
  readonly dependencies: AgentDependencies;
}

export interface DependencyGraphResult {
  readonly nodes: Map<string, DependencyNode>;
  readonly spawnOrder: string[];
  readonly cycles: string[][];
  readonly warnings: string[];
}

export interface SpawnPlan {
  readonly phases: string[][];
  readonly unsatisfiedHardDeps: Array<{ agent: string; missing: string[] }>;
  readonly warnings: string[];
}

// ============================================================================
// Frontmatter Parsing
// ============================================================================

/** Extract YAML frontmatter content between --- markers. */
function extractFrontmatter(content: string): string | null {
  const lines = content.split('\n');
  if (lines.length < 2 || lines[0].trim() !== '---') return null;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return lines.slice(1, i).join('\n');
  }
  return null;
}

/** Parse a simple YAML value, stripping surrounding quotes. */
function parseYamlValue(raw: string): string {
  const t = raw.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Parse structured dependency declarations from agent frontmatter.
 * Uses a state-machine: reads lines, tracks current section, builds objects.
 */
export function parseDependenciesFromFrontmatter(content: string): AgentDependencies | null {
  const frontmatter = extractFrontmatter(content);
  if (!frontmatter) return null;

  const lines = frontmatter.split('\n');
  let depsStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^dependencies:\s*$/.test(lines[i])) { depsStart = i + 1; break; }
  }
  if (depsStart === -1) return null;

  const depsLines: string[] = [];
  for (let i = depsStart; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    if (line.length > 0 && line[0] !== ' ' && line[0] !== '\t') break;
    depsLines.push(line);
  }
  if (depsLines.length === 0) return null;

  const result: { agents?: AgentDependency[]; mcpServers?: McpServerDependency[]; models?: ModelRequirement } = {};
  const st = { section: 'none' as 'none' | 'agents' | 'mcp_servers' | 'models', item: {} as Record<string, string>, inList: false };

  const flushAgent = () => {
    if (!st.item.name) return;
    if (!result.agents) result.agents = [];
    result.agents.push({ name: st.item.name, type: (st.item.type as DependencyType) || 'hard', reason: st.item.reason || '' });
    st.item = {};
  };
  const flushMcp = () => {
    if (!st.item.name) return;
    if (!result.mcpServers) result.mcpServers = [];
    result.mcpServers.push({ name: st.item.name, required: st.item.required === 'true' });
    st.item = {};
  };

  for (const line of depsLines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    const secMatch = trimmed.match(/^(agents|mcp_servers|models):\s*$/);
    if (secMatch) {
      if (st.section === 'agents' && st.inList) flushAgent();
      if (st.section === 'mcp_servers' && st.inList) flushMcp();
      st.inList = false;
      st.section = secMatch[1] as typeof st.section;
      continue;
    }

    if (st.section === 'agents' || st.section === 'mcp_servers') {
      const listStart = trimmed.match(/^-\s+(\w+):\s*(.*)$/);
      if (listStart) {
        if (st.inList) { st.section === 'agents' ? flushAgent() : flushMcp(); }
        st.inList = true;
        st.item = { [listStart[1]]: parseYamlValue(listStart[2]) };
        continue;
      }
      if (st.inList) {
        const kv = trimmed.match(/^(\w+):\s*(.*)$/);
        if (kv) { st.item[kv[1]] = parseYamlValue(kv[2]); continue; }
      }
    }

    if (st.section === 'models') {
      if (!result.models) result.models = {};
      const kv = trimmed.match(/^(\w+):\s*(.*)$/);
      if (kv) {
        const val = parseYamlValue(kv[2]);
        if (kv[1] === 'minimum') result.models = { ...result.models, minimum: val };
        else if (kv[1] === 'capabilities') {
          const arr = val.match(/^\[(.+)]$/);
          if (arr) result.models = { ...result.models, capabilities: arr[1].split(',').map(s => parseYamlValue(s.trim())) };
        }
      }
      const li = trimmed.match(/^-\s+(.+)$/);
      if (li && result.models) {
        const caps = result.models.capabilities || [];
        result.models = { ...result.models, capabilities: [...caps, parseYamlValue(li[1])] };
      }
    }
  }

  if (st.section === 'agents' && st.inList) flushAgent();
  if (st.section === 'mcp_servers' && st.inList) flushMcp();

  if (!result.agents && !result.mcpServers && !result.models) return null;
  return result as AgentDependencies;
}

// ============================================================================
// Graph Building
// ============================================================================

function extractAgentName(content: string): string | null {
  const fm = extractFrontmatter(content);
  if (!fm) return null;
  for (const line of fm.split('\n')) {
    const m = line.match(/^name:\s*(.+)$/);
    if (m) return parseYamlValue(m[1]);
  }
  return null;
}

/**
 * Build a dependency graph from all qe-*.md agent files in a directory.
 * Reads frontmatter, parses dependencies, detects cycles, computes topo sort.
 */
export function buildDependencyGraph(agentsDir: string): DependencyGraphResult {
  const nodes = new Map<string, DependencyNode>();
  const warnings: string[] = [];

  if (!existsSync(agentsDir)) {
    warnings.push(`Agents directory not found: ${agentsDir}`);
    return { nodes, spawnOrder: [], cycles: [], warnings };
  }

  const files = readdirSync(agentsDir).filter(f => f.startsWith('qe-') && f.endsWith('.md'));

  for (const file of files) {
    let content: string;
    try { content = readFileSync(join(agentsDir, file), 'utf-8'); }
    catch { warnings.push(`Failed to read agent file: ${file}`); continue; }

    const agentName = extractAgentName(content) || basename(file, '.md');
    const deps = parseDependenciesFromFrontmatter(content);
    const hardDeps: string[] = [], softDeps: string[] = [], peerDeps: string[] = [];

    if (deps?.agents) {
      for (const dep of deps.agents) {
        if (dep.type === 'hard') hardDeps.push(dep.name);
        else if (dep.type === 'soft') softDeps.push(dep.name);
        else if (dep.type === 'peer') peerDeps.push(dep.name);
      }
    }

    nodes.set(agentName, { agentName, hardDeps, softDeps, peerDeps, dependencies: deps || {} });
  }

  // Warn about missing hard deps
  const allNames = new Set(nodes.keys());
  for (const [name, node] of nodes) {
    for (const dep of node.hardDeps) {
      if (!allNames.has(dep)) {
        warnings.push(`Agent "${name}" declares hard dependency on "${dep}" which is not in the agent directory`);
      }
    }
  }

  const cycles = detectCycles(nodes);
  for (const cycle of cycles) warnings.push(`Dependency cycle detected: ${cycle.join(' -> ')}`);

  return { nodes, spawnOrder: topologicalSort(nodes, cycles), cycles, warnings };
}

/** Detect cycles in the hard-dependency graph using DFS. */
function detectCycles(nodes: Map<string, DependencyNode>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  function dfs(name: string): void {
    visited.add(name);
    stack.add(name);
    path.push(name);

    const node = nodes.get(name);
    if (node) {
      for (const dep of node.hardDeps) {
        if (!visited.has(dep) && nodes.has(dep)) dfs(dep);
        else if (stack.has(dep)) {
          const start = path.indexOf(dep);
          if (start !== -1) cycles.push([...path.slice(start), dep]);
        }
      }
    }

    path.pop();
    stack.delete(name);
  }

  for (const name of nodes.keys()) {
    if (!visited.has(name)) dfs(name);
  }
  return cycles;
}

/** Topological sort respecting hard deps. Cycle agents placed at end. */
function topologicalSort(nodes: Map<string, DependencyNode>, cycles: string[][]): string[] {
  const cycleAgents = new Set(cycles.flat());
  const sorted: string[] = [];
  const visited = new Set<string>();
  const temp = new Set<string>();

  function visit(name: string): void {
    if (visited.has(name) || cycleAgents.has(name) || temp.has(name)) return;
    temp.add(name);
    const node = nodes.get(name);
    if (node) { for (const dep of node.hardDeps) { if (nodes.has(dep)) visit(dep); } }
    temp.delete(name);
    visited.add(name);
    sorted.push(name);
  }

  for (const name of nodes.keys()) visit(name);
  for (const agent of cycleAgents) { if (!sorted.includes(agent)) sorted.push(agent); }
  return sorted;
}

// ============================================================================
// Spawn Planning
// ============================================================================

/**
 * Create a spawn plan for a set of agents, respecting dependencies.
 * Groups into ordered phases (parallel within each phase).
 * Advisory philosophy: unsatisfied hard deps warn but don't block.
 */
export function createSpawnPlan(agentNames: string[], graph: DependencyGraphResult): SpawnPlan {
  const requested = new Set(agentNames);
  const warnings: string[] = [];
  const unsatisfiedHardDeps: Array<{ agent: string; missing: string[] }> = [];

  for (const name of agentNames) {
    const node = graph.nodes.get(name);
    if (!node) continue;
    const missing = node.hardDeps.filter(d => !requested.has(d));
    if (missing.length > 0) {
      unsatisfiedHardDeps.push({ agent: name, missing });
      warnings.push(`Advisory: "${name}" has unsatisfied hard dependencies: ${missing.join(', ')}. Proceeding anyway.`);
    }
  }

  const phases: string[][] = [];
  const placed = new Set<string>();
  let remaining = new Set(agentNames);

  while (remaining.size > 0) {
    const phase: string[] = [];
    for (const name of remaining) {
      const node = graph.nodes.get(name);
      if (!node) { phase.push(name); continue; }
      const inScopeHard = node.hardDeps.filter(d => requested.has(d));
      if (inScopeHard.every(d => placed.has(d))) phase.push(name);
    }

    if (phase.length === 0) {
      warnings.push(`Could not resolve dependency ordering for: ${[...remaining].join(', ')}. Placing in final phase.`);
      phases.push([...remaining]);
      break;
    }

    phases.push(phase);
    for (const a of phase) { placed.add(a); remaining.delete(a); }
    remaining = new Set([...remaining]);
  }

  return { phases, unsatisfiedHardDeps, warnings };
}

// ============================================================================
// Transitive Dependency Resolution
// ============================================================================

/**
 * Get all transitive dependencies for a given agent.
 * Follows the graph recursively, collecting hard, soft, and peer deps.
 */
export function getAgentDependencies(
  agentName: string,
  graph: DependencyGraphResult,
): { hardDeps: string[]; softDeps: string[]; peerDeps: string[] } {
  const hard = new Set<string>();
  const soft = new Set<string>();
  const peer = new Set<string>();
  const visited = new Set<string>();

  function collect(name: string, transitive: boolean): void {
    if (visited.has(name)) return;
    visited.add(name);
    const node = graph.nodes.get(name);
    if (!node) return;

    for (const dep of node.hardDeps) {
      if (dep !== agentName) { hard.add(dep); collect(dep, true); }
    }
    for (const dep of node.softDeps) {
      if (dep !== agentName && !hard.has(dep)) {
        soft.add(dep);
        if (!transitive) collect(dep, true);
      }
    }
    for (const dep of node.peerDeps) {
      if (dep !== agentName && !hard.has(dep) && !soft.has(dep)) peer.add(dep);
    }
  }

  collect(agentName, false);
  return { hardDeps: [...hard], softDeps: [...soft], peerDeps: [...peer] };
}
