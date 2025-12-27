/**
 * Class Diagram Builder
 *
 * Generates Mermaid class diagrams with inheritance,
 * methods, properties, and visibility markers.
 */

import { GraphNode, GraphEdge } from '../graph/types.js';
import { MermaidGenerator, MermaidOptions } from './MermaidGenerator.js';

export interface ClassDiagramOptions extends MermaidOptions {
  /** Include method signatures */
  includeMethods?: boolean;

  /** Include properties/fields */
  includeProperties?: boolean;

  /** Show method parameters */
  showParameters?: boolean;

  /** Show return types */
  showReturnTypes?: boolean;

  /** Group by namespace/package */
  groupByNamespace?: boolean;
}

export class ClassDiagramBuilder {
  /**
   * Build class diagram from graph nodes.
   */
  static build(
    nodes: GraphNode[],
    edges: GraphEdge[],
    options: ClassDiagramOptions = {}
  ): string {
    const {
      includeMethods = true,
      includeProperties = true,
      showParameters = true,
      showReturnTypes = true,
      groupByNamespace = false,
      maxNodes = 30,
    } = options;

    // Filter to class/interface nodes
    let classNodes = nodes.filter(
      n => n.type === 'class' || n.type === 'interface'
    );

    if (classNodes.length > maxNodes) {
      classNodes = classNodes.slice(0, maxNodes);
    }

    // Enrich class nodes with methods and properties
    const enrichedNodes = classNodes.map(node =>
      this.enrichClassNode(node, nodes, {
        includeMethods,
        includeProperties,
        showParameters,
        showReturnTypes,
      })
    );

    // Filter edges to inheritance/implementation
    const classNodeIds = new Set(classNodes.map(n => n.id));
    const relevantEdges = edges.filter(
      e => classNodeIds.has(e.source) && classNodeIds.has(e.target) &&
           (e.type === 'extends' || e.type === 'implements' || e.type === 'uses')
    );

    const diagram = MermaidGenerator.generate(
      enrichedNodes,
      relevantEdges,
      'classDiagram',
      options
    );

    if (groupByNamespace) {
      return this.addNamespaceGrouping(diagram, enrichedNodes);
    }

    return diagram;
  }

  /**
   * Build inheritance hierarchy for a specific class.
   */
  static buildHierarchy(
    rootClassId: string,
    nodes: GraphNode[],
    edges: GraphEdge[],
    options: ClassDiagramOptions = {}
  ): string {
    const rootNode = nodes.find(n => n.id === rootClassId);
    if (!rootNode) {
      throw new Error(`Class not found: ${rootClassId}`);
    }

    // Traverse up (superclasses) and down (subclasses)
    const hierarchyNodes = new Set<string>([rootClassId]);
    const hierarchyEdges: GraphEdge[] = [];

    // Find superclasses (extends/implements)
    const findSuperclasses = (nodeId: string): void => {
      const extendsEdges = edges.filter(
        e => e.source === nodeId && (e.type === 'extends' || e.type === 'implements')
      );

      for (const edge of extendsEdges) {
        if (!hierarchyNodes.has(edge.target)) {
          hierarchyNodes.add(edge.target);
          hierarchyEdges.push(edge);
          findSuperclasses(edge.target);
        }
      }
    };

    // Find subclasses
    const findSubclasses = (nodeId: string): void => {
      const subclassEdges = edges.filter(
        e => e.target === nodeId && (e.type === 'extends' || e.type === 'implements')
      );

      for (const edge of subclassEdges) {
        if (!hierarchyNodes.has(edge.source)) {
          hierarchyNodes.add(edge.source);
          hierarchyEdges.push(edge);
          findSubclasses(edge.source);
        }
      }
    };

    findSuperclasses(rootClassId);
    findSubclasses(rootClassId);

    const hierarchyNodeList = nodes.filter(n => hierarchyNodes.has(n.id));

    return this.build(hierarchyNodeList, hierarchyEdges, options);
  }

