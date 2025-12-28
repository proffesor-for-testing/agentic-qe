/**
 * Product Factors Assessment Agent
 *
 * An intelligent assessment agent that analyzes user stories and technical architecture
 * to generate comprehensive test ideas based on the Product Factors (SFDIPOT) framework
 * from James Bach's Heuristic Test Strategy Model (HTSM).
 *
 * LLM Integration: Extends BaseAgent to use inherited LLM capabilities (this.llmComplete())
 * for generating context-aware clarifying questions specific to the input document content.
 */

import { DocumentParser, documentParser } from './parsers/document-parser';
import { HTSMAnalyzer, htsmAnalyzer } from './analyzers/htsm-analyzer';
import { TestCaseGenerator, testCaseGenerator } from './generators/test-case-generator';
import { GherkinFormatter, gherkinFormatter } from './formatters/gherkin-formatter';

// BaseAgent integration for LLM capabilities
import { BaseAgent, BaseAgentConfig } from '../BaseAgent';
import {
  QETask,
  AgentCapability,
  QEAgentType,
  AgentContext,
  MemoryStore,
} from '../../types';
import { EventEmitter } from 'events';
import {
  UserStory,
  Epic,
  FunctionalSpec,
  TechnicalArchitecture,
  TestCase,
  TestSuite,
  HTSMCategory,
  HTSMAnalysisResult,
  TestableElement,
  TestOpportunity,
} from './types/htsm.types';
// Lazy import for Code Intelligence to avoid breaking main assessor if dependencies missing
type CodeIntelligenceIntegrationType = import('./integrations/code-intelligence-integration').CodeIntelligenceIntegration;
type CodeIntelligenceConfigType = import('./integrations/code-intelligence-integration').CodeIntelligenceConfig;
type CodeIntelligenceResultType = import('./integrations/code-intelligence-integration').CodeIntelligenceResult;

// Re-export types for external use
export type CodeIntelligenceConfig = CodeIntelligenceConfigType;
export type CodeIntelligenceResult = CodeIntelligenceResultType;

export interface ProductFactorsAssessmentInput {
  userStories?: string | UserStory[];
  epics?: string | Epic[];
  functionalSpecs?: string | FunctionalSpec[];
  architecture?: string | TechnicalArchitecture;
  outputFormat?: 'gherkin' | 'json' | 'markdown' | 'html' | 'all';
  includeCategories?: HTSMCategory[];
  /** Name/title for the assessment (e.g., "Epic3-Premium-Membership") */
  assessmentName?: string;

  // Code Intelligence Integration
  /** Root directory of codebase to auto-analyze (enables Code Intelligence) */
  codebaseRootDir?: string;
  /** Code Intelligence configuration options */
  codeIntelligenceConfig?: Partial<CodeIntelligenceConfig>;
  /** Include C4 diagrams in output (default: true when codebaseRootDir is set) */
  includeC4Diagrams?: boolean;

}

export interface ProductFactorsAssessmentOutput {
  testSuite: TestSuite;
  gherkinFeatures?: Map<string, string>;
  jsonOutput?: string;
  markdownOutput?: string;
  htmlOutput?: string;
  htsmAnalysis: Map<HTSMCategory, HTSMAnalysisResult>;
  testableElements: TestableElement[];
  summary: {
    totalTests: number;
    byCategory: Record<HTSMCategory, number>;
    byPriority: Record<string, number>;
    coverageScore: number;
    traceabilityScore: number;
  };
  /** Assessment name for output file naming */
  assessmentName: string;

  // Code Intelligence outputs
  /** C4 Context diagram (Mermaid syntax) */
  c4ContextDiagram?: string;
  /** C4 Container diagram (Mermaid syntax) */
  c4ContainerDiagram?: string;
  /** C4 Component diagram (Mermaid syntax) */
  c4ComponentDiagram?: string;
  /** Code Intelligence analysis result */
  codeIntelligenceResult?: CodeIntelligenceResult;
}

/**
 * Configuration for ProductFactorsAssessmentAgent
 */
export interface ProductFactorsAssessmentConfig extends Omit<BaseAgentConfig, 'type' | 'capabilities'> {
  /** Override default capabilities */
  capabilities?: AgentCapability[];
  /** Enable storing assessment results in memory for learning */
  storeResults?: boolean;
}

/**
 * Task types supported by ProductFactorsAssessment
 */
export type ProductFactorsTaskType =
  | 'assess'              // Full SFDIPOT assessment
  | 'analyze-htsm'        // HTSM analysis only
  | 'generate-questions'  // Generate clarifying questions only
  | 'generate-gherkin'    // Generate Gherkin features only
  | 'analyze-codebase';   // Code Intelligence analysis only

/**
 * Simple logger interface for consistent logging
 */
interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

class ConsoleLogger implements Logger {
  private prefix = '[ProductFactorsAssessment]';
  info(message: string, ...args: unknown[]): void {
    console.log(`${this.prefix} [INFO] ${message}`, ...args);
  }
  warn(message: string, ...args: unknown[]): void {
    console.warn(`${this.prefix} [WARN] ${message}`, ...args);
  }
  error(message: string, ...args: unknown[]): void {
    console.error(`${this.prefix} [ERROR] ${message}`, ...args);
  }
  debug(message: string, ...args: unknown[]): void {
    if (process.env.DEBUG) {
      console.debug(`${this.prefix} [DEBUG] ${message}`, ...args);
    }
  }
}

/**
 * ProductFactorsAssessment - Extends BaseAgent for LLM capabilities
 *
 * Uses inherited this.llmComplete() for generating context-aware clarifying questions
 * that are specific to the input document content rather than generic templates.
 *
 * Key Features:
 * - HTSM v6.3 Product Factors (SFDIPOT) analysis
 * - LLM-powered context-aware clarifying questions
 * - Memory store integration for learning from assessments
 * - Multiple task types for flexible usage
 */
export class ProductFactorsAssessment extends BaseAgent {
  private parser: DocumentParser;
  private htsmAnalyzer: HTSMAnalyzer;
  private testGenerator: TestCaseGenerator;
  private gherkinFormatter: GherkinFormatter;
  protected readonly logger: Logger = new ConsoleLogger();

  // Store raw input content for LLM context
  private rawInputContent: string = '';

  // Configuration
  private readonly storeResults: boolean;

  constructor(config: ProductFactorsAssessmentConfig) {
    const baseConfig: BaseAgentConfig = {
      type: QEAgentType.PRODUCT_FACTORS_ASSESSOR,
      capabilities: config.capabilities || ProductFactorsAssessment.getDefaultCapabilities(),
      memoryStore: config.memoryStore,
      eventBus: config.eventBus,
      context: config.context,
      enableLearning: config.enableLearning ?? true,
      // Enable LLM for intelligent question generation
      llm: {
        enabled: true,
        preferredProvider: 'claude',
        ...config.llm,
      },
    };

    super(baseConfig);

    this.parser = documentParser;
    this.htsmAnalyzer = htsmAnalyzer;
    this.testGenerator = testCaseGenerator;
    this.gherkinFormatter = gherkinFormatter;
    this.storeResults = config.storeResults ?? true;
  }

  /**
   * Get default capabilities for ProductFactorsAssessment
   */
  static getDefaultCapabilities(): AgentCapability[] {
    return [
      {
        name: 'htsm-analysis',
        version: '6.3.0',
        description: 'Heuristic Test Strategy Model v6.3 (James Bach) analysis',
      },
      {
        name: 'sfdipot-coverage',
        version: '1.0.0',
        description: 'SFDIPOT Product Factors test idea generation',
      },
      {
        name: 'gherkin-generation',
        version: '1.0.0',
        description: 'Generate BDD/Gherkin feature files from test ideas',
      },
      {
        name: 'clarifying-questions',
        version: '1.0.0',
        description: 'LLM-powered context-aware clarifying questions for coverage gaps',
      },
      {
        name: 'code-intelligence-integration',
        version: '1.0.0',
        description: 'C4 diagram generation and architecture analysis',
      },
    ];
  }

  // === BaseAgent Abstract Method Implementations ===

  protected async initializeComponents(): Promise<void> {
    this.logger.info('Initializing components...');
    this.logger.debug(`LLM available: ${this.hasLLM()}`);
    this.logger.debug(`Learning enabled: ${this.storeResults}`);
  }

  protected async loadKnowledge(): Promise<void> {
    this.logger.debug('Loading HTSM v6.3 knowledge base...');
    // HTSM knowledge is embedded in the analyzer
  }

  protected async cleanup(): Promise<void> {
    this.logger.info('Cleaning up resources...');
    this.rawInputContent = '';
  }

  /**
   * Perform task based on task type
   * Supports multiple task types for flexible usage
   */
  protected async performTask(task: QETask): Promise<unknown> {
    const taskType = (task.type as ProductFactorsTaskType) || 'assess';
    const input = task.payload as ProductFactorsAssessmentInput;

    this.logger.info(`Performing task: ${taskType}`);

    try {
      switch (taskType) {
        case 'assess':
          return await this.assess(input);

        case 'analyze-htsm':
          return await this.analyzeHTSM(input);

        case 'generate-questions':
          return await this.generateQuestionsOnly(input);

        case 'generate-gherkin':
          return await this.generateGherkinOnly(input);

        case 'analyze-codebase':
          return await this.analyzeCodebaseOnly(input);

        default:
          // Default to full assessment
          return await this.assess(input);
      }
    } catch (error) {
      this.logger.error(`Task ${taskType} failed:`, error);
      throw error;
    }
  }

  /**
   * HTSM analysis only (without full report generation)
   */
  private async analyzeHTSM(input: ProductFactorsAssessmentInput): Promise<Map<HTSMCategory, HTSMAnalysisResult>> {
    this.logger.info('Running HTSM analysis only...');
    const userStories = this.parseUserStories(input.userStories);
    const specs = this.parseFunctionalSpecs(input.functionalSpecs);
    const architecture = this.parseArchitecture(input.architecture);

    const testableElements = this.parser.extractTestableElements(userStories, specs, architecture);
    return this.htsmAnalyzer.analyzeAll(testableElements, userStories, specs, architecture);
  }

  /**
   * Generate clarifying questions only
   */
  private async generateQuestionsOnly(input: ProductFactorsAssessmentInput): Promise<Map<HTSMCategory, unknown>> {
    this.logger.info('Generating clarifying questions only...');
    this.rawInputContent = this.extractRawInputContent(input);

    const htsmAnalysis = await this.analyzeHTSM(input);
    const userStories = this.parseUserStories(input.userStories);
    const questions = new Map<HTSMCategory, unknown>();

    for (const [category, analysis] of htsmAnalysis) {
      const categoryTests = analysis.testOpportunities || [];
      const result = await this.generateClarifyingQuestions(category, categoryTests, userStories);
      questions.set(category, result);
    }

    return questions;
  }

  /**
   * Generate Gherkin features only
   */
  private async generateGherkinOnly(input: ProductFactorsAssessmentInput): Promise<Map<string, string>> {
    this.logger.info('Generating Gherkin features only...');
    const userStories = this.parseUserStories(input.userStories);
    const htsmAnalysis = await this.analyzeHTSM(input);

    // Pass LLM context to test generator for intelligent test ideas
    if (this.hasLLM() && this.rawInputContent) {
      this.testGenerator.setLLMContext({
        generateResponse: (prompt: string) => this.llmComplete(prompt),
        rawInputContent: this.rawInputContent,
      });
    }

    const testCases = await this.testGenerator.generateFromAnalysis(htsmAnalysis, userStories);
    const testSuite = this.testGenerator.createTestSuite('SFDIPOT Test Suite', testCases, userStories);
    return this.gherkinFormatter.formatTestSuite(testSuite, userStories);
  }

  /**
   * Analyze codebase only (Code Intelligence)
   */
  private async analyzeCodebaseOnly(input: ProductFactorsAssessmentInput): Promise<CodeIntelligenceResult | undefined> {
    if (!input.codebaseRootDir) {
      this.logger.warn('No codebase path provided for analysis');
      return undefined;
    }

    this.logger.info(`Analyzing codebase: ${input.codebaseRootDir}`);
    try {
      const { CodeIntelligenceIntegration } = await import('./integrations/code-intelligence-integration');
      const ciIntegration = new CodeIntelligenceIntegration({
        rootDir: input.codebaseRootDir,
        generateC4Diagrams: input.includeC4Diagrams !== false,
        ...input.codeIntelligenceConfig,
      });
      return await ciIntegration.analyze();
    } catch (error) {
      this.logger.error('Code Intelligence analysis failed:', error);
      throw error;
    }
  }

  /**
   * Main entry point - generate Product Factors assessment from input documents
   * Note: LLM is automatically initialized by BaseAgent if configured
   */
  async assess(input: ProductFactorsAssessmentInput): Promise<ProductFactorsAssessmentOutput> {
    const startTime = Date.now();
    this.logger.info(`Starting assessment: ${input.assessmentName || 'unnamed'}`);

    // Store raw input content for LLM context
    this.rawInputContent = this.extractRawInputContent(input);

    // Phase 0: Code Intelligence analysis (if codebase provided)
    let codeIntelligenceResult: CodeIntelligenceResult | undefined;
    let derivedArchitecture: TechnicalArchitecture | undefined;

    if (input.codebaseRootDir) {
      this.logger.info('Running Code Intelligence analysis...');
      try {
        // Dynamic import to avoid breaking main assessor if Code Intelligence dependencies are missing
        const { CodeIntelligenceIntegration } = await import('./integrations/code-intelligence-integration');
        const ciIntegration = new CodeIntelligenceIntegration({
          rootDir: input.codebaseRootDir,
          generateC4Diagrams: input.includeC4Diagrams !== false,
          ...input.codeIntelligenceConfig,
        });

        codeIntelligenceResult = await ciIntegration.analyze();
        derivedArchitecture = codeIntelligenceResult.architecture;
        this.logger.info(`Code Intelligence: ${codeIntelligenceResult.componentAnalysis.components.length} components, ${codeIntelligenceResult.externalSystems.length} external systems`);
      } catch (error) {
        this.logger.warn('Code Intelligence analysis failed:', error);
      }
    }

    // Phase 1: Parse documents
    const userStories = this.parseUserStories(input.userStories);
    const specs = this.parseFunctionalSpecs(input.functionalSpecs);
    // Use Code Intelligence-derived architecture if available, otherwise parse from input
    const architecture = derivedArchitecture || this.parseArchitecture(input.architecture);

    // Phase 2: Extract testable elements
    const testableElements = this.parser.extractTestableElements(
      userStories,
      specs,
      architecture
    );

    // Phase 3: Perform HTSM analysis
    const htsmAnalysis = this.htsmAnalyzer.analyzeAll(
      testableElements,
      userStories,
      specs,
      architecture
    );

    // Filter by requested categories if specified
    if (input.includeCategories && input.includeCategories.length > 0) {
      const filteredAnalysis = new Map<HTSMCategory, HTSMAnalysisResult>();
      input.includeCategories.forEach((cat) => {
        const result = htsmAnalysis.get(cat);
        if (result) filteredAnalysis.set(cat, result);
      });
    }

    // Phase 4: Generate test cases (LLM-powered with SFDIPOT guidance)
    // Pass LLM context to test generator for domain-specific test ideas
    if (this.hasLLM() && this.rawInputContent) {
      this.testGenerator.setLLMContext({
        generateResponse: (prompt: string) => this.llmComplete(prompt),
        rawInputContent: this.rawInputContent,
      });
    }

    const testCases = await this.testGenerator.generateFromAnalysis(htsmAnalysis, userStories);

    // Phase 5: Create test suite
    const testSuite = this.testGenerator.createTestSuite(
      `Product Factors (SFDIPOT) based Test Ideas - ${new Date().toISOString().split('T')[0]}`,
      testCases,
      userStories
    );

    // Determine assessment name from input or generate from context
    const assessmentName = input.assessmentName || this.generateAssessmentName(userStories);

    // Phase 6: Format outputs
    const output: ProductFactorsAssessmentOutput = {
      testSuite,
      htsmAnalysis,
      testableElements,
      summary: this.createSummary(testCases, testSuite),
      assessmentName,
    };

    // Add Code Intelligence results if available
    if (codeIntelligenceResult) {
      output.codeIntelligenceResult = codeIntelligenceResult;
      output.c4ContextDiagram = codeIntelligenceResult.c4ContextDiagram;
      output.c4ContainerDiagram = codeIntelligenceResult.c4ContainerDiagram;
      output.c4ComponentDiagram = codeIntelligenceResult.c4ComponentDiagram;
    }

    const format = input.outputFormat || 'all';

    if (format === 'gherkin' || format === 'all') {
      output.gherkinFeatures = this.gherkinFormatter.formatTestSuite(testSuite, userStories);
    }

    if (format === 'json' || format === 'all') {
      output.jsonOutput = JSON.stringify(testSuite, null, 2);
    }

    if (format === 'markdown' || format === 'all') {
      output.markdownOutput = await this.formatAsMarkdown(testSuite, htsmAnalysis, userStories, assessmentName);
    }

    if (format === 'html' || format === 'all') {
      output.htmlOutput = await this.formatAsHTML(testSuite, htsmAnalysis, userStories, assessmentName, codeIntelligenceResult);
    }

    // Store results in memory for learning (if enabled)
    if (this.storeResults && this.memoryStore) {
      try {
        const assessmentId = `pfa-${Date.now()}`;
        await this.memoryStore.store(
          `aqe/product-factors/assessments/${assessmentId}`,
          {
            timestamp: Date.now(),
            assessmentName,
            totalTests: output.summary.totalTests,
            coverageScore: output.summary.coverageScore,
            traceabilityScore: output.summary.traceabilityScore,
            byCategory: output.summary.byCategory,
            byPriority: output.summary.byPriority,
            hasCodeIntelligence: !!codeIntelligenceResult,
            llmEnabled: this.hasLLM(),
          }
        );
        this.logger.debug(`Assessment results stored: ${assessmentId}`);
      } catch (error) {
        this.logger.warn('Failed to store assessment results in memory:', error);
      }
    }

    const duration = Date.now() - startTime;
    this.logger.info(`Assessment complete: ${output.summary.totalTests} tests in ${duration}ms`);

    return output;
  }

  /**
   * Generate assessment name from user stories context
   */
  private generateAssessmentName(userStories: UserStory[]): string {
    if (userStories.length === 0) return 'Assessment';

    // Try to extract epic name from first story
    const firstStory = userStories[0];
    if (firstStory.epicId) {
      // Convert to kebab-case title
      const epicPart = firstStory.epicId.replace(/[^a-zA-Z0-9]+/g, '-');
      return epicPart;
    }

    // Fall back to first story title
    const titlePart = firstStory.title
      .replace(/[^a-zA-Z0-9\s]+/g, '')
      .split(/\s+/)
      .slice(0, 4)
      .join('-');
    return titlePart || 'Assessment';
  }

  // ============================================
  // LLM Integration Methods (using inherited BaseAgent capabilities)
  // ============================================

  /**
   * Extract raw input content for LLM context
   */
  private extractRawInputContent(input: ProductFactorsAssessmentInput): string {
    const parts: string[] = [];

    if (typeof input.userStories === 'string') {
      parts.push(input.userStories);
    } else if (Array.isArray(input.userStories)) {
      input.userStories.forEach(story => {
        parts.push(`User Story: ${story.title}`);
        parts.push(`As a ${story.asA}, I want ${story.iWant}, so that ${story.soThat}`);
        if (story.acceptanceCriteria?.length) {
          parts.push('Acceptance Criteria: ' + story.acceptanceCriteria.map(ac => ac.description).join('; '));
        }
      });
    }

    if (typeof input.functionalSpecs === 'string') {
      parts.push(input.functionalSpecs);
    }

    if (typeof input.epics === 'string') {
      parts.push(input.epics);
    }

    return parts.join('\n\n');
  }

