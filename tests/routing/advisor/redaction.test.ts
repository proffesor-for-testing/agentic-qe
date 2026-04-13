/**
 * Secrets/PII Redaction Tests (ADR-092 Phase 1)
 */

import { describe, it, expect } from 'vitest';
import {
  redact,
  validateProviderForAgent,
  isSelfHosted,
  isSecurityAgent,
  isSecurityAgentAllowed,
  AdvisorRedactionError,
} from '../../../src/routing/advisor/redaction.js';

describe('redact()', () => {
  describe('AWS keys', () => {
    it('redacts AKIA-prefixed access keys', () => {
      const { text, redactions } = redact('key: AKIAIOSFODNN7EXAMPLE');
      expect(text).toContain('<REDACTED:aws_key>');
      expect(text).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(redactions).toContain('aws_key');
    });
  });

  describe('env values', () => {
    it('redacts KEY=VALUE patterns on their own line', () => {
      const { text, redactions } = redact('DATABASE_URL=postgres://user:pass@host:5432/db\nOTHER=stuff');
      expect(text).toContain('DATABASE_URL=<REDACTED:env_value>');
      expect(text).toContain('OTHER=<REDACTED:env_value>');
      expect(redactions).toContain('env_value');
    });
  });

  describe('authorization headers', () => {
    it('redacts Bearer tokens', () => {
      const { text } = redact('Authorization: Bearer sk-abc123def456');
      expect(text).toContain('<REDACTED:api_key>');
      expect(text).not.toContain('sk-abc123def456');
    });

    it('redacts x-api-key headers', () => {
      const { text } = redact('x-api-key: my-secret-key-12345');
      expect(text).toContain('<REDACTED:api_key>');
    });
  });

  describe('private keys', () => {
    it('redacts PEM private keys', () => {
      const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKC...\n-----END RSA PRIVATE KEY-----';
      const { text, redactions } = redact(pem);
      expect(text).toBe('<REDACTED:private_key>');
      expect(redactions).toContain('private_key');
    });
  });

  describe('JWTs', () => {
    it('redacts JWT tokens', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const { text, redactions } = redact(jwt);
      expect(text).toBe('<REDACTED:jwt>');
      expect(redactions).toContain('jwt');
    });
  });

  describe('generic secrets', () => {
    it('redacts password= patterns', () => {
      const { text } = redact('password=mysecretpassword123');
      expect(text).toContain('<REDACTED:generic_secret>');
    });

    it('redacts api_key= patterns', () => {
      const { text } = redact("api_key='sk-proj-abcdef12345678'");
      expect(text).toContain('<REDACTED:generic_secret>');
    });
  });

  describe('connection strings', () => {
    it('redacts postgres connection strings', () => {
      const { text } = redact('postgresql://admin:s3cret@db.example.com:5432/mydb');
      expect(text).toContain('<REDACTED:connection_string>');
    });

    it('redacts mongodb+srv connection strings', () => {
      const { text } = redact('mongodb+srv://user:pass@cluster.mongodb.net/db');
      expect(text).toContain('<REDACTED:connection_string>');
    });
  });

  describe('GitHub tokens', () => {
    it('redacts ghp_ personal access tokens', () => {
      const { text, redactions } = redact('token: ghp_ABCdef1234567890abcdef1234567890abcd');
      expect(text).toContain('<REDACTED:github_token>');
      expect(redactions).toContain('github_token');
    });

    it('redacts github_pat_ fine-grained tokens', () => {
      const { text } = redact('github_pat_11AABBC_xxxxxxxxxxxxxxxxxxxx');
      expect(text).toContain('<REDACTED:github_token>');
    });
  });

  describe('Slack tokens', () => {
    it('redacts xoxb- bot tokens', () => {
      const { text, redactions } = redact('The bot token is xoxb-0000FAKE0000-0000FAKE0000-fakefakefakefake ok');
      expect(text).toContain('<REDACTED:slack_token>');
      expect(redactions).toContain('slack_token');
    });
  });

  describe('Stripe keys', () => {
    it('redacts sk_live_ secret keys', () => {
      const fakeKey = ['sk', 'live', 'TESTNOTREAL00000000000000'].join('_');
      const { text } = redact(`stripe_key: ${fakeKey}`);
      expect(text).toContain('<REDACTED:stripe_key>');
    });

    it('redacts pk_test_ publishable keys', () => {
      const fakePk = ['pk', 'test', 'TESTNOTREAL00000000000000'].join('_');
      const { text } = redact(fakePk);
      expect(text).toContain('<REDACTED:stripe_key>');
    });
  });

  describe('Google API keys', () => {
    it('redacts AIzaSy-prefixed keys', () => {
      const fakeGoogle = 'AIza' + 'Sy' + 'FAKENOTREALKEY0123456789abcdefghi';
      const { text } = redact(`key: ${fakeGoogle}`);
      expect(text).toContain('<REDACTED:google_api_key>');
    });
  });

  describe('AWS session tokens', () => {
    it('redacts ASIA-prefixed temporary credentials', () => {
      const fakeAws = 'ASIA' + 'FAKENOTREAL7EXAM';
      const { text, redactions } = redact(`aws_key: ${fakeAws}`);
      expect(text).toContain('<REDACTED:aws_session_token>');
      expect(redactions).toContain('aws_session_token');
    });
  });

  describe('GitLab tokens', () => {
    it('redacts glpat- personal access tokens', () => {
      const { text } = redact('token: glpat-xxxxxxxxxxxxxxxxxxxx');
      expect(text).toContain('<REDACTED:gitlab_token>');
    });
  });

  describe('PII (strict mode only)', () => {
    it('redacts email addresses in strict mode', () => {
      const { text, redactions } = redact('contact: user@example.com', 'strict');
      expect(text).toContain('<REDACTED:pii_email>');
      expect(redactions).toContain('email');
    });

    it('does NOT redact email in balanced mode', () => {
      const { text } = redact('contact: user@example.com', 'balanced');
      expect(text).toContain('user@example.com');
    });

    it('redacts SSN patterns in strict mode', () => {
      const { text } = redact('SSN: 123-45-6789', 'strict');
      expect(text).toContain('<REDACTED:pii_ssn>');
    });
  });

  describe('mode: off', () => {
    it('returns text unchanged', () => {
      const input = 'AKIA' + 'FAKENOTREAL7EXAM' + ' password=secret';
      const { text, redactions, replacementCount } = redact(input, 'off');
      expect(text).toBe(input);
      expect(redactions).toHaveLength(0);
      expect(replacementCount).toBe(0);
    });
  });

  describe('replacement count', () => {
    it('counts total individual replacements', () => {
      const input = 'API_KEY=abc123\nSECRET=def456\nTOKEN=ghi789';
      const { replacementCount } = redact(input, 'strict');
      expect(replacementCount).toBeGreaterThanOrEqual(3);
    });
  });
});

