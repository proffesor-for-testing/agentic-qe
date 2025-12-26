/**
 * Code Intelligence Parser Module
 * Tree-sitter based parser for extracting code entities
 *
 * Two parser implementations are available:
 * - WebTreeSitterParser: WASM-based, no native compilation (recommended)
 * - TreeSitterParser: Native bindings, faster but requires compilation
 */

export { WebTreeSitterParser } from './WebTreeSitterParser.js';
// Note: TreeSitterParser (native) was removed in favor of WebTreeSitterParser (WASM)
// WebTreeSitterParser provides the same functionality without native compilation requirements
export { WebTreeSitterParser as TreeSitterParser } from './WebTreeSitterParser.js';
export { LanguageRegistry } from './LanguageRegistry.js';
export type {
  CodeEntity,
  EntityType,
  Visibility,
  ParseResult,
  ParseError,
  LanguageConfig,
  Language,
} from './types.js';

// Re-export SyntaxNode type for extractor consumers
export type { SyntaxNode } from './WebTreeSitterParser.js';
