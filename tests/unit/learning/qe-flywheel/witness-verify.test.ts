/**
 * ADR-124 M2.2 — cross-side witness verification.
 *
 * Proves: (a) AQE and qe-harness compute IDENTICAL key fingerprints (the bridge
 * mechanism), (b) the verifier round-trips both artifact formats and rejects
 * tampering. What it does NOT prove (external dependency, flagged): byte-parity
 * against a REAL qe-harness sample bundle and the real platform public key —
 * those need the qe-harness owner.
 */
import { describe, it, expect } from 'vitest';
import { sign as edSign, createPrivateKey, createPublicKey, createHash } from 'node:crypto';
import { createSigner, receiptBodyString, type EvolveReceipt } from '../../../../src/learning/qe-flywheel/receipt';
import {
  keyFingerprint,
  loadAllowlist,
  stableStringify,
  canonicalDigest,
  verifyAqeReceipt,
  verifyHarnessWitness,
  verifyWitness,
  type PublicKeyAllowlist,
  type HarnessWitness,
} from '../../../../src/learning/qe-flywheel/witness-verify';

const SEED = '11'.repeat(32); // deterministic 32-byte hex seed

function makeSignedReceipt(seed = SEED): EvolveReceipt {
  const signer = createSigner(seed);
  const body = {
    generation: 7,
    ruleVersion: 'v1',
    ruleFingerprint: 'rf-abc',
    sealed: { any: 'thing' } as never,
    sealedHash: 'sh-123',
    verdict: 'promote' as const,
    baselinePolicyId: 'base-1',
    candidatePolicyId: 'cand-2',
    signerKeyId: signer.keyId,
    publicKeyPem: signer.publicKeyPem,
  };
  return { ...body, signature: signer.sign(receiptBodyString(body)) };
}

/** Build a qe-harness-style bundle signed over the canonical digest (base64). */
function makeHarnessBundle(seed = SEED) {
  const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(seed, 'hex')]);
  const priv = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  const pem = createPublicKey(priv).export({ format: 'pem', type: 'spki' }).toString();
  const bundle: Record<string, unknown> = { scorecard: { dims: [1, 2, 3], tenant: 't-1' }, meta: { a: 1 } };
  const digest = canonicalDigest(bundle);
  const witness: HarnessWitness = {
    alg: 'ed25519',
    digest,
    signature: edSign(null, Buffer.from(digest, 'utf8'), priv).toString('base64'),
    publicKeyFingerprint: keyFingerprint(pem),
  };
  return { bundle: { ...bundle, digest, witness }, pem };
}

describe('key-bridge fingerprint parity (M2.2)', () => {
  it('should_computeSameFingerprint_asAqeSignerKeyId', () => {
    const signer = createSigner(SEED);
    // receipt.ts keyIdOf and witness-verify keyFingerprint are the same scheme.
    expect(keyFingerprint(signer.publicKeyPem)).toBe(signer.keyId);
    expect(keyFingerprint(signer.publicKeyPem)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('stableStringify', () => {
  it('should_beIndependentOfKeyInsertionOrder', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });
  it('should_preserveArrayOrder', () => {
    expect(stableStringify([3, 1, 2])).toBe('[3,1,2]');
  });
});

describe('verifyAqeReceipt', () => {
  it('should_failClosed_underEmptyAllowlist_withoutSelfSignedOptIn', () => {
    // qe-court finding: no trust root ⇒ a self-signed forgery must NOT be "valid".
    const res = verifyAqeReceipt(makeSignedReceipt());
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('no-trust-root');
  });
  it('should_verifyAGenuineReceipt_whenSelfSignedIsExplicitlyAllowed', () => {
    expect(verifyAqeReceipt(makeSignedReceipt(), undefined, { allowSelfSigned: true }).valid).toBe(true);
  });
  it('should_rejectATamperedBody', () => {
    const r = makeSignedReceipt();
    r.verdict = 'reject'; // body changed, signature no longer matches
    const res = verifyAqeReceipt(r, undefined, { allowSelfSigned: true });
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('bad-signature');
  });
  it('should_rejectWhenFingerprintNotInANonEmptyAllowlist', () => {
    const allow: PublicKeyAllowlist = new Map([['deadbeefdeadbeef', 'x']]);
    const res = verifyAqeReceipt(makeSignedReceipt(), allow);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('fingerprint-not-in-allowlist');
  });
  it('should_verifyWhenFingerprintIsAllowlisted', () => {
    const r = makeSignedReceipt();
    const allow: PublicKeyAllowlist = new Map([[keyFingerprint(r.publicKeyPem), r.publicKeyPem]]);
    expect(verifyAqeReceipt(r, allow).valid).toBe(true);
  });
});

describe('verifyHarnessWitness', () => {
  it('should_verifyAGenuineBundle_whenKeyIsAllowlisted', () => {
    const { bundle, pem } = makeHarnessBundle();
    const allow: PublicKeyAllowlist = new Map([[keyFingerprint(pem), pem]]);
    expect(verifyHarnessWitness(bundle as never, allow).valid).toBe(true);
  });
  it('should_rejectTamperedPayload_withDigestMismatch', () => {
    const { bundle, pem } = makeHarnessBundle();
    (bundle as Record<string, unknown>).scorecard = { dims: [9, 9, 9] }; // payload changed after signing
    const allow: PublicKeyAllowlist = new Map([[keyFingerprint(pem), pem]]);
    const res = verifyHarnessWitness(bundle as never, allow);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('digest-mismatch');
  });
  it('should_rejectWhenSignerNotAllowlisted', () => {
    const { bundle } = makeHarnessBundle();
    const res = verifyHarnessWitness(bundle as never, new Map());
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('fingerprint-not-in-allowlist');
  });
  it('should_rejectAnUnsupportedAlgorithm_beforeVerifying', () => {
    const { bundle, pem } = makeHarnessBundle();
    (bundle.witness as { alg: string }).alg = 'rsa'; // not ed25519
    const allow: PublicKeyAllowlist = new Map([[keyFingerprint(pem), pem]]);
    const res = verifyHarnessWitness(bundle as never, allow);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('unsupported-alg');
  });
});

describe('verifyWitness dispatch', () => {
  it('should_routeAqeReceipts', () => {
    expect(verifyWitness(makeSignedReceipt(), new Map()).format).toBe('aqe-receipt');
  });
  it('should_routeHarnessBundles', () => {
    const { bundle, pem } = makeHarnessBundle();
    expect(verifyWitness(bundle, new Map([[keyFingerprint(pem), pem]])).format).toBe('harness-witness');
  });
  it('should_returnUnknownForForeignObjects', () => {
    expect(verifyWitness({ hello: 'world' }).format).toBe('unknown');
  });
});

describe('loadAllowlist', () => {
  it('should_parseFingerprintToPemMap', () => {
    const m = loadAllowlist(JSON.stringify({ abcd1234abcd1234: 'PEM-A' }));
    expect(m.get('abcd1234abcd1234')).toBe('PEM-A');
  });
  it('should_returnEmptyMapOnUnparseableInput_failClosed', () => {
    expect(loadAllowlist('{not json').size).toBe(0);
    expect(loadAllowlist(undefined).size).toBe(0);
  });
});
