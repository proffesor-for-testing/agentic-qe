/**
 * User Story Parser
 *
 * Parses user stories from various formats (text, markdown, structured)
 * into standardized UserStory objects for SFDIPOT analysis.
 */

import { UserStory, Epic, ExtractedEntities } from '../types';

export interface ParsedUserStoryResult {
  userStories: UserStory[];
  epics: Epic[];
  entities: ExtractedEntities;
  rawText: string;
}

/**
 * User Story Parser
 *
 * Supports multiple input formats:
 * - "As a [role], I want [feature], so that [benefit]"
 * - Markdown with headers and bullet points
 * - JSON/structured objects
 * - Plain text with story patterns
 */
export class UserStoryParser {
  private storyIdCounter = 0;
  private epicIdCounter = 0;

  /**
   * Parse user stories from string input
   */
  parse(input: string | UserStory[]): ParsedUserStoryResult {
    if (Array.isArray(input)) {
      return this.parseStructured(input);
    }
    return this.parseText(input);
  }

  /**
   * Parse structured user story array
   */
  private parseStructured(stories: UserStory[]): ParsedUserStoryResult {
    const entities = this.extractEntitiesFromStories(stories);
    return {
      userStories: stories.map(s => ({
        ...s,
        id: s.id || this.generateStoryId(),
      })),
      epics: [],
      entities,
      rawText: stories.map(s => s.rawText || this.formatStoryAsText(s)).join('\n\n'),
    };
  }

  /**
   * Parse text-based user story input
   */
  private parseText(text: string): ParsedUserStoryResult {
    const userStories: UserStory[] = [];
    const epics: Epic[] = [];

    // Try parsing as markdown with epics/stories
    if (text.includes('#')) {
      const markdownResult = this.parseMarkdown(text);
      userStories.push(...markdownResult.stories);
      epics.push(...markdownResult.epics);
    }

    // Parse "As a... I want... so that..." patterns
    const asAPatterns = this.parseAsAPattern(text);
    userStories.push(...asAPatterns);

    // Parse Given/When/Then patterns (BDD)
    const bddPatterns = this.parseGherkinPatterns(text);
    userStories.push(...bddPatterns);

    // Extract entities from all parsed content
    const entities = this.extractEntitiesFromStories(userStories);

    return {
      userStories,
      epics,
      entities,
      rawText: text,
    };
  }

