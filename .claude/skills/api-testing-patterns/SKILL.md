---
name: api-testing-patterns
description: Apply comprehensive API testing patterns including contract testing, REST/GraphQL testing, and integration testing. Use when testing APIs, microservices, or designing API test strategies.
---

# API Testing Patterns

## Core Principles

APIs are contracts. Test the contract, not the implementation. Focus on behavior from the consumer's perspective, not the provider's internals.

## Testing Levels

### 1. Contract Testing

**Purpose:** Verify API provider and consumer agree on the contract.

**Pattern: Consumer-Driven Contracts**
```javascript
// Consumer defines expectations
const expectedContract = {
  request: {
    method: 'POST',
    path: '/orders',
    body: { productId: 'abc', quantity: 2 }
  },
  response: {
    status: 201,
    body: { orderId: 'string', total: 'number' }
  }
};

// Provider must fulfill this contract
test('order API meets consumer contract', async () => {
  const response = await api.post('/orders', {
    productId: 'abc',
    quantity: 2
  });
  
  expect(response.status).toBe(201);
  expect(response.body).toMatchSchema({
    orderId: expect.any(String),
    total: expect.any(Number)
  });
});
```

**Tools:** Pact, Spring Cloud Contract

**When to use:** Microservices, distributed systems, third-party integrations

### 2. Integration Testing

**Purpose:** Verify API works with real dependencies (database, external services).

**Pattern: Test with Real Dependencies**
```javascript
describe('Order API integration', () => {
  beforeEach(async () => {
    await db.migrate();
    await db.seed();
  });
  
  afterEach(async () => {
    await db.rollback();
  });
  
  it('creates order and updates inventory', async () => {
    const response = await api.post('/orders', {
      productId: 'product-123',
      quantity: 2
    });
    
    expect(response.status).toBe(201);
    
    // Verify side effects
    const inventory = await db.inventory.findById('product-123');
    expect(inventory.quantity).toBe(8); // Was 10, now 8
  });
});
```

**When to use:** Testing business logic that spans multiple components

### 3. Component Testing

**Purpose:** Test API in isolation with mocked dependencies.

**Pattern: Mock External Dependencies**
```javascript
describe('Order API component', () => {
  it('handles payment service timeout', async () => {
    const paymentService = mockPaymentService({
      charge: () => { throw new TimeoutError(); }
    });
    
    const api = createAPI({ paymentService });
    const response = await api.post('/orders', orderData);
    
    expect(response.status).toBe(503);
    expect(response.body.error).toBe('Payment service unavailable');
  });
});
```

**When to use:** Testing error handling, edge cases, without hitting real services

## Critical Test Scenarios

### Authentication & Authorization

```javascript
describe('Authentication', () => {
  it('rejects requests without token', async () => {
    const response = await api.get('/orders');
    expect(response.status).toBe(401);
  });
  
  it('rejects requests with expired token', async () => {
    const expiredToken = generateExpiredToken();
    const response = await api.get('/orders', {
      headers: { Authorization: `Bearer ${expiredToken}` }
    });
    expect(response.status).toBe(401);
  });
  
  it('allows access only to authorized resources', async () => {
    const userAToken = generateToken({ userId: 'A' });
    const response = await api.get('/orders/user-B-order', {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    expect(response.status).toBe(403);
  });
});
```

### Input Validation

```javascript
describe('Input validation', () => {
  it('validates required fields', async () => {
    const response = await api.post('/orders', {
      // Missing productId
      quantity: 2
    });
    expect(response.status).toBe(400);
    expect(response.body.errors).toContain('productId is required');
  });
  
  it('validates data types', async () => {
    const response = await api.post('/orders', {
      productId: 'abc',
      quantity: 'two' // Should be number
    });
    expect(response.status).toBe(400);
  });
  
  it('validates value ranges', async () => {
    const response = await api.post('/orders', {
      productId: 'abc',
      quantity: -5 // Negative quantity
    });
    expect(response.status).toBe(400);
  });
});
```

### Error Handling

