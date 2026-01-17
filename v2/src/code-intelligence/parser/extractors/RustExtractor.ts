import type Parser from 'web-tree-sitter';

type SyntaxNode = Parser.SyntaxNode;
import { BaseExtractor, ExtractedSymbol, ParameterInfo } from './BaseExtractor.js';

export class RustExtractor extends BaseExtractor {
  extractFunctions(node: SyntaxNode): ExtractedSymbol[] {
    const functions: ExtractedSymbol[] = [];

    this.traverseTree(node, (currentNode) => {
      if (currentNode.type === 'function_item') {
        const func = this.extractFunction(currentNode);
        if (func) {
          functions.push(func);
        }
      }
    });

    return functions;
  }

  extractClasses(node: SyntaxNode): ExtractedSymbol[] {
    const types: ExtractedSymbol[] = [];

    this.traverseTree(node, (currentNode) => {
      if (['struct_item', 'enum_item', 'trait_item'].includes(currentNode.type)) {
        const typeSymbol = this.extractType(currentNode);
        if (typeSymbol) {
          types.push(typeSymbol);
        }
      }
    });

    return types;
  }

  extractMethods(classNode: SyntaxNode): ExtractedSymbol[] {
    const methods: ExtractedSymbol[] = [];
    const root = classNode.parent?.parent || classNode;
    const typeName = this.extractTypeName(classNode);

    this.traverseTree(root, (currentNode) => {
      if (currentNode.type === 'impl_item') {
        const implType = this.extractImplType(currentNode);
        if (implType === typeName) {
          const implMethods = this.extractImplMethods(currentNode, typeName);
          methods.push(...implMethods);
        }
      }
    });

    return methods;
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
    const visibility = this.extractVisibility(node);
    const isExported = visibility === 'public';
    const generics = this.extractGenerics(node);

    return {
      name,
      type: 'function',
      startLine: this.getNodeLine(node),
      endLine: this.getNodeEndLine(node),
      content: this.getNodeText(node),
      signature: this.buildSignature(name, generics, parameters, returnType),
      parameters,
      returnType,
      isAsync,
      isExported,
      visibility
    };
  }

  private extractType(node: SyntaxNode): ExtractedSymbol | null {
    const nameNode = this.findChildByType(node, 'type_identifier');
    if (!nameNode) {
      return null;
    }

    const name = this.getNodeText(nameNode);
    const visibility = this.extractVisibility(node);
    const isExported = visibility === 'public';
    const generics = this.extractGenerics(node);

    let symbolType: 'class' | 'interface' | 'type' = 'type';
    if (node.type === 'struct_item') {
      symbolType = 'class';
    } else if (node.type === 'trait_item') {
      symbolType = 'interface';
    }

    const signature = generics ? `${name}${generics}` : name;

    return {
      name,
      type: symbolType,
      startLine: this.getNodeLine(node),
      endLine: this.getNodeEndLine(node),
      content: this.getNodeText(node),
      signature,
      isExported,
      visibility
    };
  }

  private extractImplMethods(implNode: SyntaxNode, typeName?: string): ExtractedSymbol[] {
    const methods: ExtractedSymbol[] = [];
    const bodyNode = this.findChildByType(implNode, 'declaration_list');

    if (!bodyNode) {
      return methods;
    }

    bodyNode.children.forEach((child) => {
      if (child.type === 'function_item') {
        const method = this.extractMethod(child, typeName);
        if (method) {
          methods.push(method);
        }
      }
    });

    return methods;
  }

  private extractMethod(node: SyntaxNode, typeName?: string): ExtractedSymbol | null {
    const nameNode = this.findChildByType(node, 'identifier');
    if (!nameNode) {
      return null;
    }

    const name = this.getNodeText(nameNode);
    const parameters = this.extractParameters(node);
    const returnType = this.extractReturnType(node);
    const isAsync = this.isAsyncFunction(node);
    const visibility = this.extractVisibility(node);
    const generics = this.extractGenerics(node);

    return {
      name,
      type: 'method',
      startLine: this.getNodeLine(node),
      endLine: this.getNodeEndLine(node),
      content: this.getNodeText(node),
      signature: this.buildSignature(name, generics, parameters, returnType),
      parameters,
      returnType,
      visibility,
      isAsync,
      parent: typeName
    };
  }

  private extractParameters(node: SyntaxNode): ParameterInfo[] {
    const parameters: ParameterInfo[] = [];
    const paramsNode = this.findChildByType(node, 'parameters');

    if (!paramsNode) {
      return parameters;
    }

    paramsNode.children.forEach((child) => {
      if (child.type === 'parameter' || child.type === 'self_parameter') {
        const param = this.extractParameter(child);
        if (param && param.name !== 'self') {
          parameters.push(param);
        }
      }
    });

    return parameters;
  }

  private extractParameter(node: SyntaxNode): ParameterInfo | null {
    if (node.type === 'self_parameter') {
      return { name: 'self', type: this.getNodeText(node) };
    }

    const patternNode = this.findChildByType(node, 'identifier') ||
                        this.findChildByType(node, 'mut_pattern');
    const typeNode = node.children.find(c =>
      c.type !== 'identifier' && c.type !== 'mut_pattern' && c.type !== ':'
    );

    if (!patternNode) {
      return null;
    }

    const name = this.getNodeText(patternNode);
    const type = typeNode ? this.getNodeText(typeNode) : undefined;

    return { name, type };
  }

  private extractReturnType(node: SyntaxNode): string | undefined {
    let returnNode = node.children.find(c => c.type === '->');
    if (!returnNode) {
      return undefined;
    }

    const returnIndex = node.children.indexOf(returnNode);
    const typeNode = node.children[returnIndex + 1];

    if (!typeNode) {
      return undefined;
    }

    return this.getNodeText(typeNode);
  }

  private extractGenerics(node: SyntaxNode): string | undefined {
    const genericsNode = this.findChildByType(node, 'type_parameters');
    if (!genericsNode) {
      return undefined;
    }

    return this.getNodeText(genericsNode);
  }

  private extractImplType(node: SyntaxNode): string | undefined {
    const typeNode = this.findChildByType(node, 'type_identifier');
    if (!typeNode) {
      return undefined;
    }

    return this.getNodeText(typeNode);
  }

  private extractTypeName(node: SyntaxNode): string | undefined {
    const nameNode = this.findChildByType(node, 'type_identifier');
    return nameNode ? this.getNodeText(nameNode) : undefined;
  }

  private extractVisibility(node: SyntaxNode): 'public' | 'private' | 'protected' | undefined {
    const visNode = this.findChildByType(node, 'visibility_modifier');
    if (!visNode) {
      return 'private';
    }

    const text = this.getNodeText(visNode);
    if (text === 'pub') return 'public';
    if (text.startsWith('pub(')) return 'protected';
    return 'private';
  }

  private isAsyncFunction(node: SyntaxNode): boolean {
    return !!node.children.find(c => c.type === 'async');
  }

  private buildSignature(name: string, generics: string | undefined, parameters: ParameterInfo[], returnType?: string): string {
    const params = parameters.map(p => {
      if (p.name === 'self') {
        return p.type || 'self';
      }
      return `${p.name}: ${p.type || '_'}`;
    }).join(', ');

    let signature = `fn ${name}`;
    if (generics) {
      signature += generics;
    }
    signature += `(${params})`;
    if (returnType) {
      signature += ` -> ${returnType}`;
    }
    return signature;
  }
}
