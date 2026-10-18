/**
 * #1136: lookups keyed by caller data walked the prototype chain.
 * - Interpolation expanded ${constructor} / {{toString}} to native function
 *   source, and a workflow condition `constructor` was truthy.
 * - JSON Pointer / JSON Patch writers walked `/__proto__/x` into
 *   Object.prototype and wrote there (prototype pollution).
 * Every site now reads own properties only and writes own data properties.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { YamlPipelineLoader } from '../../../src/coordination/yaml-pipeline-loader';
import { WorkflowLoader, interpolateVariables } from '../../../src/workflows/browser/workflow-loader';
import { safeEvaluate } from '../../../src/shared/utils/safe-expression-evaluator';
import { CrossPhaseHookExecutor } from '../../../src/hooks/cross-phase-hooks';
import { deleteAtPointer, resolvePointer, setAtPointer } from '../../../src/adapters/a2ui/data/json-pointer-resolver';
import { deleteValueAtPath, getValueAtPath, pathExists, setValueAtPath } from '../../../src/adapters/ag-ui/json-patch';
import { SurfaceStateBridge } from '../../../src/adapters/a2ui/integration/surface-state-bridge';
import { AGUISyncService } from '../../../src/adapters/a2ui/integration/agui-sync';

const polluted = () => (Object.prototype as Record<string, unknown>).polluted;

afterEach(() => {
  // A failing run on unfixed code pollutes Object.prototype; never leak it.
  delete (Object.prototype as Record<string, unknown>).polluted;
});

describe('interpolation and expressions read own properties only (#1136)', () => {
  it('pipeline YAML: ${constructor} and ${x.constructor} stay unresolved', () => {
    const out = new YamlPipelineLoader().interpolateVariables(
      'a ${constructor} b ${x.constructor} c ${toString} d ${x.y}', { x: { y: 'Y' } },
    );
    expect(out).toBe('a ${constructor} b ${x.constructor} c ${toString} d Y');
  });

  it('browser workflow: {{constructor}} and {{site.toString}} stay unresolved', () => {
    expect(interpolateVariables('go {{constructor}} / {{site.toString}} / {{site.host}}', { site: { host: 'h' } }))
      .toBe('go {{constructor}} / {{site.toString}} / h');
  });

  it('browser workflow: a required variable named `constructor` is missing from {}', async () => {
    const loader = new WorkflowLoader();
    vi.spyOn(loader, 'load').mockResolvedValue({
      name: 'w', variables: [{ name: 'constructor', type: 'string', required: true }], steps: [],
    } as never);
    await expect(loader.createContext('w', {})).rejects.toThrow('Missing required variables: constructor');
  });

  // `constructor` itself is already refused as a dangerous pattern.
  it('workflow conditions: `toString` and `a.valueOf` are undefined, not functions', () => {
    expect(safeEvaluate('toString', {})).toBeUndefined();
    expect(safeEvaluate('a.valueOf', { a: {} })).toBeUndefined();
    expect(safeEvaluate('a.b', { a: { b: 2 } })).toBe(2);
  });

  it('cross-phase hooks: a context path `constructor` reads nothing', () => {
    const hooks = Object.create(CrossPhaseHookExecutor.prototype) as {
      getValueFromPath(obj: Record<string, unknown>, path: string): unknown;
    };
    expect(hooks.getValueFromPath({ a: {} }, 'a.constructor')).toBeUndefined();
    expect(hooks.getValueFromPath({ a: { b: 1 } }, 'a.b')).toBe(1);
  });
});

describe('A2UI JSON Pointer (#1136)', () => {
  it('does not resolve `/constructor` on an object', () => {
    expect(resolvePointer({}, '/constructor')).toBeUndefined();
  });

  it('does not write Object.prototype through `/__proto__/polluted`', () => {
    const data: Record<string, unknown> = {};
    setAtPointer(data, '/__proto__/polluted', 'yes');
    expect(polluted()).toBeUndefined();
    expect(Object.getPrototypeOf(data)).toBe(Object.prototype);
  });

  it('does not report deleting an inherited `toString`', () => {
    expect(deleteAtPointer({}, '/toString')).toBe(false);
  });
});

describe('AG-UI JSON Patch helpers (#1136)', () => {
  it('does not read or find `/constructor`', () => {
    expect(getValueAtPath({}, '/constructor')).toBeUndefined();
    expect(pathExists({}, '/constructor')).toBe(false);
  });

  it('does not write Object.prototype through `/__proto__/polluted`', () => {
    expect(() => setValueAtPath({}, '/__proto__/polluted', 'yes')).toThrow('Path does not exist');
    expect(polluted()).toBeUndefined();
  });

  it('does not delete through an inherited member', () => {
    expect(() => deleteValueAtPath({}, '/toString')).toThrow('Path does not exist');
  });
});

describe('A2UI state bridges (#1136)', () => {
  it('SurfaceStateBridge.applyDelta does not write Object.prototype', () => {
    const bridge = new SurfaceStateBridge();
    bridge.applyDelta([{ op: 'add', path: '/__proto__/polluted', value: 'yes' }] as never);
    expect(polluted()).toBeUndefined();
  });

  it('AGUISyncService path helpers read own properties and do not write Object.prototype', () => {
    const sync = Object.create(AGUISyncService.prototype) as {
      setValueAtPath(obj: Record<string, unknown>, path: string, value: unknown): void;
      getValueAtPath(obj: Record<string, unknown>, path: string): unknown;
      extractActionValue(payload: Record<string, unknown>, extractor: string): unknown;
    };
    sync.setValueAtPath({}, '/__proto__/polluted', 'yes');
    expect(polluted()).toBeUndefined();
    expect(sync.getValueAtPath({}, '/constructor')).toBeUndefined();
    expect(sync.extractActionValue({}, 'constructor')).toBeUndefined();
  });
});
