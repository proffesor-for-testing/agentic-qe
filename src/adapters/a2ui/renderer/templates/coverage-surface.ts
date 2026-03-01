/**
 * Coverage Dashboard Surface Template
 *
 * Generates A2UI surface for displaying code coverage analysis results
 * including coverage gauge, file breakdown, and gap list.
 *
 * @module adapters/a2ui/renderer/templates/coverage-surface
 */

import type {
  SurfaceUpdateMessage,
  DataModelUpdateMessage,
  ComponentNode,
} from '../message-types.js';
import { literal, path, children, templateChildren } from '../message-types.js';
import { createComponentBuilder } from '../component-builder.js';

// ============================================================================
// Coverage Data Types
// ============================================================================

/**
 * File coverage data
 */
export interface FileCoverage {
  /** File path */
  path: string;
  /** Line coverage percentage */
  lineCoverage: number;
  /** Branch coverage percentage */
  branchCoverage: number;
  /** Function coverage percentage */
  functionCoverage: number;
  /** Covered lines count */
  coveredLines: number;
  /** Total lines count */
  totalLines: number;
}

/**
 * Coverage gap information
 */
export interface CoverageGap {
  /** Gap identifier */
  id: string;
  /** File path */
  file: string;
  /** Start line number */
  startLine: number;
  /** End line number */
  endLine: number;
  /** Gap type (uncovered, partial, etc.) */
  type: 'uncovered' | 'partial' | 'branch';
  /** Gap description */
  description: string;
  /** Suggested action */
  suggestion?: string;
}

/**
 * Module coverage summary
 */
export interface ModuleCoverage {
  /** Module name */
  name: string;
  /** Coverage percentage */
  percentage: number;
  /** Files in module */
  fileCount: number;
}

/**
 * Complete coverage data structure
 */
export interface CoverageData {
  /** Overall coverage percentage */
  total: number;
  /** Target coverage threshold */
  target: number;
  /** Line coverage percentage */
  lineCoverage: number;
  /** Branch coverage percentage */
  branchCoverage: number;
  /** Function coverage percentage */
  functionCoverage: number;
  /** Coverage by module */
  modules: ModuleCoverage[];
  /** Files with coverage data */
  files: FileCoverage[];
  /** Coverage gaps */
  gaps: CoverageGap[];
  /** Analysis timestamp */
  timestamp: string;
  /** Summary text */
  summary: string;
}

// ============================================================================
// Coverage Surface Generator
// ============================================================================

/**
 * Generate coverage dashboard surface
 */
