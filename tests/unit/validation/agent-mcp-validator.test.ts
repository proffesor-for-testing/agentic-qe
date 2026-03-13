/**
 * Agent MCP Validator Tests
 * Issue #342, Item 1: Pre-Spawn MCP Validation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  scanMcpReferences,
  deduplicateByServer,
  getAvailableMcpServers,
  validateAgentMcpDeps,
  validateFleetMcpDeps,
} from '../../../src/validation/steps/agent-mcp-validator.js';

describe('Agent MCP Validator (Issue #342 Item 1)', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mcp-validator-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('scanMcpReferences', () => {
    it('should find MCP tool references in prose', () => {
      const content = 'Use mcp__claude-flow__agent_spawn to spawn agents.';
      const refs = scanMcpReferences(content, 'test-agent');

      expect(refs).toHaveLength(1);
      expect(refs[0].serverName).toBe('claude-flow');
      expect(refs[0].actionName).toBe('agent_spawn');
      expect(refs[0].toolName).toBe('mcp__claude-flow__agent_spawn');
      expect(refs[0].confidence).toBe(0.9);
      expect(refs[0].context).toBe('prose');
      expect(refs[0].lineNumber).toBe(1);
    });

    it('should assign lower confidence to code block references', () => {
      const content = [
        'Some prose text.',
        '```',
        'mcp__agentic-qe__memory_search',
        '```',
      ].join('\n');
      const refs = scanMcpReferences(content, 'test-agent');

      expect(refs).toHaveLength(1);
      expect(refs[0].confidence).toBe(0.5);
      expect(refs[0].context).toBe('code-block');
      expect(refs[0].serverName).toBe('agentic-qe');
    });

    it('should find multiple references on the same line', () => {
      const content = 'Use mcp__flow__task_create and mcp__flow__task_list together.';
      const refs = scanMcpReferences(content, 'test-agent');

      expect(refs).toHaveLength(2);
      expect(refs[0].actionName).toBe('task_create');
      expect(refs[1].actionName).toBe('task_list');
    });

    it('should find references across multiple lines', () => {
      const content = [
        'First: mcp__server1__action_a',
        'Second: mcp__server2__action_b',
        'Third: mcp__server1__action_c',
      ].join('\n');
      const refs = scanMcpReferences(content, 'test-agent');

      expect(refs).toHaveLength(3);
      expect(refs[0].lineNumber).toBe(1);
      expect(refs[1].lineNumber).toBe(2);
      expect(refs[2].lineNumber).toBe(3);
    });

    it('should return empty for content with no MCP references', () => {
      const content = 'This agent does simple text processing with no MCP tools.';
      const refs = scanMcpReferences(content, 'test-agent');
      expect(refs).toHaveLength(0);
    });

    it('should cap input at 100KB for ReDoS prevention', () => {
      // Create content larger than 100KB with reference near end
      const padding = 'x'.repeat(110 * 1024);
      const content = padding + '\nmcp__hidden__tool_name\n';
      const refs = scanMcpReferences(content, 'test-agent');
      // The reference is beyond the 100KB cap, so it should not be found
      expect(refs).toHaveLength(0);
    });

    it('should handle alternating code blocks correctly', () => {
      const content = [
        'Prose: mcp__s1__action_a',
        '```',
        'Code: mcp__s2__action_b',
        '```',
        'Prose again: mcp__s3__action_c',
      ].join('\n');
      const refs = scanMcpReferences(content, 'test-agent');

      expect(refs).toHaveLength(3);
      expect(refs[0].context).toBe('prose');
      expect(refs[0].confidence).toBe(0.9);
      expect(refs[1].context).toBe('code-block');
      expect(refs[1].confidence).toBe(0.5);
      expect(refs[2].context).toBe('prose');
      expect(refs[2].confidence).toBe(0.9);
    });
  });

  describe('deduplicateByServer', () => {
    it('should group references by server name', () => {
      const refs = scanMcpReferences(
        'mcp__flow__a mcp__flow__b mcp__other__c',
        'test-agent',
      );
      const byServer = deduplicateByServer(refs);

      expect(byServer.size).toBe(2);
      expect(byServer.get('flow')).toHaveLength(2);
      expect(byServer.get('other')).toHaveLength(1);
    });

    it('should handle empty input', () => {
      const byServer = deduplicateByServer([]);
      expect(byServer.size).toBe(0);
    });
  });

  describe('getAvailableMcpServers', () => {
    it('should read servers from .claude/mcp.json', () => {
      const projectDir = mkdtempSync(join(tmpdir(), 'mcp-project-'));
      const claudeDir = join(projectDir, '.claude');
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(
        join(claudeDir, 'mcp.json'),
        JSON.stringify({
          mcpServers: { 'claude-flow': {}, 'agentic-qe': {} },
        }),
      );

      const servers = getAvailableMcpServers(projectDir);
      expect(servers).toContain('claude-flow');
      expect(servers).toContain('agentic-qe');

      rmSync(projectDir, { recursive: true, force: true });
    });

    it('should return empty array for non-existent project', () => {
      const servers = getAvailableMcpServers('/nonexistent/path/xyz');
      expect(servers).toEqual([]);
    });

    it('should deduplicate servers across config files', () => {
      const projectDir = mkdtempSync(join(tmpdir(), 'mcp-dedup-'));
      const claudeDir = join(projectDir, '.claude');
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(
        join(claudeDir, 'mcp.json'),
        JSON.stringify({ mcpServers: { 'server-a': {} } }),
      );
      writeFileSync(
        join(projectDir, '.mcp.json'),
        JSON.stringify({ mcpServers: { 'server-a': {}, 'server-b': {} } }),
      );

      const servers = getAvailableMcpServers(projectDir);
      // server-a appears in both but should be deduplicated
      expect(servers.filter(s => s === 'server-a')).toHaveLength(1);
      expect(servers).toContain('server-b');

      rmSync(projectDir, { recursive: true, force: true });
    });
  });

  describe('validateAgentMcpDeps', () => {
    it('should validate agent with all servers available', () => {
      const agentPath = join(tempDir, 'good-agent.md');
      writeFileSync(agentPath, 'Use mcp__server1__tool_a for analysis.');

      const result = validateAgentMcpDeps(agentPath, 'good-agent', ['server1']);

      expect(result.allSatisfied).toBe(true);
      expect(result.missingServers).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.requiredServers).toContain('server1');
    });

    it('should produce advisory warnings for missing servers', () => {
      const agentPath = join(tempDir, 'needy-agent.md');
      writeFileSync(agentPath, 'Needs mcp__missing-server__tool_a for operation.');

      const result = validateAgentMcpDeps(agentPath, 'needy-agent', ['other-server']);

      expect(result.allSatisfied).toBe(false);
      expect(result.missingServers).toContain('missing-server');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('[advisory]');
      expect(result.warnings[0]).toContain('missing-server');
    });

    it('should handle non-existent agent file gracefully', () => {
      const result = validateAgentMcpDeps('/nonexistent.md', 'ghost', []);

      expect(result.allSatisfied).toBe(true);
      expect(result.warnings[0]).toContain('Agent file not found');
    });

    it('should never block -- always returns result', () => {
      const agentPath = join(tempDir, 'all-missing.md');
      writeFileSync(agentPath, [
        'mcp__server1__tool_a',
        'mcp__server2__tool_b',
        'mcp__server3__tool_c',
      ].join('\n'));

      const result = validateAgentMcpDeps(agentPath, 'all-missing', []);

      // Advisory only: result exists, not thrown
      expect(result.agentName).toBe('all-missing');
      expect(result.missingServers).toHaveLength(3);
      expect(result.warnings).toHaveLength(3);
      result.warnings.forEach(w => expect(w).toContain('[advisory]'));
    });
  });

  describe('validateFleetMcpDeps', () => {
    it('should scan all .md files in agents directory', () => {
      const agentsDir = join(tempDir, 'fleet-agents');
      mkdirSync(agentsDir, { recursive: true });
      writeFileSync(join(agentsDir, 'agent-a.md'), 'Uses mcp__flow__tool_a');
      writeFileSync(join(agentsDir, 'agent-b.md'), 'Uses mcp__flow__tool_b');
      writeFileSync(join(agentsDir, 'agent-c.md'), 'No MCP tools here');

      const projectDir = mkdtempSync(join(tmpdir(), 'fleet-project-'));
      const claudeDir = join(projectDir, '.claude');
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(
        join(claudeDir, 'mcp.json'),
        JSON.stringify({ mcpServers: { flow: {} } }),
      );

      const result = validateFleetMcpDeps(agentsDir, projectDir);

      expect(result.agents).toHaveLength(3);
      expect(result.totalServersReferenced).toBe(1);
      expect(result.globalMissingServers).toHaveLength(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      rmSync(projectDir, { recursive: true, force: true });
    });

    it('should handle non-existent agents directory', () => {
      const result = validateFleetMcpDeps('/nonexistent', tempDir);

      expect(result.agents).toHaveLength(0);
      expect(result.warnings[0]).toContain('Agents directory not found');
    });

    it('should aggregate missing servers across agents', () => {
      const agentsDir = join(tempDir, 'fleet-missing');
      mkdirSync(agentsDir, { recursive: true });
      writeFileSync(join(agentsDir, 'a.md'), 'mcp__server1__tool_a');
      writeFileSync(join(agentsDir, 'b.md'), 'mcp__server2__tool_b');

      const result = validateFleetMcpDeps(agentsDir, '/nonexistent');

      expect(result.globalMissingServers.sort()).toEqual(['server1', 'server2']);
      expect(result.agentsWithMissingDeps).toHaveLength(2);
    });
  });
});
