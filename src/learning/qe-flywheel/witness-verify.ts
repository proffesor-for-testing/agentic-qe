/**
 * Cross-side witness verification (ADR-124 M2.2) — the single verifier that
 * reconciles AQE's flywheel receipts with the Cognitum `qe-harness` witness
 * bundles so QE evidence signed by the shared platform identity
 * (fingerprint `f1ac28607da49ec1`) is verifiable on either side.
 *
 * WHAT WAS ALREADY ALIGNED (the bridge that exists): both sides use Ed25519,
 * the same env secret `QE_WITNESS_SIGNING_KEY` (JSON `{publicKey,privateKey}`
 * PEM), and the SAME key-id/fingerprint scheme `sha256(pem.trim()).slice(0,16)`
 * — so both can sign AS the platform identity. `keyFingerprint()` here is
 * byte-identical to `receipt.ts` `keyIdOf` and to qe-harness `witness.ts`.
 *
 * WHAT THIS RECONCILES: the two SIGNED ARTIFACTS are not natively
 * cross-verifiable — AQE signs a fixed-field-order JSON body as HEX; qe-harness
 * signs a `sha256:`-prefixed digest of a recursively key-sorted `stableStringify`
 * as BASE64, wrapped in a nested `witness{}`. This module verifies BOTH.
 *
 * TWO EXTERNAL DEPENDENCIES (tracked, need the qe-harness owner — see M2.2 notes):
 *   1. The public key for `f1ac28607da49ec1` is committed to NEITHER repo (it
 *      lives on meta-llm). Offline verification of platform-signed artifacts
 *      needs it provisioned via `QE_WITNESS_PUBLIC_KEYS_JSON`. This verifier is
 *      READY the moment that allowlist is populated.
 *   2. The qe-harness bundle format here is implemented to the documented
 *      algorithm; byte-parity must be confirmed against a REAL qe-harness sample
 *      bundle before it gates anything (see witness-verify.test.ts).
 *
 * No new deps — node:crypto only. Reuses receipt.ts for the AQE path.
 */

import { createHash, verify as edVerify, createPublicKey } from 'node:crypto';
import { verifySignature, receiptBodyString, type EvolveReceipt } from './receipt.js';

/** Public-key allowlist: fingerprint (`sha256(pem)[:16]`) → SPKI PEM. */
export type PublicKeyAllowlist = Map<string, string>;

/** Byte-identical to receipt.ts `keyIdOf` and qe-harness `witness.ts` fingerprint. */
export function keyFingerprint(publicKeyPem: string): string {
  return createHash('sha256').update(publicKeyPem.trim()).digest('hex').slice(0, 16);
}

/**
 * Load the trusted public-key allowlist from `QE_WITNESS_PUBLIC_KEYS_JSON`
 * (`{ "<fingerprint>": "<SPKI PEM>", ... }`). Empty map when unset/unparseable —
 * callers decide whether an empty allowlist means "verify signature only" (AQE
 * receipts carry their own PEM) or "reject" (platform bundles need a trust root).
 */
export function loadAllowlist(json: string | undefined = process.env.QE_WITNESS_PUBLIC_KEYS_JSON): PublicKeyAllowlist {
  const map: PublicKeyAllowlist = new Map();
  if (!json) return map;
  try {
    const obj = JSON.parse(json) as Record<string, string>;
    for (const [fp, pem] of Object.entries(obj)) {
      if (typeof pem === 'string') map.set(fp, pem);
    }
  } catch {
    /* An unparseable allowlist yields an empty (fail-closed) trust root. */
  }
  return map;
}

/**
 * Deterministic serialization matching qe-harness `stableStringify`: recursive
 * key-sort on objects, array order preserved. This MUST stay byte-identical to
 * the qe-harness implementation or digests will not match.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/** qe-harness canonical digest: `sha256:` + sha256(stableStringify(bundle − digest − witness)). */
export function canonicalDigest(bundle: Record<string, unknown>): string {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(bundle)) {
    if (k === 'digest' || k === 'witness') continue;
    rest[k] = v;
  }
  return 'sha256:' + createHash('sha256').update(stableStringify(rest)).digest('hex');
}

