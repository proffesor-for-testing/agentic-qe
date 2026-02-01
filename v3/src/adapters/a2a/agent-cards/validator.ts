/**
 * A2A Agent Card Validator
 *
 * JSON Schema validation for A2A v0.3 Agent Capability Cards.
 * Provides comprehensive validation with detailed error reporting.
 *
 * @module adapters/a2a/agent-cards/validator
 */

import {
  AgentCard,
  AgentSkill,
  AgentCapabilities,
  AgentProvider,
  SecurityScheme,
  AgentAuthentication,
  QEAgentCard,
  isAgentCard,
  isAgentSkill,
  isSecurityScheme,
} from './schema.js';

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Severity level for validation issues
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * A single validation issue
 */
export interface ValidationIssue {
  /** Issue severity */
  readonly severity: ValidationSeverity;
  /** JSON path to the problematic field */
  readonly path: string;
  /** Human-readable error message */
  readonly message: string;
  /** Error code for programmatic handling */
  readonly code: string;
  /** Actual value that caused the issue */
  readonly value?: unknown;
  /** Expected value or pattern */
  readonly expected?: string;
}

/**
 * Result of validation
 */
export interface ValidationResult {
  /** Whether the validation passed (no errors) */
  readonly valid: boolean;
  /** List of validation issues found */
  readonly issues: ValidationIssue[];
  /** Summary counts by severity */
  readonly summary: {
    readonly errors: number;
    readonly warnings: number;
    readonly info: number;
  };
}

/**
 * Validation options
 */
export interface ValidatorOptions {
  /** Include warnings in validation result */
  readonly includeWarnings?: boolean;
  /** Include info messages in validation result */
  readonly includeInfo?: boolean;
  /** Validate QE-specific metadata */
  readonly validateQEMetadata?: boolean;
  /** Strict mode - treat warnings as errors */
  readonly strict?: boolean;
  /** Custom URL pattern for agent endpoints */
  readonly urlPattern?: RegExp;
  /** Custom version pattern */
  readonly versionPattern?: RegExp;
}

/**
 * Default validator options
 */
export const DEFAULT_VALIDATOR_OPTIONS: Required<ValidatorOptions> = {
  includeWarnings: true,
  includeInfo: true,
  validateQEMetadata: true,
  strict: false,
  urlPattern: /^https?:\/\/.+/,
  versionPattern: /^\d+\.\d+\.\d+$/,
};

// ============================================================================
// Validation Error Codes
// ============================================================================

/**
 * Validation error codes
 */
export const ValidationErrorCode = {
  // Required field errors
  MISSING_REQUIRED: 'MISSING_REQUIRED',
  INVALID_TYPE: 'INVALID_TYPE',

  // Format errors
  INVALID_URL: 'INVALID_URL',
  INVALID_VERSION: 'INVALID_VERSION',
  INVALID_SKILL_ID: 'INVALID_SKILL_ID',
  INVALID_TAG: 'INVALID_TAG',

  // Content errors
  EMPTY_STRING: 'EMPTY_STRING',
  EMPTY_ARRAY: 'EMPTY_ARRAY',
  DUPLICATE_SKILL_ID: 'DUPLICATE_SKILL_ID',
  DUPLICATE_TAG: 'DUPLICATE_TAG',

  // Security errors
  INVALID_SECURITY_SCHEME: 'INVALID_SECURITY_SCHEME',
  MISSING_OAUTH_FLOW: 'MISSING_OAUTH_FLOW',
  MISSING_TOKEN_URL: 'MISSING_TOKEN_URL',

  // QE-specific errors
  INVALID_DOMAIN: 'INVALID_DOMAIN',
  INVALID_MEMORY_NAMESPACE: 'INVALID_MEMORY_NAMESPACE',

  // Warnings
  MISSING_PROVIDER: 'MISSING_PROVIDER',
  MISSING_DOCUMENTATION: 'MISSING_DOCUMENTATION',
  MISSING_EXAMPLES: 'MISSING_EXAMPLES',
  MISSING_TAGS: 'MISSING_TAGS',
  NO_STREAMING: 'NO_STREAMING',
} as const;

// ============================================================================
// JSON Schema for A2A Agent Card
// ============================================================================

/**
 * JSON Schema for A2A Agent Card v0.3
 */
