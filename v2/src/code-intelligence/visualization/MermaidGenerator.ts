/**
 * Mermaid Diagram Generator
 *
 * Converts Code Intelligence graph to Mermaid syntax
 * for GitHub-compatible visualization.
 */

import { GraphNode, GraphEdge, EdgeType, NodeType } from '../graph/types.js';
import { C4ContextDiagramBuilder } from './C4ContextDiagramBuilder.js';
import { C4ContainerDiagramBuilder } from './C4ContainerDiagramBuilder.js';
import { C4ComponentDiagramBuilder } from './C4ComponentDiagramBuilder.js';
import { ProjectMetadataAnalyzer } from '../inference/ProjectMetadataAnalyzer.js';
import { ExternalSystemDetector } from '../inference/ExternalSystemDetector.js';
import { ComponentBoundaryAnalyzer } from '../inference/ComponentBoundaryAnalyzer.js';
import type {
  ProjectMetadata,
  Container,
  ExternalSystem,
  Component,
  ComponentRelationship,
  ComponentAnalysisResult,
} from '../inference/types.js';

export interface MermaidOptions {
  /** Maximum nodes to include (prevents overwhelming large graphs) */
  maxNodes?: number;

  /** Include legend for relationship types */
  includeLegend?: boolean;

  /** Direction for flowcharts (TB, LR, RL, BT) */
  direction?: 'TB' | 'LR' | 'RL' | 'BT';

  /** Style theme */
  theme?: 'default' | 'dark' | 'forest' | 'neutral';

  /** Filter by node types */
  nodeTypeFilter?: NodeType[];

  /** Filter by edge types */
  edgeTypeFilter?: EdgeType[];
}

