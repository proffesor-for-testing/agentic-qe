/**
 * Agentic QE v3 - MCP Security: Sampling Server
 * Server-initiated LLM for AI-driven decisions (ADR-012)
 *
 * Features:
 * - Server-initiated sampling for AI-driven QE decisions
 * - Request/response management for LLM interactions
 * - Configurable prompts and model parameters
 * - Rate limiting and quota management for sampling
 * - Caching for repeated sampling requests
 */

import { createHash } from 'crypto';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Sampling request configuration
 */
export interface SamplingRequest {
  /** Unique request ID */
  requestId: string;
  /** System prompt for context */
  systemPrompt?: string;
  /** Messages for the sampling */
  messages: SamplingMessage[];
  /** Model to use */
  model?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for randomness */
  temperature?: number;
  /** Stop sequences */
  stopSequences?: string[];
  /** Metadata for the request */
  metadata?: Record<string, unknown>;
  /** Include sample in response */
  includeSample?: 'none' | 'full' | 'truncated';
}

/**
 * Sampling message
 */
export interface SamplingMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | SamplingContent[];
}

/**
 * Rich content for sampling
 */
export interface SamplingContent {
  type: 'text' | 'code' | 'resource';
  text?: string;
  code?: {
    language: string;
    content: string;
  };
  resource?: {
    uri: string;
    mimeType?: string;
    content?: string;
  };
}

/**
 * Sampling response
 */
export interface SamplingResponse {
  requestId: string;
  content: string;
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence';
  model: string;
  usage: TokenUsage;
  cached: boolean;
  latencyMs: number;
}

/**
 * Token usage statistics
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Sampling handler function type
 */
export type SamplingHandler = (request: SamplingRequest) => Promise<SamplingResponse>;

/**
 * Sampling server configuration
 */
export interface SamplingServerConfig {
  /** Default model to use */
  defaultModel: string;
  /** Default max tokens */
  defaultMaxTokens: number;
  /** Default temperature */
  defaultTemperature: number;
  /** Enable caching */
  enableCaching: boolean;
  /** Cache TTL in ms */
  cacheTTL: number;
  /** Max requests per minute */
  maxRequestsPerMinute: number;
  /** Max tokens per minute */
  maxTokensPerMinute: number;
}

/**
 * Quota tracking
 */
export interface QuotaUsage {
  requests: number;
  tokens: number;
  windowStart: number;
}

/**
 * Cached response
 */
export interface CachedResponse {
  response: SamplingResponse;
  expiresAt: number;
}

/**
 * Sampling server statistics
 */
export interface SamplingServerStats {
  totalRequests: number;
  cachedRequests: number;
  totalTokensUsed: number;
  averageLatencyMs: number;
  quotaResetTime: number;
  remainingRequests: number;
  remainingTokens: number;
}

// ============================================================================
// Pre-built QE Decision Prompts
// ============================================================================

/**
 * Pre-built prompts for QE decisions
 */
