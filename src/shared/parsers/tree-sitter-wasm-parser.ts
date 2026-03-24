/**
 * Tree-sitter WASM Parser (ADR-076 Amendment 2026-03-24)
 *
 * Provides AST-based parsing for Python, Java, C#, Rust, Swift using
 * web-tree-sitter WASM grammars. Achieves ~100% accuracy for identifying
 * functions, classes, imports, properties, and complexity — eliminating
 * the ~2-3% edge cases (code in strings, complex generics) that regex misses.
 *
 * Lazy-loads WASM grammars on first parse per language.
 * Falls back to regex parsers with user-facing log warnings when WASM
 * initialization fails (missing dependency, incompatible Node version, etc.).
 */

import * as fs from 'node:fs';
import Module from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SupportedLanguage } from '../types/test-frameworks.js';
import type {
  ILanguageParser,
  ParsedFile,
  UniversalFunctionInfo,
  UniversalClassInfo,
  UniversalImportInfo,
  UniversalParameterInfo,
} from './interfaces.js';
import { createLogger } from '../../logging/logger-factory.js';

const logger = createLogger('TreeSitterWASM');

// ============================================================================
// Types for web-tree-sitter (dynamic import, may not be installed)
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
type TreeSitterParser = any;
type TreeSitterLanguage = any;
type SyntaxNode = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================================================
// WASM Grammar Configuration
// ============================================================================

interface WasmGrammarConfig {
  wasmFile: string; // filename inside assets/grammars/
  nodeTypes: {
    functionDecl: string[];
    classDecl: string[];
    importDecl: string[];
    implBlock?: string;        // Rust impl blocks
    structDecl?: string;       // Rust/Swift struct
    protocolDecl?: string;     // Swift protocol
  };
}

const GRAMMAR_CONFIG: Record<string, WasmGrammarConfig> = {
  python: {
    wasmFile: 'tree-sitter-python.wasm',
    nodeTypes: {
      functionDecl: ['function_definition'],
      classDecl: ['class_definition'],
      importDecl: ['import_statement', 'import_from_statement'],
    },
  },
  java: {
    wasmFile: 'tree-sitter-java.wasm',
    nodeTypes: {
      functionDecl: ['method_declaration', 'constructor_declaration'],
      classDecl: ['class_declaration', 'interface_declaration'],
      importDecl: ['import_declaration'],
    },
  },
  csharp: {
    wasmFile: 'tree-sitter-c_sharp.wasm',
    nodeTypes: {
      functionDecl: ['method_declaration', 'constructor_declaration'],
      classDecl: ['class_declaration', 'interface_declaration'],
      importDecl: ['using_directive'],
    },
  },
  rust: {
    wasmFile: 'tree-sitter-rust.wasm',
    nodeTypes: {
      functionDecl: ['function_item'],
      classDecl: [],
      importDecl: ['use_declaration'],
      implBlock: 'impl_item',
      structDecl: 'struct_item',
    },
  },
  swift: {
    wasmFile: 'tree-sitter-swift.wasm',
    nodeTypes: {
      functionDecl: ['function_declaration'],
      classDecl: ['class_declaration'],
      importDecl: ['import_declaration'],
      structDecl: 'struct_declaration',
      protocolDecl: 'protocol_declaration',
    },
  },
};

// ============================================================================
// Shared WASM Initialization (singleton)
// ============================================================================

let treeSitterModule: any = null;
let initPromise: Promise<void> | null = null;
let initFailCount = 0;
const MAX_INIT_RETRIES = 3;

const loadedLanguages = new Map<string, TreeSitterLanguage>();

/**
 * Resolve grammar WASM file path. Tries multiple locations to handle:
 * - Source: src/shared/parsers/ -> ../../../assets/grammars/
 * - CLI bundle: dist/cli/bundle.js -> ../../assets/grammars/
 * - MCP bundle: dist/mcp/bundle.js -> ../../assets/grammars/
 * - Installed package: node_modules/agentic-qe/ -> assets/grammars/
 */
