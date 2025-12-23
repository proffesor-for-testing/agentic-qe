import Parser from 'tree-sitter';
import { BaseExtractor, ExtractedSymbol, ParameterInfo } from './BaseExtractor';

export class GoExtractor extends BaseExtractor {
  extractFunctions(node: Parser.SyntaxNode): ExtractedSymbol[] {
    const functions: ExtractedSymbol[] = [];

    this.traverseTree(node, (currentNode) => {
      if (currentNode.type === 'function_declaration') {
        const func = this.extractFunction(currentNode);
        if (func) {
          functions.push(func);
        }
      }
    });

    return functions;
  }

  extractClasses(node: Parser.SyntaxNode): ExtractedSymbol[] {
    const types: ExtractedSymbol[] = [];

    this.traverseTree(node, (currentNode) => {
      if (currentNode.type === 'type_declaration') {
        const typeSymbol = this.extractType(currentNode);
        if (typeSymbol) {
          types.push(typeSymbol);
        }
      }
    });

    return types;
  }

  extractMethods(classNode: Parser.SyntaxNode): ExtractedSymbol[] {
    const methods: ExtractedSymbol[] = [];
    const root = classNode.parent?.parent || classNode;
    const typeName = this.extractTypeName(classNode);

    this.traverseTree(root, (currentNode) => {
      if (currentNode.type === 'method_declaration') {
        const receiverType = this.extractReceiverType(currentNode);
        if (receiverType === typeName) {
          const method = this.extractMethod(currentNode, typeName);
          if (method) {
            methods.push(method);
          }
        }
      }
    });

    return methods;
  }

  private extractFunction(node: Parser.SyntaxNode): ExtractedSymbol | null {
    const nameNode = this.findChildByType(node, 'identifier');
    if (!nameNode) {
      return null;
    }

    const name = this.getNodeText(nameNode);
    const parameters = this.extractParameters(node);
    const returnType = this.extractReturnType(node);
    const isExported = this.isExported(name);

    return {
      name,
      type: 'function',
      startLine: this.getNodeLine(node),
      endLine: this.getNodeEndLine(node),
      content: this.getNodeText(node),
      signature: this.buildSignature(name, parameters, returnType),
      parameters,
      returnType,
      isExported,
      visibility: isExported ? 'public' : 'private'
    };
  }

  private extractType(node: Parser.SyntaxNode): ExtractedSymbol | null {
    const specNode = this.findChildByType(node, 'type_spec');
    if (!specNode) {
      return null;
    }

    const nameNode = this.findChildByType(specNode, 'type_identifier');
    if (!nameNode) {
      return null;
    }

    const name = this.getNodeText(nameNode);
    const isExported = this.isExported(name);

    let symbolType: 'class' | 'interface' | 'type' = 'type';
    const typeNode = specNode.children.find(c =>
      c.type === 'struct_type' || c.type === 'interface_type'
    );

    if (typeNode) {
      symbolType = typeNode.type === 'interface_type' ? 'interface' : 'class';
    }

    return {
      name,
      type: symbolType,
      startLine: this.getNodeLine(node),
      endLine: this.getNodeEndLine(node),
      content: this.getNodeText(node),
      isExported,
      visibility: isExported ? 'public' : 'private'
    };
  }

  private extractMethod(node: Parser.SyntaxNode, receiverType?: string): ExtractedSymbol | null {
    const nameNode = this.findChildByType(node, 'field_identifier');
    if (!nameNode) {
      return null;
    }

    const name = this.getNodeText(nameNode);
    const parameters = this.extractParameters(node);
    const returnType = this.extractReturnType(node);
    const receiver = this.extractReceiver(node);
    const isExported = this.isExported(name);

    return {
      name,
      type: 'method',
      startLine: this.getNodeLine(node),
      endLine: this.getNodeEndLine(node),
      content: this.getNodeText(node),
      signature: this.buildMethodSignature(name, receiver, parameters, returnType),
      parameters,
      returnType,
      isExported,
      visibility: isExported ? 'public' : 'private',
      parent: receiverType
    };
  }

