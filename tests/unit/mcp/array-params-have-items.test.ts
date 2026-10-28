/**
 * #1185: VS Code Copilot refuses a tool whose input schema has an array
 * without `items` ("tool parameters array type must have items"). Every array
 * in every tool's advertised input schema, at any depth, must declare items.
 */
import { describe, expect, it } from 'vitest';
import { MCPProtocolServer } from '../../../src/mcp/protocol-server.js';

interface ListedTool {
  name: string;
  inputSchema: Record<string, unknown>;
}

const server = new MCPProtocolServer();
const listed = (server as unknown as { handleToolsList(): { tools: ListedTool[] } })
  .handleToolsList().tools;

/**
 * JSON paths of array schemas under `node` that have no `items`. Walks every
 * nested object and array (properties, items, anyOf/oneOf/allOf,
 * additionalProperties, $defs, ...) and treats a type list containing 'array'
 * (e.g. ['array', 'null']) the same as type 'array' (#1269 follow-up).
 */
function arraysWithoutItems(node: unknown, path: string): string[] {
  if (!node || typeof node !== 'object') return [];
  const missing: string[] = [];
  if (!Array.isArray(node)) {
    const schema = node as Record<string, unknown>;
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (types.includes('array') && schema.items === undefined) missing.push(path);
  }
  for (const [key, child] of Object.entries(node)) {
    missing.push(...arraysWithoutItems(child, `${path}.${key}`));
  }
  return missing;
}

describe('#1185 every array in an MCP tool input schema declares items', () => {
  it('lists the tools', () => {
    expect(listed.length).toBeGreaterThan(50);
    expect(listed.some(tool => tool.name === 'fleet_init')).toBe(true);
  });

  it('has no array schema without items in any tool', () => {
    const missing = listed.flatMap(tool => arraysWithoutItems(tool.inputSchema, tool.name));
    expect(missing).toEqual([]);
  });

  it('the walker catches arrays without items at any depth and in type lists', () => {
    const broken = {
      type: 'object',
      properties: {
        ok: { type: 'array', items: { type: 'string' } },
        nullable: { type: ['array', 'null'] },
        nested: { type: 'object', properties: { deep: { anyOf: [{ type: 'array' }, { type: 'string' }] } } },
        map: { type: 'object', additionalProperties: { type: 'array' } },
        tuple: { type: 'array', items: { type: 'array' } },
      },
    };
    expect(arraysWithoutItems(broken, 't')).toEqual([
      't.properties.nullable',
      't.properties.nested.properties.deep.anyOf.0',
      't.properties.map.additionalProperties',
      't.properties.tuple.items',
    ]);
  });

  it('advertises fleet_init enabledDomains as a list of strings', () => {
    const fleetInit = listed.find(tool => tool.name === 'fleet_init')!;
    const properties = fleetInit.inputSchema.properties as Record<string, Record<string, unknown>>;
    expect(properties.enabledDomains).toMatchObject({ type: 'array', items: { type: 'string' } });
  });

  it('keeps the element schema of tools bridged from MCPToolBase', () => {
    const withItems = listed.filter(tool =>
      Object.values((tool.inputSchema.properties ?? {}) as Record<string, Record<string, unknown>>)
        .some(prop => prop.type === 'array' && prop.items && Object.keys(prop.items as object).length > 0));
    expect(withItems.length).toBeGreaterThan(5);
  });
});
