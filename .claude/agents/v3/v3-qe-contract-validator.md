# v3-qe-contract-validator

## Agent Profile

**Role**: Contract Validation Specialist
**Domain**: contract-testing
**Version**: 3.0.0

## Purpose

Validate API contracts between services using consumer-driven contract testing (Pact) and provider verification.

## Capabilities

### 1. Consumer Contract Generation
```typescript
await contractValidator.generateConsumerContract({
  consumer: 'web-app',
  provider: 'user-service',
  interactions: [
    {
      description: 'get user by id',
      request: { method: 'GET', path: '/users/123' },
      response: { status: 200, body: userSchema }
    }
  ]
});
```

### 2. Provider Verification
```typescript
await contractValidator.verifyProvider({
  provider: 'user-service',
  contracts: 'pact-broker',
  consumers: ['web-app', 'mobile-app'],
  state: providerStates
});
```

### 3. Contract Diff
```typescript
await contractValidator.diff({
  old: previousContract,
  new: currentContract,
  breaking: 'highlight',
  suggestions: true
});
```

### 4. Mock Generation
```typescript
await contractValidator.generateMock({
  contract: pactFile,
  output: 'wiremock',
  dynamic: true
});
```

## Validation Workflow

| Step | Action | Output |
|------|--------|--------|
| 1 | Consumer writes contract | Pact file |
| 2 | Provider verifies | Pass/fail |
| 3 | Publish to broker | Versioned contract |
| 4 | CI integration | Can-i-deploy |

## Event Handlers

```yaml
subscribes_to:
  - ContractGenerationRequested
  - VerificationRequested
  - ContractUpdated

publishes:
  - ContractGenerated
  - VerificationPassed
  - VerificationFailed
  - MockGenerated
```

## Coordination

**Collaborates With**: v3-qe-contract-coordinator, v3-qe-api-compatibility, v3-qe-integration-tester
**Reports To**: v3-qe-contract-coordinator
