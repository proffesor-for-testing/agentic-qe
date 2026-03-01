# ADR-055: A2UI Declarative UI Strategy

## Status
**Implemented** | 2026-01-30

### Implementation Progress
| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Component Catalog | ✅ Complete | 15 standard + 8 QE-specific components, 125 tests |
| Phase 2: Surface Rendering | ✅ Complete | SurfaceGenerator, templates for 4 QE domains, 122 tests |
| Phase 3: Data Binding | ✅ Complete | BoundValue types, RFC 6901 JSON Pointers, ReactiveStore, 131 tests |
| Phase 4: Accessibility | ✅ Complete | WCAG 2.2 validator, ARIA attributes, keyboard nav, 127 tests |
| Phase 5: AG-UI Integration | ✅ Complete | AGUISyncService, SurfaceStateBridge, 71 tests |

### Test Summary
| Test Suite | Tests | Status |
|------------|-------|--------|
| Component Catalog | 125 | ✅ Passing |
| Surface Rendering | 122 | ✅ Passing |
| Data Binding | 131 | ✅ Passing |
| Accessibility | 127 | ✅ Passing |
| AG-UI Integration | 71 | ✅ Passing |
| Protocol Flow (A2A↔A2UI) | 21 | ✅ Passing |
| Full Flow (AG-UI↔A2A↔A2UI) | 11 | ✅ Passing |
| **Total** | **608** | ✅ All Passing |

### Files Implemented (~12,000 lines)
```
v3/src/adapters/a2ui/
├── catalog/
│   ├── component-schemas.ts  (890 lines) - JSON schemas for all components
│   ├── standard-catalog.ts   (736 lines) - 15 standard A2UI components
│   ├── qe-catalog.ts         (638 lines) - 8 QE-specific components
│   └── index.ts              (178 lines) - Barrel exports
├── renderer/
│   ├── message-types.ts      (504 lines) - A2UI message type definitions
│   ├── component-builder.ts  (682 lines) - DSL for building components
│   ├── surface-generator.ts  (844 lines) - Surface creation & updates
│   ├── index.ts              (171 lines) - Barrel exports
│   └── templates/
│       ├── coverage-surface.ts      (238 lines)
│       ├── test-results-surface.ts  (281 lines)
│       ├── security-surface.ts      (378 lines)
│       └── accessibility-surface.ts (409 lines)
├── data/
│   ├── json-pointer-resolver.ts (373 lines) - RFC 6901 JSON Pointer
│   ├── bound-value.ts           (414 lines) - BoundValue types & resolver
│   ├── reactive-store.ts        (456 lines) - Reactive data store
│   └── index.ts                 (63 lines)  - Barrel exports
├── accessibility/
│   ├── aria-attributes.ts    (539 lines) - ARIA attribute factory
│   ├── keyboard-nav.ts       (529 lines) - Keyboard navigation patterns
│   ├── wcag-validator.ts     (856 lines) - WCAG 2.2 validation
│   └── index.ts              (227 lines) - Barrel exports
├── integration/
│   ├── agui-sync.ts            (594 lines) - AG-UI state synchronization
│   ├── surface-state-bridge.ts (548 lines) - Surface↔State binding
│   └── index.ts                (31 lines)  - Barrel exports
└── index.ts                    (595 lines) - Main barrel exports
```

### Component Catalog Summary
| Category | Standard Components | QE Components |
|----------|--------------------:|:-------------:|
| Layout | Row, Column, List | - |
| Display | Text, Image, Icon, Divider | - |
| Interactive | Button, TextField, CheckBox, DateTimeInput, Slider | - |
| Container | Card, Tabs, Modal | - |
| QE Coverage | - | CoverageGauge, DefectDensityChart |
| QE Testing | - | TestStatusBadge, TestTimeline, FlakySummary |
| QE Security | - | VulnerabilityCard |
| QE Quality | - | QualityGateIndicator |
| QE Accessibility | - | A11yFindingCard |
| **Total** | **15** | **8** |

## Context

AQE v3 currently has no declarative UI generation capability. Quality engineering results are returned as raw JSON or text, requiring manual frontend development for visualization. This creates:

