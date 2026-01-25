/**
 * C4 Model Inference Module
 *
 * Provides automatic detection of C4 model elements from codebase analysis.
 * This module analyzes project structure, dependencies, and configuration files
 * to infer C4 architecture diagrams at Context, Container, and Component levels.
 *
 * @example
 * ```typescript
 * import {
 *   ProjectMetadataAnalyzer,
 *   ExternalSystemDetector,
 *   ComponentBoundaryAnalyzer,
 *   ProjectMetadata,
 *   ExternalSystem,
 *   Component
 * } from './inference';
 *
 * // Analyze project for C4 Context diagram
 * const metadataAnalyzer = new ProjectMetadataAnalyzer('/path/to/project');
 * const metadata = await metadataAnalyzer.analyze();
 *
 * // Detect external systems
 * const externalDetector = new ExternalSystemDetector('/path/to/project');
 * const externalSystems = await externalDetector.detect();
 *
 * // Analyze components
 * const componentAnalyzer = new ComponentBoundaryAnalyzer('/path/to/project/src');
 * const components = await componentAnalyzer.analyze();
 * ```
 */

// ============================================================================
// All types from consolidated types.ts
// ============================================================================
export * from './types.js';

// ============================================================================
// Analyzers
// ============================================================================

// C4 Context & Container level analysis
export { ProjectMetadataAnalyzer } from './ProjectMetadataAnalyzer.js';

// External system detection for C4 Context diagrams
export { ExternalSystemDetector } from './ExternalSystemDetector.js';

// Component boundary analysis for C4 Component diagrams
export { ComponentBoundaryAnalyzer } from './ComponentBoundaryAnalyzer.js';
