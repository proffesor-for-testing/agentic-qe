/**
 * #1136: validators that checked `prop in data` counted a property every
 * object inherits from Object.prototype (`constructor`, `toString`) as present.
 * A required `constructor` passed on `{}`, and a removed property of that name
 * was not reported. Each site now reads own properties only.
 */
import { describe, expect, it, vi } from 'vitest';
import type { MemoryBackend } from '../../../src/kernel/interfaces';
import { SchemaValidatorService } from '../../../src/domains/contract-testing/services/schema-validator';
import { ContractValidatorService } from '../../../src/domains/contract-testing/services/contract-validator';
import { ApiCompatibilityService } from '../../../src/domains/contract-testing/services/api-compatibility';
import type { ApiContract, SchemaDefinition } from '../../../src/domains/contract-testing/interfaces';
import { MessageBrokerService } from '../../../src/domains/enterprise-integration/services/message-broker-service';
import { ODataService } from '../../../src/domains/enterprise-integration/services/odata-service';
import { SapIntegrationService } from '../../../src/domains/enterprise-integration/services/sap-integration-service';
import { SchemaValidator } from '../../../src/mcp/security/schema-validator';
import { validateComponent } from '../../../src/adapters/a2ui/catalog/component-schemas';
import { validateToolDefinition } from '../../../src/shared/llm/translation/tool-translator';
import { Version } from '../../../src/shared/value-objects';

const memory = () => ({
  initialize: vi.fn(), dispose: vi.fn(), set: vi.fn(), get: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn(), has: vi.fn().mockResolvedValue(false), search: vi.fn().mockResolvedValue([]),
  vectorSearch: vi.fn().mockResolvedValue([]), storeVector: vi.fn(),
}) as unknown as MemoryBackend;

const jsonSchema = (id: string, schema: object): SchemaDefinition =>
  ({ id, name: id, type: 'json-schema', content: JSON.stringify(schema) });

describe('contract-testing SchemaValidatorService (#1136)', () => {
  it('reports a required `constructor` missing from {}', async () => {
    const result = await new SchemaValidatorService(memory())
      .validateJsonSchema({}, { type: 'object', required: ['constructor', 'toString'] });
    expect(result.success && result.value.errors.map(e => e.message)).toEqual([
      "Required property 'constructor' is missing", "Required property 'toString' is missing",
    ]);
  });

  it('reports a removed property named `toString` when comparing schemas', async () => {
    const result = await new SchemaValidatorService(memory()).compareSchemas(
      jsonSchema('v1', { type: 'object', properties: { toString: { type: 'string' } } }),
      jsonSchema('v2', { type: 'object', properties: {} }),
    );
    expect(result.success && result.value.removals).toEqual(['toString']);
  });

  it('reports an added required property named `toString` as breaking', async () => {
    const result = await new SchemaValidatorService(memory()).compareSchemas(
      jsonSchema('v1', { type: 'object', properties: {} }),
      jsonSchema('v2', { type: 'object', properties: { toString: { type: 'string' } }, required: ['toString'] }),
    );
    expect(result.success && result.value.additions).toEqual(['toString']);
    expect(result.success && result.value.isCompatible).toBe(false);
  });
});

describe('ContractValidatorService (#1136)', () => {
  const validator = () => new ContractValidatorService({ memory: memory() });

  it('reports a required `constructor` missing from a request body', async () => {
    const result = await validator().validateRequest({}, jsonSchema('req', { type: 'object', required: ['constructor'] }));
    expect(result.success && result.value.errors.map(e => e.message)).toContain("Required property 'constructor' is missing");
  });

  it('reports a required GraphQL variable named `constructor` as missing', async () => {
    const result = await validator().validateRequest(
      { query: 'query Q($constructor: String!) { user }', variables: {} },
      { id: 'gql', name: 'gql', type: 'graphql', content: 'type Query { user: String }' },
    );
    expect(result.success && result.value.errors.map(e => e.message)).toContain("Required variable 'constructor' is missing");
  });
});

describe('ApiCompatibilityService (#1136)', () => {
  const contract = (properties: object): ApiContract => ({
    id: 'c', name: 'c', version: Version.create(1, 0, 0), type: 'rest',
    provider: { name: 'p', version: '1.0.0' }, consumers: [{ name: 'consumer', version: '1.0.0' }],
    endpoints: [], schemas: [jsonSchema('s', { type: 'object', properties })],
  } as ApiContract);

  it('reports removing a property named `toString` as breaking', async () => {
    const result = await new ApiCompatibilityService(memory())
      .compareVersions(contract({ toString: { type: 'string' } }), contract({}));
    expect(result.success && result.value.breakingChanges.map(c => c.type)).toContain('removed-field');
  });
});

describe('enterprise-integration validators (#1136)', () => {
  it('message broker: reports a required `constructor` missing from a JSON message', () => {
    const result = new MessageBrokerService(memory()).validateMessageSchema(
      { format: 'json', body: '{}' } as never,
      JSON.stringify({ type: 'object', required: ['constructor'] }),
    );
    expect(result.success && result.value).toContain("Required property 'constructor' is missing");
  });

  it('OData: reports a required function parameter named `constructor` as missing', () => {
    const metadata = { functionImports: [{ name: 'f', parameters: [{ name: 'constructor', type: 'Edm.String', nullable: false }] }] };
    const result = new ODataService(memory()).testFunctionImport(metadata as never, 'f', {});
    expect(result.success && result.value.map(e => e.message)).toContain("Required parameter 'constructor' is missing");
  });

  it('SAP: reports expected export and table parameters named `constructor` as missing', () => {
    const sap = new SapIntegrationService(memory()) as unknown as {
      validateExportParams(p: string[], v: Record<string, unknown>): string[];
      validateTableParams(p: string[], v: Record<string, unknown[]>): string[];
    };
    expect(sap.validateExportParams(['constructor'], {})).toEqual(["Expected export parameter 'constructor' not found in response"]);
    expect(sap.validateTableParams(['toString'], {})).toEqual(["Expected table parameter 'toString' not found in response"]);
  });
});

describe('MCP SchemaValidator (#1136)', () => {
  it('reports a required `constructor` missing from {}', () => {
    const result = new SchemaValidator().validate({}, { type: 'object', required: ['constructor'] });
    expect(result.valid).toBe(false);
    expect(result.errors.map(e => e.message)).toContain("Required property 'constructor' is missing");
  });
});

describe('A2UI component schema (#1136)', () => {
  it('reports a required property missing even when Object.prototype has a member of that name', () => {
    // `text` component requires `text`; a component without it fails either way,
    // and one whose only property is inherited must fail too.
    const component = Object.create({ text: { literalString: 'inherited' } }) as Record<string, unknown>;
    component.type = 'text';
    const result = validateComponent(component, 'text');
    expect(result.valid).toBe(false);
    expect(result.errors.map(e => e.message)).toContain('Missing required property: text');
  });
});

describe('tool translator (#1136)', () => {
  it('reports a required parameter `constructor` that is not among the properties', () => {
    const errors = validateToolDefinition({
      name: 'tool', description: 'd', parameters: { type: 'object', properties: {} }, required: ['constructor'],
    } as never);
    expect(errors).toContain("Required parameter 'constructor' not found in properties");
  });
});
