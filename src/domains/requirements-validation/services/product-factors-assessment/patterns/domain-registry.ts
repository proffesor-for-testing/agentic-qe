/**
 * Domain Pattern Registry
 *
 * Provides domain-specific patterns for:
 * - Detection: Identify domains from requirements text
 * - Required Coverage: Define must-have test types per domain
 * - BS Indicators: Domain-specific vagueness patterns
 * - Test Templates: Domain-specific test ideas
 *
 * This enables the assessor to generate domain-specific, not generic, test ideas.
 */

import { HTSMCategory, Priority, AutomationFitness, TestIdea, generateTestId } from '../types';

/**
 * BS Pattern for domain-specific vagueness detection
 */
export interface DomainBSPattern {
  pattern: RegExp;
  issue: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  recommendation: string;
}

/**
 * Domain-specific test template
 */
export interface DomainTestTemplate {
  id: string;
  description: string;
  category: HTSMCategory;
  subcategory: string;
  priority: Priority;
  automationFitness: AutomationFitness;
  rationale: string;
  tags: string[];
}

/**
 * Complete domain pattern definition
 */
export interface DomainPattern {
  /** Unique domain identifier */
  domain: string;
  /** Human-readable name */
  displayName: string;
  /** Regex patterns to detect this domain */
  indicators: RegExp[];
  /** Base confidence score (0-1) when any indicator matches */
  baseConfidence: number;
  /** Minimum indicators required for confident detection */
  minIndicatorsForConfidence: number;
  /** Test coverage that MUST be present for this domain */
  requiredCoverage: string[];
  /** Domain-specific vagueness patterns (BS detection) */
  bsPatterns: DomainBSPattern[];
  /** Domain-specific test templates */
  testTemplates: DomainTestTemplate[];
  /** Related compliance frameworks */
  complianceFrameworks: string[];
  /** Domain-specific clarifying questions */
  clarifyingQuestions: Array<{
    question: string;
    category: HTSMCategory;
    priority: Priority;
    riskIfUnanswered: string;
  }>;
}

/**
 * Result of domain detection
 */
export interface DomainDetectionResult {
  domain: string;
  displayName: string;
  confidence: number;
  matchedIndicators: string[];
  requiredCoverage: string[];
  complianceFrameworks: string[];
}

/**
 * Domain Pattern Registry
 *
 * Contains patterns for all supported domains.
 * Each domain has:
 * - indicators: regex patterns to detect the domain
 * - requiredCoverage: test types that MUST be present
 * - bsPatterns: domain-specific vagueness to flag
 * - testTemplates: domain-specific test ideas to inject
 */
