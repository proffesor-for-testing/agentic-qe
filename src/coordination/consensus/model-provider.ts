/**
 * Agentic QE v3 - Model Provider Abstraction
 * MM-002: Abstract model provider for multi-model consensus
 *
 * Provides a base implementation for model providers that can be used
 * in the consensus engine. Concrete implementations should extend
 * BaseModelProvider for Claude, OpenAI, Gemini, etc.
 *
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 2: Multi-Model Verification
 */

import {
  ModelProvider,
  ModelCompletionOptions,
  ModelHealthResult,
  SecurityFinding,
  ModelVote,
  VoteAssessment,
  FindingEvidence,
} from './interfaces';
import { Severity } from '../../shared/types';
import { toErrorMessage } from '../../shared/error-utils.js';
import { secureRandom } from '../../shared/utils/crypto-random.js';

// ============================================================================
// Abstract Base Model Provider
// ============================================================================

/**
 * Abstract base class for model providers
 *
 * Provides common functionality for all model providers including:
 * - Health checking with caching
 * - Verification prompt generation
 * - Response parsing for security findings
 * - Cost tracking
 *
 * @example
 * ```typescript
 * class ClaudeConsensusProvider extends BaseModelProvider {
 *   readonly id = 'claude';
 *   readonly name = 'Claude (Anthropic)';
 *   readonly type = 'claude';
 *
 *   async complete(prompt: string, options?: ModelCompletionOptions): Promise<string> {
 *     // Implement Claude-specific completion logic
 *   }
 * }
 * ```
 */
export abstract class BaseModelProvider implements ModelProvider {
  /** Provider identifier */
  abstract readonly id: string;

  /** Provider display name */
  abstract readonly name: string;

  /** Provider type */
  abstract readonly type: ModelProvider['type'];

  /** Cost per token (input/output) in USD */
  protected abstract costPerToken: { input: number; output: number };

  /** Supported model versions */
  protected abstract supportedModels: string[];

  /** Cached health check result */
  private healthCache: { result: ModelHealthResult; timestamp: number } | null = null;

  /** Health cache TTL in milliseconds */
  private readonly healthCacheTtlMs: number = 60000; // 1 minute

  /** Whether provider has been disposed */
  protected disposed: boolean = false;

  /**
   * Execute the actual completion request
   *
   * @param prompt - The prompt to complete
   * @param options - Completion options
   * @returns Promise resolving to completion string
   */
  abstract complete(prompt: string, options?: ModelCompletionOptions): Promise<string>;

  /**
   * Execute provider-specific health check
   *
   * @returns Promise resolving to health result
   */
  protected abstract performHealthCheck(): Promise<ModelHealthResult>;

  /**
   * Check if provider is available
   *
   * Performs a lightweight health check to verify the provider
   * is properly configured and responsive.
   *
   * @returns Promise resolving to availability status
   */
  async isAvailable(): Promise<boolean> {
    if (this.disposed) {
      return false;
    }

    try {
      const health = await this.healthCheck();
      return health.healthy;
    } catch {
      return false;
    }
  }

  /**
   * Perform health check with caching
   *
   * @returns Promise resolving to health check result
   */
  async healthCheck(): Promise<ModelHealthResult> {
    if (this.disposed) {
      return {
        healthy: false,
        error: 'Provider has been disposed',
      };
    }

    // Check cache
    if (this.healthCache) {
      const age = Date.now() - this.healthCache.timestamp;
      if (age < this.healthCacheTtlMs) {
        return this.healthCache.result;
      }
    }

    // Perform actual health check
    try {
      const result = await this.performHealthCheck();
      this.healthCache = {
        result,
        timestamp: Date.now(),
      };
      return result;
    } catch (error) {
      const result: ModelHealthResult = {
        healthy: false,
        error: toErrorMessage(error),
      };
      this.healthCache = {
        result,
        timestamp: Date.now(),
      };
      return result;
    }
  }

  /**
   * Get cost per token
   *
   * @returns Input and output costs per token in USD
   */
  getCostPerToken(): { input: number; output: number } {
    return { ...this.costPerToken };
  }