/** The qe-harness witness envelope (packages/engine/src/types.ts). */
export interface HarnessWitness {
  alg: 'ed25519';
  digest: string;
  /** base64 Ed25519 signature over `digest`. */
  signature: string;
  publicKeyFingerprint: string;
  signedAt?: string;
}

export type WitnessFormat = 'aqe-receipt' | 'harness-witness' | 'unknown';

export interface VerifyResult {
  valid: boolean;
  format: WitnessFormat;
  fingerprint?: string;
  reason?: string;
}

/**
 * Verify an AQE flywheel receipt. When an allowlist is provided and non-empty,
 * the receipt's embedded public key must be present (by fingerprint) AND match;
 * an empty allowlist verifies the signature against the receipt's own PEM only.
 * NOTE: this is signature verification; the full AQE trust model ALSO re-executes
 * the frozen gate (ADR-120) — do that separately for promotion decisions.
 */
export function verifyAqeReceipt(receipt: EvolveReceipt, allowlist?: PublicKeyAllowlist): VerifyResult {
  const fingerprint = keyFingerprint(receipt.publicKeyPem);
  if (allowlist && allowlist.size > 0) {
    const allowed = allowlist.get(fingerprint);
    if (!allowed) return { valid: false, format: 'aqe-receipt', fingerprint, reason: 'fingerprint-not-in-allowlist' };
    if (allowed.trim() !== receipt.publicKeyPem.trim()) {
      return { valid: false, format: 'aqe-receipt', fingerprint, reason: 'allowlist-pem-mismatch' };
    }
  }
  const ok = verifySignature(receipt.publicKeyPem, receiptBodyString(receipt), receipt.signature);
  return { valid: ok, format: 'aqe-receipt', fingerprint, reason: ok ? undefined : 'bad-signature' };
}

/**
 * Verify a qe-harness witness bundle. Requires the signer's public key in the
 * allowlist (platform bundles do NOT embed their PEM). Recomputes the canonical
 * digest to detect payload tampering, then Ed25519-verifies the base64 signature
 * over the digest string.
 */
export function verifyHarnessWitness(
  bundle: Record<string, unknown> & { witness: HarnessWitness },
  allowlist: PublicKeyAllowlist
): VerifyResult {
  const w = bundle.witness;
  const fingerprint = w?.publicKeyFingerprint;
  const pem = fingerprint ? allowlist.get(fingerprint) : undefined;
  if (!pem) return { valid: false, format: 'harness-witness', fingerprint, reason: 'fingerprint-not-in-allowlist' };

  const recomputed = canonicalDigest(bundle);
  if (recomputed !== w.digest) {
    return { valid: false, format: 'harness-witness', fingerprint, reason: 'digest-mismatch' };
  }
  try {
    const key = createPublicKey(pem);
    const ok = edVerify(null, Buffer.from(w.digest, 'utf8'), key, Buffer.from(w.signature, 'base64'));
    return { valid: ok, format: 'harness-witness', fingerprint, reason: ok ? undefined : 'bad-signature' };
  } catch {
    return { valid: false, format: 'harness-witness', fingerprint, reason: 'verify-error' };
  }
}

/** Detect the artifact format and dispatch to the right verifier. */
export function verifyWitness(artifact: unknown, allowlist: PublicKeyAllowlist = loadAllowlist()): VerifyResult {
  if (artifact && typeof artifact === 'object') {
    const o = artifact as Record<string, unknown>;
    const w = o.witness as Record<string, unknown> | undefined;
    if (w && typeof w === 'object' && typeof w.signature === 'string' && typeof w.publicKeyFingerprint === 'string') {
      return verifyHarnessWitness(o as Record<string, unknown> & { witness: HarnessWitness }, allowlist);
    }
    if (typeof o.signature === 'string' && typeof o.publicKeyPem === 'string' && typeof o.sealedHash === 'string') {
      return verifyAqeReceipt(o as unknown as EvolveReceipt, allowlist);
    }
  }
  return { valid: false, format: 'unknown', reason: 'unrecognized-artifact' };
}
