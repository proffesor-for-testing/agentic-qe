/**
 * Import Parser
 *
 * Parses import/require statements from source code
 * to build the IMPORTS relationship in the graph.
 */

import * as path from 'path';

export interface ParsedImport {
  /** Import type */
  type: 'named' | 'default' | 'namespace' | 'side-effect' | 'require' | 'dynamic';

  /** Module specifier (e.g., './utils' or 'lodash') */
  moduleSpecifier: string;

  /** Imported names (for named imports) */
  importedNames: string[];

  /** Local alias (for default/namespace imports) */
  localName?: string;

  /** Whether this is a type-only import (TypeScript) */
  isTypeOnly: boolean;

  /** Line number in source */
  line: number;
}

export interface ResolvedImport extends ParsedImport {
  /** Resolved absolute file path */
  resolvedPath?: string;

  /** Whether the import is external (node_modules) */
  isExternal: boolean;

  /** Whether the import is relative */
  isRelative: boolean;
}

export class ImportParser {
  // Regular expressions for different import patterns
  private readonly patterns = {
    // ES6 named imports: import { a, b } from 'module'
    namedImport: /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g,

    // ES6 default import: import Foo from 'module'
    defaultImport: /import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g,

    // ES6 namespace import: import * as Foo from 'module'
    namespaceImport: /import\s*\*\s*as\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g,

    // ES6 side-effect import: import 'module'
    sideEffectImport: /import\s+['"]([^'"]+)['"]/g,

    // ES6 mixed import: import Foo, { bar } from 'module'
    mixedImport: /import\s+(\w+)\s*,\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g,

    // CommonJS require: const foo = require('module')
    require: /(?:const|let|var)\s+(?:\{([^}]+)\}|(\w+))\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,

    // Dynamic import: import('module')
    dynamicImport: /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,

    // TypeScript type import: import type { Foo } from 'module'
    typeImport: /import\s+type\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g,

    // Python import: import module
    pythonImport: /^import\s+([\w.]+)(?:\s+as\s+(\w+))?/gm,

    // Python from import: from module import name
    pythonFromImport: /^from\s+([\w.]+)\s+import\s+(.+)/gm,

    // Go import: import "module" or import ( "module" )
    goImport: /import\s+(?:\(\s*)?["']([^"']+)["'](?:\s*\))?/g,

    // Go named import: import name "module"
    goNamedImport: /import\s+(\w+)\s+["']([^"']+)["']/g,

