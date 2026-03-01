/**
 * A2UI Component Catalog Unit Tests
 *
 * Comprehensive test suite for A2UI v0.8 component catalog, schemas, and validation.
 * Target: 80+ unit tests covering all components.
 *
 * @module tests/unit/adapters/a2ui/catalog
 */

import { describe, it, expect } from 'vitest';

import {
  // ===== BoundValue Types and Functions =====
  type BoundValue,
  type LiteralValue,
  type PathValue,
  type CombinedValue,
  isLiteralValue,
  isPathValue,
  isCombinedValue,
  isBoundValue,
  createLiteralValue,
  createPathValue,
  createCombinedValue,
  getStaticValue,
  getBindingPath,

  // ===== Children Types and Functions =====
  type ComponentChildren,
  isExplicitListChildren,
  isTemplateChildren,
  createExplicitListChildren,
  createTemplateChildren,

  // ===== Action Functions =====
  createAction,

  // ===== Standard Component Types =====
  type StandardComponentType,
  type RowComponent,
  type ColumnComponent,
  type ListComponent,
  type TextComponent,
  type ImageComponent,
  type IconComponent,
  type DividerComponent,
  type ButtonComponent,
  type TextFieldComponent,
  type CheckBoxComponent,
  type DateTimeInputComponent,
  type SliderComponent,
  type CardComponent,
  type TabsComponent,
  type ModalComponent,

  // ===== Standard Catalog =====
  STANDARD_CATALOG,
  STANDARD_COMPONENT_TYPES,
  COMPONENTS_BY_CATEGORY,
  isStandardComponentType,
  isLayoutComponent,
  isDisplayComponent,
  isInteractiveComponent,
  isContainerComponent,
  getComponentMetadata,
  getComponentsByCategory,
  getComponentCategory,
  componentHasChildren,
  getRequiredProps,
  getOptionalProps,
  getAllProps,

  // ===== QE Component Types =====
  type QEComponentType,
  type CoverageGaugeComponent,
  type TestStatusBadgeComponent,
  type VulnerabilityCardComponent,
  type QualityGateIndicatorComponent,
  type A11yFindingCardComponent,
  type TestTimelineComponent,
  type DefectDensityChartComponent,
  type FlakySummaryComponent,

  // ===== QE Domain Types =====
  type TestStatus,
  type VulnerabilitySeverity,
  type QualityGateStatus,
  type WCAGLevel,
  type A11yImpact,
  isTestStatus,
  isVulnerabilitySeverity,
  isQualityGateStatus,
  isWCAGLevel,
  isA11yImpact,
  isQEDomain,

  // ===== QE Catalog =====
  QE_CATALOG,
  QE_COMPONENT_TYPES,
  QE_COMPONENTS_BY_DOMAIN,
  QE_DOMAINS,
  isQEComponentType,
  hasQEPrefix,
  getQEComponentMetadata,
  getQEComponentsByDomain,
  getQEDomain,
  isRealTimeComponent,
  getRelatedDomains,

  // ===== Color Functions =====
  getSeverityColor,
  getTestStatusColor,
  getQualityGateColor,
  getA11yImpactColor,

  // ===== Icon Functions =====
  getTestStatusIcon,
  getQualityGateIcon,
  getSeverityIcon,

  // ===== Utility Functions =====
  getCoverageStatus,
  formatDuration,
  calculateFlakyRate,

  // ===== Combined Catalog =====
  ALL_COMPONENT_TYPES,
  COMBINED_CATALOG,
  A2UI_CATALOG_VERSION,
  QE_CATALOG_VERSION,
  CATALOG_INFO,
  isAnyComponentType,
  getAnyComponentMetadata,

  // ===== Schemas =====
  STANDARD_COMPONENT_SCHEMAS,
  QE_COMPONENT_SCHEMAS,
  ALL_COMPONENT_SCHEMAS,
  BOUND_VALUE_SCHEMA,
  COMPONENT_CHILDREN_SCHEMA,
  ACCESSIBILITY_SCHEMA,

  // ===== Validation =====
  validateComponent,
  getComponentSchema,
  hasComponentSchema,
  getAllComponentTypes,
  getStandardComponentTypes,
  getQEComponentTypes,
} from '../../../../src/adapters/a2ui/index.js';

// ============================================================================
// BoundValue Tests
// ============================================================================

