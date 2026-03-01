/**
 * Product Factors Assessment Service
 *
 * V3-compatible service wrapper for SFDIPOT-based product factors analysis.
 * Provides comprehensive test idea generation using James Bach's HTSM framework.
 *
 * This is a standalone service that can be used directly or through the
 * requirements-validation domain coordinator.
 */

import {
  AssessmentInput,
  AssessmentOutput,
  AssessmentSummary,
  CategoryAnalysis,
  TestIdea,
  ClarifyingQuestion,
  HTSMCategory,
  Priority,
  AutomationFitness,
  ProjectContext,
  UserStory,
  Epic,
  ExtractedEntities,
  SFDIPOT_SUBCATEGORIES,
  generateTestId,
  DetectedDomain,
} from './types/index.js';

import { UserStoryParser, DocumentParser, ArchitectureParser } from './parsers/index.js';
import { SFDIPOTAnalyzer, RequirementsQualityScore } from './analyzers/index.js';
import { TestIdeaGenerator, QuestionGenerator } from './generators/index.js';
import {
  HTMLFormatter,
  JSONFormatter,
  MarkdownFormatter,
  GherkinFormatter,
} from './formatters/index.js';
import { SkillIntegration } from './skills/index.js';
import { CodebaseAnalyzer } from './code-intelligence/index.js';
import { domainPatternRegistry, DomainDetectionResult } from './patterns/index.js';
import type { CodeIntelligenceResult } from './types/index.js';

/**
 * Service configuration
 */
export interface ProductFactorsServiceConfig {
  /** Enable storing assessment results for learning */
  storeResults?: boolean;

  /** Default output format */
  defaultOutputFormat?: 'html' | 'json' | 'markdown' | 'gherkin' | 'all';

  /** Maximum test ideas per subcategory */
  maxTestIdeasPerSubcategory?: number;

  /** Enable brutal honesty validation (default: true) */
  enableBrutalHonesty?: boolean;

  /** Minimum quality score to include test ideas (0-100, default: 60) */
  minQualityScore?: number;

  /** Output directory for generated reports */
  outputDir?: string;
}

/**
 * Parsed input structure
 */
interface ParsedInput {
  userStories: UserStory[];
  epics: Epic[];
  rawContent: string;
}

/**
 * Product Factors Assessment Service
 *
 * Implements SFDIPOT-based test idea generation without requiring BaseAgent.
 * This is a stateless service suitable for v3's domain-driven architecture.
 */
export class ProductFactorsService {
  private readonly config: Required<ProductFactorsServiceConfig>;

  // Modular components
  private readonly userStoryParser: UserStoryParser;
  private readonly documentParser: DocumentParser;
  private readonly architectureParser: ArchitectureParser;
  private readonly sfdipotAnalyzer: SFDIPOTAnalyzer;
  private readonly testIdeaGenerator: TestIdeaGenerator;
  private readonly questionGenerator: QuestionGenerator;
  private readonly htmlFormatter: HTMLFormatter;
  private readonly jsonFormatter: JSONFormatter;
  private readonly markdownFormatter: MarkdownFormatter;
  private readonly gherkinFormatter: GherkinFormatter;
  private readonly skillIntegration: SkillIntegration;

  constructor(config: ProductFactorsServiceConfig = {}) {
    this.config = {
      storeResults: config.storeResults ?? false,
      defaultOutputFormat: config.defaultOutputFormat ?? 'html',
      maxTestIdeasPerSubcategory: config.maxTestIdeasPerSubcategory ?? 10,
      enableBrutalHonesty: config.enableBrutalHonesty ?? true,
      minQualityScore: config.minQualityScore ?? 60,
      outputDir: config.outputDir ?? '.agentic-qe/product-factors-assessments',
    };

    // Initialize modular components
    this.userStoryParser = new UserStoryParser();
    this.documentParser = new DocumentParser();
    this.architectureParser = new ArchitectureParser();
    this.sfdipotAnalyzer = new SFDIPOTAnalyzer(this.config.enableBrutalHonesty);
    this.testIdeaGenerator = new TestIdeaGenerator({
      maxIdeasPerSubcategory: this.config.maxTestIdeasPerSubcategory,
      enableBrutalHonesty: this.config.enableBrutalHonesty,
    });
    this.questionGenerator = new QuestionGenerator({
      maxQuestionsPerCategory: 5,
    });
    this.htmlFormatter = new HTMLFormatter();
    this.jsonFormatter = new JSONFormatter();
    this.markdownFormatter = new MarkdownFormatter();
    this.gherkinFormatter = new GherkinFormatter();
    this.skillIntegration = new SkillIntegration();
  }

