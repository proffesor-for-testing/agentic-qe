import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

describe('registered MCP task cancellation', () => {
  it('keeps a cancelled task terminal when an already-running test finishes', () => {
    const source = process.cwd();
    const child = spawnSync(process.execPath, [
      '--import', join(source, 'node_modules/tsx/dist/loader.mjs'),
      join(source, 'tests/fixtures/cancellation-mcp.mjs'),
    ], {
      cwd: source,
      env: { ...process.env, AQE_SOURCE_ROOT: source },
      encoding: 'utf8',
      timeout: 40000,
    });
    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    const line = child.stdout.split('\n').find(value => value.startsWith('CANCEL_RECEIPT '));
    expect(line, child.stdout).toBeDefined();
    const receipt = JSON.parse(line!.slice('CANCEL_RECEIPT '.length));

    expect(receipt.cancel.success).toBe(true);
    expect(receipt.cancel.data.cancelled).toBe(true);
    expect(typeof receipt.cancel.data.cancellationResultPending).toBe('boolean');
    expect(receipt.immediate.data.status).toBe('cancelled');
    expect(typeof receipt.immediate.data.cancellationResultPending).toBe('boolean');
    expect(receipt.final.data.status).toBe('cancelled');
    expect(receipt.final.data.cancellationResultPending).toBe(false);
    expect(receipt.effectObserved).toBe(true);
    expect(receipt.repeat.success).toBe(true);
    expect(receipt.afterRepeat.data.status).toBe('cancelled');
    expect(receipt.healthyFinal.data.status).toBe('completed');
    expect(receipt.metrics.tasksReceived).toBe(2);
    expect(receipt.metrics.tasksCompleted).toBe(1);
    expect(receipt.events.filter((event: { type: string; taskId: string }) =>
      event.type === 'QueenTaskCancelled' && event.taskId === receipt.cancelledTaskId)).toHaveLength(1);
    expect(receipt.events.filter((event: { type: string; taskId: string }) =>
      event.type === 'QueenTaskCompleted' && event.taskId === receipt.cancelledTaskId)).toHaveLength(0);
    expect(receipt.events.filter((event: { type: string; taskId: string }) =>
      event.type === 'QueenTaskCompleted' && event.taskId === receipt.healthyTaskId)).toHaveLength(1);
  }, 50000);
});