export const DOMAIN_PATTERNS: Record<string, DomainPattern> = {
  'stripe-subscription': {
    domain: 'stripe-subscription',
    displayName: 'Stripe Subscription/Payment',
    indicators: [
      /stripe/i,
      /subscription\s*(billing|payment|model|management)/i,
      /recurring\s*(billing|payment|revenue)/i,
      /proration/i,
      /webhook.*(?:invoice|payment|subscription)/i,
      /payment\s*intent/i,
      /checkout\s*session/i,
      /customer\s*portal/i,
      /dunning/i,
      /metered\s*billing/i,
    ],
    baseConfidence: 0.85,
    minIndicatorsForConfidence: 2,
    requiredCoverage: [
      'webhook-idempotency',
      'subscription-lifecycle',
      'sca-authentication',
      'proration-calculation',
      'failed-payment-retry',
      'dunning-flow',
      'invoice-generation',
      'refund-handling',
    ],
    complianceFrameworks: ['PCI-DSS', 'PSD2'],
    bsPatterns: [
      {
        pattern: /seamless\s*(payment|checkout|integration)/i,
        issue: 'Undefined error handling for declined cards, insufficient funds, or network failures',
        severity: 'HIGH',
        recommendation: 'Define: Decline reason display, retry logic, fallback payment methods, timeout handling',
      },
      {
        pattern: /automatic\s*(billing|renewal|subscription)/i,
        issue: 'No dunning/retry policy specified for failed recurring payments',
        severity: 'HIGH',
        recommendation: 'Specify: Retry schedule (e.g., 1, 3, 7 days), grace period, cancellation trigger, customer notification',
      },
      {
        pattern: /real-?time\s*(subscription|billing|payment)/i,
        issue: 'Stripe webhook delivery is asynchronous, not real-time',
        severity: 'MEDIUM',
        recommendation: 'Clarify: Webhook processing latency tolerance, polling fallback strategy, eventual consistency handling',
      },
      {
        pattern: /instant\s*(upgrade|downgrade|change)/i,
        issue: 'Subscription changes involve proration calculations that are not instant',
        severity: 'MEDIUM',
        recommendation: 'Define: Proration behavior (charge immediately, next invoice, credit), effective date handling',
      },
      {
        pattern: /secure\s*payment/i,
        issue: 'Generic security claim without specific PCI-DSS controls',
        severity: 'HIGH',
        recommendation: 'Specify: PCI-DSS compliance scope (SAQ-A/SAQ-D), tokenization, 3D Secure requirements',
      },
    ],
    testTemplates: [
      {
        id: 'STRIPE-001',
        description: 'Verify subscription lifecycle transitions: trial → active → past_due → canceled → expired',
        category: HTSMCategory.OPERATIONS,
        subcategory: 'StateTransition',
        priority: Priority.P0,
        automationFitness: AutomationFitness.Integration,
        rationale: 'Stripe subscriptions have specific state machine - all transitions must be tested',
        tags: ['stripe', 'subscription', 'lifecycle', 'state-machine'],
      },
      {
        id: 'STRIPE-002',
        description: 'Test webhook idempotency: duplicate invoice.paid events must not double-credit subscription period',
        category: HTSMCategory.INTERFACES,
        subcategory: 'SystemInterface',
        priority: Priority.P0,
        automationFitness: AutomationFitness.Integration,
        rationale: 'Stripe retries webhooks up to 72 hours - handlers must be idempotent',
        tags: ['stripe', 'webhook', 'idempotency', 'integration'],
      },
      {
        id: 'STRIPE-003',
        description: 'Verify SCA authentication flow for EU cards requiring 3D Secure challenge',
        category: HTSMCategory.FUNCTION,
        subcategory: 'Security',
        priority: Priority.P0,
        automationFitness: AutomationFitness.E2E,
        rationale: 'PSD2 requires Strong Customer Authentication for EU payments',
        tags: ['stripe', 'sca', 'psd2', '3ds', 'authentication'],
      },
      {
        id: 'STRIPE-004',
        description: 'Test proration calculations when upgrading/downgrading mid-billing-cycle',
        category: HTSMCategory.DATA,
        subcategory: 'Calculation',
        priority: Priority.P1,
        automationFitness: AutomationFitness.API,
        rationale: 'Proration math must be exact - verify credit/debit amounts match Stripe calculations',
        tags: ['stripe', 'proration', 'billing', 'calculation'],
      },
      {
        id: 'STRIPE-005',
        description: 'Verify dunning flow: failed payment → retry schedule → grace period → cancellation',
        category: HTSMCategory.OPERATIONS,
        subcategory: 'StateTransition',
        priority: Priority.P1,
        automationFitness: AutomationFitness.Integration,
        rationale: 'Revenue recovery depends on proper dunning - test full flow with Stripe test clocks',
        tags: ['stripe', 'dunning', 'retry', 'payment-recovery'],
      },
      {
        id: 'STRIPE-006',
        description: 'Test customer.subscription.updated webhook handling for plan changes',
        category: HTSMCategory.INTERFACES,
        subcategory: 'SystemInterface',
        priority: Priority.P1,
        automationFitness: AutomationFitness.Integration,
        rationale: 'Plan changes trigger webhooks that must update local subscription state',
        tags: ['stripe', 'webhook', 'subscription', 'plan-change'],
      },
      {
        id: 'STRIPE-007',
        description: 'Verify invoice.payment_failed webhook triggers appropriate customer notification',
        category: HTSMCategory.INTERFACES,
        subcategory: 'SystemInterface',
        priority: Priority.P1,
        automationFitness: AutomationFitness.Integration,
        rationale: 'Failed payments must notify customers to update payment method',
        tags: ['stripe', 'webhook', 'payment-failed', 'notification'],
      },
      {
        id: 'STRIPE-008',
        description: 'Test refund handling: full refund, partial refund, refund to different payment method',
        category: HTSMCategory.FUNCTION,
        subcategory: 'Application',
        priority: Priority.P1,
        automationFitness: AutomationFitness.API,
        rationale: 'Refunds must be properly recorded and reflected in subscription/invoice state',
        tags: ['stripe', 'refund', 'payment'],
      },
    ],
    clarifyingQuestions: [
      {
        question: 'Which Stripe webhook events must be handled (invoice.paid, customer.subscription.updated, payment_intent.succeeded, etc.)?',
        category: HTSMCategory.INTERFACES,
        priority: Priority.P0,
        riskIfUnanswered: 'Missing webhook handlers will cause subscription state drift between Stripe and application',
      },
      {
        question: 'What is the retry schedule for failed payments (immediate, 3 days, 7 days)? When should subscription be canceled?',
        category: HTSMCategory.OPERATIONS,
        priority: Priority.P0,
        riskIfUnanswered: 'Undefined dunning flow leads to revenue loss and poor customer experience',
      },
      {
        question: 'How should proration be handled for mid-cycle plan changes (immediate charge, credit to next invoice, no proration)?',
        category: HTSMCategory.DATA,
        priority: Priority.P1,
        riskIfUnanswered: 'Incorrect proration causes billing disputes and customer complaints',
      },
      {
        question: 'Is SCA/3D Secure required for all payments or only EU customers? What is the fallback if authentication fails?',
        category: HTSMCategory.FUNCTION,
        priority: Priority.P0,
        riskIfUnanswered: 'PSD2 non-compliance can result in payment failures for EU customers',
      },
    ],
  },

  'gdpr-compliance': {
    domain: 'gdpr-compliance',
    displayName: 'GDPR Compliance',
    indicators: [
      /gdpr/i,
      /data\s*subject\s*(request|right)/i,
      /right\s*to\s*(erasure|deletion|be\s*forgotten)/i,
      /consent\s*(management|withdrawal|collection)/i,
      /data\s*portability/i,
      /lawful\s*basis/i,
      /data\s*protection\s*(officer|impact|assessment)/i,
      /personal\s*data/i,
      /processing\s*agreement/i,
      /privacy\s*(by\s*design|policy|notice)/i,
    ],
    baseConfidence: 0.90,
    minIndicatorsForConfidence: 2,
    requiredCoverage: [
      'consent-collection',
      'consent-withdrawal',
      'right-to-erasure',
      'right-to-access',
      'data-portability',
      'consent-granularity',
      'lawful-basis-validation',
      'data-minimization',
    ],
    complianceFrameworks: ['GDPR', 'ePrivacy'],
    bsPatterns: [
      {
        pattern: /gdpr\s*compliant/i,
        issue: 'Generic compliance claim without specific consent mechanism or data subject rights implementation',
        severity: 'CRITICAL',
        recommendation: 'Define: Consent collection flow, withdrawal mechanism, DSR response time (30 days), data mapping',
      },
      {
        pattern: /privacy\s*by\s*design/i,
        issue: 'Privacy by design claim without data minimization or pseudonymization strategy',
        severity: 'HIGH',
        recommendation: 'Specify: Data minimization approach, retention periods, encryption at rest, access controls',
      },
      {
        pattern: /user\s*consent/i,
        issue: 'Consent mentioned without specificity on granularity or withdrawal',
        severity: 'HIGH',
        recommendation: 'Define: Consent granularity (per purpose), double opt-in requirement, withdrawal flow, consent audit trail',
      },
      {
        pattern: /data\s*retention/i,
        issue: 'Retention mentioned without specific periods or deletion procedure',
        severity: 'MEDIUM',
        recommendation: 'Specify: Retention period per data type, automatic deletion triggers, audit log retention',
      },
    ],
    testTemplates: [
      {
        id: 'GDPR-001',
        description: 'Verify consent collection captures explicit opt-in with timestamp and consent version',
        category: HTSMCategory.FUNCTION,
        subcategory: 'Application',
        priority: Priority.P0,
        automationFitness: AutomationFitness.E2E,
        rationale: 'GDPR Article 7 requires demonstrable consent with audit trail',
        tags: ['gdpr', 'consent', 'audit', 'compliance'],
      },
      {
        id: 'GDPR-002',
        description: 'Test consent withdrawal removes all non-essential processing permissions immediately',
        category: HTSMCategory.FUNCTION,
        subcategory: 'StateTransition',
        priority: Priority.P0,
        automationFitness: AutomationFitness.Integration,
        rationale: 'GDPR Article 7(3) requires consent withdrawal to be as easy as giving consent',
        tags: ['gdpr', 'consent', 'withdrawal', 'compliance'],
      },
      {
        id: 'GDPR-003',
        description: 'Verify right to erasure deletes personal data within 30 days and confirms deletion',
        category: HTSMCategory.DATA,
        subcategory: 'Lifecycle',
        priority: Priority.P0,
        automationFitness: AutomationFitness.Integration,
        rationale: 'GDPR Article 17 requires erasure "without undue delay" (max 30 days)',
        tags: ['gdpr', 'erasure', 'deletion', 'dsr'],
      },
      {
        id: 'GDPR-004',
        description: 'Test data portability export produces machine-readable format (JSON/CSV) with all personal data',
        category: HTSMCategory.DATA,
        subcategory: 'ImportExport',
        priority: Priority.P1,
        automationFitness: AutomationFitness.API,
        rationale: 'GDPR Article 20 requires data portability in structured, commonly used format',
        tags: ['gdpr', 'portability', 'export', 'dsr'],
      },
      {
        id: 'GDPR-005',
        description: 'Verify consent granularity allows separate opt-in for marketing, analytics, and personalization',
        category: HTSMCategory.FUNCTION,
        subcategory: 'Application',
        priority: Priority.P1,
        automationFitness: AutomationFitness.E2E,
        rationale: 'Bundled consent is not freely given - must be granular per purpose',
        tags: ['gdpr', 'consent', 'granularity', 'purpose'],
      },
      {
        id: 'GDPR-006',
        description: 'Test right-to-erasure with active subscription handles billing record retention correctly',
        category: HTSMCategory.DATA,
        subcategory: 'Lifecycle',
        priority: Priority.P0,
        automationFitness: AutomationFitness.Integration,
        rationale: 'Tax/accounting records may need retention even after erasure request',
        tags: ['gdpr', 'erasure', 'subscription', 'billing', 'retention'],
      },
    ],
    clarifyingQuestions: [
      {
        question: 'What is the consent withdrawal flow for users with active subscriptions? Must subscription be canceled first?',
        category: HTSMCategory.OPERATIONS,
        priority: Priority.P0,
        riskIfUnanswered: 'GDPR Article 7(3) requires easy consent withdrawal - blocking on subscription status may violate this',
      },
      {
        question: 'Which personal data must be retained for tax/legal compliance even after erasure request?',
        category: HTSMCategory.DATA,
        priority: Priority.P0,
        riskIfUnanswered: 'Deleting billing records may violate tax law; keeping unnecessary data violates GDPR',
      },
      {
        question: 'What is the consent granularity - single consent or separate for marketing, analytics, personalization?',
        category: HTSMCategory.FUNCTION,
        priority: Priority.P1,
        riskIfUnanswered: 'Bundled consent may be invalid under GDPR, requiring re-consent from all users',
      },
    ],
  },

  'pci-dss': {
    domain: 'pci-dss',
    displayName: 'PCI-DSS Payment Security',
    indicators: [
      /pci[-\s]?dss/i,
      /cardholder\s*data/i,
      /payment\s*card/i,
      /credit\s*card/i,
      /card\s*number/i,
      /cvv|cvc|security\s*code/i,
      /tokenization/i,
      /pan\s*(masking|truncation)/i,
    ],
    baseConfidence: 0.90,
    minIndicatorsForConfidence: 2,
    requiredCoverage: [
      'card-data-encryption',
      'tokenization',
      'access-logging',
      'network-segmentation',
      'vulnerability-scanning',
      'pan-masking',
    ],
    complianceFrameworks: ['PCI-DSS'],
    bsPatterns: [
      {
        pattern: /secure\s*(card|payment)\s*(processing|handling)/i,
        issue: 'Generic security claim without PCI-DSS SAQ level or specific controls',
        severity: 'CRITICAL',
        recommendation: 'Specify: PCI-DSS SAQ level (A, A-EP, D), tokenization provider, network segmentation',
      },
      {
        pattern: /encrypted\s*(card|payment)/i,
        issue: 'Encryption claim without algorithm or key management specification',
        severity: 'HIGH',
        recommendation: 'Define: Encryption algorithm (AES-256), key rotation policy, HSM usage, TLS version',
      },
    ],
    testTemplates: [
      {
        id: 'PCI-001',
        description: 'Verify cardholder data is never logged in application logs or error messages',
        category: HTSMCategory.DATA,
        subcategory: 'Persistence',
        priority: Priority.P0,
        automationFitness: AutomationFitness.Security,
        rationale: 'PCI-DSS Requirement 3.4 prohibits storing sensitive authentication data',
        tags: ['pci-dss', 'logging', 'cardholder-data', 'security'],
      },
      {
        id: 'PCI-002',
        description: 'Test that PAN is masked when displayed (show only last 4 digits)',
        category: HTSMCategory.INTERFACES,
        subcategory: 'UserInterface',
        priority: Priority.P0,
        automationFitness: AutomationFitness.E2E,
        rationale: 'PCI-DSS Requirement 3.3 requires PAN masking when displayed',
        tags: ['pci-dss', 'pan-masking', 'display', 'security'],
      },
      {
        id: 'PCI-003',
        description: 'Verify tokenization replaces PAN with non-sensitive token for storage',
        category: HTSMCategory.DATA,
        subcategory: 'Persistence',
        priority: Priority.P0,
        automationFitness: AutomationFitness.Integration,
        rationale: 'Tokenization reduces PCI-DSS scope by removing card data from environment',
        tags: ['pci-dss', 'tokenization', 'storage', 'security'],
      },
    ],
    clarifyingQuestions: [
      {
        question: 'What is the PCI-DSS SAQ level (A, A-EP, D)? Is cardholder data ever stored locally?',
        category: HTSMCategory.FUNCTION,
        priority: Priority.P0,
        riskIfUnanswered: 'PCI-DSS scope affects entire architecture - wrong SAQ level means compliance failure',
      },
    ],
  },

  'hipaa': {
    domain: 'hipaa',
    displayName: 'HIPAA Healthcare Compliance',
    indicators: [
      /hipaa/i,
      /phi\b/i,
      /protected\s*health\s*information/i,
      /healthcare\s*data/i,
      /patient\s*(data|record|information)/i,
      /medical\s*record/i,
      /covered\s*entity/i,
      /business\s*associate/i,
      /ephi/i,
    ],
    baseConfidence: 0.90,
    minIndicatorsForConfidence: 2,
    requiredCoverage: [
      'phi-encryption',
      'access-control-audit',
      'minimum-necessary',
      'baa-validation',
      'breach-notification',
    ],
    complianceFrameworks: ['HIPAA', 'HITECH'],
    bsPatterns: [
      {
        pattern: /hipaa\s*compliant/i,
        issue: 'Generic HIPAA claim without specific safeguards or BAA coverage',
        severity: 'CRITICAL',
        recommendation: 'Define: Administrative, physical, technical safeguards, BAA with all vendors, audit controls',
      },
      {
        pattern: /secure\s*(patient|health)\s*data/i,
        issue: 'Security claim without encryption specification or access control details',
        severity: 'HIGH',
        recommendation: 'Specify: Encryption at rest/transit, role-based access, audit logging, automatic logoff',
      },
    ],
    testTemplates: [
      {
        id: 'HIPAA-001',
        description: 'Verify PHI is encrypted at rest using AES-256 and in transit using TLS 1.2+',
        category: HTSMCategory.DATA,
        subcategory: 'Persistence',
        priority: Priority.P0,
        automationFitness: AutomationFitness.Security,
        rationale: 'HIPAA Security Rule requires encryption of ePHI',
        tags: ['hipaa', 'phi', 'encryption', 'security'],
      },
      {
        id: 'HIPAA-002',
        description: 'Test that all PHI access is logged with user, timestamp, and action',
        category: HTSMCategory.FUNCTION,
        subcategory: 'Security',
        priority: Priority.P0,
        automationFitness: AutomationFitness.Integration,
        rationale: 'HIPAA requires audit controls for PHI access',
        tags: ['hipaa', 'phi', 'audit', 'logging'],
      },
      {
        id: 'HIPAA-003',
        description: 'Verify minimum necessary access - users only see PHI required for their role',
        category: HTSMCategory.FUNCTION,
        subcategory: 'Security',
        priority: Priority.P0,
        automationFitness: AutomationFitness.E2E,
        rationale: 'HIPAA minimum necessary rule limits PHI disclosure',
        tags: ['hipaa', 'phi', 'access-control', 'rbac'],
      },
    ],
    clarifyingQuestions: [
      {
        question: 'Is a Business Associate Agreement (BAA) required with cloud providers? Which services store/process PHI?',
        category: HTSMCategory.PLATFORM,
        priority: Priority.P0,
        riskIfUnanswered: 'HIPAA requires BAAs with all business associates - missing BAA is a compliance violation',
      },
    ],
  },

  'oauth-oidc': {
    domain: 'oauth-oidc',
    displayName: 'OAuth 2.0 / OpenID Connect',
    indicators: [
      /oauth\s*2?\.?0?/i,
      /openid\s*connect/i,
      /oidc/i,
      /authorization\s*code\s*(flow|grant)/i,
      /access\s*token/i,
      /refresh\s*token/i,
      /jwt|json\s*web\s*token/i,
      /id\s*token/i,
      /pkce/i,
      /authorization\s*server/i,
    ],
    baseConfidence: 0.85,
    minIndicatorsForConfidence: 2,
    requiredCoverage: [
      'token-validation',
      'token-expiration',
      'refresh-token-rotation',
      'scope-validation',
      'pkce-verification',
      'token-revocation',
    ],
    complianceFrameworks: ['OAuth 2.0', 'OIDC'],
    bsPatterns: [
      {
        pattern: /secure\s*authentication/i,
        issue: 'Authentication claim without OAuth flow or token management specification',
        severity: 'HIGH',
        recommendation: 'Define: OAuth flow (authorization code + PKCE), token storage, expiration policy, refresh strategy',
      },
      {
        pattern: /sso|single\s*sign[- ]?on/i,
        issue: 'SSO claim without identity provider or session management details',
        severity: 'MEDIUM',
        recommendation: 'Specify: IdP integration, session timeout, concurrent session handling, logout flow',
      },
    ],
    testTemplates: [
      {
        id: 'OAUTH-001',
        description: 'Verify access token validation includes signature, expiration, audience, and issuer checks',
        category: HTSMCategory.FUNCTION,
        subcategory: 'Security',
        priority: Priority.P0,
        automationFitness: AutomationFitness.API,
        rationale: 'Token validation prevents unauthorized access with forged or expired tokens',
        tags: ['oauth', 'jwt', 'token', 'validation', 'security'],
      },
      {
        id: 'OAUTH-002',
        description: 'Test refresh token rotation - old refresh token must be invalidated after use',
        category: HTSMCategory.FUNCTION,
        subcategory: 'Security',
        priority: Priority.P0,
        automationFitness: AutomationFitness.API,
        rationale: 'Refresh token rotation prevents token replay attacks',
        tags: ['oauth', 'refresh-token', 'rotation', 'security'],
      },
      {
        id: 'OAUTH-003',
        description: 'Verify PKCE code_verifier is required for authorization code exchange',
        category: HTSMCategory.FUNCTION,
        subcategory: 'Security',
        priority: Priority.P0,
        automationFitness: AutomationFitness.API,
        rationale: 'PKCE prevents authorization code interception attacks',
        tags: ['oauth', 'pkce', 'security', 'authorization-code'],
      },
      {
        id: 'OAUTH-004',
        description: 'Test token revocation invalidates both access and refresh tokens',
        category: HTSMCategory.FUNCTION,
        subcategory: 'Security',
        priority: Priority.P1,
        automationFitness: AutomationFitness.API,
        rationale: 'Logout must revoke all tokens to prevent continued access',
        tags: ['oauth', 'revocation', 'logout', 'security'],
      },
    ],
    clarifyingQuestions: [
      {
        question: 'What OAuth flow is used (Authorization Code + PKCE, Client Credentials)? Where are tokens stored?',
        category: HTSMCategory.FUNCTION,
        priority: Priority.P0,
        riskIfUnanswered: 'Wrong OAuth flow creates security vulnerabilities - PKCE is required for public clients',
      },
      {
        question: 'What is the access token expiration time? How is refresh token rotation handled?',
        category: HTSMCategory.TIME,
        priority: Priority.P1,
        riskIfUnanswered: 'Long-lived tokens increase attack surface; missing rotation enables token replay',
      },
    ],
  },

  'webhook-integration': {
    domain: 'webhook-integration',
    displayName: 'Webhook Integration',
    indicators: [
      /webhook/i,
      /callback\s*url/i,
      /event\s*(notification|delivery)/i,
      /http\s*callback/i,
      /push\s*notification/i,
      /event\s*subscription/i,
    ],
    baseConfidence: 0.80,
    minIndicatorsForConfidence: 2,
    requiredCoverage: [
      'webhook-signature-verification',
      'idempotency-handling',
      'retry-logic',
      'delivery-confirmation',
      'timeout-handling',
    ],
    complianceFrameworks: [],
    bsPatterns: [
      {
        pattern: /real-?time\s*(notification|update|event)/i,
        issue: 'Real-time claim when webhooks are asynchronous with retry delays',
        severity: 'MEDIUM',
        recommendation: 'Clarify: Typical delivery latency, retry backoff strategy, eventual consistency handling',
      },
    ],
    testTemplates: [
      {
        id: 'WEBHOOK-001',
        description: 'Verify webhook signature validation rejects tampered payloads',
        category: HTSMCategory.FUNCTION,
        subcategory: 'Security',
        priority: Priority.P0,
        automationFitness: AutomationFitness.Integration,
        rationale: 'Signature verification prevents spoofed webhook attacks',
        tags: ['webhook', 'signature', 'security', 'validation'],
      },
      {
        id: 'WEBHOOK-002',
        description: 'Test idempotency: processing same webhook event twice must not cause duplicate actions',
        category: HTSMCategory.FUNCTION,
        subcategory: 'ErrorHandling',
        priority: Priority.P0,
        automationFitness: AutomationFitness.Integration,
        rationale: 'Webhook providers retry on timeout - handlers must be idempotent',
        tags: ['webhook', 'idempotency', 'retry', 'integration'],
      },
      {
        id: 'WEBHOOK-003',
        description: 'Verify webhook handler responds within timeout (typically 30 seconds)',
        category: HTSMCategory.TIME,
        subcategory: 'Timeout',
        priority: Priority.P1,
        automationFitness: AutomationFitness.Performance,
        rationale: 'Slow webhook processing triggers unnecessary retries',
        tags: ['webhook', 'timeout', 'performance'],
      },
    ],
    clarifyingQuestions: [
      {
        question: 'How is webhook signature verified? What algorithm is used (HMAC-SHA256)?',
        category: HTSMCategory.FUNCTION,
        priority: Priority.P0,
        riskIfUnanswered: 'Without signature verification, attackers can send spoofed webhook events',
      },
    ],
  },
};

