/**
 * InfraAwareAgentProvider: the configured infra agent prefix is a literal.
 *
 * `InfraHealingConfig.infraAgentPrefix` is documented as "Prefix for synthetic
 * infra agent IDs" and is treated as a literal everywhere else in the class:
 * `createInfraAgents` builds ids by string concatenation and `getAgentHealth`
 * routes by `agentId.startsWith(prefix)`. Only the strip in
 * `getInfraAgentHealth` used regex semantics, so a prefix containing regex
 * metacharacters recovered the wrong service name — and a down service then
 * reported perfect health, which is what the Strange Loop relies on to detect
 * the infra vulnerability at all.
 */

import { describe, it, expect } from 'vitest';
import { InfraAwareAgentProvider } from '../../../../src/strange-loop/infra-healing/infra-aware-agent-provider.js';
import type { AgentProvider } from '../../../../src/strange-loop/swarm-observer.js';
import type { TestOutputObserver } from '../../../../src/strange-loop/infra-healing/test-output-observer.js';
import type { RecoveryPlaybook } from '../../../../src/strange-loop/infra-healing/recovery-playbook.js';

function makeProvider(prefix: string, failing: string[]) {
  const delegate = {
    getAgents: async () => [],
    getEdges: async () => [],
    getAgentHealth: async () => {
      throw new Error('delegate must not be consulted for synthetic infra agents');
    },
    getObserverId: () => 'obs-0',
  } as unknown as AgentProvider;

  const observer = {
    getFailingServices: () => new Set(failing),
  } as unknown as TestOutputObserver;

  const playbook = {
    listServices: () => ['postgres'],
  } as unknown as RecoveryPlaybook;

  return new InfraAwareAgentProvider(delegate, observer, playbook, prefix);
}

describe('InfraAwareAgentProvider infra agent prefix', () => {
  it('reports a failing service as unhealthy when the prefix contains regex metacharacters', async () => {
    const provider = makeProvider('infra+', ['postgres']);

    // The synthetic agent id is built by literal concatenation.
    const agents = await provider.getAgents();
    expect(agents.map((a) => a.id)).toEqual(['infra+postgres']);

    const health = await provider.getAgentHealth('infra+postgres');

    // postgres is down, so the synthetic agent must surface as unhealthy.
    expect(health.responsiveness).toBe(0);
    expect(health.errorRate).toBe(1);
    expect(health.lastHeartbeat).toBe(0);
  });

  it('still strips a plain prefix and reports a healthy service as healthy', async () => {
    const provider = makeProvider('infra-', []);
    const health = await provider.getAgentHealth('infra-postgres');
    expect(health.responsiveness).toBe(1);
    expect(health.errorRate).toBe(0);
  });

  it('does not throw when the prefix is not a valid regular expression', async () => {
    const provider = makeProvider('infra(', ['postgres']);
    const health = await provider.getAgentHealth('infra(postgres');
    expect(health.responsiveness).toBe(0);
    expect(health.errorRate).toBe(1);
  });
});
