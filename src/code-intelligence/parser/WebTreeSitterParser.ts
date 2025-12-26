/**
 * Web Tree-sitter based code parser with WASM support
 *
 * This parser uses web-tree-sitter (WASM) instead of native tree-sitter bindings
 * to eliminate npm install warnings caused by native compilation requirements.
 *
 * Key differences from TreeSitterParser:
 * - Async initialization required (Parser.init())
 * - Async language loading (Parser.Language.load())
 * - Slightly slower than native but works universally
 */

import Parser from 'web-tree-sitter';
import { createHash } from 'crypto';
import { join } from 'path';
import { existsSync } from 'fs';

import { CodeEntity, Language, ParseResult, ParseError } from './types.js';
import { LanguageRegistry } from './LanguageRegistry.js';

interface CachedTree {
  tree: Parser.Tree;
  content: string;
  language: Language;
}

// Re-export SyntaxNode type for extractors (backwards compatibility)
export type SyntaxNode = Parser.SyntaxNode;

export class WebTreeSitterParser {
  private static initialized = false;
  private parsers: Map<Language, Parser> = new Map();
  private languages: Map<Language, Parser.Language> = new Map();
  private treeCache: Map<string, CachedTree> = new Map();
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the WASM runtime - called automatically on first parse
   */
  static async initialize(): Promise<void> {
    if (this.initialized) return;

    await Parser.init();
    this.initialized = true;
  }

  /**
   * Check if parser is initialized
   */
  static isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Ensure parser is initialized (call before any parsing)
   */
  async ensureInitialized(): Promise<void> {
    if (WebTreeSitterParser.initialized) return;

    if (!this.initPromise) {
      this.initPromise = WebTreeSitterParser.initialize();
    }
    await this.initPromise;
  }

  /**
   * Get WASM file path for a language
   */
  private getWasmPath(lang: Language): string {
    // First try node_modules in the project
    const projectPath = join(process.cwd(), 'node_modules', 'tree-sitter-wasms', 'out');

    // Then try relative to this file (for installed package)
    const packagePath = join(__dirname, '..', '..', '..', 'node_modules', 'tree-sitter-wasms', 'out');

    // Language to WASM file mapping
    const wasmFiles: Record<Language, string> = {
      typescript: 'tree-sitter-typescript.wasm',
      javascript: 'tree-sitter-javascript.wasm',
      python: 'tree-sitter-python.wasm',
      go: 'tree-sitter-go.wasm',
      rust: 'tree-sitter-rust.wasm',
    };

    const fileName = wasmFiles[lang];

    // Check project path first
    const projectFilePath = join(projectPath, fileName);
    if (existsSync(projectFilePath)) {
      return projectFilePath;
    }

    // Fall back to package path
    return join(packagePath, fileName);
  }

