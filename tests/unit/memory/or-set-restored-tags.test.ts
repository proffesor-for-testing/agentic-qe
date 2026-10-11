import { afterEach, describe, expect, it, vi } from 'vitest';
import { createORSet, createORSetFromState } from '../../../src/memory/crdt/or-set.js';

afterEach(() => vi.restoreAllMocks());

describe('restored OR-set tag allocation', () => {
  it('keeps an acknowledged re-add visible after restoring a removed tag', () => {
    vi.spyOn(Date, 'now').mockReturnValue(12345);
    const original = createORSet<string>('owner');
    original.add('value');
    original.remove('value');
    const restored = createORSetFromState('owner', original.getState());
    restored.add('value');
    expect(restored.has('value')).toBe(true);
    expect(restored.getState().elements['s:value']).toHaveLength(2);
  });

  it('resumes counters from tombstones even without retained element tags', () => {
    vi.spyOn(Date, 'now').mockReturnValue(12345);
    const original = createORSet<string>('owner');
    original.add('value');
    original.remove('value');
    const state = original.getState();
    state.elements = {};
    const restored = createORSetFromState('owner', state);
    restored.add('value');
    expect(restored.has('value')).toBe(true);
  });

  it('preserves an independently delivered re-add when an old observed tag is removed', () => {
    vi.spyOn(Date, 'now').mockReturnValue(12345);
    const original = createORSet<string>('owner');
    original.add('value');
    const restored = createORSetFromState('owner', original.getState());
    restored.add('value');
    original.remove('value');
    restored.merge(original);
    expect(restored.has('value')).toBe(true);
  });

  it('accepts owner IDs containing colons and resumes past all observed counters', () => {
    vi.spyOn(Date, 'now').mockReturnValue(12345);
    const original = createORSet<string>('owner:segment');
    original.add('other');
    original.add('value');
    original.remove('value');
    const restored = createORSetFromState('owner:segment', original.getState());
    restored.add('value');
    expect(restored.getState().elements['s:value']).toContain('owner:segment:12345:2');
  });

  it('preserves foreign and malformed tags without using them as local counters', () => {
    vi.spyOn(Date, 'now').mockReturnValue(12345);
    const state = createORSet<string>('owner').getState();
    const tags = ['foreign:12345:99', 'owner:extra:12345:99', 'owner:bad:99', 'owner:12345:1.5'];
    state.elements = { 's:other': tags };
    const restored = createORSetFromState('owner', state);
    restored.add('value');
    expect(restored.getState().elements['s:other']).toEqual(tags);
    expect(restored.getState().elements['s:value']).toEqual(['owner:12345:0']);
  });

  it('preserves uninterrupted and different-owner re-add behavior', () => {
    vi.spyOn(Date, 'now').mockReturnValue(12345);
    const original = createORSet<string>('owner');
    original.add('value');
    original.remove('value');
    const foreign = createORSetFromState('other', original.getState());
    original.add('value');
    foreign.add('value');
    expect(original.has('value')).toBe(true);
    expect(foreign.has('value')).toBe(true);
  });
});
