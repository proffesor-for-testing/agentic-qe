/**
 * Witness-key bridge (qe-harness issue #7) — sign flywheel receipts with the ONE
 * Cognitum platform identity instead of a self-generated key, so every QE receipt
 * (engine campaign · flywheel promotion · coherence verdict) chains to the same
 * externally-verifiable key (`QE_WITNESS_PUBLIC_KEYS_JSON` allowlist, fingerprint
 * `f1ac28607da49ec1`).
 *
 * `createSigner` already accepts a 32-byte Ed25519 seed → deterministic keypair.
 * The platform key is delivered as `QE_WITNESS_SIGNING_KEY` — a JSON
 * `{ publicKey, privateKey }` of PEM strings (same shape qe-harness Stage-B reads
 * from Secret Manager). We derive the seed from that private key and hand it to
 * `createSigner`, reproducing the exact platform keypair.
 *
 * Graceful: returns null when the env var is absent/malformed, so the flywheel
 * keeps its self-generated-key behaviour where the platform key isn't provided.
 * Env-reading lives HERE, not in the dependency-free `receipt.ts` core.
 */

import { createPrivateKey, createPublicKey } from 'node:crypto';
import { createSigner, type Signer } from './receipt.js';

/** DER prefix of an Ed25519 PKCS#8 private key (16 bytes) preceding the 32-byte seed. */
const ED25519_PKCS8_PREFIX = '302e020100300506032b657004220420';

/**
 * Extract the raw 32-byte Ed25519 seed from a PKCS#8 private-key PEM. Throws if the
 * key is not an Ed25519 PKCS#8 key (wrong curve / format).
 */
export function seedFromPkcs8Pem(privateKeyPem: string): Buffer {
  const der = createPrivateKey(privateKeyPem).export({ format: 'der', type: 'pkcs8' });
  if (der.length !== 48 || der.subarray(0, 16).toString('hex') !== ED25519_PKCS8_PREFIX) {
    throw new Error('not an Ed25519 PKCS#8 private key (cannot derive a 32-byte seed)');
  }
  return Buffer.from(der.subarray(16, 48));
}

/** The shape of the `QE_WITNESS_SIGNING_KEY` secret (JSON of PEM strings). */
interface PlatformKey { publicKey?: string; privateKey?: string; }

/**
 * Build a {@link Signer} bound to the Cognitum platform identity from
 * `QE_WITNESS_SIGNING_KEY`, or null when it is unset/malformed (graceful fallback).
 * The returned signer's `keyId` equals the platform witness fingerprint, so a
 * verifier can attribute the receipt to the platform via the same allowlist that
 * accepts qe-harness evidence bundles.
 */
export function platformSigner(env: NodeJS.ProcessEnv = process.env): Signer | null {
  const raw = env.QE_WITNESS_SIGNING_KEY;
  if (!raw) return null;
  let key: PlatformKey;
  try {
    key = JSON.parse(raw) as PlatformKey;
  } catch {
    return null;
  }
  if (!key.privateKey) return null;
  try {
    return createSigner(seedFromPkcs8Pem(key.privateKey));
  } catch {
    return null; // wrong key type / unparseable — fall back to a self-generated signer
  }
}