export const AGENT_CARD_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://a2a-protocol.org/schema/agent-card/v0.3',
  title: 'A2A Agent Card',
  description: 'Agent Capability Card per A2A Protocol v0.3',
  type: 'object',
  required: ['name', 'description', 'url', 'version', 'capabilities', 'skills'],
  properties: {
    name: {
      type: 'string',
      minLength: 1,
      description: 'Human-readable agent name',
    },
    description: {
      type: 'string',
      minLength: 1,
      description: 'Detailed agent description',
    },
    url: {
      type: 'string',
      format: 'uri',
      description: 'Service endpoint URL',
    },
    version: {
      type: 'string',
      pattern: '^\\d+\\.\\d+\\.\\d+',
      description: 'Semantic version',
    },
    provider: {
      type: 'object',
      properties: {
        organization: { type: 'string', minLength: 1 },
        url: { type: 'string', format: 'uri' },
      },
      required: ['organization'],
    },
    documentationUrl: {
      type: 'string',
      format: 'uri',
    },
    capabilities: {
      type: 'object',
      properties: {
        streaming: { type: 'boolean' },
        pushNotifications: { type: 'boolean' },
        stateTransitionHistory: { type: 'boolean' },
      },
    },
    skills: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'name', 'description'],
        properties: {
          id: { type: 'string', pattern: '^[a-z0-9-]+$' },
          name: { type: 'string', minLength: 1 },
          description: { type: 'string', minLength: 1 },
          tags: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
          examples: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
          inputModes: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
          outputModes: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    defaultInputModes: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
    },
    defaultOutputModes: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
    },
    securitySchemes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type'],
        properties: {
          type: {
            type: 'string',
            enum: ['apiKey', 'http', 'oauth2', 'openIdConnect', 'mutualTLS'],
          },
        },
      },
    },
    authentication: {
      type: 'object',
      properties: {
        schemes: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
        credentials: { type: 'string' },
      },
    },
    supportsAuthenticatedExtendedCard: {
      type: 'boolean',
    },
  },
} as const;

/**
 * JSON Schema for QE Agent Card extension
 */
