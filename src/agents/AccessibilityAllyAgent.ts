/**
 * AccessibilityAllyAgent - Intelligent Accessibility Testing Agent
 *
 * Provides comprehensive WCAG 2.2 compliance testing with context-aware
 * remediation recommendations, intelligent ARIA suggestions, and
 * AI-powered video analysis for accessibility.
 *
 * Key Capabilities:
 * - WCAG 2.2 Level A, AA, AAA validation using axe-core
 * - Context-aware ARIA label generation based on element semantics
 * - Intelligent remediation suggestions with code examples
 * - Keyboard navigation and screen reader testing
 * - Color contrast optimization with specific fix recommendations
 * - AI video analysis with multi-provider cascade (OpenAI > Anthropic > Ollama > moondream)
 * - WebVTT caption generation for videos
 * - EN 301 549 EU compliance mapping
 * - ARIA Authoring Practices Guide (APG) pattern suggestions
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { BaseAgent, BaseAgentConfig } from './BaseAgent';
import {
  QETask,
  AgentCapability,
  QEAgentType,
  AgentContext,
  MemoryStore
} from '../types';
import { EventEmitter } from 'events';

/**
 * Configuration for AccessibilityAllyAgent
 */
export interface AccessibilityAllyConfig extends BaseAgentConfig {
  /** WCAG level to test against */
  wcagLevel?: 'A' | 'AA' | 'AAA';
  /** Enable vision API for video analysis */
  enableVisionAPI?: boolean;
  /** Preferred vision provider */
  visionProvider?: 'ollama' | 'anthropic' | 'openai';
  /** Ollama server URL */
  ollamaBaseUrl?: string;
  /** Ollama vision model */
  ollamaModel?: string;
  /** Enable context-aware remediation */
  contextAwareRemediation?: boolean;
  /** Generate HTML reports */
  generateHTMLReport?: boolean;
  /** Generate Markdown reports */
  generateMarkdownReport?: boolean;
  /** Thresholds for compliance scoring */
  thresholds?: {
    minComplianceScore?: number;
    maxCriticalViolations?: number;
    maxSeriousViolations?: number;
  };
  /** EU compliance settings */
  euCompliance?: {
    enabled?: boolean;
    en301549Mapping?: boolean;
    euAccessibilityAct?: boolean;
  };
}

/**
 * Task types supported by AccessibilityAllyAgent
 */
export type AccessibilityTaskType =
  | 'scan'
  | 'scan-comprehensive'
  | 'generate-remediations'
  | 'analyze-video'
  | 'generate-webvtt'
  | 'check-compliance'
  | 'analyze-keyboard-nav'
  | 'generate-aria-labels';

/**
 * Result of an accessibility scan
 */
export interface AccessibilityScanTaskResult {
  scanId: string;
  url: string;
  compliance: {
    status: 'compliant' | 'partially-compliant' | 'non-compliant';
    score: number;
    level: string;
    productionReady: boolean;
  };
  violations: {
    total: number;
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    details: unknown[];
  };
  remediations?: unknown[];
  performance: {
    scanTime: number;
    elementsAnalyzed: number;
  };
  reportPath?: string;
}

/**
 * Represents an accessibility violation found during scanning
 */
interface AccessibilityViolation {
  id: string;
  impact?: 'minor' | 'moderate' | 'serious' | 'critical';
  description?: string;
  help?: string;
  helpUrl?: string;
  wcagCriterion?: string;
  severity?: 'minor' | 'moderate' | 'serious' | 'critical';
  elements?: Array<{
    html?: string;
    target?: string[];
    failureSummary?: string;
  }>;
  nodes?: Array<{
    html: string;
    target: string[];
    failureSummary?: string;
  }>;
}

/**
 * Represents an element requiring ARIA label generation
 */
interface AccessibilityElement {
  tagName: string;
  role?: string;
  attributes?: Record<string, string>;
  textContent?: string;
  accessibleName?: string;
  context?: string;
  issues?: string[];
}

/**
 * Payload interfaces for different task types
 */
interface ScanPayload {
  url?: string;
  target?: string;
  level?: 'A' | 'AA' | 'AAA';
  options?: Record<string, unknown>;
}

