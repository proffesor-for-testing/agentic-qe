/**
 * QE Product Factors Assessor Agent
 *
 * An intelligent QE agent that analyzes requirements (user stories, epics, specs, architecture)
 * and generates comprehensive test ideas based on James Bach's HTSM Product Factors (SFDIPOT).
 *
 * Key Features:
 * - SFDIPOT framework: Structure, Function, Data, Interfaces, Platform, Operations, Time
 * - Automation fitness recommendations per test idea
 * - Context-aware clarifying questions for coverage gaps
 * - Multiple output formats: HTML, JSON, Markdown, Gherkin
 * - LLM-powered intelligent question generation
 *
 * @author Agentic QE Team
 * @version 1.0.0
 */

import { BaseAgent, BaseAgentConfig } from '../BaseAgent';
import { QETask, AgentCapability, QEAgentType } from '../../types';
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
  ProductFactorsTaskPayload,
  UserStory,
  Epic,
  SFDIPOT_SUBCATEGORIES,
  CATEGORY_DESCRIPTIONS,
  generateTestId
} from './types';

// Import modular components - Phase 3-7 integration
import { UserStoryParser, DocumentParser, ArchitectureParser } from './parsers';
import { SFDIPOTAnalyzer, RequirementsQualityScore } from './analyzers';
import { TestIdeaGenerator, QuestionGenerator } from './generators';
import { HTMLFormatter, JSONFormatter, MarkdownFormatter, GherkinFormatter } from './formatters';
import { SkillIntegration } from './skills';

// Import code intelligence integration - Phases 1-3
import { CodebaseAnalyzer } from './code-intelligence';
import type { CodeIntelligenceResult, DetectedDomain } from './types';

// Import domain pattern registry for enhanced context detection
import { domainPatternRegistry, DomainDetectionResult } from './patterns/domain-registry';

// =============================================================================
// Agent Configuration
// =============================================================================

/**
 * Configuration for QEProductFactorsAssessor
 */
export interface QEProductFactorsAssessorConfig extends Omit<BaseAgentConfig, 'type' | 'capabilities'> {
  /** Override default capabilities */
  capabilities?: AgentCapability[];

  /** Enable storing assessment results in memory for learning */
  storeResults?: boolean;

  /** Default output format */
  defaultOutputFormat?: 'html' | 'json' | 'markdown' | 'all';

  /** Maximum test ideas per subcategory */
  maxTestIdeasPerSubcategory?: number;

  /** Enable brutal honesty validation (default: true) */
  enableBrutalHonesty?: boolean;

  /** Minimum quality score to include test ideas (0-100, default: 60) */
  minQualityScore?: number;

  /** Enable LLM-based question generation */
  useLLM?: boolean;

  /** Output directory for generated reports */
  outputDir?: string;
}

// =============================================================================
// Agent Implementation
// =============================================================================

/**
 * QE Product Factors Assessor Agent
 *
 * Extends BaseAgent for LLM capabilities and fleet coordination.
 * Implements SFDIPOT-based test idea generation with automation fitness recommendations.
 */
export class QEProductFactorsAssessor extends BaseAgent {
  private readonly storeResults: boolean;
  private readonly defaultOutputFormat: 'html' | 'json' | 'markdown' | 'all';
  private readonly maxTestIdeasPerSubcategory: number;
  private readonly enableBrutalHonesty: boolean;
  private readonly minQualityScore: number;

  // Cached context from last assessment
  private lastContext?: ProjectContext;

  // Modular components (Phase 3-7)
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

  constructor(config: QEProductFactorsAssessorConfig) {
    super({
      ...config,
      type: QEAgentType.PRODUCT_FACTORS_ASSESSOR,
      capabilities: config.capabilities || QEProductFactorsAssessor.getDefaultCapabilities()
    });

    this.storeResults = config.storeResults ?? true;
    this.defaultOutputFormat = config.defaultOutputFormat ?? 'html';
    this.maxTestIdeasPerSubcategory = config.maxTestIdeasPerSubcategory ?? 10;
    this.enableBrutalHonesty = config.enableBrutalHonesty ?? true;
    this.minQualityScore = config.minQualityScore ?? 60;

    // Initialize modular components
    this.userStoryParser = new UserStoryParser();
    this.documentParser = new DocumentParser();
    this.architectureParser = new ArchitectureParser();
    this.sfdipotAnalyzer = new SFDIPOTAnalyzer(this.enableBrutalHonesty);
    this.testIdeaGenerator = new TestIdeaGenerator({
      maxIdeasPerSubcategory: this.maxTestIdeasPerSubcategory,
      enableBrutalHonesty: this.enableBrutalHonesty,  // Enable Ramsay mode validation
    });
    this.questionGenerator = new QuestionGenerator({
      maxQuestionsPerCategory: 5
    });
    this.htmlFormatter = new HTMLFormatter();
    this.jsonFormatter = new JSONFormatter();
    this.markdownFormatter = new MarkdownFormatter();
    this.gherkinFormatter = new GherkinFormatter();
    this.skillIntegration = new SkillIntegration();
  }

  // ===========================================================================
  // Static Methods
  // ===========================================================================

  /**
   * Get default capabilities for this agent
   */
  static getDefaultCapabilities(): AgentCapability[] {
    return [
      {
        name: 'sfdipot-analysis',
        version: '1.0.0',
        description: 'Analyze requirements using SFDIPOT framework',
        parameters: { categories: Object.values(HTSMCategory) }
      },
      {
        name: 'test-idea-generation',
        version: '1.0.0',
        description: 'Generate comprehensive test ideas from requirements',
        parameters: { maxPerSubcategory: 10 }
      },
      {
        name: 'automation-fitness',
        version: '1.0.0',
        description: 'Recommend automation level for each test idea',
        parameters: { levels: Object.values(AutomationFitness) }
      },
      {
        name: 'clarifying-questions',
        version: '1.0.0',
        description: 'Generate context-aware questions for coverage gaps',
        parameters: { llmPowered: true }
      },
      {
        name: 'multi-format-output',
        version: '1.0.0',
        description: 'Generate reports in HTML, JSON, Markdown, Gherkin formats',
        parameters: { formats: ['html', 'json', 'markdown', 'gherkin'] }
      }
    ];
  }

  // ===========================================================================
  // BaseAgent Abstract Method Implementations
  // ===========================================================================

  /**
   * Initialize agent components
   */
  protected async initializeComponents(): Promise<void> {
    // Log initialization
    console.log(`[${this.agentId.id}] Initializing QE Product Factors Assessor...`);

    // Initialize any required services
    // Parsers, analyzers, generators, and formatters are created on-demand

    console.log(`[${this.agentId.id}] Initialized with capabilities: ${Array.from(this.capabilities.keys()).join(', ')}`);
  }

  /**
   * Load knowledge base for the agent
   */
  protected async loadKnowledge(): Promise<void> {
    // Load SFDIPOT framework knowledge
    console.log(`[${this.agentId.id}] Loading SFDIPOT knowledge base...`);

    // Store SFDIPOT category descriptions in memory for quick access
    await this.storeMemory('sfdipot-categories', {
      categories: Object.values(HTSMCategory),
      subcategories: SFDIPOT_SUBCATEGORIES,
      descriptions: CATEGORY_DESCRIPTIONS
    });

    console.log(`[${this.agentId.id}] Loaded ${Object.keys(HTSMCategory).length} SFDIPOT categories`);
  }

