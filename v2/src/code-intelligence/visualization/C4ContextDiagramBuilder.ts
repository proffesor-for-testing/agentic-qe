import type { ProjectMetadata, Container, ExternalSystem } from '../inference/types.js';

/**
 * Builds C4 Context diagrams in Mermaid syntax
 *
 * Context diagrams show the system in its environment with users and external systems.
 * This is the highest level of abstraction in C4 modeling.
 *
 * @example
 * ```typescript
 * const builder = new C4ContextDiagramBuilder();
 * const diagram = builder.build(metadata, externalSystems);
 * ```
 */
export class C4ContextDiagramBuilder {
  /**
   * Build a C4 Context diagram in Mermaid syntax
   *
   * @param metadata - Project metadata containing system information
   * @param externalSystems - Detected external systems and dependencies
   * @returns Mermaid C4Context diagram as string
   */
  build(metadata: ProjectMetadata, externalSystems: ExternalSystem[]): string {
    const systemName = this.formatSystemName(metadata.name);
    const description = metadata.description || 'Application system';

    const lines: string[] = [
      'C4Context',
      `  title System Context diagram for ${metadata.name}`,
      '',
      this.generatePersons(),
      `  System(${systemName}, "${metadata.name}", "${description}")`,
    ];

    // Add external systems
    if (externalSystems.length > 0) {
      lines.push('');
      lines.push(this.generateExternalSystems(externalSystems));
    }

    // Add relationships
    lines.push('');
    lines.push(this.generateRelationships(metadata, externalSystems));

    return lines.filter(line => line !== undefined && line !== '').join('\n');
  }

  /**
   * Sanitize system name for Mermaid syntax
   * Removes special characters and replaces spaces with underscores
   *
   * @param name - Original system name
   * @returns Sanitized name safe for Mermaid
   */
  private formatSystemName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9_\s-]/g, '')
      .replace(/\s+/g, '_')
      .replace(/-+/g, '_')
      .toLowerCase();
  }

  /**
   * Generate default user/person actors
   *
   * @returns Mermaid Person definitions
   */
  private generatePersons(): string {
    const lines: string[] = [
      '  Person(user, "User", "A user of the system")',
      '  Person(developer, "Developer", "A developer maintaining the system")',
    ];

    return lines.join('\n');
  }

  /**
   * Generate external system definitions
   *
   * @param systems - Detected external systems
   * @returns Mermaid System_Ext definitions
   */
  private generateExternalSystems(systems: ExternalSystem[]): string {
    const lines: string[] = [];
    const seen = new Set<string>();

    for (const system of systems) {
      const systemId = this.formatSystemName(system.name);

      // Avoid duplicates
      if (seen.has(systemId)) {
        continue;
      }
      seen.add(systemId);

      const description = this.getSystemDescription(system);
      lines.push(`  System_Ext(${systemId}, "${system.name}", "${description}")`);
    }

    return lines.join('\n');
  }

  /**
   * Get description for external system based on type
   *
   * @param system - External system
   * @returns Human-readable description
   */
  private getSystemDescription(system: ExternalSystem): string {
    const typeDescriptions: Record<string, string> = {
      database: 'Database system',
      api: 'External API service',
      npm: 'NPM package dependency',
      service: 'External service',
      cloud: 'Cloud service',
      messageQueue: 'Message queue system',
      cache: 'Caching system',
      storage: 'Storage system',
    };

    return typeDescriptions[system.type] || 'External system';
  }

  /**
   * Generate relationships between system and external systems
   *
   * @param metadata - Project metadata
   * @param externals - External systems
   * @returns Mermaid Rel definitions
   */
  private generateRelationships(metadata: ProjectMetadata, externals: ExternalSystem[]): string {
    const lines: string[] = [];
    const systemName = this.formatSystemName(metadata.name);

    // User -> System
    lines.push(`  Rel(user, ${systemName}, "Uses")`);
    lines.push(`  Rel(developer, ${systemName}, "Develops and maintains")`);

    // System -> External Systems
    for (const external of externals) {
      const externalId = this.formatSystemName(external.name);
      const relationship = this.getRelationshipLabel(external);
      lines.push(`  Rel(${systemName}, ${externalId}, "${relationship}")`);
    }

    return lines.join('\n');
  }

  /**
   * Get relationship label based on external system type
   *
   * @param system - External system
   * @returns Relationship description
   */
  private getRelationshipLabel(system: ExternalSystem): string {
    const labels: Record<string, string> = {
      database: 'Reads from and writes to',
      api: 'Makes API calls to',
      npm: 'Uses',
      service: 'Integrates with',
      cloud: 'Deploys to',
      messageQueue: 'Publishes to and consumes from',
      cache: 'Reads from and writes to',
      storage: 'Stores files in',
    };

    return labels[system.type] || 'Depends on';
  }
}