describe('BoundValue Types', () => {
  describe('LiteralValue', () => {
    it('should create a literal value', () => {
      const value = createLiteralValue('Hello');
      expect(value).toEqual({ literalString: 'Hello' });
    });

    it('should identify literal value', () => {
      const value = { literalString: 'test' };
      expect(isLiteralValue(value)).toBe(true);
      expect(isPathValue(value)).toBe(false);
      expect(isCombinedValue(value)).toBe(false);
    });

    it('should extract static value from literal', () => {
      const value = createLiteralValue(42);
      expect(getStaticValue(value)).toBe(42);
    });

    it('should return undefined for binding path from literal', () => {
      const value = createLiteralValue('test');
      expect(getBindingPath(value)).toBeUndefined();
    });
  });

  describe('PathValue', () => {
    it('should create a path value', () => {
      const value = createPathValue('/user/name');
      expect(value).toEqual({ path: '/user/name' });
    });

    it('should identify path value', () => {
      const value = { path: '/data/value' };
      expect(isPathValue(value)).toBe(true);
      expect(isLiteralValue(value)).toBe(false);
      expect(isCombinedValue(value)).toBe(false);
    });

    it('should extract binding path from path value', () => {
      const value = createPathValue('/metrics/coverage');
      expect(getBindingPath(value)).toBe('/metrics/coverage');
    });

    it('should return undefined for static value from path', () => {
      const value = createPathValue('/test');
      expect(getStaticValue(value)).toBeUndefined();
    });
  });

  describe('CombinedValue', () => {
    it('should create a combined value', () => {
      const value = createCombinedValue('default', '/user/theme');
      expect(value).toEqual({ literalString: 'default', path: '/user/theme' });
    });

    it('should identify combined value', () => {
      const value = { literalString: 'default', path: '/settings/value' };
      expect(isCombinedValue(value)).toBe(true);
      expect(isLiteralValue(value)).toBe(false);
      expect(isPathValue(value)).toBe(false);
    });

    it('should extract both static value and binding path', () => {
      const value = createCombinedValue('fallback', '/data/item');
      expect(getStaticValue(value)).toBe('fallback');
      expect(getBindingPath(value)).toBe('/data/item');
    });
  });

  describe('isBoundValue', () => {
    it('should return true for all bound value types', () => {
      expect(isBoundValue({ literalString: 'test' })).toBe(true);
      expect(isBoundValue({ path: '/test' })).toBe(true);
      expect(isBoundValue({ literalString: 'test', path: '/test' })).toBe(true);
    });

    it('should return false for non-bound values', () => {
      expect(isBoundValue(null)).toBe(false);
      expect(isBoundValue(undefined)).toBe(false);
      expect(isBoundValue('string')).toBe(false);
      expect(isBoundValue(123)).toBe(false);
      expect(isBoundValue({})).toBe(false);
    });
  });
});

// ============================================================================
// ComponentChildren Tests
// ============================================================================

describe('ComponentChildren Types', () => {
  describe('ExplicitListChildren', () => {
    it('should create explicit list children', () => {
      const children = createExplicitListChildren(['child1', 'child2']);
      expect(children).toEqual({ explicitList: ['child1', 'child2'] });
    });

    it('should identify explicit list children', () => {
      const children = { explicitList: ['a', 'b', 'c'] };
      expect(isExplicitListChildren(children)).toBe(true);
      expect(isTemplateChildren(children)).toBe(false);
    });

    it('should handle empty list', () => {
      const children = createExplicitListChildren([]);
      expect(children.explicitList).toHaveLength(0);
    });
  });

  describe('TemplateChildren', () => {
    it('should create template children', () => {
      const children = createTemplateChildren('/items', 'item-template');
      expect(children).toEqual({
        template: {
          dataBinding: '/items',
          componentId: 'item-template',
        },
      });
    });

    it('should identify template children', () => {
      const children = {
        template: {
          dataBinding: '/data',
          componentId: 'template-id',
        },
      };
      expect(isTemplateChildren(children)).toBe(true);
      expect(isExplicitListChildren(children)).toBe(false);
    });
  });
});

// ============================================================================
// Action Tests
// ============================================================================

describe('ComponentAction', () => {
  it('should create simple action', () => {
    const action = createAction('submit');
    expect(action).toEqual({ name: 'submit' });
  });

  it('should create action with parameters', () => {
    const action = createAction('updateUser', {
      userId: createPathValue('/user/id'),
      name: createLiteralValue('John'),
    });
    expect(action.name).toBe('updateUser');
    expect(action.parameters).toBeDefined();
    expect(action.parameters?.userId).toEqual({ path: '/user/id' });
    expect(action.parameters?.name).toEqual({ literalString: 'John' });
  });
});

// ============================================================================
// Standard Catalog Tests
// ============================================================================