export const QEDecisionPrompts = {
  /**
   * Test generation decision prompt
   */
  testGenerationDecision: (context: {
    sourceCode: string;
    existingTests?: string;
    coverageData?: { lineCoverage: number; branchCoverage: number };
  }) => ({
    systemPrompt: `You are a QE expert AI assistant helping decide what tests to generate.
Analyze the source code and existing coverage to recommend:
1. What test cases are most valuable to add
2. Priority order for test generation
3. Estimated complexity of each test
4. Potential edge cases that need coverage`,
    messages: [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: 'Analyze this code and recommend tests:' },
          { type: 'code' as const, code: { language: 'typescript', content: context.sourceCode } },
          ...(context.existingTests ? [{ type: 'code' as const, code: { language: 'typescript', content: context.existingTests } }] : []),
          ...(context.coverageData ? [{ type: 'text' as const, text: `Current coverage: Line ${context.coverageData.lineCoverage}%, Branch ${context.coverageData.branchCoverage}%` }] : []),
        ],
      },
    ],
  }),

  /**
   * Quality gate decision prompt
   */
  qualityGateDecision: (context: {
    metrics: Record<string, number>;
    thresholds: Record<string, number>;
    trends: { metric: string; direction: 'up' | 'down' | 'stable'; change: number }[];
  }) => ({
    systemPrompt: `You are a QE expert AI assistant helping make quality gate decisions.
Based on the metrics, thresholds, and trends, recommend:
1. Whether the quality gate should pass or fail
2. Key concerns and risks
3. Recommendations for improvement
4. Confidence level in the decision`,
    messages: [
      {
        role: 'user' as const,
        content: `Quality Gate Decision Request:

Metrics: ${JSON.stringify(context.metrics, null, 2)}

Thresholds: ${JSON.stringify(context.thresholds, null, 2)}

Trends: ${JSON.stringify(context.trends, null, 2)}

Should this quality gate pass? Explain your reasoning.`,
      },
    ],
  }),

  /**
   * Defect prediction decision prompt
   */
  defectPredictionDecision: (context: {
    codeChanges: { file: string; additions: number; deletions: number; complexity: number }[];
    historicalDefects: { file: string; defectCount: number; lastDefect: string }[];
    riskFactors: string[];
  }) => ({
    systemPrompt: `You are a QE expert AI assistant helping predict potential defects.
Analyze the code changes, historical defect data, and risk factors to:
1. Identify high-risk areas likely to have defects
2. Recommend targeted testing strategies
3. Estimate confidence level for predictions
4. Suggest preventive measures`,
    messages: [
      {
        role: 'user' as const,
        content: `Defect Prediction Analysis:

Code Changes:
${context.codeChanges.map(c => `- ${c.file}: +${c.additions}/-${c.deletions}, complexity: ${c.complexity}`).join('\n')}

Historical Defects:
${context.historicalDefects.map(d => `- ${d.file}: ${d.defectCount} defects, last: ${d.lastDefect}`).join('\n')}

Risk Factors:
${context.riskFactors.map(r => `- ${r}`).join('\n')}

Predict potential defects and recommend testing focus areas.`,
      },
    ],
  }),

  /**
   * Security vulnerability analysis prompt
   */
  securityAnalysisDecision: (context: {
    findings: { type: string; severity: string; location: string; description: string }[];
    codeContext: string;
  }) => ({
    systemPrompt: `You are a security expert AI assistant helping analyze vulnerabilities.
Review the security findings and code context to:
1. Prioritize vulnerabilities by risk
2. Assess exploitability
3. Recommend remediation steps
4. Identify any false positives`,
    messages: [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: 'Analyze these security findings:' },
          { type: 'text' as const, text: JSON.stringify(context.findings, null, 2) },
          { type: 'code' as const, code: { language: 'typescript', content: context.codeContext } },
        ],
      },
    ],
  }),
};

// ============================================================================
// Sampling Server Implementation
// ============================================================================

/**
 * Sampling Server for AI-driven QE decisions
 */
