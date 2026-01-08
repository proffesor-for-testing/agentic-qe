/**
 * Agentic QE v3 - TypeScript AST Parser
 * Wrapper around TypeScript Compiler API for code analysis
 */

import * as ts from 'typescript';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Information about a function parameter
 */
export interface ParameterInfo {
  name: string;
  type: string | undefined;
  isOptional: boolean;
  isRest: boolean;
  defaultValue: string | undefined;
}

/**
 * Information about a function (declaration or arrow function)
 */
export interface FunctionInfo {
  name: string;
  parameters: ParameterInfo[];
  returnType: string | undefined;
  startLine: number;
  endLine: number;
  isAsync: boolean;
  isExported: boolean;
  isGenerator: boolean;
  typeParameters: string[];
}

/**
 * Information about a class property
 */
export interface PropertyInfo {
  name: string;
  type: string | undefined;
  isStatic: boolean;
  isReadonly: boolean;
  visibility: 'public' | 'private' | 'protected';
  hasInitializer: boolean;
}

/**
 * Information about a class method
 */
export interface MethodInfo {
  name: string;
  parameters: ParameterInfo[];
  returnType: string | undefined;
  isAsync: boolean;
  isStatic: boolean;
  isAbstract: boolean;
  visibility: 'public' | 'private' | 'protected';
  startLine: number;
  endLine: number;
}

/**
 * Information about a class
 */
export interface ClassInfo {
  name: string;
  methods: MethodInfo[];
  properties: PropertyInfo[];
  extends: string | undefined;
  implements: string[];
  isAbstract: boolean;
  isExported: boolean;
  startLine: number;
  endLine: number;
  typeParameters: string[];
}

/**
 * Information about named imports
 */
export interface NamedImportInfo {
  name: string;
  alias: string | undefined;
}

/**
 * Information about an import statement
 */
export interface ImportInfo {
  module: string;
  namedImports: NamedImportInfo[];
  defaultImport: string | undefined;
  namespaceImport: string | undefined;
  isTypeOnly: boolean;
}

/**
 * Information about an export
 */
export interface ExportInfo {
  name: string;
  type: 'function' | 'class' | 'variable' | 'interface' | 'type' | 'enum' | 'namespace' | 'unknown';
  isDefault: boolean;
  isReexport: boolean;
  sourceModule: string | undefined;
}

/**
 * Information about an interface property
 */
export interface InterfacePropertyInfo {
  name: string;
  type: string | undefined;
  isOptional: boolean;
  isReadonly: boolean;
}

/**
 * Information about an interface method
 */
export interface InterfaceMethodInfo {
  name: string;
  parameters: ParameterInfo[];
  returnType: string | undefined;
  isOptional: boolean;
}

/**
 * Information about an interface
 */
export interface InterfaceInfo {
  name: string;
  properties: InterfacePropertyInfo[];
  methods: InterfaceMethodInfo[];
  extends: string[];
  isExported: boolean;
  startLine: number;
  endLine: number;
  typeParameters: string[];
}

/**
 * Visibility modifier type
 */
export type Visibility = 'public' | 'private' | 'protected' | 'internal';

/**
 * Entity type for parsed code elements
 */
export type ParsedEntityType = 'function' | 'class' | 'interface' | 'type' | 'variable' | 'enum' | 'module';

/**
 * Parsed entity representing a code element
 */
export interface ParsedEntity {
  name: string;
  type: ParsedEntityType;
  line: number;
  endLine?: number;
  visibility: Visibility;
  isAsync: boolean;
  isExported: boolean;
  parameters?: ParameterInfo[];
  returnType?: string;
  extends?: string;
  implements?: string[];
}

// ============================================================================
// TypeScript Parser Implementation
// ============================================================================

/**
 * TypeScript AST Parser
 * Provides methods to parse TypeScript source code and extract structural information
 */