describe('Standard Component Catalog', () => {
  describe('Catalog Structure', () => {
    it('should have 15 standard components', () => {
      expect(STANDARD_COMPONENT_TYPES).toHaveLength(15);
    });

    it('should include all expected component types', () => {
      const expectedTypes = [
        'row', 'column', 'list',
        'text', 'image', 'icon', 'divider',
        'button', 'textField', 'checkBox', 'dateTimeInput', 'slider',
        'card', 'tabs', 'modal',
      ];
      for (const type of expectedTypes) {
        expect(STANDARD_COMPONENT_TYPES).toContain(type);
      }
    });

    it('should have metadata for all components', () => {
      for (const type of STANDARD_COMPONENT_TYPES) {
        const metadata = STANDARD_CATALOG[type];
        expect(metadata).toBeDefined();
        expect(metadata.type).toBe(type);
        expect(metadata.displayName).toBeDefined();
        expect(metadata.description).toBeDefined();
        expect(metadata.category).toBeDefined();
      }
    });
  });

  describe('Component Categories', () => {
    it('should have 3 layout components', () => {
      expect(COMPONENTS_BY_CATEGORY.layout).toHaveLength(3);
      expect(COMPONENTS_BY_CATEGORY.layout).toContain('row');
      expect(COMPONENTS_BY_CATEGORY.layout).toContain('column');
      expect(COMPONENTS_BY_CATEGORY.layout).toContain('list');
    });

    it('should have 4 display components', () => {
      expect(COMPONENTS_BY_CATEGORY.display).toHaveLength(4);
      expect(COMPONENTS_BY_CATEGORY.display).toContain('text');
      expect(COMPONENTS_BY_CATEGORY.display).toContain('image');
      expect(COMPONENTS_BY_CATEGORY.display).toContain('icon');
      expect(COMPONENTS_BY_CATEGORY.display).toContain('divider');
    });

    it('should have 5 interactive components', () => {
      expect(COMPONENTS_BY_CATEGORY.interactive).toHaveLength(5);
      expect(COMPONENTS_BY_CATEGORY.interactive).toContain('button');
      expect(COMPONENTS_BY_CATEGORY.interactive).toContain('textField');
      expect(COMPONENTS_BY_CATEGORY.interactive).toContain('checkBox');
      expect(COMPONENTS_BY_CATEGORY.interactive).toContain('dateTimeInput');
      expect(COMPONENTS_BY_CATEGORY.interactive).toContain('slider');
    });

    it('should have 3 container components', () => {
      expect(COMPONENTS_BY_CATEGORY.container).toHaveLength(3);
      expect(COMPONENTS_BY_CATEGORY.container).toContain('card');
      expect(COMPONENTS_BY_CATEGORY.container).toContain('tabs');
      expect(COMPONENTS_BY_CATEGORY.container).toContain('modal');
    });
  });

  describe('Type Guards', () => {
    it('isStandardComponentType should identify valid types', () => {
      expect(isStandardComponentType('row')).toBe(true);
      expect(isStandardComponentType('button')).toBe(true);
      expect(isStandardComponentType('card')).toBe(true);
      expect(isStandardComponentType('invalid')).toBe(false);
      expect(isStandardComponentType('qe:coverageGauge')).toBe(false);
    });

    it('isLayoutComponent should identify layout components', () => {
      expect(isLayoutComponent('row')).toBe(true);
      expect(isLayoutComponent('column')).toBe(true);
      expect(isLayoutComponent('list')).toBe(true);
      expect(isLayoutComponent('button')).toBe(false);
    });

    it('isDisplayComponent should identify display components', () => {
      expect(isDisplayComponent('text')).toBe(true);
      expect(isDisplayComponent('image')).toBe(true);
      expect(isDisplayComponent('icon')).toBe(true);
      expect(isDisplayComponent('divider')).toBe(true);
      expect(isDisplayComponent('button')).toBe(false);
    });

    it('isInteractiveComponent should identify interactive components', () => {
      expect(isInteractiveComponent('button')).toBe(true);
      expect(isInteractiveComponent('textField')).toBe(true);
      expect(isInteractiveComponent('checkBox')).toBe(true);
      expect(isInteractiveComponent('dateTimeInput')).toBe(true);
      expect(isInteractiveComponent('slider')).toBe(true);
      expect(isInteractiveComponent('text')).toBe(false);
    });

    it('isContainerComponent should identify container components', () => {
      expect(isContainerComponent('card')).toBe(true);
      expect(isContainerComponent('tabs')).toBe(true);
      expect(isContainerComponent('modal')).toBe(true);
      expect(isContainerComponent('row')).toBe(false);
    });
  });

  describe('Metadata Helpers', () => {
    it('getComponentMetadata should return metadata', () => {
      const metadata = getComponentMetadata('button');
      expect(metadata).toBeDefined();
      expect(metadata?.displayName).toBe('Button');
      expect(metadata?.category).toBe('interactive');
    });

    it('getComponentsByCategory should return components', () => {
      const layout = getComponentsByCategory('layout');
      expect(layout).toEqual(['row', 'column', 'list']);
    });

    it('getComponentCategory should return category', () => {
      expect(getComponentCategory('text')).toBe('display');
      expect(getComponentCategory('button')).toBe('interactive');
    });

    it('componentHasChildren should identify container components', () => {
      expect(componentHasChildren('row')).toBe(true);
      expect(componentHasChildren('card')).toBe(true);
      expect(componentHasChildren('text')).toBe(false);
      expect(componentHasChildren('button')).toBe(false);
    });

    it('getRequiredProps should return required properties', () => {
      const buttonProps = getRequiredProps('button');
      expect(buttonProps).toContain('label');
      expect(buttonProps).toContain('action');

      const textProps = getRequiredProps('text');
      expect(textProps).toContain('text');
    });

    it('getOptionalProps should return optional properties', () => {
      const buttonProps = getOptionalProps('button');
      expect(buttonProps).toContain('variant');
      expect(buttonProps).toContain('disabled');
    });

    it('getAllProps should return all properties', () => {
      const buttonProps = getAllProps('button');
      expect(buttonProps).toContain('label');
      expect(buttonProps).toContain('action');
      expect(buttonProps).toContain('variant');
    });
  });
});

// ============================================================================
// QE Catalog Tests
// ============================================================================