- No standardized way for QE agents to present results
- Manual effort to build dashboards and reports
- Inconsistent UI across different QE tools
- Limited accessibility support in custom implementations

**Current State (Post-Implementation):**
| A2UI Capability | Status | Implementation |
|-----------------|--------|----------------|
| Standard Components | ✅ 15 components | `catalog/standard-catalog.ts` |
| QE Components | ✅ 8 components | `catalog/qe-catalog.ts` |
| Surface Generation | ✅ Implemented | `renderer/surface-generator.ts` |
| BoundValue Types | ✅ Implemented | `data/bound-value.ts` |
| JSON Pointer (RFC 6901) | ✅ Implemented | `data/json-pointer-resolver.ts` |
| Reactive Store | ✅ Implemented | `data/reactive-store.ts` |
| ARIA Attributes | ✅ Full support | `accessibility/aria-attributes.ts` |
| WCAG 2.2 Validation | ✅ Level AA | `accessibility/wcag-validator.ts` |
| Keyboard Navigation | ✅ All patterns | `accessibility/keyboard-nav.ts` |
| AG-UI Sync | ✅ STATE_DELTA/CUSTOM | `integration/agui-sync.ts` |

**Conclusion:** The platform is **100% A2UI v0.8 compliant** (608 tests passing).

**A2UI Opportunity:**
A2UI (v0.8 Public Preview) enables QE agents to generate rich, interactive UIs through declarative JSON, supporting:
- Cross-platform rendering (Web, Flutter, React, Angular)
- Native accessibility inheritance
- Security-first design (no executable code)
- LLM-friendly flat component structure

## Decision

**We will implement A2UI v0.8 declarative UI protocol with a QE-specific component catalog for quality engineering visualization.**

### Architecture Overview

```
+-------------------------------------------------------------------+
|                    AQE v3 A2UI ARCHITECTURE                        |
+-------------------------------------------------------------------+
|                                                                    |
|  +------------------+     +------------------+     +--------------+ |
|  | QE Domain        |---->| A2UI Generator   |---->| Frontend     | |
|  | Services         |     | (JSON Builder)   |     | Renderer     | |
|  +------------------+     +------------------+     +--------------+ |
|                                |                                   |
|                    +-----------+-----------+                       |
|                    |                       |                       |
|                    v                       v                       |
|              +----------+           +----------+                   |
|              | Standard |           | QE-Spec  |                   |
|              | Catalog  |           | Catalog  |                   |
|              +----------+           +----------+                   |
|                    |                       |                       |
|                    +-----------+-----------+                       |
|                                |                                   |
|                                v                                   |
|                         +----------+                               |
|                         | Surface  |                               |
|                         | Updates  |                               |
|                         +----------+                               |
|                                                                    |
+-------------------------------------------------------------------+
```

### Integration Points

#### 1. A2UI Component Catalog (`v3/src/adapters/a2ui/catalog/`)

**Standard Components (15+):**

| Category | Components | Use Case |
|----------|------------|----------|
| **Layout** | Row, Column, List | Arrange QE results |
| **Display** | Text, Image, Icon, Divider | Show metrics, badges |
| **Interactive** | Button, TextField, CheckBox, Slider | User actions |
| **Container** | Card, Tabs, Modal, Accordion | Group QE data |
| **Data** | Table, LineChart, BarChart, PieChart | Visualize coverage, trends |

**QE-Specific Components:**

```typescript
// Custom QE component catalog
const QE_CATALOG = {
  // Coverage visualization
  CoverageGauge: {
    props: ['value', 'threshold', 'label'],
    description: 'Circular gauge showing coverage percentage'
  },

  // Test result badge
  TestStatusBadge: {
    props: ['status', 'count', 'duration'],
    description: 'Badge showing pass/fail/skip counts'
  },

  // Security vulnerability card
  VulnerabilityCard: {
    props: ['severity', 'title', 'cve', 'remediation'],
    description: 'Card displaying security finding details'
  },

  // Quality gate status
  QualityGateIndicator: {
    props: ['status', 'criteria', 'threshold'],
    description: 'Traffic light indicator for quality gates'
  },

  // Accessibility audit result
  A11yFindingCard: {
    props: ['wcagLevel', 'rule', 'element', 'suggestion'],
    description: 'Card for accessibility violations'
  },

  // Test execution timeline
  TestTimeline: {
    props: ['tests', 'startTime', 'endTime'],
    description: 'Horizontal timeline of test execution'
  }
};
```

