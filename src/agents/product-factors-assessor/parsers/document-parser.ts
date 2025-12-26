/**
 * Document Parser - Parses User Stories, Epics, Specs, and Architecture docs
 */

import {
  UserStory,
  Epic,
  FunctionalSpec,
  TechnicalArchitecture,
  AcceptanceCriteria,
  Requirement,
  TestableElement,
  ArchitectureComponent,
  InterfaceDefinition,
  DataFlow,
  Technology,
  HTSMCategory,
} from '../types/htsm.types';

export class DocumentParser {
  /**
   * Parse a User Story from markdown format
   */
  parseUserStory(content: string): UserStory {
    const lines = content.split('\n');
    const story: Partial<UserStory> = {
      acceptanceCriteria: [],
      tags: [],
    };

    let currentSection = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Extract ID from header
      if (trimmed.match(/^##?\s*(US-\d+|USER-STORY-\d+)/i)) {
        const match = trimmed.match(/(US-\d+|USER-STORY-\d+)/i);
        story.id = match ? match[1] : `US-${Date.now()}`;
        story.title = trimmed.replace(/^##?\s*/, '').replace(story.id, '').replace(':', '').trim();
      }

      // Parse As a / I want / So that
      if (trimmed.toLowerCase().startsWith('**as a**') || trimmed.toLowerCase().startsWith('as a')) {
        story.asA = trimmed.replace(/\*\*as a\*\*/i, '').replace(/as a/i, '').trim();
      }
      if (trimmed.toLowerCase().startsWith('**i want**') || trimmed.toLowerCase().startsWith('i want')) {
        story.iWant = trimmed.replace(/\*\*i want( to)?\*\*/i, '').replace(/i want( to)?/i, '').trim();
      }
      if (trimmed.toLowerCase().startsWith('**so that**') || trimmed.toLowerCase().startsWith('so that')) {
        story.soThat = trimmed.replace(/\*\*so that\*\*/i, '').replace(/so that/i, '').trim();
      }

      // Detect sections
      if (trimmed.toLowerCase().includes('acceptance criteria')) {
        currentSection = 'ac';
        continue;
      }

      // Parse acceptance criteria (numbered list)
      if (currentSection === 'ac' && trimmed.match(/^\d+\./)) {
        const acText = trimmed.replace(/^\d+\.\s*/, '');
        const ac: AcceptanceCriteria = {
          id: `AC-${(story.acceptanceCriteria?.length || 0) + 1}`,
          description: acText,
          testable: this.isTestable(acText),
          testConditions: this.extractTestConditions(acText),
        };
        story.acceptanceCriteria?.push(ac);
      }

      // Parse tags
      if (trimmed.startsWith('@') || trimmed.toLowerCase().includes('tags:')) {
        const tags = trimmed.match(/@[\w-]+/g) || [];
        story.tags = tags.map((t) => t.replace('@', ''));
      }
    }

    // Set defaults
    story.id = story.id || `US-${Date.now()}`;
    story.title = story.title || 'Untitled Story';
    story.asA = story.asA || 'user';
    story.iWant = story.iWant || '';
    story.soThat = story.soThat || '';

    return story as UserStory;
  }

  /**
   * Parse multiple User Stories from a document
   */
  parseUserStories(content: string): UserStory[] {
    // Split by story headers
    const storyBlocks = content.split(/(?=^##?\s*(US-\d+|USER-STORY))/im).filter(Boolean);
    return storyBlocks.map((block) => this.parseUserStory(block));
  }

  /**
   * Parse an Epic from markdown format
   */
  parseEpic(content: string): Epic {
    const lines = content.split('\n');
    const epic: Partial<Epic> = {
      userStories: [],
    };

    for (const line of lines) {
      const trimmed = line.trim();

      // Extract ID from header
      if (trimmed.match(/^##?\s*(EPIC-\d+)/i)) {
        const match = trimmed.match(/(EPIC-\d+)/i);
        epic.id = match ? match[1] : `EPIC-${Date.now()}`;
        epic.title = trimmed.replace(/^##?\s*/, '').replace(epic.id, '').replace(':', '').trim();
      }

      // Extract description
      if (trimmed.toLowerCase().startsWith('**description**') || trimmed.toLowerCase().startsWith('description:')) {
        epic.description = trimmed.replace(/\*\*description\*\*:?/i, '').replace(/description:?/i, '').trim();
      }

      // Extract business value
      if (trimmed.toLowerCase().includes('business value')) {
        epic.businessValue = trimmed.replace(/\*\*business value\*\*:?/i, '').replace(/business value:?/i, '').trim();
      }

      // Extract linked user stories
      const storyMatch = trimmed.match(/US-\d+/g);
      if (storyMatch) {
        epic.userStories?.push(...storyMatch);
      }
    }

    epic.id = epic.id || `EPIC-${Date.now()}`;
    epic.title = epic.title || 'Untitled Epic';
    epic.description = epic.description || '';
    epic.businessValue = epic.businessValue || '';

    return epic as Epic;
  }

  /**
   * Parse Functional Specification
   */
  parseFunctionalSpec(content: string): FunctionalSpec {
    const lines = content.split('\n');
    const spec: Partial<FunctionalSpec> = {
      requirements: [],
      constraints: [],
      assumptions: [],
    };

    let currentSection = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Extract ID and title
      if (trimmed.match(/^#\s/)) {
        spec.title = trimmed.replace(/^#\s*/, '');
        spec.id = `SPEC-${Date.now()}`;
      }

      // Detect sections
      if (trimmed.toLowerCase().includes('overview')) {
        currentSection = 'overview';
        continue;
      }
      if (trimmed.toLowerCase().includes('requirements')) {
        currentSection = 'requirements';
        continue;
      }
      if (trimmed.toLowerCase().includes('constraints')) {
        currentSection = 'constraints';
        continue;
      }
      if (trimmed.toLowerCase().includes('assumptions')) {
        currentSection = 'assumptions';
        continue;
      }

      // Parse content based on section
      if (currentSection === 'overview' && trimmed && !trimmed.startsWith('#')) {
        spec.overview = (spec.overview || '') + ' ' + trimmed;
      }

      if (currentSection === 'requirements' && trimmed.match(/^[-*]\s/)) {
        const reqText = trimmed.replace(/^[-*]\s*/, '');
        const req: Requirement = {
          id: `REQ-${(spec.requirements?.length || 0) + 1}`,
          description: reqText,
          type: this.classifyRequirement(reqText),
          priority: this.inferPriority(reqText),
          acceptance: [],
        };
        spec.requirements?.push(req);
      }

      if (currentSection === 'constraints' && trimmed.match(/^[-*]\s/)) {
        spec.constraints?.push(trimmed.replace(/^[-*]\s*/, ''));
      }

      if (currentSection === 'assumptions' && trimmed.match(/^[-*]\s/)) {
        spec.assumptions?.push(trimmed.replace(/^[-*]\s*/, ''));
      }
    }

    spec.id = spec.id || `SPEC-${Date.now()}`;
    spec.title = spec.title || 'Untitled Specification';
    spec.overview = spec.overview?.trim() || '';

    return spec as FunctionalSpec;
  }

  /**
   * Parse Technical Architecture document
   */
  parseTechnicalArchitecture(content: string): TechnicalArchitecture {
    const architecture: TechnicalArchitecture = {
      components: [],
      interfaces: [],
      dataFlows: [],
      technologies: [],
      constraints: [],
    };

    const lines = content.split('\n');
    let currentSection = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect sections
      if (trimmed.toLowerCase().includes('component')) {
        currentSection = 'components';
        continue;
      }
      if (trimmed.toLowerCase().includes('interface') || trimmed.toLowerCase().includes('api')) {
        currentSection = 'interfaces';
        continue;
      }
      if (trimmed.toLowerCase().includes('data flow') || trimmed.toLowerCase().includes('dataflow')) {
        currentSection = 'dataflows';
        continue;
      }
      if (trimmed.toLowerCase().includes('technolog') || trimmed.toLowerCase().includes('stack')) {
        currentSection = 'technologies';
        continue;
      }

      // Parse components
      if (currentSection === 'components' && trimmed.match(/^[-*]\s/)) {
        const compText = trimmed.replace(/^[-*]\s*/, '');
        const comp = this.parseComponent(compText);
        if (comp) architecture.components.push(comp);
      }

      // Parse interfaces
      if (currentSection === 'interfaces' && trimmed.match(/^[-*]\s/)) {
        const ifaceText = trimmed.replace(/^[-*]\s*/, '');
        const iface = this.parseInterface(ifaceText);
        if (iface) architecture.interfaces.push(iface);
      }

      // Parse technologies
      if (currentSection === 'technologies' && trimmed.match(/^[-*]\s/)) {
        const techText = trimmed.replace(/^[-*]\s*/, '');
        const tech = this.parseTechnology(techText);
        if (tech) architecture.technologies.push(tech);
      }
    }

    return architecture;
  }

  /**
   * Extract testable elements from parsed documents
   */
  extractTestableElements(
    userStories: UserStory[],
    specs: FunctionalSpec[],
    architecture?: TechnicalArchitecture
  ): TestableElement[] {
    const elements: TestableElement[] = [];

    // Extract from user stories
    userStories.forEach((story) => {
      // The story itself as an action
      elements.push({
        id: `TE-${story.id}-ACTION`,
        source: 'userStory',
        sourceId: story.id,
        type: 'action',
        description: story.iWant,
        suggestedHTSM: this.suggestHTSM(story.iWant),
      });

      // Each acceptance criteria as a condition
      story.acceptanceCriteria.forEach((ac) => {
        elements.push({
          id: `TE-${story.id}-${ac.id}`,
          source: 'userStory',
          sourceId: story.id,
          type: 'condition',
          description: ac.description,
          suggestedHTSM: this.suggestHTSM(ac.description),
        });
      });
    });

    // Extract from specs
    specs.forEach((spec) => {
      spec.requirements.forEach((req) => {
        elements.push({
          id: `TE-${spec.id}-${req.id}`,
          source: 'spec',
          sourceId: spec.id,
          type: req.type === 'functional' ? 'action' : 'constraint',
          description: req.description,
          suggestedHTSM: this.suggestHTSM(req.description),
        });
      });
    });

    // Extract from architecture
    if (architecture) {
      architecture.components.forEach((comp) => {
        elements.push({
          id: `TE-ARCH-${comp.name}`,
          source: 'architecture',
          sourceId: comp.name,
          type: 'interface',
          description: `${comp.type}: ${comp.description}`,
          suggestedHTSM: ['STRUCTURE', 'INTERFACES'],
        });
      });

      architecture.interfaces.forEach((iface) => {
        elements.push({
          id: `TE-ARCH-${iface.name}`,
          source: 'architecture',
          sourceId: iface.name,
          type: 'interface',
          description: `${iface.type} interface: ${iface.name}`,
          suggestedHTSM: ['INTERFACES'],
        });
      });
    }

    return elements;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private isTestable(text: string): boolean {
    // Check for testable patterns
    const testablePatterns = [
      /must/i,
      /should/i,
      /shall/i,
      /can/i,
      /will/i,
      /validate/i,
      /verify/i,
      /display/i,
      /return/i,
      /show/i,
    ];
    return testablePatterns.some((pattern) => pattern.test(text));
  }

  private extractTestConditions(text: string): string[] {
    const conditions: string[] = [];

    // Extract conditional patterns
    const ifMatch = text.match(/if\s+(.+?)(,|then|$)/gi);
    if (ifMatch) conditions.push(...ifMatch);

    const whenMatch = text.match(/when\s+(.+?)(,|then|$)/gi);
    if (whenMatch) conditions.push(...whenMatch);

    // Extract validation patterns
    const validateMatch = text.match(/validate[sd]?\s+(.+?)($|\.)/gi);
    if (validateMatch) conditions.push(...validateMatch);

    return conditions;
  }

  private classifyRequirement(text: string): 'functional' | 'non-functional' {
    const nfPatterns = [
      /performance/i,
      /security/i,
      /scalab/i,
      /reliab/i,
      /usab/i,
      /maintain/i,
      /availab/i,
    ];
    return nfPatterns.some((p) => p.test(text)) ? 'non-functional' : 'functional';
  }

  private inferPriority(text: string): 'P0' | 'P1' | 'P2' | 'P3' {
    const criticalPatterns = [/critical/i, /must/i, /security/i, /required/i];
    const highPatterns = [/important/i, /should/i, /high/i];
    const lowPatterns = [/optional/i, /nice to have/i, /could/i];

    if (criticalPatterns.some((p) => p.test(text))) return 'P0';
    if (highPatterns.some((p) => p.test(text))) return 'P1';
    if (lowPatterns.some((p) => p.test(text))) return 'P3';
    return 'P2';
  }

  private parseComponent(text: string): ArchitectureComponent | null {
    const types = ['service', 'database', 'ui', 'api', 'queue', 'cache'];
    let detectedType: ArchitectureComponent['type'] = 'service';

    for (const type of types) {
      if (text.toLowerCase().includes(type)) {
        detectedType = type as ArchitectureComponent['type'];
        break;
      }
    }

    return {
      name: text.split(':')[0].trim() || text.split('-')[0].trim() || text,
      type: detectedType,
      description: text,
      dependencies: [],
      interfaces: [],
    };
  }

  private parseInterface(text: string): InterfaceDefinition | null {
    const types: InterfaceDefinition['type'][] = ['rest', 'graphql', 'grpc', 'websocket', 'event'];
    let detectedType: InterfaceDefinition['type'] = 'rest';

    for (const type of types) {
      if (text.toLowerCase().includes(type)) {
        detectedType = type;
        break;
      }
    }

    return {
      name: text.split(':')[0].trim() || text,
      type: detectedType,
      dataFormat: 'JSON',
    };
  }

  private parseTechnology(text: string): Technology | null {
    const categories: Technology['category'][] = ['language', 'framework', 'database', 'infrastructure'];
    let detectedCategory: Technology['category'] = 'framework';

    const dbPatterns = [/postgres/i, /mysql/i, /mongo/i, /redis/i, /sql/i];
    const langPatterns = [/typescript/i, /javascript/i, /python/i, /java/i, /go/i];
    const infraPatterns = [/docker/i, /kubernetes/i, /aws/i, /azure/i, /gcp/i];

    if (dbPatterns.some((p) => p.test(text))) detectedCategory = 'database';
    if (langPatterns.some((p) => p.test(text))) detectedCategory = 'language';
    if (infraPatterns.some((p) => p.test(text))) detectedCategory = 'infrastructure';

    return {
      name: text.split(':')[0].trim() || text,
      category: detectedCategory,
    };
  }

  private suggestHTSM(text: string): HTSMCategory[] {
    const suggestions: HTSMCategory[] = [];
    const lower = text.toLowerCase();

    // Function indicators
    if (
      lower.match(/validate|verify|calculate|compute|process|transform|convert|authenticate|authorize/)
    ) {
      suggestions.push('FUNCTION');
    }

    // Data indicators
    if (lower.match(/input|output|data|field|format|value|store|save|delete|update/)) {
      suggestions.push('DATA');
    }

    // Interface indicators
    if (lower.match(/api|endpoint|button|form|display|screen|page|ui|click|submit/)) {
      suggestions.push('INTERFACES');
    }

    // Platform indicators
    if (lower.match(/browser|device|mobile|desktop|os|operating system|chrome|firefox/)) {
      suggestions.push('PLATFORM');
    }

    // Operations indicators
    if (lower.match(/user|role|permission|login|logout|session|workflow/)) {
      suggestions.push('OPERATIONS');
    }

    // Time indicators
    if (lower.match(/time|date|schedule|expire|timeout|duration|concurrent|async/)) {
      suggestions.push('TIME');
    }

    // Structure indicators
    if (lower.match(/module|component|service|dependency|architecture|integration/)) {
      suggestions.push('STRUCTURE');
    }

    // Default to FUNCTION if no specific match
    if (suggestions.length === 0) {
      suggestions.push('FUNCTION');
    }

    return suggestions;
  }
}

export const documentParser = new DocumentParser();
