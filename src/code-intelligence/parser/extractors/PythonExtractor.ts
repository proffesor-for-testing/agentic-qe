import Parser from 'tree-sitter';
import { BaseExtractor, ExtractedSymbol, ParameterInfo } from './BaseExtractor';

export class PythonExtractor extends BaseExtractor {
  extractFunctions(node: Parser.SyntaxNode): ExtractedSymbol[] {
    const functions: ExtractedSymbol[] = [];

    this.traverseTree(node, (currentNode) => {
      if (currentNode.type === 'function_definition') {
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
      if (currentNode.type === 'class_definition') {
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
    const classBody = this.findChildByType(classNode, 'block');

    if (!classBody) {
      return methods;
    }

    const className = this.extractClassName(classNode);

    classBody.children.forEach((child) => {
      if (child.type === 'function_definition') {
        const method = this.extractMethod(child, className);
        if (method) {
          methods.push(method);
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
    const isAsync = this.isAsyncFunction(node);
    const decorators = this.extractDecorators(node);
    const docstring = this.extractDocstring(node);

    return {
      name,
      type: 'function',
      startLine: this.getNodeLine(node),
      endLine: this.getNodeEndLine(node),
      content: this.getNodeText(node),
      signature: this.buildSignature(name, parameters, returnType, docstring),
      parameters,
      returnType,
      isAsync,
      decorators
    };
  }

  private extractClass(node: Parser.SyntaxNode): ExtractedSymbol | null {
    const nameNode = this.findChildByType(node, 'identifier');
    if (!nameNode) {
      return null;
    }

    const name = this.getNodeText(nameNode);
    const decorators = this.extractDecorators(node);
    const docstring = this.extractDocstring(node);

    return {
      name,
      type: 'class',
      startLine: this.getNodeLine(node),
      endLine: this.getNodeEndLine(node),
      content: this.getNodeText(node),
      signature: docstring || name,
      decorators
    };
  }

  private extractMethod(node: Parser.SyntaxNode, className?: string): ExtractedSymbol | null {
    const nameNode = this.findChildByType(node, 'identifier');
    if (!nameNode) {
      return null;
    }

    const name = this.getNodeText(nameNode);
    const parameters = this.extractParameters(node);
    const returnType = this.extractReturnType(node);
    const isAsync = this.isAsyncFunction(node);
    const decorators = this.extractDecorators(node);
    const docstring = this.extractDocstring(node);
    const visibility = this.extractVisibility(name);

    return {
      name,
      type: 'method',
      startLine: this.getNodeLine(node),
      endLine: this.getNodeEndLine(node),
      content: this.getNodeText(node),
      signature: this.buildSignature(name, parameters, returnType, docstring),
      parameters,
      returnType,
      visibility,
      isAsync,
      decorators,
      parent: className
    };
  }

  private extractParameters(node: Parser.SyntaxNode): ParameterInfo[] {
    const parameters: ParameterInfo[] = [];
    const paramsNode = this.findChildByType(node, 'parameters');

    if (!paramsNode) {
      return parameters;
    }

    paramsNode.children.forEach((child) => {
      if (child.type === 'identifier' || child.type === 'typed_parameter' ||
          child.type === 'default_parameter' || child.type === 'typed_default_parameter') {
        const param = this.extractParameter(child);
        if (param && param.name !== 'self' && param.name !== 'cls') {
          parameters.push(param);
        }
      }
    });

    return parameters;
  }

  private extractParameter(node: Parser.SyntaxNode): ParameterInfo | null {
    let name: string;
    let type: string | undefined;
    let defaultValue: string | undefined;

    if (node.type === 'identifier') {
      name = this.getNodeText(node);
    } else if (node.type === 'typed_parameter') {
      const identifierNode = this.findChildByType(node, 'identifier');
      const typeNode = this.findChildByType(node, 'type');
      name = identifierNode ? this.getNodeText(identifierNode) : '';
      type = typeNode ? this.getNodeText(typeNode) : undefined;
    } else if (node.type === 'default_parameter') {
      const identifierNode = this.findChildByType(node, 'identifier');
      const valueNode = node.children.find(c => c.type !== 'identifier' && c.type !== '=');
      name = identifierNode ? this.getNodeText(identifierNode) : '';
      defaultValue = valueNode ? this.getNodeText(valueNode) : undefined;
    } else if (node.type === 'typed_default_parameter') {
      const identifierNode = this.findChildByType(node, 'identifier');
      const typeNode = this.findChildByType(node, 'type');
      const valueNode = node.children.find(c =>
        c.type !== 'identifier' && c.type !== 'type' && c.type !== '=' && c.type !== ':'
      );
      name = identifierNode ? this.getNodeText(identifierNode) : '';
      type = typeNode ? this.getNodeText(typeNode) : undefined;
      defaultValue = valueNode ? this.getNodeText(valueNode) : undefined;
    } else {
      return null;
    }

    return {
      name,
      type,
      defaultValue,
      isOptional: !!defaultValue
    };
  }

  private extractReturnType(node: Parser.SyntaxNode): string | undefined {
    const typeNode = this.findChildByType(node, 'type');
    if (!typeNode) {
      return undefined;
    }

    return this.getNodeText(typeNode);
  }

  private extractClassName(node: Parser.SyntaxNode): string | undefined {
    const nameNode = this.findChildByType(node, 'identifier');
    return nameNode ? this.getNodeText(nameNode) : undefined;
  }

  private extractVisibility(name: string): 'public' | 'private' | 'protected' | undefined {
    if (name.startsWith('__') && !name.endsWith('__')) {
      return 'private';
    }
    if (name.startsWith('_')) {
      return 'protected';
    }
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

  private extractDocstring(node: Parser.SyntaxNode): string | undefined {
    const blockNode = this.findChildByType(node, 'block');
    if (!blockNode || blockNode.children.length === 0) {
      return undefined;
    }

    const firstChild = blockNode.children[0];
    if (firstChild.type === 'expression_statement') {
      const stringNode = this.findChildByType(firstChild, 'string');
      if (stringNode) {
        return this.getNodeText(stringNode).replace(/^['"]|['"]$/g, '');
      }
    }

    return undefined;
  }

  private isAsyncFunction(node: Parser.SyntaxNode): boolean {
    const text = this.getNodeText(node);
    return text.trimStart().startsWith('async def ');
  }

  private buildSignature(name: string, parameters: ParameterInfo[], returnType?: string, docstring?: string): string {
    const params = parameters.map(p => {
      let param = p.name;
      if (p.type) param += `: ${p.type}`;
      if (p.defaultValue) param += ` = ${p.defaultValue}`;
      return param;
    }).join(', ');

    let signature = `${name}(${params})`;
    if (returnType) {
      signature += ` -> ${returnType}`;
    }
    if (docstring) {
      signature += `\n"""${docstring}"""`;
    }
    return signature;
  }
}