interface RemediationsPayload {
  violations?: AccessibilityViolation[];
}

interface VideoPayload {
  url?: string;
  videoUrl?: string;
}

interface WebVTTPayload {
  frameDescriptions?: Array<{ timestamp: number; description: string }>;
}

interface CompliancePayload {
  scanResult?: AccessibilityScanTaskResult;
}

interface KeyboardNavPayload {
  url?: string;
}

interface AriaLabelsPayload {
  elements?: AccessibilityElement[];
}

/** Type guard for payload types */
function isPayloadWithProperty<K extends string>(
  payload: unknown,
  key: K
): payload is Record<K, unknown> {
  return typeof payload === 'object' && payload !== null && key in payload;
}

// Simple logger interface
interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

class ConsoleLogger implements Logger {
  info(message: string, ...args: unknown[]): void {
    console.log(`[A11Y-ALLY] [INFO] ${message}`, ...args);
  }
  warn(message: string, ...args: unknown[]): void {
    console.warn(`[A11Y-ALLY] [WARN] ${message}`, ...args);
  }
  error(message: string, ...args: unknown[]): void {
    console.error(`[A11Y-ALLY] [ERROR] ${message}`, ...args);
  }
  debug(message: string, ...args: unknown[]): void {
    console.debug(`[A11Y-ALLY] [DEBUG] ${message}`, ...args);
  }
}

/**
 * AccessibilityAllyAgent - Intelligent accessibility testing with context-aware remediation
 */
export class AccessibilityAllyAgent extends BaseAgent {
  private readonly agentConfig: AccessibilityAllyConfig;
  protected readonly logger: Logger = new ConsoleLogger();

  constructor(
    config: AccessibilityAllyConfig & {
      context: AgentContext;
      memoryStore: MemoryStore;
      eventBus: EventEmitter;
    }
  ) {
    const baseConfig: BaseAgentConfig = {
      type: QEAgentType.ACCESSIBILITY_ALLY,
      capabilities: AccessibilityAllyAgent.getDefaultCapabilities(),
      context: config.context,
      memoryStore: config.memoryStore,
      eventBus: config.eventBus,
      enableLearning: true
    };

    super(baseConfig);

    this.agentConfig = {
      wcagLevel: config.wcagLevel || 'AA',
      enableVisionAPI: config.enableVisionAPI ?? true,
      visionProvider: config.visionProvider || 'ollama',
      ollamaBaseUrl: config.ollamaBaseUrl || 'http://localhost:11434',
      ollamaModel: config.ollamaModel || 'llava',
      contextAwareRemediation: config.contextAwareRemediation ?? true,
      generateHTMLReport: config.generateHTMLReport ?? false,
      generateMarkdownReport: config.generateMarkdownReport ?? true,
      thresholds: config.thresholds || {
        minComplianceScore: 85,
        maxCriticalViolations: 0,
        maxSeriousViolations: 3
      },
      euCompliance: config.euCompliance || {
        enabled: true,
        en301549Mapping: true,
        euAccessibilityAct: true
      },
      ...config
    };
  }

  /**
   * Get default capabilities for AccessibilityAllyAgent
   */
  static getDefaultCapabilities(): AgentCapability[] {
    return [
      {
        name: 'wcag-2.2-validation',
        version: '1.0.0',
        description: 'Comprehensive WCAG 2.2 compliance testing (Level A, AA, AAA)'
      },
      {
        name: 'context-aware-remediation',
        version: '1.0.0',
        description:
          'Intelligent remediation suggestions with context-specific code examples'
      },
      {
        name: 'aria-intelligence',
        version: '1.0.0',
        description:
          'Smart ARIA label generation based on element semantics and context'
      },
      {
        name: 'video-accessibility-analysis',
        version: '1.0.0',
        description:
          'AI-powered video analysis with multi-provider cascade (FREE with Ollama)'
      },
      {
        name: 'webvtt-generation',
        version: '1.0.0',
        description:
          'Automatic WebVTT caption file generation with detailed scene descriptions'
      },
      {
        name: 'en301549-compliance',
        version: '1.0.0',
        description: 'EN 301 549 EU accessibility standard compliance mapping'
      },
      {
        name: 'apg-pattern-suggestions',
        version: '1.0.0',
        description:
          'ARIA Authoring Practices Guide pattern recommendations'
      },
      {
        name: 'keyboard-navigation-testing',
        version: '1.0.0',
        description: 'Keyboard navigation path validation and focus management'
      },
      {
        name: 'color-contrast-optimization',
        version: '1.0.0',
        description:
          'Color contrast analysis with specific fix recommendations'
      },
      {
        name: 'learning-integration',
        version: '1.0.0',
        description:
          'Learn from remediation feedback to improve future recommendations'
      }
    ];
  }

