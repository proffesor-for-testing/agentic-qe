/**
 * FunctionExtractor - Extract functions and methods from TypeScript/JavaScript AST
 *
 * Uses the TypeScript compiler API for accurate AST parsing to extract:
 * - Regular functions (function declarations)
 * - Arrow functions (const/let/var assignments)
 * - Class methods (including static, async, getters/setters)
 * - Object method properties
 *
 * @module vscode-extension/analysis/FunctionExtractor
 * @version 0.1.0
 */

import * as ts from 'typescript';

/**
 * Extracted function information
 */
export interface ExtractedFunction {
  /**
   * Function name (or 'anonymous' for unnamed functions)
   */
  name: string;

  /**
   * Fully qualified name including class prefix
   */
  qualifiedName: string;

  /**
   * Type of function
   */
  kind: FunctionKind;

  /**
   * Parameter information
   */
  parameters: ParameterInfo[];

  /**
   * Return type (if available from type annotation or inference)
   */
  returnType: string | undefined;

  /**
   * Whether the function is async
   */
  isAsync: boolean;

  /**
   * Whether the function is exported
   */
  isExported: boolean;

  /**
   * Whether the function is a generator
   */
  isGenerator: boolean;

  /**
   * Start position (line, column)
   */
  start: Position;

  /**
   * End position (line, column)
   */
  end: Position;

  /**
   * Raw source code of the function
   */
  sourceCode: string;

  /**
   * Function body source (without signature)
   */
  bodyCode: string | undefined;

  /**
   * JSDoc comment if present
   */
  jsdoc: JSDocInfo | undefined;

  /**
   * Modifiers (public, private, protected, static, readonly)
   */
  modifiers: FunctionModifier[];

  /**
   * Parent class name (if method)
   */
  parentClass: string | undefined;

  /**
   * Dependencies - identifiers referenced from outer scope
   */
  dependencies: string[];

  /**
   * AST node kind for debugging
   */
  nodeKind: string;
}

/**
 * Function kinds
 */
export type FunctionKind =
  | 'function'
  | 'arrow-function'
  | 'method'
  | 'constructor'
  | 'getter'
  | 'setter'
  | 'static-method'
  | 'anonymous';

/**
 * Function modifiers
 */
export type FunctionModifier =
  | 'public'
  | 'private'
  | 'protected'
  | 'static'
  | 'readonly'
  | 'abstract'
  | 'async';

/**
 * Parameter information
 */
export interface ParameterInfo {
  /**
   * Parameter name
   */
  name: string;

  /**
   * Parameter type (if annotated)
   */
  type: string | undefined;

  /**
   * Whether parameter is optional
   */
  isOptional: boolean;

  /**
   * Whether parameter is rest parameter
   */
  isRest: boolean;

  /**
   * Default value expression (if any)
   */
  defaultValue: string | undefined;

  /**
   * Whether parameter has decorators
   */
  hasDecorators: boolean;
}

/**
 * JSDoc information
 */
export interface JSDocInfo {
  /**
   * Main description
   */
  description: string;

  /**
   * @param tags
   */
  params: Array<{ name: string; type?: string; description?: string }>;

  /**
   * @returns tag
   */
  returns: { type?: string; description?: string } | undefined;

  /**
   * @throws tags
   */
  throws: Array<{ type?: string; description?: string }>;

  /**
   * @example tags
   */
  examples: string[];

  /**
   * @deprecated tag
   */
  deprecated: string | undefined;

  /**
   * Raw JSDoc text
   */
  raw: string;
}

/**
 * Position in source
 */
export interface Position {
  line: number;
  column: number;
  offset: number;
}

/**
 * Extraction options
 */
export interface ExtractorOptions {
  /**
   * Include anonymous functions
   */
  includeAnonymous?: boolean;

  /**
   * Include nested functions
   */
  includeNested?: boolean;

  /**
   * Include constructors
   */
  includeConstructors?: boolean;

  /**
   * Include getters/setters
   */
  includeAccessors?: boolean;

  /**
   * Extract dependencies (identifiers from outer scope)
   */
  extractDependencies?: boolean;

  /**
   * File extension hint for parser settings
   */
  fileExtension?: string;
}

/**
 * Default extraction options
 */
const DEFAULT_OPTIONS: ExtractorOptions = {
  includeAnonymous: false,
  includeNested: true,
  includeConstructors: true,
  includeAccessors: true,
  extractDependencies: true,
  fileExtension: '.ts',
};

/**
 * FunctionExtractor
 *
 * Extracts function information from TypeScript/JavaScript source code
 * using the TypeScript compiler API for accurate AST parsing.
 */
