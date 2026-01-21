/* tslint:disable */
/* eslint-disable */

/**
 * Main AgentBooster WASM interface
 */
export class AgentBoosterWasm {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Apply an edit to code
     *
     * Parameters:
     * - original_code: The original source code
     * - edit_snippet: The code snippet to apply
     * - language: The programming language (use parse_language helper)
     *
     * Apply a code edit using tree-sitter and similarity matching
     */
    apply_edit(original_code: string, edit_snippet: string, language: WasmLanguage): WasmEditResult;
    /**
     * Apply an edit from a JSON EditRequest
     */
    apply_edit_json(request_json: string): WasmEditResult;
    /**
     * Get current configuration
     */
    get_config(): WasmConfig;
    /**
     * Create a new AgentBooster instance with default config
     */
    constructor();
    /**
     * Parse a language string into WasmLanguage
     */
    static parse_language(lang: string): WasmLanguage;
    /**
     * Update configuration
     */
    set_config(config: WasmConfig): void;
    /**
     * Get library version
     */
    static version(): string;
    /**
     * Create with custom config
     */
    static with_config(config: WasmConfig): AgentBoosterWasm;
}

/**
 * JavaScript-compatible CodeChunk
 */
export class WasmCodeChunk {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    line_count(): number;
    /**
     * Convert to JSON string
     */
    to_json(): string;
    readonly code: string;
    readonly end_byte: number;
    readonly end_line: number;
    readonly node_type: string;
    readonly parent_type: string | undefined;
    readonly start_byte: number;
    readonly start_line: number;
}

/**
 * JavaScript-compatible Config
 */
export class WasmConfig {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Create from JSON string
     */
    static from_json(json: string): WasmConfig;
    constructor();
    /**
     * Convert to JSON string
     */
    to_json(): string;
    confidence_threshold: number;
    max_chunks: number;
}

/**
 * JavaScript-compatible EditResult
 */
export class WasmEditResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Convert to JSON string
     */
    to_json(): string;
    readonly best_similarity: number;
    readonly chunks_found: number;
    readonly confidence: number;
    readonly merged_code: string;
    readonly processing_time_ms: bigint | undefined;
    readonly strategy: WasmMergeStrategy;
    readonly syntax_valid: boolean;
}

/**
 * JavaScript-compatible Language enum
 */
export enum WasmLanguage {
    JavaScript = 0,
    TypeScript = 1,
    Python = 2,
    Rust = 3,
    Go = 4,
    Java = 5,
    C = 6,
    Cpp = 7,
}

/**
 * JavaScript-compatible MergeStrategy enum
 */
export enum WasmMergeStrategy {
    ExactReplace = 0,
    FuzzyReplace = 1,
    InsertAfter = 2,
    InsertBefore = 3,
    Append = 4,
}

/**
 * Helper function to create EditRequest JSON
 */
export function create_edit_request(original_code: string, edit_snippet: string, language: WasmLanguage, confidence_threshold?: number | null): string;

/**
 * Initialize panic hook for better error messages in WASM
 */
export function init(): void;

/**
 * Helper function to parse EditRequest from JSON
 */
export function parse_edit_request(json: string): any;