#### 2. A2UI Message Types

```typescript
// Server to Client Messages
interface SurfaceUpdateMessage {
  surfaceUpdate: {
    surfaceId: string;
    components: A2UIComponent[];
  };
}

interface DataModelUpdateMessage {
  dataModelUpdate: {
    surfaceId: string;
    data: Record<string, unknown>;
  };
}

interface BeginRenderingMessage {
  beginRendering: {
    surfaceId: string;
    rootComponentId: string;
    catalogId: string;
  };
}

interface DeleteSurfaceMessage {
  deleteSurface: {
    surfaceId: string;
  };
}

// Client to Server Messages
interface UserActionMessage {
  userAction: {
    name: string;
    surfaceId: string;
    sourceComponentId: string;
    timestamp: string;
    context: Record<string, unknown>;
  };
}
```

#### 3. Component Structure

```typescript
interface A2UIComponent {
  id: string;
  component: {
    [componentType: string]: {
      // Static values
      [prop: string]: BoundValue | ComponentChildren;
    };
  };
}

// Data binding types
type BoundValue =
  | { literalString: string }                    // Static
  | { path: string }                             // Dynamic JSON Pointer
  | { literalString: string; path: string };     // Initialize + Bind

// Children types
type ComponentChildren =
  | { explicitList: string[] }                   // Static children
  | { template: { dataBinding: string; componentId: string } }; // Dynamic
```

#### 4. QE Surface Generator

```typescript
class QESurfaceGenerator {
  /**
   * Generate coverage report surface
   */
  generateCoverageReport(coverage: CoverageResult): SurfaceUpdateMessage {
    return {
      surfaceUpdate: {
        surfaceId: 'coverage-report',
        components: [
          {
            id: 'report-card',
            component: {
              Card: {
                title: { literalString: 'Coverage Analysis' },
                children: { explicitList: ['gauge', 'breakdown', 'gaps'] }
              }
            }
          },
          {
            id: 'gauge',
            component: {
              CoverageGauge: {
                value: { path: '/coverage/total' },
                threshold: { literalString: '80' },
                label: { literalString: 'Total Coverage' }
              }
            }
          },
          {
            id: 'breakdown',
            component: {
              BarChart: {
                title: { literalString: 'Coverage by Module' },
                data: { path: '/coverage/modules' },
                xAxis: 'name',
                yAxis: 'percentage'
              }
            }
          },
          {
            id: 'gaps',
            component: {
              List: {
                children: {
                  template: {
                    dataBinding: '/coverage/gaps',
                    componentId: 'gap-item-template'
                  }
                }
              }
            }
          }
        ]
      }
    };
  }

  /**
   * Generate test execution dashboard
   */
  generateTestDashboard(results: TestResults): SurfaceUpdateMessage {
    return {
      surfaceUpdate: {
        surfaceId: 'test-dashboard',
        components: [
          {
            id: 'dashboard-grid',
            component: {
              Column: {
                children: { explicitList: ['summary-row', 'results-table', 'timeline'] }
              }
            }
          },
          {
            id: 'summary-row',
            component: {
              Row: {
                children: { explicitList: ['pass-badge', 'fail-badge', 'skip-badge', 'duration'] }
              }
            }
          },
          {
            id: 'pass-badge',
            component: {
              TestStatusBadge: {
                status: { literalString: 'pass' },
                count: { path: '/results/passed' },
                duration: { path: '/results/passDuration' }
              }
            }
          },
          {
            id: 'fail-badge',
            component: {
              TestStatusBadge: {
                status: { literalString: 'fail' },
                count: { path: '/results/failed' },
                duration: { path: '/results/failDuration' }
              }
            }
          },
          {
            id: 'results-table',
            component: {
              Table: {
                columns: [
                  { key: 'name', label: 'Test Name' },
                  { key: 'status', label: 'Status' },
                  { key: 'duration', label: 'Duration' },
                  { key: 'error', label: 'Error' }
                ],
                data: { path: '/results/tests' }
              }
            }
          },
          {
            id: 'timeline',
            component: {
              TestTimeline: {
                tests: { path: '/results/tests' },
                startTime: { path: '/results/startTime' },
                endTime: { path: '/results/endTime' }
              }
            }
          }
        ]
      }
    };
  }

  /**
   * Generate security scan results
   */
  generateSecurityReport(scan: SecurityScanResult): SurfaceUpdateMessage {
    return {
      surfaceUpdate: {
        surfaceId: 'security-report',
        components: [
          {
            id: 'security-card',
            component: {
              Card: {
                title: { literalString: 'Security Scan Results' },
                children: { explicitList: ['severity-chart', 'findings-list'] }
              }
            }
          },
          {
            id: 'severity-chart',
            component: {
              PieChart: {
                title: { literalString: 'Findings by Severity' },
                data: { path: '/security/bySeverity' },
                labelKey: 'severity',
                valueKey: 'count'
              }
            }
          },
          {
            id: 'findings-list',
            component: {
              List: {
                children: {
                  template: {
                    dataBinding: '/security/findings',
                    componentId: 'vuln-card-template'
                  }
                }
              }
            }
          }
        ]
      }
    };
  }
}
```