  /**
   * Load a language grammar
   */
  async loadLanguage(lang: Language): Promise<void> {
    if (this.languages.has(lang)) return;

    await this.ensureInitialized();

    const wasmPath = this.getWasmPath(lang);

    try {
      const language = await Parser.Language.load(wasmPath);
      this.languages.set(lang, language);

      const parser = new Parser();
      parser.setLanguage(language);
      this.parsers.set(lang, parser);
    } catch (error) {
      throw new Error(
        `Failed to load language '${lang}' from ${wasmPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Preload all supported languages (optional, for better first-parse performance)
   */
  async preloadLanguages(): Promise<void> {
    const languages: Language[] = ['typescript', 'javascript', 'python', 'go', 'rust'];
    await Promise.all(languages.map(lang => this.loadLanguage(lang)));
  }

  /**
   * Parse a file and extract code entities
   */
  async parseFile(
    filePath: string,
    content: string,
    language?: string
  ): Promise<ParseResult> {
    const startTime = Date.now();
    const errors: ParseError[] = [];

    try {
      const detectedLanguage = language
        ? (language as Language)
        : this.detectLanguage(filePath);

      if (!detectedLanguage) {
        throw new Error(`Cannot detect language for file: ${filePath}`);
      }

      // Ensure language is loaded
      await this.loadLanguage(detectedLanguage);

      const parser = this.parsers.get(detectedLanguage);
      if (!parser) {
        throw new Error(`No parser available for language: ${detectedLanguage}`);
      }

      const tree = parser.parse(content);

      if (!tree) {
        throw new Error(`Failed to parse file: ${filePath}`);
      }

      // Cache the tree for incremental updates
      this.treeCache.set(filePath, {
        tree,
        content,
        language: detectedLanguage,
      });

      const entities = this.extractEntities(
        tree.rootNode,
        content,
        filePath,
        detectedLanguage
      );

      return {
        entities,
        errors,
        parseTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      errors.push({
        message: error instanceof Error ? error.message : String(error),
        severity: 'error',
      });

      return {
        entities: [],
        errors,
        parseTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Incremental parsing for file updates
   */
  async updateFile(
    filePath: string,
    newContent: string,
    language?: string
  ): Promise<ParseResult> {
    const startTime = Date.now();
    const errors: ParseError[] = [];

    try {
      const cached = this.treeCache.get(filePath);

      // If no cache, do full parse
      if (!cached) {
        return this.parseFile(filePath, newContent, language);
      }

      const detectedLanguage = language
        ? (language as Language)
        : cached.language;

      const parser = this.parsers.get(detectedLanguage);
      if (!parser) {
        throw new Error(`No parser available for language: ${detectedLanguage}`);
      }

      // Compute edit for incremental parsing
      const oldContent = cached.content;
      const edit = this.computeEdit(oldContent, newContent);

      // Apply edit to cached tree
      cached.tree.edit(edit);

      // Reparse incrementally
      const newTree = parser.parse(newContent, cached.tree);

      if (!newTree) {
        throw new Error(`Failed to reparse file: ${filePath}`);
      }

      // Update cache
      this.treeCache.set(filePath, {
        tree: newTree,
        content: newContent,
        language: detectedLanguage,
      });

      const entities = this.extractEntities(
        newTree.rootNode,
        newContent,
        filePath,
        detectedLanguage
      );

      return {
        entities,
        errors,
        parseTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      errors.push({
        message: error instanceof Error ? error.message : String(error),
        severity: 'error',
      });

      return {
        entities: [],
        errors,
        parseTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Extract code entities from AST
   */
  private extractEntities(
    node: Parser.SyntaxNode,
    source: string,
    filePath: string,
    language: Language
  ): CodeEntity[] {
    const entities: CodeEntity[] = [];
    const config = LanguageRegistry.getConfig(language);

    const walk = (n: SyntaxNode, parentClass?: string): void => {
      // Guard against undefined nodes
      if (!n || !n.type) {
        return;
      }

      // Extract functions
      if (config.functionTypes.includes(n.type)) {
        const entity = this.extractFunction(n, source, filePath, language);
        if (entity) {
          entities.push(entity);
        }
      }

      // Extract classes
      if (config.classTypes.includes(n.type)) {
        const entity = this.extractClass(n, source, filePath, language);
        if (entity) {
          entities.push(entity);
          // Walk children to find methods
          for (let i = 0; i < n.childCount; i++) {
            const child = n.child(i);
            if (child) walk(child, entity.name);
          }
          return; // Don't walk children again
        }
      }

      // Extract methods
      if (config.methodTypes.includes(n.type) && parentClass) {
        const entity = this.extractMethod(n, source, filePath, language, parentClass);
        if (entity) {
          entities.push(entity);
        }
      }

      // Extract interfaces
      if (config.interfaceTypes.includes(n.type)) {
        const entity = this.extractInterface(n, source, filePath, language);
        if (entity) {
          entities.push(entity);
        }
      }

      // Extract type aliases
      if (config.typeAliasTypes.includes(n.type)) {
        const entity = this.extractTypeAlias(n, source, filePath, language);
        if (entity) {
          entities.push(entity);
        }
      }

      // Recursively walk children
      for (let i = 0; i < n.childCount; i++) {
        const child = n.child(i);
        if (child) walk(child, parentClass);
      }
    };

    walk(node);
    return entities;
  }

  /**
   * Extract function entity
   */
  private extractFunction(
    node: Parser.SyntaxNode,
    source: string,
    filePath: string,
    language: Language
  ): CodeEntity | null {
    const name = this.getNodeName(node);
    if (!name) return null;

    const content = source.substring(node.startIndex, node.endIndex);
    const signature = this.extractSignature(node, source);
    const parameters = this.extractParameters(node, source, language);
    const returnType = this.extractReturnType(node, source, language);

    return {
      id: this.generateId(filePath, name, node.startPosition.row),
      type: 'function',
      name,
      filePath,
      lineStart: node.startPosition.row + 1,
      lineEnd: node.endPosition.row + 1,
      content,
      signature,
      language,
      metadata: {
        parameters,
        returnType,
        isAsync: this.hasModifier(node, 'async', language),
        isExported: this.hasModifier(node, 'export', language),
      },
    };
  }

  /**
   * Extract class entity
   */
  private extractClass(
    node: Parser.SyntaxNode,
    source: string,
    filePath: string,
    language: Language
  ): CodeEntity | null {
    const name = this.getNodeName(node);
    if (!name) return null;

    const content = source.substring(node.startIndex, node.endIndex);

    return {
      id: this.generateId(filePath, name, node.startPosition.row),
      type: 'class',
      name,
      filePath,
      lineStart: node.startPosition.row + 1,
      lineEnd: node.endPosition.row + 1,
      content,
      language,
      metadata: {
        isExported: this.hasModifier(node, 'export', language),
        isAbstract: this.hasModifier(node, 'abstract', language),
      },
    };
  }

  /**
   * Extract method entity
   */
  private extractMethod(
    node: Parser.SyntaxNode,
    source: string,
    filePath: string,
    language: Language,
    parentClass: string
  ): CodeEntity | null {
    const name = this.getNodeName(node);
    if (!name) return null;

    const content = source.substring(node.startIndex, node.endIndex);
    const signature = this.extractSignature(node, source);
    const parameters = this.extractParameters(node, source, language);
    const returnType = this.extractReturnType(node, source, language);
    const visibility = this.extractVisibility(node, name, language);

    return {
      id: this.generateId(filePath, `${parentClass}.${name}`, node.startPosition.row),
      type: 'method',
      name,
      filePath,
      lineStart: node.startPosition.row + 1,
      lineEnd: node.endPosition.row + 1,
      content,
      signature,
      language,
      metadata: {
        parameters,
        returnType,
        visibility,
        isAsync: this.hasModifier(node, 'async', language),
        isStatic: this.hasModifier(node, 'static', language),
        parentClass,
      },
    };
  }

  /**
   * Extract interface entity
   */
  private extractInterface(
    node: Parser.SyntaxNode,
    source: string,
    filePath: string,
    language: Language
  ): CodeEntity | null {
    const name = this.getNodeName(node);
    if (!name) return null;

    const content = source.substring(node.startIndex, node.endIndex);

    return {
      id: this.generateId(filePath, name, node.startPosition.row),
      type: 'interface',
      name,
      filePath,
      lineStart: node.startPosition.row + 1,
      lineEnd: node.endPosition.row + 1,
      content,
      language,
      metadata: {
        isExported: this.hasModifier(node, 'export', language),
      },
    };
  }

  /**
   * Extract type alias entity
   */
  private extractTypeAlias(
    node: Parser.SyntaxNode,
    source: string,
    filePath: string,
    language: Language
  ): CodeEntity | null {
    const name = this.getNodeName(node);
    if (!name) return null;

    const content = source.substring(node.startIndex, node.endIndex);

    return {
      id: this.generateId(filePath, name, node.startPosition.row),
      type: 'type',
      name,
      filePath,
      lineStart: node.startPosition.row + 1,
      lineEnd: node.endPosition.row + 1,
      content,
      language,
      metadata: {
        isExported: this.hasModifier(node, 'export', language),
      },
    };
  }

  /**
   * Get node name (identifier)
   */
  private getNodeName(node: Parser.SyntaxNode): string | null {
    // Try to find name/identifier child
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;

      if (
        child.type === 'identifier' ||
        child.type === 'type_identifier' ||
        child.type === 'property_identifier'
      ) {
        return child.text;
      }
    }
    return null;
  }

  /**
   * Extract function/method signature
   */
  private extractSignature(node: Parser.SyntaxNode, source: string): string {
    const firstLineEnd = source.indexOf('\n', node.startIndex);
    const signatureEnd =
      firstLineEnd > node.startIndex && firstLineEnd < node.endIndex
        ? firstLineEnd
        : node.endIndex;

    return source.substring(node.startIndex, signatureEnd).trim();
  }

  /**
   * Extract parameters from function/method
   */
  private extractParameters(
    node: Parser.SyntaxNode,
    source: string,
    language: Language
  ): string[] {
    const config = LanguageRegistry.getConfig(language);
    const parameters: string[] = [];

    const walk = (n: SyntaxNode): void => {
      if (config.parameterTypes.includes(n.type)) {
        parameters.push(n.text);
      }
      for (let i = 0; i < n.childCount; i++) {
        const child = n.child(i);
        if (child) walk(child);
      }
    };

    walk(node);
    return parameters;
  }

  /**
   * Extract return type from function/method
   */
  private extractReturnType(
    node: Parser.SyntaxNode,
    source: string,
    language: Language
  ): string | undefined {
    const config = LanguageRegistry.getConfig(language);

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && config.returnTypeFields.includes(child.type)) {
        return child.text;
      }
    }

    return undefined;
  }

  /**
   * Extract visibility modifier
   */
  private extractVisibility(
    node: Parser.SyntaxNode,
    name: string,
    language: Language
  ): 'public' | 'private' | 'protected' | undefined {
    const config = LanguageRegistry.getConfig(language);

    // Check for explicit modifiers
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;

      const text = child.text.toLowerCase();
      if (config.visibilityModifiers.public.includes(text)) return 'public';
      if (config.visibilityModifiers.private.includes(text)) return 'private';
      if (config.visibilityModifiers.protected.includes(text)) return 'protected';
    }

    // Language-specific conventions
    if (language === 'python') {
      if (name.startsWith('__')) return 'private';
      if (name.startsWith('_')) return 'protected';
    } else if (language === 'go') {
      return name[0] === name[0].toUpperCase() ? 'public' : 'private';
    }

    return undefined;
  }

  /**
   * Check if node has a specific modifier keyword
   */
  private hasModifier(
    node: Parser.SyntaxNode,
    modifier: 'async' | 'export' | 'static' | 'abstract',
    language: Language
  ): boolean {
    const config = LanguageRegistry.getConfig(language);
    let keywords: string[] = [];

    switch (modifier) {
      case 'async':
        keywords = config.asyncKeywords;
        break;
      case 'export':
        keywords = config.exportKeywords;
        break;
      case 'static':
        keywords = config.staticKeywords;
        break;
      case 'abstract':
        keywords = config.abstractKeywords;
        break;
    }

    // Check node and parent for modifier
    const checkNode = (n: SyntaxNode): boolean => {
      if (!n) return false;
      for (let i = 0; i < n.childCount; i++) {
        const child = n.child(i);
        if (!child || !child.text) continue;
        if (keywords.includes(child.text.toLowerCase())) {
          return true;
        }
      }
      return false;
    };

    if (!node) return false;
    return checkNode(node) || (node.parent ? checkNode(node.parent) : false);
  }

  /**
   * Detect language from file path
   */
  detectLanguage(filePath: string): Language | null {
    return LanguageRegistry.detectLanguage(filePath);
  }

  /**
   * Generate unique entity ID
   */
  private generateId(filePath: string, name: string, line: number): string {
    const content = `${filePath}:${name}:${line}`;
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Compute edit for incremental parsing
   */
  private computeEdit(oldContent: string, newContent: string): Parser.Edit {
    let startIndex = 0;
    const minLength = Math.min(oldContent.length, newContent.length);

    while (startIndex < minLength && oldContent[startIndex] === newContent[startIndex]) {
      startIndex++;
    }

    let row = 0;
    let column = 0;
    for (let i = 0; i < startIndex; i++) {
      if (oldContent[i] === '\n') {
        row++;
        column = 0;
      } else {
        column++;
      }
    }

    return {
      startIndex,
      oldEndIndex: oldContent.length,
      newEndIndex: newContent.length,
      startPosition: { row, column },
      oldEndPosition: this.getPosition(oldContent, oldContent.length),
      newEndPosition: this.getPosition(newContent, newContent.length),
    };
  }

  /**
   * Get position (row, column) from index
   */
  private getPosition(content: string, index: number): { row: number; column: number } {
    let row = 0;
    let column = 0;

    for (let i = 0; i < index && i < content.length; i++) {
      if (content[i] === '\n') {
        row++;
        column = 0;
      } else {
        column++;
      }
    }

    return { row, column };
  }

  /**
   * Clear tree cache for a file
   */
  clearCache(filePath?: string): void {
    if (filePath) {
      this.treeCache.delete(filePath);
    } else {
      this.treeCache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; files: string[] } {
    return {
      size: this.treeCache.size,
      files: Array.from(this.treeCache.keys()),
    };
  }

  /**
   * Delete trees to free memory
   */
  dispose(): void {
    for (const cached of this.treeCache.values()) {
      cached.tree.delete();
    }
    this.treeCache.clear();

    for (const parser of this.parsers.values()) {
      parser.delete();
    }
    this.parsers.clear();
    this.languages.clear();
  }
}
