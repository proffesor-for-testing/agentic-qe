/**
 * A2A Protocol Agent Card Schema
 *
 * Defines TypeScript interfaces for A2A v0.3 Agent Capability Cards.
 * Reference: https://a2a-protocol.org/latest/specification/
 *
 * @module adapters/a2a/agent-cards/schema
 */

// ============================================================================
// Provider Information
// ============================================================================

/**
 * Information about the organization providing the agent
 */
export interface AgentProvider {
  /** Organization name */
  readonly organization: string;
  /** Organization website URL */
  readonly url?: string;
}

// ============================================================================
// Authentication & Security
// ============================================================================

/**
 * Security scheme types supported by A2A
 */
export type SecuritySchemeType =
  | 'apiKey'
  | 'http'
  | 'oauth2'
  | 'openIdConnect'
  | 'mutualTLS';

/**
 * API Key security scheme
 */
export interface ApiKeySecurityScheme {
  readonly type: 'apiKey';
  /** Name of the header, query parameter, or cookie */
  readonly name: string;
  /** Location of the API key */
  readonly in: 'header' | 'query' | 'cookie';
  /** Description of the security scheme */
  readonly description?: string;
}

/**
 * HTTP security scheme (Bearer, Basic, etc.)
 */
export interface HttpSecurityScheme {
  readonly type: 'http';
  /** HTTP authentication scheme (e.g., 'bearer', 'basic') */
  readonly scheme: string;
  /** Format of the bearer token */
  readonly bearerFormat?: string;
  /** Description of the security scheme */
  readonly description?: string;
}

/**
 * OAuth 2.0 flow configuration
 */
export interface OAuthFlow {
  /** Authorization URL for authorization code flow */
  readonly authorizationUrl?: string;
  /** Token URL for obtaining access tokens */
  readonly tokenUrl?: string;
  /** Refresh URL for token refresh */
  readonly refreshUrl?: string;
  /** Available scopes and their descriptions */
  readonly scopes?: Record<string, string>;
}

/**
 * OAuth 2.0 security scheme
 */
export interface OAuth2SecurityScheme {
  readonly type: 'oauth2';
  /** OAuth 2.0 flows configuration */
  readonly flows: {
    readonly implicit?: OAuthFlow;
    readonly password?: OAuthFlow;
    readonly clientCredentials?: OAuthFlow;
    readonly authorizationCode?: OAuthFlow;
  };
  /** Description of the security scheme */
  readonly description?: string;
}

/**
 * OpenID Connect security scheme
 */
export interface OpenIdConnectSecurityScheme {
  readonly type: 'openIdConnect';
  /** OpenID Connect discovery URL */
  readonly openIdConnectUrl: string;
  /** Description of the security scheme */
  readonly description?: string;
}

/**
 * Mutual TLS security scheme
 */
export interface MutualTLSSecurityScheme {
  readonly type: 'mutualTLS';
  /** Description of the security scheme */
  readonly description?: string;
}

/**
 * Union of all security scheme types
 */
export type SecurityScheme =
  | ApiKeySecurityScheme
  | HttpSecurityScheme
  | OAuth2SecurityScheme
  | OpenIdConnectSecurityScheme
  | MutualTLSSecurityScheme;

/**
 * Authentication configuration for the agent
 */
export interface AgentAuthentication {
  /** Supported authentication schemes */
  readonly schemes: string[];
  /** Description of credential requirements */
  readonly credentials?: string;
}

// ============================================================================
// Agent Capabilities
// ============================================================================

/**
 * Capabilities supported by the agent
 */
export interface AgentCapabilities {
  /** Whether the agent supports Server-Sent Events streaming */
  readonly streaming?: boolean;
  /** Whether the agent supports webhook push notifications */
  readonly pushNotifications?: boolean;
  /** Whether the agent exposes task state transition history */
  readonly stateTransitionHistory?: boolean;
}

// ============================================================================
// Agent Skills
// ============================================================================

/**
 * A skill represents a discrete capability or function an agent can perform
 */