#### 5. AG-UI State Integration

```typescript
class A2UIStateManager {
  private surfaces = new Map<string, SurfaceState>();

  /**
   * Sync A2UI state with AG-UI events
   */
  async syncWithAGUI(agEvent: AGUIEvent): Promise<void> {
    if (agEvent.type === 'STATE_SNAPSHOT') {
      this.updateSurfaceData(agEvent.snapshot);
    }

    if (agEvent.type === 'STATE_DELTA') {
      this.applyDelta(agEvent.delta);
    }
  }

  /**
   * Emit A2UI surface updates via AG-UI CUSTOM events
   */
  emitSurfaceUpdate(update: SurfaceUpdateMessage): AGUIEvent {
    return {
      type: 'CUSTOM',
      name: 'a2ui_surface_update',
      value: update
    };
  }

  /**
   * Emit data model updates via AG-UI STATE_DELTA
   */
  emitDataUpdate(surfaceId: string, path: string, value: unknown): AGUIEvent {
    return {
      type: 'STATE_DELTA',
      delta: [
        { op: 'replace', path: `/surfaces/${surfaceId}${path}`, value }
      ]
    };
  }
}
```

#### 6. Accessibility Implementation

```typescript
interface A2UIAccessibility {
  role?: string;           // ARIA role
  label?: string;          // aria-label
  describedBy?: string;    // aria-describedby
  live?: 'off' | 'polite' | 'assertive';  // aria-live
  expanded?: boolean;      // aria-expanded
  selected?: boolean;      // aria-selected
  disabled?: boolean;      // aria-disabled
}

// Example accessible component
const accessibleGauge: A2UIComponent = {
  id: 'coverage-gauge',
  component: {
    CoverageGauge: {
      value: { path: '/coverage/total' },
      threshold: { literalString: '80' },
      accessibility: {
        role: 'meter',
        label: 'Total code coverage percentage',
        live: 'polite'
      }
    }
  }
};
```

### WCAG 2.2 Compliance Matrix

| WCAG Principle | A2UI Implementation |
|----------------|---------------------|
| **Perceivable** | Native semantic markup, proper ARIA attributes |
| **Operable** | Keyboard navigation inherited from platform |
| **Understandable** | Consistent component behavior, clear labels |
| **Robust** | Native rendering ensures AT compatibility |

## Rationale

**Pros:**
- Cross-platform QE dashboards from single JSON definition
- Native accessibility inheritance
- Security-first (no executable code from agents)
- LLM-friendly structure for AI-generated UIs
- Integrates with AG-UI for real-time updates

**Cons:**
- Additional abstraction layer
- Need to implement rendering for each platform
- Custom QE components require catalog extension

