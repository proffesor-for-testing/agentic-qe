/**
 * Architecture Parser
 *
 * Parses technical architecture documentation into structured data
 * for SFDIPOT PLATFORM and INTERFACES analysis.
 */

import {
  TechnicalArchitecture,
  ArchitectureComponent,
  Integration,
  DataFlow,
  ExtractedEntities,
} from '../types';

export interface ParsedArchitectureResult {
  architecture: TechnicalArchitecture;
  entities: ExtractedEntities;
  rawText: string;
}

/**
 * Architecture Parser
 *
 * Extracts architectural information from:
 * - Text descriptions
 * - Markdown documentation
 * - Mermaid diagrams
 * - C4 model descriptions
 */
export class ArchitectureParser {
  /**
   * Parse architecture from string or structured input
   */
  parse(input: string | TechnicalArchitecture): ParsedArchitectureResult {
    if (typeof input === 'object' && !Array.isArray(input)) {
      return this.parseStructured(input);
    }
    return this.parseText(input as string);
  }

  /**
   * Parse structured architecture object
   */
  private parseStructured(architecture: TechnicalArchitecture): ParsedArchitectureResult {
    const entities = this.extractEntitiesFromArchitecture(architecture);
    return {
      architecture,
      entities,
      rawText: architecture.rawText || this.formatArchitectureAsText(architecture),
    };
  }

  /**
   * Parse text-based architecture description
   */
  private parseText(text: string): ParsedArchitectureResult {
    const components = this.parseComponents(text);
    const integrations = this.parseIntegrations(text);
    const dataFlows = this.parseDataFlows(text);

    const architecture: TechnicalArchitecture = {
      components,
      integrations,
      dataFlows,
      rawText: text,
    };

    const entities = this.extractEntitiesFromArchitecture(architecture);

    return {
      architecture,
      entities,
      rawText: text,
    };
  }

  /**
   * Parse component definitions from text
   */
  private parseComponents(text: string): ArchitectureComponent[] {
    const components: ArchitectureComponent[] = [];
    const seenNames = new Set<string>();

    // Pattern: Component/Service/Module definitions
    const componentPatterns = [
      /(?:component|service|module|layer|system)[\s:-]+["']?(\w[\w\s-]+)["']?/gi,
      /(\w+(?:Service|Controller|Repository|Handler|Manager|Worker|API|Gateway|Cache|Queue|Store))\b/g,
      /\b(frontend|backend|api|database|cache|queue|worker|scheduler|gateway|proxy|load.?balancer)\b/gi,
    ];

    for (const pattern of componentPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const name = match[1].trim();
        if (!seenNames.has(name.toLowerCase()) && name.length > 2) {
          seenNames.add(name.toLowerCase());
          components.push({
            name,
            type: this.inferComponentType(name),
            description: this.extractComponentDescription(text, name),
            dependencies: this.extractDependencies(text, name),
          });
        }
      }
    }

    // Parse Mermaid C4 diagrams
    const mermaidComponents = this.parseMermaidComponents(text);
    for (const comp of mermaidComponents) {
      if (!seenNames.has(comp.name.toLowerCase())) {
        seenNames.add(comp.name.toLowerCase());
        components.push(comp);
      }
    }

    return components;
  }

