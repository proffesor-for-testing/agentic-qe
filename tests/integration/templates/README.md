# Integration Test Templates

Templates for testing MinCut and Consensus integration in domain coordinators.
These templates provide copy-paste ready test files that ensure consistent
testing patterns across all 12 AQE domains.

## Quick Start

1. Copy the relevant template to your domain's test folder
2. Replace placeholder values (marked with `REPLACE:` comments)
3. Implement domain-specific test cases
4. Run tests to verify integration

## Available Templates

### MinCut Integration (`mincut-domain-template.test.ts`)

Tests for MinCut topology analysis integration (ADR-047).

**Copy to:** `tests/integration/domains/[domain-name]/mincut-integration.test.ts`

**Test cases included:**
- Bridge injection (constructor/setter)
- Topology health reporting
- Domain-filtered weak vertex detection
- Topology-based routing
- Critical topology handling
- Queen health extension
- MCP tools integration

### Consensus Integration (`consensus-domain-template.test.ts`)

Tests for multi-model consensus verification (MM-001).

**Copy to:** `tests/integration/domains/[domain-name]/consensus-integration.test.ts`

**Test cases included:**
- Engine initialization
- Consensus requirement detection
- Finding verification
- Graceful degradation
- Batch verification
- Statistics tracking
- Consensus strategies
- Configuration management

## How to Use the Templates

### Step 1: Copy the Template

```bash
# For MinCut integration
cp v3/tests/integration/templates/mincut-domain-template.test.ts \
   v3/tests/integration/domains/test-generation/mincut-integration.test.ts

# For Consensus integration
cp v3/tests/integration/templates/consensus-domain-template.test.ts \
   v3/tests/integration/domains/security-compliance/consensus-integration.test.ts
```

### Step 2: Replace Placeholder Values

Look for comments marked `REPLACE:` and update:

```typescript
// BEFORE:
const DOMAIN_NAME: DomainName = 'test-generation'; // REPLACE with your domain

// AFTER:
const DOMAIN_NAME: DomainName = 'security-compliance';
```

### Step 3: Import Your Domain Coordinator

```typescript
// BEFORE:
// import { DomainCoordinator, createDomainCoordinator } from '../../../../src/domains/DOMAIN_NAME/coordinator';

// AFTER:
import {
  SecurityComplianceCoordinator,
  createSecurityComplianceCoordinator
} from '../../../../src/domains/security-compliance/coordinator';
```

### Step 4: Implement Domain-Specific Tests

Uncomment and implement the placeholder test assertions:

```typescript
// BEFORE (placeholder):
expect(true).toBe(true); // REPLACE: Remove this placeholder

// AFTER (implemented):
const coordinator = createSecurityComplianceCoordinator({
  minCutBridge: bridge,
});
expect(coordinator.hasMinCutIntegration()).toBe(true);
```

## Mock Helpers Reference

### MinCut Template Mocks

```typescript
// Create mock EventBus
const mockEventBus = createMockEventBus();

// Create mock AgentCoordinator with agents
const mockAgentCoordinator = createMockAgentCoordinator([
  createMockAgent({ id: 'agent-1', domain: 'test-generation' }),
  createMockAgent({ id: 'agent-2', domain: 'test-generation' }),
]);

// Create MinCut bridge with test config
const { bridge, mockEventBus, mockAgentCoordinator } = createTestBridge({
  agents: [createMockAgent({ domain: 'test-generation' })],
  useSharedGraph: true,
  config: { persistData: false },
});
```

### Consensus Template Mocks

```typescript
// Create mock providers
const mockProviders = createMockProviders([
  { id: 'claude', defaultAssessment: 'confirmed', defaultConfidence: 0.9 },
  { id: 'gpt', defaultAssessment: 'confirmed', defaultConfidence: 0.85 },
]);

// Create test engine
const engine = createTestEngine({
  providers: mockProviders,
  minModels: 2,
  verifySeverities: ['critical', 'high'],
});

// Create test finding
const finding = createTestFinding({
  id: 'finding-1',
  severity: 'critical',
  type: 'sql-injection',
});
```

## Example: Complete Integration Test

Here's an example of a completed MinCut integration test for the test-generation domain:

```typescript
// tests/integration/domains/test-generation/mincut-integration.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TestGenerationCoordinator,
  createTestGenerationCoordinator,
} from '../../../../src/domains/test-generation/coordinator';
import {
  createQueenMinCutBridge,
  resetMinCutState,
} from '../../../src/coordination/mincut';

// ... import mock helpers from template ...

const DOMAIN_NAME = 'test-generation' as const;

describe('test-generation MinCut Integration', () => {
  let coordinator: TestGenerationCoordinator;

  beforeEach(() => {
    resetSharedMinCutState();
  });

  afterEach(() => {
    resetSharedMinCutState();
  });

  describe('MinCut bridge injection', () => {
    it('should accept MinCut bridge injection', async () => {
      const { bridge } = createTestBridge();
      await bridge.initialize();

      coordinator = createTestGenerationCoordinator({
        minCutBridge: bridge,
        eventBus: createMockEventBus(),
      });

      expect(coordinator.hasMinCutIntegration()).toBe(true);
      expect(coordinator.getTopologyHealth()).toBeDefined();
    });

    it('should work without MinCut bridge', async () => {
      coordinator = createTestGenerationCoordinator({
        minCutBridge: undefined,
        eventBus: createMockEventBus(),
      });

      // Should still be operational
      expect(coordinator.isOperational()).toBe(true);

      // But topology features should be unavailable
      expect(coordinator.hasMinCutIntegration()).toBe(false);
    });
  });

  describe('topology-based test routing', () => {
    it('should route tests away from weak domains', async () => {
      const agents = [
        createMockAgent({ id: 'gen-1', domain: 'test-generation' }),
        createMockAgent({ id: 'exec-1', domain: 'test-execution' }),
      ];

      const { bridge } = createTestBridge({ agents });
      await bridge.initialize();

      // Make test-execution weak by not connecting it
      coordinator = createTestGenerationCoordinator({
        minCutBridge: bridge,
        eventBus: createMockEventBus(),
      });

      const routing = coordinator.getTestRoutingDecision({
        testCount: 100,
        preferredExecutor: 'test-execution',
      });

      // Should warn about weak target domain
      expect(routing.warnings).toContainEqual(
        expect.objectContaining({
          type: 'weak-topology',
          domain: 'test-execution',
        })
      );
    });
  });
});
```

## Domain Checklist

Track which domains have MinCut and Consensus integration tests:

| Domain | MinCut Tests | Consensus Tests |
|--------|--------------|-----------------|
| test-generation | [ ] | [ ] |
| test-execution | [ ] | [ ] |
| coverage-analysis | [ ] | [ ] |
| quality-assessment | [ ] | [ ] |
| defect-intelligence | [ ] | [ ] |
| learning-optimization | [ ] | [ ] |
| security-compliance | [ ] | [ ] |
| chaos-resilience | [ ] | [ ] |
| requirements-validation | [ ] | [ ] |
| code-intelligence | [ ] | [ ] |
| contract-testing | [ ] | [ ] |
| visual-accessibility | [ ] | [ ] |

## Running the Tests

```bash
# Run all integration tests
cd v3 && npm test -- --run tests/integration/

# Run specific domain's integration tests
cd v3 && npm test -- --run tests/integration/domains/test-generation/

# Run only MinCut integration tests
cd v3 && npm test -- --run --grep "MinCut Integration"

# Run only Consensus integration tests
cd v3 && npm test -- --run --grep "Consensus Integration"
```

## Best Practices

1. **Always reset state between tests** - Use `resetSharedMinCutState()` in `beforeEach`/`afterEach`

2. **Test graceful degradation** - Verify coordinators work without MinCut/Consensus

3. **Use realistic mock data** - Create agents and findings that match your domain

4. **Test edge cases** - Empty topology, single agent, all providers failing

5. **Verify integration, not just unit behavior** - Test that coordinator uses bridge correctly

## Related Documentation

- [ADR-047: MinCut Self-Organizing QE Integration](../../../docs/adr/ADR-047-mincut-self-organizing-qe.md)
- [MM-001: Multi-Model Consensus](../../../docs/plans/multi-model-consensus.md)
- [MinCut Queen Integration](../../../src/coordination/mincut/queen-integration.ts)
- [Consensus Engine](../../../src/coordination/consensus/consensus-engine.ts)
