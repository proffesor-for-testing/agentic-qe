/**
 * Ed25519-signed evolve receipts for the QE-policy flywheel (ADR-118 §4).
 *
 * Every generation — promoted OR rejected — emits a signed receipt into an
 * append-only lineage. A receipt seals the decision inputs (composing ADR-116 /
 * ADR-120) and signs the whole body, so a third party can (a) re-execute the
 * frozen rule on the sealed inputs (ADR-120 verifyPromotion) and (b) verify the
 * signature — trusting the SIGNATURE and the RE-RUN, not the producer.
 *
 * Ed25519 via Node's built-in crypto — dependency-free (ADR-118 §6).
 */

import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  sign as edSign,
  verify as edVerify,
  createHash,
  type KeyObject,
} from 'node:crypto';
import type { SealedInputs, PromotionReceipt } from '../../validation/gate-reexecute.js';

export interface Signer {
  /** Stable id for the signing key (hash of the public key). */
  keyId: string;
  /** SPKI PEM of the public key — travels in the receipt for verification. */
  publicKeyPem: string;
  /** Sign a message, returning a hex signature. */
  sign(message: string): string;
}

/**
 * Derive a stable key id from a public key PEM. The PEM is trimmed first so the id
 * is invariant to trailing whitespace (PEM exports carry a trailing newline) AND
 * matches the Cognitum platform witness fingerprint scheme — `sha256(pem.trim())`
 * truncated to 16 hex (qe-harness `witness.ts` / meta-llm `qe-witness.ts`). This lets
 * a flywheel receipt signed with the platform key carry the SAME id the platform
 * allowlist (`QE_WITNESS_PUBLIC_KEYS_JSON`) recognizes. See platform-signer.ts.
 */
function keyIdOf(publicKeyPem: string): string {
  return createHash('sha256').update(publicKeyPem.trim()).digest('hex').slice(0, 16);
}

/**
 * Create an Ed25519 signer. With a 32-byte seed (hex or Buffer) the keypair is
 * DETERMINISTIC — same seed ⇒ same key ⇒ reproducible receipts (useful for
 * replay bundles and tests). Without a seed, a fresh random keypair is used.
 */
export function createSigner(seed?: string | Buffer): Signer {
  let privateKey: KeyObject;
  let publicKey: KeyObject;

  if (seed !== undefined) {
    const raw = typeof seed === 'string' ? Buffer.from(seed, 'hex') : seed;
    if (raw.length !== 32) {
      throw new Error(`Ed25519 seed must be 32 bytes (got ${raw.length}).`);
    }
    // PKCS#8 wrapper for a raw Ed25519 seed: fixed 16-byte prefix + 32-byte seed.
    const pkcs8 = Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      raw,
    ]);
    privateKey = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
    publicKey = createPublicKey(privateKey);
  } else {
    ({ privateKey, publicKey } = generateKeyPairSync('ed25519'));
  }

  const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
  return {
    keyId: keyIdOf(publicKeyPem),
    publicKeyPem,
    sign(message: string): string {
      return edSign(null, Buffer.from(message, 'utf8'), privateKey).toString('hex');
    },
  };
}

/** Verify an Ed25519 signature against a public key PEM. Never throws. */
export function verifySignature(publicKeyPem: string, message: string, signatureHex: string): boolean {
  try {
    const publicKey = createPublicKey(publicKeyPem);
    return edVerify(null, Buffer.from(message, 'utf8'), publicKey, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}

/** A signed evolve receipt — the durable, verifiable record of one generation. */
export interface EvolveReceipt {
  generation: number;
  /** Frozen acceptance rule this decision used (ADR-120). */
  ruleVersion: string;
  ruleFingerprint: string;
  /** Sealed decision inputs + their content hash (ADR-116/120). */
  sealed: SealedInputs;
  sealedHash: string;
  /** The verdict this generation recorded. */
  verdict: 'promote' | 'reject';
  /** Lineage links: which policy was the baseline, which the candidate. */
  baselinePolicyId: string;
  candidatePolicyId: string;
  /** Signer identity + public key (for offline verification). */
  signerKeyId: string;
  publicKeyPem: string;
  /** Ed25519 signature over the canonical receipt body. */
  signature: string;
}

/** The signed portion of a receipt (everything except the signature itself). */
export type ReceiptBody = Omit<EvolveReceipt, 'signature'>;

/** Canonical serialization of the receipt body for signing/verifying. */
export function receiptBodyString(body: ReceiptBody): string {
  // Field order is fixed here (not sorted) so it is explicit and stable.
  return JSON.stringify({
    generation: body.generation,
    ruleVersion: body.ruleVersion,
    ruleFingerprint: body.ruleFingerprint,
    sealedHash: body.sealedHash,
    verdict: body.verdict,
    baselinePolicyId: body.baselinePolicyId,
    candidatePolicyId: body.candidatePolicyId,
    signerKeyId: body.signerKeyId,
  });
}

/** Sign a receipt body, producing a complete signed receipt. */
export function signReceipt(body: ReceiptBody, signer: Signer): EvolveReceipt {
  const signature = signer.sign(receiptBodyString(body));
  return { ...body, signature };
}

/** Verify a receipt's Ed25519 signature (does NOT re-execute the gate — see ADR-120). */
export function verifyReceiptSignature(receipt: EvolveReceipt): boolean {
  const { signature, ...body } = receipt;
  return verifySignature(receipt.publicKeyPem, receiptBodyString(body), signature);
}

/**
 * Adapt an EvolveReceipt to the ADR-120 PromotionReceipt shape so it can be
 * re-verified by `verifyPromotion` (maps `verdict` → `recordedVerdict`).
 */
export function toPromotionReceipt(receipt: EvolveReceipt): PromotionReceipt {
  return {
    ruleVersion: receipt.ruleVersion,
    ruleFingerprint: receipt.ruleFingerprint,
    sealedHash: receipt.sealedHash,
    sealed: receipt.sealed,
    recordedVerdict: receipt.verdict,
  };
}