describe('QE Component Catalog', () => {
  describe('Catalog Structure', () => {
    it('should have 8 QE components', () => {
      expect(QE_COMPONENT_TYPES).toHaveLength(8);
    });

    it('should include all expected QE component types', () => {
      const expectedTypes = [
        'qe:coverageGauge',
        'qe:testStatusBadge',
        'qe:vulnerabilityCard',
        'qe:qualityGateIndicator',
        'qe:a11yFindingCard',
        'qe:testTimeline',
        'qe:defectDensityChart',
        'qe:flakySummary',
      ];
      for (const type of expectedTypes) {
        expect(QE_COMPONENT_TYPES).toContain(type);
      }
    });

    it('should have metadata for all QE components', () => {
      for (const type of QE_COMPONENT_TYPES) {
        const metadata = QE_CATALOG[type];
        expect(metadata).toBeDefined();
        expect(metadata.type).toBe(type);
        expect(metadata.qeDomain).toBeDefined();
      }
    });
  });

  describe('QE Type Guards', () => {
    it('isQEComponentType should identify QE components', () => {
      expect(isQEComponentType('qe:coverageGauge')).toBe(true);
      expect(isQEComponentType('qe:testStatusBadge')).toBe(true);
      expect(isQEComponentType('button')).toBe(false);
      expect(isQEComponentType('invalid')).toBe(false);
    });

    it('hasQEPrefix should check for qe: prefix', () => {
      expect(hasQEPrefix('qe:coverageGauge')).toBe(true);
      expect(hasQEPrefix('qe:custom')).toBe(true);
      expect(hasQEPrefix('button')).toBe(false);
    });

    it('isTestStatus should validate test status values', () => {
      expect(isTestStatus('passed')).toBe(true);
      expect(isTestStatus('failed')).toBe(true);
      expect(isTestStatus('skipped')).toBe(true);
      expect(isTestStatus('running')).toBe(true);
      expect(isTestStatus('pending')).toBe(true);
      expect(isTestStatus('invalid')).toBe(false);
    });

    it('isVulnerabilitySeverity should validate severity values', () => {
      expect(isVulnerabilitySeverity('critical')).toBe(true);
      expect(isVulnerabilitySeverity('high')).toBe(true);
      expect(isVulnerabilitySeverity('medium')).toBe(true);
      expect(isVulnerabilitySeverity('low')).toBe(true);
      expect(isVulnerabilitySeverity('info')).toBe(true);
      expect(isVulnerabilitySeverity('invalid')).toBe(false);
    });

    it('isQualityGateStatus should validate gate status values', () => {
      expect(isQualityGateStatus('passed')).toBe(true);
      expect(isQualityGateStatus('failed')).toBe(true);
      expect(isQualityGateStatus('warning')).toBe(true);
      expect(isQualityGateStatus('unknown')).toBe(true);
      expect(isQualityGateStatus('invalid')).toBe(false);
    });

    it('isWCAGLevel should validate WCAG levels', () => {
      expect(isWCAGLevel('A')).toBe(true);
      expect(isWCAGLevel('AA')).toBe(true);
      expect(isWCAGLevel('AAA')).toBe(true);
      expect(isWCAGLevel('B')).toBe(false);
    });

    it('isA11yImpact should validate impact levels', () => {
      expect(isA11yImpact('critical')).toBe(true);
      expect(isA11yImpact('serious')).toBe(true);
      expect(isA11yImpact('moderate')).toBe(true);
      expect(isA11yImpact('minor')).toBe(true);
      expect(isA11yImpact('invalid')).toBe(false);
    });

    it('isQEDomain should validate QE domains', () => {
      expect(isQEDomain('test-generation')).toBe(true);
      expect(isQEDomain('coverage-analysis')).toBe(true);
      expect(isQEDomain('security-compliance')).toBe(true);
      expect(isQEDomain('invalid-domain')).toBe(false);
    });
  });

  describe('QE Metadata Helpers', () => {
    it('getQEComponentMetadata should return metadata', () => {
      const metadata = getQEComponentMetadata('qe:coverageGauge');
      expect(metadata).toBeDefined();
      expect(metadata?.qeDomain).toBe('coverage-analysis');
    });

    it('getQEComponentsByDomain should return components by domain', () => {
      const components = getQEComponentsByDomain('test-execution');
      expect(components).toContain('qe:testStatusBadge');
      expect(components).toContain('qe:testTimeline');
      expect(components).toContain('qe:flakySummary');
    });

    it('getQEDomain should return domain for component', () => {
      expect(getQEDomain('qe:coverageGauge')).toBe('coverage-analysis');
      expect(getQEDomain('qe:vulnerabilityCard')).toBe('security-compliance');
    });

    it('isRealTimeComponent should identify real-time components', () => {
      expect(isRealTimeComponent('qe:coverageGauge')).toBe(true);
      expect(isRealTimeComponent('qe:testTimeline')).toBe(true);
      expect(isRealTimeComponent('qe:vulnerabilityCard')).toBe(false);
    });

    it('getRelatedDomains should return related domains', () => {
      const related = getRelatedDomains('qe:coverageGauge');
      expect(related).toContain('test-execution');
      expect(related).toContain('quality-assessment');
    });
  });

  describe('Color Functions', () => {
    it('getSeverityColor should return colors for severities', () => {
      expect(getSeverityColor('critical')).toBe('#dc2626');
      expect(getSeverityColor('high')).toBe('#ea580c');
      expect(getSeverityColor('medium')).toBe('#ca8a04');
      expect(getSeverityColor('low')).toBe('#2563eb');
      expect(getSeverityColor('info')).toBe('#6b7280');
    });

    it('getTestStatusColor should return colors for test status', () => {
      expect(getTestStatusColor('passed')).toBe('#16a34a');
      expect(getTestStatusColor('failed')).toBe('#dc2626');
      expect(getTestStatusColor('skipped')).toBe('#ca8a04');
      expect(getTestStatusColor('running')).toBe('#2563eb');
    });

    it('getQualityGateColor should return colors for gate status', () => {
      expect(getQualityGateColor('passed')).toBe('#16a34a');
      expect(getQualityGateColor('failed')).toBe('#dc2626');
      expect(getQualityGateColor('warning')).toBe('#ca8a04');
    });

    it('getA11yImpactColor should return colors for impact', () => {
      expect(getA11yImpactColor('critical')).toBe('#dc2626');
      expect(getA11yImpactColor('serious')).toBe('#ea580c');
      expect(getA11yImpactColor('moderate')).toBe('#ca8a04');
      expect(getA11yImpactColor('minor')).toBe('#2563eb');
    });
  });

  describe('Icon Functions', () => {
    it('getTestStatusIcon should return icons for test status', () => {
      expect(getTestStatusIcon('passed')).toBe('check-circle');
      expect(getTestStatusIcon('failed')).toBe('x-circle');
      expect(getTestStatusIcon('skipped')).toBe('minus-circle');
      expect(getTestStatusIcon('running')).toBe('loader');
    });

    it('getQualityGateIcon should return icons for gate status', () => {
      expect(getQualityGateIcon('passed')).toBe('shield-check');
      expect(getQualityGateIcon('failed')).toBe('shield-x');
      expect(getQualityGateIcon('warning')).toBe('shield-alert');
    });

    it('getSeverityIcon should return icons for severity', () => {
      expect(getSeverityIcon('critical')).toBe('alert-octagon');
      expect(getSeverityIcon('high')).toBe('alert-triangle');
      expect(getSeverityIcon('medium')).toBe('alert-circle');
    });
  });

  describe('Utility Functions', () => {
    it('getCoverageStatus should calculate coverage status', () => {
      expect(getCoverageStatus(85, 80)).toBe('above');
      expect(getCoverageStatus(80, 80)).toBe('at');
      expect(getCoverageStatus(75, 80)).toBe('below');
    });

    it('formatDuration should format duration in human-readable format', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(1500)).toBe('1.5s');
      expect(formatDuration(65000)).toBe('1m 5s');
      expect(formatDuration(3700000)).toBe('1h 1m');
    });

    it('calculateFlakyRate should calculate flaky rate percentage', () => {
      expect(calculateFlakyRate(5, 100)).toBe(5);
      expect(calculateFlakyRate(10, 50)).toBe(20);
      expect(calculateFlakyRate(0, 100)).toBe(0);
      expect(calculateFlakyRate(5, 0)).toBe(0);
    });
  });
});

