/**
 * Agentic QE v3 - MCP Security Module
 * Security features for MCP tools per ADR-012
 *
 * Components:
 * - JSON Schema Validator: Validate all MCP tool inputs
 * - Rate Limiter: Token bucket algorithm (100 req/s, 200 burst)
 * - OAuth 2.1 Provider: OAuth 2.1 + PKCE for enterprise authentication
 * - Sampling Server: Server-initiated LLM for AI-driven decisions
 * - CVE Prevention: Path traversal, ReDoS, timing-safe comparison
 */

// ============================================================================
// Schema Validator
// ============================================================================

export {
  SchemaValidator,
  createSchemaValidator,
  createStrictSchemaValidator,
  getSchemaValidator,
  CommonSchemas,
} from './schema-validator';

export type {
  JSONSchema,
  JSONSchemaType,
  JSONSchemaFormat,
  ValidationError,
  ValidationResult,
  FormatValidator,
  SchemaValidatorConfig,
} from './schema-validator';

// ============================================================================
// Rate Limiter
// ============================================================================

export {
  RateLimiter,
  SlidingWindowRateLimiter,
  createRateLimiter,
  createStrictRateLimiter,
  createSlidingWindowLimiter,
  getRateLimiter,
  resetDefaultRateLimiter,
} from './rate-limiter';

export type {
  RateLimiterConfig,
  TokenBucket,
  RateLimitResult,
  RateLimitHeaders,
  RateLimiterStats,
  EndpointRateLimit,
} from './rate-limiter';

// ============================================================================
// OAuth 2.1 Provider
// ============================================================================

export {
  OAuth21Provider,
  createOAuth21Provider,
  getOAuth21Provider,
} from './oauth21-provider';

export type {
  OAuth21GrantType,
  TokenType,
  PKCEMethod,
  OAuth21Client,
  AuthorizationRequest,
  AuthorizationCode,
  TokenRequest,
  TokenResponse,
  TokenData,
  TokenIntrospection,
  OAuthError,
  OAuthErrorCode,
  OAuth21ProviderConfig,
} from './oauth21-provider';

// ============================================================================
// Sampling Server
// ============================================================================

export {
  SamplingServer,
  createSamplingServer,
  getSamplingServer,
  QEDecisionPrompts,
} from './sampling-server';

export type {
  SamplingRequest,
  SamplingMessage,
  SamplingContent,
  SamplingResponse,
  TokenUsage,
  SamplingHandler,
  SamplingServerConfig,
  SamplingServerStats,
} from './sampling-server';

// ============================================================================
// CVE Prevention
// ============================================================================

export {
  // Path traversal protection
  validatePath,
  normalizePath,
  joinPaths,
  getExtension,

  // ReDoS prevention
  isRegexSafe,
  escapeRegex,
  createSafeRegex,

  // Timing-safe comparison
  timingSafeCompare,
  timingSafeHashCompare,
  generateSecureToken,
  secureHash,

  // Input sanitization
  sanitizeInput,
  escapeHtml,
  stripHtmlTags,

  // Command injection prevention
  validateCommand,
  escapeShellArg,

  // Utilities object
  CVEPrevention,
} from './cve-prevention';

export type {
  PathValidationResult,
  PathValidationOptions,
  RegexSafetyResult,
  CommandValidationResult,
  SanitizationOptions,
} from './cve-prevention';

// ============================================================================
// Security Middleware Factory
// ============================================================================

import { createSchemaValidator, type JSONSchema } from './schema-validator';
import { createRateLimiter, type RateLimiterConfig } from './rate-limiter';
import { createOAuth21Provider, type OAuth21ProviderConfig } from './oauth21-provider';
import { validatePath, sanitizeInput, validateCommand } from './cve-prevention';

/**
 * Security middleware configuration
 */
export interface SecurityMiddlewareConfig {
  enableSchemaValidation?: boolean;
  enableRateLimiting?: boolean;
  enableOAuth?: boolean;
  enableCVEPrevention?: boolean;
  rateLimiter?: Partial<RateLimiterConfig>;
  oauth?: Partial<OAuth21ProviderConfig>;
}

/**
 * Security context for tool invocation
 */
export interface SecurityContext {
  clientId?: string;
  userId?: string;
  scopes?: string[];
  token?: string;
  endpoint?: string;
  ip?: string;
}

