/**
 * LSP Integration Bridge
 *
 * Bridges between OpenCode's native LSP support and AQE's code intelligence
 * features. Extracts symbol information, diagnostics, and references from
 * the language server to feed into AQE's test generation, defect prediction,
 * and impact analysis tools.
 *
 * This module defines the types and abstract interface. Concrete implementations
 * depend on the LSP client available in the runtime environment (OpenCode's
 * built-in LSP or a standalone client).
 *
 * @module lsp/lsp-bridge
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Symbol information extracted from LSP for test generation input.
 */
export interface SymbolInfo {
  /** Symbol name (e.g., function name, class name) */
  name: string;
  /** Symbol kind (function, class, interface, variable, etc.) */
  kind: SymbolKind;
  /** File path where the symbol is defined */
  filePath: string;
  /** Line range of the symbol definition */
  range: LineRange;
  /** Parameter information for functions/methods */
  parameters?: ParameterInfo[];
  /** Return type for functions/methods */
  returnType?: string;
  /** Whether the symbol is exported */
  isExported: boolean;
  /** JSDoc/docstring if available */
  documentation?: string;
  /** Parent symbol (e.g., class for a method) */
  containerName?: string;
}

export type SymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'enum'
  | 'variable'
  | 'constant'
  | 'property'
  | 'type-alias'
  | 'namespace'
  | 'module';

export interface ParameterInfo {
  name: string;
  type?: string;
  isOptional: boolean;
  defaultValue?: string;
}

export interface LineRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/**
 * Diagnostic information from LSP for defect prediction input.
 */
export interface DiagnosticInfo {
  /** File path where the diagnostic was reported */
  filePath: string;
  /** Line range of the diagnostic */
  range: LineRange;
  /** Diagnostic severity */
  severity: DiagnosticSeverity;
  /** Diagnostic message */
  message: string;
  /** Source of the diagnostic (e.g., 'typescript', 'eslint') */
  source?: string;
  /** Diagnostic code (e.g., 'TS2345', 'no-unused-vars') */
  code?: string | number;
  /** Related information (e.g., conflicting type locations) */
  relatedInfo?: Array<{
    filePath: string;
    range: LineRange;
    message: string;
  }>;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'information' | 'hint';

/**
 * Reference information from LSP for impact analysis.
 */
export interface ReferenceInfo {
  /** File path containing the reference */
  filePath: string;
  /** Line range of the reference */
  range: LineRange;
  /** Whether this is a definition, declaration, or usage */
  kind: ReferenceKind;
  /** The line of code containing the reference (for context) */
  lineText?: string;
  /** Whether the reference is in a test file */
  isInTestFile: boolean;
}

export type ReferenceKind = 'definition' | 'declaration' | 'usage' | 'type-reference';

/**
 * Impact analysis result combining references with risk assessment.
 */
export interface ImpactAnalysisResult {
  /** Symbol being analyzed */
  symbolName: string;
  /** Total number of references found */
  totalReferences: number;
  /** References grouped by file */
  fileBreakdown: Record<string, ReferenceInfo[]>;
  /** Number of files affected */
  affectedFileCount: number;
  /** Number of test files that reference this symbol */
  testFileCount: number;
  /** Whether the symbol is part of a public API */
  isPublicAPI: boolean;
  /** Risk level based on reference count and spread */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

// ---------------------------------------------------------------------------
// Abstract LSP Bridge
// ---------------------------------------------------------------------------

/**
 * Bridge between OpenCode's native LSP and AQE's code intelligence.
 *
 * Implementations must handle:
 * - LSP client initialization and lifecycle
 * - Timeout handling for LSP requests
 * - Graceful fallback when LSP is unavailable
 */
export abstract class LSPBridge {
  /**
   * Extract symbol information from a file for test generation.
   * Returns all exported functions, classes, and interfaces that
   * are good candidates for test generation.
   *
   * @param filePath - Absolute path to the source file
   * @returns Array of symbols found in the file
   */
  abstract getSymbolsForTestGeneration(filePath: string): Promise<SymbolInfo[]>;

  /**
   * Get diagnostics (errors, warnings) for defect prediction input.
   * Diagnostics from the language server are strong signals for
   * potential defects.
   *
   * @param filePath - Absolute path to the source file
   * @returns Array of diagnostics for the file
   */
  abstract getDiagnosticsForDefectPrediction(filePath: string): Promise<DiagnosticInfo[]>;