// ============================================================================
// Combined Catalog Tests
// ============================================================================

describe('Combined Catalog', () => {
  describe('Catalog Info', () => {
    it('should have correct version info', () => {
      expect(A2UI_CATALOG_VERSION).toBe('0.8.0');
      expect(QE_CATALOG_VERSION).toBe('3.0.0');
    });

    it('should have correct catalog info', () => {
      expect(CATALOG_INFO.a2uiVersion).toBe('0.8.0');
      expect(CATALOG_INFO.qeVersion).toBe('3.0.0');
      expect(CATALOG_INFO.standardComponentCount).toBe(15);
      expect(CATALOG_INFO.qeComponentCount).toBe(8);
      expect(CATALOG_INFO.totalComponentCount).toBe(23);
      expect(CATALOG_INFO.catalogId).toBe('aqe-a2ui-v3');
    });
  });

  describe('Combined Types', () => {
    it('ALL_COMPONENT_TYPES should include all components', () => {
      expect(ALL_COMPONENT_TYPES).toHaveLength(23);
      expect(ALL_COMPONENT_TYPES).toContain('button');
      expect(ALL_COMPONENT_TYPES).toContain('qe:coverageGauge');
    });

    it('COMBINED_CATALOG should have all components', () => {
      expect(Object.keys(COMBINED_CATALOG)).toHaveLength(23);
    });

    it('isAnyComponentType should identify any component', () => {
      expect(isAnyComponentType('button')).toBe(true);
      expect(isAnyComponentType('qe:coverageGauge')).toBe(true);
      expect(isAnyComponentType('invalid')).toBe(false);
    });

    it('getAnyComponentMetadata should return metadata for any component', () => {
      const buttonMetadata = getAnyComponentMetadata('button');
      expect(buttonMetadata?.displayName).toBe('Button');

      const gaugeMetadata = getAnyComponentMetadata('qe:coverageGauge');
      expect(gaugeMetadata?.displayName).toBe('Coverage Gauge');
    });
  });
});

// ============================================================================
// Schema Tests
// ============================================================================

