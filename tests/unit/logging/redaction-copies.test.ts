/**
 * Issue #740: the hooks-health shim (.claude/hooks/aqe-hook.cjs) and the
 * OpenCode plugin ship standalone and carry compact copies of the log
 * redaction detectors. These fixtures run the copies and the main redactor
 * side by side so they cannot drift apart silently.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { redactLogText } from '../../../src/logging/redaction.js';
import {
  redactText as redactPluginText,
  formatErrorForLog as formatPluginError,
} from '../../../packages/aqe-opencode-plugin/src/redaction.js';

const require = createRequire(import.meta.url);
const { redactHealthText } = require(resolve(__dirname, '../../../.claude/hooks/aqe-hook.cjs')) as {
  redactHealthText: (text: string) => string;
};

const CANARY = 'CANARYa1b2c3d4e5f6g7h8i9j0';

const REDACTORS: Array<[string, (text: string) => string]> = [
  ['main logger', (text) => redactLogText(text)],
  ['hooks-health shim', redactHealthText],
  ['OpenCode plugin', redactPluginText],
];

const SECRETS: Array<[string, string]> = [
  ['bearer header', `Authorization: Bearer ${CANARY}`],
  ['bearer header with a word value', 'authorization: Bearer canaryword'],
  ['bare bearer token', `sent Bearer ${CANARY} upstream`],
  ['basic header', `Authorization: Basic ${CANARY}==`],
  ['token header', `Authorization: Token ${CANARY}`],
  ['x-api-key header', `x-api-key: ${CANARY}`],
  ['github token', `ghp_${CANARY}xyz`],
  ['anthropic key', `sk-ant-api03-${CANARY}`],
  ['openai key', `sk-proj-${CANARY}`],
  ['hugging face token', `hf_${CANARY}xxxxxxxx`],
  ['npm token', `npm_${CANARY}xxxxxxxxxxxx`],
  ['cognitum key', `cog_${CANARY}`],
  ['jwt', `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.${CANARY}`],
  ['postgres url', `postgres://admin:${CANARY}@db.internal:5432/app`],
  ['https userinfo', `https://bot:${CANARY}@git.example.com/repo.git`],
  ['pem block', `-----BEGIN RSA PRIVATE KEY-----\n${CANARY}\n-----END RSA PRIVATE KEY-----`],
  ['unterminated pem block', `-----BEGIN OPENSSH PRIVATE KEY-----\n${CANARY}`],
  ['key=value', `retrying with api_key=${CANARY}`],
  ['compound key=value', `refresh_token=${CANARY}`],
  ['JSON string field', JSON.stringify({ password: CANARY, user: 'bob' })],
  ['cookie header', `Cookie: session=${CANARY}`],
];

const PROSE = [
  'use Bearer authorization for this endpoint',
  'Bearer authentication is required.',
  'hook route exited with status 1',
  'maxTokens: 4096, tokensUsed: 12',
  'see https://example.com/docs?page=2',
];

describe.each(REDACTORS)('%s redaction (#740 parity)', (_name, redactor) => {
  it.each(SECRETS)('redacts a %s', (_label, secret) => {
    expect(redactor(`prefix ${secret} suffix`)).not.toContain(CANARY);
  });

  it.each(PROSE)('keeps %s intact', (text) => {
    expect(redactor(text)).toBe(text);
  });

  it('stays linear on long adversarial input', () => {
    const start = performance.now();
    redactor(`Bearer ${'a'.repeat(160_000)}`);
    redactor('Bearer abcdefgh '.repeat(12_000));
    redactor(`authorization:${' '.repeat(160_000)}x`);
    redactor('a.'.repeat(100_000));
    redactor('a-'.repeat(100_000));
    redactor(`${'x_'.repeat(80_000)}token`);
    redactor(`token${' '.repeat(160_000)}`);
    redactor(`--${'a'.repeat(160_000)}`);
    redactor('-token '.repeat(25_000));
    redactor(`-----BEGIN RSA PRIVATE KEY-----${'A'.repeat(160_000)}`);
    redactor('-----BEGIN PRIVATE KEY-----\n'.repeat(6_000));
    redactor(`eyJ${'a'.repeat(160_000)}`);
    redactor(`://${'a'.repeat(160_000)}`);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe('OpenCode plugin formatErrorForLog (#740)', () => {
  it('prints the redacted error with its name, code and status', () => {
    const err = Object.assign(new Error(`HTTP 401 Bearer ${CANARY}`), { code: 'E_AUTH', status: 401 });
    const out = formatPluginError(err);
    expect(out).toContain('HTTP 401');
    expect(out).toContain('"code":"E_AUTH"');
    expect(out).toContain('"status":401');
    expect(out).not.toContain(CANARY);
  });

  it('reports only the type of a thrown non-error object', () => {
    expect(formatPluginError({ token: CANARY })).toBe('[non-error thrown: object]');
    expect(formatPluginError(`token=${CANARY}`)).not.toContain(CANARY);
  });
});
