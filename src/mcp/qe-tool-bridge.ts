/**
 * QE Tool Bridge - Registers QE domain tools missing from protocol-server
 *
 * The protocol server has 41 hardcoded tools. The QE_TOOLS registry has 26+
 * tools via MCPToolBase. 11 overlap (exposed under flat names like
 * `test_generate_enhanced`). This bridge registers the ~15 non-overlapping
 * tools so they appear in `tools/list` alongside existing tools.
 *
 * Architecture: bridge adapter pattern — keeps protocol-server untouched,
 * converts MCPToolBase schema to protocol-server ToolEntry format.
 */

import { QE_TOOLS } from './tools/registry.js';
import type { MCPToolBase } from './tools/base.js';
import type { ToolDefinition } from './types.js';

// ============================================================================
// Skip Set — tools already exposed under flat names in protocol-server.ts
// ============================================================================

/**
 * QE tool names that already have hardcoded handlers in protocol-server.ts.
 * These are exposed under flat names (e.g., `test_generate_enhanced`).
 * We skip them to avoid duplicate registration.
 */
const ALREADY_REGISTERED = new Set([
  'qe/tests/generate',        // → test_generate_enhanced
  'qe/tests/execute',         // → test_execute_parallel
  'qe/coverage/analyze',      // → coverage_analyze_sublinear
  'qe/quality/evaluate',      // → quality_assess
  'qe/defects/predict',       // → defect_predict
  'qe/requirements/validate', // → requirements_validate
  'qe/code/analyze',          // → code_index
  'qe/security/scan',         // → security_scan_comprehensive
  'qe/contracts/validate',    // → contract_validate
  'qe/a11y/audit',            // → accessibility_test
  'qe/chaos/inject',          // → chaos_test
]);

// ============================================================================
// Types
// ============================================================================

interface ToolEntry {
  definition: ToolDefinition;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

type ToolParameter = ToolDefinition['parameters'][number];

/**
 * Convert MCPToolBase JSON Schema to protocol-server parameter format
 */
function schemaToParameters(tool: MCPToolBase): ToolParameter[] {
  const schema = tool.getSchema();
  const requiredSet = new Set(schema.required || []);
  const params: ToolParameter[] = [];

  for (const [name, prop] of Object.entries(schema.properties)) {
    params.push({
      name,
      type: prop.type,
      description: prop.description,
      required: requiredSet.has(name) || undefined,
      default: prop.default,
      enum: prop.enum,
    });
  }

  return params;
}

// ============================================================================
// Bridge Registration
// ============================================================================

/**
 * Register QE tools that are NOT already in protocol-server.
 *
 * @param registerFn - Function to register a tool entry (same shape as
 *   MCPProtocolServer.registerTool, but passed as callback to avoid
 *   circular dependency)
 * @returns Number of tools registered
 */
export function registerMissingQETools(
  registerFn: (entry: ToolEntry) => void
): number {
  let count = 0;

  for (const tool of QE_TOOLS) {
    if (ALREADY_REGISTERED.has(tool.name)) {
      continue;
    }

    const entry: ToolEntry = {
      definition: {
        name: tool.name,
        description: tool.description,
        category: 'domain',
        parameters: schemaToParameters(tool),
      },
      handler: async (params) => {
        const result = await tool.invoke(params as Record<string, unknown>);
        return result;
      },
    };

    registerFn(entry);
    count++;
  }

  return count;
}