export const QE_AGENT_CARD_JSON_SCHEMA = {
  ...AGENT_CARD_JSON_SCHEMA,
  $id: 'https://agentic-qe.github.io/schema/qe-agent-card/v3',
  title: 'QE Agent Card',
  description: 'QE-specific Agent Card extension',
  properties: {
    ...AGENT_CARD_JSON_SCHEMA.properties,
    qeMetadata: {
      type: 'object',
      properties: {
        domain: { type: 'string', minLength: 1 },
        v2Compatibility: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            deprecatedIn: { type: 'string' },
            removedIn: { type: 'string' },
          },
        },
        memoryReads: {
          type: 'array',
          items: { type: 'string' },
        },
        memoryWrites: {
          type: 'array',
          items: { type: 'string' },
        },
        relatedAgents: {
          type: 'array',
          items: { type: 'string' },
        },
        implementationStatus: {
          type: 'object',
          properties: {
            working: { type: 'array', items: { type: 'string' } },
            partial: { type: 'array', items: { type: 'string' } },
            planned: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  },
} as const;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Create a validation issue
 */
function createIssue(
  severity: ValidationSeverity,
  path: string,
  code: string,
  message: string,
  value?: unknown,
  expected?: string
): ValidationIssue {
  return { severity, path, code, message, value, expected };
}

/**
 * Validate required string field
 */
function validateRequiredString(
  value: unknown,
  path: string,
  fieldName: string,
  issues: ValidationIssue[]
): boolean {
  if (value === undefined || value === null) {
    issues.push(
      createIssue('error', path, ValidationErrorCode.MISSING_REQUIRED, `${fieldName} is required`)
    );
    return false;
  }

  if (typeof value !== 'string') {
    issues.push(
      createIssue(
        'error',
        path,
        ValidationErrorCode.INVALID_TYPE,
        `${fieldName} must be a string`,
        value,
        'string'
      )
    );
    return false;
  }

  if (value.trim().length === 0) {
    issues.push(
      createIssue('error', path, ValidationErrorCode.EMPTY_STRING, `${fieldName} cannot be empty`)
    );
    return false;
  }

  return true;
}

/**
 * Validate URL format
 */
function validateUrl(
  value: string,
  path: string,
  pattern: RegExp,
  issues: ValidationIssue[]
): boolean {
  if (!pattern.test(value)) {
    issues.push(
      createIssue(
        'error',
        path,
        ValidationErrorCode.INVALID_URL,
        'URL must be a valid HTTP(S) URL',
        value,
        pattern.source
      )
    );
    return false;
  }
  return true;
}

/**
 * Validate version format
 */
function validateVersion(
  value: string,
  path: string,
  pattern: RegExp,
  issues: ValidationIssue[]
): boolean {
  if (!pattern.test(value)) {
    issues.push(
      createIssue(
        'warning',
        path,
        ValidationErrorCode.INVALID_VERSION,
        'Version should follow semantic versioning (x.y.z)',
        value,
        pattern.source
      )
    );
    return false;
  }
  return true;
}

/**
 * Validate skill ID format
 */
function validateSkillId(value: string, path: string, issues: ValidationIssue[]): boolean {
  const pattern = /^[a-z0-9-]+$/;
  if (!pattern.test(value)) {
    issues.push(
      createIssue(
        'warning',
        path,
        ValidationErrorCode.INVALID_SKILL_ID,
        'Skill ID should be kebab-case (lowercase letters, numbers, and hyphens)',
        value,
        pattern.source
      )
    );
    return false;
  }
  return true;
}

/**
 * Validate capabilities object
 */
function validateCapabilities(
  capabilities: unknown,
  path: string,
  issues: ValidationIssue[]
): boolean {
  if (typeof capabilities !== 'object' || capabilities === null) {
    issues.push(
      createIssue(
        'error',
        path,
        ValidationErrorCode.INVALID_TYPE,
        'Capabilities must be an object',
        capabilities,
        'object'
      )
    );
    return false;
  }

  const caps = capabilities as AgentCapabilities;

  // Check for streaming support (info if missing)
  if (caps.streaming === undefined) {
    issues.push(
      createIssue(
        'info',
        `${path}.streaming`,
        ValidationErrorCode.NO_STREAMING,
        'Consider enabling streaming for better user experience'
      )
    );
  }

  return true;
}

/**
 * Validate skills array
 */
function validateSkills(skills: unknown, path: string, issues: ValidationIssue[]): boolean {
  if (!Array.isArray(skills)) {
    issues.push(
      createIssue(
        'error',
        path,
        ValidationErrorCode.INVALID_TYPE,
        'Skills must be an array',
        skills,
        'array'
      )
    );
    return false;
  }

  if (skills.length === 0) {
    issues.push(
      createIssue(
        'error',
        path,
        ValidationErrorCode.EMPTY_ARRAY,
        'Skills array cannot be empty'
      )
    );
    return false;
  }

  const seenIds = new Set<string>();
  let valid = true;

  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i];
    const skillPath = `${path}[${i}]`;

    if (!isAgentSkill(skill)) {
      issues.push(
        createIssue(
          'error',
          skillPath,
          ValidationErrorCode.INVALID_TYPE,
          'Skill must have id, name, and description',
          skill
        )
      );
      valid = false;
      continue;
    }

    // Validate required fields
    validateRequiredString(skill.id, `${skillPath}.id`, 'Skill ID', issues);
    validateRequiredString(skill.name, `${skillPath}.name`, 'Skill name', issues);
    validateRequiredString(skill.description, `${skillPath}.description`, 'Skill description', issues);

    // Validate skill ID format
    validateSkillId(skill.id, `${skillPath}.id`, issues);

    // Check for duplicate IDs
    if (seenIds.has(skill.id)) {
      issues.push(
        createIssue(
          'error',
          `${skillPath}.id`,
          ValidationErrorCode.DUPLICATE_SKILL_ID,
          `Duplicate skill ID: ${skill.id}`,
          skill.id
        )
      );
      valid = false;
    }
    seenIds.add(skill.id);

    // Check for examples (info)
    if (!skill.examples || skill.examples.length === 0) {
      issues.push(
        createIssue(
          'info',
          `${skillPath}.examples`,
          ValidationErrorCode.MISSING_EXAMPLES,
          'Consider adding examples for better discoverability'
        )
      );
    }

    // Check for tags (info)
    if (!skill.tags || skill.tags.length === 0) {
      issues.push(
        createIssue(
          'info',
          `${skillPath}.tags`,
          ValidationErrorCode.MISSING_TAGS,
          'Consider adding tags for better categorization'
        )
      );
    }
  }

  return valid;
}

/**
 * Validate security schemes
 */