  /**
   * Initialize agent-specific components
   */
  protected async initializeComponents(): Promise<void> {
    this.logger.info(
      `AccessibilityAllyAgent initializing with WCAG Level ${this.agentConfig.wcagLevel}`
    );
    this.logger.info(
      `Vision API: ${this.agentConfig.enableVisionAPI ? 'enabled' : 'disabled'} (provider: ${this.agentConfig.visionProvider})`
    );
  }

  /**
   * Load domain knowledge for accessibility testing
   */
  protected async loadKnowledge(): Promise<void> {
    this.logger.debug('Loading accessibility testing knowledge base');
    // Knowledge is primarily loaded via the accessibility-testing skill
    // and the embedded axe-core rules
  }

  /**
   * Perform the actual accessibility task
   */
  protected async performTask(task: QETask): Promise<unknown> {
    const taskType = task.type as AccessibilityTaskType;

    this.logger.info(`Performing accessibility task: ${taskType}`);

    try {
      switch (taskType) {
        case 'scan':
        case 'scan-comprehensive':
          return await this.executeScan(task);

        case 'generate-remediations':
          return await this.generateRemediations(task);

        case 'analyze-video':
          return await this.analyzeVideo(task);

        case 'generate-webvtt':
          return await this.generateWebVTT(task);

        case 'check-compliance':
          return await this.checkCompliance(task);

        case 'analyze-keyboard-nav':
          return await this.analyzeKeyboardNavigation(task);

        case 'generate-aria-labels':
          return await this.generateAriaLabels(task);

        default:
          // Default to comprehensive scan
          return await this.executeScan(task);
      }
    } catch (error) {
      this.logger.error(`Task ${taskType} failed:`, error);
      throw error;
    }
  }

  /**
   * Cleanup agent resources
   */
  protected async cleanup(): Promise<void> {
    this.logger.info('Cleaning up AccessibilityAllyAgent resources');
    // No specific cleanup needed for this agent
  }

  /**
   * Execute a comprehensive accessibility scan
   */
  private async executeScan(task: QETask): Promise<AccessibilityScanTaskResult> {
    const payload = (task.payload || {}) as ScanPayload;
    const url = payload.url || payload.target;

    if (!url) {
      throw new Error('URL is required for accessibility scan');
    }

    this.logger.info(`Starting comprehensive scan for: ${url}`);

    // Import the scan function dynamically to avoid circular dependencies
    const { scanComprehensive } = await import(
      '../mcp/tools/qe/accessibility/scan-comprehensive.js'
    );

    const result = await scanComprehensive({
      url,
      level: (payload.level as 'A' | 'AA' | 'AAA') || this.agentConfig.wcagLevel || 'AA',
      options: {
        includeContext: this.agentConfig.contextAwareRemediation,
        generateMarkdownReport: this.agentConfig.generateMarkdownReport,
        generateHTMLReport: this.agentConfig.generateHTMLReport,
        enableVisionAPI: this.agentConfig.enableVisionAPI,
        visionProvider: this.agentConfig.visionProvider as 'ollama' | 'anthropic',
        ollamaBaseUrl: this.agentConfig.ollamaBaseUrl,
        ollamaModel: this.agentConfig.ollamaModel,
        ...payload.options
      }
    });

    // Extract data from QEToolResponse
    const data = result.data;

    // Store results in memory for learning
    if (this.memoryStore && data) {
      await this.memoryStore.store(
        `aqe/accessibility/scan-results/${data.scanId || 'unknown'}`,
        {
          timestamp: Date.now(),
          url,
          compliance: data.compliance,
          violationCount: data.summary?.total || 0
        }
      );
    }

    return {
      scanId: data?.scanId || 'unknown',
      url,
      compliance: data?.compliance || {
        status: 'non-compliant',
        score: 0,
        level: this.agentConfig.wcagLevel || 'AA',
        productionReady: false
      },
      violations: {
        total: data?.summary?.total || 0,
        critical: data?.summary?.critical || 0,
        serious: data?.summary?.serious || 0,
        moderate: data?.summary?.moderate || 0,
        minor: data?.summary?.minor || 0,
        details: data?.violations || []
      },
      remediations: data?.remediations,
      performance: data?.performance || {
        scanTime: 0,
        elementsAnalyzed: 0
      },
      reportPath: data?.htmlReportPath
    };
  }

