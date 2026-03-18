# Contract Testing — Agent CLI Commands & Advanced Patterns

Merged from `qe-contract-testing`. Use these when working with v3 agent-specific contract capabilities.

## AQE CLI Commands

```bash
# Generate contract from API spec
aqe contract generate --api openapi.yaml --output contracts/

# Verify provider against contracts
aqe contract verify --provider http://localhost:3000 --contracts contracts/

# Check breaking changes between versions
aqe contract breaking --old api-v1.yaml --new api-v2.yaml

# Test GraphQL schema
aqe contract graphql --schema schema.graphql --operations queries/
```

## Agent Workflow

```typescript
// Contract generation
Task("Generate API contracts", `
  Analyze the REST API and generate consumer contracts:
  - Parse OpenAPI specification
  - Identify critical endpoints
  - Generate Pact contracts
  - Include example requests/responses
  Output to contracts/ directory.
`, "qe-api-contract")

// Breaking change detection
Task("Check API compatibility", `
  Compare API v2.0 against v1.0:
  - Detect removed endpoints
  - Check parameter changes
  - Verify response schema changes
  - Identify deprecations
  Report breaking vs non-breaking changes.
`, "qe-api-compatibility")
```

## GraphQL Contract Testing

```typescript
await graphqlTester.testContracts({
  schema: 'schema.graphql',
  operations: 'queries/**/*.graphql',
  validation: {
    queryValidity: true,
    responseShapes: true,
    nullability: true,
    deprecations: true
  }
});
```

## Event Contract Testing

```typescript
await contractTester.eventContracts({
  schema: 'events/schemas/',
  events: {
    'user.created': {
      schema: 'UserCreatedEvent.json',
      examples: ['examples/user-created.json']
    },
    'order.completed': {
      schema: 'OrderCompletedEvent.json',
      examples: ['examples/order-completed.json']
    }
  },
  compatibility: 'backward'
});
```

## Contract Report Interface

```typescript
interface ContractReport {
  summary: { contracts: number; passed: number; failed: number; warnings: number };
  consumers: { name: string; contracts: ContractResult[]; compatibility: 'compatible' | 'breaking' | 'unknown' }[];
  breakingChanges: { type: string; location: string; description: string; impact: 'high' | 'medium' | 'low'; migration: string }[];
  deprecations: { item: string; deprecatedIn: string; removeIn: string; replacement: string }[];
}
```

## Pact Broker Integration

```typescript
await contractTester.withBroker({
  brokerUrl: 'https://pact-broker.example.com',
  auth: { token: process.env.PACT_TOKEN },
  operations: { publish: true, canIDeploy: true, webhooks: true }
});
```

## Coordination

**Primary Agents**: qe-api-contract, qe-api-compatibility, qe-graphql-tester
**Coordinator**: qe-contract-coordinator
