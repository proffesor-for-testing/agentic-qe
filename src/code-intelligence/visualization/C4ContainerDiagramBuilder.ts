import type { ProjectMetadata, Container, ExternalSystem } from '../inference/types.js';

/**
 * Builds C4 Container diagrams in Mermaid syntax
 *
 * Container diagrams show the high-level technology choices and how containers
 * communicate with each other. Containers represent applications or data stores.
 *
 * @example
 * ```typescript
 * const builder = new C4ContainerDiagramBuilder();
 * const diagram = builder.build(metadata, externalSystems);
 * ```
 */
export class C4ContainerDiagramBuilder {
  /**
   * Build a C4 Container diagram in Mermaid syntax
   *
   * @param metadata - Project metadata containing container information
   * @param externalSystems - Detected external systems
   * @returns Mermaid C4Container diagram as string
   */
  build(metadata: ProjectMetadata, externalSystems: ExternalSystem[]): string {
    const lines: string[] = [
      'C4Container',
      `  title Container diagram for ${metadata.name}`,
      '',
    ];

    // Add containers
    if (metadata.containers.length > 0) {
      for (const container of metadata.containers) {
        if (this.isDatabase(container)) {
          lines.push(this.formatContainerDb(container));
        } else {
          lines.push(this.formatContainer(container));
        }
      }
      lines.push('');
    }

    // Add external systems as containers
    if (externalSystems.length > 0) {
      for (const external of externalSystems) {
        if (external.type === 'database') {
          lines.push(this.formatExternalDb(external));
        } else if (this.isRelevantExternal(external)) {
          lines.push(this.formatExternalContainer(external));
        }
      }
      lines.push('');
    }

    // Add relationships
    lines.push(this.generateContainerRelationships(metadata.containers));

    // Add relationships to external systems
    if (externalSystems.length > 0) {
      lines.push('');
      lines.push(this.generateExternalRelationships(metadata.containers, externalSystems));
    }

    return lines.filter(line => line !== undefined && line !== '').join('\n');
  }

  /**
   * Format a container definition
   *
   * @param container - Container to format
   * @returns Mermaid Container definition
   */
  private formatContainer(container: Container): string {
    const id = this.sanitizeName(container.name);
    const technology = this.inferTechnology(container);
    const description = this.getContainerDescription(container);

    return `  Container(${id}, "${container.name}", "${technology}", "${description}")`;
  }

  /**
   * Format a database container definition
   *
   * @param container - Database container to format
   * @returns Mermaid ContainerDb definition
   */
  private formatContainerDb(container: Container): string {
    const id = this.sanitizeName(container.name);
    const technology = this.inferDatabaseTechnology(container);
    const description = this.getDatabaseDescription(container);

    return `  ContainerDb(${id}, "${container.name}", "${technology}", "${description}")`;
  }

  /**
   * Format external database as ContainerDb
   *
   * @param external - External database system
   * @returns Mermaid ContainerDb definition
   */
  private formatExternalDb(external: ExternalSystem): string {
    const id = this.sanitizeName(external.name);
    const technology = this.getExternalTechnology(external);
    const description = external.description || 'External database system';

    return `  ContainerDb(${id}, "${external.name}", "${technology}", "${description}")`;
  }

  /**
   * Format external system as Container
   *
   * @param external - External system
   * @returns Mermaid Container definition
   */
  private formatExternalContainer(external: ExternalSystem): string {
    const id = this.sanitizeName(external.name);
    const technology = this.getExternalTechnology(external);
    const description = external.description || 'External system';

    return `  Container(${id}, "${external.name}", "${technology}", "${description}")`;
  }

  /**
   * Check if container is a database
   *
   * @param container - Container to check
   * @returns True if container is a database
   */
  private isDatabase(container: Container): boolean {
    const dbKeywords = ['database', 'db', 'postgres', 'mysql', 'mongo', 'redis', 'cache'];
    const name = container.name.toLowerCase();
    return dbKeywords.some(keyword => name.includes(keyword));
  }

  /**
   * Check if external system should be shown in container diagram
   *
   * @param external - External system to check
   * @returns True if relevant for container diagram
   */
  private isRelevantExternal(external: ExternalSystem): boolean {
    const relevantTypes = ['database', 'api', 'service', 'messageQueue', 'cache', 'storage'];
    return relevantTypes.includes(external.type);
  }

  /**
   * Infer technology stack for container
   *
   * @param container - Container to analyze
   * @returns Technology description
   */
  private inferTechnology(container: Container): string {
    const name = container.name.toLowerCase();

    if (name.includes('api') || name.includes('backend')) {
      return 'Node.js, TypeScript';
    }
    if (name.includes('frontend') || name.includes('ui') || name.includes('web')) {
      return 'React, TypeScript';
    }
    if (name.includes('service') || name.includes('worker')) {
      return 'Node.js';
    }
    if (name.includes('gateway') || name.includes('proxy')) {
      return 'NGINX, Node.js';
    }

    return 'Application';
  }