    // Rust use: use crate::module or use crate::module::*
    rustUse: /use\s+([\w:*]+)/g,
  };

  /**
   * Parse imports from source code.
   */
  parseImports(content: string, language: string): ParsedImport[] {
    const imports: ParsedImport[] = [];
    const lines = content.split('\n');

    switch (language) {
      case 'typescript':
      case 'javascript':
        imports.push(...this.parseJavaScriptImports(content, lines));
        break;
      case 'python':
        imports.push(...this.parsePythonImports(content, lines));
        break;
      case 'go':
        imports.push(...this.parseGoImports(content, lines));
        break;
      case 'rust':
        imports.push(...this.parseRustImports(content, lines));
        break;
    }

    return imports;
  }

  /**
   * Resolve import path to absolute file path.
   */
  resolveImportPath(
    imp: ParsedImport,
    sourceFilePath: string,
    projectRoot: string = '.'
  ): string | null {
    const moduleSpecifier = imp.moduleSpecifier;

    // Check if external package
    if (this.isExternalPackage(moduleSpecifier)) {
      return null; // Don't resolve external packages
    }

    // Resolve relative imports
    if (moduleSpecifier.startsWith('.')) {
      const sourceDir = path.dirname(sourceFilePath);
      let resolvedPath = path.resolve(sourceDir, moduleSpecifier);

      // Try different extensions
      const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'];

      // Check if path already has extension
      if (extensions.some((ext) => moduleSpecifier.endsWith(ext))) {
        return resolvedPath;
      }

      // Try adding extensions
      for (const ext of extensions) {
        const withExt = resolvedPath + ext;
        return withExt; // Return first candidate (actual file check would be async)
      }

      // Try index file
      return path.join(resolvedPath, 'index.ts');
    }

    // Absolute imports (configured in tsconfig, etc.)
    // These would need tsconfig.json parsing for proper resolution
    return path.join(projectRoot, 'src', moduleSpecifier);
  }

  /**
   * Check if a module specifier is an external package.
   */
  isExternalPackage(moduleSpecifier: string): boolean {
    // Relative paths
    if (moduleSpecifier.startsWith('.')) {
      return false;
    }

    // Node.js builtins
    const builtins = [
      'fs', 'path', 'os', 'crypto', 'http', 'https', 'url', 'util',
      'events', 'stream', 'buffer', 'child_process', 'cluster', 'dns',
      'net', 'readline', 'repl', 'tls', 'dgram', 'vm', 'zlib',
      'assert', 'async_hooks', 'console', 'constants', 'domain',
      'module', 'process', 'punycode', 'querystring', 'string_decoder',
      'timers', 'tty', 'v8', 'worker_threads', 'perf_hooks',
    ];

    // Check for node: prefix
    if (moduleSpecifier.startsWith('node:')) {
      return true;
    }

    // Check builtins
    if (builtins.includes(moduleSpecifier.split('/')[0])) {
      return true;
    }

    // Scoped packages (@org/package) or regular packages
    if (!moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/')) {
      return true;
    }

    return false;
  }

  /**
   * Parse JavaScript/TypeScript imports.
   */
  private parseJavaScriptImports(
    content: string,
    lines: string[]
  ): ParsedImport[] {
    const imports: ParsedImport[] = [];

    // Type imports
    let match: RegExpExecArray | null;

    // Reset regex lastIndex
    this.patterns.typeImport.lastIndex = 0;
    while ((match = this.patterns.typeImport.exec(content)) !== null) {
      const names = this.parseNamedImportList(match[1]);
      imports.push({
        type: 'named',
        moduleSpecifier: match[2],
        importedNames: names,
        isTypeOnly: true,
        line: this.getLineNumber(content, match.index),
      });
    }

    // Mixed imports (default + named)
    this.patterns.mixedImport.lastIndex = 0;
    while ((match = this.patterns.mixedImport.exec(content)) !== null) {
      const defaultName = match[1];
      const namedImports = this.parseNamedImportList(match[2]);

      imports.push({
        type: 'default',
        moduleSpecifier: match[3],
        importedNames: [],
        localName: defaultName,
        isTypeOnly: false,
        line: this.getLineNumber(content, match.index),
      });

      imports.push({
        type: 'named',
        moduleSpecifier: match[3],
        importedNames: namedImports,
        isTypeOnly: false,
        line: this.getLineNumber(content, match.index),
      });
    }

    // Namespace imports
    this.patterns.namespaceImport.lastIndex = 0;
    while ((match = this.patterns.namespaceImport.exec(content)) !== null) {
      imports.push({
        type: 'namespace',
        moduleSpecifier: match[2],
        importedNames: [],
        localName: match[1],
        isTypeOnly: false,
        line: this.getLineNumber(content, match.index),
      });
    }

    // Named imports (exclude type imports already captured)
    this.patterns.namedImport.lastIndex = 0;
    while ((match = this.patterns.namedImport.exec(content)) !== null) {
      // Skip if this is a type import
      const lineContent = this.getLine(content, match.index);
      if (lineContent.includes('import type')) continue;
      if (lineContent.includes('import ') && lineContent.includes(', {')) continue; // Mixed import

      const names = this.parseNamedImportList(match[1]);
      imports.push({
        type: 'named',
        moduleSpecifier: match[2],
        importedNames: names,
        isTypeOnly: false,
        line: this.getLineNumber(content, match.index),
      });
    }

    // Default imports
    this.patterns.defaultImport.lastIndex = 0;
    while ((match = this.patterns.defaultImport.exec(content)) !== null) {
      // Skip namespace imports and mixed imports
      const lineContent = this.getLine(content, match.index);
      if (lineContent.includes('* as')) continue;
      if (lineContent.includes(', {')) continue;

      imports.push({
        type: 'default',
        moduleSpecifier: match[2],
        importedNames: [],
        localName: match[1],
        isTypeOnly: false,
        line: this.getLineNumber(content, match.index),
      });
    }

    // Side-effect imports
    this.patterns.sideEffectImport.lastIndex = 0;
    while ((match = this.patterns.sideEffectImport.exec(content)) !== null) {
      // Skip if there's something before 'import' on the line
      const lineContent = this.getLine(content, match.index);
      if (!lineContent.trim().startsWith('import')) continue;

      imports.push({
        type: 'side-effect',
        moduleSpecifier: match[1],
        importedNames: [],
        isTypeOnly: false,
        line: this.getLineNumber(content, match.index),
      });
    }

    // CommonJS require
    this.patterns.require.lastIndex = 0;
    while ((match = this.patterns.require.exec(content)) !== null) {
      const destructured = match[1];
      const singleName = match[2];
      const moduleSpec = match[3];

      imports.push({
        type: 'require',
        moduleSpecifier: moduleSpec,
        importedNames: destructured ? this.parseNamedImportList(destructured) : [],
        localName: singleName,
        isTypeOnly: false,
        line: this.getLineNumber(content, match.index),
      });
    }

    // Dynamic imports
    this.patterns.dynamicImport.lastIndex = 0;
    while ((match = this.patterns.dynamicImport.exec(content)) !== null) {
      imports.push({
        type: 'dynamic',
        moduleSpecifier: match[1],
        importedNames: [],
        isTypeOnly: false,
        line: this.getLineNumber(content, match.index),
      });
    }

    return imports;
  }

  /**
   * Parse Python imports.
   */
  private parsePythonImports(content: string, lines: string[]): ParsedImport[] {
    const imports: ParsedImport[] = [];
    let match: RegExpExecArray | null;

    // import module [as alias]
    this.patterns.pythonImport.lastIndex = 0;
    while ((match = this.patterns.pythonImport.exec(content)) !== null) {
      imports.push({
        type: 'namespace',
        moduleSpecifier: match[1],
        importedNames: [],
        localName: match[2] || match[1].split('.').pop(),
        isTypeOnly: false,
        line: this.getLineNumber(content, match.index),
      });
    }

    // from module import names
    this.patterns.pythonFromImport.lastIndex = 0;
    while ((match = this.patterns.pythonFromImport.exec(content)) !== null) {
      const moduleSpec = match[1];
      const importPart = match[2].trim();

      if (importPart === '*') {
        imports.push({
          type: 'namespace',
          moduleSpecifier: moduleSpec,
          importedNames: ['*'],
          isTypeOnly: false,
          line: this.getLineNumber(content, match.index),
        });
      } else {
        const names = importPart.split(',').map((n) => n.trim().split(' as ')[0].trim());
        imports.push({
          type: 'named',
          moduleSpecifier: moduleSpec,
          importedNames: names,
          isTypeOnly: false,
          line: this.getLineNumber(content, match.index),
        });
      }
    }

    return imports;
  }

  /**
   * Parse Go imports.
   */
  private parseGoImports(content: string, lines: string[]): ParsedImport[] {
    const imports: ParsedImport[] = [];
    let match: RegExpExecArray | null;

    // Named import
    this.patterns.goNamedImport.lastIndex = 0;
    while ((match = this.patterns.goNamedImport.exec(content)) !== null) {
      imports.push({
        type: 'named',
        moduleSpecifier: match[2],
        importedNames: [],
        localName: match[1],
        isTypeOnly: false,
        line: this.getLineNumber(content, match.index),
      });
    }

    // Regular import
    this.patterns.goImport.lastIndex = 0;
    while ((match = this.patterns.goImport.exec(content)) !== null) {
      const moduleSpec = match[1];
      const packageName = moduleSpec.split('/').pop() || moduleSpec;

      imports.push({
        type: 'default',
        moduleSpecifier: moduleSpec,
        importedNames: [],
        localName: packageName,
        isTypeOnly: false,
        line: this.getLineNumber(content, match.index),
      });
    }

    return imports;
  }

  /**
   * Parse Rust use statements.
   */
  private parseRustImports(content: string, lines: string[]): ParsedImport[] {
    const imports: ParsedImport[] = [];
    let match: RegExpExecArray | null;

    this.patterns.rustUse.lastIndex = 0;
    while ((match = this.patterns.rustUse.exec(content)) !== null) {
      const usePath = match[1];
      const parts = usePath.split('::');
      const lastName = parts[parts.length - 1];

      imports.push({
        type: lastName === '*' ? 'namespace' : 'named',
        moduleSpecifier: usePath,
        importedNames: lastName === '*' ? ['*'] : [lastName],
        isTypeOnly: false,
        line: this.getLineNumber(content, match.index),
      });
    }

    return imports;
  }

  /**
   * Parse named import list (e.g., "foo, bar as baz").
   */
  private parseNamedImportList(importList: string): string[] {
    return importList
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => {
        // Handle "as" alias
        const parts = name.split(/\s+as\s+/);
        return parts[0].trim();
      });
  }

  /**
   * Get line number from character index.
   */
  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }

  /**
   * Get line content from character index.
   */
  private getLine(content: string, index: number): string {
    const lines = content.split('\n');
    const lineNumber = this.getLineNumber(content, index);
    return lines[lineNumber - 1] || '';
  }
}
