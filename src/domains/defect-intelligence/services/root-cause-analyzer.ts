/**
 * Agentic QE v3 - Root Cause Analyzer Service
 * Analyzes defects to identify root causes and contributing factors
 *
 * ADR-051: LLM-enhanced root cause analysis for deeper insights
 */

import { Result, ok, err } from '../../../shared/types';
import { MemoryBackend } from '../../../kernel/interfaces';
import {
  RootCauseRequest,
  RootCauseAnalysis,
  ContributingFactor,
  TimelineEvent,
} from '../interfaces';

// ADR-051: LLM Router for AI-enhanced root cause analysis
import type { HybridRouter, ChatResponse } from '../../../shared/llm';
import { toError } from '../../../shared/error-utils.js';
import { safeJsonParse } from '../../../shared/safe-json.js';

/**
 * Interface for the root cause analyzer service
 */
export interface IRootCauseAnalyzerService {
  analyzeRootCause(request: RootCauseRequest): Promise<Result<RootCauseAnalysis, Error>>;
  findRelatedDefects(defectId: string): Promise<Result<string[], Error>>;
  generateTimeline(defectId: string): Promise<Result<TimelineEvent[], Error>>;
  suggestRemediation(rootCause: string): Promise<string[]>;
}

/**
 * Configuration for the root cause analyzer
 */
export interface RootCauseAnalyzerConfig {
  maxTimelineEvents: number;
  maxRelatedFiles: number;
  minConfidenceThreshold: number;
  analyzerNamespace: string;
  enableDeepAnalysis: boolean;
  /** ADR-051: Enable LLM-powered root cause analysis */
  enableLLMAnalysis?: boolean;
  /** ADR-051: Model tier for LLM calls (1=Haiku, 2=Sonnet, 4=Opus) */
  llmModelTier?: number;
  /** ADR-051: Max tokens for LLM responses */
  llmMaxTokens?: number;
}

/**
 * Dependencies for RootCauseAnalyzerService
 * Enables dependency injection and testing
 */
export interface RootCauseAnalyzerDependencies {
  memory: MemoryBackend;
  /** ADR-051: Optional LLM router for AI-enhanced root cause analysis */
  llmRouter?: HybridRouter;
}

const DEFAULT_CONFIG: RootCauseAnalyzerConfig = {
  maxTimelineEvents: 20,
  maxRelatedFiles: 10,
  minConfidenceThreshold: 0.3,
  analyzerNamespace: 'defect-intelligence:root-cause',
  enableDeepAnalysis: true,
  enableLLMAnalysis: true, // On by default - opt-out (ADR-051)
  llmModelTier: 2, // Sonnet by default
  llmMaxTokens: 2048,
};

/**
 * Known root cause categories with analysis patterns
 */
const ROOT_CAUSE_CATEGORIES: Record<
  string,
  {
    symptoms: string[];
    causes: string[];
    impact: 'high' | 'medium' | 'low';
    remediation: string[];
  }