  /**
   * Main entry point - Generate full Product Factors assessment
   */
  public async assess(input: AssessmentInput): Promise<AssessmentOutput> {
    console.log('[ProductFactorsService] Starting Product Factors assessment...');

    // Step 1: Parse input documents
    const parsedInput = await this.parseInput(input);

    // Step 2: Detect project context
    const context = await this.detectContext(parsedInput);

    // Step 2.5: Run Bach mode BS detection on requirements
    let requirementsQualityScore: number | undefined;
    let requirementsQualityData: RequirementsQualityScore | undefined;
    if (this.config.enableBrutalHonesty && parsedInput.rawContent.length > 100) {
      console.log('[ProductFactorsService] Running Bach mode BS detection on requirements...');

      const reqAnalysis = this.sfdipotAnalyzer
        .getBrutalHonestyAnalyzer()
        .analyzeRequirements(parsedInput.rawContent, context.detectedDomains);
      requirementsQualityScore = reqAnalysis.score;
      requirementsQualityData = reqAnalysis;

      if (context.detectedDomains.length > 0) {
        const domainInfo = context.detectedDomains
          .map((d) => `${d.displayName} (${(d.confidence * 100).toFixed(0)}%)`)
          .join(', ');
        console.log(`[ProductFactorsService] Detected domains: ${domainInfo}`);
      }

      if (reqAnalysis.findings.length > 0) {
        console.log(
          `[ProductFactorsService] Requirements quality: ${reqAnalysis.score}/100 - ${reqAnalysis.verdict}`
        );
      }
    }

    // Step 3: Analyze using SFDIPOT framework
    const categoryAnalysis = await this.performSFDIPOTAnalysis(parsedInput, context);

    // Step 3.5: Code Intelligence Integration
    let codeIntelligenceResult: CodeIntelligenceResult | undefined;
    let c4Diagrams: { context?: string; container?: string; component?: string } | undefined;

    if (input.codebaseRootDir && input.enableCodeIntelligence !== false) {
      console.log(
        `[ProductFactorsService] Running code intelligence analysis on ${input.codebaseRootDir}...`
      );

      try {
        const codebaseAnalyzer = new CodebaseAnalyzer({
          rootDir: input.codebaseRootDir,
          detectExternalSystems: true,
          analyzeComponents: true,
          analyzeCoupling: input.enableCouplingAnalysis !== false,
          generateC4Diagrams: input.includeC4Diagrams !== false,
        });

        codeIntelligenceResult = await codebaseAnalyzer.analyze();

        if (codeIntelligenceResult.c4Diagrams) {
          c4Diagrams = codeIntelligenceResult.c4Diagrams;
        }

        // Merge code intelligence test ideas into category analysis
        if (codeIntelligenceResult.externalSystems.length > 0) {
          const platformIdeas = codebaseAnalyzer.generatePlatformTestIdeas(
            codeIntelligenceResult.externalSystems
          );
          this.mergeTestIdeas(categoryAnalysis, HTSMCategory.PLATFORM, platformIdeas);
        }

        if (codeIntelligenceResult.components.length > 0) {
          const structureIdeas = codebaseAnalyzer.generateStructureTestIdeas(
            codeIntelligenceResult.components
          );
          this.mergeTestIdeas(categoryAnalysis, HTSMCategory.STRUCTURE, structureIdeas);
          this.mergeTestIdeas(
            categoryAnalysis,
            HTSMCategory.INTERFACES,
            structureIdeas.filter((i) => i.category === HTSMCategory.INTERFACES)
          );
        }
      } catch (error) {
        console.warn('[ProductFactorsService] Code intelligence analysis failed:', error);
      }
    }

    // Step 4: Generate clarifying questions for gaps
    const clarifyingQuestions = await this.generateClarifyingQuestions(categoryAnalysis, context);

    // Step 5: Flatten results
    const testIdeas = this.flattenTestIdeas(categoryAnalysis);
    const allQuestions = this.flattenQuestions(categoryAnalysis, clarifyingQuestions);

    // Step 5.5: Validate domain coverage
    let domainCoverageValidation:
      | { missing: string[]; covered: string[]; score: number }
      | undefined;
    if (this.config.enableBrutalHonesty && context.detectedDomains.length > 0) {
      domainCoverageValidation = this.sfdipotAnalyzer
        .getBrutalHonestyAnalyzer()
        .validateDomainCoverage(testIdeas, context.detectedDomains);

      if (domainCoverageValidation.missing.length > 0) {
        const injectedIdeas = this.injectMissingDomainCoverage(
          domainCoverageValidation.missing,
          context
        );
        if (injectedIdeas.length > 0) {
          testIdeas.push(...injectedIdeas);
        }
      }
    }

    // Step 6: Create summary
    const summary = this.createSummary(
      testIdeas,
      allQuestions,
      categoryAnalysis,
      requirementsQualityScore,
      domainCoverageValidation
    );

    // Step 7: Generate outputs
    const outputFormat = input.outputFormat || this.config.defaultOutputFormat;
    const formattedOutputs = await this.generateFormattedOutputs(
      input.assessmentName || 'Product-Factors-Assessment',
      categoryAnalysis,
      testIdeas,
      allQuestions,
      summary,
      outputFormat,
      requirementsQualityData
    );

    // Step 8: Build result
    const result: AssessmentOutput = {
      name: input.assessmentName || 'Product-Factors-Assessment',
      sourceDocuments: this.getSourceDocumentNames(input),
      categoryAnalysis,
      testIdeas,
      clarifyingQuestions: allQuestions,
      summary,
      ...formattedOutputs,
      codeIntelligence: codeIntelligenceResult,
      c4Diagrams,
    };

    console.log(
      `[ProductFactorsService] Assessment complete: ${testIdeas.length} test ideas, ${allQuestions.length} questions`
    );

    return result;
  }

