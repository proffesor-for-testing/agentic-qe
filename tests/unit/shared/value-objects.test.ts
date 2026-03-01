/**
 * Agentic QE v3 - Value Objects Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  FilePath,
  Coverage,
  RiskScore,
  TimeRange,
  Version,
} from '../../../src/shared/value-objects';

describe('FilePath', () => {
  it('should create a valid file path', () => {
    const path = FilePath.create('/src/index.ts');
    expect(path.value).toBe('/src/index.ts');
  });

  it('should extract extension', () => {
    const path = FilePath.create('/src/index.ts');
    expect(path.extension).toBe('ts');
  });

  it('should extract directory', () => {
    const path = FilePath.create('/src/components/Button.tsx');
    expect(path.directory).toBe('/src/components');
  });

  it('should extract filename', () => {
    const path = FilePath.create('/src/components/Button.tsx');
    expect(path.filename).toBe('Button.tsx');
  });

  it('should throw for empty path', () => {
    expect(() => FilePath.create('')).toThrow();
  });
});

describe('Coverage', () => {
  it('should create valid coverage', () => {
    const coverage = Coverage.create(80, 70, 90, 85);
    expect(coverage.line).toBe(80);
    expect(coverage.branch).toBe(70);
    expect(coverage.function).toBe(90);
    expect(coverage.statement).toBe(85);
  });

  it('should calculate overall coverage', () => {
    const coverage = Coverage.create(80, 80, 80, 80);
    expect(coverage.overall).toBe(80);
  });

  it('should check threshold', () => {
    const coverage = Coverage.create(80, 80, 80, 80);
    expect(coverage.meetsThreshold(70)).toBe(true);
    expect(coverage.meetsThreshold(90)).toBe(false);
  });

  it('should throw for invalid percentage', () => {
    expect(() => Coverage.create(110, 80, 80, 80)).toThrow();
    expect(() => Coverage.create(-10, 80, 80, 80)).toThrow();
  });

  it('should create zero coverage', () => {
    const coverage = Coverage.zero();
    expect(coverage.overall).toBe(0);
  });
});

describe('RiskScore', () => {
  it('should create valid risk score', () => {
    const risk = RiskScore.create(0.75);
    expect(risk.value).toBe(0.75);
    expect(risk.percentage).toBe(75);
  });

  it('should determine risk level', () => {
    expect(RiskScore.create(0.9).level).toBe('critical');
    expect(RiskScore.create(0.7).level).toBe('high');
    expect(RiskScore.create(0.4).level).toBe('medium');
    expect(RiskScore.create(0.2).level).toBe('low');
  });

  it('should compare risk scores', () => {
    const high = RiskScore.create(0.8);
    const low = RiskScore.create(0.2);
    expect(high.isHigherThan(low)).toBe(true);
    expect(low.isHigherThan(high)).toBe(false);
  });

  it('should throw for out of range values', () => {
    expect(() => RiskScore.create(1.5)).toThrow();
    expect(() => RiskScore.create(-0.1)).toThrow();
  });

  it('should create from percentage', () => {
    const risk = RiskScore.fromPercentage(75);
    expect(risk.value).toBe(0.75);
  });
});

describe('TimeRange', () => {
  it('should create valid time range', () => {
    const start = new Date('2024-01-01');
    const end = new Date('2024-01-31');
    const range = TimeRange.create(start, end);

    expect(range.start).toEqual(start);
    expect(range.end).toEqual(end);
  });

  it('should calculate duration', () => {
    const start = new Date('2024-01-01T00:00:00Z');
    const end = new Date('2024-01-01T01:00:00Z');
    const range = TimeRange.create(start, end);

    expect(range.durationMs).toBe(3600000);
    expect(range.durationSeconds).toBe(3600);
  });

  it('should check if date is contained', () => {
    const start = new Date('2024-01-01');
    const end = new Date('2024-01-31');
    const range = TimeRange.create(start, end);

    expect(range.contains(new Date('2024-01-15'))).toBe(true);
    expect(range.contains(new Date('2024-02-15'))).toBe(false);
  });

  it('should throw when start is after end', () => {
    const start = new Date('2024-01-31');
    const end = new Date('2024-01-01');
    expect(() => TimeRange.create(start, end)).toThrow();
  });

  it('should create last N days range', () => {
    const range = TimeRange.lastNDays(7);
    expect(range.durationMs).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -3);
  });
});

describe('Version', () => {
  it('should create version', () => {
    const version = Version.create(3, 0, 0);
    expect(version.major).toBe(3);
    expect(version.minor).toBe(0);
    expect(version.patch).toBe(0);
    expect(version.toString()).toBe('3.0.0');
  });

  it('should create version with prerelease', () => {
    const version = Version.create(3, 0, 0, 'alpha');
    expect(version.prerelease).toBe('alpha');
    expect(version.toString()).toBe('3.0.0-alpha');
  });

  it('should parse version string', () => {
    const version = Version.parse('2.8.2');
    expect(version.major).toBe(2);
    expect(version.minor).toBe(8);
    expect(version.patch).toBe(2);
  });

  it('should parse version with prerelease', () => {
    const version = Version.parse('3.0.0-beta.1');
    expect(version.prerelease).toBe('beta.1');
  });

  it('should compare versions', () => {
    const v1 = Version.parse('2.0.0');
    const v2 = Version.parse('3.0.0');
    const v3 = Version.parse('2.1.0');

    expect(v2.isNewerThan(v1)).toBe(true);
    expect(v1.isNewerThan(v2)).toBe(false);
    expect(v3.isNewerThan(v1)).toBe(true);
  });

  it('should throw for invalid version format', () => {
    expect(() => Version.parse('invalid')).toThrow();
    expect(() => Version.parse('1.2')).toThrow();
  });
});
