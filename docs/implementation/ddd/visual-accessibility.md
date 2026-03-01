# Visual & Accessibility Testing Domain

## Bounded Context Overview

**Domain**: Visual & Accessibility Testing
**Responsibility**: Visual regression, screenshot comparison, WCAG compliance, EU accessibility standards
**Location**: `src/domains/visual-accessibility/`

The Visual & Accessibility Testing domain ensures visual consistency and accessibility compliance through screenshot comparison, WCAG auditing, color contrast analysis, and EU accessibility standard validation (EN 301 549, EU Accessibility Act).

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Visual Regression** | Unintended visual change from baseline |
| **Baseline** | Reference screenshot for comparison |
| **Diff** | Visual difference between screenshots |
| **WCAG** | Web Content Accessibility Guidelines |
| **A11y** | Accessibility (numeronym) |
| **Viewport** | Browser window dimensions |
| **Contrast Ratio** | Color luminance ratio for readability |
| **Focus Trap** | Element that captures keyboard focus |

## Domain Model

### Aggregates

#### VisualTestReport (Aggregate Root)
Complete visual test suite results.

```typescript
interface VisualTestReport {
  totalTests: number;
  passed: number;
  failed: number;
  newBaselines: number;
  results: VisualTestResult[];
  duration: number;
}
```

#### AccessibilityAuditReport (Aggregate Root)
Full accessibility audit results.

```typescript
interface AccessibilityAuditReport {
  totalUrls: number;
  passingUrls: number;
  totalViolations: number;
  criticalViolations: number;
  averageScore: number;
  reports: AccessibilityReport[];
  topIssues: TopAccessibilityIssue[];
}
```

#### EUComplianceReport (Aggregate Root)
EU accessibility standard compliance.

```typescript
interface EUComplianceReport {
  url: string;
  timestamp: Date;
  en301549: EUComplianceResult;
  eaaCompliance?: EAAComplianceResult;
  overallStatus: 'compliant' | 'partially-compliant' | 'non-compliant';
  complianceScore: number;
  certificationReady: boolean;
  nextReviewDate?: Date;
}
```

### Entities

#### Screenshot
Captured screenshot with metadata.

```typescript
interface Screenshot {
  id: string;
  url: string;
  viewport: Viewport;
  timestamp: Date;
  path: FilePath;
  metadata: ScreenshotMetadata;
}
```

#### VisualDiff
Difference between screenshots.

```typescript
interface VisualDiff {
  baselineId: string;
  comparisonId: string;
  diffPercentage: number;
  diffPixels: number;
  diffImagePath?: FilePath;
  regions: DiffRegion[];
  status: DiffStatus;
}
```

#### AccessibilityViolation
WCAG violation with remediation.

```typescript
interface AccessibilityViolation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  wcagCriteria: WCAGCriterion[];
  description: string;
  help: string;
  helpUrl: string;
  nodes: ViolationNode[];
}
```

### Value Objects

#### Viewport
Browser viewport configuration.

```typescript
interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor: number;
  readonly isMobile: boolean;
  readonly hasTouch: boolean;
}
```

#### DiffStatus
```typescript
type DiffStatus = 'identical' | 'acceptable' | 'changed' | 'failed';
```

#### DiffRegion
Region of visual change.

```typescript
interface DiffRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly changeType: 'added' | 'removed' | 'modified';
  readonly significance: 'high' | 'medium' | 'low';
}
```

#### WCAGCriterion
WCAG success criterion.

```typescript
interface WCAGCriterion {
  readonly id: string;
  readonly level: 'A' | 'AA' | 'AAA';
  readonly title: string;
}
```

#### ContrastAnalysis
Color contrast evaluation.

```typescript
interface ContrastAnalysis {
  readonly element: string;
  readonly foreground: string;
  readonly background: string;
  readonly ratio: number;
  readonly requiredRatio: number;
  readonly passes: boolean;
  readonly wcagLevel: 'A' | 'AA' | 'AAA';
}
```

## EU Accessibility Standards

### EN 301 549
European standard for ICT accessibility requirements.

```typescript
interface EN301549Clause {
  readonly id: string;
  readonly title: string;
  readonly chapter: string;
  readonly wcagMapping: string[];
  readonly description: string;
  readonly testMethod: 'automated' | 'manual' | 'hybrid';
}
```

### EU Accessibility Act (EAA)
Directive (EU) 2019/882 requirements.

```typescript
type EAAProductCategory =
  | 'computers'
  | 'smartphones'
  | 'tv-equipment'
  | 'telephony-services'
  | 'audiovisual-media'
  | 'transport-services'
  | 'banking-services'
  | 'e-commerce'
  | 'e-books';
```

## Domain Services

### IVisualAccessibilityCoordinator
Primary coordinator for the domain.

```typescript
interface IVisualAccessibilityCoordinator {
  runVisualTests(urls: string[], viewports: Viewport[]): Promise<Result<VisualTestReport>>;
  runAccessibilityAudit(urls: string[], level: 'A' | 'AA' | 'AAA'): Promise<Result<AccessibilityAuditReport>>;
  approveVisualChanges(diffIds: string[], reason: string): Promise<Result<void>>;
  generateRemediationPlan(violations: AccessibilityViolation[]): Promise<Result<RemediationPlan>>;
  getVisualTestingStatus(): Promise<Result<VisualTestingStatus>>;
  prioritizeVisualTests(tests: VisualTestItem[], context: VisualTestPrioritizationContext): Promise<Result<VisualTestPrioritizationResult>>;
}
```

### IVisualTestingService
Screenshot capture and comparison.