  /**
   * Get supported model versions
   *
   * @returns Array of supported model version strings
   */
  getSupportedModels(): string[] {
    return [...this.supportedModels];
  }

  /**
   * Dispose provider resources
   */
  async dispose(): Promise<void> {
    this.disposed = true;
    this.healthCache = null;
  }

  /**
   * Invalidate health cache
   */
  protected invalidateHealthCache(): void {
    this.healthCache = null;
  }
}

// ============================================================================
// Verification Prompt Builder
// ============================================================================

/**
 * Options for building verification prompts
 */
export interface VerificationPromptOptions {
  /** Additional context to include */
  additionalContext?: string;

  /** Source code snippet */
  sourceCode?: string;

  /** Include evidence in prompt */
  includeEvidence?: boolean;

  /** Include remediation suggestion */
  includeRemediation?: boolean;

  /** Maximum prompt length */
  maxLength?: number;
}

/**
 * Build a verification prompt for a security finding
 *
 * Creates a structured prompt that asks the model to evaluate
 * whether a security finding is valid or a false positive.
 *
 * @param finding - The security finding to verify
 * @param options - Optional prompt configuration
 * @returns The verification prompt string
 */
export function buildVerificationPrompt(
  finding: SecurityFinding,
  options: VerificationPromptOptions = {}
): string {
  const {
    additionalContext,
    sourceCode,
    includeEvidence = true,
    includeRemediation = true,
    maxLength = 8000,
  } = options;

  const sections: string[] = [];

  // Header
  sections.push(`# Security Finding Verification Request

You are a security expert tasked with verifying whether the following security finding is valid or a false positive.

Please analyze the finding carefully and provide your assessment.`);

  // Finding details
  sections.push(`## Finding Details

- **ID:** ${finding.id}
- **Type:** ${finding.type}
- **Category:** ${finding.category}
- **Severity:** ${finding.severity}
- **Location:** ${formatLocation(finding.location)}
${finding.cweId ? `- **CWE:** ${finding.cweId}` : ''}
${finding.owaspCategory ? `- **OWASP Category:** ${finding.owaspCategory}` : ''}

### Description
${finding.description}
${finding.explanation ? `\n### Detailed Explanation\n${finding.explanation}` : ''}`);

  // Evidence
  if (includeEvidence && finding.evidence.length > 0) {
    sections.push(`## Evidence

${finding.evidence.map((e, i) => formatEvidence(e, i + 1)).join('\n\n')}`);
  }

  // Source code
  if (sourceCode) {
    sections.push(`## Source Code Context

\`\`\`
${truncateString(sourceCode, 2000)}
\`\`\``);
  }

  // Additional context
  if (additionalContext) {
    sections.push(`## Additional Context

${additionalContext}`);
  }

  // Remediation
  if (includeRemediation && finding.remediation) {
    sections.push(`## Suggested Remediation

${finding.remediation}`);
  }

  // Instructions
  sections.push(`## Your Task

Please evaluate this security finding and respond with:

1. **Assessment:** One of:
   - \`CONFIRMED\` - The finding is a valid security issue
   - \`REJECTED\` - The finding is a false positive
   - \`INCONCLUSIVE\` - Unable to determine with confidence
   - \`NEEDS_CONTEXT\` - More information required
   - \`PARTIAL\` - Partially valid (e.g., correct issue but different severity)

2. **Confidence:** A percentage (0-100%) indicating your confidence in the assessment

3. **Reasoning:** Detailed explanation of your assessment

4. **Severity Assessment:** If you disagree with the severity, suggest an alternative (critical/high/medium/low/info)

5. **Suggestions:** Any recommendations for verification or remediation

Please format your response as follows:

\`\`\`
ASSESSMENT: [CONFIRMED|REJECTED|INCONCLUSIVE|NEEDS_CONTEXT|PARTIAL]
CONFIDENCE: [0-100]%
SEVERITY: [original|critical|high|medium|low|info]

REASONING:
[Your detailed reasoning here]

SUGGESTIONS:
- [Suggestion 1]
- [Suggestion 2]
\`\`\``);

  // Combine and truncate if needed
  let prompt = sections.join('\n\n');
  if (prompt.length > maxLength) {
    prompt = truncateString(prompt, maxLength);
  }

  return prompt;
}

/**
 * Format a finding location for display
 */
function formatLocation(location: SecurityFinding['location']): string {
  let result = location.file;
  if (location.line !== undefined) {
    result += `:${location.line}`;
    if (location.column !== undefined) {
      result += `:${location.column}`;
    }
  }
  if (location.function) {
    result += ` (in ${location.function})`;
  }
  return result;
}

/**
 * Format evidence for display
 */
function formatEvidence(evidence: FindingEvidence, index: number): string {
  const header = `### Evidence ${index} (${evidence.type})`;
  const content = `\`\`\`\n${truncateString(evidence.content, 500)}\n\`\`\``;
  const location = evidence.location
    ? `Location: ${formatLocation(evidence.location)}`
    : '';
  const confidence = evidence.confidence !== undefined
    ? `Confidence: ${(evidence.confidence * 100).toFixed(0)}%`
    : '';

  return [header, content, location, confidence].filter(Boolean).join('\n');
}

/**
 * Truncate a string with ellipsis
 */
function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}