  /**
   * Perform the requested task
   */
  protected async performTask(task: QETask): Promise<AssessmentOutput> {
    const payload = task.payload as ProductFactorsTaskPayload;
    const taskType = payload?.type || 'assess';

    console.log(`[${this.agentId.id}] Performing task: ${taskType}`);

    switch (taskType) {
      case 'assess':
        return this.assess(payload.input);

      case 'analyze-sfdipot': {
        const analysis = await this.analyzeSFDIPOT(payload.input);
        // Wrap in AssessmentOutput for consistent return type
        return {
          name: payload.input.assessmentName || 'SFDIPOT-Analysis',
          sourceDocuments: this.getSourceDocumentNames(payload.input),
          categoryAnalysis: new Map(analysis.map(a => [a.category, a])),
          testIdeas: analysis.flatMap(a => a.testIdeas),
          clarifyingQuestions: analysis.flatMap(a => a.clarifyingQuestions),
          summary: this.createSummary(analysis.flatMap(a => a.testIdeas), analysis.flatMap(a => a.clarifyingQuestions))
        };
      }

      case 'generate-questions': {
        const questions = await this.generateQuestions(payload.input);
        return {
          name: payload.input.assessmentName || 'Questions-Only',
          sourceDocuments: this.getSourceDocumentNames(payload.input),
          categoryAnalysis: new Map(),
          testIdeas: [],
          clarifyingQuestions: questions,
          summary: this.createSummary([], questions)
        };
      }

      case 'generate-tests': {
        const testIdeas = await this.generateTestIdeas(payload.input);
        return {
          name: payload.input.assessmentName || 'Test-Ideas-Only',
          sourceDocuments: this.getSourceDocumentNames(payload.input),
          categoryAnalysis: new Map(),
          testIdeas,
          clarifyingQuestions: [],
          summary: this.createSummary(testIdeas, [])
        };
      }

      case 'format-output':
        // Requires prior analysis result
        throw new Error('format-output requires prior analysis - use assess instead');

      default:
        // Default to full assessment
        return this.assess(payload.input);
    }
  }