  /**
   * Generate clarifying questions using inherited LLM based on actual input content
   * This produces context-aware questions specific to the document, not generic templates
   * Uses BaseAgent's this.llmComplete() method
   */
  private async generateClarifyingQuestionsWithLLM(
    category: HTSMCategory,
    subcategory: string,
    subcategoryDefinition: string,
    testCount: number
  ): Promise<{ rationale: string; questions: string[] }> {
    // Use inherited LLM check from BaseAgent
    if (!this.hasLLM() || !this.rawInputContent) {
      // Fall back to empty - caller should use template fallback
      return { rationale: '', questions: [] };
    }

    const prompt = `You are a quality engineering expert analyzing requirements for test coverage gaps.

## Input Document Content:
${this.rawInputContent.slice(0, 4000)}

## HTSM Product Factor Category: ${category}
## Subcategory: ${subcategory}
## Subcategory Definition (from James Bach's HTSM v6.3):
${subcategoryDefinition}

## Current Test Coverage:
This subcategory has ${testCount} test ideas generated. ${testCount === 0 ? 'No tests cover this area.' : testCount < 3 ? 'Limited coverage exists.' : 'Some coverage exists.'}

## Task:
Based on the ACTUAL INPUT DOCUMENT above, generate clarifying questions that would help identify missing test scenarios for the "${subcategory}" subcategory.

CRITICAL: Your questions MUST be specifically about the topics, features, and concerns mentioned in the input document. Do NOT generate generic questions. Look at what the document actually discusses and ask questions relevant to that context.

For example:
- If the document is about WCAG accessibility, ask about screen readers, keyboard navigation, ARIA attributes
- If the document is about payment processing, ask about transactions, refunds, currency
- If the document is about user authentication, ask about login flows, password policies, MFA

## Response Format (JSON only, no markdown):
{
  "rationale": "One sentence explaining why this subcategory needs clarification in the context of the input document",
  "questions": ["Question 1 specific to input document", "Question 2 specific to input document", "Question 3 specific to input document"]
}`;

    try {
      // Use inherited llmComplete from BaseAgent
      const text = await this.llmComplete(prompt, {
        maxTokens: 500,
        temperature: 0.3, // Lower temperature for more focused responses
      });

      // Parse JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          rationale: parsed.rationale || '',
          questions: Array.isArray(parsed.questions) ? parsed.questions : [],
        };
      }
    } catch (error) {
      console.warn(`[ProductFactorsAssessment] LLM question generation failed for ${category}/${subcategory}:`, error);
    }

    return { rationale: '', questions: [] };
  }

  /**
   * Parse user stories from string or array
   */
  private parseUserStories(input?: string | UserStory[]): UserStory[] {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    return this.parser.parseUserStories(input);
  }

  /**
   * Parse functional specs from string or array
   */
  private parseFunctionalSpecs(input?: string | FunctionalSpec[]): FunctionalSpec[] {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    return [this.parser.parseFunctionalSpec(input)];
  }

  /**
   * Parse architecture from string or object
   */
  private parseArchitecture(input?: string | TechnicalArchitecture): TechnicalArchitecture | undefined {
    if (!input) return undefined;
    if (typeof input === 'object') return input;
    return this.parser.parseTechnicalArchitecture(input);
  }

  /**
   * Create summary statistics
   */
  private createSummary(
    testCases: TestCase[],
    testSuite: TestSuite
  ): ProductFactorsAssessmentOutput['summary'] {
    const byCategory: Record<HTSMCategory, number> = {
      STRUCTURE: 0,
      FUNCTION: 0,
      DATA: 0,
      INTERFACES: 0,
      PLATFORM: 0,
      OPERATIONS: 0,
      TIME: 0,
    };

    const byPriority: Record<string, number> = {
      P0: 0,
      P1: 0,
      P2: 0,
      P3: 0,
    };

    testCases.forEach((tc) => {
      byCategory[tc.htsm.primary.category]++;
      byPriority[tc.priority]++;
    });

    return {
      totalTests: testCases.length,
      byCategory,
      byPriority,
      coverageScore: testSuite.htsmCoverage.overall,
      traceabilityScore: testSuite.traceabilityMatrix.coverage,
    };
  }

  /**
   * Determine automation fitness for a test case based on its characteristics
   */
  private determineAutomationFitness(testCase: TestCase): string {
    const subcategory = testCase.htsm.primary.subcategory;
    const category = testCase.htsm.primary.category;
    const name = testCase.name.toLowerCase();

    // API-level automation candidates
    const apiAutomationSubcategories = [
      'ApiSdk', 'SystemInterfaces', 'InputOutput', 'InvalidNoise',
      'ErrorHandling', 'Calculation', 'SecurityRelated', 'Lifecycle'
    ];
    if (apiAutomationSubcategories.includes(subcategory)) {
      if (name.includes('api') || name.includes('endpoint') || name.includes('data flow')) {
        return 'Automate on API level';
      }
      if (name.includes('rejection') || name.includes('validation') || name.includes('processing')) {
        return 'Automate on API level';
      }
    }

    // E2E automation candidates
    const e2eAutomationSubcategories = [
      'UserInterfaces', 'BusinessRules', 'StateTransitions', 'Interactions'
    ];
    if (e2eAutomationSubcategories.includes(subcategory)) {
      if (name.includes('form') || name.includes('button') || name.includes('displayed') ||
          name.includes('checkout') || name.includes('registration') || name.includes('login')) {
        return 'Automate on E2E level';
      }
    }

    // Visual/UI check candidates
    if (subcategory === 'UserInterfaces') {
      if (name.includes('displayed') || name.includes('table') || name.includes('banner') ||
          name.includes('comparison') || name.includes('layout')) {
        return 'Automate on Visual level';
      }
    }

    // Integration test candidates
    if (subcategory === 'Code' || subcategory === 'Service') {
      if (name.includes('integrates') || name.includes('component') || name.includes('dependencies')) {
        return 'Automate on Integration level';
      }
      if (name.includes('health check') || name.includes('starts successfully')) {
        return 'Automate on Integration level';
      }
    }

    // Performance/load test candidates
    if (subcategory === 'ExtremeUse' || subcategory === 'ProductFootprint') {
      if (name.includes('load') || name.includes('volume') || name.includes('memory') ||
          name.includes('cpu') || name.includes('performance')) {
        return 'Automated Performance Tests';
      }
    }

    // Concurrency/timing test candidates
    if (subcategory === 'Concurrency' || subcategory === 'Pacing' || subcategory === 'InputOutputTiming') {
      if (name.includes('concurrent') || name.includes('race condition') || name.includes('timeout') ||
          name.includes('burst') || name.includes('delayed')) {
        return 'Automated Concurrency Tests';
      }
    }

    // Compatibility test candidates - specific types
    if (subcategory === 'ExternalSoftware' || subcategory === 'ExternalHardware') {
      // Browser compatibility
      if (name.includes('chrome') || name.includes('firefox') || name.includes('safari') ||
          name.includes('edge') || name.includes('browser')) {
        return 'Automated Browser Compatibility Test';
      }
      // Database compatibility
      if (name.includes('postgresql') || name.includes('mysql') || name.includes('mongodb') ||
          name.includes('redis') || name.includes('database') || name.includes('db')) {
        return 'Automated DB Compatibility Test';
      }
      // Device/OS compatibility
      if (name.includes('ios') || name.includes('android') || name.includes('mobile') ||
          name.includes('tablet') || name.includes('device') || name.includes('windows') ||
          name.includes('macos') || name.includes('linux')) {
        return 'Automated Device Compatibility Test';
      }
      // API/Service compatibility
      if (name.includes('stripe') || name.includes('api') || name.includes('integration') ||
          name.includes('third-party') || name.includes('external service')) {
        return 'Automated API Compatibility Test';
      }
      // Runtime/Platform compatibility
      if (name.includes('node') || name.includes('runtime') || name.includes('version')) {
        return 'Automated Platform Compatibility Test';
      }
      // Generic fallback
      return 'Automated Compatibility Test';
    }

    // Contract/schema validation
    if (subcategory === 'BigLittle' || subcategory === 'Cardinality') {
      if (name.includes('boundary') || name.includes('zero items') || name.includes('many items')) {
        return 'Automate on API level';
      }
    }

    // Security automation
    if (subcategory === 'DisfavoredUse') {
      if (name.includes('injection') || name.includes('xss') || name.includes('protection')) {
        return 'Automated Security Tests';
      }
    }

    // Human exploration required
    const humanExplorationSubcategories = [
      'CommonUse', 'UncommonUse', 'Users', 'Environment', 'Collateral'
    ];
    if (humanExplorationSubcategories.includes(subcategory)) {
      return 'Human testers must explore';
    }

    // Check for exploratory indicators in the test name
    if (name.includes('usability') || name.includes('user experience') || name.includes('intuitive') ||
        name.includes('clarity') || name.includes('workflow') || name.includes('journey') ||
        name.includes('functionality for')) {
      return 'Human testers must explore';
    }

    // Policy/compliance often needs human review
    if (name.includes('compliance') || name.includes('policy') || name.includes('gdpr') ||
        name.includes('privacy') || name.includes('consent') || name.includes('agreements')) {
      return 'Human testers must explore';
    }

    // Time-related data often needs contextual understanding
    if (subcategory === 'TimeRelatedData') {
      if (name.includes('expires') || name.includes('timeout')) {
        return 'Automate on API level';
      }
      return 'Human testers must explore';
    }

    // Default based on category
    const categoryDefaults: Record<string, string> = {
      STRUCTURE: 'Automate on Integration level',
      FUNCTION: 'Automate on E2E level',
      DATA: 'Automate on API level',
      INTERFACES: 'Automate on API level',
      PLATFORM: 'Automated Compatibility Test',
      OPERATIONS: 'Human testers must explore',
      TIME: 'Automated Concurrency Tests',
    };

    return categoryDefaults[category] || 'Human testers must explore';
  }

  /**
   * Generate contextual examples for each priority level based on test cases
   * Extracts meaningful examples from actual test case names for the Priority Legend
   */
  private generatePriorityExamples(testCases: TestCase[]): Record<string, string> {
    const examplesByPriority: Record<string, string[]> = {
      P0: [],
      P1: [],
      P2: [],
      P3: [],
    };

    // Keywords to extract meaningful concepts from test names
    const extractConcepts = (name: string): string[] => {
      const concepts: string[] = [];
      const nameLower = name.toLowerCase();

      // Security-related concepts
      if (nameLower.includes('xss') || nameLower.includes('injection')) concepts.push('XSS/injection protection');
      if (nameLower.includes('authentication') || nameLower.includes('auth')) concepts.push('authentication security');
      if (nameLower.includes('password') || nameLower.includes('credential')) concepts.push('credential handling');
      if (nameLower.includes('permission') || nameLower.includes('access control')) concepts.push('access control');
      if (nameLower.includes('encrypt') || nameLower.includes('security')) concepts.push('data security');

      // Payment/financial concepts
      if (nameLower.includes('payment') || nameLower.includes('billing')) concepts.push('payment processing');
      if (nameLower.includes('subscription') || nameLower.includes('renewal')) concepts.push('subscription management');
      if (nameLower.includes('refund') || nameLower.includes('chargeback')) concepts.push('refund handling');
      if (nameLower.includes('pricing') || nameLower.includes('tier')) concepts.push('pricing tiers');

      // Integration concepts
      if (nameLower.includes('api') || nameLower.includes('endpoint')) concepts.push('API integrations');
      if (nameLower.includes('webhook') || nameLower.includes('callback')) concepts.push('webhook handling');
      if (nameLower.includes('stripe') || nameLower.includes('gateway')) concepts.push('payment gateway');
      if (nameLower.includes('email') || nameLower.includes('notification')) concepts.push('email notifications');

      // Service/infrastructure concepts
      if (nameLower.includes('health check') || nameLower.includes('service start')) concepts.push('service health checks');
      if (nameLower.includes('integrates correctly')) concepts.push('service integrations');
      if (nameLower.includes('database') || nameLower.includes('db')) concepts.push('database operations');

      // User experience concepts
      if (nameLower.includes('form') || nameLower.includes('input')) concepts.push('form validation');
      if (nameLower.includes('display') || nameLower.includes('ui')) concepts.push('UI components');
      if (nameLower.includes('navigation') || nameLower.includes('menu')) concepts.push('navigation');
      if (nameLower.includes('responsive') || nameLower.includes('mobile')) concepts.push('responsive design');

      // Data concepts
      if (nameLower.includes('gdpr') || nameLower.includes('privacy')) concepts.push('GDPR compliance');
      if (nameLower.includes('export') || nameLower.includes('download')) concepts.push('data export');
      if (nameLower.includes('validation') || nameLower.includes('boundary')) concepts.push('data validation');

      // Community/engagement concepts
      if (nameLower.includes('comment') || nameLower.includes('reply')) concepts.push('commenting system');
      if (nameLower.includes('profile') || nameLower.includes('biography')) concepts.push('user profiles');
      if (nameLower.includes('follow') || nameLower.includes('subscriber')) concepts.push('follow/subscribe features');
      if (nameLower.includes('bookmark') || nameLower.includes('reading list')) concepts.push('bookmarks');
      if (nameLower.includes('leaderboard') || nameLower.includes('ranking')) concepts.push('leaderboards');
      if (nameLower.includes('contributor') || nameLower.includes('submission')) concepts.push('contributor portal');
      if (nameLower.includes('newsletter') || nameLower.includes('personalized')) concepts.push('personalized newsletters');
      if (nameLower.includes('calendar') || nameLower.includes('event')) concepts.push('events calendar');
      if (nameLower.includes('moderation') || nameLower.includes('spam')) concepts.push('content moderation');

      // Compatibility concepts
      if (nameLower.includes('browser') || nameLower.includes('chrome') || nameLower.includes('firefox')) concepts.push('browser compatibility');
      if (nameLower.includes('compatibility')) concepts.push('platform compatibility');

      // Performance concepts
      if (nameLower.includes('load') || nameLower.includes('performance')) concepts.push('performance testing');
      if (nameLower.includes('concurrent') || nameLower.includes('race')) concepts.push('concurrency handling');
      if (nameLower.includes('timeout') || nameLower.includes('retry')) concepts.push('timeout handling');

      return concepts;
    };

    // Process test cases and extract concepts by priority
    testCases.forEach(tc => {
      const concepts = extractConcepts(tc.name);
      if (concepts.length > 0) {
        examplesByPriority[tc.priority].push(...concepts);
      }
    });

    // Deduplicate and limit to top 3 examples per priority
    const result: Record<string, string> = {};
    Object.entries(examplesByPriority).forEach(([priority, concepts]) => {
      // Count occurrences and sort by frequency
      const counts = new Map<string, number>();
      concepts.forEach(c => counts.set(c, (counts.get(c) || 0) + 1));
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const topConcepts = sorted.slice(0, 3).map(([concept]) => concept);
      result[priority] = topConcepts.length > 0 ? topConcepts.join(', ') : 'Edge cases, minor variations';
    });

    return result;
  }

  /**
   * Extract contextual entities from user stories for dynamic question generation
   * This extracts features, actors, data types, integrations, and actions
   */
  private extractContextualEntities(userStories: UserStory[]): {
    features: string[];
    actors: string[];
    dataTypes: string[];
    integrations: string[];
    actions: string[];
    themes: string[];
  } {
    // Combine parsed user stories with raw input content for complete context
    // This ensures we capture domain context from titles, descriptions, and headers
    const userStoriesText = userStories.map(s =>
      `${s.title} ${s.asA} ${s.iWant} ${s.soThat} ${(s.acceptanceCriteria || []).join(' ')}`
    ).join(' ');
    const allText = `${this.rawInputContent} ${userStoriesText}`.toLowerCase();

    // PRIORITY 1: Domain-specific patterns (checked FIRST, these define the primary context)
    // These use more specific patterns that indicate the ACTUAL domain, not just keyword presence
    const domainPatterns: Record<string, { patterns: RegExp[]; priority: number }> = {
      // Performance & Web Vitals domain (highest priority for performance epics)
      'Core Web Vitals optimization': {
        patterns: [/core\s*web\s*vitals?/i, /\blcp\b/i, /\bfid\b/i, /\bcls\b/i, /\binp\b/i, /\bttfb\b/i],
        priority: 100
      },
      'progressive enhancement': {
        patterns: [/progressive\s*enhancement/i, /without\s*javascript/i, /js\s*disabled/i, /graceful\s*degradation/i],
        priority: 100
      },
      'page load performance': {
        patterns: [/page\s*(load|weight|speed)/i, /load\s*time/i, /\b(lcp|fcp)\s*<?\s*\d/i, /seconds?\s*on\s*(3g|4g)/i],
        priority: 100
      },
      'image optimization': {
        patterns: [/webp/i, /avif/i, /srcset/i, /lazy\s*load/i, /image\s*optim/i, /next-gen\s*format/i],
        priority: 95
      },
      'SSR/SSG implementation': {
        patterns: [/\bssr\b/i, /\bssg\b/i, /server-side\s*render/i, /static\s*site\s*gen/i, /static\s*html/i],
        priority: 95
      },
      'critical CSS': {
        patterns: [/critical\s*css/i, /above-the-fold/i, /inline.*css/i, /css\s*inline/i],
        priority: 90
      },
      'CDN & edge caching': {
        patterns: [/\bcdn\b/i, /edge\s*cach/i, /static\s*assets/i, /cloudflare/i, /fastly/i],
        priority: 85
      },
      'motion preferences': {
        patterns: [/prefers-reduced-motion/i, /reduce[d]?\s*motion/i, /motion\s*preference/i],
        priority: 85
      },
      'resource hints': {
        patterns: [/preload/i, /prefetch/i, /preconnect/i, /resource\s*hint/i],
        priority: 80
      },
      // Accessibility domain
      'accessibility compliance': {
        patterns: [/wcag/i, /\ba11y\b/i, /accessibility/i, /screen\s*reader/i, /aria-/i],
        priority: 90
      },
      'keyboard navigation': {
        patterns: [/keyboard\s*(nav|access)/i, /focus\s*(trap|management|indicator)/i, /skip\s*link/i],
        priority: 85
      },
      // SEO domain
      'SEO optimization': {
        patterns: [/\bseo\b/i, /search\s*engine/i, /crawler/i, /indexing/i, /robots\.txt/i, /sitemap/i],
        priority: 80
      },
      // AI/ML domain - CRITICAL for Epic 3 and similar AI-powered features
      'ML recommendation engine': {
        patterns: [/recommend(ation)?s?\s*(engine|system|algorithm)?/i, /collaborative\s*filter/i, /content-based\s*filter/i, /personali[sz](ed|ation)/i],
        priority: 100
      },
      'natural language search': {
        patterns: [/natural\s*language\s*(search|processing|query)/i, /\bnlp\b/i, /semantic\s*search/i, /intent\s*(classification|detection)/i],
        priority: 100
      },
      'visual search': {
        patterns: [/visual\s*search/i, /image\s*(search|recognition|similarity)/i, /computer\s*vision/i, /upload\s*image.*find/i],
        priority: 100
      },
      'ML model operations': {
        patterns: [/\bml\b\s*(model|pipeline|training|inference)/i, /machine\s*learning/i, /model\s*(training|serving|drift)/i, /feature\s*store/i],
        priority: 95
      },
      'A/B testing framework': {
        patterns: [/a\/b\s*test/i, /experiment\s*(framework|platform)/i, /split\s*test/i, /variant\s*test/i, /feature\s*flag/i],
        priority: 90
      },
      'privacy & consent': {
        patterns: [/privacy\s*(preference|control|setting)/i, /consent\s*(management|opt)/i, /opt-out/i, /gdpr/i, /data\s*protection/i],
        priority: 90
      },
      // Sustainability Commerce domain - CRITICAL for Epic 4 and eco-commerce features
      'sustainability commerce': {
        patterns: [/sustainab(le|ility)/i, /eco-?(friendly|conscious)/i, /carbon\s*(footprint|neutral|offset|calculator)/i, /environmental\s*impact/i, /green\s*(product|commerce)/i],
        priority: 100
      },
      'eco-certifications': {
        patterns: [/fair\s*trade/i, /organic\s*(cotton|material|product)/i, /recycled\s*(content|material)/i, /vegan/i, /cruelty-free/i, /certification\s*(badge|verification)/i, /oeko-tex/i, /gots/i, /fsc/i],
        priority: 100
      },
      'resale & pre-loved': {
        patterns: [/pre-?loved/i, /resale/i, /second-?hand/i, /trade-?in/i, /refurbished/i, /circular\s*(economy|fashion)/i],
        priority: 95
      },
      'supply chain transparency': {
        patterns: [/supply\s*chain/i, /ethical\s*sourc/i, /material\s*composition/i, /transparency\s*score/i, /traceability/i, /origin\s*(country|tracking)/i],
        priority: 95
      },
      'carbon & emissions': {
        patterns: [/co2\s*(emission|footprint)/i, /carbon\s*(offset|neutral|calculator)/i, /emission\s*factor/i, /delivery\s*(impact|emissions)/i, /climate/i],
        priority: 95
      },
      'repair & care': {
        patterns: [/repair\s*(service|guide|tutorial)/i, /care\s*(instruction|guide)/i, /extend\s*(life|lifespan)/i, /warranty/i, /maintenance/i, /diy\s*repair/i],
        priority: 90
      },
    };

    // PRIORITY 2: Generic feature patterns (only used if no domain patterns match)
    // These are LESS specific and should NOT override domain patterns
    const genericPatterns: Record<string, { patterns: RegExp[]; priority: number }> = {
      'authentication': {
        patterns: [/\blogin\b/i, /\blogout\b/i, /sign\s*(in|up)/i, /register/i, /password/i],
        priority: 50
      },
      'payment processing': {
        patterns: [/payment/i, /checkout/i, /billing/i, /invoice/i],
        priority: 50
      },
      'user management': {
        // FIXED: Require more specific patterns, not just "user"
        patterns: [/user\s*(management|account|profile|settings)/i, /manage\s*users?/i, /user\s*admin/i],
        priority: 40
      },
      'content management': {
        // FIXED: Require more specific patterns, not just "content"
        patterns: [/content\s*(management|editor|publish)/i, /\bcms\b/i, /manage\s*content/i],
        priority: 40
      },
      'search functionality': {
        patterns: [/search\s*(function|feature|capability)/i, /full-text\s*search/i],
        priority: 40
      },
      'inventory': {
        // FIXED: Require inventory-specific context, not just "product"
        patterns: [/inventory\s*(management|track)/i, /stock\s*(level|management)/i, /warehouse/i],
        priority: 40
      },
    };

    // Extract features with priority scoring
    const featureScores: Map<string, number> = new Map();

    // Check domain patterns first (high priority)
    Object.entries(domainPatterns).forEach(([feature, config]) => {
      if (config.patterns.some(p => p.test(allText))) {
        featureScores.set(feature, config.priority);
      }
    });

    // Only check generic patterns if few domain patterns matched
    if (featureScores.size < 2) {
      Object.entries(genericPatterns).forEach(([feature, config]) => {
        if (config.patterns.some(p => p.test(allText))) {
          featureScores.set(feature, config.priority);
        }
      });
    }

    // Sort features by priority (highest first)
    const features = Array.from(featureScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([feature]) => feature);

    // Extract actors (user types)
    const actorPatterns: Record<string, string[]> = {
      'end user': ['user', 'customer', 'visitor', 'member', 'subscriber'],
      'administrator': ['admin', 'administrator', 'manager', 'moderator'],
      'developer': ['developer', 'api user', 'integrator'],
      'guest': ['guest', 'visitor', 'anonymous'],
      'enterprise user': ['enterprise', 'team', 'organization', 'business'],
    };

    const actors: string[] = [];
    Object.entries(actorPatterns).forEach(([actor, keywords]) => {
      if (keywords.some(kw => allText.includes(kw))) {
        actors.push(actor);
      }
    });

    // Extract data types
    const dataPatterns: Record<string, string[]> = {
      'user data': ['name', 'email', 'address', 'phone', 'profile'],
      'financial data': ['payment', 'card', 'bank', 'invoice', 'price', 'amount', 'currency'],
      'content data': ['article', 'document', 'file', 'image', 'video', 'media'],
      'transactional data': ['order', 'transaction', 'purchase', 'subscription'],
      'configuration data': ['settings', 'preferences', 'config', 'options'],
      'analytics data': ['metrics', 'statistics', 'logs', 'events', 'tracking'],
      'sensitive data': ['password', 'token', 'secret', 'credential', 'personal'],
    };

    const dataTypes: string[] = [];
    Object.entries(dataPatterns).forEach(([dataType, keywords]) => {
      if (keywords.some(kw => allText.includes(kw))) {
        dataTypes.push(dataType);
      }
    });

    // Extract third-party integrations
    const integrationPatterns: Record<string, string[]> = {
      'payment gateway': ['stripe', 'paypal', 'braintree', 'square', 'payment gateway'],
      'email service': ['sendgrid', 'mailchimp', 'ses', 'smtp', 'email service'],
      'authentication provider': ['oauth', 'saml', 'ldap', 'sso', 'auth0', 'okta'],
      'cloud storage': ['s3', 'azure blob', 'gcs', 'cloudinary', 'storage'],
      'analytics': ['google analytics', 'mixpanel', 'amplitude', 'segment'],
      'database': ['postgresql', 'mysql', 'mongodb', 'redis', 'database'],
      'search engine': ['elasticsearch', 'algolia', 'solr', 'search service'],
      'cdn': ['cloudflare', 'fastly', 'akamai', 'cdn'],
      'messaging': ['twilio', 'sms', 'push notification'],
    };

    const integrations: string[] = [];
    Object.entries(integrationPatterns).forEach(([integration, keywords]) => {
      if (keywords.some(kw => allText.includes(kw))) {
        integrations.push(integration);
      }
    });

    // Extract actions (verbs)
    const actionPatterns = [
      'create', 'read', 'update', 'delete', 'view', 'edit', 'save',
      'submit', 'send', 'receive', 'process', 'validate', 'verify',
      'approve', 'reject', 'cancel', 'confirm', 'notify', 'alert',
      'export', 'import', 'upload', 'download', 'share', 'publish',
      'search', 'filter', 'sort', 'paginate', 'navigate',
      'login', 'logout', 'register', 'authenticate', 'authorize',
      'purchase', 'checkout', 'pay', 'refund', 'subscribe', 'unsubscribe',
    ];

    const actions = actionPatterns.filter(action => allText.includes(action));

    // Generate themes summary
    const themes = features.length > 0 ? features.slice(0, 4) : ['general application functionality'];

    return { features, actors, dataTypes, integrations, actions, themes };
  }

  /**
   * Detect if the context is primarily infrastructure/performance focused
   */
  private isInfrastructureContext(context: {
    features: string[];
    actors: string[];
    dataTypes: string[];
    integrations: string[];
    actions: string[];
    themes: string[];
  }): boolean {
    const infraFeatures = [
      // Performance & Web Vitals (new)
      'Core Web Vitals optimization',
      'progressive enhancement',
      'page load performance',
      'image optimization',
      'SSR/SSG implementation',
      'critical CSS',
      'CDN & edge caching',
      'motion preferences',
      'resource hints',
      'SEO optimization',
      // Original infrastructure features
      'performance optimization',
      'caching & CDN',
      'security hardening',
      'database optimization',
      'monitoring & alerting',
      'infrastructure modernization',
      'backup & recovery',
      'CI/CD pipeline',
    ];
    const matchCount = context.features.filter(f => infraFeatures.includes(f)).length;
    return matchCount >= 1; // Consider infrastructure context if ANY performance/infra feature present
  }

  /**
   * Detect if the context is primarily accessibility focused
   */
  private isAccessibilityContext(context: {
    features: string[];
    actors: string[];
    dataTypes: string[];
    integrations: string[];
    actions: string[];
    themes: string[];
  }): boolean {
    const a11yFeatures = [
      'accessibility',
      'keyboard navigation',
      'screen reader support',
      'visual accessibility',
      'form accessibility',
    ];
    const matchCount = context.features.filter(f => a11yFeatures.includes(f)).length;
    return matchCount >= 1; // Consider accessibility context if any accessibility feature present
  }

  /**
   * Detect if the context is primarily ML/AI focused (recommendations, NLP, visual search, etc.)
   */
  private isMLAIContext(context: {
    features: string[];
    actors: string[];
    dataTypes: string[];
    integrations: string[];
    actions: string[];
    themes: string[];
  }): boolean {
    const mlaiFeatures = [
      'ML recommendation engine',
      'natural language search',
      'visual search',
      'ML model operations',
      'A/B testing framework',
      'privacy & consent',
      'personalization',
      'machine learning',
      'computer vision',
      'semantic search',
    ];
    const matchCount = context.features.filter(f => mlaiFeatures.includes(f)).length;
    return matchCount >= 1; // Consider ML/AI context if any ML/AI feature present
  }

  /**
   * Detect if the context is primarily sustainability/eco-commerce focused
   */
  private isSustainabilityContext(context: {
    features: string[];
    actors: string[];
    dataTypes: string[];
    integrations: string[];
    actions: string[];
    themes: string[];
  }): boolean {
    // Must match EXACTLY the keys in domainPatterns - no aspirational entries
    const sustainabilityFeatures = [
      'sustainability commerce',
      'eco-certifications',
      'resale & pre-loved',
      'supply chain transparency',
      'carbon & emissions',
      'repair & care',
    ];
    const matchCount = context.features.filter(f => sustainabilityFeatures.includes(f)).length;
    return matchCount >= 1; // Consider sustainability context if any sustainability feature present
  }

  /**
   * Generate clarifying questions for missing or underrepresented subcategories
   * When LLM is available, generates context-aware questions from actual document content.
   * Falls back to template-based questions when LLM is not available.
   */
  private async generateClarifyingQuestions(
    category: HTSMCategory,
    categoryTests: TestCase[] | TestOpportunity[],
    userStories: UserStory[]
  ): Promise<{ preamble: string; questions: Array<{ subcategory: string; rationale: string; questions: string[] }> }> {
    const result: { preamble: string; questions: Array<{ subcategory: string; rationale: string; questions: string[] }> } = {
      preamble: '',
      questions: []
    };

    // Extract contextual entities from user stories
    const context = this.extractContextualEntities(userStories);
    const isInfra = this.isInfrastructureContext(context);
    const isA11y = this.isAccessibilityContext(context);
    const isML = this.isMLAIContext(context);
    const isSust = this.isSustainabilityContext(context);
    const themesText = context.themes.join(', ');

    // Generate contextual preamble
    result.preamble = `Since the user stories focus on **${themesText}**, the following subcategories have limited or no test coverage.`;

    // HTSM-based question templates with placeholders for contextual entities
    // Based on James Bach's HTSM v6.3 Product Factors definitions
    // Templates are context-aware: sustainability vs ML/AI vs accessibility vs infrastructure vs generic contexts
    // Priority order: sust (sustainability) → ml → a11y → infra → generic
    const subcategoryTemplates: Record<HTSMCategory, Record<string, {
      definition: string;  // HTSM definition
      rationale: (ctx: typeof context, infra: boolean, a11y: boolean, ml: boolean, sust: boolean) => string;
      questions: (ctx: typeof context, infra: boolean, a11y: boolean, ml: boolean, sust: boolean) => string[];
    }>> = {
      STRUCTURE: {
        Code: {
          definition: 'The code structures that constitute the product, from executables to individual routines.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability commerce requires specific code structures: carbon calculator modules, certification verification APIs, resale platform integrations, and sustainability tagging systems.`
            : ml
            ? `ML/AI systems require specific code structures: model serving infrastructure, feature pipelines, embedding stores, and recommendation algorithms.`
            : a11y
            ? `Accessibility compliance requires specific code structures: ARIA attributes, semantic HTML, focus management, and skip links.`
            : infra
            ? `Infrastructure modernization involves code cleanup and technical debt reduction. Understanding the codebase structure is essential for safe refactoring.`
            : `The user stories describe ${ctx.features.slice(0, 2).join(' and ') || 'features'} but don't specify the underlying code structure. Understanding dependencies helps identify integration risks.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `What carbon calculator library/API is used for emissions estimates? How are emission factors sourced?`,
              `How is the sustainability tagging system structured in the product database?`,
              `What certification verification APIs are integrated (Fair Trade, OEKO-TEX, GOTS)?`,
              `How is the resale platform integration architected? Sync mechanism?`,
            ]
            : ml
            ? [
              `What ML frameworks are used for the recommendation engine (TensorFlow, PyTorch, scikit-learn)?`,
              `How is the feature store organized for real-time personalization? What's the feature pipeline architecture?`,
              `What embedding model/dimensions are used for visual search similarity matching?`,
              `How are A/B experiment assignments managed in code (feature flags, experiment SDK)?`,
            ]
            : a11y
            ? [
              `What accessibility testing libraries are integrated (axe-core, pa11y, jest-axe)?`,
              `Are ARIA attributes dynamically managed in JavaScript components? How are they tested?`,
              `What is the heading hierarchy (H1-H6) structure? Is it semantic and logical?`,
            ]
            : infra
            ? [
              `What are the duplicate code blocks identified on the homepage that need cleanup?`,
              `Which Elementor widgets and custom CSS require refactoring for maintainability?`,
              `What is the plugin inventory and which plugins have security vulnerabilities or are outdated?`,
            ]
            : [
              `What third-party libraries and their versions are used for ${ctx.features[0] || 'core functionality'}?`,
              `Are there shared modules that multiple features depend on? Breaking changes could affect ${ctx.features.slice(0, 2).join(', ') || 'the system'}.`,
              `What database schemas store ${ctx.dataTypes.slice(0, 2).join(' and ') || 'application data'}? Schema changes could break existing functionality.`,
            ],
        },
        Hardware: {
          definition: 'Any hardware component that is integral to the product.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability features may require barcode/QR scanning for product certification lookup and device compatibility for eco-badge display.`
            : ml
            ? `ML/AI systems require GPU/TPU infrastructure for model inference, and must handle visual search image capture on various devices.`
            : a11y
            ? `Accessibility requires testing with assistive technology hardware: screen readers, switch devices, braille displays, and various input devices.`
            : infra
            ? `Infrastructure testing requires validating server hardware specifications, CDN edge locations, and network infrastructure.`
            : `The user stories mention ${ctx.features[0] || 'functionality'} but don't specify device requirements. Modern flows often involve hardware features.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `Should product certification lookup support barcode/QR scanning on mobile devices?`,
              `What device capabilities are needed for displaying eco-badges and certification icons?`,
              `How should sustainability features perform on low-powered devices (older phones)?`,
            ]
            : ml
            ? [
              `What GPU/TPU infrastructure is required for ML model inference? What are latency requirements?`,
              `How does visual search handle camera access across different mobile devices and browsers?`,
              `What device capabilities are required for real-time personalization (memory, processing power)?`,
            ]
            : a11y
            ? [
              `What assistive technology devices should be tested (screen readers, switch controls, braille displays)?`,
              `Should the application support alternative input devices (eye tracking, voice control, sip-and-puff)?`,
              `What mobile accessibility features need testing (TalkBack, VoiceOver, Switch Access)?`,
            ]
            : infra
            ? [
              `What server specifications (CPU, memory, storage) are required for optimal performance?`,
              `What CDN edge locations are needed for the global audience?`,
              `What network bandwidth and latency requirements exist for the hosting infrastructure?`,
            ]
            : [
              `Should ${ctx.features[0] || 'the application'} support biometric authentication (Face ID/Touch ID) on mobile devices?`,
              `Does ${ctx.actions.includes('upload') ? 'file upload' : 'any feature'} require camera or other hardware access?`,
              `Should we test ${ctx.features[0] || 'core flows'} on devices without specific hardware capabilities?`,
            ],
        },
        Service: {
          definition: 'Any server or process running independently of others that may constitute the product.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability commerce involves multiple services: carbon offset providers, certification verification APIs, resale platform sync, and supply chain transparency systems.`
            : ml
            ? `ML/AI systems involve multiple services: recommendation engine, search service, feature store, model serving, and A/B experiment platform.`
            : infra
            ? `The infrastructure modernization involves multiple services: WordPress, MySQL, CDN, caching layers, and monitoring systems.`
            : `The user stories don't specify the service architecture. Understanding service boundaries helps identify deployment and scaling requirements.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `What carbon offset provider APIs are integrated (Gold Standard, Verified Carbon Standard)?`,
              `How does the resale platform synchronization service work? Real-time or batch?`,
              `What certification verification services validate sustainability claims (Fair Trade, FSC)?`,
              `How is supply chain transparency data fetched and updated?`,
            ]
            : ml
            ? [
              `What ML serving infrastructure is used (TensorFlow Serving, TorchServe, custom)? How are models deployed?`,
              `What is the feature store architecture? How are features computed and served in real-time?`,
              `How does the A/B experiment service assign users to variants? What's the architecture?`,
              `What search service powers natural language queries (Elasticsearch, Algolia)? How is it configured?`,
            ]
            : infra
            ? [
              `What services are part of the stack? (WordPress, MySQL, Redis/caching, CDN, WAF)`,
              `What background jobs handle scheduled tasks like backups, cleanup, and optimization?`,
              `What health checks and monitoring endpoints need to be configured?`,
            ]
            : [
              `What services/microservices handle ${ctx.features[0] || 'core functionality'}? How do they communicate?`,
              `Are there background jobs or workers for ${ctx.actions.includes('process') || ctx.actions.includes('send') ? 'processing and notifications' : 'async operations'}?`,
              `What is the service discovery and health check mechanism?`,
            ],
        },
        NonExecutable: {
          definition: 'Any files other than multimedia or programs, like text files, sample data, or help files.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability features require configuration for carbon calculation factors, certification definitions, and supply chain data sources.`
            : infra
            ? `Infrastructure requires configuration files for WordPress, caching, CDN, and security settings. Missing or incorrect config can cause outages.`
            : `${ctx.features[0] || 'The application'} likely requires configuration files. Missing config can cause production failures.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `What emission factors are configured for different delivery methods (standard, express, click & collect)?`,
              `How are sustainability certification definitions managed (icons, descriptions, validation rules)?`,
              `What seed data is needed for the Responsible Collection content module?`,
            ]
            : infra
            ? [
              `What are the wp-config.php settings that differ between staging and production?`,
              `What CDN/Cloudflare configuration rules need to be set up (caching, page rules, firewall rules)?`,
              `What .htaccess rules are needed for SSL enforcement, redirects, and security headers?`,
            ]
            : [
              `What environment variables configure ${ctx.integrations[0] || 'external services'}? Are there separate configs for test/production?`,
              `Are there feature flags controlling ${ctx.features[0] || 'feature'} behavior or access levels?`,
              `What static assets (images, icons, templates) need testing across locales?`,
            ],
        },
        Collateral: {
          definition: 'Anything beyond that is also part of the product, such as paper documents, web pages, packaging, license agreements, etc.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability features require user-facing documentation: Repair & Care guides, certification explanations, carbon offset information, and CR report links.`
            : infra
            ? `Infrastructure changes require runbooks, recovery procedures, and change documentation.`
            : `${ctx.features.slice(0, 2).join(' and ') || 'Features'} require clear user documentation. Incorrect help content could lead to support tickets${ctx.features.includes('compliance') ? ' or compliance issues' : ''}.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `What content is needed for Repair & Care guides? Product-specific or generic?`,
              `How are sustainability certifications explained to users (tooltips, modal, dedicated page)?`,
              `What carbon offset documentation is displayed at checkout?`,
              `How is the CR report linked and what summary is shown on homepage?`,
            ]
            : infra
            ? [
              `Is there a runbook documenting the backup and recovery procedure?`,
              `Is there documentation for the CDN configuration and cache invalidation process?`,
              `What change management documentation is required for infrastructure updates?`,
            ]
            : [
              `Is there help documentation explaining ${ctx.features[0] || 'core features'} and related policies?`,
              `Are tooltips and explanations accurate and ${ctx.features.includes('compliance') ? 'legally reviewed' : 'user-friendly'}?`,
              `Do error messages guide users to resolve issues themselves?`,
            ],
        },
      },
      FUNCTION: {
        BusinessRules: {
          definition: 'Constraints on input fields, conditional behavior, boundaries, requirements that shape the product\'s behavior.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability commerce has specific rules: certification validation logic, carbon calculation thresholds, recycled content percentage requirements, and resale quality grading criteria.`
            : ml
            ? `ML/AI systems have complex business rules: recommendation thresholds, personalization algorithms, A/B experiment assignment logic, and privacy consent rules.`
            : infra
            ? `Infrastructure optimization has specific thresholds and rules (Core Web Vitals, cache TTLs, security policies).`
            : `${ctx.features[0] || 'The feature'} has implicit rules not fully specified in the user stories.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `What percentage of recycled content qualifies a product as "eco-friendly" (50%, 80%, 100%)?`,
              `What certifications are recognized for the sustainability filter (Fair Trade, GOTS, OEKO-TEX)?`,
              `What CO2 threshold triggers the "carbon neutral" badge?`,
              `What quality grading criteria apply to pre-loved items (A, B, C grades)?`,
            ]
            : ml
            ? [
              `What recommendation relevance thresholds trigger display (minimum confidence score)?`,
              `What business rules govern A/B experiment assignment (user bucketing, holdout groups)?`,
              `What privacy consent rules must be enforced before personalization activates?`,
              `What are the "Shop by Occasion" date rules (Valentine's shows Feb 1-14, Mother's Day shows April)?`,
            ]
            : infra
            ? [
              `What are the exact Core Web Vitals thresholds? (LCP < 2.5s, FID < 100ms, CLS < 0.1)`,
              `What cache TTL rules apply for different content types (static assets, dynamic pages, API responses)?`,
              `What rate limiting thresholds should be enforced (requests per minute, failed login attempts)?`,
            ]
            : [
              `What are the exact business rules for ${ctx.features[0] || 'core functionality'}? Are there edge cases?`,
              `What happens when ${ctx.actors[0] || 'a user'} attempts an invalid state transition?`,
              `What features exactly are limited for different ${ctx.actors.includes('enterprise user') ? 'tiers or roles' : 'user types'}?`,
            ],
        },
        MultiUserSocial: {
          definition: 'Any function designed to facilitate interaction among people or to allow concurrent access to the same resources.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability features may involve shared resources: limited pre-loved inventory, carbon offset pools, and trade-in program quotas.`
            : ml
            ? `ML personalization handles concurrent users with shared recommendation models and must isolate user preference data.`
            : infra
            ? `Multiple admins may need concurrent access to infrastructure tools.`
            : `The user stories don't detail multi-user scenarios for ${ctx.features[0] || 'shared resources'}.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `How is pre-loved inventory managed when multiple users view the same item?`,
              `Can carbon offset purchases be shared across a household or corporate account?`,
              `How are trade-in quotas managed for high-demand periods?`,
              `Can users share sustainable product wishlists with others?`,
            ]
            : ml
            ? [
              `How do concurrent users affect recommendation model inference (shared model, isolated predictions)?`,
              `Can users share wishlists/carts that affect personalization for others?`,
              `How is user A's browsing history isolated from user B on shared devices?`,
              `How do gift shoppers get separate recommendations from their own profile?`,
            ]
            : infra
            ? [
              `Can multiple administrators access the admin interface simultaneously?`,
              `How are concurrent configuration changes handled?`,
              `What happens when two admins modify the same resource at the same time?`,
            ]
            : [
              `Can multiple ${ctx.actors[0] || 'users'} access the same ${ctx.dataTypes[0] || 'resource'} simultaneously?`,
              `How are conflicts resolved when multiple users modify the same data?`,
              `Are there collaboration features that need testing (sharing, permissions, notifications)?`,
            ],
        },
        Calculation: {
          definition: 'Any arithmetic function or arithmetic operations embedded in other functions.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Carbon footprint calculations are central to sustainability commerce: CO2 estimates, emission factors, offset pricing, and environmental impact scores.`
            : ml
            ? `ML systems involve complex calculations: recommendation scoring, similarity metrics, A/B experiment statistical significance, and personalization ranking.`
            : infra
            ? `Performance metrics and resource calculations are critical for capacity planning.`
            : `${ctx.features.includes('payment processing') || ctx.dataTypes.includes('financial data') ? 'Pricing and billing' : 'Calculations'} don't specify exact rules. Incorrect calculations can cause issues.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `What accuracy tolerance applies to CO2 emissions estimates (±5%, ±10%)?`,
              `How are vehicle emission factors sourced (EPA, EU standards, custom)?`,
              `How is the environmental impact score calculated for products (0-100 scale)?`,
              `What is the carbon offset pricing formula (per kg CO2)?`,
            ]
            : ml
            ? [
              `What recommendation scoring algorithm is used (collaborative filtering score, content similarity)?`,
              `How is visual search similarity calculated (cosine similarity, Euclidean distance)?`,
              `What statistical significance threshold is required for A/B test conclusions (p < 0.05)?`,
              `How are recommendation diversity scores calculated to avoid filter bubbles?`,
            ]
            : infra
            ? [
              `How are performance metrics aggregated (75th percentile)?`,
              `What storage calculations are used for retention policies?`,
              `How is resource consumption calculated for billing?`,
            ]
            : [
              `What are the exact calculation rules for ${ctx.dataTypes.includes('financial data') ? 'pricing, proration, and taxes' : 'numeric operations'}?`,
              `How are ${ctx.dataTypes.includes('financial data') ? 'currencies and exchange rates' : 'units and conversions'} handled?`,
              `What rounding rules apply? How is precision maintained?`,
            ],
        },
        SecurityRelated: {
          definition: 'Rights of each class of user; protection of data; encryption; front end vs. back end protections; vulnerabilities in sub-systems.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability data involves supply chain transparency which may include sensitive supplier information, certification audit data, and carbon offset purchase records.`
            : ml
            ? `ML personalization handles sensitive user data (browsing history, purchase patterns) requiring privacy protection, consent management, and bias prevention.`
            : infra
            ? `Security hardening is a core infrastructure requirement including WAF, SSL, and vulnerability remediation.`
            : `${ctx.features.includes('authentication') ? 'Authentication and authorization' : 'Security'} features require specific controls beyond what's in the user stories.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `What supplier information in supply chain transparency is confidential vs. public?`,
              `How are certification audit records protected from tampering?`,
              `What data protection applies to carbon offset purchase history?`,
              `Are trade-in valuations and customer data protected during resale processing?`,
            ]
            : ml
            ? [
              `How is user browsing history protected? Encrypted at rest? Access controls?`,
              `How is consent verified before personalization activates? Audit trail?`,
              `How are ML models tested for demographic bias in recommendations?`,
              `What data minimization applies (only collect necessary behavioral data)?`,
            ]
            : infra
            ? [
              `What WAF rules should be configured (OWASP Top 10, rate limiting)?`,
              `What SSL/TLS configuration is required for A+ rating?`,
              `What admin security is needed (2FA, IP whitelisting)?`,
            ]
            : [
              `What ${ctx.features.includes('authentication') ? 'password complexity and session timeout' : 'authentication'} requirements apply?`,
              `What ${ctx.dataTypes.includes('sensitive data') ? 'sensitive data' : 'user data'} should be encrypted at rest and in transit?`,
              `What data should be masked in logs?`,
            ],
        },
        Transformations: {
          definition: 'Functions that modify or transform something.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability data requires transformations: material composition normalization, certification status aggregation, and carbon footprint summarization across delivery options.`
            : ml
            ? `ML systems transform raw data into features, images into embeddings, and natural language queries into search vectors.`
            : infra
            ? `Image optimization and content transformation are key infrastructure functions.`
            : `Data transformation rules for ${ctx.dataTypes[0] || 'application data'} aren't specified.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `How is raw material composition data transformed into user-friendly percentages?`,
              `How are multiple certifications aggregated into a single sustainability score?`,
              `How is shipping distance transformed into CO2 estimates for each delivery method?`,
              `How are supplier ethics scores normalized across different audit standards?`,
            ]
            : ml
            ? [
              `How are user events transformed into ML features (click-through rates, dwell time)?`,
              `How are product images transformed into embeddings for visual search?`,
              `How are natural language queries transformed into search vectors (tokenization, embedding)?`,
              `How is browsing history aggregated into user preference profiles?`,
            ]
            : infra
            ? [
              `What image transformations are required (WebP conversion, responsive sizes)?`,
              `How should HTML/CSS/JS be minified and bundled?`,
              `What database cleanup transformations are needed?`,
            ]
            : [
              `What transformations apply to ${ctx.dataTypes[0] || 'input data'} (formatting, normalization, sanitization)?`,
              `How are ${ctx.actions.includes('upload') ? 'uploaded files' : 'data imports'} processed and validated?`,
              `What happens during ${ctx.actions.includes('update') || ctx.actions.includes('edit') ? 'updates' : 'modifications'} - full replace or partial update?`,
            ],
        },
        StateTransitions: {
          definition: 'Any process that changes a view, configuration, or context; making the product sensitive or insensitive to certain inputs.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability commerce has state transitions: certification expiry, pre-loved item sold, carbon offset applied, and product moved between collections.`
            : ml
            ? `ML systems have state transitions: cold-start to personalized, opt-in to opt-out, A/B experiment phases, and model version rollouts.`
            : infra
            ? `Infrastructure has multiple states (maintenance mode, cache warming, deployment transitions).`
            : `${ctx.features[0] || 'The system'} has multiple states with complex transitions.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `What happens when a product's sustainability certification expires? Badge removed?`,
              `How is a pre-loved item's state managed (available → reserved → sold)?`,
              `Can a product move from "Responsible Collection" to regular inventory and back?`,
              `What happens when carbon offset is applied at checkout then order is cancelled?`,
            ]
            : ml
            ? [
              `How does a user transition from cold-start (no history) to personalized recommendations?`,
              `What happens when a user opts out of personalization mid-session?`,
              `How are A/B experiments phased (ramp-up percentage, full rollout, rollback)?`,
              `How are ML model versions transitioned (shadow mode, canary, full deployment)?`,
            ]
            : infra
            ? [
              `How is maintenance mode enabled? What do users see during maintenance?`,
              `What is the deployment process from staging to production? Rollback procedure?`,
              `How is cache warmed after deployment?`,
            ]
            : [
              `What are all valid states for ${ctx.dataTypes.includes('transactional data') ? 'transactions/orders' : 'entities'}? What transitions are allowed?`,
              `Can a ${ctx.actions.includes('cancel') ? 'cancelled' : 'completed'} item be reactivated? Under what conditions?`,
              `What happens to items in "pending" state for extended periods?`,
            ],
        },
        ErrorHandling: {
          definition: 'Any functions that detect and recover from errors, including all error messages.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability features must handle failures gracefully: carbon calculator API down, certification verification timeout, resale platform sync failure.`
            : ml
            ? `ML systems must gracefully degrade when models fail, visual search times out, or recommendation service is unavailable.`
            : infra
            ? `Infrastructure failures require automated detection, alerting, and recovery procedures.`
            : `${ctx.features[0] || 'Application'} flows have many failure points. Clear error handling prevents user frustration.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `What happens when the carbon calculator API is unavailable? Hide estimates or show cached?`,
              `What happens if certification verification service times out? Show unverified badge?`,
              `How is resale platform sync failure handled? Retry logic? Manual reconciliation?`,
              `What error message is shown if trade-in valuation service is down?`,
            ]
            : ml
            ? [
              `What happens when the recommendation service is unavailable? Fallback to popular items?`,
              `What happens when visual search image processing fails? Error message? Retry?`,
              `What happens when natural language search returns no results? Suggestions?`,
              `How are ML model inference timeouts handled (< 100ms SLA)?`,
            ]
            : infra
            ? [
              `What happens when origin server is unavailable? Failover? Custom error pages?`,
              `How are database connection failures handled? Automatic reconnection?`,
              `What monitoring alerts fire for different error conditions?`,
            ]
            : [
              `What should happen when ${ctx.integrations[0] || 'an external service'} is unavailable? Retry? Queue? Notify user?`,
              `How should expired sessions be handled mid-operation?`,
              `What specific error messages should ${ctx.actors[0] || 'users'} see for different failure scenarios?`,
            ],
        },
        Interactions: {
          definition: 'Any interactions between functions within the product.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability features interact with multiple systems: product catalog (badges), checkout (carbon offset), delivery (emissions), and external platforms (resale).`
            : ml
            ? `ML systems have complex interactions: search affects recommendations, purchases retrain models, A/B results feed algorithm tuning.`
            : infra
            ? `Infrastructure components interact with each other.`
            : `The user stories mention ${ctx.features.includes('notification system') ? 'notifications' : 'interactions'} but don't detail all system interactions.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `How does sustainability filter interact with existing product search/filter?`,
              `How does carbon offset selection at checkout interact with order total?`,
              `How does delivery option selection trigger carbon footprint recalculation?`,
              `How does resale platform synchronize inventory with main product catalog?`,
            ]
            : ml
            ? [
              `How do search queries influence subsequent recommendations?`,
              `How do purchases trigger model retraining or profile updates?`,
              `How do A/B experiment results feed back into algorithm tuning?`,
              `How does visual search interact with the product catalog (real-time vs batch)?`,
            ]
            : infra
            ? [
              `How does cache invalidation interact with content updates?`,
              `What triggers monitoring alerts? How do they integrate with notification channels?`,
              `How does the backup system interact with database optimization?`,
            ]
            : [
              `What triggers each ${ctx.features.includes('notification system') ? 'notification' : 'system event'}?`,
              `What analytics events should be captured for ${ctx.features[0] || 'key actions'}?`,
              `How do ${ctx.features.slice(0, 2).join(' and ') || 'features'} interact?`,
            ],
        },
        Testability: {
          definition: 'Any functions provided to help test the product, such as diagnostics, log files, asserts, test menus, etc.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability features require testability: mock carbon APIs, test certification data, sandbox resale platform, and audit logs for compliance verification.`
            : ml
            ? `ML systems require testability features: model explainability, A/B experiment debugging, recommendation audit logs, and bias detection tools.`
            : infra
            ? `Infrastructure testing requires staging environments, performance testing tools, and monitoring dashboards.`
            : `Testing ${ctx.features[0] || 'the application'} requires specific testability features.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `Is there a sandbox mode for carbon offset provider APIs?`,
              `Can test products be assigned arbitrary sustainability certifications for testing?`,
              `Is there a test resale platform environment for sync testing?`,
              `What audit logs capture sustainability data changes for compliance?`,
            ]
            : ml
            ? [
              `Is there a recommendation explainability feature ("Why am I seeing this?")?`,
              `Can testers override A/B experiment assignments for testing specific variants?`,
              `Are recommendation audit logs available (what was shown, why, click-through)?`,
              `What tools exist for detecting recommendation bias across demographics?`,
            ]
            : infra
            ? [
              `Is there a staging environment that mirrors production for testing changes?`,
              `What tools are available for load testing?`,
              `How can performance be measured in staging before production deployment?`,
            ]
            : [
              `Are there test/sandbox modes for ${ctx.integrations[0] || 'external integrations'}?`,
              `What logging is available to diagnose issues in ${ctx.features[0] || 'production'}?`,
              `Can ${ctx.dataTypes[0] || 'data'} states be easily set up for testing edge cases?`,
            ],
        },
      },
      DATA: {
        InputOutput: {
          definition: 'Any data that is processed by the product, and any data that results from that processing.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability commerce processes diverse data: material composition percentages, carbon footprint values, certification statuses, and supply chain transparency scores.`
            : ml
            ? `ML systems process diverse data: user browsing history, purchase patterns, image uploads for visual search, and natural language queries.`
            : infra
            ? `Infrastructure processes configuration data, metrics, and log data that need validation.`
            : `${ctx.features.includes('user management') ? 'Forms' : 'Inputs'} accept ${ctx.dataTypes[0] || 'user input'}, but limits aren't specified. Missing limits create security and UX issues.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `What data format is used for material composition (JSON, CSV, structured fields)?`,
              `What precision is used for carbon footprint values (grams, kilograms, decimal places)?`,
              `How are sustainability certification statuses represented (boolean, enum, score)?`,
              `What output format is used for environmental impact scores (0-100, A-F rating)?`,
            ]
            : ml
            ? [
              `What user behavior data is collected for personalization (browsing history, clicks, purchases)?`,
              `What image formats and sizes are accepted for visual search? What preprocessing is applied?`,
              `How are natural language queries parsed and normalized? What's the query vocabulary?`,
              `What are the output formats for recommendations (product IDs, confidence scores, diversity metrics)?`,
            ]
            : infra
            ? [
              `What Core Web Vitals metrics are collected and how are they reported?`,
              `What log formats and retention policies apply (access logs, error logs, security logs)?`,
              `What configuration formats are used (YAML, JSON, ini)? How are they validated?`,
            ]
            : [
              `What are maximum lengths for ${ctx.dataTypes.includes('user data') ? 'name, email, address' : 'text'} fields?`,
              `${ctx.actions.includes('upload') ? 'What file formats and sizes are allowed for uploads?' : 'What input formats are accepted?'}`,
              `What format should API responses use for ${ctx.dataTypes.includes('financial data') ? 'monetary values (cents vs decimal, currency codes)' : 'data output'}?`,
            ],
        },
        Preset: {
          definition: 'Any data that is supplied as part of the product, or otherwise built into it, such as prefabricated databases, default values, etc.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability features require preset data: recognized certifications list, emission factor tables, pre-loved quality grades, and Responsible Collection seed products.`
            : ml
            ? `ML systems require pre-trained models, embedding dictionaries, and cold-start recommendations for new users.`
            : infra
            ? `Infrastructure requires preset configuration values for caching, security, and optimization.`
            : `Default values for ${ctx.features[0] || 'the system'} affect user experience but aren't specified.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `What certifications are pre-defined in the system (Fair Trade, GOTS, OEKO-TEX, FSC)?`,
              `What emission factors are pre-loaded for each delivery method (kg CO2 per km)?`,
              `What are the pre-defined quality grades for pre-loved items (A, B, C criteria)?`,
              `What products are initially seeded in the Responsible Collection?`,
            ]
            : ml
            ? [
              `What pre-trained models are used? What's the baseline model for recommendations?`,
              `How are cold-start users handled (users with no browsing history)?`,
              `What are the default product categories for "Shop by Occasion" sections?`,
              `What fallback recommendations are shown when personalization is unavailable?`,
            ]
            : infra
            ? [
              `What are the default cache TTLs for different content types (HTML, CSS, JS, images)?`,
              `What are the default security headers (CSP, X-Frame-Options, HSTS)?`,
              `What are the default WordPress/Elementor settings for new installations?`,
            ]
            : [
              `What are the default ${ctx.features.includes('user management') ? 'user settings and preferences' : 'configuration values'}?`,
              `What preset/seed data is required for ${ctx.features[0] || 'the application'} to function?`,
              `What default ${ctx.features.includes('notification system') ? 'notification preferences' : 'options'} are set for new ${ctx.actors[0] || 'users'}?`,
            ],
        },
        Persistent: {
          definition: 'Any data that is expected to persist over multiple operations.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability data requires persistence: carbon offset purchase history for compliance, certification audit trails, and user eco-preferences across sessions.`
            : ml
            ? `ML systems persist user profiles, browsing history, model weights, and A/B experiment assignments across sessions.`
            : infra
            ? `Infrastructure data must persist across deployments, restarts, and disaster recovery scenarios.`
            : `Persistence requirements for ${ctx.dataTypes[0] || 'application data'} need clarification.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `How long are carbon offset purchase records retained for tax/compliance purposes?`,
              `How is certification audit history persisted (changes, expiry, renewal)?`,
              `Do user sustainability filter preferences persist across sessions/devices?`,
              `How long is trade-in history retained for warranty and returns?`,
            ]
            : ml
            ? [
              `How long is user browsing history retained for personalization? GDPR implications?`,
              `How are ML model versions persisted and rolled back during A/B experiments?`,
              `What user preference data persists across devices (consent choices, personalization opt-out)?`,
              `How long are abandoned cart items retained in the "Continue Shopping" section?`,
            ]
            : infra
            ? [
              `What data survives server restarts (sessions, cache, database)?`,
              `What is the backup retention policy (daily, weekly, monthly backups)?`,
              `How is configuration persisted across deployments and rollbacks?`,
            ]
            : [
              `What ${ctx.dataTypes[0] || 'data'} must persist across sessions? Across system restarts?`,
              `How is ${ctx.dataTypes.includes('configuration data') ? 'configuration' : 'state'} data synchronized across instances?`,
              `What is the backup and recovery strategy for ${ctx.dataTypes.includes('transactional data') ? 'transactional' : 'critical'} data?`,
            ],
        },
        BigLittle: {
          definition: 'Variations in the size and aggregation of data.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability data varies in size: small certification flags per product, medium-sized supply chain records, and large batch uploads of material composition data from suppliers.`
            : ml
            ? `ML/AI systems have varying data sizes: small feature vectors, large image embeddings, massive training datasets, and model checkpoints requiring different storage strategies.`
            : infra
            ? `Infrastructure must handle varying data sizes from small configs to large backups and logs.`
            : `${ctx.features[0] || 'The system'} doesn't specify limits. Undefined limits cause performance issues at scale.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `How many products can be bulk-tagged with sustainability attributes at once?`,
              `What is the maximum size of supplier material composition data uploads?`,
              `How many certifications can a single product have (limit)?`,
              `What is the maximum supply chain depth tracked (tiers of suppliers)?`,
            ]
            : ml
            ? [
              `What is the maximum image size for visual search upload (5MB, 10MB, unlimited)?`,
              `How large are product embedding vectors? Storage requirements for millions of products?`,
              `What is the ML model size? Memory requirements for real-time inference?`,
              `How much training data is needed for recommendation model updates (GB, TB)?`,
            ]
            : infra
            ? [
              `What is the maximum database size before performance degrades?`,
              `How large can individual media files be? What are the storage limits?`,
              `What log rotation policies are in place to manage disk usage?`,
            ]
            : [
              `What are the limits for ${ctx.actors.includes('enterprise user') ? 'team size, users per account' : 'data volume'}?`,
              `Are there ${ctx.features[0] || 'usage'} limits per ${ctx.actors[0] || 'user'} type?`,
              `What happens when a limit is exceeded? Soft limit with warning? Hard block?`,
            ],
        },
        Cardinality: {
          definition: 'Numbers of objects or fields may vary (e.g. zero, one, many, max, open limit). Some may have to be unique.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability commerce has cardinality constraints: certifications per product, supply chain tiers, sustainability scores, and eco-badge limits.`
            : ml
            ? `ML/AI systems have cardinality constraints: recommendations per page, search results limits, A/B experiment variations, and personalization history depth.`
            : infra
            ? `Infrastructure components have cardinality constraints (servers, CDN nodes, database replicas).`
            : `${ctx.dataTypes[0] || 'Entity'} relationships need clarification for edge cases.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `How many sustainability certifications can a product display simultaneously (Fair Trade, GOTS, FSC)?`,
              `How many supply chain tiers are tracked for transparency (direct supplier → raw materials)?`,
              `How many sustainability badges fit in the product detail page UI?`,
              `How many carbon offset options are offered at checkout (tree planting, renewable energy, etc.)?`,
            ]
            : ml
            ? [
              `How many personalized recommendations are shown per section (carousel limit)?`,
              `How many "recently viewed" items are tracked per user session?`,
              `How many visual search results are returned per query? Top 10? Top 50?`,
              `How many A/B experiment variants can a user be assigned to simultaneously?`,
            ]
            : infra
            ? [
              `How many CDN edge locations are used? How are they distributed globally?`,
              `How many WordPress revisions are retained per post?`,
              `How many concurrent database connections are supported?`,
            ]
            : [
              `Can a single ${ctx.actors[0] || 'user'} have multiple ${ctx.dataTypes.includes('transactional data') ? 'active subscriptions/orders' : 'of the same entity'}?`,
              `How many ${ctx.dataTypes[0] || 'items'} can be stored per ${ctx.actors[0] || 'account'}? Is there a limit?`,
              `Can one ${ctx.dataTypes.includes('user data') ? 'email' : 'identifier'} be used for multiple accounts?`,
            ],
        },
        InvalidNoise: {
          definition: 'Any data or state that is invalid, corrupted, out of bounds, or produced in an uncontrolled or incorrect fashion.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability data is vulnerable to greenwashing: fake certifications, inflated eco-scores, invalid carbon calculations, and fraudulent supply chain claims.`
            : ml
            ? `ML/AI systems must handle adversarial inputs: corrupted images for visual search, prompt injection in natural language queries, and poisoned recommendation data.`
            : infra
            ? `Infrastructure must handle malformed requests, corrupted data, and malicious inputs.`
            : `${ctx.features.includes('authentication') ? 'Authentication and input' : 'Input'} forms are attack vectors. Security testing requires knowing expected behavior for malicious input.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `How are fraudulent sustainability certifications detected (fake Fair Trade, counterfeit GOTS)?`,
              `What validation ensures carbon footprint calculations use real emission factors (not invented data)?`,
              `How is greenwashing prevented in product sustainability claims (unverified "eco-friendly" labels)?`,
              `How are invalid material composition percentages rejected (totals exceeding 100%)?`,
            ]
            : ml
            ? [
              `How does visual search handle corrupted, adversarial, or inappropriate images?`,
              `How are prompt injection attempts in natural language search blocked (SQL-like patterns, system commands)?`,
              `What happens when recommendation model receives out-of-vocabulary product IDs?`,
              `How is A/B experiment data protected from manipulation (cookie tampering, client-side spoofing)?`,
            ]
            : infra
            ? [
              `How does the WAF handle malformed HTTP requests and SQL injection attempts?`,
              `What happens when corrupted cache data is detected?`,
              `How are malformed database entries or orphaned records cleaned up?`,
            ]
            : [
              `How should the system handle Unicode/emoji in ${ctx.dataTypes.includes('user data') ? 'names and addresses' : 'text fields'}? Special characters?`,
              `${ctx.dataTypes.includes('user data') ? 'What happens with disposable email addresses? Block them? Allow them?' : 'How are invalid inputs handled?'}`,
              `How are SQL injection or XSS attempts in form fields handled? Silent rejection? Logged alert?`,
            ],
        },
        Lifecycle: {
          definition: 'Transformations over the lifetime of a data entity as it is created, accessed, modified, and deleted.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability data has lifecycle considerations: certification expiry, carbon offset validity periods, supply chain audit freshness, and material composition updates.`
            : ml
            ? `ML/AI data has complex lifecycles: browsing history aging, model retraining cycles, A/B experiment conclusion, and privacy-compliant data deletion.`
            : infra
            ? `Infrastructure data has lifecycle requirements for logs, backups, and cached content.`
            : `${ctx.features.includes('compliance') ? 'Compliance requirements mention' : 'The system handles'} data deletion but doesn't specify retention policies for all data types.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `How long are sustainability certifications valid (annual renewal, expiry dates)?`,
              `When do carbon offset credits expire or need re-verification?`,
              `How often are supply chain audits refreshed (quarterly, annually)?`,
              `What happens when a product loses its organic/Fair Trade certification mid-lifecycle?`,
            ]
            : ml
            ? [
              `How long is browsing/purchase history retained for personalization? 30 days? 1 year?`,
              `What is the model retraining lifecycle (data collection → training → validation → deployment)?`,
              `How long do A/B experiments run before automatic conclusion? What triggers early termination?`,
              `When a user opts out of personalization, what historical data is deleted vs retained?`,
            ]
            : infra
            ? [
              `How long are access logs and error logs retained?`,
              `What is the backup lifecycle (creation, verification, rotation, deletion)?`,
              `How are stale cache entries identified and purged?`,
            ]
            : [
              `How long is ${ctx.dataTypes[0] || 'user data'} retained after deletion? ${ctx.dataTypes.includes('financial data') ? 'Financial records may need 7-year retention for tax compliance.' : ''}`,
              `What is the archival policy for inactive ${ctx.actors[0] || 'accounts'}? Delete? Anonymize?`,
              `Are deleted ${ctx.actors[0] || 'user'}'s ${ctx.dataTypes.includes('analytics data') ? 'analytics events' : 'associated data'} retained or purged?`,
            ],
        },
      },
      INTERFACES: {
        UserInterfaces: {
          definition: 'Any element that mediates the exchange of data with the user (e.g. displays, buttons, fields, whether physical or virtual).',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability commerce UIs display eco-badges, carbon footprint visualizations, certification logos, supply chain transparency dashboards, and responsible product filters.`
            : ml
            ? `ML personalization UIs include recommendation carousels, visual search upload, natural language search box, and privacy controls.`
            : a11y
            ? `WCAG compliance requires all UI elements to be perceivable, operable, understandable, and robust for users with disabilities.`
            : infra
            ? `Infrastructure includes admin interfaces (WordPress admin, CDN dashboard, monitoring dashboards).`
            : `${ctx.features[0] || 'Application'} pages need to work across devices and for users with disabilities.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `How are sustainability badges displayed on product cards (icon, score, label)?`,
              `What UI shows the carbon footprint calculator results at checkout?`,
              `How is the supply chain transparency visualized (map, timeline, tier diagram)?`,
              `Where are eco-filtering controls placed (sidebar, top bar, modal)?`,
            ]
            : ml
            ? [
              `What UI displays personalized recommendations (carousel, grid, infinite scroll)?`,
              `How does the visual search upload interface work (drag-drop, camera capture, file picker)?`,
              `How is the natural language search box designed? Autocomplete with product images?`,
              `Where are privacy preference controls displayed? How prominent is the opt-out option?`,
            ]
            : a11y
            ? [
              `Do all interactive elements have visible focus indicators meeting 3:1 contrast ratio?`,
              `Are all buttons, links, and controls at least 24x24 CSS pixels (WCAG 2.2 target size)?`,
              `Is there a skip-to-main-content link that appears on first Tab press?`,
            ]
            : infra
            ? [
              `What admin interfaces need testing (WordPress admin, Cloudflare dashboard, monitoring dashboards)?`,
              `How do admins interact with the staging environment vs production?`,
              `Are there CLI tools for infrastructure management that need documentation?`,
            ]
            : [
              `What responsive breakpoints must ${ctx.features[0] || 'the application'} support? Mobile-first design?`,
              `Are there keyboard navigation requirements for ${ctx.features[0] || 'key workflows'}?`,
              `What WCAG compliance level is required? What screen readers must be supported?`,
            ],
        },
        SystemInterfaces: {
          definition: 'Any interface with something other than a user, such as engineering logs, other programs, hard disk, network, etc.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability systems interface with certification APIs, carbon offset providers, supply chain tracking systems, and resale platform sync services.`
            : ml
            ? `ML systems interface with feature stores, model servers, search indices, and A/B experiment services.`
            : a11y
            ? `Accessibility testing tools and assistive technologies interface with the DOM through ARIA and semantic HTML.`
            : infra
            ? `Infrastructure components interface with each other: CDN with origin, cache with database, monitoring with alerting.`
            : `The architecture mentions ${ctx.integrations.length > 0 ? ctx.integrations.slice(0, 2).join(' and ') : 'services'} but their interfaces need testing.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `How does the product catalog interface with certification verification APIs (GOTS, Fair Trade)?`,
              `What's the interface with carbon offset providers (purchase credits, track retirement)?`,
              `How does the resale platform sync interface work (inventory push, price updates)?`,
              `What data format is used for supply chain transparency data exchange (JSON, XML, EDI)?`,
            ]
            : ml
            ? [
              `How does the recommendation service interface with the product catalog database?`,
              `What's the interface between visual search and the image embedding service?`,
              `How does the search service connect to Elasticsearch/Algolia? What's the query format?`,
              `How does the A/B testing platform integrate with analytics tracking?`,
            ]
            : a11y
            ? [
              `Do all ARIA live regions announce dynamic content changes to screen readers?`,
              `Are form error messages linked to inputs with aria-describedby?`,
              `Do modal dialogs use proper aria-modal and focus trapping?`,
            ]
            : infra
            ? [
              `How does the CDN communicate with the origin server (HTTP/2, keep-alive, compression)?`,
              `What interfaces exist between WordPress and the database (connection pooling, query caching)?`,
              `How does the monitoring system collect metrics (agents, push, pull)?`,
            ]
            : [
              `What internal APIs connect ${ctx.features.slice(0, 2).join(' and ') || 'system components'}?`,
              `Are there message queues for async operations like ${ctx.features.includes('notification system') ? 'notifications' : 'background processing'}?`,
              `How do services communicate failures? Circuit breaker patterns? Health checks?`,
            ],
        },
        ApiSdk: {
          definition: 'Any programmatic interfaces or tools intended to allow the development of new applications using this product.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability commerce exposes APIs for carbon calculations, certification lookups, supply chain queries, and resale integration.`
            : ml
            ? `ML systems expose APIs for recommendations, visual search, natural language search, and A/B experiment configuration.`
            : infra
            ? `Infrastructure exposes APIs for CDN management, monitoring, and automation.`
            : `${ctx.actors.includes('developer') || ctx.actors.includes('enterprise user') ? 'API access is mentioned' : 'External integration'} but details aren't specified.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `What's the carbon footprint calculation API contract (product ID → CO2 estimate)?`,
              `What's the certification verification API (product → list of valid certifications)?`,
              `What's the supply chain transparency API (product → supplier chain data)?`,
              `What's the resale price estimation API (product condition → market value)?`,
            ]
            : ml
            ? [
              `What's the recommendation API contract? Request/response format for personalized products?`,
              `What's the visual search API? Image upload limits? Response time SLA?`,
              `What's the natural language search API? Query format? Faceting and filtering?`,
              `How are A/B experiments configured programmatically? What's the experiment API?`,
            ]
            : infra
            ? [
              `What APIs are used for CDN cache purging (Cloudflare API, custom hooks)?`,
              `Are there APIs for automated deployments and rollbacks?`,
              `What monitoring APIs are available for external integrations (Prometheus, Datadog)?`,
            ]
            : [
              `What rate limits apply to the API? Per endpoint or global?`,
              `What authentication methods does the API support? API keys? OAuth? JWT?`,
              `What API versioning strategy is used? How are breaking changes communicated?`,
            ],
        },
        ImportExport: {
          definition: 'Any functions that package data for use by a different product, or interpret data from a different product.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability data requires import/export: bulk certification data, supplier material composition files, carbon offset portfolios, and resale inventory sync.`
            : ml
            ? `ML/AI systems have import/export needs: training data ingestion, model export/import, personalization data portability (GDPR), and A/B experiment configuration sharing.`
            : infra
            ? `Infrastructure requires import/export of configurations, database backups, and migration data.`
            : `${ctx.features.includes('data export/import') || ctx.features.includes('compliance') ? 'Data portability is required' : 'Data export/import'} but format and scope aren't defined.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `What format is supplier sustainability data imported in (CSV, JSON, EDI)?`,
              `Can certification data be bulk imported from third-party registries?`,
              `What export format is used for carbon offset transaction records?`,
              `How is resale inventory synced (real-time API, batch file, webhook)?`,
            ]
            : ml
            ? [
              `Can users export their personalization data (GDPR data portability)? What format?`,
              `How are trained ML models exported for backup or migration (ONNX, TensorFlow SavedModel)?`,
              `Can A/B experiment configurations be exported/imported between environments?`,
              `What format is product catalog data imported in for search indexing (JSON, XML, CSV)?`,
            ]
            : infra
            ? [
              `What backup export formats are used (SQL dump, full disk image, incremental)?`,
              `How are WordPress configurations migrated between staging and production?`,
              `What import process is used for database restoration from backups?`,
            ]
            : [
              `What formats should ${ctx.features.includes('compliance') ? 'GDPR/compliance data export' : 'data export'} support? JSON? CSV? PDF?`,
              `Can ${ctx.actors[0] || 'users'} import ${ctx.dataTypes[0] || 'data'} from other platforms?`,
              `Can ${ctx.dataTypes.includes('transactional data') ? 'transaction history' : 'records'} be exported in bulk?`,
            ],
        },
      },
      PLATFORM: {
        ExternalHardware: {
          definition: 'Hardware components and configurations that are not part of the shipping product, but are required (or optional) for the product to work.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability commerce may require IoT devices for supply chain tracking, smart tags for product provenance, and scanning hardware for certification verification.`
            : ml
            ? `ML/AI systems require specific hardware: GPU/TPU for inference, high-memory servers for embeddings, and edge devices for real-time personalization.`
            : a11y
            ? `Accessibility testing requires specific assistive technology hardware and devices for comprehensive coverage.`
            : infra
            ? `Infrastructure depends on specific server hardware, network equipment, and storage systems.`
            : `${ctx.features[0] || 'Application'} pages need to work on various devices, but requirements aren't specified.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `What hardware reads product sustainability QR codes or NFC tags?`,
              `Are there IoT devices tracking supply chain conditions (temperature, humidity)?`,
              `What barcode/RFID scanners verify product authenticity and certifications?`,
              `What devices capture product condition for resale grading?`,
            ]
            : ml
            ? [
              `What GPU/TPU requirements exist for ML inference (visual search, embeddings)?`,
              `Are there specialized hardware accelerators for recommendation model serving?`,
              `What edge computing devices are used for real-time personalization at CDN level?`,
              `What camera hardware is supported for visual search (mobile cameras, webcams)?`,
            ]
            : a11y
            ? [
              `What screen readers are required for testing (NVDA, JAWS on Windows; VoiceOver on macOS/iOS; TalkBack on Android)?`,
              `Are magnification tools needed (Windows Magnifier, macOS Zoom, ZoomText)?`,
              `Should alternative input devices be tested (switch controls, eye trackers, head pointers)?`,
            ]
            : infra
            ? [
              `What server specifications are required (vCPU, RAM, SSD storage)?`,
              `What network infrastructure is needed (load balancer, firewall, SSL termination)?`,
              `What storage systems are used (local SSD, network-attached, object storage)?`,
            ]
            : [
              `What are minimum device specifications? (memory, screen size, CPU)`,
              `Are there network bandwidth requirements? Will ${ctx.features[0] || 'the app'} work on slow connections?`,
              `Should offline capabilities exist? Can ${ctx.actors[0] || 'users'} access ${ctx.features.includes('content management') ? 'cached content' : 'data'} without connectivity?`,
            ],
        },
        ExternalSoftware: {
          definition: 'Software components and configurations that are not a part of the shipping product, but are required (or optional) for the product to work.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability commerce depends on certification databases, carbon calculation APIs, supply chain blockchain platforms, and resale marketplace integrations.`
            : ml
            ? `ML/AI systems depend on specific software: ML frameworks (TensorFlow, PyTorch), search engines (Elasticsearch, Algolia), and computer vision APIs.`
            : a11y
            ? `Accessibility must be tested across browsers and their accessibility features (high contrast mode, reduced motion, etc.).`
            : infra
            ? `Infrastructure depends on specific software versions: WordPress, PHP, MySQL, web server.`
            : `User stories don't specify browser or platform requirements. ${ctx.integrations[0] || 'Integrations'} have specific compatibility needs.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `What certification verification databases are integrated (GOTS registry, Fair Trade database)?`,
              `What carbon calculation API is used (Carbon Interface, Climatiq, custom)?`,
              `Is blockchain used for supply chain provenance (Hyperledger, Ethereum, proprietary)?`,
              `What resale platform is integrated (ThredUp, Depop, custom marketplace)?`,
            ]
            : ml
            ? [
              `What ML framework versions are required (TensorFlow 2.x, PyTorch 2.x, ONNX Runtime)?`,
              `What search engine is used (Elasticsearch version, Algolia plan) for semantic search?`,
              `What computer vision API is used for visual search (AWS Rekognition, Google Vision, custom)?`,
              `What A/B testing platform is integrated (LaunchDarkly, Optimizely, custom)?`,
            ]
            : a11y
            ? [
              `What browser accessibility modes must be tested (high contrast, reduced motion, zoom)?`,
              `Should Windows High Contrast Mode and macOS Increase Contrast be supported?`,
              `What browser extensions for accessibility should be validated against (reader modes, font overrides)?`,
            ]
            : infra
            ? [
              `What WordPress version is required? What PHP version (7.4, 8.0, 8.1)?`,
              `What MySQL/MariaDB version is supported? Any specific configuration needs?`,
              `What web server is used (Apache, Nginx)? What version and modules?`,
            ]
            : [
              `What are the minimum supported browser versions? (Chrome, Firefox, Safari, Edge)`,
              `What ${ctx.integrations.includes('database') ? 'database versions' : 'dependencies'} must be supported? Migration considerations?`,
              `What CDN is used? Are there caching requirements that affect ${ctx.features[0] || 'behavior'}?`,
            ],
        },
        EmbeddedComponents: {
          definition: 'Libraries and other components that are embedded in your product but are produced outside your project.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability features embed third-party components: carbon calculators, certification badge widgets, supply chain visualization libraries, and resale SDKs.`
            : ml
            ? `ML/AI systems embed many third-party components: recommendation libraries, embedding models, image processing libraries, and search SDKs.`
            : a11y
            ? `Third-party components (UI libraries, widgets) must meet WCAG accessibility requirements.`
            : infra
            ? `Infrastructure includes embedded components: WordPress plugins, themes, and third-party services.`
            : `Third-party components used for ${ctx.features[0] || 'functionality'} need version tracking and security monitoring.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `What carbon footprint calculator library is embedded (npm package, SDK)?`,
              `What certification badge rendering components are used (third-party widgets)?`,
              `What supply chain visualization library displays provenance data (D3, custom)?`,
              `What resale platform SDK handles trade-in valuations?`,
            ]
            : ml
            ? [
              `What pre-trained embedding models are embedded (sentence transformers, image encoders)?`,
              `What recommendation algorithm libraries are used (Surprise, LightFM, custom)?`,
              `What image processing libraries handle visual search uploads (OpenCV, Pillow, sharp)?`,
              `What NLP libraries power natural language search (spaCy, HuggingFace, custom)?`,
            ]
            : a11y
            ? [
              `Do all third-party UI components meet WCAG 2.2 AA requirements out of the box?`,
              `What third-party widgets need accessibility remediation (date pickers, modals, carousels)?`,
              `Are embedded components (videos, maps, social widgets) accessible with captions and alternatives?`,
            ]
            : infra
            ? [
              `What WordPress plugins are installed? Which are security-critical?`,
              `What Elementor version and addons are used?`,
              `What third-party integrations are embedded (analytics, fonts, maps)?`,
            ]
            : [
              `What third-party UI component libraries are used? Version requirements?`,
              `What ${ctx.integrations[0] || 'external'} SDKs are embedded? How are updates managed?`,
              `Are there shared ${ctx.features.includes('authentication') ? 'authentication' : 'utility'} libraries across services?`,
            ],
        },
        ProductFootprint: {
          definition: 'The resources in the environment that are used, reserved, or consumed by the product.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability commerce has resource needs: storage for supply chain data, compute for carbon calculations, and bandwidth for certification verification APIs.`
            : ml
            ? `ML/AI systems have significant resource requirements: GPU memory for inference, vector storage for embeddings, and compute for real-time personalization.`
            : a11y
            ? `Accessibility impacts page weight and loading - critical for users on assistive technology with slower processing.`
            : infra
            ? `Infrastructure resource consumption affects hosting costs and scaling requirements.`
            : `Resource usage for ${ctx.features[0] || 'the application'} isn't specified. This affects hosting and scaling decisions.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `What storage is needed for supply chain transparency data (supplier records, audit logs)?`,
              `What compute resources are required for carbon footprint calculations at scale?`,
              `What API call volume is expected for certification verification (rate limits)?`,
              `What bandwidth is consumed by resale platform inventory sync?`,
            ]
            : ml
            ? [
              `What GPU memory is required for recommendation model inference?`,
              `How much vector storage is needed for product embeddings (dimensions × products)?`,
              `What is the compute cost per personalized page request?`,
              `How much storage is required for visual search image embeddings?`,
            ]
            : a11y
            ? [
              `Does heavy JavaScript affect screen reader performance? Is there a lightweight mode?`,
              `Are animations respectful of prefers-reduced-motion setting to prevent vestibular issues?`,
              `Does content load progressively or cause layout shifts (CLS) that disorient screen reader users?`,
            ]
            : infra
            ? [
              `What are the baseline memory and CPU requirements for WordPress + MySQL?`,
              `What disk space is required (WordPress files, uploads, database, backups)?`,
              `What CDN bandwidth is expected for the global audience?`,
            ]
            : [
              `What are the memory and CPU requirements for ${ctx.features[0] || 'the application'}?`,
              `What storage requirements exist for ${ctx.dataTypes[0] || 'application data'}?`,
              `What network bandwidth is consumed by ${ctx.features[0] || 'typical usage'}?`,
            ],
        },
      },
      OPERATIONS: {
        Users: {
          definition: 'The attributes of the various kinds of users (normal end users, admin users, developers using API, etc.)',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability commerce has distinct user types: eco-conscious shoppers, sustainability officers managing certifications, resale sellers, and supply chain auditors.`
            : ml
            ? `ML/AI personalization has distinct user types: logged-in users with personalization, anonymous visitors, privacy-conscious opt-out users, and ML ops teams managing models.`
            : infra
            ? `Infrastructure operations involve different operator roles: site admins, DevOps, security team.`
            : `User stories mention "${ctx.actors[0] || 'users'}" but don't detail user roles or accessibility.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `Who manages sustainability certifications (internal team, third-party)?`,
              `Who uploads and verifies supply chain transparency data?`,
              `Who grades and lists pre-loved items for resale?`,
              `Who monitors carbon offset purchases and credit retirement?`,
            ]
            : ml
            ? [
              `How does personalization differ for logged-in users vs anonymous visitors?`,
              `What user attributes are used for personalization (browsing history, demographics, location)?`,
              `How do privacy-conscious users experience the product when personalization is disabled?`,
              `Who manages ML models (data scientists, ML ops)? What permissions do they need?`,
            ]
            : infra
            ? [
              `Who has access to WordPress admin? CDN dashboard? Monitoring systems?`,
              `What are the permission levels for different infrastructure operators?`,
              `Who is responsible for security updates vs content updates?`,
            ]
            : [
              `Are there ${ctx.actors.includes('administrator') ? 'different admin levels' : 'admin/moderator roles'} beyond regular users? What permissions do they have?`,
              `What accessibility accommodations are required? Screen reader support? High contrast mode?`,
              `Are there ${ctx.actors.includes('enterprise user') ? 'B2B users with different workflows than B2C users' : 'different user personas to consider'}?`,
            ],
        },
        Environment: {
          definition: 'The physical environment in which the product operates, including such elements as noise, light, and distractions.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability features operate across environments: in-store scanning for eco-labels, warehouse for resale grading, and supply chain facilities for audits.`
            : ml
            ? `ML/AI features operate in varied environments: visual search needs good camera lighting, voice search needs low noise, personalization needs connectivity.`
            : infra
            ? `Infrastructure operates in specific environments: data centers, cloud regions, CDN edges.`
            : `The operating environment for ${ctx.features[0] || 'the application'} may affect usability.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `Where is product condition assessed for resale (warehouse, in-store, customer home)?`,
              `What conditions exist for supply chain audits (factory floor, outdoor farms)?`,
              `How are sustainability QR codes scanned in retail environments (lighting, angles)?`,
              `What regional sustainability regulations affect feature availability (EU, US, APAC)?`,
            ]
            : ml
            ? [
              `What lighting conditions must visual search support (indoor, outdoor, low-light)?`,
              `Does voice/natural language search need to work in noisy environments?`,
              `How does personalization work on slow/intermittent connections (planes, subways)?`,
              `Are there regional/cultural factors affecting recommendation relevance?`,
            ]
            : infra
            ? [
              `What cloud region/data center hosts the origin server?`,
              `What geographic locations must CDN edge nodes cover for the global audience?`,
              `What environmental factors affect performance (network latency, regional regulations)?`,
            ]
            : [
              `In what environments will ${ctx.actors[0] || 'users'} use ${ctx.features[0] || 'the application'}? (office, mobile, public)`,
              `Are there environmental factors affecting ${ctx.features.includes('authentication') ? 'authentication' : 'usage'}? (lighting for cameras, noise for voice)`,
              `How does ${ctx.features[0] || 'the application'} perform in low-connectivity environments?`,
            ],
        },
        CommonUse: {
          definition: 'Patterns and sequences of input that the product will typically encounter.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability features have typical patterns: browsing eco-collections, filtering by certifications, calculating carbon at checkout, and listing pre-loved items.`
            : ml
            ? `ML/AI has typical usage patterns: homepage personalization on every visit, search autocomplete on keystroke, recommendation carousels during browsing.`
            : infra
            ? `Infrastructure has typical operational patterns: daily backups, weekly updates, monitoring cycles.`
            : `While individual features are specified, the complete ${ctx.actors[0] || 'user'} journey isn't detailed.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `What is the typical journey for eco-conscious shoppers (filter → compare → purchase)?`,
              `How often do users check product sustainability scores before buying?`,
              `What is the common flow for listing pre-loved items (photo → grade → price → list)?`,
              `How frequently is carbon offset selected at checkout?`,
            ]
            : ml
            ? [
              `What is the typical personalized homepage viewing journey?`,
              `How often do users interact with recommendation carousels (scroll, click)?`,
              `What is the typical search query pattern (autocomplete → results → refinement)?`,
              `How frequently do returning users see personalized content vs first-time visitors?`,
            ]
            : infra
            ? [
              `What is the typical update/maintenance cycle (daily, weekly, monthly)?`,
              `How often are backups verified and tested?`,
              `What is the normal monitoring and alerting review process?`,
            ]
            : [
              `What is the typical ${ctx.actors[0] || 'user'} journey for ${ctx.features[0] || 'key tasks'}? What touchpoints exist?`,
              `What are the most frequently used features? This affects testing priority.`,
              `How do most ${ctx.actors[0] || 'users'} discover and engage with ${ctx.features[0] || 'the product'}?`,
            ],
        },
        UncommonUse: {
          definition: 'Occasional or periodic expected activity (backup, updates, report generation, downtime for maintenance).',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability has periodic operations: annual certification renewals, supply chain re-audits, carbon offset reconciliation, and resale inventory cleanup.`
            : ml
            ? `ML/AI has uncommon but critical operations: model retraining, A/B experiment conclusion, privacy opt-out processing, and seasonal content updates.`
            : infra
            ? `Infrastructure has uncommon but critical operations: disaster recovery, major upgrades, security incidents.`
            : `Edge cases in ${ctx.features[0] || 'application'} flows need specific handling.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `How often are sustainability certifications renewed? What's the renewal workflow?`,
              `How frequently are supply chain audits conducted and data refreshed?`,
              `What happens when carbon offset credits need annual reconciliation?`,
              `How are stale resale listings cleaned up (items not sold for 90+ days)?`,
            ]
            : ml
            ? [
              `How often are recommendation models retrained? What triggers retraining?`,
              `What happens when an A/B experiment concludes and winner is deployed globally?`,
              `How are "Shop by Occasion" collections updated for seasonal changes (Valentine's → Easter)?`,
              `How is user personalization data purged when they opt out?`,
            ]
            : infra
            ? [
              `What is the disaster recovery procedure? How often is it tested?`,
              `How are major WordPress/PHP version upgrades handled?`,
              `What is the incident response process for security breaches?`,
            ]
            : [
              `What happens if ${ctx.actors[0] || 'a user'} tries to ${ctx.actions[0] || 'perform an action'} that's already been completed?`,
              `How do ${ctx.actors[0] || 'users'} recover from failed ${ctx.actions.includes('process') ? 'processes' : 'operations'}? Retry logic? Support escalation?`,
              `Can ${ctx.actors[0] || 'users'} modify ${ctx.dataTypes.includes('user data') ? 'their email/credentials' : 'critical data'}? What verification is required?`,
            ],
        },
        ExtremeUse: {
          definition: 'Challenging patterns and sequences of input that are consistent with the intended use of the product.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability features face extreme conditions: Earth Day traffic spikes, viral eco-campaigns, mass resale submissions, and bulk certification uploads.`
            : ml
            ? `ML/AI systems face extreme conditions: Black Friday traffic spikes, viral product searches, many concurrent visual search uploads, and recommendation coldstart for new users.`
            : infra
            ? `Infrastructure must handle extreme load conditions: traffic spikes, DDoS attempts, viral content.`
            : `${ctx.features[0] || 'The system'} may experience load spikes during ${ctx.features.includes('payment processing') ? 'promotions or renewal cycles' : 'peak usage'}.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `How does the system handle Earth Day/sustainability awareness event traffic spikes?`,
              `What happens when a viral eco-campaign causes mass carbon offset purchases?`,
              `How many concurrent resale photo uploads can be processed?`,
              `How does bulk certification data upload perform (10,000+ products)?`,
            ]
            : ml
            ? [
              `How does personalization perform during Black Friday/Cyber Monday traffic spikes?`,
              `What happens when a viral product gets thousands of searches simultaneously?`,
              `How many concurrent visual search uploads can be processed?`,
              `How does recommendation handle new users with no browsing history (cold start)?`,
            ]
            : infra
            ? [
              `What is the expected peak traffic? How does CDN handle traffic spikes?`,
              `What DDoS protection is in place? At what threshold does it activate?`,
              `How does the database handle connection storms during peak load?`,
            ]
            : [
              `What is expected peak concurrent ${ctx.actors[0] || 'users'}? During ${ctx.features.includes('payment processing') ? 'promotions or renewal cycles' : 'peak periods'}?`,
              `How many API requests per minute should ${ctx.features[0] || 'the system'} handle?`,
              `What happens during traffic spikes? Auto-scaling? Graceful degradation?`,
            ],
        },
        DisfavoredUse: {
          definition: 'Patterns of input produced by ignorant, mistaken, careless or malicious use.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability features face abuse: greenwashing claims, fake certification badges, fraudulent resale listings, and carbon offset credit fraud.`
            : ml
            ? `ML/AI systems face abuse: recommendation gaming, search manipulation, visual search with inappropriate images, and A/B experiment manipulation.`
            : infra
            ? `Infrastructure is a target for attacks: brute force, DDoS, WordPress-specific exploits.`
            : `${ctx.features.includes('payment processing') || ctx.features.includes('authentication') ? 'Payment and authentication' : ctx.features[0] || 'The'} systems are targets for fraud and abuse.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `How is greenwashing prevented (unverified sustainability claims)?`,
              `How are fake certification badges detected (counterfeit logos, expired certs)?`,
              `How are fraudulent resale listings blocked (misrepresented condition, stolen items)?`,
              `How is carbon offset credit fraud prevented (double-spending, fake retirements)?`,
            ]
            : ml
            ? [
              `How is recommendation gaming prevented (fake clicks, coordinated manipulation)?`,
              `How are inappropriate/illegal images blocked in visual search?`,
              `How is search query abuse prevented (injection attacks, scraping queries)?`,
              `How are A/B experiments protected from manipulation (client-side spoofing)?`,
            ]
            : infra
            ? [
              `What protections exist against WordPress brute-force login attempts?`,
              `How are known malicious IPs and bot patterns blocked?`,
              `What vulnerability scanning is performed against plugins and themes?`,
            ]
            : [
              `What abuse scenarios should be prevented? ${ctx.features.includes('authentication') ? 'Credential stuffing? Account sharing?' : 'Scraping? Automation?'}`,
              `Are there ${ctx.features.includes('payment processing') ? 'fraud detection' : 'abuse detection'} requirements?`,
              `How are ${ctx.features.includes('payment processing') ? 'chargebacks and disputes' : 'malicious actions'} handled? Prevention measures?`,
            ],
        },
      },
      TIME: {
        TimeRelatedData: {
          definition: 'Time-out settings; time zones; business holidays; terms and warranty periods; chronograph functions.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability timing is critical: certification expiry dates, carbon offset validity periods, supply chain audit schedules, and resale listing durations.`
            : ml
            ? `ML/AI timing is critical: recommendation freshness windows, A/B experiment duration, seasonal occasion calendars, and personalization data aging.`
            : infra
            ? `Infrastructure timing affects cache expiry, SSL certificates, scheduled tasks, and log rotation.`
            : `${ctx.dataTypes.includes('transactional data') ? 'Billing dates and renewals' : 'Time-sensitive data'} are timezone-dependent.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `What timezone determines sustainability certification expiry dates?`,
              `How long are carbon offset credits valid (12 months, perpetual)?`,
              `What is the supply chain audit validity period (annual, biannual)?`,
              `How long do resale listings remain active before auto-archival?`,
            ]
            : ml
            ? [
              `How fresh must recommendations be? Real-time or batched (hourly/daily)?`,
              `What timezone determines "Shop by Occasion" calendar events (Valentine's Day, Mother's Day)?`,
              `How long do A/B experiments run? Minimum duration for statistical significance?`,
              `When does browsing history "age out" and stop influencing recommendations?`,
            ]
            : infra
            ? [
              `When do SSL certificates expire? Is there automated renewal?`,
              `What timezone are scheduled tasks (backups, cleanup) configured for?`,
              `What is the cache expiry policy for different content types?`,
            ]
            : [
              `In what timezone are ${ctx.dataTypes.includes('transactional data') ? 'billing dates' : 'timestamps'} calculated? UTC? User's local timezone?`,
              `How are ${ctx.features[0] || 'operations'} handled across daylight saving time changes?`,
              `What happens if a scheduled date falls on a weekend/holiday? Or Feb 29?`,
            ],
        },
        InputOutputTiming: {
          definition: 'When input is provided, when output created, and any timing relationships (delays, intervals, etc.) among them.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability has timing constraints: carbon calculation must complete before checkout, certification verification API response times, and resale valuation latency.`
            : ml
            ? `ML/AI has strict latency requirements: search autocomplete must be instant, visual search has upload-to-results timing, recommendations have page load budgets.`
            : infra
            ? `Infrastructure timing includes CDN propagation, cache warming, and monitoring intervals.`
            : `${ctx.integrations[0] || 'External integrations'} have timeout and retry considerations.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `What is the latency budget for carbon footprint calculation at checkout?`,
              `How quickly must certification verification API respond (under 500ms)?`,
              `What is acceptable resale valuation response time (photo upload → price estimate)?`,
              `How long does supply chain data sync take (batch, real-time)?`,
            ]
            : ml
            ? [
              `What is the latency SLA for search autocomplete (under 100ms)?`,
              `What is the acceptable visual search processing time (upload → results)?`,
              `How long can recommendation API calls take before the page loads without them?`,
              `What is the A/B experiment assignment latency budget (must complete before page render)?`,
            ]
            : infra
            ? [
              `How long does CDN cache invalidation take to propagate globally?`,
              `What is the monitoring polling interval? How quickly are issues detected?`,
              `How long does database backup and restoration take?`,
            ]
            : [
              `What is the timeout for ${ctx.integrations[0] || 'external API'} responses? What happens on timeout?`,
              `How long should ${ctx.features.includes('notification system') ? 'notification' : 'webhook'} retries continue before giving up?`,
              `What is the SLA for ${ctx.features.includes('notification system') ? 'notification delivery' : 'response times'}?`,
            ],
        },
        Pacing: {
          definition: 'Testing with fast or slow input; variations of fast and slow (spikes, bursts, hangs, bottlenecks); interrupting or letting it sit.',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability pacing varies: rapid eco-filter toggling, slow certification data uploads, burst carbon calculations during peak checkout, and batch supply chain imports.`
            : ml
            ? `ML/AI pacing varies: rapid-fire search queries, slow image uploads, burst recommendation requests during page loads, and gradual model inference.`
            : infra
            ? `Infrastructure performance targets include Core Web Vitals thresholds and response time SLAs.`
            : `${ctx.features[0] || 'Application'} operations have implicit timing requirements.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `How does the UI handle rapid eco-filter toggling (debounce, queued requests)?`,
              `What happens during slow certification data bulk uploads (progress, timeout)?`,
              `How are carbon calculations paced during checkout (blocking vs async)?`,
              `What batch windows exist for supply chain data imports (off-peak)?`,
            ]
            : ml
            ? [
              `How does search handle rapid-fire typing (debounce vs keystroke-by-keystroke)?`,
              `What happens during slow image uploads for visual search (progress, timeout, retry)?`,
              `How are recommendation requests paced across page sections (all at once or lazy load)?`,
              `What batch processing windows exist for model retraining (off-peak hours)?`,
            ]
            : infra
            ? [
              `What is the target LCP (Largest Contentful Paint) time? Under 2.5 seconds?`,
              `What is the expected Time to First Byte (TTFB) from origin and CDN?`,
              `How quickly should static assets load from CDN edge locations?`,
            ]
            : [
              `What are expected response times for ${ctx.features[0] || 'key operations'}? Under 3 seconds?`,
              `Are there batch processing windows for ${ctx.features.includes('subscription management') ? 'renewals' : 'scheduled tasks'}?`,
              `How quickly should ${ctx.actors[0] || 'users'} see updates after ${ctx.actions[0] || 'making changes'}?`,
            ],
        },
        Concurrency: {
          definition: 'More than one thing happening at once (multi-user, time-sharing, threads, and semaphores, shared data).',
          rationale: (ctx, infra, a11y, ml, sust) => sust
            ? `Sustainability has concurrency challenges: simultaneous certification updates, parallel resale listings, concurrent carbon offset purchases, and race conditions in inventory sync.`
            : ml
            ? `ML/AI has complex concurrency: simultaneous recommendation requests, parallel model inference, concurrent A/B experiment assignments, and race conditions in personalization state.`
            : infra
            ? `Infrastructure handles concurrent operations: multiple requests, parallel backups, simultaneous updates.`
            : `${ctx.actors[0] || 'Users'} may access ${ctx.features[0] || 'the system'} from multiple devices simultaneously.`,
          questions: (ctx, infra, a11y, ml, sust) => sust
            ? [
              `How are concurrent certification updates handled (same product, different certs)?`,
              `What happens when multiple sellers list the same resale item simultaneously?`,
              `How is carbon offset inventory protected from overselling (concurrent purchases)?`,
              `What race conditions exist in resale platform inventory sync?`,
            ]
            : ml
            ? [
              `How many concurrent recommendation requests can be processed?`,
              `What happens when multiple model versions serve simultaneously during rollout?`,
              `How is A/B experiment assignment synchronized across user devices?`,
              `What race conditions exist when personalization data updates mid-session?`,
            ]
            : infra
            ? [
              `How many concurrent database connections are supported?`,
              `Can backups run while the site is under load without affecting performance?`,
              `How are concurrent admin operations (plugin updates, content edits) handled?`,
            ]
            : [
              `What happens if the same ${ctx.actors[0] || 'user'} logs in from multiple devices? Single session? Multiple allowed?`,
              `How are concurrent modifications to ${ctx.dataTypes[0] || 'shared data'} handled?`,
              `Can multiple ${ctx.actors.includes('enterprise user') ? 'team members' : 'users'} use the same ${ctx.features.includes('subscription management') ? 'subscription' : 'resource'} simultaneously?`,
            ],
        },
      },
    };

    // Get templates for this category
    const categoryTemplates = subcategoryTemplates[category];
    if (!categoryTemplates) return result;

    // Count tests per subcategory
    // Support both TestCase (htsm.primary.subcategory) and TestOpportunity (htsmSubcategory)
    const subcategoryCounts: Record<string, number> = {};
    categoryTests.forEach(tc => {
      const sub = 'htsmSubcategory' in tc ? tc.htsmSubcategory : tc.htsm.primary.subcategory;
      subcategoryCounts[sub] = (subcategoryCounts[sub] || 0) + 1;
    });

    // Generate questions for missing or low-coverage subcategories
    // Use LLM when available for context-aware questions, fall back to templates
    const subcategoryEntries = Object.entries(categoryTemplates);

    for (const [subcategory, template] of subcategoryEntries) {
      const count = subcategoryCounts[subcategory] || 0;

      if (count === 0 || count < 3) {
        // Try LLM-based generation first (using inherited BaseAgent LLM)
        if (this.hasLLM() && this.rawInputContent) {
          try {
            const llmResult = await this.generateClarifyingQuestionsWithLLM(
              category,
              subcategory,
              template.definition,
              count
            );

            if (llmResult.rationale && llmResult.questions.length > 0) {
              // Use LLM-generated questions
              result.questions.push({
                subcategory,
                rationale: llmResult.rationale,
                questions: count === 0 ? llmResult.questions : [llmResult.questions[0]],
              });
              continue; // Skip template fallback
            }
          } catch (error) {
            console.warn(`[ProductFactorsAssessment] LLM question generation failed for ${subcategory}, using template`);
          }
        }

        // Fall back to template-based questions
        if (count === 0) {
          // No coverage - add all questions with full rationale
          result.questions.push({
            subcategory,
            rationale: template.rationale(context, isInfra, isA11y, isML, isSust),
            questions: template.questions(context, isInfra, isA11y, isML, isSust),
          });
        } else {
          // Limited coverage - add first question with rationale
          const questions = template.questions(context, isInfra, isA11y, isML, isSust);
          result.questions.push({
            subcategory,
            rationale: template.rationale(context, isInfra, isA11y, isML, isSust),
            questions: [questions[0]],
          });
        }
      }
    }

    return result;
  }

  /**
   * Format output as Markdown
   */
  private async formatAsMarkdown(
    testSuite: TestSuite,
    htsmAnalysis: Map<HTSMCategory, HTSMAnalysisResult>,
    userStories: UserStory[],
    assessmentName?: string
  ): Promise<string> {
    const lines: string[] = [];
    const categories: HTSMCategory[] = ['STRUCTURE', 'FUNCTION', 'DATA', 'INTERFACES', 'PLATFORM', 'OPERATIONS', 'TIME'];

    // Calculate priority counts per category
    const priorityByCategory: Record<string, { P0: number; P1: number; P2: number; P3: number }> = {};
    const totalPriority = { P0: 0, P1: 0, P2: 0, P3: 0 };

    categories.forEach(cat => {
      priorityByCategory[cat] = { P0: 0, P1: 0, P2: 0, P3: 0 };
    });

    testSuite.tests.forEach(tc => {
      const cat = tc.htsm.primary.category;
      const priority = tc.priority as 'P0' | 'P1' | 'P2' | 'P3';
      if (priorityByCategory[cat] && totalPriority[priority] !== undefined) {
        priorityByCategory[cat][priority]++;
        totalPriority[priority]++;
      }
    });

    // Calculate automation fitness distribution
    const automationDist: Record<string, number> = {};
    testSuite.tests.forEach(tc => {
      const fitness = this.determineAutomationFitness(tc);
      const key = fitness.split(' ')[0] + ' ' + (fitness.split(' ')[1] || ''); // Simplify key
      automationDist[key] = (automationDist[key] || 0) + 1;
    });

    // Generate descriptive title from assessment name or test suite name
    // Fix: Only add space before capitals that follow lowercase (camelCase), preserving acronyms like "AI"
    const displayName = assessmentName
      ? assessmentName.replace(/-/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim()
      : testSuite.name;
    lines.push(`# Product Factors Assessment: ${displayName}`);
    lines.push('');
    lines.push('This report contains the assessment based on Product Factors (SFDIPOT) heuristic in [HTSM](https://www.satisfice.com/download/heuristic-test-strategy-model) by James Bach. In this report you will find:');
    lines.push('');
    lines.push('- [x] **The Test Ideas** - generated for each product factor based on applicable subcategories.');
    lines.push('- [x] **Automation Fitness** - recommendations against each test idea that testers can consider for drafting suitable automation strategy.');
    lines.push('- [x] **The Clarifying Questions to address potential coverage gaps** - that surface "unknown unknowns" by systematically checking which Product Factors (SFDIPOT) subcategories lack test coverage.');
    lines.push('');
    lines.push('All in all, this report represents important and unique elements to be considered in the test strategy. Testers are advised to carefully evaluate all the information using critical thinking and context awareness.');
    lines.push('');

    // When to generate this report?
    lines.push('<details>');
    lines.push('<summary><strong>When to generate this report?</strong></summary>');
    lines.push('');
    lines.push('The sooner the better! As soon as testers can access Epic/User Stories or any project artifact they use for test design, this report should be generated. Generate this report and organize "Product Coverage Session" discussion with relevant stakeholders such as programmers, Product Owners, Designers, Architects etc.');
    lines.push('');
    lines.push('</details>');
    lines.push('');

    // How to use this report?
    lines.push('<details>');
    lines.push('<summary><strong>How to use this report?</strong></summary>');
    lines.push('');
    lines.push('In this report you will find:');
    lines.push('');
    lines.push('- [ ] **The Test Ideas** generated for each product factor based on applicable subcategories. Review these test ideas carefully for context relevance, applicability and then derive specific test cases where needed.');
    lines.push('- [ ] **Automation Fitness** recommendations against each test idea that can help for drafting suitable automation strategy.');
    lines.push('- [ ] **The Clarifying Questions** - that surface "unknown unknowns" by systematically checking which Product Factors (SFDIPOT) subcategories lack test coverage. Ensure that Epics, User Stories, Acceptance Criteria etc. are readily updated based on answers derived for each clarifying question listed.');
    lines.push('');
    lines.push('> **Rebuild this report if there are updates made in Epics, User Stories, Acceptance Criteria etc.**');
    lines.push('');
    lines.push('</details>');
    lines.push('');

    // How can this report help you? - Guidance Section
    lines.push('---');
    lines.push('');
    lines.push('## How Can This Report Help You?');
    lines.push('');
    lines.push('> *"Requirements are not an end in themselves, but a means to an end—the end of providing value to some person(s)."* — Jerry Weinberg');
    lines.push('');
    lines.push('In the **QCSD framework**, it is recommended to conduct **Product Coverage Sessions** or **Requirements Engineering Sessions** on a regular basis. These sessions can be carried out at the epic level or for complex feature requests and user stories. Testers in the team can analyze the epic or feature story using **SFDIPOT** (a product factors checklist from Heuristic Test Strategy Model by James Bach) and come up with test ideas, questions about risks, missing information, unconsidered dependencies, identified risks, and more.');
    lines.push('');
    lines.push('A guided discussion based on this analysis can help teams:');
    lines.push('- 🔍 **Uncover hidden risks** before development begins');
    lines.push('- ✅ **Assess the completeness** of the requirements');
    lines.push('- 📋 **Create a clearer development plan** with better information');
    lines.push('- 🔗 **Identify gaps and dependencies** early');
    lines.push('- 📊 **Improve estimation** with better information at hand');
    lines.push('- 💰 **Avoid rework** caused by discovering issues halfway through development');
    lines.push('');
    lines.push('> **If we want to save time and cost while still delivering quality software, it is always cheaper to do things right the first time.** The purpose of this report is to facilitate Product Coverage Sessions and help teams achieve exactly that: *doing things right the first time.*');
    lines.push('');
    lines.push('### Quick Reference');
    lines.push('');
    lines.push('This Product Factors Assessment provides actionable insights for your testing strategy:');
    lines.push('');
    lines.push('| Question | Answer |');
    lines.push('|----------|--------|');
    lines.push('| **What should I test first?** | Focus on P0 (Critical) and P1 (High) priority test ideas - these cover security, authentication, and core business flows that must work correctly. |');
    lines.push('| **How do I plan my test automation?** | Use the Automation Fitness ratings to identify candidates for immediate automation vs. manual testing vs. exploratory testing. |');
    lines.push('| **Are there gaps in my requirements?** | Review the Clarifying Questions section - these highlight "unknown unknowns" where requirements may need clarification before testing. |');
    lines.push('');
    lines.push('### What Should You Do Next?');
    lines.push('');
    lines.push('1. **Review Priority Distribution** - Ensure P0/P1 test ideas align with your release risk tolerance');
    lines.push('2. **Check Coverage Gaps** - Address any SFDIPOT categories with low coverage before testing begins');
    lines.push('3. **Answer Clarifying Questions** - Work with stakeholders to resolve unknowns before writing test cases');
    lines.push('4. **Plan Automation** - Use automation fitness ratings to build your automation pyramid');
    lines.push('5. **Customize Test Ideas** - Adapt generated test ideas to your specific context and constraints');
    lines.push('');
    lines.push('### Where Should You Focus First?');
    lines.push('');

    // Dynamic focus recommendations based on actual data
    const highestRiskCategory = categories.reduce((max, cat) => {
      const prio = priorityByCategory[cat];
      const riskScore = prio.P0 * 4 + prio.P1 * 3 + prio.P2 * 2 + prio.P3;
      const maxPrio = priorityByCategory[max];
      const maxScore = maxPrio.P0 * 4 + maxPrio.P1 * 3 + maxPrio.P2 * 2 + maxPrio.P3;
      return riskScore > maxScore ? cat : max;
    }, categories[0]);

    const p0Categories = categories.filter(cat => priorityByCategory[cat].P0 > 0);

    if (p0Categories.length > 0) {
      lines.push(`- **Critical Areas (P0)**: ${p0Categories.join(', ')} - These categories contain security or critical functionality tests`);
    }
    lines.push(`- **Highest Risk Category**: ${highestRiskCategory} - Contains the most high-priority test ideas`);
    if (totalPriority.P0 + totalPriority.P1 > 0) {
      lines.push(`- **Must-Test Count**: ${totalPriority.P0 + totalPriority.P1} test ideas rated P0/P1 should be executed before release`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');

    // Assessment Summary section
    lines.push('## Assessment Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| **Generated** | ${testSuite.generatedAt} |`);
    lines.push(`| **Total Test Ideas** | ${testSuite.tests.length} |`);
    lines.push(`| **SFDIPOT Coverage** | ${testSuite.htsmCoverage.overall}% |`);
    lines.push(`| **Traceability** | ${testSuite.traceabilityMatrix.coverage}% |`);
    lines.push('');

    // Priority Distribution
    const total = testSuite.tests.length;
    lines.push('### Priority Distribution');
    lines.push('');
    lines.push('| Priority | Count | Percentage | Risk Level |');
    lines.push('|----------|-------|------------|------------|');
    lines.push(`| **P0 (Critical)** | ${totalPriority.P0} | ${((totalPriority.P0 / total) * 100).toFixed(1)}% | Security, auth, data protection |`);
    lines.push(`| **P1 (High)** | ${totalPriority.P1} | ${((totalPriority.P1 / total) * 100).toFixed(1)}% | Core business flows |`);
    lines.push(`| **P2 (Medium)** | ${totalPriority.P2} | ${((totalPriority.P2 / total) * 100).toFixed(1)}% | Supporting features |`);
    lines.push(`| **P3 (Low)** | ${totalPriority.P3} | ${((totalPriority.P3 / total) * 100).toFixed(1)}% | Edge cases |`);
    lines.push('');

    // About section - extract context from user stories
    lines.push('---');
    lines.push('');
    lines.push('## About This Assessment');
    lines.push('');

    // Extract features and components from user stories
    const allFeatures: string[] = [];
    const allComponents: string[] = [];
    let productDescription = '';

    userStories.forEach(story => {
      // Build description from user story format (asA, iWant, soThat)
      if (!productDescription && story.iWant) {
        productDescription = `As ${story.asA}, ${story.iWant}${story.soThat ? ` so that ${story.soThat}` : ''}`;
        if (productDescription.length > 200) {
          productDescription = productDescription.substring(0, 200) + '...';
        }
      }
      // Extract acceptance criteria descriptions
      if (story.acceptanceCriteria && Array.isArray(story.acceptanceCriteria)) {
        story.acceptanceCriteria.slice(0, 5).forEach(ac => {
          if (ac.description && ac.description.length < 80) {
            allFeatures.push(ac.description);
          }
        });
      }
    });

    // Extract unique components from test cases
    const componentSet = new Set<string>();
    testSuite.tests.forEach(tc => {
      if (tc.htsm.primary.subcategory === 'Service' || tc.htsm.primary.subcategory === 'Code') {
        const match = tc.name.match(/(?:that|with)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?(?:\s+Service)?)/);
        if (match) componentSet.add(match[1]);
      }
    });
    componentSet.forEach(comp => allComponents.push(comp));

    if (productDescription) {
      lines.push(`**Description:** ${productDescription}`);
      lines.push('');
    }

    if (allFeatures.length > 0) {
      lines.push('**Key Features Assessed:**');
      allFeatures.slice(0, 8).forEach(f => lines.push(`- ${f}`));
      lines.push('');
    }

    if (allComponents.length > 0) {
      lines.push('**Technical Components Identified:**');
      lines.push('');
      lines.push('| Component | Type |');
      lines.push('|-----------|------|');
      allComponents.slice(0, 10).forEach(comp => {
        const type = comp.includes('Service') ? 'Service' : comp.includes('Database') ? 'Database' : 'Module';
        lines.push(`| ${comp} | ${type} |`);
      });
      lines.push('');
    }

    // Coverage summary with priority breakdown
    lines.push('---');
    lines.push('');
    lines.push('## Product Factors (SFDIPOT) Coverage');
    lines.push('');
    lines.push('| Category | Tests | P0 | P1 | P2 | P3 | Coverage |');
    lines.push('|----------|-------|----|----|----|----|----------|');

    categories.forEach(category => {
      const data = testSuite.htsmCoverage.byCategory[category];
      const prio = priorityByCategory[category];
      if (data) {
        const progressBar = this.generateTextProgressBar(data.coverage);
        lines.push(`| **${category}** | ${data.testCount} | ${prio.P0} | ${prio.P1} | ${prio.P2} | ${prio.P3} | ${progressBar} ${data.coverage}% |`);
      }
    });

    lines.push(`| **TOTAL** | **${total}** | **${totalPriority.P0}** | **${totalPriority.P1}** | **${totalPriority.P2}** | **${totalPriority.P3}** | **${testSuite.htsmCoverage.overall}%** |`);
    lines.push('');

    // Review needed - requirements either need review or product factor not applicable
    if (testSuite.htsmCoverage.gaps.length > 0) {
      lines.push('## Review Needed');
      lines.push('');
      lines.push('*The following areas have limited coverage. Review each to determine if the product factor applies or confirm it is not relevant:*');
      lines.push('');
      testSuite.htsmCoverage.gaps.forEach((gap) => {
        lines.push(`- **[${gap.severity.toUpperCase()}]** ${gap.category}: ${gap.recommendation}`);
      });
      lines.push('');
    }

    // Risk-Based Priority explanation
    lines.push('## Risk-Based Prioritization');
    lines.push('');
    lines.push('Test ideas are prioritized using a **risk-based approach** that considers:');
    lines.push('');
    lines.push('1. **Business Impact**: Potential revenue loss, customer trust damage, or regulatory penalties');
    lines.push('2. **Likelihood of Failure**: Complexity of implementation, external dependencies, new technology');
    lines.push('3. **User Exposure**: Number of users affected and frequency of feature usage');
    lines.push('4. **Security & Compliance**: Data protection requirements, payment processing, legal obligations');
    lines.push('');
    lines.push('### Priority Legend');
    lines.push('');
    // Generate contextual examples from actual test cases
    const priorityExamples = this.generatePriorityExamples(testSuite.tests);
    lines.push('| Priority | Risk Level | Description | Examples from this Epic |');
    lines.push('|----------|------------|-------------|------------------------|');
    lines.push(`| **P0** | Critical | Security vulnerabilities or core functionality that could cause immediate financial loss, data breach, or complete service failure. Must be tested before any release. | ${priorityExamples.P0 || 'Security testing, authentication'} |`);
    lines.push(`| **P1** | High | Core business flows and integrations essential for revenue generation. Failures would significantly impact user experience or business operations. | ${priorityExamples.P1 || 'Core business flows, API integrations'} |`);
    lines.push(`| **P2** | Medium | Important features that support the core experience. Failures would cause inconvenience but workarounds exist. | ${priorityExamples.P2 || 'UI components, notifications'} |`);
    lines.push(`| **P3** | Low | Edge cases, cosmetic issues, or rarely used features. Failures have minimal business impact. | ${priorityExamples.P3 || 'Edge cases, minor variations'} |`);
    lines.push('');

    // Test ideas by category
    lines.push('## Test Ideas');
    lines.push('');

    // Product Factors (SFDIPOT) Category descriptions based on James Bach's HTSM v6.3
    const categoryDescriptions: Record<HTSMCategory, string> = {
      STRUCTURE: 'Test ideas for everything that comprises the physical product',
      FUNCTION: 'Test ideas for everything that the product does',
      DATA: 'Test ideas for everything that the product processes',
      INTERFACES: 'Test ideas for every conduit by which the product is accessed or accesses other things',
      PLATFORM: 'Test ideas for everything on which the product depends that is outside the project',
      OPERATIONS: 'Test ideas for how the product will be used',
      TIME: 'Test ideas for any relationship between the product and time',
    };

    // Collect all clarifying questions for the global summary
    const allClarifyingQuestions: Array<{
      category: HTSMCategory;
      subcategory: string;
      rationale: string;
      questions: string[];
    }> = [];

    // Use for...of to support async/await for LLM-based question generation
    for (const category of categories) {
      const categoryTests = testSuite.tests.filter(
        (tc) => tc.htsm.primary.category === category
      );

      if (categoryTests.length > 0) {
        lines.push(`### ${category}: ${categoryDescriptions[category]} (${categoryTests.length} test ideas)`);
        lines.push('');
        lines.push('| ID | Priority | Subcategory | Test Idea | Automation Fitness |');
        lines.push('|----|----------|-------------|-----------|-------------------|');

        categoryTests.forEach((tc) => {
          const automationFitness = this.determineAutomationFitness(tc);
          lines.push(
            `| ${tc.id} | ${tc.priority} | ${tc.htsm.primary.subcategory} | ${tc.name} | ${automationFitness} |`
          );
        });
        lines.push('');

        // Add clarifying questions section with rationale (async for LLM)
        const clarifyingData = await this.generateClarifyingQuestions(category, categoryTests, userStories);
        if (clarifyingData.questions.length > 0) {
          lines.push('#### Clarifying Questions to address potential coverage gaps');
          lines.push('');
          lines.push(clarifyingData.preamble);
          lines.push('');

          clarifyingData.questions.forEach((item) => {
            // Collect for global summary
            allClarifyingQuestions.push({
              category,
              subcategory: item.subcategory,
              rationale: item.rationale,
              questions: item.questions,
            });

            lines.push(`**[${item.subcategory}]**`);
            lines.push('');
            lines.push(`*Rationale: ${item.rationale}*`);
            lines.push('');
            item.questions.forEach((question) => {
              lines.push(`- ${question}`);
            });
            lines.push('');
          });
        }
      }
    }

    // Requirement Traceability matrix
    lines.push('## Requirement Traceability Matrix');
    lines.push('');
    lines.push('| Requirement | Test Ideas | Product Factors (SFDIPOT) Categories | Coverage |');
    lines.push('|-------------|------------|-----------------|----------|');

    // Create a map of requirement IDs to their titles from user stories
    const requirementTitles = new Map<string, string>();
    userStories.forEach((story) => {
      requirementTitles.set(story.id, story.title);
    });

    testSuite.traceabilityMatrix.requirements.forEach((row) => {
      // Get title from user stories if available, otherwise use ID only
      const title = requirementTitles.get(row.requirementId);
      const displayReqName = title
        ? `${row.requirementId}: ${title}`
        : row.requirementId;
      lines.push(
        `| ${displayReqName} | ${row.testCaseIds.length} | ${row.htsmCategories.join(', ')} | ${row.coverage} |`
      );
    });

    // Automation Strategy section
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Automation Strategy');
    lines.push('');
    lines.push('Based on the test ideas generated, the following automation strategy is recommended:');
    lines.push('');

    // Calculate automation distribution
    const automationCategories: Record<string, { count: number; examples: string[] }> = {
      'API/Integration': { count: 0, examples: [] },
      'E2E/UI': { count: 0, examples: [] },
      'Performance': { count: 0, examples: [] },
      'Security': { count: 0, examples: [] },
      'Manual/Exploratory': { count: 0, examples: [] },
    };

    testSuite.tests.forEach(tc => {
      const fitness = this.determineAutomationFitness(tc);
      let category = 'Manual/Exploratory';
      if (fitness.includes('API') || fitness.includes('Integration')) category = 'API/Integration';
      else if (fitness.includes('E2E') || fitness.includes('Visual')) category = 'E2E/UI';
      else if (fitness.includes('Performance') || fitness.includes('Concurrency')) category = 'Performance';
      else if (fitness.includes('Security')) category = 'Security';
      else if (fitness.includes('Human') || fitness.includes('exploratory')) category = 'Manual/Exploratory';

      automationCategories[category].count++;
      if (automationCategories[category].examples.length < 2) {
        automationCategories[category].examples.push(tc.name.substring(0, 60) + (tc.name.length > 60 ? '...' : ''));
      }
    });

    lines.push('### Automation Distribution');
    lines.push('');
    lines.push('| Automation Type | Count | % | Recommended Tools |');
    lines.push('|-----------------|-------|---|-------------------|');

    const totalTests = testSuite.tests.length;
    const toolRecommendations: Record<string, string> = {
      'API/Integration': 'Postman, REST Assured, Supertest, pytest',
      'E2E/UI': 'Playwright, Cypress, Selenium',
      'Performance': 'k6, JMeter, Gatling, Artillery',
      'Security': 'OWASP ZAP, Burp Suite, npm audit',
      'Manual/Exploratory': 'Session-based testing, heuristics',
    };

    Object.entries(automationCategories)
      .filter(([, data]) => data.count > 0)
      .sort((a, b) => b[1].count - a[1].count)
      .forEach(([category, data]) => {
        const pct = ((data.count / totalTests) * 100).toFixed(1);
        lines.push(`| **${category}** | ${data.count} | ${pct}% | ${toolRecommendations[category]} |`);
      });

    lines.push('');
    lines.push('### Recommended Phased Approach');
    lines.push('');
    lines.push('| Phase | Focus | Priority | Estimated Coverage |');
    lines.push('|-------|-------|----------|-------------------|');
    lines.push('| **Phase 1** | Critical P0 tests (security, auth, payments) | P0 | ~' + ((totalPriority.P0 / totalTests) * 100).toFixed(0) + '% |');
    lines.push('| **Phase 2** | Core business flows (P1) | P1 | ~' + (((totalPriority.P0 + totalPriority.P1) / totalTests) * 100).toFixed(0) + '% |');
    lines.push('| **Phase 3** | Supporting features (P2) | P2 | ~' + (((totalPriority.P0 + totalPriority.P1 + totalPriority.P2) / totalTests) * 100).toFixed(0) + '% |');
    lines.push('| **Phase 4** | Edge cases and polish (P3) | P3 | 100% |');
    lines.push('');

    // Global clarifying questions summary - dynamically generated from actual analysis
    lines.push('---');
    lines.push('');
    lines.push('## Global Clarifying Questions Summary');
    lines.push('');

    if (allClarifyingQuestions.length > 0) {
      lines.push(`The following ${allClarifyingQuestions.length} areas across ${new Set(allClarifyingQuestions.map(q => q.category)).size} SFDIPOT categories require clarification before testing:`);
      lines.push('');

      // Group by category
      const questionsByCategory = new Map<HTSMCategory, typeof allClarifyingQuestions>();
      allClarifyingQuestions.forEach(q => {
        if (!questionsByCategory.has(q.category)) {
          questionsByCategory.set(q.category, []);
        }
        questionsByCategory.get(q.category)!.push(q);
      });

      // Render by category
      questionsByCategory.forEach((questions, category) => {
        lines.push(`### ${category}`);
        lines.push('');
        questions.forEach(q => {
          lines.push(`**${q.subcategory}**: ${q.rationale}`);
          q.questions.forEach(question => {
            lines.push(`- ${question}`);
          });
          lines.push('');
        });
      });
    } else {
      lines.push('No clarifying questions identified - all SFDIPOT subcategories have adequate test coverage.');
      lines.push('');
    }

    lines.push('---');
    lines.push('');
    lines.push('*Report generated by [Agentic QE](https://github.com/agentic-qe) Product Factors Assessor using HTSM v6.3*');

    return lines.join('\n');
  }

  /**
   * Generate a text-based progress bar for markdown
   */
  private generateTextProgressBar(percentage: number): string {
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * Format output as HTML
   */
  private async formatAsHTML(
    testSuite: TestSuite,
    htsmAnalysis: Map<HTSMCategory, HTSMAnalysisResult>,
    userStories: UserStory[],
    assessmentName?: string,
    codeIntelligenceResult?: CodeIntelligenceResult
  ): Promise<string> {
    const date = new Date().toISOString().split('T')[0];
    // Fix: Only add space before capitals that follow lowercase (camelCase), preserving acronyms like "AI"
    const displayName = assessmentName
      ? assessmentName.replace(/-/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim()
      : testSuite.name;

    const categories: HTSMCategory[] = [
      'STRUCTURE', 'FUNCTION', 'DATA', 'INTERFACES', 'PLATFORM', 'OPERATIONS', 'TIME'
    ];

    const categoryDescriptions: Record<HTSMCategory, string> = {
      STRUCTURE: 'Test ideas for everything that comprises the physical product',
      FUNCTION: 'Test ideas for everything that the product does',
      DATA: 'Test ideas for everything that the product processes',
      INTERFACES: 'Test ideas for every conduit by which the product is accessed or accesses other things',
      PLATFORM: 'Test ideas for everything on which the product depends that is outside the project',
      OPERATIONS: 'Test ideas for how the product will be used',
      TIME: 'Test ideas for any relationship between the product and time',
    };

    // Helper to get automation CSS class
    const getAutomationClass = (fitness: string): string => {
      if (fitness.includes('Human')) return 'automation-human';
      if (fitness.includes('API level')) return 'automation-api';
      if (fitness.includes('E2E level')) return 'automation-e2e';
      if (fitness.includes('Visual level')) return 'automation-visual';
      if (fitness.includes('Integration level')) return 'automation-integration';
      if (fitness.includes('Performance')) return 'automation-performance';
      if (fitness.includes('Concurrency')) return 'automation-concurrency';
      if (fitness.includes('Security')) return 'automation-security';
      if (fitness.includes('Compatibility')) return 'automation-compatibility';
      return 'automation-other';
    };

    // Calculate summary stats
    const byCategory: Record<string, number> = {};
    const byPriority: Record<string, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
    const byAutomationFitness: Record<string, number> = {};
    testSuite.tests.forEach(tc => {
      byCategory[tc.htsm.primary.category] = (byCategory[tc.htsm.primary.category] || 0) + 1;
      byPriority[tc.priority] = (byPriority[tc.priority] || 0) + 1;
      const fitness = this.determineAutomationFitness(tc);
      byAutomationFitness[fitness] = (byAutomationFitness[fitness] || 0) + 1;
    });

    // Generate priority examples from test cases
    const priorityExamples = this.generatePriorityExamples(testSuite.tests);

    // Generate category sections (async for LLM-based question generation)
    const generateCategorySection = async (category: HTSMCategory): Promise<string> => {
      const tests = testSuite.tests.filter(tc => tc.htsm.primary.category === category);
      if (tests.length === 0) return '';

      const rows = tests.map(tc => {
        const automationFitness = this.determineAutomationFitness(tc);
        const priorityClass = `priority-${tc.priority.toLowerCase()}`;
        const automationClass = getAutomationClass(automationFitness);
        return `<tr>
          <td class="test-id">${tc.id}</td>
          <td><span class="priority ${priorityClass}">${tc.priority}</span></td>
          <td><span class="subcategory">${tc.htsm.primary.subcategory}</span></td>
          <td>${tc.name}</td>
          <td><span class="automation ${automationClass}">${automationFitness}</span></td>
        </tr>`;
      }).join('\n');

      // Generate clarifying questions (async for LLM)
      const clarifyingData = await this.generateClarifyingQuestions(category, tests, userStories);
      const clarifyingSection = clarifyingData.questions.length > 0 ? `
        <div class="clarifying-questions">
          <h4>Clarifying Questions to address potential coverage gaps</h4>
          <div class="clarifying-intro">
            <p class="preamble">${clarifyingData.preamble.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}</p>
          </div>
          ${clarifyingData.questions.map(item => `
          <div class="subcategory-questions">
            <h5>[${item.subcategory}]</h5>
            <p class="rationale"><em>Rationale: ${item.rationale}</em></p>
            <ul>
              ${item.questions.map(q => `<li>${q}</li>`).join('\n')}
            </ul>
          </div>`).join('\n')}
        </div>` : '';

      const tableId = `table-${category.toLowerCase()}`;
      return `
        <div class="category-section cat-${category.toLowerCase()}" id="${category.toLowerCase()}">
          <div class="category-header collapsible-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <h3>${category}: ${categoryDescriptions[category]} <span class="badge">${tests.length}</span></h3>
            <span class="collapse-icon">▼</span>
          </div>
          <div class="category-content collapsible-content">
            <table class="filterable-table" id="${tableId}">
              <thead>
                <tr>
                  <th style="width: 100px;">ID</th>
                  <th style="width: 70px;">Priority</th>
                  <th style="width: 120px;">Subcategory</th>
                  <th>Test Idea</th>
                  <th style="width: 210px;">Automation Fitness</th>
                </tr>
                <tr class="filter-row">
                  <td><input type="text" class="filter-input" data-col="0" placeholder="Filter..." onkeyup="filterTable('${tableId}')"></td>
                  <td><select class="filter-select" data-col="1" onchange="filterTable('${tableId}')"><option value="">All</option><option value="P0">P0</option><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option></select></td>
                  <td><input type="text" class="filter-input" data-col="2" placeholder="Filter..." onkeyup="filterTable('${tableId}')"></td>
                  <td><input type="text" class="filter-input" data-col="3" placeholder="Filter..." onkeyup="filterTable('${tableId}')"></td>
                  <td><select class="filter-select" data-col="4" onchange="filterTable('${tableId}')"><option value="">All</option><option value="Automate on API level">API level</option><option value="Automate on E2E level">E2E level</option><option value="Automate on Integration level">Integration level</option><option value="Human testers must explore">Human Exploration</option><option value="Performance testing recommended">Performance</option><option value="Security testing recommended">Security</option></select></td>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
            ${clarifyingSection}
          </div>
        </div>`;
    };

    // Generate traceability matrix with SFDIPOT coverage per requirement
    const requirementTitles = new Map<string, string>();
    userStories.forEach(story => requirementTitles.set(story.id, story.title));

    const sfdipotCategories: HTSMCategory[] = ['STRUCTURE', 'FUNCTION', 'DATA', 'INTERFACES', 'PLATFORM', 'OPERATIONS', 'TIME'];
    const categoryGaps: Record<string, number> = {};
    sfdipotCategories.forEach(cat => categoryGaps[cat] = 0);

    const traceabilityRows = testSuite.traceabilityMatrix.requirements.map(row => {
      const title = requirementTitles.get(row.requirementId);
      const displayReq = title ? `${title}` : row.requirementId;
      const reqId = row.requirementId;

      // Calculate SFDIPOT coverage for this requirement
      const coveredCategories = new Set(row.htsmCategories);
      let coveredCount = 0;

      const categoryColumns = sfdipotCategories.map(cat => {
        const hasCoverage = coveredCategories.has(cat);
        if (hasCoverage) {
          coveredCount++;
          return `<td style="text-align: center; background: #dcfce7;">✓</td>`;
        } else {
          categoryGaps[cat]++;
          return `<td style="text-align: center; background: #f1f5f9;">–</td>`;
        }
      }).join('\n            ');

      const statusClass = coveredCount >= 6 ? 'p2' : coveredCount >= 4 ? 'p1' : 'p0';

      return `<tr>
            <td><code>${reqId}</code> ${displayReq}</td>
            ${categoryColumns}
            <td style="text-align: center;"><span class="priority priority-${statusClass}">${coveredCount}/7</span></td>
          </tr>`;
    }).join('\n');

    // Identify product factors needing review (any requirement missing coverage)
    const totalReqs = testSuite.traceabilityMatrix.requirements.length;
    const reviewNeeded = sfdipotCategories
      .filter(cat => categoryGaps[cat] > 0)
      .map(cat => {
        const missingCount = categoryGaps[cat];
        const coveredCount = totalReqs - missingCount;
        const descriptions: Record<string, string> = {
          'STRUCTURE': 'code architecture, component integration, dependencies',
          'FUNCTION': 'core functionality, business logic, user workflows',
          'DATA': 'data validation, persistence, transformations',
          'INTERFACES': 'API contracts, UI interactions, external integrations',
          'PLATFORM': 'cross-browser, cross-device, environment compatibility',
          'OPERATIONS': 'installation, configuration, maintenance, recovery',
          'TIME': 'scheduling, timeouts, expiration, time zones, concurrency'
        };
        return `<li><strong>${cat} (${cat.charAt(0)})</strong> - ${coveredCount} of ${totalReqs} requirements linked. Review if applicable or confirm not relevant for remaining. Covers: ${descriptions[cat]}.</li>`;
      }).join('\n          ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Product Factors assessment of: ${displayName}</title>
  <style>
    :root {
      --primary: #1e3a5f;
      --primary-dark: #0f2744;
      --primary-light: #2d5a8a;
      --accent: #0066cc;
      --success: #0d7a3f;
      --warning: #b45309;
      --danger: #b91c1c;
      --info: #0369a1;
      --bg-light: #f5f7fa;
      --bg-white: #ffffff;
      --text-dark: #1a1a2e;
      --text-muted: #5c6370;
      --border: #d1d5db;
      --border-light: #e5e7eb;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-light);
      color: var(--text-dark);
      line-height: 1.6;
      font-size: 14px;
    }
    .container { max-width: 1400px; margin: 0 auto; padding: 24px; }
    header {
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      color: white;
      padding: 32px 28px;
      margin-bottom: 24px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    }
    header h1 { font-size: 1.75rem; margin-bottom: 8px; font-weight: 600; }
    header .subtitle { font-size: 0.9rem; opacity: 0.9; line-height: 1.5; }
    .meta-info { display: flex; gap: 16px; margin-top: 20px; flex-wrap: wrap; }
    .meta-card { background: rgba(255,255,255,0.12); padding: 12px 20px; border-radius: 6px; min-width: 140px; }
    .meta-card .label { font-size: 0.7rem; opacity: 0.8; text-transform: uppercase; letter-spacing: 0.5px; }
    .meta-card .value { font-size: 1.5rem; font-weight: 700; }
    .section { background: var(--bg-white); border-radius: 8px; padding: 20px 24px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08); border: 1px solid var(--border-light); }
    .section h2 { color: var(--primary); font-size: 1.1rem; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid var(--primary); font-weight: 600; }
    .section h3 { color: var(--text-dark); font-size: 1rem; margin: 20px 0 12px 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-weight: 600; }
    .section h3 .badge { background: var(--primary); color: white; padding: 3px 10px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 0.85rem; }
    th { background: var(--bg-light); padding: 10px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid var(--border); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.3px; color: var(--text-muted); }
    td { padding: 10px 12px; border-bottom: 1px solid var(--border-light); vertical-align: top; }
    tr:hover { background: #fafbfc; }
    .priority { display: inline-block; padding: 4px 10px; border-radius: 4px; font-weight: 600; font-size: 0.8rem; text-transform: uppercase; }
    .priority-p0 { background: #fef2f2; color: var(--danger); border: 1px solid #fecaca; }
    .priority-p1 { background: #fefce8; color: var(--warning); border: 1px solid #fef08a; }
    .priority-p2 { background: #f0fdf4; color: var(--success); border: 1px solid #bbf7d0; }
    .priority-p3 { background: #f0f9ff; color: var(--info); border: 1px solid #bae6fd; }
    .subcategory { display: inline-block; background: #eff6ff; color: var(--primary); padding: 3px 8px; border-radius: 4px; font-size: 0.8rem; }
    .automation { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; font-weight: 500; }
    .automation-api { background: #dbeafe; color: #1e40af; }
    .automation-e2e { background: #fce7f3; color: #9d174d; }
    .automation-integration { background: #d1fae5; color: #065f46; }
    .automation-visual { background: #fdf4ff; color: #86198f; }
    .automation-performance { background: #fef3c7; color: #92400e; }
    .automation-concurrency { background: #ffedd5; color: #9a3412; }
    .automation-security { background: #fee2e2; color: #991b1b; }
    .automation-compatibility { background: #ecfccb; color: #3f6212; }
    .automation-human { background: #f3e8ff; color: var(--purple); font-weight: 600; }
    .automation-other { background: #f1f5f9; color: #475569; }
    .clarifying-questions { background: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 20px 25px; margin-top: 20px; }
    .clarifying-questions h4 { color: #854d0e; margin-bottom: 16px; font-size: 1.1rem; border-bottom: 2px solid #fef08a; padding-bottom: 10px; }
    .clarifying-intro { background: #fef9c3; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; }
    .clarifying-intro .preamble { color: #713f12; font-size: 0.9rem; line-height: 1.5; margin: 0; }
    .subcategory-questions { background: white; border: 1px solid #fef08a; border-radius: 6px; padding: 15px; margin-bottom: 15px; }
    .subcategory-questions h5 { color: #854d0e; font-size: 0.95rem; margin-bottom: 8px; font-weight: 700; }
    .subcategory-questions .rationale { color: #92400e; font-size: 0.85rem; margin-bottom: 12px; padding: 8px 12px; background: #fef3c7; border-radius: 4px; border-left: 3px solid #f59e0b; }
    .clarifying-questions ul { list-style: none; margin: 0; padding: 0; }
    .clarifying-questions li { padding: 8px 0 8px 20px; position: relative; border-bottom: 1px dashed #fef08a; color: var(--text-dark); font-size: 0.9rem; }
    .clarifying-questions li:before { content: "?"; position: absolute; left: 0; color: #f59e0b; font-weight: bold; }
    .clarifying-questions li:last-child { border-bottom: none; }
    /* Chart styles for compact visualization */
    .charts-container { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
    .chart-panel { background: var(--bg-white); border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
    .chart-panel h3 { font-size: 1.1rem; color: var(--text-dark); margin-bottom: 15px; padding-bottom: 8px; border-bottom: 2px solid var(--border); }
    .bar-chart { display: flex; flex-direction: column; gap: 8px; }
    .bar-row { display: flex; align-items: center; gap: 10px; }
    .bar-label { width: 90px; font-size: 0.8rem; font-weight: 600; color: var(--text-dark); text-align: right; flex-shrink: 0; }
    .bar-track { flex: 1; height: 24px; background: var(--bg-light); border-radius: 4px; overflow: hidden; position: relative; }
    .bar-fill { height: 100%; border-radius: 4px; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; font-size: 0.75rem; font-weight: 600; color: white; min-width: 35px; transition: width 0.3s ease; }
    .bar-value { width: 45px; font-size: 0.85rem; font-weight: 700; color: var(--text-dark); text-align: right; flex-shrink: 0; }
    .bar-structure { background: linear-gradient(90deg, #3b82f6, #2563eb); }
    .bar-function { background: linear-gradient(90deg, #8b5cf6, #7c3aed); }
    .bar-data { background: linear-gradient(90deg, #06b6d4, #0891b2); }
    .bar-interfaces { background: linear-gradient(90deg, #10b981, #059669); }
    .bar-platform { background: linear-gradient(90deg, #f59e0b, #d97706); }
    .bar-operations { background: linear-gradient(90deg, #ec4899, #db2777); }
    .bar-time { background: linear-gradient(90deg, #6366f1, #4f46e5); }
    .bar-p0 { background: linear-gradient(90deg, #ef4444, #dc2626); }
    .bar-p1 { background: linear-gradient(90deg, #f59e0b, #d97706); }
    .bar-p2 { background: linear-gradient(90deg, #22c55e, #16a34a); }
    .bar-p3 { background: linear-gradient(90deg, #06b6d4, #0891b2); }
    .chart-total { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; font-size: 0.9rem; }
    .chart-total .total-label { color: var(--text-muted); }
    .chart-total .total-value { font-weight: 700; color: var(--primary); }
    @media (max-width: 900px) { .charts-container { grid-template-columns: 1fr; } }
    .test-id { font-family: 'SF Mono', 'Consolas', monospace; font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; }
    /* Compact TOC */
    .toc { background: var(--bg-white); padding: 16px 20px; border-radius: 8px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08); border: 1px solid var(--border-light); }
    .toc h2 { font-size: 0.85rem; margin-bottom: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px; border-bottom: 1px solid var(--border-light); }
    .toc-nav { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .toc-nav a { color: var(--primary); text-decoration: none; padding: 6px 12px; border-radius: 4px; font-size: 0.8rem; font-weight: 500; background: var(--bg-light); border: 1px solid var(--border-light); transition: all 0.15s; display: inline-flex; align-items: center; gap: 6px; }
    .toc-nav a:hover { background: var(--primary); color: white; border-color: var(--primary); }
    .toc-nav .count { background: var(--primary); color: white; padding: 1px 6px; border-radius: 3px; font-size: 0.7rem; font-weight: 600; }
    .toc-nav a:hover .count { background: rgba(255,255,255,0.3); }
    .toc-divider { color: var(--border); margin: 0 4px; }
    /* Collapsible sections */
    .collapsible-header { cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: space-between; }
    .collapsible-header:hover { opacity: 0.8; }
    .collapse-icon { transition: transform 0.2s; font-size: 0.8rem; color: var(--text-muted); }
    .collapsed .collapse-icon { transform: rotate(-90deg); }
    .collapsible-content { overflow: hidden; transition: max-height 0.3s ease-out; }
    .collapsed .collapsible-content { max-height: 0 !important; padding-top: 0; padding-bottom: 0; }
    /* Info section collapsible styling */
    .info-section .info-content { overflow: hidden; transition: max-height 0.3s ease-out, padding 0.3s ease-out; max-height: 1000px; }
    .info-section.collapsed .info-content { max-height: 0 !important; padding-top: 0 !important; padding-bottom: 0 !important; }
    .info-section.collapsed .collapse-icon { transform: rotate(-90deg); }
    .info-header:hover { background: rgba(255,255,255,0.05); }
    /* Category section styling */
    .category-section { border-radius: 8px; margin-bottom: 16px; overflow: hidden; border-left: 4px solid var(--border-light); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .category-header { padding: 14px 18px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; }
    .category-header:hover { filter: brightness(0.97); }
    .category-header h3 { margin: 0; font-size: 0.95rem; display: flex; align-items: center; gap: 10px; font-weight: 600; }
    .category-header .badge { font-size: 0.7rem; padding: 3px 10px; border-radius: 12px; font-weight: 600; }
    .category-content { padding: 16px; }
    /* Product Factor Colors - SFDIPOT */
    .category-section.cat-structure { border-left-color: #3b82f6; }
    .category-section.cat-structure .category-header { background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); }
    .category-section.cat-structure .category-content { background: #f8faff; }
    .category-section.cat-structure .badge { background: #3b82f6; color: white; }
    .category-section.cat-function { border-left-color: #10b981; }
    .category-section.cat-function .category-header { background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); }
    .category-section.cat-function .category-content { background: #f8fdfb; }
    .category-section.cat-function .badge { background: #10b981; color: white; }
    .category-section.cat-data { border-left-color: #f59e0b; }
    .category-section.cat-data .category-header { background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); }
    .category-section.cat-data .category-content { background: #fffdf8; }
    .category-section.cat-data .badge { background: #f59e0b; color: white; }
    .category-section.cat-interfaces { border-left-color: #8b5cf6; }
    .category-section.cat-interfaces .category-header { background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); }
    .category-section.cat-interfaces .category-content { background: #faf9ff; }
    .category-section.cat-interfaces .badge { background: #8b5cf6; color: white; }
    .category-section.cat-platform { border-left-color: #14b8a6; }
    .category-section.cat-platform .category-header { background: linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%); }
    .category-section.cat-platform .category-content { background: #f8fefd; }
    .category-section.cat-platform .badge { background: #14b8a6; color: white; }
    .category-section.cat-operations { border-left-color: #6366f1; }
    .category-section.cat-operations .category-header { background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%); }
    .category-section.cat-operations .category-content { background: #f8f9ff; }
    .category-section.cat-operations .badge { background: #6366f1; color: white; }
    .category-section.cat-time { border-left-color: #ec4899; }
    .category-section.cat-time .category-header { background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%); }
    .category-section.cat-time .category-content { background: #fefafc; }
    .category-section.cat-time .badge { background: #ec4899; color: white; }
    .collapsed .category-content { display: none; }
    /* Table filters */
    .filter-row td { padding: 6px 8px; background: #f8fafc; }
    .filter-input, .filter-select { width: 100%; padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 0.75rem; background: white; }
    .filter-input:focus, .filter-select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 2px rgba(30,58,95,0.1); }
    .filter-input::placeholder { color: #94a3b8; }
    @media (max-width: 768px) {
      header h1 { font-size: 1.4rem; }
      table { display: block; overflow-x: auto; }
      .toc-nav { flex-direction: column; align-items: flex-start; }
    }
  </style>
  <script>
    function toggleSection(id) {
      const section = document.getElementById(id);
      if (section) {
        section.classList.toggle('collapsed');
      }
    }
    function expandAll() {
      document.querySelectorAll('.category-section').forEach(s => s.classList.remove('collapsed'));
    }
    function collapseAll() {
      document.querySelectorAll('.category-section').forEach(s => s.classList.add('collapsed'));
    }
  </script>
</head>
<body>
  <div class="container">
    <header>
      <h1>Product Factors assessment of: ${displayName}</h1>
      <div class="meta-inline" style="margin-top: 15px; padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.2); font-size: 0.9rem; opacity: 0.9;">
        <span>Report generated on <strong>${date}</strong></span>
        <span style="margin: 0 15px; opacity: 0.5;">|</span>
        <span>Total Test Ideas: <strong>${testSuite.tests.length}</strong></span>
        <span style="margin: 0 15px; opacity: 0.5;">|</span>
        <span>Product Factors covered: <strong>${Object.keys(testSuite.htsmCoverage.byCategory).length}/7</strong></span>
      </div>
      <nav class="toc" style="margin-top: 15px;">
        <div style="color: var(--text-muted); font-size: 0.85em; font-weight: 600; margin-bottom: 8px;">Quick Navigation</div>
        <div class="toc-nav">
          <a href="#risk">Prioritization</a>
          <a href="#charts">Overview</a>
          <span class="toc-divider">|</span>
          <span style="color: var(--text-muted); font-size: 0.85em; font-weight: 500;">Test Ideas:</span>
          ${categories.map(cat => {
            const count = byCategory[cat] || 0;
            if (count > 0) {
              return `<a href="#${cat.toLowerCase()}">${cat.charAt(0)}${cat.slice(1).toLowerCase()} <span class="count">${count}</span></a>`;
            }
            return '';
          }).filter(Boolean).join('\n          ')}
          <span class="toc-divider">|</span>
          <a href="#traceability">Req. Traceability</a>
        </div>
      </nav>
      <div class="info-section collapsed" style="background: rgba(255,255,255,0.1); border-radius: 8px; margin-top: 15px;">
        <div class="info-header" onclick="this.parentElement.classList.toggle('collapsed')" style="padding: 15px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 1.1rem; opacity: 0.95;">How can this report help you?</h3>
          <span class="collapse-icon" style="transition: transform 0.2s;">▼</span>
        </div>
        <div class="info-content" style="padding: 0 20px 20px 20px;">
          <blockquote style="margin: 0 0 15px 0; padding: 12px 15px; border-left: 3px solid rgba(255,255,255,0.4); font-style: italic; opacity: 0.9;">
            "Requirements are not an end in themselves, but a means to an end—the end of providing value to some person(s)." <span style="opacity: 0.7;">— Jerry Weinberg</span>
          </blockquote>
          <p style="margin: 0 0 12px 0; opacity: 0.9; line-height: 1.7;">In the <a href="https://talesoftesting.com/wp-content/uploads/2022/10/Lalitkumar-Bhamare-Quality-Conscious-Software-Delivery-eBook.pdf" style="color: #93c5fd; text-decoration: underline;">QCSD framework</a>, it is recommended to conduct Product Coverage Sessions or Requirements Engineering Sessions on a regular basis. These sessions can be carried out at the epic level or for complex feature requests and user stories. Testers in the team can analyze the epic or feature story using SFDIPOT (a product factors checklist from <a href="https://www.satisfice.com/download/heuristic-test-strategy-model" style="color: #93c5fd; text-decoration: underline;">Heuristic Test Strategy Model</a> by James Bach) and come up with test ideas, questions about risks, missing information, unconsidered dependencies, identified risks, and more.</p>
          <p style="margin: 0 0 12px 0; opacity: 0.9; line-height: 1.7;">A guided discussion based on this analysis can help teams uncover hidden risks, assess the completeness of the requirements, create a clearer development plan, identify gaps and dependencies, improve estimation with better information at hand, and most importantly - avoid rework caused by discovering issues halfway through development.</p>
          <p style="margin: 0; opacity: 0.9; line-height: 1.7;">If we want to save time and cost while still delivering quality software, it is always cheaper to do things right the first time. The purpose of this report is to facilitate Product Coverage Sessions and help teams achieve exactly that: doing things right the first time.</p>
        </div>
      </div>
      <div class="info-section collapsed" style="background: rgba(255,255,255,0.1); border-radius: 8px; margin-top: 10px;">
        <div class="info-header" onclick="this.parentElement.classList.toggle('collapsed')" style="padding: 15px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 1.1rem; opacity: 0.95;">When to generate this report?</h3>
          <span class="collapse-icon" style="transition: transform 0.2s;">▼</span>
        </div>
        <div class="info-content" style="padding: 0 20px 20px 20px;">
          <p style="margin: 0; opacity: 0.9; line-height: 1.7;">The sooner the better! As soon as testers can access Epic/User Stories or any project artifact they use for test design, this report should be generated. Generate this report and organize "Product Coverage Session" discussion with relevant stakeholders such as programmers, Product Owners, Designers, Architects etc.</p>
        </div>
      </div>
      <div class="info-section collapsed" style="background: rgba(255,255,255,0.1); border-radius: 8px; margin-top: 10px;">
        <div class="info-header" onclick="this.parentElement.classList.toggle('collapsed')" style="padding: 15px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 1.1rem; opacity: 0.95;">How to use this report?</h3>
          <span class="collapse-icon" style="transition: transform 0.2s;">▼</span>
        </div>
        <div class="info-content" style="padding: 0 20px 20px 20px;">
          <p style="margin: 0 0 12px 0; opacity: 0.9;">In this report you will find:</p>
          <div style="margin-left: 5px; line-height: 1.8;">
            <div style="margin-bottom: 8px;">☐ <strong>The Test Ideas</strong> generated for each product factor based on applicable subcategories. Review these test ideas carefully for context relevance, applicability and then derive specific test cases where needed.</div>
            <div style="margin-bottom: 8px;">☐ <strong>Automation Fitness</strong> recommendations against each test idea that can help for drafting suitable automation strategy.</div>
            <div>☐ <strong>The Clarifying Questions</strong> - that surface "unknown unknowns" by systematically checking which Product Factors (SFDIPOT) subcategories lack test coverage. Ensure that Epics, User Stories, Acceptance Criteria etc. are readily updated based on answers derived for each clarifying question listed.</div>
          </div>
          <p style="margin: 15px 0 0 0; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.2); opacity: 0.9; font-size: 0.95rem;">All in all, this report represents important and unique elements to be considered in the test strategy. <strong>Rebuild this report if there are updates made in Epics, User Stories, Acceptance Criteria etc.</strong></p>
          <p style="margin: 10px 0 0 0; opacity: 0.85; font-style: italic; font-size: 0.9rem;">Testers are advised to carefully evaluate all the information using critical thinking and context awareness.</p>
        </div>
      </div>
    </header>

    <section class="section" id="risk">
      <h2>Risk-Based Prioritization</h2>
      <p style="margin-bottom: 15px;">Test ideas are prioritized using a <strong>risk-based approach</strong> that considers:</p>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-bottom: 20px;">
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">Business Impact</strong><br>Potential revenue loss, customer trust damage, or regulatory penalties</div>
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">Likelihood of Failure</strong><br>Complexity of implementation, external dependencies, new technology</div>
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">User Exposure</strong><br>Number of users affected and frequency of feature usage</div>
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">Security &amp; Compliance</strong><br>Data protection requirements, payment processing, legal obligations</div>
      </div>
      <h3>Priority Legend</h3>
      <table>
        <thead>
          <tr><th>Priority</th><th>Risk Level</th><th>Description</th><th>Examples from this Epic</th></tr>
        </thead>
        <tbody>
          <tr><td><span class="priority priority-p0">P0</span></td><td><strong>Critical</strong></td><td>Security vulnerabilities or core functionality that could cause immediate financial loss, data breach, or complete service failure. Must be tested before any release.</td><td>${priorityExamples.P0}</td></tr>
          <tr><td><span class="priority priority-p1">P1</span></td><td><strong>High</strong></td><td>Core business flows and integrations essential for revenue generation. Failures would significantly impact user experience or business operations.</td><td>${priorityExamples.P1}</td></tr>
          <tr><td><span class="priority priority-p2">P2</span></td><td><strong>Medium</strong></td><td>Important features that support the core experience. Failures would cause inconvenience but workarounds exist.</td><td>${priorityExamples.P2}</td></tr>
          <tr><td><span class="priority priority-p3">P3</span></td><td><strong>Low</strong></td><td>Edge cases, cosmetic issues, or rarely used features. Failures have minimal business impact.</td><td>${priorityExamples.P3}</td></tr>
        </tbody>
      </table>
    </section>

    <section class="section" id="charts">
      <h2>Test Ideas Overview</h2>
      <div class="charts-container">
        <div class="chart-panel">
          <h3>Test Ideas by Product Factor (SFDIPOT)</h3>
          <div class="bar-chart">
            ${categories.map(cat => {
              const count = byCategory[cat] || 0;
              const maxCount = Math.max(...categories.map(c => byCategory[c] || 0));
              const width = maxCount > 0 ? Math.max((count / maxCount) * 100, count > 0 ? 5 : 0) : 0;
              return `<div class="bar-row">
              <div class="bar-label">${cat.charAt(0) + cat.slice(1).toLowerCase()}</div>
              <div class="bar-track"><div class="bar-fill bar-${cat.toLowerCase()}" style="width: ${width}%"></div></div>
              <div class="bar-value">${count}</div>
            </div>`;
            }).join('\n            ')}
          </div>
          <div class="chart-total">
            <span class="total-label">Product Factors: 7/7</span>
            <span class="total-value">${testSuite.tests.length} Test Ideas</span>
          </div>
          <div style="margin-top: 10px; padding: 8px 12px; background: #fef9c3; border-radius: 4px; font-size: 0.8rem; color: #92400e;">
            <strong>Clarifying Questions:</strong> Review each category for questions requiring stakeholder input
          </div>
        </div>
        <div class="chart-panel">
          <h3>Test Ideas by Priority</h3>
          <div class="bar-chart">
            ${['P0', 'P1', 'P2', 'P3'].map(p => {
              const count = byPriority[p] || 0;
              const maxCount = Math.max(...['P0', 'P1', 'P2', 'P3'].map(pr => byPriority[pr] || 0));
              const width = maxCount > 0 ? Math.max((count / maxCount) * 100, count > 0 ? 5 : 0) : 0;
              const labels: Record<string, string> = { 'P0': 'Critical', 'P1': 'High', 'P2': 'Medium', 'P3': 'Low' };
              return `<div class="bar-row">
              <div class="bar-label">${p} - ${labels[p]}</div>
              <div class="bar-track"><div class="bar-fill bar-${p.toLowerCase()}" style="width: ${width}%"></div></div>
              <div class="bar-value">${count}</div>
            </div>`;
            }).join('\n            ')}
          </div>

          <h4 style="font-size: 0.85rem; color: var(--text-dark); margin: 14px 0 8px 0; padding-top: 12px; border-top: 1px solid var(--border); font-weight: 600;">Test Ideas by Automation Fitness</h4>
          <div class="bar-chart" style="font-size: 0.85rem;">
            ${Object.entries(byAutomationFitness)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([fitness, count]) => {
                const maxCount = Math.max(...Object.values(byAutomationFitness));
                const width = maxCount > 0 ? Math.max((count / maxCount) * 100, count > 0 ? 5 : 0) : 0;
                const labelMap: Record<string, string> = {
                  'Automate on API level': 'API level',
                  'Automate on E2E level': 'E2E level',
                  'Automate on Integration level': 'Integration level',
                  'Automate on Visual level': 'Visual level',
                  'Automated Performance Tests': 'Performance',
                  'Automated Concurrency Tests': 'Concurrency',
                  'Automated Browser Compatibility Test': 'Browser Compat',
                  'Automated DB Compatibility Test': 'DB Compat',
                  'Automated Device Compatibility Test': 'Device Compat',
                  'Automated API Compatibility Test': 'API Compat',
                  'Automated Platform Compatibility Test': 'Platform Compat',
                  'Automated Compatibility Test': 'Compatibility',
                  'Automated Security Tests': 'Security',
                  'Human testers must explore': 'Human Exploration'
                };
                const label = labelMap[fitness] || fitness;
                return `<div class="bar-row" style="margin-bottom: 4px;">
              <div class="bar-label" style="min-width: 100px; font-size: 0.8rem;">${label}</div>
              <div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: ${width}%; background: linear-gradient(90deg, #6366f1, #8b5cf6);"></div></div>
              <div class="bar-value" style="font-size: 0.8rem;">${count}</div>
            </div>`;
              }).join('\n            ')}
          </div>
        </div>
      </div>
    </section>

    <section class="section" id="test-ideas">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid var(--primary);">
        <h2 style="margin: 0; border: none; padding: 0;">Test Ideas by Product Factor</h2>
        <button onclick="toggleAllSections()" id="toggle-all-btn" style="background: var(--bg-light); border: 1px solid var(--border); padding: 6px 14px; border-radius: 4px; font-size: 0.8rem; cursor: pointer; font-weight: 500; color: var(--text-dark);">Collapse All</button>
      </div>
      <script>
        function toggleAllSections() {
          var sections = document.querySelectorAll('.category-section');
          var btn = document.getElementById('toggle-all-btn');
          var shouldCollapse = btn.textContent === 'Collapse All';
          sections.forEach(function(s) {
            if (shouldCollapse) { s.classList.add('collapsed'); }
            else { s.classList.remove('collapsed'); }
          });
          btn.textContent = shouldCollapse ? 'Expand All' : 'Collapse All';
        }
        function filterTable(tableId) {
          var table = document.getElementById(tableId);
          var filters = table.querySelectorAll('.filter-input, .filter-select');
          var rows = table.querySelectorAll('tbody tr');
          rows.forEach(function(row) {
            var show = true;
            filters.forEach(function(filter) {
              var col = parseInt(filter.dataset.col);
              var cell = row.cells[col];
              if (cell) {
                var text = cell.textContent.toLowerCase();
                var val = filter.value.toLowerCase();
                if (val && text.indexOf(val) === -1) { show = false; }
              }
            });
            row.style.display = show ? '' : 'none';
          });
        }
      </script>
      ${(await Promise.all(categories.map(cat => generateCategorySection(cat)))).join('\n')}
    </section>

    <section class="section" id="traceability">
      <h2>Requirement Traceability</h2>
      <p style="margin-bottom: 15px;">Shows which Product Factors (SFDIPOT) have test ideas mapped to each requirement.</p>

      <div style="display: flex; gap: 20px; margin-bottom: 15px; font-size: 0.85rem;">
        <span><span style="display: inline-block; width: 12px; height: 12px; background: var(--success); border-radius: 2px; margin-right: 5px;"></span> Has test ideas</span>
        <span><span style="display: inline-block; width: 12px; height: 12px; background: var(--border); border-radius: 2px; margin-right: 5px;"></span> Gap - needs review</span>
      </div>

      <table style="font-size: 0.85rem;">
        <thead>
          <tr>
            <th style="min-width: 280px;">Requirement</th>
            <th style="text-align: center; width: 45px;" title="Structure">S</th>
            <th style="text-align: center; width: 45px;" title="Function">F</th>
            <th style="text-align: center; width: 45px;" title="Data">D</th>
            <th style="text-align: center; width: 45px;" title="Interfaces">I</th>
            <th style="text-align: center; width: 45px;" title="Platform">P</th>
            <th style="text-align: center; width: 45px;" title="Operations">O</th>
            <th style="text-align: center; width: 45px;" title="Time">T</th>
            <th style="text-align: center;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${traceabilityRows}
        </tbody>
      </table>

      ${reviewNeeded ? `
      <div style="margin-top: 20px; padding: 15px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;">
        <strong style="color: #1e40af;">ℹ️ Review Needed:</strong>
        <p style="margin: 8px 0; color: #1e3a8a; font-size: 0.9rem;">The following product factors have limited coverage. This may indicate either: (a) requirements need review for applicability, or (b) the product factor is not relevant for those requirements.</p>
        <ul style="margin: 10px 0 0 20px; color: #1e3a8a; font-size: 0.9rem;">
          ${reviewNeeded}
        </ul>
      </div>
      ` : ''}
    </section>

    ${codeIntelligenceResult ? `
    <!-- C4 Architecture Diagrams Section -->
    <section id="c4-architecture" style="margin-top: 40px;">
      <h2 style="color: #1e3a5f; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 1.2em;">🏗️</span> C4 Architecture (Auto-Discovered)
      </h2>
      <p style="color: #666; margin-bottom: 20px;">Architecture extracted via Code Intelligence analysis of the codebase.</p>

      <div style="display: grid; gap: 20px;">
        ${codeIntelligenceResult.c4ContextDiagram ? `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
          <h3 style="color: #1e40af; margin-bottom: 15px;">C4 Context Diagram</h3>
          <pre style="background: #1e293b; color: #e2e8f0; padding: 15px; border-radius: 6px; overflow-x: auto; font-size: 0.85rem;"><code class="language-mermaid">${codeIntelligenceResult.c4ContextDiagram}</code></pre>
        </div>
        ` : ''}

        ${codeIntelligenceResult.c4ContainerDiagram ? `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
          <h3 style="color: #1e40af; margin-bottom: 15px;">C4 Container Diagram</h3>
          <pre style="background: #1e293b; color: #e2e8f0; padding: 15px; border-radius: 6px; overflow-x: auto; font-size: 0.85rem;"><code class="language-mermaid">${codeIntelligenceResult.c4ContainerDiagram}</code></pre>
        </div>
        ` : ''}

        ${codeIntelligenceResult.c4ComponentDiagram ? `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
          <h3 style="color: #1e40af; margin-bottom: 15px;">C4 Component Diagram</h3>
          <pre style="background: #1e293b; color: #e2e8f0; padding: 15px; border-radius: 6px; overflow-x: auto; font-size: 0.85rem;"><code class="language-mermaid">${codeIntelligenceResult.c4ComponentDiagram}</code></pre>
        </div>
        ` : ''}
      </div>

      <div style="margin-top: 20px; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 15px;">
        <strong style="color: #92400e;">📊 Code Intelligence Summary:</strong>
        <ul style="margin: 10px 0 0 20px; color: #78350f; font-size: 0.9rem;">
          <li>Components detected: ${codeIntelligenceResult.componentAnalysis.components.length}</li>
          <li>External systems: ${codeIntelligenceResult.externalSystems.length}</li>
          <li>Architecture type: ${codeIntelligenceResult.componentAnalysis.architecture || 'Unknown'}</li>
          <li>Project: ${codeIntelligenceResult.projectMetadata.name || 'Unknown'}</li>
        </ul>
      </div>
    </section>
    ` : ''}
  </div>
</body>
</html>`;
  }
}

/**
 * Create a minimal memory store for standalone usage
 * This allows the agent to work without a full fleet setup
 */
function createMinimalMemoryStore(): MemoryStore {
  const internalStore = new Map<string, { value: unknown; ttl?: number; timestamp: number }>();

  const getFullKey = (key: string, namespace?: string): string =>
    namespace ? `${namespace}/${key}` : key;

  return {
    store: async (key: string, value: unknown, ttl?: number): Promise<void> => {
      internalStore.set(key, { value, ttl, timestamp: Date.now() });
    },
    retrieve: async (key: string): Promise<unknown> => {
      const entry = internalStore.get(key);
      if (!entry) return undefined;
      if (entry.ttl && Date.now() - entry.timestamp > entry.ttl * 1000) {
        internalStore.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set: async (key: string, value: unknown, namespace?: string): Promise<void> => {
      const fullKey = getFullKey(key, namespace);
      internalStore.set(fullKey, { value, timestamp: Date.now() });
    },
    get: async (key: string, namespace?: string): Promise<unknown> => {
      const fullKey = getFullKey(key, namespace);
      const entry = internalStore.get(fullKey);
      if (!entry) return undefined;
      if (entry.ttl && Date.now() - entry.timestamp > entry.ttl * 1000) {
        internalStore.delete(fullKey);
        return undefined;
      }
      return entry.value;
    },
    delete: async (key: string, namespace?: string): Promise<boolean> => {
      const fullKey = getFullKey(key, namespace);
      return internalStore.delete(fullKey);
    },
    clear: async (namespace?: string): Promise<void> => {
      if (!namespace) {
        internalStore.clear();
        return;
      }
      const prefix = `${namespace}/`;
      for (const key of Array.from(internalStore.keys())) {
        if (key.startsWith(prefix)) {
          internalStore.delete(key);
        }
      }
    },
  };
}

/**
 * Factory function to create ProductFactorsAssessment instance
 * Provides sensible defaults for standalone usage
 */
export function createProductFactorsAssessment(config?: Partial<ProductFactorsAssessmentConfig>): ProductFactorsAssessment {
  const defaultConfig: ProductFactorsAssessmentConfig = {
    memoryStore: config?.memoryStore || createMinimalMemoryStore(),
    eventBus: config?.eventBus || new EventEmitter(),
    context: config?.context || { id: 'product-factors-assessor', type: 'product-factors-assessor', status: 0 as any },
    enableLearning: config?.enableLearning ?? false, // Disable learning by default for standalone
    llm: {
      enabled: true,
      preferredProvider: 'claude',
      ...config?.llm,
    },
    ...config,
  };

  return new ProductFactorsAssessment(defaultConfig);
}

// Note: Singleton pattern removed - use createProductFactorsAssessment() factory function
// For backward compatibility during migration, create a lazy-initialized instance
let _defaultInstance: ProductFactorsAssessment | undefined;

/**
 * Get default singleton instance (lazy initialized)
 * @deprecated Use createProductFactorsAssessment() factory function instead
 */
export function getProductFactorsAssessment(): ProductFactorsAssessment {
  if (!_defaultInstance) {
    _defaultInstance = createProductFactorsAssessment();
  }
  return _defaultInstance;
}

// Export all types
export * from './types/htsm.types';
export { DocumentParser, documentParser } from './parsers/document-parser';
export { HTSMAnalyzer, htsmAnalyzer } from './analyzers/htsm-analyzer';
export { TestCaseGenerator, testCaseGenerator } from './generators/test-case-generator';
export { GherkinFormatter, gherkinFormatter } from './formatters/gherkin-formatter';