  private extractParameters(node: Parser.SyntaxNode): ParameterInfo[] {
    const parameters: ParameterInfo[] = [];
    const paramsNode = this.findChildByType(node, 'parameter_list');

    if (!paramsNode) {
      return parameters;
    }

    paramsNode.children.forEach((child) => {
      if (child.type === 'parameter_declaration' || child.type === 'variadic_parameter_declaration') {
        const params = this.extractParameter(child);
        parameters.push(...params);
      }
    });

    return parameters;
  }

  private extractParameter(node: Parser.SyntaxNode): ParameterInfo[] {
    const parameters: ParameterInfo[] = [];
    const identifiers: string[] = [];
    let type: string | undefined;

    node.children.forEach((child) => {
      if (child.type === 'identifier') {
        identifiers.push(this.getNodeText(child));
      } else if (child.type !== ',') {
        type = this.getNodeText(child);
      }
    });

    if (identifiers.length === 0 && type) {
      parameters.push({ name: '', type });
    } else {
      identifiers.forEach((name) => {
        parameters.push({ name, type });
      });
    }

    return parameters;
  }

  private extractReturnType(node: Parser.SyntaxNode): string | undefined {
    const resultNode = this.findChildByType(node, 'parameter_list');
    if (!resultNode) {
      return undefined;
    }

    const parentChildren = node.children;
    const resultIndex = parentChildren.findIndex(c => c === resultNode);

    if (resultIndex === -1 || resultIndex + 1 >= parentChildren.length) {
      return undefined;
    }

    const nextNode = parentChildren[resultIndex + 1];
    if (nextNode.type === 'parameter_list') {
      const types = this.extractReturnTypes(nextNode);
      return types.length > 1 ? `(${types.join(', ')})` : types[0];
    } else if (nextNode.type !== 'block') {
      return this.getNodeText(nextNode);
    }

    return undefined;
  }

  private extractReturnTypes(node: Parser.SyntaxNode): string[] {
    const types: string[] = [];

    node.children.forEach((child) => {
      if (child.type === 'parameter_declaration') {
        const typeNode = child.children.find(c => c.type !== 'identifier' && c.type !== ',');
        if (typeNode) {
          types.push(this.getNodeText(typeNode));
        }
      }
    });

    return types;
  }

  private extractReceiver(node: Parser.SyntaxNode): string | undefined {
    const receiverNode = this.findChildByType(node, 'parameter_list');
    if (!receiverNode) {
      return undefined;
    }

    return this.getNodeText(receiverNode);
  }

  private extractReceiverType(node: Parser.SyntaxNode): string | undefined {
    const receiverNode = this.findChildByType(node, 'parameter_list');
    if (!receiverNode) {
      return undefined;
    }

    const typeNode = receiverNode.children.find(c =>
      c.type === 'type_identifier' || c.type === 'pointer_type'
    );

    if (!typeNode) {
      return undefined;
    }

    const text = this.getNodeText(typeNode);
    return text.replace(/^\*/, '');
  }

  private extractTypeName(node: Parser.SyntaxNode): string | undefined {
    const specNode = this.findChildByType(node, 'type_spec');
    if (!specNode) {
      return undefined;
    }

    const nameNode = this.findChildByType(specNode, 'type_identifier');
    return nameNode ? this.getNodeText(nameNode) : undefined;
  }

  private isExported(name: string): boolean {
    return name.length > 0 && name[0] === name[0].toUpperCase();
  }

  private buildSignature(name: string, parameters: ParameterInfo[], returnType?: string): string {
    const params = parameters.map(p => {
      if (p.name) {
        return `${p.name} ${p.type || ''}`.trim();
      }
      return p.type || '';
    }).join(', ');

    let signature = `func ${name}(${params})`;
    if (returnType) {
      signature += ` ${returnType}`;
    }
    return signature;
  }

  private buildMethodSignature(name: string, receiver: string | undefined, parameters: ParameterInfo[], returnType?: string): string {
    const params = parameters.map(p => {
      if (p.name) {
        return `${p.name} ${p.type || ''}`.trim();
      }
      return p.type || '';
    }).join(', ');

    let signature = `func `;
    if (receiver) {
      signature += `${receiver} `;
    }
    signature += `${name}(${params})`;
    if (returnType) {
      signature += ` ${returnType}`;
    }
    return signature;
  }
}
