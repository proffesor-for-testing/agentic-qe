/**
 * Document Parser
 *
 * Parses functional specifications, requirements documents, and other
 * documentation formats into structured data for SFDIPOT analysis.
 */

import { FunctionalSpec, SpecSection, ExtractedEntities } from '../types';

export interface ParsedDocumentResult {
  specs: FunctionalSpec[];
  entities: ExtractedEntities;
  sections: SpecSection[];
  rawText: string;
}

/**
 * Document Parser
 *
 * Supports multiple document formats:
 * - Markdown with headers
 * - Plain text with sections
 * - Structured specification objects
 */
export class DocumentParser {
  private specIdCounter = 0;

  /**
   * Parse document from string or structured input
   */
  parse(input: string | FunctionalSpec[]): ParsedDocumentResult {
    if (Array.isArray(input)) {
      return this.parseStructured(input);
    }
    return this.parseText(input);
  }

  /**
   * Parse structured specification array
   */
  private parseStructured(specs: FunctionalSpec[]): ParsedDocumentResult {
    const allSections: SpecSection[] = [];
    specs.forEach(s => allSections.push(...s.sections));

    const entities = this.extractEntitiesFromSections(allSections);

    return {
      specs: specs.map(s => ({
        ...s,
        id: s.id || this.generateSpecId(),
      })),
      entities,
      sections: allSections,
      rawText: specs.map(s => s.rawText || this.formatSpecAsText(s)).join('\n\n---\n\n'),
    };
  }

  /**
   * Parse text-based document input
   */
  private parseText(text: string): ParsedDocumentResult {
    const sections = this.parseSections(text);
    const specs = this.groupSectionsIntoSpecs(sections, text);
    const entities = this.extractEntitiesFromSections(sections);

    return {
      specs,
      entities,
      sections,
      rawText: text,
    };
  }