  /**
   * Generate context-aware remediations for violations
   */
  private async generateRemediations(task: QETask): Promise<unknown> {
    const payload = (task.payload || {}) as RemediationsPayload;
    const violations = payload.violations || [];

    this.logger.info(`Generating remediations for ${violations.length} violations`);

    // Generate remediations based on violation patterns
    const remediations = violations.map((violation: AccessibilityViolation) => ({
      violationId: violation.id,
      wcagCriterion: violation.wcagCriterion,
      recommendation: this.getRemediationRecommendation(violation),
      codeExample: this.generateCodeExample(violation),
      effort: this.estimateRemediationEffort(violation)
    }));

    return {
      success: true,
      remediationsGenerated: remediations.length,
      remediations
    };
  }

  /**
   * Get remediation recommendation for a violation
   */
  private getRemediationRecommendation(violation: AccessibilityViolation): string {
    const recommendations: Record<string, string> = {
      'color-contrast': 'Increase the color contrast ratio to meet WCAG requirements',
      'label': 'Add a visible label or aria-label to the form control',
      'image-alt': 'Add descriptive alt text that conveys the image content',
      'link-name': 'Add descriptive text content or aria-label to the link',
      'button-name': 'Add visible text content or aria-label to the button'
    };
    return recommendations[violation.id] || 'Review and fix the accessibility issue';
  }

  /**
   * Generate code example for fixing a violation
   */
  private generateCodeExample(violation: AccessibilityViolation): string {
    // Simple code example generation
    if (violation.elements && violation.elements[0]) {
      const element = violation.elements[0];
      return `<!-- Current: ${element.html || 'N/A'} -->\n<!-- Recommended: Add appropriate ARIA attributes -->`;
    }
    return '<!-- See violation details for specific fix -->';
  }

  /**
   * Estimate remediation effort
   */
  private estimateRemediationEffort(violation: AccessibilityViolation): string {
    const effortMap: Record<string, string> = {
      critical: 'High - 2-4 hours',
      serious: 'Medium - 1-2 hours',
      moderate: 'Low - 30 minutes',
      minor: 'Trivial - 15 minutes'
    };
    return effortMap[violation.severity || 'moderate'] || 'Medium - 1 hour';
  }

  /**
   * Analyze video content for accessibility
   */
  private async analyzeVideo(task: QETask): Promise<unknown> {
    const payload = (task.payload || {}) as VideoPayload;
    const videoUrl = payload.url || payload.videoUrl;

    if (!videoUrl) {
      throw new Error('Video URL is required for video analysis');
    }

    this.logger.info(`Analyzing video: ${videoUrl}`);

    // Import video analyzer
    const { analyzeVideoWithVision } = await import(
      '../mcp/tools/qe/accessibility/video-vision-analyzer.js'
    );

    // Note: analyzeVideoWithVision expects frames, not URL directly
    // This is a simplified implementation that would need frame extraction first
    return {
      success: true,
      videoUrl,
      message: 'Video analysis requires frame extraction. Use scan-comprehensive with enableVisionAPI for full video analysis.',
      recommendation: 'Run a comprehensive scan with video analysis enabled to get detailed frame-by-frame descriptions'
    };
  }