export interface AgentSkill {
  /** Unique skill identifier (kebab-case recommended) */
  readonly id: string;
  /** Human-readable skill name */
  readonly name: string;
  /** Detailed description of what the skill does */
  readonly description: string;
  /** Categorization tags for discovery and filtering */
  readonly tags?: string[];
  /** Example prompts or use cases */
  readonly examples?: string[];
  /** Input media types accepted (e.g., 'text/plain', 'application/json') */
  readonly inputModes?: string[];
  /** Output media types produced */
  readonly outputModes?: string[];
  /** Security scopes required for this skill */
  readonly securityScopes?: string[];
}

// ============================================================================
// Input/Output Modes
// ============================================================================

/**
 * Common input modes for agents
 */
export type InputMode =
  | 'text/plain'
  | 'application/json'
  | 'text/markdown'
  | 'application/xml'
  | 'text/html'
  | 'image/png'
  | 'image/jpeg'
  | 'application/pdf'
  | 'application/octet-stream'
  | string;

/**
 * Common output modes for agents
 */
export type OutputMode =
  | 'text/plain'
  | 'application/json'
  | 'text/markdown'
  | 'application/xml'
  | 'text/html'
  | 'application/sarif+json'
  | 'application/octet-stream'
  | string;

// ============================================================================
// Agent Card (Main Interface)
// ============================================================================

/**
 * A2A Agent Card - Digital "business card" for an AI agent
 *
 * Describes the agent's identity, capabilities, skills, service endpoints,
 * and authentication requirements per A2A Protocol v0.3 specification.
 */
export interface AgentCard {
  // ============================================================================
  // Identity (Required)
  // ============================================================================

  /** Human-readable agent name */
  readonly name: string;

  /** Detailed description of the agent's purpose and capabilities */
  readonly description: string;

  /** Service endpoint URL where the agent can be reached */
  readonly url: string;

  /** Agent version (semantic versioning recommended) */
  readonly version: string;

  // ============================================================================
  // Provider Information (Optional)
  // ============================================================================

  /** Information about the organization providing the agent */
  readonly provider?: AgentProvider;

  /** URL to the agent's documentation */
  readonly documentationUrl?: string;

  // ============================================================================
  // Capabilities (Required)
  // ============================================================================

  /** Agent capabilities (streaming, notifications, history) */
  readonly capabilities: AgentCapabilities;

  // ============================================================================
  // Skills (Required)
  // ============================================================================

  /** Skills the agent can perform */
  readonly skills: AgentSkill[];

  // ============================================================================
  // Input/Output Configuration (Optional)
  // ============================================================================

  /** Default input media types accepted */
  readonly defaultInputModes?: InputMode[];

  /** Default output media types produced */
  readonly defaultOutputModes?: OutputMode[];

  // ============================================================================
  // Security (Optional)
  // ============================================================================

  /** Supported security schemes */
  readonly securitySchemes?: SecurityScheme[];

  /** Authentication requirements */
  readonly authentication?: AgentAuthentication;

  /** Whether the agent provides an extended card for authenticated clients */
  readonly supportsAuthenticatedExtendedCard?: boolean;
}

// ============================================================================
// Extended Agent Card
// ============================================================================

/**
 * Extended agent card with additional details for authenticated clients
 */
export interface ExtendedAgentCard extends AgentCard {
  /** Extended information only available to authenticated clients */
  readonly extended?: {
    /** Rate limiting information */
    readonly rateLimits?: {
      readonly requestsPerMinute?: number;
      readonly requestsPerHour?: number;
      readonly requestsPerDay?: number;
    };
    /** Support contact information */
    readonly supportContact?: string;
    /** SLA information */
    readonly sla?: {
      readonly uptimeTarget?: number;
      readonly responseTimeTarget?: number;
    };
    /** Custom metadata */
    readonly metadata?: Record<string, unknown>;
  };
}

// ============================================================================
// QE-Specific Agent Card
// ============================================================================

/**
 * QE-specific agent card with additional AQE v3 metadata
 */
