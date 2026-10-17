import { describe, it, expect } from 'vitest';
import { InfraHealingOrchestrator } from '../../../../src/strange-loop/infra-healing/infra-healing-orchestrator.js';
import { InfraActionExecutor, NoOpCommandRunner } from '../../../../src/strange-loop/infra-healing/infra-action-executor.js';
const NAMES = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'];
describe('InfraHealingOrchestrator per-service stats (#1064 review)', () => {
  it.each(NAMES.flatMap(service => [true, false].map(feedFailure => ({ service, feedFailure }))))('merges stats safely for $service (failure observed: $feedFailure)', ({ service, feedFailure }) => {
    const executor = new InfraActionExecutor(new NoOpCommandRunner(), {} as never, {} as never);
    const update = executor as unknown as { updateServiceStats(name: string, field: string): void };
    update.updateServiceStats(service, 'recoveries');
    update.updateServiceStats(service, 'successes');
    const observer = { observe: () => ({ infraFailures: [{ serviceName: service }] }) };
    const orchestrator = new InfraHealingOrchestrator(observer as never, {} as never, {} as never, executor, {} as never);
    try {
      if (feedFailure) orchestrator.feedTestOutput('failure');
      const stats = orchestrator.getStats().byService;
      expect(Object.hasOwn(Object.prototype, 'recoveries')).toBe(false);
      expect(Object.hasOwn(stats, service)).toBe(true);
      expect(stats[service]).toEqual({ failures: feedFailure ? 1 : 0, recoveries: 1, successes: 1 });
    } finally {
      delete (Object.prototype as Record<string, unknown>).failures;
      delete (Object.prototype as Record<string, unknown>).recoveries;
      delete (Object.prototype as Record<string, unknown>).successes;
    }
  });
});
