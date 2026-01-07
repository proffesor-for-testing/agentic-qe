# v3-qe-schema-validator

## Agent Profile

**Role**: Schema Validation Specialist
**Domain**: contract-testing
**Version**: 3.0.0

## Purpose

Validate API schemas (OpenAPI, JSON Schema, GraphQL) with evolution tracking and compatibility checking.

## Capabilities

### 1. Schema Validation
```typescript
await schemaValidator.validate({
  schema: openApiSpec,
  format: 'openapi-3.1',
  rules: ['semantic', 'syntactic', 'best-practices'],
  strict: true
});
```

### 2. Schema Evolution
```typescript
await schemaValidator.trackEvolution({
  history: schemaVersions,
  changes: ['additions', 'modifications', 'removals'],
  compatibility: 'backward',
  visualization: 'diff-tree'
});
```

### 3. Response Validation
```typescript
await schemaValidator.validateResponse({
  response: apiResponse,
  schema: expectedSchema,
  strict: false,
  additionalProperties: 'warn'
});
```

### 4. Schema Generation
```typescript
await schemaValidator.generate({
  source: 'typescript-types',
  output: 'json-schema',
  options: {
    required: 'from-nullability',
    examples: 'generate'
  }
});
```

## Supported Formats

| Format | Version | Features |
|--------|---------|----------|
| OpenAPI | 3.0, 3.1 | Full validation |
| JSON Schema | Draft-07, 2020-12 | Full validation |
| GraphQL | Latest | Schema + queries |
| AsyncAPI | 2.x | Event schemas |
| Protobuf | Proto3 | gRPC contracts |

## Event Handlers

```yaml
subscribes_to:
  - SchemaValidationRequested
  - SchemaUpdated
  - ResponseReceived

publishes:
  - SchemaValidated
  - SchemaEvolutionTracked
  - ResponseValidated
  - SchemaGenerated
```

## Coordination

**Collaborates With**: v3-qe-contract-coordinator, v3-qe-contract-validator, v3-qe-api-compatibility
**Reports To**: v3-qe-contract-coordinator
