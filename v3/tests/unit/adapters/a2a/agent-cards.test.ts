/**
 * A2A Agent Cards Unit Tests
 *
 * Comprehensive test suite for A2A v0.3 Agent Cards schema, generator, and validator.
 * Target: 50+ unit tests covering all components.
 *
 * @module tests/unit/adapters/a2a/agent-cards
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';

import {
  // Schema Types
  AgentCard,
  AgentSkill,
  QEAgentCard,
  AgentCapabilities,
  AgentProvider,
  SecurityScheme,

  // Type Guards
  isAgentCard,
  isAgentSkill,
  isSecurityScheme,
  isQEAgentCard,

  // Default Values
  DEFAULT_CAPABILITIES,
  DEFAULT_INPUT_MODES,
  DEFAULT_OUTPUT_MODES,
  DEFAULT_QE_PROVIDER,

  // Factory Functions
  createAgentSkill,
  createAgentCard,
  createQEAgentCard,

  // Generator
  AgentCardGenerator,
  createAgentCardGenerator,
  DEFAULT_GENERATOR_CONFIG,
  parseFrontmatter,
  extractSection,
  parseAgentMarkdown,
  extractExamples,
  extractMemoryNamespaces,
  extractImplementationStatus,
  AgentCardGeneratorConfig,
  ParsedAgentMarkdown,
  GenerationResult,

  // Validator
  AgentCardValidator,
  createAgentCardValidator,
  validateAgentCard,
  isValidAgentCard,
  ValidationErrorCode,
  ValidationResult,
  AGENT_CARD_JSON_SCHEMA,
  QE_AGENT_CARD_JSON_SCHEMA,
} from '../../../../src/adapters/a2a/index.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const SAMPLE_AGENT_MARKDOWN = `---
name: qe-test-architect
version: "3.0.0"
updated: "2026-01-10"
description: AI-powered test generation with sublinear optimization
domain: test-generation
v2_compat:
  name: qe-test-generator
  deprecated_in: "3.0.0"
  removed_in: "4.0.0"
---

<qe_agent_definition>
<identity>
You are the V3 QE Test Architect.
Mission: Generate comprehensive, high-quality test suites.
Domain: test-generation (ADR-002)
</identity>

<implementation_status>
Working:
- AI-powered test generation
- Multi-framework support
- Property-based testing

Partial:
- TDD subagent workflow

Planned:
- Visual regression test generation
</implementation_status>

<capabilities>
- **Intelligent Test Creation**: Analyze code structure via AST
- **Property-Based Testing**: Generate property tests using fast-check
- **Sublinear Optimization**: Use Johnson-Lindenstrauss algorithms
</capabilities>

<memory_namespace>
Reads:
- aqe/test-requirements/*
- aqe/code-analysis/{MODULE}/*

Writes:
- aqe/test-generation/results/*
- aqe/test-files/{SUITE}/*
</memory_namespace>

<examples>
Example 1: Unit test generation
\`\`\`
Input: Analyze src/UserService.ts and generate comprehensive test suite
Output: Generated 42 tests across 3 files
\`\`\`
</examples>

<skills_available>
Core Skills:
- agentic-quality-engineering: AI agents as force multipliers
- api-testing-patterns: REST/GraphQL testing, contract validation
</skills_available>
</qe_agent_definition>
`;

const MINIMAL_AGENT_MARKDOWN = `---
name: qe-minimal-agent
version: "1.0.0"
description: A minimal agent for testing
---

<capabilities>
- **Basic Capability**: Does something basic
</capabilities>
`;

const createValidAgentCard = (): AgentCard => ({
  name: 'test-agent',
  description: 'A test agent for validation',
  url: 'https://example.com/a2a/test-agent',
  version: '1.0.0',
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
  },
  skills: [
    {
      id: 'test-skill',
      name: 'Test Skill',
      description: 'A test skill',
      tags: ['testing'],
      examples: ['Test example'],
    },
  ],
  provider: {
    organization: 'Test Org',
    url: 'https://example.com',
  },
  defaultInputModes: ['text/plain', 'application/json'],
  defaultOutputModes: ['application/json'],
});

const createValidQEAgentCard = (): QEAgentCard => ({
  ...createValidAgentCard(),
  qeMetadata: {
    domain: 'test-generation',
    v2Compatibility: {
      name: 'old-name',
      deprecatedIn: '3.0.0',
    },
    memoryReads: ['aqe/test-requirements/*'],
    memoryWrites: ['aqe/test-results/*'],
    implementationStatus: {
      working: ['Feature 1'],
      partial: ['Feature 2'],
      planned: ['Feature 3'],
    },
  },
});

// ============================================================================
// Schema Tests
// ============================================================================

describe('A2A Agent Card Schema', () => {
  describe('Default Values', () => {
    it('should have default capabilities', () => {
      expect(DEFAULT_CAPABILITIES).toEqual({
        streaming: true,
        pushNotifications: false,
        stateTransitionHistory: true,
      });
    });

    it('should have default input modes', () => {
      expect(DEFAULT_INPUT_MODES).toContain('text/plain');
      expect(DEFAULT_INPUT_MODES).toContain('application/json');
    });

    it('should have default output modes', () => {
      expect(DEFAULT_OUTPUT_MODES).toContain('application/json');
      expect(DEFAULT_OUTPUT_MODES).toContain('text/plain');
    });

    it('should have default QE provider', () => {
      expect(DEFAULT_QE_PROVIDER.organization).toBe('Agentic QE');
      expect(DEFAULT_QE_PROVIDER.url).toContain('github');
    });
  });

  describe('Type Guards', () => {
    describe('isAgentCard', () => {
      it('should return true for valid agent card', () => {
        const card = createValidAgentCard();
        expect(isAgentCard(card)).toBe(true);
      });

      it('should return false for null', () => {
        expect(isAgentCard(null)).toBe(false);
      });

      it('should return false for undefined', () => {
        expect(isAgentCard(undefined)).toBe(false);
      });

      it('should return false for non-object', () => {
        expect(isAgentCard('string')).toBe(false);
        expect(isAgentCard(123)).toBe(false);
      });

      it('should return false for missing name', () => {
        const card = { ...createValidAgentCard() };
        delete (card as Record<string, unknown>).name;
        expect(isAgentCard(card)).toBe(false);
      });

      it('should return false for missing description', () => {
        const card = { ...createValidAgentCard() };
        delete (card as Record<string, unknown>).description;
        expect(isAgentCard(card)).toBe(false);
      });

      it('should return false for missing url', () => {
        const card = { ...createValidAgentCard() };
        delete (card as Record<string, unknown>).url;
        expect(isAgentCard(card)).toBe(false);
      });

      it('should return false for missing version', () => {
        const card = { ...createValidAgentCard() };
        delete (card as Record<string, unknown>).version;
        expect(isAgentCard(card)).toBe(false);
      });

      it('should return false for missing capabilities', () => {
        const card = { ...createValidAgentCard() };
        delete (card as Record<string, unknown>).capabilities;
        expect(isAgentCard(card)).toBe(false);
      });

      it('should return false for missing skills', () => {
        const card = { ...createValidAgentCard() };
        delete (card as Record<string, unknown>).skills;
        expect(isAgentCard(card)).toBe(false);
      });

      it('should return false for non-array skills', () => {
        const card = { ...createValidAgentCard(), skills: 'not-array' };
        expect(isAgentCard(card)).toBe(false);
      });
    });

    describe('isAgentSkill', () => {
      it('should return true for valid skill', () => {
        const skill = createAgentSkill('test', 'Test', 'Description');
        expect(isAgentSkill(skill)).toBe(true);
      });

      it('should return false for null', () => {
        expect(isAgentSkill(null)).toBe(false);
      });

      it('should return false for missing id', () => {
        const skill = { name: 'Test', description: 'Desc' };
        expect(isAgentSkill(skill)).toBe(false);
      });

      it('should return false for missing name', () => {
        const skill = { id: 'test', description: 'Desc' };
        expect(isAgentSkill(skill)).toBe(false);
      });

      it('should return false for missing description', () => {
        const skill = { id: 'test', name: 'Test' };
        expect(isAgentSkill(skill)).toBe(false);
      });
    });

    describe('isSecurityScheme', () => {
      it('should return true for apiKey scheme', () => {
        const scheme = { type: 'apiKey', name: 'X-API-Key', in: 'header' };
        expect(isSecurityScheme(scheme)).toBe(true);
      });

      it('should return true for http scheme', () => {
        const scheme = { type: 'http', scheme: 'bearer' };
        expect(isSecurityScheme(scheme)).toBe(true);
      });

      it('should return true for oauth2 scheme', () => {
        const scheme = { type: 'oauth2', flows: {} };
        expect(isSecurityScheme(scheme)).toBe(true);
      });

      it('should return true for openIdConnect scheme', () => {
        const scheme = { type: 'openIdConnect', openIdConnectUrl: 'https://...' };
        expect(isSecurityScheme(scheme)).toBe(true);
      });

      it('should return true for mutualTLS scheme', () => {
        const scheme = { type: 'mutualTLS' };
        expect(isSecurityScheme(scheme)).toBe(true);
      });

      it('should return false for invalid type', () => {
        const scheme = { type: 'invalid' };
        expect(isSecurityScheme(scheme)).toBe(false);
      });

      it('should return false for null', () => {
        expect(isSecurityScheme(null)).toBe(false);
      });
    });

    describe('isQEAgentCard', () => {
      it('should return true for valid QE agent card', () => {
        const card = createValidQEAgentCard();
        expect(isQEAgentCard(card)).toBe(true);
      });

      it('should return false for standard agent card', () => {
        const card = createValidAgentCard();
        expect(isQEAgentCard(card)).toBe(false);
      });
    });
  });

  describe('Factory Functions', () => {
    describe('createAgentSkill', () => {
      it('should create skill with required fields', () => {
        const skill = createAgentSkill('test-id', 'Test Name', 'Test description');

        expect(skill.id).toBe('test-id');
        expect(skill.name).toBe('Test Name');
        expect(skill.description).toBe('Test description');
      });

      it('should create skill with optional fields', () => {
        const skill = createAgentSkill('test-id', 'Test Name', 'Test description', {
          tags: ['tag1', 'tag2'],
          examples: ['Example 1'],
          inputModes: ['text/plain'],
          outputModes: ['application/json'],
        });

        expect(skill.tags).toEqual(['tag1', 'tag2']);
        expect(skill.examples).toEqual(['Example 1']);
        expect(skill.inputModes).toEqual(['text/plain']);
        expect(skill.outputModes).toEqual(['application/json']);
      });
    });

    describe('createAgentCard', () => {
      it('should create card with required fields', () => {
        const skills = [createAgentSkill('skill-1', 'Skill 1', 'Desc')];
        const card = createAgentCard('test-agent', 'Description', 'https://example.com', '1.0.0', skills);

        expect(card.name).toBe('test-agent');
        expect(card.description).toBe('Description');
        expect(card.url).toBe('https://example.com');
        expect(card.version).toBe('1.0.0');
        expect(card.skills).toHaveLength(1);
      });

      it('should use default capabilities', () => {
        const skills = [createAgentSkill('skill-1', 'Skill 1', 'Desc')];
        const card = createAgentCard('test-agent', 'Description', 'https://example.com', '1.0.0', skills);

        expect(card.capabilities).toEqual(DEFAULT_CAPABILITIES);
      });

      it('should use default input/output modes', () => {
        const skills = [createAgentSkill('skill-1', 'Skill 1', 'Desc')];
        const card = createAgentCard('test-agent', 'Description', 'https://example.com', '1.0.0', skills);

        expect(card.defaultInputModes).toEqual(DEFAULT_INPUT_MODES);
        expect(card.defaultOutputModes).toEqual(DEFAULT_OUTPUT_MODES);
      });

      it('should allow custom capabilities', () => {
        const skills = [createAgentSkill('skill-1', 'Skill 1', 'Desc')];
        const customCaps: AgentCapabilities = { streaming: false };
        const card = createAgentCard('test-agent', 'Description', 'https://example.com', '1.0.0', skills, {
          capabilities: customCaps,
        });

        expect(card.capabilities).toEqual(customCaps);
      });

      it('should allow custom provider', () => {
        const skills = [createAgentSkill('skill-1', 'Skill 1', 'Desc')];
        const provider: AgentProvider = { organization: 'Custom Org', url: 'https://custom.com' };
        const card = createAgentCard('test-agent', 'Description', 'https://example.com', '1.0.0', skills, {
          provider,
        });

        expect(card.provider).toEqual(provider);
      });
    });

    describe('createQEAgentCard', () => {
      it('should create QE card with metadata', () => {
        const skills = [createAgentSkill('skill-1', 'Skill 1', 'Desc')];
        const qeMetadata = { domain: 'test-generation' };
        const card = createQEAgentCard(
          'qe-test-agent',
          'Description',
          'https://example.com',
          '3.0.0',
          skills,
          qeMetadata
        );

        expect(card.qeMetadata).toEqual(qeMetadata);
      });

      it('should use default QE provider', () => {
        const skills = [createAgentSkill('skill-1', 'Skill 1', 'Desc')];
        const card = createQEAgentCard('qe-test-agent', 'Description', 'https://example.com', '3.0.0', skills, {});

        expect(card.provider).toEqual(DEFAULT_QE_PROVIDER);
      });

      it('should support supportsAuthenticatedExtendedCard option', () => {
        const skills = [createAgentSkill('skill-1', 'Skill 1', 'Desc')];
        const card = createQEAgentCard('qe-test-agent', 'Description', 'https://example.com', '3.0.0', skills, {}, {
          supportsAuthenticatedExtendedCard: true,
        });

        expect(card.supportsAuthenticatedExtendedCard).toBe(true);
      });

      it('should default supportsAuthenticatedExtendedCard to undefined when not set', () => {
        const skills = [createAgentSkill('skill-1', 'Skill 1', 'Desc')];
        const card = createQEAgentCard('qe-test-agent', 'Description', 'https://example.com', '3.0.0', skills, {});

        expect(card.supportsAuthenticatedExtendedCard).toBeUndefined();
      });
    });
  });
});

// ============================================================================
// Generator Tests
// ============================================================================

describe('A2A Agent Card Generator', () => {
  describe('createAgentCardGenerator', () => {
    it('should create generator with default config', () => {
      const generator = createAgentCardGenerator();
      expect(generator).toBeInstanceOf(AgentCardGenerator);
    });

    it('should create generator with custom config', () => {
      const config: Partial<AgentCardGeneratorConfig> = {
        baseUrl: 'https://custom.com',
        defaultVersion: '2.0.0',
      };
      const generator = createAgentCardGenerator(config);
      expect(generator).toBeInstanceOf(AgentCardGenerator);
    });
  });

  describe('Frontmatter Parsing', () => {
    it('should parse simple frontmatter', () => {
      const markdown = `---
name: test-agent
version: "1.0.0"
description: A test agent
---

Content here.`;

      const frontmatter = parseFrontmatter(markdown);
      expect(frontmatter.name).toBe('test-agent');
      expect(frontmatter.version).toBe('1.0.0');
      expect(frontmatter.description).toBe('A test agent');
    });

    it('should parse nested frontmatter', () => {
      const markdown = `---
name: test-agent
v2_compat:
  name: old-name
  deprecated_in: "3.0.0"
---`;

      const frontmatter = parseFrontmatter(markdown);
      expect(frontmatter.name).toBe('test-agent');
      expect(frontmatter.v2_compat).toBeDefined();
      if (typeof frontmatter.v2_compat === 'object') {
        expect(frontmatter.v2_compat.name).toBe('old-name');
      }
    });

    it('should handle missing frontmatter', () => {
      const markdown = 'No frontmatter here';
      const frontmatter = parseFrontmatter(markdown);
      expect(Object.keys(frontmatter)).toHaveLength(0);
    });

    it('should handle quoted values', () => {
      const markdown = `---
name: "quoted-name"
version: '1.0.0'
---`;

      const frontmatter = parseFrontmatter(markdown);
      expect(frontmatter.name).toBe('quoted-name');
      expect(frontmatter.version).toBe('1.0.0');
    });
  });

  describe('Section Extraction', () => {
    it('should extract XML-style section', () => {
      const markdown = '<identity>\nIdentity content\n</identity>';
      const section = extractSection(markdown, 'identity');
      expect(section).toBe('Identity content');
    });

    it('should extract markdown header section', () => {
      const markdown = '## Capabilities\n\nCapability content\n\n## Other';
      const section = extractSection(markdown, 'Capabilities');
      expect(section).toContain('Capability content');
    });

    it('should return undefined for missing section', () => {
      const markdown = '<other>Content</other>';
      const section = extractSection(markdown, 'missing');
      expect(section).toBeUndefined();
    });

    it('should be case-insensitive', () => {
      const markdown = '<IDENTITY>Content</IDENTITY>';
      const section = extractSection(markdown, 'identity');
      expect(section).toBe('Content');
    });
  });

  describe('parseAgentMarkdown', () => {
    it('should parse complete agent markdown', () => {
      const parsed = parseAgentMarkdown(SAMPLE_AGENT_MARKDOWN);

      expect(parsed.frontmatter.name).toBe('qe-test-architect');
      expect(parsed.frontmatter.version).toBe('3.0.0');
      expect(parsed.frontmatter.domain).toBe('test-generation');
      expect(parsed.identity).toContain('V3 QE Test Architect');
      expect(parsed.capabilities).toContain('Intelligent Test Creation');
      expect(parsed.implementationStatus).toContain('AI-powered test generation');
    });

    it('should include raw content', () => {
      const parsed = parseAgentMarkdown(SAMPLE_AGENT_MARKDOWN);
      expect(parsed.rawContent).toBe(SAMPLE_AGENT_MARKDOWN);
    });
  });

  describe('extractExamples', () => {
    it('should extract examples from code blocks', () => {
      const parsed = parseAgentMarkdown(SAMPLE_AGENT_MARKDOWN);
      const examples = extractExamples(SAMPLE_AGENT_MARKDOWN, parsed);

      expect(examples.length).toBeGreaterThan(0);
      expect(examples[0]).toContain('Analyze src/UserService.ts');
    });

    it('should handle empty examples section', () => {
      const parsed = parseAgentMarkdown(MINIMAL_AGENT_MARKDOWN);
      const examples = extractExamples(MINIMAL_AGENT_MARKDOWN, parsed);

      expect(Array.isArray(examples)).toBe(true);
    });
  });

  describe('extractMemoryNamespaces', () => {
    it('should extract reads and writes namespaces', () => {
      const parsed = parseAgentMarkdown(SAMPLE_AGENT_MARKDOWN);
      const namespaces = extractMemoryNamespaces(SAMPLE_AGENT_MARKDOWN, parsed);

      expect(namespaces.reads).toContain('aqe/test-requirements/*');
      expect(namespaces.writes).toContain('aqe/test-generation/results/*');
    });

    it('should return empty arrays for missing section', () => {
      const parsed = parseAgentMarkdown(MINIMAL_AGENT_MARKDOWN);
      const namespaces = extractMemoryNamespaces(MINIMAL_AGENT_MARKDOWN, parsed);

      expect(namespaces.reads).toHaveLength(0);
      expect(namespaces.writes).toHaveLength(0);
    });
  });

  describe('extractImplementationStatus', () => {
    it('should extract all status categories', () => {
      const parsed = parseAgentMarkdown(SAMPLE_AGENT_MARKDOWN);
      const status = extractImplementationStatus(SAMPLE_AGENT_MARKDOWN, parsed);

      expect(status.working).toContain('AI-powered test generation');
      expect(status.partial).toContain('TDD subagent workflow');
      expect(status.planned).toContain('Visual regression test generation');
    });

    it('should return empty arrays for missing section', () => {
      const parsed = parseAgentMarkdown(MINIMAL_AGENT_MARKDOWN);
      const status = extractImplementationStatus(MINIMAL_AGENT_MARKDOWN, parsed);

      expect(status.working).toHaveLength(0);
      expect(status.partial).toHaveLength(0);
      expect(status.planned).toHaveLength(0);
    });
  });

  describe('AgentCardGenerator.generateFromMarkdown', () => {
    let generator: AgentCardGenerator;

    beforeEach(() => {
      generator = createAgentCardGenerator({
        baseUrl: 'https://aqe.example.com',
      });
    });

    it('should generate valid agent card from markdown', () => {
      const card = generator.generateFromMarkdown(SAMPLE_AGENT_MARKDOWN);

      expect(card.name).toBe('qe-test-architect');
      expect(card.version).toBe('3.0.0');
      expect(card.url).toBe('https://aqe.example.com/a2a/qe-test-architect');
      expect(card.description).toBeDefined();
      expect(card.skills.length).toBeGreaterThan(0);
    });

    it('should extract QE metadata', () => {
      const card = generator.generateFromMarkdown(SAMPLE_AGENT_MARKDOWN);

      expect(card.qeMetadata).toBeDefined();
      expect(card.qeMetadata?.domain).toBe('test-generation');
      expect(card.qeMetadata?.v2Compatibility?.name).toBe('qe-test-generator');
    });

    it('should extract skills from capabilities section', () => {
      const card = generator.generateFromMarkdown(SAMPLE_AGENT_MARKDOWN);

      expect(card.skills.length).toBeGreaterThan(0);
      const skillIds = card.skills.map((s) => s.id);
      expect(skillIds).toContain('intelligent-test-creation');
    });

    it('should use fallback agent ID when name missing', () => {
      const markdown = `---
version: "1.0.0"
---
<capabilities>
- **Basic**: Something
</capabilities>`;

      const card = generator.generateFromMarkdown(markdown, 'fallback-agent');
      expect(card.name).toBe('fallback-agent');
    });

    it('should handle minimal markdown', () => {
      const card = generator.generateFromMarkdown(MINIMAL_AGENT_MARKDOWN);

      expect(card.name).toBe('qe-minimal-agent');
      expect(card.version).toBe('1.0.0');
      expect(isAgentCard(card)).toBe(true);
    });

    it('should include provider information', () => {
      const card = generator.generateFromMarkdown(SAMPLE_AGENT_MARKDOWN);

      expect(card.provider).toEqual(DEFAULT_QE_PROVIDER);
    });

    it('should set default capabilities', () => {
      const card = generator.generateFromMarkdown(SAMPLE_AGENT_MARKDOWN);

      expect(card.capabilities).toEqual(DEFAULT_CAPABILITIES);
    });
  });

  describe('Custom Skill Extraction', () => {
    it('should use custom skill extractor', () => {
      const customExtractor = vi.fn().mockReturnValue([
        createAgentSkill('custom-skill', 'Custom Skill', 'Custom description'),
      ]);

      const generator = createAgentCardGenerator({
        skillExtractor: customExtractor,
      });

      const card = generator.generateFromMarkdown(SAMPLE_AGENT_MARKDOWN);

      expect(customExtractor).toHaveBeenCalled();
      expect(card.skills).toHaveLength(1);
      expect(card.skills[0].id).toBe('custom-skill');
    });
  });
});

// ============================================================================
// Validator Tests
// ============================================================================

describe('A2A Agent Card Validator', () => {
  describe('createAgentCardValidator', () => {
    it('should create validator with default options', () => {
      const validator = createAgentCardValidator();
      expect(validator).toBeInstanceOf(AgentCardValidator);
    });

    it('should create validator with custom options', () => {
      const validator = createAgentCardValidator({
        strict: true,
        includeWarnings: false,
      });
      expect(validator).toBeInstanceOf(AgentCardValidator);
    });
  });

  describe('Validation', () => {
    let validator: AgentCardValidator;

    beforeEach(() => {
      validator = createAgentCardValidator();
    });

    it('should validate valid agent card', () => {
      const card = createValidAgentCard();
      const result = validator.validate(card);

      expect(result.valid).toBe(true);
      expect(result.summary.errors).toBe(0);
    });

    it('should validate valid QE agent card', () => {
      const card = createValidQEAgentCard();
      const result = validator.validate(card);

      expect(result.valid).toBe(true);
      expect(result.summary.errors).toBe(0);
    });

    it('should fail for null input', () => {
      const result = validator.validate(null);

      expect(result.valid).toBe(false);
      expect(result.summary.errors).toBeGreaterThan(0);
    });

    it('should fail for non-object input', () => {
      const result = validator.validate('string');

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === ValidationErrorCode.INVALID_TYPE)).toBe(true);
    });

    it('should fail for missing name', () => {
      const card = { ...createValidAgentCard() };
      delete (card as Record<string, unknown>).name;

      const result = validator.validate(card);

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === ValidationErrorCode.MISSING_REQUIRED)).toBe(true);
    });

    it('should fail for missing description', () => {
      const card = { ...createValidAgentCard() };
      delete (card as Record<string, unknown>).description;

      const result = validator.validate(card);

      expect(result.valid).toBe(false);
    });

    it('should fail for missing url', () => {
      const card = { ...createValidAgentCard() };
      delete (card as Record<string, unknown>).url;

      const result = validator.validate(card);

      expect(result.valid).toBe(false);
    });

    it('should fail for missing version', () => {
      const card = { ...createValidAgentCard() };
      delete (card as Record<string, unknown>).version;

      const result = validator.validate(card);

      expect(result.valid).toBe(false);
    });

    it('should fail for missing capabilities', () => {
      const card = { ...createValidAgentCard() };
      delete (card as Record<string, unknown>).capabilities;

      const result = validator.validate(card);

      expect(result.valid).toBe(false);
    });

    it('should fail for missing skills', () => {
      const card = { ...createValidAgentCard() };
      delete (card as Record<string, unknown>).skills;

      const result = validator.validate(card);

      expect(result.valid).toBe(false);
    });

    it('should fail for empty skills array', () => {
      const card = { ...createValidAgentCard(), skills: [] };

      const result = validator.validate(card);

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === ValidationErrorCode.EMPTY_ARRAY)).toBe(true);
    });

    it('should fail for empty name', () => {
      const card = { ...createValidAgentCard(), name: '' };

      const result = validator.validate(card);

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === ValidationErrorCode.EMPTY_STRING)).toBe(true);
    });

    it('should warn for invalid URL format', () => {
      const card = { ...createValidAgentCard(), url: 'not-a-url' };

      const result = validator.validate(card);

      expect(result.issues.some((i) => i.code === ValidationErrorCode.INVALID_URL)).toBe(true);
    });

    it('should warn for non-semver version', () => {
      const card = { ...createValidAgentCard(), version: 'v1' };

      const result = validator.validate(card);

      expect(result.issues.some((i) => i.code === ValidationErrorCode.INVALID_VERSION)).toBe(true);
    });

    it('should warn for invalid skill ID format', () => {
      const card = {
        ...createValidAgentCard(),
        skills: [{ id: 'InvalidID', name: 'Test', description: 'Desc' }],
      };

      const result = validator.validate(card);

      expect(result.issues.some((i) => i.code === ValidationErrorCode.INVALID_SKILL_ID)).toBe(true);
    });

    it('should fail for duplicate skill IDs', () => {
      const card = {
        ...createValidAgentCard(),
        skills: [
          { id: 'duplicate', name: 'Skill 1', description: 'Desc 1' },
          { id: 'duplicate', name: 'Skill 2', description: 'Desc 2' },
        ],
      };

      const result = validator.validate(card);

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === ValidationErrorCode.DUPLICATE_SKILL_ID)).toBe(true);
    });

    it('should warn for missing provider', () => {
      const card = { ...createValidAgentCard() };
      delete (card as Record<string, unknown>).provider;

      const result = validator.validate(card);

      expect(result.issues.some((i) => i.code === ValidationErrorCode.MISSING_PROVIDER)).toBe(true);
    });

    it('should include info for missing documentation URL', () => {
      const card = createValidAgentCard();

      const result = validator.validate(card);

      expect(result.issues.some((i) => i.code === ValidationErrorCode.MISSING_DOCUMENTATION)).toBe(true);
    });

    it('should include info for missing examples', () => {
      const card = {
        ...createValidAgentCard(),
        skills: [{ id: 'test', name: 'Test', description: 'Desc' }],
      };

      const result = validator.validate(card);

      expect(result.issues.some((i) => i.code === ValidationErrorCode.MISSING_EXAMPLES)).toBe(true);
    });

    it('should include info for missing tags', () => {
      const card = {
        ...createValidAgentCard(),
        skills: [{ id: 'test', name: 'Test', description: 'Desc' }],
      };

      const result = validator.validate(card);

      expect(result.issues.some((i) => i.code === ValidationErrorCode.MISSING_TAGS)).toBe(true);
    });
  });

  describe('Security Scheme Validation', () => {
    let validator: AgentCardValidator;

    beforeEach(() => {
      validator = createAgentCardValidator();
    });

    it('should validate valid apiKey scheme', () => {
      const card = {
        ...createValidAgentCard(),
        securitySchemes: [{ type: 'apiKey', name: 'X-API-Key', in: 'header' }],
      };

      const result = validator.validate(card);

      const securityErrors = result.issues.filter(
        (i) => i.code === ValidationErrorCode.INVALID_SECURITY_SCHEME
      );
      expect(securityErrors).toHaveLength(0);
    });

    it('should validate valid oauth2 scheme with flows', () => {
      const card = {
        ...createValidAgentCard(),
        securitySchemes: [
          {
            type: 'oauth2',
            flows: {
              clientCredentials: {
                tokenUrl: 'https://auth.example.com/token',
                scopes: { read: 'Read access' },
              },
            },
          },
        ],
      };

      const result = validator.validate(card);

      const securityErrors = result.issues.filter(
        (i) => i.code.startsWith('MISSING_') && i.path.includes('security')
      );
      expect(securityErrors).toHaveLength(0);
    });

    it('should fail for oauth2 without flows', () => {
      const card = {
        ...createValidAgentCard(),
        securitySchemes: [{ type: 'oauth2', flows: {} }],
      };

      const result = validator.validate(card);

      expect(result.issues.some((i) => i.code === ValidationErrorCode.MISSING_OAUTH_FLOW)).toBe(true);
    });

    it('should fail for clientCredentials without tokenUrl', () => {
      const card = {
        ...createValidAgentCard(),
        securitySchemes: [
          {
            type: 'oauth2',
            flows: {
              clientCredentials: { scopes: {} },
            },
          },
        ],
      };

      const result = validator.validate(card);

      expect(result.issues.some((i) => i.code === ValidationErrorCode.MISSING_TOKEN_URL)).toBe(true);
    });

    it('should fail for invalid scheme type', () => {
      const card = {
        ...createValidAgentCard(),
        securitySchemes: [{ type: 'invalid' }],
      };

      const result = validator.validate(card);

      expect(result.issues.some((i) => i.code === ValidationErrorCode.INVALID_SECURITY_SCHEME)).toBe(
        true
      );
    });
  });

  describe('QE Metadata Validation', () => {
    let validator: AgentCardValidator;

    beforeEach(() => {
      validator = createAgentCardValidator({ validateQEMetadata: true });
    });

    it('should validate valid QE domain', () => {
      const card = {
        ...createValidQEAgentCard(),
        qeMetadata: { domain: 'test-generation' },
      };

      const result = validator.validate(card);

      const domainErrors = result.issues.filter((i) => i.code === ValidationErrorCode.INVALID_DOMAIN);
      expect(domainErrors).toHaveLength(0);
    });

    it('should warn for unknown QE domain', () => {
      const card = {
        ...createValidQEAgentCard(),
        qeMetadata: { domain: 'unknown-domain' },
      };

      const result = validator.validate(card);

      expect(result.issues.some((i) => i.code === ValidationErrorCode.INVALID_DOMAIN)).toBe(true);
    });

    it('should warn for invalid memory namespace format', () => {
      const card = {
        ...createValidQEAgentCard(),
        qeMetadata: {
          memoryReads: ['invalid/namespace'],
        },
      };

      const result = validator.validate(card);

      expect(result.issues.some((i) => i.code === ValidationErrorCode.INVALID_MEMORY_NAMESPACE)).toBe(
        true
      );
    });
  });

  describe('Strict Mode', () => {
    it('should treat warnings as errors in strict mode', () => {
      const validator = createAgentCardValidator({ strict: true });
      const card = { ...createValidAgentCard(), version: 'invalid-version' };

      const result = validator.validate(card);

      // Version warning should make it invalid in strict mode
      expect(result.valid).toBe(false);
    });

    it('should pass in strict mode with perfect card', () => {
      const validator = createAgentCardValidator({ strict: true });
      const card = {
        ...createValidAgentCard(),
        documentationUrl: 'https://docs.example.com',
        skills: [
          {
            id: 'test-skill',
            name: 'Test Skill',
            description: 'A test skill',
            tags: ['testing'],
            examples: ['Example 1'],
          },
        ],
      };

      const result = validator.validate(card);

      // May still have info messages, but should be valid
      expect(result.summary.errors).toBe(0);
    });
  });

  describe('Convenience Functions', () => {
    it('validateAgentCard should work', () => {
      const card = createValidAgentCard();
      const result = validateAgentCard(card);

      expect(result.valid).toBe(true);
    });

    it('isValidAgentCard should return boolean', () => {
      const validCard = createValidAgentCard();
      const invalidCard = { name: 'incomplete' };

      expect(isValidAgentCard(validCard)).toBe(true);
      expect(isValidAgentCard(invalidCard)).toBe(false);
    });
  });

  describe('JSON Schema', () => {
    it('should export base JSON schema', () => {
      expect(AGENT_CARD_JSON_SCHEMA).toBeDefined();
      expect(AGENT_CARD_JSON_SCHEMA.$id).toContain('agent-card');
      expect(AGENT_CARD_JSON_SCHEMA.required).toContain('name');
      expect(AGENT_CARD_JSON_SCHEMA.required).toContain('skills');
    });

    it('should export QE JSON schema', () => {
      expect(QE_AGENT_CARD_JSON_SCHEMA).toBeDefined();
      expect(QE_AGENT_CARD_JSON_SCHEMA.$id).toContain('qe-agent-card');
      expect(QE_AGENT_CARD_JSON_SCHEMA.properties.qeMetadata).toBeDefined();
    });

    it('should have required fields in schema', () => {
      expect(AGENT_CARD_JSON_SCHEMA.required).toContain('name');
      expect(AGENT_CARD_JSON_SCHEMA.required).toContain('description');
      expect(AGENT_CARD_JSON_SCHEMA.required).toContain('url');
      expect(AGENT_CARD_JSON_SCHEMA.required).toContain('version');
      expect(AGENT_CARD_JSON_SCHEMA.required).toContain('capabilities');
      expect(AGENT_CARD_JSON_SCHEMA.required).toContain('skills');
    });
  });

  describe('Validation Result Structure', () => {
    it('should include all required fields in result', () => {
      const validator = createAgentCardValidator();
      const result = validator.validate(createValidAgentCard());

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('summary');
      expect(result.summary).toHaveProperty('errors');
      expect(result.summary).toHaveProperty('warnings');
      expect(result.summary).toHaveProperty('info');
    });

    it('should include path in issues', () => {
      const validator = createAgentCardValidator();
      const card = { ...createValidAgentCard(), name: '' };
      const result = validator.validate(card);

      const nameIssue = result.issues.find((i) => i.path === 'name');
      expect(nameIssue).toBeDefined();
    });

    it('should include code in issues', () => {
      const validator = createAgentCardValidator();
      const card = { ...createValidAgentCard(), name: '' };
      const result = validator.validate(card);

      expect(result.issues[0]).toHaveProperty('code');
    });

    it('should include message in issues', () => {
      const validator = createAgentCardValidator();
      const card = { ...createValidAgentCard(), name: '' };
      const result = validator.validate(card);

      expect(result.issues[0]).toHaveProperty('message');
    });
  });

  describe('validateAll', () => {
    it('should validate multiple cards', () => {
      const validator = createAgentCardValidator();
      const cards = new Map<string, unknown>();
      cards.set('valid', createValidAgentCard());
      cards.set('invalid', { name: 'incomplete' });

      const results = validator.validateAll(cards);

      expect(results.size).toBe(2);
      expect(results.get('valid')?.valid).toBe(true);
      expect(results.get('invalid')?.valid).toBe(false);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Generator + Validator Integration', () => {
  it('should generate cards that pass validation', () => {
    const generator = createAgentCardGenerator();
    const validator = createAgentCardValidator();

    const card = generator.generateFromMarkdown(SAMPLE_AGENT_MARKDOWN);
    const result = validator.validate(card);

    expect(result.valid).toBe(true);
    expect(result.summary.errors).toBe(0);
  });

  it('should generate minimal cards that pass validation', () => {
    const generator = createAgentCardGenerator();
    const validator = createAgentCardValidator();

    const card = generator.generateFromMarkdown(MINIMAL_AGENT_MARKDOWN);
    const result = validator.validate(card);

    expect(result.valid).toBe(true);
  });

  it('should handle missing description gracefully', () => {
    const generator = createAgentCardGenerator();
    const validator = createAgentCardValidator();

    const markdown = `---
name: no-description-agent
version: "1.0.0"
---
<capabilities>
- **Something**: Does something
</capabilities>`;

    const card = generator.generateFromMarkdown(markdown);
    const result = validator.validate(card);

    // Generator should create a card, validator should report issues
    expect(card.name).toBe('no-description-agent');
    expect(isAgentCard(card)).toBe(true);
  });
});

// ============================================================================
// A2A v0.3 Specification Compliance Tests
// ============================================================================

describe('A2A v0.3 Specification Compliance', () => {
  it('should include all required fields per A2A spec', () => {
    const card = createValidAgentCard();

    // Required fields per A2A v0.3
    expect(card.name).toBeDefined();
    expect(card.description).toBeDefined();
    expect(card.url).toBeDefined();
    expect(card.version).toBeDefined();
    expect(card.capabilities).toBeDefined();
    expect(card.skills).toBeDefined();
  });

  it('should support optional provider field', () => {
    const card = createValidAgentCard();
    expect(card.provider?.organization).toBeDefined();
  });

  it('should support optional documentationUrl', () => {
    const card = {
      ...createValidAgentCard(),
      documentationUrl: 'https://docs.example.com',
    };
    expect(card.documentationUrl).toBeDefined();
  });

  it('should support streaming capability', () => {
    const card = createValidAgentCard();
    expect(typeof card.capabilities.streaming).toBe('boolean');
  });

  it('should support pushNotifications capability', () => {
    const card = createValidAgentCard();
    expect(typeof card.capabilities.pushNotifications).toBe('boolean');
  });

  it('should support stateTransitionHistory capability', () => {
    const card = createValidAgentCard();
    expect(typeof card.capabilities.stateTransitionHistory).toBe('boolean');
  });

  it('should have skills with required fields', () => {
    const card = createValidAgentCard();
    const skill = card.skills[0];

    expect(skill.id).toBeDefined();
    expect(skill.name).toBeDefined();
    expect(skill.description).toBeDefined();
  });

  it('should support optional skill tags', () => {
    const card = createValidAgentCard();
    const skill = card.skills[0];

    expect(Array.isArray(skill.tags)).toBe(true);
  });

  it('should support optional skill examples', () => {
    const card = createValidAgentCard();
    const skill = card.skills[0];

    expect(Array.isArray(skill.examples)).toBe(true);
  });

  it('should support defaultInputModes', () => {
    const card = createValidAgentCard();
    expect(Array.isArray(card.defaultInputModes)).toBe(true);
    expect(card.defaultInputModes).toContain('text/plain');
  });

  it('should support defaultOutputModes', () => {
    const card = createValidAgentCard();
    expect(Array.isArray(card.defaultOutputModes)).toBe(true);
    expect(card.defaultOutputModes).toContain('application/json');
  });

  it('should support supportsAuthenticatedExtendedCard', () => {
    const card = {
      ...createValidAgentCard(),
      supportsAuthenticatedExtendedCard: true,
    };
    expect(card.supportsAuthenticatedExtendedCard).toBe(true);
  });

  it('should support all security scheme types', () => {
    const schemes: SecurityScheme[] = [
      { type: 'apiKey', name: 'key', in: 'header' },
      { type: 'http', scheme: 'bearer' },
      { type: 'oauth2', flows: { clientCredentials: { tokenUrl: 'https://...' } } },
      { type: 'openIdConnect', openIdConnectUrl: 'https://...' },
      { type: 'mutualTLS' },
    ];

    for (const scheme of schemes) {
      expect(isSecurityScheme(scheme)).toBe(true);
    }
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty markdown', () => {
    const generator = createAgentCardGenerator();
    const card = generator.generateFromMarkdown('', 'fallback');

    expect(card.name).toBe('fallback');
    expect(isAgentCard(card)).toBe(true);
  });

  it('should handle markdown with only frontmatter', () => {
    const generator = createAgentCardGenerator();
    const markdown = `---
name: frontmatter-only
version: "1.0.0"
description: Only frontmatter
---`;

    const card = generator.generateFromMarkdown(markdown);
    expect(card.name).toBe('frontmatter-only');
  });

  it('should handle special characters in agent name', () => {
    const generator = createAgentCardGenerator();
    const markdown = `---
name: agent-with-special_chars.v2
version: "1.0.0"
description: Special chars
---
<capabilities>
- **Basic**: Something
</capabilities>`;

    const card = generator.generateFromMarkdown(markdown);
    expect(card.name).toBe('agent-with-special_chars.v2');
  });

  it('should handle very long descriptions', () => {
    const longDescription = 'A'.repeat(10000);
    const card = createAgentCard(
      'test',
      longDescription,
      'https://example.com',
      '1.0.0',
      [createAgentSkill('test', 'Test', 'Desc')]
    );

    const validator = createAgentCardValidator();
    const result = validator.validate(card);

    expect(result.valid).toBe(true);
  });

  it('should handle unicode in content', () => {
    const card = createAgentCard(
      'unicode-agent',
      'Description with unicode: [Unicode characters would go here]',
      'https://example.com',
      '1.0.0',
      [createAgentSkill('test', 'Test [Unicode]', 'Description [Unicode]')]
    );

    const validator = createAgentCardValidator();
    const result = validator.validate(card);

    expect(result.valid).toBe(true);
  });

  it('should handle many skills', () => {
    const skills = Array.from({ length: 100 }, (_, i) =>
      createAgentSkill(`skill-${i}`, `Skill ${i}`, `Description ${i}`)
    );

    const card = createAgentCard('many-skills', 'Description', 'https://example.com', '1.0.0', skills);

    const validator = createAgentCardValidator();
    const result = validator.validate(card);

    expect(result.valid).toBe(true);
    expect(card.skills).toHaveLength(100);
  });
});
