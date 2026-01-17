# ADR-016: Collaborative Test Task Claims

**Status**: Accepted
**Date**: 2026-01-09
**Authors**: Agentic QE Architecture Team
**Related Issues**: v3 Master Plan Section 4.3

## Context

In a multi-agent QE system, test tasks arise dynamically from various sources:
- Coverage analysis identifies gaps needing tests
- Flaky test detection finds tests needing fixes
- Defect prediction identifies code needing investigation
- Test generation produces tests needing human review

Without coordination, multiple agents might work on the same task, or tasks might be forgotten. Human testers also need to participate in the workflow - reviewing AI-generated tests, investigating complex defects, or taking over when agents get stuck.

### Problems with Uncoordinated Work

1. **Duplicate Effort**: Multiple agents working on the same coverage gap
2. **Stale Work**: Agent claims a task but becomes stuck or fails silently
3. **No Human Integration**: No way for humans to review/approve agent work
4. **Lost Context**: When handoffs occur, context is lost
5. **Unbalanced Load**: Some agents overloaded while others idle

### Requirements

1. Tasks should be claimed exclusively to prevent duplicate work
2. Stale claims should be detectable and reclaimable
3. Humans and agents should be able to hand off work to each other
4. Idle agents should be able to steal work from overloaded queues
5. Full audit trail of who worked on what

## Decision

We implement a **Claim System** for test tasks with the following components:

### 1. Claim Types

Four claim types represent the core QE workflows:

```typescript
type ClaimType =
  | 'coverage-gap'        // Uncovered code needs tests
  | 'flaky-test'          // Flaky test needs fixing
  | 'defect-investigation'// Predicted defect to analyze
  | 'test-review';        // Generated tests need human review
```

### 2. Claim Lifecycle

```
┌─────────────┐     claim()      ┌─────────────┐
│  available  │ ────────────────>│   claimed   │
└─────────────┘                  └─────────────┘
       ↑                               │
       │                               │ start work
       │                               ↓
       │         ┌─────────────┐  ┌─────────────┐
       │         │  completed  │<─│ in-progress │
       │         └─────────────┘  └─────────────┘
       │                               │
       │ expire/abandon               │ block/release
       │         ┌─────────────┐      │
       └─────────│   expired   │<─────┘
                 │  abandoned  │
                 └─────────────┘
```

### 3. Core Components

#### ClaimService
- Create, claim, release, steal claims
- Automatic expiry of stale claims
- Event emission for all claim lifecycle changes

#### ClaimRepository
- In-memory implementation for testing
- Persistent implementation using MemoryBackend
- Filtering and sorting capabilities

#### WorkStealingCoordinator
- Tracks agent activity and idle time
- Identifies stale claims that can be stolen
- Matches idle agents to stealable claims by domain
- Respects priority and cross-domain policies

#### HandoffManager
- Agent requests human review
- Human requests agent assistance
- Preserves context across handoffs
- Tracks pending handoff requests

### 4. Claim Expiry

Claims have TTL based on claimant type:
- **Agent claims**: 5 minutes default (agents work fast)
- **Human claims**: 1 hour default (humans need more time)

Stale claims (no activity past threshold) can be:
1. Auto-expired (released back to available)
2. Stolen by idle agents

### 5. Work Stealing Algorithm

```typescript
async checkAndSteal(): Promise<number> {
  // 1. Find idle agents (no claims, idle > threshold)
  const idleAgents = this.getIdleAgents();

  // 2. Find stale claims (claimed but inactive)
  const staleClaims = await repository.findStale(thresholdMs);

  // 3. Match agents to claims by domain compatibility
  for (const agent of idleAgents) {
    const compatible = staleClaims.filter(c =>
      c.domain === agent.domain || allowCrossDomain
    );

    if (compatible.length > 0) {
      // Steal highest priority claim
      await claimService.steal({
        claimId: compatible[0].id,
        newClaimant: agent,
        reason: 'stale'
      });
    }
  }
}
```

### 6. Human-Agent Handoff Flow

