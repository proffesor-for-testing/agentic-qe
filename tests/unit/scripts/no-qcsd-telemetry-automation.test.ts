import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflowDirectory = join(process.cwd(), '.github', 'workflows');

describe('QCSD telemetry automation boundary', () => {
  it('should_notCollectOrPersistQcsdTelemetry_when_releaseWorkflowsRun', () => {
    const workflowFiles = readdirSync(workflowDirectory)
      .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'));

    const automatedTelemetryReferences = workflowFiles.flatMap((name) => {
      const content = readFileSync(join(workflowDirectory, name), 'utf8');
      return /collect-production-telemetry|telemetry\/production|qcsd-production-trigger/.test(content)
        ? [name]
        : [];
    });

    expect(automatedTelemetryReferences).toEqual([]);
  });
});