  /**
   * Parse Mermaid diagram components
   */
  private parseMermaidComponents(text: string): ArchitectureComponent[] {
    const components: ArchitectureComponent[] = [];

    // C4Context pattern
    const c4Patterns = [
      /Person\((\w+),\s*"([^"]+)"/g,
      /System\((\w+),\s*"([^"]+)"/g,
      /Container\((\w+),\s*"([^"]+)"/g,
      /Component\((\w+),\s*"([^"]+)"/g,
      /SystemDb\((\w+),\s*"([^"]+)"/g,
      /SystemQueue\((\w+),\s*"([^"]+)"/g,
    ];

    for (const pattern of c4Patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const id = match[1];
        const label = match[2];
        components.push({
          name: label || id,
          type: this.inferComponentTypeFromC4(pattern.source),
          description: `C4 ${id}`,
          dependencies: [],
        });
      }
    }

    // Mermaid flowchart nodes
    const flowchartPattern = /(\w+)\[([^\]]+)\]/g;
    const flowchartMatches = text.matchAll(flowchartPattern);
    for (const match of flowchartMatches) {
      components.push({
        name: match[2].replace(/['"]/g, '').trim(),
        type: 'service',
        description: `Flowchart node: ${match[1]}`,
        dependencies: [],
      });
    }

    return components;
  }

  /**
   * Infer component type from C4 pattern
   */
  private inferComponentTypeFromC4(patternSource: string): ArchitectureComponent['type'] {
    if (patternSource.includes('Person')) return 'ui';
    if (patternSource.includes('SystemDb')) return 'database';
    if (patternSource.includes('SystemQueue')) return 'queue';
    if (patternSource.includes('Container')) return 'service';
    if (patternSource.includes('Component')) return 'service';
    return 'external';
  }

  /**
   * Infer component type from name
   */
  private inferComponentType(name: string): ArchitectureComponent['type'] {
    const nameLower = name.toLowerCase();

    if (/database|db|store|repository|persist/i.test(nameLower)) return 'database';
    if (/queue|worker|job|consumer|producer|kafka|rabbit|sqs/i.test(nameLower)) return 'queue';
    if (/cache|redis|memcache/i.test(nameLower)) return 'cache';
    if (/api|gateway|controller|endpoint|rest|graphql/i.test(nameLower)) return 'service';
    if (/ui|frontend|web|app|client|view/i.test(nameLower)) return 'ui';
    if (/external|third.party|vendor/i.test(nameLower)) return 'external';

    return 'service';
  }

  /**
   * Extract component description from text context
   */
  private extractComponentDescription(text: string, componentName: string): string {
    // Look for description patterns near component name
    const patterns = [
      new RegExp(`${componentName}[:\\s-]+([^.\\n]+)`, 'i'),
      new RegExp(`${componentName}\\s+(?:is|provides|handles|manages|processes)\\s+([^.\\n]+)`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return '';
  }

  /**
   * Extract dependencies for a component
   */
  private extractDependencies(text: string, componentName: string): string[] {
    const dependencies: string[] = [];

    // Pattern: Component -> Dependency or Component depends on Dependency
    const depPatterns = [
      new RegExp(`${componentName}\\s*->\\s*(\\w+)`, 'gi'),
      new RegExp(`${componentName}\\s+(?:depends on|uses|calls|connects to)\\s+(\\w+)`, 'gi'),
      new RegExp(`${componentName}\\s*-->\\s*(\\w+)`, 'gi'),
    ];

    for (const pattern of depPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        dependencies.push(match[1].trim());
      }
    }

    return [...new Set(dependencies)];
  }

  /**
   * Parse integration definitions from text
   */
  private parseIntegrations(text: string): Integration[] {
    const integrations: Integration[] = [];

    // Arrow patterns: A -> B, A --> B, A => B
    const arrowPatterns = [
      /(\w+)\s*(?:->|-->|=>)\s*(\w+)/g,
      /(\w+)\s+(?:calls|invokes|sends to|connects to)\s+(\w+)/gi,
    ];

    for (const pattern of arrowPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        integrations.push({
          source: match[1].trim(),
          target: match[2].trim(),
          type: this.inferIntegrationType(match[0]),
        });
      }
    }

    // Mermaid relationship patterns
    const mermaidRelPattern = /Rel\((\w+),\s*(\w+),\s*"([^"]+)"/g;
    const mermaidMatches = text.matchAll(mermaidRelPattern);
    for (const match of mermaidMatches) {
      integrations.push({
        source: match[1],
        target: match[2],
        type: this.inferIntegrationTypeFromLabel(match[3]),
        protocol: match[3],
      });
    }

    return integrations;
  }

  /**
   * Infer integration type from context
   */
  private inferIntegrationType(context: string): Integration['type'] {
    const contextLower = context.toLowerCase();
    if (/async|event|queue|publish|subscribe/i.test(contextLower)) return 'async';
    if (/webhook|callback/i.test(contextLower)) return 'event';
    return 'sync';
  }

  /**
   * Infer integration type from Mermaid label
   */
  private inferIntegrationTypeFromLabel(label: string): Integration['type'] {
    const labelLower = label.toLowerCase();
    if (/async|event|queue|message/i.test(labelLower)) return 'async';
    if (/webhook|callback|notify/i.test(labelLower)) return 'event';
    return 'sync';
  }

  /**
   * Parse data flows from text
   */
  private parseDataFlows(text: string): DataFlow[] {
    const dataFlows: DataFlow[] = [];

    // Look for flow descriptions
    const flowPatterns = [
      /data\s+(?:flows?|moves?|goes?)\s+from\s+(\w+)\s+to\s+(\w+)/gi,
      /(\w+)\s+(?:sends?|passes?|transfers?)\s+(\w+)\s+to\s+(\w+)/gi,
    ];

    for (const pattern of flowPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match.length === 3) {
          dataFlows.push({
            name: `${match[1]} to ${match[2]}`,
            steps: [match[1], match[2]],
          });
        } else if (match.length === 4) {
          dataFlows.push({
            name: `${match[1]} ${match[2]}`,
            steps: [match[1], match[3]],
          });
        }
      }
    }

    // Mermaid sequence diagrams
    const sequencePattern = /(\w+)\s*->>?\+?\s*(\w+)\s*:\s*(.+)/g;
    const sequenceMatches = text.matchAll(sequencePattern);
    for (const match of sequenceMatches) {
      dataFlows.push({
        name: match[3].trim(),
        steps: [match[1], match[2]],
      });
    }

    return dataFlows;
  }

  /**
   * Extract entities from architecture
   */
  private extractEntitiesFromArchitecture(architecture: TechnicalArchitecture): ExtractedEntities {
    const actors = new Set<string>();
    const features = new Set<string>();
    const dataTypes = new Set<string>();
    const integrations = new Set<string>();
    const actions = new Set<string>();

    // From components
    if (architecture.components) {
      for (const comp of architecture.components) {
        features.add(comp.name.toLowerCase());

        // Component type as integration hint
        if (comp.type === 'external') {
          integrations.add(comp.name.toLowerCase());
        }
        if (comp.type === 'database') {
          dataTypes.add(comp.name.toLowerCase());
        }

        // Dependencies as integrations
        if (comp.dependencies) {
          comp.dependencies.forEach(d => integrations.add(d.toLowerCase()));
        }
      }
    }

    // From integrations
    if (architecture.integrations) {
      for (const integ of architecture.integrations) {
        integrations.add(integ.source.toLowerCase());
        integrations.add(integ.target.toLowerCase());

        // Actions from integration types
        if (integ.type === 'sync') actions.add('request');
        if (integ.type === 'async') actions.add('publish');
        if (integ.type === 'event') actions.add('trigger');
      }
    }

    // From data flows
    if (architecture.dataFlows) {
      for (const flow of architecture.dataFlows) {
        if (flow.name) {
          const words = flow.name.split(/\s+/);
          words.forEach(w => {
            if (w.length > 3) dataTypes.add(w.toLowerCase());
          });
        }
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
   * Format architecture as text
   */
  private formatArchitectureAsText(architecture: TechnicalArchitecture): string {
    let text = '# Technical Architecture\n\n';

    if (architecture.components && architecture.components.length > 0) {
      text += '## Components\n\n';
      for (const comp of architecture.components) {
        text += `### ${comp.name} (${comp.type})\n`;
        if (comp.description) text += `${comp.description}\n`;
        if (comp.dependencies && comp.dependencies.length > 0) {
          text += `Dependencies: ${comp.dependencies.join(', ')}\n`;
        }
        text += '\n';
      }
    }

    if (architecture.integrations && architecture.integrations.length > 0) {
      text += '## Integrations\n\n';
      for (const integ of architecture.integrations) {
        text += `- ${integ.source} -> ${integ.target} (${integ.type})`;
        if (integ.protocol) text += ` via ${integ.protocol}`;
        text += '\n';
      }
      text += '\n';
    }

    if (architecture.dataFlows && architecture.dataFlows.length > 0) {
      text += '## Data Flows\n\n';
      for (const flow of architecture.dataFlows) {
        text += `- ${flow.name}: ${flow.steps.join(' -> ')}\n`;
      }
    }

    return text;
  }

  /**
   * Detect architecture patterns
   */
  detectPatterns(architecture: TechnicalArchitecture): string[] {
    const patterns: string[] = [];

    if (!architecture.components) return patterns;

    const componentNames = architecture.components.map(c => c.name.toLowerCase());
    const componentTypes = architecture.components.map(c => c.type);

    // Microservices pattern
    const serviceCount = componentTypes.filter(t => t === 'service').length;
    if (serviceCount >= 3) {
      patterns.push('microservices');
    }

    // Gateway pattern
    if (componentNames.some(n => n.includes('gateway') || n.includes('proxy'))) {
      patterns.push('api-gateway');
    }

    // Event-driven
    if (componentTypes.includes('queue') ||
        architecture.integrations?.some(i => i.type === 'async' || i.type === 'event')) {
      patterns.push('event-driven');
    }

    // Layered
    const layers = ['ui', 'service', 'database'];
    const hasAllLayers = layers.every(l => componentTypes.includes(l as ArchitectureComponent['type']));
    if (hasAllLayers) {
      patterns.push('layered');
    }

    // Cache-aside
    if (componentTypes.includes('cache')) {
      patterns.push('cache-aside');
    }

    // CQRS hint
    if (componentNames.some(n => n.includes('command')) &&
        componentNames.some(n => n.includes('query'))) {
      patterns.push('cqrs');
    }

    return patterns;
  }
}
