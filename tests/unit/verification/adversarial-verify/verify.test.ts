/**
 * adversarial-verify — orchestration (A2). Blind refuters (judge never sees the
 * finder's confidence/dimension), N votes per finding, failed-vote exclusion,
 * input-order output. The Judge is a stub — no real LLM.
 */
import { describe, it, expect, vi } from 'vitest';
import { adversarialVerify, partitionVerdicts } from '../../../../src/verification/adversarial-verify/index.js';
import type { Finding, Judge } from '../../../../src/verification/adversarial-verify/index.js';

const mk = (id: string, over: Partial<Finding> = {}): Finding => ({
  id, title: `claim ${id}`, file: `src/${id}.ts`, severity: 'medium', confidence: 0.9, evidence: [`src/${id}.ts:1`], ...over,
});

describe('adversarialVerify — verdicts', () => {
  it('should emit only the sanitized measurement receipt fields supplied by an adapter', async () => {
    const digest = `sha256:${'a'.repeat(64)}`;
    const judge: Judge = async () => ({
      refuted: false,
      reasoning: 'verified',
      measurementReceipt: {
        contract: 'judge-measurement@1', provider: 'provider-a', requestedModel: 'judge',
        resolvedModel: 'judge-2026-09', endpointClass: 'shared', snapshotIdentity: 'L1_NAMED',
        semantics: 'provider-asserted', fingerprint: 'fp-1', requestHash: digest,
        promptHash: digest, configHash: digest, parserSchemaHash: digest,
        outputHash: digest, parsedVoteHash: digest, temperature: 0, topP: 1,
        seed: 7, deterministic: false, cacheStatus: 'miss', retryCount: 0,
        timestamp: '2026-09-06T00:00:00.000Z', windowId: '2026-09-06', latencyMs: 42,
        requestId: 'request-1',
        secret: 'must-not-escape',
      } as never,
    });

    const [verdict] = await adversarialVerify([mk('receipt')], { judge, refuters: 1 });

    expect(verdict.measurementReceipts).toHaveLength(1);
    expect(verdict.measurementReceipts?.[0]).toMatchObject({
      contract: 'judge-measurement@1', provider: 'provider-a', resolvedModel: 'judge-2026-09',
      snapshotIdentity: 'L1_NAMED', requestHash: digest, parsedVoteHash: digest,
    });
    expect(verdict.measurementReceipts?.[0]).not.toHaveProperty('secret');
  });

  it('should preserve UNKNOWN instead of accepting malformed identity and hash claims', async () => {
    const judge: Judge = async () => ({
      refuted: false,
      reasoning: 'verified',
      measurementReceipt: {
        contract: 'judge-measurement@1', provider: '', requestedModel: '', resolvedModel: '',
        endpointClass: 'shared', snapshotIdentity: 'L2_CONTENT_BOUND', semantics: 'verified',
        fingerprint: '', requestHash: 'not-a-hash', promptHash: '', configHash: '',
        parserSchemaHash: '', outputHash: '', parsedVoteHash: '', temperature: Number.NaN,
        topP: null, seed: null, deterministic: null, cacheStatus: 'miss', retryCount: -1,
        timestamp: '', windowId: '', latencyMs: Number.POSITIVE_INFINITY, requestId: '',
      },
    });

    const [verdict] = await adversarialVerify([mk('unknown')], { judge, refuters: 1 });
    expect(verdict.measurementReceipts?.[0]).toMatchObject({
      provider: 'UNKNOWN', requestedModel: 'UNKNOWN', resolvedModel: 'UNKNOWN',
      fingerprint: 'UNKNOWN', requestHash: 'UNKNOWN', promptHash: 'UNKNOWN', retryCount: 0,
      timestamp: 'UNKNOWN', windowId: 'UNKNOWN', latencyMs: null, requestId: 'UNKNOWN',
      snapshotIdentity: 'L0_UNKNOWN', semantics: 'UNKNOWN',
    });
  });

  it('should reject prompt-like and credential-like values from public receipt identifiers', async () => {
    const digest = `sha256:${'a'.repeat(64)}`;
    const judge: Judge = async () => ({
      refuted: false,
      reasoning: 'verified',
      measurementReceipt: {
        contract: 'judge-measurement@1', provider: 'PRIVATE SYSTEM PROMPT: keep this hidden',
        requestedModel: 'sk-live-example', resolvedModel: 'judge-2026-09', endpointClass: 'shared',
        snapshotIdentity: 'L1_NAMED', semantics: 'provider-asserted', fingerprint: 'fp-1',
        requestHash: digest, promptHash: digest, configHash: digest, parserSchemaHash: digest,
        outputHash: digest, parsedVoteHash: digest, temperature: 0, topP: 1, seed: 7,
        deterministic: false, cacheStatus: 'miss', retryCount: 0,
        timestamp: '2026-09-06T00:00:00.000Z', windowId: '2026-09-06', latencyMs: 42,
        requestId: 'PRIVATE CHAIN OF THOUGHT',
      },
    });

    const [verdict] = await adversarialVerify([mk('sensitive')], { judge, refuters: 1 });

    expect(verdict.measurementReceipts?.[0]).toMatchObject({
      provider: 'UNKNOWN', requestedModel: 'UNKNOWN', requestId: 'UNKNOWN',
    });
  });

  it('should redact JWT and generic opaque token identifiers', async () => {
    const digest = `sha256:${'a'.repeat(64)}`;
    const judge: Judge = async () => ({
      refuted: false,
      reasoning: 'verified',
      measurementReceipt: {
        contract: 'judge-measurement@1', provider: 'provider-a', requestedModel: 'judge',
        resolvedModel: 'judge-2026-09', endpointClass: 'shared', snapshotIdentity: 'L1_NAMED',
        semantics: 'provider-asserted', fingerprint: 'Ab3'.repeat(12), requestHash: digest,
        promptHash: digest, configHash: digest, parserSchemaHash: digest,
        outputHash: digest, parsedVoteHash: digest, temperature: 0, topP: 1,
        seed: 7, deterministic: false, cacheStatus: 'miss', retryCount: 0,
        timestamp: '2026-09-06T00:00:00.000Z', windowId: '2026-09-06', latencyMs: 42,
        requestId: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl',
      },
    });

    const [verdict] = await adversarialVerify([mk('opaque-secrets')], { judge, refuters: 1 });

    expect(verdict.measurementReceipts?.[0]).toMatchObject({
      fingerprint: 'UNKNOWN', requestId: 'UNKNOWN', semantics: 'UNKNOWN',
    });
  });

  it('should replace negative latency with null so emitted receipts remain schema-valid', async () => {
    const digest = `sha256:${'a'.repeat(64)}`;
    const judge: Judge = async () => ({
      refuted: false,
      reasoning: 'verified',
      measurementReceipt: {
        contract: 'judge-measurement@1', provider: 'provider-a', requestedModel: 'judge',
        resolvedModel: 'judge-2026-09', endpointClass: 'shared', snapshotIdentity: 'L2_CONTENT_BOUND',
        semantics: 'verified', fingerprint: 'fp-1', requestHash: digest, promptHash: digest,
        configHash: digest, parserSchemaHash: digest, outputHash: digest, parsedVoteHash: digest,
        temperature: -1, topP: 2, seed: 1.5, deterministic: true, cacheStatus: 'miss', retryCount: 0,
        timestamp: '2026-09-06T00:00:00.000Z', windowId: '2026-09-06', latencyMs: -1,
        requestId: 'request-1',
      },
    });

    const [verdict] = await adversarialVerify([mk('negative-latency')], { judge, refuters: 1 });

    expect(verdict.measurementReceipts?.[0]).toMatchObject({
      temperature: null, topP: null, seed: null, latencyMs: null,
    });
  });

  it('should preserve deterministic stubs that do not emit measurement receipts', async () => {
    const judge: Judge = async () => ({ refuted: false, reasoning: 'stable stub' });
    const [verdict] = await adversarialVerify([mk('stub')], { judge, refuters: 1 });
    expect(verdict.verdict).toBe('upheld');
    expect(verdict).not.toHaveProperty('measurementReceipts');
  });

  it('should kill a finding when the majority of refuters refute', async () => {
    let n = 0;
    const judge: Judge = async () => ({ refuted: ++n <= 2, reasoning: 'r' }); // 2 refute, 1 uphold
    const [v] = await adversarialVerify([mk('a')], { judge, refuters: 3 });
    expect(v.verdict).toBe('refuted');
  });

  it('should uphold a finding the refuters cannot refute', async () => {
    const judge: Judge = async () => ({ refuted: false, reasoning: 'verified' });
    const [v] = await adversarialVerify([mk('a')], { judge });
    expect(v.verdict).toBe('upheld');
  });

  it('should run exactly `refuters` blind judges per finding', async () => {
    const judge = vi.fn<Judge>(async () => ({ refuted: false, reasoning: 'ok' }));
    await adversarialVerify([mk('a'), mk('b')], { judge, refuters: 3 });
    expect(judge).toHaveBeenCalledTimes(6); // 2 findings × 3 refuters
  });

  it('should keep the refuter BLIND — prompt never leaks confidence or id', async () => {
    const seen: string[] = [];
    const judge: Judge = async (prompt) => { seen.push(prompt); return { refuted: false, reasoning: 'x' }; };
    await adversarialVerify([mk('secret', { confidence: 0.123456 })], { judge, refuters: 1 });
    expect(seen[0]).not.toContain('0.123456'); // confidence hidden
    expect(seen[0]).toContain('claim secret'); // only the bare claim + evidence
  });

  it('should treat failed/null judge calls as uncast votes, not refutations', async () => {
    const judge: Judge = async () => null; // every refuter fails
    const [v] = await adversarialVerify([mk('a')], { judge, refuters: 3 });
    expect(v.verdict).toBe('uncertain'); // 0 cast votes → uncertain (not refuted)
  });

  it('should partition verdicts into confirmed/killed/uncertain', async () => {
    const judge: Judge = async (p) => (p.includes('claim bad') ? { refuted: true, reasoning: 'r' } : { refuted: false, reasoning: 'ok' });
    const verdicts = await adversarialVerify([mk('good'), mk('bad')], { judge, refuters: 3 });
    const { confirmed, killed } = partitionVerdicts(verdicts);
    expect(confirmed.map((v) => v.id)).toEqual(['good']);
    expect(killed.map((v) => v.id)).toEqual(['bad']);
  });

  it('should preserve input order in the output verdicts', async () => {
    const judge: Judge = async () => ({ refuted: false, reasoning: 'ok' });
    const verdicts = await adversarialVerify([mk('z'), mk('a'), mk('m')], { judge });
    expect(verdicts.map((v) => v.id)).toEqual(['z', 'a', 'm']);
  });
});
