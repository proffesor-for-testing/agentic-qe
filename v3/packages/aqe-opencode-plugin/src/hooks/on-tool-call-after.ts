/**
 * onToolCallAfter Hook
 *
 * Post-execution processing mapped from AQE's PostToolUse hooks:
 * - Pattern capture: extract patterns from successful tool executions
 * - Experience recording: store in AQE memory
 * - Metrics: track tool execution time and success rate
 *
 * Target latency: <500ms (async fire-and-forget for heavy work)
 *
 * @module hooks/on-tool-call-after
 */

import type { ToolCallContext, ToolResult } from '../types/opencode.js';
import type { AQEPluginConfig } from '../config.js';
import type { SessionManager, DreamQueueItem } from '../lifecycle.js';

// =============================================================================
// Pattern Extraction
// =============================================================================

interface CapturedPattern {
  type: string;
  toolName: string;
  content: string;
  domain: string;
  confidence: number;
  metadata: Record<string, unknown>;
}

function extractPatternFromEdit(
  ctx: ToolCallContext,
  result: ToolResult
): CapturedPattern | null {
  if (!result.success) return null;

  const filePath = (ctx.input.file_path as string) || '';
  const oldString = (ctx.input.old_string as string) || '';
  const newString = (ctx.input.new_string as string) || '';

  if (!filePath || !oldString || !newString) return null;

  // Determine domain from file extension and content
  const domain = detectDomainFromFile(filePath);

  return {
    type: 'refactoring-pattern',
    toolName: ctx.toolName,
    content: JSON.stringify({
      filePattern: getFilePattern(filePath),
      changeType: classifyChange(oldString, newString),
      before: truncate(oldString, 200),
      after: truncate(newString, 200),
    }),
    domain,
    confidence: 0.6,
    metadata: {
      filePath,
      durationMs: result.durationMs,
    },
  };
}

function extractPatternFromBash(
  ctx: ToolCallContext,
  result: ToolResult
): CapturedPattern | null {
  if (!result.success) return null;

  const command = (ctx.input.command as string) || '';
  if (!command) return null;

  // Only capture meaningful patterns, not trivial commands
  if (isTrivialCommand(command)) return null;

  const domain = detectDomainFromCommand(command);

  return {
    type: 'command-pattern',
    toolName: 'bash',
    content: JSON.stringify({
      commandTemplate: anonymizeCommand(command),
      exitSuccess: true,
    }),
    domain,
    confidence: 0.5,
    metadata: {
      originalCommand: truncate(command, 300),
      durationMs: result.durationMs,
    },
  };
}

function extractPatternFromTestGeneration(
  ctx: ToolCallContext,
  result: ToolResult
): CapturedPattern | null {
  if (!result.success) return null;

  const filePath = (ctx.input.file_path as string) || '';
  if (!filePath.match(/\.(test|spec)\.(ts|js|tsx|jsx)$/)) return null;

  const content = (ctx.input.content as string) || (ctx.input.new_string as string) || '';
  if (!content) return null;

  return {
    type: 'test-template',
    toolName: ctx.toolName,
    content: JSON.stringify({
      filePattern: getFilePattern(filePath),
      hasDescribe: content.includes('describe('),
      hasIt: content.includes('it('),
      hasMocks: content.includes('mock') || content.includes('Mock'),
      hasSetup: content.includes('beforeEach') || content.includes('beforeAll'),
      lineCount: content.split('\n').length,
    }),
    domain: 'test-generation',
    confidence: 0.7,
    metadata: {
      filePath,
      durationMs: result.durationMs,
    },
  };
}

// =============================================================================
// Hook Factory
// =============================================================================

export function createOnToolCallAfter(
  config: AQEPluginConfig,
  session: SessionManager
) {
  return async function onToolCallAfter(
    ctx: ToolCallContext,
    result: ToolResult
  ): Promise<void> {
    if (!config.enabled || !config.hooks.onToolCallAfter) return;

    // 1. Track metrics (synchronous — always runs)
    session.recordToolCall(result.success, result.durationMs);

    // 2. Pattern capture (async — fire and forget for non-blocking)
    capturePatternAsync(ctx, result, config, session).catch((err) => {
      console.error('[AQE Plugin] Pattern capture error:', err);
    });
  };
}

// =============================================================================
// Async Pattern Capture
// =============================================================================

async function capturePatternAsync(
  ctx: ToolCallContext,
  result: ToolResult,
  config: AQEPluginConfig,
  session: SessionManager
): Promise<void> {
  if (!result.success) return;

  let pattern: CapturedPattern | null = null;

  const toolLower = ctx.toolName.toLowerCase();

  if (toolLower === 'edit' || toolLower === 'multiedit') {
    pattern = extractPatternFromEdit(ctx, result);
  } else if (toolLower === 'bash') {
    pattern = extractPatternFromBash(ctx, result);
  } else if (toolLower === 'write') {
    pattern = extractPatternFromTestGeneration(ctx, result);
  }

  if (!pattern) return;

  // Only capture patterns in configured domains
  if (!config.domains.includes(pattern.domain) && pattern.domain !== 'general') {
    return;
  }

  session.recordPatternCaptured();

  // Store experience in memory
  const memory = session.getMemory();
  if (memory) {
    const timestamp = Date.now();
    await memory.store(
      `opencode/experience/${pattern.toolName}/${timestamp}`,
      pattern,
      'opencode'
    );
  }

  // Add to dream consolidation queue
  const dreamItem: DreamQueueItem = {
    type: 'tool-experience',
    data: {
      pattern,
      toolCallId: ctx.callId,
      timestamp: ctx.timestamp,
    },
    timestamp: Date.now(),
  };
  session.addToDreamQueue(dreamItem);
}

// =============================================================================
// Helpers
// =============================================================================

function detectDomainFromFile(filePath: string): string {
  if (filePath.match(/\.(test|spec)\./)) return 'test-generation';
  if (filePath.match(/security|auth|crypt/i)) return 'security';
  if (filePath.match(/coverage/i)) return 'coverage';
  return 'general';
}

function detectDomainFromCommand(command: string): string {
  if (command.match(/\b(test|jest|vitest|mocha)\b/i)) return 'test-generation';
  if (command.match(/\b(coverage|istanbul|c8|nyc)\b/i)) return 'coverage';
  if (command.match(/\b(lint|eslint|prettier)\b/i)) return 'quality-assessment';
  if (command.match(/\b(audit|snyk|semgrep)\b/i)) return 'security';
  return 'general';
}

function getFilePattern(filePath: string): string {
  // Extract the extension and general structure, not the full path
  const parts = filePath.split('/');
  const filename = parts[parts.length - 1] || '';
  const ext = filename.split('.').slice(1).join('.');
  return `*.${ext}`;
}

function classifyChange(oldStr: string, newStr: string): string {
  if (oldStr.length === 0) return 'addition';
  if (newStr.length === 0) return 'deletion';
  if (newStr.length > oldStr.length * 1.5) return 'expansion';
  if (newStr.length < oldStr.length * 0.5) return 'reduction';
  return 'modification';
}

function isTrivialCommand(command: string): boolean {
  const trivial = ['ls', 'pwd', 'cd', 'echo', 'cat', 'head', 'tail', 'wc'];
  const firstWord = command.trim().split(/\s+/)[0] || '';
  return trivial.includes(firstWord);
}

function anonymizeCommand(command: string): string {
  // Replace specific paths/values with placeholders
  return command
    .replace(/\/[^\s]+/g, '<path>')
    .replace(/"[^"]*"/g, '"<string>"')
    .replace(/'[^']*'/g, "'<string>'");
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}