describe('validateProviderForAgent()', () => {
  it('allows openrouter for non-security agents', () => {
    expect(() => validateProviderForAgent('qe-test-architect', 'openrouter', 'strict')).not.toThrow();
  });

  it('rejects openrouter for security agents', () => {
    expect(() => validateProviderForAgent('qe-security-reviewer', 'openrouter', 'strict'))
      .toThrow(AdvisorRedactionError);
  });

  it('rejects openrouter for pentest agents', () => {
    expect(() => validateProviderForAgent('qe-pentest-validator', 'openrouter', 'strict'))
      .toThrow(AdvisorRedactionError);
  });

  it('allows claude (direct Anthropic) for security agents', () => {
    expect(() => validateProviderForAgent('qe-security-reviewer', 'claude', 'strict')).not.toThrow();
  });

  it('allows ollama for security agents', () => {
    expect(() => validateProviderForAgent('qe-security-reviewer', 'ollama', 'strict')).not.toThrow();
  });

  it('rejects redact=off for non-self-hosted providers', () => {
    expect(() => validateProviderForAgent('qe-test-architect', 'openrouter', 'off'))
      .toThrow(AdvisorRedactionError);
  });

  it('allows redact=off for ollama (self-hosted)', () => {
    expect(() => validateProviderForAgent('qe-test-architect', 'ollama', 'off')).not.toThrow();
  });

  it('sets exit code 6 on redaction errors', () => {
    try {
      validateProviderForAgent('qe-security-reviewer', 'openrouter', 'strict');
    } catch (e) {
      expect((e as AdvisorRedactionError).exitCode).toBe(6);
    }
  });
});

describe('helper functions', () => {
  it('isSelfHosted correctly identifies ollama', () => {
    expect(isSelfHosted('ollama')).toBe(true);
    expect(isSelfHosted('openrouter')).toBe(false);
    expect(isSelfHosted('anthropic')).toBe(false);
  });

  it('isSecurityAgent matches qe-security-* and qe-pentest-*', () => {
    expect(isSecurityAgent('qe-security-reviewer')).toBe(true);
    expect(isSecurityAgent('qe-pentest-validator')).toBe(true);
    expect(isSecurityAgent('qe-test-architect')).toBe(false);
    expect(isSecurityAgent('qe-coverage-specialist')).toBe(false);
  });

  it('isSecurityAgentAllowed allows claude and ollama', () => {
    expect(isSecurityAgentAllowed('claude')).toBe(true);
    expect(isSecurityAgentAllowed('ollama')).toBe(true);
    expect(isSecurityAgentAllowed('openrouter')).toBe(false);
    expect(isSecurityAgentAllowed('openai')).toBe(false);
  });
});
