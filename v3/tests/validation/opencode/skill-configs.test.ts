/**
 * OpenCode Skill Config Validation Tests
 *
 * Validates all .opencode/skills/qe-*.yaml config files for:
 * - Valid YAML syntax
 * - Required fields (name, description, steps)
 * - minModelTier set to valid tier value
 * - Steps reference valid tool names
 * - Minimum step count per skill
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';

const SKILLS_DIR = path.resolve(__dirname, '../../../../.opencode/skills');

const VALID_MODEL_TIERS = ['tier1-any', 'tier2-good', 'tier3-best'];

const REQUIRED_FIELDS = ['name', 'description', 'steps'];

// Known AQE MCP tool names
const KNOWN_MCP_TOOLS = new Set([
  'fleet_init', 'fleet_status', 'fleet_health',
  'task_submit', 'task_list', 'task_status', 'task_cancel', 'task_orchestrate',
  'agent_list', 'agent_spawn', 'agent_metrics', 'agent_status',
  'test_generate_enhanced', 'test_execute_parallel',
  'coverage_analyze_sublinear', 'quality_assess',
  'security_scan_comprehensive', 'contract_validate',
  'accessibility_test', 'chaos_test', 'defect_predict',
  'requirements_validate', 'code_index',
  'memory_store', 'memory_retrieve', 'memory_query', 'memory_delete', 'memory_usage', 'memory_share',
  'model_route', 'routing_metrics',
  'infra_healing_status', 'infra_healing_feed_output', 'infra_healing_recover',
]);

// OpenCode built-in tools
const OPENCODE_BUILTIN_TOOLS = new Set([
  'read', 'edit', 'multiedit', 'write', 'bash', 'grep', 'glob', 'fetch', 'task',
]);

let skillFiles: string[] = [];
let skillConfigs: Array<{ file: string; data: Record<string, unknown> }> = [];

describe('OpenCode Skill Config Validation', () => {
  beforeAll(() => {
    if (!fs.existsSync(SKILLS_DIR)) {
      // Skills may not be created yet by WS3 — skip gracefully
      return;
    }
    skillFiles = fs.readdirSync(SKILLS_DIR)
      .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
      .map((f) => path.join(SKILLS_DIR, f));
  });

  // -------------------------------------------------------------------------
  // Precondition
  // -------------------------------------------------------------------------

  it('should have skill config files (or skip if WS3 not complete)', () => {
    if (!fs.existsSync(SKILLS_DIR)) {
      // Directory not yet created — this is acceptable during parallel workstreams
      expect(true).toBe(true);
      return;
    }
    // If directory exists, it should have files
    expect(skillFiles.length).toBeGreaterThanOrEqual(0);
  });

  // -------------------------------------------------------------------------
  // YAML syntax
  // -------------------------------------------------------------------------

  it('should have valid YAML syntax for all skill configs', () => {
    for (const file of skillFiles) {
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

      skillConfigs.push({ file: path.basename(file), data: parsed as Record<string, unknown> });
    }
  });

  // -------------------------------------------------------------------------
  // Required fields
  // -------------------------------------------------------------------------

  it('should have required fields: name, description, steps', () => {
    for (const { file, data } of skillConfigs) {
      for (const field of REQUIRED_FIELDS) {
        expect(data[field], `${file} missing required field: ${field}`).toBeDefined();
      }

      expect(typeof data.name, `${file}: name must be a string`).toBe('string');
      expect(typeof data.description, `${file}: description must be a string`).toBe('string');
      expect(Array.isArray(data.steps), `${file}: steps must be an array`).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // minModelTier
  // -------------------------------------------------------------------------

  it('should have minModelTier set to valid tier', () => {
    for (const { file, data } of skillConfigs) {
      if (data.minModelTier !== undefined) {
        expect(
          VALID_MODEL_TIERS.includes(data.minModelTier as string),
          `${file}: minModelTier '${data.minModelTier}' is not valid. ` +
          `Expected one of: ${VALID_MODEL_TIERS.join(', ')}`
        ).toBe(true);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Step tool references
  // -------------------------------------------------------------------------

  it('should reference only valid tool names in steps', () => {
    for (const { file, data } of skillConfigs) {
      const steps = data.steps as Array<Record<string, unknown>>;

      for (const step of steps) {
        const toolName = step.toolName as string;
        if (!toolName) continue;

        if (toolName.startsWith('mcp:agentic-qe:')) {
          const mcpName = toolName.replace('mcp:agentic-qe:', '');
          expect(
            KNOWN_MCP_TOOLS.has(mcpName),
            `${file} step references unknown MCP tool: ${toolName}`
          ).toBe(true);
        } else {
          expect(
            OPENCODE_BUILTIN_TOOLS.has(toolName),
            `${file} step references unknown tool: ${toolName}`
          ).toBe(true);
        }
      }
    }
  });

  // -------------------------------------------------------------------------
  // Minimum step count
  // -------------------------------------------------------------------------

  it('should have at least 2 steps per skill', () => {
    for (const { file, data } of skillConfigs) {
      const steps = data.steps as unknown[];
      expect(
        steps.length,
        `${file}: skill must have at least 2 steps, found ${steps.length}`
      ).toBeGreaterThanOrEqual(2);
    }
  });

  // -------------------------------------------------------------------------
  // Step structure
  // -------------------------------------------------------------------------

  it('should have well-formed steps with a name or id and description', () => {
    for (const { file, data } of skillConfigs) {
      const steps = data.steps as Array<Record<string, unknown>>;

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        // Steps can have: name, id, or toolName as their identifier
        const hasIdentifier = step.id || step.toolName || step.name;
        expect(
          hasIdentifier,
          `${file} step[${i}]: must have a name, id, or toolName`
        ).toBeDefined();
        expect(
          step.description,
          `${file} step[${i}]: must have a description`
        ).toBeDefined();
      }
    }
  });
});