> = {
  'logic-error': {
    symptoms: ['wrong result', 'incorrect output', 'unexpected behavior', 'calculation'],
    causes: [
      'Incorrect algorithm implementation',
      'Missing edge case handling',
      'Wrong operator usage',
      'Off-by-one error',
    ],
    impact: 'high',
    remediation: [
      'Review algorithm logic step by step',
      'Add comprehensive unit tests',
      'Use property-based testing for edge cases',
    ],
  },
  'null-reference': {
    symptoms: ['null', 'undefined', 'cannot read property', 'NullPointerException'],
    causes: [
      'Missing null check',
      'Uninitialized variable',
      'Race condition in initialization',
      'API returning null unexpectedly',
    ],
    impact: 'high',
    remediation: [
      'Add defensive null checks',
      'Use Optional/Maybe pattern',
      'Initialize variables at declaration',
    ],
  },
  'concurrency': {
    symptoms: ['race', 'deadlock', 'intermittent', 'timing', 'thread'],
    causes: [
      'Missing synchronization',
      'Shared mutable state',
      'Lock ordering issue',
      'Async operation not awaited',
    ],
    impact: 'high',
    remediation: [
      'Use immutable data structures',
      'Implement proper locking strategy',
      'Add synchronization primitives',
    ],
  },
  'resource-management': {
    symptoms: ['memory', 'leak', 'connection', 'file handle', 'exhausted'],
    causes: [
      'Resource not properly released',
      'Missing cleanup in error path',
      'Connection pool misconfiguration',
      'Circular reference preventing GC',
    ],
    impact: 'medium',
    remediation: [
      'Use try-finally or using blocks',
      'Implement IDisposable pattern',
      'Configure resource pools properly',
    ],
  },
  'configuration': {
    symptoms: ['config', 'environment', 'setting', 'property', 'parameter'],
    causes: [
      'Wrong configuration value',
      'Missing required setting',
      'Environment mismatch',
      'Hardcoded values',
    ],
    impact: 'medium',
    remediation: [
      'Validate configuration at startup',
      'Use configuration schema validation',
      'Document all required settings',
    ],
  },
  'integration': {
    symptoms: ['api', 'service', 'external', 'timeout', 'connection'],
    causes: [
      'External service change',
      'API contract violation',
      'Network configuration issue',
      'Missing retry logic',
    ],
    impact: 'high',
    remediation: [
      'Implement circuit breaker pattern',
      'Add contract tests',
      'Use retry with exponential backoff',
    ],
  },
  'data-integrity': {
    symptoms: ['corrupt', 'invalid', 'constraint', 'duplicate', 'data'],
    causes: [
      'Missing validation',
      'Database constraint violated',
      'Race condition in data update',
      'Inconsistent state transitions',
    ],
    impact: 'high',
    remediation: [
      'Add input validation at all layers',
      'Use database transactions properly',
      'Implement optimistic locking',
    ],
  },
  'security': {
    symptoms: ['injection', 'auth', 'permission', 'access', 'security'],
    causes: [
      'Missing input sanitization',
      'Broken authentication',
      'Insufficient authorization checks',
      'Sensitive data exposure',
    ],
    impact: 'high',
    remediation: [
      'Sanitize all user inputs',
      'Implement proper authentication',
      'Follow principle of least privilege',
    ],
  },
};

/**
 * Root Cause Analyzer Service Implementation
 * Uses symptom analysis and heuristics to identify root causes
 *
 * ADR-051: Added LLM enhancement for AI-powered root cause analysis
 */
export class RootCauseAnalyzerService implements IRootCauseAnalyzerService {
  private readonly config: RootCauseAnalyzerConfig;
  private readonly memory: MemoryBackend;
  private readonly llmRouter?: HybridRouter;

  /**
   * Constructor with backward compatibility
   * Supports both old signature (memory, config) and new signature (dependencies, config)
   */
  constructor(
    memoryOrDeps: MemoryBackend | RootCauseAnalyzerDependencies,
    config: Partial<RootCauseAnalyzerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Support both old and new constructor signatures for backward compatibility
    if (this.isMemoryBackend(memoryOrDeps)) {
      // Old signature: (memory, config)
      this.memory = memoryOrDeps;
      this.llmRouter = undefined;
    } else {
      // New signature: (dependencies, config)
      this.memory = memoryOrDeps.memory;
      this.llmRouter = memoryOrDeps.llmRouter;
    }
  }

  /**
   * Type guard to check if argument is MemoryBackend (old signature) or Dependencies (new signature)
   */
  private isMemoryBackend(arg: MemoryBackend | RootCauseAnalyzerDependencies): arg is MemoryBackend {
    return typeof (arg as MemoryBackend).get === 'function' &&
           typeof (arg as MemoryBackend).set === 'function' &&
           !('memory' in arg);
  }

  // ============================================================================
  // ADR-051: LLM Enhancement Methods
  // ============================================================================

  /**
   * Check if LLM analysis is available and enabled
   */
  private isLLMAnalysisAvailable(): boolean {
    return this.config.enableLLMAnalysis === true && this.llmRouter !== undefined;
  }

