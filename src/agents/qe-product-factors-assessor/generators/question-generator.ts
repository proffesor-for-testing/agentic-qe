/**
 * Clarifying Question Generator
 *
 * Generates clarifying questions for SFDIPOT subcategories that lack
 * sufficient coverage in the input documentation.
 */

import {
  HTSMCategory,
  SFDIPOT_SUBCATEGORIES,
  StructureSubcategory,
  FunctionSubcategory,
  DataSubcategory,
  InterfacesSubcategory,
  PlatformSubcategory,
  OperationsSubcategory,
  TimeSubcategory,
  ClarifyingQuestion,
  ProjectContext,
} from '../types';
import { CategoryAnalysisResult, SubcategoryAnalysis } from '../analyzers';

export interface QuestionGeneratorConfig {
  maxQuestionsPerCategory: number;
  coverageThreshold: number; // Generate questions if coverage below this
}

/**
 * Question Generator
 *
 * Generates context-aware clarifying questions to fill coverage gaps
 * in the input documentation.
 */
export class QuestionGenerator {
  private config: QuestionGeneratorConfig;

  constructor(config: Partial<QuestionGeneratorConfig> = {}) {
    this.config = {
      maxQuestionsPerCategory: config.maxQuestionsPerCategory || 5,
      coverageThreshold: config.coverageThreshold || 0.3,
    };
  }

  /**
   * Generate questions for gaps in category analysis
   */
  generateForCategory(
    analysis: CategoryAnalysisResult,
    context: ProjectContext
  ): ClarifyingQuestion[] {
    const questions: ClarifyingQuestion[] = [];

    // Get uncovered subcategories
    const uncovered = analysis.subcategoryAnalysis.filter(
      s => s.relevance < this.config.coverageThreshold
    );

    for (const subcatAnalysis of uncovered.slice(0, this.config.maxQuestionsPerCategory)) {
      const question = this.generateQuestion(
        analysis.category,
        subcatAnalysis,
        context
      );
      if (question) {
        questions.push(question);
      }
    }

    return questions;
  }

  /**
   * Generate a question for a specific subcategory gap
   */
  private generateQuestion(
    category: HTSMCategory,
    subcatAnalysis: SubcategoryAnalysis,
    context: ProjectContext
  ): ClarifyingQuestion | null {
    const template = this.getQuestionTemplate(category, subcatAnalysis.subcategory, context);

    if (!template) {
      return null;
    }

    return {
      category,
      subcategory: subcatAnalysis.subcategory,
      question: template.question,
      rationale: template.rationale,
      source: 'template',
    };
  }