```javascript
describe('Error handling', () => {
  it('handles database connection failure', async () => {
    db.disconnect();
    const response = await api.get('/orders');
    expect(response.status).toBe(503);
    expect(response.body.error).toMatch(/service unavailable/i);
  });
  
  it('handles malformed JSON', async () => {
    const response = await fetch('/orders', {
      method: 'POST',
      body: 'not-json'
    });
    expect(response.status).toBe(400);
  });
  
  it('handles unexpected errors gracefully', async () => {
    // Simulate internal error
    orderService.create = () => { throw new Error('Unexpected'); };
    
    const response = await api.post('/orders', validOrder);
    expect(response.status).toBe(500);
    expect(response.body.error).not.toContain('Unexpected'); // Don't leak internals
  });
});
```

### Idempotency

```javascript
describe('Idempotent operations', () => {
  it('PUT is idempotent', async () => {
    const updateData = { status: 'shipped' };
    
    await api.put('/orders/123', updateData);
    const response = await api.put('/orders/123', updateData);
    
    expect(response.status).toBe(200);
    // Verify state hasn't changed incorrectly
  });
  
  it('POST with idempotency key prevents duplicates', async () => {
    const idempotencyKey = 'unique-key-123';
    const orderData = { productId: 'abc', quantity: 2 };
    
    const response1 = await api.post('/orders', orderData, {
      headers: { 'Idempotency-Key': idempotencyKey }
    });
    
    const response2 = await api.post('/orders', orderData, {
      headers: { 'Idempotency-Key': idempotencyKey }
    });
    
    expect(response1.body.orderId).toBe(response2.body.orderId);
    // Verify only one order was created
  });
});
```

### Concurrency

```javascript
describe('Concurrent requests', () => {
  it('handles race condition on inventory update', async () => {
    const promises = Array(10).fill().map(() => 
      api.post('/orders', { productId: 'abc', quantity: 1 })
    );
    
    const responses = await Promise.all(promises);
    const successful = responses.filter(r => r.status === 201);
    
    // Verify inventory wasn't oversold
    const inventory = await db.inventory.findById('abc');
    expect(inventory.quantity).toBe(initialQuantity - successful.length);
  });
});
```

## REST API Testing Patterns

### CRUD Operations

```javascript
describe('Product CRUD', () => {
  let productId;
  
  it('CREATE: creates new product', async () => {
    const response = await api.post('/products', {
      name: 'Widget',
      price: 10.00
    });
    expect(response.status).toBe(201);
    expect(response.headers.location).toMatch(/\/products\/\w+/);
    productId = response.body.id;
  });
  
  it('READ: retrieves product', async () => {
    const response = await api.get(`/products/${productId}`);
    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Widget');
  });
  
  it('UPDATE: modifies product', async () => {
    const response = await api.put(`/products/${productId}`, {
      name: 'Widget',
      price: 12.00
    });
    expect(response.status).toBe(200);
    expect(response.body.price).toBe(12.00);
  });
  
  it('DELETE: removes product', async () => {
    const response = await api.delete(`/products/${productId}`);
    expect(response.status).toBe(204);
    
    const getResponse = await api.get(`/products/${productId}`);
    expect(getResponse.status).toBe(404);
  });
});
```

### Pagination

```javascript
describe('Pagination', () => {
  it('returns first page by default', async () => {
    const response = await api.get('/products');
    expect(response.body.items).toHaveLength(20); // Default page size
    expect(response.body.page).toBe(1);
  });
  
  it('supports custom page size', async () => {
    const response = await api.get('/products?pageSize=50');
    expect(response.body.items).toHaveLength(50);
  });
  
  it('includes pagination metadata', async () => {
    const response = await api.get('/products');
    expect(response.body).toHaveProperty('totalItems');
    expect(response.body).toHaveProperty('totalPages');
    expect(response.body).toHaveProperty('nextPage');
  });
});
```

### Filtering & Sorting

```javascript
describe('Filtering and sorting', () => {
  it('filters by category', async () => {
    const response = await api.get('/products?category=electronics');
    expect(response.body.items.every(p => p.category === 'electronics')).toBe(true);
  });
  
  it('sorts by price ascending', async () => {
    const response = await api.get('/products?sort=price:asc');
    const prices = response.body.items.map(p => p.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });
  
  it('combines multiple filters', async () => {
    const response = await api.get('/products?category=electronics&minPrice=100');
    expect(response.body.items.every(p => 
      p.category === 'electronics' && p.price >= 100
    )).toBe(true);
  });
});
```