  /**
   * Get model ID for the configured tier
   */
  private getModelForTier(tier: number): string {
    switch (tier) {
      case 1: return 'claude-3-5-haiku-20241022';
      case 2: return 'claude-sonnet-4-20250514';
      case 3: return 'claude-sonnet-4-20250514';
      case 4: return 'claude-opus-4-5-20251101';
      default: return 'claude-sonnet-4-20250514';
    }
  }

  /**
   * Analyze root cause using LLM for deeper insights
   * Provides detailed explanations, contributing factors, and fixes
   */
  private async analyzeRootCauseWithLLM(
    failure: { defectId: string; symptoms: string[]; context?: Record<string, unknown> },
    stackTrace?: string,
    codeContext?: string
  ): Promise<{
    rootCause: string;
    explanation: string;
    contributingFactors: ContributingFactor[];
    recommendedFixes: Array<{ description: string; codeExample?: string }>;
    preventionStrategies: string[];
  } | null> {
    if (!this.llmRouter) return null;

    try {
      const prompt = this.buildLLMAnalysisPrompt(failure, stackTrace, codeContext);
      const modelId = this.getModelForTier(this.config.llmModelTier ?? 2);

      const response: ChatResponse = await this.llmRouter.chat({
        messages: [
          {
            role: 'system',
            content: `You are an expert software engineer specialized in debugging and root cause analysis.
Analyze the provided defect information and provide:
1. Root cause identification with clear explanation
2. Contributing factors ranked by impact
3. Recommended fixes with code examples where applicable
4. Prevention strategies to avoid similar issues

Return your analysis as JSON with this structure:
{
  "rootCause": "Brief root cause description",
  "explanation": "Detailed explanation of why this happened",
  "contributingFactors": [
    { "factor": "Factor name", "impact": "high|medium|low", "evidence": ["evidence1", "evidence2"] }
  ],
  "recommendedFixes": [
    { "description": "Fix description", "codeExample": "optional code snippet" }
  ],
  "preventionStrategies": ["Strategy 1", "Strategy 2"]
}`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: modelId,
        maxTokens: this.config.llmMaxTokens ?? 2048,
        temperature: 0.3, // Low temperature for consistent analysis
      });

      if (response.content && response.content.length > 0) {
        return this.parseLLMAnalysisResponse(response.content);
      }

      return null;
    } catch (error) {
      console.warn('[RootCauseAnalyzer] LLM analysis failed, falling back to heuristics:', error);
      return null;
    }
  }

  /**
   * Build prompt for LLM root cause analysis
   */
  private buildLLMAnalysisPrompt(
    failure: { defectId: string; symptoms: string[]; context?: Record<string, unknown> },
    stackTrace?: string,
    codeContext?: string
  ): string {
    let prompt = `## Defect Analysis Request\n\n`;
    prompt += `**Defect ID:** ${failure.defectId}\n\n`;

    prompt += `## Symptoms\n`;
    for (const symptom of failure.symptoms) {
      prompt += `- ${symptom}\n`;
    }
    prompt += '\n';

    if (failure.context && Object.keys(failure.context).length > 0) {
      prompt += `## Context\n`;
      prompt += `\`\`\`json\n${JSON.stringify(failure.context, null, 2)}\n\`\`\`\n\n`;
    }

    if (stackTrace) {
      prompt += `## Stack Trace\n`;
      prompt += `\`\`\`\n${stackTrace}\n\`\`\`\n\n`;
    }

    if (codeContext) {
      prompt += `## Related Code\n`;
      prompt += `\`\`\`typescript\n${codeContext}\n\`\`\`\n\n`;
    }

    prompt += `## Analysis Required\n`;
    prompt += `1. Identify the most likely root cause\n`;
    prompt += `2. Explain the chain of events that led to this defect\n`;
    prompt += `3. List contributing factors with their impact level\n`;
    prompt += `4. Provide specific fix recommendations with code examples\n`;
    prompt += `5. Suggest prevention strategies\n`;

    return prompt;
  }

  /**
   * Parse LLM analysis response into structured format
   */
  private parseLLMAnalysisResponse(content: string): {
    rootCause: string;
    explanation: string;
    contributingFactors: ContributingFactor[];
    recommendedFixes: Array<{ description: string; codeExample?: string }>;
    preventionStrategies: string[];
  } | null {
    try {
      // Extract JSON from response, handling potential markdown fences
      let jsonContent = content;
      const jsonMatch = content.match(/```(?:json)?\n?([\s\S]*?)```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1].trim();
      }

      const parsed = safeJsonParse(jsonContent);

      // Validate and transform the response
      return {
        rootCause: parsed.rootCause || 'Unknown root cause',
        explanation: parsed.explanation || '',
        contributingFactors: (parsed.contributingFactors || []).map((cf: {
          factor: string;
          impact: string;
          evidence?: string[];
        }) => ({
          factor: cf.factor,
          impact: this.normalizeImpact(cf.impact),
          evidence: cf.evidence || [],
        })),
        recommendedFixes: parsed.recommendedFixes || [],
        preventionStrategies: parsed.preventionStrategies || [],
      };
    } catch {
      // JSON parse failed, try to extract structured info from text
      return this.parseUnstructuredLLMResponse(content);
    }
  }

  /**
   * Normalize impact string to valid impact level
   */
  private normalizeImpact(impact: string): 'high' | 'medium' | 'low' {
    const normalized = (impact || '').toLowerCase();
    if (normalized === 'high' || normalized === 'critical' || normalized === 'severe') {
      return 'high';
    }
    if (normalized === 'medium' || normalized === 'moderate' || normalized === 'normal') {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Parse unstructured LLM response as fallback
   */
  private parseUnstructuredLLMResponse(content: string): {
    rootCause: string;
    explanation: string;
    contributingFactors: ContributingFactor[];
    recommendedFixes: Array<{ description: string; codeExample?: string }>;
    preventionStrategies: string[];
  } | null {
    // Extract root cause from first paragraph or line
    const lines = content.split('\n').filter(line => line.trim());
    const rootCause = lines[0]?.replace(/^(root cause:|the root cause is|caused by)/i, '').trim() || 'Unable to parse root cause';

    return {
      rootCause,
      explanation: content,
      contributingFactors: [],
      recommendedFixes: [],
      preventionStrategies: [],
    };
  }

  /**
   * Analyze root cause of a defect
   * ADR-051: Enhanced with optional LLM analysis for deeper insights
   */
  async analyzeRootCause(
    request: RootCauseRequest
  ): Promise<Result<RootCauseAnalysis, Error>> {
    try {
      const { defectId, symptoms, context = {} } = request;

      if (symptoms.length === 0) {
        return err(new Error('No symptoms provided for analysis'));
      }

      // ADR-051: Try LLM-enhanced analysis first if available
      if (this.isLLMAnalysisAvailable()) {
        const llmAnalysis = await this.analyzeRootCauseWithLLM(
          { defectId, symptoms, context },
          context.stackTrace as string | undefined,
          context.codeContext as string | undefined
        );

        if (llmAnalysis) {
          // Find related files
          const relatedFiles = await this.findRelatedFiles(defectId, symptoms);

          // Build timeline
          const timeline = await this.generateTimeline(defectId);

          // Merge LLM recommendations with prevention strategies
          const recommendations = [
            ...llmAnalysis.recommendedFixes.map(fix =>
              fix.codeExample
                ? `${fix.description}\n\`\`\`\n${fix.codeExample}\n\`\`\``
                : fix.description
            ),
            ...llmAnalysis.preventionStrategies,
          ];

          // Store analysis for future reference
          await this.storeAnalysis({
            defectId,
            rootCause: llmAnalysis.rootCause,
            category: 'llm-analyzed',
            confidence: 0.85, // High confidence for LLM analysis
            symptoms,
            timestamp: new Date(),
          });

          return ok({
            defectId,
            rootCause: llmAnalysis.rootCause,
            confidence: 0.85,
            contributingFactors: llmAnalysis.contributingFactors,
            relatedFiles,
            recommendations,
            timeline: timeline.success ? timeline.value : [],
          });
        }
        // LLM analysis failed, fall through to heuristic analysis
      }

      // Heuristic-based analysis (original implementation)
      // Identify the root cause category
      const categoryAnalysis = this.identifyRootCauseCategory(symptoms);

      // Calculate confidence based on symptom matches
      const confidence = this.calculateConfidence(categoryAnalysis, symptoms);

      if (confidence < this.config.minConfidenceThreshold) {
        return ok({
          defectId,
          rootCause: 'Unable to determine root cause with sufficient confidence',
          confidence,
          contributingFactors: [],
          relatedFiles: [],
          recommendations: ['Provide more symptoms for better analysis'],
          timeline: [],
        });
      }

      // Identify contributing factors
      const contributingFactors = await this.identifyContributingFactors(
        categoryAnalysis.category,
        symptoms,
        context
      );

      // Find related files
      const relatedFiles = await this.findRelatedFiles(defectId, symptoms);

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        categoryAnalysis,
        contributingFactors
      );

      // Build timeline
      const timeline = await this.generateTimeline(defectId);

      // Store analysis for future reference
      await this.storeAnalysis({
        defectId,
        rootCause: categoryAnalysis.rootCause,
        category: categoryAnalysis.category,
        confidence,
        symptoms,
        timestamp: new Date(),
      });

      return ok({
        defectId,
        rootCause: categoryAnalysis.rootCause,
        confidence,
        contributingFactors,
        relatedFiles,
        recommendations,
        timeline: timeline.success ? timeline.value : [],
      });
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Find defects related to a given defect
   */
  async findRelatedDefects(defectId: string): Promise<Result<string[], Error>> {
    try {
      // Look for defects with similar root causes
      const analysis = await this.memory.get<{ category: string }>(
        `${this.config.analyzerNamespace}:analysis:${defectId}`
      );

      if (!analysis) {
        return ok([]);
      }

      // Search for other defects in the same category
      const keys = await this.memory.search(
        `${this.config.analyzerNamespace}:analysis:*`,
        50
      );

      const relatedDefects: string[] = [];
      for (const key of keys) {
        const otherAnalysis = await this.memory.get<{
          defectId: string;
          category: string;
        }>(key);

        if (
          otherAnalysis &&
          otherAnalysis.defectId !== defectId &&
          otherAnalysis.category === analysis.category
        ) {
          relatedDefects.push(otherAnalysis.defectId);
        }
      }

      return ok(relatedDefects);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Generate timeline of events related to a defect
   */
  async generateTimeline(defectId: string): Promise<Result<TimelineEvent[], Error>> {
    try {
      const timeline: TimelineEvent[] = [];

      // Look for stored events
      const eventsKey = `${this.config.analyzerNamespace}:events:${defectId}`;
      const storedEvents = await this.memory.get<TimelineEvent[]>(eventsKey);

      if (storedEvents) {
        timeline.push(...storedEvents);
      }

      // Look for related changes in code intelligence
      const changes = await this.memory.search(
        `code-intelligence:change:*`,
        this.config.maxTimelineEvents
      );

      for (const changeKey of changes) {
        const change = await this.memory.get<{
          timestamp: string;
          description: string;
          file: string;
        }>(changeKey);

        if (change) {
          timeline.push({
            timestamp: new Date(change.timestamp),
            event: `Code change: ${change.description}`,
            relevance: 0.5,
          });
        }
      }

      // Sort by timestamp and limit
      const sortedTimeline = timeline
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, this.config.maxTimelineEvents);

      return ok(sortedTimeline);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Suggest remediation steps for a root cause
   */
  async suggestRemediation(rootCause: string): Promise<string[]> {
    const remediation: string[] = [];

    // Match root cause to known categories
    for (const [category, data] of Object.entries(ROOT_CAUSE_CATEGORIES)) {
      if (
        rootCause.toLowerCase().includes(category) ||
        data.causes.some((c) => rootCause.toLowerCase().includes(c.toLowerCase()))
      ) {
        remediation.push(...data.remediation);
      }
    }

    if (remediation.length === 0) {
      remediation.push('Review the affected code thoroughly');
      remediation.push('Add tests to prevent regression');
      remediation.push('Document the fix for future reference');
    }

    return [...new Set(remediation)];
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private identifyRootCauseCategory(
    symptoms: string[]
  ): { category: string; rootCause: string; matchScore: number } {
    let bestMatch = {
      category: 'unknown',
      rootCause: 'Undetermined root cause',
      matchScore: 0,
    };

    const symptomText = symptoms.join(' ').toLowerCase();

    for (const [category, data] of Object.entries(ROOT_CAUSE_CATEGORIES)) {
      let matchScore = 0;

      for (const symptom of data.symptoms) {
        if (symptomText.includes(symptom.toLowerCase())) {
          matchScore += 1;
        }
      }

      // Normalize by number of symptoms
      matchScore = matchScore / data.symptoms.length;

      if (matchScore > bestMatch.matchScore) {
        // Select the most likely cause from the category
        const likelyCause = this.selectLikelyCause(data.causes, symptomText);
        bestMatch = {
          category,
          rootCause: likelyCause,
          matchScore,
        };
      }
    }

    return bestMatch;
  }

  private selectLikelyCause(causes: string[], symptomText: string): string {
    // Score each cause by word overlap with symptoms
    let bestCause = causes[0];
    let bestScore = 0;

    for (const cause of causes) {
      const words = cause.toLowerCase().split(/\s+/);
      let score = 0;
      for (const word of words) {
        if (word.length > 3 && symptomText.includes(word)) {
          score += 1;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestCause = cause;
      }
    }

    return bestCause;
  }

  private calculateConfidence(
    categoryAnalysis: { matchScore: number },
    symptoms: string[]
  ): number {
    // Base confidence from match score
    let confidence = categoryAnalysis.matchScore;

    // Adjust based on number of symptoms
    if (symptoms.length >= 3) {
      confidence *= 1.1;
    } else if (symptoms.length === 1) {
      confidence *= 0.8;
    }

    // Cap at 1.0
    return Math.min(1, Math.max(0, confidence));
  }

  private async identifyContributingFactors(
    category: string,
    symptoms: string[],
    context: Record<string, unknown>
  ): Promise<ContributingFactor[]> {
    const factors: ContributingFactor[] = [];
    const categoryData = ROOT_CAUSE_CATEGORIES[category];

    if (!categoryData) {
      return factors;
    }

    // Add factors based on category
    factors.push({
      factor: `Category: ${category}`,
      impact: categoryData.impact,
      evidence: symptoms.slice(0, 3),
    });

    // Add context-based factors
    if (context.recentChanges) {
      factors.push({
        factor: 'Recent code changes',
        impact: 'high',
        evidence: ['Code was recently modified'],
      });
    }

    if (context.highTraffic) {
      factors.push({
        factor: 'High traffic conditions',
        impact: 'medium',
        evidence: ['Occurred during peak load'],
      });
    }

    if (context.environment) {
      factors.push({
        factor: `Environment: ${context.environment}`,
        impact: 'medium',
        evidence: [`Observed in ${context.environment} environment`],
      });
    }

    // Look for historical patterns
    const historicalFactors = await this.getHistoricalFactors(category);
    factors.push(...historicalFactors);

    return factors;
  }

  private async getHistoricalFactors(
    category: string
  ): Promise<ContributingFactor[]> {
    const factors: ContributingFactor[] = [];

    // Search for historical analyses in the same category
    const historicalKey = `${this.config.analyzerNamespace}:history:${category}`;
    const history = await this.memory.get<{
      occurrences: number;
      commonFactors: string[];
    }>(historicalKey);

    if (history && history.occurrences > 1) {
      factors.push({
        factor: 'Recurring issue pattern',
        impact: 'high',
        evidence: [
          `Similar issues occurred ${history.occurrences} times`,
          ...history.commonFactors.slice(0, 2),
        ],
      });
    }

    return factors;
  }

  private async findRelatedFiles(
    _defectId: string,
    symptoms: string[]
  ): Promise<string[]> {
    const files: Set<string> = new Set();

    // Extract file paths from symptoms
    for (const symptom of symptoms) {
      const filePatterns = symptom.match(/[\w\-]+\.(ts|js|tsx|jsx|py|java|go)/g);
      if (filePatterns) {
        filePatterns.forEach((f) => files.add(f));
      }

      // Look for path-like patterns
      const pathPatterns = symptom.match(/(?:src|lib|app)\/[\w\/\-]+/g);
      if (pathPatterns) {
        pathPatterns.forEach((p) => files.add(p));
      }
    }

    // Look for files from code intelligence
    const codeIntelKeys = await this.memory.search(
      'code-intelligence:file:*',
      this.config.maxRelatedFiles
    );

    for (const key of codeIntelKeys.slice(0, this.config.maxRelatedFiles - files.size)) {
      const fileInfo = await this.memory.get<{ path: string }>(key);
      if (fileInfo) {
        files.add(fileInfo.path);
      }
    }

    return Array.from(files).slice(0, this.config.maxRelatedFiles);
  }

  private generateRecommendations(
    categoryAnalysis: { category: string; rootCause: string },
    contributingFactors: ContributingFactor[]
  ): string[] {
    const recommendations: string[] = [];
    const categoryData = ROOT_CAUSE_CATEGORIES[categoryAnalysis.category];

    // Add category-specific remediation
    if (categoryData) {
      recommendations.push(...categoryData.remediation);
    }

    // Add factor-specific recommendations
    for (const factor of contributingFactors) {
      if (factor.impact === 'high') {
        recommendations.push(`Address: ${factor.factor}`);
      }
    }

    // Add general recommendations
    recommendations.push('Add regression tests for this scenario');
    recommendations.push('Document the root cause and fix');

    return [...new Set(recommendations)].slice(0, 8);
  }

  private async storeAnalysis(analysis: {
    defectId: string;
    rootCause: string;
    category: string;
    confidence: number;
    symptoms: string[];
    timestamp: Date;
  }): Promise<void> {
    // Store the analysis
    await this.memory.set(
      `${this.config.analyzerNamespace}:analysis:${analysis.defectId}`,
      analysis,
      { namespace: 'defect-intelligence', persist: true }
    );

    // Update historical data for the category
    const historyKey = `${this.config.analyzerNamespace}:history:${analysis.category}`;
    const history = (await this.memory.get<{
      occurrences: number;
      commonFactors: string[];
    }>(historyKey)) || { occurrences: 0, commonFactors: [] };

    history.occurrences += 1;
    // Add new symptoms to common factors
    for (const symptom of analysis.symptoms.slice(0, 2)) {
      if (!history.commonFactors.includes(symptom)) {
        history.commonFactors.push(symptom);
      }
    }
    history.commonFactors = history.commonFactors.slice(0, 10);

    await this.memory.set(historyKey, history, {
      namespace: 'defect-intelligence',
      persist: true,
    });
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a RootCauseAnalyzerService instance with default dependencies
 * Maintains backward compatibility with existing code
 *
 * @param memory - Memory backend for storing analysis results
 * @param config - Optional configuration overrides
 * @returns Configured RootCauseAnalyzerService instance
 */
export function createRootCauseAnalyzerService(
  memory: MemoryBackend,
  config: Partial<RootCauseAnalyzerConfig> = {}
): RootCauseAnalyzerService {
  return new RootCauseAnalyzerService(memory, config);
}

/**
 * Create a RootCauseAnalyzerService instance with custom dependencies
 * Used for testing or when LLM integration is needed
 *
 * @param dependencies - All service dependencies including optional LLM router
 * @param config - Optional configuration overrides
 * @returns Configured RootCauseAnalyzerService instance
 */
export function createRootCauseAnalyzerServiceWithDependencies(
  dependencies: RootCauseAnalyzerDependencies,
  config: Partial<RootCauseAnalyzerConfig> = {}
): RootCauseAnalyzerService {
  return new RootCauseAnalyzerService(dependencies, config);
}
