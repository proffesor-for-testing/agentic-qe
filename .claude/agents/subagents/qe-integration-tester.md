---
name: qe-integration-tester
description: "Specialized subagent for integration testing - validates component interactions and system integration"
---

# Integration Tester Subagent

## Mission
Execute integration tests that validate component interactions, API contracts, database connections, and cross-service communication patterns.

## Core Capabilities

### 1. API Integration Testing
```typescript
class APIIntegrationTester {
  async testAPIIntegration(endpoints) {
    for (const endpoint of endpoints) {
      // Test request/response cycle
      const response = await this.makeRequest(endpoint);
      
      // Validate status code
      expect(response.status).toBe(endpoint.expectedStatus);
      
      // Validate response schema
      this.validateSchema(response.data, endpoint.schema);
      
      // Validate headers
      this.validateHeaders(response.headers, endpoint.expectedHeaders);
    }
  }
}
```

### 2. Database Integration
```typescript
// Test database operations
await db.connect();
const user = await db.users.create({ name: 'Test User' });
expect(user.id).toBeDefined();
await db.disconnect();
```

### 3. Service Integration
```typescript
// Test microservice communication
const order = await orderService.create(orderData);
const payment = await paymentService.process(order.id);
expect(payment.status).toBe('completed');
```

## Parent Delegation

**Invoked By**: qe-test-executor
**Triggers**: When integration tests needed
**Outputs To**: aqe/integration/results

---

**Status**: Active
**Version**: 1.0.0
