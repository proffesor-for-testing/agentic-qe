# ADR-133: CRDT correctness hardening

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-133 |
| **Status** | Implemented |
| **Date** | 2026-10-11 |
| **Author** | Rudy Celekli (decisions); consolidated by AQE Core |
| **Review Cadence** | 6 months |
| **Supersedes** | — |
| **Related** | [#943](https://github.com/proffesor-for-testing/agentic-qe/pull/943), [#945](https://github.com/proffesor-for-testing/agentic-qe/pull/945), [#949](https://github.com/proffesor-for-testing/agentic-qe/pull/949), [#952](https://github.com/proffesor-for-testing/agentic-qe/pull/952); follow-ups in [#987](https://github.com/proffesor-for-testing/agentic-qe/issues/987) |

---

## WH(Y) Decision Statement

**In the context of** the CRDT layer in `src/memory/crdt/` (LWW registers, OR-sets,
G/PN-counters, the CRDT store's delta history and the convergence tracker) that
replicates shared agent memory between peers,

**facing** four ways replicas could silently disagree or lose data: LWW ties with
no total order, OR-set tag reuse after a checkpoint restore, convergence
fingerprints that alias distinct states, and delta responses that claim to cover
history they had already trimmed,

**we decided for** a total code-unit order on LWW tie-breaks with the register
version (not timestamp zero) marking an unwritten register; resuming OR-set tag
counters past every imported local tag; a structured, sorted, SHA-256 semantic
fingerprint; and a full-state delta when a peer's checkpoint precedes the
retained history,

**and neglected** disallowing zero timestamps, normalizing owner IDs, UUID tags,
a hash-only fingerprint change, null or throwing delta responses, and a new
resynchronization wire message,

**to achieve** deterministic convergence for every write, fresh tag identities
after restore, convergence reports that only say "converged" when states match,
and complete delivery to lagging peers, all without changing the persisted
state or delta envelope formats,

**accepting that** equal-timestamp LWW ties can resolve differently between old
and new replicas until every node is upgraded, fingerprint strings change, and
lagging peers receive a response proportional to current state.

---

## Context

The CRDT store promises eventual convergence: any two replicas that have seen the
same writes end up with the same state, and the convergence tracker reports when
that holds. An October 2026 review found four independent places where this
promise broke without any error. Each was fixed in its own PR; this ADR records
the decisions behind them in one place, because they share the same invariants
and the same compatibility constraint: the persisted CRDT state and the delta
envelope that peers exchange must not change shape.

The sections below are one per PR. Each keeps the decision, the alternatives and
the consequences. Test evidence lives in the PRs.

---

## 1. LWW register: total write order ([#943](https://github.com/proffesor-for-testing/agentic-qe/pull/943))

### Context

The LWW register accepts explicit numeric timestamps, including zero. It treated
timestamp zero as "never written", so an older write or a repeated delivery could
replace a value written at time zero, and two replicas exchanging zero-timestamp
states could end up with opposite values. Separately, equal timestamps were broken
by `localeCompare` on the owner (node) ID. Locale collation is not a total order
on opaque identifiers: canonically equivalent but distinct Unicode IDs compare as
equal, so replicas could not agree on a winner.

### Decision

- Use the existing `version === 0` to identify an unwritten register, instead of
  `timestamp === 0`. A written `undefined` value counts as a write like any other.
- When timestamps tie, compare distinct owner IDs by JavaScript code-unit order
  (`<` / `>` on strings).
- Keep timestamp precedence and the persisted state format unchanged.

### Alternatives

- **Disallow zero timestamps.** Rejected: narrows the existing API.
- **Normalize owner IDs (for example NFC).** Rejected: would merge identifiers
  that are distinct today.
- **Keep locale collation.** Rejected: cannot supply a total order for opaque IDs.

### Consequences

- Epoch-zero writes obey the same stale-write and replay rules as any other write.
- Distinct owner IDs, including Unicode ones, always have a deterministic winner
  and keep their stored spelling.
- **Rolling upgrades:** code-unit order and `localeCompare` disagree on many plain
  ASCII pairs, not only non-ASCII ones. For example `'a'` vs `'B'` (locale puts
  `a` first, code units put `B` first) and `'node-1'` vs `'node_1'` (locale puts
  `node_1` first, code units put `node-1` first). While old and new replicas run
  side by side, an equal-timestamp tie between such owners can pick different
  winners on each side. This is transient: once every node runs the new
  comparison, the next merge converges. Ties need identical timestamps, so the
  window is narrow in practice.
- Out of scope: timestamp validation, owner authentication, and convergence with
  incompatible implementations.

---

## 2. OR-set: resume tag counters after restore ([#945](https://github.com/proffesor-for-testing/agentic-qe/pull/945))

### Context

An OR-set addition is identified by a tag `owner:timestamp:counter`, where the
counter is local. Restoring a checkpoint reset the counter to zero. An addition by
the same owner in the same clock tick could then reuse a tag that had been
removed, so the new element was invisible immediately. Reusing a tag that was
still live also let an older, already-observed removal erase an independently
acknowledged re-addition.

### Decision

- When importing element tags or tombstones, advance the local counter past every
  valid tag that belongs to the local owner.
- Recognize the existing `owner:timestamp:counter` format: match the complete
  owner prefix (owner IDs may contain colons), then require an integer timestamp
  and a non-negative safe-integer counter.
- Keep all imported tags unchanged.

### Alternatives

- **Switch tags to UUIDs.** Rejected: changes the documented allocation format.
- **Rely on wall-clock time advancing.** Rejected: does not survive a restore
  within the same tick or a clock rollback.
- **Resume from live element tags only.** Rejected: misses compacted states that
  keep only tombstones.

### Consequences

- Additions after a restore get fresh identities; the checkpoint schema and merge
  membership rules are unchanged.
- Foreign and malformed tags merge as before but do not move the local counter.
- Tags at the safe-integer boundary are not used to push the counter past it.
- Out of scope: several processes deliberately sharing one owner ID,
  authenticating imported state, and unlimited counter space.

---

## 3. Convergence tracker: unambiguous fingerprints ([#949](https://github.com/proffesor-for-testing/agentic-qe/pull/949))

### Context

The convergence tracker decides whether replicas have converged by comparing
state fingerprints. The old encoding joined entries with delimiters, so one set
element `a,s:b` produced the same text as two elements `a` and `b`. It then used a
32-bit polynomial hash, under which sets containing `Aa` and `BB` collide. Both
pairs of distinct states were reported as converged.

### Decision

- Encode each semantic entry as a structured JSON tuple.
- Sort entries, and the owner and member collections inside them, deterministically.
- Hash the structured encoding with SHA-256.
- Keep the same comparison fields: register value and winner, non-zero counter
  contributions, and active typed set members. Keep ignoring set allocation tags,
  tombstoned members, zero counter contributions and the store version.

### Alternatives

- **Change only the hash.** Rejected: the delimiter aliasing remains.
- **Escape the existing delimiter format.** Rejected: adds a second bespoke
  serialization contract.
- **Compare full state strings instead of digests.** Rejected: retains more
  diagnostic data and exposes values unnecessarily.

### Consequences

- Fingerprint strings change and are longer. Fingerprints are computed locally,
  not persisted or merged, so no migration is needed.
- The digest is collision-resistant evidence of semantic equality. It is not
  authentication or a proof of eventual convergence.
- Register values keep their existing JSON serialization; non-JSON values get no
  new semantics. (Values that JSON cannot distinguish, such as `NaN` and
  `Infinity`, still hash alike; see Known gaps.)

---

## 4. Delta history: full state across a trimmed checkpoint ([#952](https://github.com/proffesor-for-testing/agentic-qe/pull/952))

### Context

Delta history is bounded by `maxDeltaHistory`. When a peer asked for changes since
a version older than the oldest retained delta, `getDelta` returned the retained
suffix and labeled it as covering the whole requested interval. A fresh peer
silently missed earlier values, and an existing peer missed OR-set removal
tombstones that had been trimmed away.

### Decision

- If the requested version precedes the oldest retained delta's starting version,
  return the current complete state in the existing delta envelope: registers,
  G-counters, PN-counters, and OR-sets with their tombstones.
- Keep incremental deltas inside the retained window, and keep returning `null`
  for peers that are up to date.

### Alternatives

- **Return the suffix (old behavior).** Rejected: falsely claims complete coverage.
- **Return `null`.** Rejected: indistinguishable from "up to date".
- **Throw, or add a resynchronization wire message.** Rejected: changes the
  consumer API, while the existing merge operations already accept full CRDT maps.

### Consequences

- Lagging peers receive a larger response, proportional to current state.
- Repeat delivery is safe: counter merges are idempotent and OR-set tombstones
  carry removals.
- The store's local key deletion has no distributed tombstone, so deleted
  container keys are still not propagated. This change does not add that protocol.
- Behavior with empty or disabled history is unchanged.

---

## Known gaps

Issues found while reviewing this batch, all present before it and none a
regression, are tracked in
[#987](https://github.com/proffesor-for-testing/agentic-qe/issues/987): an unwritten
LWW state is not yet treated as the merge identity, same-node same-millisecond
writes are dropped while change events still fire, `NaN` timestamps never
converge (and `NaN`/`Infinity` fingerprint alike), persisted unwritten registers
fail `isLWWRegisterState`, and a delta source restarted without persistence
returns `null` until it passes the peer's checkpoint.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Relates To | [ADR-064](./ADR-064-agentic-teams-integration.md) | Agent Teams Integration for AQE Fleet | Names CRDT sync as part of the Queen's coordination state |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| PR-943 | fix(crdt): totally order LWW register writes | Pull Request | [#943](https://github.com/proffesor-for-testing/agentic-qe/pull/943) |
| PR-945 | fix(crdt): resume OR-set tag counters after restore | Pull Request | [#945](https://github.com/proffesor-for-testing/agentic-qe/pull/945) |
| PR-949 | fix(crdt): fingerprint unambiguous convergence state | Pull Request | [#949](https://github.com/proffesor-for-testing/agentic-qe/pull/949) |
| PR-952 | fix(crdt): preserve delivery across trimmed delta history | Pull Request | [#952](https://github.com/proffesor-for-testing/agentic-qe/pull/952) |
| ISSUE-987 | CRDT follow-ups after #943/#945/#949/#952 | Issue | [#987](https://github.com/proffesor-for-testing/agentic-qe/issues/987) |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Implemented | 2026-10-11 | Merged in #943, #945, #949, #952; consolidated from four unnumbered ADRs |
