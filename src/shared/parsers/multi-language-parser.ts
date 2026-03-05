/**
 * Multi-Language Parser Registry (ADR-076)
 * Regex-based parsers for non-TypeScript languages.
 * Extracts function/class/import declarations for test generation.
 *
 * Uses two key utilities to handle complex syntax that naive line-by-line regex misses:
 * 1. joinMultiLineSignatures — collapses multi-line function/class declarations into single logical lines
 * 2. matchBalancedBrackets — handles nested generics like Map<String, List<Foo>> correctly
 */

import type { SupportedLanguage } from '../types/test-frameworks.js';
import type {
  ILanguageParser,
  ParsedFile,
  UniversalFunctionInfo,
  UniversalClassInfo,
  UniversalImportInfo,
  UniversalParameterInfo,
} from './interfaces.js';

// ============================================================================
// Shared Parsing Utilities
// ============================================================================

// Maximum line length for regex matching. Joined multi-line signatures can be long;
// lines beyond this limit are skipped to prevent polynomial-time regex backtracking (CWE-1333).
const MAX_REGEX_LINE_LEN = 1000;

/**
 * Join multi-line signatures into single logical lines.
 * Handles: function params spanning lines, class declarations with long implements lists,
 * multi-line annotations/attributes, and continuation lines.
 *
 * Returns { logicalLines, lineMap } where lineMap[logicalIndex] = originalStartLine (1-based).
 */
export function joinMultiLineSignatures(content: string): { logicalLines: string[]; lineMap: number[] } {
  const rawLines = content.split('\n');
  const logicalLines: string[] = [];
  const lineMap: number[] = [];
  let buffer = '';
  let bufferStartLine = 0;
  let openParens = 0;
  let openAngles = 0;
  let openSquare = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();

    // Skip pure comment/blank lines — emit them as-is
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) {
      if (buffer) {
        // Inside a continuation — keep accumulating
        buffer += ' ' + trimmed;
        continue;
      }
      logicalLines.push(line);
      lineMap.push(i + 1);
      continue;
    }

    if (!buffer) {
      bufferStartLine = i + 1;
    }
    buffer = buffer ? buffer + ' ' + trimmed : line;

    // Count bracket balance (ignoring strings/comments for simplicity — good enough for declarations)
    for (const ch of trimmed) {
      if (ch === '(') openParens++;
      else if (ch === ')') openParens = Math.max(0, openParens - 1);
      else if (ch === '<') openAngles++;
      else if (ch === '>') openAngles = Math.max(0, openAngles - 1);
      else if (ch === '[') openSquare++;
      else if (ch === ']') openSquare = Math.max(0, openSquare - 1);
    }

    // Line is complete when all brackets are balanced
    if (openParens === 0 && openAngles === 0 && openSquare === 0) {
      logicalLines.push(buffer);
      lineMap.push(bufferStartLine);
      buffer = '';
    }
  }

  // Flush remaining buffer
  if (buffer) {
    logicalLines.push(buffer);
    lineMap.push(bufferStartLine);
  }

  return { logicalLines, lineMap };
}

/**
 * Extract balanced bracket content starting at a given position.
 * Handles nested brackets: Map<String, List<Foo>> returns "String, List<Foo>"
 *
 * @param str - The string to scan
 * @param startIdx - Index of the opening bracket character
 * @param open - Opening bracket char (default '<')
 * @param close - Closing bracket char (default '>')
 * @returns The content between brackets (excluding the brackets), or undefined if unbalanced
 */
export function matchBalancedBrackets(str: string, startIdx: number, open = '<', close = '>'): string | undefined {
  if (str[startIdx] !== open) return undefined;
  let depth = 1;
  let i = startIdx + 1;
  while (i < str.length && depth > 0) {
    if (str[i] === open) depth++;
    else if (str[i] === close) depth--;
    i++;
  }
  if (depth !== 0) return undefined;
  return str.substring(startIdx + 1, i - 1);
}

/**
 * Extract the full type expression starting at an index, handling nested generics.
 * E.g., from "Map<String, List<Foo>> remaining" extracts "Map<String, List<Foo>>"
 */
export function extractFullType(str: string, startIdx = 0): string {
  let i = startIdx;
  // Skip whitespace
  while (i < str.length && str[i] === ' ') i++;
  const typeStart = i;

  // Walk through identifier chars
  while (i < str.length && /[\w.]/.test(str[i])) i++;

  // If next char is '<', consume balanced generics
  if (i < str.length && str[i] === '<') {
    const inner = matchBalancedBrackets(str, i);
    if (inner !== undefined) {
      i += inner.length + 2; // +2 for < and >
    }
  }

  // Handle array suffixes [], ?, !, etc.
  while (i < str.length && /[[\]?!*&]/.test(str[i])) i++;

  return str.substring(typeStart, i).trim();
}

/**
 * Collect decorators/attributes by scanning backwards from a line index.
 * Handles multi-line attribute chains like:
 *   #[derive(Debug)]
 *   #[serde(rename_all = "camelCase")]
 *   pub struct Foo { ... }
 *
 * @param lines - Array of source lines
 * @param lineIdx - Index of the declaration line (0-based)
 * @param prefix - Decorator prefix to look for ('@', '#[', '[')
 */
export function collectDecorators(lines: string[], lineIdx: number, prefix: string): string[] {
  const decorators: string[] = [];
  for (let j = lineIdx - 1; j >= 0; j--) {
    const trimmed = lines[j].trim();
    if (trimmed.startsWith(prefix)) {
      decorators.unshift(trimmed);
    } else if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) {
      // Allow blank lines and comments between decorators
      continue;
    } else {
      break;
    }
  }
  return decorators;
}