## GraphQL Testing Patterns

```javascript
describe('GraphQL API', () => {
  it('queries nested data', async () => {
    const query = `
      query {
        order(id: "123") {
          id
          items {
            product {
              name
              price
            }
            quantity
          }
          total
        }
      }
    `;
    
    const response = await graphql.query(query);
    expect(response.data.order.items).toBeDefined();
  });
  
  it('handles query complexity limits', async () => {
    const complexQuery = `
      query {
        orders {
          items {
            product {
              reviews {
                author {
                  orders { ... }
                }
              }
            }
          }
        }
      }
    `;
    
    const response = await graphql.query(complexQuery);
    expect(response.errors[0].message).toMatch(/query too complex/i);
  });
});
```

## Performance Testing

```javascript
describe('API performance', () => {
  it('responds within acceptable time', async () => {
    const start = Date.now();
    await api.get('/products');
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(200); // 200ms SLA
  });
  
  it('handles load of 100 concurrent requests', async () => {
    const requests = Array(100).fill().map(() => api.get('/products'));
    const responses = await Promise.all(requests);
    
    const successful = responses.filter(r => r.status === 200);
    expect(successful.length).toBeGreaterThan(95); // 95% success rate
  });
});
```

## Testing Tools

### REST APIs
- **Supertest** (Node.js) - HTTP assertions
- **REST-assured** (Java) - Fluent API testing
- **Postman/Newman** - Collection-based testing
- **Playwright API** - E2E with API calls

### Contract Testing
- **Pact** - Consumer-driven contracts
- **Spring Cloud Contract** - JVM contract testing

### Load Testing
- **k6** - Modern load testing
- **Apache JMeter** - Enterprise load testing
- **Artillery** - Modern performance testing

## Common Pitfalls

### ❌ Testing Implementation, Not Contract
Don't test internal database queries. Test the API response.

### ❌ Ignoring HTTP Semantics
Use correct status codes (200, 201, 400, 404, 500) and methods (GET, POST, PUT, DELETE).

### ❌ No Negative Testing
Always test error cases, not just happy paths.

### ❌ Brittle Tests
Don't assert on field order or extra fields. Focus on contract.

### ❌ Slow Tests
Mock external services. Don't wait for real third-party APIs.

## Best Practices

### ✅ Test from Consumer Perspective
Write tests as if you're using the API, not implementing it.

### ✅ Use Schema Validation
Validate response structure, not exact values.

### ✅ Test Error Scenarios
Network failures, timeouts, invalid input, authorization errors.

### ✅ Version Your API Tests
Keep tests for each API version to prevent breaking changes.

### ✅ Automate in CI/CD
Run API tests on every commit, not just before release.

## Real-World Example: E-Commerce API

```javascript
describe('E-Commerce Order API', () => {
  describe('Happy path', () => {
    it('complete order flow', async () => {
      // Add to cart
      const cart = await api.post('/cart', { productId: 'abc', quantity: 2 });
      
      // Apply discount
      await api.post('/cart/discount', { code: 'SAVE10' });
      
      // Checkout
      const order = await api.post('/orders', {
        cartId: cart.body.id,
        payment: { method: 'card', token: 'tok_123' }
      });
      
      expect(order.status).toBe(201);
      expect(order.body.status).toBe('pending');
    });
  });
  
  describe('Edge cases', () => {
    it('handles out of stock during checkout', async () => {
      // Product sold out between cart and checkout
      const order = await api.post('/orders', {
        cartId: 'cart-with-sold-out-item'
      });
      
      expect(order.status).toBe(409); // Conflict
      expect(order.body.error).toMatch(/out of stock/i);
    });
  });
});
```

## Using with QE Agents

### Automated Contract Testing

**qe-api-contract-validator** ensures API contracts are maintained:
```typescript
// Agent validates API contract against specification
await agent.validateContract({
  spec: 'openapi.yaml',
  endpoint: '/orders',
  method: 'POST',
  checkBreakingChanges: true
});

// Returns:
// {
//   valid: false,
//   breakingChanges: [
//     'Field "orderId" changed from string to number'
//   ],
//   warnings: ['New optional field "metadata" added']
// }
```

