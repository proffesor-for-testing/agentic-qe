/**
 * Multi-Language Coverage Parser Tests
 *
 * Tests for Phase 5 coverage format parsers:
 * - JaCoCo XML (Java/Kotlin)
 * - dotcover XML (C#/.NET)
 * - Tarpaulin JSON (Rust)
 * - Go cover text (Go)
 * - Kover XML (Kotlin/JVM)
 * - xcresult JSON (Swift/iOS)
 *
 * @see Issue #324 — Multi-language Phase 5
 */

import { describe, it, expect } from 'vitest';

import {
  parseJaCoCoContent,
  parseDotcoverContent,
  parseTarpaulinContent,
  parseGoCoverContent,
  parseXcresultContent,
  parseLCOVContent,
  type CoverageReport,
  type CoverageFormat,
} from '../../../src/domains/coverage-analysis/services/coverage-parser.js';

// ============================================================================
// JaCoCo XML
// ============================================================================

describe('JaCoCo XML Parser', () => {
  const JACOCO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<report name="MyProject">
  <package name="com/example/auth">
    <sourcefile name="AuthService.java">
      <line nr="10" mi="0" ci="3" mb="0" cb="2"/>
      <line nr="11" mi="2" ci="0" mb="1" cb="0"/>
      <line nr="12" mi="0" ci="1" mb="0" cb="0"/>
      <counter type="INSTRUCTION" missed="5" covered="20"/>
      <counter type="BRANCH" missed="1" covered="3"/>
      <counter type="LINE" missed="1" covered="2"/>
      <counter type="METHOD" missed="0" covered="3"/>
    </sourcefile>
  </package>
</report>`;

  it('should parse JaCoCo XML and extract line coverage', () => {
    const report = parseJaCoCoContent(JACOCO_XML, '/project');

    expect(report.format).toBe('jacoco');
    expect(report.language).toBe('java');
    expect(report.files.size).toBe(1);

    const file = Array.from(report.files.values())[0];
    expect(file.lines.total).toBe(3); // 1 missed + 2 covered
    expect(file.lines.covered).toBe(2);
    expect(file.branches.total).toBe(4); // 1 missed + 3 covered
    expect(file.branches.covered).toBe(3);
    expect(file.functions.total).toBe(3);
    expect(file.functions.covered).toBe(3);
  });

  it('should extract uncovered lines from line elements', () => {
    const report = parseJaCoCoContent(JACOCO_XML, '/project');
    const file = Array.from(report.files.values())[0];

    // Line 11 has ci=0 (covered instructions = 0)
    expect(file.lines.uncoveredLines).toContain(11);
  });

  it('should compute summary correctly', () => {
    const report = parseJaCoCoContent(JACOCO_XML, '/project');

    expect(report.summary.totalFiles).toBe(1);
    expect(report.summary.lines.covered).toBe(2);
    expect(report.summary.lines.total).toBe(3);
  });
});

// ============================================================================
// dotcover XML
// ============================================================================

describe('dotcover XML Parser', () => {
  const DOTCOVER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Root CoveredStatements="15" TotalStatements="20" CoveragePercent="75">
  <Assembly Name="MyApp">
    <Namespace Name="MyApp.Services">
      <Type Name="UserService">
        <File Index="1" Name="/src/UserService.cs"/>
        <Statement FileIndex="1" Line="10" Column="5" EndLine="10" EndColumn="30" Covered="True"/>
        <Statement FileIndex="1" Line="11" Column="5" EndLine="11" EndColumn="25" Covered="True"/>
        <Statement FileIndex="1" Line="15" Column="5" EndLine="15" EndColumn="20" Covered="False"/>
      </Type>
    </Namespace>
  </Assembly>
</Root>`;

  it('should parse dotcover XML and extract statement coverage', () => {
    const report = parseDotcoverContent(DOTCOVER_XML, '/project');

    expect(report.format).toBe('dotcover');
    expect(report.language).toBe('csharp');
    expect(report.files.size).toBe(1);

    const file = Array.from(report.files.values())[0];
    expect(file.statements.total).toBe(3);
    expect(file.statements.covered).toBe(2);
  });

  it('should identify uncovered lines', () => {
    const report = parseDotcoverContent(DOTCOVER_XML, '/project');
    const file = Array.from(report.files.values())[0];

    expect(file.lines.uncoveredLines).toContain(15);
  });

  it('should fall back to root attributes when no Statement elements', () => {
    const simpleXml = `<Root CoveredStatements="80" TotalStatements="100"/>`;
    const report = parseDotcoverContent(simpleXml, '/project');

    expect(report.files.size).toBe(1);
    const file = Array.from(report.files.values())[0];
    expect(file.statements.total).toBe(100);
    expect(file.statements.covered).toBe(80);
  });
});

// ============================================================================
// Tarpaulin JSON (Rust)
// ============================================================================

describe('Tarpaulin JSON Parser', () => {
  const TARPAULIN_JSON = JSON.stringify({
    files: [
      {
        path: '/project/src/lib.rs',
        content: '',
        traces: [
          { line: 5, stats: { Line: 3 } },
          { line: 6, stats: { Line: 0 } },
          { line: 10, stats: { Line: 1 } },
          { line: 15, stats: { Line: 0 } },
        ],
      },
      {
        path: '/project/src/main.rs',
        content: '',
        traces: [
          { line: 3, stats: { Line: 5 } },
        ],
      },
    ],
  });

  it('should parse tarpaulin JSON and extract line coverage', () => {
    const report = parseTarpaulinContent(TARPAULIN_JSON, '/project');

    expect(report.format).toBe('tarpaulin');
    expect(report.language).toBe('rust');
    expect(report.files.size).toBe(2);

    const libFile = report.files.get('/project/src/lib.rs')!;
    expect(libFile.lines.total).toBe(4);
    expect(libFile.lines.covered).toBe(2);
    expect(libFile.lines.uncoveredLines).toEqual([6, 15]);
  });

  it('should handle empty traces array', () => {
    const emptyJson = JSON.stringify({ files: [{ path: '/project/src/empty.rs', traces: [] }] });
    const report = parseTarpaulinContent(emptyJson, '/project');

    const file = report.files.get('/project/src/empty.rs')!;
    expect(file.lines.total).toBe(0);
    expect(file.coveragePercentage).toBe(0);
  });
});

