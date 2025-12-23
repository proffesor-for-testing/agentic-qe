/**
 * Relationship Extractor
 *
 * Extracts code relationships from parsed AST entities
 * to build the knowledge graph.
 *
 * Supports:
 * - Import/export relationships
 * - Class inheritance and interfaces
 * - Function calls
 * - Type references
 */

import { GraphBuilder } from './GraphBuilder.js';
import { RelationshipMatch, EdgeType, NodeType } from './types.js';

export interface ParsedEntity {
  type: string;
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  language: string;
  parent?: string;
  children?: string[];
  references?: string[];
  imports?: Array<{ name: string; source: string }>;
  exports?: string[];
  extends?: string;
  implements?: string[];
  returnType?: string;
  parameters?: Array<{ name: string; type: string }>;
}

export interface ExtractionResult {
  /** Number of nodes created */
  nodesCreated: number;

  /** Number of edges created */
  edgesCreated: number;

  /** Relationships found */
  relationships: RelationshipMatch[];

  /** Extraction time (ms) */
  extractionTimeMs: number;
}

export class RelationshipExtractor {
  private graphBuilder: GraphBuilder;

  constructor(graphBuilder: GraphBuilder) {
    this.graphBuilder = graphBuilder;
  }

  /**
   * Extract relationships from a list of parsed entities.
   */
  extractFromEntities(entities: ParsedEntity[]): ExtractionResult {
    const startTime = Date.now();
    let nodesCreated = 0;
    let edgesCreated = 0;
    const relationships: RelationshipMatch[] = [];

    // First pass: create all nodes
    const nodeMap = new Map<string, string>(); // entity key -> node id

    for (const entity of entities) {
      const node = this.graphBuilder.addNode(
        this.mapEntityType(entity.type),
        entity.name,
        entity.filePath,
        entity.startLine,
        entity.endLine,
        entity.language,
        {
          originalType: entity.type,
          parent: entity.parent,
        }
      );

      nodeMap.set(this.getEntityKey(entity), node.id);
      nodesCreated++;
    }

    // Second pass: create edges
    for (const entity of entities) {
      const sourceId = nodeMap.get(this.getEntityKey(entity));
      if (!sourceId) continue;

      // Parent-child containment
      if (entity.parent) {
        const parentEntity = entities.find(e =>
          e.name === entity.parent && e.filePath === entity.filePath
        );
        if (parentEntity) {
          const parentId = nodeMap.get(this.getEntityKey(parentEntity));
          if (parentId) {
            const edge = this.graphBuilder.addEdge(parentId, sourceId, 'contains');
            if (edge) {
              edgesCreated++;
              relationships.push({
                source: this.graphBuilder.getNode(parentId)!,
                target: this.graphBuilder.getNode(sourceId)!,
                relationship: 'contains',
                confidence: 1.0,
              });
            }
          }
        }
      }

      // Imports
      if (entity.imports) {
        for (const imp of entity.imports) {
          const importedEntity = entities.find(e =>
            e.name === imp.name &&
            (e.filePath.includes(imp.source) || imp.source.includes(e.name))
          );

          if (importedEntity) {
            const targetId = nodeMap.get(this.getEntityKey(importedEntity));
            if (targetId) {
              const edge = this.graphBuilder.addEdge(sourceId, targetId, 'imports');
              if (edge) {
                edgesCreated++;
                relationships.push({
                  source: this.graphBuilder.getNode(sourceId)!,
                  target: this.graphBuilder.getNode(targetId)!,
                  relationship: 'imports',
                  confidence: 1.0,
                });
              }
            }
          }
        }
      }

      // Extends (inheritance)
      if (entity.extends) {
        const baseEntity = entities.find(e => e.name === entity.extends);
        if (baseEntity) {
          const targetId = nodeMap.get(this.getEntityKey(baseEntity));
          if (targetId) {
            const edge = this.graphBuilder.addEdge(sourceId, targetId, 'extends');
            if (edge) {
              edgesCreated++;
              relationships.push({
                source: this.graphBuilder.getNode(sourceId)!,
                target: this.graphBuilder.getNode(targetId)!,
                relationship: 'extends',
                confidence: 1.0,
              });
            }
          }
        }
      }

      // Implements (interfaces)
      if (entity.implements) {
        for (const interfaceName of entity.implements) {
          const interfaceEntity = entities.find(e =>
            e.name === interfaceName && e.type === 'interface'
          );
          if (interfaceEntity) {
            const targetId = nodeMap.get(this.getEntityKey(interfaceEntity));
            if (targetId) {
              const edge = this.graphBuilder.addEdge(sourceId, targetId, 'implements');
              if (edge) {
                edgesCreated++;
                relationships.push({
                  source: this.graphBuilder.getNode(sourceId)!,
                  target: this.graphBuilder.getNode(targetId)!,
                  relationship: 'implements',
                  confidence: 1.0,
                });
              }
            }
          }
        }
      }

      // Return type references
      if (entity.returnType) {
        const typeEntity = entities.find(e =>
          e.name === entity.returnType &&
          (e.type === 'type' || e.type === 'interface' || e.type === 'class')
        );
        if (typeEntity) {
          const targetId = nodeMap.get(this.getEntityKey(typeEntity));
          if (targetId) {
            const edge = this.graphBuilder.addEdge(sourceId, targetId, 'returns');
            if (edge) {
              edgesCreated++;
              relationships.push({
                source: this.graphBuilder.getNode(sourceId)!,
                target: this.graphBuilder.getNode(targetId)!,
                relationship: 'returns',
                confidence: 0.9,
              });
            }
          }
        }
      }

      // Parameter type references
      if (entity.parameters) {
        for (const param of entity.parameters) {
          const typeEntity = entities.find(e =>
            e.name === param.type &&
            (e.type === 'type' || e.type === 'interface' || e.type === 'class')
          );
          if (typeEntity) {
            const targetId = nodeMap.get(this.getEntityKey(typeEntity));
            if (targetId) {
              const edge = this.graphBuilder.addEdge(sourceId, targetId, 'parameter');
              if (edge) {
                edgesCreated++;
                relationships.push({
                  source: this.graphBuilder.getNode(sourceId)!,
                  target: this.graphBuilder.getNode(targetId)!,
                  relationship: 'parameter',
                  confidence: 0.9,
                });
              }
            }
          }
        }
      }

      // References (uses)
      if (entity.references) {
        for (const ref of entity.references) {
          const refEntity = entities.find(e => e.name === ref);
          if (refEntity) {
            const targetId = nodeMap.get(this.getEntityKey(refEntity));
            if (targetId && targetId !== sourceId) {
              const edge = this.graphBuilder.addEdge(sourceId, targetId, 'uses');
              if (edge) {
                edgesCreated++;
                relationships.push({
                  source: this.graphBuilder.getNode(sourceId)!,
                  target: this.graphBuilder.getNode(targetId)!,
                  relationship: 'uses',
                  confidence: 0.8,
                });
              }
            }
          }
        }
      }
    }

    return {
      nodesCreated,
      edgesCreated,
      relationships,
      extractionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Extract file-level containment relationships.
   */
  extractFileContainment(
    filePath: string,
    entities: ParsedEntity[]
  ): ExtractionResult {
    const startTime = Date.now();
    let nodesCreated = 0;
    let edgesCreated = 0;
    const relationships: RelationshipMatch[] = [];

    // Create file node
    const fileNode = this.graphBuilder.addNode(
      'file',
      filePath.split('/').pop() || filePath,
      filePath,
      1,
      entities.reduce((max, e) => Math.max(max, e.endLine), 0),
      entities[0]?.language || 'unknown'
    );
    nodesCreated++;

    // Create containment edges
    for (const entity of entities) {
      if (!entity.parent) { // Top-level entities
        const entityNode = this.graphBuilder.findNode(
          entity.name,
          entity.filePath,
          this.mapEntityType(entity.type)
        );

        if (entityNode) {
          const edge = this.graphBuilder.addEdge(
            fileNode.id,
            entityNode.id,
            'contains'
          );
          if (edge) {
            edgesCreated++;
            relationships.push({
              source: fileNode,
              target: entityNode,
              relationship: 'contains',
              confidence: 1.0,
            });
          }
        }
      }
    }

    return {
      nodesCreated,
      edgesCreated,
      relationships,
      extractionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Extract call relationships by analyzing function bodies.
   * Note: This is a simplified version. Full implementation would
   * need deeper AST analysis.
   */
  extractCalls(
    callerEntity: ParsedEntity,
    calleeNames: string[],
    entities: ParsedEntity[]
  ): ExtractionResult {
    const startTime = Date.now();
    let edgesCreated = 0;
    const relationships: RelationshipMatch[] = [];

    const callerNode = this.graphBuilder.findNode(
      callerEntity.name,
      callerEntity.filePath,
      this.mapEntityType(callerEntity.type)
    );

    if (!callerNode) {
      return {
        nodesCreated: 0,
        edgesCreated: 0,
        relationships: [],
        extractionTimeMs: Date.now() - startTime,
      };
    }

    for (const calleeName of calleeNames) {
      const calleeEntity = entities.find(e =>
        e.name === calleeName &&
        (e.type === 'function' || e.type === 'method')
      );

      if (calleeEntity) {
        const calleeNode = this.graphBuilder.findNode(
          calleeEntity.name,
          calleeEntity.filePath,
          this.mapEntityType(calleeEntity.type)
        );

        if (calleeNode) {
          const edge = this.graphBuilder.addEdge(
            callerNode.id,
            calleeNode.id,
            'calls'
          );
          if (edge) {
            edgesCreated++;
            relationships.push({
              source: callerNode,
              target: calleeNode,
              relationship: 'calls',
              confidence: 0.85,
            });
          }
        }
      }
    }

    return {
      nodesCreated: 0,
      edgesCreated,
      relationships,
      extractionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Map AST entity type to graph node type.
   */
  private mapEntityType(type: string): NodeType {
    const mapping: Record<string, NodeType> = {
      'function': 'function',
      'function_declaration': 'function',
      'arrow_function': 'function',
      'method': 'method',
      'method_definition': 'method',
      'class': 'class',
      'class_declaration': 'class',
      'interface': 'interface',
      'interface_declaration': 'interface',
      'type': 'type',
      'type_alias': 'type',
      'variable': 'variable',
      'variable_declaration': 'variable',
      'import': 'import',
      'import_statement': 'import',
      'export': 'export',
      'export_statement': 'export',
      'enum': 'enum',
      'enum_declaration': 'enum',
    };

    return mapping[type.toLowerCase()] || 'variable';
  }

  /**
   * Generate unique key for an entity.
   */
  private getEntityKey(entity: ParsedEntity): string {
    return `${entity.filePath}:${entity.type}:${entity.name}:${entity.startLine}`;
  }
}