export function createCoverageSurface(
  data: CoverageData,
  surfaceId: string = 'coverage-dashboard'
): SurfaceUpdateMessage {
  const builder = createComponentBuilder();

  builder
    .beginSurface(surfaceId)
    .setTitle('Coverage Analysis')
    .setCatalog('qe-v1');

  // Root container
  builder.addComponent('root', {
    type: 'Column',
    spacing: 16,
  });
  builder.setChildren('root', ['header', 'summary-row', 'details-tabs']);

  // Header
  builder.addComponent('header', {
    type: 'Row',
    alignment: 'spaceBetween',
  });
  builder.setChildren('header', ['title', 'timestamp']);

  builder.addComponent('title', {
    type: 'Text',
    text: literal('Coverage Analysis'),
    usageHint: 'h1',
  });

  builder.addComponent('timestamp', {
    type: 'Text',
    text: path('/metrics/timestamp'),
    style: { color: '#666' },
  });

  // Summary row with gauges
  builder.addComponent('summary-row', {
    type: 'Row',
    spacing: 16,
  });
  builder.setChildren('summary-row', [
    'total-gauge-card',
    'line-gauge-card',
    'branch-gauge-card',
    'function-gauge-card',
  ]);

  // Total coverage gauge card
  builder.addComponent('total-gauge-card', {
    type: 'Card',
    title: literal('Total Coverage'),
  });
  builder.setChildren('total-gauge-card', ['total-gauge', 'total-status']);

  builder.addComponent('total-gauge', {
    type: 'qe:coverageGauge',
    value: path('/metrics/total'),
    target: path('/metrics/target'),
    label: literal('Overall'),
    accessibility: {
      role: 'meter',
      label: 'Total code coverage percentage',
      live: 'polite',
    },
  });

  builder.addComponent('total-status', {
    type: 'qe:qualityGateIndicator',
    status: path('/metrics/status'),
    threshold: path('/metrics/target'),
    criteria: literal('Coverage meets target'),
  });

  // Line coverage gauge card
  builder.addComponent('line-gauge-card', {
    type: 'Card',
    title: literal('Line Coverage'),
  });
  builder.setChildren('line-gauge-card', ['line-gauge']);

  builder.addComponent('line-gauge', {
    type: 'qe:coverageGauge',
    value: path('/metrics/lineCoverage'),
    target: path('/metrics/target'),
    label: literal('Lines'),
  });

  // Branch coverage gauge card
  builder.addComponent('branch-gauge-card', {
    type: 'Card',
    title: literal('Branch Coverage'),
  });
  builder.setChildren('branch-gauge-card', ['branch-gauge']);

  builder.addComponent('branch-gauge', {
    type: 'qe:coverageGauge',
    value: path('/metrics/branchCoverage'),
    target: path('/metrics/target'),
    label: literal('Branches'),
  });

  // Function coverage gauge card
  builder.addComponent('function-gauge-card', {
    type: 'Card',
    title: literal('Function Coverage'),
  });
  builder.setChildren('function-gauge-card', ['function-gauge']);

  builder.addComponent('function-gauge', {
    type: 'qe:coverageGauge',
    value: path('/metrics/functionCoverage'),
    target: path('/metrics/target'),
    label: literal('Functions'),
  });

  // Details tabs
  builder.addComponent('details-tabs', {
    type: 'Tabs',
  });
  builder.setChildren('details-tabs', [
    'modules-tab',
    'files-tab',
    'gaps-tab',
  ]);

  // Modules tab
  builder.addComponent('modules-tab', {
    type: 'Tab',
    label: literal('By Module'),
  });
  builder.setChildren('modules-tab', ['modules-chart']);

  builder.addComponent('modules-chart', {
    type: 'BarChart',
    title: literal('Coverage by Module'),
    data: path('/metrics/modules'),
    xAxis: 'name',
    yAxis: 'percentage',
    color: '#4CAF50',
  });

  // Files tab
  builder.addComponent('files-tab', {
    type: 'Tab',
    label: literal('Files'),
  });
  builder.setChildren('files-tab', ['files-table']);

  builder.addComponent('files-table', {
    type: 'Table',
    columns: [
      { key: 'path', label: 'File', width: '40%' },
      { key: 'lineCoverage', label: 'Lines', width: '15%' },
      { key: 'branchCoverage', label: 'Branches', width: '15%' },
      { key: 'functionCoverage', label: 'Functions', width: '15%' },
      { key: 'coveredLines', label: 'Covered', width: '15%' },
    ],
    data: path('/metrics/files'),
    sortable: true,
    filterable: true,
  });

  // Gaps tab
  builder.addComponent('gaps-tab', {
    type: 'Tab',
    label: literal('Coverage Gaps'),
  });
  builder.setChildren('gaps-tab', ['gaps-list']);

  builder.addComponent('gaps-list', {
    type: 'List',
    children: templateChildren('/metrics/gaps', 'gap-item-template'),
  });

  // Gap item template
  builder.addComponent('gap-item-template', {
    type: 'qe:coverageGapCard',
    file: path('/file'),
    startLine: path('/startLine'),
    endLine: path('/endLine'),
    gapType: path('/type'),
    description: path('/description'),
    suggestion: path('/suggestion'),
  });

  return builder.build();
}

/**
 * Generate coverage data model update
 */
export function createCoverageDataUpdate(
  data: CoverageData,
  surfaceId: string = 'coverage-dashboard'
): DataModelUpdateMessage {
  // Compute status based on coverage vs target
  const status = data.total >= data.target ? 'passed' : 'failed';

  return {
    type: 'dataModelUpdate',
    surfaceId,
    data: {
      metrics: {
        total: data.total,
        target: data.target,
        lineCoverage: data.lineCoverage,
        branchCoverage: data.branchCoverage,
        functionCoverage: data.functionCoverage,
        status,
        timestamp: data.timestamp,
        summary: data.summary,
        modules: data.modules,
        files: data.files,
        gaps: data.gaps,
      },
    },
  };
}

/**
 * Create a simple coverage summary surface
 */
export function createCoverageSummarySurface(
  data: Pick<CoverageData, 'total' | 'target' | 'summary' | 'timestamp'>,
  surfaceId: string = 'coverage-summary'
): SurfaceUpdateMessage {
  const builder = createComponentBuilder();

  builder
    .beginSurface(surfaceId)
    .setTitle('Coverage Summary')
    .setCatalog('qe-v1');

  builder.addComponent('root', {
    type: 'Card',
    title: literal('Coverage Summary'),
  });
  builder.setChildren('root', ['gauge', 'summary-text']);

  builder.addComponent('gauge', {
    type: 'qe:coverageGauge',
    value: path('/coverage/total'),
    target: path('/coverage/target'),
    label: literal('Total Coverage'),
  });

  builder.addComponent('summary-text', {
    type: 'Text',
    text: path('/coverage/summary'),
  });

  return builder.build();
}

// ============================================================================
// Export Types
// ============================================================================

export type {
  SurfaceUpdateMessage,
  DataModelUpdateMessage,
  ComponentNode,
};
