import type Parser from 'web-tree-sitter';

type SyntaxNode = Parser.SyntaxNode;

export interface ExtractedSymbol {
  name: string;
  type: 'function' | 'class' | 'method' | 'interface' | 'type' | 'variable';
  startLine: number;
  endLine: number;
  content: string;
  signature?: string;
  parameters?: ParameterInfo[];
  returnType?: string;
  visibility?: 'public' | 'private' | 'protected';
  decorators?: string[];
  isAsync?: boolean;
  isExported?: boolean;
  parent?: string;
}

export interface ParameterInfo {
  name: string;
  type?: string;
  defaultValue?: string;
  isOptional?: boolean;
}

export abstract class BaseExtractor {
  protected source: string;

  constructor(source: string) {
    this.source = source;
  }

  abstract extractFunctions(node: SyntaxNode): ExtractedSymbol[];
  abstract extractClasses(node: SyntaxNode): ExtractedSymbol[];
  abstract extractMethods(classNode: SyntaxNode): ExtractedSymbol[];

  protected getNodeText(node: SyntaxNode): string {
    return this.source.slice(node.startIndex, node.endIndex);
  }

  protected getNodeLine(node: SyntaxNode): number {
    return node.startPosition.row + 1;
  }

  protected getNodeEndLine(node: SyntaxNode): number {
    return node.endPosition.row + 1;
  }

  protected findChildByType(node: SyntaxNode, type: string): SyntaxNode | null {
    // web-tree-sitter uses .children getter which returns array
    const children = node.children;
    return children.find(child => child.type === type) || null;
  }

  protected findChildrenByType(node: SyntaxNode, type: string): SyntaxNode[] {
    const children = node.children;
    return children.filter(child => child.type === type);
  }

  protected traverseTree(node: SyntaxNode, callback: (node: SyntaxNode) => void): void {
    callback(node);
    const children = node.children;
    for (const child of children) {
      this.traverseTree(child, callback);
    }
  }
}