  /**
   * Analyze input using SFDIPOT framework only (no output generation)
   */
  public async analyzeSFDIPOT(input: AssessmentInput): Promise<CategoryAnalysis[]> {
    const parsedInput = await this.parseInput(input);
    const context = await this.detectContext(parsedInput);
    const analysis = await this.performSFDIPOTAnalysis(parsedInput, context);
    return Array.from(analysis.values());
  }

  /**
   * Generate clarifying questions only
   */
  public async generateQuestions(input: AssessmentInput): Promise<ClarifyingQuestion[]> {
    const parsedInput = await this.parseInput(input);
    const context = await this.detectContext(parsedInput);
    const analysis = await this.performSFDIPOTAnalysis(parsedInput, context);
    const questions = await this.generateClarifyingQuestions(analysis, context);
    return questions;
  }

  /**
   * Generate test ideas only
   */
  public async generateTestIdeas(input: AssessmentInput): Promise<TestIdea[]> {
    const parsedInput = await this.parseInput(input);
    const context = await this.detectContext(parsedInput);
    const analysis = await this.performSFDIPOTAnalysis(parsedInput, context);
    return this.flattenTestIdeas(analysis);
  }

  // ===========================================================================
  // Parsing Methods
  // ===========================================================================

  private async parseInput(input: AssessmentInput): Promise<ParsedInput> {
    const result: ParsedInput = {
      userStories: [],
      epics: [],
      rawContent: '',
    };

    if (input.userStories) {
      if (typeof input.userStories === 'string') {
        const parsed = this.userStoryParser.parse(input.userStories);
        result.userStories = parsed.userStories;
        result.rawContent += input.userStories + '\n';
      } else {
        result.userStories = input.userStories;
        result.rawContent += input.userStories
          .map((us) => us.rawText || `As a ${us.asA}, I want ${us.iWant} so that ${us.soThat}`)
          .join('\n');
      }
    }

    if (input.epics) {
      if (typeof input.epics === 'string') {
        const parsed = this.userStoryParser.parse(input.epics);
        result.epics = parsed.epics;
        result.rawContent += input.epics + '\n';
      } else {
        result.epics = input.epics;
        result.rawContent += input.epics.map((e) => e.rawText || e.description).join('\n');
      }
    }

    if (input.functionalSpecs) {
      if (typeof input.functionalSpecs === 'string') {
        result.rawContent += input.functionalSpecs + '\n';
      } else {
        result.rawContent += input.functionalSpecs
          .map((s) => s.rawText || s.sections.map((sec) => sec.content).join('\n'))
          .join('\n');
      }
    }

    if (input.architecture) {
      if (typeof input.architecture === 'string') {
        result.rawContent += input.architecture + '\n';
      } else {
        result.rawContent += input.architecture.rawText || JSON.stringify(input.architecture);
      }
    }

    return result;
  }

