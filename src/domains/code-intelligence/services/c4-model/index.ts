/**
 * Agentic QE v3 - C4 Model Service
 * Generates C4 architecture diagrams with Mermaid syntax output
 *
 * Features:
 * - Context, Container, and Component diagram generation
 * - Mermaid C4 syntax output
 * - Semantic search via embeddings
 * - Memory-backed storage for diagram retrieval
 * - Integration with graph-boundaries analyzer
 */

import { Result, ok, err, Severity, Priority } from '@shared/types';
import type { MemoryBackend, StoreOptions } from '@kernel/interfaces';
import { NomicEmbedder, type NomicEmbedderConfig } from '@shared/embeddings';
import type {
  C4ContextDiagram,
  C4ContainerDiagram,
  C4ComponentDiagram,
  C4Person,
  C4System,
  C4Container,
  C4Component,
  C4Relationship,
  C4DiagramMetadata,
  C4ModelServiceConfig,
  BuildContextRequest,
  BuildContainerRequest,
  BuildComponentRequest,
  DiagramResult,
  StoredDiagram,
  DiagramSearchResult,
  C4DiagramOptions,
  ContainerType,
  ComponentType,
  SystemType,
  ArchitectureAnalysis,
  ArchitectureRecommendation,
  CouplingAnalysis,
} from './types';

// Re-export types
export * from './types';

// ============================================================================
// Constants
// ============================================================================

const GENERATOR_VERSION = '3.0.0';
const DEFAULT_MEMORY_NAMESPACE = 'code-intelligence:c4';

// ============================================================================
// C4 Model Service Interface
// ============================================================================

/**
 * Interface for C4 Model Service
 */
export interface IC4ModelService {
  /** Build a C4 Context diagram */
  buildContext(request: BuildContextRequest): Promise<Result<DiagramResult<C4ContextDiagram>, Error>>;

  /** Build a C4 Container diagram */
  buildContainer(request: BuildContainerRequest): Promise<Result<DiagramResult<C4ContainerDiagram>, Error>>;

  /** Build a C4 Component diagram */
  buildComponent(request: BuildComponentRequest): Promise<Result<DiagramResult<C4ComponentDiagram>, Error>>;

  /** Retrieve a stored diagram by key */
  getDiagram(key: string): Promise<Result<StoredDiagram | undefined, Error>>;

  /** Search diagrams by semantic similarity */
  searchDiagrams(query: string, limit?: number): Promise<Result<DiagramSearchResult[], Error>>;

  /** List all stored diagrams */
  listDiagrams(): Promise<Result<DiagramSearchResult[], Error>>;

  /** Delete a stored diagram */
  deleteDiagram(key: string): Promise<Result<boolean, Error>>;

  /** Analyze architecture from component diagram */
  analyzeArchitecture(diagram: C4ComponentDiagram): Promise<Result<ArchitectureAnalysis, Error>>;
}

// ============================================================================
// C4 Model Service Implementation
// ============================================================================

/**
 * C4 Model Service for generating architecture diagrams
 */
export class C4ModelService implements IC4ModelService {
  private readonly embedder: NomicEmbedder;
  private readonly config: Required<C4ModelServiceConfig>;
  private readonly namespace: string;

  constructor(
    private readonly memory: MemoryBackend,
    config: C4ModelServiceConfig = {},
    embedderConfig?: NomicEmbedderConfig
  ) {
    this.embedder = new NomicEmbedder(embedderConfig);
    this.namespace = config.memoryNamespace ?? DEFAULT_MEMORY_NAMESPACE;
    this.config = {
      enableEmbeddings: config.enableEmbeddings ?? true,
      memoryNamespace: this.namespace,
      defaultOptions: config.defaultOptions ?? {
        includePersons: true,
        includeExternalSystems: true,
        showRelationshipLabels: true,
        showTechnology: true,
        generateEmbeddings: true,
      },
    };
  }

  /**
   * Build a C4 Context diagram
   */
  async buildContext(
    request: BuildContextRequest
  ): Promise<Result<DiagramResult<C4ContextDiagram>, Error>> {
    try {
      const startTime = Date.now();
      const options = { ...this.config.defaultOptions, ...request.options };

      // Create the main system
      const mainSystem: C4System = {
        id: this.sanitizeName(request.systemName),
        name: request.systemName,
        description: request.systemDescription,
        technology: request.technology,
        elementType: 'system',
        external: false,
        systemType: request.systemType ?? 'web_application',
      };

      // Create default persons if not provided
      const persons: C4Person[] = options.includePersons
        ? (request.persons ?? this.getDefaultPersons()).map((p) => ({
            ...p,
            id: this.sanitizeName(p.name),
            elementType: 'person' as const,
          }))
        : [];

      // Create external systems
      const externalSystems: C4System[] = options.includeExternalSystems
        ? (request.externalSystems ?? []).map((es) => ({
            id: this.sanitizeName(es.name),
            name: es.name,
            description: es.description ?? this.getSystemDescription(es.type),
            technology: es.technology,
            elementType: 'system' as const,
            external: true,
            systemType: es.type,
          }))
        : [];

      // Generate relationships
      const relationships = this.generateContextRelationships(
        mainSystem,
        persons,
        externalSystems,
        request.externalSystems ?? []
      );

      // Create metadata
      const metadata: C4DiagramMetadata = {
        generatedAt: new Date(),
        generatorVersion: GENERATOR_VERSION,
        durationMs: Date.now() - startTime,
      };

      // Generate embedding if enabled
      if (options.generateEmbeddings && this.config.enableEmbeddings) {
        const embeddingText = this.getContextEmbeddingText(request, mainSystem, externalSystems);
        try {
          metadata.embedding = await this.embedder.embed(embeddingText);
        } catch (embedError) {
          // Non-fatal: continue without embedding
          console.warn('[C4ModelService] Failed to generate embedding:', embedError);
        }
      }

      // Build diagram
      const diagram: C4ContextDiagram = {
        title: `System Context diagram for ${request.systemName}`,
        system: mainSystem,
        persons,
        externalSystems,
        relationships,
        metadata,
      };

      // Generate Mermaid syntax
      const mermaid = this.generateContextMermaid(diagram, options);

      // Store in memory
      const storageKey = `context:${mainSystem.id}`;
      await this.storeDiagram(storageKey, 'context', diagram, mermaid, metadata.embedding);

      return ok({
        diagram,
        mermaid,
        storageKey,
      });
    } catch (error) {
      return err(
        error instanceof Error ? error : new Error(`Failed to build context diagram: ${error}`)
      );
    }
  }