export class FunctionExtractor {
  private sourceFile: ts.SourceFile | null = null;
  private sourceCode: string = '';
  private options: ExtractorOptions;

  constructor(options: Partial<ExtractorOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Extract all functions from source code
   */
  extract(code: string, fileName: string = 'source.ts'): ExtractedFunction[] {
    this.sourceCode = code;

    // Determine script kind based on file extension
    const scriptKind = this.getScriptKind(fileName);

    // Parse the source code using TypeScript compiler API
    this.sourceFile = ts.createSourceFile(
      fileName,
      code,
      ts.ScriptTarget.Latest,
      true, // setParentNodes
      scriptKind
    );

    const functions: ExtractedFunction[] = [];

    // Walk the AST
    this.visitNode(this.sourceFile, functions, undefined);

    return functions;
  }

  /**
   * Get script kind from file name
   */
  private getScriptKind(fileName: string): ts.ScriptKind {
    if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX;
    if (fileName.endsWith('.ts')) return ts.ScriptKind.TS;
    if (fileName.endsWith('.jsx')) return ts.ScriptKind.JSX;
    if (fileName.endsWith('.js')) return ts.ScriptKind.JS;
    return ts.ScriptKind.TS; // Default to TypeScript
  }

  /**
   * Visit a node and its children
   */
  private visitNode(
    node: ts.Node,
    functions: ExtractedFunction[],
    parentClass: string | undefined
  ): void {
    // Check if this node is a function-like declaration
    if (ts.isFunctionDeclaration(node)) {
      const func = this.extractFunctionDeclaration(node, parentClass);
      if (func) functions.push(func);
    } else if (ts.isArrowFunction(node)) {
      const func = this.extractArrowFunction(node, parentClass);
      if (func && (this.options.includeAnonymous || func.name !== 'anonymous')) {
        functions.push(func);
      }
    } else if (ts.isFunctionExpression(node)) {
      const func = this.extractFunctionExpression(node, parentClass);
      if (func && (this.options.includeAnonymous || func.name !== 'anonymous')) {
        functions.push(func);
      }
    } else if (ts.isMethodDeclaration(node)) {
      const func = this.extractMethodDeclaration(node, parentClass);
      if (func) functions.push(func);
    } else if (ts.isConstructorDeclaration(node)) {
      if (this.options.includeConstructors) {
        const func = this.extractConstructor(node, parentClass);
        if (func) functions.push(func);
      }
    } else if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
      if (this.options.includeAccessors) {
        const func = this.extractAccessor(node, parentClass);
        if (func) functions.push(func);
      }
    } else if (ts.isVariableDeclaration(node)) {
      // Check for arrow function or function expression assignment
      const func = this.extractVariableFunction(node, parentClass);
      if (func) functions.push(func);
    } else if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      // Process class members with class name context
      const className = node.name?.getText(this.sourceFile!) || 'AnonymousClass';
      ts.forEachChild(node, (child) => this.visitNode(child, functions, className));
      return; // Don't recurse again
    }