  /**
   * Parse markdown-formatted user stories
   */
  private parseMarkdown(text: string): { stories: UserStory[]; epics: Epic[] } {
    const stories: UserStory[] = [];
    const epics: Epic[] = [];
    const lines = text.split('\n');

    let currentEpic: Epic | null = null;
    let currentStoryLines: string[] = [];

    for (const line of lines) {
      // Epic header (# or ##)
      const epicMatch = line.match(/^#+\s+(?:Epic[:\s]*)?(.+)/i);
      if (epicMatch) {
        // Save previous story
        if (currentStoryLines.length > 0) {
          const story = this.parseStoryBlock(currentStoryLines.join('\n'));
          if (story) {
            stories.push(story);
            if (currentEpic) {
              currentEpic.userStories = currentEpic.userStories || [];
              currentEpic.userStories.push(story);
            }
          }
          currentStoryLines = [];
        }

        currentEpic = {
          id: this.generateEpicId(),
          title: epicMatch[1].trim(),
          description: '',
          userStories: [],
        };
        epics.push(currentEpic);
        continue;
      }

      // Story bullet point or content
      const storyBullet = line.match(/^[-*]\s+(.+)/);
      if (storyBullet || line.match(/^As a/i)) {
        // Save previous story if we have one
        if (currentStoryLines.length > 0) {
          const story = this.parseStoryBlock(currentStoryLines.join('\n'));
          if (story) {
            stories.push(story);
            if (currentEpic) {
              currentEpic.userStories = currentEpic.userStories || [];
              currentEpic.userStories.push(story);
            }
          }
          currentStoryLines = [];
        }
        currentStoryLines.push(storyBullet ? storyBullet[1] : line);
      } else if (currentStoryLines.length > 0 && line.trim()) {
        currentStoryLines.push(line.trim());
      }
    }

    // Process last story
    if (currentStoryLines.length > 0) {
      const story = this.parseStoryBlock(currentStoryLines.join('\n'));
      if (story) {
        stories.push(story);
        if (currentEpic) {
          currentEpic.userStories = currentEpic.userStories || [];
          currentEpic.userStories.push(story);
        }
      }
    }

    return { stories, epics };
  }

  /**
   * Parse a single story block
   */
  private parseStoryBlock(text: string): UserStory | null {
    // Standard format: As a [role], I want [feature], so that [benefit]
    const asAMatch = text.match(
      /As\s+(?:a|an)\s+([^,]+),?\s*I\s+want\s+(?:to\s+)?([^,]+),?\s*(?:so\s+that|in\s+order\s+to)\s+(.+)/is
    );

    if (asAMatch) {
      return {
        id: this.generateStoryId(),
        asA: asAMatch[1].trim(),
        iWant: asAMatch[2].trim(),
        soThat: asAMatch[3].trim(),
        rawText: text,
        acceptanceCriteria: this.extractAcceptanceCriteria(text),
      };
    }

    // Try simpler "As a... I want..." without so that
    const simpleMatch = text.match(/As\s+(?:a|an)\s+([^,]+),?\s*I\s+want\s+(?:to\s+)?(.+)/is);
    if (simpleMatch) {
      return {
        id: this.generateStoryId(),
        asA: simpleMatch[1].trim(),
        iWant: simpleMatch[2].trim(),
        soThat: 'achieve my goal',
        rawText: text,
        acceptanceCriteria: this.extractAcceptanceCriteria(text),
      };
    }

    return null;
  }

  /**
   * Parse "As a..." patterns from text
   */
  private parseAsAPattern(text: string): UserStory[] {
    const stories: UserStory[] = [];
    const pattern = /As\s+(?:a|an)\s+([^,]+),?\s*I\s+want\s+(?:to\s+)?([^,]+),?\s*(?:so\s+that|in\s+order\s+to)\s+([^.]+)/gi;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      stories.push({
        id: this.generateStoryId(),
        asA: match[1].trim(),
        iWant: match[2].trim(),
        soThat: match[3].trim(),
        rawText: match[0],
      });
    }

    return stories;
  }

  /**
   * Parse Gherkin/BDD patterns and convert to user stories
   */
  private parseGherkinPatterns(text: string): UserStory[] {
    const stories: UserStory[] = [];

    // Match Feature blocks
    const featurePattern = /Feature:\s*(.+?)(?=Feature:|$)/gis;
    let featureMatch;

    while ((featureMatch = featurePattern.exec(text)) !== null) {
      const featureText = featureMatch[1];
      const featureTitle = featureText.split('\n')[0].trim();

      // Match Scenario blocks within feature
      const scenarioPattern = /Scenario(?:\s+Outline)?:\s*(.+?)(?=Scenario(?:\s+Outline)?:|$)/gis;
      let scenarioMatch;

      while ((scenarioMatch = scenarioPattern.exec(featureText)) !== null) {
        const scenarioText = scenarioMatch[1];
        const scenarioTitle = scenarioText.split('\n')[0].trim();

        // Extract Given/When/Then
        const givenMatch = scenarioText.match(/Given\s+(.+?)(?=When|Then|And|$)/is);
        const whenMatch = scenarioText.match(/When\s+(.+?)(?=Then|And|$)/is);
        const thenMatch = scenarioText.match(/Then\s+(.+?)(?=And|$)/is);

        if (whenMatch) {
          stories.push({
            id: this.generateStoryId(),
            title: `${featureTitle}: ${scenarioTitle}`,
            asA: givenMatch ? this.extractRoleFromGiven(givenMatch[1]) : 'user',
            iWant: whenMatch[1].trim(),
            soThat: thenMatch ? thenMatch[1].trim() : 'achieve the expected result',
            rawText: scenarioMatch[0],
          });
        }
      }
    }

    return stories;
  }

