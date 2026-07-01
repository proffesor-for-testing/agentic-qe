/**
 * Tamper-evident hash-chain audit gate — a faithful, dependency-free TypeScript
 * port of RuVector's `ruvector-proof-gate` `HashChainGate` (upstream ADR-194;
 * AQE-side integration decision: ADR-116).
 *
 * Why ported rather than bound: the Rust crate ships no NAPI/WASM binding, and
 * the algorithm is small and exact. This uses only Node's `crypto` (no native
 * dep) and opens NO database — the chain lives in memory and is serialized via
 * {@link HashChainGate.toJSON}/{@link HashChainGate.fromJSON} so a caller can
 * persist it through the existing unified `memory.db` (never a competing store).
 *
 * QE use-case: turn AQE's "verify row counts BEFORE and AFTER, never claim a
 * sync/migration succeeded without proof" mandate into a cryptographic
 * guarantee. Admit one payload per DB operation (table, op, row-count, content
 * digest); a later `verifyIntegrity()` proves no admitted entry was mutated,
 * reordered, or dropped.
 *
 * Commitment: commitment[n] = SHA256("ruvector:chain:" || commitment[n-1] ||
 * payload_hash[n] || u64le(n)), seeded from a fixed genesis. Verification is
 * O(n): replay from genesis. (Genesis differs from the Rust literal — we do not
 * interoperate with Rust receipts, only self-verify.)
 */

import { createHash } from 'node:crypto';

const CHAIN_TAG = Buffer.from('ruvector:chain:');
/** Re-derivation anchor. Self-consistent; not byte-compatible with the Rust crate. */
const GENESIS: Buffer = createHash('sha256').update('ruvector-proof-gate-v1').digest();

/** Any admissible payload. Objects are canonicalized (sorted keys) before hashing. */
export type GatePayload = string | Uint8Array | Record<string, unknown>;

export interface WriteReceipt {
  /** 0-based admission order. */
  sequence: number;
  /** SHA-256 of the canonical payload bytes (hex). */
  payloadHash: string;
  /** Chain commitment at this entry (hex) — binds it to every prior entry. */
  chainCommitment: string;
}

/** Serializable chain state for persistence through the unified store. */
export interface HashChainState {
  seq: number;
  head: string;
  chain: string[];
  payloadHashes: string[];
}

function u64le(n: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}

/** Deterministic, key-sorted serialization so equal payloads hash equally. */
function canonicalBytes(payload: GatePayload): Buffer {
  if (typeof payload === 'string') return Buffer.from(payload, 'utf8');
  if (payload instanceof Uint8Array) return Buffer.from(payload);
  return Buffer.from(canonicalJson(payload), 'utf8');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
}

function sha256(...parts: Buffer[]): Buffer {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest();
}

function commitmentOf(prev: Buffer, payloadHash: Buffer, seq: number): Buffer {
  return sha256(CHAIN_TAG, prev, payloadHash, u64le(seq));
}

/**
 * Sequential SHA-256 hash chain. O(1) per `admit`, O(n) `verifyIntegrity`.
 * In-memory; persist/restore via {@link toJSON}/{@link fromJSON}.
 */
export class HashChainGate {
  private seq = 0;
  private prev: Buffer = GENESIS;
  private readonly chain: Buffer[] = [];
  private readonly payloadHashes: Buffer[] = [];

  /** Admit a payload; returns a receipt committing the chain state. */
  admit(payload: GatePayload): WriteReceipt {
    const payloadHash = sha256(canonicalBytes(payload));
    const commitment = commitmentOf(this.prev, payloadHash, this.seq);
    this.prev = commitment;
    this.chain.push(commitment);
    this.payloadHashes.push(payloadHash);
    const receipt: WriteReceipt = {
      sequence: this.seq,
      payloadHash: payloadHash.toString('hex'),
      chainCommitment: commitment.toString('hex'),
    };
    this.seq += 1;
    return receipt;
  }

  /** True iff `receipt` matches the commitment recorded at its sequence. */
  verifyReceipt(receipt: WriteReceipt): boolean {
    return (
      receipt.sequence >= 0 &&
      receipt.sequence < this.chain.length &&
      this.chain[receipt.sequence].toString('hex') === receipt.chainCommitment
    );
  }

  /** Current chain head (hex). Changes after every successful `admit`. */
  chainRoot(): string {
    return this.prev.toString('hex');
  }

  get length(): number {
    return this.seq;
  }

  get isEmpty(): boolean {
    return this.seq === 0;
  }

  /**
   * Full cryptographic re-derivation from genesis. Returns false if ANY
   * commitment fails to re-derive — catches a mutated commitment, a mutated
   * payload hash, a reorder, or a length mismatch.
   */
  verifyIntegrity(): boolean {
    if (this.chain.length !== this.payloadHashes.length) return false;
    let prev = GENESIS;
    for (let i = 0; i < this.chain.length; i++) {
      const expected = commitmentOf(prev, this.payloadHashes[i], i);
      if (!expected.equals(this.chain[i])) return false;
      prev = this.chain[i];
    }
    return prev.equals(this.prev);
  }

  /** Snapshot for persistence through the unified store (no DB opened here). */
  toJSON(): HashChainState {
    return {
      seq: this.seq,
      head: this.prev.toString('hex'),
      chain: this.chain.map((c) => c.toString('hex')),
      payloadHashes: this.payloadHashes.map((p) => p.toString('hex')),
    };
  }

  /** Restore a chain from a {@link toJSON} snapshot. */
  static fromJSON(state: HashChainState): HashChainGate {
    const g = new HashChainGate();
    g.seq = state.seq;
    g.prev = Buffer.from(state.head, 'hex');
    for (const c of state.chain) g.chain.push(Buffer.from(c, 'hex'));
    for (const p of state.payloadHashes) g.payloadHashes.push(Buffer.from(p, 'hex'));
    return g;
  }
}