export class MermaidGenerator {
  /**
   * Generate Mermaid diagram from nodes and edges.
   */
  static generate(
    nodes: GraphNode[],
    edges: GraphEdge[],
    type: 'classDiagram' | 'graph' | 'flowchart',
    options: MermaidOptions = {}
  ): string {
    const {
      maxNodes = 50,
      includeLegend = true,
      direction = 'TB',
      theme = 'default',
      nodeTypeFilter,
      edgeTypeFilter,
    } = options;

    // Filter nodes
    let filteredNodes = nodeTypeFilter
      ? nodes.filter(n => nodeTypeFilter.includes(n.type))
      : nodes;

    // Limit nodes
    if (filteredNodes.length > maxNodes) {
      filteredNodes = filteredNodes.slice(0, maxNodes);
    }

    // Filter edges (only include edges between filtered nodes)
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    let filteredEdges = edges.filter(
      e => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    if (edgeTypeFilter) {
      filteredEdges = filteredEdges.filter(e => edgeTypeFilter.includes(e.type));
    }

    switch (type) {
      case 'classDiagram':
        return this.generateClassDiagram(filteredNodes, filteredEdges, includeLegend);
      case 'graph':
      case 'flowchart':
        return this.generateFlowchart(filteredNodes, filteredEdges, direction, includeLegend);
      default:
        throw new Error(`Unsupported diagram type: ${type}`);
    }
  }

  /**
   * Generate class diagram.
   */
  private static generateClassDiagram(
    nodes: GraphNode[],
    edges: GraphEdge[],
    includeLegend: boolean
  ): string {
    const lines: string[] = ['classDiagram'];

    // Add classes
    const classNodes = nodes.filter(n => n.type === 'class' || n.type === 'interface');

    for (const node of classNodes) {
      const className = this.sanitizeMermaidId(node.label);
      lines.push(`  class ${className} {`);

      // Add properties from node metadata
      if (node.properties.properties && Array.isArray(node.properties.properties)) {
        for (const prop of node.properties.properties as Array<{ name: string; visibility?: string; type?: string }>) {
          const visibility = this.getVisibilitySymbol(prop.visibility);
          const type = prop.type ? ` ${prop.type}` : '';
          lines.push(`    ${visibility}${prop.name}${type}`);
        }
      }

      // Add methods
      if (node.properties.methods && Array.isArray(node.properties.methods)) {
        for (const method of node.properties.methods as Array<{ name: string; visibility?: string; returnType?: string; params?: string[] }>) {
          const visibility = this.getVisibilitySymbol(method.visibility);
          const params = method.params ? method.params.join(', ') : '';
          const returnType = method.returnType ? ` ${method.returnType}` : '';
          lines.push(`    ${visibility}${method.name}(${params})${returnType}`);
        }
      }

      lines.push('  }');
    }

    // Add relationships
    for (const edge of edges) {
      const source = nodes.find(n => n.id === edge.source);
      const target = nodes.find(n => n.id === edge.target);

      if (!source || !target) continue;

      const sourceName = this.sanitizeMermaidId(source.label);
      const targetName = this.sanitizeMermaidId(target.label);
      const relationship = this.getClassRelationship(edge.type);

      if (relationship) {
        lines.push(`  ${sourceName} ${relationship} ${targetName}`);
      }
    }

    // Add legend
    if (includeLegend) {
      lines.push('');
      lines.push('  %% Legend:');
      lines.push('  %% --|> : Inheritance');
      lines.push('  %% ..|> : Implementation');
      lines.push('  %% --> : Association');
      lines.push('  %% --* : Composition');
      lines.push('  %% --o : Aggregation');
    }

    return lines.join('\n');
  }

  /**
   * Generate flowchart/graph diagram.
   */
  private static generateFlowchart(
    nodes: GraphNode[],
    edges: GraphEdge[],
    direction: string,
    includeLegend: boolean
  ): string {
    const lines: string[] = [`graph ${direction}`];

    // Add nodes with shapes based on type
    for (const node of nodes) {
      const id = this.sanitizeMermaidId(node.id);
      const label = this.escapeLabel(node.label);
      const shape = this.getNodeShape(node.type);
      const style = this.getNodeStyle(node.type);

      lines.push(`  ${id}${shape[0]}${label}${shape[1]}`);

      if (style) {
        lines.push(`  style ${id} ${style}`);
      }
    }

    // Add edges with labels
    for (const edge of edges) {
      const sourceId = this.sanitizeMermaidId(edge.source);
      const targetId = this.sanitizeMermaidId(edge.target);
      const arrow = this.getEdgeArrow(edge.type);
      const label = this.getEdgeLabel(edge.type);

      if (label) {
        lines.push(`  ${sourceId} ${arrow}|${label}| ${targetId}`);
      } else {
        lines.push(`  ${sourceId} ${arrow} ${targetId}`);
      }
    }

    // Add legend
    if (includeLegend) {
      lines.push('');
      lines.push('  %% Legend:');
      lines.push('  %% Circle: File');
      lines.push('  %% Rectangle: Function/Method');
      lines.push('  %% Rounded: Class/Interface');
      lines.push('  %% Diamond: Variable/Type');
      lines.push('  %% Hexagon: Import/Export');
    }

    return lines.join('\n');
  }

  /**
   * Get visibility symbol for class members.
   */
  private static getVisibilitySymbol(visibility?: string): string {
    switch (visibility) {
      case 'public':
        return '+';
      case 'private':
        return '-';
      case 'protected':
        return '#';
      case 'internal':
      case 'package':
        return '~';
      default:
        return '+'; // Default to public
    }
  }

  /**
   * Get class diagram relationship syntax.
   */
  private static getClassRelationship(edgeType: EdgeType): string | null {
    switch (edgeType) {
      case 'extends':
        return '--|>';
      case 'implements':
        return '..|>';
      case 'uses':
        return '-->';
      case 'contains':
        return '--*';
      default:
        return null;
    }
  }

  /**
   * Get node shape for flowchart.
   */
  private static getNodeShape(type: NodeType): [string, string] {
    switch (type) {
      case 'file':
        return ['((', '))'];  // Circle
      case 'class':
      case 'interface':
        return ['(', ')'];    // Rounded rectangle
      case 'function':
      case 'method':
        return ['[', ']'];    // Rectangle
      case 'variable':
      case 'type':
      case 'enum':
        return ['{', '}'];    // Diamond
      case 'import':
      case 'export':
        return ['{{', '}}'];  // Hexagon
      default:
        return ['[', ']'];
    }
  }

  /**
   * Get node style CSS.
   */
  private static getNodeStyle(type: NodeType): string | null {
    switch (type) {
      case 'file':
        return 'fill:#e1f5ff,stroke:#01579b,stroke-width:2px';
      case 'class':
        return 'fill:#f3e5f5,stroke:#4a148c,stroke-width:2px';
      case 'interface':
        return 'fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px';
      case 'function':
      case 'method':
        return 'fill:#fff3e0,stroke:#e65100,stroke-width:2px';
      case 'variable':
        return 'fill:#fce4ec,stroke:#880e4f,stroke-width:2px';
      case 'import':
      case 'export':
        return 'fill:#e0f2f1,stroke:#004d40,stroke-width:2px';
      default:
        return null;
    }
  }

  /**
   * Get edge arrow style.
   */
  private static getEdgeArrow(edgeType: EdgeType): string {
    switch (edgeType) {
      case 'extends':
      case 'implements':
        return '-->';
      case 'imports':
      case 'exports':
        return '==>';
      case 'calls':
        return '-.->';
      case 'uses':
      case 'returns':
      case 'parameter':
        return '-->';
      case 'contains':
      case 'defines':
        return '==>';
      case 'tests':
        return '-..->';
      default:
        return '-->';
    }
  }

  /**
   * Get edge label.
   */
  private static getEdgeLabel(edgeType: EdgeType): string {
    switch (edgeType) {
      case 'imports':
        return 'imports';
      case 'exports':
        return 'exports';
      case 'extends':
        return 'extends';
      case 'implements':
        return 'implements';
      case 'calls':
        return 'calls';
      case 'uses':
        return 'uses';
      case 'contains':
        return 'contains';
      case 'returns':
        return 'returns';
      case 'parameter':
        return 'param';
      case 'overrides':
        return 'overrides';
      case 'defines':
        return 'defines';
      case 'tests':
        return 'tests';
      default:
        return '';
    }
  }

  /**
   * Sanitize ID for Mermaid (alphanumeric and underscores only).
   */
  private static sanitizeMermaidId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /**
   * Escape label for Mermaid (handle special characters).
   */
  private static escapeLabel(label: string): string {
    return label
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\[/g, '&#91;')
      .replace(/\]/g, '&#93;')
      .replace(/\{/g, '&#123;')
      .replace(/\}/g, '&#125;');
  }

