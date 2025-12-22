import Parser from 'tree-sitter';

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

  abstract extractFunctions(node: Parser.SyntaxNode): ExtractedSymbol[];
  abstract extractClasses(node: Parser.SyntaxNode): ExtractedSymbol[];
  abstract extractMethods(classNode: Parser.SyntaxNode): ExtractedSymbol[];

  protected getNodeText(node: Parser.SyntaxNode): string {
    return this.source.slice(node.startIndex, node.endIndex);
  }

  protected getNodeLine(node: Parser.SyntaxNode): number {
    return node.startPosition.row + 1;
  }

  protected getNodeEndLine(node: Parser.SyntaxNode): number {
    return node.endPosition.row + 1;
  }

  protected findChildByType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode | null {
    return node.children.find(child => child.type === type) || null;
  }

  protected findChildrenByType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode[] {
    return node.children.filter(child => child.type === type);
  }

  protected traverseTree(node: Parser.SyntaxNode, callback: (node: Parser.SyntaxNode) => void): void {
    callback(node);
    for (const child of node.children) {
      this.traverseTree(child, callback);
    }
  }
}
