/**
 * QE Product Factors Assessor Tests
 *
 * Unit tests for the SFDIPOT-based Product Factors Assessor agent.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HTSMCategory,
  Priority,
  AutomationFitness,
  SFDIPOT_SUBCATEGORIES,
  CATEGORY_DESCRIPTIONS,
  generateTestId,
  getSubcategories,
  AssessmentInput,
} from '../../src/agents/qe-product-factors-assessor/types';
import { UserStoryParser } from '../../src/agents/qe-product-factors-assessor/parsers/user-story-parser';
import { DocumentParser } from '../../src/agents/qe-product-factors-assessor/parsers/document-parser';
import { ArchitectureParser } from '../../src/agents/qe-product-factors-assessor/parsers/architecture-parser';
import { SFDIPOTAnalyzer } from '../../src/agents/qe-product-factors-assessor/analyzers/sfdipot-analyzer';
import { TestIdeaGenerator } from '../../src/agents/qe-product-factors-assessor/generators/test-idea-generator';
import { QuestionGenerator } from '../../src/agents/qe-product-factors-assessor/generators/question-generator';
import { HTMLFormatter } from '../../src/agents/qe-product-factors-assessor/formatters/html-formatter';
import { JSONFormatter } from '../../src/agents/qe-product-factors-assessor/formatters/json-formatter';
import { MarkdownFormatter } from '../../src/agents/qe-product-factors-assessor/formatters/markdown-formatter';
import { GherkinFormatter } from '../../src/agents/qe-product-factors-assessor/formatters/gherkin-formatter';
import { SkillIntegration } from '../../src/agents/qe-product-factors-assessor/skills/skill-integration';

describe('QE Product Factors Assessor', () => {
  describe('Types and Constants', () => {
    it('should have all 7 SFDIPOT categories', () => {
      const categories = Object.values(HTSMCategory);
      expect(categories).toHaveLength(7);
      expect(categories).toContain('STRUCTURE');
      expect(categories).toContain('FUNCTION');
      expect(categories).toContain('DATA');
      expect(categories).toContain('INTERFACES');
      expect(categories).toContain('PLATFORM');
      expect(categories).toContain('OPERATIONS');
      expect(categories).toContain('TIME');
    });

    it('should have subcategories for each category', () => {
      for (const category of Object.values(HTSMCategory)) {
        const subcategories = SFDIPOT_SUBCATEGORIES[category];
        expect(subcategories).toBeDefined();
        expect(subcategories.length).toBeGreaterThan(0);
      }
    });

    it('should have descriptions for each category', () => {
      for (const category of Object.values(HTSMCategory)) {
        const description = CATEGORY_DESCRIPTIONS[category];
        expect(description).toBeDefined();
        expect(description.length).toBeGreaterThan(0);
      }
    });

    it('should generate unique test IDs', () => {
      const id1 = generateTestId(HTSMCategory.STRUCTURE);
      const id2 = generateTestId(HTSMCategory.STRUCTURE);
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^TC-STRU-[A-F0-9]+$/);
    });

    it('should get subcategories for a category', () => {
      const subcats = getSubcategories(HTSMCategory.FUNCTION);
      expect(subcats).toContain('Application');
      expect(subcats).toContain('Security');
      expect(subcats).toContain('ErrorHandling');
    });
  });

  describe('UserStoryParser', () => {
    let parser: UserStoryParser;

    beforeEach(() => {
      parser = new UserStoryParser();
    });

    it('should parse standard user story format', () => {
      const input = 'As a customer, I want to view my order history, so that I can track my purchases.';
      const result = parser.parse(input);

      expect(result.userStories).toHaveLength(1);
      expect(result.userStories[0].asA).toBe('customer');
      expect(result.userStories[0].iWant).toContain('view');
      expect(result.userStories[0].soThat).toContain('track');
    });

    it('should extract entities from user stories', () => {
      const input = `
        As an admin, I want to manage user accounts, so that I can control access.
        As a customer, I want to search products, so that I can find what I need.
      `;
      const result = parser.parse(input);

      expect(result.entities.actors).toContain('admin');
      expect(result.entities.actors).toContain('customer');
      expect(result.entities.actions.length).toBeGreaterThan(0);
    });

    it('should parse Gherkin/BDD patterns', () => {
      const input = `
        Feature: User Login
        Scenario: Successful login
          Given I am on the login page
          When I enter valid credentials
          Then I should see the dashboard
      `;
      const result = parser.parse(input);

      expect(result.userStories.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle structured user story input', () => {
      const input = [
        { id: 'US-1', asA: 'user', iWant: 'reset password', soThat: 'regain access' },
      ];
      const result = parser.parse(input);

      expect(result.userStories).toHaveLength(1);
      expect(result.userStories[0].id).toBe('US-1');
    });
  });

  describe('DocumentParser', () => {
    let parser: DocumentParser;

    beforeEach(() => {
      parser = new DocumentParser();
    });

    it('should parse markdown sections', () => {
      const input = `
# Requirements Document

## User Management
Users can register and login to the system.

## Order Processing
The system processes customer orders.
      `;
      const result = parser.parse(input);

      expect(result.sections.length).toBeGreaterThan(0);
      expect(result.specs.length).toBeGreaterThan(0);
    });

    it('should extract entities from sections', () => {
      const input = `
## API Specification
The REST API provides endpoints for user and order management.
Authentication uses OAuth 2.0 tokens.
      `;
      const result = parser.parse(input);

      expect(result.entities.integrations.length).toBeGreaterThan(0);
    });

    it('should extract requirements', () => {
      const input = `
## Requirements
- The system shall validate all user inputs
- The system must log all authentication attempts
      `;
      const result = parser.parse(input);

      const requirements = parser.extractRequirements(result.sections);
      expect(requirements.length).toBeGreaterThan(0);
    });
  });

  describe('ArchitectureParser', () => {
    let parser: ArchitectureParser;

    beforeEach(() => {
      parser = new ArchitectureParser();
    });

    it('should parse component descriptions', () => {
      const input = `
The system consists of:
- UserService: Handles user authentication
- OrderService: Processes orders
- Database: PostgreSQL for persistence
      `;
      const result = parser.parse(input);

      expect(result.architecture.components).toBeDefined();
      expect(result.architecture.components!.length).toBeGreaterThan(0);
    });

    it('should detect architecture patterns', () => {
      const input = `
Components:
- API Gateway: Routes requests
- UserService: User management
- OrderService: Order processing
- MessageQueue: Async communication
- Cache: Redis for caching
      `;
      const result = parser.parse(input);
      const patterns = parser.detectPatterns(result.architecture);

      expect(patterns.length).toBeGreaterThan(0);
    });
  });

  describe('SFDIPOTAnalyzer', () => {
    let analyzer: SFDIPOTAnalyzer;

    beforeEach(() => {
      analyzer = new SFDIPOTAnalyzer();
    });

    it('should analyze all 7 SFDIPOT categories', () => {
      const input = {
        rawText: 'User authentication with login and password',
        entities: {
          actors: ['user'],
          features: ['login'],
          dataTypes: ['password'],
          integrations: [],
          actions: ['authenticate'],
        },
        context: {
          domain: 'generic' as const,
          domainHints: [],
          projectType: 'generic' as const,
          constraints: [],
          entities: {
            actors: [],
            features: [],
            dataTypes: [],
            integrations: [],
            actions: [],
          },
        },
      };

      const results = analyzer.analyze(input);

      expect(results.size).toBe(7);
      for (const category of Object.values(HTSMCategory)) {
        expect(results.has(category)).toBe(true);
      }
    });

    it('should calculate coverage percentage', () => {
      const input = {
        rawText: 'The API endpoint validates user input and returns errors for invalid data.',
        entities: {
          actors: ['user'],
          features: ['validation'],
          dataTypes: ['input'],
          integrations: ['api'],
          actions: ['validate'],
        },
        context: {
          domain: 'generic' as const,
          domainHints: [],
          projectType: 'generic' as const,
          constraints: [],
          entities: { actors: [], features: [], dataTypes: [], integrations: [], actions: [] },
        },
      };

      const results = analyzer.analyze(input);
      const summary = analyzer.getCoverageSummary(results);

      expect(summary.overallCoverage).toBeGreaterThanOrEqual(0);
      expect(summary.overallCoverage).toBeLessThanOrEqual(100);
    });
  });

  describe('TestIdeaGenerator', () => {
    let generator: TestIdeaGenerator;

    beforeEach(() => {
      generator = new TestIdeaGenerator({ maxIdeasPerSubcategory: 3 });
    });

    it('should generate test ideas for subcategories', () => {
      const context = {
        domain: 'ecommerce' as const,
        domainHints: [],
        projectType: 'generic' as const,
        constraints: [],
        entities: { actors: ['customer'], features: ['checkout'], dataTypes: ['order'], integrations: ['payment'], actions: ['purchase'] },
      };

      const entities = {
        actors: ['customer'],
        features: ['checkout'],
        dataTypes: ['order'],
        integrations: ['payment'],
        actions: ['purchase'],
      };

      const ideas = generator.generateForSubcategory(
        HTSMCategory.FUNCTION,
        'Security',
        context,
        entities,
        0.8
      );

      expect(ideas.length).toBeGreaterThan(0);
      expect(ideas.every(i => i.category === HTSMCategory.FUNCTION)).toBe(true);
    });

    it('should assign correct automation fitness', () => {
      const context = {
        domain: 'generic' as const,
        domainHints: [],
        projectType: 'generic' as const,
        constraints: [],
        entities: { actors: [], features: [], dataTypes: [], integrations: [], actions: [] },
      };

      const entities = { actors: [], features: [], dataTypes: [], integrations: [], actions: [] };

      const apiIdeas = generator.generateForSubcategory(
        HTSMCategory.INTERFACES,
        'ApiSdk',
        context,
        entities,
        0.5
      );

      const uiIdeas = generator.generateForSubcategory(
        HTSMCategory.INTERFACES,
        'UserInterface',
        context,
        entities,
        0.5
      );

      expect(apiIdeas.some(i => i.automationFitness === AutomationFitness.API)).toBe(true);
      expect(uiIdeas.some(i => i.automationFitness === AutomationFitness.E2E)).toBe(true);
    });
  });

  describe('QuestionGenerator', () => {
    let generator: QuestionGenerator;

    beforeEach(() => {
      generator = new QuestionGenerator({ maxQuestionsPerCategory: 3 });
    });

    it('should generate questions for uncovered subcategories', () => {
      const analysis = {
        category: HTSMCategory.DATA,
        description: 'Data processing',
        subcategoryAnalysis: [
          { subcategory: 'InputOutput', covered: false, relevance: 0.1, hints: [] },
          { subcategory: 'Boundaries', covered: false, relevance: 0.2, hints: [] },
        ],
        coveragePercentage: 20,
        relevantEntities: [],
        suggestedTestAreas: [],
      };

      const context = {
        domain: 'generic' as const,
        domainHints: [],
        projectType: 'generic' as const,
        constraints: [],
        entities: { actors: [], features: [], dataTypes: [], integrations: [], actions: [] },
      };

      const questions = generator.generateForCategory(analysis, context);

      expect(questions.length).toBeGreaterThan(0);
      expect(questions.every(q => q.category === HTSMCategory.DATA)).toBe(true);
    });
  });

  describe('Formatters', () => {
    const createMockOutput = () => ({
      name: 'Test Assessment',
      sourceDocuments: ['test.md'],
      categoryAnalysis: new Map([
        [HTSMCategory.FUNCTION, {
          category: HTSMCategory.FUNCTION,
          testIdeas: [{
            id: 'TC-FUNC-001',
            category: HTSMCategory.FUNCTION,
            subcategory: 'Application',
            description: 'Test application functionality',
            priority: Priority.P1,
            automationFitness: AutomationFitness.API,
            tags: ['functional'],
          }],
          clarifyingQuestions: [],
          coverage: {
            subcategoriesCovered: ['Application'],
            subcategoriesMissing: ['Security'],
            coveragePercentage: 50,
          },
        }],
      ]),
      testIdeas: [{
        id: 'TC-FUNC-001',
        category: HTSMCategory.FUNCTION,
        subcategory: 'Application',
        description: 'Test application functionality',
        priority: Priority.P1,
        automationFitness: AutomationFitness.API,
        tags: ['functional'],
      }],
      clarifyingQuestions: [],
      summary: {
        totalTestIdeas: 1,
        byCategory: { [HTSMCategory.FUNCTION]: 1 } as Record<HTSMCategory, number>,
        byPriority: { [Priority.P1]: 1 } as Record<Priority, number>,
        byAutomationFitness: { [AutomationFitness.API]: 1 } as Record<AutomationFitness, number>,
        totalClarifyingQuestions: 0,
        overallCoverageScore: 50,
        generatedAt: new Date(),
      },
    });

    describe('HTMLFormatter', () => {
      it('should generate valid HTML', () => {
        const formatter = new HTMLFormatter();
        const html = formatter.format(createMockOutput());

        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('SFDIPOT Assessment');
        expect(html).toContain('TC-FUNC-001');
      });
    });

    describe('JSONFormatter', () => {
      it('should generate valid JSON', () => {
        const formatter = new JSONFormatter();
        const json = formatter.format(createMockOutput());

        const parsed = JSON.parse(json);
        expect(parsed.name).toBe('Test Assessment');
        expect(parsed.testIdeas).toHaveLength(1);
      });

      it('should format summary only', () => {
        const formatter = new JSONFormatter();
        const json = formatter.formatSummaryOnly(createMockOutput());

        const parsed = JSON.parse(json);
        expect(parsed.totalTestIdeas).toBe(1);
        expect(parsed.overallCoverageScore).toBe(50);
      });
    });

    describe('MarkdownFormatter', () => {
      it('should generate valid Markdown', () => {
        const formatter = new MarkdownFormatter();
        const md = formatter.format(createMockOutput());

        expect(md).toContain('# SFDIPOT Assessment Report');
        expect(md).toContain('## Summary');
        expect(md).toContain('TC-FUNC-001');
      });
    });

    describe('GherkinFormatter', () => {
      it('should generate Gherkin features', () => {
        const formatter = new GherkinFormatter();
        const features = formatter.format(createMockOutput());

        expect(features.size).toBeGreaterThan(0);
        const content = Array.from(features.values())[0];
        expect(content).toContain('Feature:');
        expect(content).toContain('Scenario:');
      });
    });
  });

  describe('SkillIntegration', () => {
    let integration: SkillIntegration;

    beforeEach(() => {
      integration = new SkillIntegration();
    });

    it('should list available skills', () => {
      const skills = integration.getAvailableSkills();
      expect(skills).toContain('exploratory-testing-advanced');
      expect(skills).toContain('risk-based-testing');
      expect(skills).toContain('security-testing');
    });

    it('should get skills for category', () => {
      const skills = integration.getSkillsForCategory(HTSMCategory.FUNCTION);
      expect(skills.length).toBeGreaterThan(0);
      expect(skills.some(s => s.skillName === 'security-testing')).toBe(true);
    });

    it('should generate enhanced test ideas', () => {
      const context = {
        domain: 'ecommerce' as const,
        domainHints: [],
        projectType: 'generic' as const,
        constraints: [],
        entities: { actors: [], features: [], dataTypes: [], integrations: [], actions: [] },
      };

      const ideas = integration.generateEnhancedTestIdeas(HTSMCategory.INTERFACES, context);
      expect(ideas.length).toBeGreaterThan(0);
    });
  });
});