  /**
   * Get all references to a symbol for impact analysis.
   * Used to understand the blast radius of changes.
   *
   * @param symbolName - The symbol to find references for
   * @param filePath - File where the symbol is defined (for disambiguation)
   * @returns Array of references across the codebase
   */
  abstract getReferencesForImpactAnalysis(
    symbolName: string,
    filePath?: string,
  ): Promise<ReferenceInfo[]>;

  /**
   * Perform a full impact analysis for a symbol.
   * Combines reference lookup with risk assessment.
   *
   * @param symbolName - The symbol to analyze
   * @param filePath - File where the symbol is defined
   * @returns Impact analysis result with risk assessment
   */
  async analyzeImpact(symbolName: string, filePath?: string): Promise<ImpactAnalysisResult> {
    const references = await this.getReferencesForImpactAnalysis(symbolName, filePath);

    const fileBreakdown: Record<string, ReferenceInfo[]> = {};
    let testFileCount = 0;
    const testFiles = new Set<string>();

    for (const ref of references) {
      if (!fileBreakdown[ref.filePath]) {
        fileBreakdown[ref.filePath] = [];
      }
      fileBreakdown[ref.filePath].push(ref);

      if (ref.isInTestFile && !testFiles.has(ref.filePath)) {
        testFiles.add(ref.filePath);
        testFileCount++;
      }
    }

    const affectedFileCount = Object.keys(fileBreakdown).length;
    const isPublicAPI = references.some((r) => r.kind === 'declaration' || r.kind === 'definition');
    const riskLevel = assessRiskLevel(references.length, affectedFileCount, isPublicAPI);

    return {
      symbolName,
      totalReferences: references.length,
      fileBreakdown,
      affectedFileCount,
      testFileCount,
      isPublicAPI,
      riskLevel,
    };
  }

