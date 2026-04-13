/**
 * Secrets / PII Redaction Pre-Flight
 * ADR-092 Phase 1: mandatory before non-self-hosted advisors see the transcript
 *
 * Scans transcript content for credential patterns, API keys, PII, and other
 * sensitive data. Replaces matches with typed redaction markers. Returns the
 * list of redaction categories applied so the audit log can record them.
 *
 * Three modes:
 *   strict   — redacts credentials + PII + env values (default)
 *   balanced — redacts credentials + env values only
 *   off      — no redaction (rejected for non-self-hosted providers by MultiModelExecutor)
 */

export type RedactionMode = 'strict' | 'balanced' | 'off';

export interface RedactionResult {
  /** The redacted text */
  text: string;
  /** Categories of patterns found and redacted */
  redactions: string[];
  /** Total number of individual replacements made */
  replacementCount: number;
}

interface RedactionPattern {
  category: string;
  regex: RegExp;
  replacement: string;
  modes: RedactionMode[];
}

const PATTERNS: RedactionPattern[] = [
  {
    category: 'aws_key',
    regex: /\b(AKIA[0-9A-Z]{16})\b/g,
    replacement: '<REDACTED:aws_key>',
    modes: ['strict', 'balanced'],
  },
  {
    category: 'env_value',
    regex: /^([A-Z][A-Z0-9_]{2,})=(.+)$/gm,
    replacement: '$1=<REDACTED:env_value>',
    modes: ['strict', 'balanced'],
  },
  {
    category: 'api_key_header',
    regex: /(Authorization:\s*Bearer\s+)\S+/gi,
    replacement: '$1<REDACTED:api_key>',
    modes: ['strict', 'balanced'],
  },
  {
    category: 'api_key_header',
    regex: /(x-api-key:\s*)\S+/gi,
    replacement: '$1<REDACTED:api_key>',
    modes: ['strict', 'balanced'],
  },
  {
    category: 'private_key',
    regex: /-----BEGIN\s[\w\s]*PRIVATE KEY-----[\s\S]*?-----END\s[\w\s]*PRIVATE KEY-----/g,
    replacement: '<REDACTED:private_key>',
    modes: ['strict', 'balanced'],
  },
  {
    category: 'jwt',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    replacement: '<REDACTED:jwt>',
    modes: ['strict', 'balanced'],
  },
  {
    category: 'github_token',
    regex: /\b(ghp_|gho_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]{16,}\b/g,
    replacement: '<REDACTED:github_token>',
    modes: ['strict', 'balanced'],
  },
  {
    category: 'gitlab_token',
    regex: /\b(glpat-)[A-Za-z0-9_-]{20,}\b/g,
    replacement: '<REDACTED:gitlab_token>',
    modes: ['strict', 'balanced'],
  },
  {
    category: 'slack_token',
    regex: /\b(xoxb-|xoxp-|xoxs-|xoxa-)[A-Za-z0-9-]{10,}\b/g,
    replacement: '<REDACTED:slack_token>',
    modes: ['strict', 'balanced'],
  },
  {
    category: 'stripe_key',
    regex: /\b(sk_live_|pk_live_|sk_test_|pk_test_|rk_live_|rk_test_)[A-Za-z0-9]{10,}\b/g,
    replacement: '<REDACTED:stripe_key>',
    modes: ['strict', 'balanced'],
  },
  {
    category: 'google_api_key',
    regex: /\bAIzaSy[A-Za-z0-9_-]{33}\b/g,
    replacement: '<REDACTED:google_api_key>',
    modes: ['strict', 'balanced'],
  },
  {
    category: 'aws_session_token',
    regex: /\bASIA[0-9A-Z]{16}\b/g,
    replacement: '<REDACTED:aws_session_token>',
    modes: ['strict', 'balanced'],
  },
  {
    category: 'connection_string',
    regex: /\b(mongodb(\+srv)?|postgres(ql)?|mysql|redis|amqp):\/\/[^\s"']+/gi,
    replacement: '<REDACTED:connection_string>',
    modes: ['strict', 'balanced'],
  },
  {
    category: 'generic_secret',
    regex: /\b(password|secret|token|apikey|api_key|access_key|secret_key)\s*[:=]\s*['"]?(?!ghp_|gho_|ghs_|ghr_|github_pat_|glpat-|xoxb-|xoxp-|xoxs-|xoxa-|sk_live_|pk_live_|sk_test_|pk_test_|rk_live_|rk_test_|AIzaSy|AKIA|ASIA|<REDACTED:)[^\s'"]{8,}['"]?/gi,
    replacement: '<REDACTED:generic_secret>',
    modes: ['strict', 'balanced'],
  },
  {
    category: 'email',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '<REDACTED:pii_email>',
    modes: ['strict'],
  },
  {
    category: 'phone',
    regex: /\b(\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '<REDACTED:pii_phone>',
    modes: ['strict'],
  },
  {
    category: 'ssn',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '<REDACTED:pii_ssn>',
    modes: ['strict'],
  },
];

/**
 * Self-hosted providers that may receive unredacted transcripts.
 * All other providers require redaction.
 */
const SELF_HOSTED_PROVIDERS = new Set(['ollama']);

/**
 * Providers allowed for security-sensitive agents.
 * OpenRouter is explicitly excluded (third-party proxy).
 */
const SECURITY_AGENT_ALLOWED_PROVIDERS = new Set(['claude', 'ollama']);

export function isSelfHosted(provider: string): boolean {
  return SELF_HOSTED_PROVIDERS.has(provider);
}

export function isSecurityAgentAllowed(provider: string): boolean {
  return SECURITY_AGENT_ALLOWED_PROVIDERS.has(provider);
}

export function isSecurityAgent(agentName: string): boolean {
  return /^qe-security|^qe-pentest/.test(agentName);
}

/**
 * Redact sensitive patterns from text.
 * Returns the redacted text and a list of categories found.
 */
export function redact(text: string, mode: RedactionMode = 'strict'): RedactionResult {
  if (mode === 'off') {
    return { text, redactions: [], replacementCount: 0 };
  }

  let result = text;
  const foundCategories = new Set<string>();
  let totalReplacements = 0;

  for (const pattern of PATTERNS) {
    if (!pattern.modes.includes(mode)) continue;

    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    const matches = result.match(regex);
    if (matches && matches.length > 0) {
      foundCategories.add(pattern.category);
      totalReplacements += matches.length;
      result = result.replace(regex, pattern.replacement);
    }
  }

  return {
    text: result,
    redactions: Array.from(foundCategories).sort(),
    replacementCount: totalReplacements,
  };
}

/**
 * Validate that the advisor call is allowed given the agent and provider.
 * Throws with a descriptive message if the combination is forbidden.
 */
export function validateProviderForAgent(
  agentName: string,
  provider: string,
  redactionMode: RedactionMode,
): void {
  if (isSecurityAgent(agentName) && !isSecurityAgentAllowed(provider)) {
    throw new AdvisorRedactionError(
      `Security agent "${agentName}" may only use providers: ${[...SECURITY_AGENT_ALLOWED_PROVIDERS].join(', ')}. ` +
      `Got: "${provider}". OpenRouter is excluded (third-party proxy risk).`,
      6,
    );
  }

  if (redactionMode === 'off' && !isSelfHosted(provider)) {
    throw new AdvisorRedactionError(
      `Redaction mode "off" is only allowed for self-hosted providers (${[...SELF_HOSTED_PROVIDERS].join(', ')}). ` +
      `Got: "${provider}".`,
      6,
    );
  }
}

export class AdvisorRedactionError extends Error {
  constructor(message: string, public readonly exitCode: number) {
    super(message);
    this.name = 'AdvisorRedactionError';
  }
}
