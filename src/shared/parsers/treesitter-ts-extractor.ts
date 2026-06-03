/**
 * Tree-sitter TypeScript/JavaScript extractor for code-intelligence.
 *
 * Extracts functions, classes (+ methods), interfaces and imports from TS/JS/TSX
 * source using bundled tree-sitter WASM grammars — so code-intelligence works
 * WITHOUT the multi-megabyte `typescript` compiler dependency (#511).
 *
 * The KnowledgeGraphService uses this as a fallback when the TypeScript compiler
 * API isn't available. Returns `null` when WASM/grammar can't load so the caller
 * can degrade gracefully.
 */

import { loadWasmGrammar } from './tree-sitter-wasm-parser.js';

// tree-sitter node — kept loose (web-tree-sitter has no shipped per-node types).
type TSNode = {
  type: string;
  text: string;
  childCount: number;
  child(i: number): TSNode | null;
  childForFieldName(name: string): TSNode | null;
  startPosition: { row: number };
  rootNode?: TSNode;
  delete?: () => void;
};

export interface TsFunction {
  name: string;
  startLine: number;
  isAsync: boolean;
  visibility: 'public' | 'private' | 'protected';
}
export interface TsClass {
  name: string;
  startLine: number;
  methods: TsFunction[];
}
export interface TsInterface {
  name: string;
  startLine: number;
}
export interface TsExtraction {
  functions: TsFunction[];
  classes: TsClass[];
  interfaces: TsInterface[];
  imports: string[];
}

/** Map a file extension to its grammar wasm file. */
function grammarFor(ext: string): string | null {
  switch (ext) {
    case 'ts':
    case 'mts':
    case 'cts':
      return 'tree-sitter-typescript.wasm';
    case 'tsx':
      return 'tree-sitter-tsx.wasm';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'tree-sitter-javascript.wasm';
    default:
      return null;
  }
}

export function isTreeSitterTsExtension(ext: string): boolean {
  return grammarFor(ext) !== null;
}

const line = (n: TSNode): number => n.startPosition.row + 1;
const fieldText = (n: TSNode, field: string): string =>
  n.childForFieldName(field)?.text ?? '';

/** Whether a declaration node begins with the `async` keyword. */
function isAsync(n: TSNode): boolean {
  for (let i = 0; i < n.childCount; i++) {
    const c = n.child(i);
    if (!c) continue;
    if (c.type === 'async') return true;
    // keyword precedes the function/method keyword; stop once we pass it
    if (c.type === 'function' || c.type === 'function_declaration') break;
  }
  return false;
}

function methodVisibility(n: TSNode): TsFunction['visibility'] {
  for (let i = 0; i < n.childCount; i++) {
    const t = n.child(i)?.type;
    if (t === 'accessibility_modifier') {
      const text = n.child(i)!.text;
      if (text === 'private') return 'private';
      if (text === 'protected') return 'protected';
    }
  }
  return 'public';
}

function extractClass(node: TSNode): TsClass {
  const name = fieldText(node, 'name') || '(anonymous)';
  const body = node.childForFieldName('body');
  const methods: TsFunction[] = [];
  if (body) {
    for (let i = 0; i < body.childCount; i++) {
      const m = body.child(i);
      if (m && m.type === 'method_definition') {
        methods.push({
          name: fieldText(m, 'name'),
          startLine: line(m),
          isAsync: isAsync(m),
          visibility: methodVisibility(m),
        });
      }
    }
  }
  return { name, startLine: line(node), methods };
}

/** Strip surrounding quotes from an import source literal. */
function unquote(s: string): string {
  return s.replace(/^['"`]|['"`]$/g, '');
}

/**
 * Extract entities/imports from TS/JS/TSX source. Returns null if the grammar
 * could not be loaded (WASM unavailable) so callers can fall back.
 */
export async function extractTsJs(
  content: string,
  extension: string
): Promise<TsExtraction | null> {
  const wasmFile = grammarFor(extension);
  if (!wasmFile) return null;

  const grammar = await loadWasmGrammar(wasmFile);
  if (!grammar) return null;

  let tree: TSNode | null = null;
  try {
    const parsed: TSNode = grammar.parse(content);
    tree = parsed;
    const root = parsed.rootNode;
    if (!root) return null;

    const out: TsExtraction = { functions: [], classes: [], interfaces: [], imports: [] };

    // Iterative walk. We do NOT recurse into function/class bodies (entities are
    // top-level / exported; methods are collected with their class).
    const stack: TSNode[] = [root];
    while (stack.length) {
      const node = stack.pop()!;
      let recurse = true;

      switch (node.type) {
        case 'function_declaration':
        case 'generator_function_declaration':
          out.functions.push({
            name: fieldText(node, 'name'),
            startLine: line(node),
            isAsync: isAsync(node),
            visibility: 'public',
          });
          recurse = false;
          break;

        case 'class_declaration':
        case 'class':
          out.classes.push(extractClass(node));
          recurse = false;
          break;

        case 'interface_declaration':
          out.interfaces.push({ name: fieldText(node, 'name'), startLine: line(node) });
          recurse = false;
          break;

        case 'lexical_declaration':
        case 'variable_declaration': {
          // const/let foo = () => {} | function() {}  → treat as a function
          for (let i = 0; i < node.childCount; i++) {
            const d = node.child(i);
            if (!d || d.type !== 'variable_declarator') continue;
            const value = d.childForFieldName('value');
            if (value && (value.type === 'arrow_function' ||
                          value.type === 'function' ||
                          value.type === 'function_expression')) {
              out.functions.push({
                name: fieldText(d, 'name'),
                startLine: line(d),
                isAsync: isAsync(value),
                visibility: 'public',
              });
            } else if (value && value.type === 'call_expression' &&
                       value.child(0)?.text === 'require') {
              // const x = require('y')
              const arg = value.childForFieldName('arguments')?.child(1);
              if (arg && arg.type === 'string') out.imports.push(unquote(arg.text));
            }
          }
          recurse = false;
          break;
        }

        case 'import_statement': {
          const src = node.childForFieldName('source');
          if (src) out.imports.push(unquote(src.text));
          recurse = false;
          break;
        }

        case 'call_expression': {
          // require('x')
          const fn = node.child(0);
          if (fn && fn.text === 'require') {
            const args = node.childForFieldName('arguments');
            const arg = args?.child(1); // ( <string> )
            if (arg && (arg.type === 'string')) out.imports.push(unquote(arg.text));
          }
          break;
        }
      }

      if (recurse) {
        for (let i = node.childCount - 1; i >= 0; i--) {
          const c = node.child(i);
          if (c) stack.push(c);
        }
      }
    }

    return out;
  } catch {
    return null;
  } finally {
    tree?.delete?.();
  }
}
