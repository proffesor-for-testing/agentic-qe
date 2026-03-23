/**
 * Lightweight regex-based code entity extractor.
 *
 * Builds a CodeIndexResult from file paths by scanning for
 * function/class/interface declarations, arrow function exports,
 * class method definitions, and import statements.
 *
 * Uses async file I/O to avoid blocking the event loop on large codebases.
 *
 * Used by both init phase 06 and the code-intelligence coordinator
 * to populate hypergraph tables.
 */

import { readFile } from 'fs/promises';
import type { CodeIndexResult } from '../integrations/ruvector/hypergraph-engine.js';

// Re-export the canonical type so callers don't need a second import
export type { CodeIndexResult };

// ============================================================================
// Constants
// ============================================================================

/** Keywords that look like method definitions but are control flow */
const CONTROL_FLOW_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return',
  'new', 'throw', 'import', 'export', 'constructor',
]);

/** Batch size for concurrent file reads to avoid fd exhaustion */
const READ_BATCH_SIZE = 50;

// ============================================================================
// Extractor
// ============================================================================

/**
 * Parse a single file's content into entities and imports.
 * Pure function — no I/O.
 */
function parseFileContent(
  filePath: string,
  content: string
): CodeIndexResult['files'][0] {
  const lines = content.split('\n');
  const entities: CodeIndexResult['files'][0]['entities'] = [];
  const imports: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Named function declarations: function foo() / export async function foo()
    const funcMatch = line.match(/(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)/);
    if (funcMatch) {
      entities.push({ type: 'function', name: funcMatch[1], lineStart: i + 1 });
      continue;
    }

    // Arrow function exports: export const foo = (...) => / export const foo = async (
    const arrowMatch = line.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*(?::\s*[^=]+)?\s*=>/);
    if (arrowMatch) {
      entities.push({ type: 'function', name: arrowMatch[1], lineStart: i + 1 });
      continue;
    }

    // Class declarations: class Foo / export abstract class Foo
    const classMatch = line.match(/(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch) {
      entities.push({ type: 'class', name: classMatch[1], lineStart: i + 1 });
      continue;
    }

    // Interface declarations: interface Foo / export interface Foo
    const interfaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
    if (interfaceMatch) {
      entities.push({ type: 'interface', name: interfaceMatch[1], lineStart: i + 1 });
      continue;
    }

    // Class method definitions: async doThing(...) / public static foo(
    // Must be indented (inside a class body) and not a control flow keyword
    const methodMatch = line.match(/^\s+(?:(?:public|private|protected|static|readonly|override|abstract|async)\s+)*(\w+)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{?\s*$/);
    if (methodMatch && !CONTROL_FLOW_KEYWORDS.has(methodMatch[1])) {
      entities.push({ type: 'function', name: methodMatch[1], lineStart: i + 1 });
      continue;
    }

    // Relative imports: import ... from './foo' / from '../bar'
    const importMatch = line.match(/(?:import|from)\s+['"](\.[^'"]+)['"]/);
    if (importMatch) {
      imports.push(importMatch[1]);
    }
  }

  return { path: filePath, entities, imports };
}

/**
 * Extract code entities and imports from a list of file paths.
 * Returns a CodeIndexResult compatible with HypergraphEngine.buildFromIndexResult().
 *
 * Uses async I/O in batches to avoid blocking the event loop and
 * exhausting file descriptors on large codebases.
 */
export async function extractCodeIndex(paths: string[]): Promise<CodeIndexResult> {
  const files: CodeIndexResult['files'] = [];

  // Process files in batches to limit concurrency
  for (let offset = 0; offset < paths.length; offset += READ_BATCH_SIZE) {
    const batch = paths.slice(offset, offset + READ_BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (filePath) => {
        const content = await readFile(filePath, 'utf-8');
        return parseFileContent(filePath, content);
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        files.push(result.value);
      }
      // Skip rejected (unreadable files) silently
    }
  }

  return { files };
}
