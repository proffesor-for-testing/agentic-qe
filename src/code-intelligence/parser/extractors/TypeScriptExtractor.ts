import type Parser from 'web-tree-sitter';

type SyntaxNode = Parser.SyntaxNode;
import { BaseExtractor, ExtractedSymbol, ParameterInfo } from './BaseExtractor.js';

export class TypeScriptExtractor extends BaseExtractor {
  extractFunctions(node: SyntaxNode): ExtractedSymbol[] {
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

  extractClasses(node: SyntaxNode): ExtractedSymbol[] {
    const classes: ExtractedSymbol[] = [];

    this.traverseTree(node, (currentNode) => {
      if (this.isClassLikeNode(currentNode)) {
        const classSymbol = this.extractClass(currentNode);
        if (classSymbol) {
          classes.push(classSymbol);
        }
      }
    });

    return classes;
  }

  extractMethods(classNode: SyntaxNode): ExtractedSymbol[] {
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

  private isFunctionNode(node: SyntaxNode): boolean {
    return [
      'function_declaration',
      'function_signature',
      'arrow_function',
      'function'
    ].includes(node.type);
  }

  private isClassLikeNode(node: SyntaxNode): boolean {
    return [
      'class_declaration',
      'interface_declaration',
      'type_alias_declaration'
    ].includes(node.type);
  }

  private isMethodNode(node: SyntaxNode): boolean {
    return [
      'method_definition',
      'method_signature',
      'public_field_definition'
    ].includes(node.type);
  }

  private extractFunction(node: SyntaxNode): ExtractedSymbol | null {
    const nameNode = this.findChildByType(node, 'identifier');
    if (!nameNode) {
      return null;
    }

    const name = this.getNodeText(nameNode);
    const parameters = this.extractParameters(node);
    const returnType = this.extractReturnType(node);
    const isAsync = this.isAsyncFunction(node);
    const isExported = this.isExported(node);
    const decorators = this.extractDecorators(node);

    return {
      name,
      type: 'function',
      startLine: this.getNodeLine(node),
      endLine: this.getNodeEndLine(node),
      content: this.getNodeText(node),
      signature: this.buildSignature(name, parameters, returnType),
      parameters,
      returnType,
      isAsync,
      isExported,
      decorators
    };
  }

  private extractClass(node: SyntaxNode): ExtractedSymbol | null {
    const nameNode = this.findChildByType(node, 'type_identifier') ||
                     this.findChildByType(node, 'identifier');

    if (!nameNode) {
      return null;
    }

    const name = this.getNodeText(nameNode);
    const isExported = this.isExported(node);
    const decorators = this.extractDecorators(node);

    let symbolType: 'class' | 'interface' | 'type' = 'class';
    if (node.type === 'interface_declaration') {
      symbolType = 'interface';
    } else if (node.type === 'type_alias_declaration') {
      symbolType = 'type';
    }

    return {
      name,
      type: symbolType,
      startLine: this.getNodeLine(node),
      endLine: this.getNodeEndLine(node),
      content: this.getNodeText(node),
      isExported,
      decorators
    };
  }

  private extractMethod(node: SyntaxNode, className?: string): ExtractedSymbol | null {
    const nameNode = this.findChildByType(node, 'property_identifier') ||
                     this.findChildByType(node, 'identifier');

    if (!nameNode) {
      return null;
    }

    const name = this.getNodeText(nameNode);
    const parameters = this.extractParameters(node);
    const returnType = this.extractReturnType(node);
    const isAsync = this.isAsyncFunction(node);
    const visibility = this.extractVisibility(node);
    const decorators = this.extractDecorators(node);

    return {
      name,
      type: 'method',
      startLine: this.getNodeLine(node),
      endLine: this.getNodeEndLine(node),
      content: this.getNodeText(node),
      signature: this.buildSignature(name, parameters, returnType),
      parameters,
      returnType,
      visibility,
      isAsync,
      decorators,
      parent: className
    };
  }

  private extractParameters(node: SyntaxNode): ParameterInfo[] {
    const parameters: ParameterInfo[] = [];
    const paramsNode = this.findChildByType(node, 'formal_parameters');

    if (!paramsNode) {
      return parameters;
    }

    paramsNode.children.forEach((child) => {
      if (child.type === 'required_parameter' || child.type === 'optional_parameter') {
        const param = this.extractParameter(child);
        if (param) {
          parameters.push(param);
        }
      }
    });

    return parameters;
  }

  private extractParameter(node: SyntaxNode): ParameterInfo | null {
    const identifierNode = this.findChildByType(node, 'identifier');
    if (!identifierNode) {
      return null;
    }

    const name = this.getNodeText(identifierNode);
    const typeNode = this.findChildByType(node, 'type_annotation');
    const type = typeNode ? this.getNodeText(typeNode).replace(/^:\s*/, '') : undefined;
    const isOptional = node.type === 'optional_parameter' || this.getNodeText(node).includes('?');

    let defaultValue: string | undefined;
    const initializerNode = this.findChildByType(node, 'initializer');
    if (initializerNode) {
      defaultValue = this.getNodeText(initializerNode).replace(/^=\s*/, '');
    }

    return {
      name,
      type,
      isOptional,
      defaultValue
    };
  }

  private extractReturnType(node: SyntaxNode): string | undefined {
    const typeNode = this.findChildByType(node, 'type_annotation');
    if (!typeNode) {
      return undefined;
    }

    return this.getNodeText(typeNode).replace(/^:\s*/, '');
  }

  private extractClassName(node: SyntaxNode): string | undefined {
    const nameNode = this.findChildByType(node, 'type_identifier') ||
                     this.findChildByType(node, 'identifier');
    return nameNode ? this.getNodeText(nameNode) : undefined;
  }

  private extractVisibility(node: SyntaxNode): 'public' | 'private' | 'protected' | undefined {
    const text = this.getNodeText(node);
    if (text.includes('private ')) return 'private';
    if (text.includes('protected ')) return 'protected';
    if (text.includes('public ')) return 'public';
    return undefined;
  }

  private extractDecorators(node: SyntaxNode): string[] {
    const decorators: string[] = [];
    let current = node.previousSibling;

    while (current && current.type === 'decorator') {
      decorators.unshift(this.getNodeText(current));
      current = current.previousSibling;
    }

    return decorators;
  }

  private isAsyncFunction(node: SyntaxNode): boolean {
    return this.getNodeText(node).trimStart().startsWith('async ');
  }

  private isExported(node: SyntaxNode): boolean {
    let current: SyntaxNode | null = node;
    while (current) {
      if (current.type === 'export_statement' || current.type === 'export') {
        return true;
      }
      current = current.parent;
    }
    return this.getNodeText(node).trimStart().startsWith('export ');
  }

  private buildSignature(name: string, parameters: ParameterInfo[], returnType?: string): string {
    const params = parameters.map(p => {
      let param = p.name;
      if (p.isOptional) param += '?';
      if (p.type) param += `: ${p.type}`;
      if (p.defaultValue) param += ` = ${p.defaultValue}`;
      return param;
    }).join(', ');

    let signature = `${name}(${params})`;
    if (returnType) {
      signature += `: ${returnType}`;
    }
    return signature;
  }
}