  /**
   * Extract role from Given statement
   */
  private extractRoleFromGiven(given: string): string {
    // "Given I am a logged in user" -> "logged in user"
    // "Given the admin is on the dashboard" -> "admin"
    const rolePatterns = [
      /I\s+am\s+(?:a|an)\s+(.+)/i,
      /(?:the\s+)?(\w+)\s+(?:is|has|was)/i,
      /(?:a|an)\s+(\w+)\s+user/i,
    ];

    for (const pattern of rolePatterns) {
      const match = given.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return 'user';
  }

  /**
   * Extract acceptance criteria from text
   */
  private extractAcceptanceCriteria(text: string): string[] {
    const criteria: string[] = [];

    // Look for "Acceptance Criteria:" section
    const acMatch = text.match(/Acceptance\s+Criteria:?\s*([^#]+)/i);
    if (acMatch) {
      const acText = acMatch[1];
      const bulletPoints = acText.match(/[-*]\s+(.+)/g);
      if (bulletPoints) {
        criteria.push(...bulletPoints.map(b => b.replace(/^[-*]\s+/, '').trim()));
      }
    }

    // Look for Given/When/Then in the same block
    const gwtMatches = text.match(/(?:Given|When|Then|And)\s+.+/gi);
    if (gwtMatches) {
      criteria.push(...gwtMatches.map(m => m.trim()));
    }

    return criteria;
  }

  /**
   * Extract entities from parsed user stories
   */
  private extractEntitiesFromStories(stories: UserStory[]): ExtractedEntities {
    const actors = new Set<string>();
    const features = new Set<string>();
    const dataTypes = new Set<string>();
    const integrations = new Set<string>();
    const actions = new Set<string>();

    for (const story of stories) {
      // Extract actors from "As a" role
      if (story.asA) {
        actors.add(story.asA.toLowerCase().trim());
      }

      // Extract actions from "I want" (verbs)
      if (story.iWant) {
        const verbPattern = /\b(create|update|delete|view|manage|configure|import|export|search|filter|login|logout|register|submit|approve|reject|send|receive|upload|download|sync|integrate|analyze|generate|monitor)\b/gi;
        const verbMatches = story.iWant.match(verbPattern);
        if (verbMatches) {
          verbMatches.forEach(v => actions.add(v.toLowerCase()));
        }

        // Extract features (nouns after verbs)
        const featurePattern = /(?:create|update|delete|view|manage|configure)\s+(?:a|an|the|my)?\s*(\w+(?:\s+\w+)?)/gi;
        let featureMatch;
        while ((featureMatch = featurePattern.exec(story.iWant)) !== null) {
          features.add(featureMatch[1].toLowerCase().trim());
        }
      }

      // Extract data types
      const dataPatterns = [
        /\b(user|customer|order|product|payment|account|profile|report|message|notification|file|document|image|video|email)\b/gi,
        /\b(date|time|amount|price|quantity|status|name|email|phone|address)\b/gi,
      ];

      const fullText = `${story.asA} ${story.iWant} ${story.soThat}`;
      for (const pattern of dataPatterns) {
        const matches = fullText.match(pattern);
        if (matches) {
          matches.forEach(m => dataTypes.add(m.toLowerCase()));
        }
      }

      // Extract integrations
      const integrationPattern = /\b(api|service|system|database|queue|cache|third[- ]party|external|webhook|oauth|sso|ldap)\b/gi;
      const integrationMatches = fullText.match(integrationPattern);
      if (integrationMatches) {
        integrationMatches.forEach(i => integrations.add(i.toLowerCase()));
      }
    }

    return {
      actors: Array.from(actors),
      features: Array.from(features),
      dataTypes: Array.from(dataTypes),
      integrations: Array.from(integrations),
      actions: Array.from(actions),
    };
  }

  /**
   * Format a structured story as text
   */
  private formatStoryAsText(story: UserStory): string {
    let text = `As a ${story.asA}, I want ${story.iWant}, so that ${story.soThat}`;
    if (story.acceptanceCriteria && story.acceptanceCriteria.length > 0) {
      text += '\n\nAcceptance Criteria:\n';
      text += story.acceptanceCriteria.map(ac => `- ${ac}`).join('\n');
    }
    return text;
  }

  private generateStoryId(): string {
    return `US-${++this.storyIdCounter}`;
  }

  private generateEpicId(): string {
    return `EP-${++this.epicIdCounter}`;
  }
}
