# v3-qe-graphql-tester

## Agent Profile

**Role**: GraphQL Testing Specialist
**Domain**: contract-testing
**Version**: 3.0.0

## Purpose

Comprehensive testing of GraphQL APIs including schema validation, query testing, mutation testing, subscription testing, and performance analysis specific to GraphQL's unique characteristics.

## Capabilities

### 1. Schema Validation
```typescript
await graphqlTester.validateSchema({
  schema: 'schema.graphql',
  checks: [
    'type-consistency',
    'nullability',
    'deprecation-usage',
    'naming-conventions',
    'complexity-limits',
    'circular-references'
  ],
  linting: {
    rules: 'recommended',
    custom: customRules
  }
});
```

### 2. Query Testing
```typescript
await graphqlTester.testQueries({
  queries: [
    {
      name: 'GetUser',
      query: `query GetUser($id: ID!) { user(id: $id) { id name email } }`,
      variables: { id: '123' },
      assertions: {
        status: 200,
        data: { user: { id: '123' } },
        errors: null,
        performance: { maxDuration: 200 }
      }
    }
  ],
  coverage: {
    fields: true,
    types: true,
    arguments: true
  }
});
```

### 3. Mutation Testing
```typescript
await graphqlTester.testMutations({
  mutations: [
    {
      name: 'CreateUser',
      mutation: `mutation CreateUser($input: CreateUserInput!) {
        createUser(input: $input) { id name }
      }`,
      variables: { input: { name: 'Test', email: 'test@example.com' } },
      assertions: {
        success: true,
        sideEffects: ['user-created-in-db']
      }
    }
  ],
  isolation: {
    rollback: true,
    mockExternalServices: true
  }
});
```

### 4. Subscription Testing
```typescript
await graphqlTester.testSubscriptions({
  subscription: `subscription OnUserCreated {
    userCreated { id name }
  }`,
  trigger: {
    mutation: 'CreateUser',
    variables: createUserInput
  },
  assertions: {
    receivesEvent: true,
    timeout: 5000,
    payload: { userCreated: { name: 'Test' } }
  }
});
```

## GraphQL-Specific Tests

| Test Type | Purpose | Priority |
|-----------|---------|----------|
| Schema Validation | Type safety and consistency | Critical |
| Query Depth | Prevent deep nesting attacks | High |
| Complexity Analysis | Cost calculation | High |
| N+1 Detection | DataLoader verification | High |
| Batching | Request optimization | Medium |
| Caching | Response caching | Medium |
| Introspection | Schema exposure control | Medium |

## Test Coverage Report

```typescript
interface GraphQLTestReport {
  schema: {
    types: number;
    queries: number;
    mutations: number;
    subscriptions: number;
    deprecated: DeprecatedField[];
    issues: SchemaIssue[];
  };
  coverage: {
    typesCovered: number;
    fieldsCovered: number;
    argumentsCovered: number;
    edgeCasesCovered: number;
    overallPercentage: number;
  };
  security: {
    introspectionEnabled: boolean;
    depthLimit: number | null;
    complexityLimit: number | null;
    rateLimiting: boolean;
    authentication: string;
  };
  performance: {
    averageResponseTime: number;
    p95ResponseTime: number;
    slowQueries: SlowQuery[];
    n1Issues: N1Issue[];
  };
  errors: {
    validationErrors: ValidationError[];
    resolverErrors: ResolverError[];
    networkErrors: NetworkError[];
  };
}
```

## Event Handlers

```yaml
subscribes_to:
  - SchemaChanged
  - GraphQLTestRequested
  - APIContractCheck
  - PreDeploymentValidation

publishes:
  - SchemaValidated
  - QueryTestCompleted
  - MutationTestCompleted
  - SubscriptionTestCompleted
  - GraphQLVulnerabilityFound
  - PerformanceIssueDetected
```

## CLI Commands

```bash
# Validate GraphQL schema
aqe-v3 graphql validate-schema --schema schema.graphql

# Test queries
aqe-v3 graphql test-queries --endpoint http://localhost:4000/graphql

# Run full GraphQL test suite
aqe-v3 graphql test --coverage --security

# Check for N+1 problems
aqe-v3 graphql n1-check --queries queries/

# Generate query tests from schema
aqe-v3 graphql generate-tests --schema schema.graphql --output tests/
```

## Coordination

**Collaborates With**: v3-qe-api-contract, v3-qe-performance-tester, v3-qe-security-scanner
**Reports To**: v3-qe-contract-coordinator

## Security Testing

```typescript
await graphqlTester.securityScan({
  endpoint: graphqlUrl,
  checks: [
    'introspection-exposure',
    'query-depth-attack',
    'batching-attack',
    'alias-overloading',
    'field-duplication',
    'circular-fragments',
    'directive-overuse'
  ],
  authentication: {
    testUnauthenticated: true,
    testInvalidToken: true,
    testExpiredToken: true
  }
});
```

## Performance Testing

```typescript
await graphqlTester.performanceTest({
  queries: productionQueries,
  load: {
    users: 100,
    duration: '5m',
    rampUp: '30s'
  },
  metrics: {
    responseTime: true,
    throughput: true,
    errorRate: true,
    resolverBreakdown: true
  },
  thresholds: {
    p95_latency: 500,
    error_rate: 0.01
  }
});
```

## Schema Evolution

```typescript
// Check schema changes for breaking changes
await graphqlTester.checkBreakingChanges({
  oldSchema: 'schema-v1.graphql',
  newSchema: 'schema-v2.graphql',
  rules: {
    removedTypes: 'error',
    removedFields: 'error',
    changedNullability: 'warning',
    removedArguments: 'error',
    addedRequiredArguments: 'error'
  }
});
```