  /**
   * Get question template for a subcategory
   */
  private getQuestionTemplate(
    category: HTSMCategory,
    subcategory: string,
    context: ProjectContext
  ): { question: string; rationale: string } | null {
    const templates: Record<string, { question: string; rationale: string }> = {
      // STRUCTURE questions
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.Code}`]: {
        question: 'What are the main code modules and their responsibilities?',
        rationale: 'Understanding code structure helps identify unit test boundaries',
      },
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.Hardware}`]: {
        question: 'What are the hardware requirements and deployment infrastructure?',
        rationale: 'Hardware constraints affect performance and compatibility testing',
      },
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.NonPhysical}`]: {
        question: 'What configuration options and environment variables are used?',
        rationale: 'Configuration testing ensures behavior across different setups',
      },
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.Dependencies}`]: {
        question: 'What are the external dependencies and their version requirements?',
        rationale: 'Dependency management affects stability and security',
      },
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.Documentation}`]: {
        question: 'What documentation exists for the system (API docs, user guides)?',
        rationale: 'Documentation quality affects usability testing',
      },

      // FUNCTION questions
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Application}`]: {
        question: 'What are the core features and their expected behaviors?',
        rationale: 'Core functionality requires comprehensive test coverage',
      },
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Calculation}`]: {
        question: 'Are there any calculations or formulas that need verification?',
        rationale: 'Calculations require precision testing with known values',
      },
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.ErrorHandling}`]: {
        question: 'How should the system handle errors and failure scenarios?',
        rationale: 'Error handling affects user experience and system resilience',
      },
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.StateTransition}`]: {
        question: 'What are the valid state transitions and workflow steps?',
        rationale: 'State machines need validation of all valid and invalid transitions',
      },
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Security}`]: {
        question: 'What authentication and authorization mechanisms are used?',
        rationale: 'Security is critical and requires dedicated testing',
      },
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Startup}`]: {
        question: 'What is the startup/initialization sequence?',
        rationale: 'Startup failures are high-impact issues',
      },
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Shutdown}`]: {
        question: 'How should the system handle graceful shutdown?',
        rationale: 'Graceful shutdown prevents data loss and corruption',
      },

      // DATA questions
      [`${HTSMCategory.DATA}-${DataSubcategory.InputOutput}`]: {
        question: 'What are the expected input formats and validation rules?',
        rationale: 'Input validation prevents invalid data from entering the system',
      },
      [`${HTSMCategory.DATA}-${DataSubcategory.Lifecycle}`]: {
        question: 'What is the data lifecycle (creation, modification, deletion, archival)?',
        rationale: 'CRUD operations need complete coverage',
      },
      [`${HTSMCategory.DATA}-${DataSubcategory.Cardinality}`]: {
        question: 'What are the expected data volumes and relationship cardinalities?',
        rationale: 'Cardinality affects query performance and data integrity',
      },
      [`${HTSMCategory.DATA}-${DataSubcategory.Boundaries}`]: {
        question: 'What are the minimum and maximum values for numeric fields?',
        rationale: 'Boundary testing catches off-by-one errors',
      },
      [`${HTSMCategory.DATA}-${DataSubcategory.Persistence}`]: {
        question: 'How is data persisted and what are the durability requirements?',
        rationale: 'Data persistence requires verification of write and read paths',
      },
      [`${HTSMCategory.DATA}-${DataSubcategory.Types}`]: {
        question: 'What data types and formats are used (dates, currencies, etc.)?',
        rationale: 'Data type handling varies across systems and locales',
      },
      [`${HTSMCategory.DATA}-${DataSubcategory.Selection}`]: {
        question: 'What search, filter, and sorting capabilities are needed?',
        rationale: 'Query functionality requires comprehensive testing',
      },

      // INTERFACES questions
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.UserInterface}`]: {
        question: 'What UI frameworks and components are used?',
        rationale: 'UI testing strategy depends on the framework',
      },
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.ApiSdk}`]: {
        question: 'What APIs are exposed and what is the authentication mechanism?',
        rationale: 'API testing is efficient and provides broad coverage',
      },
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.SystemInterface}`]: {
        question: 'What external systems does this integrate with?',
        rationale: 'Integration points are common sources of issues',
      },
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.ImportExport}`]: {
        question: 'What import/export file formats are supported?',
        rationale: 'File handling requires format-specific testing',
      },
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.Messaging}`]: {
        question: 'What messaging or event-driven patterns are used?',
        rationale: 'Async messaging requires testing of ordering and delivery',
      },

      // PLATFORM questions
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.Browser}`]: {
        question: 'Which browsers and versions must be supported?',
        rationale: 'Browser matrix determines cross-browser testing scope',
      },
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.OperatingSystem}`]: {
        question: 'Which operating systems must be supported?',
        rationale: 'OS differences affect file paths, line endings, and behavior',
      },
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.Hardware}`]: {
        question: 'What are the minimum hardware requirements?',
        rationale: 'Hardware constraints affect performance testing',
      },
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.ExternalSoftware}`]: {
        question: 'What databases, caches, or other infrastructure is required?',
        rationale: 'External software requires integration testing',
      },
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.InternalComponents}`]: {
        question: 'What internal libraries or shared components are used?',
        rationale: 'Shared components need isolated and integrated testing',
      },

      // OPERATIONS questions
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.CommonUse}`]: {
        question: 'What are the most common user workflows?',
        rationale: 'Common workflows are highest priority for testing',
      },
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.UncommonUse}`]: {
        question: 'What are the edge cases or unusual usage patterns?',
        rationale: 'Edge cases often reveal hidden bugs',
      },
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.ExtremeUse}`]: {
        question: 'What are the expected peak loads and extreme usage scenarios?',
        rationale: 'Extreme conditions reveal scalability issues',
      },
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.DisfavoredUse}`]: {
        question: 'What actions should be blocked or restricted?',
        rationale: 'Negative testing ensures proper restrictions',
      },
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.Users}`]: {
        question: 'What user roles and personas exist?',
        rationale: 'Role-based testing ensures proper access control',
      },
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.Environment}`]: {
        question: 'What environments exist (dev, staging, production)?',
        rationale: 'Environment differences can cause deployment issues',
      },

      // TIME questions
      [`${HTSMCategory.TIME}-${TimeSubcategory.Timing}`]: {
        question: 'What are the performance requirements and SLAs?',
        rationale: 'Performance testing requires clear targets',
      },
      [`${HTSMCategory.TIME}-${TimeSubcategory.Concurrency}`]: {
        question: 'What concurrent access patterns are expected?',
        rationale: 'Concurrency testing reveals race conditions',
      },
      [`${HTSMCategory.TIME}-${TimeSubcategory.Scheduling}`]: {
        question: 'Are there scheduled jobs or batch processes?',
        rationale: 'Scheduled jobs need reliability testing',
      },
      [`${HTSMCategory.TIME}-${TimeSubcategory.Timeout}`]: {
        question: 'What timeout values are used for operations?',
        rationale: 'Timeout handling affects user experience',
      },
      [`${HTSMCategory.TIME}-${TimeSubcategory.Sequencing}`]: {
        question: 'Are there operations that must happen in a specific order?',
        rationale: 'Sequencing requirements need verification',
      },
    };

    const key = `${category}-${subcategory}`;
    let template = templates[key];

    // Apply domain-specific customization
    if (template && context.domain !== 'generic') {
      template = this.customizeForDomain(template, context.domain, category, subcategory);
    }

    return template || null;
  }

  /**
   * Customize question for specific domain
   */
  private customizeForDomain(
    template: { question: string; rationale: string },
    domain: string,
    category: HTSMCategory,
    subcategory: string
  ): { question: string; rationale: string } {
    const domainPrefixes: Record<string, string> = {
      ecommerce: 'For the e-commerce platform, ',
      healthcare: 'Given HIPAA compliance requirements, ',
      finance: 'For financial accuracy and compliance, ',
      saas: 'For the SaaS application, ',
    };

    const prefix = domainPrefixes[domain] || '';

    // Special domain-specific questions
    if (domain === 'healthcare' && category === HTSMCategory.FUNCTION &&
        subcategory === FunctionSubcategory.Security) {
      return {
        question: 'How is PHI (Protected Health Information) secured and access controlled?',
        rationale: 'HIPAA compliance requires strict PHI protection',
      };
    }

    if (domain === 'finance' && category === HTSMCategory.DATA &&
        subcategory === DataSubcategory.Boundaries) {
      return {
        question: 'What are the precision requirements for monetary calculations?',
        rationale: 'Financial calculations require exact precision',
      };
    }

    if (domain === 'ecommerce' && category === HTSMCategory.OPERATIONS &&
        subcategory === OperationsSubcategory.ExtremeUse) {
      return {
        question: 'What are the expected traffic patterns during sales events?',
        rationale: 'E-commerce must handle traffic spikes during promotions',
      };
    }

    return {
      question: prefix + template.question.charAt(0).toLowerCase() + template.question.slice(1),
      rationale: template.rationale,
    };
  }

  /**
   * Generate questions for all categories
   */
  generateAll(
    analysisResults: Map<HTSMCategory, CategoryAnalysisResult>,
    context: ProjectContext
  ): ClarifyingQuestion[] {
    const allQuestions: ClarifyingQuestion[] = [];

    for (const [category, analysis] of Array.from(analysisResults.entries())) {
      const questions = this.generateForCategory(analysis, context);
      allQuestions.push(...questions);
    }

    return allQuestions;
  }
}