function resolveGrammarPath(wasmFile: string): string {
  const thisDir = fileURLToPath(new URL('.', import.meta.url));
  const candidates = [
    // From source (src/shared/parsers/)
    path.resolve(thisDir, '..', '..', '..', 'assets', 'grammars', wasmFile),
    // From dist bundle (dist/cli/ or dist/mcp/)
    path.resolve(thisDir, '..', '..', 'assets', 'grammars', wasmFile),
    // From package root via cwd (fallback)
    path.resolve(process.cwd(), 'assets', 'grammars', wasmFile),
    // From dist root (dist/)
    path.resolve(thisDir, '..', 'assets', 'grammars', wasmFile),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error(`Grammar file ${wasmFile} not found. Searched: ${candidates.join(', ')}`);
}

async function ensureTreeSitterInit(): Promise<void> {
  if (initFailCount >= MAX_INIT_RETRIES) {
    throw new Error(`web-tree-sitter failed to initialize after ${MAX_INIT_RETRIES} attempts`);
  }
  if (treeSitterModule) return;

  if (!initPromise) {
    initPromise = (async () => {
      try {
        const mod = await import('web-tree-sitter');
        const TreeSitter = mod.default || mod;
        await TreeSitter.init();
        treeSitterModule = TreeSitter;
        initFailCount = 0; // Reset on success
        logger.info('web-tree-sitter WASM runtime initialized');
      } catch (err: unknown) {
        initFailCount++;
        initPromise = null; // Allow retry on next call
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(
          `web-tree-sitter WASM init failed (attempt ${initFailCount}/${MAX_INIT_RETRIES}): ${msg}. ` +
          (initFailCount < MAX_INIT_RETRIES ? 'Will retry on next parse.' : 'Falling back to regex permanently.')
        );
        throw err;
      }
    })();
  }
  return initPromise;
}

async function loadLanguage(lang: string): Promise<TreeSitterLanguage> {
  const cached = loadedLanguages.get(lang);
  if (cached) return cached;

  await ensureTreeSitterInit();

  const config = GRAMMAR_CONFIG[lang];
  if (!config) throw new Error(`No WASM grammar config for ${lang}`);

  try {
    // Resolve WASM file from bundled assets/grammars/ (shipped with the package)
    const wasmPath = resolveGrammarPath(config.wasmFile);

    const language = await treeSitterModule.Language.load(wasmPath);
    loadedLanguages.set(lang, language);
    logger.info(`Loaded tree-sitter WASM grammar for ${lang}`);
    return language;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Failed to load WASM grammar for ${lang}: ${msg}. Falling back to regex parser.`);
    throw err;
  }
}

// ============================================================================
// AST Node Helpers
// ============================================================================

function findChildren(node: SyntaxNode, types: string[]): SyntaxNode[] {
  const results: SyntaxNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (types.includes(child.type)) {
      results.push(child);
    }
  }
  return results;
}

function findDescendants(node: SyntaxNode, types: string[], maxDepth = 10): SyntaxNode[] {
  const results: SyntaxNode[] = [];
  function walk(n: SyntaxNode, depth: number): void {
    if (depth > maxDepth) return;
    for (let i = 0; i < n.childCount; i++) {
      const child = n.child(i);
      if (types.includes(child.type)) {
        results.push(child);
      }
      walk(child, depth + 1);
    }
  }
  walk(node, 0);
  return results;
}

function getModifiers(node: SyntaxNode): string[] {
  const mods: string[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === 'modifiers' || child.type === 'modifier' || child.type === 'visibility_modifier') {
      mods.push(child.text.trim());
    }
  }
  return mods;
}

function hasModifier(node: SyntaxNode, mod: string): boolean {
  return getModifiers(node).some(m => m.includes(mod));
}

/**
 * Compute cyclomatic complexity by counting branching AST nodes in a function body.
 * Baseline of 1 + count of (if, while, for, for_in, match/switch, case, &&, ||, catch, ?:).
 */
const COMPLEXITY_NODE_TYPES = new Set([
  // Branching
  'if_statement', 'if_expression', 'if_let_statement',
  'while_statement', 'while_expression',
  'for_statement', 'for_in_statement', 'for_expression', 'enhanced_for_statement',
  'match_expression', 'switch_statement', 'switch_expression',
  'case_clause', 'match_arm', 'switch_entry',
  // Exception handling
  'catch_clause', 'except_clause', 'catch_block',
  // Short-circuit operators
  'binary_expression', // checked for && / || below
  // Ternary
  'conditional_expression', 'ternary_expression',
]);

const SHORT_CIRCUIT_OPS = new Set(['&&', '||', 'and', 'or']);

function computeComplexity(bodyNode: SyntaxNode | null): number {
  if (!bodyNode) return 1;
  let complexity = 1;

  function walk(node: SyntaxNode): void {
    if (COMPLEXITY_NODE_TYPES.has(node.type)) {
      if (node.type === 'binary_expression') {
        // Only count && and || operators
        const op = node.childForFieldName('operator');
        if (op && SHORT_CIRCUIT_OPS.has(op.text)) {
          complexity++;
        }
      } else {
        complexity++;
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      walk(node.child(i));
    }
  }
  walk(bodyNode);
  return complexity;
}

/**
 * Extract properties/fields from a class body AST node.
 */
function extractProperties(bodyNode: SyntaxNode | null, language: string): import('./interfaces.js').UniversalPropertyInfo[] {
  if (!bodyNode) return [];
  const props: import('./interfaces.js').UniversalPropertyInfo[] = [];

  for (let i = 0; i < bodyNode.childCount; i++) {
    const child = bodyNode.child(i);

    switch (language) {
      case 'java':
        if (child.type === 'field_declaration') {
          const mods = getModifiers(child);
          const type = child.childForFieldName('type')?.text?.trim();
          const declarator = child.childForFieldName('declarator');
          const name = declarator?.childForFieldName('name')?.text ?? declarator?.text?.split(/[=;]/)[0]?.trim() ?? '';
          if (name) {
            props.push({
              name,
              type: type || undefined,
              isPublic: mods.some(m => m.includes('public')),
              isReadonly: mods.some(m => m.includes('final')),
            });
          }
        }
        break;

      case 'csharp':
        if (child.type === 'field_declaration' || child.type === 'property_declaration') {
          const mods = getModifiers(child);
          const type = child.childForFieldName('type')?.text?.trim();
          const name = child.childForFieldName('name')?.text ?? '';
          if (name) {
            props.push({
              name,
              type: type || undefined,
              isPublic: mods.some(m => m.includes('public')),
              isReadonly: mods.some(m => m.includes('readonly')),
            });
          }
        }
        break;

      case 'rust':
        if (child.type === 'field_declaration') {
          const name = child.childForFieldName('name')?.text ?? '';
          const type = child.childForFieldName('type')?.text?.trim();
          const isPub = hasModifier(child, 'pub');
          if (name) {
            props.push({ name, type: type || undefined, isPublic: isPub, isReadonly: false });
          }
        }
        break;

      case 'swift':
        if (child.type === 'property_declaration') {
          const mods = getSwiftModifiers(child);
          const name = child.childForFieldName('name')?.text ?? '';
          const type = child.childForFieldName('type')?.text?.trim();
          const isPublic = mods.includes('public') || mods.includes('open');
          const isReadonly = child.text.includes('let ');
          if (name) {
            props.push({ name, type: type || undefined, isPublic, isReadonly });
          }
        }
        break;

      case 'python':
        // Python class attributes from assignment in __init__ or class body
        if (child.type === 'expression_statement') {
          const expr = child.child(0);
          if (expr?.type === 'assignment') {
            const left = expr.childForFieldName('left');
            if (left?.type === 'attribute' || left?.type === 'identifier') {
              const name = left.text.replace('self.', '');
              props.push({ name, type: undefined, isPublic: !name.startsWith('_'), isReadonly: false });
            }
          }
        }
        break;
    }
  }
  return props;
}

// ============================================================================
// Language-Specific Extractors
// ============================================================================

// --- Python ---

function extractPythonFunctions(nodes: SyntaxNode[]): UniversalFunctionInfo[] {
  return nodes.map(node => {
    const name = node.childForFieldName('name')?.text ?? '';
    const paramsNode = node.childForFieldName('parameters');
    const returnTypeNode = node.childForFieldName('return_type');
    const bodyNode = node.childForFieldName('body');
    const isAsync = node.text.trimStart().startsWith('async');
    const decorators = collectPythonDecorators(node);

    return {
      name,
      parameters: parsePythonParams(paramsNode),
      returnType: returnTypeNode?.text?.trim() || undefined,
      isAsync,
      isPublic: !name.startsWith('_'),
      complexity: computeComplexity(bodyNode),
      decorators,
      genericParams: [],
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  });
}

function parsePythonParams(paramsNode: SyntaxNode | null): UniversalParameterInfo[] {
  if (!paramsNode) return [];
  const params: UniversalParameterInfo[] = [];

  for (let i = 0; i < paramsNode.childCount; i++) {
    const child = paramsNode.child(i);
    if (child.type === 'identifier') {
      const name = child.text;
      if (name === 'self' || name === 'cls') continue;
      params.push({ name, type: undefined, isOptional: false, defaultValue: undefined });
    } else if (child.type === 'typed_parameter') {
      const name = child.child(0)?.text ?? '';
      if (name === 'self' || name === 'cls') continue;
      const type = child.childForFieldName('type')?.text?.trim();
      params.push({ name, type: type || undefined, isOptional: false, defaultValue: undefined });
    } else if (child.type === 'default_parameter' || child.type === 'typed_default_parameter') {
      const name = child.childForFieldName('name')?.text ?? child.child(0)?.text ?? '';
      if (name === 'self' || name === 'cls') continue;
      const type = child.childForFieldName('type')?.text?.trim();
      const defaultValue = child.childForFieldName('value')?.text?.trim();
      params.push({ name, type: type || undefined, isOptional: true, defaultValue: defaultValue || undefined });
    } else if (child.type === 'list_splat_pattern' || child.type === 'dictionary_splat_pattern') {
      const name = child.text;
      params.push({ name, type: undefined, isOptional: true, defaultValue: undefined });
    }
  }
  return params;
}

function collectPythonDecorators(funcNode: SyntaxNode): string[] {
  const decorators: string[] = [];
  const parent = funcNode.parent;
  if (!parent) return decorators;

  // Decorated definitions wrap the function node
  if (parent.type === 'decorated_definition') {
    for (let i = 0; i < parent.childCount; i++) {
      const child = parent.child(i);
      if (child.type === 'decorator') {
        decorators.push(child.text.trim());
      }
    }
  }
  return decorators;
}

function extractPythonClasses(nodes: SyntaxNode[]): UniversalClassInfo[] {
  return nodes.map(node => {
    const name = node.childForFieldName('name')?.text ?? '';
    const body = node.childForFieldName('body');

    // Extract base classes from superclasses (argument_list)
    const superclasses = node.childForFieldName('superclasses');
    const bases: string[] = [];
    if (superclasses) {
      for (let i = 0; i < superclasses.childCount; i++) {
        const child = superclasses.child(i);
        if (child.isNamed) bases.push(child.text);
      }
    }

    // Extract methods from body
    const methodNodes = body ? findDescendants(body, ['function_definition'], 2) : [];
    const methods = extractPythonFunctions(methodNodes);

    const decorators = collectPythonDecorators(node);

    return {
      name,
      methods,
      properties: extractProperties(body, 'python'),
      isPublic: !name.startsWith('_'),
      implements: [],
      extends: bases[0] || undefined,
      decorators,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  });
}

function extractPythonImports(nodes: SyntaxNode[]): UniversalImportInfo[] {
  return nodes.map(node => {
    if (node.type === 'import_from_statement') {
      const module = node.childForFieldName('module_name')?.text ?? '';
      const namedImports: string[] = [];
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        const fieldName = node.fieldNameForChild(i);
        if (fieldName === 'name' && child.isNamed) {
          namedImports.push(child.text);
        }
      }
      return { module, namedImports, isTypeOnly: false };
    }
    // import_statement
    const nameNode = node.childForFieldName('name');
    return {
      module: nameNode?.text ?? '',
      namedImports: [],
      isTypeOnly: false,
    };
  });
}

// --- Java ---

function extractJavaFunctions(nodes: SyntaxNode[]): UniversalFunctionInfo[] {
  return nodes.map(node => {
    const name = node.childForFieldName('name')?.text ?? '';
    const returnTypeNode = node.childForFieldName('type');
    const paramsNode = node.childForFieldName('parameters');
    const bodyNode = node.childForFieldName('body');
    const modifiers = getModifiers(node);
    const isPublic = modifiers.some(m => m.includes('public'));
    const isAsync = returnTypeNode?.text?.includes('CompletableFuture') ?? false;
    const decorators = extractJavaAnnotations(node);

    return {
      name,
      parameters: parseJavaParams(paramsNode),
      returnType: returnTypeNode?.text === 'void' ? undefined : returnTypeNode?.text?.trim(),
      isAsync,
      isPublic,
      complexity: computeComplexity(bodyNode),
      decorators,
      genericParams: [],
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  });
}

function parseJavaParams(paramsNode: SyntaxNode | null): UniversalParameterInfo[] {
  if (!paramsNode) return [];
  const params: UniversalParameterInfo[] = [];
  for (let i = 0; i < paramsNode.childCount; i++) {
    const child = paramsNode.child(i);
    if (child.type === 'formal_parameter' || child.type === 'spread_parameter') {
      const name = child.childForFieldName('name')?.text ?? '';
      const type = child.childForFieldName('type')?.text?.trim();
      params.push({ name, type: type || undefined, isOptional: false, defaultValue: undefined });
    }
  }
  return params;
}

function extractJavaAnnotations(node: SyntaxNode): string[] {
  const annotations: string[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === 'modifiers') {
      for (let j = 0; j < child.childCount; j++) {
        const mod = child.child(j);
        if (mod.type === 'marker_annotation' || mod.type === 'annotation') {
          annotations.push(mod.text.trim());
        }
      }
    }
  }
  return annotations;
}

function extractJavaClasses(nodes: SyntaxNode[]): UniversalClassInfo[] {
  return nodes.map(node => {
    const name = node.childForFieldName('name')?.text ?? '';
    const body = node.childForFieldName('body');
    const modifiers = getModifiers(node);
    const isPublic = modifiers.some(m => m.includes('public'));

    // Extract extends/implements
    const superclass = node.childForFieldName('superclass')?.text;
    const interfaces = node.childForFieldName('interfaces');
    const implementsList: string[] = [];
    if (interfaces) {
      for (let i = 0; i < interfaces.childCount; i++) {
        const child = interfaces.child(i);
        if (child.isNamed) implementsList.push(child.text);
      }
    }

    const methodNodes = body ? findChildren(body, ['method_declaration', 'constructor_declaration']) : [];
    const methods = extractJavaFunctions(methodNodes);
    const decorators = extractJavaAnnotations(node);

    return {
      name,
      methods,
      properties: extractProperties(body, 'java'),
      isPublic,
      implements: implementsList,
      extends: superclass || undefined,
      decorators,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  });
}

function extractJavaImports(nodes: SyntaxNode[]): UniversalImportInfo[] {
  return nodes.map(node => {
    const text = node.text.replace(/^\s*import\s+(static\s+)?/, '').replace(/;\s*$/, '').trim();
    const parts = text.split('.');
    const name = parts[parts.length - 1];
    return {
      module: text,
      namedImports: name === '*' ? [] : [name],
      isTypeOnly: false,
    };
  });
}

// --- C# ---

function extractCSharpFunctions(root: SyntaxNode): UniversalFunctionInfo[] {
  const methods = findDescendants(root, ['method_declaration', 'constructor_declaration']);
  return methods.map(node => {
    const name = node.childForFieldName('name')?.text ?? '';
    const returnTypeNode = node.childForFieldName('type');
    const paramsNode = node.childForFieldName('parameters');
    const modifiers = getModifiers(node);
    const isPublic = modifiers.some(m => m.includes('public'));
    const isAsync = modifiers.some(m => m.includes('async')) || returnTypeNode?.text?.includes('Task') || false;
    const decorators = extractCSharpAttributes(node);

    return {
      name,
      parameters: parseCSharpParams(paramsNode),
      returnType: returnTypeNode?.text === 'void' ? undefined : returnTypeNode?.text?.trim(),
      isAsync,
      isPublic,
      complexity: computeComplexity(node.childForFieldName('body')),
      decorators,
      genericParams: [],
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  });
}

function parseCSharpParams(paramsNode: SyntaxNode | null): UniversalParameterInfo[] {
  if (!paramsNode) return [];
  const params: UniversalParameterInfo[] = [];
  for (let i = 0; i < paramsNode.childCount; i++) {
    const child = paramsNode.child(i);
    if (child.type === 'parameter') {
      const name = child.childForFieldName('name')?.text ?? '';
      const type = child.childForFieldName('type')?.text?.trim();
      params.push({
        name,
        type: type || undefined,
        isOptional: type?.endsWith('?') || false,
        defaultValue: undefined,
      });
    }
  }
  return params;
}

function extractCSharpAttributes(node: SyntaxNode): string[] {
  const attrs: string[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === 'attribute_list') {
      attrs.push(child.text.trim());
    }
  }
  return attrs;
}

function extractCSharpClasses(root: SyntaxNode): UniversalClassInfo[] {
  const classes = findDescendants(root, ['class_declaration', 'interface_declaration']);
  return classes.map(node => {
    const name = node.childForFieldName('name')?.text ?? '';
    const body = node.childForFieldName('body');
    const modifiers = getModifiers(node);
    const isPublic = modifiers.some(m => m.includes('public'));

    // Extract base list (extends/implements combined in C#)
    const baseList = node.childForFieldName('bases');
    const bases: string[] = [];
    if (baseList) {
      for (let i = 0; i < baseList.childCount; i++) {
        const child = baseList.child(i);
        if (child.isNamed) bases.push(child.text);
      }
    }

    const methodNodes = body ? findChildren(body, ['method_declaration', 'constructor_declaration']) : [];
    const methods = extractJavaFunctions(methodNodes); // Same structure as Java
    const decorators = extractCSharpAttributes(node);

    return {
      name,
      methods,
      properties: extractProperties(body, 'csharp'),
      isPublic,
      implements: bases.slice(1),
      extends: bases[0] || undefined,
      decorators,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  });
}

function extractCSharpImports(root: SyntaxNode): UniversalImportInfo[] {
  const usings = findDescendants(root, ['using_directive']);
  return usings.map(node => {
    const text = node.text.replace(/^\s*using\s+(static\s+)?/, '').replace(/;\s*$/, '').trim();
    return { module: text, namedImports: [], isTypeOnly: false };
  });
}

// --- Rust ---

function extractRustFunctions(root: SyntaxNode, config: WasmGrammarConfig): UniversalFunctionInfo[] {
  const functions: UniversalFunctionInfo[] = [];

  // Top-level functions
  const topFns = findChildren(root, config.nodeTypes.functionDecl);
  functions.push(...topFns.map(parseRustFunction));

  // Functions inside impl blocks
  if (config.nodeTypes.implBlock) {
    const implBlocks = findChildren(root, [config.nodeTypes.implBlock]);
    for (const impl of implBlocks) {
      const body = impl.childForFieldName('body');
      if (body) {
        const methods = findChildren(body, config.nodeTypes.functionDecl);
        functions.push(...methods.map(parseRustFunction));
      }
    }
  }

  return functions;
}

function parseRustFunction(node: SyntaxNode): UniversalFunctionInfo {
  const name = node.childForFieldName('name')?.text ?? '';
  const paramsNode = node.childForFieldName('parameters');
  const returnTypeNode = node.childForFieldName('return_type');
  const bodyNode = node.childForFieldName('body');
  const isPub = hasModifier(node, 'pub');
  const isAsync = node.text.trimStart().startsWith('pub async') || node.text.trimStart().startsWith('async');
  const decorators = collectRustAttributes(node);

  return {
    name,
    parameters: parseRustParams(paramsNode),
    returnType: returnTypeNode?.text?.trim() || undefined,
    isAsync,
    isPublic: isPub,
    complexity: computeComplexity(bodyNode),
    decorators,
    genericParams: [],
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
  };
}

function parseRustParams(paramsNode: SyntaxNode | null): UniversalParameterInfo[] {
  if (!paramsNode) return [];
  const params: UniversalParameterInfo[] = [];
  for (let i = 0; i < paramsNode.childCount; i++) {
    const child = paramsNode.child(i);
    if (child.type === 'parameter') {
      const patternNode = child.childForFieldName('pattern');
      const typeNode = child.childForFieldName('type');
      const name = patternNode?.text ?? '';
      const type = typeNode?.text?.trim();
      params.push({ name, type: type || undefined, isOptional: false, defaultValue: undefined });
    } else if (child.type === 'self_parameter') {
      // Skip &self, &mut self, self
      continue;
    }
  }
  return params;
}

function collectRustAttributes(node: SyntaxNode): string[] {
  const attrs: string[] = [];
  // Attributes precede the function as siblings
  let prev = node.previousNamedSibling;
  while (prev && prev.type === 'attribute_item') {
    attrs.unshift(prev.text.trim());
    prev = prev.previousNamedSibling;
  }
  return attrs;
}

function extractRustStructs(root: SyntaxNode): UniversalClassInfo[] {
  const structs: UniversalClassInfo[] = [];

  // Extract structs, enums, and traits as class-like entities
  const structNodes = findChildren(root, ['struct_item', 'enum_item', 'trait_item']);
  for (const node of structNodes) {
    const name = node.childForFieldName('name')?.text ?? '';
    const isPub = hasModifier(node, 'pub');
    const decorators = collectRustAttributes(node);
    const bodyNode = node.childForFieldName('body');

    structs.push({
      name,
      methods: [],
      properties: extractProperties(bodyNode, 'rust'),
      isPublic: isPub,
      implements: [],
      extends: undefined,
      decorators,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    });
  }
  return structs;
}

function extractRustImports(root: SyntaxNode): UniversalImportInfo[] {
  const uses = findChildren(root, ['use_declaration']);
  return uses.map(node => {
    const arg = node.childForFieldName('argument');
    const module = arg?.text ?? node.text.replace(/^\s*use\s+/, '').replace(/;\s*$/, '').trim();
    return { module, namedImports: [], isTypeOnly: false };
  });
}

// --- Swift ---

function extractSwiftFunctions(nodes: SyntaxNode[]): UniversalFunctionInfo[] {
  return nodes.map(node => {
    // Swift uses 'name' field for the function identifier (simple_identifier)
    let name = '';
    const params: SyntaxNode[] = [];
    let returnType: string | undefined;
    const modifiers = getSwiftModifiers(node);
    const isPublic = modifiers.includes('public') || modifiers.includes('open');
    let isAsync = false;

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      const fieldName = node.fieldNameForChild(i);

      if (fieldName === 'name') {
        if (child.type === 'simple_identifier') {
          name = child.text;
        } else if (!name) {
          // Return type may also use 'name' field in some tree-sitter-swift versions
          returnType = child.text;
        }
      }
      if (child.type === 'parameter') {
        params.push(child);
      }
      if (child.type === 'async' || child.text === 'async') {
        isAsync = true;
      }
    }

    // If name was overwritten by return type, try first simple_identifier
    if (!name) {
      for (let i = 0; i < node.childCount; i++) {
        if (node.child(i).type === 'simple_identifier') {
          name = node.child(i).text;
          break;
        }
      }
    }

    // Find body node for complexity
    let bodyNode: SyntaxNode | null = null;
    for (let i = 0; i < node.childCount; i++) {
      if (node.child(i).type === 'function_body') {
        bodyNode = node.child(i);
        break;
      }
    }

    return {
      name,
      parameters: parseSwiftParams(params),
      returnType,
      isAsync,
      isPublic,
      complexity: computeComplexity(bodyNode),
      decorators: [],
      genericParams: [],
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  });
}

function getSwiftModifiers(node: SyntaxNode): string[] {
  const mods: string[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === 'modifiers') {
      for (let j = 0; j < child.childCount; j++) {
        mods.push(child.child(j).text.trim());
      }
    }
  }
  return mods;
}

function parseSwiftParams(paramNodes: SyntaxNode[]): UniversalParameterInfo[] {
  return paramNodes.map(p => {
    const text = p.text;
    const parts = text.split(':');
    const labelAndName = parts[0]?.trim().split(/\s+/) ?? [];
    const name = labelAndName[labelAndName.length - 1] || '';
    const type = parts.slice(1).join(':').trim() || undefined;
    return {
      name,
      type,
      isOptional: type?.endsWith('?') || false,
      defaultValue: undefined,
    };
  });
}

function extractSwiftClasses(root: SyntaxNode): UniversalClassInfo[] {
  const classTypes = ['class_declaration', 'struct_declaration', 'protocol_declaration'];
  const classNodes = findChildren(root, classTypes);

  return classNodes.map(node => {
    const nameNode = node.childForFieldName('name');
    const name = nameNode?.text ?? '';
    const modifiers = getSwiftModifiers(node);
    const isPublic = modifiers.includes('public') || modifiers.includes('open');

    // Extract conformances from inheritance clause
    const conformances: string[] = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'type_identifier' && child !== nameNode) {
        conformances.push(child.text);
      }
      if (child.type === 'inheritance_specifier' || child.type === 'user_type') {
        conformances.push(child.text);
      }
    }

    // Extract methods from class body
    const body = node.childForFieldName('body');
    const methodNodes = body ? findDescendants(body, ['function_declaration'], 2) : [];
    const methods = extractSwiftFunctions(methodNodes);

    return {
      name,
      methods,
      properties: extractProperties(body, 'swift'),
      isPublic,
      implements: conformances.slice(1),
      extends: conformances[0] || undefined,
      decorators: [],
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  });
}

function extractSwiftImports(root: SyntaxNode): UniversalImportInfo[] {
  const imports = findChildren(root, ['import_declaration']);
  return imports.map(node => {
    let module = '';
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'identifier' || child.type === 'simple_identifier') {
        module = child.text;
      }
    }
    return { module, namedImports: [], isTypeOnly: false };
  });
}

// ============================================================================
// TreeSitterWASMParser — ILanguageParser implementation
// ============================================================================

export class TreeSitterWASMParser implements ILanguageParser {
  readonly language: SupportedLanguage;
  readonly supportedExtensions: string[];

  constructor(language: SupportedLanguage, extensions: string[]) {
    this.language = language;
    this.supportedExtensions = extensions;
  }

  async parseFile(content: string, filePath: string): Promise<ParsedFile> {
    const lang = await loadLanguage(this.language);

    // Create a parser per call to avoid TOCTOU race conditions.
    // Two concurrent parseFile() calls for different languages could otherwise
    // corrupt each other via setLanguage() on a shared instance across await boundaries.
    // Parser creation is ~μs; grammar loading (the expensive part) is already cached.
    const parser = new treeSitterModule();
    parser.setLanguage(lang);

    const tree = parser.parse(content);
    const root = tree.rootNode;

    try {
      const result = this.extractFromAST(root);
      return {
        ...result,
        language: this.language,
        filePath,
      };
    } finally {
      tree.delete();
      parser.delete();
    }
  }

  private extractFromAST(root: SyntaxNode): Omit<ParsedFile, 'language' | 'filePath'> {
    const config = GRAMMAR_CONFIG[this.language];

    switch (this.language) {
      case 'python': {
        // Collect top-level functions (not inside classes)
        const allFuncNodes = findChildren(root, config.nodeTypes.functionDecl);
        // Also check decorated definitions
        const decoratedFuncs = findChildren(root, ['decorated_definition'])
          .map(d => {
            for (let i = 0; i < d.childCount; i++) {
              if (config.nodeTypes.functionDecl.includes(d.child(i).type)) return d.child(i);
            }
            return null;
          })
          .filter(Boolean) as SyntaxNode[];
        const funcNodes = [...allFuncNodes, ...decoratedFuncs];

        const allClassNodes = findChildren(root, config.nodeTypes.classDecl);
        const decoratedClasses = findChildren(root, ['decorated_definition'])
          .map(d => {
            for (let i = 0; i < d.childCount; i++) {
              if (config.nodeTypes.classDecl.includes(d.child(i).type)) return d.child(i);
            }
            return null;
          })
          .filter(Boolean) as SyntaxNode[];
        const classNodes = [...allClassNodes, ...decoratedClasses];

        const importNodes = findChildren(root, config.nodeTypes.importDecl);
        return {
          functions: extractPythonFunctions(funcNodes),
          classes: extractPythonClasses(classNodes),
          imports: extractPythonImports(importNodes),
        };
      }

      case 'java': {
        const classNodes = findDescendants(root, config.nodeTypes.classDecl);
        const importNodes = findChildren(root, config.nodeTypes.importDecl);
        // Top-level method declarations (outside classes are rare in Java, but extract them)
        const topFuncNodes = findChildren(root, config.nodeTypes.functionDecl);

        // Also extract methods from all classes for flat function list
        const allMethods: SyntaxNode[] = [...topFuncNodes];
        for (const cls of classNodes) {
          const body = cls.childForFieldName('body');
          if (body) {
            allMethods.push(...findChildren(body, config.nodeTypes.functionDecl));
          }
        }

        return {
          functions: extractJavaFunctions(allMethods),
          classes: extractJavaClasses(classNodes),
          imports: extractJavaImports(importNodes),
        };
      }

      case 'csharp':
        return {
          functions: extractCSharpFunctions(root),
          classes: extractCSharpClasses(root),
          imports: extractCSharpImports(root),
        };

      case 'rust':
        return {
          functions: extractRustFunctions(root, config),
          classes: extractRustStructs(root),
          imports: extractRustImports(root),
        };

      case 'swift': {
        // All function declarations at any depth (matching regex parser behavior)
        const allFuncNodes = findDescendants(root, config.nodeTypes.functionDecl);
        return {
          functions: extractSwiftFunctions(allFuncNodes),
          classes: extractSwiftClasses(root),
          imports: extractSwiftImports(root),
        };
      }

      default:
        return { functions: [], classes: [], imports: [] };
    }
  }
}

// ============================================================================
// Factory: Create WASM parsers for supported languages
// ============================================================================

const WASM_LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  python: ['.py'],
  java: ['.java'],
  csharp: ['.cs'],
  rust: ['.rs'],
  swift: ['.swift'],
};

export function createWasmParsers(): Map<SupportedLanguage, ILanguageParser> {
  const parsers = new Map<SupportedLanguage, ILanguageParser>();
  for (const [lang, exts] of Object.entries(WASM_LANGUAGE_EXTENSIONS)) {
    parsers.set(lang as SupportedLanguage, new TreeSitterWASMParser(lang as SupportedLanguage, exts));
  }
  return parsers;
}

/**
 * Check if web-tree-sitter WASM is available in this environment.
 * Returns true if the dependency is installed; does NOT initialize WASM.
 */
export function isWasmAvailable(): boolean {
  // Opt-out: set AQE_PARSER_REGEX_ONLY=1 to force regex parsers
  if (process.env.AQE_PARSER_REGEX_ONLY === '1' || process.env.AQE_PARSER_REGEX_ONLY === 'true') {
    return false;
  }

  try {
    // Check that web-tree-sitter runtime is installed
    const { createRequire } = Module;
    const req = createRequire(import.meta.url);
    req.resolve('web-tree-sitter');

    // Check that at least one bundled grammar exists
    resolveGrammarPath('tree-sitter-python.wasm');
    return true;
  } catch {
    return false;
  }
}

/**
 * Reset internal state — for testing only.
 */
export function _resetWasmState(): void {
  treeSitterModule = null;
  initPromise = null;
  initFailCount = 0;
  loadedLanguages.clear();
}