```typescript
interface IVisualTestingService {
  captureScreenshot(url: string, options?: CaptureOptions): Promise<Result<Screenshot>>;
  captureElement(url: string, selector: string, options?: CaptureOptions): Promise<Result<Screenshot>>;
  compare(screenshot: Screenshot, baselineId: string): Promise<Result<VisualDiff>>;
  setBaseline(screenshot: Screenshot): Promise<Result<string>>;
  getBaseline(url: string, viewport: Viewport): Promise<Screenshot | null>;
}
```

### IAccessibilityAuditingService
WCAG compliance checking.

```typescript
interface IAccessibilityAuditingService {
  audit(url: string, options?: AuditOptions): Promise<Result<AccessibilityReport>>;
  auditElement(url: string, selector: string): Promise<Result<AccessibilityReport>>;
  checkContrast(url: string): Promise<Result<ContrastAnalysis[]>>;
  validateWCAGLevel(url: string, level: 'A' | 'AA' | 'AAA'): Promise<Result<WCAGValidationResult>>;
  checkKeyboardNavigation(url: string): Promise<Result<KeyboardNavigationReport>>;
  validateEUCompliance(url: string, options?: EUComplianceOptions): Promise<Result<EUComplianceReport>>;
}
```

### IScreenshotDiffService
Advanced image comparison.

```typescript
interface IScreenshotDiffService {
  calculateDiff(baseline: Screenshot, comparison: Screenshot): Promise<Result<VisualDiff>>;
  generateDiffImage(diff: VisualDiff): Promise<Result<FilePath>>;
  detectSignificantRegions(diff: VisualDiff): Promise<Result<DiffRegion[]>>;
  aiCompare(baseline: Screenshot, comparison: Screenshot): Promise<Result<AIComparisonResult>>;
}
```

## A2C RL Integration

The domain uses Advantage Actor-Critic (A2C) reinforcement learning for visual test prioritization:

```typescript
interface VisualTestPrioritizationContext {
  readonly urgency: number;
  readonly availableResources: number;
  readonly historicalFailureRate: number;
}

interface VisualTestPrioritizationResult {
  readonly orderedTests: PrioritizedVisualTest[];
  readonly strategy: string;
  readonly confidence: number;
}
```

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `VisualRegressionDetectedEvent` | Regression found | `{ testId, url, diffPercentage, diffImagePath }` |
| `AccessibilityAuditCompletedEvent` | Audit done | `{ auditId, url, violations, passedRules, score }` |
| `BaselineUpdatedEvent` | Baseline changed | `{ screenshotId, url, viewport, reason }` |
| `ContrastFailureEvent` | Contrast too low | `{ element, ratio, requiredRatio }` |

## Repositories

```typescript
interface IScreenshotRepository {
  findById(id: string): Promise<Screenshot | null>;
  findByUrl(url: string): Promise<Screenshot[]>;
  findBaseline(url: string, viewport: Viewport): Promise<Screenshot | null>;
  save(screenshot: Screenshot): Promise<void>;
  setAsBaseline(id: string): Promise<void>;
}

interface IVisualDiffRepository {
  findById(id: string): Promise<VisualDiff | null>;
  findByBaselineId(baselineId: string): Promise<VisualDiff[]>;
  findFailed(since: Date): Promise<VisualDiff[]>;
  save(diff: VisualDiff): Promise<void>;
}

interface IAccessibilityReportRepository {
  findLatest(url: string): Promise<AccessibilityReport | null>;
  findByDateRange(url: string, startDate: Date, endDate: Date): Promise<AccessibilityReport[]>;
  save(report: AccessibilityReport): Promise<void>;
}
```

## Context Integration

### Upstream Dependencies
- Browser automation (Playwright, Puppeteer)
- axe-core accessibility engine
- Image comparison libraries (pixelmatch, resemble.js)

### Downstream Consumers
- **Quality Assessment**: Accessibility metrics for gates
- **Test Execution**: E2E visual assertions
- CI/CD pipelines: Visual regression gates

### Anti-Corruption Layer
The domain abstracts different browser automation tools and accessibility engines through service interfaces.

## Task Handlers

| Task Type | Handler | Description |
|-----------|---------|-------------|
| `visual-test` | `runVisualTests()` | Visual regression testing |
| `a11y-audit` | `runAccessibilityAudit()` | WCAG compliance audit |
| `approve-changes` | `approveVisualChanges()` | Update baselines |
| `eu-compliance` | `validateEUCompliance()` | EU standards check |
| `prioritize-visual` | `prioritizeVisualTests()` | A2C prioritization |

## Configuration Constants

```typescript
const VISUAL_CONSTANTS = {
  MOBILE_WIDTH_THRESHOLD: 480,
  SMALL_MOBILE_WIDTH: 320,
  TABLET_WIDTH_THRESHOLD: 768,
  DESKTOP_WIDTH_THRESHOLD: 1024,
  LARGE_DESKTOP_WIDTH_THRESHOLD: 1440,
  BASE_VISUAL_SCORE: 100,
  BASE_LOAD_TIME_MS: 800,
  AXE_DEFAULT_TIMEOUT_MS: 10000,
  AXE_EXTENDED_TIMEOUT_MS: 30000,
  VISUAL_RETRY_DELAY_MS: 200,
};
```

## Standard Viewports

```typescript
const STANDARD_VIEWPORTS: Viewport[] = [
  { width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true },   // iPhone SE
  { width: 375, height: 812, deviceScaleFactor: 3, isMobile: true, hasTouch: true },   // iPhone X
  { width: 768, height: 1024, deviceScaleFactor: 2, isMobile: false, hasTouch: true }, // iPad
  { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false }, // Desktop
  { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false }, // Full HD
];
```

## ADR References

- **ADR-051**: AI-powered visual comparison