  /**
   * Cleanup resources
   */
  protected async cleanup(): Promise<void> {
    console.log(`[${this.agentId.id}] Cleaning up resources...`);
    this.lastContext = undefined;
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Main entry point - Generate full Product Factors assessment
   *
   * @param input - Assessment input (user stories, epics, specs, etc.)
   * @returns Complete assessment with test ideas, questions, and formatted output
   */
  public async assess(input: AssessmentInput): Promise<AssessmentOutput> {
    console.log(`[${this.agentId.id}] Starting Product Factors assessment...`);

    // Step 1: Parse input documents
    const parsedInput = await this.parseInput(input);

    // Step 2: Detect project context
    const context = await this.detectContext(parsedInput);
    this.lastContext = context;

    // Step 2.5: Run Bach mode BS detection on requirements (if brutal honesty enabled)
    // Now includes domain-specific BS detection for more accurate analysis
    let requirementsQualityScore: number | undefined;
    let requirementsQualityData: RequirementsQualityScore | undefined;
    if (this.enableBrutalHonesty && parsedInput.rawContent.length > 100) {
      console.log(`[${this.agentId.id}] Running Bach mode BS detection on requirements...`);

      // Pass detected domains for domain-specific BS pattern detection
      const reqAnalysis = this.sfdipotAnalyzer.getBrutalHonestyAnalyzer().analyzeRequirements(
        parsedInput.rawContent,
        context.detectedDomains
      );
      requirementsQualityScore = reqAnalysis.score;
      requirementsQualityData = reqAnalysis; // Capture full analysis for formatter

      // Log detected domains if any
      if (context.detectedDomains.length > 0) {
        const domainInfo = context.detectedDomains
          .map(d => `${d.displayName} (${(d.confidence * 100).toFixed(0)}%)`)
          .join(', ');
        console.log(`[${this.agentId.id}] Detected domains: ${domainInfo}`);
      }

      if (reqAnalysis.findings.length > 0) {
        console.log(`[${this.agentId.id}] Requirements quality: ${reqAnalysis.score}/100 - ${reqAnalysis.verdict}`);
        console.log(`[${this.agentId.id}] Found ${reqAnalysis.findings.length} BS indicators in requirements`);

        // Count domain-specific findings
        const domainFindings = reqAnalysis.findings.filter(f =>
          f.category === 'Domain-Specific Issue' || f.category === 'Missing Domain Coverage'
        ).length;
        if (domainFindings > 0) {
          console.log(`[${this.agentId.id}]   - ${domainFindings} domain-specific issues detected`);
        }
      }
    }

    // Step 3: Analyze using SFDIPOT framework (with Ramsay mode validation)
    const categoryAnalysis = await this.performSFDIPOTAnalysis(parsedInput, context);

    // Step 3.5: Code Intelligence Integration (Phase 1-3)
    let codeIntelligenceResult: CodeIntelligenceResult | undefined;
    let c4Diagrams: { context?: string; container?: string; component?: string } | undefined;

    if (input.codebaseRootDir && input.enableCodeIntelligence !== false) {
      console.log(`[${this.agentId.id}] Running code intelligence analysis on ${input.codebaseRootDir}...`);

      try {
        const codebaseAnalyzer = new CodebaseAnalyzer({
          rootDir: input.codebaseRootDir,
          detectExternalSystems: true,
          analyzeComponents: true,
          analyzeCoupling: input.enableCouplingAnalysis !== false,
          generateC4Diagrams: input.includeC4Diagrams !== false,
        });

        codeIntelligenceResult = await codebaseAnalyzer.analyze();

        // Store C4 diagrams for output
        if (codeIntelligenceResult.c4Diagrams) {
          c4Diagrams = codeIntelligenceResult.c4Diagrams;
        }

        // Merge code intelligence test ideas into category analysis
        if (codeIntelligenceResult.externalSystems.length > 0) {
          const platformIdeas = codebaseAnalyzer.generatePlatformTestIdeas(codeIntelligenceResult.externalSystems);
          this.mergeTestIdeas(categoryAnalysis, HTSMCategory.PLATFORM, platformIdeas);
          console.log(`[${this.agentId.id}] Added ${platformIdeas.length} PLATFORM test ideas from external systems`);
        }

        if (codeIntelligenceResult.components.length > 0) {
          const structureIdeas = codebaseAnalyzer.generateStructureTestIdeas(codeIntelligenceResult.components);
          this.mergeTestIdeas(categoryAnalysis, HTSMCategory.STRUCTURE, structureIdeas);
          this.mergeTestIdeas(categoryAnalysis, HTSMCategory.INTERFACES, structureIdeas.filter(i => i.category === HTSMCategory.INTERFACES));
          console.log(`[${this.agentId.id}] Added ${structureIdeas.length} STRUCTURE/INTERFACES test ideas from components`);
        }

        if (codeIntelligenceResult.couplingAnalysis && codeIntelligenceResult.couplingAnalysis.length > 0) {
          const couplingIdeas = codebaseAnalyzer.generateCouplingTestIdeas(codeIntelligenceResult.couplingAnalysis);
          this.mergeTestIdeas(categoryAnalysis, HTSMCategory.STRUCTURE, couplingIdeas);
          console.log(`[${this.agentId.id}] Added ${couplingIdeas.length} test ideas from coupling analysis`);
        }

        console.log(`[${this.agentId.id}] Code intelligence complete: ${codeIntelligenceResult.metadata.externalSystemsDetected} external systems, ${codeIntelligenceResult.metadata.componentsDetected} components`);
      } catch (error) {
        console.warn(`[${this.agentId.id}] Code intelligence analysis failed:`, error);
      }
    }

    // Step 4: Generate clarifying questions for gaps
    const clarifyingQuestions = await this.generateClarifyingQuestions(categoryAnalysis, context, input.useLLM);

    // Step 5: Flatten results
    const testIdeas = this.flattenTestIdeas(categoryAnalysis);
    const allQuestions = this.flattenQuestions(categoryAnalysis, clarifyingQuestions);

    // Step 5.5: Validate domain coverage (Phase 3 enhancement)
    let domainCoverageValidation: { missing: string[]; covered: string[]; score: number } | undefined;
    if (this.enableBrutalHonesty && context.detectedDomains.length > 0) {
      domainCoverageValidation = this.sfdipotAnalyzer.getBrutalHonestyAnalyzer().validateDomainCoverage(
        testIdeas,
        context.detectedDomains
      );

      if (domainCoverageValidation.missing.length > 0) {
        console.log(`[${this.agentId.id}] Domain Coverage Validation:`);
        console.log(`  - Coverage Score: ${domainCoverageValidation.score}%`);
        console.log(`  - Missing Coverage: ${domainCoverageValidation.missing.join(', ')}`);

        // Inject domain-specific test ideas for missing coverage
        const injectedIdeas = this.injectMissingDomainCoverage(
          domainCoverageValidation.missing,
          context
        );
        if (injectedIdeas.length > 0) {
          testIdeas.push(...injectedIdeas);
          console.log(`[${this.agentId.id}]   - Injected ${injectedIdeas.length} domain-specific test ideas for missing coverage`);
        }
      }
    }

    // Step 6: Create summary with brutal honesty statistics
    const summary = this.createSummary(testIdeas, allQuestions, categoryAnalysis, requirementsQualityScore, domainCoverageValidation);

    // Log brutal honesty summary if enabled
    if (summary.brutalHonesty) {
      console.log(`[${this.agentId.id}] Brutal Honesty Summary:`);
      console.log(`  - Quality Score: ${summary.brutalHonesty.overallQualityScore}/100`);
      console.log(`  - Rejected Ideas: ${summary.brutalHonesty.totalRejected}`);
      console.log(`  - Findings: ${summary.brutalHonesty.totalFindings} (${summary.brutalHonesty.bySeverity.CRITICAL} critical, ${summary.brutalHonesty.bySeverity.HIGH} high)`);
      if (domainCoverageValidation) {
        console.log(`  - Domain Coverage: ${domainCoverageValidation.score}%`);
      }
    }

    // Step 7: Generate outputs
    const outputFormat = input.outputFormat || this.defaultOutputFormat;
    const formattedOutputs = await this.generateFormattedOutputs(
      input.assessmentName || 'Product-Factors-Assessment',
      categoryAnalysis,
      testIdeas,
      allQuestions,
      summary,
      outputFormat,
      requirementsQualityData  // Pass full quality data for HTML rubric/AC analysis
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
      // Code intelligence results (Phase 1-3)
      codeIntelligence: codeIntelligenceResult,
      c4Diagrams,
    };

    // Step 9: Store results if enabled
    if (this.storeResults) {
      await this.storeAssessmentResult(result);
    }

    console.log(`[${this.agentId.id}] Assessment complete: ${testIdeas.length} test ideas, ${allQuestions.length} questions`);

    return result;
  }

  /**
   * Merge test ideas into category analysis
   */
  private mergeTestIdeas(
    categoryAnalysis: Map<HTSMCategory, CategoryAnalysis>,
    category: HTSMCategory,
    newIdeas: TestIdea[]
  ): void {
    const existing = categoryAnalysis.get(category);
    if (existing) {
      // Filter to only ideas matching this category
      const categoryIdeas = newIdeas.filter(i => i.category === category);
      existing.testIdeas.push(...categoryIdeas);

      // Update coverage for new subcategories
      for (const idea of categoryIdeas) {
        if (!existing.coverage.subcategoriesCovered.includes(idea.subcategory)) {
          existing.coverage.subcategoriesCovered.push(idea.subcategory);
          existing.coverage.subcategoriesMissing = existing.coverage.subcategoriesMissing.filter(
            s => s !== idea.subcategory
          );
        }
      }

      // Recalculate coverage percentage
      const allSubcategories = SFDIPOT_SUBCATEGORIES[category];
      existing.coverage.coveragePercentage =
        (existing.coverage.subcategoriesCovered.length / allSubcategories.length) * 100;
    }
  }

  // ===========================================================================
  // Parsing Methods
  // ===========================================================================

  /**
   * Parse input documents into structured format
   */
  private async parseInput(input: AssessmentInput): Promise<ParsedInput> {
    const result: ParsedInput = {
      userStories: [],
      epics: [],
      rawContent: ''
    };

    // Parse user stories
    if (input.userStories) {
      if (typeof input.userStories === 'string') {
        result.userStories = this.parseUserStoriesFromText(input.userStories);
        result.rawContent += input.userStories + '\n';
      } else {
        result.userStories = input.userStories;
        result.rawContent += input.userStories.map(us => us.rawText || `As a ${us.asA}, I want ${us.iWant} so that ${us.soThat}`).join('\n');
      }
    }

    // Parse epics
    if (input.epics) {
      if (typeof input.epics === 'string') {
        result.epics = this.parseEpicsFromText(input.epics);
        result.rawContent += input.epics + '\n';
      } else {
        result.epics = input.epics;
        result.rawContent += input.epics.map(e => e.rawText || e.description).join('\n');
      }
    }

    // Parse functional specs
    if (input.functionalSpecs) {
      if (typeof input.functionalSpecs === 'string') {
        result.rawContent += input.functionalSpecs + '\n';
      } else {
        result.rawContent += input.functionalSpecs.map(s => s.rawText || s.sections.map(sec => sec.content).join('\n')).join('\n');
      }
    }

    // Parse architecture
    if (input.architecture) {
      if (typeof input.architecture === 'string') {
        result.rawContent += input.architecture + '\n';
      } else {
        result.rawContent += input.architecture.rawText || JSON.stringify(input.architecture);
      }
    }

    return result;
  }

  /**
   * Parse user stories from raw text
   */
  private parseUserStoriesFromText(text: string): UserStory[] {
    const stories: UserStory[] = [];

    // Pattern: "As a [role], I want [feature] so that [benefit]"
    const pattern = /As\s+a[n]?\s+([^,]+),\s*I\s+want\s+([^,]+?)(?:\s+so\s+that\s+(.+?))?(?=As\s+a[n]?\s+|$)/gi;

    let match;
    let index = 0;
    while ((match = pattern.exec(text)) !== null) {
      stories.push({
        id: `US-${(++index).toString().padStart(3, '0')}`,
        asA: match[1].trim(),
        iWant: match[2].trim(),
        soThat: match[3]?.trim() || '',
        rawText: match[0].trim()
      });
    }

    // If no pattern matches, treat lines as simple requirements
    if (stories.length === 0) {
      const lines = text.split('\n').filter(l => l.trim().length > 10);
      lines.forEach((line, i) => {
        stories.push({
          id: `US-${(i + 1).toString().padStart(3, '0')}`,
          asA: 'user',
          iWant: line.trim(),
          soThat: 'the system works as expected',
          rawText: line.trim()
        });
      });
    }

    return stories;
  }

  /**
   * Parse epics from raw text
   */
  private parseEpicsFromText(text: string): Epic[] {
    const epics: Epic[] = [];

    // Simple pattern: look for epic headers or numbered sections
    const sections = text.split(/(?:^|\n)(?:Epic\s*\d+[:\s]|#\s*)/i);

    sections.forEach((section, i) => {
      if (section.trim().length > 20) {
        const lines = section.trim().split('\n');
        epics.push({
          id: `EPIC-${(i + 1).toString().padStart(2, '0')}`,
          title: lines[0]?.substring(0, 100) || `Epic ${i + 1}`,
          description: section.trim(),
          rawText: section.trim()
        });
      }
    });

    // If no epics found, treat entire text as one epic
    if (epics.length === 0 && text.trim().length > 20) {
      epics.push({
        id: 'EPIC-01',
        title: text.substring(0, 100).split('\n')[0] || 'Requirements',
        description: text.trim(),
        rawText: text.trim()
      });
    }

    return epics;
  }

  // ===========================================================================
  // Context Detection
  // ===========================================================================

  /**
   * Detect project context from parsed input
   */
  private async detectContext(input: ParsedInput): Promise<ProjectContext> {
    const content = input.rawContent.toLowerCase();

    // Detect domain (legacy)
    const domain = this.detectDomain(content);

    // Detect domains with confidence (enhanced)
    const detectedDomains = this.detectDomainsWithConfidence(input.rawContent);

    // Extract entities
    const entities = this.extractEntities(input);

    return {
      domain,
      detectedDomains,
      domainHints: this.getDomainHints(content),
      projectType: this.detectProjectType(content),
      constraints: this.detectConstraints(content),
      entities
    };
  }

  /**
   * Detect primary domain (legacy method for backward compatibility)
   * Maps detailed domain detection to high-level categories
   */
  private detectDomain(content: string): ProjectContext['domain'] {
    // Use enhanced domain detection
    const detectedDomains = this.detectDomainsWithConfidence(content);

    // Map detailed domains to high-level ProjectDomain categories
    const domainMapping: Record<string, ProjectContext['domain']> = {
      'stripe-subscription': 'saas',
      'gdpr-compliance': 'ecommerce', // GDPR often applies to e-commerce
      'pci-dss': 'finance',
      'hipaa': 'healthcare',
      'oauth-oidc': 'saas',
      'webhook-integration': 'infrastructure'
    };

    // Legacy keyword-based fallback for domains not in registry
    const domainKeywords: Record<ProjectContext['domain'], string[]> = {
      'ecommerce': ['cart', 'checkout', 'payment', 'product', 'order', 'shop', 'buy', 'price'],
      'healthcare': ['patient', 'medical', 'health', 'clinical', 'diagnosis', 'hipaa', 'prescription'],
      'finance': ['account', 'transaction', 'payment', 'balance', 'banking', 'pci', 'credit'],
      'social': ['comment', 'like', 'share', 'follow', 'post', 'profile', 'community', 'forum'],
      'saas': ['subscription', 'tenant', 'plan', 'billing', 'dashboard', 'api key'],
      'infrastructure': ['deploy', 'pipeline', 'container', 'kubernetes', 'server', 'scaling'],
      'ml-ai': ['model', 'prediction', 'training', 'recommendation', 'nlp', 'neural', 'ml'],
      'sustainability': ['carbon', 'eco', 'sustainable', 'green', 'environmental', 'emissions'],
      'accessibility': ['wcag', 'screen reader', 'a11y', 'accessible', 'disability'],
      'generic': []
    };

    // If we have high-confidence detected domains, use them
    if (detectedDomains.length > 0 && detectedDomains[0].confidence >= 0.5) {
      const mappedDomain = domainMapping[detectedDomains[0].domain];
      if (mappedDomain) {
        return mappedDomain;
      }
    }

    // Legacy fallback: keyword counting
    let maxScore = 0;
    let detectedDomain: ProjectContext['domain'] = 'generic';

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      const score = keywords.filter(kw => content.includes(kw)).length;
      if (score > maxScore) {
        maxScore = score;
        detectedDomain = domain as ProjectContext['domain'];
      }
    }

    return detectedDomain;
  }

  /**
   * Enhanced domain detection with confidence scoring
   * Uses DomainPatternRegistry for precise, multi-domain detection
   */
  private detectDomainsWithConfidence(content: string): DetectedDomain[] {
    // Use the domain pattern registry for detection
    const registryResults = domainPatternRegistry.detectDomains(content);

    // Convert to DetectedDomain format
    return registryResults.map((result: DomainDetectionResult): DetectedDomain => ({
      domain: result.domain,
      displayName: result.displayName,
      confidence: result.confidence,
      matchedIndicators: result.matchedIndicators,
      requiredCoverage: result.requiredCoverage,
      complianceFrameworks: result.complianceFrameworks
    }));
  }

  /**
   * Get domain hints from content
   */
  private getDomainHints(content: string): string[] {
    const hints: string[] = [];

    if (content.includes('api') || content.includes('endpoint')) hints.push('api-driven');
    if (content.includes('mobile') || content.includes('app')) hints.push('mobile');
    if (content.includes('real-time') || content.includes('websocket')) hints.push('real-time');
    if (content.includes('batch') || content.includes('scheduled')) hints.push('batch-processing');
    if (content.includes('multi-tenant')) hints.push('multi-tenant');

    return hints;
  }

  /**
   * Detect project type
   */
  private detectProjectType(content: string): ProjectContext['projectType'] {
    if (content.includes('hipaa') || content.includes('pci') || content.includes('gdpr') || content.includes('compliance')) {
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

  /**
   * Detect constraints from content
   */
  private detectConstraints(content: string): string[] {
    const constraints: string[] = [];

    if (content.includes('legacy')) constraints.push('legacy-integration');
    if (content.includes('microservice')) constraints.push('microservices');
    if (content.includes('monolith')) constraints.push('monolithic');
    if (content.includes('offline')) constraints.push('offline-capable');
    if (content.includes('high availability') || content.includes('99.9')) constraints.push('high-availability');

    return constraints;
  }

  /**
   * Extract entities from parsed input
   */
  private extractEntities(input: ParsedInput): ProjectContext['entities'] {
    const actors = new Set<string>();
    const features = new Set<string>();
    const dataTypes = new Set<string>();
    const integrations = new Set<string>();
    const actions = new Set<string>();

    // Extract from user stories
    for (const story of input.userStories) {
      actors.add(story.asA);

      // Extract action verbs and features from "I want"
      const actionMatch = story.iWant.match(/^(to\s+)?(\w+)/i);
      if (actionMatch) {
        actions.add(actionMatch[2].toLowerCase());
      }
      features.add(story.iWant);
    }

    // Extract from raw content using patterns
    const content = input.rawContent;

    // Find data types (nouns after "store", "save", "create", etc.)
    const dataPattern = /(?:store|save|create|update|delete|manage)\s+(\w+)/gi;
    let match;
    while ((match = dataPattern.exec(content)) !== null) {
      dataTypes.add(match[1].toLowerCase());
    }

    // Find integrations (services, APIs, systems mentioned)
    const integrationPattern = /(?:integrate|connect|sync|call)\s+(?:with\s+)?(\w+)/gi;
    while ((match = integrationPattern.exec(content)) !== null) {
      integrations.add(match[1]);
    }

    return {
      actors: Array.from(actors),
      features: Array.from(features).slice(0, 20), // Limit
      dataTypes: Array.from(dataTypes),
      integrations: Array.from(integrations),
      actions: Array.from(actions)
    };
  }

  // ===========================================================================
  // SFDIPOT Analysis
  // ===========================================================================

  /**
   * Perform SFDIPOT analysis on parsed input
   */
  private async performSFDIPOTAnalysis(input: ParsedInput, context: ProjectContext): Promise<Map<HTSMCategory, CategoryAnalysis>> {
    const analysis = new Map<HTSMCategory, CategoryAnalysis>();

    for (const category of Object.values(HTSMCategory)) {
      const categoryAnalysis = await this.analyzeCategory(category, input, context);
      analysis.set(category, categoryAnalysis);
    }

    return analysis;
  }

  /**
   * Analyze a single SFDIPOT category with brutal honesty validation
   */
  private async analyzeCategory(category: HTSMCategory, input: ParsedInput, context: ProjectContext): Promise<CategoryAnalysis> {
    const subcategories = SFDIPOT_SUBCATEGORIES[category];
    const testIdeas: TestIdea[] = [];
    const rejectedIdeas: TestIdea[] = [];
    const allFindings: Array<{id: string; severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; category: string; title: string; description: string; evidence: string; recommendation: string; impactIfIgnored: string}> = [];
    const coverageWarnings: Array<{id: string; severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; category: string; title: string; description: string; evidence: string; recommendation: string; impactIfIgnored: string}> = [];
    const subcategoriesCovered: string[] = [];
    let totalQualityScore = 0;
    let validatedCount = 0;

    for (const subcategory of subcategories) {
      const ideas = this.generateTestIdeasForSubcategory(category, subcategory, input, context);
      if (ideas.length > 0) {
        subcategoriesCovered.push(subcategory);
      }

      // Apply brutal honesty validation if enabled
      // Now includes domain-specific quality calibration
      if (this.enableBrutalHonesty && ideas.length > 0) {
        const validations = this.testIdeaGenerator.getBrutalHonestyAnalyzer().validateTestIdeas(
          ideas,
          category,
          context.detectedDomains
        );

        for (const validation of validations) {
          validatedCount++;
          totalQualityScore += validation.qualityScore;

          // Collect all findings
          for (const warning of validation.warnings) {
            const finding = {
              id: warning.id,
              severity: warning.severity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
              category: warning.category,
              title: warning.title,
              description: warning.description,
              evidence: warning.evidence,
              recommendation: warning.recommendation,
              impactIfIgnored: warning.impactIfIgnored,
            };
            allFindings.push(finding);

            // Track coverage gaps separately
            if (warning.category === 'Coverage Gap') {
              coverageWarnings.push(finding);
            }
          }

          // Quality gate: only include ideas that meet minimum score
          if (validation.qualityScore >= this.minQualityScore) {
            testIdeas.push(validation.originalIdea);
          } else {
            rejectedIdeas.push(validation.originalIdea);
            console.warn(`[${this.agentId.id}] Rejected low-quality test idea (score: ${validation.qualityScore}): ${validation.originalIdea.description.substring(0, 60)}...`);
          }
        }
      } else {
        // No validation - include all ideas
        testIdeas.push(...ideas.slice(0, this.maxTestIdeasPerSubcategory));
      }
    }

    // Add skill-enhanced test ideas (Phase 6 integration)
    const skillEnhancedIdeas = this.skillIntegration.generateEnhancedTestIdeas(category, context);

    // Also validate skill-enhanced ideas if brutal honesty is enabled
    // Includes domain-specific quality calibration for enhanced ideas
    if (this.enableBrutalHonesty && skillEnhancedIdeas.length > 0) {
      const skillValidations = this.testIdeaGenerator.getBrutalHonestyAnalyzer().validateTestIdeas(
        skillEnhancedIdeas,
        category,
        context.detectedDomains
      );
      for (const validation of skillValidations) {
        validatedCount++;
        totalQualityScore += validation.qualityScore;

        if (validation.qualityScore >= this.minQualityScore) {
          testIdeas.push(validation.originalIdea);
        } else {
          rejectedIdeas.push(validation.originalIdea);
        }
      }
    } else {
      testIdeas.push(...skillEnhancedIdeas);
    }

    const subcategoriesMissing = subcategories.filter(s => !subcategoriesCovered.includes(s));
    const coveragePercentage = (subcategoriesCovered.length / subcategories.length) * 100;
    const avgQualityScore = validatedCount > 0 ? Math.round(totalQualityScore / validatedCount) : 100;

    // Build validation summary
    const validation = this.enableBrutalHonesty ? {
      qualityScore: avgQualityScore,
      rejectedIdeas,
      coverageWarnings,
      findings: allFindings,
    } : undefined;

    if (rejectedIdeas.length > 0) {
      console.log(`[${this.agentId.id}] ${category}: ${testIdeas.length} accepted, ${rejectedIdeas.length} rejected (quality threshold: ${this.minQualityScore})`);
    }

    return {
      category,
      testIdeas,
      clarifyingQuestions: [], // Will be populated later
      coverage: {
        subcategoriesCovered,
        subcategoriesMissing,
        coveragePercentage
      },
      validation,
    };
  }

  /**
   * Generate test ideas for a specific subcategory
   */
  private generateTestIdeasForSubcategory(
    category: HTSMCategory,
    subcategory: string,
    input: ParsedInput,
    context: ProjectContext
  ): TestIdea[] {
    const ideas: TestIdea[] = [];

    // Generate ideas based on user stories and context
    for (const story of input.userStories) {
      const relevantIdeas = this.mapStoryToSubcategory(story, category, subcategory, context);
      ideas.push(...relevantIdeas);
    }

    // Add generic ideas for the subcategory if needed
    if (ideas.length === 0) {
      const genericIdeas = this.getGenericIdeasForSubcategory(category, subcategory, context);
      ideas.push(...genericIdeas);
    }

    return ideas;
  }

  /**
   * Map a user story to test ideas for a specific subcategory
   */
  private mapStoryToSubcategory(
    story: UserStory,
    category: HTSMCategory,
    subcategory: string,
    context: ProjectContext
  ): TestIdea[] {
    const ideas: TestIdea[] = [];
    const storyText = story.iWant.toLowerCase();

    // Check if story is relevant to this subcategory
    const isRelevant = this.isStoryRelevantToSubcategory(storyText, category, subcategory);

    if (isRelevant) {
      // Generate test idea based on category type
      const idea = this.createTestIdea(category, subcategory, story, context);
      ideas.push(idea);
    }

    return ideas;
  }

  /**
   * Check if a story is relevant to a subcategory
   */
  private isStoryRelevantToSubcategory(storyText: string, category: HTSMCategory, subcategory: string): boolean {
    // Mapping of subcategories to keywords
    const relevanceMap: Record<string, string[]> = {
      // STRUCTURE
      'Code': ['service', 'component', 'module', 'class'],
      'Dependencies': ['integrate', 'connect', 'use', 'require'],
      'Hardware': ['device', 'sensor', 'hardware'],

      // FUNCTION
      'Application': ['want', 'able', 'can', 'should'],
      'Calculation': ['calculate', 'compute', 'total', 'sum', 'average'],
      'ErrorHandling': ['error', 'fail', 'invalid', 'incorrect'],
      'StateTransition': ['status', 'state', 'workflow', 'process'],
      'Security': ['login', 'auth', 'permission', 'access', 'secure'],

      // DATA
      'InputOutput': ['enter', 'input', 'display', 'show', 'output'],
      'Lifecycle': ['create', 'update', 'delete', 'save', 'modify'],
      'Cardinality': ['multiple', 'list', 'many', 'single', 'one'],
      'Boundaries': ['limit', 'max', 'min', 'range', 'boundary'],
      'Persistence': ['store', 'save', 'persist', 'remember'],

      // INTERFACES
      'UserInterface': ['click', 'button', 'form', 'page', 'screen', 'ui'],
      'ApiSdk': ['api', 'endpoint', 'rest', 'graphql'],
      'SystemInterface': ['service', 'system', 'backend'],
      'ImportExport': ['import', 'export', 'download', 'upload'],

      // PLATFORM
      'Browser': ['browser', 'chrome', 'firefox', 'safari'],
      'OperatingSystem': ['windows', 'mac', 'linux', 'ios', 'android'],
      'ExternalSoftware': ['third-party', 'external', 'integration'],

      // OPERATIONS
      'CommonUse': ['user', 'customer', 'want', 'need'],
      'UncommonUse': ['edge', 'rare', 'unusual'],
      'ExtremeUse': ['load', 'stress', 'concurrent', 'bulk'],
      'DisfavoredUse': ['attack', 'malicious', 'invalid', 'injection'],

      // TIME
      'Timing': ['fast', 'slow', 'performance', 'quick'],
      'Concurrency': ['concurrent', 'parallel', 'simultaneous'],
      'Scheduling': ['schedule', 'cron', 'timer', 'delay'],
      'Timeout': ['timeout', 'expire', 'deadline']
    };

    const keywords = relevanceMap[subcategory] || [];
    return keywords.some(kw => storyText.includes(kw));
  }

  /**
   * Create a test idea from a user story
   */
  private createTestIdea(
    category: HTSMCategory,
    subcategory: string,
    story: UserStory,
    context: ProjectContext
  ): TestIdea {
    const description = this.generateTestDescription(category, subcategory, story);
    const priority = this.calculatePriority(category, subcategory, story, context);
    const automationFitness = this.determineAutomationFitness(category, subcategory, story);

    return {
      id: generateTestId(category),
      category,
      subcategory,
      description,
      priority,
      automationFitness,
      sourceRequirement: story.id,
      tags: [
        `htsm:${category.toLowerCase()}`,
        `htsm:${subcategory}`,
        `priority:${priority}`
      ]
    };
  }

  /**
   * Generate test description based on category and story
   */
  private generateTestDescription(category: HTSMCategory, subcategory: string, story: UserStory): string {
    const templates: Record<HTSMCategory, Record<string, string>> = {
      [HTSMCategory.STRUCTURE]: {
        'Code': `Verify that ${story.iWant} integrates correctly with system components`,
        'Dependencies': `Verify dependency management for ${story.iWant}`,
        'default': `Verify structural integrity of ${story.iWant}`
      },
      [HTSMCategory.FUNCTION]: {
        'Application': `Verify that ${story.asA} can ${story.iWant}`,
        'Calculation': `Verify calculations in ${story.iWant}`,
        'ErrorHandling': `Verify error handling when ${story.iWant} fails`,
        'StateTransition': `Verify state transitions for ${story.iWant}`,
        'Security': `Verify security controls for ${story.iWant}`,
        'default': `Verify functional behavior of ${story.iWant}`
      },
      [HTSMCategory.DATA]: {
        'InputOutput': `Validate input/output processing of ${story.iWant}`,
        'Lifecycle': `Verify data lifecycle (CRUD) for ${story.iWant}`,
        'Cardinality': `Verify cardinality handling in ${story.iWant}`,
        'Boundaries': `Check boundary values for ${story.iWant}`,
        'Persistence': `Verify data persistence for ${story.iWant}`,
        'default': `Verify data handling for ${story.iWant}`
      },
      [HTSMCategory.INTERFACES]: {
        'UserInterface': `Verify UI behavior for ${story.iWant}`,
        'ApiSdk': `Verify API endpoint for ${story.iWant}`,
        'SystemInterface': `Verify system integration for ${story.iWant}`,
        'ImportExport': `Verify import/export for ${story.iWant}`,
        'default': `Verify interface for ${story.iWant}`
      },
      [HTSMCategory.PLATFORM]: {
        'Browser': `Verify cross-browser compatibility for ${story.iWant}`,
        'OperatingSystem': `Verify OS compatibility for ${story.iWant}`,
        'default': `Verify platform compatibility for ${story.iWant}`
      },
      [HTSMCategory.OPERATIONS]: {
        'CommonUse': `Verify common usage scenario: ${story.asA} ${story.iWant}`,
        'UncommonUse': `Verify edge cases when ${story.iWant}`,
        'ExtremeUse': `Verify behavior under load for ${story.iWant}`,
        'DisfavoredUse': `Verify protection against misuse of ${story.iWant}`,
        'default': `Verify operational behavior of ${story.iWant}`
      },
      [HTSMCategory.TIME]: {
        'Timing': `Verify timing/performance of ${story.iWant}`,
        'Concurrency': `Verify concurrent access for ${story.iWant}`,
        'Scheduling': `Verify scheduling behavior for ${story.iWant}`,
        'Timeout': `Verify timeout handling for ${story.iWant}`,
        'default': `Verify time-related behavior of ${story.iWant}`
      }
    };

    const categoryTemplates = templates[category] || {};
    const template = categoryTemplates[subcategory] || categoryTemplates['default'] || `Verify ${story.iWant}`;

    return template;
  }

  /**
   * Calculate priority based on risk factors
   */
  private calculatePriority(
    category: HTSMCategory,
    subcategory: string,
    story: UserStory,
    context: ProjectContext
  ): Priority {
    let riskScore = 0;

    // Category-based risk
    const categoryRisk: Record<HTSMCategory, number> = {
      [HTSMCategory.FUNCTION]: 4,    // Core functionality
      [HTSMCategory.OPERATIONS]: 4,  // Security/misuse
      [HTSMCategory.DATA]: 3,        // Data integrity
      [HTSMCategory.INTERFACES]: 3,  // Integration points
      [HTSMCategory.TIME]: 2,        // Timing issues
      [HTSMCategory.STRUCTURE]: 2,   // Architecture
      [HTSMCategory.PLATFORM]: 1     // Compatibility
    };
    riskScore += categoryRisk[category] || 2;

    // Subcategory-based risk
    const highRiskSubcategories = ['Security', 'ErrorHandling', 'DisfavoredUse', 'Persistence', 'Concurrency'];
    if (highRiskSubcategories.includes(subcategory)) {
      riskScore += 2;
    }

    // Context-based risk
    if (context.projectType === 'regulated') riskScore += 2;
    if (context.domain === 'healthcare' || context.domain === 'finance') riskScore += 2;

    // Story content risk
    const storyText = story.iWant.toLowerCase();
    if (storyText.includes('payment') || storyText.includes('credit')) riskScore += 3;
    if (storyText.includes('auth') || storyText.includes('login')) riskScore += 2;
    if (storyText.includes('delete') || storyText.includes('remove')) riskScore += 1;

    // Map score to priority
    if (riskScore >= 8) return Priority.P0;
    if (riskScore >= 5) return Priority.P1;
    if (riskScore >= 3) return Priority.P2;
    return Priority.P3;
  }

  /**
   * Determine automation fitness for a test idea
   */
  private determineAutomationFitness(
    category: HTSMCategory,
    subcategory: string,
    story: UserStory
  ): AutomationFitness {
    const storyText = story.iWant.toLowerCase();

    // Security-related → security testing
    if (subcategory === 'Security' || subcategory === 'DisfavoredUse') {
      return AutomationFitness.Security;
    }

    // Concurrency → concurrency testing
    if (subcategory === 'Concurrency') {
      return AutomationFitness.Concurrency;
    }

    // Performance/timing → performance testing
    if (subcategory === 'Timing' || subcategory === 'ExtremeUse' || storyText.includes('performance')) {
      return AutomationFitness.Performance;
    }

    // UI-related → E2E or Visual
    if (subcategory === 'UserInterface' || category === HTSMCategory.INTERFACES) {
      if (storyText.includes('look') || storyText.includes('display') || storyText.includes('style')) {
        return AutomationFitness.Visual;
      }
      return AutomationFitness.E2E;
    }

    // API/Integration
    if (subcategory === 'ApiSdk' || subcategory === 'SystemInterface') {
      return AutomationFitness.Integration;
    }

    // Data operations → API level
    if (category === HTSMCategory.DATA || category === HTSMCategory.FUNCTION) {
      return AutomationFitness.API;
    }

    // Uncommon/edge cases → human exploration
    if (subcategory === 'UncommonUse') {
      return AutomationFitness.Human;
    }

    // Default to API level
    return AutomationFitness.API;
  }

  /**
   * Get generic test ideas for a subcategory when no stories match
   */
  private getGenericIdeasForSubcategory(
    _category: HTSMCategory,
    _subcategory: string,
    _context: ProjectContext
  ): TestIdea[] {
    // Return empty for now - will be populated based on context
    // This avoids generating low-value generic tests
    return [];
  }

  // ===========================================================================
  // Public Analysis Methods
  // ===========================================================================

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
    const questions = await this.generateClarifyingQuestions(analysis, context, input.useLLM);
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
  // Question Generation
  // ===========================================================================

  /**
   * Generate clarifying questions for coverage gaps
   */
  private async generateClarifyingQuestions(
    analysis: Map<HTSMCategory, CategoryAnalysis>,
    context: ProjectContext,
    useLLM?: boolean
  ): Promise<ClarifyingQuestion[]> {
    const questions: ClarifyingQuestion[] = [];

    for (const [category, categoryAnalysis] of Array.from(analysis.entries())) {
      const missingSubcategories = categoryAnalysis.coverage.subcategoriesMissing;

      for (const subcategory of missingSubcategories) {
        const categoryQuestions = await this.generateQuestionsForSubcategory(
          category,
          subcategory,
          context,
          useLLM
        );
        questions.push(...categoryQuestions);
      }
    }

    return questions;
  }

  /**
   * Generate questions for a specific subcategory
   */
  private async generateQuestionsForSubcategory(
    category: HTSMCategory,
    subcategory: string,
    context: ProjectContext,
    useLLM?: boolean
  ): Promise<ClarifyingQuestion[]> {
    // If LLM is enabled and available, use it for context-aware questions
    if (useLLM && this.llmConfig.enabled) {
      try {
        return await this.generateQuestionsWithLLM(category, subcategory, context);
      } catch (error) {
        console.warn(`[${this.agentId.id}] LLM question generation failed, falling back to templates`);
      }
    }

    // Use QuestionGenerator's penetrating questions (Bach-inspired)
    const penetratingQuestion = this.questionGenerator.getQuestionForSubcategory(
      category,
      subcategory,
      context
    );

    if (penetratingQuestion) {
      return [penetratingQuestion];
    }

    // Fall back to generic template questions only if no penetrating question available
    return this.generateTemplateQuestions(category, subcategory, context);
  }

  /**
   * Generate questions using LLM
   */
  private async generateQuestionsWithLLM(
    category: HTSMCategory,
    subcategory: string,
    context: ProjectContext
  ): Promise<ClarifyingQuestion[]> {
    const prompt = `You are a QE expert using James Bach's HTSM Product Factors framework.

Generate 2-3 specific, context-aware clarifying questions for the "${subcategory}" subcategory under "${category}".

Project Context:
- Domain: ${context.domain}
- Type: ${context.projectType}
- Key features: ${context.entities.features.slice(0, 5).join(', ')}
- Actors: ${context.entities.actors.join(', ')}

Requirements:
1. Questions must be specific to this project, NOT generic
2. Each question should address a potential coverage gap
3. Include a brief rationale for why this information is needed

Format your response as JSON:
[
  { "question": "...", "rationale": "..." }
]`;

    try {
      const response = await this.llmComplete(prompt, {
        maxTokens: 500,
        temperature: 0.7
      });

      // llmComplete returns a string directly
      const parsed = JSON.parse(response);
      return parsed.map((q: { question: string; rationale: string }) => ({
        category,
        subcategory,
        question: q.question,
        rationale: q.rationale,
        source: 'llm' as const
      }));
    } catch {
      return this.generateTemplateQuestions(category, subcategory, context);
    }
  }

  /**
   * Generate template-based questions
   */
  private generateTemplateQuestions(
    category: HTSMCategory,
    subcategory: string,
    _context: ProjectContext
  ): ClarifyingQuestion[] {
    const templates: Record<string, { questions: string[]; rationale: string }> = {
      // STRUCTURE
      'Code': {
        questions: ['What code quality standards apply?', 'What is the expected code coverage?'],
        rationale: 'Code structure requirements are not specified'
      },
      'Dependencies': {
        questions: ['What third-party dependencies are required?', 'What happens if a dependency fails?'],
        rationale: 'External dependencies are not documented'
      },

      // FUNCTION
      'Security': {
        questions: ['What authentication method is used?', 'What authorization levels exist?'],
        rationale: 'Security requirements need clarification'
      },
      'ErrorHandling': {
        questions: ['How should errors be displayed to users?', 'What logging is required for errors?'],
        rationale: 'Error handling strategy is not defined'
      },

      // DATA
      'Persistence': {
        questions: ['What data must persist across sessions?', 'What is the backup strategy?'],
        rationale: 'Data persistence requirements are unclear'
      },
      'Boundaries': {
        questions: ['What are the minimum and maximum values?', 'What are the character limits?'],
        rationale: 'Boundary conditions are not specified'
      },

      // INTERFACES
      'ApiSdk': {
        questions: ['What API versioning strategy is used?', 'What authentication does the API require?'],
        rationale: 'API specifications need clarification'
      },

      // PLATFORM
      'Browser': {
        questions: ['Which browsers must be supported?', 'What is the minimum browser version?'],
        rationale: 'Browser compatibility requirements are not specified'
      },

      // OPERATIONS
      'ExtremeUse': {
        questions: ['What is the expected peak load?', 'What are the performance SLAs?'],
        rationale: 'Performance requirements are not defined'
      },

      // TIME
      'Concurrency': {
        questions: ['Can multiple users access the same resource?', 'How are conflicts resolved?'],
        rationale: 'Concurrent access scenarios are not addressed'
      },
      'Timeout': {
        questions: ['What are the timeout values for operations?', 'How should timeouts be handled?'],
        rationale: 'Timeout handling is not specified'
      }
    };

    const template = templates[subcategory];
    if (!template) {
      return [{
        category,
        subcategory,
        question: `What are the requirements for ${subcategory} in this context?`,
        rationale: `The ${subcategory} subcategory has no coverage in the provided requirements`,
        source: 'template'
      }];
    }

    return template.questions.map(q => ({
      category,
      subcategory,
      question: q,
      rationale: template.rationale,
      source: 'template' as const
    }));
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Flatten test ideas from category analysis
   */
  private flattenTestIdeas(analysis: Map<HTSMCategory, CategoryAnalysis>): TestIdea[] {
    const ideas: TestIdea[] = [];
    for (const categoryAnalysis of Array.from(analysis.values())) {
      ideas.push(...categoryAnalysis.testIdeas);
    }
    return ideas;
  }

  /**
   * Flatten questions from analysis and additional questions
   */
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

  /**
   * Inject domain-specific test ideas for missing coverage areas
   * Uses the DomainPatternRegistry to generate test ideas that address gaps
   */
  private injectMissingDomainCoverage(
    missingCoverage: string[],
    context: ProjectContext
  ): TestIdea[] {
    const injectedIdeas: TestIdea[] = [];

    // Get domain names from context
    const domainNames = context.detectedDomains
      .filter(d => d.confidence >= 0.5)
      .map(d => d.domain);

    if (domainNames.length === 0) {
      return injectedIdeas;
    }

    // Get all domain test ideas
    const domainTestIdeas = domainPatternRegistry.generateDomainTestIdeas(domainNames);

    // Find ideas that address missing coverage
    for (const missing of missingCoverage) {
      const coverageKeywords = missing.toLowerCase().split('-');

      // Find ideas that match the missing coverage
      const matchingIdeas = domainTestIdeas.filter(idea => {
        const desc = idea.description.toLowerCase();
        const tags = (idea.tags || []).map(t => t.toLowerCase());
        return coverageKeywords.some(kw => desc.includes(kw) || tags.includes(kw));
      });

      // Add up to 2 matching ideas per missing coverage
      for (const idea of matchingIdeas.slice(0, 2)) {
        // Avoid duplicates
        if (!injectedIdeas.some(i => i.id === idea.id)) {
          // Add a tag indicating this was injected for coverage
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

  /**
   * Create assessment summary with brutal honesty statistics
   * Enhanced with domain coverage validation
   */
  private createSummary(
    testIdeas: TestIdea[],
    questions: ClarifyingQuestion[],
    categoryAnalysis?: Map<HTSMCategory, CategoryAnalysis>,
    requirementsQualityScore?: number,
    domainCoverageValidation?: { missing: string[]; covered: string[]; score: number }
  ): AssessmentSummary {
    const byCategory: Record<HTSMCategory, number> = {} as Record<HTSMCategory, number>;
    const byPriority: Record<Priority, number> = {} as Record<Priority, number>;
    const byAutomationFitness: Record<AutomationFitness, number> = {} as Record<AutomationFitness, number>;

    // Initialize counters
    for (const cat of Object.values(HTSMCategory)) byCategory[cat] = 0;
    for (const pri of Object.values(Priority)) byPriority[pri] = 0;
    for (const af of Object.values(AutomationFitness)) byAutomationFitness[af] = 0;

    // Count test ideas
    for (const idea of testIdeas) {
      byCategory[idea.category]++;
      byPriority[idea.priority]++;
      byAutomationFitness[idea.automationFitness]++;
    }

    // Calculate coverage score
    const categoriesWithTests = Object.values(byCategory).filter(c => c > 0).length;
    const overallCoverageScore = (categoriesWithTests / Object.keys(HTSMCategory).length) * 100;

    // Build brutal honesty summary if validation data is available
    let brutalHonesty: AssessmentSummary['brutalHonesty'] | undefined;

    if (this.enableBrutalHonesty && categoryAnalysis) {
      let totalQualityScore = 0;
      let totalRejected = 0;
      let totalFindings = 0;
      const bySeverity: Record<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW', number> = {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
      };
      let categoryCount = 0;

      for (const [, analysis] of Array.from(categoryAnalysis.entries())) {
        if (analysis.validation) {
          categoryCount++;
          totalQualityScore += analysis.validation.qualityScore;
          totalRejected += analysis.validation.rejectedIdeas.length;
          totalFindings += analysis.validation.findings.length;

          for (const finding of analysis.validation.findings) {
            bySeverity[finding.severity]++;
          }
        }
      }

      // Factor in domain coverage score if available
      let overallQualityScore = categoryCount > 0 ? Math.round(totalQualityScore / categoryCount) : 100;

      if (domainCoverageValidation) {
        // Weight domain coverage into the overall score (20% weight)
        overallQualityScore = Math.round(
          overallQualityScore * 0.8 + domainCoverageValidation.score * 0.2
        );
      }

      brutalHonesty = {
        overallQualityScore,
        totalRejected,
        totalFindings,
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

  /**
   * Get source document names
   */
  private getSourceDocumentNames(input: AssessmentInput): string[] {
    const names: string[] = [];
    if (input.userStories) names.push('User Stories');
    if (input.epics) names.push('Epics');
    if (input.functionalSpecs) names.push('Functional Specs');
    if (input.architecture) names.push('Technical Architecture');
    if (input.codebaseRootDir) names.push(`Codebase: ${input.codebaseRootDir}`);
    if (input.websiteUrl) names.push(`Website: ${input.websiteUrl}`);
    return names;
  }

  /**
   * Generate formatted outputs using modular formatters
   */
  private async generateFormattedOutputs(
    name: string,
    analysis: Map<HTSMCategory, CategoryAnalysis>,
    testIdeas: TestIdea[],
    questions: ClarifyingQuestion[],
    summary: AssessmentSummary,
    format: AssessmentInput['outputFormat'],
    requirementsQualityData?: RequirementsQualityScore
  ): Promise<{ html?: string; json?: string; markdown?: string; gherkin?: Map<string, string> }> {
    const result: { html?: string; json?: string; markdown?: string; gherkin?: Map<string, string> } = {};
    const formats = Array.isArray(format) ? format : format === 'all' ? ['html', 'json', 'markdown', 'gherkin'] : [format];

    // Build AssessmentOutput for formatters
    const assessmentOutput: AssessmentOutput = {
      name,
      sourceDocuments: [],
      categoryAnalysis: analysis,
      testIdeas,
      clarifyingQuestions: questions,
      summary
    };

    // Use modular formatters (Phase 5 integration)
    // Pass requirementsQualityData (includes scoringRubric and acAnalysis) for Reality Check section
    if (formats.includes('html')) {
      result.html = this.htmlFormatter.format(assessmentOutput, requirementsQualityData, requirementsQualityData?.findings);
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

  /**
   * Store assessment result in memory
   */
  private async storeAssessmentResult(result: AssessmentOutput): Promise<void> {
    const key = `assessment:${result.name}:${Date.now()}`;
    await this.storeMemory(key, {
      name: result.name,
      testIdeasCount: result.testIdeas.length,
      questionsCount: result.clarifyingQuestions.length,
      summary: result.summary,
      generatedAt: new Date()
    });
  }
}

// =============================================================================
// Internal Types
// =============================================================================

interface ParsedInput {
  userStories: UserStory[];
  epics: Epic[];
  rawContent: string;
}

// =============================================================================
// Exports
// =============================================================================

export * from './types';
