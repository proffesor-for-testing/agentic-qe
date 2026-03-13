/**
 * Agent Dependency Graph Tests
 * Issue #342, Item 2: Agent-to-Agent Dependency Declarations
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  parseDependenciesFromFrontmatter,
  buildDependencyGraph,
  createSpawnPlan,
  getAgentDependencies,
} from '../../../src/routing/agent-dependency-graph.js';

describe('Agent Dependency Graph (Issue #342 Item 2)', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'dep-graph-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('parseDependenciesFromFrontmatter', () => {
    it('should parse agent dependencies with all three types', () => {
      const content = [
        '---',
        'name: qe-impact-analyzer',
        'dependencies:',
        '  agents:',
        '    - name: qe-dependency-mapper',
        '      type: hard',
        '    - name: qe-kg-builder',
        '      type: soft',
        '    - name: qe-reviewer',
        '      type: peer',
        '---',
        '# Agent content',
      ].join('\n');

      const deps = parseDependenciesFromFrontmatter(content);

      expect(deps).not.toBeNull();
      expect(deps!.agents).toHaveLength(3);
      expect(deps!.agents![0]).toEqual({
        name: 'qe-dependency-mapper',
        type: 'hard',
        reason: '',
      });
      expect(deps!.agents![1].type).toBe('soft');
      expect(deps!.agents![2].type).toBe('peer');
    });

    it('should parse MCP server dependencies', () => {
      const content = [
        '---',
        'name: qe-queen-coordinator',
        'dependencies:',
        '  mcp_servers:',
        '    - name: agentic-qe',
        '      required: true',
        '    - name: claude-flow',
        '      required: false',
        '---',
      ].join('\n');

      const deps = parseDependenciesFromFrontmatter(content);

      expect(deps).not.toBeNull();
      expect(deps!.mcpServers).toHaveLength(2);
      expect(deps!.mcpServers![0]).toEqual({
        name: 'agentic-qe',
        required: true,
      });
      expect(deps!.mcpServers![1].required).toBe(false);
    });

    it('should parse model requirements', () => {
      const content = [
        '---',
        'name: qe-test-architect',
        'dependencies:',
        '  models:',
        '    minimum: tier-2',
        '---',
      ].join('\n');

      const deps = parseDependenciesFromFrontmatter(content);

      expect(deps).not.toBeNull();
      expect(deps!.models).toBeDefined();
      expect(deps!.models!.minimum).toBe('tier-2');
    });

    it('should return null for content without frontmatter', () => {
      const content = '# Just a plain markdown file\nNo frontmatter here.';
      expect(parseDependenciesFromFrontmatter(content)).toBeNull();
    });

    it('should return null for frontmatter without dependencies', () => {
      const content = [
        '---',
        'name: qe-simple-agent',
        'description: A simple agent',
        '---',
      ].join('\n');
      expect(parseDependenciesFromFrontmatter(content)).toBeNull();
    });

    it('should handle mixed agents, mcp_servers, and models', () => {
      const content = [
        '---',
        'name: qe-full-agent',
        'dependencies:',
        '  agents:',
        '    - name: qe-dependency-mapper',
        '      type: hard',
        '  mcp_servers:',
        '    - name: agentic-qe',
        '      required: true',
        '  models:',
        '    minimum: tier-2',
        '---',
      ].join('\n');

      const deps = parseDependenciesFromFrontmatter(content);

      expect(deps).not.toBeNull();
      expect(deps!.agents).toHaveLength(1);
      expect(deps!.mcpServers).toHaveLength(1);
      expect(deps!.models!.minimum).toBe('tier-2');
    });

    it('should handle quoted values in YAML', () => {
      const content = [
        '---',
        'name: qe-quoted',
        'dependencies:',
        '  agents:',
        '    - name: "qe-dependency-mapper"',
        "      type: 'hard'",
        '---',
      ].join('\n');

      const deps = parseDependenciesFromFrontmatter(content);
      expect(deps!.agents![0].name).toBe('qe-dependency-mapper');
      expect(deps!.agents![0].type).toBe('hard');
    });
  });

  describe('buildDependencyGraph', () => {
    it('should build graph from agent files', () => {
      const agentsDir = join(tempDir, 'graph-agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(join(agentsDir, 'qe-analyzer.md'), [
        '---',
        'name: qe-analyzer',
        'dependencies:',
        '  agents:',
        '    - name: qe-scanner',
        '      type: hard',
        '---',
      ].join('\n'));

      writeFileSync(join(agentsDir, 'qe-scanner.md'), [
        '---',
        'name: qe-scanner',
        '---',
      ].join('\n'));

      const graph = buildDependencyGraph(agentsDir);

      expect(graph.nodes.size).toBe(2);
      expect(graph.nodes.get('qe-analyzer')!.hardDeps).toContain('qe-scanner');
      expect(graph.cycles).toHaveLength(0);
      // qe-scanner should come before qe-analyzer in spawn order
      const scannerIdx = graph.spawnOrder.indexOf('qe-scanner');
      const analyzerIdx = graph.spawnOrder.indexOf('qe-analyzer');
      expect(scannerIdx).toBeLessThan(analyzerIdx);
    });

    it('should detect cycles in hard dependencies', () => {
      const agentsDir = join(tempDir, 'cycle-agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(join(agentsDir, 'qe-a.md'), [
        '---',
        'name: qe-a',
        'dependencies:',
        '  agents:',
        '    - name: qe-b',
        '      type: hard',
        '---',
      ].join('\n'));

      writeFileSync(join(agentsDir, 'qe-b.md'), [
        '---',
        'name: qe-b',
        'dependencies:',
        '  agents:',
        '    - name: qe-a',
        '      type: hard',
        '---',
      ].join('\n'));

      const graph = buildDependencyGraph(agentsDir);

      expect(graph.cycles.length).toBeGreaterThan(0);
      expect(graph.warnings.some(w => w.includes('cycle'))).toBe(true);
    });

    it('should warn about missing hard dependencies', () => {
      const agentsDir = join(tempDir, 'missing-deps');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(join(agentsDir, 'qe-lonely.md'), [
        '---',
        'name: qe-lonely',
        'dependencies:',
        '  agents:',
        '    - name: qe-nonexistent',
        '      type: hard',
        '---',
      ].join('\n'));

      const graph = buildDependencyGraph(agentsDir);

      expect(graph.warnings.some(w =>
        w.includes('qe-nonexistent') && w.includes('not in the agent directory'),
      )).toBe(true);
    });

    it('should handle non-existent agents directory', () => {
      const graph = buildDependencyGraph('/nonexistent/path');
      expect(graph.nodes.size).toBe(0);
      expect(graph.warnings).toHaveLength(1);
    });

    it('should only process qe-*.md files', () => {
      const agentsDir = join(tempDir, 'filter-agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(join(agentsDir, 'qe-valid.md'), '---\nname: qe-valid\n---\n');
      writeFileSync(join(agentsDir, 'v3-not-qe.md'), '---\nname: v3-not-qe\n---\n');
      writeFileSync(join(agentsDir, 'readme.md'), '# Not an agent');

      const graph = buildDependencyGraph(agentsDir);

      expect(graph.nodes.size).toBe(1);
      expect(graph.nodes.has('qe-valid')).toBe(true);
    });
  });

  describe('createSpawnPlan', () => {
    it('should create phased spawn plan respecting hard deps', () => {
      const agentsDir = join(tempDir, 'spawn-agents');
      mkdirSync(agentsDir, { recursive: true });

      // qe-base has no deps
      writeFileSync(join(agentsDir, 'qe-base.md'), '---\nname: qe-base\n---\n');
      // qe-mid depends on qe-base
      writeFileSync(join(agentsDir, 'qe-mid.md'), [
        '---', 'name: qe-mid', 'dependencies:', '  agents:',
        '    - name: qe-base', '      type: hard', '---',
      ].join('\n'));
      // qe-top depends on qe-mid
      writeFileSync(join(agentsDir, 'qe-top.md'), [
        '---', 'name: qe-top', 'dependencies:', '  agents:',
        '    - name: qe-mid', '      type: hard', '---',
      ].join('\n'));

      const graph = buildDependencyGraph(agentsDir);
      const plan = createSpawnPlan(['qe-base', 'qe-mid', 'qe-top'], graph);

      // Should produce 3 phases: base -> mid -> top
      expect(plan.phases.length).toBeGreaterThanOrEqual(3);
      expect(plan.phases[0]).toContain('qe-base');

      // Find the phase containing qe-mid
      const midPhaseIdx = plan.phases.findIndex(p => p.includes('qe-mid'));
      const topPhaseIdx = plan.phases.findIndex(p => p.includes('qe-top'));
      expect(midPhaseIdx).toBeLessThan(topPhaseIdx);
    });

    it('should allow parallel spawning of independent agents', () => {
      const agentsDir = join(tempDir, 'parallel-agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(join(agentsDir, 'qe-alpha.md'), '---\nname: qe-alpha\n---\n');
      writeFileSync(join(agentsDir, 'qe-beta.md'), '---\nname: qe-beta\n---\n');
      writeFileSync(join(agentsDir, 'qe-gamma.md'), '---\nname: qe-gamma\n---\n');

      const graph = buildDependencyGraph(agentsDir);
      const plan = createSpawnPlan(['qe-alpha', 'qe-beta', 'qe-gamma'], graph);

      // All three are independent, should be in the same phase
      expect(plan.phases).toHaveLength(1);
      expect(plan.phases[0]).toHaveLength(3);
    });

    it('should warn about unsatisfied hard deps when partial set requested', () => {
      const agentsDir = join(tempDir, 'partial-agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(join(agentsDir, 'qe-child.md'), [
        '---', 'name: qe-child', 'dependencies:', '  agents:',
        '    - name: qe-parent', '      type: hard', '---',
      ].join('\n'));
      writeFileSync(join(agentsDir, 'qe-parent.md'), '---\nname: qe-parent\n---\n');

      const graph = buildDependencyGraph(agentsDir);
      // Request only qe-child, not qe-parent
      const plan = createSpawnPlan(['qe-child'], graph);

      expect(plan.unsatisfiedHardDeps).toHaveLength(1);
      expect(plan.unsatisfiedHardDeps[0].agent).toBe('qe-child');
      expect(plan.unsatisfiedHardDeps[0].missing).toContain('qe-parent');
      expect(plan.warnings.some(w => w.includes('Advisory'))).toBe(true);
    });
  });

  describe('getAgentDependencies', () => {
    it('should resolve transitive hard dependencies', () => {
      const agentsDir = join(tempDir, 'transitive-agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(join(agentsDir, 'qe-root.md'), '---\nname: qe-root\n---\n');
      writeFileSync(join(agentsDir, 'qe-mid.md'), [
        '---', 'name: qe-mid', 'dependencies:', '  agents:',
        '    - name: qe-root', '      type: hard', '---',
      ].join('\n'));
      writeFileSync(join(agentsDir, 'qe-leaf.md'), [
        '---', 'name: qe-leaf', 'dependencies:', '  agents:',
        '    - name: qe-mid', '      type: hard', '---',
      ].join('\n'));

      const graph = buildDependencyGraph(agentsDir);
      const deps = getAgentDependencies('qe-leaf', graph);

      expect(deps.hardDeps).toContain('qe-mid');
      expect(deps.hardDeps).toContain('qe-root');
    });

    it('should separate hard, soft, and peer deps', () => {
      const agentsDir = join(tempDir, 'mixed-deps');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(join(agentsDir, 'qe-a.md'), '---\nname: qe-a\n---\n');
      writeFileSync(join(agentsDir, 'qe-b.md'), '---\nname: qe-b\n---\n');
      writeFileSync(join(agentsDir, 'qe-c.md'), '---\nname: qe-c\n---\n');
      writeFileSync(join(agentsDir, 'qe-main.md'), [
        '---', 'name: qe-main', 'dependencies:', '  agents:',
        '    - name: qe-a', '      type: hard',
        '    - name: qe-b', '      type: soft',
        '    - name: qe-c', '      type: peer', '---',
      ].join('\n'));

      const graph = buildDependencyGraph(agentsDir);
      const deps = getAgentDependencies('qe-main', graph);

      expect(deps.hardDeps).toContain('qe-a');
      expect(deps.softDeps).toContain('qe-b');
      expect(deps.peerDeps).toContain('qe-c');
    });

    it('should handle agent not in graph', () => {
      const agentsDir = join(tempDir, 'empty-graph');
      mkdirSync(agentsDir, { recursive: true });

      const graph = buildDependencyGraph(agentsDir);
      const deps = getAgentDependencies('qe-ghost', graph);

      expect(deps.hardDeps).toHaveLength(0);
      expect(deps.softDeps).toHaveLength(0);
      expect(deps.peerDeps).toHaveLength(0);
    });
  });

  describe('Real agent files integration', () => {
    it('should parse real qe-impact-analyzer dependencies', () => {
      const graph = buildDependencyGraph(join(process.cwd(), '.claude/agents/v3'));
      const node = graph.nodes.get('qe-impact-analyzer');

      expect(node).toBeDefined();
      expect(node!.hardDeps).toContain('qe-dependency-mapper');
    });

    it('should parse real qe-deployment-advisor dependencies', () => {
      const graph = buildDependencyGraph(join(process.cwd(), '.claude/agents/v3'));
      const node = graph.nodes.get('qe-deployment-advisor');

      expect(node).toBeDefined();
      expect(node!.hardDeps).toContain('qe-quality-gate');
      expect(node!.softDeps.length).toBeGreaterThan(0);
    });

    it('should build a valid graph from the full fleet', () => {
      const graph = buildDependencyGraph(join(process.cwd(), '.claude/agents/v3'));

      expect(graph.nodes.size).toBeGreaterThan(30);
      expect(graph.spawnOrder.length).toBe(graph.nodes.size);
      // No cycles in our real agents
      expect(graph.cycles).toHaveLength(0);
    });
  });
});
