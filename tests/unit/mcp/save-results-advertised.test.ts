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
  saveResultsDescription,
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
    '%s lists saveResults in its schema and description',
    (name) => {
      const tool = byName.get(name);
      expect(tool, name).toBeDefined();
      const expected = saveResultsParameter(name);
      expect(tool!.inputSchema.properties.saveResults).toEqual({
        type: 'boolean',
        description: expected.description,
        default: true,
      });
      expect(tool!.description).toContain(saveResultsDescription(name));
      expect(tool!.description).toContain('.agentic-qe/results/');
      expect(tool!.description).toContain('pass saveResults: false');
    },
  );

  it('keeps the #925 wording for test_generate_enhanced', () => {
    const tool = byName.get('test_generate_enhanced')!;
    expect(tool.inputSchema.properties.saveResults.description).toBe(
      'Save a manifest and report under .agentic-qe/results/tests/ (default true). Set false to generate without writing any files under .agentic-qe/results/. The server state store (.agentic-qe/memory.db) is updated either way.',
    );
    expect(tool.description).toContain(
      'By default saves a manifest and report under .agentic-qe/results/tests/ (paths returned in savedFiles); pass saveResults: false to generate without writing any result files.',
    );
  });

  it('only result-saving tools advertise saveResults', () => {
    const advertising = listed.filter(tool => tool.inputSchema.properties?.saveResults).map(tool => tool.name).sort();
    expect(advertising).toEqual(Object.keys(RESULT_SAVING_TOOLS).sort());
  });

  it('every tool inputSchema still compiles with ajv', () => {
    const ajv = new Ajv({ strict: false });
    expect(listed.length).toBeGreaterThan(Object.keys(RESULT_SAVING_TOOLS).length);
    for (const tool of listed) {
      expect(() => ajv.compile(tool.inputSchema), tool.name).not.toThrow();
    }
  });
});
