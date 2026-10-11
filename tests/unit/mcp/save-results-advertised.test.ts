/**
 * #933: every MCP tool whose handler is built by createDomainHandler writes
 * through ResultSaver, so every one of them must advertise `saveResults` in
 * its input schema and description, worded like test_generate_enhanced.
 * The tool list as a whole must stay valid JSON Schema (ajv compile).
 */
import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import { MCPProtocolServer } from '../../../src/mcp/protocol-server.js';
import * as domainHandlerModule from '../../../src/mcp/handlers/domain-handlers.js';
import {
  RESULT_SAVING_TOOLS,
  SAVE_RESULTS_HINT,
  saveResultsParameter,
} from '../../../src/mcp/handlers/save-results-option.js';

interface ListedTool {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, Record<string, unknown>> };
}

const server = new MCPProtocolServer();
const internals = server as unknown as {
  handleToolsList(): { tools: ListedTool[] };
  tools: Map<string, { handler: (...args: unknown[]) => unknown }>;
};
const listed = internals.handleToolsList().tools;
const byName = new Map(listed.map(tool => [tool.name, tool]));

/** Export names of the handlers built by createDomainHandler (domainHandlers registry). */
const domainHandlerNames = Object.entries(domainHandlerModule)
  .filter(([, value]) => Object.values(domainHandlerModule.domainHandlers).includes(value as never))
  .map(([name]) => name);

/** Tools whose registered handler delegates to one of those domain handlers. */
const toolsUsingDomainHandlers = [...internals.tools.entries()]
  .filter(([, entry]) => domainHandlerNames.some(name => new RegExp(`\\b${name}\\b`).test(entry.handler.toString())))
  .map(([name]) => name)
  .sort();

describe('#933 saveResults is advertised by every result-saving domain tool', () => {
  it('finds all 11 createDomainHandler handlers and the tools wired to them', () => {
    expect(domainHandlerNames).toHaveLength(Object.keys(domainHandlerModule.domainHandlers).length);
    expect(domainHandlerNames).toHaveLength(11);
    expect(toolsUsingDomainHandlers).toEqual(Object.keys(RESULT_SAVING_TOOLS).sort());
  });

  it.each(Object.keys(RESULT_SAVING_TOOLS) as Array<keyof typeof RESULT_SAVING_TOOLS>)(
    '%s lists saveResults in its schema with the full explanation',
    (name) => {
      const tool = byName.get(name);
      expect(tool, name).toBeDefined();
      const expected = saveResultsParameter(name);
      expect(tool!.inputSchema.properties.saveResults).toEqual({
        type: 'boolean',
        description: expected.description,
        default: true,
      });
      expect(expected.description).toContain('.agentic-qe/results/');
      expect(expected.description).toContain('Set false to');
    },
  );

  // OpenCode shows about 200 characters of a tool description; the full
  // saveResults explanation lives in the parameter description instead.
  // These two were already longer than 200 characters before #933.
  const ALREADY_LONG = ['test_generate_enhanced', 'security_scan_comprehensive'];

  it.each(Object.keys(RESULT_SAVING_TOOLS).filter(name => !ALREADY_LONG.includes(name)))(
    '%s mentions saveResults in a short hint and stays within 200 characters',
    (name) => {
      const description = byName.get(name)!.description;
      expect(description).toContain(SAVE_RESULTS_HINT);
      expect(description.length).toBeLessThanOrEqual(200);
    },
  );

  it('does not lengthen security_scan_comprehensive, which was already over 200 characters', () => {
    expect(byName.get('security_scan_comprehensive')!.description).toBe(
      'Run security scans with execution evidence and explicit coverage limitations. Complete means the declared required scope ran, not that all vulnerabilities are absent. Example: security_scan_comprehensive({ target: "src/", sast: true })',
    );
  });

  it('keeps the #925 wording for test_generate_enhanced', () => {
    const tool = byName.get('test_generate_enhanced')!;
    expect(tool.inputSchema.properties.saveResults.description).toBe(
      'Save a manifest and report under .agentic-qe/results/tests/ (default true). Set false to generate without writing any files under .agentic-qe/results/. The server state store (.agentic-qe/memory.db) is updated either way.',
    );
    expect(tool.description).toBe(
      'Generate unit/integration/e2e tests with AI pattern recognition and anti-pattern detection. By default saves a manifest and report under .agentic-qe/results/tests/ (paths returned in savedFiles); pass saveResults: false to generate without writing any result files. Example: test_generate_enhanced({ sourceCode: "function add(a,b){return a+b}", testType: "unit", framework: "jest" })',
    );
  });

  it('only result-saving tools advertise saveResults', () => {
    const advertising = listed.filter(tool => tool.inputSchema.properties?.saveResults).map(tool => tool.name).sort();
    expect(advertising).toEqual(Object.keys(RESULT_SAVING_TOOLS).sort());
  });

  it('every tool inputSchema still compiles with ajv in strict mode', () => {
    const ajv = new Ajv({ strict: true });
    expect(listed.length).toBeGreaterThan(Object.keys(RESULT_SAVING_TOOLS).length);
    for (const tool of listed) {
      expect(() => ajv.compile(tool.inputSchema), tool.name).not.toThrow();
    }
  });
});
