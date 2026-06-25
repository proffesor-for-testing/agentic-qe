/**
 * Graceful optional-module loading (A9). Degrade on genuine absence, but NEVER
 * mask a real load failure (the #528 lesson). Require is injected — no real
 * native deps needed.
 */
import { describe, it, expect } from 'vitest';
import { loadOptionalModule, optionalModule, isModuleAbsent } from '../../../src/shared/optional-module.js';

const absentReq = ((name: string) => { const e = new Error(`Cannot find module '${name}'`) as Error & { code?: string }; e.code = 'MODULE_NOT_FOUND'; throw e; }) as unknown as NodeRequire;
const brokenReq = (() => { const e = new Error('dlopen failed: wrong ELF class') as Error & { code?: string }; e.code = 'ERR_DLOPEN_FAILED'; throw e; }) as unknown as NodeRequire;
const okReq = (() => ({ hello: 'world' })) as unknown as NodeRequire;

describe('isModuleAbsent', () => {
  it('should recognize MODULE_NOT_FOUND as absence', () => {
    expect(isModuleAbsent({ code: 'MODULE_NOT_FOUND' })).toBe(true);
    expect(isModuleAbsent({ code: 'ERR_MODULE_NOT_FOUND' })).toBe(true);
    expect(isModuleAbsent(new Error("Cannot find module 'x'"))).toBe(true);
  });

  it('should NOT treat a real load failure as absence', () => {
    expect(isModuleAbsent({ code: 'ERR_DLOPEN_FAILED', message: 'wrong ELF class' })).toBe(false);
  });
});

describe('loadOptionalModule', () => {
  it('should return the module when present', () => {
    const r = loadOptionalModule<{ hello: string }>('whatever', okReq);
    expect(r).toMatchObject({ available: true, degraded: false });
    if (r.available) expect(r.module.hello).toBe('world');
  });

  it('should DEGRADE (no throw) when the module is genuinely absent', () => {
    const r = loadOptionalModule('@ruvector/not-installed', absentReq);
    expect(r).toMatchObject({ available: false, degraded: true, name: '@ruvector/not-installed' });
  });

  it('should RE-THROW a real load failure — never mask it (#528)', () => {
    expect(() => loadOptionalModule('@ruvector/broken', brokenReq)).toThrow(/dlopen failed/);
  });

  it('should degrade for a truly-absent real module via the default require', () => {
    const r = loadOptionalModule('@ruvector/definitely-not-installed-xyz-9999');
    expect(r.available).toBe(false);
    expect(r.degraded).toBe(true);
  });

  it('should load a real present module via the default require', () => {
    const r = loadOptionalModule<typeof import('node:os')>('node:os');
    expect(r.available).toBe(true);
  });
});

describe('optionalModule', () => {
  it('should return the module or undefined', () => {
    expect(optionalModule('x', okReq)).toMatchObject({ hello: 'world' });
    expect(optionalModule('x', absentReq)).toBeUndefined();
  });
});
