import type { Component, ComponentRelationship } from '../inference/types.js';

/**
 * Builds C4 Component diagrams in Mermaid syntax
 *
 * Component diagrams show the internal structure of a container, breaking it down
 * into components and showing their relationships. Components are typically classes,
 * modules, or services within a container.
 *
 * @example
 * ```typescript
 * const builder = new C4ComponentDiagramBuilder();
 * const diagram = builder.build('API Application', components, relationships);
 * ```
 */
export class C4ComponentDiagramBuilder {
  /**
   * Build a C4 Component diagram in Mermaid syntax
   *
   * @param containerName - Name of the container being detailed
   * @param components - List of components within the container
   * @param relationships - Relationships between components
   * @returns Mermaid C4Component diagram as string
   */
  build(
    containerName: string,
    components: Component[],
    relationships: ComponentRelationship[]
  ): string {
    const lines: string[] = [
      'C4Component',
      `  title Component diagram for ${containerName}`,
      '',
    ];

    if (components.length === 0) {
      lines.push('  Component(empty, "No Components", "N/A", "No components detected")');
      return lines.join('\n');
    }

    // Group components by boundary if they have one
    const grouped = this.groupByBoundary(components);

    // Add components with boundaries
    for (const [boundary, boundaryComponents] of grouped.entries()) {
      if (boundary) {
        const boundaryId = this.sanitizeName(boundary);
        lines.push(`  Container_Boundary(${boundaryId}, "${boundary}") {`);

        for (const component of boundaryComponents) {
          lines.push('  ' + this.formatComponent(component));
        }

        lines.push('  }');
      } else {
        // Components without boundary
        for (const component of boundaryComponents) {
          lines.push(this.formatComponent(component));
        }
      }
    }

    // Add relationships
    if (relationships.length > 0) {
      lines.push('');
      lines.push(this.generateComponentRelationships(relationships));
    }

    return lines.filter(line => line !== undefined && line !== '').join('\n');
  }

  /**
   * Group components by their boundary
   *
   * @param components - List of components
   * @returns Map of boundary name to components
   */
  private groupByBoundary(components: Component[]): Map<string, Component[]> {
    const grouped = new Map<string, Component[]>();

    for (const component of components) {
      const boundary = component.boundary || '';
      if (!grouped.has(boundary)) {
        grouped.set(boundary, []);
      }
      grouped.get(boundary)!.push(component);
    }

    return grouped;
  }

  /**
   * Format a component definition
   *
   * @param component - Component to format
   * @returns Mermaid Component definition
   */
  private formatComponent(component: Component): string {
    const id = this.sanitizeName(component.name);
    const technology = this.inferTechnology(component);
    const description = this.getComponentDescription(component);

    return `  Component(${id}, "${component.name}", "${technology}", "${description}")`;
  }

  /**
   * Infer technology/type for component
   *
   * @param component - Component to analyze
   * @returns Technology description
   */
  private inferTechnology(component: Component): string {
    const name = component.name.toLowerCase();

    // Controllers
    if (name.includes('controller') || name.endsWith('ctrl')) {
      return 'MVC Controller';
    }

    // Services
    if (name.includes('service') || name.endsWith('svc')) {
      return 'Service Component';
    }

    // Repositories/DAOs
    if (name.includes('repository') || name.includes('dao') || name.includes('store')) {
      return 'Data Access Object';
    }

    // Middleware
    if (name.includes('middleware') || name.includes('guard') || name.includes('interceptor')) {
      return 'Middleware';
    }

    // Validators
    if (name.includes('validator') || name.includes('validation')) {
      return 'Validator';
    }

    // Utilities
    if (name.includes('util') || name.includes('helper') || name.includes('helper')) {
      return 'Utility Component';
    }

    // Security
    if (name.includes('auth') || name.includes('security') || name.includes('jwt')) {
      return 'Security Component';
    }

    // Models/Entities
    if (name.includes('model') || name.includes('entity') || name.includes('schema')) {
      return 'Data Model';
    }

    // Handlers
    if (name.includes('handler') || name.includes('processor')) {
      return 'Event Handler';
    }

    // Adapters
    if (name.includes('adapter') || name.includes('client')) {
      return 'External Adapter';
    }

    // Default based on file extension or generic
    if (component.type) {
      const typeMap: Record<string, string> = {
        class: 'Class Component',
        interface: 'Interface',
        function: 'Function Component',
        module: 'Module',
      };
      return typeMap[component.type] || 'Component';
    }

    return 'Component';
  }

  /**
   * Get description for component
   *
   * @param component - Component to describe
   * @returns Description text
   */
  private getComponentDescription(component: Component): string {
    const name = component.name.toLowerCase();

    // Controllers
    if (name.includes('controller')) {
      return 'Handles HTTP requests and responses';
    }

    // Services
    if (name.includes('service')) {
      return 'Implements business logic';
    }

    // Repositories
    if (name.includes('repository') || name.includes('dao')) {
      return 'Manages data persistence';
    }

    // Authentication
    if (name.includes('auth')) {
      return 'Provides authentication and authorization';
    }

    // Validation
    if (name.includes('validator')) {
      return 'Validates input data';
    }

    // Middleware
    if (name.includes('middleware')) {
      return 'Processes requests in pipeline';
    }

    // Utilities
    if (name.includes('util') || name.includes('helper')) {
      return 'Provides utility functions';
    }

    // Handlers
    if (name.includes('handler')) {
      return 'Handles events and messages';
    }

    // Adapters
    if (name.includes('adapter')) {
      return 'Adapts external interfaces';
    }

    // Models
    if (name.includes('model') || name.includes('entity')) {
      return 'Represents data structure';
    }

    // Default description
    if (component.responsibilities && component.responsibilities.length > 0) {
      return component.responsibilities[0];
    }

    return 'Application component';
  }

  /**
   * Generate relationships between components
   *
   * @param relationships - List of component relationships
   * @returns Mermaid Rel definitions
   */
  private generateComponentRelationships(relationships: ComponentRelationship[]): string {
    const lines: string[] = [];
    const seen = new Set<string>();

    for (const rel of relationships) {
      const fromId = this.sanitizeName(rel.sourceId);
      const toId = this.sanitizeName(rel.targetId);

      // Avoid duplicate relationships
      const relKey = `${fromId}-${toId}-${rel.type}`;
      if (seen.has(relKey)) {
        continue;
      }
      seen.add(relKey);

      const description = this.getRelationshipDescription(rel);
      lines.push(`  Rel(${fromId}, ${toId}, "${description}")`);
    }

    return lines.join('\n');
  }

  /**
   * Get description for relationship
   *
   * @param relationship - Component relationship
   * @returns Relationship description
   */
  private getRelationshipDescription(relationship: ComponentRelationship): string {
    const typeDescriptions: Record<string, string> = {
      depends_on: 'Depends on',
      uses: 'Uses',
      calls: 'Calls',
      inherits: 'Inherits from',
      implements: 'Implements',
      contains: 'Contains',
      imports: 'Imports',
      injects: 'Injects',
      configures: 'Configures',
      validates: 'Validates with',
      handles: 'Handles via',
      delegates: 'Delegates to',
    };

    return typeDescriptions[relationship.type] || 'Uses';
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
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
      .toLowerCase();
  }
}