### Agent-Generated API Test Suites

**qe-test-generator** creates comprehensive API tests:
```typescript
// Generate tests from OpenAPI spec
await agent.generateFromSpec({
  spec: 'openapi.yaml',
  coverage: 'comprehensive',
  include: [
    'happy-paths',
    'input-validation',
    'auth-scenarios',
    'error-handling',
    'idempotency',
    'concurrency'
  ]
});

// → Creates 200+ tests covering all API patterns
```

### Real-Time API Test Execution

**qe-test-executor** runs API tests with smart retry logic:
```typescript
// Execute API tests with intelligent retry for flakiness
await agent.executeAPITests({
  suite: 'integration',
  parallel: true,
  retryStrategy: 'exponential-backoff',
  flakyDetection: true
});

// → Detects and reports network-related flakiness
// → Auto-retries transient failures (503, timeout)
// → Fails fast on persistent errors (401, 404)
```

### Contract-Based Integration Testing

```typescript
// Agent coordinates contract testing between services
const contractFleet = await FleetManager.coordinate({
  strategy: 'contract-testing',
  agents: [
    'qe-api-contract-validator',  // Validate contracts
    'qe-test-generator',          // Generate consumer tests
    'qe-test-executor'            // Execute against provider
  ],
  topology: 'mesh'  // Consumer-provider pairs
});

// Microservices contract validation
await contractFleet.execute({
  services: [
    { name: 'orders-api', consumers: ['checkout-ui', 'admin-api'] },
    { name: 'payment-api', consumers: ['orders-api'] }
  ]
});
```

### Performance Testing for APIs

**qe-performance-tester** load tests critical endpoints:
```typescript
// Agent runs load tests on API endpoints
await agent.loadTest({
  endpoint: '/orders',
  method: 'POST',
  rps: 1000,  // 1000 requests per second
  duration: '5min',
  scenarios: [
    'create-order',
    'concurrent-checkouts',
    'bulk-operations'
  ]
});

// Returns:
// {
//   avgResponseTime: '45ms',
//   p95: '120ms',
//   p99: '250ms',
//   errorRate: 0.02,  // 2% error rate
//   bottlenecks: ['database connection pool']
// }
```

### Security Testing for APIs

**qe-security-scanner** tests API vulnerabilities:
```typescript
// Agent scans for API security issues
await agent.scanAPI({
  spec: 'openapi.yaml',
  checks: [
    'sql-injection',
    'xss',
    'broken-auth',
    'excessive-data-exposure',
    'rate-limiting',
    'input-validation'
  ]
});

// Identifies:
// - Missing rate limiting on /login
// - No input sanitization on /search
// - Exposed internal IDs in responses
```

### Continuous Contract Monitoring

**qe-production-intelligence** monitors live API contracts:
```typescript
// Agent monitors production API for contract drift
await agent.monitorAPIContract({
  endpoint: '/orders',
  spec: 'openapi.yaml',
  alertOn: 'breaking-changes',
  sampleRate: 0.01  // Monitor 1% of traffic
});

// Alerts:
// "⚠️  Production API returning extra field not in spec: 'internalProcessId'"
// "🔴 Breaking change detected: 'quantity' changed from int to string"
```

---

## Related Skills

**Core Quality Practices:**
- [agentic-quality-engineering](../agentic-quality-engineering/) - API testing with agent coordination
- [holistic-testing-pact](../holistic-testing-pact/) - APIs in test quadrants

**Testing Approaches:**
- [test-automation-strategy](../test-automation-strategy/) - API tests in automation pyramid
- [risk-based-testing](../risk-based-testing/) - Risk-based API test prioritization
- [performance-testing](../performance-testing/) - API load testing patterns
- [security-testing](../security-testing/) - API security validation

**Development Practices:**
- [tdd-london-chicago](../tdd-london-chicago/) - London school for API testing (mocking)
- [code-review-quality](../code-review-quality/) - Review API test quality

---

## Remember

API testing is about verifying contracts and behavior, not implementation details. Focus on what matters to API consumers: correct responses, proper error handling, and acceptable performance.

**With Agents**: Agents automate contract validation, generate comprehensive API test suites from specifications, and continuously monitor production APIs for contract drift. Use agents to maintain API quality across microservices at scale.