// ============================================================================
// Response Parser
// ============================================================================

/**
 * Parsed verification response from a model
 */
export interface ParsedVerificationResponse {
  /** Assessment from the model */
  assessment: VoteAssessment;

  /** Confidence level (0-1) */
  confidence: number;

  /** Model's reasoning */
  reasoning: string;

  /** Suggested severity (if different) */
  suggestedSeverity?: Severity;

  /** Model's suggestions */
  suggestions: string[];

  /** Whether parsing was successful */
  parseSuccess: boolean;

  /** Raw response text */
  rawResponse: string;
}

/**
 * Parse a model's verification response
 *
 * Extracts structured data from the model's response text,
 * handling various response formats.
 *
 * @param response - Raw response text from the model
 * @returns Parsed verification response
 */
export function parseVerificationResponse(response: string): ParsedVerificationResponse {
  const result: ParsedVerificationResponse = {
    assessment: 'inconclusive',
    confidence: 0.5,
    reasoning: '',
    suggestions: [],
    parseSuccess: false,
    rawResponse: response,
  };

  try {
    // Extract assessment
    const assessmentMatch = response.match(/ASSESSMENT:\s*(CONFIRMED|REJECTED|INCONCLUSIVE|NEEDS_CONTEXT|PARTIAL)/i);
    if (assessmentMatch) {
      result.assessment = mapAssessment(assessmentMatch[1].toUpperCase());
    }

    // Extract confidence
    const confidenceMatch = response.match(/CONFIDENCE:\s*(\d+(?:\.\d+)?)\s*%?/i);
    if (confidenceMatch) {
      result.confidence = Math.min(1, parseFloat(confidenceMatch[1]) / 100);
    }

    // Extract severity
    const severityMatch = response.match(/SEVERITY:\s*(original|critical|high|medium|low|info)/i);
    if (severityMatch && severityMatch[1].toLowerCase() !== 'original') {
      result.suggestedSeverity = severityMatch[1].toLowerCase() as Severity;
    }

    // Extract reasoning using indexOf to avoid ReDoS vulnerability
    const reasoningIndex = response.toUpperCase().indexOf('REASONING:');
    const suggestionsIndex = response.toUpperCase().indexOf('SUGGESTIONS:');

    if (reasoningIndex !== -1) {
      const reasoningStart = response.indexOf('\n', reasoningIndex);
      const reasoningEnd = suggestionsIndex !== -1 ? suggestionsIndex : response.length;
      if (reasoningStart !== -1 && reasoningStart < reasoningEnd) {
        result.reasoning = response.slice(reasoningStart + 1, reasoningEnd).trim();
      }
    }

    if (!result.reasoning) {
      // Fallback: use the entire response as reasoning
      result.reasoning = response;
    }

    // Extract suggestions
    if (suggestionsIndex !== -1) {
      const suggestionsStart = response.indexOf('\n', suggestionsIndex);
      if (suggestionsStart !== -1) {
        result.suggestions = response.slice(suggestionsStart + 1)
          .split('\n')
          .map(line => line.replace(/^[-*]\s*/, '').trim())
          .filter(line => line.length > 0);
      }
    }

    // Mark as successful if we at least got an assessment
    result.parseSuccess = assessmentMatch !== null;
  } catch (error) {
    // Parsing failed, use defaults with raw response as reasoning
    result.reasoning = response;
    result.parseSuccess = false;
  }

  return result;
}

