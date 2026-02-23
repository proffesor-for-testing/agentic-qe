# ADR-070: Cryptographic Witness Chain for Audit Compliance

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-070 |
| **Status** | Proposed |
| **Date** | 2026-02-22 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** AQE v3's learning system, which stores 150K+ patterns with confidence scores that are modified by agent actions, dream cycles, routing decisions, and asymmetric Hebbian updates, with no tamper-evident record of how any individual pattern's confidence arrived at its current value,

**facing** the inability to answer the question "why does this pattern have confidence 0.73?" without manually replaying all historical events, the lack of tamper detection if a bug or malicious action silently modifies pattern confidence, and growing enterprise requirements for auditable AI decision trails as regulatory frameworks mature,

**we decided for** implementing a cryptographic witness chain using RVF's WITNESS_SEG (SHAKE-256 hash chain with Ed25519 signing), where every pattern mutation (creation, confidence update, quarantine, promotion, dream merge, branch merge) appends a signed witness entry creating an immutable, verifiable audit trail for pattern lineage,

**and neglected** (a) application-level logging without cryptographic guarantees (rejected: logs can be silently modified or truncated without detection), (b) blockchain-based audit trail (rejected: massive overhead for an embedded system, unnecessary decentralization for a single-tenant application), (c) no audit trail (status quo, rejected: cannot satisfy enterprise compliance requirements or debug pattern confidence drift),

**to achieve** tamper-evident pattern lineage where any modification to the historical chain is cryptographically detectable, complete provenance for every pattern from creation through all confidence mutations to current state, enterprise audit compliance readiness for AI decision accountability, and a foundation for cross-organization pattern trust when portable intelligence containers (ADR-073) enable sharing,

**accepting that** witness chain appends add write latency (estimated 0.1-0.5ms per entry via SHAKE-256), the chain grows monotonically and requires periodic compaction (archiving old entries), Ed25519 key management adds operational complexity, and retroactive application to existing 150K records requires a one-time backfill.

---

## Context

AQE v3's ReasoningBank stores patterns with confidence scores that evolve over time. A pattern might be created at confidence 0.5, boosted to 0.8 by 30 successes, dropped to 0.2 by 3 failures (10:1 Hebbian per ADR-061), quarantined, rehabilitated, then boosted again to 0.6. Today, only the current confidence value is stored. The history of how it got there is lost.

This creates three problems:

1. **Debuggability**: When a pattern produces unexpected results, engineers cannot determine what sequence of events shaped its current confidence. Was it a dream cycle? A rogue agent? A period of infrastructure flakiness that triggered asymmetric penalties?

2. **Tamper detection**: If a software bug silently sets all patterns in a domain to confidence 1.0, there is no mechanism to detect this has happened until downstream quality degrades. By the time it is noticed, the original values are lost.

