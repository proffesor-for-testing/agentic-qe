import { describe, expect, it } from 'vitest';
import { deleteValueAtPath, getValueAtPath, pathExists, setValueAtPath } from '../../../../src/adapters/ag-ui/json-patch.js';

describe('JSON Pointer array indices', () => {
  it.each(['01', '1junk', '1e0', '+1', ' 1', '9007199254740993'])('rejects the noncanonical token %s', (token) => {
    const document = { rows: ['zero', 'one', 'two'] };
    const path = `/rows/${token}`;
    expect(getValueAtPath(document, path)).toBeUndefined();
    expect(pathExists(document, path)).toBe(false);
    expect(() => setValueAtPath(document, path, 'changed')).toThrow();
    expect(() => deleteValueAtPath(document, path)).toThrow();
    expect(document.rows).toEqual(['zero', 'one', 'two']);
  });

  it('rejects sparse array writes and permits only the end append position', () => {
    const document = { rows: ['zero', 'one'] };
    expect(() => setValueAtPath(document, '/rows/4', 'sparse')).toThrow();
    setValueAtPath(document, '/rows/2', 'two');
    setValueAtPath(document, '/rows/-', 'three');
    expect(document.rows).toEqual(['zero', 'one', 'two', 'three']);
    expect(getValueAtPath(document, '/rows/-')).toBeUndefined();
    expect(pathExists(document, '/rows/-')).toBe(false);
    deleteValueAtPath(document, '/rows/0');
    expect(getValueAtPath(document, '/rows/0')).toBe('one');
  });

  it('applies the same validation while traversing nested arrays', () => {
    const document = { rows: [{ value: 'zero' }, { value: 'one' }] };
    expect(() => setValueAtPath(document, '/rows/1junk/value', 'changed')).toThrow();
    expect(() => deleteValueAtPath(document, '/rows/01/value')).toThrow();
    expect(document.rows[1].value).toBe('one');
    const objectKeys = { '01': 'literal' };
    expect(getValueAtPath(objectKeys, '/01')).toBe('literal');
  });
});