  /**
   * Check whether the LSP bridge is available and connected.
   * Implementations should return false if the LSP server is not running.
   */
  abstract isAvailable(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assessRiskLevel(
  refCount: number,
  fileCount: number,
  isPublicAPI: boolean,
): 'low' | 'medium' | 'high' | 'critical' {
  if (isPublicAPI && fileCount > 20) return 'critical';
  if (isPublicAPI && fileCount > 10) return 'high';
  if (fileCount > 10 || refCount > 50) return 'high';
  if (fileCount > 5 || refCount > 20) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Null implementation for when LSP is unavailable
// ---------------------------------------------------------------------------

/**
 * No-op LSP bridge for environments where LSP is unavailable.
 * Returns empty results instead of throwing errors.
 */
export class NullLSPBridge extends LSPBridge {
  async getSymbolsForTestGeneration(_filePath: string): Promise<SymbolInfo[]> {
    return [];
  }

  async getDiagnosticsForDefectPrediction(_filePath: string): Promise<DiagnosticInfo[]> {
    return [];
  }

  async getReferencesForImpactAnalysis(
    _symbolName: string,
    _filePath?: string,
  ): Promise<ReferenceInfo[]> {
    return [];
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }
}

// ---------------------------------------------------------------------------
// LSP JSON-RPC Protocol helpers
// ---------------------------------------------------------------------------

interface LSPRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: unknown;
}

interface LSPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

// LSP SymbolKind enum values (from LSP spec)
const LSP_SYMBOL_KIND_MAP: Record<number, SymbolKind> = {
  1: 'module',     // File
  2: 'module',     // Module
  3: 'namespace',  // Namespace
  5: 'class',      // Class
  6: 'method',     // Method
  8: 'function',   // Constructor -> function
  9: 'enum',       // Enum
  10: 'interface',  // Interface
  11: 'function',   // Function
  12: 'variable',   // Variable
  13: 'constant',   // Constant
  14: 'property',   // Property
  23: 'type-alias', // Struct -> type-alias
  26: 'type-alias', // TypeParameter -> type-alias
};

const LSP_SEVERITY_MAP: Record<number, DiagnosticSeverity> = {
  1: 'error',
  2: 'warning',
  3: 'information',
  4: 'hint',
};

// ---------------------------------------------------------------------------
// OpenCode LSP Bridge — connects to an LSP server via TCP
// ---------------------------------------------------------------------------

export interface OpenCodeLSPConfig {
  /** TCP host for LSP server */
  host: string;
  /** TCP port for LSP server */
  port: number;
  /** Request timeout in ms (default 5000) */
  timeout?: number;
}

/**
 * LSP Bridge implementation that connects to an LSP server over TCP.
 * Falls back to NullLSPBridge behavior if the connection fails.
 *
 * Caches results per file path to avoid repeated requests within a session.
 */
export class OpenCodeLSPBridge extends LSPBridge {
  private config: OpenCodeLSPConfig;
  private timeout: number;
  private requestId = 0;
  private symbolCache = new Map<string, SymbolInfo[]>();
  private diagnosticCache = new Map<string, DiagnosticInfo[]>();
  private referenceCache = new Map<string, ReferenceInfo[]>();
  private fallback = new NullLSPBridge();

  constructor(config: OpenCodeLSPConfig) {
    super();
    this.config = config;
    this.timeout = config.timeout ?? 5000;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const net = await import('net');
      return new Promise<boolean>((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(this.timeout);
        socket.once('connect', () => {
          socket.destroy();
          resolve(true);
        });
        socket.once('error', () => {
          socket.destroy();
          resolve(false);
        });
        socket.once('timeout', () => {
          socket.destroy();
          resolve(false);
        });
        socket.connect(this.config.port, this.config.host);
      });
    } catch {
      return false;
    }
  }

  async getSymbolsForTestGeneration(filePath: string): Promise<SymbolInfo[]> {
    const cached = this.symbolCache.get(filePath);
    if (cached) return cached;

    if (!(await this.isAvailable())) {
      return this.fallback.getSymbolsForTestGeneration(filePath);
    }

    try {
      const response = await this.sendRequest('textDocument/documentSymbol', {
        textDocument: { uri: `file://${filePath}` },
      });

      if (!response.result || !Array.isArray(response.result)) {
        return [];
      }

      const symbols = this.mapDocumentSymbols(response.result as LSPDocumentSymbol[], filePath);
      this.symbolCache.set(filePath, symbols);
      return symbols;
    } catch {
      return this.fallback.getSymbolsForTestGeneration(filePath);
    }
  }

  async getDiagnosticsForDefectPrediction(filePath: string): Promise<DiagnosticInfo[]> {
    const cached = this.diagnosticCache.get(filePath);
    if (cached) return cached;

    if (!(await this.isAvailable())) {
      return this.fallback.getDiagnosticsForDefectPrediction(filePath);
    }

    try {
      const response = await this.sendRequest('textDocument/diagnostic', {
        textDocument: { uri: `file://${filePath}` },
      });

      if (!response.result) return [];

      const result = response.result as { items?: LSPDiagnostic[] };
      const items = result.items ?? (Array.isArray(response.result) ? response.result as LSPDiagnostic[] : []);

      const diagnostics = items.map((d) => this.mapDiagnostic(d, filePath));
      this.diagnosticCache.set(filePath, diagnostics);
      return diagnostics;
    } catch {
      return this.fallback.getDiagnosticsForDefectPrediction(filePath);
    }
  }

  async getReferencesForImpactAnalysis(
    symbolName: string,
    filePath?: string,
  ): Promise<ReferenceInfo[]> {
    const cacheKey = `${symbolName}:${filePath ?? ''}`;
    const cached = this.referenceCache.get(cacheKey);
    if (cached) return cached;

    if (!(await this.isAvailable())) {
      return this.fallback.getReferencesForImpactAnalysis(symbolName, filePath);
    }

    try {
      // First find the symbol position via documentSymbol
      if (!filePath) return [];

      const symbols = await this.getSymbolsForTestGeneration(filePath);
      const symbol = symbols.find((s) => s.name === symbolName);
      if (!symbol) return [];

      const response = await this.sendRequest('textDocument/references', {
        textDocument: { uri: `file://${filePath}` },
        position: {
          line: symbol.range.startLine,
          character: symbol.range.startColumn,
        },
        context: { includeDeclaration: true },
      });

      if (!response.result || !Array.isArray(response.result)) {
        return [];
      }

      const references = (response.result as LSPLocation[]).map((loc) =>
        this.mapLocation(loc),
      );
      this.referenceCache.set(cacheKey, references);
      return references;
    } catch {
      return this.fallback.getReferencesForImpactAnalysis(symbolName, filePath);
    }
  }

  /** Clear all caches (call between sessions) */
  clearCache(): void {
    this.symbolCache.clear();
    this.diagnosticCache.clear();
    this.referenceCache.clear();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async sendRequest(method: string, params: unknown): Promise<LSPResponse> {
    const net = await import('net');
    const id = ++this.requestId;

    const request: LSPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise<LSPResponse>((resolve, reject) => {
      const socket = new net.Socket();
      let buffer = '';

      socket.setTimeout(this.timeout);

      socket.once('error', (err) => {
        socket.destroy();
        reject(err);
      });

      socket.once('timeout', () => {
        socket.destroy();
        reject(new Error(`LSP request timed out after ${this.timeout}ms`));
      });

      socket.on('data', (data) => {
        buffer += data.toString();
        // LSP uses Content-Length headers
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;

        const header = buffer.substring(0, headerEnd);
        const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
        if (!lengthMatch) return;

        const contentLength = parseInt(lengthMatch[1], 10);
        const bodyStart = headerEnd + 4;
        const body = buffer.substring(bodyStart);

        if (body.length >= contentLength) {
          socket.destroy();
          try {
            const response = JSON.parse(body.substring(0, contentLength)) as LSPResponse;
            resolve(response);
          } catch (err) {
            reject(err);
          }
        }
      });

      socket.connect(this.config.port, this.config.host, () => {
        const body = JSON.stringify(request);
        const message = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
        socket.write(message);
      });
    });
  }

  private mapDocumentSymbols(
    lspSymbols: LSPDocumentSymbol[],
    filePath: string,
    containerName?: string,
  ): SymbolInfo[] {
    const result: SymbolInfo[] = [];

    for (const sym of lspSymbols) {
      const kind = LSP_SYMBOL_KIND_MAP[sym.kind];
      if (!kind) continue;

      const info: SymbolInfo = {
        name: sym.name,
        kind,
        filePath,
        range: {
          startLine: sym.range?.start?.line ?? sym.selectionRange?.start?.line ?? 0,
          startColumn: sym.range?.start?.character ?? sym.selectionRange?.start?.character ?? 0,
          endLine: sym.range?.end?.line ?? sym.selectionRange?.end?.line ?? 0,
          endColumn: sym.range?.end?.character ?? sym.selectionRange?.end?.character ?? 0,
        },
        isExported: true, // LSP doesn't directly report export status
        containerName,
        documentation: sym.detail,
      };

      result.push(info);

      // Recurse into children
      if (sym.children && sym.children.length > 0) {
        result.push(...this.mapDocumentSymbols(sym.children, filePath, sym.name));
      }
    }

    return result;
  }

  private mapDiagnostic(d: LSPDiagnostic, filePath: string): DiagnosticInfo {
    return {
      filePath,
      range: {
        startLine: d.range.start.line,
        startColumn: d.range.start.character,
        endLine: d.range.end.line,
        endColumn: d.range.end.character,
      },
      severity: LSP_SEVERITY_MAP[d.severity ?? 1] ?? 'error',
      message: d.message,
      source: d.source,
      code: d.code,
      relatedInfo: d.relatedInformation?.map((ri) => ({
        filePath: ri.location.uri.replace('file://', ''),
        range: {
          startLine: ri.location.range.start.line,
          startColumn: ri.location.range.start.character,
          endLine: ri.location.range.end.line,
          endColumn: ri.location.range.end.character,
        },
        message: ri.message,
      })),
    };
  }

  private mapLocation(loc: LSPLocation): ReferenceInfo {
    const filePath = loc.uri.replace('file://', '');
    return {
      filePath,
      range: {
        startLine: loc.range.start.line,
        startColumn: loc.range.start.character,
        endLine: loc.range.end.line,
        endColumn: loc.range.end.character,
      },
      kind: 'usage',
      isInTestFile: /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(filePath),
    };
  }
}

// ---------------------------------------------------------------------------
// LSP protocol type subset (only what we use)
// ---------------------------------------------------------------------------

interface LSPDocumentSymbol {
  name: string;
  detail?: string;
  kind: number;
  range: LSPRange;
  selectionRange: LSPRange;
  children?: LSPDocumentSymbol[];
}

interface LSPDiagnostic {
  range: LSPRange;
  severity?: number;
  code?: string | number;
  source?: string;
  message: string;
  relatedInformation?: Array<{
    location: LSPLocation;
    message: string;
  }>;
}

interface LSPRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

interface LSPLocation {
  uri: string;
  range: LSPRange;
}