  /**
   * Generate WebVTT caption file from video analysis
   */
  private async generateWebVTT(task: QETask): Promise<unknown> {
    const payload = (task.payload || {}) as WebVTTPayload;
    const frameDescriptions = payload.frameDescriptions || [];

    this.logger.info(`Generating WebVTT for ${frameDescriptions.length} frames`);

    // Import WebVTT generator
    const { generateWebVTT } = await import(
      '../mcp/tools/qe/accessibility/webvtt-generator.js'
    );

    // Convert frame descriptions to WebVTTFile format with cues
    const webvttFile = {
      cues: frameDescriptions.map((frame, index) => ({
        identifier: `cue-${index + 1}`,
        startTime: frame.timestamp,
        endTime: frame.timestamp + 5, // 5 second default duration
        text: frame.description
      }))
    };

    const webvtt = generateWebVTT(webvttFile);

    return {
      success: true,
      frameCount: frameDescriptions.length,
      webvtt
    };
  }

  /**
   * Check compliance status against thresholds
   */
  private async checkCompliance(task: QETask): Promise<unknown> {
    const payload = (task.payload || {}) as CompliancePayload;
    const scanResult = payload.scanResult;

    if (!scanResult) {
      throw new Error('Scan result is required for compliance check');
    }

    const thresholds = this.agentConfig.thresholds || {};
    const minScore = thresholds.minComplianceScore || 85;
    const maxCritical = thresholds.maxCriticalViolations || 0;
    const maxSerious = thresholds.maxSeriousViolations || 3;

    const score = scanResult.compliance?.score || 0;
    const critical = scanResult.violations?.critical || 0;
    const serious = scanResult.violations?.serious || 0;

    const passes =
      score >= minScore && critical <= maxCritical && serious <= maxSerious;

    return {
      success: true,
      passes,
      details: {
        score: { actual: score, required: minScore, passes: score >= minScore },
        criticalViolations: {
          actual: critical,
          maxAllowed: maxCritical,
          passes: critical <= maxCritical
        },
        seriousViolations: {
          actual: serious,
          maxAllowed: maxSerious,
          passes: serious <= maxSerious
        }
      },
      recommendation: passes
        ? 'Application meets accessibility compliance thresholds'
        : 'Application does not meet accessibility compliance thresholds - remediation required'
    };
  }

  /**
   * Analyze keyboard navigation paths
   */
  private async analyzeKeyboardNavigation(task: QETask): Promise<unknown> {
    const payload = (task.payload || {}) as KeyboardNavPayload;
    const url = payload.url;

    if (!url) {
      throw new Error('URL is required for keyboard navigation analysis');
    }

    this.logger.info(`Analyzing keyboard navigation for: ${url}`);

    // This would use Playwright to test keyboard navigation
    // For now, return a placeholder indicating the capability
    return {
      success: true,
      url,
      analysis: {
        focusOrder: 'Analysis pending - requires Playwright browser automation',
        keyboardTraps: [],
        skipLinks: [],
        focusIndicators: []
      },
      message:
        'Full keyboard navigation analysis available via scan-comprehensive with keyboard option'
    };
  }

  /**
   * Generate intelligent ARIA labels for elements
   */
  private async generateAriaLabels(task: QETask): Promise<unknown> {
    const payload = (task.payload || {}) as AriaLabelsPayload;
    const elements = payload.elements || [];

    this.logger.info(`Generating ARIA labels for ${elements.length} elements`);

    // Import AccName computation
    const { generateAccessibleNameRecommendation } = await import(
      '../mcp/tools/qe/accessibility/accname-computation.js'
    );

    const recommendations = elements.map((element: AccessibilityElement) => {
      // Create computation object from element data
      const computation = {
        accessibleName: element.accessibleName || '',
        source: { type: 'none' as const, value: '', priority: 999, recommended: false },
        allSources: [],
        sufficient: false,
        quality: 0,
        issues: [],
        trace: []
      };
      // Pass computation and element info to the function
      return generateAccessibleNameRecommendation(computation, {
        tagName: element.tagName || 'unknown',
        role: element.role,
        attributes: element.attributes || {},
        context: element.context
      });
    });

    return {
      success: true,
      elementCount: elements.length,
      recommendations
    };
  }
}

export default AccessibilityAllyAgent;
