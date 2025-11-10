---
name: contract-testing
description: Consumer-driven contract testing for microservices using Pact, schema validation, API versioning, and backward compatibility testing. Use when testing API contracts, preventing breaking changes, or coordinating distributed teams.
---

# Contract Testing

## Core Principle

**Microservices fail when API contracts break.**

Contract testing validates that providers (APIs) fulfill contracts expected by consumers (clients). Prevents breaking changes that cause production failures in distributed systems.

## What is Contract Testing?

**Contract:** Agreement between API provider and consumer about request/response structure.

**Traditional Testing Problems:**
```
Consumer Team: "We need user.id as integer"
Provider Team: "We changed it to UUID string"
→ Production failure! No one noticed until deployed.
```

**Contract Testing Solution:**
```
1. Consumer defines expected contract
2. Provider validates against contract
3. Breaking changes caught before deployment
```

## Consumer-Driven Contracts (Pact)

**Install Pact:**
```bash
npm install --save-dev @pact-foundation/pact
```

**Consumer Test (defines contract):**
```javascript
import { PactV3 } from '@pact-foundation/pact';

const provider = new PactV3({
  consumer: 'UserWebApp',
  provider: 'UserAPI'
});

test('get user by id', async () => {
  // Define expected interaction
  await provider
    .given('user 123 exists')
    .uponReceiving('a request for user 123')
    .withRequest({
      method: 'GET',
      path: '/users/123'
    })
    .willRespondWith({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        id: 123,
        email: 'user@example.com',
        name: 'John Doe'
      }
    });

  // Execute test
  await provider.executeTest(async (mockServer) => {
    const api = new UserAPI(mockServer.url);
    const user = await api.getUser(123);

    expect(user.id).toBe(123);
    expect(user.email).toBe('user@example.com');
  });
});

// Generates pact contract file
```

**Provider Verification:**
```javascript
import { Verifier } from '@pact-foundation/pact';

test('provider honors all consumer contracts', async () => {
  const verifier = new Verifier({
    provider: 'UserAPI',
    providerBaseUrl: 'http://localhost:3000',

    // Load contracts from Pact Broker
    pactBrokerUrl: 'https://pact-broker.example.com',
    pactBrokerToken: process.env.PACT_BROKER_TOKEN,

    // Or load local contracts
    pactUrls: ['./pacts/UserWebApp-UserAPI.json'],

    // Provider states
    stateHandlers: {
      'user 123 exists': async () => {
        await db.users.create({ id: 123, email: 'user@example.com', name: 'John Doe' });
      }
    }
  });

  await verifier.verifyProvider();
  // Fails if provider doesn't match consumer expectations
});
```

## Schema Validation

**JSON Schema Contract:**
```javascript
const userSchema = {
  type: 'object',
  required: ['id', 'email'],
  properties: {
    id: { type: 'integer' },
    email: { type: 'string', format: 'email' },
    name: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' }
  }
};

test('API response matches schema', async () => {
  const response = await fetch('/api/users/123');
  const user = await response.json();

  const validator = new Ajv();
  const valid = validator.validate(userSchema, user);

  expect(valid).toBe(true);
  expect(validator.errors).toBeNull();
});
```

## API Versioning Testing

**Test backward compatibility:**
```javascript
test('v2 API is backward compatible with v1', async () => {
  // v1 client
  const v1Response = await fetch('/api/v1/users/123');
  const v1User = await v1Response.json();

  // v2 client
  const v2Response = await fetch('/api/v2/users/123');
  const v2User = await v2Response.json();

  // v2 must include all v1 fields
  expect(v2User).toMatchObject(v1User);

  // v2 can have additional fields
  expect(v2User.newField).toBeDefined();
});

test('deprecated fields still present', async () => {
  const response = await fetch('/api/v2/users/123');
  const user = await response.json();

  // Deprecated field still works (with warning header)
  expect(user.oldField).toBeDefined();
  expect(response.headers.get('Deprecation')).toBeTruthy();
});
```

## Related Skills

- [api-testing-patterns](../api-testing-patterns/) - API testing strategies
- [regression-testing](../regression-testing/) - Contract regression
- [agentic-quality-engineering](../agentic-quality-engineering/)

## Remember

**Breaking API changes break production.**

- Microservices depend on each other
- Changes propagate across services
- Integration tests miss distributed issues
- Contract testing catches breaks early

**Consumer-driven prevents surprises:**
- Consumers define expectations
- Providers validate before deployment
- Breaking changes caught in CI
- Safe, independent deployments

**With Agents:** `qe-api-contract-validator` automatically validates contracts, detects breaking changes, and ensures backward compatibility across all API versions.