3. **Compliance**: Enterprise environments increasingly require auditable decision trails for AI systems. SOC 2 Type II, ISO 27001, and emerging AI governance frameworks require demonstrating that automated decisions (which AQE's quality gates are) have traceable, tamper-evident provenance.

RVF's WITNESS_SEG provides exactly this capability. Each witness entry contains a SHAKE-256 hash of the previous entry (creating a chain), an Ed25519 signature over the entry content, a timestamp, an actor identifier, and the mutation payload. Tampering with any entry in the chain invalidates all subsequent hashes.

### Witness Entry Structure

```
WitnessEntry {
  sequenceId:    uint64        // Monotonic sequence number
  previousHash:  bytes[32]     // SHAKE-256 of previous entry
  timestamp:     uint64        // Unix epoch microseconds
  actorId:       string        // Agent ID, dream cycle ID, or system
  mutationType:  enum          // create | update | quarantine | promote | merge | prune
  targetPattern: string        // Pattern ID
  payload:       bytes         // Mutation-specific data (e.g., old/new confidence)
  signature:     bytes[64]     // Ed25519 signature over all above fields
}
```

---

## Options Considered

### Option 1: RVF WITNESS_SEG Cryptographic Chain (Selected)

Use RVF's built-in WITNESS_SEG to maintain an append-only, hash-chained, Ed25519-signed log of all pattern mutations.

**Pros:**
- Tamper-evident: any modification to history invalidates the hash chain
- Ed25519 signatures attribute each mutation to a specific actor
- Built into RVF format -- no external infrastructure needed
- SHAKE-256 provides collision resistance suitable for audit purposes
- 64-byte-aligned segments integrate efficiently with RVF's append-only architecture
- Supports TEE attestation for hardware-backed trust in sensitive environments

**Cons:**
- Write latency increase of 0.1-0.5ms per pattern mutation
- Chain grows monotonically (requires archival/compaction strategy)
- Ed25519 key management (generation, rotation, revocation) adds operational complexity
- Retroactive backfill for existing 150K records creates a large initial chain

### Option 2: Application-Level Logging (Rejected)

Write pattern mutation events to a standard log file or SQLite audit table.

**Why rejected:** Logs and database rows can be silently modified without detection. A bug that overwrites pattern confidences could also overwrite the audit log. No cryptographic guarantee of integrity. Does not satisfy tamper-evidence requirements for enterprise compliance.

### Option 3: Blockchain-Based Audit Trail (Rejected)

Record pattern mutations on a private blockchain (e.g., Hyperledger).

**Why rejected:** Massive infrastructure overhead for a single-tenant embedded application. Blockchain consensus mechanisms (even private ones) add seconds of latency per write. The decentralization guarantees of a blockchain are unnecessary when the threat model is internal bugs and audit compliance, not Byzantine external actors. RVF's witness chain provides equivalent tamper-evidence without the overhead.

### Option 4: No Audit Trail (Status Quo, Rejected)

Continue without pattern lineage tracking.

**Why rejected:** Cannot debug confidence drift. Cannot detect silent corruption. Cannot satisfy enterprise audit requirements. As AQE moves toward portable intelligence containers, provenance becomes essential for cross-organization pattern trust.

---

## Implementation

### Witness Chain Service

```typescript
// v3/src/audit/witness-chain-service.ts
interface WitnessChainService {
  /** Append a witness entry for a pattern mutation */
  recordMutation(mutation: PatternMutation): Promise<WitnessEntry>;

  /** Verify chain integrity from genesis to tip */
  verifyChain(options?: VerifyOptions): Promise<ChainVerificationResult>;

  /** Query witness entries for a specific pattern */
  getPatternLineage(patternId: string): Promise<WitnessEntry[]>;

  /** Query witness entries by actor */
  getActorHistory(actorId: string, since?: number): Promise<WitnessEntry[]>;

  /** Archive entries older than cutoff to cold storage */
  archiveEntries(olderThan: number): Promise<ArchiveResult>;
}

interface PatternMutation {
  actorId: string;
  mutationType: 'create' | 'update' | 'quarantine' | 'promote' | 'merge' | 'prune';
  patternId: string;
  payload: {
    oldConfidence?: number;
    newConfidence?: number;
    reason?: string;
    sourceContext?: string;   // e.g., "dream-cycle-42", "agent-coder-7"
  };
}

interface ChainVerificationResult {
  valid: boolean;
  entriesVerified: number;
  firstInvalidEntry?: number;   // Sequence ID of first tampered entry
  verificationTimeMs: number;
}
```

### Integration Points

Every subsystem that modifies pattern confidence must call the witness chain:

```typescript
// Example: ReasoningBank confidence update with witness recording
class AuditedReasoningBank extends ReasoningBank {
  async updateConfidence(
    patternId: string,
    delta: number,
    actorId: string,
    reason: string
  ): Promise<void> {
    const oldConfidence = await this.getConfidence(patternId);
    await super.updateConfidence(patternId, delta);
    const newConfidence = await this.getConfidence(patternId);

    await this.witnessChain.recordMutation({
      actorId,
      mutationType: 'update',
      patternId,
      payload: { oldConfidence, newConfidence, reason },
    });
  }
}
```

Integration points requiring witness recording:
- ReasoningBank: confidence updates, pattern creation, quarantine, promotion
- Dream Engine: dream merge results (ADR-069)
- Agent branches: branch merge results (ADR-067)
- Asymmetric learning: Hebbian penalty events (ADR-061)
- Quality gates: gate pass/fail decisions that affect pattern scores

### Key Management

```typescript
// v3/src/audit/witness-key-manager.ts
interface WitnessKeyManager {
  /** Generate a new Ed25519 signing keypair */
  generateKeyPair(): Promise<KeyPairHandle>;

  /** Sign a witness entry */
  sign(entry: UnsignedWitnessEntry, keyId: string): Promise<SignedWitnessEntry>;

  /** Verify an entry signature */
  verify(entry: SignedWitnessEntry): Promise<boolean>;

  /** Rotate signing key (old key archived, new key for future entries) */
  rotateKey(): Promise<KeyRotationResult>;
}
```

Keys are stored in `.agentic-qe/witness-keys/` with filesystem permissions restricted to the AQE process. Key rotation creates a new keypair and records the rotation event in the witness chain itself.

### Retroactive Backfill

For the existing 150K records, a one-time migration creates genesis witness entries:

```typescript
async function backfillWitnessChain(
  reasoningBank: ReasoningBank,
  witnessChain: WitnessChainService
): Promise<BackfillResult> {
  const patterns = await reasoningBank.getAllPatterns();
  for (const pattern of patterns) {
    await witnessChain.recordMutation({
      actorId: 'system:backfill',
      mutationType: 'create',
      patternId: pattern.id,
      payload: {
        newConfidence: pattern.confidence,
        reason: 'Retroactive genesis entry from pre-witness migration',
      },
    });
  }
}
```

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-065 | RVF Integration Strategy -- Hybrid Architecture | WITNESS_SEG requires RVF persistence layer |
| Relates To | ADR-066 | RVF-backed Pattern Store | Witness entries reference patterns in RVF store |
| Relates To | ADR-067 | Agent Memory Branching | Branch merges recorded in witness chain |
| Relates To | ADR-069 | RVCOW Dream Cycle Branching | Dream merges recorded in witness chain |
| Relates To | ADR-061 | Asymmetric Learning Rates | Hebbian penalties recorded in witness chain |
| Relates To | ADR-021 | ReasoningBank | Primary integration point for pattern mutations |
| Part Of | MADR-001 | V3 Implementation Initiative | RVF integration Phase 1 |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| EXT-001 | RVF WITNESS_SEG Spec | Technical Spec | @ruvector/rvf package documentation |
| EXT-002 | SHAKE-256 (NIST SP 800-185) | Standard | NIST cryptographic standards |
| EXT-003 | Ed25519 (RFC 8032) | Standard | IETF signature standard |
| INT-001 | ReasoningBank | Existing Code | `v3/src/learning/reasoning-bank.ts` |
| INT-002 | Pattern Promotion | Existing Code | `v3/src/feedback/pattern-promotion.ts` |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-02-22 | Proposed | 2026-08-22 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-02-22 | Initial creation. Cryptographic witness chain for tamper-evident pattern lineage and enterprise audit compliance. |

---

## Definition of Done Checklist

Before requesting approval, verify:

### Core (ECADR)
- [ ] **E - Evidence**: Approach validated (PoC, prior art, or expert input)
- [ ] **C - Criteria**: At least 2 options compared systematically
- [ ] **A - Agreement**: Relevant stakeholders consulted
- [ ] **D - Documentation**: WH(Y) statement complete, ADR published
- [ ] **R - Review**: Review cadence set, owner assigned

### Extended
- [ ] **Dp - Dependencies**: All relationships documented with typed relationships
- [ ] **Rf - References**: Implementation details in SPEC files, all links valid
- [ ] **M - Master**: Linked to Master ADR if part of larger initiative