/**
 * Parse a balanced parenthesized parameter string.
 * Unlike regex [^)]*, this handles nested parens/generics inside parameter types.
 * Input: content after opening '(' — e.g. "id: Long, filter: Map<String, List<Int>>"
 */
export function extractParenContent(line: string, openIdx: number): string | undefined {
  return matchBalancedBrackets(line, openIdx, '(', ')');
}

/**
 * Split a parameter string by commas, respecting nested generics depth.
 * "String id, Map<String, List<Foo>> map" -> ["String id", "Map<String, List<Foo>> map"]
 */
function splitParamsGenericAware(paramsStr: string): string[] {
  const params: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of paramsStr) {
    if (ch === '<' || ch === '(') depth++;
    else if (ch === '>' || ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      params.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) params.push(current.trim());
  return params;
}

/**
 * Count braces in a line to track nesting depth.
 * Returns the delta (opens - closes).
 */
function countBraceDelta(line: string): number {
  let delta = 0;
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inString) {
      if (ch === stringChar && line[i - 1] !== '\\') inString = false;
      continue;
    }
    if (ch === '"' || ch === '\'' || ch === '`') {
      inString = true;
      stringChar = ch;
    } else if (ch === '{') {
      delta++;
    } else if (ch === '}') {
      delta--;
    }
  }
  return delta;
}

// --- Python Parser ---

class PythonParser implements ILanguageParser {
  readonly language: SupportedLanguage = 'python';
  readonly supportedExtensions = ['.py'];

  async parseFile(content: string, filePath: string): Promise<ParsedFile> {
    return {
      functions: this.extractFunctions(content),
      classes: this.extractClasses(content),
      imports: this.extractImports(content),
      language: 'python',
      filePath,
    };
  }

  private extractFunctions(content: string): UniversalFunctionInfo[] {
    const functions: UniversalFunctionInfo[] = [];
    const rawLines = content.split('\n');
    const { logicalLines, lineMap } = joinMultiLineSignatures(content);
    // Match: def function_name(params) -> return_type:
    //    or: async def function_name(params) -> return_type:
    const funcRegex =
      /^(\s*)(async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]*\S))?\s*:/;

    for (let i = 0; i < logicalLines.length; i++) {
      if (logicalLines[i].length > MAX_REGEX_LINE_LEN) continue;
      const match = logicalLines[i].match(funcRegex);
      if (match) {
        const indent = match[1].length;
        const isAsync = !!match[2];
        const name = match[3];
        const paramsStr = match[4];
        const returnType = match[5]?.trim();
        const origLine = lineMap[i] - 1; // 0-based index into rawLines

        // Find end of function (next line at same or lower indent, or end of file)
        let endLine = origLine + 1;
        for (let j = origLine + 1; j < rawLines.length; j++) {
          const line = rawLines[j];
          if (line.trim() === '' || line.trim().startsWith('#')) continue;
          const lineIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
          if (lineIndent <= indent && line.trim() !== '') {
            endLine = j;
            break;
          }
          endLine = j + 1;
        }

        const decorators = collectDecorators(rawLines, origLine, '@');

        functions.push({
          name,
          parameters: this.parseParams(paramsStr),
          returnType,
          isAsync,
          isPublic: !name.startsWith('_'),
          complexity: 1,
          decorators,
          genericParams: [],
          startLine: lineMap[i],
          endLine,
        });
      }
    }
    return functions;
  }

  private extractClasses(content: string): UniversalClassInfo[] {
    const classes: UniversalClassInfo[] = [];
    const rawLines = content.split('\n');
    const { logicalLines, lineMap } = joinMultiLineSignatures(content);
    const classRegex = /^(\s*)class\s+(\w+)(?:\(([^)]*)\))?\s*:/;

    for (let i = 0; i < logicalLines.length; i++) {
      const match = logicalLines[i].match(classRegex);
      if (match) {
        const indent = match[1].length;
        const name = match[2];
        const bases = match[3]
          ? match[3].split(',').map((b) => b.trim())
          : [];
        const origLine = lineMap[i] - 1;

        // Find end of class
        let endLine = origLine + 1;
        for (let j = origLine + 1; j < rawLines.length; j++) {
          const line = rawLines[j];
          if (line.trim() === '' || line.trim().startsWith('#')) continue;
          const lineIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
          if (lineIndent <= indent && line.trim() !== '') {
            endLine = j;
            break;
          }
          endLine = j + 1;
        }

        // Extract methods within class
        const classContent = rawLines.slice(origLine + 1, endLine).join('\n');
        const methods = this.extractFunctions(classContent).map((f) => ({
          ...f,
          startLine: f.startLine + origLine,
          endLine: f.endLine + origLine,
        }));

        const decorators = collectDecorators(rawLines, origLine, '@');

        classes.push({
          name,
          methods,
          properties: [],
          isPublic: !name.startsWith('_'),
          implements: [],
          extends: bases[0] || undefined,
          decorators,
          startLine: lineMap[i],
          endLine,
        });
      }
    }
    return classes;
  }

  private extractImports(content: string): UniversalImportInfo[] {
    const imports: UniversalImportInfo[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.length > MAX_REGEX_LINE_LEN) continue;
      // from module import name1, name2
      const fromMatch = line.match(/^\s*from\s+(\S+)\s+import\s+(.+)/);
      if (fromMatch) {
        const names = fromMatch[2]
          .split(',')
          .map((n) => n.trim().split(' as ')[0]);
        imports.push({
          module: fromMatch[1],
          namedImports: names,
          isTypeOnly: false,
        });
        continue;
      }
      // import module
      const importMatch = line.match(/^\s*import\s+(\S+)/);
      if (importMatch) {
        imports.push({
          module: importMatch[1],
          namedImports: [],
          isTypeOnly: false,
        });
      }
    }
    return imports;
  }

  private parseParams(paramsStr: string): UniversalParameterInfo[] {
    if (!paramsStr.trim()) return [];
    return splitParamsGenericAware(paramsStr)
      .map((p) => p.trim())
      .filter((p) => p && p !== 'self' && p !== 'cls')
      .map((p) => {
        const [nameDefault, type] = p.split(':').map((s) => s.trim());
        const [name, defaultValue] = nameDefault
          .split('=')
          .map((s) => s.trim());
        return {
          name,
          type: type?.split('=')[0].trim() || undefined,
          isOptional: !!defaultValue || name.startsWith('*'),
          defaultValue: defaultValue || undefined,
        };
      });
  }
}

