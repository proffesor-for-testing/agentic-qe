/**
 * Test Results Surface Template
 *
 * Generates A2UI surface for displaying test execution results
 * including pass/fail badges, test list, and timeline.
 *
 * @module adapters/a2ui/renderer/templates/test-results-surface
 */

import type {
  SurfaceUpdateMessage,
  DataModelUpdateMessage,
  ComponentNode,
} from '../message-types.js';
import { literal, path, children, templateChildren } from '../message-types.js';
import { createComponentBuilder } from '../component-builder.js';

// ============================================================================
// Test Results Data Types
// ============================================================================

/**
 * Test status type
 */
export type TestStatus = 'passed' | 'failed' | 'skipped' | 'pending' | 'running';

/**
 * Individual test result
 */
export interface TestResult {
  /** Test identifier */
  id: string;
  /** Test name */
  name: string;
  /** Test suite/file */
  suite: string;
  /** Test status */
  status: TestStatus;
  /** Duration in milliseconds */
  duration: number;
  /** Error message if failed */
  error?: string;
  /** Stack trace if failed */
  stackTrace?: string;
  /** Start timestamp */
  startTime: string;
  /** End timestamp */
  endTime?: string;
  /** Retry count */
  retries?: number;
  /** Tags/labels */
  tags?: string[];
}

/**
 * Test suite summary
 */
export interface TestSuite {
  /** Suite name */
  name: string;
  /** File path */
  file: string;
  /** Total tests */
  total: number;
  /** Passed tests */
  passed: number;
  /** Failed tests */
  failed: number;
  /** Skipped tests */
  skipped: number;
  /** Suite duration */
  duration: number;
}

/**
 * Complete test results data structure
 */
export interface TestResults {
  /** Total tests */
  total: number;
  /** Passed tests */
  passed: number;
  /** Failed tests */
  failed: number;
  /** Skipped tests */
  skipped: number;
  /** Total duration in milliseconds */
  duration: number;
  /** Pass duration (sum of passed tests) */
  passDuration: number;
  /** Fail duration (sum of failed tests) */
  failDuration: number;
  /** Start timestamp */
  startTime: string;
  /** End timestamp */
  endTime: string;
  /** Test suites */
  suites: TestSuite[];
  /** Individual test results */
  tests: TestResult[];
  /** Summary text */
  summary: string;
  /** Pass rate percentage */
  passRate: number;
}

// ============================================================================
// Test Results Surface Generator
// ============================================================================

/**
 * Generate test results dashboard surface
 */
export function createTestResultsSurface(
  data: TestResults,
  surfaceId: string = 'test-results'
): SurfaceUpdateMessage {
  const builder = createComponentBuilder();

  builder
    .beginSurface(surfaceId)
    .setTitle('Test Results')
    .setCatalog('qe-v1');

  // Root container
  builder.addComponent('root', {
    type: 'Column',
    spacing: 16,
  });
  builder.setChildren('root', [
    'header',
    'badges-row',
    'progress-section',
    'results-tabs',
  ]);

  // Header
  builder.addComponent('header', {
    type: 'Row',
    alignment: 'spaceBetween',
  });
  builder.setChildren('header', ['title', 'duration-badge']);

  builder.addComponent('title', {
    type: 'Text',
    text: literal('Test Execution Results'),
    usageHint: 'h1',
  });

  builder.addComponent('duration-badge', {
    type: 'Row',
    spacing: 8,
  });
  builder.setChildren('duration-badge', ['duration-icon', 'duration-text']);

  builder.addComponent('duration-icon', {
    type: 'Icon',
    name: 'timer',
  });

  builder.addComponent('duration-text', {
    type: 'Text',
    text: path('/results/durationFormatted'),
    style: { fontWeight: 'bold' },
  });

  // Status badges row
  builder.addComponent('badges-row', {
    type: 'Row',
    spacing: 16,
    alignment: 'center',
  });
  builder.setChildren('badges-row', [
    'total-badge',
    'pass-badge',
    'fail-badge',
    'skip-badge',
  ]);

  // Total badge
  builder.addComponent('total-badge', {
    type: 'qe:testStatusBadge',
    status: literal('total'),
    count: path('/results/total'),
    label: literal('Total'),
    color: '#2196F3',
  });

  // Pass badge
  builder.addComponent('pass-badge', {
    type: 'qe:testStatusBadge',
    status: literal('passed'),
    count: path('/results/passed'),
    duration: path('/results/passDuration'),
    label: literal('Passed'),
    color: '#4CAF50',
    accessibility: {
      role: 'status',
      live: 'polite',
    },
  });

  // Fail badge
  builder.addComponent('fail-badge', {
    type: 'qe:testStatusBadge',
    status: literal('failed'),
    count: path('/results/failed'),
    duration: path('/results/failDuration'),
    label: literal('Failed'),
    color: '#F44336',
    accessibility: {
      role: 'alert',
      live: 'assertive',
    },
  });

  // Skip badge
  builder.addComponent('skip-badge', {
    type: 'qe:testStatusBadge',
    status: literal('skipped'),
    count: path('/results/skipped'),
    label: literal('Skipped'),
    color: '#FFC107',
  });

  // Progress section
  builder.addComponent('progress-section', {
    type: 'Card',
    title: literal('Pass Rate'),
  });
  builder.setChildren('progress-section', ['progress-bar', 'progress-text']);

  builder.addComponent('progress-bar', {
    type: 'ProgressBar',
    value: path('/results/passRate'),
    max: 100,
    color: path('/results/passRateColor'),
  });

  builder.addComponent('progress-text', {
    type: 'Text',
    text: path('/results/passRateFormatted'),
    alignment: 'center',
    style: { fontSize: 24, fontWeight: 'bold' },
  });

  // Results tabs
  builder.addComponent('results-tabs', {
    type: 'Tabs',
  });
  builder.setChildren('results-tabs', [
    'timeline-tab',
    'tests-tab',
    'suites-tab',
    'failures-tab',
  ]);

  // Timeline tab
  builder.addComponent('timeline-tab', {
    type: 'Tab',
    label: literal('Timeline'),
  });
  builder.setChildren('timeline-tab', ['test-timeline']);

  builder.addComponent('test-timeline', {
    type: 'qe:testTimeline',
    tests: path('/results/tests'),
    startTime: path('/results/startTime'),
    endTime: path('/results/endTime'),
  });

  // Tests tab
  builder.addComponent('tests-tab', {
    type: 'Tab',
    label: literal('All Tests'),
  });
  builder.setChildren('tests-tab', ['tests-table']);

  builder.addComponent('tests-table', {
    type: 'Table',
    columns: [
      { key: 'status', label: 'Status', width: '10%' },
      { key: 'name', label: 'Test Name', width: '40%' },
      { key: 'suite', label: 'Suite', width: '25%' },
      { key: 'duration', label: 'Duration', width: '15%' },
      { key: 'actions', label: 'Actions', width: '10%' },
    ],
    data: path('/results/tests'),
    sortable: true,
    filterable: true,
    rowAction: { name: 'view_test_details' },
  });

  // Suites tab
  builder.addComponent('suites-tab', {
    type: 'Tab',
    label: literal('Suites'),
  });
  builder.setChildren('suites-tab', ['suites-accordion']);

  builder.addComponent('suites-accordion', {
    type: 'Accordion',
    children: templateChildren('/results/suites', 'suite-item-template'),
  });

  builder.addComponent('suite-item-template', {
    type: 'AccordionItem',
    title: path('/name'),
    subtitle: path('/summaryText'),
  });

  // Failures tab
  builder.addComponent('failures-tab', {
    type: 'Tab',
    label: literal('Failures'),
    badge: path('/results/failed'),
  });
  builder.setChildren('failures-tab', ['failures-list']);

  builder.addComponent('failures-list', {
    type: 'List',
    children: templateChildren('/results/failedTests', 'failure-item-template'),
    emptyMessage: literal('No failures - all tests passed!'),
  });

  builder.addComponent('failure-item-template', {
    type: 'Card',
    variant: 'error',
  });

  return builder.build();
}