function validateSecuritySchemes(
  schemes: unknown,
  path: string,
  issues: ValidationIssue[]
): boolean {
  if (schemes === undefined) {
    return true;
  }

  if (!Array.isArray(schemes)) {
    issues.push(
      createIssue(
        'error',
        path,
        ValidationErrorCode.INVALID_TYPE,
        'Security schemes must be an array',
        schemes,
        'array'
      )
    );
    return false;
  }

  let valid = true;

  for (let i = 0; i < schemes.length; i++) {
    const scheme = schemes[i];
    const schemePath = `${path}[${i}]`;

    if (!isSecurityScheme(scheme)) {
      issues.push(
        createIssue(
          'error',
          schemePath,
          ValidationErrorCode.INVALID_SECURITY_SCHEME,
          'Invalid security scheme type',
          scheme
        )
      );
      valid = false;
      continue;
    }

    // Validate OAuth2 flows
    if (scheme.type === 'oauth2') {
      const oauth = scheme as { flows: Record<string, unknown> };
      if (!oauth.flows || Object.keys(oauth.flows).length === 0) {
        issues.push(
          createIssue(
            'error',
            `${schemePath}.flows`,
            ValidationErrorCode.MISSING_OAUTH_FLOW,
            'OAuth2 scheme requires at least one flow'
          )
        );
        valid = false;
      }

      // Check for token URL in clientCredentials flow
      if (oauth.flows?.clientCredentials) {
        const flow = oauth.flows.clientCredentials as { tokenUrl?: string };
        if (!flow.tokenUrl) {
          issues.push(
            createIssue(
              'error',
              `${schemePath}.flows.clientCredentials.tokenUrl`,
              ValidationErrorCode.MISSING_TOKEN_URL,
              'Client credentials flow requires tokenUrl'
            )
          );
          valid = false;
        }
      }
    }
  }

  return valid;
}

/**
 * Validate QE-specific metadata
 */
function validateQEMetadata(
  metadata: unknown,
  path: string,
  issues: ValidationIssue[]
): boolean {
  if (metadata === undefined) {
    return true;
  }

  if (typeof metadata !== 'object' || metadata === null) {
    issues.push(
      createIssue(
        'error',
        path,
        ValidationErrorCode.INVALID_TYPE,
        'QE metadata must be an object',
        metadata,
        'object'
      )
    );
    return false;
  }

  const qe = metadata as QEAgentCard['qeMetadata'];

  // Validate domain if present
  if (qe?.domain) {
    const validDomains = [
      'test-generation',
      'test-execution',
      'coverage-analysis',
      'quality-assessment',
      'defect-intelligence',
      'learning-optimization',
      'security-compliance',
      'chaos-resilience',
      'accessibility-testing',
      'contract-testing',
      'code-intelligence',
      'e2e-testing',
    ];

    if (!validDomains.includes(qe.domain)) {
      issues.push(
        createIssue(
          'warning',
          `${path}.domain`,
          ValidationErrorCode.INVALID_DOMAIN,
          `Unknown QE domain: ${qe.domain}`,
          qe.domain,
          validDomains.join(', ')
        )
      );
    }
  }

  // Validate memory namespaces
  const namespacePattern = /^aqe\/[a-z0-9-/]+/;
  const namespaces = [...(qe?.memoryReads ?? []), ...(qe?.memoryWrites ?? [])];

  for (const ns of namespaces) {
    if (!namespacePattern.test(ns)) {
      issues.push(
        createIssue(
          'warning',
          path,
          ValidationErrorCode.INVALID_MEMORY_NAMESPACE,
          `Memory namespace should follow pattern 'aqe/...'`,
          ns,
          namespacePattern.source
        )
      );
    }
  }

  return true;
}

// ============================================================================
// Agent Card Validator Class
// ============================================================================

/**
 * Validator for A2A Agent Cards
 */
export class AgentCardValidator {
  private readonly options: Required<ValidatorOptions>;

  constructor(options: Partial<ValidatorOptions> = {}) {
    this.options = {
      ...DEFAULT_VALIDATOR_OPTIONS,
      ...options,
    };
  }