  // ===========================================================================
  // Context Detection
  // ===========================================================================

  private async detectContext(input: ParsedInput): Promise<ProjectContext> {
    const content = input.rawContent.toLowerCase();
    const domain = this.detectDomain(content);
    const detectedDomains = this.detectDomainsWithConfidence(input.rawContent);
    const entities = this.extractEntities(input);

    return {
      domain,
      detectedDomains,
      domainHints: this.getDomainHints(content),
      projectType: this.detectProjectType(content),
      constraints: this.detectConstraints(content),
      entities,
    };
  }

  private detectDomain(content: string): ProjectContext['domain'] {
    const detectedDomains = this.detectDomainsWithConfidence(content);

    const domainMapping: Record<string, ProjectContext['domain']> = {
      'stripe-subscription': 'saas',
      'gdpr-compliance': 'ecommerce',
      'pci-dss': 'finance',
      hipaa: 'healthcare',
      'oauth-oidc': 'saas',
      'webhook-integration': 'infrastructure',
    };

    if (detectedDomains.length > 0 && detectedDomains[0].confidence >= 0.5) {
      const mappedDomain = domainMapping[detectedDomains[0].domain];
      if (mappedDomain) {
        return mappedDomain;
      }
    }

    // Legacy fallback
    const domainKeywords: Record<ProjectContext['domain'], string[]> = {
      ecommerce: ['cart', 'checkout', 'payment', 'product', 'order', 'shop', 'buy', 'price'],
      healthcare: [
        'patient',
        'medical',
        'health',
        'clinical',
        'diagnosis',
        'hipaa',
        'prescription',
      ],
      finance: ['account', 'transaction', 'payment', 'balance', 'banking', 'pci', 'credit'],
      social: ['comment', 'like', 'share', 'follow', 'post', 'profile', 'community', 'forum'],
      saas: ['subscription', 'tenant', 'plan', 'billing', 'dashboard', 'api key'],
      infrastructure: ['deploy', 'pipeline', 'container', 'kubernetes', 'server', 'scaling'],
      'ml-ai': ['model', 'prediction', 'training', 'recommendation', 'nlp', 'neural', 'ml'],
      sustainability: ['carbon', 'eco', 'sustainable', 'green', 'environmental', 'emissions'],
      accessibility: ['wcag', 'screen reader', 'a11y', 'accessible', 'disability'],
      generic: [],
    };

    let maxScore = 0;
    let detectedDomain: ProjectContext['domain'] = 'generic';

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      const score = keywords.filter((kw) => content.includes(kw)).length;
      if (score > maxScore) {
        maxScore = score;
        detectedDomain = domain as ProjectContext['domain'];
      }
    }

