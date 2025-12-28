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
   * Supports multiple formats:
   * 1. Formal user stories with ## US-XXX headers
   * 2. Epic-format documents with bullet-point features
   * 3. Numbered acceptance criteria lists
   */
  parseUserStories(content: string): UserStory[] {
    // Try formal user story format first (## US-XXX headers)
    const storyBlocks = content.split(/(?=^##?\s*(US-\d+|USER-STORY))/im).filter(Boolean);
    if (storyBlocks.length > 1 || (storyBlocks.length === 1 && storyBlocks[0].match(/^##?\s*(US-\d+|USER-STORY)/im))) {
      return storyBlocks.map((block) => this.parseUserStory(block));
    }

    // Fall back to Epic-format parsing (extract features from bullet lists)
    return this.parseEpicFormatUserStories(content);
  }

  /**
   * Parse user stories from Epic-format documents with bullet-point features
   * Converts features like "- Comment system with threading" into UserStory objects
   */
  private parseEpicFormatUserStories(content: string): UserStory[] {
    const stories: UserStory[] = [];
    const lines = content.split('\n');

    let epicId = 'EPIC-0';
    let epicTitle = '';
    let inFeaturesSection = false;
    let inAcceptanceCriteria = false;
    let currentFeatures: string[] = [];
    let acceptanceCriteria: string[] = [];
    let storyCounter = 1;

    // Extract Epic ID from title (e.g., "Epic 4: Community & Engagement")
    for (const line of lines) {
      const trimmed = line.trim();
      const epicMatch = trimmed.match(/Epic\s*(\d+):?\s*(.+)/i);
      if (epicMatch) {
        epicId = `EPIC-${epicMatch[1]}`;
        epicTitle = epicMatch[2].trim();
        break;
      }
    }

    // Parse document sections
    for (const line of lines) {
      const trimmed = line.trim();
      const lowerTrimmed = trimmed.toLowerCase();

      // Detect features section
      if (lowerTrimmed.includes('key features') || lowerTrimmed.includes('user stories') ||
          lowerTrimmed.includes('features/user stories')) {
        inFeaturesSection = true;
        inAcceptanceCriteria = false;
        continue;
      }

      // Detect acceptance criteria section
      if (lowerTrimmed.includes('acceptance criteria')) {
        inAcceptanceCriteria = true;
        inFeaturesSection = false;
        continue;
      }

      // End feature/AC section on new heading
      if (trimmed.match(/^#+\s/) || lowerTrimmed.startsWith('description') ||
          lowerTrimmed.startsWith('current issues')) {
        inFeaturesSection = false;
        inAcceptanceCriteria = false;
        continue;
      }

      // Extract features from bullet points
      if (inFeaturesSection && trimmed.match(/^[-*]\s+/)) {
        const feature = trimmed.replace(/^[-*]\s+/, '').trim();
        if (feature.length > 5) { // Filter out empty or too-short items
          currentFeatures.push(feature);
        }
      }

      // Extract acceptance criteria from numbered list
      if (inAcceptanceCriteria && trimmed.match(/^\d+\.\s+/)) {
        const ac = trimmed.replace(/^\d+\.\s+/, '').trim();
        if (ac.length > 5) {
          acceptanceCriteria.push(ac);
        }
      }
    }

    // Convert features to user stories
    for (const feature of currentFeatures) {
      const storyId = `US-${epicId.replace('EPIC-', '')}0${storyCounter}`;
      storyCounter++;

      // Infer user role and goal from feature text
      const { asA, iWant, soThat } = this.inferUserStoryParts(feature);

      // Map acceptance criteria to this feature based on relevance
      const relevantACs = this.findRelevantAcceptanceCriteria(feature, acceptanceCriteria);

      stories.push({
        id: storyId,
        title: feature,
        asA,
        iWant,
        soThat,
        acceptanceCriteria: relevantACs.map((ac, idx) => ({
          id: `AC-${storyId}-${idx + 1}`,
          description: ac,
          testable: this.isTestable(ac),
          testConditions: this.extractTestConditions(ac),
        })),
        priority: this.inferStoryPriority(feature),
        epicId,
        tags: this.extractFeatureTags(feature),
      });
    }

    // If we still have unassigned acceptance criteria, create a general story
    if (stories.length === 0 && acceptanceCriteria.length > 0) {
      stories.push({
        id: `US-${epicId.replace('EPIC-', '')}01`,
        title: epicTitle || 'General Requirements',
        asA: 'user',
        iWant: `to use ${epicTitle || 'the system'} features`,
        soThat: 'I can achieve my goals effectively',
        acceptanceCriteria: acceptanceCriteria.map((ac, idx) => ({
          id: `AC-GEN-${idx + 1}`,
          description: ac,
          testable: this.isTestable(ac),
          testConditions: this.extractTestConditions(ac),
        })),
        priority: 'P1',
        epicId,
        tags: ['general'],
      });
    }

    return stories;
  }

  /**
   * Infer As a / I want / So that parts from a feature description
   */
  private inferUserStoryParts(feature: string): { asA: string; iWant: string; soThat: string } {
    const lowerFeature = feature.toLowerCase();

    // Determine user role based on feature keywords
    let asA = 'user';
    if (lowerFeature.includes('admin') || lowerFeature.includes('moderat')) asA = 'administrator';
    else if (lowerFeature.includes('author') || lowerFeature.includes('contributor')) asA = 'content contributor';
    else if (lowerFeature.includes('subscriber') || lowerFeature.includes('newsletter')) asA = 'subscriber';
    else if (lowerFeature.includes('reader') || lowerFeature.includes('visitor')) asA = 'reader';
    else if (lowerFeature.includes('member')) asA = 'community member';

    // Construct I want from feature
    const iWant = `to use ${feature.toLowerCase()}`;

    // Infer so that based on feature type
    let soThat = 'I can achieve my goals';
    if (lowerFeature.includes('comment')) soThat = 'I can engage with the content and community';
    else if (lowerFeature.includes('profile')) soThat = 'I can personalize my experience and build my identity';
    else if (lowerFeature.includes('bookmark') || lowerFeature.includes('reading')) soThat = 'I can save and organize content for later';
    else if (lowerFeature.includes('follow')) soThat = 'I can stay updated with favorite authors';
    else if (lowerFeature.includes('newsletter')) soThat = 'I receive relevant content recommendations';
    else if (lowerFeature.includes('event') || lowerFeature.includes('calendar')) soThat = 'I can participate in community activities';
    else if (lowerFeature.includes('submission') || lowerFeature.includes('contributor')) soThat = 'I can share my knowledge with the community';

    return { asA, iWant, soThat };
  }

  /**
   * Find acceptance criteria relevant to a specific feature
   */
  private findRelevantAcceptanceCriteria(feature: string, allACs: string[]): string[] {
    const featureWords = feature.toLowerCase().split(/\s+/).filter(w => w.length > 3);

    // First, find directly matching ACs from document
    const matchedACs = allACs.filter(ac => {
      const acLower = ac.toLowerCase();
      return featureWords.some(word => acLower.includes(word));
    });

    // Then generate comprehensive ACs based on feature type
    const generatedACs = this.generateComprehensiveACs(feature);

    // Combine unique ACs
    const allRelevant = [...matchedACs, ...generatedACs];
    return [...new Set(allRelevant)];
  }

  /**
   * Generate acceptance criteria based on actual feature content
   *
   * REFACTORED: Removed 100+ hardcoded ACs that were applied based on keyword matching.
   * The previous implementation would add irrelevant ACs (e.g., "comment threading" ACs
   * to a performance optimization epic because it mentioned "comment" somewhere).
   *
   * Now only generates minimal, truly generic ACs when no specific content is provided.
   * The main assessment should derive ACs from the actual input document.
   */
  private generateComprehensiveACs(feature: string): string[] {
    const acs: string[] = [];

    // REMOVED: All domain-specific hardcoded ACs
    // - Comment/thread ACs (8 items)
    // - Profile ACs (6 items)
    // - Bookmark ACs (6 items)
    // - Follow/subscribe ACs (6 items)
    // - Contributor/submission ACs (8 items)
    // - Newsletter/email ACs (6 items)
    // - Event/calendar ACs (6 items)
    // - Moderation/spam ACs (6 items)
    // - Rating/reaction ACs (5 items)
    // - Leaderboard/recognition ACs (5 items)
    // Total removed: 62 hardcoded ACs that were applied regardless of context

    // REMOVED: Generic "common ACs" that were adding noise:
    // - "is accessible to authorized users" (not always applicable)
    // - "handles errors gracefully" (too vague)
    // - "works correctly across all supported browsers" (implicit)
    // - "is responsive on mobile devices" (implicit)

    // Instead, return empty array - let the actual document content drive ACs
    // The HTSM analyzer and test generator will create context-appropriate tests
    // based on the actual requirements in the input document.

    return acs;
  }

  /**
   * Infer priority from feature description
   * Priority is determined by:
   * 1. Explicit priority markers in the document ("Priority: HIGH", "Must have", etc.)
   * 2. Position/ordering indicators (first items typically higher priority)
   * 3. Performance/business value keywords (NOT domain-specific keywords like "auth")
   */
  private inferStoryPriority(feature: string): 'P0' | 'P1' | 'P2' | 'P3' {
    const lowerFeature = feature.toLowerCase();

    // REMOVED: Domain-specific keyword matching (security/auth/moderation)
    // These incorrectly elevated priority based on topic rather than document intent

    // P0: Explicit priority markers indicating critical/blocking requirements
    const criticalMarkers = [
      /priority:\s*(critical|highest|p0)/i,
      /\b(must\s+have|mandatory|blocking|required)\b/i,
      /\bcritical\b/i,
    ];
    if (criticalMarkers.some(p => p.test(lowerFeature))) {
      return 'P0';
    }

    // P1: High priority markers or performance-critical indicators
    const highMarkers = [
      /priority:\s*(high|p1)/i,
      /\b(should\s+have|important|high\s+priority)\b/i,
      /\b(performance|optimization|speed|latency|response\s+time)\b/i,
      /\b(core\s+web\s+vitals?|lcp|fid|inp|cls)\b/i,
    ];
    if (highMarkers.some(p => p.test(lowerFeature))) {
      return 'P1';
    }

    // P3: Explicit low priority markers
    const lowMarkers = [
      /priority:\s*(low|p3)/i,
      /\b(nice\s+to\s+have|optional|could|stretch|future)\b/i,
    ];
    if (lowMarkers.some(p => p.test(lowerFeature))) {
      return 'P3';
    }

    // Default to P2 (medium) when no explicit markers
    return 'P2';
  }

  /**
   * Extract relevant tags from feature description
   */
  private extractFeatureTags(feature: string): string[] {
    const tags: string[] = [];
    const lowerFeature = feature.toLowerCase();

    const tagPatterns: Record<string, string[]> = {
      'community': ['community', 'engagement', 'social'],
      'comments': ['comment', 'discussion', 'thread', 'reply'],
      'profile': ['profile', 'customization', 'personalization'],
      'bookmarks': ['bookmark', 'reading list', 'save'],
      'follow': ['follow', 'subscribe', 'notification'],
      'newsletter': ['newsletter', 'email', 'recommendation'],
      'events': ['event', 'calendar', 'conference'],
      'moderation': ['moderation', 'spam', 'filter'],
      'contribution': ['submission', 'contributor', 'author', 'article'],
    };

    for (const [tag, patterns] of Object.entries(tagPatterns)) {
      if (patterns.some(p => lowerFeature.includes(p))) {
        tags.push(tag);
      }
    }

    return tags.length > 0 ? tags : ['general'];
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
    // REMOVED: "security" from critical patterns - topic doesn't determine priority
    // Priority should be based on explicit markers, not domain keywords
    const criticalPatterns = [
      /\bcritical\b/i,
      /\bmust\s+have\b/i,
      /\brequired\b/i,
      /priority:\s*(critical|highest|p0)/i,
    ];
    const highPatterns = [
      /\bimportant\b/i,
      /\bshould\s+have\b/i,
      /\bhigh\s+priority\b/i,
      /priority:\s*(high|p1)/i,
    ];
    const lowPatterns = [
      /\boptional\b/i,
      /\bnice\s+to\s+have\b/i,
      /\bcould\b/i,
      /priority:\s*(low|p3)/i,
    ];

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