// --- Java Parser ---

class JavaParser implements ILanguageParser {
  readonly language: SupportedLanguage = 'java';
  readonly supportedExtensions = ['.java'];

  async parseFile(content: string, filePath: string): Promise<ParsedFile> {
    return {
      functions: this.extractFunctions(content),
      classes: this.extractClasses(content),
      imports: this.extractImports(content),
      language: 'java',
      filePath,
    };
  }

  private extractFunctions(content: string): UniversalFunctionInfo[] {
    const functions: UniversalFunctionInfo[] = [];
    const rawLines = content.split('\n');
    const { logicalLines, lineMap } = joinMultiLineSignatures(content);
    // Match method declarations — use a simpler regex without <[^>]+> so generics don't break
    const methodRegex =
      /^\s*(public|private|protected)?\s*(static)?\s*(async)?\s*(?:<\S+>\s+)?([\w<>,.[\]?]+(?:\s+[\w<>,.[\]?]+)*)\s+(\w+)\s*\(([^)]*)\)/;

    for (let i = 0; i < logicalLines.length; i++) {
      const line = logicalLines[i];
      if (line.includes(' class ') || line.includes(' interface ')) continue;
      if (line.length > MAX_REGEX_LINE_LEN) continue;

      const match = line.match(methodRegex);
      if (match) {
        const visibility = match[1] || 'default';
        const name = match[5];
        const paramsStr = match[6];

        // Extract the full return type with balanced generics
        const returnTypeRaw = match[4]?.trim();
        let returnType = returnTypeRaw;
        // If the raw return type was truncated by the regex, try to extract full type
        if (returnTypeRaw && returnTypeRaw.includes('<')) {
          const angleIdx = returnTypeRaw.indexOf('<');
          const inner = matchBalancedBrackets(returnTypeRaw, angleIdx);
          if (inner !== undefined) {
            returnType = returnTypeRaw.substring(0, angleIdx) + '<' + inner + '>';
          }
        }

        const origLine = lineMap[i] - 1;
        const decorators = collectDecorators(rawLines, origLine, '@');

        functions.push({
          name,
          parameters: this.parseParams(paramsStr),
          returnType: returnType === 'void' ? undefined : returnType,
          isAsync: returnType?.includes('CompletableFuture') || false,
          isPublic: visibility === 'public',
          complexity: 1,
          decorators,
          genericParams: [],
          startLine: lineMap[i],
          endLine: lineMap[i],
        });
      }
    }
    return functions;
  }

  private extractClasses(content: string): UniversalClassInfo[] {
    const classes: UniversalClassInfo[] = [];
    const rawLines = content.split('\n');
    const { logicalLines, lineMap } = joinMultiLineSignatures(content);
    const classRegex =
      /^\s*(public|private|protected)?\s*(abstract)?\s*class\s+(\w+)(?:<[^{]*>)?(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{\s]+(?:\s+[^{\s]+)*))?\s*\{?/;

    for (let i = 0; i < logicalLines.length; i++) {
      if (logicalLines[i].length > MAX_REGEX_LINE_LEN) continue;
      const match = logicalLines[i].match(classRegex);
      if (match) {
        const name = match[3];
        const extendsName = match[4];
        const implementsList = match[5]
          ? match[5].split(',').map((s) => s.trim())
          : [];

        const origLine = lineMap[i] - 1;
        const decorators = collectDecorators(rawLines, origLine, '@');

        classes.push({
          name,
          methods: [],
          properties: [],
          isPublic: (match[1] || 'default') === 'public',
          implements: implementsList,
          extends: extendsName,
          decorators,
          startLine: lineMap[i],
          endLine: lineMap[i],
        });
      }
    }
    return classes;
  }

  private extractImports(content: string): UniversalImportInfo[] {
    const imports: UniversalImportInfo[] = [];
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.length > MAX_REGEX_LINE_LEN) continue;
      const match = line.match(/^\s*import +(static +)?(\S[^;]*);/);
      if (match) {
        const module = match[2].trim();
        const parts = module.split('.');
        const name = parts[parts.length - 1];
        imports.push({
          module,
          namedImports: name === '*' ? [] : [name],
          isTypeOnly: false,
        });
      }
    }
    return imports;
  }

  private parseParams(paramsStr: string): UniversalParameterInfo[] {
    if (!paramsStr.trim()) return [];
    return splitParamsGenericAware(paramsStr).map((p) => {
      const parts = p.trim().split(/\s+/);
      // Handle annotations: @NotNull String name
      const filtered = parts.filter((part) => !part.startsWith('@'));
      const name = filtered[filtered.length - 1] || '';
      const type = filtered.slice(0, -1).join(' ') || undefined;
      return { name, type, isOptional: false, defaultValue: undefined };
    });
  }
}