  /**
   * Infer database technology
   *
   * @param container - Database container
   * @returns Database technology
   */
  private inferDatabaseTechnology(container: Container): string {
    const name = container.name.toLowerCase();

    if (name.includes('postgres') || name.includes('pg')) return 'PostgreSQL';
    if (name.includes('mysql')) return 'MySQL';
    if (name.includes('mongo')) return 'MongoDB';
    if (name.includes('redis')) return 'Redis';
    if (name.includes('elastic')) return 'Elasticsearch';
    if (name.includes('dynamodb')) return 'DynamoDB';

    return 'Database';
  }

  /**
   * Get external system technology
   *
   * @param external - External system
   * @returns Technology description
   */
  private getExternalTechnology(external: ExternalSystem): string {
    const name = external.name.toLowerCase();

    if (name.includes('postgres')) return 'PostgreSQL';
    if (name.includes('mysql')) return 'MySQL';
    if (name.includes('mongo')) return 'MongoDB';
    if (name.includes('redis')) return 'Redis';
    if (name.includes('rabbitmq')) return 'RabbitMQ';
    if (name.includes('kafka')) return 'Apache Kafka';
    if (name.includes('aws')) return 'AWS Service';
    if (name.includes('gcp')) return 'GCP Service';
    if (name.includes('azure')) return 'Azure Service';

    return 'External Service';
  }

  /**
   * Get container description
   *
   * @param container - Container to describe
   * @returns Description text
   */
  private getContainerDescription(container: Container): string {
    const name = container.name.toLowerCase();

    if (name.includes('api')) return 'Provides application functionality via REST API';
    if (name.includes('frontend')) return 'Delivers web interface to users';
    if (name.includes('service')) return 'Handles business logic and processing';
    if (name.includes('worker')) return 'Processes background tasks';
    if (name.includes('gateway')) return 'Routes and manages API traffic';

    return 'Application component';
  }

  /**
   * Get database description
   *
   * @param container - Database container
   * @returns Description text
   */
  private getDatabaseDescription(container: Container): string {
    return 'Stores application data and state';
  }

  /**
   * Generate relationships between containers
   *
   * @param containers - List of containers
   * @returns Mermaid Rel definitions
   */
  private generateContainerRelationships(containers: Container[]): string {
    const lines: string[] = [];
    const relationships = new Set<string>();

    for (const container of containers) {
      const fromId = this.sanitizeName(container.name);

      // Find likely relationships based on naming patterns
      for (const other of containers) {
        if (container === other) continue;

        const toId = this.sanitizeName(other.name);
        const relationship = this.inferRelationship(container, other);

        if (relationship) {
          const relKey = `${fromId}-${toId}`;
          if (!relationships.has(relKey)) {
            relationships.add(relKey);
            lines.push(`  Rel(${fromId}, ${toId}, "${relationship}")`);
          }
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate relationships to external systems
   *
   * @param containers - Internal containers
   * @param externals - External systems
   * @returns Mermaid Rel definitions
   */
  private generateExternalRelationships(containers: Container[], externals: ExternalSystem[]): string {
    const lines: string[] = [];

    for (const container of containers) {
      const fromId = this.sanitizeName(container.name);

      for (const external of externals) {
        if (!this.isRelevantExternal(external) && external.type !== 'database') {
          continue;
        }

        const toId = this.sanitizeName(external.name);
        const relationship = this.getExternalRelationship(external);
        lines.push(`  Rel(${fromId}, ${toId}, "${relationship}")`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Infer relationship between two containers
   *
   * @param from - Source container
   * @param to - Target container
   * @returns Relationship description or null
   */
  private inferRelationship(from: Container, to: Container): string | null {
    const fromName = from.name.toLowerCase();
    const toName = to.name.toLowerCase();

    // Frontend -> Backend/API
    if (fromName.includes('frontend') && (toName.includes('api') || toName.includes('backend'))) {
      return 'Makes API calls to';
    }

    // API/Backend -> Database
    if ((fromName.includes('api') || fromName.includes('backend')) && this.isDatabase(to)) {
      return 'Reads from and writes to';
    }

    // Service -> Database
    if (fromName.includes('service') && this.isDatabase(to)) {
      return 'Reads from and writes to';
    }

    // Gateway -> API/Service
    if (fromName.includes('gateway') && (toName.includes('api') || toName.includes('service'))) {
      return 'Routes requests to';
    }

    return null;
  }

  /**
   * Get relationship description for external system
   *
   * @param external - External system
   * @returns Relationship description
   */
  private getExternalRelationship(external: ExternalSystem): string {
    const typeRelationships: Record<string, string> = {
      database: 'Reads from and writes to',
      api: 'Makes API calls to',
      service: 'Sends requests to',
      messageQueue: 'Publishes to and consumes from',
      cache: 'Reads from and writes to',
      storage: 'Stores files in',
    };

    return typeRelationships[external.type] || 'Communicates with';
  }

  /**
   * Sanitize name for Mermaid syntax
   *
   * @param name - Original name
   * @returns Sanitized name
   */
  private sanitizeName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9_\s-]/g, '')
      .replace(/\s+/g, '_')
      .replace(/-+/g, '_')
      .toLowerCase();
  }
}
