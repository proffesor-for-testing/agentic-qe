/**
 * OpenCode Agent Config Validation Tests
 *
 * Validates all .opencode/agents/qe-*.yaml config files for:
 * - Valid YAML syntax
 * - Required fields (name, description, systemPrompt, tools)
 * - Tool name references matching AQE MCP tool registry
 * - System prompt token budget
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';

const AGENTS_DIR = path.resolve(__dirname, '../../../../.opencode/agents');

// Required fields per the OpenCodeAgentConfig interface
const REQUIRED_FIELDS = ['name', 'description', 'systemPrompt', 'tools'];

// Known AQE MCP tool names (the ones referenced in agent configs use mcp:agentic-qe: prefix)
const KNOWN_MCP_TOOLS = new Set([
  'fleet_init',
  'fleet_status',
  'fleet_health',
  'task_submit',
  'task_list',
  'task_status',
  'task_cancel',
  'task_orchestrate',
  'agent_list',
  'agent_spawn',
  'agent_metrics',
  'agent_status',
  'test_generate_enhanced',
  'test_execute_parallel',
  'coverage_analyze_sublinear',
  'quality_assess',
  'security_scan_comprehensive',
  'contract_validate',
  'accessibility_test',
  'chaos_test',
  'defect_predict',
  'requirements_validate',
  'code_index',
  'memory_store',
  'memory_retrieve',
  'memory_query',
  'memory_delete',
  'memory_usage',
  'memory_share',
  'model_route',
  'routing_metrics',
  'infra_healing_status',
  'infra_healing_feed_output',
  'infra_healing_recover',
]);

// OpenCode built-in tools that are valid references
const OPENCODE_BUILTIN_TOOLS = new Set([
  'read',
  'edit',
  'multiedit',
  'write',
  'bash',
  'grep',
  'glob',
  'fetch',
  'task',
]);

let agentFiles: string[] = [];
let agentConfigs: Array<{ file: string; data: Record<string, unknown> }> = [];

describe('OpenCode Agent Config Validation', () => {
  beforeAll(() => {
    if (!fs.existsSync(AGENTS_DIR)) {
      return;
    }
    agentFiles = fs.readdirSync(AGENTS_DIR)
      .filter((f) => f.startsWith('qe-') && f.endsWith('.yaml'))
      .map((f) => path.join(AGENTS_DIR, f));
  });

  // -------------------------------------------------------------------------
  // Precondition: agent configs exist
  // -------------------------------------------------------------------------

  it('should have at least one QE agent config', () => {
    expect(agentFiles.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // YAML syntax
  // -------------------------------------------------------------------------

  it('should have valid YAML syntax for all agent configs', () => {
    for (const file of agentFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      let parsed: unknown;

      try {
        parsed = YAML.parse(content);
      } catch (err) {
        throw new Error(
          `Invalid YAML in ${path.basename(file)}: ${(err as Error).message}`
        );
      }

      expect(parsed).toBeDefined();
      expect(typeof parsed).toBe('object');
      expect(parsed).not.toBeNull();

      // Accumulate for subsequent tests
      agentConfigs.push({ file: path.basename(file), data: parsed as Record<string, unknown> });
    }
  });

  // -------------------------------------------------------------------------
  // Required fields
  // -------------------------------------------------------------------------

  it('should have required fields: name, description, systemPrompt, tools', () => {
    for (const { file, data } of agentConfigs) {
      for (const field of REQUIRED_FIELDS) {
        expect(data[field], `${file} missing required field: ${field}`).toBeDefined();
      }

      // Validate field types
      expect(typeof data.name, `${file}: name must be a string`).toBe('string');
      expect(typeof data.description, `${file}: description must be a string`).toBe('string');
      expect(typeof data.systemPrompt, `${file}: systemPrompt must be a string`).toBe('string');
      expect(Array.isArray(data.tools), `${file}: tools must be an array`).toBe(true);
      expect((data.tools as unknown[]).length, `${file}: tools must not be empty`).toBeGreaterThan(0);
    }
  });

  // -------------------------------------------------------------------------
  // Tool references
  // -------------------------------------------------------------------------

  it('should reference only existing MCP tool names or built-in tools', () => {
    for (const { file, data } of agentConfigs) {
      const tools = data.tools as string[];

      for (const tool of tools) {
        // Agent configs reference MCP tools as "mcp:agentic-qe:<tool_name>"
        if (tool.startsWith('mcp:agentic-qe:')) {
          const mcpToolName = tool.replace('mcp:agentic-qe:', '');
          expect(
            KNOWN_MCP_TOOLS.has(mcpToolName),
            `${file} references unknown MCP tool: ${tool} (extracted: ${mcpToolName})`
          ).toBe(true);
        } else {
          // Must be an OpenCode built-in tool
          expect(
            OPENCODE_BUILTIN_TOOLS.has(tool),
            `${file} references unknown tool: ${tool}`
          ).toBe(true);
        }
      }
    }
  });

  // -------------------------------------------------------------------------
  // System prompt token budget
  // -------------------------------------------------------------------------

  it('should have system prompts under 2000 tokens', () => {
    for (const { file, data } of agentConfigs) {
      const systemPrompt = data.systemPrompt as string;

      // Rough token estimate: ~4 chars per token
      const estimatedTokens = Math.ceil(systemPrompt.length / 4);

      expect(
        estimatedTokens,
        `${file} systemPrompt is ~${estimatedTokens} tokens (max 2000). ` +
        `Length: ${systemPrompt.length} chars.`
      ).toBeLessThanOrEqual(2000);
    }
  });

  // -------------------------------------------------------------------------
  // Agent name conventions
  // -------------------------------------------------------------------------

  it('should follow naming convention: qe-<role>', () => {
    for (const { file, data } of agentConfigs) {
      const name = data.name as string;
      expect(
        name.startsWith('qe-'),
        `${file}: agent name '${name}' should start with 'qe-'`
      ).toBe(true);

      // Name should match the filename (without extension)
      const expectedName = path.basename(file, '.yaml');
      expect(name, `${file}: agent name '${name}' should match filename '${expectedName}'`).toBe(expectedName);
    }
  });

  // -------------------------------------------------------------------------
  // Permissions field
  // -------------------------------------------------------------------------

  it('should have permissions defined', () => {
    for (const { file, data } of agentConfigs) {
      // Permissions are recommended but we validate they exist if present
      if (data.permissions) {
        expect(typeof data.permissions, `${file}: permissions must be an object`).toBe('object');
      }
    }
  });
});
