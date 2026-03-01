/**
 * Agentic QE v3 - Shared Value Objects
 * Immutable objects defined by their attributes
 */

// ============================================================================
// File Path Value Object
// ============================================================================

export class FilePath {
  private constructor(private readonly _value: string) {
    if (!_value || _value.trim() === '') {
      throw new Error('FilePath cannot be empty');
    }
  }

  get value(): string {
    return this._value;
  }

  get extension(): string {
    const parts = this._value.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  }

  get directory(): string {
    const lastSlash = this._value.lastIndexOf('/');
    return lastSlash > 0 ? this._value.substring(0, lastSlash) : '';
  }

  get filename(): string {
    const lastSlash = this._value.lastIndexOf('/');
    return lastSlash >= 0 ? this._value.substring(lastSlash + 1) : this._value;
  }

  equals(other: FilePath): boolean {
    return this._value === other._value;
  }

  static create(path: string): FilePath {
    return new FilePath(path);
  }
}

// ============================================================================
// Coverage Value Object
// ============================================================================

export class Coverage {
  private constructor(
    private readonly _line: number,
    private readonly _branch: number,
    private readonly _function: number,
    private readonly _statement: number
  ) {
    this.validatePercentage(_line, 'line');
    this.validatePercentage(_branch, 'branch');
    this.validatePercentage(_function, 'function');
    this.validatePercentage(_statement, 'statement');
  }

  private validatePercentage(value: number, name: string): void {
    if (value < 0 || value > 100) {
      throw new Error(`${name} coverage must be between 0 and 100`);
    }
  }

  get line(): number {
    return this._line;
  }

  get branch(): number {
    return this._branch;
  }

  get function(): number {
    return this._function;
  }

  get statement(): number {
    return this._statement;
  }

  get overall(): number {
    return (this._line + this._branch + this._function + this._statement) / 4;
  }

  meetsThreshold(threshold: number): boolean {
    return this.overall >= threshold;
  }

  equals(other: Coverage): boolean {
    return (
      this._line === other._line &&
      this._branch === other._branch &&
      this._function === other._function &&
      this._statement === other._statement
    );
  }

  static create(line: number, branch: number, func: number, statement: number): Coverage {
    return new Coverage(line, branch, func, statement);
  }

  static zero(): Coverage {
    return new Coverage(0, 0, 0, 0);
  }
}

// ============================================================================
// Risk Score Value Object
// ============================================================================

export class RiskScore {
  private constructor(private readonly _value: number) {
    if (_value < 0 || _value > 1) {
      throw new Error('RiskScore must be between 0 and 1');
    }
  }

  get value(): number {
    return this._value;
  }

  get percentage(): number {
    return this._value * 100;
  }

  get level(): 'critical' | 'high' | 'medium' | 'low' {
    if (this._value >= 0.8) return 'critical';
    if (this._value >= 0.6) return 'high';
    if (this._value >= 0.3) return 'medium';
    return 'low';
  }

  isHigherThan(other: RiskScore): boolean {
    return this._value > other._value;
  }

  equals(other: RiskScore): boolean {
    return this._value === other._value;
  }

  static create(value: number): RiskScore {
    return new RiskScore(value);
  }

  static fromPercentage(percentage: number): RiskScore {
    return new RiskScore(percentage / 100);
  }
}

// ============================================================================
// Time Range Value Object
// ============================================================================

export class TimeRange {
  private constructor(
    private readonly _start: Date,
    private readonly _end: Date
  ) {
    if (_start > _end) {
      throw new Error('Start date cannot be after end date');
    }
  }

  get start(): Date {
    return this._start;
  }

  get end(): Date {
    return this._end;
  }

  get durationMs(): number {
    return this._end.getTime() - this._start.getTime();
  }

  get durationSeconds(): number {
    return this.durationMs / 1000;
  }

  contains(date: Date): boolean {
    return date >= this._start && date <= this._end;
  }

  overlaps(other: TimeRange): boolean {
    return this._start <= other._end && other._start <= this._end;
  }

  equals(other: TimeRange): boolean {
    return (
      this._start.getTime() === other._start.getTime() &&
      this._end.getTime() === other._end.getTime()
    );
  }

  static create(start: Date, end: Date): TimeRange {
    return new TimeRange(start, end);
  }

  static lastNDays(days: number): TimeRange {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    return new TimeRange(start, end);
  }
}

// ============================================================================
// Version Value Object
// ============================================================================

export class Version {
  private constructor(
    private readonly _major: number,
    private readonly _minor: number,
    private readonly _patch: number,
    private readonly _prerelease?: string
  ) {}

  get major(): number {
    return this._major;
  }

  get minor(): number {
    return this._minor;
  }

  get patch(): number {
    return this._patch;
  }

  get prerelease(): string | undefined {
    return this._prerelease;
  }

  toString(): string {
    const base = `${this._major}.${this._minor}.${this._patch}`;
    return this._prerelease ? `${base}-${this._prerelease}` : base;
  }

  isNewerThan(other: Version): boolean {
    if (this._major !== other._major) return this._major > other._major;
    if (this._minor !== other._minor) return this._minor > other._minor;
    return this._patch > other._patch;
  }

  equals(other: Version): boolean {
    return (
      this._major === other._major &&
      this._minor === other._minor &&
      this._patch === other._patch &&
      this._prerelease === other._prerelease
    );
  }

  static create(major: number, minor: number, patch: number, prerelease?: string): Version {
    return new Version(major, minor, patch, prerelease);
  }

  static parse(version: string): Version {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
    if (!match) {
      throw new Error(`Invalid version format: ${version}`);
    }
    return new Version(
      parseInt(match[1]),
      parseInt(match[2]),
      parseInt(match[3]),
      match[4]
    );
  }
}