/**
 * DomainPatternRegistry class for domain detection and pattern retrieval
 */
export class DomainPatternRegistry {
  private patterns: Record<string, DomainPattern>;

  constructor(customPatterns?: Record<string, DomainPattern>) {
    this.patterns = { ...DOMAIN_PATTERNS, ...customPatterns };
  }

  /**
   * Detect domains from input text with confidence scoring
   * Returns all matching domains sorted by confidence
   */
  detectDomains(input: string): DomainDetectionResult[] {
    const results: DomainDetectionResult[] = [];
    const inputLower = input.toLowerCase();

    for (const [, pattern] of Object.entries(this.patterns)) {
      const matchedIndicators: string[] = [];

      for (const indicator of pattern.indicators) {
        const match = inputLower.match(indicator);
        if (match) {
          matchedIndicators.push(match[0]);
        }
      }

      if (matchedIndicators.length > 0) {
        // Calculate confidence based on number of indicators matched
        const indicatorRatio = matchedIndicators.length / pattern.indicators.length;
        const meetsMinimum = matchedIndicators.length >= pattern.minIndicatorsForConfidence;

        // Confidence = baseConfidence * indicatorRatio, boosted if meeting minimum
        let confidence = pattern.baseConfidence * indicatorRatio;
        if (meetsMinimum) {
          confidence = Math.min(1.0, confidence * 1.2); // 20% boost for meeting minimum
        }

        results.push({
          domain: pattern.domain,
          displayName: pattern.displayName,
          confidence: Math.round(confidence * 100) / 100,
          matchedIndicators,
          requiredCoverage: pattern.requiredCoverage,
          complianceFrameworks: pattern.complianceFrameworks,
        });
      }
    }

    // Sort by confidence descending
    return results.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get domain pattern by domain ID
   */
  getPattern(domain: string): DomainPattern | undefined {
    return this.patterns[domain];
  }

  /**
   * Get BS patterns for detected domains
   */
  getBSPatterns(domains: string[]): DomainBSPattern[] {
    const patterns: DomainBSPattern[] = [];
    for (const domain of domains) {
      const pattern = this.patterns[domain];
      if (pattern?.bsPatterns) {
        patterns.push(...pattern.bsPatterns);
      }
    }
    return patterns;
  }

  /**
   * Get test templates for detected domains
   */
  getTestTemplates(domains: string[]): DomainTestTemplate[] {
    const templates: DomainTestTemplate[] = [];
    for (const domain of domains) {
      const pattern = this.patterns[domain];
      if (pattern?.testTemplates) {
        templates.push(...pattern.testTemplates);
      }
    }
    return templates;
  }

  /**
   * Get required coverage for detected domains
   */
  getRequiredCoverage(domains: string[]): string[] {
    const coverage = new Set<string>();
    for (const domain of domains) {
      const pattern = this.patterns[domain];
      if (pattern?.requiredCoverage) {
        for (const req of pattern.requiredCoverage) {
          coverage.add(req);
        }
      }
    }
    return Array.from(coverage);
  }

  /**
   * Get clarifying questions for detected domains
   */
  getClarifyingQuestions(domains: string[]): DomainPattern['clarifyingQuestions'] {
    const questions: DomainPattern['clarifyingQuestions'] = [];
    for (const domain of domains) {
      const pattern = this.patterns[domain];
      if (pattern?.clarifyingQuestions) {
        questions.push(...pattern.clarifyingQuestions);
      }
    }
    return questions;
  }

  /**
   * Convert domain test templates to TestIdea objects
   */
  generateDomainTestIdeas(domains: string[]): TestIdea[] {
    const templates = this.getTestTemplates(domains);
    return templates.map(template => ({
      id: generateTestId(template.category),
      category: template.category,
      subcategory: template.subcategory,
      description: template.description,
      priority: template.priority,
      automationFitness: template.automationFitness,
      tags: template.tags,
      rationale: template.rationale,
      sourceRequirement: `Domain: ${domains.join(', ')}`,
    }));
  }

  /**
   * Get all registered domain IDs
   */
  getAllDomains(): string[] {
    return Object.keys(this.patterns);
  }
}

// Export singleton instance
export const domainPatternRegistry = new DomainPatternRegistry();