```
Agent generates tests → requestHumanReview() → PendingHandoff created
                                                       ↓
Human picks up handoff ← getPendingByTargetType('human') ← notification
                                                       ↓
Human reviews, approves → completeHandoff() → Claim transferred to human
                                                       ↓
Human requests help → requestAgentAssist() → Agent takes over
```

## Implementation

### Directory Structure

```
v3/src/coordination/claims/
├── index.ts           # Module exports and factory
├── interfaces.ts      # Type definitions
├── claim-service.ts   # Core claim operations
├── claim-repository.ts# Persistence (in-memory + backend)
├── work-stealing.ts   # Load balancing
└── handoff-manager.ts # Human ↔ Agent transitions
```

### Usage Example

```typescript
import { createClaimsSystem } from '@agentic-qe/v3/coordination/claims';

// Initialize
const claims = createClaimsSystem(eventBus, {
  persistent: true,
  memory: memoryBackend,
  workStealing: { enabled: true },
});
await claims.initialize();

// Coverage gap detected - create claim
const claim = await claims.service.createClaim({
  type: 'coverage-gap',
  priority: 'p1',
  domain: 'test-generation',
  title: 'UserService.authenticate() needs tests',
  metadata: {
    filePath: 'src/services/user.service.ts',
    uncoveredLines: [45, 46, 47],
    currentCoverage: 65,
    targetCoverage: 80,
  },
});

// Test generator agent claims it
await claims.service.claim({
  claimId: claim.id,
  claimant: {
    id: 'test-gen-agent-1',
    type: 'agent',
    name: 'Test Generator',
    domain: 'test-generation',
    agentType: 'generator',
  },
});

// Agent generates tests, requests review
await claims.handoffManager.requestHumanReview(
  claim.id,
  'Tests generated - please review edge cases'
);

// Human completes review
await claims.handoffManager.completeHandoff(handoffId, {
  id: 'reviewer-jane',
  type: 'human',
  name: 'Jane Reviewer',
});
```

### Events Emitted

| Event | Description |
|-------|-------------|
| ClaimCreated | New claim available |
| ClaimClaimed | Claim taken by claimant |
| ClaimReleased | Claim released back to pool |
| ClaimCompleted | Work finished successfully |
| ClaimAbandoned | Work abandoned without completion |
| ClaimExpired | Claim timed out |
| ClaimStolen | Claim taken from stale claimant |
| ClaimHandoff | Claim transferred between claimants |
| ClaimStatusChanged | Status update (in-progress, blocked) |
| ClaimPriorityEscalated | Priority increased |

## Consequences

### Positive

1. **No duplicate work**: Exclusive claims prevent concurrent work
2. **No lost tasks**: Expiry and stealing ensure tasks complete
3. **Human integration**: Handoffs enable human-in-the-loop workflows
4. **Load balancing**: Work stealing distributes load across agents
5. **Audit trail**: Full history of who worked on what
6. **Flexibility**: Supports various claim types and workflows

### Negative

1. **Coordination overhead**: Claiming/releasing adds latency
2. **Complexity**: More moving parts to understand and debug
3. **Tuning required**: TTL, thresholds need adjustment per environment

### Mitigations

- Keep default configurations reasonable
- Emit rich events for debugging
- Provide metrics for monitoring claim throughput
- Allow disabling work stealing if not needed

## Alternatives Considered

### 1. Message Queue Based Assignment

Use a message queue (Redis Streams, Kafka) for task distribution.

**Rejected because:**
- External dependency complexity
- Less control over claim semantics
- Harder to implement handoffs

### 2. Central Scheduler

Single scheduler assigns all work to agents.

**Rejected because:**
- Single point of failure
- Doesn't handle human participants well
- Less flexible for dynamic workloads

### 3. Optimistic Concurrency (No Claims)

Let agents work freely, reconcile conflicts after.

**Rejected because:**
- Wasted effort on duplicates
- Complex conflict resolution
- Poor resource utilization

## References

- v3 Master Plan Section 4.3: Coordination Protocols
- ADR-001: Adapter Configuration (related patterns)
- Queen Coordinator (v3/src/coordination/queen-coordinator.ts)
- Work Stealing in Distributed Systems (Blumofe & Leiserson, 1999)
