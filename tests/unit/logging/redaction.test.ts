/**
 * Issue #740: sensitive-data redaction at the logging sink.
 * Every secret below is a synthetic canary; none may reach formatted output.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { redactLogValue, redactLogText, formatErrorForLog } from '../../../src/logging/redaction.js';
import { ConsoleLogger } from '../../../src/logging/console-logger.js';
import { LogLevel } from '../../../src/logging/logger.js';

const CANARY = 'CANARYa1b2c3d4e5f6g7h8i9j0';
const serialized = (v: unknown) => JSON.stringify(v);

describe('redactLogValue — sensitive keys (#740)', () => {
  it.each([
    'password', 'Password', 'apiKey', 'api_key', 'API-KEY', 'x-api-key', 'authorization',
    'Proxy-Authorization', 'cookie', 'Set-Cookie', 'token', 'accessToken', 'refresh_token',
    'githubToken', 'clientSecret', 'private_key', 'passphrase', 'connectionString', 'sessionId',
  ])('redacts the value under %s', (key) => {
    const out = serialized(redactLogValue({ [key]: CANARY, keep: 'visible' }));
    expect(out).not.toContain(CANARY);
    expect(out).toContain('visible');
  });

  it('keeps numeric token counters and harmless token-ish keys', () => {
    const out = redactLogValue({ maxTokens: 4096, tokensUsed: 12, tokenizer: 'cl100k' }) as Record<string, unknown>;
    expect(out).toEqual({ maxTokens: 4096, tokensUsed: 12, tokenizer: 'cl100k' });
  });

  it('redacts nested objects and arrays under a sensitive key entirely', () => {
    const out = serialized(redactLogValue({ headers: { Authorization: [CANARY], accept: 'json' } }));
    expect(out).not.toContain(CANARY);
    expect(out).toContain('json');
  });
});

describe('redactLogValue — credential-shaped values (#740)', () => {
  it.each([
    ['bearer header', `Authorization: Bearer ${CANARY}`],
    ['bare bearer', `sent Bearer ${CANARY} upstream`],
    ['basic header', `Authorization: Basic ${CANARY}==`],
    ['github token', `ghp_${CANARY}xyz`],
    ['anthropic key', `sk-ant-api03-${CANARY}`],
    ['openai key', `sk-proj-${CANARY}`],
    ['jwt', `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.${CANARY}`],
    ['postgres url', `postgres://admin:${CANARY}@db.internal:5432/app`],
    ['https userinfo', `https://bot:${CANARY}@git.example.com/repo.git`],
    ['pem block', `-----BEGIN RSA PRIVATE KEY-----\n${CANARY}\n-----END RSA PRIVATE KEY-----`],
    ['key=value', `retrying with api_key=${CANARY}`],
  ])('redacts a %s under a generic key and inside arrays', (_label, secret) => {
    const out = serialized(redactLogValue({ value: secret, list: [secret], nested: { message: secret } }));
    expect(out).not.toContain(CANARY);
  });

  it('keeps useful non-secret values intact', () => {
    const value = {
      id: '7f9c2ba4-e88f-4d0a-9b1c-3f2d5e6a7b8c',
      sha: 'a821280c4f5e6d7a8b9c0d1e2f3a4b5c6d7e8f90',
      file: '/home/user/project/src/auth/login.ts:42:13',
      url: 'https://api.example.com/v1/patterns?limit=10',
      status: 503,
      test: 'should reject expired token',
    };
    expect(redactLogValue(value)).toEqual(value);
  });
});

describe('redactLogValue — errors and traversal safety (#740)', () => {
  it('redacts message, stack and nested cause of errors', () => {
    const inner = new Error(`connect to postgres://u:${CANARY}@h/db failed`);
    const outer = new Error(`provider rejected Bearer ${CANARY}`, { cause: inner });
    const out = serialized(redactLogValue({ err: outer }));
    expect(out).not.toContain(CANARY);
    expect(out).toContain('provider rejected');
  });

  it('does not mutate or alias the input', () => {
    const input = Object.freeze({ password: CANARY, nested: Object.freeze({ token: CANARY }) });
    const out = redactLogValue(input) as Record<string, unknown>;
    expect(input.password).toBe(CANARY);
    expect(out).not.toBe(input);
    expect(out.nested).not.toBe(input.nested);
  });

  it('never invokes getters or toJSON', () => {
    const getter = vi.fn(() => CANARY);
    const toJSON = vi.fn(() => ({ leaked: CANARY }));
    const input = { toJSON } as Record<string, unknown>;
    Object.defineProperty(input, 'lazy', { get: getter, enumerable: true });
    const out = serialized(redactLogValue(input));
    expect(getter).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
    expect(out).not.toContain(CANARY);
  });

  it('is cycle-safe and bounded in depth, width and string length', () => {
    const cyclic: Record<string, unknown> = { name: 'root' };
    cyclic.self = cyclic;
    expect(serialized(redactLogValue(cyclic))).toContain('[circular]');

    let deep: Record<string, unknown> = { leaf: CANARY };
    for (let i = 0; i < 20; i++) deep = { next: deep };
    expect(serialized(redactLogValue(deep, { maxDepth: 4 }))).not.toContain(CANARY);

    const wide = Array.from({ length: 1000 }, (_, i) => i);
    expect((redactLogValue(wide, { maxEntries: 10 }) as unknown[]).length).toBeLessThanOrEqual(11);

    const long = 'x'.repeat(100_000);
    expect((redactLogValue(long, { maxStringLength: 100 }) as string).length).toBeLessThan(200);
  });

  it('fails closed when inspecting the value throws', () => {
    const hostile = new Proxy({}, { ownKeys() { throw new Error(CANARY); } });
    const out = serialized(redactLogValue({ hostile }));
    expect(out).not.toContain(CANARY);
    expect(out).toContain('sanitization-failed');
  });
});

describe('redactLogText / formatErrorForLog (#740)', () => {
  it('redacts secrets in free text', () => {
    expect(redactLogText(`token=${CANARY}`)).not.toContain(CANARY);
  });

  it('formats thrown errors and non-errors without secrets', () => {
    const err = new Error(`bad key sk-ant-api03-${CANARY}`);
    expect(formatErrorForLog(err)).toContain('bad key');
    expect(formatErrorForLog(err)).not.toContain(CANARY);
    expect(formatErrorForLog({ apiKey: CANARY })).not.toContain(CANARY);
    expect(formatErrorForLog(`Bearer ${CANARY}`)).not.toContain(CANARY);
  });

  it.each([
    ['JSON double-quoted key', JSON.stringify({ password: CANARY, user: 'bob' })],
    ['JSON camelCase key', JSON.stringify({ apiKey: CANARY })],
    ['repr single-quoted key', `{'client_secret': '${CANARY}'}`],
    ['OAuth query access_token', `https://h/cb?code=1&access_token=${CANARY}`],
    ['compound refresh_token', `refresh_token=${CANARY}`],
    ...['passphrase', 'connectionString', 'pwd', 'dsn', 'auth', 'x-api-key', 'Set-Cookie'].map(
      (key): [string, string] => [`JSON key ${key}`, JSON.stringify({ [key]: CANARY })]),
    ['JSON value over 4 KB', JSON.stringify({ password: `${CANARY}${'x'.repeat(5000)}` })],
    ['unterminated JSON value', `{"apiKey":"${CANARY}`],
    ['compound value over 4 KB', `refresh_token=${CANARY}${'x'.repeat(5000)}`],
    ['long custom URL scheme', `${'x'.repeat(40)}://bot:${CANARY}@host/x`],
    ['URL with empty user', `https://:${CANARY}@host/x`],
  ])('redacts a %s serialized into text', (_label, text) => {
    expect(redactLogText(text)).not.toContain(CANARY);
  });

  it('redacts numeric values under sensitive keys in serialized text', () => {
    const out = redactLogText(JSON.stringify({ password: 918273645, sessionId: 5647382910, user: 'bob' }));
    expect(out).not.toContain('918273645');
    expect(out).not.toContain('5647382910');
    expect(out).toContain('bob');
  });

  it('keeps numeric counters in serialized text', () => {
    const text = JSON.stringify({ maxTokens: 4096, tokensUsed: 12, tokenizer: 'cl100k' });
    expect(redactLogText(text)).toBe(text);
  });

  it('stays linear on backtracking-prone input (URL scheme ReDoS)', () => {
    const hostile = 'a.'.repeat(100_000);
    const start = performance.now();
    redactLogText(hostile);
    redactLogText('a-'.repeat(100_000));
    // Unbounded scheme quantifier took ~4 s here; bounded it is milliseconds.
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('does not throw on a non-string message from an untyped caller', () => {
    const err = new Error(`boom Bearer ${CANARY}`);
    expect(() => redactLogText(err as unknown as string)).not.toThrow();
    expect(redactLogText(err as unknown as string)).toContain('boom Bearer');
    expect(redactLogText(err as unknown as string)).not.toContain(CANARY);
    expect(redactLogText(undefined as unknown as string)).toBe('undefined');
  });
});

describe('redactLogValue — numeric values under sensitive keys (#740)', () => {
  it('redacts numeric PINs and session ids but keeps boolean flags', () => {
    const out = redactLogValue({ password: 123456, sessionId: 987654321, hasPassword: true });
    expect(out).toEqual({ password: '[REDACTED:sensitive-key]', sessionId: '[REDACTED:sensitive-key]', hasPassword: true });
  });
});

describe('ConsoleLogger sink redaction (#740)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const printed = () => [...errorSpy.mock.calls, ...infoSpy.mock.calls, ...debugSpy.mock.calls]
    .map(args => args.map(String).join(' ')).join('\n');

  it('redacts error message, stack, cause, call context and inherited context', () => {
    const logger = new ConsoleLogger('test', LogLevel.DEBUG, { prettyPrint: true })
      .child({ apiKey: CANARY });
    const err = new Error(`HTTP 401 for Bearer ${CANARY}`, { cause: { token: CANARY } });

    logger.error('provider call failed', err, { request: { headers: { authorization: CANARY } } });

    expect(printed()).toContain('provider call failed');
    expect(printed()).toContain('HTTP 401');
    expect(printed()).not.toContain(CANARY);
  });

  it('redacts secrets in the message itself at every level, including debug', () => {
    const logger = new ConsoleLogger('test', LogLevel.DEBUG);
    logger.debug(`using postgres://svc:${CANARY}@db/app`);
    logger.info(`retry with sk-proj-${CANARY}`);
    expect(printed()).not.toContain(CANARY);
  });
});