// --- C# Parser ---

class CSharpParser implements ILanguageParser {
  readonly language: SupportedLanguage = 'csharp';
  readonly supportedExtensions = ['.cs'];

  async parseFile(content: string, filePath: string): Promise<ParsedFile> {
    return {
      functions: this.extractMethods(content),
      classes: this.extractClasses(content),
      imports: this.extractImports(content),
      language: 'csharp',
      filePath,
    };
  }

  private extractMethods(content: string): UniversalFunctionInfo[] {
    const functions: UniversalFunctionInfo[] = [];
    const rawLines = content.split('\n');
    const { logicalLines, lineMap } = joinMultiLineSignatures(content);
    const methodRegex =
      /^\s*(public|private|protected|internal)?\s*(static)?\s*(async)?\s*([\w<>,.[\]?]+(?:\s+[\w<>,.[\]?]+)*)\s+(\w+)\s*\(([^)]*)\)/;

    for (let i = 0; i < logicalLines.length; i++) {
      const line = logicalLines[i];
      if (line.includes(' class ') || line.includes(' interface ') || line.includes(' namespace ')) continue;
      if (line.length > MAX_REGEX_LINE_LEN) continue;

      const match = line.match(methodRegex);
      if (match) {
        const visibility = match[1] || 'private';
        const isAsync =
          !!match[3] || match[4]?.includes('Task') || false;
        const returnTypeRaw = match[4]?.trim();
        let returnType = returnTypeRaw;
        // Extract full generic type
        if (returnTypeRaw && returnTypeRaw.includes('<')) {
          const angleIdx = returnTypeRaw.indexOf('<');
          const inner = matchBalancedBrackets(returnTypeRaw, angleIdx);
          if (inner !== undefined) {
            returnType = returnTypeRaw.substring(0, angleIdx) + '<' + inner + '>';
          }
        }
        const name = match[5];
        const paramsStr = match[6];

        const origLine = lineMap[i] - 1;
        const decorators = collectDecorators(rawLines, origLine, '[');

        functions.push({
          name,
          parameters: this.parseParams(paramsStr),
          returnType: returnType === 'void' ? undefined : returnType,
          isAsync,
          isPublic: visibility === 'public',
          complexity: 1,
          decorators,
          genericParams: [],
          startLine: lineMap[i],
          endLine: lineMap[i],
        });
      }
    }
    return functions;
  }

  private extractClasses(content: string): UniversalClassInfo[] {
    const classes: UniversalClassInfo[] = [];
    const rawLines = content.split('\n');
    const { logicalLines, lineMap } = joinMultiLineSignatures(content);
    const classRegex =
      /^\s*(public|private|protected|internal)?\s*(abstract|sealed|static|partial)?\s*class\s+(\w+)(?:<[^{]*>)?(?:\s*:\s*([^{\s]+(?:\s+[^{\s]+)*))?\s*\{?/;

    for (let i = 0; i < logicalLines.length; i++) {
      if (logicalLines[i].length > MAX_REGEX_LINE_LEN) continue;
      const match = logicalLines[i].match(classRegex);
      if (match) {
        const name = match[3];
        const bases = match[4]
          ? match[4].split(',').map((s) => s.trim())
          : [];

        const origLine = lineMap[i] - 1;
        const decorators = collectDecorators(rawLines, origLine, '[');

        classes.push({
          name,
          methods: [],
          properties: [],
          isPublic: (match[1] || 'internal') === 'public',
          implements: bases.slice(1),
          extends: bases[0] || undefined,
          decorators,
          startLine: lineMap[i],
          endLine: lineMap[i],
        });
      }
    }
    return classes;
  }

  private extractImports(content: string): UniversalImportInfo[] {
    const imports: UniversalImportInfo[] = [];
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.length > MAX_REGEX_LINE_LEN) continue;
      const match = line.match(/^\s*using +(static +)?(\S[^;]*);/);
      if (match) {
        imports.push({
          module: match[2].trim(),
          namedImports: [],
          isTypeOnly: false,
        });
      }
    }
    return imports;
  }

  private parseParams(paramsStr: string): UniversalParameterInfo[] {
    if (!paramsStr.trim()) return [];
    return splitParamsGenericAware(paramsStr).map((p) => {
      const parts = p.trim().split(/\s+/);
      const name = parts[parts.length - 1] || '';
      const type = parts.slice(0, -1).join(' ') || undefined;
      return {
        name,
        type,
        isOptional: type?.endsWith('?') || false,
        defaultValue: undefined,
      };
    });
  }
}

// --- Go Parser ---

class GoParser implements ILanguageParser {
  readonly language: SupportedLanguage = 'go';
  readonly supportedExtensions = ['.go'];

  async parseFile(content: string, filePath: string): Promise<ParsedFile> {
    return {
      functions: this.extractFunctions(content),
      classes: this.extractStructs(content),
      imports: this.extractImports(content),
      language: 'go',
      filePath,
    };
  }

  private extractFunctions(content: string): UniversalFunctionInfo[] {
    const functions: UniversalFunctionInfo[] = [];
    const rawLines = content.split('\n');
    const { logicalLines, lineMap } = joinMultiLineSignatures(content);
    // func Name(params) returnType {
    // func (r *Receiver) Name(params) returnType {
    const funcRegex =
      /^\s*func\s+(?:\((\w+)\s+\*?(\w+)\)\s+)?(\w+)\s*\(([^)]*)\)\s*([\w*[\](),\s]*)\s*\{?/;

    // Track brace depth to filter nested function literals (Go closures).
    // Go methods use receiver syntax at top level, so only depth 0 is valid.
    let braceDepth = 0;

    for (let i = 0; i < logicalLines.length; i++) {
      const line = logicalLines[i];
      if (line.length > MAX_REGEX_LINE_LEN) { braceDepth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0); continue; }

      const match = line.match(funcRegex);
      if (match && braceDepth === 0) {
        const name = match[3];
        const paramsStr = match[4];
        const returnType = match[5]?.trim() || undefined;

        functions.push({
          name,
          parameters: this.parseParams(paramsStr),
          returnType: returnType || undefined,
          isAsync: false,
          isPublic: name[0] === name[0].toUpperCase(),
          complexity: 1,
          decorators: [],
          genericParams: [],
          startLine: lineMap[i],
          endLine: lineMap[i],
        });
      }

      // Update brace depth after checking for function match
      braceDepth += countBraceDelta(line);
      if (braceDepth < 0) braceDepth = 0;
    }
    return functions;
  }

  private extractStructs(content: string): UniversalClassInfo[] {
    const structs: UniversalClassInfo[] = [];
    const { logicalLines, lineMap } = joinMultiLineSignatures(content);
    const structRegex = /^\s*type\s+(\w+)\s+struct\s*\{/;

    for (let i = 0; i < logicalLines.length; i++) {
      const match = logicalLines[i].match(structRegex);
      if (match) {
        const name = match[1];
        structs.push({
          name,
          methods: [],
          properties: [],
          isPublic: name[0] === name[0].toUpperCase(),
          implements: [],
          extends: undefined,
          decorators: [],
          startLine: lineMap[i],
          endLine: lineMap[i],
        });
      }
    }
    return structs;
  }

  private extractImports(content: string): UniversalImportInfo[] {
    const imports: UniversalImportInfo[] = [];
    const singleImport = /^\s*import\s+"([^"]+)"/;
    const multiImportStart = /^\s*import\s*\(/;
    const multiImportLine = /^\s*"([^"]+)"/;

    const lines = content.split('\n');
    let inMultiImport = false;

    for (const line of lines) {
      if (inMultiImport) {
        if (line.includes(')')) {
          inMultiImport = false;
          continue;
        }
        const match = line.match(multiImportLine);
        if (match)
          imports.push({
            module: match[1],
            namedImports: [],
            isTypeOnly: false,
          });
      } else {
        const single = line.match(singleImport);
        if (single) {
          imports.push({
            module: single[1],
            namedImports: [],
            isTypeOnly: false,
          });
        } else if (multiImportStart.test(line)) {
          inMultiImport = true;
        }
      }
    }
    return imports;
  }

  private parseParams(paramsStr: string): UniversalParameterInfo[] {
    if (!paramsStr.trim()) return [];
    return splitParamsGenericAware(paramsStr).map((p) => {
      const parts = p.trim().split(/\s+/);
      const name = parts[0] || '';
      const type = parts.slice(1).join(' ') || undefined;
      return { name, type, isOptional: false, defaultValue: undefined };
    });
  }
}