  /**
   * Build a C4 Container diagram
   */
  async buildContainer(
    request: BuildContainerRequest
  ): Promise<Result<DiagramResult<C4ContainerDiagram>, Error>> {
    try {
      const startTime = Date.now();
      const options = { ...this.config.defaultOptions, ...request.options };

      // Create containers
      const containers: C4Container[] = request.containers.map((c) => ({
        id: this.sanitizeName(c.name),
        name: c.name,
        description: c.description ?? this.getContainerDescription(c.type, c.name),
        technology: c.technology ?? this.inferContainerTechnology(c.type, c.name),
        elementType: 'container' as const,
        containerType: c.type,
        external: c.external,
        port: c.port,
      }));

      // Create external systems
      const externalSystems: C4System[] = options.includeExternalSystems
        ? (request.externalSystems ?? []).map((es) => ({
            id: this.sanitizeName(es.name),
            name: es.name,
            description: es.description ?? this.getSystemDescription(es.type),
            technology: es.technology,
            elementType: 'system' as const,
            external: true,
            systemType: es.type,
          }))
        : [];

      // Generate relationships from dependencies
      const relationships = this.generateContainerRelationships(
        containers,
        externalSystems,
        request.dependencies ?? []
      );

      // Create metadata
      const metadata: C4DiagramMetadata = {
        generatedAt: new Date(),
        generatorVersion: GENERATOR_VERSION,
        durationMs: Date.now() - startTime,
      };

      // Generate embedding if enabled
      if (options.generateEmbeddings && this.config.enableEmbeddings) {
        const embeddingText = this.getContainerEmbeddingText(request, containers, externalSystems);
        try {
          metadata.embedding = await this.embedder.embed(embeddingText);
        } catch (embedError) {
          console.warn('[C4ModelService] Failed to generate embedding:', embedError);
        }
      }

      // Build diagram
      const diagram: C4ContainerDiagram = {
        title: `Container diagram for ${request.systemName}`,
        systemName: request.systemName,
        containers,
        externalSystems,
        relationships,
        metadata,
      };

      // Generate Mermaid syntax
      const mermaid = this.generateContainerMermaid(diagram, options);

      // Store in memory
      const storageKey = `container:${this.sanitizeName(request.systemName)}`;
      await this.storeDiagram(storageKey, 'container', diagram, mermaid, metadata.embedding);

      return ok({
        diagram,
        mermaid,
        storageKey,
      });
    } catch (error) {
      return err(
        error instanceof Error ? error : new Error(`Failed to build container diagram: ${error}`)
      );
    }
  }

  /**
   * Build a C4 Component diagram
   */
  async buildComponent(
    request: BuildComponentRequest
  ): Promise<Result<DiagramResult<C4ComponentDiagram>, Error>> {
    try {
      const startTime = Date.now();
      const options = { ...this.config.defaultOptions, ...request.options };
      const containerId = this.sanitizeName(request.containerName);
      const warnings: string[] = [];

      // Create components
      const components: C4Component[] = request.components.map((c) => ({
        id: this.sanitizeName(c.name),
        name: c.name,
        description: c.description ?? this.getComponentDescription(c.type, c.name),
        technology: c.technology ?? this.inferComponentTechnology(c.type),
        elementType: 'component' as const,
        componentType: c.type,
        containerId,
        boundary: c.boundary,
        files: c.files,
        responsibilities: c.responsibilities,
      }));

      // Create boundaries
      const boundaries = (request.boundaries ?? []).map((b) => ({
        id: this.sanitizeName(b.name),
        name: b.name,
        componentIds: b.components.map((c) => this.sanitizeName(c)),
      }));

      // Generate relationships
      const relationships = this.generateComponentRelationships(
        components,
        request.relationships ?? []
      );

      // Validate relationships reference existing components
      const componentIds = new Set(components.map((c) => c.id));
      for (const rel of relationships) {
        if (!componentIds.has(rel.sourceId)) {
          warnings.push(`Relationship source '${rel.sourceId}' not found in components`);
        }
        if (!componentIds.has(rel.targetId)) {
          warnings.push(`Relationship target '${rel.targetId}' not found in components`);
        }
      }

      // Create metadata
      const metadata: C4DiagramMetadata = {
        generatedAt: new Date(),
        generatorVersion: GENERATOR_VERSION,
        durationMs: Date.now() - startTime,
        sourceFiles: components.flatMap((c) => c.files ?? []),
      };

      // Generate embedding if enabled
      if (options.generateEmbeddings && this.config.enableEmbeddings) {
        const embeddingText = this.getComponentEmbeddingText(request, components);
        try {
          metadata.embedding = await this.embedder.embed(embeddingText);
        } catch (embedError) {
          console.warn('[C4ModelService] Failed to generate embedding:', embedError);
        }
      }

      // Build diagram
      const diagram: C4ComponentDiagram = {
        title: `Component diagram for ${request.containerName}`,
        containerName: request.containerName,
        containerId,
        components,
        boundaries: boundaries.length > 0 ? boundaries : undefined,
        relationships,
        metadata,
      };

      // Generate Mermaid syntax
      const mermaid = this.generateComponentMermaid(diagram, options);

      // Store in memory
      const storageKey = `component:${containerId}`;
      await this.storeDiagram(storageKey, 'component', diagram, mermaid, metadata.embedding);

      return ok({
        diagram,
        mermaid,
        storageKey,
        warnings: warnings.length > 0 ? warnings : undefined,
      });
    } catch (error) {
      return err(
        error instanceof Error ? error : new Error(`Failed to build component diagram: ${error}`)
      );
    }
  }