/**
 * Generate test results data model update
 */
export function createTestResultsDataUpdate(
  data: TestResults,
  surfaceId: string = 'test-results'
): DataModelUpdateMessage {
  // Format duration
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  // Compute pass rate color
  const getPassRateColor = (rate: number): string => {
    if (rate >= 90) return '#4CAF50';
    if (rate >= 70) return '#FFC107';
    return '#F44336';
  };

  // Filter failed tests
  const failedTests = data.tests.filter((t) => t.status === 'failed');

  return {
    type: 'dataModelUpdate',
    surfaceId,
    data: {
      results: {
        total: data.total,
        passed: data.passed,
        failed: data.failed,
        skipped: data.skipped,
        duration: data.duration,
        durationFormatted: formatDuration(data.duration),
        passDuration: data.passDuration,
        failDuration: data.failDuration,
        startTime: data.startTime,
        endTime: data.endTime,
        passRate: data.passRate,
        passRateFormatted: `${data.passRate.toFixed(1)}%`,
        passRateColor: getPassRateColor(data.passRate),
        summary: data.summary,
        tests: data.tests.map((test) => ({
          ...test,
          durationFormatted: formatDuration(test.duration),
        })),
        suites: data.suites.map((suite) => ({
          ...suite,
          summaryText: `${suite.passed}/${suite.total} passed (${formatDuration(suite.duration)})`,
        })),
        failedTests,
      },
    },
  };
}

/**
 * Create a simple test summary surface
 */
export function createTestSummarySurface(
  data: Pick<TestResults, 'total' | 'passed' | 'failed' | 'skipped' | 'passRate'>,
  surfaceId: string = 'test-summary'
): SurfaceUpdateMessage {
  const builder = createComponentBuilder();

  builder
    .beginSurface(surfaceId)
    .setTitle('Test Summary')
    .setCatalog('qe-v1');

  builder.addComponent('root', {
    type: 'Row',
    spacing: 16,
  });
  builder.setChildren('root', ['pass-badge', 'fail-badge', 'skip-badge']);

  builder.addComponent('pass-badge', {
    type: 'qe:testStatusBadge',
    status: literal('passed'),
    count: path('/tests/passed'),
    label: literal('Passed'),
  });

  builder.addComponent('fail-badge', {
    type: 'qe:testStatusBadge',
    status: literal('failed'),
    count: path('/tests/failed'),
    label: literal('Failed'),
  });

  builder.addComponent('skip-badge', {
    type: 'qe:testStatusBadge',
    status: literal('skipped'),
    count: path('/tests/skipped'),
    label: literal('Skipped'),
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