/**
 * Security middleware result
 */
export interface SecurityCheckResult {
  allowed: boolean;
  errors: string[];
  warnings: string[];
  context?: SecurityContext;
}

/**
 * Create security middleware for MCP tools
 */
export function createSecurityMiddleware(config: SecurityMiddlewareConfig = {}) {
  const {
    enableSchemaValidation = true,
    enableRateLimiting = true,
    enableOAuth = false,
    enableCVEPrevention = true,
    rateLimiter: rateLimiterConfig,
    oauth: oauthConfig,
  } = config;

  const schemaValidator = enableSchemaValidation ? createSchemaValidator() : null;
  const rateLimiter = enableRateLimiting ? createRateLimiter(rateLimiterConfig) : null;
  const oauthProvider = enableOAuth ? createOAuth21Provider(oauthConfig) : null;

  return {
    /**
     * Validate tool input against schema
     */
    validateInput<T>(input: unknown, schema: JSONSchema): { valid: true; data: T } | { valid: false; errors: string[] } {
      if (!schemaValidator) {
        return { valid: true, data: input as T };
      }

      const result = schemaValidator.validate(input, schema);
      if (result.valid) {
        return { valid: true, data: input as T };
      }

      return {
        valid: false,
        errors: result.errors.map(e => `${e.path}: ${e.message}`),
      };
    },

    /**
     * Check rate limit
     */
    checkRateLimit(clientId?: string, endpoint?: string) {
      if (!rateLimiter) {
        return { allowed: true, remaining: Infinity, headers: {} as any };
      }

      return rateLimiter.check(clientId, endpoint);
    },

    /**
     * Validate OAuth token
     */
    validateToken(token: string) {
      if (!oauthProvider) {
        return { valid: true, data: null };
      }

      return oauthProvider.validateAccessToken(token);
    },

    /**
     * Validate file path for security
     */
    validateFilePath(path: string, basePath?: string) {
      if (!enableCVEPrevention) {
        return { valid: true, normalizedPath: path, riskLevel: 'none' as const };
      }

      return validatePath(path, { basePath });
    },

    /**
     * Sanitize user input
     */
    sanitize(input: string) {
      if (!enableCVEPrevention) {
        return input;
      }

      return sanitizeInput(input);
    },

    /**
     * Validate command for execution
     */
    validateShellCommand(command: string, allowedCommands?: string[]) {
      if (!enableCVEPrevention) {
        return { valid: true, sanitizedCommand: command, blockedPatterns: [] };
      }

      return validateCommand(command, allowedCommands);
    },

    /**
     * Run all security checks
     */
    async runSecurityChecks(
      context: SecurityContext,
      input?: unknown,
      schema?: JSONSchema
    ): Promise<SecurityCheckResult> {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Rate limit check
      if (rateLimiter) {
        const rateResult = rateLimiter.check(context.clientId, context.endpoint);
        if (!rateResult.allowed) {
          errors.push(`Rate limit exceeded. Retry after ${rateResult.retryAfter}ms`);
        }
      }

      // OAuth check
      if (oauthProvider && context.token) {
        const tokenResult = oauthProvider.validateAccessToken(context.token);
        if (!tokenResult.valid) {
          errors.push(`Invalid token: ${tokenResult.error}`);
        }
      } else if (oauthProvider && !context.token) {
        warnings.push('No authentication token provided');
      }

      // Schema validation
      if (schemaValidator && input && schema) {
        const validationResult = schemaValidator.validate(input, schema);
        if (!validationResult.valid) {
          errors.push(...validationResult.errors.map(e => `${e.path}: ${e.message}`));
        }
      }

      return {
        allowed: errors.length === 0,
        errors,
        warnings,
        context,
      };
    },

    /**
     * Dispose all security resources
     */
    dispose() {
      if (rateLimiter) {
        rateLimiter.dispose();
      }
      if (oauthProvider) {
        oauthProvider.dispose();
      }
    },
  };
}

/**
 * Default security middleware instance
 */
let defaultMiddleware: ReturnType<typeof createSecurityMiddleware> | null = null;

/**
 * Get the default security middleware
 */
export function getSecurityMiddleware(): ReturnType<typeof createSecurityMiddleware> {
  if (!defaultMiddleware) {
    defaultMiddleware = createSecurityMiddleware();
  }
  return defaultMiddleware;
}