/**
 * Map assessment string to VoteAssessment enum
 */
function mapAssessment(assessment: string): VoteAssessment {
  const mapping: Record<string, VoteAssessment> = {
    'CONFIRMED': 'confirmed',
    'REJECTED': 'rejected',
    'INCONCLUSIVE': 'inconclusive',
    'NEEDS_CONTEXT': 'needs-context',
    'PARTIAL': 'partial',
  };
  return mapping[assessment] || 'inconclusive';
}

// ============================================================================
// Vote Builder
// ============================================================================

/**
 * Options for building a model vote
 */
export interface VoteBuildOptions {
  /** Model provider ID */
  modelId: string;

  /** Model version */
  modelVersion?: string;

  /** Original finding being verified */
  finding: SecurityFinding;

  /** Parsed response from the model */
  parsedResponse: ParsedVerificationResponse;

  /** Time taken for completion (ms) */
  executionTime: number;

  /** Token usage */
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };

  /** Cost in USD */
  cost?: number;
}

/**
 * Build a ModelVote from a parsed response
 *
 * @param options - Vote building options
 * @returns The constructed ModelVote
 */
export function buildModelVote(options: VoteBuildOptions): ModelVote {
  const {
    modelId,
    modelVersion,
    parsedResponse,
    executionTime,
    tokenUsage,
    cost,
  } = options;

  // Determine agreement based on assessment
  const agrees = parsedResponse.assessment === 'confirmed' ||
    parsedResponse.assessment === 'partial';

  return {
    modelId,
    modelVersion,
    agrees,
    assessment: parsedResponse.assessment,
    confidence: parsedResponse.confidence,
    reasoning: parsedResponse.reasoning,
    suggestedSeverity: parsedResponse.suggestedSeverity,
    suggestions: parsedResponse.suggestions.length > 0
      ? parsedResponse.suggestions
      : undefined,
    executionTime,
    tokenUsage,
    cost,
    votedAt: new Date(),
  };
}

// ============================================================================
// Mock Provider for Testing
// ============================================================================

/**
 * Configuration for mock provider behavior
 */
export interface MockProviderConfig {
  /** Provider ID */
  id: string;

  /** Provider name */
  name: string;

  /** Default response assessment */
  defaultAssessment?: VoteAssessment;

  /** Default confidence level */
  defaultConfidence?: number;

  /** Simulated latency (ms) */
  latencyMs?: number;

  /** Failure rate (0-1) */
  failureRate?: number;

  /** Whether provider is healthy */
  healthy?: boolean;
}

/**
 * Mock model provider for testing
 *
 * Provides configurable responses for testing the consensus engine
 * without making actual API calls.
 */
export class MockModelProvider extends BaseModelProvider {
  readonly id: string;
  readonly name: string;
  readonly type: ModelProvider['type'] = 'custom';

  protected costPerToken = { input: 0.001, output: 0.002 };
  protected supportedModels = ['mock-v1'];

  private readonly config: Required<MockProviderConfig>;

  constructor(config: MockProviderConfig) {
    super();
    this.id = config.id;
    this.name = config.name;
    this.config = {
      id: config.id,
      name: config.name,
      defaultAssessment: config.defaultAssessment ?? 'confirmed',
      defaultConfidence: config.defaultConfidence ?? 0.85,
      latencyMs: config.latencyMs ?? 100,
      failureRate: config.failureRate ?? 0,
      healthy: config.healthy ?? true,
    };
  }

