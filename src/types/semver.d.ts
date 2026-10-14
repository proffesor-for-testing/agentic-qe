/**
 * Minimal typings for the `semver` runtime dependency (no @types/semver installed).
 * Only the functions AQE uses are declared.
 */
declare module 'semver' {
  interface RangeOptions {
    loose?: boolean;
    includePrerelease?: boolean;
  }
  export function satisfies(version: string, range: string, options?: RangeOptions): boolean;
  export function validRange(range: string, options?: RangeOptions): string | null;
  export function valid(version: string, options?: RangeOptions): string | null;
  const semver: {
    satisfies: typeof satisfies;
    validRange: typeof validRange;
    valid: typeof valid;
  };
  export default semver;
}
