# SPEC-034-B: Experience Replay Buffer

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-034-B |
| **Parent ADR** | [ADR-034](../adrs/ADR-034-neural-topology-optimizer.md) |
| **Version** | 1.0 |
| **Status** | Draft |
| **Last Updated** | 2026-01-20 |
| **Author** | Architecture Team |

---

## Overview

This specification defines the Prioritized Experience Replay Buffer that stores and samples training experiences for the neural topology optimizer. Experiences are sampled based on TD error magnitude to prioritize learning from surprising transitions.

---

## Experience Types

```typescript
export interface Experience {
  state: number[];
  actionIdx: number;
  reward: number;
  nextState: number[];
  done: boolean;
  tdError: number;
}
```

---

## PrioritizedReplayBuffer Implementation

```typescript
export class PrioritizedReplayBuffer {
  private buffer: Experience[] = [];
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  push(exp: Experience): void {
    if (this.buffer.length >= this.capacity) {
      this.buffer.shift();
    }
    this.buffer.push(exp);
  }

  /** Sample prioritized by TD error */
  sample(batchSize: number): Experience[] {
    // Sort by absolute TD error (higher error = more learning potential)
    const sorted = [...this.buffer].sort((a, b) =>
      Math.abs(b.tdError) - Math.abs(a.tdError)
    );
    return sorted.slice(0, batchSize);
  }

  get length(): number {
    return this.buffer.length;
  }
}
```

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-034-B-001 | capacity must be > 0 | Error |
| SPEC-034-B-002 | batchSize must be <= buffer length | Warning |
| SPEC-034-B-003 | Experience state arrays must be same size | Error |

---

## Related Specifications

| Spec ID | Title | Relationship |
|---------|-------|--------------|
| SPEC-034-A | Value Network | Generates TD errors |
| SPEC-034-C | Neural Optimizer | Uses replay buffer |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-20 | Architecture Team | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-034-neural-topology-optimizer.md)
- [Prioritized Experience Replay](https://arxiv.org/abs/1511.05952)