    // Continue visiting children for nested functions
    if (this.options.includeNested) {
      ts.forEachChild(node, (child) => this.visitNode(child, functions, parentClass));
    }
  }

  /**
   * Extract a function declaration
   */
  private extractFunctionDeclaration(
    node: ts.FunctionDeclaration,
    parentClass: string | undefined
  ): ExtractedFunction | null {
    const name = node.name?.getText(this.sourceFile!) || 'anonymous';
    const qualifiedName = parentClass ? `${parentClass}.${name}` : name;

    return {
      name,
      qualifiedName,
      kind: 'function',
      parameters: this.extractParameters(node.parameters),
      returnType: this.getTypeText(node.type),
      isAsync: this.hasModifier(node, ts.SyntaxKind.AsyncKeyword),
      isExported: this.isExported(node),
      isGenerator: !!node.asteriskToken,
      start: this.getPosition(node.getStart(this.sourceFile!)),
      end: this.getPosition(node.getEnd()),
      sourceCode: node.getText(this.sourceFile!),
      bodyCode: node.body ? node.body.getText(this.sourceFile!) : undefined,
      jsdoc: this.extractJSDoc(node),
      modifiers: this.extractModifiers(node),
      parentClass,
      dependencies: this.options.extractDependencies
        ? this.extractDependencies(node)
        : [],
      nodeKind: ts.SyntaxKind[node.kind],
    };
  }

  /**
   * Extract an arrow function
   */
  private extractArrowFunction(
    node: ts.ArrowFunction,
    parentClass: string | undefined
  ): ExtractedFunction | null {
    // Try to get name from parent variable declaration
    const name = this.getArrowFunctionName(node);
    const qualifiedName = parentClass ? `${parentClass}.${name}` : name;

    return {
      name,
      qualifiedName,
      kind: 'arrow-function',
      parameters: this.extractParameters(node.parameters),
      returnType: this.getTypeText(node.type),
      isAsync: this.hasModifier(node, ts.SyntaxKind.AsyncKeyword),
      isExported: this.isParentExported(node),
      isGenerator: false,
      start: this.getPosition(node.getStart(this.sourceFile!)),
      end: this.getPosition(node.getEnd()),
      sourceCode: node.getText(this.sourceFile!),
      bodyCode: ts.isBlock(node.body)
        ? node.body.getText(this.sourceFile!)
        : node.body.getText(this.sourceFile!),
      jsdoc: this.extractJSDoc(node),
      modifiers: this.extractModifiers(node),
      parentClass,
      dependencies: this.options.extractDependencies
        ? this.extractDependencies(node)
        : [],
      nodeKind: ts.SyntaxKind[node.kind],
    };
  }

  /**
   * Extract a function expression
   */
  private extractFunctionExpression(
    node: ts.FunctionExpression,
    parentClass: string | undefined
  ): ExtractedFunction | null {
    const name = node.name?.getText(this.sourceFile!) || this.getFunctionExpressionName(node);
    const qualifiedName = parentClass ? `${parentClass}.${name}` : name;

    return {
      name,
      qualifiedName,
      kind: 'function',
      parameters: this.extractParameters(node.parameters),
      returnType: this.getTypeText(node.type),
      isAsync: this.hasModifier(node, ts.SyntaxKind.AsyncKeyword),
      isExported: this.isParentExported(node),
      isGenerator: !!node.asteriskToken,
      start: this.getPosition(node.getStart(this.sourceFile!)),
      end: this.getPosition(node.getEnd()),
      sourceCode: node.getText(this.sourceFile!),
      bodyCode: node.body ? node.body.getText(this.sourceFile!) : undefined,
      jsdoc: this.extractJSDoc(node),
      modifiers: this.extractModifiers(node),
      parentClass,
      dependencies: this.options.extractDependencies
        ? this.extractDependencies(node)
        : [],
      nodeKind: ts.SyntaxKind[node.kind],
    };
  }

  /**
   * Extract a method declaration
   */
  private extractMethodDeclaration(
    node: ts.MethodDeclaration,
    parentClass: string | undefined
  ): ExtractedFunction | null {
    const name = node.name.getText(this.sourceFile!);
    const isStatic = this.hasModifier(node, ts.SyntaxKind.StaticKeyword);
    const qualifiedName = parentClass ? `${parentClass}.${name}` : name;

    return {
      name,
      qualifiedName,
      kind: isStatic ? 'static-method' : 'method',
      parameters: this.extractParameters(node.parameters),
      returnType: this.getTypeText(node.type),
      isAsync: this.hasModifier(node, ts.SyntaxKind.AsyncKeyword),
      isExported: false, // Methods inherit export from class
      isGenerator: !!node.asteriskToken,
      start: this.getPosition(node.getStart(this.sourceFile!)),
      end: this.getPosition(node.getEnd()),
      sourceCode: node.getText(this.sourceFile!),
      bodyCode: node.body ? node.body.getText(this.sourceFile!) : undefined,
      jsdoc: this.extractJSDoc(node),
      modifiers: this.extractModifiers(node),
      parentClass,
      dependencies: this.options.extractDependencies
        ? this.extractDependencies(node)
        : [],
      nodeKind: ts.SyntaxKind[node.kind],
    };
  }

  /**
   * Extract a constructor
   */
  private extractConstructor(
    node: ts.ConstructorDeclaration,
    parentClass: string | undefined
  ): ExtractedFunction | null {
    const name = 'constructor';
    const qualifiedName = parentClass ? `${parentClass}.constructor` : 'constructor';

    return {
      name,
      qualifiedName,
      kind: 'constructor',
      parameters: this.extractParameters(node.parameters),
      returnType: undefined,
      isAsync: false,
      isExported: false,
      isGenerator: false,
      start: this.getPosition(node.getStart(this.sourceFile!)),
      end: this.getPosition(node.getEnd()),
      sourceCode: node.getText(this.sourceFile!),
      bodyCode: node.body ? node.body.getText(this.sourceFile!) : undefined,
      jsdoc: this.extractJSDoc(node),
      modifiers: this.extractModifiers(node),
      parentClass,
      dependencies: this.options.extractDependencies
        ? this.extractDependencies(node)
        : [],
      nodeKind: ts.SyntaxKind[node.kind],
    };
  }

  /**
   * Extract a getter or setter
   */
  private extractAccessor(
    node: ts.GetAccessorDeclaration | ts.SetAccessorDeclaration,
    parentClass: string | undefined
  ): ExtractedFunction | null {
    const name = node.name.getText(this.sourceFile!);
    const kind: FunctionKind = ts.isGetAccessorDeclaration(node) ? 'getter' : 'setter';
    const qualifiedName = parentClass ? `${parentClass}.${name}` : name;

    return {
      name,
      qualifiedName,
      kind,
      parameters: this.extractParameters(node.parameters),
      returnType: ts.isGetAccessorDeclaration(node) ? this.getTypeText(node.type) : undefined,
      isAsync: false,
      isExported: false,
      isGenerator: false,
      start: this.getPosition(node.getStart(this.sourceFile!)),
      end: this.getPosition(node.getEnd()),
      sourceCode: node.getText(this.sourceFile!),
      bodyCode: node.body ? node.body.getText(this.sourceFile!) : undefined,
      jsdoc: this.extractJSDoc(node),
      modifiers: this.extractModifiers(node),
      parentClass,
      dependencies: this.options.extractDependencies
        ? this.extractDependencies(node)
        : [],
      nodeKind: ts.SyntaxKind[node.kind],
    };
  }

  /**
   * Extract function from variable declaration
   */
  private extractVariableFunction(
    node: ts.VariableDeclaration,
    parentClass: string | undefined
  ): ExtractedFunction | null {
    if (!node.initializer) return null;

    // Check if initializer is a function
    if (
      ts.isArrowFunction(node.initializer) ||
      ts.isFunctionExpression(node.initializer)
    ) {
      // Will be handled by visitNode when it visits the initializer
      return null;
    }

    return null;
  }

  /**
   * Extract parameters from parameter list
   */
  private extractParameters(
    params: ts.NodeArray<ts.ParameterDeclaration>
  ): ParameterInfo[] {
    return params.map((param) => ({
      name: param.name.getText(this.sourceFile!),
      type: this.getTypeText(param.type),
      isOptional: !!param.questionToken,
      isRest: !!param.dotDotDotToken,
      defaultValue: param.initializer
        ? param.initializer.getText(this.sourceFile!)
        : undefined,
      hasDecorators: (ts.getDecorators(param) || []).length > 0,
    }));
  }

  /**
   * Extract modifiers from a node
   */
  private extractModifiers(node: ts.Node): FunctionModifier[] {
    const modifiers: FunctionModifier[] = [];
    const nodeModifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : [];

    if (nodeModifiers) {
      for (const mod of nodeModifiers) {
        switch (mod.kind) {
          case ts.SyntaxKind.PublicKeyword:
            modifiers.push('public');
            break;
          case ts.SyntaxKind.PrivateKeyword:
            modifiers.push('private');
            break;
          case ts.SyntaxKind.ProtectedKeyword:
            modifiers.push('protected');
            break;
          case ts.SyntaxKind.StaticKeyword:
            modifiers.push('static');
            break;
          case ts.SyntaxKind.ReadonlyKeyword:
            modifiers.push('readonly');
            break;
          case ts.SyntaxKind.AbstractKeyword:
            modifiers.push('abstract');
            break;
          case ts.SyntaxKind.AsyncKeyword:
            modifiers.push('async');
            break;
        }
      }
    }

    return modifiers;
  }

  /**
   * Check if node has a specific modifier
   */
  private hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : [];
    return modifiers?.some((mod) => mod.kind === kind) || false;
  }

  /**
   * Check if a node is exported
   */
  private isExported(node: ts.Node): boolean {
    return this.hasModifier(node, ts.SyntaxKind.ExportKeyword);
  }

  /**
   * Check if parent is exported (for arrow functions in variable declarations)
   */
  private isParentExported(node: ts.Node): boolean {
    let current = node.parent;
    while (current) {
      if (ts.isVariableStatement(current)) {
        return this.isExported(current);
      }
      current = current.parent;
    }
    return false;
  }

  /**
   * Get the name of an arrow function from its variable declaration
   */
  private getArrowFunctionName(node: ts.ArrowFunction): string {
    let current = node.parent;
    while (current) {
      if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
        return current.name.getText(this.sourceFile!);
      }
      if (ts.isPropertyDeclaration(current) || ts.isPropertyAssignment(current)) {
        return current.name.getText(this.sourceFile!);
      }
      current = current.parent;
    }
    return 'anonymous';
  }

  /**
   * Get the name of a function expression from its variable declaration
   */
  private getFunctionExpressionName(node: ts.FunctionExpression): string {
    let current = node.parent;
    while (current) {
      if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
        return current.name.getText(this.sourceFile!);
      }
      current = current.parent;
    }
    return 'anonymous';
  }

  /**
   * Get type text from type node
   */
  private getTypeText(typeNode: ts.TypeNode | undefined): string | undefined {
    if (!typeNode) return undefined;
    return typeNode.getText(this.sourceFile!);
  }

  /**
   * Get position from offset
   */
  private getPosition(offset: number): Position {
    const lineAndChar = this.sourceFile!.getLineAndCharacterOfPosition(offset);
    return {
      line: lineAndChar.line,
      column: lineAndChar.character,
      offset,
    };
  }

  /**
   * Extract JSDoc comment from node
   */
  private extractJSDoc(node: ts.Node): JSDocInfo | undefined {
    const jsDocNodes = ts.getJSDocCommentsAndTags(node);
    if (!jsDocNodes || jsDocNodes.length === 0) return undefined;

    const jsDocComment = jsDocNodes.find(ts.isJSDoc);
    if (!jsDocComment) return undefined;

    const params: Array<{ name: string; type?: string; description?: string }> = [];
    const throws: Array<{ type?: string; description?: string }> = [];
    const examples: string[] = [];
    let returns: { type?: string; description?: string } | undefined;
    let deprecated: string | undefined;

    // Process JSDoc tags
    if (jsDocComment.tags) {
      for (const tag of jsDocComment.tags) {
        if (ts.isJSDocParameterTag(tag)) {
          params.push({
            name: tag.name.getText(this.sourceFile!),
            type: tag.typeExpression?.getText(this.sourceFile!),
            description: typeof tag.comment === 'string' ? tag.comment : undefined,
          });
        } else if (ts.isJSDocReturnTag(tag)) {
          returns = {
            type: tag.typeExpression?.getText(this.sourceFile!),
            description: typeof tag.comment === 'string' ? tag.comment : undefined,
          };
        } else if (tag.tagName.getText(this.sourceFile!) === 'throws') {
          throws.push({
            description: typeof tag.comment === 'string' ? tag.comment : undefined,
          });
        } else if (tag.tagName.getText(this.sourceFile!) === 'example') {
          if (typeof tag.comment === 'string') {
            examples.push(tag.comment);
          }
        } else if (ts.isJSDocDeprecatedTag(tag)) {
          deprecated = typeof tag.comment === 'string' ? tag.comment : '';
        }
      }
    }

    return {
      description:
        typeof jsDocComment.comment === 'string'
          ? jsDocComment.comment
          : jsDocComment.comment
            ?.map((c) => c.text)
            .join('')
            .trim() || '',
      params,
      returns,
      throws,
      examples,
      deprecated,
      raw: jsDocComment.getText(this.sourceFile!),
    };
  }

  /**
   * Extract dependencies (identifiers referenced from outer scope)
   */
  private extractDependencies(node: ts.FunctionLikeDeclaration): string[] {
    const dependencies = new Set<string>();
    const localDeclarations = new Set<string>();

    // Collect local declarations (parameters and local variables)
    for (const param of node.parameters) {
      if (ts.isIdentifier(param.name)) {
        localDeclarations.add(param.name.getText(this.sourceFile!));
      }
    }

    const collectLocals = (n: ts.Node): void => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
        localDeclarations.add(n.name.getText(this.sourceFile!));
      }
      ts.forEachChild(n, collectLocals);
    };

    if (node.body) {
      ts.forEachChild(node.body, collectLocals);
    }

    // Find identifiers that aren't locally declared
    const collectDependencies = (n: ts.Node): void => {
      if (ts.isIdentifier(n)) {
        const name = n.getText(this.sourceFile!);

        // Skip if it's a local declaration
        if (localDeclarations.has(name)) return;

        // Skip if it's a property access (like obj.method)
        if (n.parent && ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) {
          return;
        }

        // Skip built-in globals
        const builtins = new Set([
          'undefined',
          'null',
          'true',
          'false',
          'console',
          'window',
          'document',
          'global',
          'process',
          'Promise',
          'Array',
          'Object',
          'String',
          'Number',
          'Boolean',
          'Error',
          'Math',
          'JSON',
          'Date',
          'RegExp',
          'Map',
          'Set',
          'WeakMap',
          'WeakSet',
          'Symbol',
        ]);
        if (builtins.has(name)) return;

        dependencies.add(name);
      }
      ts.forEachChild(n, collectDependencies);
    };

    if (node.body) {
      ts.forEachChild(node.body, collectDependencies);
    }

    return Array.from(dependencies);
  }
}