describe('Component Schemas', () => {
  describe('Schema Registry', () => {
    it('should have schemas for all standard components', () => {
      expect(Object.keys(STANDARD_COMPONENT_SCHEMAS)).toHaveLength(15);
      for (const type of STANDARD_COMPONENT_TYPES) {
        expect(STANDARD_COMPONENT_SCHEMAS[type]).toBeDefined();
      }
    });

    it('should have schemas for all QE components', () => {
      expect(Object.keys(QE_COMPONENT_SCHEMAS)).toHaveLength(8);
      for (const type of QE_COMPONENT_TYPES) {
        expect(QE_COMPONENT_SCHEMAS[type]).toBeDefined();
      }
    });

    it('ALL_COMPONENT_SCHEMAS should have all schemas', () => {
      expect(Object.keys(ALL_COMPONENT_SCHEMAS)).toHaveLength(23);
    });
  });

  describe('Schema Helpers', () => {
    it('getComponentSchema should return schema', () => {
      const schema = getComponentSchema('button');
      expect(schema).toBeDefined();
      expect(schema?.properties?.type?.const).toBe('button');
    });

    it('hasComponentSchema should check schema existence', () => {
      expect(hasComponentSchema('button')).toBe(true);
      expect(hasComponentSchema('qe:coverageGauge')).toBe(true);
      expect(hasComponentSchema('invalid')).toBe(false);
    });

    it('getAllComponentTypes should return all types', () => {
      const types = getAllComponentTypes();
      expect(types).toHaveLength(23);
    });

    it('getStandardComponentTypes should return standard types', () => {
      const types = getStandardComponentTypes();
      expect(types).toHaveLength(15);
    });

    it('getQEComponentTypes should return QE types', () => {
      const types = getQEComponentTypes();
      expect(types).toHaveLength(8);
    });
  });

  describe('Shared Schemas', () => {
    it('BOUND_VALUE_SCHEMA should be defined', () => {
      expect(BOUND_VALUE_SCHEMA).toBeDefined();
      expect(BOUND_VALUE_SCHEMA.oneOf).toHaveLength(3);
    });

    it('COMPONENT_CHILDREN_SCHEMA should be defined', () => {
      expect(COMPONENT_CHILDREN_SCHEMA).toBeDefined();
      expect(COMPONENT_CHILDREN_SCHEMA.oneOf).toHaveLength(2);
    });

    it('ACCESSIBILITY_SCHEMA should be defined', () => {
      expect(ACCESSIBILITY_SCHEMA).toBeDefined();
      expect(ACCESSIBILITY_SCHEMA.properties?.role).toBeDefined();
      expect(ACCESSIBILITY_SCHEMA.properties?.label).toBeDefined();
      expect(ACCESSIBILITY_SCHEMA.properties?.live).toBeDefined();
    });
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe('Component Validation', () => {
  describe('Valid Components', () => {
    it('should validate a valid text component', () => {
      const component = {
        type: 'text',
        text: { literalString: 'Hello World' },
      };
      const result = validateComponent(component, 'text');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a valid button component', () => {
      const component = {
        type: 'button',
        label: { literalString: 'Click Me' },
        action: 'submit',
      };
      const result = validateComponent(component, 'button');
      expect(result.valid).toBe(true);
    });

    it('should validate a valid row component', () => {
      const component = {
        type: 'row',
        children: { explicitList: ['child1', 'child2'] },
      };
      const result = validateComponent(component, 'row');
      expect(result.valid).toBe(true);
    });

    it('should validate a valid card component', () => {
      const component = {
        type: 'card',
        children: { explicitList: ['content'] },
        title: { literalString: 'Card Title' },
      };
      const result = validateComponent(component, 'card');
      expect(result.valid).toBe(true);
    });

    it('should validate a valid coverage gauge component', () => {
      const component = {
        type: 'qe:coverageGauge',
        coverage: { literalString: 85 },
        target: 80,
      };
      const result = validateComponent(component, 'qe:coverageGauge');
      expect(result.valid).toBe(true);
    });

    it('should validate a valid test status badge', () => {
      const component = {
        type: 'qe:testStatusBadge',
        status: { literalString: 'passed' },
        count: { literalString: 42 },
      };
      const result = validateComponent(component, 'qe:testStatusBadge');
      expect(result.valid).toBe(true);
    });
  });

  describe('Invalid Components', () => {
    it('should fail for missing required properties', () => {
      const component = {
        type: 'text',
        // missing 'text' property
      };
      const result = validateComponent(component, 'text');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MISSING_REQUIRED_PROPERTY')).toBe(true);
    });

    it('should fail for invalid type', () => {
      const result = validateComponent('not an object', 'text');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_COMPONENT')).toBe(true);
    });

    it('should fail for unknown component type', () => {
      const result = validateComponent({}, 'unknown-type');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'UNKNOWN_COMPONENT_TYPE')).toBe(true);
    });

    it('should fail for invalid BoundValue', () => {
      const component = {
        type: 'text',
        text: 'invalid', // should be BoundValue object
      };
      const result = validateComponent(component, 'text');
      expect(result.valid).toBe(false);
    });

    it('should fail for invalid children', () => {
      const component = {
        type: 'row',
        children: 'invalid', // should be ComponentChildren object
      };
      const result = validateComponent(component, 'row');
      expect(result.valid).toBe(false);
    });

    it('should fail for null component', () => {
      const result = validateComponent(null, 'text');
      expect(result.valid).toBe(false);
    });
  });

  describe('BoundValue Validation', () => {
    it('should validate path BoundValue', () => {
      const component = {
        type: 'text',
        text: { path: '/data/message' },
      };
      const result = validateComponent(component, 'text');
      expect(result.valid).toBe(true);
    });

    it('should validate combined BoundValue', () => {
      const component = {
        type: 'text',
        text: { literalString: 'Default', path: '/data/message' },
      };
      const result = validateComponent(component, 'text');
      expect(result.valid).toBe(true);
    });

    it('should fail for invalid path format', () => {
      const component = {
        type: 'text',
        text: { path: 'invalid-no-slash' },
      };
      const result = validateComponent(component, 'text');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_JSON_POINTER')).toBe(true);
    });
  });

  describe('Children Validation', () => {
    it('should validate template children', () => {
      const component = {
        type: 'list',
        children: {
          template: {
            dataBinding: '/items',
            componentId: 'item-template',
          },
        },
      };
      const result = validateComponent(component, 'list');
      expect(result.valid).toBe(true);
    });

    it('should fail for invalid explicit list', () => {
      const component = {
        type: 'row',
        children: {
          explicitList: 'not-an-array',
        },
      };
      const result = validateComponent(component, 'row');
      expect(result.valid).toBe(false);
    });

    it('should fail for missing children properties', () => {
      const component = {
        type: 'row',
        children: {},
      };
      const result = validateComponent(component, 'row');
      expect(result.valid).toBe(false);
    });
  });
});

// ============================================================================
// Component Interface Tests
// ============================================================================

describe('Component Interfaces', () => {
  describe('Layout Components', () => {
    it('RowComponent should have correct structure', () => {
      const row: RowComponent = {
        type: 'row',
        children: { explicitList: ['a', 'b'] },
        spacing: 8,
        alignment: 'center',
        justifyContent: 'space-between',
      };
      expect(row.type).toBe('row');
      expect(row.children).toBeDefined();
    });

    it('ColumnComponent should have correct structure', () => {
      const column: ColumnComponent = {
        type: 'column',
        children: { explicitList: ['a'] },
        spacing: 16,
      };
      expect(column.type).toBe('column');
    });

    it('ListComponent should support templates', () => {
      const list: ListComponent = {
        type: 'list',
        children: {
          template: {
            dataBinding: '/items',
            componentId: 'item',
          },
        },
        orientation: 'vertical',
      };
      expect(list.type).toBe('list');
    });
  });

  describe('Display Components', () => {
    it('TextComponent should have correct structure', () => {
      const text: TextComponent = {
        type: 'text',
        text: { literalString: 'Hello' },
        style: 'heading',
        weight: 'bold',
      };
      expect(text.type).toBe('text');
    });

    it('ImageComponent should require alt text', () => {
      const image: ImageComponent = {
        type: 'image',
        src: { literalString: 'https://example.com/img.png' },
        alt: 'Example image',
        width: 200,
        height: 100,
      };
      expect(image.type).toBe('image');
      expect(image.alt).toBe('Example image');
    });

    it('IconComponent should have correct structure', () => {
      const icon: IconComponent = {
        type: 'icon',
        name: 'check',
        size: 'medium',
        color: '#16a34a',
      };
      expect(icon.type).toBe('icon');
    });

    it('DividerComponent should have correct structure', () => {
      const divider: DividerComponent = {
        type: 'divider',
        orientation: 'horizontal',
        thickness: 1,
      };
      expect(divider.type).toBe('divider');
    });
  });

  describe('Interactive Components', () => {
    it('ButtonComponent should support action object', () => {
      const button: ButtonComponent = {
        type: 'button',
        label: { literalString: 'Submit' },
        action: {
          name: 'submit_form',
          parameters: {
            formId: { path: '/form/id' },
          },
        },
        variant: 'primary',
      };
      expect(button.type).toBe('button');
    });

    it('TextFieldComponent should have correct structure', () => {
      const field: TextFieldComponent = {
        type: 'textField',
        value: { path: '/form/email' },
        label: 'Email',
        inputType: 'email',
        required: true,
      };
      expect(field.type).toBe('textField');
    });

    it('CheckBoxComponent should have correct structure', () => {
      const checkbox: CheckBoxComponent = {
        type: 'checkBox',
        checked: { path: '/settings/enabled' },
        label: 'Enable notifications',
      };
      expect(checkbox.type).toBe('checkBox');
    });

    it('DateTimeInputComponent should have correct structure', () => {
      const input: DateTimeInputComponent = {
        type: 'dateTimeInput',
        value: { literalString: '2026-01-30' },
        mode: 'date',
        enableDate: true,
      };
      expect(input.type).toBe('dateTimeInput');
    });

    it('SliderComponent should have min/max', () => {
      const slider: SliderComponent = {
        type: 'slider',
        value: { literalString: 50 },
        min: 0,
        max: 100,
        step: 5,
      };
      expect(slider.type).toBe('slider');
      expect(slider.min).toBe(0);
      expect(slider.max).toBe(100);
    });
  });

  describe('Container Components', () => {
    it('CardComponent should have correct structure', () => {
      const card: CardComponent = {
        type: 'card',
        children: { explicitList: ['content'] },
        title: { literalString: 'Card Title' },
        elevation: 2,
      };
      expect(card.type).toBe('card');
    });

    it('TabsComponent should have tabs array', () => {
      const tabs: TabsComponent = {
        type: 'tabs',
        tabs: [
          { label: 'Tab 1', content: 'content1' },
          { label: 'Tab 2', content: 'content2' },
        ],
        selectedIndex: { literalString: 0 },
      };
      expect(tabs.type).toBe('tabs');
      expect(tabs.tabs).toHaveLength(2);
    });

    it('ModalComponent should have correct structure', () => {
      const modal: ModalComponent = {
        type: 'modal',
        children: { explicitList: ['content'] },
        open: { literalString: false },
        title: 'Confirmation',
        dismissible: true,
      };
      expect(modal.type).toBe('modal');
    });
  });

  describe('QE Components', () => {
    it('CoverageGaugeComponent should have correct structure', () => {
      const gauge: CoverageGaugeComponent = {
        type: 'qe:coverageGauge',
        coverage: { literalString: 85 },
        target: 80,
        showLabel: true,
        coverageType: 'line',
      };
      expect(gauge.type).toBe('qe:coverageGauge');
    });

    it('TestStatusBadgeComponent should have correct structure', () => {
      const badge: TestStatusBadgeComponent = {
        type: 'qe:testStatusBadge',
        status: { literalString: 'passed' },
        count: { literalString: 42 },
        duration: { literalString: 1500 },
      };
      expect(badge.type).toBe('qe:testStatusBadge');
    });

    it('VulnerabilityCardComponent should have correct structure', () => {
      const card: VulnerabilityCardComponent = {
        type: 'qe:vulnerabilityCard',
        severity: { literalString: 'high' },
        title: { literalString: 'SQL Injection' },
        cveId: { literalString: 'CVE-2024-1234' },
        remediation: { literalString: 'Use parameterized queries' },
      };
      expect(card.type).toBe('qe:vulnerabilityCard');
    });

    it('QualityGateIndicatorComponent should have correct structure', () => {
      const indicator: QualityGateIndicatorComponent = {
        type: 'qe:qualityGateIndicator',
        status: { literalString: 'passed' },
        metrics: {
          literalString: [
            { name: 'Coverage', value: 85, threshold: 80, passing: true },
          ],
        },
      };
      expect(indicator.type).toBe('qe:qualityGateIndicator');
    });

    it('A11yFindingCardComponent should have correct structure', () => {
      const finding: A11yFindingCardComponent = {
        type: 'qe:a11yFindingCard',
        wcagLevel: { literalString: 'AA' },
        rule: { literalString: 'color-contrast' },
        impact: { literalString: 'serious' },
        element: { literalString: 'button.primary' },
      };
      expect(finding.type).toBe('qe:a11yFindingCard');
    });

    it('TestTimelineComponent should have correct structure', () => {
      const timeline: TestTimelineComponent = {
        type: 'qe:testTimeline',
        events: {
          literalString: [
            {
              id: '1',
              name: 'Test 1',
              status: 'passed',
              startTime: '2026-01-30T10:00:00Z',
              duration: 1500,
            },
          ],
        },
        showLabels: true,
        orientation: 'horizontal',
      };
      expect(timeline.type).toBe('qe:testTimeline');
    });

    it('DefectDensityChartComponent should have correct structure', () => {
      const chart: DefectDensityChartComponent = {
        type: 'qe:defectDensityChart',
        data: {
          literalString: [
            { name: 'Module A', defects: 5, lines: 1000 },
            { name: 'Module B', defects: 2, lines: 500 },
          ],
        },
        chartType: 'bar',
      };
      expect(chart.type).toBe('qe:defectDensityChart');
    });

    it('FlakySummaryComponent should have correct structure', () => {
      const summary: FlakySummaryComponent = {
        type: 'qe:flakySummary',
        flakyCount: { literalString: 5 },
        totalTests: { literalString: 100 },
        showTopFlaky: true,
        topCount: 3,
      };
      expect(summary.type).toBe('qe:flakySummary');
    });
  });
});

// ============================================================================
// QE Domains Tests
// ============================================================================

describe('QE Domains', () => {
  it('should have all expected domains', () => {
    const expectedDomains = [
      'test-generation',
      'test-execution',
      'coverage-analysis',
      'quality-assessment',
      'defect-intelligence',
      'learning-optimization',
      'security-compliance',
      'chaos-resilience',
      'accessibility-testing',
      'ui-testing',
      'performance-testing',
      'api-testing',
    ];
    for (const domain of expectedDomains) {
      expect(QE_DOMAINS).toContain(domain);
    }
  });

  it('should have components mapped to domains', () => {
    expect(QE_COMPONENTS_BY_DOMAIN['coverage-analysis']).toContain('qe:coverageGauge');
    expect(QE_COMPONENTS_BY_DOMAIN['test-execution']).toContain('qe:testStatusBadge');
    expect(QE_COMPONENTS_BY_DOMAIN['security-compliance']).toContain('qe:vulnerabilityCard');
    expect(QE_COMPONENTS_BY_DOMAIN['quality-assessment']).toContain('qe:qualityGateIndicator');
    expect(QE_COMPONENTS_BY_DOMAIN['accessibility-testing']).toContain('qe:a11yFindingCard');
  });
});