export class TypeScriptParser {
  /**
   * Parse a TypeScript file and return the AST SourceFile
   */
  parseFile(filePath: string, content: string): ts.SourceFile {
    return ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      this.getScriptKind(filePath)
    );
  }

  /**
   * Extract all functions from the AST
   */
  extractFunctions(ast: ts.SourceFile): FunctionInfo[] {
    const functions: FunctionInfo[] = [];

    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name) {
        functions.push(this.extractFunctionDeclaration(node, ast));
      } else if (ts.isVariableStatement(node)) {
        this.extractArrowFunctions(node, ast, functions);
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(ast, visit);
    return functions;
  }

  /**
   * Extract all classes from the AST
   */
  extractClasses(ast: ts.SourceFile): ClassInfo[] {
    const classes: ClassInfo[] = [];

    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node) && node.name) {
        classes.push(this.extractClassDeclaration(node, ast));
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(ast, visit);
    return classes;
  }

  /**
   * Extract all imports from the AST
   */
  extractImports(ast: ts.SourceFile): ImportInfo[] {
    const imports: ImportInfo[] = [];

    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node)) {
        imports.push(this.extractImportDeclaration(node));
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(ast, visit);
    return imports;
  }

  /**
   * Extract all exports from the AST
   */
  extractExports(ast: ts.SourceFile): ExportInfo[] {
    const exports: ExportInfo[] = [];

    const visit = (node: ts.Node): void => {
      // Export declarations (export { ... })
      if (ts.isExportDeclaration(node)) {
        this.extractExportDeclaration(node, exports);
      }
      // Export assignment (export default ...)
      else if (ts.isExportAssignment(node)) {
        exports.push({
          name: this.getExportAssignmentName(node),
          type: 'unknown',
          isDefault: true,
          isReexport: false,
          sourceModule: undefined,
        });
      }
      // Exported function declarations
      else if (ts.isFunctionDeclaration(node) && node.name && this.hasExportModifier(node)) {
        exports.push({
          name: node.name.text,
          type: 'function',
          isDefault: this.hasDefaultModifier(node),
          isReexport: false,
          sourceModule: undefined,
        });
      }
      // Exported class declarations
      else if (ts.isClassDeclaration(node) && node.name && this.hasExportModifier(node)) {
        exports.push({
          name: node.name.text,
          type: 'class',
          isDefault: this.hasDefaultModifier(node),
          isReexport: false,
          sourceModule: undefined,
        });
      }
      // Exported variable statements
      else if (ts.isVariableStatement(node) && this.hasExportModifier(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) {
            exports.push({
              name: declaration.name.text,
              type: 'variable',
              isDefault: false,
              isReexport: false,
              sourceModule: undefined,
            });
          }
        }
      }
      // Exported interface declarations
      else if (ts.isInterfaceDeclaration(node) && this.hasExportModifier(node)) {
        exports.push({
          name: node.name.text,
          type: 'interface',
          isDefault: false,
          isReexport: false,
          sourceModule: undefined,
        });
      }
      // Exported type aliases
      else if (ts.isTypeAliasDeclaration(node) && this.hasExportModifier(node)) {
        exports.push({
          name: node.name.text,
          type: 'type',
          isDefault: false,
          isReexport: false,
          sourceModule: undefined,
        });
      }
      // Exported enum declarations
      else if (ts.isEnumDeclaration(node) && this.hasExportModifier(node)) {
        exports.push({
          name: node.name.text,
          type: 'enum',
          isDefault: false,
          isReexport: false,
          sourceModule: undefined,
        });
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(ast, visit);
    return exports;
  }

  /**
   * Extract all interfaces from the AST
   */
  extractInterfaces(ast: ts.SourceFile): InterfaceInfo[] {
    const interfaces: InterfaceInfo[] = [];

    const visit = (node: ts.Node): void => {
      if (ts.isInterfaceDeclaration(node)) {
        interfaces.push(this.extractInterfaceDeclaration(node, ast));
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(ast, visit);
    return interfaces;
  }

  /**
   * Extract all entities (functions, classes, interfaces, etc.) from source code
   * This is a convenience method that combines all extraction methods
   */
  extractEntities(content: string, filePath: string): ParsedEntity[] {
    const ast = this.parseFile(filePath, content);
    const entities: ParsedEntity[] = [];

    // Extract functions
    const functions = this.extractFunctions(ast);
    for (const func of functions) {
      entities.push({
        name: func.name,
        type: 'function',
        line: func.startLine,
        endLine: func.endLine,
        visibility: func.isExported ? 'public' : 'internal',
        isAsync: func.isAsync,
        isExported: func.isExported,
        parameters: func.parameters,
        returnType: func.returnType,
      });
    }

    // Extract classes
    const classes = this.extractClasses(ast);
    for (const cls of classes) {
      entities.push({
        name: cls.name,
        type: 'class',
        line: cls.startLine,
        endLine: cls.endLine,
        visibility: cls.isExported ? 'public' : 'internal',
        isAsync: false,
        isExported: cls.isExported,
        extends: cls.extends,
        implements: cls.implements,
      });
    }

    // Extract interfaces
    const interfaces = this.extractInterfaces(ast);
    for (const iface of interfaces) {
      entities.push({
        name: iface.name,
        type: 'interface',
        line: iface.startLine,
        endLine: iface.endLine,
        visibility: iface.isExported ? 'public' : 'internal',
        isAsync: false,
        isExported: iface.isExported,
      });
    }

    return entities;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private getScriptKind(filePath: string): ts.ScriptKind {
    if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
    if (filePath.endsWith('.ts')) return ts.ScriptKind.TS;
    if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
    if (filePath.endsWith('.js')) return ts.ScriptKind.JS;
    return ts.ScriptKind.TS;
  }

  private extractFunctionDeclaration(
    node: ts.FunctionDeclaration,
    sourceFile: ts.SourceFile
  ): FunctionInfo {
    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    return {
      name: node.name?.text ?? 'anonymous',
      parameters: this.extractParameters(node.parameters),
      returnType: node.type ? node.type.getText(sourceFile) : undefined,
      startLine: startLine + 1,
      endLine: endLine + 1,
      isAsync: this.hasAsyncModifier(node),
      isExported: this.hasExportModifier(node),
      isGenerator: !!node.asteriskToken,
      typeParameters: this.extractTypeParameters(node.typeParameters),
    };
  }

  private extractArrowFunctions(
    node: ts.VariableStatement,
    sourceFile: ts.SourceFile,
    functions: FunctionInfo[]
  ): void {
    for (const declaration of node.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        ts.isArrowFunction(declaration.initializer)
      ) {
        const arrow = declaration.initializer;
        const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

        functions.push({
          name: declaration.name.text,
          parameters: this.extractParameters(arrow.parameters),
          returnType: arrow.type ? arrow.type.getText(sourceFile) : undefined,
          startLine: startLine + 1,
          endLine: endLine + 1,
          isAsync: this.hasAsyncModifier(arrow),
          isExported: this.hasExportModifier(node),
          isGenerator: false,
          typeParameters: this.extractTypeParameters(arrow.typeParameters),
        });
      }
    }
  }

  private extractClassDeclaration(
    node: ts.ClassDeclaration,
    sourceFile: ts.SourceFile
  ): ClassInfo {
    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    const methods: MethodInfo[] = [];
    const properties: PropertyInfo[] = [];

    for (const member of node.members) {
      if (ts.isMethodDeclaration(member) && member.name) {
        methods.push(this.extractMethodDeclaration(member, sourceFile));
      } else if (ts.isPropertyDeclaration(member) && member.name) {
        properties.push(this.extractPropertyDeclaration(member, sourceFile));
      } else if (ts.isConstructorDeclaration(member)) {
        // Extract constructor as a method
        methods.push(this.extractConstructor(member, sourceFile));
        // Also extract parameter properties
        this.extractParameterProperties(member, properties, sourceFile);
      }
    }

    let extendsClause: string | undefined;
    const implementsClause: string[] = [];

    if (node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
          extendsClause = clause.types[0]?.expression.getText(sourceFile);
        } else if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
          for (const type of clause.types) {
            implementsClause.push(type.expression.getText(sourceFile));
          }
        }
      }
    }

    return {
      name: node.name?.text ?? 'anonymous',
      methods,
      properties,
      extends: extendsClause,
      implements: implementsClause,
      isAbstract: this.hasAbstractModifier(node),
      isExported: this.hasExportModifier(node),
      startLine: startLine + 1,
      endLine: endLine + 1,
      typeParameters: this.extractTypeParameters(node.typeParameters),
    };
  }

  private extractMethodDeclaration(
    node: ts.MethodDeclaration,
    sourceFile: ts.SourceFile
  ): MethodInfo {
    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    return {
      name: this.getPropertyName(node.name, sourceFile),
      parameters: this.extractParameters(node.parameters),
      returnType: node.type ? node.type.getText(sourceFile) : undefined,
      isAsync: this.hasAsyncModifier(node),
      isStatic: this.hasStaticModifier(node),
      isAbstract: this.hasAbstractModifier(node),
      visibility: this.getVisibility(node),
      startLine: startLine + 1,
      endLine: endLine + 1,
    };
  }

  private extractConstructor(
    node: ts.ConstructorDeclaration,
    sourceFile: ts.SourceFile
  ): MethodInfo {
    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    return {
      name: 'constructor',
      parameters: this.extractParameters(node.parameters),
      returnType: undefined,
      isAsync: false,
      isStatic: false,
      isAbstract: false,
      visibility: 'public',
      startLine: startLine + 1,
      endLine: endLine + 1,
    };
  }

  private extractParameterProperties(
    node: ts.ConstructorDeclaration,
    properties: PropertyInfo[],
    sourceFile: ts.SourceFile
  ): void {
    for (const param of node.parameters) {
      if (this.isParameterProperty(param)) {
        properties.push({
          name: ts.isIdentifier(param.name) ? param.name.text : param.name.getText(sourceFile),
          type: param.type ? param.type.getText(sourceFile) : undefined,
          isStatic: false,
          isReadonly: this.hasReadonlyModifier(param),
          visibility: this.getVisibility(param),
          hasInitializer: !!param.initializer,
        });
      }
    }
  }

  private isParameterProperty(param: ts.ParameterDeclaration): boolean {
    return !!(
      param.modifiers?.some(
        (m) =>
          m.kind === ts.SyntaxKind.PublicKeyword ||
          m.kind === ts.SyntaxKind.PrivateKeyword ||
          m.kind === ts.SyntaxKind.ProtectedKeyword ||
          m.kind === ts.SyntaxKind.ReadonlyKeyword
      )
    );
  }

  private extractPropertyDeclaration(
    node: ts.PropertyDeclaration,
    sourceFile: ts.SourceFile
  ): PropertyInfo {
    return {
      name: this.getPropertyName(node.name, sourceFile),
      type: node.type ? node.type.getText(sourceFile) : undefined,
      isStatic: this.hasStaticModifier(node),
      isReadonly: this.hasReadonlyModifier(node),
      visibility: this.getVisibility(node),
      hasInitializer: !!node.initializer,
    };
  }

  private extractImportDeclaration(node: ts.ImportDeclaration): ImportInfo {
    const module = (node.moduleSpecifier as ts.StringLiteral).text;
    const namedImports: NamedImportInfo[] = [];
    let defaultImport: string | undefined;
    let namespaceImport: string | undefined;
    const isTypeOnly = node.importClause?.isTypeOnly ?? false;

    if (node.importClause) {
      // Default import
      if (node.importClause.name) {
        defaultImport = node.importClause.name.text;
      }

      // Named bindings
      if (node.importClause.namedBindings) {
        if (ts.isNamespaceImport(node.importClause.namedBindings)) {
          // Namespace import: import * as X from '...'
          namespaceImport = node.importClause.namedBindings.name.text;
        } else if (ts.isNamedImports(node.importClause.namedBindings)) {
          // Named imports: import { A, B as C } from '...'
          for (const element of node.importClause.namedBindings.elements) {
            namedImports.push({
              name: element.propertyName?.text ?? element.name.text,
              alias: element.propertyName ? element.name.text : undefined,
            });
          }
        }
      }
    }

    return {
      module,
      namedImports,
      defaultImport,
      namespaceImport,
      isTypeOnly,
    };
  }

  private extractExportDeclaration(
    node: ts.ExportDeclaration,
    exports: ExportInfo[]
  ): void {
    const sourceModule = node.moduleSpecifier
      ? (node.moduleSpecifier as ts.StringLiteral).text
      : undefined;

    if (node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) {
        exports.push({
          name: element.name.text,
          type: 'unknown',
          isDefault: false,
          isReexport: !!sourceModule,
          sourceModule,
        });
      }
    } else if (!node.exportClause && sourceModule) {
      // export * from '...'
      exports.push({
        name: '*',
        type: 'unknown',
        isDefault: false,
        isReexport: true,
        sourceModule,
      });
    }
  }

  private extractInterfaceDeclaration(
    node: ts.InterfaceDeclaration,
    sourceFile: ts.SourceFile
  ): InterfaceInfo {
    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    const properties: InterfacePropertyInfo[] = [];
    const methods: InterfaceMethodInfo[] = [];

    for (const member of node.members) {
      if (ts.isPropertySignature(member) && member.name) {
        properties.push({
          name: this.getPropertyName(member.name, sourceFile),
          type: member.type ? member.type.getText(sourceFile) : undefined,
          isOptional: !!member.questionToken,
          isReadonly: this.hasReadonlyModifier(member),
        });
      } else if (ts.isMethodSignature(member) && member.name) {
        methods.push({
          name: this.getPropertyName(member.name, sourceFile),
          parameters: this.extractParameters(member.parameters),
          returnType: member.type ? member.type.getText(sourceFile) : undefined,
          isOptional: !!member.questionToken,
        });
      }
    }

    const extendsClause: string[] = [];
    if (node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
          for (const type of clause.types) {
            extendsClause.push(type.expression.getText(sourceFile));
          }
        }
      }
    }

    return {
      name: node.name.text,
      properties,
      methods,
      extends: extendsClause,
      isExported: this.hasExportModifier(node),
      startLine: startLine + 1,
      endLine: endLine + 1,
      typeParameters: this.extractTypeParameters(node.typeParameters),
    };
  }

  private extractParameters(
    parameters: ts.NodeArray<ts.ParameterDeclaration>
  ): ParameterInfo[] {
    return parameters.map((param) => {
      const sourceFile = param.getSourceFile();
      return {
        name: ts.isIdentifier(param.name)
          ? param.name.text
          : param.name.getText(sourceFile),
        type: param.type ? param.type.getText(sourceFile) : undefined,
        isOptional: !!param.questionToken || !!param.initializer,
        isRest: !!param.dotDotDotToken,
        defaultValue: param.initializer ? param.initializer.getText(sourceFile) : undefined,
      };
    });
  }

  private extractTypeParameters(
    typeParams: ts.NodeArray<ts.TypeParameterDeclaration> | undefined
  ): string[] {
    if (!typeParams) return [];
    return typeParams.map((tp) => tp.name.text);
  }

  private getPropertyName(name: ts.PropertyName, sourceFile: ts.SourceFile): string {
    if (ts.isIdentifier(name)) {
      return name.text;
    }
    if (ts.isStringLiteral(name)) {
      return name.text;
    }
    if (ts.isNumericLiteral(name)) {
      return name.text;
    }
    return name.getText(sourceFile);
  }

  private getExportAssignmentName(node: ts.ExportAssignment): string {
    if (ts.isIdentifier(node.expression)) {
      return node.expression.text;
    }
    return 'default';
  }

  private hasExportModifier(node: ts.Node): boolean {
    return (
      ts.canHaveModifiers(node) &&
      !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    );
  }

  private hasDefaultModifier(node: ts.Node): boolean {
    return (
      ts.canHaveModifiers(node) &&
      !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
    );
  }

  private hasAsyncModifier(node: ts.Node): boolean {
    return (
      ts.canHaveModifiers(node) &&
      !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
    );
  }

  private hasStaticModifier(node: ts.Node): boolean {
    return (
      ts.canHaveModifiers(node) &&
      !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)
    );
  }

  private hasAbstractModifier(node: ts.Node): boolean {
    return (
      ts.canHaveModifiers(node) &&
      !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.AbstractKeyword)
    );
  }

  private hasReadonlyModifier(node: ts.Node): boolean {
    return (
      ts.canHaveModifiers(node) &&
      !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword)
    );
  }

  private getVisibility(
    node: ts.Node
  ): 'public' | 'private' | 'protected' {
    if (!ts.canHaveModifiers(node)) return 'public';
    const modifiers = ts.getModifiers(node);
    if (!modifiers) return 'public';

    if (modifiers.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)) {
      return 'private';
    }
    if (modifiers.some((m) => m.kind === ts.SyntaxKind.ProtectedKeyword)) {
      return 'protected';
    }
    return 'public';
  }
}

// Export a default instance for convenience
export const typescriptParser = new TypeScriptParser();
