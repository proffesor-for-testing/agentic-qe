/**
 * UI Components Index
 *
 * Exports all UI components for the VS Code extension.
 *
 * @module vscode-extension/ui
 * @version 0.1.0
 */

// InlineTestHint - Inline decorations showing test suggestions
export { InlineTestHint } from './InlineTestHint';
export type { TestHintData } from './InlineTestHint';

// TestPreviewHover - Hover provider showing test previews
export { TestPreviewHover, RichTestPreviewHover } from './TestPreviewHover';
export type { SimilarPattern } from './TestPreviewHover';

// TestGenerationQuickPick - Multi-step quick pick for test generation
export { TestGenerationQuickPick, generateTestFromOptions } from './TestGenerationQuickPick';
export type {
  TestType,
  TestFramework,
  CoverageTarget,
  TestGenerationOptions,
} from './TestGenerationQuickPick';

// CoverageOverlay - Visual overlay for coverage gaps
export { CoverageOverlay, CoverageGapQuickPick } from './CoverageOverlay';
export type { CoverageGap, CoverageSummary } from './CoverageOverlay';
