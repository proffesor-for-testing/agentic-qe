/**
 * Witness Chain hash primitives (ADR-070).
 *
 * Shared by the chain itself, its verifier and the brain-import audit writer
 * so the link format can never drift between the code that writes a link and
 * the code that checks it.
 */

import { createHash } from 'crypto';
import type { WitnessEntry } from './witness-chain.js';

export const GENESIS_PREV_HASH = '0'.repeat(64);

export function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf-8').digest('hex');
}

/** SHAKE-256 (32-byte output) with SHA-256 fallback for older Node.js runtimes. */
export function shake256(data: string): string {
  try {
    return createHash('shake256', { outputLength: 32 }).update(data, 'utf-8').digest('hex');
  } catch {
    return sha256(data);
  }
}

export function hashWith(algo: string, data: string): string {
  return algo === 'shake256' ? shake256(data) : sha256(data);
}

/** Serialize a WitnessEntry to a deterministic string (original 7-field format). */
export function serializeEntry(entry: WitnessEntry): string {
  return JSON.stringify({
    id: entry.id, prev_hash: entry.prev_hash, action_hash: entry.action_hash,
    action_type: entry.action_type, action_data: entry.action_data,
    timestamp: entry.timestamp, actor: entry.actor,
  });
}

/** The bytes an Ed25519 witness signature covers (unchanged since ADR-070 Phase 6.2). */
export function signaturePayload(entry: Pick<WitnessEntry,
  'prev_hash' | 'action_hash' | 'action_type' | 'timestamp' | 'actor'>): Buffer {
  return Buffer.from(
    entry.prev_hash + entry.action_hash + entry.action_type + entry.timestamp + entry.actor, 'utf-8',
  );
}