  /**
   * Validate an agent card
   */
  validate(card: unknown): ValidationResult {
    const issues: ValidationIssue[] = [];

    // Check if it's an object
    if (typeof card !== 'object' || card === null) {
      issues.push(
        createIssue(
          'error',
          '',
          ValidationErrorCode.INVALID_TYPE,
          'Agent card must be an object',
          card,
          'object'
        )
      );
      return this.buildResult(issues);
    }

    const obj = card as Record<string, unknown>;

    // Validate required fields
    validateRequiredString(obj.name, 'name', 'Name', issues);
    validateRequiredString(obj.description, 'description', 'Description', issues);

    // Validate URL
    if (validateRequiredString(obj.url, 'url', 'URL', issues)) {
      validateUrl(obj.url as string, 'url', this.options.urlPattern, issues);
    }

    // Validate version
    if (validateRequiredString(obj.version, 'version', 'Version', issues)) {
      validateVersion(obj.version as string, 'version', this.options.versionPattern, issues);
    }

    // Validate capabilities
    if (obj.capabilities === undefined) {
      issues.push(
        createIssue('error', 'capabilities', ValidationErrorCode.MISSING_REQUIRED, 'Capabilities is required')
      );
    } else {
      validateCapabilities(obj.capabilities, 'capabilities', issues);
    }

    // Validate skills
    if (obj.skills === undefined) {
      issues.push(
        createIssue('error', 'skills', ValidationErrorCode.MISSING_REQUIRED, 'Skills is required')
      );
    } else {
      validateSkills(obj.skills, 'skills', issues);
    }

    // Validate provider (warning if missing)
    if (!obj.provider) {
      issues.push(
        createIssue(
          'warning',
          'provider',
          ValidationErrorCode.MISSING_PROVIDER,
          'Consider adding provider information'
        )
      );
    }

    // Validate documentation URL (info if missing)
    if (!obj.documentationUrl) {
      issues.push(
        createIssue(
          'info',
          'documentationUrl',
          ValidationErrorCode.MISSING_DOCUMENTATION,
          'Consider adding documentation URL'
        )
      );
    }

    // Validate security schemes
    validateSecuritySchemes(obj.securitySchemes, 'securitySchemes', issues);

    // Validate QE metadata if enabled
    if (this.options.validateQEMetadata && 'qeMetadata' in obj) {
      validateQEMetadata(obj.qeMetadata, 'qeMetadata', issues);
    }

    return this.buildResult(issues);
  }

  /**
   * Validate multiple agent cards
   */
  validateAll(cards: Map<string, unknown>): Map<string, ValidationResult> {
    const results = new Map<string, ValidationResult>();

    for (const [name, card] of cards) {
      results.set(name, this.validate(card));
    }

    return results;
  }

  /**
   * Check if a card is valid (has no errors)
   */
  isValid(card: unknown): boolean {
    return this.validate(card).valid;
  }

  /**
   * Get JSON Schema for validation
   */
  getJsonSchema(): typeof AGENT_CARD_JSON_SCHEMA | typeof QE_AGENT_CARD_JSON_SCHEMA {
    return this.options.validateQEMetadata ? QE_AGENT_CARD_JSON_SCHEMA : AGENT_CARD_JSON_SCHEMA;
  }

  /**
   * Build validation result from issues
   */
  private buildResult(issues: ValidationIssue[]): ValidationResult {
    // Filter issues based on options
    const filteredIssues = issues.filter((issue) => {
      if (issue.severity === 'warning' && !this.options.includeWarnings) {
        return false;
      }
      if (issue.severity === 'info' && !this.options.includeInfo) {
        return false;
      }
      return true;
    });

    // Count by severity
    const errors = filteredIssues.filter((i) => i.severity === 'error').length;
    const warnings = filteredIssues.filter((i) => i.severity === 'warning').length;
    const info = filteredIssues.filter((i) => i.severity === 'info').length;

    // Determine validity
    const valid = this.options.strict ? errors === 0 && warnings === 0 : errors === 0;

    return {
      valid,
      issues: filteredIssues,
      summary: { errors, warnings, info },
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an Agent Card Validator instance
 */
export function createAgentCardValidator(
  options: Partial<ValidatorOptions> = {}
): AgentCardValidator {
  return new AgentCardValidator(options);
}

/**
 * Validate an agent card (convenience function)
 */
export function validateAgentCard(
  card: unknown,
  options: Partial<ValidatorOptions> = {}
): ValidationResult {
  return createAgentCardValidator(options).validate(card);
}

/**
 * Check if an agent card is valid (convenience function)
 */
export function isValidAgentCard(
  card: unknown,
  options: Partial<ValidatorOptions> = {}
): boolean {
  return createAgentCardValidator(options).isValid(card);
}