**Alternatives Considered:**

1. **Return Raw JSON Only**
   - Rejected: Requires manual frontend for every QE tool

2. **Generate HTML Directly**
   - Rejected: Security risk, not cross-platform

3. **Use Existing Dashboard Library**
   - Rejected: Not agent-generated, no standardization

## Implementation Plan

**Phase 1: Component Catalog (Week 5)** ✅ COMPLETE
- ✅ Defined standard component schemas (15 components)
- ✅ Created QE-specific component catalog (8 components)
- ✅ Component validation with JSON schemas
- ✅ 125 unit tests

**Phase 2: Surface Rendering (Week 5)** ✅ COMPLETE
- ✅ Implemented SurfaceGenerator with state management
- ✅ Built ComponentBuilder DSL (row, column, card, text, button, list)
- ✅ Created QE surface templates (coverage, tests, security, a11y)
- ✅ 122 unit tests

**Phase 3: Data Binding (Week 6)** ✅ COMPLETE
- ✅ Implemented BoundValue types (literal, path, combined)
- ✅ RFC 6901 JSON Pointer resolution
- ✅ ReactiveStore with change notifications
- ✅ 131 unit tests

**Phase 4: Accessibility (Week 6)** ✅ COMPLETE
- ✅ ARIA attribute support (all roles, states, properties)
- ✅ Keyboard navigation patterns (13 component patterns)
- ✅ WCAG 2.2 Level AA validation
- ✅ 127 unit tests

**Phase 5: AG-UI Integration (Week 6)** ✅ COMPLETE
- ✅ Connected to AG-UI STATE_DELTA events
- ✅ Implemented AGUISyncService for bidirectional sync
- ✅ SurfaceStateBridge for automatic binding updates
- ✅ CUSTOM event emission for surface updates
- ✅ 71 unit tests + 32 integration tests

## Success Metrics

- [x] 15 standard components implemented (Row, Column, List, Text, Image, Icon, Divider, Button, TextField, CheckBox, DateTimeInput, Slider, Card, Tabs, Modal)
- [x] 8 QE-specific components implemented (CoverageGauge, TestStatusBadge, VulnerabilityCard, QualityGateIndicator, A11yFindingCard, TestTimeline, DefectDensityChart, FlakySummary)
- [x] WCAG 2.2 Level AA compliance (`wcag-validator.ts` with 22+ criteria)
- [x] AG-UI state synchronization working (AGUISyncService, SurfaceStateBridge)
- [x] Cross-platform JSON serialization tested (all message types serializable)
- [x] QE dashboards generated for: coverage, tests, security, a11y (4 template modules)

## Dependencies

- A2UI SDK (TypeScript)
- AG-UI integration (ADR-053)
- fast-json-patch for state updates
- Platform renderers (Lit, Flutter GenUI SDK)

## References

- [A2UI Official Specification](https://a2ui.org/specification/v0.8-a2ui/)
- [A2UI Components](https://a2ui.org/concepts/components/)
- [Introducing A2UI - Google Developers Blog](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/)
- [AG-UI + A2UI Integration](https://www.copilotkit.ai/blog/build-with-googles-new-a2ui-spec-agent-user-interfaces-with-a2ui-ag-ui)

## Remaining Considerations / Future Work

### Potential Improvements
1. **Platform Renderers**: JSON generation complete; actual Lit/Flutter/Angular renderers need platform-specific implementation
2. **Data Charts**: LineChart, BarChart, PieChart defined in schema but rendering depends on charting library
3. **Real Screen Reader Testing**: WCAG validation is structural; actual AT testing requires manual QA

### Production Hardening (Future)
- Performance testing with large surface trees (100+ components)
- Memory leak testing for ReactiveStore subscriptions
- Real-time update throttling for high-frequency data

### Not in Scope (Intentionally Excluded)
- Executable code in components (security-first design)
- Custom component extensions (use standard catalog)
- Server-side rendering (client-side only)

---

*ADR created: 2026-01-30*
*Implementation completed: 2026-01-30*
*Protocol Version: A2UI v0.8 (Public Preview)*
*Total Tests: 608 passing*