export interface QEAgentCard extends AgentCard {
  /** QE-specific metadata */
  readonly qeMetadata?: {
    /** DDD domain the agent belongs to */
    readonly domain?: string;
    /** V2 compatibility mapping */
    readonly v2Compatibility?: {
      readonly name?: string;
      readonly deprecatedIn?: string;
      readonly removedIn?: string;
    };
    /** Memory namespaces the agent reads from */
    readonly memoryReads?: string[];
    /** Memory namespaces the agent writes to */
    readonly memoryWrites?: string[];
    /** Related agents for coordination */
    readonly relatedAgents?: string[];
    /** Implementation status */
    readonly implementationStatus?: {
      readonly working?: string[];
      readonly partial?: string[];
      readonly planned?: string[];
    };
  };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for AgentCard
 */
export function isAgentCard(value: unknown): value is AgentCard {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    typeof obj.url === 'string' &&
    typeof obj.version === 'string' &&
    typeof obj.capabilities === 'object' &&
    obj.capabilities !== null &&
    Array.isArray(obj.skills)
  );
}

/**
 * Type guard for AgentSkill
 */
export function isAgentSkill(value: unknown): value is AgentSkill {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.description === 'string'
  );
}

/**
 * Type guard for SecurityScheme
 */
export function isSecurityScheme(value: unknown): value is SecurityScheme {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  const validTypes: SecuritySchemeType[] = [
    'apiKey',
    'http',
    'oauth2',
    'openIdConnect',
    'mutualTLS',
  ];
  return validTypes.includes(obj.type as SecuritySchemeType);
}

/**
 * Type guard for QEAgentCard
 */
export function isQEAgentCard(value: unknown): value is QEAgentCard {
  return isAgentCard(value) && 'qeMetadata' in (value as unknown as Record<string, unknown>);
}

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default agent capabilities
 */
export const DEFAULT_CAPABILITIES: AgentCapabilities = {
  streaming: true,
  pushNotifications: false,
  stateTransitionHistory: true,
};

/**
 * Default input modes
 */
export const DEFAULT_INPUT_MODES: InputMode[] = ['text/plain', 'application/json'];

/**
 * Default output modes
 */
export const DEFAULT_OUTPUT_MODES: OutputMode[] = ['application/json', 'text/plain'];

/**
 * Default QE provider information
 */
export const DEFAULT_QE_PROVIDER: AgentProvider = {
  organization: 'Agentic QE',
  url: 'https://github.com/agentic-qe/agentic-qe',
};

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a minimal agent skill
 */
export function createAgentSkill(
  id: string,
  name: string,
  description: string,
  options: Partial<Omit<AgentSkill, 'id' | 'name' | 'description'>> = {}
): AgentSkill {
  return {
    id,
    name,
    description,
    ...options,
  };
}

/**
 * Create a minimal agent card
 */
export function createAgentCard(
  name: string,
  description: string,
  url: string,
  version: string,
  skills: AgentSkill[],
  options: Partial<Omit<AgentCard, 'name' | 'description' | 'url' | 'version' | 'skills'>> = {}
): AgentCard {
  return {
    name,
    description,
    url,
    version,
    capabilities: options.capabilities ?? DEFAULT_CAPABILITIES,
    skills,
    defaultInputModes: options.defaultInputModes ?? DEFAULT_INPUT_MODES,
    defaultOutputModes: options.defaultOutputModes ?? DEFAULT_OUTPUT_MODES,
    provider: options.provider,
    documentationUrl: options.documentationUrl,
    securitySchemes: options.securitySchemes,
    authentication: options.authentication,
    supportsAuthenticatedExtendedCard: options.supportsAuthenticatedExtendedCard,
  };
}

/**
 * Create a QE-specific agent card
 */
export function createQEAgentCard(
  name: string,
  description: string,
  url: string,
  version: string,
  skills: AgentSkill[],
  qeMetadata: QEAgentCard['qeMetadata'],
  options: Partial<Omit<AgentCard, 'name' | 'description' | 'url' | 'version' | 'skills'>> = {}
): QEAgentCard {
  return {
    ...createAgentCard(name, description, url, version, skills, {
      ...options,
      provider: options.provider ?? DEFAULT_QE_PROVIDER,
    }),
    qeMetadata,
  };
}