// --- Rust Parser ---

class RustParser implements ILanguageParser {
  readonly language: SupportedLanguage = 'rust';
  readonly supportedExtensions = ['.rs'];

  async parseFile(content: string, filePath: string): Promise<ParsedFile> {
    return {
      functions: this.extractFunctions(content),
      classes: this.extractStructsAndImpls(content),
      imports: this.extractImports(content),
      language: 'rust',
      filePath,
    };
  }

  private extractFunctions(content: string): UniversalFunctionInfo[] {
    const functions: UniversalFunctionInfo[] = [];
    const rawLines = content.split('\n');
    const { logicalLines, lineMap } = joinMultiLineSignatures(content);
    // Updated regex: use [^{]* instead of [^>]+ for generics to handle lifetimes
    const fnRegex =
      /^\s*(pub(?:\(crate\))? +)?(async +)?fn\s+(\w+)(?:<[^{]*>)?\s*\(([^)]*)\)(?:\s*->\s*([^{\s]+(?:\s+[^{\s]+)*))?\s*(?:where\s+[^{\s]+(?:\s+[^{\s]+)*)?\s*\{?/;

    // Track brace depth to filter nested closures.
    // Rust functions at depth 0 (top-level) and depth 1 (inside impl/mod blocks) are valid.
    let braceDepth = 0;

    for (let i = 0; i < logicalLines.length; i++) {
      const line = logicalLines[i];

      const match = line.match(fnRegex);
      if (match && braceDepth <= 1) {
        const isPub = !!match[1];
        const isAsync = !!match[2];
        const name = match[3];
        const paramsStr = match[4];
        const returnType = match[5]?.trim();

        const origLine = lineMap[i] - 1;
        const decorators = collectDecorators(rawLines, origLine, '#[');

        functions.push({
          name,
          parameters: this.parseParams(paramsStr),
          returnType,
          isAsync,
          isPublic: isPub,
          complexity: 1,
          decorators,
          genericParams: [],
          startLine: lineMap[i],
          endLine: lineMap[i],
        });
      }

      // Update brace depth after checking for function match
      braceDepth += countBraceDelta(line);
      if (braceDepth < 0) braceDepth = 0;
    }
    return functions;
  }

  private extractStructsAndImpls(content: string): UniversalClassInfo[] {
    const structs: UniversalClassInfo[] = [];
    const rawLines = content.split('\n');
    const { logicalLines, lineMap } = joinMultiLineSignatures(content);
    // Updated: use [^{]* for generics with lifetimes
    const structRegex =
      /^\s*(pub(?:\(crate\))?\s+)?struct\s+(\w+)(?:<[^{]*>)?\s*/;

    for (let i = 0; i < logicalLines.length; i++) {
      const match = logicalLines[i].match(structRegex);
      if (match) {
        const origLine = lineMap[i] - 1;
        const decorators = collectDecorators(rawLines, origLine, '#[');

        structs.push({
          name: match[2],
          methods: [],
          properties: [],
          isPublic: !!match[1],
          implements: [],
          extends: undefined,
          decorators,
          startLine: lineMap[i],
          endLine: lineMap[i],
        });
      }
    }
    return structs;
  }

  private extractImports(content: string): UniversalImportInfo[] {
    const imports: UniversalImportInfo[] = [];
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.length > MAX_REGEX_LINE_LEN) continue;
      const match = line.match(/^\s*use +(\S[^;]*);/);
      if (match) {
        imports.push({
          module: match[1].trim(),
          namedImports: [],
          isTypeOnly: false,
        });
      }
    }
    return imports;
  }

  private parseParams(paramsStr: string): UniversalParameterInfo[] {
    if (!paramsStr.trim()) return [];
    return splitParamsGenericAware(paramsStr)
      .map((p) => p.trim())
      .filter(
        (p) => p && p !== '&self' && p !== '&mut self' && p !== 'self',
      )
      .map((p) => {
        const colonIdx = p.indexOf(':');
        if (colonIdx === -1)
          return {
            name: p,
            type: undefined,
            isOptional: false,
            defaultValue: undefined,
          };
        const name = p.substring(0, colonIdx).trim();
        const type = p.substring(colonIdx + 1).trim();
        return { name, type, isOptional: false, defaultValue: undefined };
      });
  }
}

// --- Swift Parser ---

class SwiftParser implements ILanguageParser {
  readonly language: SupportedLanguage = 'swift';
  readonly supportedExtensions = ['.swift'];

  async parseFile(content: string, filePath: string): Promise<ParsedFile> {
    return {
      functions: this.extractFunctions(content),
      classes: this.extractClasses(content),
      imports: this.extractImports(content),
      language: 'swift',
      filePath,
    };
  }

  private extractFunctions(content: string): UniversalFunctionInfo[] {
    const functions: UniversalFunctionInfo[] = [];
    const { logicalLines, lineMap } = joinMultiLineSignatures(content);
    const funcRegex =
      /^\s*(public|private|internal|open)?\s*(static)?\s*func\s+(\w+)(?:<[^{]*>)?\s*\(([^)]*)\)(?:\s*(async))?\s*(?:throws +)?(?:->\s*([^{\s]+(?:\s+[^{\s]+)*))?\s*\{?/;

    for (let i = 0; i < logicalLines.length; i++) {
      if (logicalLines[i].length > MAX_REGEX_LINE_LEN) continue;
      const match = logicalLines[i].match(funcRegex);
      if (match) {
        const visibility = match[1] || 'internal';
        const isAsync = !!match[5];
        const name = match[3];
        const paramsStr = match[4];
        const returnType = match[6]?.trim();

        functions.push({
          name,
          parameters: this.parseParams(paramsStr),
          returnType,
          isAsync,
          isPublic: visibility === 'public' || visibility === 'open',
          complexity: 1,
          decorators: [],
          genericParams: [],
          startLine: lineMap[i],
          endLine: lineMap[i],
        });
      }
    }
    return functions;
  }

  private extractClasses(content: string): UniversalClassInfo[] {
    const classes: UniversalClassInfo[] = [];
    const { logicalLines, lineMap } = joinMultiLineSignatures(content);
    const classRegex =
      /^\s*(public|private|internal|open)?\s*(class|struct|protocol)\s+(\w+)(?:<[^{]*>)?(?:\s*:\s*([^{\s]+(?:\s+[^{\s]+)*))?\s*\{?/;

    for (let i = 0; i < logicalLines.length; i++) {
      if (logicalLines[i].length > MAX_REGEX_LINE_LEN) continue;
      const match = logicalLines[i].match(classRegex);
      if (match) {
        const name = match[3];
        const conformances = match[4]
          ? match[4].split(',').map((s) => s.trim())
          : [];

        classes.push({
          name,
          methods: [],
          properties: [],
          isPublic:
            (match[1] || 'internal') === 'public' || match[1] === 'open',
          implements: conformances.slice(1),
          extends: conformances[0] || undefined,
          decorators: [],
          startLine: lineMap[i],
          endLine: lineMap[i],
        });
      }
    }
    return classes;
  }

  private extractImports(content: string): UniversalImportInfo[] {
    const imports: UniversalImportInfo[] = [];
    const lines = content.split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*import\s+(\w+)/);
      if (match)
        imports.push({
          module: match[1],
          namedImports: [],
          isTypeOnly: false,
        });
    }
    return imports;
  }

  private parseParams(paramsStr: string): UniversalParameterInfo[] {
    if (!paramsStr.trim()) return [];
    return splitParamsGenericAware(paramsStr).map((p) => {
      const parts = p.trim().split(':');
      const labelAndName = parts[0]?.trim().split(/\s+/) || [];
      const name = labelAndName[labelAndName.length - 1] || '';
      const type = parts.slice(1).join(':').trim();
      return {
        name,
        type: type || undefined,
        isOptional: type?.endsWith('?') || false,
        defaultValue: undefined,
      };
    });
  }
}

// --- Kotlin Parser ---

class KotlinParser implements ILanguageParser {
  readonly language: SupportedLanguage = 'kotlin';
  readonly supportedExtensions = ['.kt', '.kts'];

  async parseFile(content: string, filePath: string): Promise<ParsedFile> {
    return {
      functions: this.extractFunctions(content),
      classes: this.extractClasses(content),
      imports: this.extractImports(content),
      language: 'kotlin',
      filePath,
    };
  }

  private extractFunctions(content: string): UniversalFunctionInfo[] {
    const functions: UniversalFunctionInfo[] = [];
    const rawLines = content.split('\n');
    const { logicalLines, lineMap } = joinMultiLineSignatures(content);
    const funcRegex =
      /^\s*(public|private|protected|internal)?\s*(suspend)?\s*fun\s+(?:<[^{]*> +)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{=\s]+(?:\s+[^{=\s]+)*))?\s*/;

    // Track brace depth to filter nested lambdas that look like functions.
    // Kotlin functions at depth 0 (top-level) and depth 1 (inside class bodies) are valid.
    let braceDepth = 0;

    for (let i = 0; i < logicalLines.length; i++) {
      const line = logicalLines[i];
      if (line.length > MAX_REGEX_LINE_LEN) { braceDepth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0); continue; }

      const match = line.match(funcRegex);
      if (match && braceDepth <= 1) {
        const visibility = match[1] || 'public';
        const isSuspend = !!match[2];
        const name = match[3];
        const paramsStr = match[4];
        let returnType = match[5]?.trim();

        // Extract full generic return type
        if (returnType && returnType.includes('<')) {
          const angleIdx = returnType.indexOf('<');
          const inner = matchBalancedBrackets(returnType, angleIdx);
          if (inner !== undefined) {
            returnType = returnType.substring(0, angleIdx) + '<' + inner + '>';
          }
        }

        const origLine = lineMap[i] - 1;
        const decorators = collectDecorators(rawLines, origLine, '@');

        functions.push({
          name,
          parameters: this.parseParams(paramsStr),
          returnType,
          isAsync: isSuspend,
          isPublic: visibility === 'public',
          complexity: 1,
          decorators,
          genericParams: [],
          startLine: lineMap[i],
          endLine: lineMap[i],
        });
      }

      // Update brace depth after checking for function match
      braceDepth += countBraceDelta(line);
      if (braceDepth < 0) braceDepth = 0;
    }
    return functions;
  }

  private extractClasses(content: string): UniversalClassInfo[] {
    const classes: UniversalClassInfo[] = [];
    const rawLines = content.split('\n');
    const { logicalLines, lineMap } = joinMultiLineSignatures(content);
    const classRegex =
      /^\s*(public|private|protected|internal)?\s*(data|sealed|abstract|open)?\s*class\s+(\w+)(?:<[^{]*>)?(?:\s*(?:\([^)]*\))?\s*:\s*([^{\s]+(?:\s+[^{\s]+)*))?\s*\{?/;

    for (let i = 0; i < logicalLines.length; i++) {
      if (logicalLines[i].length > MAX_REGEX_LINE_LEN) continue;
      const match = logicalLines[i].match(classRegex);
      if (match) {
        const name = match[3];
        const bases = match[4]
          ? match[4]
              .split(',')
              .map((s) => s.trim().split('(')[0].trim())
          : [];

        const origLine = lineMap[i] - 1;
        const decorators = collectDecorators(rawLines, origLine, '@');

        classes.push({
          name,
          methods: [],
          properties: [],
          isPublic: (match[1] || 'public') === 'public',
          implements: bases.slice(1),
          extends: bases[0] || undefined,
          decorators,
          startLine: lineMap[i],
          endLine: lineMap[i],
        });
      }
    }
    return classes;
  }

  private extractImports(content: string): UniversalImportInfo[] {
    const imports: UniversalImportInfo[] = [];
    const lines = content.split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*import\s+([^\s]+)/);
      if (match)
        imports.push({
          module: match[1],
          namedImports: [],
          isTypeOnly: false,
        });
    }
    return imports;
  }

  private parseParams(paramsStr: string): UniversalParameterInfo[] {
    if (!paramsStr.trim()) return [];
    return splitParamsGenericAware(paramsStr).map((p) => {
      // Split on first colon only, since types can contain colons in rare cases
      const colonIdx = p.indexOf(':');
      if (colonIdx === -1) {
        const cleaned = p.replace('val ', '').replace('var ', '').trim();
        return { name: cleaned, type: undefined, isOptional: false, defaultValue: undefined };
      }
      const nameWithVal = p.substring(0, colonIdx)
        .replace('val ', '')
        .replace('var ', '')
        .trim();
      const typeAndDefault = p.substring(colonIdx + 1).trim();
      const eqIdx = typeAndDefault.indexOf('=');
      const type = eqIdx >= 0 ? typeAndDefault.substring(0, eqIdx).trim() : typeAndDefault;
      const hasDefault = eqIdx >= 0;
      return {
        name: nameWithVal,
        type,
        isOptional: hasDefault || type?.endsWith('?') || false,
        defaultValue: undefined,
      };
    });
  }
}

// --- Dart Parser ---

class DartParser implements ILanguageParser {
  readonly language: SupportedLanguage = 'dart';
  readonly supportedExtensions = ['.dart'];

  async parseFile(content: string, filePath: string): Promise<ParsedFile> {
    return {
      functions: this.extractFunctions(content),
      classes: this.extractClasses(content),
      imports: this.extractImports(content),
      language: 'dart',
      filePath,
    };
  }

  private extractFunctions(content: string): UniversalFunctionInfo[] {
    const functions: UniversalFunctionInfo[] = [];
    const { logicalLines, lineMap } = joinMultiLineSignatures(content);
    const funcRegex =
      /^\s*([\w<>,.?]+(?:\s+[\w<>,.?]+)*)\s+(\w+)\s*\(([^)]*)\)(?:\s*(async))?\s*\{/;

    for (let i = 0; i < logicalLines.length; i++) {
      const line = logicalLines[i];
      if (line.includes(' class ')) continue;
      if (line.length > MAX_REGEX_LINE_LEN) continue;

      const match = line.match(funcRegex);
      if (match) {
        const returnTypeRaw = match[1].trim();
        let returnType = returnTypeRaw;
        // Extract full generic return type
        if (returnTypeRaw && returnTypeRaw.includes('<')) {
          const angleIdx = returnTypeRaw.indexOf('<');
          const inner = matchBalancedBrackets(returnTypeRaw, angleIdx);
          if (inner !== undefined) {
            returnType = returnTypeRaw.substring(0, angleIdx) + '<' + inner + '>';
          }
        }
        const name = match[2];
        const paramsStr = match[3];
        const isAsync = !!match[4] || returnType.includes('Future');

        functions.push({
          name,
          parameters: this.parseParams(paramsStr),
          returnType: returnType === 'void' ? undefined : returnType,
          isAsync,
          isPublic: !name.startsWith('_'),
          complexity: 1,
          decorators: [],
          genericParams: [],
          startLine: lineMap[i],
          endLine: lineMap[i],
        });
      }
    }
    return functions;
  }

  private extractClasses(content: string): UniversalClassInfo[] {
    const classes: UniversalClassInfo[] = [];
    const { logicalLines, lineMap } = joinMultiLineSignatures(content);
    const classRegex =
      /^\s*(abstract +)?class\s+(\w+)(?:<[^{]*>)?(?:\s+extends\s+(\w+))?(?:\s+(?:with|implements)\s+([^{\s]+(?:\s+[^{\s]+)*))?\s*\{/;

    for (let i = 0; i < logicalLines.length; i++) {
      if (logicalLines[i].length > MAX_REGEX_LINE_LEN) continue;
      const match = logicalLines[i].match(classRegex);
      if (match) {
        const name = match[2];
        const extendsName = match[3];
        const mixinsAndInterfaces = match[4]
          ? match[4].split(',').map((s) => s.trim())
          : [];

        classes.push({
          name,
          methods: [],
          properties: [],
          isPublic: !name.startsWith('_'),
          implements: mixinsAndInterfaces,
          extends: extendsName,
          decorators: [],
          startLine: lineMap[i],
          endLine: lineMap[i],
        });
      }
    }
    return classes;
  }

  private extractImports(content: string): UniversalImportInfo[] {
    const imports: UniversalImportInfo[] = [];
    const lines = content.split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*import\s+'([^']+)'/);
      if (match)
        imports.push({
          module: match[1],
          namedImports: [],
          isTypeOnly: false,
        });
    }
    return imports;
  }

  private parseParams(paramsStr: string): UniversalParameterInfo[] {
    if (!paramsStr.trim()) return [];
    // Remove curly/square brackets for named/optional params
    const clean = paramsStr.replace(/[{}[\]]/g, '');
    return splitParamsGenericAware(clean)
      .map((p) => p.trim())
      .filter((p) => p)
      .map((p) => {
        const parts = p
          .replace('required ', '')
          .trim()
          .split(/\s+/);
        const name = parts[parts.length - 1] || '';
        const type = parts.slice(0, -1).join(' ') || undefined;
        return {
          name,
          type,
          isOptional: p.includes('?') || p.includes('{'),
          defaultValue: undefined,
        };
      });
  }
}

// ============================================================================
// Parser Registry
// ============================================================================

/**
 * Registry of all language parsers.
 * Provides regex-based parsing for Python, Java, C#, Go, Rust, Swift, Kotlin, Dart.
 */
export class TreeSitterParserRegistry {
  private parsers = new Map<SupportedLanguage, ILanguageParser>();

  constructor() {
    this.register(new PythonParser());
    this.register(new JavaParser());
    this.register(new CSharpParser());
    this.register(new GoParser());
    this.register(new RustParser());
    this.register(new SwiftParser());
    this.register(new KotlinParser());
    this.register(new DartParser());
  }

  register(parser: ILanguageParser): void {
    this.parsers.set(parser.language, parser);
  }

  getParser(language: SupportedLanguage): ILanguageParser | undefined {
    return this.parsers.get(language);
  }

  async parseFile(
    content: string,
    filePath: string,
    language: SupportedLanguage,
  ): Promise<ParsedFile | undefined> {
    const parser = this.parsers.get(language);
    if (!parser) return undefined;
    return parser.parseFile(content, filePath);
  }

  getSupportedLanguages(): SupportedLanguage[] {
    return Array.from(this.parsers.keys());
  }

  supportsLanguage(language: SupportedLanguage): boolean {
    return this.parsers.has(language);
  }
}

export const treeSitterRegistry = new TreeSitterParserRegistry();

// Export individual parsers for direct use
export {
  PythonParser,
  JavaParser,
  CSharpParser,
  GoParser,
  RustParser,
  SwiftParser,
  KotlinParser,
  DartParser,
};