    return detectedDomain;
  }

  private detectDomainsWithConfidence(content: string): DetectedDomain[] {
    const registryResults = domainPatternRegistry.detectDomains(content);
    return registryResults.map(
      (result: DomainDetectionResult): DetectedDomain => ({
        domain: result.domain,
        displayName: result.displayName,
        confidence: result.confidence,
        matchedIndicators: result.matchedIndicators,
        requiredCoverage: result.requiredCoverage,
        complianceFrameworks: result.complianceFrameworks,
      })
    );
  }

  private getDomainHints(content: string): string[] {
    const hints: string[] = [];
    if (content.includes('api') || content.includes('endpoint')) hints.push('api-driven');
    if (content.includes('mobile') || content.includes('app')) hints.push('mobile');
    if (content.includes('real-time') || content.includes('websocket')) hints.push('real-time');
    if (content.includes('batch') || content.includes('scheduled')) hints.push('batch-processing');
    if (content.includes('multi-tenant')) hints.push('multi-tenant');
    return hints;
  }

  private detectProjectType(content: string): ProjectContext['projectType'] {
    if (
      content.includes('hipaa') ||
      content.includes('pci') ||
      content.includes('gdpr') ||
      content.includes('compliance')
    ) {
      return 'regulated';
    }
    if (content.includes('enterprise') || content.includes('sso') || content.includes('ldap')) {
      return 'enterprise';
    }
    if (content.includes('mvp') || content.includes('startup') || content.includes('prototype')) {
      return 'startup';
    }
    if (content.includes('internal') || content.includes('admin')) {
      return 'internal';
    }
    return 'generic';
  }

  private detectConstraints(content: string): string[] {
    const constraints: string[] = [];
    if (content.includes('legacy')) constraints.push('legacy-integration');
    if (content.includes('microservice')) constraints.push('microservices');
    if (content.includes('monolith')) constraints.push('monolithic');
    if (content.includes('offline')) constraints.push('offline-capable');
    if (content.includes('high availability') || content.includes('99.9'))
      constraints.push('high-availability');
    return constraints;
  }

  private extractEntities(input: ParsedInput): ProjectContext['entities'] {
    const actors = new Set<string>();
    const features = new Set<string>();
    const dataTypes = new Set<string>();
    const integrations = new Set<string>();
    const actions = new Set<string>();

    for (const story of input.userStories) {
      actors.add(story.asA);
      const actionMatch = story.iWant.match(/^(to\s+)?(\w+)/i);
      if (actionMatch) {
        actions.add(actionMatch[2].toLowerCase());
      }
      features.add(story.iWant);
    }

    const content = input.rawContent;
    const dataPattern = /(?:store|save|create|update|delete|manage)\s+(\w+)/gi;
    let match;
    while ((match = dataPattern.exec(content)) !== null) {
      dataTypes.add(match[1].toLowerCase());
    }

    const integrationPattern = /(?:integrate|connect|sync|call)\s+(?:with\s+)?(\w+)/gi;
    while ((match = integrationPattern.exec(content)) !== null) {
      integrations.add(match[1]);
    }

    return {
      actors: Array.from(actors),
      features: Array.from(features).slice(0, 20),
      dataTypes: Array.from(dataTypes),
      integrations: Array.from(integrations),
      actions: Array.from(actions),
    };
  }

  // ===========================================================================
  // SFDIPOT Analysis
  // ===========================================================================

  private async performSFDIPOTAnalysis(
    input: ParsedInput,
    context: ProjectContext
  ): Promise<Map<HTSMCategory, CategoryAnalysis>> {
    const analysis = new Map<HTSMCategory, CategoryAnalysis>();

    for (const category of Object.values(HTSMCategory)) {
      const categoryAnalysis = await this.analyzeCategory(category, input, context);
      analysis.set(category, categoryAnalysis);
    }

    return analysis;
  }

  private async analyzeCategory(
    category: HTSMCategory,
    input: ParsedInput,
    context: ProjectContext
  ): Promise<CategoryAnalysis> {
    const subcategories = SFDIPOT_SUBCATEGORIES[category];
    const testIdeas: TestIdea[] = [];
    const subcategoriesCovered: string[] = [];

    for (const subcategory of subcategories) {
      const ideas = this.generateTestIdeasForSubcategory(category, subcategory, input, context);
      if (ideas.length > 0) {
        subcategoriesCovered.push(subcategory);
        testIdeas.push(...ideas.slice(0, this.config.maxTestIdeasPerSubcategory));
      }
    }

    // Add skill-enhanced test ideas
    const skillEnhancedIdeas = this.skillIntegration.generateEnhancedTestIdeas(category, context);
    testIdeas.push(...skillEnhancedIdeas);

    const subcategoriesMissing = subcategories.filter((s) => !subcategoriesCovered.includes(s));
    const coveragePercentage = (subcategoriesCovered.length / subcategories.length) * 100;

    return {
      category,
      testIdeas,
      clarifyingQuestions: [],
      coverage: {
        subcategoriesCovered,
        subcategoriesMissing,
        coveragePercentage,
      },
    };
  }

  private generateTestIdeasForSubcategory(
    category: HTSMCategory,
    subcategory: string,
    input: ParsedInput,
    context: ProjectContext
  ): TestIdea[] {
    const ideas: TestIdea[] = [];

    for (const story of input.userStories) {
      const relevantIdeas = this.mapStoryToSubcategory(story, category, subcategory, context);
      ideas.push(...relevantIdeas);
    }

    if (ideas.length === 0) {
      const genericIdeas = this.getGenericIdeasForSubcategory(category, subcategory, context);
      ideas.push(...genericIdeas);
    }

    return ideas;
  }

  private mapStoryToSubcategory(
    story: UserStory,
    category: HTSMCategory,
    subcategory: string,
    context: ProjectContext
  ): TestIdea[] {
    const ideas: TestIdea[] = [];
    const storyText = story.iWant.toLowerCase();
    const isRelevant = this.isStoryRelevantToSubcategory(storyText, subcategory);

    if (isRelevant) {
      const idea = this.createTestIdea(category, subcategory, story, context);
      ideas.push(idea);
    }

    return ideas;
  }

  private isStoryRelevantToSubcategory(storyText: string, subcategory: string): boolean {
    const relevanceMap: Record<string, string[]> = {
      Code: ['service', 'component', 'module', 'class'],
      Dependencies: ['integrate', 'connect', 'use', 'require'],
      Application: ['want', 'able', 'can', 'should'],
      Calculation: ['calculate', 'compute', 'total', 'sum', 'average'],
      ErrorHandling: ['error', 'fail', 'invalid', 'incorrect'],
      StateTransition: ['status', 'state', 'workflow', 'process'],
      Security: ['login', 'auth', 'permission', 'access', 'secure'],
      InputOutput: ['enter', 'input', 'display', 'show', 'output'],
      Lifecycle: ['create', 'update', 'delete', 'save', 'modify'],
      Cardinality: ['multiple', 'list', 'many', 'single', 'one'],
      Boundaries: ['limit', 'max', 'min', 'range', 'boundary'],
      Persistence: ['store', 'save', 'persist', 'remember'],
      UserInterface: ['click', 'button', 'form', 'page', 'screen', 'ui'],
      ApiSdk: ['api', 'endpoint', 'rest', 'graphql'],
      CommonUse: ['user', 'customer', 'want', 'need'],
      Timing: ['fast', 'slow', 'performance', 'quick'],
      Concurrency: ['concurrent', 'parallel', 'simultaneous'],
    };

    const keywords = relevanceMap[subcategory] || [];
    return keywords.some((kw) => storyText.includes(kw));
  }

  private createTestIdea(
    category: HTSMCategory,
    subcategory: string,
    story: UserStory,
    context: ProjectContext
  ): TestIdea {
    const description = `Verify that ${story.asA} can ${story.iWant}`;
    const priority = this.calculatePriority(category, subcategory, story, context);
    const automationFitness = this.determineAutomationFitness(category, subcategory);

    return {
      id: generateTestId(category),
      category,
      subcategory,
      description,
      priority,
      automationFitness,
      sourceRequirement: story.id,
      tags: [`htsm:${category.toLowerCase()}`, `htsm:${subcategory}`, `priority:${priority}`],
    };
  }

  private calculatePriority(
    category: HTSMCategory,
    subcategory: string,
    story: UserStory,
    context: ProjectContext
  ): Priority {
    let riskScore = 0;

    const categoryRisk: Record<HTSMCategory, number> = {
      [HTSMCategory.FUNCTION]: 4,
      [HTSMCategory.OPERATIONS]: 4,
      [HTSMCategory.DATA]: 3,
      [HTSMCategory.INTERFACES]: 3,
      [HTSMCategory.TIME]: 2,
      [HTSMCategory.STRUCTURE]: 2,
      [HTSMCategory.PLATFORM]: 1,
    };
    riskScore += categoryRisk[category] || 2;

    const highRiskSubcategories = [
      'Security',
      'ErrorHandling',
      'DisfavoredUse',
      'Persistence',
      'Concurrency',
    ];
    if (highRiskSubcategories.includes(subcategory)) {
      riskScore += 2;
    }

    if (context.projectType === 'regulated') riskScore += 2;
    if (context.domain === 'healthcare' || context.domain === 'finance') riskScore += 2;

    const storyText = story.iWant.toLowerCase();
    if (storyText.includes('payment') || storyText.includes('credit')) riskScore += 3;
    if (storyText.includes('auth') || storyText.includes('login')) riskScore += 2;

    if (riskScore >= 8) return Priority.P0;
    if (riskScore >= 5) return Priority.P1;
    if (riskScore >= 3) return Priority.P2;
    return Priority.P3;
  }

  private determineAutomationFitness(
    category: HTSMCategory,
    subcategory: string
  ): AutomationFitness {
    if (subcategory === 'Security' || subcategory === 'DisfavoredUse') {
      return AutomationFitness.Security;
    }
    if (subcategory === 'Concurrency') {
      return AutomationFitness.Concurrency;
    }
    if (subcategory === 'Timing' || subcategory === 'ExtremeUse') {
      return AutomationFitness.Performance;
    }
    if (subcategory === 'UserInterface' || category === HTSMCategory.INTERFACES) {
      return AutomationFitness.E2E;
    }
    if (subcategory === 'ApiSdk' || subcategory === 'SystemInterface') {
      return AutomationFitness.Integration;
    }
    if (category === HTSMCategory.DATA || category === HTSMCategory.FUNCTION) {
      return AutomationFitness.API;
    }
    if (subcategory === 'UncommonUse') {
      return AutomationFitness.Human;
    }
    return AutomationFitness.API;
  }

  private getGenericIdeasForSubcategory(
    category: HTSMCategory,
    subcategory: string,
    context: ProjectContext
  ): TestIdea[] {
    const entities: ExtractedEntities = {
      actors: context.entities?.actors || [],
      features: context.entities?.features || [],
      dataTypes: context.entities?.dataTypes || [],
      integrations: context.entities?.integrations || [],
      actions: context.entities?.actions || [],
    };

    return this.testIdeaGenerator.generateForSubcategory(
      category,
      subcategory,
      context,
      entities,
      0.7
    );
  }

  // ===========================================================================
  // Question Generation
  // ===========================================================================

  private async generateClarifyingQuestions(
    analysis: Map<HTSMCategory, CategoryAnalysis>,
    context: ProjectContext
  ): Promise<ClarifyingQuestion[]> {
    const questions: ClarifyingQuestion[] = [];

    for (const [category, categoryAnalysis] of Array.from(analysis.entries())) {
      const missingSubcategories = categoryAnalysis.coverage.subcategoriesMissing;

      for (const subcategory of missingSubcategories) {
        const categoryQuestions = this.questionGenerator.getQuestionForSubcategory(
          category,
          subcategory,
          context
        );
        if (categoryQuestions) {
          questions.push(categoryQuestions);
        }
      }
    }

    return questions;
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private mergeTestIdeas(
    categoryAnalysis: Map<HTSMCategory, CategoryAnalysis>,
    category: HTSMCategory,
    newIdeas: TestIdea[]
  ): void {
    const existing = categoryAnalysis.get(category);
    if (existing) {
      const categoryIdeas = newIdeas.filter((i) => i.category === category);
      existing.testIdeas.push(...categoryIdeas);

      for (const idea of categoryIdeas) {
        if (!existing.coverage.subcategoriesCovered.includes(idea.subcategory)) {
          existing.coverage.subcategoriesCovered.push(idea.subcategory);
          existing.coverage.subcategoriesMissing = existing.coverage.subcategoriesMissing.filter(
            (s) => s !== idea.subcategory
          );
        }
      }

      const allSubcategories = SFDIPOT_SUBCATEGORIES[category];
      existing.coverage.coveragePercentage =
        (existing.coverage.subcategoriesCovered.length / allSubcategories.length) * 100;
    }
  }

  private flattenTestIdeas(analysis: Map<HTSMCategory, CategoryAnalysis>): TestIdea[] {
    const ideas: TestIdea[] = [];
    for (const categoryAnalysis of Array.from(analysis.values())) {
      ideas.push(...categoryAnalysis.testIdeas);
    }
    return ideas;
  }

  private flattenQuestions(
    analysis: Map<HTSMCategory, CategoryAnalysis>,
    additionalQuestions: ClarifyingQuestion[]
  ): ClarifyingQuestion[] {
    const questions: ClarifyingQuestion[] = [...additionalQuestions];
    for (const categoryAnalysis of Array.from(analysis.values())) {
      questions.push(...categoryAnalysis.clarifyingQuestions);
    }
    return questions;
  }

  private injectMissingDomainCoverage(
    missingCoverage: string[],
    context: ProjectContext
  ): TestIdea[] {
    const injectedIdeas: TestIdea[] = [];
    const domainNames = context.detectedDomains
      .filter((d) => d.confidence >= 0.5)
      .map((d) => d.domain);

    if (domainNames.length === 0) {
      return injectedIdeas;
    }

    const domainTestIdeas = domainPatternRegistry.generateDomainTestIdeas(domainNames);

    for (const missing of missingCoverage) {
      const coverageKeywords = missing.toLowerCase().split('-');

      const matchingIdeas = domainTestIdeas.filter((idea) => {
        const desc = idea.description.toLowerCase();
        const tags = (idea.tags || []).map((t) => t.toLowerCase());
        return coverageKeywords.some((kw) => desc.includes(kw) || tags.includes(kw));
      });

      for (const idea of matchingIdeas.slice(0, 2)) {
        if (!injectedIdeas.some((i) => i.id === idea.id)) {
          const enhancedIdea: TestIdea = {
            ...idea,
            tags: [...(idea.tags || []), 'coverage-injection', `covers-${missing}`],
          };
          injectedIdeas.push(enhancedIdea);
        }
      }
    }

    return injectedIdeas;
  }

  private createSummary(
    testIdeas: TestIdea[],
    questions: ClarifyingQuestion[],
    categoryAnalysis?: Map<HTSMCategory, CategoryAnalysis>,
    requirementsQualityScore?: number,
    domainCoverageValidation?: { missing: string[]; covered: string[]; score: number }
  ): AssessmentSummary {
    const byCategory: Record<HTSMCategory, number> = {} as Record<HTSMCategory, number>;
    const byPriority: Record<Priority, number> = {} as Record<Priority, number>;
    const byAutomationFitness: Record<AutomationFitness, number> = {} as Record<
      AutomationFitness,
      number
    >;

    for (const cat of Object.values(HTSMCategory)) byCategory[cat] = 0;
    for (const pri of Object.values(Priority)) byPriority[pri] = 0;
    for (const af of Object.values(AutomationFitness)) byAutomationFitness[af] = 0;

    for (const idea of testIdeas) {
      byCategory[idea.category]++;
      byPriority[idea.priority]++;
      byAutomationFitness[idea.automationFitness]++;
    }

    const categoriesWithTests = Object.values(byCategory).filter((c) => c > 0).length;
    const overallCoverageScore = (categoriesWithTests / Object.keys(HTSMCategory).length) * 100;

    let brutalHonesty: AssessmentSummary['brutalHonesty'] | undefined;

    if (this.config.enableBrutalHonesty && categoryAnalysis) {
      const bySeverity: Record<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW', number> = {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
      };

      let overallQualityScore = 100;
      if (domainCoverageValidation) {
        overallQualityScore = Math.round(
          overallQualityScore * 0.8 + domainCoverageValidation.score * 0.2
        );
      }

      brutalHonesty = {
        overallQualityScore,
        totalRejected: 0,
        totalFindings: 0,
        bySeverity,
        requirementsQualityScore: requirementsQualityScore ?? 100,
        domainCoverageScore: domainCoverageValidation?.score,
        missingDomainCoverage: domainCoverageValidation?.missing,
      };
    }

    return {
      totalTestIdeas: testIdeas.length,
      byCategory,
      byPriority,
      byAutomationFitness,
      totalClarifyingQuestions: questions.length,
      overallCoverageScore,
      generatedAt: new Date(),
      brutalHonesty,
    };
  }

  private getSourceDocumentNames(input: AssessmentInput): string[] {
    const names: string[] = [];
    if (input.userStories) names.push('User Stories');
    if (input.epics) names.push('Epics');
    if (input.functionalSpecs) names.push('Functional Specs');
    if (input.architecture) names.push('Technical Architecture');
    if (input.codebaseRootDir) names.push(`Codebase: ${input.codebaseRootDir}`);
    return names;
  }

  private async generateFormattedOutputs(
    name: string,
    analysis: Map<HTSMCategory, CategoryAnalysis>,
    testIdeas: TestIdea[],
    questions: ClarifyingQuestion[],
    summary: AssessmentSummary,
    format: AssessmentInput['outputFormat'],
    requirementsQualityData?: RequirementsQualityScore
  ): Promise<{
    html?: string;
    json?: string;
    markdown?: string;
    gherkin?: Map<string, string>;
  }> {
    const result: {
      html?: string;
      json?: string;
      markdown?: string;
      gherkin?: Map<string, string>;
    } = {};
    const formats = Array.isArray(format)
      ? format
      : format === 'all'
        ? ['html', 'json', 'markdown', 'gherkin']
        : [format];

    const assessmentOutput: AssessmentOutput = {
      name,
      sourceDocuments: [],
      categoryAnalysis: analysis,
      testIdeas,
      clarifyingQuestions: questions,
      summary,
    };

    if (formats.includes('html')) {
      result.html = this.htmlFormatter.format(
        assessmentOutput,
        requirementsQualityData,
        requirementsQualityData?.findings
      );
    }
    if (formats.includes('json')) {
      result.json = this.jsonFormatter.format(assessmentOutput);
    }
    if (formats.includes('markdown')) {
      result.markdown = this.markdownFormatter.format(assessmentOutput);
    }
    if (formats.includes('gherkin')) {
      result.gherkin = this.gherkinFormatter.format(assessmentOutput);
    }

    return result;
  }
}

// Export convenience function
export function createProductFactorsService(
  config?: ProductFactorsServiceConfig
): ProductFactorsService {
  return new ProductFactorsService(config);
}