  /**
   * Retrieve a stored diagram
   */
  async getDiagram(key: string): Promise<Result<StoredDiagram | undefined, Error>> {
    try {
      const fullKey = this.getStorageKey(key);
      const stored = await this.memory.get<StoredDiagram>(fullKey);
      return ok(stored);
    } catch (error) {
      return err(
        error instanceof Error ? error : new Error(`Failed to retrieve diagram: ${error}`)
      );
    }
  }

  /**
   * Search diagrams by semantic similarity
   */
  async searchDiagrams(
    query: string,
    limit: number = 10
  ): Promise<Result<DiagramSearchResult[], Error>> {
    try {
      // Generate query embedding
      const queryEmbedding = await this.embedder.embed(query);

      // Search vectors
      const searchResults = await this.memory.vectorSearch(queryEmbedding, limit);

      // Filter to C4 diagrams and map results
      const results: DiagramSearchResult[] = [];
      for (const result of searchResults) {
        if (result.key.startsWith(this.namespace)) {
          const stored = await this.memory.get<StoredDiagram>(result.key);
          if (stored) {
            results.push({
              key: result.key.replace(`${this.namespace}:`, ''),
              score: result.score,
              type: stored.type,
              title: this.getDiagramTitle(stored),
              preview: this.getDiagramPreview(stored),
            });
          }
        }
      }

      return ok(results);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(`Failed to search diagrams: ${error}`));
    }
  }

  /**
   * List all stored diagrams
   */
  async listDiagrams(): Promise<Result<DiagramSearchResult[], Error>> {
    try {
      const keys = await this.memory.search(`${this.namespace}:*`);
      const results: DiagramSearchResult[] = [];

      for (const key of keys) {
        const stored = await this.memory.get<StoredDiagram>(key);
        if (stored) {
          results.push({
            key: key.replace(`${this.namespace}:`, ''),
            score: 1.0,
            type: stored.type,
            title: this.getDiagramTitle(stored),
            preview: this.getDiagramPreview(stored),
          });
        }
      }

      return ok(results);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(`Failed to list diagrams: ${error}`));
    }
  }

  /**
   * Delete a stored diagram
   */
  async deleteDiagram(key: string): Promise<Result<boolean, Error>> {
    try {
      const fullKey = this.getStorageKey(key);
      const deleted = await this.memory.delete(fullKey);
      return ok(deleted);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(`Failed to delete diagram: ${error}`));
    }
  }

  /**
   * Analyze architecture from component diagram
   */
  async analyzeArchitecture(
    diagram: C4ComponentDiagram
  ): Promise<Result<ArchitectureAnalysis, Error>> {
    try {
      const components = diagram.components;
      const relationships = diagram.relationships;

      // Detect architecture pattern
      const pattern = this.detectArchitecturePattern(components);

      // Detect layers
      const layers = this.detectLayers(components);

      // Analyze coupling
      const coupling = this.analyzeCoupling(components, relationships);

      // Generate recommendations
      const recommendations = this.generateRecommendations(components, relationships, coupling);

      // Calculate confidence
      const confidence = this.calculatePatternConfidence(pattern, layers, components);

      return ok({
        pattern,
        confidence,
        layers,
        coupling,
        recommendations,
      });
    } catch (error) {
      return err(
        error instanceof Error ? error : new Error(`Failed to analyze architecture: ${error}`)
      );
    }
  }

  // ============================================================================
  // Private Methods - Mermaid Generation
  // ============================================================================

  /**
   * Generate Mermaid syntax for Context diagram
   */
  private generateContextMermaid(diagram: C4ContextDiagram, options: C4DiagramOptions): string {
    const lines: string[] = ['C4Context', `  title ${diagram.title}`, ''];

    // Add persons
    if (options.includePersons && diagram.persons.length > 0) {
      for (const person of diagram.persons) {
        lines.push(`  Person(${person.id}, "${person.name}", "${person.description}")`);
      }
      lines.push('');
    }

    // Add main system
    const tech = options.showTechnology && diagram.system.technology
      ? `, "${diagram.system.technology}"`
      : '';
    lines.push(
      `  System(${diagram.system.id}, "${diagram.system.name}", "${diagram.system.description}"${tech})`
    );
    lines.push('');

    // Add external systems
    if (options.includeExternalSystems && diagram.externalSystems.length > 0) {
      for (const system of diagram.externalSystems) {
        const sysTech = options.showTechnology && system.technology
          ? `, "${system.technology}"`
          : '';
        lines.push(
          `  System_Ext(${system.id}, "${system.name}", "${system.description}"${sysTech})`
        );
      }
      lines.push('');
    }

    // Add relationships
    for (const rel of diagram.relationships) {
      const desc = options.showRelationshipLabels ? `"${rel.description}"` : '""';
      const tech = options.showTechnology && rel.technology ? `, "${rel.technology}"` : '';
      lines.push(`  Rel(${rel.sourceId}, ${rel.targetId}, ${desc}${tech})`);
    }

    return lines.filter((line) => line !== undefined).join('\n');
  }

  /**
   * Generate Mermaid syntax for Container diagram
   */
  private generateContainerMermaid(
    diagram: C4ContainerDiagram,
    options: C4DiagramOptions
  ): string {
    const lines: string[] = ['C4Container', `  title ${diagram.title}`, ''];

    // Add containers
    for (const container of diagram.containers) {
      const tech = options.showTechnology && container.technology
        ? `"${container.technology}"`
        : '""';
      if (this.isDatabase(container)) {
        lines.push(
          `  ContainerDb(${container.id}, "${container.name}", ${tech}, "${container.description}")`
        );
      } else if (container.external) {
        lines.push(
          `  Container_Ext(${container.id}, "${container.name}", ${tech}, "${container.description}")`
        );
      } else {
        lines.push(
          `  Container(${container.id}, "${container.name}", ${tech}, "${container.description}")`
        );
      }
    }

    if (diagram.containers.length > 0) {
      lines.push('');
    }

    // Add external systems
    if (options.includeExternalSystems && diagram.externalSystems.length > 0) {
      for (const system of diagram.externalSystems) {
        const sysTech = options.showTechnology && system.technology
          ? `, "${system.technology}"`
          : '';
        if (system.systemType === 'database') {
          lines.push(
            `  ContainerDb(${system.id}, "${system.name}", "${system.description}"${sysTech})`
          );
        } else {
          lines.push(
            `  System_Ext(${system.id}, "${system.name}", "${system.description}"${sysTech})`
          );
        }
      }
      lines.push('');
    }

    // Add relationships
    for (const rel of diagram.relationships) {
      const desc = options.showRelationshipLabels ? `"${rel.description}"` : '""';
      const tech = options.showTechnology && rel.technology ? `, "${rel.technology}"` : '';
      lines.push(`  Rel(${rel.sourceId}, ${rel.targetId}, ${desc}${tech})`);
    }

    return lines.filter((line) => line !== undefined).join('\n');
  }

  /**
   * Generate Mermaid syntax for Component diagram
   */
  private generateComponentMermaid(
    diagram: C4ComponentDiagram,
    options: C4DiagramOptions
  ): string {
    const lines: string[] = ['C4Component', `  title ${diagram.title}`, ''];

    // Handle components with boundaries
    if (diagram.boundaries && diagram.boundaries.length > 0) {
      const componentInBoundary = new Set<string>();

      for (const boundary of diagram.boundaries) {
        const boundaryId = this.sanitizeName(boundary.name);
        lines.push(`  Container_Boundary(${boundaryId}, "${boundary.name}") {`);

        for (const componentId of boundary.componentIds) {
          const component = diagram.components.find((c) => c.id === componentId);
          if (component) {
            componentInBoundary.add(component.id);
            const tech = options.showTechnology && component.technology
              ? `"${component.technology}"`
              : '""';
            lines.push(
              `    Component(${component.id}, "${component.name}", ${tech}, "${component.description}")`
            );
          }
        }

        lines.push('  }');
        lines.push('');
      }

      // Add components not in any boundary
      const unboundedComponents = diagram.components.filter((c) => !componentInBoundary.has(c.id));
      for (const component of unboundedComponents) {
        const tech = options.showTechnology && component.technology
          ? `"${component.technology}"`
          : '""';
        lines.push(
          `  Component(${component.id}, "${component.name}", ${tech}, "${component.description}")`
        );
      }
    } else {
      // No boundaries - just add all components
      for (const component of diagram.components) {
        const tech = options.showTechnology && component.technology
          ? `"${component.technology}"`
          : '""';
        lines.push(
          `  Component(${component.id}, "${component.name}", ${tech}, "${component.description}")`
        );
      }
    }

    if (diagram.components.length > 0) {
      lines.push('');
    }

    // Add relationships
    for (const rel of diagram.relationships) {
      const desc = options.showRelationshipLabels ? `"${rel.description}"` : '""';
      lines.push(`  Rel(${rel.sourceId}, ${rel.targetId}, ${desc})`);
    }

    return lines.filter((line) => line !== undefined).join('\n');
  }

  // ============================================================================
  // Private Methods - Relationship Generation
  // ============================================================================

  /**
   * Generate relationships for context diagram
   */
  private generateContextRelationships(
    system: C4System,
    persons: C4Person[],
    externalSystems: C4System[],
    externalSpecs: Array<{ name: string; relationshipDescription?: string; type: SystemType }>
  ): C4Relationship[] {
    const relationships: C4Relationship[] = [];

    // Person -> System relationships
    for (const person of persons) {
      relationships.push({
        sourceId: person.id,
        targetId: system.id,
        description: person.external ? 'Interacts with' : 'Uses',
        type: 'uses',
      });
    }

    // System -> External System relationships
    for (const external of externalSystems) {
      const spec = externalSpecs.find(
        (es) => this.sanitizeName(es.name) === external.id
      );
      const description = spec?.relationshipDescription ?? this.getRelationshipLabel(external.systemType ?? 'third_party');

      relationships.push({
        sourceId: system.id,
        targetId: external.id,
        description,
        type: this.getRelationshipType(external.systemType ?? 'third_party'),
      });
    }

    return relationships;
  }

  /**
   * Generate relationships for container diagram
   */
  private generateContainerRelationships(
    containers: C4Container[],
    externalSystems: C4System[],
    dependencies: Array<{ from: string; to: string; description?: string; technology?: string }>
  ): C4Relationship[] {
    const relationships: C4Relationship[] = [];
    const containerMap = new Map(containers.map((c) => [c.id, c]));
    const containerNameMap = new Map(containers.map((c) => [c.name.toLowerCase(), c]));

    // Add explicit dependencies
    for (const dep of dependencies) {
      const fromId = this.sanitizeName(dep.from);
      const toId = this.sanitizeName(dep.to);

      // Find containers by ID or name
      const fromContainer =
        containerMap.get(fromId) ?? containerNameMap.get(dep.from.toLowerCase());
      const toContainer = containerMap.get(toId) ?? containerNameMap.get(dep.to.toLowerCase());

      if (fromContainer && toContainer) {
        const inferredRel = this.inferContainerRelationship(fromContainer, toContainer);
        relationships.push({
          sourceId: fromContainer.id,
          targetId: toContainer.id,
          description: dep.description ?? inferredRel ?? 'Uses',
          technology: dep.technology,
          type: 'uses',
        });
      }
    }

    // Infer relationships between containers if none provided
    if (dependencies.length === 0) {
      for (const container of containers) {
        for (const other of containers) {
          if (container.id === other.id) continue;

          const relationship = this.inferContainerRelationship(container, other);
          if (relationship) {
            relationships.push({
              sourceId: container.id,
              targetId: other.id,
              description: relationship,
              type: 'uses',
            });
          }
        }
      }
    }

    // Add relationships to external systems
    for (const container of containers) {
      for (const external of externalSystems) {
        const relationship = this.getRelationshipLabel(external.systemType ?? 'third_party');
        relationships.push({
          sourceId: container.id,
          targetId: external.id,
          description: relationship,
          type: this.getRelationshipType(external.systemType ?? 'third_party'),
        });
      }
    }

    return relationships;
  }

  /**
   * Generate relationships for component diagram
   */
  private generateComponentRelationships(
    components: C4Component[],
    relationships: Array<{ from: string; to: string; description?: string; type?: string }>
  ): C4Relationship[] {
    const result: C4Relationship[] = [];
    const componentMap = new Map(components.map((c) => [c.id, c]));
    const componentNameMap = new Map(components.map((c) => [c.name.toLowerCase(), c]));
    const seen = new Set<string>();

    for (const rel of relationships) {
      const fromId = this.sanitizeName(rel.from);
      const toId = this.sanitizeName(rel.to);

      // Find components by ID or name
      const fromComponent =
        componentMap.get(fromId) ?? componentNameMap.get(rel.from.toLowerCase());
      const toComponent = componentMap.get(toId) ?? componentNameMap.get(rel.to.toLowerCase());

      if (fromComponent && toComponent) {
        const relKey = `${fromComponent.id}-${toComponent.id}-${rel.type ?? 'uses'}`;
        if (!seen.has(relKey)) {
          seen.add(relKey);
          result.push({
            sourceId: fromComponent.id,
            targetId: toComponent.id,
            description: rel.description ?? this.getComponentRelationshipDescription(rel.type),
            type: (rel.type as C4Relationship['type']) ?? 'uses',
          });
        }
      }
    }

    return result;
  }

  // ============================================================================
  // Private Methods - Storage
  // ============================================================================

  /**
   * Store a diagram in memory
   */
  private async storeDiagram(
    key: string,
    type: 'context' | 'container' | 'component',
    model: C4ContextDiagram | C4ContainerDiagram | C4ComponentDiagram,
    mermaid: string,
    embedding?: number[]
  ): Promise<void> {
    const fullKey = this.getStorageKey(key);
    const stored: StoredDiagram = {
      type,
      model,
      mermaid,
      storedAt: new Date(),
      embedding,
    };

    const options: StoreOptions = {
      namespace: this.namespace,
      persist: true,
    };

    await this.memory.set(fullKey, stored, options);

    // Store vector for semantic search
    if (embedding) {
      await this.memory.storeVector(fullKey, embedding, {
        type,
        title: this.getDiagramTitle(stored),
      });
    }
  }

  /**
   * Get full storage key
   */
  private getStorageKey(key: string): string {
    if (key.startsWith(this.namespace)) {
      return key;
    }
    return `${this.namespace}:${key}`;
  }

  // ============================================================================
  // Private Methods - Utilities
  // ============================================================================

  /**
   * Sanitize name for Mermaid syntax
   */
  private sanitizeName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9_\s-]/g, '')
      .replace(/\s+/g, '_')
      .replace(/-+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  /**
   * Get default persons for context diagram
   */
  private getDefaultPersons(): Array<Omit<C4Person, 'elementType'>> {
    return [
      { id: 'user', name: 'User', description: 'A user of the system' },
      { id: 'developer', name: 'Developer', description: 'A developer maintaining the system' },
    ];
  }

  /**
   * Get system description based on type
   */
  private getSystemDescription(type: SystemType): string {
    const descriptions: Record<SystemType, string> = {
      web_application: 'Web application',
      mobile_application: 'Mobile application',
      api: 'API service',
      database: 'Database system',
      message_queue: 'Message queue system',
      cache: 'Caching system',
      storage: 'Storage system',
      monitoring: 'Monitoring system',
      authentication: 'Authentication service',
      third_party: 'Third-party service',
      microservice: 'Microservice',
      monolith: 'Monolithic application',
      library: 'Library/SDK',
      cli: 'Command-line tool',
    };
    return descriptions[type] ?? 'External system';
  }

  /**
   * Get container description based on type and name
   */
  private getContainerDescription(type: ContainerType, name: string): string {
    const nameLower = name.toLowerCase();

    if (nameLower.includes('api')) return 'Provides application functionality via API';
    if (nameLower.includes('frontend')) return 'Delivers web interface to users';
    if (nameLower.includes('service')) return 'Handles business logic and processing';
    if (nameLower.includes('worker')) return 'Processes background tasks';
    if (nameLower.includes('gateway')) return 'Routes and manages traffic';

    const typeDescriptions: Record<ContainerType, string> = {
      web_application: 'Web application',
      mobile_application: 'Mobile application',
      single_page_application: 'Single-page application',
      desktop_application: 'Desktop application',
      api_application: 'API application',
      serverless_function: 'Serverless function',
      microservice: 'Microservice',
      console_application: 'Console application',
      database: 'Stores application data',
      file_system: 'File storage',
      cache: 'Caching layer',
      message_queue: 'Message queue',
      search_index: 'Search index',
      blob_storage: 'Binary storage',
    };

    return typeDescriptions[type] ?? 'Application component';
  }

  /**
   * Infer container technology from type and name
   */
  private inferContainerTechnology(type: ContainerType, name: string): string {
    const nameLower = name.toLowerCase();

    // Check name patterns
    if (nameLower.includes('postgres')) return 'PostgreSQL';
    if (nameLower.includes('mysql')) return 'MySQL';
    if (nameLower.includes('mongo')) return 'MongoDB';
    if (nameLower.includes('redis')) return 'Redis';
    if (nameLower.includes('elastic')) return 'Elasticsearch';
    if (nameLower.includes('rabbitmq')) return 'RabbitMQ';
    if (nameLower.includes('kafka')) return 'Apache Kafka';
    if (nameLower.includes('react')) return 'React, TypeScript';
    if (nameLower.includes('node') || nameLower.includes('api')) return 'Node.js, TypeScript';

    // Fallback by type
    const typeTech: Record<ContainerType, string> = {
      web_application: 'TypeScript, React',
      mobile_application: 'React Native',
      single_page_application: 'React, TypeScript',
      desktop_application: 'Electron',
      api_application: 'Node.js, TypeScript',
      serverless_function: 'Node.js',
      microservice: 'Node.js',
      console_application: 'Node.js',
      database: 'PostgreSQL',
      file_system: 'S3-compatible',
      cache: 'Redis',
      message_queue: 'RabbitMQ',
      search_index: 'Elasticsearch',
      blob_storage: 'S3',
    };

    return typeTech[type] ?? 'Application';
  }

  /**
   * Get component description based on type and name
   */
  private getComponentDescription(type: ComponentType, name: string): string {
    const nameLower = name.toLowerCase();

    if (nameLower.includes('controller')) return 'Handles HTTP requests and responses';
    if (nameLower.includes('service')) return 'Implements business logic';
    if (nameLower.includes('repository')) return 'Manages data persistence';
    if (nameLower.includes('auth')) return 'Provides authentication and authorization';
    if (nameLower.includes('validator')) return 'Validates input data';
    if (nameLower.includes('middleware')) return 'Processes requests in pipeline';
    if (nameLower.includes('util') || nameLower.includes('helper')) return 'Provides utility functions';
    if (nameLower.includes('handler')) return 'Handles events and messages';
    if (nameLower.includes('adapter')) return 'Adapts external interfaces';
    if (nameLower.includes('model') || nameLower.includes('entity')) return 'Represents data structure';

    const typeDescriptions: Record<ComponentType, string> = {
      controller: 'Handles requests',
      service: 'Business logic',
      repository: 'Data access',
      middleware: 'Request processing',
      validator: 'Input validation',
      utility: 'Utility functions',
      security: 'Security controls',
      model: 'Data model',
      handler: 'Event handling',
      adapter: 'External adapter',
      factory: 'Object creation',
      observer: 'Event observation',
      facade: 'Simplified interface',
      gateway: 'External gateway',
      interface: 'Interface definition',
      module: 'Module',
      class: 'Class',
      function: 'Function',
    };

    return typeDescriptions[type] ?? 'Application component';
  }

  /**
   * Infer component technology from type
   */
  private inferComponentTechnology(type: ComponentType): string {
    const typeTech: Record<ComponentType, string> = {
      controller: 'MVC Controller',
      service: 'Service Component',
      repository: 'Data Access Object',
      middleware: 'Middleware',
      validator: 'Validator',
      utility: 'Utility Component',
      security: 'Security Component',
      model: 'Data Model',
      handler: 'Event Handler',
      adapter: 'External Adapter',
      factory: 'Factory Pattern',
      observer: 'Observer Pattern',
      facade: 'Facade Pattern',
      gateway: 'Gateway Pattern',
      interface: 'Interface',
      module: 'Module',
      class: 'Class Component',
      function: 'Function Component',
    };

    return typeTech[type] ?? 'Component';
  }

  /**
   * Get relationship label based on system type
   */
  private getRelationshipLabel(type: SystemType): string {
    const labels: Record<SystemType, string> = {
      database: 'Reads from and writes to',
      api: 'Makes API calls to',
      cache: 'Reads from and writes to',
      message_queue: 'Publishes to and consumes from',
      storage: 'Stores files in',
      monitoring: 'Sends metrics to',
      authentication: 'Authenticates with',
      third_party: 'Integrates with',
      web_application: 'Uses',
      mobile_application: 'Uses',
      microservice: 'Calls',
      monolith: 'Depends on',
      library: 'Uses',
      cli: 'Executes',
    };

    return labels[type] ?? 'Depends on';
  }

  /**
   * Get relationship type based on system type
   */
  private getRelationshipType(type: SystemType): C4Relationship['type'] {
    const types: Record<SystemType, C4Relationship['type']> = {
      database: 'reads_from',
      api: 'calls',
      cache: 'reads_from',
      message_queue: 'sends_to',
      storage: 'writes_to',
      monitoring: 'sends_to',
      authentication: 'authenticates_with',
      third_party: 'uses',
      web_application: 'uses',
      mobile_application: 'uses',
      microservice: 'calls',
      monolith: 'depends_on',
      library: 'uses',
      cli: 'uses',
    };

    return types[type] ?? 'uses';
  }

  /**
   * Infer relationship between containers based on naming
   */
  private inferContainerRelationship(from: C4Container, to: C4Container): string | null {
    const fromName = from.name.toLowerCase();
    const toName = to.name.toLowerCase();

    // Frontend -> Backend/API
    if (
      fromName.includes('frontend') &&
      (toName.includes('api') || toName.includes('backend'))
    ) {
      return 'Makes API calls to';
    }

    // API/Backend -> Database
    if (
      (fromName.includes('api') || fromName.includes('backend') || fromName.includes('service')) &&
      this.isDatabase(to)
    ) {
      return 'Reads from and writes to';
    }

    // Gateway -> API/Service
    if (
      fromName.includes('gateway') &&
      (toName.includes('api') || toName.includes('service'))
    ) {
      return 'Routes requests to';
    }

    // Worker -> Queue
    if (fromName.includes('worker') && toName.includes('queue')) {
      return 'Consumes messages from';
    }

    // Service -> Cache
    if (
      (fromName.includes('service') || fromName.includes('api')) &&
      toName.includes('cache')
    ) {
      return 'Caches data in';
    }

    return null;
  }

  /**
   * Get component relationship description
   */
  private getComponentRelationshipDescription(type?: string): string {
    if (!type) return 'Uses';

    const descriptions: Record<string, string> = {
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

    return descriptions[type] ?? 'Uses';
  }

  /**
   * Check if container is a database type
   */
  private isDatabase(container: C4Container | { containerType?: ContainerType; name?: string }): boolean {
    if ('containerType' in container && container.containerType === 'database') {
      return true;
    }

    const name = (container.name ?? '').toLowerCase();
    const dbKeywords = ['database', 'db', 'postgres', 'mysql', 'mongo', 'redis', 'cache'];
    return dbKeywords.some((keyword) => name.includes(keyword));
  }

  /**
   * Get embedding text for context diagram
   */
  private getContextEmbeddingText(
    request: BuildContextRequest,
    system: C4System,
    externalSystems: C4System[]
  ): string {
    const parts = [
      `C4 Context: ${system.name}`,
      system.description,
      `Type: ${system.systemType ?? 'system'}`,
      system.technology ? `Technology: ${system.technology}` : '',
      externalSystems.length > 0
        ? `External systems: ${externalSystems.map((s) => s.name).join(', ')}`
        : '',
    ];
    return parts.filter(Boolean).join('. ');
  }

  /**
   * Get embedding text for container diagram
   */
  private getContainerEmbeddingText(
    request: BuildContainerRequest,
    containers: C4Container[],
    externalSystems: C4System[]
  ): string {
    const parts = [
      `C4 Container: ${request.systemName}`,
      `Containers: ${containers.map((c) => `${c.name} (${c.containerType})`).join(', ')}`,
      externalSystems.length > 0
        ? `External: ${externalSystems.map((s) => s.name).join(', ')}`
        : '',
    ];
    return parts.filter(Boolean).join('. ');
  }

  /**
   * Get embedding text for component diagram
   */
  private getComponentEmbeddingText(
    request: BuildComponentRequest,
    components: C4Component[]
  ): string {
    const parts = [
      `C4 Component: ${request.containerName}`,
      `Components: ${components.map((c) => `${c.name} (${c.componentType})`).join(', ')}`,
      request.boundaries && request.boundaries.length > 0
        ? `Boundaries: ${request.boundaries.map((b) => b.name).join(', ')}`
        : '',
    ];
    return parts.filter(Boolean).join('. ');
  }

  /**
   * Get diagram title from stored diagram
   */
  private getDiagramTitle(stored: StoredDiagram): string {
    if ('title' in stored.model) {
      return stored.model.title;
    }
    return 'Unknown Diagram';
  }

  /**
   * Get diagram preview from stored diagram
   */
  private getDiagramPreview(stored: StoredDiagram): string {
    switch (stored.type) {
      case 'context':
        const ctx = stored.model as C4ContextDiagram;
        return `System: ${ctx.system.name}, External: ${ctx.externalSystems.length}`;
      case 'container':
        const cnt = stored.model as C4ContainerDiagram;
        return `Containers: ${cnt.containers.length}, External: ${cnt.externalSystems.length}`;
      case 'component':
        const cmp = stored.model as C4ComponentDiagram;
        return `Components: ${cmp.components.length}, Relations: ${cmp.relationships.length}`;
      default:
        return 'No preview available';
    }
  }

  // ============================================================================
  // Private Methods - Architecture Analysis
  // ============================================================================

  /**
   * Detect architecture pattern from components
   */
  private detectArchitecturePattern(
    components: C4Component[]
  ): 'layered' | 'modular' | 'feature' | 'microservice' | 'mixed' {
    const boundaries = new Set(components.map((c) => c.boundary).filter(Boolean));
    const types = new Set(components.map((c) => c.componentType));

    // Check for layered architecture (controller -> service -> repository pattern)
    const hasLayers =
      types.has('controller') && types.has('service') && types.has('repository');

    // Check for modular architecture (boundaries = modules)
    const isModular = boundaries.size >= 3;

    // Check for feature-based (boundaries match feature names)
    const featurePatterns = ['auth', 'user', 'order', 'payment', 'notification'];
    const hasFeatures = Array.from(boundaries).some((b) =>
      featurePatterns.some((f) => (b ?? '').toLowerCase().includes(f))
    );

    if (hasLayers && !isModular) return 'layered';
    if (isModular && hasFeatures) return 'feature';
    if (isModular) return 'modular';
    if (components.length <= 5) return 'microservice';

    return 'mixed';
  }

  /**
   * Detect layers from components
   */
  private detectLayers(components: C4Component[]): string[] {
    const layers = new Set<string>();

    for (const component of components) {
      const type = component.componentType;
      if (type === 'controller') layers.add('presentation');
      if (type === 'service') layers.add('application');
      if (type === 'repository') layers.add('infrastructure');
      if (type === 'model') layers.add('domain');
      if (component.boundary) layers.add(component.boundary);
    }

    // Sort by typical layer order
    const layerOrder = ['presentation', 'application', 'domain', 'infrastructure'];
    return Array.from(layers).sort((a, b) => {
      const aIdx = layerOrder.indexOf(a);
      const bIdx = layerOrder.indexOf(b);
      if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
  }

  /**
   * Analyze coupling between components
   */
  private analyzeCoupling(
    components: C4Component[],
    relationships: C4Relationship[]
  ): CouplingAnalysis {
    const componentIds = new Set(components.map((c) => c.id));
    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();

    // Initialize degrees
    for (const id of componentIds) {
      inDegree.set(id, 0);
      outDegree.set(id, 0);
    }

    // Count degrees
    for (const rel of relationships) {
      if (componentIds.has(rel.sourceId)) {
        outDegree.set(rel.sourceId, (outDegree.get(rel.sourceId) ?? 0) + 1);
      }
      if (componentIds.has(rel.targetId)) {
        inDegree.set(rel.targetId, (inDegree.get(rel.targetId) ?? 0) + 1);
      }
    }

    // Calculate coupling scores
    const maxPossible = components.length - 1;
    const couplingScores: Array<{ from: string; to: string; score: number }> = [];

    for (const rel of relationships) {
      const outCount = outDegree.get(rel.sourceId) ?? 0;
      const inCount = inDegree.get(rel.targetId) ?? 0;
      const score = maxPossible > 0 ? (outCount + inCount) / (2 * maxPossible) : 0;

      if (score > 0.5) {
        couplingScores.push({
          from: rel.sourceId,
          to: rel.targetId,
          score,
        });
      }
    }

    // Detect circular dependencies (simple cycle detection)
    const cycles = this.detectCycles(relationships, componentIds);

    // Calculate average coupling
    const totalCoupling = Array.from(outDegree.values()).reduce((sum, v) => sum + v, 0);
    const avgCoupling = components.length > 0
      ? totalCoupling / (components.length * maxPossible) || 0
      : 0;

    return {
      averageCoupling: Math.min(1, avgCoupling),
      highCouplingPairs: couplingScores.sort((a, b) => b.score - a.score).slice(0, 10),
      circularDependencies: cycles,
    };
  }

  /**
   * Detect cycles in relationships
   */
  private detectCycles(relationships: C4Relationship[], componentIds: Set<string>): string[][] {
    const cycles: string[][] = [];
    const adjacency = new Map<string, string[]>();

    // Build adjacency list
    for (const id of componentIds) {
      adjacency.set(id, []);
    }
    for (const rel of relationships) {
      if (componentIds.has(rel.sourceId) && componentIds.has(rel.targetId)) {
        adjacency.get(rel.sourceId)?.push(rel.targetId);
      }
    }

    // DFS for cycle detection
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (node: string, path: string[]): void => {
      visited.add(node);
      recursionStack.add(node);

      for (const neighbor of adjacency.get(node) ?? []) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...path, neighbor]);
        } else if (recursionStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor);
          if (cycleStart >= 0) {
            cycles.push([...path.slice(cycleStart), neighbor]);
          }
        }
      }

      recursionStack.delete(node);
    };

    for (const id of componentIds) {
      if (!visited.has(id)) {
        dfs(id, [id]);
      }
    }

    return cycles;
  }

  /**
   * Generate architecture recommendations
   */
  private generateRecommendations(
    components: C4Component[],
    relationships: C4Relationship[],
    coupling: CouplingAnalysis
  ): ArchitectureRecommendation[] {
    const recommendations: ArchitectureRecommendation[] = [];

    // Check for circular dependencies
    for (const cycle of coupling.circularDependencies) {
      recommendations.push({
        severity: cycle.length > 3 ? 'critical' : 'high',
        priority: 'p0',
        category: 'dependency',
        issue: `Circular dependency detected: ${cycle.join(' -> ')}`,
        suggestion: `Break the cycle by introducing an abstraction layer or event-based communication between ${cycle[0]} and ${cycle[cycle.length - 2]}`,
        affectedElements: cycle,
      });
    }

    // Check for high coupling
    for (const pair of coupling.highCouplingPairs) {
      if (pair.score > 0.7) {
        recommendations.push({
          severity: 'medium',
          priority: 'p1',
          category: 'coupling',
          issue: `High coupling (${(pair.score * 100).toFixed(0)}%) between ${pair.from} and ${pair.to}`,
          suggestion: `Consider extracting shared logic into a separate component or using dependency injection`,
          affectedElements: [pair.from, pair.to],
        });
      }
    }

    // Check for components with too many dependencies
    const outDegree = new Map<string, number>();
    for (const rel of relationships) {
      outDegree.set(rel.sourceId, (outDegree.get(rel.sourceId) ?? 0) + 1);
    }

    for (const [componentId, degree] of outDegree) {
      if (degree > 5) {
        const component = components.find((c) => c.id === componentId);
        recommendations.push({
          severity: 'medium',
          priority: 'p2',
          category: 'coupling',
          issue: `${component?.name ?? componentId} has ${degree} outgoing dependencies`,
          suggestion: `Consider breaking this component into smaller, more focused units`,
          affectedElements: [componentId],
        });
      }
    }

    // Check for missing boundaries
    const componentsWithoutBoundary = components.filter((c) => !c.boundary);
    if (componentsWithoutBoundary.length > 3 && componentsWithoutBoundary.length < components.length) {
      recommendations.push({
        severity: 'low',
        priority: 'p3',
        category: 'layering',
        issue: `${componentsWithoutBoundary.length} components lack boundary/layer assignment`,
        suggestion: `Assign components to appropriate layers or modules for better organization`,
        affectedElements: componentsWithoutBoundary.map((c) => c.id),
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder: Record<Priority, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Calculate pattern confidence
   */
  private calculatePatternConfidence(
    pattern: string,
    layers: string[],
    components: C4Component[]
  ): number {
    let confidence = 0.5; // Base confidence

    // More layers = higher confidence for layered pattern
    if (pattern === 'layered') {
      confidence += Math.min(0.3, layers.length * 0.1);
    }

    // More components = higher confidence
    confidence += Math.min(0.2, components.length * 0.02);

    // Consistent boundaries = higher confidence
    const boundaryCount = new Set(components.map((c) => c.boundary).filter(Boolean)).size;
    if (boundaryCount > 0) {
      confidence += 0.1;
    }

    return Math.min(1, confidence);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a C4 Model Service instance
 */
export function createC4ModelService(
  memory: MemoryBackend,
  config?: C4ModelServiceConfig,
  embedderConfig?: NomicEmbedderConfig
): C4ModelService {
  return new C4ModelService(memory, config, embedderConfig);
}