export class SamplingServer {
  private readonly config: SamplingServerConfig;
  private readonly handlers: Map<string, SamplingHandler>;
  private readonly cache: Map<string, CachedResponse>;
  private readonly quota: QuotaUsage;
  private stats: {
    totalRequests: number;
    cachedRequests: number;
    totalTokensUsed: number;
    totalLatencyMs: number;
  };
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<SamplingServerConfig> = {}) {
    this.config = {
      defaultModel: config.defaultModel || 'claude-3-sonnet-20240229',
      defaultMaxTokens: config.defaultMaxTokens || 4096,
      defaultTemperature: config.defaultTemperature || 0.7,
      enableCaching: config.enableCaching ?? true,
      cacheTTL: config.cacheTTL || 5 * 60 * 1000, // 5 minutes
      maxRequestsPerMinute: config.maxRequestsPerMinute || 60,
      maxTokensPerMinute: config.maxTokensPerMinute || 100000,
    };

    this.handlers = new Map();
    this.cache = new Map();
    this.quota = {
      requests: 0,
      tokens: 0,
      windowStart: Date.now(),
    };
    this.stats = {
      totalRequests: 0,
      cachedRequests: 0,
      totalTokensUsed: 0,
      totalLatencyMs: 0,
    };

    // Register default handler
    this.registerHandler('default', this.defaultHandler.bind(this));

    // Start cache cleanup
    this.startCleanup();
  }

  /**
   * Register a sampling handler
   */
  registerHandler(name: string, handler: SamplingHandler): void {
    this.handlers.set(name, handler);
  }

  /**
   * Create a sampling request
   */
  createRequest(options: Omit<SamplingRequest, 'requestId'>): SamplingRequest {
    return {
      requestId: this.generateRequestId(),
      ...options,
    };
  }

  /**
   * Process a sampling request
   */
  async sample(
    request: SamplingRequest,
    handlerName = 'default'
  ): Promise<SamplingResponse> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    // Check cache
    if (this.config.enableCaching) {
      const cached = this.getCached(request);
      if (cached) {
        this.stats.cachedRequests++;
        return {
          ...cached.response,
          requestId: request.requestId,
          cached: true,
          latencyMs: Date.now() - startTime,
        };
      }
    }

    // Check quota
    this.checkQuota();

    // Get handler
    const handler = this.handlers.get(handlerName);
    if (!handler) {
      throw new Error(`Unknown sampling handler: ${handlerName}`);
    }

    // Fill in defaults
    const fullRequest: SamplingRequest = {
      ...request,
      model: request.model || this.config.defaultModel,
      maxTokens: request.maxTokens || this.config.defaultMaxTokens,
      temperature: request.temperature ?? this.config.defaultTemperature,
    };

    // Execute handler
    const response = await handler(fullRequest);
    const latencyMs = Date.now() - startTime;

    // Update stats
    this.stats.totalTokensUsed += response.usage.totalTokens;
    this.stats.totalLatencyMs += latencyMs;

    // Update quota
    this.quota.requests++;
    this.quota.tokens += response.usage.totalTokens;

    // Cache response
    if (this.config.enableCaching) {
      this.setCached(request, {
        ...response,
        cached: false,
        latencyMs,
      });
    }

    return {
      ...response,
      cached: false,
      latencyMs,
    };
  }

  /**
   * Sample with a pre-built QE decision prompt
   */
  async sampleQEDecision<T extends keyof typeof QEDecisionPrompts>(
    promptType: T,
    context: Parameters<(typeof QEDecisionPrompts)[T]>[0],
    options: Partial<SamplingRequest> = {}
  ): Promise<SamplingResponse> {
    const promptBuilder = QEDecisionPrompts[promptType] as (ctx: typeof context) => {
      systemPrompt: string;
      messages: SamplingMessage[];
    };
    const { systemPrompt, messages } = promptBuilder(context);

    const request = this.createRequest({
      systemPrompt,
      messages,
      ...options,
    });

    return this.sample(request);
  }

  /**
   * Get server statistics
   */
  getStats(): SamplingServerStats {
    const now = Date.now();
    this.resetQuotaIfNeeded(now);

    return {
      totalRequests: this.stats.totalRequests,
      cachedRequests: this.stats.cachedRequests,
      totalTokensUsed: this.stats.totalTokensUsed,
      averageLatencyMs: this.stats.totalRequests > 0
        ? Math.round(this.stats.totalLatencyMs / this.stats.totalRequests)
        : 0,
      quotaResetTime: this.quota.windowStart + 60000,
      remainingRequests: Math.max(0, this.config.maxRequestsPerMinute - this.quota.requests),
      remainingTokens: Math.max(0, this.config.maxTokensPerMinute - this.quota.tokens),
    };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Dispose the server
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private defaultHandler(request: SamplingRequest): Promise<SamplingResponse> {
    // Simulated response for testing
    // In production, this would call an actual LLM API
    const inputTokens = this.estimateTokens(request);
    const outputContent = this.generateSimulatedResponse(request);
    const outputTokens = Math.ceil(outputContent.length / 4);

    return Promise.resolve({
      requestId: request.requestId,
      content: outputContent,
      stopReason: 'end_turn',
      model: request.model || this.config.defaultModel,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      cached: false,
      latencyMs: 0,
    });
  }

  private generateSimulatedResponse(request: SamplingRequest): string {
    // Generate a basic simulated response based on the context
    const hasCode = request.messages.some(m =>
      Array.isArray(m.content) && m.content.some(c => c.type === 'code')
    );

    if (request.systemPrompt?.includes('test generation')) {
      return `Based on the analysis, I recommend:

1. **Unit Tests (Priority: High)**
   - Test happy path scenarios
   - Test error handling
   - Test edge cases

2. **Integration Tests (Priority: Medium)**
   - Test API interactions
   - Test database operations

3. **Edge Cases to Cover**
   - Empty inputs
   - Boundary values
   - Invalid inputs

Estimated effort: Medium complexity`;
    }

    if (request.systemPrompt?.includes('quality gate')) {
      return `**Quality Gate Decision: PASS**

Analysis:
- Coverage metrics meet thresholds
- Test pass rate is acceptable
- No critical security issues

Confidence: 85%

Recommendations:
- Consider adding more integration tests
- Monitor for regressions`;
    }

    if (request.systemPrompt?.includes('defect')) {
      return `**Defect Prediction Analysis**

High Risk Areas:
1. auth/login.ts - 75% risk
2. api/handlers.ts - 60% risk

Recommendations:
- Focus testing on authentication flow
- Add regression tests for API handlers`;
    }

    return `Analysis complete. ${hasCode ? 'Code analyzed successfully.' : 'Request processed successfully.'}`;
  }

  private estimateTokens(request: SamplingRequest): number {
    let text = request.systemPrompt || '';
    for (const msg of request.messages) {
      if (typeof msg.content === 'string') {
        text += msg.content;
      } else {
        for (const content of msg.content) {
          if (content.text) text += content.text;
          if (content.code) text += content.code.content;
          if (content.resource?.content) text += content.resource.content;
        }
      }
    }
    return Math.ceil(text.length / 4); // Rough estimate
  }

  private generateRequestId(): string {
    return `sr-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private getCacheKey(request: SamplingRequest): string {
    const content = JSON.stringify({
      systemPrompt: request.systemPrompt,
      messages: request.messages,
      model: request.model,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
    });
    return createHash('sha256').update(content).digest('hex');
  }

  private getCached(request: SamplingRequest): CachedResponse | null {
    const key = this.getCacheKey(request);
    const cached = this.cache.get(key);

    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cached;
  }

  private setCached(request: SamplingRequest, response: SamplingResponse): void {
    const key = this.getCacheKey(request);
    this.cache.set(key, {
      response,
      expiresAt: Date.now() + this.config.cacheTTL,
    });
  }

  private checkQuota(): void {
    const now = Date.now();
    this.resetQuotaIfNeeded(now);

    if (this.quota.requests >= this.config.maxRequestsPerMinute) {
      const resetIn = Math.ceil((this.quota.windowStart + 60000 - now) / 1000);
      throw new Error(`Rate limit exceeded. Reset in ${resetIn} seconds.`);
    }

    if (this.quota.tokens >= this.config.maxTokensPerMinute) {
      const resetIn = Math.ceil((this.quota.windowStart + 60000 - now) / 1000);
      throw new Error(`Token quota exceeded. Reset in ${resetIn} seconds.`);
    }
  }

  private resetQuotaIfNeeded(now: number): void {
    if (now - this.quota.windowStart >= 60000) {
      this.quota.requests = 0;
      this.quota.tokens = 0;
      this.quota.windowStart = now;
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, cached] of this.cache) {
        if (now > cached.expiresAt) {
          this.cache.delete(key);
        }
      }
    }, 60000); // Every minute
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new sampling server
 */
export function createSamplingServer(config?: Partial<SamplingServerConfig>): SamplingServer {
  return new SamplingServer(config);
}

// ============================================================================
// Default Instance
// ============================================================================

let defaultServer: SamplingServer | null = null;

/**
 * Get the default sampling server instance
 */
export function getSamplingServer(): SamplingServer {
  if (!defaultServer) {
    defaultServer = createSamplingServer();
  }
  return defaultServer;
}