  /**
   * Parse sections from markdown/text document
   */
  private parseSections(text: string): SpecSection[] {
    const sections: SpecSection[] = [];
    const lines = text.split('\n');

    let currentSection: SpecSection | null = null;
    let currentSubsection: SpecSection | null = null;
    let contentBuffer: string[] = [];

    for (const line of lines) {
      // Main header (# or ##)
      const mainHeaderMatch = line.match(/^(#{1,2})\s+(.+)/);
      if (mainHeaderMatch) {
        // Save previous section
        if (currentSection) {
          if (currentSubsection) {
            currentSubsection.content = contentBuffer.join('\n').trim();
            currentSection.subsections = currentSection.subsections || [];
            currentSection.subsections.push(currentSubsection);
            currentSubsection = null;
          } else {
            currentSection.content = contentBuffer.join('\n').trim();
          }
          sections.push(currentSection);
        }

        currentSection = {
          heading: mainHeaderMatch[2].trim(),
          content: '',
          subsections: [],
        };
        contentBuffer = [];
        continue;
      }

      // Subsection header (### or ####)
      const subHeaderMatch = line.match(/^(#{3,4})\s+(.+)/);
      if (subHeaderMatch && currentSection) {
        // Save previous subsection
        if (currentSubsection) {
          currentSubsection.content = contentBuffer.join('\n').trim();
          currentSection.subsections = currentSection.subsections || [];
          currentSection.subsections.push(currentSubsection);
        } else {
          currentSection.content = contentBuffer.join('\n').trim();
        }

        currentSubsection = {
          heading: subHeaderMatch[2].trim(),
          content: '',
        };
        contentBuffer = [];
        continue;
      }

      // Plain text section headers (ALL CAPS or numbered)
      const plainHeaderMatch = line.match(/^([A-Z][A-Z\s]+):|^(\d+\.)\s+(.+)/);
      if (plainHeaderMatch && line.length < 100) {
        // Save previous section
        if (currentSection) {
          if (currentSubsection) {
            currentSubsection.content = contentBuffer.join('\n').trim();
            currentSection.subsections = currentSection.subsections || [];
            currentSection.subsections.push(currentSubsection);
            currentSubsection = null;
          } else {
            currentSection.content = contentBuffer.join('\n').trim();
          }
          sections.push(currentSection);
        }

        const heading = plainHeaderMatch[1]
          ? plainHeaderMatch[1].trim()
          : `${plainHeaderMatch[2]} ${plainHeaderMatch[3]}`.trim();

        currentSection = {
          heading,
          content: '',
          subsections: [],
        };
        contentBuffer = [];
        continue;
      }

      // Regular content
      contentBuffer.push(line);
    }

    // Save final section
    if (currentSection) {
      if (currentSubsection) {
        currentSubsection.content = contentBuffer.join('\n').trim();
        currentSection.subsections = currentSection.subsections || [];
        currentSection.subsections.push(currentSubsection);
      } else {
        currentSection.content = contentBuffer.join('\n').trim();
      }
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * Group sections into logical specifications
   */
  private groupSectionsIntoSpecs(sections: SpecSection[], rawText: string): FunctionalSpec[] {
    if (sections.length === 0) {
      return [{
        id: this.generateSpecId(),
        title: 'Document',
        sections: [],
        rawText,
      }];
    }

    // Check if first section is a title
    const firstSection = sections[0];
    const isTitle = firstSection.heading.toLowerCase().includes('specification') ||
                    firstSection.heading.toLowerCase().includes('requirements') ||
                    firstSection.heading.toLowerCase().includes('document') ||
                    firstSection.content.length < 100;

    if (isTitle && sections.length > 1) {
      return [{
        id: this.generateSpecId(),
        title: firstSection.heading,
        sections: sections.slice(1),
        rawText,
      }];
    }

    // Treat all sections as one spec
    return [{
      id: this.generateSpecId(),
      title: firstSection.heading,
      sections,
      rawText,
    }];
  }

  /**
   * Extract entities from document sections
   */
  private extractEntitiesFromSections(sections: SpecSection[]): ExtractedEntities {
    const actors = new Set<string>();
    const features = new Set<string>();
    const dataTypes = new Set<string>();
    const integrations = new Set<string>();
    const actions = new Set<string>();

    const processSection = (section: SpecSection) => {
      const text = `${section.heading} ${section.content}`;

      // Extract actors/users
      const actorPatterns = [
        /\b(user|admin|administrator|manager|customer|client|operator|viewer|editor|owner|member|guest)\b/gi,
        /\b(\w+)\s+users?\b/gi,
      ];
      for (const pattern of actorPatterns) {
        const matches = text.match(pattern);
        if (matches) {
          matches.forEach(m => actors.add(m.toLowerCase().trim()));
        }
      }

      // Extract features from headings
      if (section.heading) {
        const featureWords = section.heading.split(/\s+/)
          .filter(w => w.length > 3 && !/^(the|and|for|with|from)$/i.test(w));
        featureWords.forEach(w => features.add(w.toLowerCase()));
      }

      // Extract data types
      const dataPatterns = [
        /\b(string|number|integer|boolean|date|datetime|timestamp|uuid|id|email|phone|url|json|xml)\b/gi,
        /\b(user|order|product|payment|account|profile|report|message|notification|file|document)\b/gi,
        /\b(list|array|collection|set|map|dictionary|object|record|entity)\b/gi,
      ];
      for (const pattern of dataPatterns) {
        const matches = text.match(pattern);
        if (matches) {
          matches.forEach(m => dataTypes.add(m.toLowerCase()));
        }
      }

      // Extract integrations
      const integrationPatterns = [
        /\b(api|rest|graphql|grpc|websocket|http|https|oauth|saml|ldap|sso)\b/gi,
        /\b(database|postgres|mysql|mongodb|redis|elasticsearch|kafka|rabbitmq|sqs)\b/gi,
        /\b(aws|azure|gcp|s3|lambda|ec2|cloudfront|cdn)\b/gi,
        /\b(stripe|paypal|twilio|sendgrid|mailchimp|slack|github|jira)\b/gi,
      ];
      for (const pattern of integrationPatterns) {
        const matches = text.match(pattern);
        if (matches) {
          matches.forEach(m => integrations.add(m.toLowerCase()));
        }
      }

      // Extract actions/verbs
      const actionPattern = /\b(create|read|update|delete|list|search|filter|sort|export|import|upload|download|validate|verify|authenticate|authorize|submit|approve|reject|cancel|archive|restore)\b/gi;
      const actionMatches = text.match(actionPattern);
      if (actionMatches) {
        actionMatches.forEach(a => actions.add(a.toLowerCase()));
      }

      // Process subsections
      if (section.subsections) {
        section.subsections.forEach(processSection);
      }
    };

    sections.forEach(processSection);

    return {
      actors: Array.from(actors),
      features: Array.from(features),
      dataTypes: Array.from(dataTypes),
      integrations: Array.from(integrations),
      actions: Array.from(actions),
    };
  }

  /**
   * Format specification as text
   */
  private formatSpecAsText(spec: FunctionalSpec): string {
    let text = `# ${spec.title}\n\n`;

    const formatSection = (section: SpecSection, level: number): string => {
      const prefix = '#'.repeat(level + 1);
      let sectionText = `${prefix} ${section.heading}\n\n${section.content}\n\n`;

      if (section.subsections) {
        section.subsections.forEach(sub => {
          sectionText += formatSection(sub, level + 1);
        });
      }

      return sectionText;
    };

    spec.sections.forEach(section => {
      text += formatSection(section, 1);
    });

    return text;
  }

  private generateSpecId(): string {
    return `SPEC-${++this.specIdCounter}`;
  }

  /**
   * Extract key requirements from sections
   */
  extractRequirements(sections: SpecSection[]): string[] {
    const requirements: string[] = [];

    const processSection = (section: SpecSection) => {
      // Look for requirement patterns
      const reqPatterns = [
        /(?:shall|must|should|will)\s+(.+?)(?:\.|$)/gi,
        /(?:requirement|req)[\s:-]+(.+?)(?:\.|$)/gi,
        /\bR\d+[:\s]+(.+?)(?:\.|$)/gi,
      ];

      for (const pattern of reqPatterns) {
        const matches = section.content.matchAll(pattern);
        for (const match of matches) {
          requirements.push(match[1].trim());
        }
      }

      // Look for bullet points as requirements
      const bulletMatches = section.content.match(/[-*]\s+(.+)/g);
      if (bulletMatches) {
        bulletMatches.forEach(bullet => {
          const text = bullet.replace(/^[-*]\s+/, '').trim();
          if (text.length > 20 && text.length < 500) {
            requirements.push(text);
          }
        });
      }

      if (section.subsections) {
        section.subsections.forEach(processSection);
      }
    };

    sections.forEach(processSection);
    return requirements;
  }

  /**
   * Extract constraints from sections
   */
  extractConstraints(sections: SpecSection[]): string[] {
    const constraints: string[] = [];

    const constraintKeywords = [
      'constraint',
      'limitation',
      'restriction',
      'requirement',
      'must not',
      'cannot',
      'shall not',
      'maximum',
      'minimum',
      'at least',
      'at most',
      'within',
      'timeout',
      'deadline',
    ];

    const processSection = (section: SpecSection) => {
      const text = section.content.toLowerCase();

      for (const keyword of constraintKeywords) {
        if (text.includes(keyword)) {
          // Extract sentences containing the keyword
          const sentences = section.content.split(/[.!?]+/);
          sentences.forEach(sentence => {
            if (sentence.toLowerCase().includes(keyword) && sentence.trim().length > 10) {
              constraints.push(sentence.trim());
            }
          });
        }
      }

      if (section.subsections) {
        section.subsections.forEach(processSection);
      }
    };

    sections.forEach(processSection);
    return [...new Set(constraints)]; // Deduplicate
  }
}