  /**
   * Enrich class node with methods and properties from child nodes.
   */
  private static enrichClassNode(
    classNode: GraphNode,
    allNodes: GraphNode[],
    options: {
      includeMethods: boolean;
      includeProperties: boolean;
      showParameters: boolean;
      showReturnTypes: boolean;
    }
  ): GraphNode {
    const enriched = { ...classNode };

    if (!enriched.properties) {
      enriched.properties = {};
    }

    // Find methods (child nodes of type 'method')
    if (options.includeMethods) {
      const methods = allNodes.filter(
        n => n.type === 'method' && n.filePath === classNode.filePath &&
             n.startLine >= classNode.startLine && n.endLine <= classNode.endLine
      );

      enriched.properties.methods = methods.map(m => ({
        name: m.label,
        visibility: this.inferVisibility(m.label),
        returnType: options.showReturnTypes ? m.properties.returnType as string : undefined,
        params: options.showParameters ? m.properties.params as string[] : undefined,
      }));
    }

    // Find properties (child nodes of type 'variable')
    if (options.includeProperties) {
      const properties = allNodes.filter(
        n => n.type === 'variable' && n.filePath === classNode.filePath &&
             n.startLine >= classNode.startLine && n.endLine <= classNode.endLine
      );

      enriched.properties.properties = properties.map(p => ({
        name: p.label,
        visibility: this.inferVisibility(p.label),
        type: p.properties.type as string,
      }));
    }

    return enriched;
  }

  /**
   * Infer visibility from naming convention.
   */
  private static inferVisibility(name: string): string {
    if (name.startsWith('_')) return 'private';
    if (name.startsWith('#')) return 'private';
    if (name.startsWith('__')) return 'private';
    return 'public';
  }

  /**
   * Add namespace grouping to diagram.
   */
  private static addNamespaceGrouping(
    diagram: string,
    nodes: GraphNode[]
  ): string {
    const lines = diagram.split('\n');
    const namespaces = new Map<string, string[]>();

    // Group nodes by file path (namespace)
    for (const node of nodes) {
      const namespace = this.extractNamespace(node.filePath);
      const existing = namespaces.get(namespace) || [];
      existing.push(MermaidGenerator['sanitizeMermaidId'](node.label));
      namespaces.set(namespace, existing);
    }

    // Insert namespace declarations after classDiagram header
    const namespaceLines: string[] = [];
    for (const [namespace, classes] of namespaces.entries()) {
      namespaceLines.push(`  namespace ${namespace} {`);
      for (const className of classes) {
        namespaceLines.push(`    class ${className}`);
      }
      namespaceLines.push('  }');
    }

    // Insert after first line
    return [lines[0], ...namespaceLines, ...lines.slice(1)].join('\n');
  }

  /**
   * Extract namespace from file path.
   */
  private static extractNamespace(filePath: string): string {
    const parts = filePath.split('/');
    if (parts.length > 1) {
      // Use parent directory as namespace
      return parts[parts.length - 2].replace(/[^a-zA-Z0-9]/g, '_');
    }
    return 'default';
  }

  /**
   * Generate interface overview diagram.
   */
  static buildInterfaceOverview(
    nodes: GraphNode[],
    edges: GraphEdge[],
    options: ClassDiagramOptions = {}
  ): string {
    // Filter to interfaces only
    const interfaceNodes = nodes.filter(n => n.type === 'interface');

    // Find all classes that implement these interfaces
    const implementsEdges = edges.filter(e => e.type === 'implements');

    const relevantNodeIds = new Set<string>(interfaceNodes.map(n => n.id));
    for (const edge of implementsEdges) {
      if (relevantNodeIds.has(edge.target)) {
        relevantNodeIds.add(edge.source);
      }
    }

    const relevantNodes = nodes.filter(n => relevantNodeIds.has(n.id));
    const relevantEdges = implementsEdges.filter(
      e => relevantNodeIds.has(e.source) && relevantNodeIds.has(e.target)
    );

    return this.build(relevantNodes, relevantEdges, {
      ...options,
      includeMethods: true,
      includeProperties: false,
    });
  }
}
