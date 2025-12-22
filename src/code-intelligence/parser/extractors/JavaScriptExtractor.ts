import Parser from 'tree-sitter';
import { BaseExtractor, ExtractedSymbol, ParameterInfo } from './BaseExtractor';

export class JavaScriptExtractor extends BaseExtractor {
  extractFunctions(node: Parser.SyntaxNode): ExtractedSymbol[] {
    const functions: ExtractedSymbol[] = [];

    this.traverseTree(node, (currentNode) => {
      if (this.isFunctionNode(currentNode)) {
        const func = this.extractFunction(currentNode);
        if (func) {
          functions.push(func);
        }
      }
    });

    return functions;
  }

  extractClasses(node: Parser.SyntaxNode): ExtractedSymbol[] {
    const classes: ExtractedSymbol[] = [];

    this.traverseTree(node, (currentNode) => {
      if (currentNode.type === 'class_declaration' || currentNode.type === 'class') {
        const classSymbol = this.extractClass(currentNode);
        if (classSymbol) {
          classes.push(classSymbol);
        }
      }
    });

    return classes;
  }

  extractMethods(classNode: Parser.SyntaxNode): ExtractedSymbol[] {
    const methods: ExtractedSymbol[] = [];
    const classBody = this.findChildByType(classNode, 'class_body');

    if (!classBody) {
      return methods;
    }

    const className = this.extractClassName(classNode);

    classBody.children.forEach((child) => {
      if (this.isMethodNode(child)) {
        const method = this.extractMethod(child, className);
        if (method) {
          methods.push(method);
        }
      }
    });

    return methods;
  }

  private isFunctionNode(node: Parser.SyntaxNode): boolean {
    return [
      'function_declaration',
      'function',
      'arrow_function',
      'generator_function_declaration',
      'generator_function'
    ].includes(node.type);
  }

  private isMethodNode(node: Parser.SyntaxNode): boolean {
    return [
      'method_definition',
      'field_definition'
    ].includes(node.type);
  }

  private extractFunction(node: Parser.SyntaxNode): ExtractedSymbol | null {
    const nameNode = this.findChildByType(node, 'identifier');
    if (!nameNode) {
      return null;
    }

    const name = this.getNodeText(nameNode);
    const parameters = this.extractParameters(node);
    const isAsync = this.isAsyncFunction(node);
    const isExported = this.isExported(node);
    const decorators = this.extractDecorators(node);

    return {
      name,
      type: 'function',
      startLine: this.getNodeLine(node),
      endLine: this.getNodeEndLine(node),
      content: this.getNodeText(node),
      signature: this.buildSignature(name, parameters),
      parameters,
      isAsync,
      isExported,
      decorators
    };
  }

  private extractClass(node: Parser.SyntaxNode): ExtractedSymbol | null {
    const nameNode = this.findChildByType(node, 'identifier');
    if (!nameNode) {
      return null;
    }

    const name = this.getNodeText(nameNode);
    const isExported = this.isExported(node);
    const decorators = this.extractDecorators(node);

    return {
      name,
      type: 'class',
      startLine: this.getNodeLine(node),
      endLine: this.getNodeEndLine(node),
      content: this.getNodeText(node),
      isExported,
      decorators
    };
  }

  private extractMethod(node: Parser.SyntaxNode, className?: string): ExtractedSymbol | null {
    const nameNode = this.findChildByType(node, 'property_identifier') ||
                     this.findChildByType(node, 'identifier');

    if (!nameNode) {
      return null;
    }

    const name = this.getNodeText(nameNode);
    const parameters = this.extractParameters(node);
    const isAsync = this.isAsyncFunction(node);
    const visibility = this.extractVisibility(node);
    const decorators = this.extractDecorators(node);

    return {
      name,
      type: 'method',
      startLine: this.getNodeLine(node),
      endLine: this.getNodeEndLine(node),
      content: this.getNodeText(node),
      signature: this.buildSignature(name, parameters),
      parameters,
      visibility,
      isAsync,
      decorators,
      parent: className
    };
  }

  private extractParameters(node: Parser.SyntaxNode): ParameterInfo[] {
    const parameters: ParameterInfo[] = [];
    const paramsNode = this.findChildByType(node, 'formal_parameters');

    if (!paramsNode) {
      return parameters;
    }

    paramsNode.children.forEach((child) => {
      if (child.type === 'identifier' || child.type === 'rest_pattern' ||
          child.type === 'assignment_pattern' || child.type === 'object_pattern' ||
          child.type === 'array_pattern') {
        const param = this.extractParameter(child);
        if (param) {
          parameters.push(param);
        }
      }
    });

    return parameters;
  }

  private extractParameter(node: Parser.SyntaxNode): ParameterInfo | null {
    let name: string;
    let defaultValue: string | undefined;

    if (node.type === 'identifier') {
      name = this.getNodeText(node);
    } else if (node.type === 'rest_pattern') {
      const identifierNode = this.findChildByType(node, 'identifier');
      name = identifierNode ? `...${this.getNodeText(identifierNode)}` : '...';
    } else if (node.type === 'assignment_pattern') {
      const identifierNode = this.findChildByType(node, 'identifier');
      const valueNode = node.children.find(c => c.type !== 'identifier' && c.type !== '=');
      name = identifierNode ? this.getNodeText(identifierNode) : '';
      defaultValue = valueNode ? this.getNodeText(valueNode) : undefined;
    } else if (node.type === 'object_pattern' || node.type === 'array_pattern') {
      name = this.getNodeText(node);
    } else {
      return null;
    }

    return {
      name,
      defaultValue,
      isOptional: !!defaultValue
    };
  }

  private extractClassName(node: Parser.SyntaxNode): string | undefined {
    const nameNode = this.findChildByType(node, 'identifier');
    return nameNode ? this.getNodeText(nameNode) : undefined;
  }

  private extractVisibility(node: Parser.SyntaxNode): 'public' | 'private' | 'protected' | undefined {
    const text = this.getNodeText(node);
    if (text.includes('#')) return 'private';
    return 'public';
  }

  private extractDecorators(node: Parser.SyntaxNode): string[] {
    const decorators: string[] = [];
    let current = node.previousSibling;

    while (current && current.type === 'decorator') {
      decorators.unshift(this.getNodeText(current));
      current = current.previousSibling;
    }

    return decorators;
  }

  private isAsyncFunction(node: Parser.SyntaxNode): boolean {
    return this.getNodeText(node).trimStart().startsWith('async ');
  }

  private isExported(node: Parser.SyntaxNode): boolean {
    let current: Parser.SyntaxNode | null = node;
    while (current) {
      if (current.type === 'export_statement') {
        return true;
      }
      current = current.parent;
    }
    return this.getNodeText(node).trimStart().startsWith('export ');
  }

  private buildSignature(name: string, parameters: ParameterInfo[]): string {
    const params = parameters.map(p => {
      let param = p.name;
      if (p.defaultValue) param += ` = ${p.defaultValue}`;
      return param;
    }).join(', ');

    return `${name}(${params})`;
  }
}