  async complete(prompt: string, options?: ModelCompletionOptions): Promise<string> {
    // Simulate latency
    await new Promise(resolve => setTimeout(resolve, this.config.latencyMs));

    // Simulate failures
    if (secureRandom() < this.config.failureRate) {
      throw new Error('Mock provider simulated failure');
    }

    // Generate mock response
    const assessmentMap: Record<VoteAssessment, string> = {
      'confirmed': 'CONFIRMED',
      'rejected': 'REJECTED',
      'inconclusive': 'INCONCLUSIVE',
      'needs-context': 'NEEDS_CONTEXT',
      'partial': 'PARTIAL',
    };

    return `ASSESSMENT: ${assessmentMap[this.config.defaultAssessment]}
CONFIDENCE: ${(this.config.defaultConfidence * 100).toFixed(0)}%
SEVERITY: original

REASONING:
This is a mock response for testing purposes. The finding appears to be valid based on the provided evidence.

SUGGESTIONS:
- Review the affected code section
- Consider implementing input validation`;
  }

  protected async performHealthCheck(): Promise<ModelHealthResult> {
    return {
      healthy: this.config.healthy,
      latencyMs: this.config.latencyMs,
      availableModels: this.supportedModels,
    };
  }

  /**
   * Update mock configuration
   */
  setConfig(config: Partial<MockProviderConfig>): void {
    Object.assign(this.config, config);
  }
}

// ============================================================================
// Provider Registry
// ============================================================================

/**
 * Registry for model providers
 *
 * Manages a collection of model providers and provides lookup functionality.
 */
export class ModelProviderRegistry {
  private providers: Map<string, ModelProvider> = new Map();

  /**
   * Register a provider
   *
   * @param provider - Provider to register
   */
  register(provider: ModelProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider with ID '${provider.id}' is already registered`);
    }
    this.providers.set(provider.id, provider);
  }

  /**
   * Unregister a provider
   *
   * @param id - Provider ID to unregister
   * @returns true if provider was removed
   */
  unregister(id: string): boolean {
    return this.providers.delete(id);
  }

  /**
   * Get a provider by ID
   *
   * @param id - Provider ID
   * @returns Provider or undefined
   */
  get(id: string): ModelProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Check if a provider is registered
   *
   * @param id - Provider ID
   * @returns true if provider is registered
   */
  has(id: string): boolean {
    return this.providers.has(id);
  }

  /**
   * Get all registered providers
   *
   * @returns Array of all providers
   */
  getAll(): ModelProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get all provider IDs
   *
   * @returns Array of provider IDs
   */
  getIds(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get available (healthy) providers
   *
   * @returns Promise resolving to array of available providers
   */
  async getAvailable(): Promise<ModelProvider[]> {
    const results = await Promise.all(
      this.getAll().map(async provider => ({
        provider,
        available: await provider.isAvailable(),
      }))
    );
    return results
      .filter(r => r.available)
      .map(r => r.provider);
  }

  /**
   * Get providers by type
   *
   * @param type - Provider type to filter by
   * @returns Array of matching providers
   */
  getByType(type: ModelProvider['type']): ModelProvider[] {
    return this.getAll().filter(p => p.type === type);
  }

  /**
   * Clear all registered providers
   */
  clear(): void {
    this.providers.clear();
  }

  /**
   * Dispose all providers and clear registry
   */
  async dispose(): Promise<void> {
    await Promise.all(
      this.getAll().map(p => p.dispose())
    );
    this.clear();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a mock model provider for testing
 *
 * @param config - Mock provider configuration
 * @returns Mock model provider
 */
export function createMockProvider(config: MockProviderConfig): MockModelProvider {
  return new MockModelProvider(config);
}

/**
 * Create a model provider registry
 *
 * @param providers - Optional initial providers
 * @returns Model provider registry
 */
export function createProviderRegistry(providers?: ModelProvider[]): ModelProviderRegistry {
  const registry = new ModelProviderRegistry();
  if (providers) {
    providers.forEach(p => registry.register(p));
  }
  return registry;
}