  /**
   * Detect circular dependencies in graph.
   */
  static findCircularDependencies(
    nodes: GraphNode[],
    edges: GraphEdge[]
  ): string[][] {
    const adjacency = new Map<string, string[]>();

    // Build adjacency list
    for (const edge of edges) {
      if (edge.type === 'imports' || edge.type === 'uses') {
        const neighbors = adjacency.get(edge.source) || [];
        neighbors.push(edge.target);
        adjacency.set(edge.source, neighbors);
      }
    }

    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (nodeId: string, path: string[]): void => {
      visited.add(nodeId);
      recStack.add(nodeId);
      path.push(nodeId);

      const neighbors = adjacency.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...path]);
        } else if (recStack.has(neighbor)) {
          // Found cycle
          const cycleStart = path.indexOf(neighbor);
          if (cycleStart !== -1) {
            cycles.push([...path.slice(cycleStart), neighbor]);
          }
        }
      }

      recStack.delete(nodeId);
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id, []);
      }
    }

    return cycles;
  }

  /**
   * Generate dependency graph with circular dependency highlighting.
   */
  static generateDependencyGraphWithCycles(
    nodes: GraphNode[],
    edges: GraphEdge[],
    options: MermaidOptions = {}
  ): string {
    const cycles = this.findCircularDependencies(nodes, edges);
    const cycleNodes = new Set<string>();

    for (const cycle of cycles) {
      for (const nodeId of cycle) {
        cycleNodes.add(nodeId);
      }
    }

    const diagram = this.generate(nodes, edges, 'graph', {
      ...options,
      edgeTypeFilter: ['imports', 'uses', 'exports'],
    });

    // Add styling for circular dependencies
    const lines = diagram.split('\n');
    const styleLines: string[] = [];

    for (const nodeId of cycleNodes) {
      const sanitizedId = this.sanitizeMermaidId(nodeId);
      styleLines.push(`  style ${sanitizedId} fill:#ffcdd2,stroke:#c62828,stroke-width:3px`);
    }

    if (cycles.length > 0) {
      styleLines.push('');
      styleLines.push('  %% Warning: Circular dependencies detected!');
      styleLines.push(`  %% ${cycles.length} cycle(s) found (highlighted in red)`);
    }

    return [...lines, ...styleLines].join('\n');
  }

  /**
   * Generate C4 Context diagram from project analysis.
   *
   * Context diagrams show the system in its environment with users and external systems.
   * This is the highest level of abstraction in C4 modeling.
   *
   * @param rootDir - Root directory of the project to analyze
   * @returns Mermaid C4Context diagram as string
   * @throws Error if project analysis fails
   *
   * @example
   * ```typescript
   * const diagram = await MermaidGenerator.generateC4Context('/path/to/project');
   * console.log(diagram);
   * ```
   */
  static async generateC4Context(rootDir: string): Promise<string> {
    try {
      // Analyze project metadata
      const metadataAnalyzer = new ProjectMetadataAnalyzer(rootDir);
      const metadata = await metadataAnalyzer.analyze();

      // Detect external systems
      const externalDetector = new ExternalSystemDetector(rootDir);
      const externalSystems = await externalDetector.detect();

      // Build C4 Context diagram
      const builder = new C4ContextDiagramBuilder();
      return builder.build(metadata, externalSystems);
    } catch (error) {
      throw new Error(
        `Failed to generate C4 Context diagram: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate C4 Container diagram from project analysis.
   *
   * Container diagrams show the high-level technology choices and how containers
   * communicate with each other. Containers represent applications or data stores.
   *
   * @param rootDir - Root directory of the project to analyze
   * @returns Mermaid C4Container diagram as string
   * @throws Error if project analysis fails
   *
   * @example
   * ```typescript
   * const diagram = await MermaidGenerator.generateC4Container('/path/to/project');
   * console.log(diagram);
   * ```
   */
  static async generateC4Container(rootDir: string): Promise<string> {
    try {
      // Analyze project metadata
      const metadataAnalyzer = new ProjectMetadataAnalyzer(rootDir);
      const metadata = await metadataAnalyzer.analyze();

      // Detect external systems
      const externalDetector = new ExternalSystemDetector(rootDir);
      const externalSystems = await externalDetector.detect();

      // Build C4 Container diagram
      const builder = new C4ContainerDiagramBuilder();
      return builder.build(metadata, externalSystems);
    } catch (error) {
      throw new Error(
        `Failed to generate C4 Container diagram: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate C4 Component diagram from project analysis.
   *
   * Component diagrams show the internal structure of a container, breaking it down
   * into components and showing their relationships. Components are typically classes,
   * modules, or services within a container.
   *
   * @param rootDir - Root directory of the project to analyze
   * @param containerName - Optional name of the container to detail (defaults to project name)
   * @returns Mermaid C4Component diagram as string
   * @throws Error if project analysis fails
   *
   * @example
   * ```typescript
   * const diagram = await MermaidGenerator.generateC4Component('/path/to/project');
   * console.log(diagram);
   * ```
   */
  static async generateC4Component(rootDir: string, containerName?: string): Promise<string> {
    try {
      // Analyze component boundaries
      const boundaryAnalyzer = new ComponentBoundaryAnalyzer(rootDir);
      const analysisResult = await boundaryAnalyzer.analyze();

      // Get container name from metadata if not provided
      let finalContainerName = containerName;
      if (!finalContainerName) {
        const metadataAnalyzer = new ProjectMetadataAnalyzer(rootDir);
        const metadata = await metadataAnalyzer.analyze();
        finalContainerName = metadata.name;
      }

      // Build C4 Component diagram
      const builder = new C4ComponentDiagramBuilder();
      return builder.build(finalContainerName, analysisResult.components, analysisResult.relationships);
    } catch (error) {
      throw new Error(
        `Failed to generate C4 Component diagram: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate C4 diagram of specified type.
   *
   * Unified method to generate any C4 diagram type with optional configuration.
   *
   * @param type - Type of C4 diagram to generate ('context' | 'container' | 'component')
   * @param rootDir - Root directory of the project to analyze
   * @param options - Optional configuration for diagram generation
   * @param options.containerName - Container name for component diagrams
   * @returns Mermaid C4 diagram as string
   * @throws Error if diagram type is invalid or generation fails
   *
   * @example
   * ```typescript
   * // Generate context diagram
   * const context = await MermaidGenerator.generateC4Diagram('context', '/path/to/project');
   *
   * // Generate component diagram for specific container
   * const component = await MermaidGenerator.generateC4Diagram('component', '/path/to/project', {
   *   containerName: 'API Application'
   * });
   * ```
   */
  static async generateC4Diagram(
    type: 'context' | 'container' | 'component',
    rootDir: string,
    options?: { containerName?: string }
  ): Promise<string> {
    switch (type) {
      case 'context':
        return this.generateC4Context(rootDir);
      case 'container':
        return this.generateC4Container(rootDir);
      case 'component':
        return this.generateC4Component(rootDir, options?.containerName);
      default:
        throw new Error(`Unsupported C4 diagram type: ${type}`);
    }
  }
}
