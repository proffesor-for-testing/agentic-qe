import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { platformSigner, seedFromPkcs8Pem } from '../../../src/learning/qe-flywheel/platform-signer.js';
import { createSigner, signReceipt, verifyReceiptSignature, type ReceiptBody } from '../../../src/learning/qe-flywheel/receipt.js';

/** Generate a platform-key JSON (the shape of the QE_WITNESS_SIGNING_KEY secret). */
function platformKeyJson(): { json: string; publicKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { json: JSON.stringify({ publicKey, privateKey }), publicKey };
}

const fp = (pem: string) => createHash('sha256').update(pem.trim()).digest('hex').slice(0, 16);

describe('platform witness-key bridge', () => {
  it('should_extractA32ByteSeed_fromAnEd25519Pkcs8Pem', () => {
    const { privateKey } = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const seed = seedFromPkcs8Pem(privateKey);
    expect(seed).toHaveLength(32);
    // Reproducing a signer from the seed yields the same key (determinism).
    expect(createSigner(seed).keyId).toBe(createSigner(seed).keyId);
  });

  it('should_rejectANonEd25519Key', () => {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    expect(() => seedFromPkcs8Pem(privateKey)).toThrow(/Ed25519/);
  });

  it('should_signWithThePlatformIdentity_whenEnvIsSet', () => {
    const { json, publicKey } = platformKeyJson();
    const signer = platformSigner({ QE_WITNESS_SIGNING_KEY: json } as NodeJS.ProcessEnv);
    expect(signer).not.toBeNull();
    // Same public key as the platform secret, and keyId == the platform fingerprint scheme.
    expect(signer!.publicKeyPem.trim()).toBe(publicKey.trim());
    expect(signer!.keyId).toBe(fp(publicKey));
  });

  it('should_produceAVerifiableReceipt_underThePlatformKey', () => {
    const { json } = platformKeyJson();
    const signer = platformSigner({ QE_WITNESS_SIGNING_KEY: json } as NodeJS.ProcessEnv)!;
    const body: ReceiptBody = {
      generation: 1, ruleVersion: 'v1', ruleFingerprint: 'rf', sealed: {} as never, sealedHash: 'h',
      verdict: 'promote', baselinePolicyId: 'b', candidatePolicyId: 'c',
      signerKeyId: signer.keyId, publicKeyPem: signer.publicKeyPem,
    };
    const receipt = signReceipt(body, signer);
    expect(verifyReceiptSignature(receipt)).toBe(true);
    // Tamper the verdict → signature must fail.
    expect(verifyReceiptSignature({ ...receipt, verdict: 'reject' })).toBe(false);
  });

  it('should_returnNull_whenEnvUnsetOrMalformed', () => {
    expect(platformSigner({} as NodeJS.ProcessEnv)).toBeNull();
    expect(platformSigner({ QE_WITNESS_SIGNING_KEY: 'not json' } as NodeJS.ProcessEnv)).toBeNull();
    expect(platformSigner({ QE_WITNESS_SIGNING_KEY: '{"publicKey":"x"}' } as NodeJS.ProcessEnv)).toBeNull();
  });
});