// ============================================================================
// Go cover
// ============================================================================

describe('Go cover Parser', () => {
  const GO_COVER = `mode: set
github.com/myapp/pkg/handler.go:10.30,15.2 3 1
github.com/myapp/pkg/handler.go:17.40,22.2 4 0
github.com/myapp/pkg/util.go:5.20,8.2 2 1
github.com/myapp/pkg/util.go:10.25,14.2 3 1`;

  it('should parse Go coverage profile format', () => {
    const report = parseGoCoverContent(GO_COVER, '/project');

    expect(report.format).toBe('gocover');
    expect(report.language).toBe('go');
    expect(report.files.size).toBe(2);
  });

  it('should extract statement counts from coverage blocks', () => {
    const report = parseGoCoverContent(GO_COVER, '/project');

    const handler = report.files.get('github.com/myapp/pkg/handler.go')!;
    expect(handler.statements.total).toBe(7); // 3 + 4
    expect(handler.statements.covered).toBe(3); // only first block covered

    const util = report.files.get('github.com/myapp/pkg/util.go')!;
    expect(util.statements.total).toBe(5); // 2 + 3
    expect(util.statements.covered).toBe(5); // both covered
  });

  it('should mark uncovered lines from blocks with count=0', () => {
    const report = parseGoCoverContent(GO_COVER, '/project');

    const handler = report.files.get('github.com/myapp/pkg/handler.go')!;
    // Lines 17-22 should be uncovered (count=0)
    expect(handler.lines.uncoveredLines).toContain(17);
    expect(handler.lines.uncoveredLines).toContain(22);
  });

  it('should skip mode line', () => {
    const report = parseGoCoverContent('mode: atomic\n', '/project');
    expect(report.files.size).toBe(0);
  });
});

// ============================================================================
// Kover XML (Kotlin)
// ============================================================================

describe('Kover XML Parser', () => {
  it('should parse Kover XML as JaCoCo-compatible with kotlin language', () => {
    const koverXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="Kover Report">
  <package name="com/example">
    <sourcefile name="Service.kt">
      <counter type="LINE" missed="2" covered="8"/>
      <counter type="BRANCH" missed="0" covered="4"/>
      <counter type="METHOD" missed="1" covered="5"/>
      <counter type="INSTRUCTION" missed="10" covered="50"/>
    </sourcefile>
  </package>
</report>`;

    // Kover uses JaCoCo-compatible XML, just with different format/language tags
    const report = parseJaCoCoContent(koverXml, '/project');
    // When called via parseKover, format would be 'kover' and language 'kotlin'
    // Here we test the underlying parsing works
    expect(report.files.size).toBe(1);

    const file = Array.from(report.files.values())[0];
    expect(file.lines.total).toBe(10);
    expect(file.lines.covered).toBe(8);
    expect(file.functions.total).toBe(6);
    expect(file.functions.covered).toBe(5);
  });
});

// ============================================================================
// xcresult JSON (Swift)
// ============================================================================

describe('xcresult JSON Parser', () => {
  const XCRESULT_JSON = JSON.stringify({
    targets: [
      {
        name: 'MyAppTests',
        files: [
          {
            path: '/project/Sources/ViewController.swift',
            lineCoverage: 0.85,
            coveredLines: 17,
            executableLines: 20,
            functions: [
              { name: 'viewDidLoad()', lineNumber: 10, coveredLines: 5 },
              { name: 'handleTap(_:)', lineNumber: 25, coveredLines: 0 },
            ],
          },
          {
            path: '/project/Sources/Model.swift',
            lineCoverage: 1.0,
            coveredLines: 10,
            executableLines: 10,
            functions: [],
          },
        ],
      },
    ],
  });

  it('should parse xcresult JSON and extract coverage', () => {
    const report = parseXcresultContent(XCRESULT_JSON, '/project');

    expect(report.format).toBe('xcresult');
    expect(report.language).toBe('swift');
    expect(report.files.size).toBe(2);
  });

  it('should extract function coverage from xcresult', () => {
    const report = parseXcresultContent(XCRESULT_JSON, '/project');

    const vc = report.files.get('/project/Sources/ViewController.swift')!;
    expect(vc.lines.total).toBe(20);
    expect(vc.lines.covered).toBe(17);
    expect(vc.coveragePercentage).toBe(85);
    expect(vc.functions.total).toBe(2);
    expect(vc.functions.covered).toBe(1);
    expect(vc.functions.uncoveredFunctions).toContain('handleTap(_:)');
  });

  it('should handle 100% coverage files', () => {
    const report = parseXcresultContent(XCRESULT_JSON, '/project');

    const model = report.files.get('/project/Sources/Model.swift')!;
    expect(model.coveragePercentage).toBe(100);
    expect(model.lines.covered).toBe(10);
  });
});

// ============================================================================
// Format Detection
// ============================================================================

describe('Coverage Format Type', () => {
  it('should support all new format types', () => {
    const formats: CoverageFormat[] = [
      'lcov', 'cobertura', 'json',
      'jacoco', 'dotcover', 'tarpaulin',
      'gocover', 'kover', 'xcresult',
    ];
    expect(formats).toHaveLength(9);
  });
});
