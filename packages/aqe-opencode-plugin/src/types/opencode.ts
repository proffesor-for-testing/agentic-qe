/**
 * OpenCode Plugin SDK Type Definitions
 *
 * Since @opencode-ai/plugin is a peer dependency that may not be installed,
 * we define the hook types locally. These mirror the official plugin SDK
 * interfaces so the plugin works seamlessly when the real SDK is present.
 *
 * @module types/opencode
 */

// =============================================================================
// Tool Call Types
// =============================================================================

export interface ToolCallContext {
  /** Unique ID for this tool invocation */
  callId: string;
  /** Tool name (e.g., 'write', 'edit', 'bash', 'read') */
  toolName: string;
  /** Input parameters passed to the tool */
  input: Record<string, unknown>;
  /** Session-level metadata */
  session: SessionMeta;
  /** Timestamp of the tool call */
  timestamp: number;
}

export interface ToolResult {
  /** Whether the tool call succeeded */
  success: boolean;
  /** Output from the tool */
  output?: unknown;
  /** Error message if failed */
  error?: string;
  /** Execution duration in milliseconds */
  durationMs: number;
}

// =============================================================================
// Session Prompt Types
// =============================================================================

export interface SessionPromptContext {
  /** The user's prompt text */
  prompt: string;
  /** Session-level metadata */
  session: SessionMeta;
  /** Conversation turn number */
  turn: number;
  /** Timestamp */
  timestamp: number;
}

export interface SessionResponse {
  /** The model's response text */
  content: string;
  /** Model used */
  model: string;
  /** Token usage */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Tool calls made during this response */
  toolCalls: Array<{ toolName: string; success: boolean }>;
  /** Duration in milliseconds */
  durationMs: number;
}

// =============================================================================
// Session Metadata
// =============================================================================

export interface SessionMeta {
  /** Unique session ID */
  sessionId: string;
  /** Working directory */
  cwd: string;
  /** Session start time */
  startedAt: number;
}

// =============================================================================
// Plugin Definition
// =============================================================================

export interface PluginHookResult {
  cancel?: true;
  reason?: string;
}

export interface PromptModification {
  modifiedPrompt: string;
}

export interface PluginDefinition<TConfig = unknown> {
  name: string;
  version: string;
  config?: import('zod').ZodType<TConfig>;
  onToolCallBefore?: (ctx: ToolCallContext) => Promise<void | PluginHookResult>;
  onToolCallAfter?: (ctx: ToolCallContext, result: ToolResult) => Promise<void>;
  onSessionPromptBefore?: (ctx: SessionPromptContext) => Promise<void | PromptModification>;
  onSessionPromptAfter?: (ctx: SessionPromptContext, response: SessionResponse) => Promise<void>;
}

/**
 * Define an OpenCode plugin with type-safe configuration.
 * This is a passthrough function that provides type inference.
 */
export function definePlugin<TConfig>(definition: PluginDefinition<TConfig>): PluginDefinition<TConfig> {
  return definition;
}
